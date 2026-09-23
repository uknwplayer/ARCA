import {createHash} from "node:crypto";
import {
  ExecutionIdentityStore
} from "./execution-identity.mjs";
import {
  signMeshStatement,
  verifyMeshSignedStatement
} from "./mesh-identity.mjs";

export const ARCA_VINCE_RECOVERY_IDENTITY_FORMAT="arca-vince-recovery-identity-v0.4";
export const ARCA_VINCE_RECOVERY_RECEIPT_FORMAT="arca-vince-recovery-receipt-v0.4";
export const MESH_VINCE_RECOVERY_RECEIPT_DOMAIN="arca.mesh.vince-recovery-receipt.v1";

const HASH=/^[a-f0-9]{64}$/;
const DISPATCH=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stableValue(value[k])]));
  return value;
}
function stable(value){return JSON.stringify(stableValue(value))}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function safeHash(value,label){if(typeof value!=="string"||!HASH.test(value))throw new Error("invalid "+label);return value}
function safeId(value,label){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);return value}
function safeDispatch(value,label){if(typeof value!=="string"||!DISPATCH.test(value))throw new Error("invalid "+label);return value}

export function validateVinceRecoveryPair({checkpoint,proof}={}){
  if(!plain(checkpoint)||checkpoint.schema!=="arca.vince-recovery-checkpoint.v0.3")
    throw new Error("VINCE_SIGNED_RECOVERY_CHECKPOINT_INVALID");
  if(!plain(proof)||proof.schema!=="arca.vince-recovery-proof.v0.3")
    throw new Error("VINCE_SIGNED_RECOVERY_PROOF_INVALID");

  safeId(checkpoint?.mission?.mission_id,"mission id");
  safeHash(checkpoint.mission_sha256,"mission sha256");
  safeHash(checkpoint.job_fingerprint,"job fingerprint");
  safeHash(checkpoint.checkpoint_record_sha256,"checkpoint record sha256");
  safeDispatch(checkpoint.dispatch_external_id,"dispatch external id");
  safeDispatch(checkpoint.dispatch_correlation_id,"dispatch correlation id");
  if(checkpoint.dispatch_external_id!==checkpoint.dispatch_correlation_id)
    throw new Error("VINCE_SIGNED_RECOVERY_DISPATCH_CORRELATION_MISMATCH");
  if(checkpoint.dispatch_state!=="QUEUE_ACCEPTED"||checkpoint.automatic_retry_allowed!==false)
    throw new Error("VINCE_SIGNED_RECOVERY_CHECKPOINT_POLICY_INVALID");

  if(proof.mission_id!==checkpoint.mission.mission_id||
     proof.mission_sha256!==checkpoint.mission_sha256||
     proof.checkpoint_record_sha256!==checkpoint.checkpoint_record_sha256||
     proof.selected_executor_id!==checkpoint.selected_executor_id||
     proof.provider_family!==checkpoint.provider_family||
     proof.dispatch_external_id!==checkpoint.dispatch_external_id)
    throw new Error("VINCE_SIGNED_RECOVERY_BINDING_MISMATCH");

  if(proof.recovery_state!=="RECOVERED_VERIFIED_RESULT")
    throw new Error("VINCE_SIGNED_RECOVERY_RESULT_NOT_VERIFIED");
  safeHash(proof.result_sha256,"result sha256");
  safeHash(proof.accepted_receipt_sha256,"accepted receipt sha256");
  safeHash(proof.proof_sha256,"recovery proof sha256");
  if(proof.network_dispatch_performed!==false||
     proof.automatic_retry_performed!==false||
     proof.failover_authorized!==false||
     proof.duplicate_dispatch_detected!==false||
     proof.core_mutation_performed!==false||
     proof.trust_modified!==false||
     proof.authority_expanded!==false)
    throw new Error("VINCE_SIGNED_RECOVERY_AUTHORITY_OR_RETRY_INVALID");

  return Object.freeze({
    missionId:checkpoint.mission.mission_id,
    missionSha256:checkpoint.mission_sha256,
    jobFingerprint:checkpoint.job_fingerprint,
    checkpointRecordSha256:checkpoint.checkpoint_record_sha256,
    selectedExecutorId:safeId(checkpoint.selected_executor_id,"selected executor id"),
    providerFamily:safeId(checkpoint.provider_family,"provider family"),
    executionDomain:safeId(checkpoint.execution_domain,"execution domain"),
    dispatchExternalId:checkpoint.dispatch_external_id,
    resultSha256:proof.result_sha256,
    acceptedReceiptSha256:proof.accepted_receipt_sha256,
    recoveryProofSha256:proof.proof_sha256
  });
}

export function deriveVinceRecoveryIdentityContract(binding){
  if(!plain(binding))throw new TypeError("vince recovery binding required");
  const roleContractHash=sha256({
    role:"vince.recovery",
    version:1,
    rules:[
      "existing-dispatch-ref-only",
      "no-submit-during-recovery",
      "uncertainty-never-authorizes-retry",
      "uncertainty-never-authorizes-failover",
      "verified-original-result-only"
    ]
  });
  const authorizationBindingHash=sha256({
    publicOnly:true,
    secretsAllowed:false,
    automaticRetryAllowed:false,
    failoverOnUncertaintyAllowed:false,
    coreMutationAllowed:false,
    trustModificationAllowed:false,
    humanReviewRequired:true
  });
  return Object.freeze({
    logicalRequestId:binding.missionId,
    roleId:"vince.recovery",
    roleContractHash,
    requestHash:binding.missionSha256,
    authorizationBindingHash,
    idempotencyClass:"synthetic"
  });
}

export async function persistVinceRecoveryExecutionIdentity({
  root,
  checkpoint,
  proof,
  at=new Date()
}={}){
  if(typeof root!=="string"||!root.trim())throw new TypeError("vince execution identity root required");
  const binding=validateVinceRecoveryPair({checkpoint,proof});
  const contract=deriveVinceRecoveryIdentityContract(binding);
  const store=await new ExecutionIdentityStore({root}).init();
  const created=await store.create({...contract,createdAt:at});
  const identity=created.identity;

  const participantDescriptorHash=sha256({
    executorId:binding.selectedExecutorId,
    providerFamily:binding.providerFamily,
    executionDomain:binding.executionDomain
  });
  const runtimeBindingHash=sha256({
    providerFamily:binding.providerFamily,
    executionDomain:binding.executionDomain,
    dispatchExternalId:binding.dispatchExternalId
  });
  const roleConformanceEvidenceHash=sha256({
    checkpointRecordSha256:binding.checkpointRecordSha256,
    recoveryProofSha256:binding.recoveryProofSha256,
    automaticRetryPerformed:false,
    failoverAuthorized:false
  });
  const ownerBindingHash=sha256({
    selectedExecutorId:binding.selectedExecutorId,
    dispatchExternalId:binding.dispatchExternalId
  });

  let attempts=await store.listAttempts(identity.executionId);
  let attempt;
  if(attempts.length===0){
    const added=await store.createAttempt(identity.executionId,{
      participantId:binding.selectedExecutorId,
      participantDescriptorHash,
      runtimeBindingHash,
      roleConformanceEvidenceHash,
      requestId:binding.missionId,
      jobId:binding.missionId,
      payloadHash:binding.jobFingerprint,
      selectedNodeId:binding.executionDomain,
      ownerBindingHash,
      plannedAt:at
    });
    attempt=added.attempt;
  }else{
    if(attempts.length!==1)throw new Error("VINCE_SIGNED_RECOVERY_ATTEMPT_COUNT_INVALID");
    attempt=attempts[0];
    const expected={
      participantId:binding.selectedExecutorId,
      participantDescriptorHash,
      runtimeBindingHash,
      roleConformanceEvidenceHash,
      requestId:binding.missionId,
      jobId:binding.missionId,
      payloadHash:binding.jobFingerprint,
      selectedNodeId:binding.executionDomain,
      ownerBindingHash
    };
    for(const [key,value] of Object.entries(expected)){
      if(attempt[key]!==value)throw new Error("VINCE_SIGNED_RECOVERY_ATTEMPT_DRIFT");
    }
  }

  const status=await store.attemptStatus(identity.executionId,attempt.attemptId);
  if(status.state==="planned")await store.markAttemptStarted(identity.executionId,attempt.attemptId,{startedAt:at});
  const afterStart=await store.attemptStatus(identity.executionId,attempt.attemptId);
  if(afterStart.state==="started"){
    await store.markAttemptCompleted(identity.executionId,attempt.attemptId,{
      resultHash:binding.resultSha256,
      completedAt:at
    });
  }
  const finalStatus=await store.status(identity.executionId);
  if(finalStatus.latestAttempt?.state!=="completed"||
     finalStatus.latestAttempt.resultHash!==binding.resultSha256)
    throw new Error("VINCE_SIGNED_RECOVERY_EXECUTION_NOT_COMPLETED");

  return Object.freeze({
    format:ARCA_VINCE_RECOVERY_IDENTITY_FORMAT,
    version:1,
    binding,
    contract,
    identity:finalStatus.identity,
    attempt:finalStatus.latestAttempt.attempt,
    completionHash:finalStatus.latestAttempt.completion.recordHash,
    executionState:finalStatus.state,
    identityStore:store
  });
}

export function buildVinceRecoveryReceiptBody(persisted){
  if(!plain(persisted)||persisted.format!==ARCA_VINCE_RECOVERY_IDENTITY_FORMAT)
    throw new TypeError("persisted Vince recovery identity required");
  const {binding,identity,attempt,completionHash}=persisted;
  return Object.freeze({
    format:ARCA_VINCE_RECOVERY_RECEIPT_FORMAT,
    version:1,
    executionId:identity.executionId,
    executionHash:identity.recordHash,
    attemptId:attempt.attemptId,
    attemptHash:attempt.recordHash,
    completionHash:safeHash(completionHash,"completion hash"),
    missionId:binding.missionId,
    missionSha256:binding.missionSha256,
    checkpointRecordSha256:binding.checkpointRecordSha256,
    dispatchExternalId:binding.dispatchExternalId,
    resultSha256:binding.resultSha256,
    acceptedReceiptSha256:binding.acceptedReceiptSha256,
    recoveryProofSha256:binding.recoveryProofSha256,
    recoveryState:"RECOVERED_VERIFIED_RESULT",
    networkDispatchPerformed:false,
    automaticRetryPerformed:false,
    failoverAuthorized:false,
    duplicateDispatchDetected:false,
    authorityExpanded:false
  });
}

export function signVinceRecoveryReceipt(receipt,signer,options={}){
  if(!plain(receipt)||receipt.format!==ARCA_VINCE_RECOVERY_RECEIPT_FORMAT)
    throw new TypeError("vince recovery receipt invalid");
  return signMeshStatement(receipt,{
    ...signer,
    ...options,
    domain:MESH_VINCE_RECOVERY_RECEIPT_DOMAIN
  });
}

export function verifySignedVinceRecoveryReceipt(statement,{trustStore,now=new Date(),clockSkewMs=0}={}){
  verifyMeshSignedStatement(statement,{
    expectedDomain:MESH_VINCE_RECOVERY_RECEIPT_DOMAIN,
    now,
    clockSkewMs
  });
  if(typeof trustStore?.verify!=="function")throw new TypeError("Mesh trust store required");
  trustStore.verify(statement,{
    expectedDomain:MESH_VINCE_RECOVERY_RECEIPT_DOMAIN,
    expectedNodeId:statement.signer.nodeId,
    now,
    clockSkewMs
  });
  const p=statement.payload;
  if(!plain(p)||p.format!==ARCA_VINCE_RECOVERY_RECEIPT_FORMAT||
     p.version!==1||p.recoveryState!=="RECOVERED_VERIFIED_RESULT"||
     p.networkDispatchPerformed!==false||p.automaticRetryPerformed!==false||
     p.failoverAuthorized!==false||p.duplicateDispatchDetected!==false||
     p.authorityExpanded!==false)
    throw new Error("VINCE_SIGNED_RECOVERY_RECEIPT_POLICY_INVALID");
  for(const key of ["executionHash","attemptHash","completionHash","missionSha256","checkpointRecordSha256","resultSha256","acceptedReceiptSha256","recoveryProofSha256"])
    safeHash(p[key],key);
  safeDispatch(p.dispatchExternalId,"dispatchExternalId");
  return true;
}
