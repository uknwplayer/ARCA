import {createHash} from "node:crypto";
import {CapabilityRegistry} from "./capability-registry.ts";

export const ARCA_A2A_LIVE_ADMISSION_DECISION_FORMAT="arca-a2a-live-admission-decision-v1";

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(plain(value)){
    const out={};
    for(const key of Object.keys(value).sort()){
      if(value[key]!==undefined)out[key]=canonicalize(value[key]);
    }
    return out;
  }
  return value;
}
function sha256Json(value){
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}
function hash(value,field){
  const text=String(value??"");
  if(!/^[a-f0-9]{64}$/.test(text))throw new TypeError(field+" must be SHA-256");
  return text;
}
function verifyProposal(proposal){
  if(proposal?.format!=="arca-a2a-live-admission-proposal-v1")throw new TypeError("live admission proposal required");
  const expected=hash(proposal.proposalHash,"proposal.proposalHash");
  const body={...proposal};
  delete body.proposalHash;
  if(sha256Json(body)!==expected)throw new Error("proposal hash mismatch");
  if(proposal.status!=="proposed"||
     proposal.humanReviewRequired!==true||
     proposal.creatorApprovalRequired!==true||
     proposal.registrationPerformed!==false||
     proposal.capabilityVerificationGranted!==false||
     proposal.roleConformanceGranted!==false||
     proposal.runtimeBindingGranted!==false||
     proposal.admissionGranted!==false||
     proposal.trustGranted!==false||
     proposal.candidateExecutionAuthorized!==false){
    throw new Error("proposal is outside pre-admission state");
  }
  return proposal;
}

export function createLiveA2aAdmissionDecision({
  proposal,
  decision,
  decidedBy,
  reason,
  decidedAt=new Date()
}={}){
  const source=verifyProposal(proposal);
  const normalizedDecision=String(decision??"").trim().toLowerCase();
  if(!["approve-declared-registration","reject"].includes(normalizedDecision)){
    throw new TypeError("decision must be approve-declared-registration or reject");
  }
  const actor=String(decidedBy??"").trim();
  if(!/^[A-Za-z0-9._:-]{1,120}$/.test(actor))throw new TypeError("decidedBy invalid");
  const rationale=String(reason??"").trim();
  if(!rationale||rationale.length>500)throw new TypeError("reason required, max 500 chars");
  const when=decidedAt instanceof Date?decidedAt:new Date(decidedAt);
  if(Number.isNaN(when.getTime()))throw new TypeError("decidedAt invalid");

  const approved=normalizedDecision==="approve-declared-registration";
  const body={
    format:ARCA_A2A_LIVE_ADMISSION_DECISION_FORMAT,
    version:1,
    proposalId:source.proposalId,
    proposalHash:source.proposalHash,
    proposedParticipantId:source.proposedParticipantId,
    sourceCardHash:source.sourceCardHash,
    decision:normalizedDecision,
    decidedBy:actor,
    reason:rationale,
    decidedAt:when.toISOString(),
    approved,
    authorizedScope:approved?"register-declared-only":"none",
    authorizesRegistration:approved,
    authorizesCapabilityVerification:false,
    authorizesRoleConformance:false,
    authorizesRuntimeBinding:false,
    authorizesExecution:false,
    grantsTrust:false,
    grantsAdmission:false
  };
  return Object.freeze({...body,decisionHash:sha256Json(body)});
}

export function registerApprovedLiveA2aParticipant({
  registry,
  proposal,
  decision,
  updatedAt=new Date()
}={}){
  if(!(registry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry required");
  const source=verifyProposal(proposal);
  if(decision?.format!==ARCA_A2A_LIVE_ADMISSION_DECISION_FORMAT)throw new TypeError("admission decision required");
  const expected=hash(decision.decisionHash,"decision.decisionHash");
  const body={...decision};
  delete body.decisionHash;
  if(sha256Json(body)!==expected)throw new Error("decision hash mismatch");
  if(decision.proposalHash!==source.proposalHash||
     decision.proposedParticipantId!==source.proposedParticipantId){
    throw new Error("decision does not match proposal");
  }
  if(decision.approved!==true||
     decision.authorizedScope!=="register-declared-only"||
     decision.authorizesRegistration!==true){
    throw new Error("declared registration not approved");
  }
  if(decision.authorizesCapabilityVerification!==false||
     decision.authorizesRoleConformance!==false||
     decision.authorizesRuntimeBinding!==false||
     decision.authorizesExecution!==false||
     decision.grantsTrust!==false||
     decision.grantsAdmission!==false){
    throw new Error("decision scope exceeds declared registration");
  }

  const passport=registry.registerParticipant({
    participantId:source.proposedParticipantId,
    kind:"agent",
    provider:"a2a-public",
    labels:{
      liveA2a:true,
      sourceCardHash:source.sourceCardHash,
      admissionProposalHash:source.proposalHash,
      admissionDecisionHash:decision.decisionHash,
      protocolProfile:source.proposedProtocolProfile
    },
    capabilities:source.proposedCapabilities.map(id=>({
      id,
      version:"1",
      input:["text/plain"],
      output:["application/json"],
      networkRequired:true,
      humanReviewRequired:true,
      riskClass:"medium"
    }))
  },{
    source:"creator-approved-live-a2a",
    updatedAt
  });

  if(!passport.capabilities.every(item=>item.status==="declared")){
    throw new Error("approved live A2A registration must remain declared-only");
  }

  return Object.freeze({
    participantId:passport.participantId,
    descriptorHash:passport.descriptorHash,
    capabilityStatuses:passport.capabilities.map(item=>({id:item.id,status:item.status})),
    registrationPerformed:true,
    capabilityVerificationGranted:false,
    roleConformanceGranted:false,
    runtimeBindingGranted:false,
    candidateExecutionAuthorized:false,
    trustGranted:false,
    admissionGranted:false,
    proposalHash:source.proposalHash,
    decisionHash:decision.decisionHash
  });
}
