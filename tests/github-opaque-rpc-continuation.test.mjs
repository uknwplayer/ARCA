import test from "node:test";
import assert from "node:assert/strict";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";
import {
  MeshEncryptedEnvelopeReplayGuard,
  decryptMeshPayload,
  generateMeshEncryptionRecipient
} from "../src/machine-bridge/mesh-encrypted-envelope.mjs";
import {
  MachineBridgeOpaqueRpcEndpoint,
  createOpaqueMeshRpcRequest
} from "../src/machine-bridge/mesh-opaque-rpc.mjs";
import {GitHubOpaqueRpcMailboxTransport} from "../src/machine-bridge/github-opaque-rpc-mailbox.mjs";
import {
  ARCA_OPAQUE_RPC_HANDOFF_FORMAT,
  DurableOpaqueRpcRelayContinuation,
  GitHubOpaqueRpcContinuationTransport,
  processDurableOpaqueRpcEndpoint
} from "../src/machine-bridge/github-opaque-rpc-continuation.mjs";

const T1=new Date("2026-09-18T00:05:00.000Z");

function makeApi(){
  const store=new Map();let seq=0;const dispatches=[];
  const response=(status,body)=>({
    ok:status>=200&&status<300,
    status,
    statusText:String(status),
    async text(){return body==null?"":JSON.stringify(body)}
  });
  const fetchImpl=async(url,options={})=>{
    const u=new URL(url);const method=options.method||"GET";
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
      if(current&&body.sha!==current.sha)return response(409,{message:"sha mismatch"});
      if(!current&&body.sha)return response(409,{message:"missing path"});
      const bodyText=Buffer.from(body.content,"base64").toString("utf8");
      store.set(path,{text:bodyText,sha:"sha-"+(++seq)});
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
  return {store,dispatches,fetchImpl};
}

function identity(nodeId,trustStore,nonce){
  const signer=generateMeshNodeIdentity(nodeId);
  trustStore.trust(signer.identity);
  const encryption=generateMeshEncryptionRecipient(signer,{
    issuedAt:T1,
    ttlMs:10*60*1000,
    nonce
  });
  return {
    signer,
    recipient:encryption.recipient,
    recipientPrivateKey:encryption.privateKey
  };
}

function mailbox(api,trustStore){
  return new GitHubOpaqueRpcMailboxTransport({
    repository:"owner/repo",
    ref:"main",
    token:"secret",
    fetchImpl:api.fetchImpl,
    trustStore,
    requireSignedReceipts:true,
    clockSkewMs:0
  });
}

function runtime(nodeId,api,trustStore,signer){
  const box=mailbox(api,trustStore);
  const continuations=new GitHubOpaqueRpcContinuationTransport({mailbox:box});
  const relay=new DurableOpaqueRpcRelayContinuation({
    nodeId,
    mailbox:box,
    continuationTransport:continuations,
    receiptSigner:signer,
    trustStore,
    requireSignedReceipts:true,
    now:()=>new Date(T1)
  });
  return {box,continuations,relay};
}

test("durable opaque continuation survives restart at every hop without waiting for downstream",async()=>{
  const api=makeApi();
  const trustStore=new MeshIdentityTrustStore();
  const origin=identity("origin-a",trustStore,"origincontinuationnonce01");
  const relayAIdentity=generateMeshNodeIdentity("relay-a");
  const relayBIdentity=generateMeshNodeIdentity("relay-b");
  trustStore.trust(relayAIdentity.identity);
  trustStore.trust(relayBIdentity.identity);
  const endpointIdentity=identity("reasoner-b",trustStore,"endpointcontinuation01");

  const original=createOpaqueMeshRpcRequest({
    instruction:"private continuation instruction",
    context:{personName:"Example Person",note:"never persist this plaintext"}
  },{
    requestId:"req.continuation.1",
    payloadId:"payload.continuation.1",
    originNode:"origin-a",
    recipient:endpointIdentity.recipient,
    replyRecipient:origin.recipient,
    requiredCapabilities:["reasoning"],
    maxHops:5,
    ttlMs:60_000,
    trustStore,
    now:T1,
    clockSkewMs:0
  });

  // Origin hands to a local relay. No remote queue claim exists yet.
  const a1=runtime("relay-a",api,trustStore,relayAIdentity);
  const handoffA=await a1.relay.forwardAndReturn(original,{
    nextNode:"relay-b",
    processorId:"relay-a-process-1",
    claimQueued:false
  });
  assert.equal(handoffA.format,ARCA_OPAQUE_RPC_HANDOFF_FORMAT);
  assert.equal(handoffA.state,"waiting-reply");
  assert.equal(handoffA.returnedImmediately,true);

  const persistedA=await a1.continuations.getContinuation("relay-a","req.continuation.1");
  assert.equal(persistedA.continuation.status,"waiting-reply");
  assert.equal(persistedA.continuation.downstreamNode,"relay-b");

  // Simulate relay B starting in a new process after relay A is gone.
  const b1=runtime("relay-b",api,trustStore,relayBIdentity);
  const queueB=await b1.box.listRequests("relay-b",{now:T1});
  assert.equal(queueB.length,1);
  const handoffB=await b1.relay.forwardAndReturn(queueB[0].packet,{
    nextNode:"reasoner-b",
    processorId:"relay-b-process-1",
    claimQueued:true
  });
  assert.equal(handoffB.state,"waiting-reply");
  assert.equal(handoffB.returnedImmediately,true);

  // Endpoint starts independently, decrypts, reasons, encrypts the result, then exits.
  const endpointBox=mailbox(api,trustStore);
  const endpointContinuations=new GitHubOpaqueRpcContinuationTransport({mailbox:endpointBox});
  const queueEndpoint=await endpointBox.listRequests("reasoner-b",{now:T1});
  assert.equal(queueEndpoint.length,1);
  let handlerCalls=0;
  const endpoint=new MachineBridgeOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    capabilities:["reasoning"],
    recipient:endpointIdentity.recipient,
    recipientPrivateKey:endpointIdentity.recipientPrivateKey,
    receiptSigner:endpointIdentity.signer,
    requireSignedReceipts:true,
    trustStore,
    requestReplayGuard:new MeshEncryptedEnvelopeReplayGuard({maxEntries:100}),
    now:()=>new Date(T1),
    handler:async payload=>{
      handlerCalls+=1;
      assert.equal(payload.context.personName,"Example Person");
      return {answer:"private continuation response",ok:true};
    }
  });
  const endpointHandoff=await processDurableOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    mailbox:endpointBox,
    continuationTransport:endpointContinuations,
    endpoint,
    packet:queueEndpoint[0].packet,
    processorId:"endpoint-process-1",
    now:T1
  });
  assert.equal(endpointHandoff.state,"completed");
  assert.equal(endpointHandoff.destination,"relay-b");
  assert.equal(endpointHandoff.returnedImmediately,true);
  assert.equal(handlerCalls,1);

  // Relay B restarts only after the reply wakeup.
  const b2=runtime("relay-b",api,trustStore,relayBIdentity);
  const resumeB=await b2.relay.resumeReplyAndReturn("req.continuation.1",{
    processorId:"relay-b-reply-1"
  });
  assert.equal(resumeB.state,"completed");
  assert.equal(resumeB.destination,"relay-a");
  assert.equal(resumeB.returnedImmediately,true);

  // Relay A restarts only after B has exited and completes the reverse route.
  const a2=runtime("relay-a",api,trustStore,relayAIdentity);
  const resumeA=await a2.relay.resumeReplyAndReturn("req.continuation.1",{
    processorId:"relay-a-reply-1"
  });
  assert.equal(resumeA.state,"completed");
  assert.equal(resumeA.destination,"terminal");
  assert.equal(resumeA.returnedImmediately,true);

  // Origin can be a completely new process.
  const originBox=mailbox(api,trustStore);
  const terminal=await originBox.getResult("req.continuation.1");
  assert.deepEqual(terminal.result.route,["relay-a","relay-b","reasoner-b"]);
  assert.deepEqual(terminal.result.replyRoute,["reasoner-b","relay-b","relay-a"]);
  const opened=decryptMeshPayload(terminal.result.responseEnvelope,{
    recipient:origin.recipient,
    recipientPrivateKey:origin.recipientPrivateKey,
    trustStore,
    now:T1,
    clockSkewMs:0
  });
  assert.equal(opened.payload.answer,"private continuation response");

  // Full durable store contains only ciphertext/public metadata, including continuation records.
  const gitState=[...api.store.values()].map(value=>value.text).join("\n");
  assert.equal(gitState.includes("private continuation instruction"),false);
  assert.equal(gitState.includes("Example Person"),false);
  assert.equal(gitState.includes("never persist this plaintext"),false);
  assert.equal(gitState.includes("private continuation response"),false);

  const eventTypes=api.dispatches.map(value=>value.event_type);
  assert.ok(eventTypes.includes("arca_opaque_rpc_available"));
  assert.ok(eventTypes.includes("arca_opaque_rpc_reply_available"));
});

test("completed relay continuation is idempotent under duplicate reply wakeups",async()=>{
  const api=makeApi();
  const trustStore=new MeshIdentityTrustStore();
  const origin=identity("origin-a",trustStore,"originidempotentnonce001");
  const relayIdentity=generateMeshNodeIdentity("relay-a");
  trustStore.trust(relayIdentity.identity);
  const endpointIdentity=identity("reasoner-b",trustStore,"endpointidempotent001");

  const packet=createOpaqueMeshRpcRequest({instruction:"idempotent"},{
    requestId:"req.continuation.idempotent",
    payloadId:"payload.continuation.idempotent",
    originNode:"origin-a",
    recipient:endpointIdentity.recipient,
    replyRecipient:origin.recipient,
    requiredCapabilities:["reasoning"],
    maxHops:3,
    ttlMs:60_000,
    trustStore,
    now:T1,
    clockSkewMs:0
  });
  const a=runtime("relay-a",api,trustStore,relayIdentity);
  await a.relay.forwardAndReturn(packet,{
    nextNode:"reasoner-b",
    processorId:"relay-forward",
    claimQueued:false
  });

  const endpointBox=mailbox(api,trustStore);
  const ct=new GitHubOpaqueRpcContinuationTransport({mailbox:endpointBox});
  const queued=await endpointBox.listRequests("reasoner-b",{now:T1});
  const endpoint=new MachineBridgeOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    capabilities:["reasoning"],
    recipient:endpointIdentity.recipient,
    recipientPrivateKey:endpointIdentity.recipientPrivateKey,
    receiptSigner:endpointIdentity.signer,
    requireSignedReceipts:true,
    trustStore,
    now:()=>new Date(T1),
    handler:async()=>({ok:true})
  });
  await processDurableOpaqueRpcEndpoint({
    nodeId:"reasoner-b",mailbox:endpointBox,continuationTransport:ct,endpoint,
    packet:queued[0].packet,processorId:"endpoint",now:T1
  });

  const first=await a.relay.resumeReplyAndReturn("req.continuation.idempotent",{processorId:"reply-1"});
  assert.equal(first.state,"completed");
  const second=await a.relay.resumeReplyAndReturn("req.continuation.idempotent",{processorId:"reply-2"});
  assert.equal(second.state,"completed");
  assert.equal(second.idempotent,true);
  assert.equal(second.resultHash,first.resultHash);
});

test("continuation record detects route-state tampering even though immutable packetHash is unchanged",async()=>{
  const api=makeApi();
  const trustStore=new MeshIdentityTrustStore();
  const origin=identity("origin-a",trustStore,"origintampernonce000001");
  const relayIdentity=generateMeshNodeIdentity("relay-a");
  trustStore.trust(relayIdentity.identity);
  const endpointIdentity=identity("reasoner-b",trustStore,"endpointtampernonce01");
  const packet=createOpaqueMeshRpcRequest({instruction:"tamper"},{
    requestId:"req.continuation.tamper",
    payloadId:"payload.continuation.tamper",
    originNode:"origin-a",
    recipient:endpointIdentity.recipient,
    replyRecipient:origin.recipient,
    requiredCapabilities:["reasoning"],
    ttlMs:60_000,
    trustStore,
    now:T1,
    clockSkewMs:0
  });
  const a=runtime("relay-a",api,trustStore,relayIdentity);
  await a.relay.forwardAndReturn(packet,{
    nextNode:"reasoner-b",
    processorId:"relay-forward",
    claimQueued:false
  });

  const path="remote-opaque-rpc/continuations/relay-a/req.continuation.tamper.json";
  const current=api.store.get(path);
  const value=JSON.parse(current.text);
  assert.equal(value.receivedPacket.packetHash,value.forwardedPacket.packetHash);
  value.forwardedPacket.route=["relay-x"];
  api.store.set(path,{...current,text:JSON.stringify(value)});

  await assert.rejects(()=>a.continuations.getContinuation("relay-a","req.continuation.tamper"),/forwarded packet mismatch|route\/node mismatch|continuation hash mismatch/);
});

test("reply claim lease prevents concurrent relay continuation processors",async()=>{
  const api=makeApi();
  const trustStore=new MeshIdentityTrustStore();
  const origin=identity("origin-a",trustStore,"originclaimnonce0000001");
  const relayIdentity=generateMeshNodeIdentity("relay-a");
  trustStore.trust(relayIdentity.identity);
  const endpointIdentity=identity("reasoner-b",trustStore,"endpointclaimnonce001");
  const packet=createOpaqueMeshRpcRequest({instruction:"claim"},{
    requestId:"req.continuation.claim",
    payloadId:"payload.continuation.claim",
    originNode:"origin-a",
    recipient:endpointIdentity.recipient,
    replyRecipient:origin.recipient,
    requiredCapabilities:["reasoning"],
    ttlMs:60_000,
    trustStore,
    now:T1,
    clockSkewMs:0
  });
  const a=runtime("relay-a",api,trustStore,relayIdentity);
  await a.relay.forwardAndReturn(packet,{
    nextNode:"reasoner-b",
    processorId:"relay-forward",
    claimQueued:false
  });

  const endpointBox=mailbox(api,trustStore);
  const ctEndpoint=new GitHubOpaqueRpcContinuationTransport({mailbox:endpointBox});
  const queued=await endpointBox.listRequests("reasoner-b",{now:T1});
  const endpoint=new MachineBridgeOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    capabilities:["reasoning"],
    recipient:endpointIdentity.recipient,
    recipientPrivateKey:endpointIdentity.recipientPrivateKey,
    receiptSigner:endpointIdentity.signer,
    requireSignedReceipts:true,
    trustStore,
    now:()=>new Date(T1),
    handler:async()=>({ok:true})
  });
  await processDurableOpaqueRpcEndpoint({
    nodeId:"reasoner-b",mailbox:endpointBox,continuationTransport:ctEndpoint,endpoint,
    packet:queued[0].packet,processorId:"endpoint",now:T1
  });

  const first=await a.continuations.claimReply("relay-a","req.continuation.claim","processor-a",{
    leaseMs:10_000,now:T1
  });
  assert.equal(first.attempt,1);
  const second=await a.continuations.claimReply("relay-a","req.continuation.claim","processor-b",{
    leaseMs:10_000,now:new Date("2026-09-18T00:05:05.000Z")
  });
  assert.equal(second,null);
  const third=await a.continuations.claimReply("relay-a","req.continuation.claim","processor-b",{
    leaseMs:10_000,now:new Date("2026-09-18T00:05:11.000Z")
  });
  assert.equal(third.attempt,2);
});
