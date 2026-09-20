import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  AutonomyWorkflowCoordinator,
  DurableReasoningPendingCoordinator,
  HumanReviewQueue,
  ReasoningApprovedAutonomyBridge,
  ReviewAutonomyRuntime,
  ReviewContinuationStore,
  ReviewGatedContinuation
} from "../packages/agent/src/index.ts";

class FakeWorkflowClient{
  constructor(){
    this.results=new Map();
    this.jobs=new Map();
    this.submitCalls=[];
    this.transport={getResult:async jobId=>this.results.has(jobId)?{result:this.results.get(jobId)}:null};
  }
  async submit(job){
    this.submitCalls.push(structuredClone(job));
    if(this.jobs.has(job.jobId))throw new Error("job already exists");
    this.jobs.set(job.jobId,structuredClone(job));
    return {jobId:job.jobId,requestId:job.requestId};
  }
  async waitForResult(job){
    if(this.results.has(job.jobId))return this.results.get(job.jobId);
    const result={
      format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,
      status:"completed",output:{ok:true,echo:job.params?.echo??null}
    };
    this.results.set(job.jobId,structuredClone(result));
    return result;
  }
}

function verifiedReasoningResult(requestId,payloadId){
  return {
    state:"completed",requestId,payloadId,
    record:{privacyClass:"restricted",classificationHash:"2".repeat(64),payloadHash:"3".repeat(64)},
    result:{
      format:"arca-verified-durable-opaque-reasoning-result-v1",version:"1.0.0",
      requestId,payloadId,providerId:"reasoner.fixture",providerDescriptorHash:"1".repeat(64),
      opaqueRelayAttestationHash:"4".repeat(64),transportDecisionHash:"5".repeat(64),
      executionEvidenceHash:"6".repeat(64),resultHash:"7".repeat(64),
      humanReviewRequired:true,coreMutationPerformed:false,privacyReclassificationRequired:true,
      reasoning:{
        format:"arca-reasoning-result-v1",version:"1.0.0",requestId,payloadId,
        providerId:"reasoner.fixture",providerDescriptorHash:"1".repeat(64),
        transportId:"mesh.fixture",transportDecisionHash:"5".repeat(64),payloadHash:"3".repeat(64),
        status:"completed",responseFormat:"json",
        output:{analysis:"model suggests something, but may not choose arbitrary actions"},
        outputBytes:68,outputPersisted:false,privacyReclassificationRequired:true,
        humanReviewRequired:true,coreMutationPerformed:false
      }
    }
  };
}

function fakeReasoningCoordinator(home,requestId,payloadId){
  const coordinator=Object.create(DurableReasoningPendingCoordinator.prototype);
  coordinator.store={home};
  coordinator.start=async input=>{
    assert.equal(input.requestId,requestId);
    assert.equal(input.payloadId,payloadId);
    return {state:"awaiting-reasoning",requestId,payloadId,providerId:"reasoner.fixture",readySequence:0,readyPending:false};
  };
  coordinator.collect=async rid=>{
    assert.equal(rid,requestId);
    return verifiedReasoningResult(requestId,payloadId);
  };
  coordinator.getStatus=async rid=>({state:"completed",requestId:rid,payloadId,providerId:"reasoner.fixture",readySequence:1,readyPending:false});
  return coordinator;
}

test("approved reasoning creates one durable wake and resumes only the pre-registered closed workflow",async(t)=>{
  const home=await mkdtemp(join(tmpdir(),"arca-reasoning-autonomy-"));
  const queue=new HumanReviewQueue(home);
  const pointerStore=new ReviewContinuationStore(home);
  const gate=new ReviewGatedContinuation(queue,{continuationStore:pointerStore});
  const client=new FakeWorkflowClient();
  const workflow=new AutonomyWorkflowCoordinator({home,gate,client,waitTimeoutMs:2000,pollIntervalMs:100});
  const reviewRuntime=new ReviewAutonomyRuntime(queue,[workflow.handler],{
    pointerStore,
    consumerId:"runtime:reasoning-approved-autonomy-test",
    wakeRecoveryIntervalMs:1000,
    wakeDebounceMs:10,
    dispatchRecoveryIntervalMs:1000,
    dispatchBatchLimit:20
  });
  t.after(async()=>{await reviewRuntime.stop().catch(()=>{});await rm(home,{recursive:true,force:true})});

  const requestId="req-reasoning-approved-workflow";
  const payloadId="payload-reasoning-approved-workflow";
  const reasoning=fakeReasoningCoordinator(home,requestId,payloadId);
  const bridge=new ReasoningApprovedAutonomyBridge({reasoning,workflow,reviewRuntime});

  const registered=await bridge.register({
    reasoning:{
      requestId,payloadId,instruction:"analyze privately",context:{private:true},responseFormat:"json",
      classification:{format:"arca-privacy-classification-v1",recordId:payloadId,subjectType:"mixed",sourceType:"user-provided",privacyClass:"restricted",purpose:"test",sourceRefs:[],indicators:{},reasons:[],legalReviewState:"not-assessed",classifiedAt:"2026-09-18T00:00:00.000Z",classificationHash:"a".repeat(64)},
      purposeConfirmed:true,providerVerified:true,privateProcessingAuthorized:true
    },
    workflow:{
      requestId,
      steps:[{stepId:"after-review",recipeId:"mb.worker.ping",params:{echo:"after-approval"}}]
    }
  });
  assert.equal(registered.state,"awaiting-reasoning");
  assert.equal(client.submitCalls.length,0);

  const reviewed=await bridge.handleReady({
    format:"arca-durable-reasoning-ready-v1",
    requestId,payloadId,providerId:"reasoner.fixture",readySequence:1,
    idempotencyKey:"durable-reasoning:req-reasoning-approved-workflow:1",
    terminalResultHash:"8".repeat(64)
  });
  assert.equal(reviewed.state,"awaiting-human-review");
  assert.equal(reviewed.authorizedToContinue,false);
  assert.equal(client.submitCalls.length,0);

  const pending=(await queue.list({status:"pending"})).filter(item=>item.source?.requestId===requestId);
  assert.equal(pending.length,1);
  await queue.resolve({
    reviewId:pending[0].reviewId,
    reviewerId:"creator:primary",
    decision:"approve",
    reason:"approve the pre-registered safe continuation only",
    expectedRecordHash:pending[0].recordHash
  });

  await reviewRuntime.runOnce();
  assert.equal(client.submitCalls.length,1);
  assert.equal(client.submitCalls[0].requestId,requestId);
  assert.equal(client.submitCalls[0].action,"worker.ping");
  assert.equal(client.submitCalls[0].params.echo,"after-approval");
  assert.equal(JSON.stringify(client.submitCalls[0]).includes("model suggests something"),false);

  const workflowRecord=await workflow.store.get(requestId);
  assert.equal(workflowRecord.state,"completed");
  assert.equal(workflowRecord.cursor,1);
  const pointer=await pointerStore.get(requestId);
  assert.equal(pointer.wake.pending,false);
  assert.equal(pointer.authorizedToContinue,true);

  await reviewRuntime.runOnce();
  assert.equal(client.submitCalls.length,1);
});

test("reasoning-approved autonomy refuses requestId mismatch before registering workflow",async(t)=>{
  const home=await mkdtemp(join(tmpdir(),"arca-reasoning-autonomy-mismatch-"));
  const queue=new HumanReviewQueue(home);
  const pointerStore=new ReviewContinuationStore(home);
  const gate=new ReviewGatedContinuation(queue,{continuationStore:pointerStore});
  const client=new FakeWorkflowClient();
  const workflow=new AutonomyWorkflowCoordinator({home,gate,client,waitTimeoutMs:2000,pollIntervalMs:100});
  const reviewRuntime=new ReviewAutonomyRuntime(queue,[workflow.handler],{pointerStore,consumerId:"runtime:mismatch"});
  t.after(async()=>{await reviewRuntime.stop().catch(()=>{});await rm(home,{recursive:true,force:true})});
  const reasoning=fakeReasoningCoordinator(home,"req-a","payload-a");
  const bridge=new ReasoningApprovedAutonomyBridge({reasoning,workflow,reviewRuntime});
  await assert.rejects(()=>bridge.register({
    reasoning:{requestId:"req-a",payloadId:"payload-a"},
    workflow:{requestId:"req-b",steps:[{stepId:"s1",recipeId:"mb.worker.ping",params:{echo:"x"}}]}
  }),/requestId divergente/);
  assert.equal(await workflow.store.getIfExists("req-b"),null);
});
