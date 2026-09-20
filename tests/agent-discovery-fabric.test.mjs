import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  ARCA_AGENT_DISCOVERY_CANDIDATE_FORMAT,
  ARCA_AGENT_DISCOVERY_CATALOG_FORMAT,
  AgentDiscoveryCandidateRegistry,
  AgentDiscoveryFabric,
  createStaticAgentDiscoverySource,
  createHttpAgentCatalogSource
} from "../packages/agent/src/agent-discovery.ts";

const candidate={
  id:"agent-alpha",
  name:"Agent Alpha",
  provider:"community",
  kind:"agent",
  protocol:"aap",
  endpoint:"https://agents.example.test/alpha",
  capabilities:["research","reasoning"]
};

test("Agent Discovery records claims as untrusted declared candidates only",async()=>{
  const registry=new AgentDiscoveryCandidateRegistry();
  const source=createStaticAgentDiscoverySource({sourceId:"seed-a",candidates:[{
    ...candidate,
    trustState:"trusted",
    capabilityState:"verified",
    admissionState:"admitted"
  }]});
  const fabric=new AgentDiscoveryFabric({
    registry,
    sources:[source],
    now:()=>new Date("2026-09-19T23:50:00.000Z")
  });
  const result=await fabric.run({runId:"DISCOVERY-1"});
  assert.equal(result.trustGranted,false);
  assert.equal(result.capabilitiesVerified,false);
  assert.equal(result.admissionGranted,false);
  assert.equal(result.dispatchAuthorized,false);
  assert.equal(result.observedCandidateCount,1);
  const record=registry.list()[0];
  assert.equal(record.format,ARCA_AGENT_DISCOVERY_CANDIDATE_FORMAT);
  assert.equal(record.trustState,"untrusted");
  assert.equal(record.capabilityState,"declared");
  assert.equal(record.admissionState,"not-admitted");
  assert.deepEqual(record.declaredCapabilities,["reasoning","research"]);
  assert.equal(Object.hasOwn(record,"verified"),false);
});

test("Agent Discovery deduplicates identity and preserves source observations",async()=>{
  const registry=new AgentDiscoveryCandidateRegistry();
  const clockValues=[
    new Date("2026-09-19T23:51:00.000Z"),
    new Date("2026-09-19T23:51:01.000Z"),
    new Date("2026-09-19T23:51:02.000Z"),
    new Date("2026-09-19T23:51:03.000Z")
  ];
  let index=0;
  const fabric=new AgentDiscoveryFabric({
    registry,
    sources:[
      createStaticAgentDiscoverySource({sourceId:"catalog-a",candidates:[candidate]}),
      createStaticAgentDiscoverySource({sourceId:"catalog-b",candidates:[{...candidate,capabilities:["research","translation"]}]})
    ],
    now:()=>clockValues[Math.min(index++,clockValues.length-1)]
  });
  const result=await fabric.run({runId:"DISCOVERY-2"});
  assert.equal(result.registryCandidateCount,1);
  const record=registry.list()[0];
  assert.equal(record.observations.length,2);
  assert.deepEqual(record.observations.map(value=>value.sourceId),["catalog-a","catalog-b"]);
  assert.deepEqual(record.declaredCapabilities,["reasoning","research","translation"]);
  assert.equal(record.trustState,"untrusted");
});

test("HTTP discovery catalog requires explicit network and origin permission",async()=>{
  const body={format:ARCA_AGENT_DISCOVERY_CATALOG_FORMAT,version:1,candidates:[candidate]};
  const source=createHttpAgentCatalogSource({
    sourceId:"remote-catalog",
    url:"https://catalog.example.test/agents.json",
    networkEnabled:false,
    allowedOrigins:["https://catalog.example.test"],
    fetchImpl:async()=>new Response(JSON.stringify(body),{status:200})
  });
  await assert.rejects(()=>source.discover(),error=>error.code==="ARCA_DISCOVERY_NETWORK_DISABLED");

  const blocked=createHttpAgentCatalogSource({
    sourceId:"remote-catalog-2",
    url:"https://catalog.example.test/agents.json",
    networkEnabled:true,
    allowedOrigins:["https://other.example.test"],
    fetchImpl:async()=>new Response(JSON.stringify(body),{status:200})
  });
  await assert.rejects(()=>blocked.discover(),/origin not authorized/);
});

test("HTTP discovery catalog works over explicit loopback test boundary and refuses redirects",async()=>{
  const server=http.createServer((request,response)=>{
    if(request.url==="/redirect"){
      response.writeHead(302,{location:"/catalog"});
      response.end();
      return;
    }
    const body=JSON.stringify({format:ARCA_AGENT_DISCOVERY_CATALOG_FORMAT,version:1,candidates:[{
      id:"local-aap",
      provider:"test",
      kind:"agent",
      protocol:"aap",
      endpoint:"http://127.0.0.1:6553",
      capabilities:["research"]
    }]});
    response.writeHead(200,{"content-type":"application/json","content-length":Buffer.byteLength(body)});
    response.end(body);
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  try{
    const source=createHttpAgentCatalogSource({
      sourceId:"local-catalog",
      url:"http://127.0.0.1:"+port+"/catalog",
      networkEnabled:true,
      allowLoopback:true
    });
    const discovered=await source.discover();
    assert.equal(discovered.length,1);

    const redirect=createHttpAgentCatalogSource({
      sourceId:"local-redirect",
      url:"http://127.0.0.1:"+port+"/redirect",
      networkEnabled:true,
      allowLoopback:true
    });
    await assert.rejects(()=>redirect.discover(),error=>error.code==="ARCA_DISCOVERY_REDIRECT_REFUSED");
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});

test("Discovery rejects secret-like catalog fields before candidate admission",async()=>{
  const source=createHttpAgentCatalogSource({
    sourceId:"unsafe-catalog",
    url:"https://catalog.example.test/agents.json",
    networkEnabled:true,
    allowedOrigins:["https://catalog.example.test"],
    fetchImpl:async()=>new Response(JSON.stringify({
      format:ARCA_AGENT_DISCOVERY_CATALOG_FORMAT,
      version:1,
      candidates:[{...candidate,apiKey:"must-not-enter-registry"}]
    }),{status:200})
  });
  await assert.rejects(()=>source.discover(),/secret-like field/);
});

test("Discovery source failures are isolated and do not create trust",async()=>{
  const registry=new AgentDiscoveryCandidateRegistry();
  const fabric=new AgentDiscoveryFabric({
    registry,
    sources:[
      createStaticAgentDiscoverySource({sourceId:"good",candidates:[candidate]}),
      {id:"bad",kind:"custom",uri:null,async discover(){throw Object.assign(new Error("boom"),{code:"ARCA_TEST_SOURCE_DOWN"})}}
    ],
    now:()=>new Date("2026-09-19T23:52:00.000Z")
  });
  const result=await fabric.run({runId:"DISCOVERY-3"});
  assert.equal(result.sourceCount,2);
  assert.equal(result.registryCandidateCount,1);
  assert.equal(result.sourceResults.find(value=>value.sourceId==="bad").errorCode,"ARCA_TEST_SOURCE_DOWN");
  assert.equal(result.trustGranted,false);
  assert.equal(registry.list()[0].trustState,"untrusted");
});
