import test from "node:test";
import assert from "node:assert/strict";
import {classifyA2aReference} from "../packages/agent/src/a2a-reference-classification.ts";
import {inspectA2aReference} from "../packages/agent/src/a2a-reference-inspection.ts";

function card(endpoint){
  return {
    name:"External Research Agent",
    version:"1.0.0",
    provider:{organization:"Example"},
    capabilities:{streaming:false},
    defaultInputModes:["text/plain"],
    defaultOutputModes:["text/plain"],
    supportedInterfaces:[{protocolBinding:"HTTP",protocolVersion:"1.0",url:endpoint}],
    skills:[{id:"research",name:"Research",description:"Researches",tags:["web"]}]
  };
}

test("A2A reference classifier separates direct Agent Card and GitHub repository",()=>{
  const direct=classifyA2aReference("https://agent.example/.well-known/agent-card.json");
  assert.equal(direct.kind,"direct-agent-card");
  assert.equal(direct.automaticAgentCardInspectionAuthorized,true);
  assert.equal(direct.repository,null);

  const github=classifyA2aReference("https://github.com/zangxin75/a2a");
  assert.equal(github.kind,"github-repository");
  assert.equal(github.repository,"zangxin75/a2a");
  assert.equal(github.automaticAgentCardInspectionAuthorized,false);
  assert.equal(github.candidateCreated,false);
});

test("direct Agent Card inspection creates only an untrusted declared candidate",async()=>{
  const result=await inspectA2aReference({
    sourceId:"test-direct-card",
    referenceUrl:"https://agent.example/.well-known/agent-card.json",
    networkEnabled:true,
    fetchImpl:async(url,init)=>{
      assert.equal(url,"https://agent.example/.well-known/agent-card.json");
      assert.equal(init.method,"GET");
      assert.equal(init.redirect,"manual");
      return new Response(JSON.stringify(card("https://agent.example/a2a")),{status:200});
    },
    now:()=>new Date("2026-09-20T01:30:00.000Z")
  });
  assert.equal(result.inspectionStatus,"completed");
  assert.equal(result.candidate.protocol,"a2a");
  assert.equal(result.candidate.trustState,"untrusted");
  assert.equal(result.candidate.capabilityState,"declared");
  assert.equal(result.candidate.admissionState,"not-admitted");
  assert.equal(result.candidate.declaredCapabilities.includes("a2a"),true);
  assert.equal(result.rawAgentCardPersisted,false);
  assert.equal(result.candidateExecuted,false);
  assert.equal(result.trustGranted,false);
  assert.equal(result.admissionGranted,false);
  assert.equal(result.dispatchAuthorized,false);
});

test("GitHub repository reference is classified but not fetched or promoted",async()=>{
  let fetchCount=0;
  const result=await inspectA2aReference({
    referenceUrl:"https://github.com/zangxin75/a2a",
    networkEnabled:true,
    fetchImpl:async()=>{fetchCount+=1;throw new Error("must not fetch")}
  });
  assert.equal(result.inspectionStatus,"not-applicable");
  assert.equal(result.classification.kind,"github-repository");
  assert.equal(result.candidate,null);
  assert.equal(result.candidateExecuted,false);
  assert.equal(fetchCount,0);
});

test("reference classifier rejects unsafe schemes and loopback",()=>{
  assert.throws(()=>classifyA2aReference("http://agent.example/.well-known/agent-card.json"),/requires HTTPS/);
  assert.throws(()=>classifyA2aReference("https://127.0.0.1/.well-known/agent-card.json"),/refuses loopback/);
});
