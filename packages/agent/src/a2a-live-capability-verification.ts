import {createHash} from "node:crypto";
import {CapabilityRegistry} from "./capability-registry.ts";

export const ARCA_A2A_LIVE_CAPABILITY_VERIFICATION_EVIDENCE_FORMAT="arca-a2a-live-capability-verification-evidence-v1";
export const ARCA_A2A_LIVE_CAPABILITY_VERIFICATION_RESULT_FORMAT="arca-a2a-live-capability-verification-result-v1";

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(plain(value)){
    const out={};
    for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonicalize(value[key]);
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
function capability(passport,id){
  return (passport?.capabilities??[]).find(item=>item.id===id)??null;
}

export function verifyLiveA2aCapability({
  registry,
  participantId,
  capabilityId,
  behaviorConformance,
  testedAt=new Date(),
  verifierId="arca-live-a2a-capability-v1"
}={}){
  if(!(registry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry required");
  const participant=String(participantId??"").trim();
  const capabilityKey=String(capabilityId??"").trim().toLowerCase();
  if(!participant)throw new TypeError("participantId required");
  if(!capabilityKey)throw new TypeError("capabilityId required");

  const passportBefore=registry.getPassport(participant);
  if(!passportBefore)throw new Error("participant not registered: "+participant);
  const declared=capability(passportBefore,capabilityKey);
  if(!declared)throw new Error("participant does not declare capability: "+capabilityKey);
  if(!["declared","verification-needed"].includes(declared.status)){
    throw new Error("live verification requires declared or verification-needed capability");
  }

  if(behaviorConformance?.format!=="arca-a2a-live-behavior-conformance-v1"){
    throw new TypeError("live behavior conformance required");
  }
  verifyHashedObject(behaviorConformance,"conformanceHash","behaviorConformance");
  if(behaviorConformance.capabilityCandidateId!==capabilityKey){
    throw new Error("behavior capability does not match declared capability");
  }
  if(behaviorConformance.behavioralConformancePassed!==true||
     behaviorConformance.candidateReadyForHumanReview!==true||
     behaviorConformance.observationCount<2||
     behaviorConformance.distinctResponseCount<2){
    throw new Error("insufficient live behavior evidence");
  }
  for(const field of [
    "trustGranted","admissionGranted","capabilityVerificationGranted",
    "roleConformanceGranted","runtimeBindingGranted","candidateExecutionAuthorized"
  ]){
    if(behaviorConformance[field]!==false){
      throw new Error("behavior conformance crossed pre-verification boundary: "+field);
    }
  }
  const requiredChecks=[
    "gatePassed","distinctResponses","expectedDataShape",
    "stableProtocol","noPersistedRemoteText","remoteInstructionsIgnored"
  ];
  if(!requiredChecks.every(key=>behaviorConformance.checks?.[key]===true)){
    throw new Error("behavior conformance checks incomplete");
  }

  const sourceCardHash=passportBefore.labels?.sourceCardHash;
  if(!sourceCardHash||sourceCardHash!==behaviorConformance.cardHash){
    throw new Error("behavior evidence Agent Card does not match registered participant");
  }

  const evidenceBody={
    format:ARCA_A2A_LIVE_CAPABILITY_VERIFICATION_EVIDENCE_FORMAT,
    version:1,
    participantId:participant,
    participantDescriptorHash:passportBefore.descriptorHash,
    capabilityId:capabilityKey,
    capabilityFingerprint:declared.fingerprint,
    sourceCardHash:behaviorConformance.cardHash,
    sourceGateHash:behaviorConformance.gateHash,
    sourceBehaviorConformanceHash:behaviorConformance.conformanceHash,
    structuralFingerprint:behaviorConformance.structuralFingerprint,
    protocolProfile:behaviorConformance.protocolProfile,
    observationCount:behaviorConformance.observationCount,
    distinctResponseCount:behaviorConformance.distinctResponseCount,
    matchedItemCounts:[...(behaviorConformance.matchedItemCounts??[])],
    checks:{...behaviorConformance.checks},
    evidenceClass:"live-capability-verification",
    rawRemoteOutputPersisted:false,
    remoteInstructionsExecuted:false,
    trustGranted:false,
    admissionGranted:false,
    roleConformanceGranted:false,
    runtimeBindingGranted:false,
    candidateExecutionAuthorized:false
  };
  const evidence=Object.freeze({...evidenceBody,evidenceHash:sha256Json(evidenceBody)});

  const verification=registry.recordVerification({
    participantId:participant,
    capabilityId:capabilityKey,
    verifierId,
    passed:true,
    testedAt,
    evidenceHash:evidence.evidenceHash,
    notes:"live A2A behavioral evidence; no role/binding/trust/execution grant"
  });
  const passportAfter=registry.getPassport(participant);
  const verified=capability(passportAfter,capabilityKey);
  if(verified?.status!=="verified")throw new Error("capability did not become verified");
  if(verified.fingerprint!==declared.fingerprint){
    throw new Error("capability fingerprint changed during verification");
  }

  return Object.freeze({
    format:ARCA_A2A_LIVE_CAPABILITY_VERIFICATION_RESULT_FORMAT,
    version:1,
    participantId:participant,
    capabilityId:capabilityKey,
    capabilityFingerprint:verified.fingerprint,
    descriptorHash:passportAfter.descriptorHash,
    statusBefore:declared.status,
    statusAfter:verified.status,
    verifiedAt:verified.verifiedAt,
    evidence,
    verificationRecord:verification,
    verificationAuditValid:registry.verifyAudit(participant),
    roleConformanceGranted:false,
    runtimeBindingGranted:false,
    candidateExecutionAuthorized:false,
    trustGranted:false,
    admissionGranted:false
  });
}
