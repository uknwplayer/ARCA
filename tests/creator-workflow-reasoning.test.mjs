import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  CapabilityRegistry,
  CreatorWorkflowProposalService,
  CreatorWorkflowReasoningService,
  DurableReasoningPendingCoordinator,
  GuardedAutonomyWorkflowCoordinator,
  HumanReviewQueue,
  ReviewAutonomyRuntime,
  ReviewContinuationStore,
  ReviewGatedContinuation
} from "../packages/agent/src/index.ts";

class FakeWorkflowClient{
  constructor(){
    this.submitCalls=[];
    this.results=new Map();
    this.transport={getResult:async jobId=>this.results.has(jobId)?{result:this.results.get(jobId)}:null};
  }
  async submit(job){this.submitCalls.push(structuredClone(job));return {jobId:job.jobId,requestId:job.requestId}}
  async waitForResult(job){
    const result={format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,status:"completed",output:{ok:true}};
    this.results.set(job.jobId,structuredClone(result));return result
  }
}

function verifiedRegistry(){
  const registry=new CapabilityRegistry();const at="2026-09-18T01:30:00.000Z";
  registry.registerParticipant({participantId:"worker.repo",kind:"worker",provider:"arca",capabilities:["node","repository"]},{updatedAt:at});
  registry.recordVerification({participantId:"worker.repo",capabilityId:"node",passed:true,testedAt:at});
  registry.recordVerification({participantId:"worker.repo",capabilityId:"repository",passed:true,testedAt:at});
  return registry
}

function completedReasoning(requestId,payloadId){
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
        output:{analysis:"bound semantic analysis; it cannot select the executable action"},
        outputBytes:72,outputPersisted:false,privacyReclassificationRequired:true,
        humanReviewRequired:true,coreMutationPerformed:false
      }
    }
  }
}

function fakeReasoningCoordinator(home){
  const coordinator=Object.create(DurableReasoningPendingCoordinator.prototype);
  coordinator.providerId="reasoner.fixture";
  coordinator.providerRegistry={getDescriptor(id){return id==="reasoner.fixture"?{
    providerId:id,provider:"fixture",model:"fixture-v1",external:true,
    transportId:"mesh.fixture",transportKind:"opaque-relay",descriptorHash:"1".repeat(64)
  }:null}};
  coordinator.store={home,list:async()=>[]};
  coordinator.capturedStarts=[];
  coordinator.start=async input=>{
    coordinator.capturedStarts.push(structuredClone(input));
    return {
      format:"arca-durable-reasoning-pending-status-v1",version:"1.0.0",
      state:"awaiting-reasoning",requestId:input.requestId,payloadId:input.payloadId,
      providerId:"reasoner.fixture",readySequence:0,readyPending:false,
      terminalResultHash:null,finalResultHash:null,executionEvidenceHash:null
    }
  };
  coordinator.collect=async requestId=>{
    const start=coordinator.capturedStarts.find(item=>item.requestId===requestId);if(!start)throw new Error("reasoning start missing");
    return completedReasoning(requestId,start.payloadId)
  };
  coordinator.poll=async requestId=>{
    const start=coordinator.capturedStarts.find(item=>item.requestId===requestId);if(!start)throw new Error("reasoning start missing");
    return {state:"completed",requestId,payloadId:start.payloadId,providerId:"reasoner.fixture",readySequence:1,readyPending:false,terminalResultHash:"8".repeat(64),finalResultHash:"7".repeat(64),executionEvidenceHash:"6".repeat(64)}
  };
  coordinator.status=record=>({
    format:"arca-durable-reasoning-pending-status-v1",version:"1.0.0",
    state:record.state,requestId:record.requestId,payloadId:record.payloadId,providerId:"reasoner.fixture",
    readySequence:record.readySequence??0,readyPending:record.readyPending??false,
    terminalResultHash:record.terminalResultHash??null,finalResultHash:record.finalResultHash??null,executionEvidenceHash:record.executionEvidenceHash??null
  });
  return coordinator
}

const strongSession={
  format:"arca-creator-session-v1",sessionId:"creator-workflow-reasoning-test",subject:"creator:primary",
  scopes:["creator.chat","creator.read","creator.review","creator.propose-change"],authMethod:"webauthn",
  credentialIdHash:"9".repeat(64),issuedAt:"2026-09-18T01:00:00.000Z",expiresAt:"2026-09-18T01:45:00.000Z"
};

async function fixture(t){
  const home=await mkdtemp(join(tmpdir(),"arca-creator-workflow-reasoning-"));
  const queue=new HumanReviewQueue(home);
  const pointerStore=new ReviewContinuationStore(home);
  const gate=new ReviewGatedContinuation(queue,{continuationStore:pointerStore});
  const client=new FakeWorkflowClient();
  const workflow=new GuardedAutonomyWorkflowCoordinator({home,gate,client,waitTimeoutMs:2000,pollIntervalMs:100});
  const runtime=new ReviewAutonomyRuntime(queue,[workflow.handler],{pointerStore,consumerId:"runtime:workflow-reasoning-test",wakeRecoveryIntervalMs:1000,wakeDebounceMs:10,dispatchRecoveryIntervalMs:1000});
  const proposals=new CreatorWorkflowProposalService({home,registry:verifiedRegistry(),workflow,reviewRuntime:runtime});
  const coordinator=fakeReasoningCoordinator(home);
  const service=new CreatorWorkflowReasoningService({coordinator,proposals});
  t.after(async()=>{await runtime.stop().catch(()=>{});await rm(home,{recursive:true,force:true})});
  return {home,queue,pointerStore,gate,client,workflow,runtime,proposals,coordinator,service}
}

async function registeredProposal(proposals,requestId){
  const proposal=await proposals.propose({requestId,objectiveId:"repository-validation",steps:[{stepId:"check",capabilityId:"repository",params:{}}],executionPolicy:{maxSubmitAttemptsPerJob:2,maxTotalSubmitAttempts:4}});
  return proposals.register({proposalId:proposal.proposalId,expectedRecordHash:proposal.recordHash,expectedPlanHash:proposal.plan.planHash,confirmRegistration:true})
}

test("workflow-bound reasoning review names exact registered workflow and approval releases only that closed workflow",async(t)=>{
  const {home,queue,client,workflow,runtime,proposals,coordinator,service,pointerStore}=await fixture(t);
  const proposal=await registeredProposal(proposals,"req-bound-workflow-1");
  const privateInstruction="Analyze this privately before I decide whether to release the registered repository check.";

  const started=await service.start({
    proposalId:proposal.proposalId,expectedRecordHash:proposal.recordHash,expectedPlanHash:proposal.plan.planHash,
    message:privateInstruction,session:strongSession
  });
  assert.equal(started.state,"awaiting-reasoning");
  assert.equal(started.binding.proposalId,proposal.proposalId);
  assert.equal(started.binding.planHash,proposal.plan.planHash);
  assert.equal(started.binding.workflowDefinitionHash,proposal.registration.workflowDefinitionHash);
  assert.equal(client.submitCalls.length,0);

  const binding=await service.bindings.get(proposal.requestId);
  assert.match(binding.instructionHash,/^[a-f0-9]{64}$/);
  const rawBinding=await readFile(join(home,"creator-control","workflow-reasoning-bindings",`${proposal.requestId}.json`),"utf8");
  assert.equal(rawBinding.includes(privateInstruction),false);
  assert.equal(JSON.stringify(coordinator.capturedStarts[0].context).includes(privateInstruction),false);
  assert.equal(coordinator.capturedStarts[0].instruction,privateInstruction);

  const statusBeforeCollect=await service.status({requestId:proposal.requestId,session:strongSession});
  assert.equal(statusBeforeCollect.state,"result-ready");

  const reviewed=await service.collect({requestId:proposal.requestId,session:strongSession});
  assert.equal(reviewed.state,"awaiting-human-review");
  assert.equal(reviewed.review.authorizedToContinue,false);

  const pending=(await queue.list({status:"pending"})).filter(item=>item.source?.requestId===proposal.requestId);
  assert.equal(pending.length,1);
  const context=pending[0].payload.authorizationContext;
  assert.equal(context.kind,"registered-workflow");
  assert.equal(context.proposalId,proposal.proposalId);
  assert.equal(context.proposalHash,proposal.proposalHash);
  assert.equal(context.planHash,proposal.plan.planHash);
  assert.equal(context.workflowDefinitionHash,proposal.registration.workflowDefinitionHash);
  assert.equal(context.bindingHash,binding.bindingHash);
  assert.match(pending[0].title,/may release workflow/);

  await queue.resolve({
    reviewId:pending[0].reviewId,reviewerId:"creator:primary",decision:"approve",
    reason:"I reviewed the semantic output and the exact workflow hashes shown in the authorization context.",
    expectedRecordHash:pending[0].recordHash
  });
  await runtime.runOnce();

  assert.equal(client.submitCalls.length,1);
  assert.equal(client.submitCalls[0].requestId,proposal.requestId);
  assert.equal(client.submitCalls[0].action,"repository.check");
  const serializedJob=JSON.stringify(client.submitCalls[0]);
  assert.equal(serializedJob.includes(privateInstruction),false);
  assert.equal(serializedJob.includes("bound semantic analysis"),false);

  const workflowRecord=await workflow.store.get(proposal.requestId);
  assert.equal(workflowRecord.state,"completed");
  const pointer=await pointerStore.get(proposal.requestId);
  assert.equal(pointer.wake.pending,false);
  assert.equal(pointer.authorizedToContinue,true);

  await runtime.runOnce();
  assert.equal(client.submitCalls.length,1);
});

test("workflow reasoning refuses unregistered proposal and stale proposal hashes",async(t)=>{
  const {proposals,service}=await fixture(t);
  const proposal=await proposals.propose({requestId:"req-unregistered-reasoning",steps:[{stepId:"check",capabilityId:"repository"}]});
  await assert.rejects(()=>service.start({proposalId:proposal.proposalId,expectedRecordHash:proposal.recordHash,expectedPlanHash:proposal.plan.planHash,message:"analyze",session:strongSession}),/registered/);

  const registered=await proposals.register({proposalId:proposal.proposalId,expectedRecordHash:proposal.recordHash,expectedPlanHash:proposal.plan.planHash,confirmRegistration:true});
  await assert.rejects(()=>service.start({proposalId:registered.proposalId,expectedRecordHash:"0".repeat(64),expectedPlanHash:registered.plan.planHash,message:"analyze",session:strongSession}),/Conflito de concorrencia/);
  await assert.rejects(()=>service.start({proposalId:registered.proposalId,expectedRecordHash:registered.recordHash,expectedPlanHash:"0".repeat(64),message:"analyze",session:strongSession}),/planHash divergente/);
});

test("same requestId cannot be rebound to a different private instruction",async(t)=>{
  const {proposals,service,coordinator}=await fixture(t);
  const proposal=await registeredProposal(proposals,"req-binding-divergence");
  await service.start({proposalId:proposal.proposalId,expectedRecordHash:proposal.recordHash,expectedPlanHash:proposal.plan.planHash,message:"first private instruction",session:strongSession});
  await assert.rejects(()=>service.start({proposalId:proposal.proposalId,expectedRecordHash:proposal.recordHash,expectedPlanHash:proposal.plan.planHash,message:"different private instruction",session:strongSession}),/binding divergente/);
  assert.equal(coordinator.capturedStarts.length,1);
});

test("workflow reasoning refuses to start after any continuation pointer already exists",async(t)=>{
  const {queue,gate,proposals,service}=await fixture(t);
  const proposal=await registeredProposal(proposals,"req-pointer-exists");
  await queue.submit({
    kind:"manual.review",title:"Existing review boundary",summary:"Existing pointer before reasoning start.",priority:"normal",
    source:{system:"test",requestId:proposal.requestId,findingId:"existing"},payload:{},idempotencyKey:"existing-pointer"
  });
  const reconciled=await gate.reconcileRequest(proposal.requestId);
  assert.equal(reconciled.gate.state,"awaiting-human-review");
  assert.ok(reconciled.pointer);
  await assert.rejects(()=>service.start({proposalId:proposal.proposalId,expectedRecordHash:proposal.recordHash,expectedPlanHash:proposal.plan.planHash,message:"should not start",session:strongSession}),/continuation pointer/);
});
