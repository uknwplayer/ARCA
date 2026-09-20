import test from "node:test";
import assert from "node:assert/strict";
import {
  GitHubMeshMailboxTransport
} from "../src/machine-bridge/github-mesh-mailbox.mjs";
import {
  MachineBridgeMeshClient,
  MachineBridgeMeshEndpoint,
  MachineBridgeMeshRelay,
  verifyMeshResult
} from "../src/machine-bridge/mesh.mjs";
import {
  MeshIdentityTrustStore,
  MeshReplayGuard,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";

const T1=new Date("2026-09-17T23:30:00.000Z");
const T2=new Date("2026-09-17T23:30:30.000Z");
const fixedNow=()=>new Date(T1);

function job(overrides={}){
  return {
    format:"arca-remote-job-v3",
    protocolVersion:3,
    jobId:"mesh-signed-job-1",
    requestId:"mesh-signed-req-1",
    action:"worker.ping",
    requires:[],
    params:{echo:"signed mesh"},
    ...overrides
  };
}

function makeApi(){
  const store=new Map();let seq=0;
  const response=(status,body)=>({ok:status>=200&&status<300,status,statusText:String(status),async text(){return body==null?"":JSON.stringify(body)}});
  const fetchImpl=async(url,options={})=>{
    const u=new URL(url);const method=options.method||"GET";
    if(method==="POST"&&u.pathname.endsWith("/dispatches"))return response(204,null);
    const marker="/contents/";const index=u.pathname.indexOf(marker);
    if(index<0)return response(404,{message:"Not Found"});
    const raw=u.pathname.slice(index+marker.length);const path=raw.split("/").map(decodeURIComponent).join("/");
    if(method==="PUT"){
      const body=JSON.parse(options.body);const current=store.get(path);
      if(current&&body.sha!==current.sha)return response(409,{message:"sha mismatch"});
      if(!current&&body.sha)return response(409,{message:"missing path"});
      const text=Buffer.from(body.content,"base64").toString("utf8");
      store.set(path,{text,sha:"sha-"+(++seq)});
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
  return {store,fetchImpl};
}

function mailbox(api,options={}){
  return new GitHubMeshMailboxTransport({
    repository:"owner/repo",
    ref:"main",
    token:"secret",
    fetchImpl:api.fetchImpl,
    ...options
  });
}

test("strict signed Mesh route produces one Ed25519-authenticated receipt per hop",async()=>{
  const relayAIdentity=generateMeshNodeIdentity("relay-a");
  const relayBIdentity=generateMeshNodeIdentity("relay-b");
  const workerIdentity=generateMeshNodeIdentity("worker-b");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(relayAIdentity.identity);
  trustStore.trust(relayBIdentity.identity);
  trustStore.trust(workerIdentity.identity);

  const endpoint=new MachineBridgeMeshEndpoint({
    nodeId:"worker-b",
    capabilities:["reasoning"],
    client:{call:async value=>({
      format:"arca-result-v1",
      protocolVersion:3,
      jobId:value.jobId,
      requestId:value.requestId,
      workerId:"worker-b",
      attempt:1,
      status:"completed",
      startedAt:"2026-09-17T23:30:01.000Z",
      completedAt:"2026-09-17T23:30:02.000Z",
      output:{ok:true}
    })},
    now:fixedNow,
    receiptSigner:workerIdentity,
    requireSignedReceipts:true,
    trustStore
  });
  const relayB=new MachineBridgeMeshRelay({
    nodeId:"relay-b",
    now:fixedNow,
    receiptSigner:relayBIdentity,
    requireSignedReceipts:true,
    trustStore,
    peers:[endpoint.advertise()]
  });
  const relayA=new MachineBridgeMeshRelay({
    nodeId:"relay-a",
    now:fixedNow,
    receiptSigner:relayAIdentity,
    requireSignedReceipts:true,
    trustStore,
    peers:[relayB.advertise()]
  });
  const client=new MachineBridgeMeshClient({
    originNode:"bridge-a",
    entry:relayA,
    now:fixedNow,
    requireSignedReceipts:true,
    trustStore
  });

  const result=await client.call(job(),{requiredCapabilities:["reasoning"],ttlMs:60_000,maxHops:5});
  assert.equal(result.result.status,"completed");
  assert.deepEqual(result.route,["relay-a","relay-b","worker-b"]);
  assert.equal(result.receipts.length,3);
  for(const receipt of result.receipts){
    assert.ok(receipt.signedReceipt);
    assert.equal(receipt.signedReceipt.signer.nodeId,receipt.nodeId);
    assert.equal(receipt.signedReceipt.payload.receiptHash,receipt.receiptHash);
  }
  assert.equal(verifyMeshResult(result,{requireSignedReceipts:true,trustStore}),true);
});

test("strict caller rejects a legacy unsigned Mesh result",async()=>{
  const endpoint=new MachineBridgeMeshEndpoint({
    nodeId:"worker-legacy",
    capabilities:["reasoning"],
    client:{call:async value=>({
      format:"arca-result-v1",protocolVersion:3,jobId:value.jobId,requestId:value.requestId,
      workerId:"worker-legacy",attempt:1,status:"completed",
      startedAt:T1.toISOString(),completedAt:T1.toISOString(),output:{ok:true}
    })},
    now:fixedNow
  });
  const relay=new MachineBridgeMeshRelay({nodeId:"relay-legacy",now:fixedNow,peers:[endpoint.advertise()]});
  const client=new MachineBridgeMeshClient({originNode:"bridge-a",entry:relay,now:fixedNow,requireSignedReceipts:true});
  await assert.rejects(()=>client.call(job({jobId:"legacy-job",requestId:"legacy-req"}),{
    requiredCapabilities:["reasoning"],ttlMs:60_000,maxHops:4
  }),/signed receipt required/);
});

test("GitHub Mesh mailbox require-signed policy rejects unsigned registration and lists valid signed nodes",async()=>{
  const api=makeApi();
  const signer=generateMeshNodeIdentity("signed-node-a");
  const box=mailbox(api,{identityPolicy:"require-signed",replayGuard:new MeshReplayGuard({maxEntries:100})});
  await assert.rejects(()=>box.registerNode({
    nodeId:"signed-node-a",kind:"endpoint",capabilities:["reasoning"],heartbeatAt:T1.toISOString()
  }),/unsigned Mesh node registration disabled/);

  const stored=await box.registerSignedNode({
    nodeId:"signed-node-a",
    kind:"endpoint",
    capabilities:["reasoning"],
    reachableCapabilities:["reasoning"],
    heartbeatAt:T1.toISOString(),
    metadata:{operator:"fixture"}
  },{signer,now:T1,ttlMs:60_000,clockSkewMs:0});

  assert.equal(stored.statement.signer.nodeId,"signed-node-a");
  const nodes=await box.listNodes({now:T2,maxAgeMs:60_000,clockSkewMs:0});
  assert.equal(nodes.length,1);
  assert.equal(nodes[0].node.nodeId,"signed-node-a");
  assert.equal(nodes[0].signed,true);
  assert.equal(nodes[0].identity.keyFingerprint,signer.identity.keyFingerprint);
});

test("GitHub Mesh mailbox require-trusted policy pins the signer key",async()=>{
  const api=makeApi();
  const trusted=generateMeshNodeIdentity("trusted-node");
  const impostor=generateMeshNodeIdentity("trusted-node");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(trusted.identity);
  const box=mailbox(api,{identityPolicy:"require-trusted",trustStore});

  await assert.rejects(()=>box.registerSignedNode({
    nodeId:"trusted-node",kind:"relay",capabilities:["mesh.relay"],heartbeatAt:T1.toISOString()
  },{signer:impostor,now:T1,ttlMs:60_000,clockSkewMs:0}),/not current/);

  await box.registerSignedNode({
    nodeId:"trusted-node",kind:"relay",capabilities:["mesh.relay"],heartbeatAt:T1.toISOString()
  },{signer:trusted,now:T1,ttlMs:60_000,clockSkewMs:0});
  const nodes=await box.listNodes({now:T2,maxAgeMs:60_000,clockSkewMs:0});
  assert.equal(nodes.length,1);
  assert.equal(nodes[0].identityTrusted,true);
});

test("tampered signed mailbox advertisement is excluded from strict discovery",async()=>{
  const api=makeApi();
  const signer=generateMeshNodeIdentity("signed-node-tamper");
  const box=mailbox(api,{identityPolicy:"require-signed"});
  await box.registerSignedNode({
    nodeId:"signed-node-tamper",kind:"endpoint",capabilities:["reasoning"],heartbeatAt:T1.toISOString()
  },{signer,now:T1,ttlMs:60_000,clockSkewMs:0});

  const path="remote-mesh/nodes/signed-node-tamper.json";
  const current=api.store.get(path);
  const value=JSON.parse(current.text);
  value.payload.capabilities=["reasoning","repository"];
  api.store.set(path,{...current,text:JSON.stringify(value)});

  const nodes=await box.listNodes({now:T2,maxAgeMs:60_000,clockSkewMs:0});
  assert.deepEqual(nodes,[]);
});
