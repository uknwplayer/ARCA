import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CapabilityRegistry} from "../packages/agent/src/capability-registry.ts";
import {classifyPrivacyRecord} from "../packages/agent/src/privacy-classification.ts";
import {
  ARCA_REASONING_PROVIDER_RESULT_FORMAT,
  ReasoningProviderRegistry,
  registerReasoningProviderCapability
} from "../packages/agent/src/reasoning-capability.ts";
import {createReasoningTransportProfile} from "../packages/agent/src/reasoning-transport-gate.ts";
import {
  DurableOpaqueReasoningProviderAdapter,
  runVerifiedDurableOpaqueReasoning,
  verifyDurableOpaqueReasoningEvidence
} from "../packages/agent/src/reasoning-durable-opaque-adapter.ts";
import {
  DurableReasoningPendingCoordinator,
  DurableReasoningPendingRuntime
} from "../packages/agent/src/reasoning-pending.ts";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";
import {
  generateMeshEncryptionRecipient
} from "../src/machine-bridge/mesh-encrypted-envelope.mjs";
import {
  MachineBridgeOpaqueRpcEndpoint
} from "../src/machine-bridge/mesh-opaque-rpc.mjs";
import {GitHubOpaqueRpcMailboxTransport} from "../src/machine-bridge/github-opaque-rpc-mailbox.mjs";
import {
  DurableOpaqueRpcRelayContinuation,
  GitHubOpaqueRpcContinuationTransport,
  processDurableOpaqueRpcEndpoint
} from "../src/machine-bridge/github-opaque-rpc-continuation.mjs";
import {
  DurableOpaqueRpcOriginClient,
  DurableOpaqueRpcPendingError
} from "../src/machine-bridge/durable-opaque-rpc-origin.mjs";

const T1=new Date("2026-09-18T00:30:00.000Z");

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
      type:"file",name:path.split("/").at(-1),path,sha:file.sha,
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
  return {signer,recipient:encryption.recipient,recipientPrivateKey:encryption.privateKey};
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

function relayRuntime(nodeId,api,trustStore,signer){
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

function opaqueTransport(){
  return createReasoningTransportProfile({
    transportId:"mesh.reasoning.durable",
    kind:"opaque-relay",
    persistence:"durable",
    relayVisibility:"metadata-only",
    encryption:"end-to-end",
    external:true,
    operator:"arca-mesh"
  });
}

function privateClassification(payloadId){
  return classifyPrivacyRecord({
    recordId:payloadId,
    subjectType:"mixed",
    sourceType:"user-provided",
    privacyClass:"restricted",
    purpose:"verified private reasoning over durable opaque RPC",
    indicators:{privateCommunication:true}
  },{classifiedAt:T1.toISOString()});
}

function providerRegistryWithAdapter(adapter,transport){
  const providers=new ReasoningProviderRegistry();
  const descriptor=providers.register({
    providerId:"reasoner.mesh.verified",
    provider:"arca-mesh-fixture",
    model:"fixture-v1",
    kind:"model",
    transport,
    timeoutMs:5000,
    maxOutputBytes:64*1024
  },adapter.send);
  return {providers,descriptor};
}

function verifiedCapabilities(descriptor){
  const capabilities=new CapabilityRegistry();
  registerReasoningProviderCapability(capabilities,descriptor,{updatedAt:T1.toISOString()});
  capabilities.recordVerification({
    participantId:descriptor.providerId,
    capabilityId:"reasoning",
    verifierId:"opaque-reasoning-test",
    passed:true,
    testedAt:T1.toISOString(),
    evidenceHash:"d".repeat(64),
    notes:"verified fixture"
  });
  return capabilities;
}

test("verified reasoning request survives all durable opaque relay restarts and Git contains ciphertext only",async()=>{
  const api=makeApi();
  const trustStore=new MeshIdentityTrustStore();
  const origin=identity("origin-a",trustStore,"originreasoningnonce001");
  const relayAIdentity=generateMeshNodeIdentity("relay-a");
  const relayBIdentity=generateMeshNodeIdentity("relay-b");
  trustStore.trust(relayAIdentity.identity);
  trustStore.trust(relayBIdentity.identity);
  const endpointIdentity=identity("reasoner-b",trustStore,"endpointreasoning001");

  const a1=relayRuntime("relay-a",api,trustStore,relayAIdentity);
  const originClient=new DurableOpaqueRpcOriginClient({
    originNode:"origin-a",
    mailbox:a1.box,
    entryRelay:a1.relay,
    nextNode:"relay-b",
    recipient:endpointIdentity.recipient,
    replyRecipient:origin.recipient,
    replyPrivateKey:origin.recipientPrivateKey,
    trustStore,
    requiredCapabilities:["reasoning"],
    now:()=>new Date(T1)
  });
  const adapter=new DurableOpaqueReasoningProviderAdapter(originClient,{expectedEndpointNode:"reasoner-b"});
  const transport=opaqueTransport();
  const firstRegistry=providerRegistryWithAdapter(adapter,transport);
  const capabilities=verifiedCapabilities(firstRegistry.descriptor);
  const request={
    requestId:"req.reasoning.durable.1",
    payloadId:"payload.reasoning.durable.1",
    instruction:"Analise o contexto privado sem persistir plaintext.",
    context:{personName:"Example Person",privateNote:"private context must remain encrypted"},
    responseFormat:"json",
    classification:privateClassification("payload.reasoning.durable.1"),
    purposeConfirmed:true,
    providerVerified:true,
    privateProcessingAuthorized:true
  };

  let firstPending;
  await assert.rejects(()=>runVerifiedDurableOpaqueReasoning({
    providerRegistry:firstRegistry.providers,
    capabilityRegistry:capabilities,
    providerId:firstRegistry.descriptor.providerId,
    transport,
    adapter,
    reasoning:request,
    options:{decidedAt:T1.toISOString()}
  }),error=>{
    assert.ok(error instanceof DurableOpaqueRpcPendingError);
    firstPending=error;
    return true;
  });
  assert.equal(firstPending.submission.state,"waiting-reply");
  assert.equal(firstPending.submission.returnedImmediately,true);

  // A second call before any downstream process starts is idempotent and does not re-encrypt.
  let secondPending;
  await assert.rejects(()=>runVerifiedDurableOpaqueReasoning({
    providerRegistry:firstRegistry.providers,
    capabilityRegistry:capabilities,
    providerId:firstRegistry.descriptor.providerId,
    transport,
    adapter,
    reasoning:request,
    options:{decidedAt:T1.toISOString()}
  }),error=>{
    assert.ok(error instanceof DurableOpaqueRpcPendingError);
    secondPending=error;
    return true;
  });
  assert.equal(secondPending.submission.idempotent,true);
  assert.equal(secondPending.submission.requestEnvelopeHash,firstPending.submission.requestEnvelopeHash);

  // Relay B begins later, after the first relay/caller can be gone.
  const b1=relayRuntime("relay-b",api,trustStore,relayBIdentity);
  const queuedB=await b1.box.listRequests("relay-b",{now:T1});
  assert.equal(queuedB.length,1);
  const handoffB=await b1.relay.forwardAndReturn(queuedB[0].packet,{
    nextNode:"reasoner-b",
    processorId:"relay-b-reasoning",
    claimQueued:true
  });
  assert.equal(handoffB.returnedImmediately,true);

  // The verified reasoning endpoint alone sees plaintext.
  const endpointBox=mailbox(api,trustStore);
  const endpointContinuations=new GitHubOpaqueRpcContinuationTransport({mailbox:endpointBox});
  const queuedEndpoint=await endpointBox.listRequests("reasoner-b",{now:T1});
  assert.equal(queuedEndpoint.length,1);
  let handlerCalls=0;
  const endpoint=new MachineBridgeOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    capabilities:["reasoning"],
    recipient:endpointIdentity.recipient,
    recipientPrivateKey:endpointIdentity.recipientPrivateKey,
    receiptSigner:endpointIdentity.signer,
    requireSignedReceipts:true,
    trustStore,
    now:()=>new Date(T1),
    handler:async reasoningRequest=>{
      handlerCalls+=1;
      assert.equal(reasoningRequest.format,"arca-reasoning-request-v1");
      assert.equal(reasoningRequest.requestId,request.requestId);
      assert.equal(reasoningRequest.context.personName,"Example Person");
      return {
        format:ARCA_REASONING_PROVIDER_RESULT_FORMAT,
        requestId:reasoningRequest.requestId,
        payloadId:reasoningRequest.payloadId,
        status:"completed",
        output:{analysis:"private model response",data:{ok:true}},
        humanReviewRequired:true,
        coreMutationPerformed:false
      };
    }
  });
  const endpointHandoff=await processDurableOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    mailbox:endpointBox,
    continuationTransport:endpointContinuations,
    endpoint,
    packet:queuedEndpoint[0].packet,
    processorId:"reasoner-process-1",
    now:T1
  });
  assert.equal(endpointHandoff.returnedImmediately,true);
  assert.equal(handlerCalls,1);

  // Every intermediary may restart before propagating the encrypted reply.
  const b2=relayRuntime("relay-b",api,trustStore,relayBIdentity);
  const replyB=await b2.relay.resumeReplyAndReturn(request.requestId,{processorId:"relay-b-reply"});
  assert.equal(replyB.destination,"relay-a");
  const a2=relayRuntime("relay-a",api,trustStore,relayAIdentity);
  const replyA=await a2.relay.resumeReplyAndReturn(request.requestId,{processorId:"relay-a-reply"});
  assert.equal(replyA.destination,"terminal");

  // Origin/Reasoning runtime also restarts and recovers from the terminal ciphertext.
  const originRestart=new DurableOpaqueRpcOriginClient({
    originNode:"origin-a",
    mailbox:mailbox(api,trustStore),
    entryRelay:a2.relay,
    nextNode:"relay-b",
    recipient:endpointIdentity.recipient,
    replyRecipient:origin.recipient,
    replyPrivateKey:origin.recipientPrivateKey,
    trustStore,
    requiredCapabilities:["reasoning"],
    now:()=>new Date(T1)
  });
  const restartedAdapter=new DurableOpaqueReasoningProviderAdapter(originRestart,{expectedEndpointNode:"reasoner-b"});
  const restartedRegistry=providerRegistryWithAdapter(restartedAdapter,transport);
  const result=await runVerifiedDurableOpaqueReasoning({
    providerRegistry:restartedRegistry.providers,
    capabilityRegistry:capabilities,
    providerId:restartedRegistry.descriptor.providerId,
    transport,
    adapter:restartedAdapter,
    reasoning:request,
    options:{decidedAt:T1.toISOString()}
  });

  assert.equal(result.format,"arca-verified-durable-opaque-reasoning-result-v1");
  assert.equal(result.requestId,request.requestId);
  assert.equal(result.reasoning.output.analysis,"private model response");
  assert.equal(result.reasoning.output.data.ok,true);
  assert.equal(result.reasoning.humanReviewRequired,true);
  assert.equal(result.reasoning.coreMutationPerformed,false);
  assert.equal(result.privacyReclassificationRequired,true);
  assert.equal(verifyDurableOpaqueReasoningEvidence(result.executionEvidence),true);
  assert.deepEqual(result.executionEvidence.route,["relay-a","relay-b","reasoner-b"]);
  assert.deepEqual(result.executionEvidence.replyRoute,["reasoner-b","relay-b","relay-a"]);
  assert.equal(result.executionEvidence.signedReceiptsVerified,true);
  assert.equal(result.executionEvidence.trustedRecipientIdentity,true);
  assert.equal(result.executionEvidence.durableContinuation,true);
  assert.equal(result.executionEvidence.ciphertextOnlyProtocol,true);

  const gitState=[...api.store.values()].map(value=>value.text).join("\n");
  assert.equal(gitState.includes("Analise o contexto privado"),false);
  assert.equal(gitState.includes("Example Person"),false);
  assert.equal(gitState.includes("private context must remain encrypted"),false);
  assert.equal(gitState.includes("private model response"),false);
});

test("verified durable opaque reasoning refuses unverified capability before encrypted submission",async()=>{
  const api=makeApi();
  const trustStore=new MeshIdentityTrustStore();
  const origin=identity("origin-unverified",trustStore,"originunverifiednonce1");
  const relayIdentity=generateMeshNodeIdentity("relay-unverified");
  trustStore.trust(relayIdentity.identity);
  const endpointIdentity=identity("reasoner-unverified",trustStore,"endpointunverified01");
  const relay=relayRuntime("relay-unverified",api,trustStore,relayIdentity);
  const originClient=new DurableOpaqueRpcOriginClient({
    originNode:"origin-unverified",
    mailbox:relay.box,
    entryRelay:relay.relay,
    nextNode:"reasoner-unverified",
    recipient:endpointIdentity.recipient,
    replyRecipient:origin.recipient,
    replyPrivateKey:origin.recipientPrivateKey,
    trustStore,
    requiredCapabilities:["reasoning"],
    now:()=>new Date(T1)
  });
  const adapter=new DurableOpaqueReasoningProviderAdapter(originClient,{expectedEndpointNode:"reasoner-unverified"});
  const transport=opaqueTransport();
  const providers=providerRegistryWithAdapter(adapter,transport);
  const capabilities=new CapabilityRegistry();
  registerReasoningProviderCapability(capabilities,providers.descriptor,{updatedAt:T1.toISOString()});

  await assert.rejects(()=>runVerifiedDurableOpaqueReasoning({
    providerRegistry:providers.providers,
    capabilityRegistry:capabilities,
    providerId:providers.descriptor.providerId,
    transport,
    adapter,
    reasoning:{
      requestId:"req.unverified",
      payloadId:"payload.unverified",
      instruction:"private",
      context:{value:"private"},
      classification:privateClassification("payload.unverified"),
      purposeConfirmed:true,
      providerVerified:true,
      privateProcessingAuthorized:true
    },
    options:{decidedAt:T1.toISOString()}
  }),/reasoning capability nao verificada/);
  assert.equal(api.store.size,0);
});

test("verified durable opaque reasoning requires explicit purpose/provider/private authorization",async()=>{
  const api=makeApi();
  const trustStore=new MeshIdentityTrustStore();
  const origin=identity("origin-policy",trustStore,"originpolicynonce0001");
  const relayIdentity=generateMeshNodeIdentity("relay-policy");
  trustStore.trust(relayIdentity.identity);
  const endpointIdentity=identity("reasoner-policy",trustStore,"endpointpolicynonce1");
  const relay=relayRuntime("relay-policy",api,trustStore,relayIdentity);
  const originClient=new DurableOpaqueRpcOriginClient({
    originNode:"origin-policy",
    mailbox:relay.box,
    entryRelay:relay.relay,
    nextNode:"reasoner-policy",
    recipient:endpointIdentity.recipient,
    replyRecipient:origin.recipient,
    replyPrivateKey:origin.recipientPrivateKey,
    trustStore,
    requiredCapabilities:["reasoning"],
    now:()=>new Date(T1)
  });
  const adapter=new DurableOpaqueReasoningProviderAdapter(originClient,{expectedEndpointNode:"reasoner-policy"});
  const transport=opaqueTransport();
  const providers=providerRegistryWithAdapter(adapter,transport);
  const capabilities=verifiedCapabilities(providers.descriptor);
  const base={
    requestId:"req.policy",
    payloadId:"payload.policy",
    instruction:"private",
    context:{},
    classification:privateClassification("payload.policy"),
    providerVerified:true,
    privateProcessingAuthorized:true
  };

  await assert.rejects(()=>runVerifiedDurableOpaqueReasoning({
    providerRegistry:providers.providers,capabilityRegistry:capabilities,
    providerId:providers.descriptor.providerId,transport,adapter,
    reasoning:{...base,purposeConfirmed:false},
    options:{decidedAt:T1.toISOString()}
  }),/purposeConfirmed/);
  await assert.rejects(()=>runVerifiedDurableOpaqueReasoning({
    providerRegistry:providers.providers,capabilityRegistry:capabilities,
    providerId:providers.descriptor.providerId,transport,adapter,
    reasoning:{...base,purposeConfirmed:true,providerVerified:false},
    options:{decidedAt:T1.toISOString()}
  }),/providerVerified/);
  await assert.rejects(()=>runVerifiedDurableOpaqueReasoning({
    providerRegistry:providers.providers,capabilityRegistry:capabilities,
    providerId:providers.descriptor.providerId,transport,adapter,
    reasoning:{...base,purposeConfirmed:true,privateProcessingAuthorized:false},
    options:{decidedAt:T1.toISOString()}
  }),/privateProcessingAuthorized/);
  assert.equal(api.store.size,0);
});


test("first-class pending reasoning wakes on terminal ciphertext and can be collected without replaying the private request",async(t)=>{
  const home=await mkdtemp(join(tmpdir(),"arca-reasoning-pending-"));
  t.after(()=>rm(home,{recursive:true,force:true}));
  const api=makeApi();
  const trustStore=new MeshIdentityTrustStore();
  const origin=identity("origin-pending",trustStore,"originpendingnonce0001");
  const relayIdentity=generateMeshNodeIdentity("relay-pending");
  trustStore.trust(relayIdentity.identity);
  const endpointIdentity=identity("reasoner-pending",trustStore,"endpointpendingnonce1");
  const relay=relayRuntime("relay-pending",api,trustStore,relayIdentity);
  const originClient=new DurableOpaqueRpcOriginClient({
    originNode:"origin-pending",
    mailbox:relay.box,
    entryRelay:relay.relay,
    nextNode:"reasoner-pending",
    recipient:endpointIdentity.recipient,
    replyRecipient:origin.recipient,
    replyPrivateKey:origin.recipientPrivateKey,
    trustStore,
    requiredCapabilities:["reasoning"],
    now:()=>new Date(T1)
  });
  const adapter=new DurableOpaqueReasoningProviderAdapter(originClient,{expectedEndpointNode:"reasoner-pending"});
  const transport=opaqueTransport();
  const providers=providerRegistryWithAdapter(adapter,transport);
  const capabilities=verifiedCapabilities(providers.descriptor);
  const coordinator=new DurableReasoningPendingCoordinator({
    home,
    providerRegistry:providers.providers,
    capabilityRegistry:capabilities,
    providerId:providers.descriptor.providerId,
    transport,
    adapter
  });
  const readyEvents=[];
  const runtime=new DurableReasoningPendingRuntime(coordinator,{
    intervalMs:1000,
    onReady:event=>readyEvents.push(event)
  });
  t.after(()=>runtime.stop());

  const request={
    requestId:"req.reasoning.pending.1",
    payloadId:"payload.reasoning.pending.1",
    instruction:"private pending instruction",
    context:{personName:"Pending Person",note:"pending plaintext must never enter durable metadata"},
    responseFormat:"json",
    classification:privateClassification("payload.reasoning.pending.1"),
    purposeConfirmed:true,
    providerVerified:true,
    privateProcessingAuthorized:true
  };
  const started=await coordinator.start(request,{decidedAt:T1.toISOString()});
  assert.equal(started.state,"awaiting-reasoning");
  assert.equal(started.requestId,request.requestId);

  const pendingRecord=await coordinator.store.get(request.requestId);
  assert.equal(pendingRecord.state,"awaiting-reasoning");
  const pendingSerialized=JSON.stringify(pendingRecord);
  assert.equal(pendingSerialized.includes("private pending instruction"),false);
  assert.equal(pendingSerialized.includes("Pending Person"),false);
  assert.equal(pendingSerialized.includes("pending plaintext must never enter durable metadata"),false);
  assert.match(pendingRecord.transportDecisionHash,/^[a-f0-9]{64}$/);
  assert.match(pendingRecord.opaqueRelayAttestationHash,/^[a-f0-9]{64}$/);

  const endpointBox=mailbox(api,trustStore);
  const endpointContinuations=new GitHubOpaqueRpcContinuationTransport({mailbox:endpointBox});
  const queued=await endpointBox.listRequests("reasoner-pending",{now:T1});
  assert.equal(queued.length,1);
  let calls=0;
  const endpoint=new MachineBridgeOpaqueRpcEndpoint({
    nodeId:"reasoner-pending",
    capabilities:["reasoning"],
    recipient:endpointIdentity.recipient,
    recipientPrivateKey:endpointIdentity.recipientPrivateKey,
    receiptSigner:endpointIdentity.signer,
    requireSignedReceipts:true,
    trustStore,
    now:()=>new Date(T1),
    handler:async reasoningRequest=>{
      calls+=1;
      assert.equal(reasoningRequest.instruction,"private pending instruction");
      return {
        format:ARCA_REASONING_PROVIDER_RESULT_FORMAT,
        requestId:reasoningRequest.requestId,
        payloadId:reasoningRequest.payloadId,
        status:"completed",
        output:{analysis:"pending private response",data:{ok:true}},
        humanReviewRequired:true,
        coreMutationPerformed:false
      };
    }
  });
  await processDurableOpaqueRpcEndpoint({
    nodeId:"reasoner-pending",
    mailbox:endpointBox,
    continuationTransport:endpointContinuations,
    endpoint,
    packet:queued[0].packet,
    processorId:"reasoner-pending-process",
    now:T1
  });
  assert.equal(calls,1);

  const relayRestart=relayRuntime("relay-pending",api,trustStore,relayIdentity);
  const resumed=await relayRestart.relay.resumeReplyAndReturn(request.requestId,{processorId:"relay-pending-reply"});
  assert.equal(resumed.destination,"terminal");

  const scan=await runtime.runOnce();
  assert.equal(scan.events.length,1);
  assert.equal(scan.events[0].requestId,request.requestId);
  assert.match(scan.events[0].idempotencyKey,/^durable-reasoning:/);
  assert.equal(readyEvents.length,1);
  let status=await coordinator.getStatus(request.requestId);
  assert.equal(status.state,"result-ready");
  assert.equal(status.readyPending,false);

  const collected=await coordinator.collect(request.requestId);
  assert.equal(collected.state,"completed");
  assert.equal(collected.result.reasoning.output.analysis,"pending private response");
  assert.equal(collected.result.humanReviewRequired,true);
  assert.equal(collected.result.coreMutationPerformed,false);
  assert.equal(collected.result.privacyReclassificationRequired,true);
  status=await coordinator.getStatus(request.requestId);
  assert.equal(status.state,"completed");

  // Neither the local pending descriptor nor the Git mailbox stores semantic plaintext.
  const localRecord=JSON.stringify(await coordinator.store.get(request.requestId));
  const gitState=[...api.store.values()].map(value=>value.text).join("\n");
  for(const plaintext of ["private pending instruction","Pending Person","pending plaintext must never enter durable metadata","pending private response"]){
    assert.equal(localRecord.includes(plaintext),false);
    assert.equal(gitState.includes(plaintext),false);
  }

  // A later collect is reconstruction from terminal ciphertext, not a second model invocation.
  const again=await coordinator.collect(request.requestId);
  assert.equal(again.result.resultHash,collected.result.resultHash);
  assert.equal(calls,1);
});
