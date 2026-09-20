import test from "node:test";
import assert from "node:assert/strict";
import {createA2aRegistryResolver} from "../packages/agent/src/a2a-registry-resolution.ts";

test("A2A registry resolution returns metadata without fetching manifest",async()=>{
  const seen=[];
  const resolver=createA2aRegistryResolver({
    networkEnabled:true,
    allowedOrigins:["https://api.a2a-registry.org"],
    fetchImpl:async(url,init)=>{
      seen.push({url,init});
      return new Response(JSON.stringify({
        agent:{
          id:"agent-123",
          displayName:"Research Agent",
          package_name:"org.example.research",
          manifest_url:"https://agent.example/.well-known/agent-card.json"
        }
      }),{status:200});
    }
  });
  const result=await resolver.resolve("agent-123");
  assert.equal(result.registryId,"agent-123");
  assert.equal(result.displayName,"Research Agent");
  assert.equal(result.packageName,"org.example.research");
  assert.equal(result.manifestUrl,"https://agent.example/.well-known/agent-card.json");
  assert.equal(result.manifestReferencePresent,true);
  assert.equal(result.manifestFetched,false);
  assert.equal(result.trustState,"untrusted");
  assert.equal(result.admissionState,"not-admitted");
  assert.equal(result.candidateCreated,false);
  assert.equal(result.candidateExecuted,false);
  assert.equal(result.trustGranted,false);
  assert.equal(result.admissionGranted,false);
  assert.equal(result.dispatchAuthorized,false);
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,"https://api.a2a-registry.org/public/agents/agent-123");
  assert.equal(seen[0].init.method,"GET");
  assert.equal(seen[0].init.redirect,"manual");
});

test("A2A registry resolution is network-off and origin-authorized",async()=>{
  const disabled=createA2aRegistryResolver({
    allowedOrigins:["https://api.a2a-registry.org"],
    fetchImpl:async()=>new Response("{}",{status:200})
  });
  await assert.rejects(
    ()=>disabled.resolve("agent-1"),
    error=>error.code==="ARCA_A2A_REGISTRY_RESOLUTION_NETWORK_DISABLED"
  );

  const blocked=createA2aRegistryResolver({
    networkEnabled:true,
    allowedOrigins:["https://other.example.test"],
    fetchImpl:async()=>new Response("{}",{status:200})
  });
  await assert.rejects(()=>blocked.resolve("agent-1"),/origin not authorized/);
});

test("A2A registry resolution refuses redirects",async()=>{
  const resolver=createA2aRegistryResolver({
    networkEnabled:true,
    allowedOrigins:["https://api.a2a-registry.org"],
    fetchImpl:async()=>new Response(null,{status:302,headers:{location:"https://other.example.test"}})
  });
  await assert.rejects(
    ()=>resolver.resolve("agent-1"),
    error=>error.code==="ARCA_A2A_REGISTRY_RESOLUTION_REDIRECT_REFUSED"
  );
});

test("A2A registry resolution drops unsafe manifest URLs",async()=>{
  const resolver=createA2aRegistryResolver({
    networkEnabled:true,
    allowedOrigins:["https://api.a2a-registry.org"],
    fetchImpl:async()=>new Response(JSON.stringify({
      id:"agent-unsafe",
      name:"Unsafe",
      manifest_url:"http://127.0.0.1:8080/card.json"
    }),{status:200})
  });
  const result=await resolver.resolve("agent-unsafe");
  assert.equal(result.manifestUrl,null);
  assert.equal(result.manifestReferencePresent,false);
  assert.equal(result.manifestFetched,false);
  assert.equal(result.candidateCreated,false);
});
