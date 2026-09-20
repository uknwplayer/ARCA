import test from "node:test";
import assert from "node:assert/strict";
import {CapabilityRegistry} from "../packages/agent/src/capability-registry.ts";
import {
  ARCA_CAPABILITY_PROBE_RESULT_FORMAT,
  CapabilityProbeRegistry,
  createDefaultCapabilityProbeRegistry,
  runCapabilityProbe
} from "../packages/agent/src/capability-probes.ts";
import {
  ARCA_CAPABILITY_GAP_REPORT_FORMAT,
  ARCA_CAPABILITY_PLAN_FORMAT,
  buildCapabilityPlan,
  detectCapabilityGaps
} from "../packages/agent/src/capability-planner.ts";

const T1="2026-09-17T14:30:00.000Z";
const T2="2026-09-17T14:31:00.000Z";

test("safe conformance probe promotes only after a passing synthetic test",async()=>{
  const capabilities=new CapabilityRegistry();
  capabilities.registerParticipant({participantId:"agent.json",kind:"agent",provider:"local",model:"fixture",capabilities:["json.structured-output"]},{updatedAt:T1});
  const probes=createDefaultCapabilityProbeRegistry();
  const result=await runCapabilityProbe({
    capabilityRegistry:capabilities,
    probeRegistry:probes,
    participantId:"agent.json",
    probeId:"arca.json.structured-output.v1",
    testedAt:T2,
    execute:async request=>request.input.expected
  });
  assert.equal(result.format,ARCA_CAPABILITY_PROBE_RESULT_FORMAT);
  assert.equal(result.passed,true);
  assert.equal(result.sideEffectsPerformed,false);
  assert.equal(result.rawOutputPersisted,false);
  assert.equal(result.authorizationIncluded,false);
  assert.match(result.evidenceHash,/^[a-f0-9]{64}$/);
  assert.equal("output" in result,false);
  assert.equal(capabilities.getPassport("agent.json").capabilities[0].status,"verified");
  assert.equal(capabilities.verifyAudit("agent.json"),true);
});

test("failed conformance probe degrades capability without persisting raw output",async()=>{
  const capabilities=new CapabilityRegistry();
  capabilities.registerParticipant({participantId:"agent.bad-json",kind:"agent",provider:"local",capabilities:["json.structured-output"]},{updatedAt:T1});
  const result=await runCapabilityProbe({
    capabilityRegistry:capabilities,
    probeRegistry:createDefaultCapabilityProbeRegistry(),
    participantId:"agent.bad-json",
    probeId:"arca.json.structured-output.v1",
    testedAt:T2,
    execute:async()=>({ok:false,marker:"wrong"})
  });
  assert.equal(result.passed,false);
  assert.equal(capabilities.getPassport("agent.bad-json").capabilities[0].status,"degraded");
  assert.equal(JSON.stringify(result).includes("wrong"),false);
});

test("probe registry refuses side effects, participant network requirements and credential-like material",()=>{
  const probes=new CapabilityProbeRegistry();
  assert.throws(()=>probes.register({probeId:"bad.side-effect",capabilityId:"x",syntheticOnly:true,sideEffects:true,subjectNetworkRequired:false,input:{},assertion:{type:"boolean-true"}}),/sideEffects=false/);
  assert.throws(()=>probes.register({probeId:"bad.network",capabilityId:"x",syntheticOnly:true,sideEffects:false,subjectNetworkRequired:true,input:{},assertion:{type:"boolean-true"}}),/rede externa/);
  assert.throws(()=>probes.register({probeId:"bad.secret",capabilityId:"x",syntheticOnly:true,sideEffects:false,subjectNetworkRequired:false,input:{apiKey:"x"},assertion:{type:"boolean-true"}}),/campo sensivel/);
});

test("gap detector distinguishes verified, unverified and missing capabilities",()=>{
  const capabilities=new CapabilityRegistry();
  capabilities.registerParticipant({participantId:"agent.research",kind:"agent",provider:"a",capabilities:["research"]},{updatedAt:T1});
  capabilities.recordVerification({participantId:"agent.research",capabilityId:"research",passed:true,testedAt:T1});
  capabilities.registerParticipant({participantId:"tool.parse",kind:"tool",provider:"arca",capabilities:["document.parse"]},{updatedAt:T1});
  const report=detectCapabilityGaps(capabilities,["research","document.parse","document.ocr"],{generatedAt:T2});
  assert.equal(report.format,ARCA_CAPABILITY_GAP_REPORT_FORMAT);
  assert.equal(report.blocked,true);
  assert.deepEqual(report.available.map(item=>item.capabilityId),["research"]);
  assert.deepEqual(report.gaps.map(item=>[item.capabilityId,item.type]),[["document.ocr","missing"],["document.parse","unverified"]]);
  assert.equal(report.authorizationIncluded,false);
  assert.equal(report.executionPerformed,false);
});

test("planner creates a dependency-safe non-executing plan and exposes verification gaps",()=>{
  const capabilities=new CapabilityRegistry();
  capabilities.registerParticipant({participantId:"worker.acquire",kind:"worker",provider:"arca",capabilities:["public.acquire"]},{updatedAt:T1});
  capabilities.recordVerification({participantId:"worker.acquire",capabilityId:"public.acquire",passed:true,testedAt:T1});
  capabilities.registerParticipant({participantId:"agent.analyze",kind:"agent",provider:"local",capabilities:["document.analyze"]},{updatedAt:T1});
  const plan=buildCapabilityPlan(capabilities,{
    taskId:"task-1",
    steps:[
      {stepId:"acquire",capabilityId:"public.acquire"},
      {stepId:"analyze",capabilityId:"document.analyze",dependsOn:["acquire"]},
      {stepId:"publish",capabilityId:"report.publish",dependsOn:["analyze"]}
    ]
  },{generatedAt:T2,allowDeclaredForPlanning:true});
  assert.equal(plan.format,ARCA_CAPABILITY_PLAN_FORMAT);
  assert.equal(plan.status,"blocked");
  assert.equal(plan.steps[0].status,"ready");
  assert.equal(plan.steps[1].status,"needs-verification");
  assert.equal(plan.steps[2].status,"blocked");
  assert.deepEqual(plan.verificationNeeded,["document.analyze"]);
  assert.deepEqual(plan.missingCapabilities,["report.publish"]);
  assert.equal(plan.authorizationIncluded,false);
  assert.equal(plan.executionPerformed,false);
  assert.equal(plan.schedulerSelectionPerformed,false);
  assert.equal(plan.humanReviewRequired,true);
});

test("planner rejects dependency cycles before producing a plan",()=>{
  const capabilities=new CapabilityRegistry();
  assert.throws(()=>buildCapabilityPlan(capabilities,{steps:[
    {stepId:"a",capabilityId:"x",dependsOn:["b"]},
    {stepId:"b",capabilityId:"y",dependsOn:["a"]}
  ]}),/ciclo de dependencias/);
});
