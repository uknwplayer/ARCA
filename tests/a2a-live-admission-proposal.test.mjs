import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  createLiveA2aAdmissionProposal
} from "../packages/agent/src/index.ts";

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
    cardHash:"a".repeat(64),
    gateHash:"b".repeat(64),
    capabilityCandidateId:"research.discovery-plan",
    expectedObservedBehavior:"structured-opportunity-catalog",
    actualObservedBehavior:"structured-opportunity-catalog",
    observationCount:2,
    distinctResponseCount:2,
    structuralFingerprint:"c".repeat(64),
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

test("passed live behavior becomes proposal only, never admission",()=>{
  const proposal=createLiveA2aAdmissionProposal({
    behaviorConformance:behavior(),
    proposedParticipantId:"a2a.synthetic.public-agent",
    requestedBy:"creator",
    createdAt:"2026-09-20T05:00:00.000Z"
  });
  assert.equal(proposal.status,"proposed");
  assert.equal(proposal.proposedCapabilities[0],"research.discovery-plan");
  assert.equal(proposal.humanReviewRequired,true);
  assert.equal(proposal.creatorApprovalRequired,true);
  assert.equal(proposal.registrationPerformed,false);
  assert.equal(proposal.capabilityVerificationGranted,false);
  assert.equal(proposal.roleConformanceGranted,false);
  assert.equal(proposal.runtimeBindingGranted,false);
  assert.equal(proposal.admissionGranted,false);
  assert.equal(proposal.trustGranted,false);
  assert.equal(proposal.candidateExecutionAuthorized,false);
  assert.equal(proposal.nodeInstallationPerformed,false);
  assert.equal(proposal.propagationPerformed,false);
  assert.match(proposal.proposalHash,/^[a-f0-9]{64}$/);
});

test("failed behavior cannot generate admission proposal",()=>{
  const candidate=behavior({behavioralConformancePassed:false,candidateReadyForHumanReview:false});
  const body={...candidate};delete body.conformanceHash;candidate.conformanceHash=hashJson(body);
  assert.throws(
    ()=>createLiveA2aAdmissionProposal({
      behaviorConformance:candidate,
      proposedParticipantId:"a2a.synthetic.public-agent"
    }),
    /not ready for human review/
  );
});

test("proposal refuses behavior that already claims capability verification",()=>{
  const candidate=behavior({capabilityVerificationGranted:true});
  const body={...candidate};delete body.conformanceHash;candidate.conformanceHash=hashJson(body);
  assert.throws(
    ()=>createLiveA2aAdmissionProposal({
      behaviorConformance:candidate,
      proposedParticipantId:"a2a.synthetic.public-agent"
    }),
    /crossed pre-admission boundary/
  );
});

test("proposal never mutates canonical state",()=>{
  const proposal=createLiveA2aAdmissionProposal({
    behaviorConformance:behavior(),
    proposedParticipantId:"a2a.synthetic.public-agent"
  });
  assert.equal(proposal.canonicalMutationRequested,false);
  assert.equal(proposal.registrationPerformed,false);
});
