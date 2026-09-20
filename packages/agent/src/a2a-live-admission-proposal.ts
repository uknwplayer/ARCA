import {createHash} from "node:crypto";

export const ARCA_A2A_LIVE_ADMISSION_PROPOSAL_FORMAT="arca-a2a-live-admission-proposal-v1";

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
function verifyHashedObject(value,hashField,label){
  if(!plain(value))throw new TypeError(label+" required");
  const expected=hash(value[hashField],label+"."+hashField);
  const body={...value};
  delete body[hashField];
  if(sha256Json(body)!==expected)throw new Error(label+" hash mismatch");
}

export function createLiveA2aAdmissionProposal({
  behaviorConformance,
  proposedParticipantId,
  requestedBy="creator",
  createdAt=new Date()
}={}){
  if(behaviorConformance?.format!=="arca-a2a-live-behavior-conformance-v1"){
    throw new TypeError("live behavior conformance required");
  }
  verifyHashedObject(behaviorConformance,"conformanceHash","behaviorConformance");
  if(behaviorConformance.behavioralConformancePassed!==true||
     behaviorConformance.candidateReadyForHumanReview!==true){
    throw new Error("behavior candidate is not ready for human review");
  }
  for(const field of [
    "trustGranted","admissionGranted","capabilityVerificationGranted",
    "roleConformanceGranted","runtimeBindingGranted","candidateExecutionAuthorized"
  ]){
    if(behaviorConformance[field]!==false){
      throw new Error("behavior conformance crossed pre-admission boundary: "+field);
    }
  }

  const participantId=String(proposedParticipantId??"").trim();
  if(!/^[A-Za-z0-9._:-]{1,120}$/.test(participantId))throw new TypeError("proposedParticipantId invalid");
  const requester=String(requestedBy??"").trim();
  if(!/^[A-Za-z0-9._:-]{1,120}$/.test(requester))throw new TypeError("requestedBy invalid");
  const timestamp=(createdAt instanceof Date?createdAt:new Date(createdAt));
  if(Number.isNaN(timestamp.getTime()))throw new TypeError("createdAt invalid");

  const body={
    format:ARCA_A2A_LIVE_ADMISSION_PROPOSAL_FORMAT,
    version:1,
    proposalId:"a2a-admission-"+behaviorConformance.cardHash.slice(0,16),
    proposedParticipantId:participantId,
    sourceOrigin:behaviorConformance.sourceOrigin,
    sourceCardHash:behaviorConformance.cardHash,
    sourceGateHash:behaviorConformance.gateHash,
    sourceBehaviorConformanceHash:behaviorConformance.conformanceHash,
    proposedKind:"agent",
    proposedProvider:"a2a-public",
    proposedCapabilities:[behaviorConformance.capabilityCandidateId],
    proposedRuntimeKind:"a2a-jsonrpc-public",
    proposedProtocolProfile:behaviorConformance.protocolProfile,
    evidenceClass:behaviorConformance.evidenceClass,
    requestedBy:requester,
    createdAt:timestamp.toISOString(),
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
    propagationPerformed:false
  };
  return Object.freeze({...body,proposalHash:sha256Json(body)});
}
