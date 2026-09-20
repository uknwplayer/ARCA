import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  CapabilityRegistry,
  createLiveA2aAdmissionDecision,
  registerApprovedLiveA2aParticipant
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
function proposal(overrides={}){
  const body={
    format:"arca-a2a-live-admission-proposal-v1",
    version:1,
    proposalId:"a2a-admission-"+"a".repeat(16),
    proposedParticipantId:"a2a.synthetic.public-agent",
    sourceOrigin:"https://agent.example",
    sourceCardHash:"a".repeat(64),
    sourceGateHash:"b".repeat(64),
    sourceBehaviorConformanceHash:"c".repeat(64),
    proposedKind:"agent",
    proposedProvider:"a2a-public",
    proposedCapabilities:["research.discovery-plan"],
    proposedRuntimeKind:"a2a-jsonrpc-public",
    proposedProtocolProfile:"JSONRPC|1.0|SendMessage",
    evidenceClass:"live-behavioral-pre-admission",
    requestedBy:"creator",
    createdAt:"2026-09-20T05:00:00.000Z",
    status:"proposed",
    humanReviewRequired:true,
    creatorApprovalRequired:true,
    canonicalMutationRequested:false,
    registrationPerformed:false,
    capabilityVerificationGranted:false,
    roleConformanceGranted:false,
    runtimeBindingGranted:false,
    admissionGranted:false,
    trustGranted:false,
    candidateExecutionAuthorized:false,
    nodeInstallationPerformed:false,
    propagationPerformed:false,
    ...overrides
  };
  return {...body,proposalHash:hashJson(body)};
}

test("creator approval authorizes only declared registration",()=>{
  const p=proposal();
  const decision=createLiveA2aAdmissionDecision({
    proposal:p,
    decision:"approve-declared-registration",
    decidedBy:"creator",
    reason:"Approve only declared registration for controlled verification.",
    decidedAt:"2026-09-20T05:01:00.000Z"
  });
  assert.equal(decision.approved,true);
  assert.equal(decision.authorizedScope,"register-declared-only");
  assert.equal(decision.authorizesRegistration,true);
  assert.equal(decision.authorizesCapabilityVerification,false);
  assert.equal(decision.authorizesRoleConformance,false);
  assert.equal(decision.authorizesRuntimeBinding,false);
  assert.equal(decision.authorizesExecution,false);
  assert.equal(decision.grantsTrust,false);
  assert.equal(decision.grantsAdmission,false);
  assert.match(decision.decisionHash,/^[a-f0-9]{64}$/);
});

test("approved proposal registers passport as declared only",()=>{
  const registry=new CapabilityRegistry();
  const p=proposal();
  const decision=createLiveA2aAdmissionDecision({
    proposal:p,
    decision:"approve-declared-registration",
    decidedBy:"creator",
    reason:"Controlled declared-only admission.",
    decidedAt:"2026-09-20T05:01:00.000Z"
  });
  const result=registerApprovedLiveA2aParticipant({
    registry,
    proposal:p,
    decision,
    updatedAt:"2026-09-20T05:02:00.000Z"
  });
  const passport=registry.getPassport("a2a.synthetic.public-agent");
  assert.equal(result.registrationPerformed,true);
  assert.deepEqual(result.capabilityStatuses,[{id:"research.discovery-plan",status:"declared"}]);
  assert.equal(passport.capabilities[0].status,"declared");
  assert.equal(result.capabilityVerificationGranted,false);
  assert.equal(result.roleConformanceGranted,false);
  assert.equal(result.runtimeBindingGranted,false);
  assert.equal(result.candidateExecutionAuthorized,false);
  assert.equal(result.trustGranted,false);
  assert.equal(result.admissionGranted,false);
});

test("rejected proposal cannot register participant",()=>{
  const registry=new CapabilityRegistry();
  const p=proposal();
  const decision=createLiveA2aAdmissionDecision({
    proposal:p,
    decision:"reject",
    decidedBy:"creator",
    reason:"Do not admit candidate.",
    decidedAt:"2026-09-20T05:01:00.000Z"
  });
  assert.throws(
    ()=>registerApprovedLiveA2aParticipant({registry,proposal:p,decision}),
    /declared registration not approved/
  );
  assert.equal(registry.has("a2a.synthetic.public-agent"),false);
});

test("approval cannot smuggle capability verification scope",()=>{
  const p=proposal();
  const decision=createLiveA2aAdmissionDecision({
    proposal:p,
    decision:"approve-declared-registration",
    decidedBy:"creator",
    reason:"Declared registration only."
  });
  const tampered={...decision,authorizesCapabilityVerification:true};
  const body={...tampered};
  delete body.decisionHash;
  tampered.decisionHash=hashJson(body);
  const registry=new CapabilityRegistry();
  assert.throws(
    ()=>registerApprovedLiveA2aParticipant({registry,proposal:p,decision:tampered}),
    /scope exceeds declared registration/
  );
});

test("decision tied to another proposal cannot be replayed",()=>{
  const p=proposal();
  const other=proposal({proposalId:"a2a-admission-other",proposedParticipantId:"a2a.other"});
  const decision=createLiveA2aAdmissionDecision({
    proposal:other,
    decision:"approve-declared-registration",
    decidedBy:"creator",
    reason:"Other candidate."
  });
  const registry=new CapabilityRegistry();
  assert.throws(
    ()=>registerApprovedLiveA2aParticipant({registry,proposal:p,decision}),
    /does not match proposal/
  );
});
