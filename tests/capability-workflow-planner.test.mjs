import test from "node:test";
import assert from "node:assert/strict";
import {
  CapabilityRegistry,
  CapabilityWorkflowPolicyRegistry,
  ARCA_CAPABILITY_WORKFLOW_PLAN_FORMAT,
  buildCapabilityWorkflowPlan
} from "../packages/agent/src/index.ts";

const T1="2026-09-17T22:40:00.000Z";
const T2="2026-09-17T22:41:00.000Z";

function verifiedRepositoryRegistry(){
  const registry=new CapabilityRegistry();
  registry.registerParticipant({participantId:"worker.repo",kind:"worker",provider:"arca",capabilities:["node","repository"]},{updatedAt:T1});
  registry.recordVerification({participantId:"worker.repo",capabilityId:"node",passed:true,testedAt:T1});
  registry.recordVerification({participantId:"worker.repo",capabilityId:"repository",passed:true,testedAt:T1});
  return registry;
}

test("planner compiles a verified capability into a closed workflow recipe without executing",()=>{
  const registry=verifiedRepositoryRegistry();
  const plan=buildCapabilityWorkflowPlan(registry,{requestId:"req-cap-workflow-1",objectiveId:"repository-validation",steps:[{stepId:"check",capabilityId:"repository",params:{}}]},{generatedAt:T2});
  assert.equal(plan.format,ARCA_CAPABILITY_WORKFLOW_PLAN_FORMAT);
  assert.equal(plan.status,"ready");
  assert.deepEqual(plan.blockedSteps,[]);
  assert.equal(plan.steps[0].policyId,"repository.check.v1");
  assert.equal(plan.steps[0].recipeId,"mb.repository.check");
  assert.deepEqual(plan.steps[0].requiredCapabilities,["node","repository"]);
  assert.deepEqual(plan.steps[0].candidateParticipantIds,["worker.repo"]);
  assert.deepEqual(plan.workflow,{requestId:"req-cap-workflow-1",steps:[{stepId:"check",recipeId:"mb.repository.check",params:{}}]});
  assert.match(plan.planHash,/^[a-f0-9]{64}$/);
  assert.equal(plan.authorizationIncluded,false);
  assert.equal(plan.executionPerformed,false);
  assert.equal(plan.registrationPerformed,false);
  assert.equal(plan.schedulerSelectionPerformed,false);
  assert.equal(plan.networkAuthorizationIncluded,false);
  assert.equal(plan.humanReviewRequired,true);
});

test("declared or partially verified capabilities cannot become executable workflow steps",()=>{
  const registry=new CapabilityRegistry();
  registry.registerParticipant({participantId:"worker.declared",kind:"worker",provider:"arca",capabilities:["node","repository"]},{updatedAt:T1});
  registry.recordVerification({participantId:"worker.declared",capabilityId:"repository",passed:true,testedAt:T1});
  const plan=buildCapabilityWorkflowPlan(registry,{requestId:"req-cap-unverified",steps:[{stepId:"check",capabilityId:"repository"}]},{generatedAt:T2});
  assert.equal(plan.status,"blocked");
  assert.equal(plan.workflow,null);
  assert.deepEqual(plan.blockedSteps,["check"]);
  assert.equal(plan.steps[0].gap,"unverified");
  assert.deepEqual(plan.steps[0].candidateParticipantIds,[]);
});

test("capability with no source-code policy fails closed rather than choosing an action",()=>{
  const registry=new CapabilityRegistry();
  registry.registerParticipant({participantId:"worker.network",kind:"worker",provider:"arca",capabilities:["pncp-public-network"]},{updatedAt:T1});
  registry.recordVerification({participantId:"worker.network",capabilityId:"pncp-public-network",passed:true,testedAt:T1});
  const plan=buildCapabilityWorkflowPlan(registry,{requestId:"req-cap-no-policy",steps:[{stepId:"network",capabilityId:"pncp-public-network"}]},{generatedAt:T2});
  assert.equal(plan.status,"blocked");
  assert.equal(plan.steps[0].reason,"policy-missing");
  assert.equal(plan.steps[0].recipeId,null);
  assert.equal(plan.workflow,null);
});

test("planner refuses parameter-based network escalation and secret-like material",()=>{
  const registry=new CapabilityRegistry();
  registry.registerParticipant({participantId:"worker.pncp",kind:"worker",provider:"arca",capabilities:["pncp-plan"]},{updatedAt:T1});
  registry.recordVerification({participantId:"worker.pncp",capabilityId:"pncp-plan",passed:true,testedAt:T1});
  assert.throws(()=>buildCapabilityWorkflowPlan(registry,{requestId:"req-cap-network-escalation",steps:[{stepId:"plan",capabilityId:"pncp-plan",params:{allowNetwork:true}}]}),/nao aceita network/);
  assert.throws(()=>buildCapabilityWorkflowPlan(registry,{requestId:"req-cap-secret",steps:[{stepId:"plan",capabilityId:"pncp-plan",params:{apiKey:"secret"}}]}),/secrets\/credentials/);
});

test("policy registry rejects ambiguous capability mappings and unknown recipes",()=>{
  assert.throws(()=>new CapabilityWorkflowPolicyRegistry([{policyId:"bad",capabilityId:"repository",recipeId:"mb.unknown"}]),/recipe desconhecida/);
  assert.throws(()=>new CapabilityWorkflowPolicyRegistry([
    {policyId:"one",capabilityId:"repository",recipeId:"mb.repository.check"},
    {policyId:"two",capabilityId:"repository",recipeId:"mb.repository.test"}
  ]),/mais de uma policy/);
});

test("plan hash is stable across generatedAt and participant registration ordering",()=>{
  const a=new CapabilityRegistry();
  a.registerParticipant({participantId:"worker.z",kind:"worker",provider:"arca",capabilities:["node","repository"]},{updatedAt:T1});
  a.recordVerification({participantId:"worker.z",capabilityId:"node",passed:true,testedAt:T1});a.recordVerification({participantId:"worker.z",capabilityId:"repository",passed:true,testedAt:T1});
  a.registerParticipant({participantId:"worker.a",kind:"worker",provider:"arca",capabilities:["node","repository"]},{updatedAt:T1});
  a.recordVerification({participantId:"worker.a",capabilityId:"node",passed:true,testedAt:T1});a.recordVerification({participantId:"worker.a",capabilityId:"repository",passed:true,testedAt:T1});
  const input={requestId:"req-cap-stable",objectiveId:"repository-validation",steps:[{stepId:"check",capabilityId:"repository"}]};
  const first=buildCapabilityWorkflowPlan(a,input,{generatedAt:T1});const second=buildCapabilityWorkflowPlan(a,input,{generatedAt:T2});
  assert.equal(first.planHash,second.planHash);
  assert.deepEqual(first.steps[0].candidateParticipantIds,["worker.a","worker.z"]);
});
