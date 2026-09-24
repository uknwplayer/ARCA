import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePaidOpenAIBudget,
  estimateOpenAIUsageUsd,
  createOpenAITermuxChatSession,
  runOpenAITermuxAsk
} from "../packages/agent/src/index.ts";

function response(text="ok",usage={input_tokens:100,output_tokens:20,total_tokens:120,input_tokens_details:{cached_tokens:10}}){
  return new Response(JSON.stringify({
    id:"resp_budget_test",
    status:"completed",
    output:[{type:"message",content:[{type:"output_text",text}]}],
    usage
  }),{status:200,headers:{"content-type":"application/json"}});
}

test("paid OpenAI gate requires explicit monetary authorization",()=>{
  assert.throws(()=>evaluatePaidOpenAIBudget({
    model:"gpt-6-luna",
    inputText:"hello",
    maxOutputTokens:100,
    maxRequestUsd:0.01,
    allowPaidApi:false,
    now:"2026-09-24T20:00:00.000Z"
  }),error=>error.code==="ARCA_PAID_API_NOT_AUTHORIZED");
});

test("paid OpenAI gate fails closed for unknown pricing and stale snapshot",()=>{
  assert.throws(()=>evaluatePaidOpenAIBudget({
    model:"future-model",
    inputText:"x",
    maxOutputTokens:100,
    maxRequestUsd:1,
    allowPaidApi:true,
    now:"2026-09-24T20:00:00.000Z"
  }),error=>error.code==="ARCA_OPENAI_PRICING_UNKNOWN");

  assert.throws(()=>evaluatePaidOpenAIBudget({
    model:"gpt-6-luna",
    inputText:"x",
    maxOutputTokens:100,
    maxRequestUsd:1,
    allowPaidApi:true,
    now:"2026-11-30T00:00:00.000Z"
  }),error=>error.code==="ARCA_OPENAI_PRICING_SNAPSHOT_STALE");
});

test("paid gate blocks request whose conservative maximum exceeds cap",()=>{
  assert.throws(()=>evaluatePaidOpenAIBudget({
    model:"gpt-6-luna",
    inputText:"x".repeat(20000),
    maxOutputTokens:2000,
    maxRequestUsd:0.0001,
    allowPaidApi:true,
    now:"2026-09-24T20:00:00.000Z"
  }),error=>{
    assert.equal(error.code,"ARCA_PAID_API_BUDGET_EXCEEDED");
    assert.ok(error.conservativeMaxUsd>error.maxRequestUsd);
    return true;
  });
});

test("usage estimate accounts for cached input separately",()=>{
  const cost=estimateOpenAIUsageUsd({
    model:"gpt-6-luna",
    usage:{input_tokens:1000,cached_input_tokens:400,output_tokens:100}
  });
  assert.equal(cost.inputTokens,1000);
  assert.equal(cost.cachedInputTokens,400);
  assert.equal(cost.outputTokens,100);
  assert.ok(cost.estimatedUsd>0);
  assert.equal(cost.exactBillingAmount,false);
});

test("arca ask refuses paid network before fetch when paid gate is absent",async()=>{
  let calls=0;
  await assert.rejects(()=>runOpenAITermuxAsk({
    message:"Olá",
    apiKey:"secret",
    allowExternal:true,
    allowPaidApi:false,
    maxRequestUsd:0.01,
    now:"2026-09-24T20:00:00.000Z",
    fetchImpl:async()=>{calls+=1;return response()}
  }),error=>error.code==="ARCA_PAID_API_NOT_AUTHORIZED");
  assert.equal(calls,0);
});

test("arca ask returns preflight and actual estimated cost without key leakage",async()=>{
  const result=await runOpenAITermuxAsk({
    message:"Olá",
    apiKey:"secret-value",
    model:"gpt-6-luna",
    allowExternal:true,
    allowPaidApi:true,
    maxRequestUsd:0.01,
    maxOutputTokens:200,
    now:"2026-09-24T20:00:00.000Z",
    fetchImpl:async()=>response("Resposta")
  });
  assert.equal(result.text,"Resposta");
  assert.equal(result.cost.currency,"USD");
  assert.equal(result.cost.billingCapGuaranteed,false);
  assert.ok(result.cost.conservativeMaxUsd<=0.01);
  assert.ok(result.cost.actualEstimatedUsd>0);
  assert.ok(result.cost.accountedUsd>0);
  assert.equal(result.cost.usageAvailable,true);
  assert.equal(JSON.stringify(result).includes("secret-value"),false);
});

test("arca ask accounts conservative maximum when provider omits usage",async()=>{
  const result=await runOpenAITermuxAsk({
    message:"Sem telemetria",
    apiKey:"secret",
    model:"gpt-6-luna",
    allowExternal:true,
    allowPaidApi:true,
    maxRequestUsd:0.01,
    maxOutputTokens:100,
    now:"2026-09-24T20:00:00.000Z",
    fetchImpl:async()=>new Response(JSON.stringify({
      id:"resp_no_usage",
      status:"completed",
      output:[{type:"message",content:[{type:"output_text",text:"Resposta sem usage"}]}]
    }),{status:200,headers:{"content-type":"application/json"}})
  });
  assert.equal(result.cost.usageAvailable,false);
  assert.equal(result.cost.actualEstimatedUsd,null);
  assert.equal(result.cost.accountedUsd,result.cost.conservativeMaxUsd);
});

test("Termux chat keeps context only in memory and enforces session budget",async()=>{
  const prompts=[];
  const session=createOpenAITermuxChatSession({
    apiKey:"secret",
    model:"gpt-6-luna",
    allowExternal:true,
    allowPaidApi:true,
    sessionBudgetUsd:0.02,
    maxOutputTokens:100,
    now:"2026-09-24T20:00:00.000Z",
    fetchImpl:async(_url,init)=>{
      const body=JSON.parse(init.body);
      prompts.push(body.input);
      return response(prompts.length===1?"Primeira resposta":"Segunda resposta",{
        input_tokens:120,output_tokens:20,total_tokens:140,input_tokens_details:{cached_tokens:0}
      });
    }
  });
  const one=await session.ask("Meu nome de teste é Alfa.");
  const two=await session.ask("Qual nome eu disse?");
  assert.equal(one.chat.turn,1);
  assert.equal(two.chat.turn,2);
  assert.match(prompts[1],/Meu nome de teste é Alfa/);
  assert.match(prompts[1],/Primeira resposta/);
  assert.equal(session.status.persistence,"memory-only");
  assert.equal(session.status.toolsAuthorized,false);
  assert.equal(session.status.coreMutationAuthorized,false);
  const before=session.status.estimatedSpentUsd;
  session.clear();
  assert.equal(session.status.historyMessages,0);
  assert.equal(session.status.estimatedSpentUsd,before);
});
