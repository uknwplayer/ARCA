import {createHash} from "node:crypto";
import {mkdir,open,readFile,readdir} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {
  MESH_RECONCILED_FAILOVER_RECEIPT_DOMAIN,
  verifySignedMeshReconciledFailoverReceipt
} from "./mesh-identity.mjs";

export const ARCA_EXECUTION_IDENTITY_FORMAT="arca-execution-identity-v1";
export const ARCA_EXECUTION_ATTEMPT_FORMAT="arca-execution-attempt-v1";
export const ARCA_EXECUTION_ATTEMPT_START_FORMAT="arca-execution-attempt-start-v1";
export const ARCA_EXECUTION_ATTEMPT_COMPLETION_FORMAT="arca-execution-attempt-completion-v1";
export const ARCA_EXECUTION_FAILOVER_AUTHORIZATION_FORMAT="arca-execution-failover-authorization-v1";
export const ARCA_EXECUTION_REPLACEMENT_PREPARATION_FORMAT="arca-execution-replacement-preparation-v1";
export const ARCA_EXECUTION_DISPATCH_GATE_FORMAT="arca-execution-dispatch-gate-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;
const IDEMPOTENCY_CLASSES=new Set([
  "unknown",
  "read-only",
  "pure-compute",
  "synthetic",
  "no-side-effect",
  "external-idempotent",
  "side-effecting"
]);
const MAX_RECORD_BYTES=48*1024;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:JSON.stringify(stableValue(value))).digest("hex")}
function safeId(value,label){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);return value}
function safeHash(value,label){if(typeof value!=="string"||!HASH.test(value))throw new Error("invalid "+label);return value}
function safeTime(value,label){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error("invalid "+label);
  return date.toISOString();
}
function normalizeIdempotencyClass(value){
  const normalized=String(value??"unknown").trim().toLowerCase();
  if(!IDEMPOTENCY_CLASSES.has(normalized))throw new Error("invalid execution idempotencyClass");
  return normalized;
}
function bodyForHash(record){const {recordHash:_ignored,...body}=record;return body}
function seal(body){return Object.freeze({...body,recordHash:sha256(body)})}
function validateSeal(record){
  if(!plain(record))throw new Error("invalid execution record");
  safeHash(record.recordHash,"execution recordHash");
  if(record.recordHash!==sha256(bodyForHash(record)))throw new Error("execution record hash mismatch");
  return record;
}
async function createOnly(path,value){
  await mkdir(dirname(path),{recursive:true});
  const serialized=JSON.stringify(value,null,2)+"\n";
  if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error("execution record too large");
  let handle;
  try{
    handle=await open(path,"wx");
    await handle.writeFile(serialized,"utf8");
    return true;
  }catch(error){
    if(error?.code==="EEXIST")return false;
    throw error;
  }finally{await handle?.close()}
}
async function readJson(path){
  try{return JSON.parse(await readFile(path,"utf8"))}
  catch(error){if(error?.code==="ENOENT")return null;throw error}
}
function executionIdFor({logicalRequestId,roleId,roleContractHash,requestHash,authorizationBindingHash}){
  const digest=sha256({logicalRequestId,roleId,roleContractHash,requestHash,authorizationBindingHash});
  return "exec-"+digest.slice(0,40);
}
function validateIdentity(record){
  validateSeal(record);
  if(record.format!==ARCA_EXECUTION_IDENTITY_FORMAT||record.version!==1)throw new Error("invalid execution identity");
  safeId(record.executionId,"executionId");
  safeId(record.logicalRequestId,"logicalRequestId");
  safeId(record.roleId,"roleId");
  safeHash(record.roleContractHash,"roleContractHash");
  safeHash(record.requestHash,"requestHash");
  safeHash(record.authorizationBindingHash,"authorizationBindingHash");
  normalizeIdempotencyClass(record.idempotencyClass);
  safeTime(record.createdAt,"execution createdAt");
  const expected=executionIdFor({
    logicalRequestId:record.logicalRequestId,
    roleId:record.roleId,
    roleContractHash:record.roleContractHash,
    requestHash:record.requestHash,
    authorizationBindingHash:record.authorizationBindingHash
  });
  if(record.executionId!==expected)throw new Error("executionId fingerprint mismatch");
  return record;
}
function validateAttempt(record,identity){
  validateSeal(record);
  if(record.format!==ARCA_EXECUTION_ATTEMPT_FORMAT||record.version!==1)throw new Error("invalid execution attempt");
  if(record.executionId!==identity.executionId)throw new Error("execution attempt identity mismatch");
  if(!Number.isSafeInteger(record.attemptNumber)||record.attemptNumber<1||record.attemptNumber>10000)throw new Error("invalid attemptNumber");
  safeId(record.attemptId,"attemptId");
  const expectedAttemptId=identity.executionId+".a"+String(record.attemptNumber).padStart(4,"0");
  if(record.attemptId!==expectedAttemptId)throw new Error("execution attemptId mismatch");
  safeId(record.participantId,"attempt participantId");
  safeHash(record.participantDescriptorHash,"attempt participantDescriptorHash");
  safeHash(record.runtimeBindingHash,"attempt runtimeBindingHash");
  safeHash(record.roleConformanceEvidenceHash,"attempt roleConformanceEvidenceHash");
  safeId(record.requestId,"attempt requestId");
  safeId(record.jobId,"attempt jobId");
  safeHash(record.payloadHash,"attempt payloadHash");
  safeId(record.selectedNodeId,"attempt selectedNodeId");
  safeHash(record.ownerBindingHash,"attempt ownerBindingHash");
  safeTime(record.plannedAt,"attempt plannedAt");
  return record;
}
function validateStart(record,attempt){
  validateSeal(record);
  if(record.format!==ARCA_EXECUTION_ATTEMPT_START_FORMAT||record.version!==1)throw new Error("invalid execution attempt start");
  if(record.executionId!==attempt.executionId||record.attemptId!==attempt.attemptId||record.attemptHash!==attempt.recordHash)throw new Error("attempt start binding mismatch");
  safeTime(record.startedAt,"attempt startedAt");
  return record;
}
function validateCompletion(record,attempt){
  validateSeal(record);
  if(record.format!==ARCA_EXECUTION_ATTEMPT_COMPLETION_FORMAT||record.version!==1)throw new Error("invalid execution attempt completion");
  if(record.executionId!==attempt.executionId||record.attemptId!==attempt.attemptId||record.attemptHash!==attempt.recordHash)throw new Error("attempt completion binding mismatch");
  safeHash(record.resultHash,"attempt resultHash");
  safeTime(record.completedAt,"attempt completedAt");
  return record;
}
function validateFailoverAuthorization(record,attempt){
  validateSeal(record);
  if(record.format!==ARCA_EXECUTION_FAILOVER_AUTHORIZATION_FORMAT||record.version!==1)throw new Error("invalid execution failover authorization");
  if(record.executionId!==attempt.executionId||record.fromAttemptId!==attempt.attemptId||record.fromAttemptHash!==attempt.recordHash)throw new Error("execution failover authorization binding mismatch");
  safeId(record.issuerNodeId,"failover issuerNodeId");
  safeHash(record.failoverReceiptHash,"failover receiptHash");
  safeHash(record.signedStatementHash,"failover signedStatementHash");
  if(!plain(record.signedStatement)||record.signedStatement.statementHash!==record.signedStatementHash)throw new Error("invalid failover signedStatement");
  safeTime(record.authorizedAt,"failover authorizedAt");
  safeTime(record.storedAt,"failover storedAt");
  return record;
}

function validateReplacementPreparation(record,identity,attempt,previousAttempt){
  validateSeal(record);
  if(record.format!==ARCA_EXECUTION_REPLACEMENT_PREPARATION_FORMAT||record.version!==1)throw new Error("invalid execution replacement preparation");
  if(record.executionId!==identity.executionId||record.nextAttemptId!==attempt.attemptId||record.nextAttemptHash!==attempt.recordHash)throw new Error("replacement preparation attempt binding mismatch");
  if(record.previousAttemptId!==previousAttempt.attemptId||record.previousParticipantId!==previousAttempt.participantId)throw new Error("replacement preparation previous attempt mismatch");
  if(record.selectedParticipantId!==attempt.participantId||record.selectedParticipantDescriptorHash!==attempt.participantDescriptorHash)throw new Error("replacement preparation participant mismatch");
  if(record.runtimeBindingHash!==attempt.runtimeBindingHash||record.roleConformanceEvidenceHash!==attempt.roleConformanceEvidenceHash)throw new Error("replacement preparation proof mismatch");
  if(record.ownerBindingHash!==attempt.ownerBindingHash)throw new Error("replacement preparation ownership mismatch");
  if(record.requestHash!==identity.requestHash||record.roleContractHash!==identity.roleContractHash)throw new Error("replacement preparation execution contract mismatch");
  const excluded=Array.isArray(record.excludedParticipantIds)?record.excludedParticipantIds:[record.previousParticipantId];
  if(excluded.length===0||excluded.length>100)throw new Error("invalid replacement excludedParticipantIds");
  const normalizedExcluded=[...new Set(excluded.map(value=>safeId(value,"replacement excludedParticipantId")))].sort();
  if(!normalizedExcluded.includes(record.previousParticipantId))throw new Error("replacement excludedParticipantIds must include previous participant");
  if(normalizedExcluded.includes(record.selectedParticipantId))throw new Error("replacement selected participant cannot be excluded");
  safeId(record.runtimeKind,"replacement runtimeKind");
  safeId(record.runtimeId,"replacement runtimeId");
  safeHash(record.failoverReceiptHash,"replacement failoverReceiptHash");
  safeHash(record.authorizationDecisionHash,"replacement authorizationDecisionHash");
  safeHash(record.selectionEvidenceHash,"replacement selectionEvidenceHash");
  safeTime(record.preparedAt,"replacement preparedAt");
  return record;
}
function validateDispatchGate(record,identity,attempt,preparation){
  validateSeal(record);
  if(record.format!==ARCA_EXECUTION_DISPATCH_GATE_FORMAT||record.version!==1)throw new Error("invalid execution dispatch gate");
  if(record.executionId!==identity.executionId||record.attemptId!==attempt.attemptId||record.attemptHash!==attempt.recordHash)throw new Error("dispatch gate attempt binding mismatch");
  if(record.preparationHash!==preparation.recordHash)throw new Error("dispatch gate preparation mismatch");
  if(record.participantId!==attempt.participantId||record.participantDescriptorHash!==attempt.participantDescriptorHash)throw new Error("dispatch gate participant mismatch");
  if(record.runtimeBindingHash!==attempt.runtimeBindingHash||record.roleConformanceEvidenceHash!==attempt.roleConformanceEvidenceHash)throw new Error("dispatch gate proof mismatch");
  safeHash(record.authorizationDecisionHash,"dispatch gate authorizationDecisionHash");
  safeTime(record.authorizedAt,"dispatch gate authorizedAt");
  return record;
}
function sameAttempt(a,b){
  const fields=[
    "executionId","attemptNumber","attemptId","participantId","participantDescriptorHash",
    "runtimeBindingHash","roleConformanceEvidenceHash","requestId","jobId","payloadHash",
    "selectedNodeId","ownerBindingHash"
  ];
  return fields.every(field=>a[field]===b[field]);
}
function conflict(code,message){
  const error=new Error(message);
  error.code=code;
  return error;
}

export class ExecutionIdentityStore{
  constructor({root}={}){
    if(typeof root!=="string"||!root.trim())throw new TypeError("execution identity root required");
    this.root=resolve(root);
  }

  async init(){await mkdir(this.root,{recursive:true});return this}
  executionRoot(executionId){return join(this.root,safeId(executionId,"executionId"))}
  identityPath(executionId){return join(this.executionRoot(executionId),"identity.json")}
  attemptRoot(executionId){return join(this.executionRoot(executionId),"attempts")}
  attemptPath(executionId,attemptId){return join(this.attemptRoot(executionId),safeId(attemptId,"attemptId")+".json")}
  startPath(executionId,attemptId){return join(this.attemptRoot(executionId),safeId(attemptId,"attemptId")+".start.json")}
  completionPath(executionId,attemptId){return join(this.attemptRoot(executionId),safeId(attemptId,"attemptId")+".completion.json")}
  failoverPath(executionId,attemptId){return join(this.executionRoot(executionId),"failovers",safeId(attemptId,"attemptId")+".json")}
  preparationPath(executionId,attemptId){return join(this.executionRoot(executionId),"preparations",safeId(attemptId,"attemptId")+".json")}
  dispatchGatePath(executionId,attemptId){return join(this.executionRoot(executionId),"dispatch-gates",safeId(attemptId,"attemptId")+".json")}

  async create({
    logicalRequestId,
    roleId,
    roleContractHash,
    requestHash,
    authorizationBindingHash,
    idempotencyClass="unknown",
    createdAt=new Date()
  }={}){
    safeId(logicalRequestId,"logicalRequestId");
    safeId(roleId,"roleId");
    safeHash(roleContractHash,"roleContractHash");
    safeHash(requestHash,"requestHash");
    safeHash(authorizationBindingHash,"authorizationBindingHash");
    const normalizedClass=normalizeIdempotencyClass(idempotencyClass);
    const executionId=executionIdFor({logicalRequestId,roleId,roleContractHash,requestHash,authorizationBindingHash});
    const candidate=seal({
      format:ARCA_EXECUTION_IDENTITY_FORMAT,
      version:1,
      executionId,
      logicalRequestId,
      roleId,
      roleContractHash,
      requestHash,
      authorizationBindingHash,
      idempotencyClass:normalizedClass,
      createdAt:safeTime(createdAt,"execution createdAt")
    });
    const created=await createOnly(this.identityPath(executionId),candidate);
    const identity=created?candidate:validateIdentity(await readJson(this.identityPath(executionId)));
    if(identity.recordHash!==candidate.recordHash){
      throw conflict("ARCA_EXECUTION_IDENTITY_CONFLICT","execution identity already exists with different metadata");
    }
    return Object.freeze({created,identity});
  }

  async get(executionId){
    const value=await readJson(this.identityPath(executionId));
    return value?validateIdentity(value):null;
  }

  async listAttempts(executionId){
    const identity=await this.get(executionId);
    if(!identity)throw conflict("ARCA_EXECUTION_NOT_FOUND","execution not found: "+executionId);
    let names=[];
    try{names=await readdir(this.attemptRoot(executionId))}
    catch(error){if(error?.code==="ENOENT")return [];throw error}
    const records=[];
    for(const name of names.filter(name=>name.endsWith(".json")&&!name.endsWith(".start.json")&&!name.endsWith(".completion.json")).sort()){
      const value=await readJson(join(this.attemptRoot(executionId),name));
      if(value)records.push(validateAttempt(value,identity));
    }
    return records.sort((a,b)=>a.attemptNumber-b.attemptNumber);
  }

  async createAttempt(executionId,{
    participantId,
    participantDescriptorHash,
    runtimeBindingHash,
    roleConformanceEvidenceHash,
    requestId,
    jobId,
    payloadHash,
    selectedNodeId,
    ownerBindingHash,
    plannedAt=new Date()
  }={}){
    const identity=await this.get(executionId);
    if(!identity)throw conflict("ARCA_EXECUTION_NOT_FOUND","execution not found: "+executionId);
    safeId(participantId,"attempt participantId");
    safeHash(participantDescriptorHash,"attempt participantDescriptorHash");
    safeHash(runtimeBindingHash,"attempt runtimeBindingHash");
    safeHash(roleConformanceEvidenceHash,"attempt roleConformanceEvidenceHash");
    safeId(requestId,"attempt requestId");
    safeId(jobId,"attempt jobId");
    safeHash(payloadHash,"attempt payloadHash");
    safeId(selectedNodeId,"attempt selectedNodeId");
    safeHash(ownerBindingHash,"attempt ownerBindingHash");

    const current=await this.listAttempts(executionId);
    const attemptNumber=current.length+1;
    const attemptId=identity.executionId+".a"+String(attemptNumber).padStart(4,"0");
    const candidate=seal({
      format:ARCA_EXECUTION_ATTEMPT_FORMAT,
      version:1,
      executionId:identity.executionId,
      executionHash:identity.recordHash,
      attemptNumber,
      attemptId,
      participantId,
      participantDescriptorHash,
      runtimeBindingHash,
      roleConformanceEvidenceHash,
      requestId,
      jobId,
      payloadHash,
      selectedNodeId,
      ownerBindingHash,
      plannedAt:safeTime(plannedAt,"attempt plannedAt")
    });
    const created=await createOnly(this.attemptPath(executionId,attemptId),candidate);
    if(!created){
      const existing=validateAttempt(await readJson(this.attemptPath(executionId,attemptId)),identity);
      if(!sameAttempt(existing,candidate))throw conflict("ARCA_EXECUTION_ATTEMPT_CONFLICT","execution attempt already exists with different binding");
      return Object.freeze({created:false,attempt:existing,identity});
    }
    return Object.freeze({created:true,attempt:candidate,identity});
  }

  async getAttempt(executionId,attemptId){
    const identity=await this.get(executionId);
    if(!identity)throw conflict("ARCA_EXECUTION_NOT_FOUND","execution not found: "+executionId);
    const value=await readJson(this.attemptPath(executionId,attemptId));
    return value?validateAttempt(value,identity):null;
  }

  async markAttemptStarted(executionId,attemptId,{startedAt=new Date()}={}){
    const attempt=await this.getAttempt(executionId,attemptId);
    if(!attempt)throw conflict("ARCA_EXECUTION_ATTEMPT_NOT_FOUND","execution attempt not found");
    if(await readJson(this.failoverPath(executionId,attemptId)))throw conflict("ARCA_EXECUTION_ATTEMPT_SUPERSEDED","superseded attempt cannot start");
    const candidate=seal({
      format:ARCA_EXECUTION_ATTEMPT_START_FORMAT,
      version:1,
      executionId,
      attemptId,
      attemptHash:attempt.recordHash,
      startedAt:safeTime(startedAt,"attempt startedAt")
    });
    const created=await createOnly(this.startPath(executionId,attemptId),candidate);
    const start=created?candidate:validateStart(await readJson(this.startPath(executionId,attemptId)),attempt);
    return Object.freeze({created,start,attempt});
  }

  async markAttemptCompleted(executionId,attemptId,{resultHash,completedAt=new Date()}={}){
    const attempt=await this.getAttempt(executionId,attemptId);
    if(!attempt)throw conflict("ARCA_EXECUTION_ATTEMPT_NOT_FOUND","execution attempt not found");
    if(await readJson(this.failoverPath(executionId,attemptId)))throw conflict("ARCA_EXECUTION_ATTEMPT_SUPERSEDED","superseded attempt cannot complete");
    const startRaw=await readJson(this.startPath(executionId,attemptId));
    if(!startRaw)throw conflict("ARCA_EXECUTION_ATTEMPT_NOT_STARTED","cannot complete attempt before start");
    validateStart(startRaw,attempt);
    safeHash(resultHash,"attempt resultHash");
    const candidate=seal({
      format:ARCA_EXECUTION_ATTEMPT_COMPLETION_FORMAT,
      version:1,
      executionId,
      attemptId,
      attemptHash:attempt.recordHash,
      resultHash,
      completedAt:safeTime(completedAt,"attempt completedAt")
    });
    const created=await createOnly(this.completionPath(executionId,attemptId),candidate);
    const completion=created?candidate:validateCompletion(await readJson(this.completionPath(executionId,attemptId)),attempt);
    if(completion.resultHash!==resultHash)throw conflict("ARCA_EXECUTION_RESULT_CONFLICT","execution attempt resultHash conflict");
    return Object.freeze({created,completion,attempt});
  }

  async storeFailoverStatement(executionId,fromAttemptId,statement,{trustStore,storedAt=new Date()}={}){
    const attempt=await this.getAttempt(executionId,fromAttemptId);
    if(!attempt)throw conflict("ARCA_EXECUTION_ATTEMPT_NOT_FOUND","execution attempt not found");
    if(!plain(statement))throw new TypeError("failover signed statement required");
    if(typeof trustStore?.verify!=="function")throw new TypeError("failover trustStore.verify() required");
    const payload=statement.payload;
    if(!plain(payload)||payload.executionId!==executionId||payload.fromAttemptId!==fromAttemptId||payload.fromAttemptHash!==attempt.recordHash){
      throw conflict("ARCA_EXECUTION_FAILOVER_BINDING_MISMATCH","signed failover statement does not bind current attempt");
    }
    const authorizedAt=safeTime(payload.authorizedAt,"failover authorizedAt");
    verifySignedMeshReconciledFailoverReceipt(statement,{
      expectedNodeId:payload.issuerNodeId,
      now:new Date(authorizedAt),
      clockSkewMs:0
    });
    trustStore.verify(statement,{
      expectedDomain:MESH_RECONCILED_FAILOVER_RECEIPT_DOMAIN,
      expectedNodeId:payload.issuerNodeId,
      now:new Date(authorizedAt),
      clockSkewMs:0
    });
    const {receiptHash,...receiptBody}=payload;
    safeHash(receiptHash,"failover receiptHash");
    if(sha256(receiptBody)!==receiptHash)throw conflict("ARCA_EXECUTION_FAILOVER_RECEIPT_HASH_MISMATCH","failover receipt hash mismatch");
    safeHash(statement.statementHash,"failover signed statementHash");
    const candidate=seal({
      format:ARCA_EXECUTION_FAILOVER_AUTHORIZATION_FORMAT,
      version:1,
      executionId,
      fromAttemptId,
      fromAttemptHash:attempt.recordHash,
      issuerNodeId:payload.issuerNodeId,
      failoverReceiptHash:receiptHash,
      signedStatementHash:statement.statementHash,
      signedStatement:statement,
      authorizedAt,
      storedAt:safeTime(storedAt,"failover storedAt")
    });
    const created=await createOnly(this.failoverPath(executionId,fromAttemptId),candidate);
    const authorization=created?candidate:validateFailoverAuthorization(await readJson(this.failoverPath(executionId,fromAttemptId)),attempt);
    if(authorization.signedStatementHash!==statement.statementHash||authorization.failoverReceiptHash!==receiptHash||
      JSON.stringify(stableValue(authorization.signedStatement))!==JSON.stringify(stableValue(statement))){
      throw conflict("ARCA_EXECUTION_FAILOVER_CONFLICT","different failover authorization already exists");
    }
    return Object.freeze({created,authorization});
  }

  async getFailoverStatement(executionId,fromAttemptId){
    const attempt=await this.getAttempt(executionId,fromAttemptId);
    if(!attempt)throw conflict("ARCA_EXECUTION_ATTEMPT_NOT_FOUND","execution attempt not found");
    const value=await readJson(this.failoverPath(executionId,fromAttemptId));
    return value?validateFailoverAuthorization(value,attempt):null;
  }

  async getFailoverReceipt(executionId,fromAttemptId,{trustStore}={}){
    if(typeof trustStore?.verify!=="function")throw new TypeError("failover trustStore.verify() required");
    const authorization=await this.getFailoverStatement(executionId,fromAttemptId);
    if(!authorization)return null;
    const statement=authorization.signedStatement;
    const payload=statement.payload;
    verifySignedMeshReconciledFailoverReceipt(statement,{
      expectedNodeId:authorization.issuerNodeId,
      now:new Date(authorization.authorizedAt),
      clockSkewMs:0
    });
    trustStore.verify(statement,{
      expectedDomain:MESH_RECONCILED_FAILOVER_RECEIPT_DOMAIN,
      expectedNodeId:authorization.issuerNodeId,
      now:new Date(authorization.authorizedAt),
      clockSkewMs:0
    });
    if(payload.executionId!==executionId||payload.fromAttemptId!==fromAttemptId||payload.receiptHash!==authorization.failoverReceiptHash){
      throw conflict("ARCA_EXECUTION_FAILOVER_BINDING_MISMATCH","durable failover receipt binding mismatch");
    }
    const {receiptHash,...receiptBody}=payload;
    if(sha256(receiptBody)!==receiptHash)throw conflict("ARCA_EXECUTION_FAILOVER_RECEIPT_HASH_MISMATCH","durable failover receipt hash mismatch");
    return Object.freeze({...payload,signedReceipt:statement});
  }

  async storeReplacementPreparation(executionId,attemptId,{
    previousAttemptId,
    previousParticipantId,
    selectedParticipantId,
    selectedParticipantDescriptorHash,
    runtimeKind,
    runtimeId,
    runtimeBindingHash,
    roleConformanceEvidenceHash,
    ownerBindingHash,
    failoverReceiptHash,
    requestHash,
    roleContractHash,
    authorizationDecisionHash,
    selectionEvidenceHash,
    excludedParticipantIds=[previousParticipantId],
    preparedAt=new Date()
  }={}){
    const identity=await this.get(executionId);
    if(!identity)throw conflict("ARCA_EXECUTION_NOT_FOUND","execution not found: "+executionId);
    const attempt=await this.getAttempt(executionId,attemptId);
    if(!attempt)throw conflict("ARCA_EXECUTION_ATTEMPT_NOT_FOUND","execution attempt not found");
    if(attempt.attemptNumber<2)throw conflict("ARCA_REPLACEMENT_PREPARATION_INVALID","replacement preparation requires attempt >= 2");
    const previous=await this.getAttempt(executionId,previousAttemptId);
    if(!previous||previous.attemptNumber!==attempt.attemptNumber-1)throw conflict("ARCA_REPLACEMENT_PREPARATION_INVALID","replacement preparation requires immediate previous attempt");
    const failover=await this.getFailoverStatement(executionId,previousAttemptId);
    if(!failover||failover.failoverReceiptHash!==failoverReceiptHash)throw conflict("ARCA_REPLACEMENT_PREPARATION_FAILOVER_MISMATCH","replacement preparation requires matching durable failover authorization");
    const candidate=seal({
      format:ARCA_EXECUTION_REPLACEMENT_PREPARATION_FORMAT,
      version:1,
      executionId,
      nextAttemptId:attempt.attemptId,
      nextAttemptHash:attempt.recordHash,
      previousAttemptId:safeId(previousAttemptId,"previousAttemptId"),
      previousParticipantId:safeId(previousParticipantId,"previousParticipantId"),
      selectedParticipantId:safeId(selectedParticipantId,"selectedParticipantId"),
      selectedParticipantDescriptorHash:safeHash(selectedParticipantDescriptorHash,"selectedParticipantDescriptorHash"),
      excludedParticipantIds:Object.freeze([...new Set(excludedParticipantIds.map(value=>safeId(value,"excludedParticipantId")))].sort()),
      runtimeKind:safeId(runtimeKind,"runtimeKind"),
      runtimeId:safeId(runtimeId,"runtimeId"),
      runtimeBindingHash:safeHash(runtimeBindingHash,"runtimeBindingHash"),
      roleConformanceEvidenceHash:safeHash(roleConformanceEvidenceHash,"roleConformanceEvidenceHash"),
      ownerBindingHash:safeHash(ownerBindingHash,"ownerBindingHash"),
      failoverReceiptHash:safeHash(failoverReceiptHash,"failoverReceiptHash"),
      requestHash:safeHash(requestHash,"requestHash"),
      roleContractHash:safeHash(roleContractHash,"roleContractHash"),
      authorizationDecisionHash:safeHash(authorizationDecisionHash,"authorizationDecisionHash"),
      selectionEvidenceHash:safeHash(selectionEvidenceHash,"selectionEvidenceHash"),
      preparedAt:safeTime(preparedAt,"replacement preparedAt")
    });
    validateReplacementPreparation(candidate,identity,attempt,previous);
    const created=await createOnly(this.preparationPath(executionId,attemptId),candidate);
    const preparation=created?candidate:validateReplacementPreparation(await readJson(this.preparationPath(executionId,attemptId)),identity,attempt,previous);
    if(preparation.recordHash!==candidate.recordHash)throw conflict("ARCA_REPLACEMENT_PREPARATION_CONFLICT","different replacement preparation already exists");
    return Object.freeze({created,preparation});
  }

  async getReplacementPreparation(executionId,attemptId){
    const identity=await this.get(executionId);
    if(!identity)throw conflict("ARCA_EXECUTION_NOT_FOUND","execution not found: "+executionId);
    const attempt=await this.getAttempt(executionId,attemptId);
    if(!attempt)throw conflict("ARCA_EXECUTION_ATTEMPT_NOT_FOUND","execution attempt not found");
    const raw=await readJson(this.preparationPath(executionId,attemptId));
    if(!raw)return null;
    const previous=await this.getAttempt(executionId,raw.previousAttemptId);
    if(!previous)throw conflict("ARCA_REPLACEMENT_PREPARATION_INVALID","replacement preparation previous attempt missing");
    return validateReplacementPreparation(raw,identity,attempt,previous);
  }

  async storeDispatchGate(executionId,attemptId,{
    preparationHash,
    participantId,
    participantDescriptorHash,
    runtimeBindingHash,
    roleConformanceEvidenceHash,
    authorizationDecisionHash,
    authorizedAt=new Date()
  }={}){
    const identity=await this.get(executionId);
    if(!identity)throw conflict("ARCA_EXECUTION_NOT_FOUND","execution not found: "+executionId);
    const attempt=await this.getAttempt(executionId,attemptId);
    if(!attempt)throw conflict("ARCA_EXECUTION_ATTEMPT_NOT_FOUND","execution attempt not found");
    const preparation=await this.getReplacementPreparation(executionId,attemptId);
    if(!preparation)throw conflict("ARCA_REPLACEMENT_PREPARATION_MISSING","durable replacement preparation required");
    const candidate=seal({
      format:ARCA_EXECUTION_DISPATCH_GATE_FORMAT,
      version:1,
      executionId,
      attemptId,
      attemptHash:attempt.recordHash,
      preparationHash:safeHash(preparationHash,"preparationHash"),
      participantId:safeId(participantId,"dispatch participantId"),
      participantDescriptorHash:safeHash(participantDescriptorHash,"dispatch participantDescriptorHash"),
      runtimeBindingHash:safeHash(runtimeBindingHash,"dispatch runtimeBindingHash"),
      roleConformanceEvidenceHash:safeHash(roleConformanceEvidenceHash,"dispatch roleConformanceEvidenceHash"),
      authorizationDecisionHash:safeHash(authorizationDecisionHash,"dispatch authorizationDecisionHash"),
      authorizedAt:safeTime(authorizedAt,"dispatch authorizedAt")
    });
    validateDispatchGate(candidate,identity,attempt,preparation);
    const created=await createOnly(this.dispatchGatePath(executionId,attemptId),candidate);
    const gate=created?candidate:validateDispatchGate(await readJson(this.dispatchGatePath(executionId,attemptId)),identity,attempt,preparation);
    if(
      gate.preparationHash!==candidate.preparationHash||
      gate.participantId!==candidate.participantId||
      gate.participantDescriptorHash!==candidate.participantDescriptorHash||
      gate.runtimeBindingHash!==candidate.runtimeBindingHash||
      gate.roleConformanceEvidenceHash!==candidate.roleConformanceEvidenceHash||
      gate.authorizationDecisionHash!==candidate.authorizationDecisionHash
    )throw conflict("ARCA_EXECUTION_DISPATCH_GATE_CONFLICT","different dispatch authorization gate already exists");
    return Object.freeze({created,gate});
  }

  async getDispatchGate(executionId,attemptId){
    const identity=await this.get(executionId);
    if(!identity)throw conflict("ARCA_EXECUTION_NOT_FOUND","execution not found: "+executionId);
    const attempt=await this.getAttempt(executionId,attemptId);
    if(!attempt)throw conflict("ARCA_EXECUTION_ATTEMPT_NOT_FOUND","execution attempt not found");
    const preparation=await this.getReplacementPreparation(executionId,attemptId);
    if(!preparation)return null;
    const raw=await readJson(this.dispatchGatePath(executionId,attemptId));
    return raw?validateDispatchGate(raw,identity,attempt,preparation):null;
  }

  async attemptStatus(executionId,attemptId){
    const attempt=await this.getAttempt(executionId,attemptId);
    if(!attempt)throw conflict("ARCA_EXECUTION_ATTEMPT_NOT_FOUND","execution attempt not found");
    const startRaw=await readJson(this.startPath(executionId,attemptId));
    const completionRaw=await readJson(this.completionPath(executionId,attemptId));
    const failover=await this.getFailoverStatement(executionId,attemptId);
    const start=startRaw?validateStart(startRaw,attempt):null;
    const completion=completionRaw?validateCompletion(completionRaw,attempt):null;
    return Object.freeze({
      attempt,
      state:completion?"completed":failover?"superseded":start?"started":"planned",
      startedAt:start?.startedAt??null,
      completedAt:completion?.completedAt??null,
      resultHash:completion?.resultHash??null,
      failoverAuthorized:!!failover
    });
  }

  async status(executionId){
    const identity=await this.get(executionId);
    if(!identity)return null;
    const attempts=await this.listAttempts(executionId);
    const statuses=[];
    for(const attempt of attempts)statuses.push(await this.attemptStatus(executionId,attempt.attemptId));
    const latest=statuses.at(-1)??null;
    return Object.freeze({
      identity,
      attemptCount:statuses.length,
      attempts:Object.freeze(statuses),
      latestAttempt:latest,
      state:latest?.state??"created"
    });
  }
}

export function deriveExecutionId(input){
  return executionIdFor(input);
}
