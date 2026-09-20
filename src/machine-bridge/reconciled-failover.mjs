import {createHash} from "node:crypto";
import {
  MESH_RECONCILED_FAILOVER_RECEIPT_DOMAIN,
  signMeshReconciledFailoverReceipt,
  verifySignedMeshReconciledFailoverReceipt
} from "./mesh-identity.mjs";
import {ExecutionIdentityStore} from "./execution-identity.mjs";

export const ARCA_RECONCILED_FAILOVER_RECEIPT_FORMAT="arca-reconciled-failover-receipt-v1";
export const ARCA_RECONCILED_FAILOVER_EVALUATION_FORMAT="arca-reconciled-failover-evaluation-v1";

const HASH=/^[a-f0-9]{64}$/;
const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const SAFE_REJECTIONS=new Set(["capability","unavailable","not-accepted"]);
const RECEIPT_TTL_MS=24*60*60*1000;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function stable(value){return JSON.stringify(stableValue(value))}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function safeId(value,label){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);return value}
function safeHash(value,label){if(typeof value!=="string"||!HASH.test(value))throw new Error("invalid "+label);return value}
function safeTime(value,label){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error("invalid "+label);
  return date.toISOString();
}
function signerIdentity(signer){return signer?.identity&&typeof signer.identity.nodeId==="string"?signer.identity:null}
function coded(code,message,metadata={}){
  const error=new Error(message);
  error.code=code;
  Object.assign(error,metadata);
  return error;
}

export function evaluateReconciledFailover({execution,attemptStatus,reconciliation}={}){
  if(!plain(execution)||execution.format!=="arca-execution-identity-v1")throw new TypeError("execution identity required");
  if(!plain(attemptStatus)||!plain(attemptStatus.attempt))throw new TypeError("attempt status required");
  if(!plain(reconciliation))throw new TypeError("reconciliation result required");
  const attempt=attemptStatus.attempt;

  let eligible=false;
  let reason="fail-closed";
  if(attemptStatus.state==="completed"){
    reason="attempt-completed";
  }else if(attemptStatus.state==="planned"){
    reason="attempt-not-started";
  }else if(attemptStatus.state==="superseded"){
    reason="attempt-already-superseded";
  }else if(reconciliation.state==="completed"||reconciliation.remoteEvidenceState==="completed"){
    reason="remote-completed";
  }else if(reconciliation.remoteEvidenceState==="accepted"||reconciliation.state==="accepted"||reconciliation.state==="accepted-uncertain"){
    reason="remote-accepted";
  }else if(reconciliation.remoteEvidenceState==="unseen"){
    reason="remote-outcome-unseen";
  }else if(reconciliation.remoteEvidenceState==="rejected"&&reconciliation.state==="rejected"){
    if(SAFE_REJECTIONS.has(reconciliation.rejectionCategory)){
      eligible=true;
      reason="signed-pre-execution-rejection";
    }else{
      reason="rejection-category-not-reroutable";
    }
  }else{
    reason="remote-outcome-uncertain";
  }

  return Object.freeze({
    format:ARCA_RECONCILED_FAILOVER_EVALUATION_FORMAT,
    version:1,
    executionId:execution.executionId,
    attemptId:attempt.attemptId,
    participantId:attempt.participantId,
    remoteRequestId:attempt.requestId,
    remoteJobId:attempt.jobId,
    selectedNodeId:attempt.selectedNodeId,
    reconciliationState:String(reconciliation.state??"unknown"),
    remoteEvidenceState:String(reconciliation.remoteEvidenceState??"unknown"),
    rejectionCategory:reconciliation.rejectionCategory??null,
    decisionStatementHash:reconciliation.decisionStatementHash??null,
    completionStatementHash:reconciliation.completionStatementHash??null,
    idempotencyClass:execution.idempotencyClass,
    eligible,
    reason,
    uncertainExecutionNeverAuthorizesFailover:true,
    completedExecutionNeverAuthorizesFailover:true,
    policyOrInvalidRequestNeverAutoReroutes:true
  });
}

export async function signReconciledFailoverReceipt(receiptBody,signer,{issuedAt,ttlMs=RECEIPT_TTL_MS}={}){
  if(!plain(receiptBody)||receiptBody.format!==ARCA_RECONCILED_FAILOVER_RECEIPT_FORMAT)throw new TypeError("reconciled failover receipt body invalid");
  const identity=signerIdentity(signer);
  if(!identity)throw coded("ARCA_FAILOVER_RECEIPT_SIGNER_REQUIRED","failover receipt signer identity required");
  const base={...JSON.parse(JSON.stringify(receiptBody)),issuerNodeId:identity.nodeId};
  delete base.receiptHash;
  delete base.signedReceipt;
  const receiptHash=sha256(base);
  const payload=Object.freeze({...base,receiptHash});
  const options={issuedAt:issuedAt??base.authorizedAt,ttlMs};
  const signedReceipt=typeof signer.signReconciledFailoverReceipt==="function"
    ?await signer.signReconciledFailoverReceipt(payload,options)
    :signMeshReconciledFailoverReceipt(payload,signer,options);
  return Object.freeze({...payload,signedReceipt});
}

export function verifyReconciledFailoverReceipt(receipt,{trustStore,now=null,clockSkewMs=0}={}){
  try{
    if(!plain(receipt)||receipt.format!==ARCA_RECONCILED_FAILOVER_RECEIPT_FORMAT)return false;
    if(typeof receipt.receiptHash!=="string"||!HASH.test(receipt.receiptHash)||!plain(receipt.signedReceipt))return false;
    if(typeof trustStore?.verify!=="function")return false;
    const {receiptHash,signedReceipt,...body}=receipt;
    if(sha256(body)!==receiptHash)return false;
    if(body.issuerNodeId!==signedReceipt?.signer?.nodeId)return false;
    if(stable({...body,receiptHash})!==stable(signedReceipt.payload))return false;
    const verificationNow=now??new Date(body.authorizedAt);
    verifySignedMeshReconciledFailoverReceipt(signedReceipt,{
      expectedNodeId:body.issuerNodeId,
      now:verificationNow,
      clockSkewMs
    });
    trustStore.verify(signedReceipt,{
      expectedDomain:MESH_RECONCILED_FAILOVER_RECEIPT_DOMAIN,
      expectedNodeId:body.issuerNodeId,
      now:verificationNow,
      clockSkewMs
    });
    return true;
  }catch{
    return false;
  }
}

export class ReconciledFailoverController{
  constructor({
    executionStore,
    reconciliationController,
    receiptSigner,
    trustStore,
    now=()=>new Date()
  }={}){
    if(!(executionStore instanceof ExecutionIdentityStore))throw new TypeError("ExecutionIdentityStore required");
    if(typeof reconciliationController?.reconcile!=="function")throw new TypeError("reconciliationController.reconcile() required");
    if(!signerIdentity(receiptSigner))throw new TypeError("reconciled failover receiptSigner required");
    if(typeof trustStore?.verify!=="function")throw new TypeError("reconciled failover trustStore required");
    if(typeof now!=="function")throw new TypeError("reconciled failover clock required");
    this.executionStore=executionStore;
    this.reconciliationController=reconciliationController;
    this.receiptSigner=receiptSigner;
    this.trustStore=trustStore;
    this.now=now;
  }

  async evaluate(executionId,{now=this.now()}={}){
    safeId(executionId,"executionId");
    const status=await this.executionStore.status(executionId);
    if(!status)throw coded("ARCA_EXECUTION_NOT_FOUND","execution not found: "+executionId);
    if(!status.latestAttempt)throw coded("ARCA_EXECUTION_ATTEMPT_NOT_FOUND","execution has no attempt");
    const attemptStatus=status.latestAttempt;
    const reconciliation=await this.reconciliationController.reconcile(attemptStatus.attempt.requestId,{now});
    const evaluation=evaluateReconciledFailover({
      execution:status.identity,
      attemptStatus,
      reconciliation
    });
    return Object.freeze({status,reconciliation,evaluation});
  }

  async authorize(executionId,{now=this.now()}={}){
    const at=safeTime(now,"failover authorization time");
    const existingStatus=await this.executionStore.status(executionId);
    if(!existingStatus)throw coded("ARCA_EXECUTION_NOT_FOUND","execution not found: "+executionId);
    if(existingStatus.latestAttempt?.state==="superseded"){
      const receipt=await this.executionStore.getFailoverReceipt(
        executionId,
        existingStatus.latestAttempt.attempt.attemptId,
        {trustStore:this.trustStore}
      );
      if(!receipt)throw coded("ARCA_FAILOVER_RECEIPT_NOT_DURABLE","superseded attempt is missing durable failover authorization");
      return Object.freeze({
        reused:true,
        evaluation:Object.freeze({
          format:ARCA_RECONCILED_FAILOVER_EVALUATION_FORMAT,
          version:1,
          executionId,
          attemptId:existingStatus.latestAttempt.attempt.attemptId,
          participantId:existingStatus.latestAttempt.attempt.participantId,
          eligible:true,
          reason:"durable-authorization-reused"
        }),
        reconciliation:null,
        receipt
      });
    }
    const {status,reconciliation,evaluation}=await this.evaluate(executionId,{now:new Date(at)});
    if(!evaluation.eligible){
      throw coded("ARCA_RECONCILED_FAILOVER_NOT_ELIGIBLE","reconciled failover not eligible: "+evaluation.reason,{
        executionId,
        attemptId:evaluation.attemptId,
        reason:evaluation.reason
      });
    }
    const from=status.latestAttempt.attempt;
    const body={
      format:ARCA_RECONCILED_FAILOVER_RECEIPT_FORMAT,
      version:1,
      executionId:status.identity.executionId,
      executionHash:status.identity.recordHash,
      logicalRequestId:status.identity.logicalRequestId,
      roleId:status.identity.roleId,
      roleContractHash:status.identity.roleContractHash,
      requestHash:status.identity.requestHash,
      policyBindingHash:status.identity.authorizationBindingHash,
      idempotencyClass:status.identity.idempotencyClass,
      fromAttemptId:from.attemptId,
      fromAttemptHash:from.recordHash,
      fromParticipantId:from.participantId,
      fromParticipantDescriptorHash:from.participantDescriptorHash,
      fromRuntimeBindingHash:from.runtimeBindingHash,
      fromRoleConformanceEvidenceHash:from.roleConformanceEvidenceHash,
      remoteRequestId:from.requestId,
      remoteJobId:from.jobId,
      remoteSelectedNodeId:from.selectedNodeId,
      ownerBindingHash:from.ownerBindingHash,
      reconciliationState:evaluation.reconciliationState,
      remoteEvidenceState:evaluation.remoteEvidenceState,
      rejectionCategory:evaluation.rejectionCategory,
      decisionStatementHash:safeHash(evaluation.decisionStatementHash,"decisionStatementHash"),
      completionStatementHash:null,
      eligibilityReason:evaluation.reason,
      authorizedAt:at,
      nextAttemptMustExcludeParticipant:true,
      automaticDispatchPerformed:false,
      uncertainExecutionAuthorized:false,
      completedExecutionAuthorized:false
    };
    const receipt=await signReconciledFailoverReceipt(body,this.receiptSigner,{issuedAt:new Date(at)});
    if(!verifyReconciledFailoverReceipt(receipt,{trustStore:this.trustStore,now:new Date(at)})){
      throw coded("ARCA_FAILOVER_RECEIPT_SIGNATURE_INVALID","signed failover receipt failed local trust verification");
    }
    await this.executionStore.storeFailoverStatement(executionId,from.attemptId,receipt.signedReceipt,{trustStore:this.trustStore,storedAt:new Date(at)});
    return Object.freeze({evaluation,reconciliation,receipt});
  }

  async prepareNextAttempt(executionId,{
    failoverReceipt,
    participantId,
    participantDescriptorHash,
    runtimeBindingHash,
    roleConformanceEvidenceHash,
    requestId,
    jobId,
    payloadHash,
    selectedNodeId,
    ownerBindingHash,
    plannedAt=this.now()
  }={}){
    const status=await this.executionStore.status(executionId);
    if(!status||!status.latestAttempt)throw coded("ARCA_EXECUTION_NOT_FOUND","execution/attempt not found");
    const previous=status.latestAttempt.attempt;
    if(!verifyReconciledFailoverReceipt(failoverReceipt,{trustStore:this.trustStore,now:new Date(failoverReceipt?.authorizedAt??plannedAt)})){
      throw coded("ARCA_FAILOVER_RECEIPT_INVALID","valid trusted failover receipt required");
    }
    if(failoverReceipt.executionId!==executionId||failoverReceipt.fromAttemptId!==previous.attemptId){
      throw coded("ARCA_FAILOVER_RECEIPT_BINDING_MISMATCH","failover receipt does not authorize current attempt");
    }
    safeId(participantId,"participantId");
    if(participantId===previous.participantId){
      throw coded("ARCA_FAILOVER_SAME_PARTICIPANT","reconciled failover must select a different participant");
    }
    const stored=await this.executionStore.getFailoverStatement(executionId,previous.attemptId);
    if(!stored||stored.signedStatementHash!==failoverReceipt.signedReceipt.statementHash){
      throw coded("ARCA_FAILOVER_RECEIPT_NOT_DURABLE","failover receipt is not the durable authorization for current attempt");
    }
    return this.executionStore.createAttempt(executionId,{
      participantId,
      participantDescriptorHash:safeHash(participantDescriptorHash,"participantDescriptorHash"),
      runtimeBindingHash:safeHash(runtimeBindingHash,"runtimeBindingHash"),
      roleConformanceEvidenceHash:safeHash(roleConformanceEvidenceHash,"roleConformanceEvidenceHash"),
      requestId:safeId(requestId,"requestId"),
      jobId:safeId(jobId,"jobId"),
      payloadHash:safeHash(payloadHash,"payloadHash"),
      selectedNodeId:safeId(selectedNodeId,"selectedNodeId"),
      ownerBindingHash:safeHash(ownerBindingHash,"ownerBindingHash"),
      plannedAt
    });
  }

  snapshot(){
    return Object.freeze({
      format:"arca-reconciled-failover-controller-v1",
      version:1,
      automaticDispatch:false,
      automaticFailoverMode:"signed-pre-execution-rejection-only",
      allowedRejectionCategories:Object.freeze([...SAFE_REJECTIONS].sort()),
      uncertainOutcomeFailover:false,
      completedOutcomeFailover:false
    });
  }
}
