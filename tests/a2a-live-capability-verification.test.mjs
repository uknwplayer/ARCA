import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  CapabilityRegistry,
  verifyLiveA2aCapability
} from "../packages/agent/src/index.ts";

function registerSyntheticParticipant(registry){
  return registry.registerParticipant({
    participantId:"a2a.synthetic.public-agent",
    kind:"agent",
    provider:"a2a-public",
    model:null,
    labels:{
      liveA2a:true,
      protocolProfile:"JSONRPC|1.0|SendMessage",
      sourceCardHash:"e8c9b61546ac68403b39f80c314a9b3ac9482f734292c64368733d0402adee8b"
    },
    capabilities:[{
      id:"research.discovery-plan",
      version:"1",
      input:["text/plain"],
      output:["application/json"],
      networkRequired:true,
      humanReviewRequired:true,
      riskClass:"medium"
    }]
  },{source:"synthetic-test",updatedAt:"2026-09-20T05:05:55.123Z"});
}

function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(value&&typeof value==="object"){
    const out={};
    for(const key of Object.keys(value).sort()){
      if(value[key]!==undefined)out[key]=canonicalize(value[key]);
    }
    return out;
  }
  return value;
}
function hashJson(value){
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}
function behavior(overrides={}){
  const body={
    format:"arca-a2a-live-behavior-conformance-v1",
    version:1,
    sourceOrigin:"https://agent.example",
    cardHash:"e8c9b61546ac68403b39f80c314a9b3ac9482f734292c64368733d0402adee8b",
    gateHash:"4".repeat(64),
    capabilityCandidateId:"research.discovery-plan",
    expectedObservedBehavior:"structured-opportunity-catalog",
    actualObservedBehavior:"structured-opportunity-catalog",
    observationCount:2,
    distinctResponseCount:2,
    structuralFingerprint:"1".repeat(64),
    protocolProfile:"JSONRPC|1.0|SendMessage",
    checks:{
      gatePassed:true,
      distinctResponses:true,
      expectedDataShape:true,
      stableProtocol:true,
      noPersistedRemoteText:true,
      remoteInstructionsIgnored:true
    },
    matchedItemCounts:[19,19],
    behavioralConformancePassed:true,
    evidenceClass:"live-behavioral-pre-admission",
    humanReviewRequired:true,
    candidateReadyForHumanReview:true,
    trustGranted:false,
    admissionGranted:false,
    capabilityVerificationGranted:false,
    roleConformanceGranted:false,
    runtimeBindingGranted:false,
    candidateExecutionAuthorized:false,
    ...overrides
  };
  return {...body,conformanceHash:hashJson(body)};
}

test("declared Synthetic agent capability can become verified from matching live behavior evidence",()=>{
  const registry=new CapabilityRegistry();
  registerSyntheticParticipant(registry);
  const result=verifyLiveA2aCapability({
    registry,
    participantId:"a2a.synthetic.public-agent",
    capabilityId:"research.discovery-plan",
    behaviorConformance:behavior(),
    testedAt:"2026-09-20T05:15:00.000Z"
  });

  assert.equal(result.statusBefore,"declared");
  assert.equal(result.statusAfter,"verified");
  assert.equal(result.verificationAuditValid,true);
  assert.equal(result.roleConformanceGranted,false);
  assert.equal(result.runtimeBindingGranted,false);
  assert.equal(result.candidateExecutionAuthorized,false);
  assert.equal(result.trustGranted,false);
  assert.equal(result.admissionGranted,false);
  assert.match(result.evidence.evidenceHash,/^[a-f0-9]{64}$/);
  assert.match(result.verificationRecord.recordHash,/^[a-f0-9]{64}$/);

  const passport=registry.getPassport(result.participantId);
  assert.equal(passport.capabilities[0].status,"verified");
  assert.deepEqual(
    registry.findCompatible(["research.discovery-plan"]).map(item=>item.participantId),
    ["a2a.synthetic.public-agent"]
  );
});

test("behavior evidence for another Agent Card cannot verify declared participant",()=>{
  const registry=new CapabilityRegistry();
  registerSyntheticParticipant(registry);
  const mismatched=behavior({cardHash:"f".repeat(64)});
  const body={...mismatched};delete body.conformanceHash;mismatched.conformanceHash=hashJson(body);

  assert.throws(
    ()=>verifyLiveA2aCapability({
      registry,
      participantId:"a2a.synthetic.public-agent",
      capabilityId:"research.discovery-plan",
      behaviorConformance:mismatched
    }),
    /Agent Card does not match/
  );
  assert.equal(registry.getPassport("a2a.synthetic.public-agent").capabilities[0].status,"declared");
});

test("one live observation is insufficient for capability verification",()=>{
  const registry=new CapabilityRegistry();
  registerSyntheticParticipant(registry);
  const insufficient=behavior({observationCount:1,distinctResponseCount:1});
  const body={...insufficient};delete body.conformanceHash;insufficient.conformanceHash=hashJson(body);

  assert.throws(
    ()=>verifyLiveA2aCapability({
      registry,
      participantId:"a2a.synthetic.public-agent",
      capabilityId:"research.discovery-plan",
      behaviorConformance:insufficient
    }),
    /insufficient live behavior evidence/
  );
});

test("tampered behavior conformance hash is rejected",()=>{
  const registry=new CapabilityRegistry();
  registerSyntheticParticipant(registry);
  const tampered=behavior();
  tampered.matchedItemCounts=[1,1];

  assert.throws(
    ()=>verifyLiveA2aCapability({
      registry,
      participantId:"a2a.synthetic.public-agent",
      capabilityId:"research.discovery-plan",
      behaviorConformance:tampered
    }),
    /behaviorConformance hash mismatch/
  );
});

test("verification cannot run twice without a new reverification state",()=>{
  const registry=new CapabilityRegistry();
  registerSyntheticParticipant(registry);
  const live=behavior();
  verifyLiveA2aCapability({
    registry,
    participantId:"a2a.synthetic.public-agent",
    capabilityId:"research.discovery-plan",
    behaviorConformance:live,
    testedAt:"2026-09-20T05:15:00.000Z"
  });

  assert.throws(
    ()=>verifyLiveA2aCapability({
      registry,
      participantId:"a2a.synthetic.public-agent",
      capabilityId:"research.discovery-plan",
      behaviorConformance:live,
      testedAt:"2026-09-20T05:16:00.000Z"
    }),
    /requires declared or verification-needed/
  );
});
