import test from "node:test";
import assert from "node:assert/strict";
import {resolveA2aGithubRepository} from "../packages/agent/src/a2a-github-repository-resolution.ts";

function card(endpoint="https://agent.example/a2a"){
  return {
    name:"Repo Agent",
    version:"1.0.0",
    provider:{name:"Example"},
    url:endpoint,
    skills:[
      {id:"research",name:"Research",description:"Research"},
      {id:"analysis",name:"Analysis",description:"Analysis"}
    ],
    supportedInterfaces:[
      {protocolId:"a2a",protocolVersion:"1.0"}
    ]
  };
}
function jsonResponse(value,status=200){
  return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
}
function contentResponse(value,path="agent-card.json"){
  const raw=JSON.stringify(value);
  return jsonResponse({
    type:"file",
    encoding:"base64",
    content:Buffer.from(raw).toString("base64"),
    size:Buffer.byteLength(raw),
    sha:"deadbeef",
    path
  });
}

test("GitHub resolver inspects known card path but requires explicit endpoint-origin authorization",async()=>{
  const seen=[];
  const result=await resolveA2aGithubRepository({
    referenceUrl:"https://github.com/example/repo",
    networkEnabled:true,
    fetchImpl:async(url,init)=>{
      seen.push({url,init});
      if(url==="https://api.github.com/repos/example/repo"){
        return jsonResponse({default_branch:"main"});
      }
      if(url==="https://api.github.com/repos/example/repo/contents/agent-card.json?ref=main"){
        return contentResponse(card("https://agent.example/a2a"));
      }
      throw new Error("unexpected fetch "+url);
    }
  });
  assert.equal(result.repository,"example/repo");
  assert.equal(result.defaultBranch,"main");
  assert.equal(result.cardPath,"agent-card.json");
  assert.equal(result.cardStatus,"endpoint-authorization-required");
  assert.equal(result.advertisedEndpointOrigin,"https://agent.example");
  assert.equal(result.endpointOriginAuthorized,false);
  assert.equal(result.candidateCreated,false);
  assert.equal(result.candidate,null);
  assert.equal(result.rawAgentCardPersisted,false);
  assert.equal(result.candidateExecuted,false);
  assert.equal(result.trustGranted,false);
  assert.equal(result.admissionGranted,false);
  assert.equal(result.dispatchAuthorized,false);
  assert.equal(seen.length,2);
  assert.ok(seen.every(entry=>entry.url.startsWith("https://api.github.com/")));
  assert.ok(seen.every(entry=>entry.init.redirect==="manual"));
});

test("GitHub resolver creates only an untrusted declared candidate when endpoint origin is authorized",async()=>{
  const result=await resolveA2aGithubRepository({
    sourceId:"github-a2a-test",
    referenceUrl:"https://github.com/example/repo",
    networkEnabled:true,
    allowedAgentOrigins:["https://agent.example"],
    now:()=>new Date("2026-09-20T02:00:00.000Z"),
    fetchImpl:async(url)=>{
      if(url==="https://api.github.com/repos/example/repo"){
        return jsonResponse({default_branch:"main"});
      }
      if(url==="https://api.github.com/repos/example/repo/contents/agent-card.json?ref=main"){
        return contentResponse(card("https://agent.example/a2a"));
      }
      throw new Error("unexpected fetch "+url);
    }
  });
  assert.equal(result.cardStatus,"candidate-created");
  assert.equal(result.endpointOriginAuthorized,true);
  assert.equal(result.candidateCreated,true);
  assert.equal(result.candidate.name,"Repo Agent");
  assert.equal(result.candidate.provider,"Example");
  assert.equal(result.candidate.endpoint,"https://agent.example/a2a");
  assert.equal(result.candidate.protocol,"a2a");
  assert.equal(result.candidate.trustState,"untrusted");
  assert.equal(result.candidate.capabilityState,"declared");
  assert.equal(result.candidate.admissionState,"not-admitted");
  assert.equal(result.candidate.declaredCapabilities.includes("a2a"),true);
  assert.equal(result.candidateExecuted,false);
  assert.equal(result.trustGranted,false);
  assert.equal(result.admissionGranted,false);
  assert.equal(result.dispatchAuthorized,false);
});

test("GitHub resolver probes only known Agent Card paths and stops when none exists",async()=>{
  const seen=[];
  const result=await resolveA2aGithubRepository({
    referenceUrl:"https://github.com/example/no-card",
    networkEnabled:true,
    fetchImpl:async(url)=>{
      seen.push(url);
      if(url==="https://api.github.com/repos/example/no-card"){
        return jsonResponse({default_branch:"main"});
      }
      if(url.includes("/contents/"))return new Response("",{status:404});
      throw new Error("unexpected fetch "+url);
    }
  });
  assert.equal(result.cardStatus,"not-found");
  assert.equal(result.candidateCreated,false);
  assert.equal(result.candidate,null);
  assert.deepEqual(seen,[
    "https://api.github.com/repos/example/no-card",
    "https://api.github.com/repos/example/no-card/contents/agent-card.json?ref=main",
    "https://api.github.com/repos/example/no-card/contents/.well-known/agent-card.json?ref=main"
  ]);
});

test("GitHub resolver is network-off by default and rejects non-repository references",async()=>{
  await assert.rejects(
    ()=>resolveA2aGithubRepository({
      referenceUrl:"https://github.com/example/repo",
      fetchImpl:async()=>jsonResponse({})
    }),
    error=>error.code==="ARCA_A2A_GITHUB_NETWORK_DISABLED"
  );
  await assert.rejects(
    ()=>resolveA2aGithubRepository({
      referenceUrl:"https://agent.example/.well-known/agent-card.json",
      networkEnabled:true,
      fetchImpl:async()=>jsonResponse({})
    }),
    /requires github-repository/
  );
});
