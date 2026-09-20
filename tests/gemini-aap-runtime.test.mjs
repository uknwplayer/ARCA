import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  ARCA_GEMINI_API_ORIGIN,
  createGeminiProviderClient
} from "../packages/agent/src/gemini-provider.ts";
import {createGeminiAapRuntime} from "../packages/agent/src/gemini-aap-runtime.ts";
import {AgentGateway,AgentRegistry,linkExternalAgent} from "../packages/agent/src/gateway.ts";

function geminiResponse(text="Synthetic response"){
  return new Response(JSON.stringify({
    candidates:[{
      content:{parts:[{text}]},
      finishReason:"STOP"
    }],
    usageMetadata:{
      promptTokenCount:11,
      candidatesTokenCount:4,
      totalTokenCount:15
    }
  }),{
    status:200,
    headers:{"content-type":"application/json"}
  });
}

test("Gemini provider uses fixed Google origin, x-goog-api-key and bounded output config",async()=>{
  const calls=[];
  const client=createGeminiProviderClient({
    apiKey:"test-secret-key",
    model:"gemini-3.8-flash",
    maxOutputTokens:1024,
    thinkingLevel:"low",
    fetchImpl:async(url,init)=>{
      calls.push({url,init});
      return geminiResponse("Provider works");
    }
  });
  const result=await client.generateText({prompt:"Synthetic prompt"});
  assert.equal(result.provider,"google-gemini");
  assert.equal(result.model,"gemini-3.8-flash");
  assert.equal(result.text,"Provider works");
  assert.equal(result.usage.totalTokenCount,15);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,ARCA_GEMINI_API_ORIGIN+"/v1beta/models/gemini-3.8-flash:generateContent");
  assert.equal(calls[0].init.headers["x-goog-api-key"],"test-secret-key");
  const body=JSON.parse(calls[0].init.body);
  assert.equal(body.generationConfig.maxOutputTokens,1024);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,"low");
  assert.equal(JSON.stringify(result).includes("test-secret-key"),false);
});

test("Gemini provider fails with sanitized error and does not surface provider message or credential",async()=>{
  const client=createGeminiProviderClient({
    apiKey:"do-not-leak",
    fetchImpl:async()=>new Response(JSON.stringify({
      error:{status:"RESOURCE_EXHAUSTED",message:"internal provider detail do-not-leak"}
    }),{status:429,headers:{"content-type":"application/json"}})
  });
  await assert.rejects(
    ()=>client.generateText({prompt:"Synthetic prompt"}),
    error=>{
      assert.equal(error.code,"ARCA_GEMINI_PROVIDER_HTTP_ERROR");
      assert.equal(error.httpStatus,429);
      assert.equal(error.providerStatus,"RESOURCE_EXHAUSTED");
      assert.equal(String(error.message).includes("do-not-leak"),false);
      assert.equal(String(error.message).includes("internal provider detail"),false);
      return true;
    }
  );
});

test("Gemini provider rejects redirect and empty text candidates",async()=>{
  const redirect=createGeminiProviderClient({
    apiKey:"test-key",
    fetchImpl:async()=>new Response(null,{status:302,headers:{location:"https://example.invalid"}})
  });
  await assert.rejects(()=>redirect.generateText({prompt:"Synthetic"}),error=>error.code==="ARCA_GEMINI_PROVIDER_REDIRECT_REFUSED");

  const empty=createGeminiProviderClient({
    apiKey:"test-key",
    fetchImpl:async()=>new Response(JSON.stringify({candidates:[]}),{status:200})
  });
  await assert.rejects(()=>empty.generateText({prompt:"Synthetic"}),error=>{
    assert.equal(error.code,"ARCA_GEMINI_PROVIDER_EMPTY_OUTPUT");
    assert.equal(error.finishReason,null);
    return true;
  });
});

test("Gemini AAP runtime is synthetic-only by default and returns AAP result without credentials",async()=>{
  const prompts=[];
  const runtime=createGeminiAapRuntime({
    id:"gemini-test",
    providerClient:{
      async generateText({prompt}){
        prompts.push(prompt);
        return {
          provider:"google-gemini",
          model:"gemini-3.8-flash",
          text:"Synthetic model output",
          finishReason:"STOP",
          usage:{totalTokenCount:9}
        };
      }
    }
  });
  assert.equal(runtime.descriptor.id,"gemini-test");
  assert.deepEqual(runtime.descriptor.capabilities,["reasoning","research"]);
  await assert.rejects(
    ()=>runtime.runTask({taskId:"TASK-0",task:"Non synthetic",context:{requestId:"REQ-0"}}),
    error=>error.code==="ARCA_GEMINI_SYNTHETIC_ONLY"
  );
  const result=await runtime.runTask({
    taskId:"TASK-1",
    task:"Explain a test.",
    context:{requestId:"REQ-1",synthetic:true}
  });
  assert.equal(result.format,"arca-agent-result-v1");
  assert.equal(result.taskId,"TASK-1");
  assert.equal(result.output.requestId,"REQ-1");
  assert.equal(result.output.provider,"google-gemini");
  assert.equal(result.output.model,"gemini-3.8-flash");
  assert.equal(result.humanReviewRequired,true);
  assert.equal(prompts.length,1);
  assert.equal(prompts[0].includes("ARCA synthetic validation request."),true);
});

test("Gemini AAP runtime participates in Agent Gateway over a real local HTTP boundary",async()=>{
  const runtime=createGeminiAapRuntime({
    id:"gemini-http-test",
    providerClient:{
      async generateText(){
        return {
          provider:"google-gemini",
          model:"gemini-3.8-flash",
          text:"HTTP-backed synthetic response",
          finishReason:"STOP",
          usage:null
        };
      }
    }
  });
  const server=http.createServer(async(request,response)=>{
    const send=(status,value)=>{
      const body=JSON.stringify(value);
      response.writeHead(status,{"content-type":"application/json","content-length":Buffer.byteLength(body)});
      response.end(body);
    };
    try{
      if(request.method==="GET"&&request.url==="/arca/agent"){send(200,runtime.descriptor);return}
      if(request.method==="POST"&&request.url==="/arca/jobs"){
        const chunks=[];
        for await(const chunk of request)chunks.push(chunk);
        send(200,await runtime.runTask(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
        return;
      }
      send(404,{error:"not-found"});
    }catch(error){send(500,{error:error.code??"error"})}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();
  try{
    const registry=new AgentRegistry();
    registry.registerInternal({id:"primary",principal:true,capabilities:[]},async()=>({}));
    await linkExternalAgent(registry,{
      id:"gemini-http-test",
      capabilities:["research"],
      connection:{endpoint:"http://127.0.0.1:"+address.port,auth:{mode:"none"}}
    },{networkEnabled:true,allowLoopback:true});
    const gateway=new AgentGateway(registry,{networkEnabled:true,allowLoopback:true});
    const result=await gateway.dispatch({
      taskId:"HTTP-GEMINI-1",
      task:"Synthetic gateway check",
      requiredCapabilities:["research"],
      context:{requestId:"HTTP-GEMINI-1",synthetic:true}
    },{
      allowExternal:true,
      targetAgentId:"gemini-http-test",
      externalClient:{networkEnabled:true,allowLoopback:true}
    });
    assert.equal(result.agent.id,"gemini-http-test");
    assert.equal(result.output.output.provider,"google-gemini");
    assert.equal(result.output.output.text,"HTTP-backed synthetic response");
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});
