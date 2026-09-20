import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  AgentDiscoveryCandidateRegistry,
  AgentDiscoveryFabric
} from "../packages/agent/src/agent-discovery.ts";
import {
  ARCA_A2A_WELL_KNOWN_PATH,
  createA2aWellKnownDiscoverySource,
  normalizeA2aAgentCard
} from "../packages/agent/src/a2a-discovery.ts";

function v1Card(endpoint){
  return {
    name:"Research Agent",
    description:"Synthetic public A2A card",
    version:"1.0.0",
    provider:{organization:"Example Lab"},
    capabilities:{streaming:false},
    defaultInputModes:["text/plain"],
    defaultOutputModes:["text/plain"],
    supportedInterfaces:[{
      protocolBinding:"JSONRPC",
      protocolVersion:"1.0",
      url:endpoint
    }],
    skills:[{
      id:"deep-research",
      name:"Deep Research",
      description:"Researches public topics",
      tags:["research","web"]
    }]
  };
}

test("A2A v1 Agent Card normalizes into an untrusted discovery candidate",async()=>{
  const source=createA2aWellKnownDiscoverySource({
    sourceId:"a2a-example",
    origin:"https://agent.example.test",
    networkEnabled:true,
    fetchImpl:async(url)=>{
      assert.equal(url,"https://agent.example.test"+ARCA_A2A_WELL_KNOWN_PATH);
      return new Response(JSON.stringify(v1Card("https://agent.example.test/a2a")),{status:200});
    }
  });
  const registry=new AgentDiscoveryCandidateRegistry();
  const fabric=new AgentDiscoveryFabric({
    registry,
    sources:[source],
    now:()=>new Date("2026-09-19T23:58:00.000Z")
  });
  const run=await fabric.run({runId:"A2A-DISCOVERY-1"});
  assert.equal(run.observedCandidateCount,1);
  const record=registry.list()[0];
  assert.equal(record.protocol,"a2a");
  assert.equal(record.kind,"agent");
  assert.equal(record.provider,"Example Lab");
  assert.equal(record.endpoint,"https://agent.example.test/a2a");
  assert.equal(record.trustState,"untrusted");
  assert.equal(record.capabilityState,"declared");
  assert.equal(record.admissionState,"not-admitted");
  assert.equal(record.declaredCapabilities.includes("a2a"),true);
  assert.equal(record.declaredCapabilities.some(value=>value.startsWith("a2a.skill.deep-research.")),true);
  assert.equal(record.declaredCapabilities.some(value=>value.startsWith("a2a.tag.research.")),true);
});

test("A2A adapter accepts legacy v0.3 URL fields without treating them as verified",()=>{
  const candidate=normalizeA2aAgentCard({
    name:"Legacy Agent",
    description:"Legacy",
    version:"0.3.0",
    protocolVersion:"0.3.0",
    url:"https://legacy.example.test/a2a",
    preferredTransport:"JSONRPC",
    capabilities:{},
    defaultInputModes:["text/plain"],
    defaultOutputModes:["text/plain"],
    skills:[{id:"legacy_skill",name:"Legacy",description:"Legacy skill",tags:["legacy"]}]
  },{sourceOrigin:"https://legacy.example.test"});
  assert.equal(candidate.protocol,"a2a");
  assert.equal(candidate.endpoint,"https://legacy.example.test/a2a");
  assert.equal(candidate.capabilities.includes("a2a"),true);
});

test("A2A advertised cross-origin endpoint is refused unless explicitly allowed",()=>{
  const card=v1Card("https://runtime.example.test/a2a");
  assert.throws(
    ()=>normalizeA2aAgentCard(card,{sourceOrigin:"https://card.example.test"}),
    /advertised endpoint origin not authorized/
  );
  const candidate=normalizeA2aAgentCard(card,{
    sourceOrigin:"https://card.example.test",
    allowedAgentOrigins:["https://runtime.example.test"]
  });
  assert.equal(candidate.endpoint,"https://runtime.example.test/a2a");
});

test("A2A well-known discovery is network-off by default and refuses redirects",async()=>{
  const disabled=createA2aWellKnownDiscoverySource({
    sourceId:"a2a-disabled",
    origin:"https://agent.example.test",
    fetchImpl:async()=>new Response(JSON.stringify(v1Card("https://agent.example.test/a2a")),{status:200})
  });
  await assert.rejects(()=>disabled.discover(),error=>error.code==="ARCA_A2A_DISCOVERY_NETWORK_DISABLED");

  const redirect=createA2aWellKnownDiscoverySource({
    sourceId:"a2a-redirect",
    origin:"https://agent.example.test",
    networkEnabled:true,
    fetchImpl:async()=>new Response(null,{status:302,headers:{location:"https://other.example.test/card"}})
  });
  await assert.rejects(()=>redirect.discover(),error=>error.code==="ARCA_A2A_DISCOVERY_REDIRECT_REFUSED");
});

test("A2A well-known source crosses a real loopback HTTP boundary only when host allows it",async()=>{
  const server=http.createServer((request,response)=>{
    assert.equal(request.url,ARCA_A2A_WELL_KNOWN_PATH);
    const port=server.address().port;
    const body=JSON.stringify(v1Card("http://127.0.0.1:"+port+"/a2a"));
    response.writeHead(200,{"content-type":"application/json","content-length":Buffer.byteLength(body)});
    response.end(body);
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  try{
    const blocked=createA2aWellKnownDiscoverySource({
      sourceId:"a2a-local-blocked",
      origin:"http://127.0.0.1:"+port,
      networkEnabled:true
    });
    await assert.rejects(()=>blocked.discover(),/loopback source not authorized/);

    const allowed=createA2aWellKnownDiscoverySource({
      sourceId:"a2a-local",
      origin:"http://127.0.0.1:"+port,
      networkEnabled:true,
      allowLoopback:true
    });
    const candidates=await allowed.discover();
    assert.equal(candidates.length,1);
    assert.equal(candidates[0].endpoint,"http://127.0.0.1:"+port+"/a2a");
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});

test("A2A malformed cards and excessive skill lists fail closed",()=>{
  assert.throws(
    ()=>normalizeA2aAgentCard({name:"Bad",skills:[]},{sourceOrigin:"https://bad.example.test"}),
    /no supported interface/
  );
  const card=v1Card("https://agent.example.test/a2a");
  card.skills=Array.from({length:257},(_,index)=>({id:"skill-"+index,name:"Skill",description:"x",tags:[]}));
  assert.throws(
    ()=>normalizeA2aAgentCard(card,{sourceOrigin:"https://agent.example.test"}),
    /skill limit exceeded/
  );
});
