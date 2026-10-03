import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
  createGeminiTermuxChatSession,
  listTermuxChatProviders,
  resolveTermuxChatProvider
} from "../packages/agent/src/index.ts";

const cli=fileURLToPath(new URL("../packages/cli/bin/arca.mjs",import.meta.url));

function runInteractive(args,input){
  return new Promise((resolve,reject)=>{
    const env={...process.env,NO_COLOR:"1"};
    delete env.OPENAI_API_KEY;
    delete env.GEMINI_API_KEY;
    const child=spawn(process.execPath,[cli,...args],{env});
    let stdout="";
    let stderr="";
    child.stdout.on("data",chunk=>{stdout+=chunk});
    child.stderr.on("data",chunk=>{stderr+=chunk});
    child.on("error",reject);
    child.on("close",code=>resolve({code,stdout,stderr}));
    child.stdin.end(input);
  });
}

function geminiResponse(text){
  return new Response(JSON.stringify({
    candidates:[{content:{parts:[{text}]},finishReason:"STOP"}],
    usageMetadata:{promptTokenCount:12,candidatesTokenCount:5,totalTokenCount:17}
  }),{status:200,headers:{"content-type":"application/json"}});
}

test("catálogo Termux separa offline, Gemini free-tier e OpenAI paga",()=>{
  const providers=listTermuxChatProviders();
  assert.deepEqual(providers.map(item=>item.id),["offline","gemini","openai"]);
  const offline=resolveTermuxChatProvider("offline");
  assert.equal(offline.external,false);
  assert.equal(offline.apiKeyRequired,false);
  assert.equal(offline.monetaryBudgetRequired,false);
  const gemini=resolveTermuxChatProvider("gemini");
  assert.equal(gemini.external,true);
  assert.equal(gemini.apiKeyEnv,"GEMINI_API_KEY");
  assert.equal(gemini.defaultModel,"gemini-2.5-flash");
  assert.equal(gemini.monetaryBudgetRequired,false);
  assert.equal(gemini.freeTierEligible,true);
  assert.equal(gemini.freeTierGuaranteed,false);
  const openai=resolveTermuxChatProvider("openai");
  assert.equal(openai.apiKeyEnv,"OPENAI_API_KEY");
  assert.equal(openai.monetaryBudgetRequired,true);
});

test("Gemini chat mantém contexto em memória sem budget monetário ARCA",async()=>{
  const prompts=[];
  const session=createGeminiTermuxChatSession({
    apiKey:"gemini-test-key",
    model:"gemini-2.5-flash",
    allowExternal:true,
    fetchImpl:async(_url,init)=>{
      const body=JSON.parse(init.body);
      const prompt=body.contents?.[0]?.parts?.[0]?.text??"";
      prompts.push(prompt);
      return geminiResponse(prompts.length===1?"Primeira resposta":"Segunda resposta");
    }
  });
  const first=await session.ask("Meu marcador é ALFA.");
  const second=await session.ask("Qual marcador eu disse?");
  assert.equal(first.provider,"gemini");
  assert.equal(first.monetaryBudgetRequired,false);
  assert.equal(second.chat.turn,2);
  assert.match(prompts[1],/Meu marcador é ALFA/);
  assert.match(prompts[1],/Primeira resposta/);
  assert.equal(session.status.persistence,"memory-only");
  assert.equal(session.status.toolsAuthorized,false);
  assert.equal(session.status.coreMutationAuthorized,false);
});

test("arca chat abre offline sem chave nem session-budget e lista provedores",async()=>{
  const result=await runInteractive(["chat"],"/providers\n/exit\n");
  assert.equal(result.code,0,result.stderr);
  assert.match(result.stdout,/Provider: offline/);
  assert.match(result.stdout,/offline/);
  assert.match(result.stdout,/gemini/);
  assert.match(result.stdout,/openai/);
  assert.doesNotMatch(result.stderr,/session-budget-usd/);
  assert.doesNotMatch(result.stderr,/OPENAI_API_KEY/);
});
