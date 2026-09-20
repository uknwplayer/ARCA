import test from "node:test";
import assert from "node:assert/strict";
import {GitHubMeshMailboxTransport} from "../src/machine-bridge/github-mesh-mailbox.mjs";
import {MachineBridgeMeshEndpoint,createMeshEnvelope} from "../src/machine-bridge/mesh.mjs";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity,
  signMeshNodeAdvertisement
} from "../src/machine-bridge/mesh-identity.mjs";

function makeApi(){
  const store=new Map();let seq=0,dispatches=[];
  const response=(status,body)=>({ok:status>=200&&status<300,status,statusText:String(status),async text(){return body==null?"":JSON.stringify(body)}});
  const fetchImpl=async(url,options={})=>{
    const u=new URL(url);const method=options.method||"GET";
    if(method==="POST"&&u.pathname.endsWith("/dispatches")){dispatches.push(JSON.parse(options.body));return response(204,null)}
    const marker="/contents/";const index=u.pathname.indexOf(marker);
    if(index<0)return response(404,{message:"Not Found"});
    const raw=u.pathname.slice(index+marker.length);const path=raw.split("/").map(decodeURIComponent).join("/");
    if(method==="PUT"){
      const body=JSON.parse(options.body);const current=store.get(path);
      if(current&&body.sha!==current.sha)return response(409,{message:"sha mismatch"});
      if(!current&&body.sha)return response(409,{message:"missing path"});
      const text=Buffer.from(body.content,"base64").toString("utf8");
      store.set(path,{text,sha:`sha-${++seq}`});
      return response(201,{content:{path,sha:store.get(path).sha}});
    }
    const file=store.get(path);
    if(file)return response(200,{type:"file",name:path.split("/").at(-1),path,sha:file.sha,content:Buffer.from(file.text).toString("base64")});
    const prefix=path.replace(/\/$/,"")+"/";const children=new Map();
    for(const [key,value] of store){
      if(!key.startsWith(prefix))continue;
      const rest=key.slice(prefix.length);const name=rest.split("/")[0];if(!name)continue;
      const childPath=prefix+name;
      if(!children.has(name))children.set(name,rest.includes("/")?{type:"dir",name,path:childPath}:{type:"file",name,path:childPath,sha:value.sha});
    }
    return children.size?response(200,[...children.values()]):response(404,{message:"Not Found"});
  };
  return {store,fetchImpl,get dispatches(){return dispatches}};
}

const job=(overrides={})=>({
  format:"arca-remote-job-v3",protocolVersion:3,jobId:"mesh-mailbox-job-1",requestId:"mesh-mailbox-req-1",
  action:"worker.ping",requires:[],params:{echo:"mailbox"},...overrides
});

function transport(api){return new GitHubMeshMailboxTransport({repository:"owner/repo",ref:"main",token:"secret",fetchImpl:api.fetchImpl})}

test("GitHub Mesh mailbox defaults mutable state away from source main",()=>{
  const api=makeApi();
  const mailbox=new GitHubMeshMailboxTransport({repository:"owner/repo",token:"secret",fetchImpl:api.fetchImpl});
  assert.equal(mailbox.ref,"arca-runtime");
});

test("GitHub Mesh mailbox registers nodes and filters stale advertisements",async()=>{
  const api=makeApi();const mailbox=transport(api);
  await mailbox.registerNode({nodeId:"relay-a",kind:"relay",capabilities:["mesh.relay"],reachableCapabilities:["llm.reasoning"],heartbeatAt:"2026-09-17T19:00:00.000Z"});
  await mailbox.registerNode({nodeId:"worker-b",kind:"endpoint",capabilities:["llm.reasoning"],heartbeatAt:"2026-09-17T18:00:00.000Z"});
  const active=await mailbox.listNodes({now:new Date("2026-09-17T19:02:00.000Z"),maxAgeMs:5*60*1000});
  assert.deepEqual(active.map(item=>item.node.nodeId),["relay-a"]);
  const all=await mailbox.listNodes({now:new Date("2026-09-17T19:02:00.000Z"),maxAgeMs:5*60*1000,includeStale:true});
  assert.equal(all.length,2);
  assert.equal(all.find(item=>item.node.nodeId==="worker-b").stale,true);
});

test("GitHub Mesh mailbox accepts an async closed signer for trusted node registration",async()=>{
  const api=makeApi();
  const raw=generateMeshNodeIdentity("relay-signed");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(raw.identity);
  const mailbox=new GitHubMeshMailboxTransport({
    repository:"owner/repo",
    ref:"main",
    token:"secret",
    fetchImpl:api.fetchImpl,
    identityPolicy:"require-trusted",
    trustStore
  });
  let calls=0;
  const asyncSigner={
    identity:raw.identity,
    async signNodeAdvertisement(value,options){
      calls+=1;
      return signMeshNodeAdvertisement(value,raw,options);
    }
  };
  const now=new Date("2026-09-17T19:00:00.000Z");
  const registered=await mailbox.registerSignedNode({
    nodeId:"relay-signed",
    kind:"relay",
    capabilities:["mesh.relay"],
    reachableCapabilities:["reasoning"],
    heartbeatAt:now.toISOString()
  },{signer:asyncSigner,now,ttlMs:60_000,clockSkewMs:0});
  assert.equal(calls,1);
  assert.equal(registered.node.nodeId,"relay-signed");
  const listed=await mailbox.listNodes({now,maxAgeMs:60_000,clockSkewMs:0});
  assert.equal(listed.length,1);
  assert.equal(listed[0].identityTrusted,true);
});

test("GitHub Mesh mailbox durably enqueues envelopes and notifies a target node once",async()=>{
  const api=makeApi();const mailbox=transport(api);
  const envelope=createMeshEnvelope(job(),{originNode:"bridge-a",requiredCapabilities:["llm.reasoning"],now:new Date("2026-09-17T19:00:00.000Z")});
  assert.equal(await mailbox.enqueueEnvelope("relay-a",envelope),true);
  assert.equal(await mailbox.enqueueEnvelope("relay-a",envelope),false);
  assert.equal(api.dispatches.length,1);
  assert.equal(api.dispatches[0].event_type,"arca_mesh_available");
  assert.equal(api.dispatches[0].client_payload.node_id,"relay-a");
  const queued=await mailbox.listEnvelopes("relay-a");
  assert.equal(queued.length,1);
  assert.equal(queued[0].envelope.requestId,"mesh-mailbox-req-1");
});

test("GitHub Mesh mailbox claims are exclusive until lease expiry",async()=>{
  const api=makeApi();const mailbox=transport(api);
  const first=await mailbox.claimEnvelope("relay-a","mesh-mailbox-req-1","processor-a",{leaseMs:10000,now:new Date("2026-09-17T19:00:00.000Z")});
  assert.equal(first.attempt,1);
  assert.equal(await mailbox.claimEnvelope("relay-a","mesh-mailbox-req-1","processor-b",{leaseMs:10000,now:new Date("2026-09-17T19:00:05.000Z")}),null);
  const second=await mailbox.claimEnvelope("relay-a","mesh-mailbox-req-1","processor-b",{leaseMs:10000,now:new Date("2026-09-17T19:00:11.000Z")});
  assert.equal(second.attempt,2);
  assert.equal(second.processorId,"processor-b");
});

test("GitHub Mesh mailbox stores and retrieves a correlated terminal Mesh result",async()=>{
  const api=makeApi();const mailbox=transport(api);
  const envelope=createMeshEnvelope(job(),{originNode:"bridge-a",requiredCapabilities:["llm.reasoning"],now:new Date("2026-09-17T19:00:00.000Z")});
  const endpoint=new MachineBridgeMeshEndpoint({
    nodeId:"worker-b",
    capabilities:["llm.reasoning"],
    now:()=>new Date("2026-09-17T19:00:01.000Z"),
    client:{call:async value=>({
      format:"arca-result-v1",protocolVersion:3,jobId:value.jobId,requestId:value.requestId,
      workerId:"worker-b",attempt:1,status:"completed",startedAt:"2026-09-17T19:00:01.000Z",completedAt:"2026-09-17T19:00:02.000Z",output:{ok:true}
    })}
  });
  const result=await endpoint.forward(envelope);
  assert.equal(await mailbox.writeResult(result),true);
  assert.equal(await mailbox.writeResult(result),false);
  const loaded=await mailbox.getResult("mesh-mailbox-req-1");
  assert.equal(loaded.result.result.status,"completed");
  assert.deepEqual(loaded.result.replyRoute,["worker-b"]);
});
