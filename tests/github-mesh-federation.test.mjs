import test from "node:test";
import assert from "node:assert/strict";
import {GitHubMeshMailboxTransport} from "../src/machine-bridge/github-mesh-mailbox.mjs";
import {
  GitHubMeshFederationPeerResolver,
  verifyGitHubFederatedPeerBinding
} from "../src/machine-bridge/github-mesh-federation.mjs";
import {
  MachineBridgeMeshClient,
  MachineBridgeMeshEndpoint,
  MachineBridgeMeshRelay
} from "../src/machine-bridge/mesh.mjs";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";

const T1=new Date("2026-09-18T02:30:00.000Z");
const T2=new Date("2026-09-18T02:30:30.000Z");

function makeRepoApi(repository,token){
  const store=new Map();let seq=0;const dispatches=[];const auth=[];
  const response=(status,body)=>({
    ok:status>=200&&status<300,
    status,
    statusText:String(status),
    async text(){return body==null?"":JSON.stringify(body)}
  });
  const fetchImpl=async(url,options={})=>{
    const u=new URL(url);
    auth.push(options.headers?.Authorization||null);
    if(options.headers?.Authorization!==`Bearer ${token}`)return response(401,{message:"bad token"});
    const repoPrefix=`/repos/${repository}/`;
    if(!u.pathname.startsWith(repoPrefix))return response(404,{message:"wrong repository"});
    const method=options.method||"GET";
    if(method==="POST"&&u.pathname.endsWith("/dispatches")){
      dispatches.push(JSON.parse(options.body));
      return response(204,null);
    }
    const marker="/contents/";const index=u.pathname.indexOf(marker);
    if(index<0)return response(404,{message:"Not Found"});
    const raw=u.pathname.slice(index+marker.length);
    const path=raw.split("/").map(decodeURIComponent).join("/");
    if(method==="PUT"){
      const body=JSON.parse(options.body);const current=store.get(path);
      if(body.branch!=="arca-runtime")return response(422,{message:"wrong ref"});
      if(current&&body.sha!==current.sha)return response(409,{message:"sha mismatch"});
      if(!current&&body.sha)return response(409,{message:"missing path"});
      const text=Buffer.from(body.content,"base64").toString("utf8");
      store.set(path,{text,sha:`sha-${++seq}`});
      return response(201,{content:{path,sha:store.get(path).sha}});
    }
    const file=store.get(path);
    if(file)return response(200,{
      type:"file",
      name:path.split("/").at(-1),
      path,
      sha:file.sha,
      content:Buffer.from(file.text).toString("base64")
    });
    const prefix=path.replace(/\/$/,"")+"/";const children=new Map();
    for(const [key,value] of store){
      if(!key.startsWith(prefix))continue;
      const rest=key.slice(prefix.length);const name=rest.split("/")[0];if(!name)continue;
      const childPath=prefix+name;
      if(!children.has(name))children.set(name,rest.includes("/")
        ?{type:"dir",name,path:childPath}
        :{type:"file",name,path:childPath,sha:value.sha});
    }
    return children.size?response(200,[...children.values()]):response(404,{message:"Not Found"});
  };
  return {repository,token,store,dispatches,auth,fetchImpl};
}

function trust(...identities){
  const store=new MeshIdentityTrustStore();
  for(const identity of identities)store.trust(identity);
  return store;
}

function job(){
  return {
    format:"arca-remote-job-v3",
    protocolVersion:3,
    jobId:"federation-job-001",
    requestId:"federation-req-001",
    action:"worker.ping",
    requires:[],
    params:{echo:"federation-v1"}
  };
}

test("Federation V1 crosses independent GitHub repository stores with explicit identity and transport binding",async()=>{
  const relayIdentity=generateMeshNodeIdentity("relay-a");
  const workerIdentity=generateMeshNodeIdentity("worker-b");
  const trustA=trust(relayIdentity.identity,workerIdentity.identity);
  const trustB=trust(relayIdentity.identity,workerIdentity.identity);

  const apiA=makeRepoApi("operator-a/mesh-state","token-a");
  const apiB=makeRepoApi("operator-b/mesh-state","token-b");

  const localMailbox=new GitHubMeshMailboxTransport({
    repository:apiA.repository,
    ref:"arca-runtime",
    token:apiA.token,
    fetchImpl:apiA.fetchImpl,
    identityPolicy:"require-trusted",
    trustStore:trustA
  });
  const remoteHostMailbox=new GitHubMeshMailboxTransport({
    repository:apiB.repository,
    ref:"arca-runtime",
    token:apiB.token,
    fetchImpl:apiB.fetchImpl,
    identityPolicy:"require-trusted",
    trustStore:trustB
  });
  const remoteOriginView=new GitHubMeshMailboxTransport({
    repository:apiB.repository,
    ref:"arca-runtime",
    token:apiB.token,
    fetchImpl:apiB.fetchImpl,
    identityPolicy:"require-trusted",
    trustStore:trustA
  });

  await localMailbox.registerSignedNode({
    nodeId:"relay-a",
    kind:"relay",
    capabilities:["mesh.relay"],
    reachableCapabilities:["reasoning"],
    heartbeatAt:T1.toISOString(),
    metadata:{operator:"operator-a"}
  },{signer:relayIdentity,now:T1,ttlMs:120000,clockSkewMs:0});

  await remoteHostMailbox.registerSignedNode({
    nodeId:"worker-b",
    kind:"endpoint",
    capabilities:["reasoning"],
    reachableCapabilities:["reasoning"],
    heartbeatAt:T1.toISOString(),
    metadata:{operator:"operator-b"}
  },{signer:workerIdentity,now:T1,ttlMs:120000,clockSkewMs:0});

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
      startedAt:T2.toISOString(),
      completedAt:new Date(T2.getTime()+1000).toISOString(),
      output:{ok:true,echo:value.params.echo}
    })},
    now:()=>new Date(T2),
    receiptSigner:workerIdentity,
    requireSignedReceipts:true,
    trustStore:trustB
  });

  let processed=false;let waitClock=0;
  const resolver=new GitHubMeshFederationPeerResolver({
    mailbox:remoteOriginView,
    trustStore:trustA,
    now:()=>new Date(T2),
    maxAgeMs:60000,
    clockSkewMs:0
  });
  const peer=await resolver.resolve("worker-b",{
    expectedKeyFingerprint:workerIdentity.identity.keyFingerprint,
    waitTimeoutMs:5000,
    pollIntervalMs:100,
    waitNow:()=>waitClock,
    sleepImpl:async()=>{
      waitClock+=100;
      if(processed)return;
      const queued=await remoteHostMailbox.listEnvelopes("worker-b");
      assert.equal(queued.length,1);
      const result=await endpoint.forward(queued[0].envelope);
      await remoteHostMailbox.writeResult(result);
      processed=true;
    }
  });

  assert.equal(verifyGitHubFederatedPeerBinding(peer,{
    repository:"operator-b/mesh-state",
    ref:"arca-runtime",
    root:"remote-mesh",
    nodeId:"worker-b",
    keyFingerprint:workerIdentity.identity.keyFingerprint
  }),true);

  const relay=new MachineBridgeMeshRelay({
    nodeId:"relay-a",
    now:()=>new Date(T2),
    receiptSigner:relayIdentity,
    requireSignedReceipts:true,
    trustStore:trustA,
    peers:[peer]
  });
  const client=new MachineBridgeMeshClient({
    originNode:"bridge-a",
    entry:relay,
    now:()=>new Date(T2),
    requireSignedReceipts:true,
    trustStore:trustA
  });

  const result=await client.call(job(),{
    requiredCapabilities:["reasoning"],
    ttlMs:60000,
    maxHops:4
  });

  assert.equal(result.result.status,"completed");
  assert.equal(result.result.output.echo,"federation-v1");
  assert.deepEqual(result.route,["relay-a","worker-b"]);
  assert.equal(apiB.dispatches.length,1);
  assert.equal(apiB.dispatches[0].client_payload.node_id,"worker-b");

  assert.equal([...apiA.store.keys()].some(path=>path.includes("federation-req-001")),false);
  assert.equal([...apiB.store.keys()].some(path=>path==="remote-mesh/queues/worker-b/federation-req-001.json"),true);
  assert.equal([...apiB.store.keys()].some(path=>path==="remote-mesh/results/federation-req-001.json"),true);

  const localState=[...apiA.store.values()].map(value=>value.text).join("\n");
  const remoteState=[...apiB.store.values()].map(value=>value.text).join("\n");
  assert.equal(localState.includes("token-a"),false);
  assert.equal(localState.includes("token-b"),false);
  assert.equal(remoteState.includes("token-a"),false);
  assert.equal(remoteState.includes("token-b"),false);
  assert.ok(apiA.auth.every(value=>value==="Bearer token-a"));
  assert.ok(apiB.auth.every(value=>value==="Bearer token-b"));
});

test("Federation V1 fails closed when the remote signer is not explicitly trusted",async()=>{
  const workerIdentity=generateMeshNodeIdentity("worker-b");
  const apiB=makeRepoApi("operator-b/mesh-state","token-b");
  const hostTrust=trust(workerIdentity.identity);
  const originTrust=new MeshIdentityTrustStore();

  const host=new GitHubMeshMailboxTransport({
    repository:apiB.repository,ref:"arca-runtime",token:apiB.token,fetchImpl:apiB.fetchImpl,
    identityPolicy:"require-trusted",trustStore:hostTrust
  });
  await host.registerSignedNode({
    nodeId:"worker-b",kind:"endpoint",capabilities:["reasoning"],heartbeatAt:T1.toISOString()
  },{signer:workerIdentity,now:T1,ttlMs:120000,clockSkewMs:0});

  const originView=new GitHubMeshMailboxTransport({
    repository:apiB.repository,ref:"arca-runtime",token:apiB.token,fetchImpl:apiB.fetchImpl,
    identityPolicy:"require-trusted",trustStore:originTrust
  });
  const resolver=new GitHubMeshFederationPeerResolver({
    mailbox:originView,trustStore:originTrust,now:()=>new Date(T2),maxAgeMs:60000,clockSkewMs:0
  });

  await assert.rejects(()=>resolver.resolve("worker-b"),/untrusted federated peer identity/);
});

test("Federation V1 rejects a trusted signed advertisement copied from a different repository domain",async()=>{
  const workerIdentity=generateMeshNodeIdentity("worker-b");
  const originTrust=trust(workerIdentity.identity);
  const foreignTrust=trust(workerIdentity.identity);
  const apiB=makeRepoApi("operator-b/mesh-state","token-b");
  const apiC=makeRepoApi("operator-c/mesh-state","token-c");

  const foreign=new GitHubMeshMailboxTransport({
    repository:apiC.repository,ref:"arca-runtime",token:apiC.token,fetchImpl:apiC.fetchImpl,
    identityPolicy:"require-trusted",trustStore:foreignTrust
  });
  await foreign.registerSignedNode({
    nodeId:"worker-b",kind:"endpoint",capabilities:["reasoning"],heartbeatAt:T1.toISOString()
  },{signer:workerIdentity,now:T1,ttlMs:120000,clockSkewMs:0});

  const foreignRecord=apiC.store.get("remote-mesh/nodes/worker-b.json");
  apiB.store.set("remote-mesh/nodes/worker-b.json",{text:foreignRecord.text,sha:"copied-sha"});

  const originView=new GitHubMeshMailboxTransport({
    repository:apiB.repository,ref:"arca-runtime",token:apiB.token,fetchImpl:apiB.fetchImpl,
    identityPolicy:"require-trusted",trustStore:originTrust
  });
  const resolver=new GitHubMeshFederationPeerResolver({
    mailbox:originView,trustStore:originTrust,now:()=>new Date(T2),maxAgeMs:60000,clockSkewMs:0
  });

  await assert.rejects(()=>resolver.resolve("worker-b"),/federated peer transport binding mismatch: repository/);
});
