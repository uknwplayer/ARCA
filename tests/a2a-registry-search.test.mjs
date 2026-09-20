import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCA_A2A_REGISTRY_SEARCH_RESULT_FORMAT,
  createA2aRegistrySearchSource
} from "../packages/agent/src/a2a-registry-search.ts";

test("A2A registry search returns untrusted references only",async()=>{
  const seen=[];
  const source=createA2aRegistrySearchSource({
    query:"research agent",
    tags:["research","public"],
    networkEnabled:true,
    allowedOrigins:["https://api.a2a-registry.org"],
    maxResults:2,
    fetchImpl:async(url,init)=>{
      seen.push({url,init});
      return new Response(JSON.stringify({
        agents:[
          {
            id:"agent-1",
            displayName:"Agent One",
            manifestUrl:"https://agent.example/.well-known/agent-card.json"
          },
          {
            package_name:"pkg.two",
            display_name:"Agent Two"
          }
        ]
      }),{status:200});
    }
  });
  const result=await source.search();
  assert.equal(result.format,ARCA_A2A_REGISTRY_SEARCH_RESULT_FORMAT);
  assert.equal(result.hitCount,2);
  assert.equal(result.trustGranted,false);
  assert.equal(result.admissionGranted,false);
  assert.equal(result.candidateCreated,false);
  assert.equal(result.candidateExecuted,false);
  assert.equal(result.dispatchAuthorized,false);
  assert.equal(result.hits[0].trustState,"untrusted");
  assert.equal(result.hits[0].admissionState,"not-admitted");
  assert.equal(result.hits[0].candidateCreated,false);
  assert.equal(result.hits[0].candidateExecuted,false);
  assert.equal(result.hits[0].dispatchAuthorized,false);
  assert.equal(result.hits[0].manifestUrl,"https://agent.example/.well-known/agent-card.json");
  assert.equal(result.hits[1].manifestUrl,null);
  assert.match(seen[0].url,/\/public\/agents\?/);
  assert.match(seen[0].url,/q=research\+agent/);
  assert.match(seen[0].url,/tags=public%2Cresearch|tags=research%2Cpublic/);
  assert.equal(seen[0].init.method,"GET");
  assert.equal(seen[0].init.redirect,"manual");
});

test("A2A registry search is network-off by default and host-authorized",async()=>{
  const disabled=createA2aRegistrySearchSource({
    query:"research",
    allowedOrigins:["https://api.a2a-registry.org"],
    fetchImpl:async()=>new Response("[]",{status:200})
  });
  await assert.rejects(
    ()=>disabled.search(),
    error=>error.code==="ARCA_A2A_REGISTRY_SEARCH_NETWORK_DISABLED"
  );

  const blocked=createA2aRegistrySearchSource({
    query:"research",
    networkEnabled:true,
    allowedOrigins:["https://other.example.test"],
    fetchImpl:async()=>new Response("[]",{status:200})
  });
  await assert.rejects(()=>blocked.search(),/origin not authorized/);
});

test("A2A registry search refuses redirects and fails closed on unknown response shape",async()=>{
  const redirect=createA2aRegistrySearchSource({
    query:"research",
    networkEnabled:true,
    allowedOrigins:["https://api.a2a-registry.org"],
    fetchImpl:async()=>new Response(null,{status:302,headers:{location:"https://other.example.test"}})
  });
  await assert.rejects(
    ()=>redirect.search(),
    error=>error.code==="ARCA_A2A_REGISTRY_SEARCH_REDIRECT_REFUSED"
  );

  const invalid=createA2aRegistrySearchSource({
    query:"research",
    networkEnabled:true,
    allowedOrigins:["https://api.a2a-registry.org"],
    fetchImpl:async()=>new Response(JSON.stringify({ok:true}),{status:200})
  });
  await assert.rejects(()=>invalid.search(),/no agent list/);
});

test("A2A registry search does not promote unsafe manifest URLs",async()=>{
  const source=createA2aRegistrySearchSource({
    query:"research",
    networkEnabled:true,
    allowedOrigins:["https://api.a2a-registry.org"],
    fetchImpl:async()=>new Response(JSON.stringify({
      results:[{
        identifier:"unsafe",
        name:"Unsafe Listing",
        manifest_url:"http://127.0.0.1:8080/.well-known/agent-card.json"
      }]
    }),{status:200})
  });
  const result=await source.search();
  assert.equal(result.hitCount,1);
  assert.equal(result.hits[0].manifestUrl,null);
  assert.equal(result.hits[0].trustState,"untrusted");
  assert.equal(result.hits[0].candidateCreated,false);
});
