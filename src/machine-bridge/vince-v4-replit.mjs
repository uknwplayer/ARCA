import {createHash} from "node:crypto";

export const ARCA_VINCE_V4_JOB_FORMAT="arca-vince-v4-job";
export const ARCA_VINCE_V4_RESULT_FORMAT="arca-vince-v4-result";
export const ARCA_VINCE_V4_PROOF_FORMAT="arca-vince-v4-heterogeneous-proof.v0.1";

const JOB_ID=/^vince-v4-[A-Za-z0-9._-]{1,96}$/;
const HASH=/^[a-f0-9]{64}$/;
const GIT_SHA=/^[a-f0-9]{40}$/;
const MAX_STREAM_CHARS=200_000;

function plain(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
function canonical(value){
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(plain(value))return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
  return JSON.stringify(value);
}
export function sha256Canonical(value){
  return createHash("sha256").update(Buffer.from(canonical(value),"utf8")).digest("hex");
}
export function validateV4Request(request,{now=new Date()}={}){
  if(!plain(request)||request.format!==ARCA_VINCE_V4_JOB_FORMAT||request.protocolVersion!==4)
    throw new Error("VINCE_V4_REQUEST_SCHEMA_INVALID");
  const keys=Object.keys(request).sort();
  const expected=["action","expiresAt","format","jobId","protocolVersion"];
  if(JSON.stringify(keys)!==JSON.stringify(expected))throw new Error("VINCE_V4_REQUEST_FIELDS_INVALID");
  if(!JOB_ID.test(request.jobId))throw new Error("VINCE_V4_JOB_ID_INVALID");
  if(request.action!=="git-status")throw new Error("VINCE_V4_ACTION_NOT_ALLOWLISTED");
  const expires=Date.parse(request.expiresAt);
  if(!Number.isFinite(expires))throw new Error("VINCE_V4_EXPIRY_INVALID");
  if(expires<=new Date(now).getTime())throw new Error("VINCE_V4_REQUEST_EXPIRED");
  return Object.freeze({requestSha256:sha256Canonical(request)});
}
function boundedString(value,label){
  if(typeof value!=="string"||value.length>MAX_STREAM_CHARS)throw new Error(label);
  return value;
}
export function verifyV4Result({request,result,now=new Date()}={}){
  const {requestSha256}=validateV4Request(request,{now});
  if(!plain(result)||result.format!==ARCA_VINCE_V4_RESULT_FORMAT||result.protocolVersion!==4)
    throw new Error("VINCE_V4_RESULT_SCHEMA_INVALID");
  const expectedKeys=[
    "action","exitCode","finishedAt","format","gitBranch","gitDirty","gitHead","jobId",
    "protocolVersion","requestSha256","resultSha256","startedAt","status","stderr",
    "stderrTruncated","stdout","stdoutTruncated","timedOut"
  ].sort();
  if(JSON.stringify(Object.keys(result).sort())!==JSON.stringify(expectedKeys))
    throw new Error("VINCE_V4_RESULT_FIELDS_INVALID");
  if(result.jobId!==request.jobId||result.action!==request.action)
    throw new Error("VINCE_V4_RESULT_CORRELATION_MISMATCH");
  if(result.requestSha256!==requestSha256)
    throw new Error("VINCE_V4_REQUEST_HASH_MISMATCH");
  if(!HASH.test(result.resultSha256))throw new Error("VINCE_V4_RESULT_HASH_INVALID");
  const unsigned={...result}; delete unsigned.resultSha256;
  if(sha256Canonical(unsigned)!==result.resultSha256)
    throw new Error("VINCE_V4_RESULT_HASH_MISMATCH");
  const started=Date.parse(result.startedAt),finished=Date.parse(result.finishedAt);
  if(!Number.isFinite(started)||!Number.isFinite(finished)||finished<started)
    throw new Error("VINCE_V4_RESULT_TIME_INVALID");
  if(!["completed","failed"].includes(result.status))throw new Error("VINCE_V4_RESULT_STATUS_INVALID");
  if(result.timedOut!==false)throw new Error("VINCE_V4_TIMEOUT_NOT_ACCEPTED");
  if(result.stdoutTruncated!==false||result.stderrTruncated!==false)
    throw new Error("VINCE_V4_TRUNCATED_OUTPUT_NOT_ACCEPTED");
  boundedString(result.stdout,"VINCE_V4_STDOUT_INVALID");
  boundedString(result.stderr,"VINCE_V4_STDERR_INVALID");
  if(typeof result.gitBranch!=="string"||!result.gitBranch)throw new Error("VINCE_V4_GIT_BRANCH_INVALID");
  if(typeof result.gitHead!=="string"||!GIT_SHA.test(result.gitHead))throw new Error("VINCE_V4_GIT_HEAD_INVALID");
  if(typeof result.gitDirty!=="boolean")throw new Error("VINCE_V4_GIT_DIRTY_INVALID");
  const succeeded=result.status==="completed"&&result.exitCode===0;
  if(!succeeded)throw new Error("VINCE_V4_REMOTE_EXECUTION_FAILED");

  const proofBody={
    format:ARCA_VINCE_V4_PROOF_FORMAT,
    version:1,
    missionId:request.jobId,
    action:request.action,
    requestSha256,
    resultSha256:result.resultSha256,
    remoteEnvironment:"replit",
    transport:"github-contents-v4",
    gitBranch:result.gitBranch,
    gitHead:result.gitHead,
    gitDirty:result.gitDirty,
    executionState:"VERIFIED_RESULT",
    cryptographicWorkerAttestation:false,
    networkDispatchPerformed:true,
    automaticRetryPerformed:false,
    failoverAuthorized:false,
    authorityExpanded:false,
    coreMutationPerformed:false,
    trustModified:false
  };
  return Object.freeze({...proofBody,proofSha256:sha256Canonical(proofBody)});
}
