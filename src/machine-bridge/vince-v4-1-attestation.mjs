import {
  createHash,
  createPublicKey,
  verify as cryptoVerify
} from "node:crypto";
import {sha256Canonical} from "./vince-v4-replit.mjs";

export const ARCA_VINCE_V41_JOB_FORMAT="arca-vince-v4.1-job";
export const ARCA_VINCE_V41_RESULT_FORMAT="arca-vince-v4.1-result";
export const ARCA_VINCE_V41_PROOF_FORMAT="arca-vince-v4.1-attestation-proof.v0.1";
export const ARCA_VINCE_V41_SIGNATURE_DOMAIN="ARCA-VINCE-V4.1-REMOTE-ATTESTATION";

const JOB_ID=/^vince-v41-[A-Za-z0-9._-]{1,96}$/;
const HASH=/^[a-f0-9]{64}$/;
const GIT_SHA=/^[a-f0-9]{40}$/;
const B64URL=/^[A-Za-z0-9_-]+$/;
const MAX_STREAM_CHARS=200_000;

function plain(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
function canonical(value){
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(plain(value))return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
  return JSON.stringify(value);
}
function sha256Bytes(bytes){return createHash("sha256").update(bytes).digest("hex")}
function boundedString(value,label){
  if(typeof value!=="string"||value.length>MAX_STREAM_CHARS)throw new Error(label);
  return value;
}
function decodeChallenge(value){
  if(typeof value!=="string"||!B64URL.test(value))throw new Error("VINCE_V41_CHALLENGE_INVALID");
  let bytes;
  try{bytes=Buffer.from(value,"base64url")}catch{throw new Error("VINCE_V41_CHALLENGE_INVALID")}
  if(bytes.length!==32||bytes.toString("base64url")!==value)throw new Error("VINCE_V41_CHALLENGE_INVALID");
  return bytes;
}
function normalizeIdentity(identity){
  if(!plain(identity))throw new Error("VINCE_V41_WORKER_IDENTITY_INVALID");
  const keys=Object.keys(identity).sort();
  const expected=["algorithm","keyFingerprint","nodeId","publicKeySpki"].sort();
  if(JSON.stringify(keys)!==JSON.stringify(expected))throw new Error("VINCE_V41_WORKER_IDENTITY_FIELDS_INVALID");
  if(typeof identity.nodeId!=="string"||!/^[A-Za-z0-9._-]{1,120}$/.test(identity.nodeId))
    throw new Error("VINCE_V41_WORKER_NODE_INVALID");
  if(identity.algorithm!=="Ed25519")throw new Error("VINCE_V41_WORKER_ALGORITHM_INVALID");
  if(typeof identity.publicKeySpki!=="string"||!identity.publicKeySpki)
    throw new Error("VINCE_V41_WORKER_PUBLIC_KEY_INVALID");
  if(typeof identity.keyFingerprint!=="string"||!HASH.test(identity.keyFingerprint))
    throw new Error("VINCE_V41_WORKER_FINGERPRINT_INVALID");
  let key;
  let der;
  try{
    der=Buffer.from(identity.publicKeySpki,"base64");
    key=createPublicKey({key:der,type:"spki",format:"der"});
  }catch{
    throw new Error("VINCE_V41_WORKER_PUBLIC_KEY_INVALID");
  }
  if(key.asymmetricKeyType!=="ed25519")throw new Error("VINCE_V41_WORKER_PUBLIC_KEY_INVALID");
  if(sha256Bytes(der)!==identity.keyFingerprint)
    throw new Error("VINCE_V41_WORKER_FINGERPRINT_MISMATCH");
  return {key,der};
}
function assertPinnedIdentity(identity,pinned){
  if(!plain(pinned))throw new Error("VINCE_V41_PINNED_IDENTITY_REQUIRED");
  for(const field of ["nodeId","keyFingerprint","publicKeySpki"]){
    if(typeof pinned[field]!=="string"||!pinned[field])throw new Error("VINCE_V41_PINNED_IDENTITY_INVALID");
  }
  if(identity.nodeId!==pinned.nodeId||
     identity.keyFingerprint!==pinned.keyFingerprint||
     identity.publicKeySpki!==pinned.publicKeySpki)
    throw new Error("VINCE_V41_WORKER_IDENTITY_NOT_PINNED");
}
function challengeSeen(ledger,challenge){
  if(!ledger||typeof ledger.has!=="function"||typeof ledger.add!=="function")
    throw new Error("VINCE_V41_CHALLENGE_LEDGER_REQUIRED");
  return ledger.has(challenge);
}

export function validateV41Request(request,{now=new Date()}={}){
  if(!plain(request)||request.format!==ARCA_VINCE_V41_JOB_FORMAT||request.protocolVersion!=="4.1")
    throw new Error("VINCE_V41_REQUEST_SCHEMA_INVALID");
  const expected=["action","challenge","expiresAt","format","jobId","protocolVersion"];
  if(JSON.stringify(Object.keys(request).sort())!==JSON.stringify(expected.sort()))
    throw new Error("VINCE_V41_REQUEST_FIELDS_INVALID");
  if(!JOB_ID.test(request.jobId))throw new Error("VINCE_V41_JOB_ID_INVALID");
  if(request.action!=="git-status")throw new Error("VINCE_V41_ACTION_NOT_ALLOWLISTED");
  decodeChallenge(request.challenge);
  const expires=Date.parse(request.expiresAt);
  if(!Number.isFinite(expires))throw new Error("VINCE_V41_EXPIRY_INVALID");
  if(expires<=new Date(now).getTime())throw new Error("VINCE_V41_REQUEST_EXPIRED");
  return Object.freeze({requestSha256:sha256Canonical(request)});
}

export function signedV41Payload(result){
  if(!plain(result))throw new Error("VINCE_V41_RESULT_SCHEMA_INVALID");
  const payload={...result};
  delete payload.signature;
  return payload;
}

export function signedV41Bytes(result){
  const payload=signedV41Payload(result);
  return Buffer.from(ARCA_VINCE_V41_SIGNATURE_DOMAIN+"\0"+canonical(payload),"utf8");
}

export function verifyV41AttestedResult({
  request,
  result,
  pinnedIdentity,
  challengeLedger,
  now=new Date()
}={}){
  const {requestSha256}=validateV41Request(request,{now});
  if(!plain(result)||result.format!==ARCA_VINCE_V41_RESULT_FORMAT||result.protocolVersion!=="4.1")
    throw new Error("VINCE_V41_RESULT_SCHEMA_INVALID");
  const expected=[
    "action","challenge","exitCode","finishedAt","format","gitBranch","gitDirty","gitHead","jobId",
    "protocolVersion","requestSha256","resultSha256","signature","startedAt","status","stderr",
    "stderrTruncated","stdout","stdoutTruncated","timedOut","workerIdentity"
  ].sort();
  if(JSON.stringify(Object.keys(result).sort())!==JSON.stringify(expected))
    throw new Error("VINCE_V41_RESULT_FIELDS_INVALID");
  if(result.jobId!==request.jobId||result.action!==request.action||result.challenge!==request.challenge)
    throw new Error("VINCE_V41_RESULT_CORRELATION_MISMATCH");
  decodeChallenge(result.challenge);
  if(challengeSeen(challengeLedger,result.challenge))
    throw new Error("VINCE_V41_CHALLENGE_REPLAY");
  if(result.requestSha256!==requestSha256)throw new Error("VINCE_V41_REQUEST_HASH_MISMATCH");
  if(typeof result.resultSha256!=="string"||!HASH.test(result.resultSha256))
    throw new Error("VINCE_V41_RESULT_HASH_INVALID");

  const base={...result};
  delete base.signature;
  delete base.resultSha256;
  if(sha256Canonical(base)!==result.resultSha256)
    throw new Error("VINCE_V41_RESULT_HASH_MISMATCH");

  const started=Date.parse(result.startedAt),finished=Date.parse(result.finishedAt);
  if(!Number.isFinite(started)||!Number.isFinite(finished)||finished<started)
    throw new Error("VINCE_V41_RESULT_TIME_INVALID");
  if(result.status!=="completed"||result.exitCode!==0)
    throw new Error("VINCE_V41_REMOTE_EXECUTION_FAILED");
  if(result.timedOut!==false)throw new Error("VINCE_V41_TIMEOUT_NOT_ACCEPTED");
  if(result.stdoutTruncated!==false||result.stderrTruncated!==false)
    throw new Error("VINCE_V41_TRUNCATED_OUTPUT_NOT_ACCEPTED");
  boundedString(result.stdout,"VINCE_V41_STDOUT_INVALID");
  boundedString(result.stderr,"VINCE_V41_STDERR_INVALID");
  if(typeof result.gitBranch!=="string"||!result.gitBranch)throw new Error("VINCE_V41_GIT_BRANCH_INVALID");
  if(typeof result.gitHead!=="string"||!GIT_SHA.test(result.gitHead))throw new Error("VINCE_V41_GIT_HEAD_INVALID");
  if(typeof result.gitDirty!=="boolean")throw new Error("VINCE_V41_GIT_DIRTY_INVALID");

  const {key}=normalizeIdentity(result.workerIdentity);
  assertPinnedIdentity(result.workerIdentity,pinnedIdentity);
  if(typeof result.signature!=="string"||!B64URL.test(result.signature))
    throw new Error("VINCE_V41_SIGNATURE_INVALID");
  let signature;
  try{signature=Buffer.from(result.signature,"base64url")}catch{throw new Error("VINCE_V41_SIGNATURE_INVALID")}
  if(!cryptoVerify(null,signedV41Bytes(result),key,signature))
    throw new Error("VINCE_V41_SIGNATURE_INVALID");

  challengeLedger.add(result.challenge);

  const proofBody={
    format:ARCA_VINCE_V41_PROOF_FORMAT,
    version:1,
    missionId:request.jobId,
    action:request.action,
    challenge:request.challenge,
    requestSha256,
    resultSha256:result.resultSha256,
    workerNodeId:result.workerIdentity.nodeId,
    workerKeyFingerprint:result.workerIdentity.keyFingerprint,
    remoteEnvironment:"replit",
    transport:"github-contents-v4.1",
    gitBranch:result.gitBranch,
    gitHead:result.gitHead,
    gitDirty:result.gitDirty,
    executionState:"ATTESTED_VERIFIED_RESULT",
    cryptographicWorkerAttestation:true,
    challengeAcceptedOnce:true,
    automaticRetryPerformed:false,
    failoverAuthorized:false,
    authorityExpanded:false,
    coreMutationPerformed:false,
    trustModified:false
  };
  return Object.freeze({...proofBody,proofSha256:sha256Canonical(proofBody)});
}
