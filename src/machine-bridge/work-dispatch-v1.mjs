import {createHash,createPublicKey,verify as cryptoVerify} from "node:crypto";
import {assertMachineBridgeJobV3} from "./protocol-v3.mjs";
import {machineBridgeJobTaskHash} from "./execution-endpoint.mjs";
import {ARCA_REPOSITORY_VERIFY_REF_ACTION,normalizeRepositoryVerifyRefParams,verifyRepositoryVerifyRefOutput} from "./repository-verify-ref.mjs";

export const ARCA_WORK_JOB_FORMAT="arca-work-job-v1";
export const ARCA_WORK_RESULT_FORMAT="arca-work-result-v1";
export const ARCA_WORK_DISPATCH_VERSION=1;
const WORK_ALLOWED_ACTIONS=new Set(["worker.ping",ARCA_REPOSITORY_VERIFY_REF_ACTION]);
export const ARCA_WORK_ALLOWED_ACTIONS=Object.freeze([...WORK_ALLOWED_ACTIONS]);

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;
const SECRET_KEY=/(authorization|bearer|token|password|secret|api[_-]?key|client[_-]?secret|private[_-]?key|cookie|credential)/i;
const MAX_PAYLOAD_BYTES=64*1024;
const MAX_TTL_MS=15*60*1000;
const TERMINAL_STATES=new Set(["completed","failed","rejected"]);

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){return JSON.parse(JSON.stringify(value))}
function text(value,label){const out=String(value??"").trim();if(!SAFE_ID.test(out))throw new Error(`ARCA_WORK_DISPATCH_${label.toUpperCase()}_INVALID`);return out}
function sha256(value){return createHash("sha256").update(Buffer.isBuffer(value)?value:String(value)).digest("hex")}
function iso(value,label){const ms=new Date(value).getTime();if(!Number.isFinite(ms))throw new Error(`ARCA_WORK_DISPATCH_${label.toUpperCase()}_INVALID`);return new Date(ms).toISOString()}
function assertNoSecrets(value,path="params"){
  if(Array.isArray(value)){value.forEach((item,index)=>assertNoSecrets(item,`${path}[${index}]`));return}
  if(!plain(value))return;
  for(const [key,item] of Object.entries(value)){
    if(SECRET_KEY.test(key))throw new Error(`ARCA_WORK_DISPATCH_SECRET_FIELD_FORBIDDEN:${path}.${key}`);
    assertNoSecrets(item,`${path}.${key}`);
  }
}
function normalizeFingerprint(value){const out=String(value??"").trim().toLowerCase();const bare=out.startsWith("sha256:")?out.slice(7):out;if(!HASH.test(bare))throw new Error("ARCA_WORK_DISPATCH_FINGERPRINT_INVALID");return "sha256:"+bare}
function normalizeTrustedFingerprints(values){
  const items=values instanceof Set?[...values]:Array.isArray(values)?values:[];
  if(items.length===0)throw new Error("ARCA_WORK_DISPATCH_TRUST_ANCHOR_REQUIRED");
  return new Set(items.map(normalizeFingerprint));
}
function lifecycleIsMonotonic(result){
  const events=Array.isArray(result?.lifecycle)?result.lifecycle.map(item=>item?.event):[];
  if(result?.status==="completed")return JSON.stringify(events)===JSON.stringify(["queued","claimed","running","completed"]);
  if(result?.status==="failed")return events[0]==="queued"&&events.at(-1)==="failed";
  if(result?.status==="rejected")return events[0]==="queued"&&events.at(-1)==="rejected";
  return false;
}

export function canonicalizeWorkDispatch(value){
  if(Array.isArray(value))return `[${value.map(canonicalizeWorkDispatch).join(",")}]`;
  if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalizeWorkDispatch(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function workDispatchPublicKeyFingerprint(publicKeySpki){
  const der=Buffer.isBuffer(publicKeySpki)?publicKeySpki:Buffer.from(String(publicKeySpki??""),"base64");
  if(!der.length)throw new Error("ARCA_WORK_DISPATCH_PUBLIC_KEY_INVALID");
  const key=createPublicKey({key:der,type:"spki",format:"der"});
  if(key.asymmetricKeyType!=="ed25519")throw new Error("ARCA_WORK_DISPATCH_ED25519_REQUIRED");
  return "sha256:"+sha256(der);
}

export function buildWorkDispatchPayload(job,{
  createdAt=new Date(),
  ttlMs=5*60*1000,
  preferredWorkerIds=["work:primary"],
  allowFailover=false,
  operationalCapabilities=["work.read.github","work.comment.pr"],
  reply,
  allowedPaths=["experiments/work-wakeup/**"]
}={}){
  assertMachineBridgeJobV3(job);
  if(!WORK_ALLOWED_ACTIONS.has(job.action))throw new Error("ARCA_WORK_DISPATCH_ACTION_NOT_ALLOWED");
  const ttl=Number(ttlMs);
  if(!Number.isSafeInteger(ttl)||ttl<10_000||ttl>MAX_TTL_MS)throw new Error("ARCA_WORK_DISPATCH_TTL_INVALID");
  const created=iso(createdAt,"created_at");
  const params=clone(job.params??{});
  assertNoSecrets(params);
  if(job.action===ARCA_REPOSITORY_VERIFY_REF_ACTION)normalizeRepositoryVerifyRefParams(params);
  const serialized=JSON.stringify(params);
  if(Buffer.byteLength(serialized)>MAX_PAYLOAD_BYTES)throw new Error("ARCA_WORK_DISPATCH_PARAMS_TOO_LARGE");
  if(!plain(reply)||typeof reply.repository!=="string"||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(reply.repository)||!Number.isSafeInteger(Number(reply.pullRequest))||Number(reply.pullRequest)<1)throw new Error("ARCA_WORK_DISPATCH_REPLY_INVALID");
  if(!Array.isArray(preferredWorkerIds)||!Array.isArray(operationalCapabilities)||!Array.isArray(allowedPaths))throw new Error("ARCA_WORK_DISPATCH_ROUTING_INVALID");
  const preferred=[...new Set(preferredWorkerIds.map(value=>text(value,"worker_id")))];
  if(preferred.length===0)throw new Error("ARCA_WORK_DISPATCH_WORKER_REQUIRED");
  const ops=[...new Set(operationalCapabilities.map(value=>text(value,"capability")))].sort();
  const paths=[...new Set(allowedPaths.map(String).map(value=>value.trim()).filter(Boolean))];
  if(paths.length===0||paths.some(value=>value.includes("..")||!value.startsWith("experiments/work-wakeup/")))throw new Error("ARCA_WORK_DISPATCH_ALLOWED_PATH_INVALID");
  const payload={
    format:ARCA_WORK_JOB_FORMAT,
    protocolVersion:ARCA_WORK_DISPATCH_VERSION,
    jobId:job.jobId,
    requestId:job.requestId??job.jobId,
    machineBridgeJobHash:machineBridgeJobTaskHash(job),
    createdAt:created,
    expiresAt:new Date(new Date(created).getTime()+ttl).toISOString(),
    action:job.action,
    requires:ops,
    params,
    target:{
      selector:"capability",
      requiredCapabilities:[job.action],
      preferredWorkerIds:preferred,
      allowFailover:allowFailover===true
    },
    reply:{transport:"github-pr-comment",repository:reply.repository,pullRequest:Number(reply.pullRequest)},
    safety:{allowShell:false,allowMerge:false,allowMainMutation:false,allowedPaths:paths}
  };
  return Object.freeze(payload);
}

export async function signWorkDispatchPayload(payload,{signer}={}){
  if(!plain(payload)||payload.format!==ARCA_WORK_JOB_FORMAT||payload.protocolVersion!==1)throw new Error("ARCA_WORK_DISPATCH_PAYLOAD_INVALID");
  if(!signer||typeof signer.sign!=="function"||typeof signer.publicKeySpki!=="string")throw new Error("ARCA_WORK_DISPATCH_SIGNER_REQUIRED");
  const fingerprint=workDispatchPublicKeyFingerprint(signer.publicKeySpki);
  if(signer.keyFingerprint!==undefined&&normalizeFingerprint(signer.keyFingerprint)!==fingerprint)throw new Error("ARCA_WORK_DISPATCH_SIGNER_FINGERPRINT_MISMATCH");
  const canonical=canonicalizeWorkDispatch(payload);
  const payloadSha256=sha256(canonical);
  const raw=await signer.sign(Buffer.from(canonical,"utf8"));
  const value=Buffer.isBuffer(raw)?raw.toString("base64url"):String(raw??"").trim();
  if(!value)throw new Error("ARCA_WORK_DISPATCH_SIGNATURE_MISSING");
  const publicKey=createPublicKey({key:Buffer.from(signer.publicKeySpki,"base64"),type:"spki",format:"der"});
  if(!cryptoVerify(null,Buffer.from(canonical),publicKey,Buffer.from(value,"base64url")))throw new Error("ARCA_WORK_DISPATCH_SIGNER_OUTPUT_INVALID");
  return Object.freeze({
    payload,
    signature:Object.freeze({
      algorithm:"Ed25519",
      canonicalization:"recursive-key-sort-json-v1",
      publicKeySpki:signer.publicKeySpki,
      keyFingerprint:fingerprint,
      payloadSha256,
      value
    })
  });
}

export function verifyWorkDispatchEnvelope(envelope,{trustedFingerprints,now=new Date()}={}){
  const trusted=normalizeTrustedFingerprints(trustedFingerprints);
  if(!plain(envelope)||!plain(envelope.payload)||!plain(envelope.signature))throw new Error("ARCA_WORK_DISPATCH_ENVELOPE_INVALID");
  const {payload,signature}=envelope;
  if(payload.format!==ARCA_WORK_JOB_FORMAT||payload.protocolVersion!==1)throw new Error("ARCA_WORK_DISPATCH_FORMAT_INVALID");
  if(!WORK_ALLOWED_ACTIONS.has(payload.action))throw new Error("ARCA_WORK_DISPATCH_ACTION_NOT_ALLOWED");
  text(payload.jobId,"job_id");text(payload.requestId,"request_id");
  if(!HASH.test(String(payload.machineBridgeJobHash??"")))throw new Error("ARCA_WORK_DISPATCH_JOB_HASH_INVALID");
  assertNoSecrets(payload.params??{});
  if(payload.action===ARCA_REPOSITORY_VERIFY_REF_ACTION)normalizeRepositoryVerifyRefParams(payload.params);
  if(!Array.isArray(payload.requires)||payload.requires.some(value=>typeof value!=="string"||!SAFE_ID.test(value)))throw new Error("ARCA_WORK_DISPATCH_REQUIRES_INVALID");
  if(payload.target?.selector!=="capability"||!Array.isArray(payload.target?.requiredCapabilities)||!Array.isArray(payload.target?.preferredWorkerIds)||payload.target.preferredWorkerIds.length===0)throw new Error("ARCA_WORK_DISPATCH_TARGET_INVALID");
  if(payload.reply?.transport!=="github-pr-comment"||typeof payload.reply?.repository!=="string"||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(payload.reply.repository)||!Number.isSafeInteger(Number(payload.reply?.pullRequest))||Number(payload.reply.pullRequest)<1)throw new Error("ARCA_WORK_DISPATCH_REPLY_INVALID");
  if(payload.safety?.allowShell!==false||payload.safety?.allowMerge!==false||payload.safety?.allowMainMutation!==false)throw new Error("ARCA_WORK_DISPATCH_SAFETY_INVALID");
  if(!Array.isArray(payload.safety?.allowedPaths)||payload.safety.allowedPaths.length===0||payload.safety.allowedPaths.some(value=>typeof value!=="string"||value.includes("..")||!value.startsWith("experiments/work-wakeup/")))throw new Error("ARCA_WORK_DISPATCH_ALLOWED_PATH_INVALID");
  const createdMs=new Date(payload.createdAt).getTime(),expiresMs=new Date(payload.expiresAt).getTime(),current=new Date(now).getTime();
  if(!Number.isFinite(createdMs)||!Number.isFinite(expiresMs)||expiresMs<=createdMs||expiresMs-createdMs>MAX_TTL_MS)throw new Error("ARCA_WORK_DISPATCH_VALIDITY_INVALID");
  if(current>=expiresMs)throw new Error("ARCA_WORK_DISPATCH_EXPIRED");
  if(signature.algorithm!=="Ed25519"||signature.canonicalization!=="recursive-key-sort-json-v1")throw new Error("ARCA_WORK_DISPATCH_SIGNATURE_METADATA_INVALID");
  const fingerprint=workDispatchPublicKeyFingerprint(signature.publicKeySpki);
  if(normalizeFingerprint(signature.keyFingerprint)!==fingerprint)throw new Error("ARCA_WORK_DISPATCH_KEY_FINGERPRINT_MISMATCH");
  if(!trusted.has(fingerprint))throw new Error("ARCA_WORK_DISPATCH_SIGNER_UNTRUSTED");
  const canonical=canonicalizeWorkDispatch(payload);
  const digest=sha256(canonical);
  if(signature.payloadSha256!==digest)throw new Error("ARCA_WORK_DISPATCH_PAYLOAD_DIGEST_MISMATCH");
  const publicKey=createPublicKey({key:Buffer.from(signature.publicKeySpki,"base64"),type:"spki",format:"der"});
  if(!cryptoVerify(null,Buffer.from(canonical),publicKey,Buffer.from(String(signature.value??""),"base64url")))throw new Error("ARCA_WORK_DISPATCH_SIGNATURE_INVALID");
  return Object.freeze({jobId:payload.jobId,requestId:payload.requestId,action:payload.action,machineBridgeJobHash:payload.machineBridgeJobHash,payloadSha256:digest,keyFingerprint:fingerprint});
}

export function selectWorkDispatchWorker(payload,workers=[]){
  if(!Array.isArray(workers))throw new Error("ARCA_WORK_DISPATCH_WORKERS_INVALID");
  const required=new Set([...(payload.requires??[]),...(payload.target?.requiredCapabilities??[])]);
  const capable=workers.filter(worker=>worker?.status==="available"&&Array.isArray(worker.capabilities)&&[...required].every(cap=>worker.capabilities.includes(cap)));
  for(const id of payload.target?.preferredWorkerIds??[]){const worker=capable.find(candidate=>candidate.workerId===id);if(worker)return Object.freeze({...worker,selectionReason:"preferred"})}
  if(payload.target?.allowFailover===true&&capable.length)return Object.freeze({...capable[0],selectionReason:"failover"});
  throw new Error("ARCA_WORK_DISPATCH_NO_CAPABLE_WORKER");
}

export function parseWorkResultComment(body){
  const textBody=String(body??"");
  if(!textBody.startsWith("ARCA-WORK-RESULT-V1"))return null;
  const raw=textBody.slice("ARCA-WORK-RESULT-V1".length).trim();
  try{const value=JSON.parse(raw);return plain(value)&&value.format===ARCA_WORK_RESULT_FORMAT?value:null}catch{return null}
}

export function verifyWorkDispatchResult(result,envelope,{allowedWorkerIds=null,trustedFingerprints}={}){
  if(!plain(result)||result.format!==ARCA_WORK_RESULT_FORMAT||!TERMINAL_STATES.has(result.status))throw new Error("ARCA_WORK_RESULT_INVALID");
  const verification=verifyWorkDispatchEnvelope(envelope,{trustedFingerprints,now:new Date(envelope.payload.createdAt)});
  if(result.jobId!==verification.jobId||result.requestId!==verification.requestId)throw new Error("ARCA_WORK_RESULT_CORRELATION_MISMATCH");
  if(result.signatureVerified!==true)throw new Error("ARCA_WORK_RESULT_INPUT_SIGNATURE_UNVERIFIED");
  if(result.payloadSha256!==verification.payloadSha256)throw new Error("ARCA_WORK_RESULT_PAYLOAD_HASH_MISMATCH");
  if(normalizeFingerprint(result.keyFingerprint)!==verification.keyFingerprint)throw new Error("ARCA_WORK_RESULT_KEY_FINGERPRINT_MISMATCH");
  if(!lifecycleIsMonotonic(result))throw new Error("ARCA_WORK_RESULT_LIFECYCLE_INVALID");
  if(result.safety?.mainMutated!==false||result.safety?.merged!==false||(result.safety?.shellExecuted!==false&&result.safety?.arbitraryShellExecuted!==false))throw new Error("ARCA_WORK_RESULT_SAFETY_INVALID");
  if(allowedWorkerIds!==null){
    const allowed=new Set(allowedWorkerIds.map(value=>text(value,"worker_id")));
    if(!allowed.has(result.workerId))throw new Error("ARCA_WORK_RESULT_WORKER_NOT_ALLOWED");
  }
  let actionEvidence=null;
  if(envelope.payload.action===ARCA_REPOSITORY_VERIFY_REF_ACTION){
    if(result.status==="completed"){
      actionEvidence=verifyRepositoryVerifyRefOutput(result.output,envelope.payload.params,{requireSuccess:true});
    }else if(result.status==="failed"){
      actionEvidence=verifyRepositoryVerifyRefOutput(result.output,envelope.payload.params,{requireSuccess:false});
      if(actionEvidence.allCommandsPassed)throw new Error("ARCA_REPOSITORY_VERIFY_REF_STATUS_MISMATCH");
    }else if(result.output!==undefined&&result.output!==null){
      verifyRepositoryVerifyRefOutput(result.output,envelope.payload.params,{requireSuccess:false});
    }
  }
  return Object.freeze({
    jobId:result.jobId,
    requestId:result.requestId,
    workerId:result.workerId,
    status:result.status,
    payloadSha256:result.payloadSha256,
    keyFingerprint:normalizeFingerprint(result.keyFingerprint),
    correlationVerified:true,
    lifecycleVerified:true,
    safetyVerified:true,
    workerIdentityCryptographicallyVerified:false,
    actionEvidence,
    output:clone(result.output??null)
  });
}
