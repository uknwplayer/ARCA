import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign as cryptoSign} from "node:crypto";
import {ExecutionEndpointRegistry,createExecutionEndpointDescriptor} from "../src/machine-bridge/execution-endpoint.mjs";
import {buildWorkDispatchPayload,signWorkDispatchPayload,verifyWorkDispatchEnvelope,verifyWorkDispatchResult,selectWorkDispatchWorker,workDispatchPublicKeyFingerprint} from "../src/machine-bridge/work-dispatch-v1.mjs";
import {WorkMachineBridgeRemoteWorker} from "../src/machine-bridge/work-machine-bridge-remote-worker.mjs";

function job(params={echo:"PING"}){return {format:"arca-remote-job-v3",protocolVersion:3,jobId:"job-work-1",requestId:"req-work-1",action:"worker.ping",requires:[],params}}
function signerFixture(){
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  const publicKeySpki=Buffer.from(publicKey.export({type:"spki",format:"der"})).toString("base64");
  const keyFingerprint=workDispatchPublicKeyFingerprint(publicKeySpki);
  return {publicKeySpki,keyFingerprint,sign:async bytes=>cryptoSign(null,bytes,privateKey).toString("base64url")};
}
function endpointWith(resultValue=null){
  const registry=new ExecutionEndpointRegistry();
  registry.register(createExecutionEndpointDescriptor({endpointId:"chatgpt-work",capabilities:["worker.ping"],operations:{wake:true,result:true},transport:{kind:"test"}}),{
    wake:async wake=>({ok:true,wakeId:wake.wakeId}),
    result:async input=>resultValue?{found:true,result:resultValue,commentId:7,commentUrl:"https://example.test/c/7"}:{found:false,jobId:input.jobId}
  });
  return registry;
}

test("canonical Work dispatch requires an explicit trust anchor",async()=>{
  const signer=signerFixture();
  const payload=buildWorkDispatchPayload(job(),{createdAt:"2026-09-20T12:00:00Z",reply:{repository:"example/arca",pullRequest:141}});
  const envelope=await signWorkDispatchPayload(payload,{signer});
  assert.throws(()=>verifyWorkDispatchEnvelope(envelope,{now:"2026-09-20T12:01:00Z"}),/TRUST_ANCHOR_REQUIRED/);
  assert.equal(verifyWorkDispatchEnvelope(envelope,{trustedFingerprints:[signer.keyFingerprint],now:"2026-09-20T12:01:00Z"}).keyFingerprint,signer.keyFingerprint);
  assert.throws(()=>verifyWorkDispatchEnvelope(envelope,{trustedFingerprints:["sha256:"+"0".repeat(64)],now:"2026-09-20T12:01:00Z"}),/SIGNER_UNTRUSTED/);
});

test("canonical Work dispatch rejects secret-like params and non-allowlisted actions",()=>{
  assert.throws(()=>buildWorkDispatchPayload(job({apiKey:"NOPE"}),{reply:{repository:"example/arca",pullRequest:141}}),/SECRET_FIELD_FORBIDDEN/);
  const unsafe={...job(),action:"repository.check"};
  assert.throws(()=>buildWorkDispatchPayload(unsafe,{reply:{repository:"example/arca",pullRequest:141}}),/ACTION_NOT_ALLOWED/);
});

test("capability selector performs explicit preferred failover",()=>{
  const payload=buildWorkDispatchPayload(job(),{reply:{repository:"example/arca",pullRequest:141},preferredWorkerIds:["work:primary","work:standby"],allowFailover:true});
  const selected=selectWorkDispatchWorker(payload,[
    {workerId:"work:primary",status:"unavailable",capabilities:["worker.ping","work.read.github","work.comment.pr"]},
    {workerId:"work:standby",status:"available",capabilities:["worker.ping","work.read.github","work.comment.pr"]}
  ]);
  assert.equal(selected.workerId,"work:standby");
  assert.equal(selected.selectionReason,"preferred");
});

test("result must bind exact payload digest and signer fingerprint",async()=>{
  const signer=signerFixture();
  const payload=buildWorkDispatchPayload(job(),{createdAt:"2026-09-20T12:00:00Z",reply:{repository:"example/arca",pullRequest:141}});
  const envelope=await signWorkDispatchPayload(payload,{signer});
  const result={format:"arca-work-result-v1",jobId:payload.jobId,requestId:payload.requestId,workerId:"work:primary",signatureVerified:true,payloadSha256:envelope.signature.payloadSha256,keyFingerprint:envelope.signature.keyFingerprint,lifecycle:[{event:"queued"},{event:"claimed"},{event:"running"},{event:"completed"}],status:"completed",output:{echo:"PING"},safety:{mainMutated:false,merged:false,arbitraryShellExecuted:false}};
  assert.equal(verifyWorkDispatchResult(result,envelope,{allowedWorkerIds:["work:primary"],trustedFingerprints:[signer.keyFingerprint]}).correlationVerified,true);
  assert.throws(()=>verifyWorkDispatchResult({...result,payloadSha256:"0".repeat(64)},envelope,{allowedWorkerIds:["work:primary"],trustedFingerprints:[signer.keyFingerprint]}),/PAYLOAD_HASH_MISMATCH/);
});

test("remote worker dispatch persists signed job before bounded wake and never auto-replays ambiguous existing work",async()=>{
  const signer=signerFixture();let stored=null,wakes=0;
  const transport={
    getEnvelope:async()=>stored,
    publishEnvelope:async envelope=>(stored={path:"experiments/work-wakeup/jobs/job-work-1.json",envelope}, {status:"stored",path:stored.path,commitSha:"a".repeat(40)})
  };
  const registry=new ExecutionEndpointRegistry();
  registry.register(createExecutionEndpointDescriptor({endpointId:"chatgpt-work",capabilities:["worker.ping"],operations:{wake:true,result:true},transport:{kind:"test"}}),{
    wake:async()=>{wakes++;return {ok:true}},
    result:async()=>({found:false})
  });
  const worker=new WorkMachineBridgeRemoteWorker({endpointRegistry:registry,endpointId:"chatgpt-work",dispatchTransport:transport,signer,trustedFingerprints:[signer.keyFingerprint],reply:{repository:"example/arca",pullRequest:141}});
  const first=await worker.dispatch(job(),{createdAt:"2026-09-20T12:00:00Z"});
  assert.equal(first.status,"dispatched");assert.equal(wakes,1);
  const second=await worker.dispatch(job(),{createdAt:"2026-09-20T12:02:00Z"});
  assert.equal(second.status,"pending-or-ambiguous-existing");assert.equal(second.wakeSent,false);assert.equal(wakes,1);
});

test("remote worker recovers one verified terminal result without another wake",async()=>{
  const signer=signerFixture();
  const payload=buildWorkDispatchPayload(job(),{createdAt:"2026-09-20T12:00:00Z",reply:{repository:"example/arca",pullRequest:141}});
  const envelope=await signWorkDispatchPayload(payload,{signer});
  const result={format:"arca-work-result-v1",jobId:payload.jobId,requestId:payload.requestId,workerId:"work:primary",signatureVerified:true,payloadSha256:envelope.signature.payloadSha256,keyFingerprint:envelope.signature.keyFingerprint,lifecycle:[{event:"queued"},{event:"claimed"},{event:"running"},{event:"completed"}],status:"completed",output:{echo:"PING"},safety:{mainMutated:false,merged:false,arbitraryShellExecuted:false}};
  const transport={getEnvelope:async()=>({path:"x",envelope}),publishEnvelope:async()=>{throw new Error("must not republish")}};
  const registry=endpointWith(result);
  const worker=new WorkMachineBridgeRemoteWorker({endpointRegistry:registry,endpointId:"chatgpt-work",dispatchTransport:transport,signer,trustedFingerprints:[signer.keyFingerprint],reply:{repository:"example/arca",pullRequest:141}});
  const recovered=await worker.dispatch(job(),{createdAt:"2026-09-20T12:02:00Z"});
  assert.equal(recovered.status,"terminal-existing");assert.equal(recovered.wakeSent,false);assert.equal(recovered.result.status,"completed");
});


test("remote worker requires an explicit repository allowlist for repository.verify-ref",async()=>{
  const signer=signerFixture();
  const verifyJob={
    format:"arca-remote-job-v3",
    protocolVersion:3,
    jobId:"job-verify-187",
    requestId:"req-verify-187",
    action:"repository.verify-ref",
    requires:[],
    params:{repository:"example/arca",pullRequest:187,expectedHeadSha:"a".repeat(40)}
  };
  const transport={getEnvelope:async()=>null,publishEnvelope:async()=>{throw new Error("must not publish")}};
  const registry=endpointWith(null);
  const blocked=new WorkMachineBridgeRemoteWorker({
    endpointRegistry:registry,
    endpointId:"chatgpt-work",
    dispatchTransport:transport,
    signer,
    trustedFingerprints:[signer.keyFingerprint],
    reply:{repository:"example/arca",pullRequest:141},
    allowedVerificationRepositories:[]
  });
  await assert.rejects(()=>blocked.dispatch(verifyJob),/ALLOWLIST_REQUIRED/);

  const wrongRepo=new WorkMachineBridgeRemoteWorker({
    endpointRegistry:registry,
    endpointId:"chatgpt-work",
    dispatchTransport:transport,
    signer,
    trustedFingerprints:[signer.keyFingerprint],
    reply:{repository:"example/arca",pullRequest:141},
    allowedVerificationRepositories:["other/repo"]
  });
  await assert.rejects(()=>wrongRepo.dispatch(verifyJob),/REPOSITORY_NOT_ALLOWED/);
});
