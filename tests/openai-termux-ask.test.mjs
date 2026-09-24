import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCA_OPENAI_API_ORIGIN,
  ARCA_OPENAI_DEFAULT_MODEL,
  createOpenAIProviderClient,
  runOpenAITermuxAsk
} from "../packages/agent/src/index.ts";

function okResponse(text="Resposta sintética"){
  return new Response(JSON.stringify({
    id:"resp_test_123",
    status:"completed",
    output:[{
      type:"message",
      content:[{type:"output_text",text}]
    }],
    usage:{
      input_tokens:21,
      output_tokens:8,
      total_tokens:29,
      input_tokens_details:{cached_tokens:3}
    }
  }),{status:200,headers:{"content-type":"application/json"}});
}

test("OpenAI provider usa origem fixa, Responses API, Bearer e store false",async()=>{
  const calls=[];
  const client=createOpenAIProviderClient({
    apiKey:"test-secret-openai",
    model:"gpt-6-luna",
    maxOutputTokens:321,
    fetchImpl:async(url,init)=>{
      calls.push({url,init});
      return okResponse("ok");
    }
  });
  const result=await client.generateText({prompt:"Teste sintético"});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,ARCA_OPENAI_API_ORIGIN+"/v1/responses");
  assert.equal(calls[0].init.headers.Authorization,"Bearer test-secret-openai");
  const body=JSON.parse(calls[0].init.body);
  assert.equal(body.model,"gpt-6-luna");
  assert.equal(body.input,"Teste sintético");
  assert.equal(body.max_output_tokens,321);
  assert.equal(body.store,false);
  assert.equal(result.text,"ok");
  assert.equal(result.usage.total_tokens,29);
  assert.equal(result.usage.cached_input_tokens,3);
  assert.equal(JSON.stringify(result).includes("test-secret-openai"),false);
});

test("OpenAI provider tem modelo econômico padrão configurável",()=>{
  const client=createOpenAIProviderClient({
    apiKey:"x",
    fetchImpl:async()=>okResponse()
  });
  assert.equal(client.model,ARCA_OPENAI_DEFAULT_MODEL);
});

test("OpenAI provider recusa redirect e sanitiza erro remoto",async()=>{
  const redirect=createOpenAIProviderClient({
    apiKey:"secret",
    fetchImpl:async()=>new Response(null,{status:302,headers:{location:"https://example.invalid"}})
  });
  await assert.rejects(()=>redirect.generateText({prompt:"x"}),error=>error.code==="ARCA_OPENAI_PROVIDER_REDIRECT_REFUSED");

  const failing=createOpenAIProviderClient({
    apiKey:"do-not-leak",
    fetchImpl:async()=>new Response(JSON.stringify({
      error:{type:"invalid_request_error",code:"bad_request",message:"provider detail do-not-leak"}
    }),{status:400})
  });
  await assert.rejects(()=>failing.generateText({prompt:"x"}),error=>{
    assert.equal(error.code,"ARCA_OPENAI_PROVIDER_HTTP_ERROR");
    assert.equal(error.httpStatus,400);
    assert.equal(error.providerCode,"bad_request");
    assert.equal(String(error.message).includes("do-not-leak"),false);
    assert.equal(String(error.message).includes("provider detail"),false);
    return true;
  });
});

test("ARCA Termux ask bloqueia rede sem opt-in explícito",async()=>{
  let calls=0;
  await assert.rejects(()=>runOpenAITermuxAsk({
    message:"Olá",
    apiKey:"secret",
    allowExternal:false,
    fetchImpl:async()=>{calls+=1;return okResponse()}
  }),error=>error.code==="ARCA_TERMUX_GPT_EXTERNAL_NOT_AUTHORIZED");
  assert.equal(calls,0);
});

test("ARCA Termux ask passa pelo reasoning transport gate e não concede Core mutation",async()=>{
  let capturedBody;
  const result=await runOpenAITermuxAsk({
    message:"Qual é o estado deste teste?",
    apiKey:"secret-value",
    model:"gpt-6-luna",
    allowExternal:true,
    requestId:"termux.ask.synthetic.1",
    fetchImpl:async(_url,init)=>{
      capturedBody=JSON.parse(init.body);
      return okResponse("Tudo certo.");
    }
  });
  assert.equal(result.format,"arca-termux-gpt-ask-v1");
  assert.equal(result.text,"Tudo certo.");
  assert.equal(result.model,"gpt-6-luna");
  assert.equal(result.sourceNetworkUsed,true);
  assert.equal(result.externalProcessingAuthorized,true);
  assert.equal(result.outputPersisted,false);
  assert.equal(result.humanReviewRequired,true);
  assert.equal(result.coreMutationPerformed,false);
  assert.match(result.payloadHash,/^[a-f0-9]{64}$/);
  assert.match(result.transportDecisionHash,/^[a-f0-9]{64}$/);
  assert.equal(capturedBody.store,false);
  assert.equal(JSON.stringify(result).includes("secret-value"),false);
});
