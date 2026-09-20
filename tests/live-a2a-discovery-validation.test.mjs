import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {spawn} from "node:child_process";

function runScript(env){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,["scripts/validate-live-a2a-discovery.mjs"],{
      stdio:["ignore","pipe","pipe"],
      env:{...process.env,...env}
    });
    let stdout="";
    let stderr="";
    child.stdout.on("data",chunk=>{stdout+=chunk.toString()});
    child.stderr.on("data",chunk=>{stderr+=chunk.toString()});
    child.once("error",reject);
    child.once("exit",code=>{
      if(code!==0){reject(new Error("script exited "+code+": "+stderr));return}
      try{resolve(JSON.parse(stdout.trim()))}catch(error){reject(error)}
    });
  });
}

test("live A2A validation script crosses a real HTTP boundary without executing candidate",async()=>{
  let postCount=0;
  const server=http.createServer((request,response)=>{
    if(request.method==="POST")postCount+=1;
    if(request.method!=="GET"||request.url!=="/.well-known/agent-card.json"){
      response.writeHead(404);response.end();return;
    }
    const port=server.address().port;
    const card={
      name:"Local Live A2A Test",
      description:"Synthetic card",
      version:"1.0.0",
      provider:{organization:"ARCA Test"},
      capabilities:{streaming:false},
      defaultInputModes:["text/plain"],
      defaultOutputModes:["text/plain"],
      supportedInterfaces:[{
        protocolBinding:"JSONRPC",
        protocolVersion:"1.0",
        url:"http://127.0.0.1:"+port+"/a2a"
      }],
      skills:[{id:"research",name:"Research",description:"Synthetic",tags:["research"]}]
    };
    const body=JSON.stringify(card);
    response.writeHead(200,{"content-type":"application/json","content-length":Buffer.byteLength(body)});
    response.end(body);
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  try{
    const result=await runScript({
      ARCA_A2A_DISCOVERY_ORIGIN:"http://127.0.0.1:"+port,
      ARCA_A2A_ALLOW_LOOPBACK:"true"
    });
    assert.equal(result.ok,true);
    assert.equal(result.protocol,"a2a");
    assert.equal(result.trustState,"untrusted");
    assert.equal(result.capabilityState,"declared");
    assert.equal(result.admissionState,"not-admitted");
    assert.equal(result.candidateExecuted,false);
    assert.equal(result.trustGranted,false);
    assert.equal(result.admissionGranted,false);
    assert.equal(result.dispatchAuthorized,false);
    assert.equal(result.rawAgentCardPersisted,false);
    assert.equal(postCount,0);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});
