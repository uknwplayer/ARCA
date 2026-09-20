import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  CapabilityRegistry,
  CreatorWorkflowProposalService,
  GuardedAutonomyWorkflowCoordinator,
  HumanReviewQueue,
  ReviewAutonomyRuntime,
  ReviewContinuationStore,
  ReviewGatedContinuation
} from "../packages/agent/src/index.ts";

class FakeMachineBridgeClient{
  constructor(){
    this.submitCalls=[];
    this.results=new Map();
    this.transport={getResult:async jobId=>this.results.has(jobId)?{result:this.results.get(jobId)}:null};
  }
  async submit(job){this.submitCalls.push(structuredClone(job));return {jobId:job.jobId,requestId:job.requestId}}
  async waitForResult(job){return {format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,status:"completed",output:{ok:true}}}
}

function verifiedRegistry(){
  const registry=new CapabilityRegistry();
  const at="2026-09-18T01:05:00.000Z";
  registry.registerParticipant({participantId:"worker.repo",kind:"worker",provider:"arca",capabilities:["node","repository"]},{updatedAt:at});
  registry.recordVerification({participantId:"worker.repo",capabilityId:"node",passed:true,testedAt:at});
  registry.recordVerification({participantId:"worker.repo",capabilityId:"repository",passed:true,testedAt:at});
  return registry;
}

async function fixture(t,{registry=verifiedRegistry()}={}){
  const home=await mkdtemp(join(tmpdir(),"arca-creator-workflow-proposal-"));
  const queue=new HumanReviewQueue(home);
  const pointerStore=new ReviewContinuationStore(home);
  const gate=new ReviewGatedContinuation(queue,{continuationStore:pointerStore});
  const client=new FakeMachineBridgeClient();
  const workflow=new GuardedAutonomyWorkflowCoordinator({home,gate,client,waitTimeoutMs:2000,pollIntervalMs:100});
  const runtime=new ReviewAutonomyRuntime(queue,[workflow.handler],{pointerStore,consumerId:"runtime:creator-workflow-test"});
  const service=new CreatorWorkflowProposalService({home,registry,workflow,reviewRuntime:runtime});
  t.after(async()=>{await runtime.stop().catch(()=>{});await rm(home,{recursive:true,force:true})});
  return {home,queue,pointerStore,gate,client,workflow,runtime,service};
}

test("Creator structured proposal compiles capability to closed recipe and registration remains inert without an approved wake",async(t)=>{
  const {service,client,workflow,runtime}=await fixture(t);
  const proposal=await service.propose({
    requestId:"req-creator-structured-1",
    objectiveId:"repository-validation",
    steps:[{stepId:"check",capabilityId:"repository",params:{}}],
    executionPolicy:{maxSubmitAttemptsPerJob:2,maxTotalSubmitAttempts:5}
  });
  assert.equal(proposal.status,"ready");
  assert.equal(proposal.plan.status,"ready");
  assert.equal(proposal.plan.steps[0].recipeId,"mb.repository.check");
  assert.deepEqual(proposal.plan.steps[0].candidateParticipantIds,["worker.repo"]);
  assert.equal(proposal.executionPolicy.maxSubmitAttemptsPerJob,2);
  assert.equal(proposal.executionPolicy.maxTotalSubmitAttempts,5);
  assert.equal(proposal.executionPolicy.deadlineAt,null);
  assert.equal(client.submitCalls.length,0);

  const registered=await service.register({
    proposalId:proposal.proposalId,
    expectedRecordHash:proposal.recordHash,
    expectedPlanHash:proposal.plan.planHash,
    confirmRegistration:true
  });
  assert.equal(registered.status,"registered");
  assert.equal(registered.registration.executionPerformed,false);
  assert.match(registered.registration.workflowDefinitionHash,/^[a-f0-9]{64}$/);
  assert.equal(client.submitCalls.length,0);

  const workflowRecord=await workflow.store.get(proposal.requestId);
  assert.equal(workflowRecord.state,"registered");
  assert.equal(workflowRecord.steps[0].recipeId,"mb.repository.check");
  const intent=await runtime.intentStore.get(proposal.requestId);
  assert.equal(intent.handlerId,"machine-bridge.workflow-v1");

  await runtime.runOnce();
  assert.equal(client.submitCalls.length,0);
});

test("Creator workflow proposal refuses execution selectors and secret-bearing structured params",async(t)=>{
  const {service}=await fixture(t);
  await assert.rejects(()=>service.propose({
    requestId:"req-selector-rejected",
    steps:[{stepId:"check",capabilityId:"repository",action:"shell.execute",params:{}}]
  }),/campo nao permitido: action/);
  await assert.rejects(()=>service.propose({
    requestId:"req-secret-rejected",
    steps:[{stepId:"check",capabilityId:"repository",params:{apiKey:"should-never-enter-plan"}}]
  }),/secrets\/credentials/);
});

test("blocked capability proposal is durable for diagnosis but cannot be registered",async(t)=>{
  const registry=new CapabilityRegistry();
  registry.registerParticipant({participantId:"worker.declared",kind:"worker",provider:"arca",capabilities:["node","repository"]},{updatedAt:"2026-09-18T01:06:00.000Z"});
  const {service}=await fixture(t,{registry});
  const proposal=await service.propose({requestId:"req-blocked-proposal",steps:[{stepId:"check",capabilityId:"repository"}]});
  assert.equal(proposal.status,"blocked");
  assert.equal(proposal.plan.steps[0].gap,"unverified");
  await assert.rejects(()=>service.register({
    proposalId:proposal.proposalId,
    expectedRecordHash:proposal.recordHash,
    expectedPlanHash:proposal.plan.planHash,
    confirmRegistration:true
  }),/nao esta ready/);
});

test("registration is hash-bound and refuses late attachment to a pre-authorized continuation",async(t)=>{
  const {service,queue,gate}=await fixture(t);
  const proposal=await service.propose({requestId:"req-late-registration",steps:[{stepId:"check",capabilityId:"repository"}]});

  await assert.rejects(()=>service.register({
    proposalId:proposal.proposalId,
    expectedRecordHash:"0".repeat(64),
    expectedPlanHash:proposal.plan.planHash,
    confirmRegistration:true
  }),/Conflito de concorrencia/);

  const review=await queue.submit({
    kind:"reasoning.output",
    title:"Existing authorization",
    summary:"Synthetic already-reviewed request.",
    priority:"high",
    source:{system:"reasoning",requestId:"req-late-registration",findingId:"reasoning-output"},
    payload:{outputHash:"1".repeat(64)},
    idempotencyKey:"pre-authorized-continuation"
  });
  await queue.resolve({
    reviewId:review.reviewId,
    reviewerId:"creator:primary",
    decision:"approve",
    reason:"approval existed before workflow registration",
    expectedRecordHash:review.recordHash
  });
  const reconciled=await gate.reconcileRequest("req-late-registration");
  assert.equal(reconciled.gate.authorizedToContinue,true);
  assert.equal(reconciled.pointer.wake.pending,true);

  await assert.rejects(()=>service.register({
    proposalId:proposal.proposalId,
    expectedRecordHash:proposal.recordHash,
    expectedPlanHash:proposal.plan.planHash,
    confirmRegistration:true
  }),/registro tardio recusado/);
});

test("proposal creation is idempotent for identical plan and execution policy",async(t)=>{
  const {service}=await fixture(t);
  const input={requestId:"req-idempotent-proposal",steps:[{stepId:"check",capabilityId:"repository"}],executionPolicy:{maxSubmitAttemptsPerJob:3,maxTotalSubmitAttempts:20}};
  const first=await service.propose(input);
  const second=await service.propose(input);
  assert.equal(first.proposalId,second.proposalId);
  assert.equal(first.recordHash,second.recordHash);
  assert.equal(first.plan.planHash,second.plan.planHash);
});
