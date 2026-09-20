import {createHash} from "node:crypto";
import {CognitiveSubstitutionRouter} from "./cognitive-substitution.ts";
import {ReconciledFailoverController} from "../../../src/machine-bridge/reconciled-failover.mjs";

export const ARCA_RECONCILED_SUBSTITUTION_PREPARATION_FORMAT="arca-reconciled-substitution-preparation-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:JSON.stringify(stableValue(value))).digest("hex")}
function safeId(value,label){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);return value}
function safeHash(value,label){if(typeof value!=="string"||!HASH.test(value))throw new Error("invalid "+label);return value}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function coded(code,message,metadata={}){
  const error=new Error(message);
  error.code=code;
  Object.assign(error,metadata);
  return error;
}
function normalizeDescriptor(value){
  if(!plain(value))throw new TypeError("next-attempt descriptor required");
  return Object.freeze({
    requestId:safeId(value.requestId,"next-attempt requestId"),
    jobId:safeId(value.jobId,"next-attempt jobId"),
    payloadHash:safeHash(value.payloadHash,"next-attempt payloadHash"),
    selectedNodeId:safeId(value.selectedNodeId,"next-attempt selectedNodeId")
  });
}

export class ReconciledSubstitutionCoordinator{
  constructor({
    router,
    failoverController,
    ownershipStore,
    relayNodeId,
    buildAttemptDescriptor,
    now=()=>new Date()
  }={}){
    if(!(router instanceof CognitiveSubstitutionRouter))throw new TypeError("CognitiveSubstitutionRouter required");
    if(!(failoverController instanceof ReconciledFailoverController))throw new TypeError("ReconciledFailoverController required");
    if(typeof ownershipStore?.reserve!=="function"||typeof ownershipStore?.status!=="function"){
      throw new TypeError("Cross-Peer ownership store reserve/status required");
    }
    if(typeof buildAttemptDescriptor!=="function")throw new TypeError("buildAttemptDescriptor(context) required");
    if(typeof now!=="function")throw new TypeError("reconciled substitution clock required");
    this.router=router;
    this.failoverController=failoverController;
    this.ownershipStore=ownershipStore;
    this.relayNodeId=safeId(relayNodeId,"relayNodeId");
    this.buildAttemptDescriptor=buildAttemptDescriptor;
    this.now=now;
  }

  async #recoverPrepared(status){
    if(status.attemptCount<2||status.latestAttempt?.state!=="planned")return null;
    const previous=status.attempts.at(-2);
    if(!previous||previous.state!=="superseded")return null;
    const receipt=await this.failoverController.executionStore.getFailoverReceipt(
      status.identity.executionId,
      previous.attempt.attemptId,
      {trustStore:this.failoverController.trustStore}
    );
    if(!receipt)return null;
    const preparation=await this.failoverController.executionStore.getReplacementPreparation(
      status.identity.executionId,
      status.latestAttempt.attempt.attemptId
    );
    if(!preparation)throw coded("ARCA_REPLACEMENT_PREPARATION_MISSING","planned replacement attempt is missing durable preparation evidence");
    return Object.freeze({
      format:ARCA_RECONCILED_SUBSTITUTION_PREPARATION_FORMAT,
      version:1,
      state:"already-prepared",
      executionId:status.identity.executionId,
      fromAttemptId:previous.attempt.attemptId,
      nextAttemptId:status.latestAttempt.attempt.attemptId,
      previousParticipantId:previous.attempt.participantId,
      selectedParticipantId:status.latestAttempt.attempt.participantId,
      selectedParticipantDescriptorHash:status.latestAttempt.attempt.participantDescriptorHash,
      runtimeKind:preparation.runtimeKind,
      runtimeId:preparation.runtimeId,
      runtimeBindingHash:status.latestAttempt.attempt.runtimeBindingHash,
      roleConformanceEvidenceHash:status.latestAttempt.attempt.roleConformanceEvidenceHash,
      ownerBindingHash:status.latestAttempt.attempt.ownerBindingHash,
      failoverReceiptHash:receipt.receiptHash,
      authorizationDecisionHash:preparation.authorizationDecisionHash,
      selectionEvidenceHash:preparation.selectionEvidenceHash,
      excludedParticipantIds:Object.freeze([...(preparation.excludedParticipantIds??[preparation.previousParticipantId])]),
      preparationRecordHash:preparation.recordHash,
      automaticDispatchPerformed:false,
      dispatchAuthorizedByPreparation:false
    });
  }

  async prepare(executionId,{request,authorizationContext={}}={}){
    safeId(executionId,"executionId");
    if(!plain(request))throw new TypeError("reconciled substitution request required");

    const before=await this.failoverController.executionStore.status(executionId);
    if(!before)throw coded("ARCA_EXECUTION_NOT_FOUND","execution not found: "+executionId);
    const requestHash=sha256(request);
    if(requestHash!==before.identity.requestHash){
      throw coded("ARCA_RECONCILED_SUBSTITUTION_REQUEST_MISMATCH","replacement request does not match execution requestHash",{
        executionId,
        expectedRequestHash:before.identity.requestHash,
        receivedRequestHash:requestHash
      });
    }
    const currentRole=this.router.roleRegistry.get(before.identity.roleId);
    if(!currentRole||currentRole.contractHash!==before.identity.roleContractHash){
      throw coded("ARCA_RECONCILED_SUBSTITUTION_ROLE_STALE","execution is bound to a different role contract",{
        executionId,
        roleId:before.identity.roleId,
        executionRoleContractHash:before.identity.roleContractHash,
        currentRoleContractHash:currentRole?.contractHash??null
      });
    }
    const recovered=await this.#recoverPrepared(before);
    if(recovered)return recovered;
    if(!before.latestAttempt)throw coded("ARCA_EXECUTION_ATTEMPT_NOT_FOUND","execution has no attempt");

    const fromAttempt=before.latestAttempt.attempt;
    const excludedParticipantIds=[...new Set(before.attempts.map(item=>item.attempt.participantId))].sort();
    const authorization=await this.failoverController.authorize(executionId,{now:this.now()});
    const receipt=authorization.receipt;

    if(receipt.roleId!==before.identity.roleId||receipt.fromAttemptId!==fromAttempt.attemptId){
      throw coded("ARCA_RECONCILED_SUBSTITUTION_BINDING_MISMATCH","failover authorization does not match current execution");
    }

    const preflight=await this.router.preflight(request,{
      roleId:before.identity.roleId,
      excludedParticipantIds,
      authorizationContext:{
        ...clone(authorizationContext),
        executionId,
        failoverReceiptHash:receipt.receiptHash,
        previousAttemptId:fromAttempt.attemptId
      }
    });

    if(preflight.resolved.participant.participantId===fromAttempt.participantId){
      throw coded("ARCA_RECONCILED_SUBSTITUTION_SAME_PARTICIPANT","router returned previous participant");
    }

    const descriptor=normalizeDescriptor(await this.buildAttemptDescriptor(Object.freeze({
      execution:clone(before.identity),
      previousAttempt:clone(fromAttempt),
      failoverReceipt:clone(receipt),
      request:clone(request),
      role:clone(preflight.resolved.contract),
      participant:clone(preflight.resolved.participant),
      conformance:clone(preflight.resolved.conformance),
      binding:clone(preflight.resolved.binding),
      authorization:clone(preflight.authorization)
    })));

    const reservation=await this.ownershipStore.reserve({
      requestId:descriptor.requestId,
      jobId:descriptor.jobId,
      payloadHash:descriptor.payloadHash,
      relayNodeId:this.relayNodeId,
      selectedNodeId:descriptor.selectedNodeId,
      now:this.now()
    });

    const next=await this.failoverController.prepareNextAttempt(executionId,{
      failoverReceipt:receipt,
      participantId:preflight.resolved.participant.participantId,
      participantDescriptorHash:preflight.resolved.participant.descriptorHash,
      runtimeBindingHash:preflight.resolved.binding.bindingHash,
      roleConformanceEvidenceHash:preflight.resolved.conformance.evidence.evidenceHash,
      requestId:descriptor.requestId,
      jobId:descriptor.jobId,
      payloadHash:descriptor.payloadHash,
      selectedNodeId:descriptor.selectedNodeId,
      ownerBindingHash:reservation.binding.recordHash,
      plannedAt:this.now()
    });

    const authorizationDecisionHash=sha256({
      allowed:preflight.authorization.allowed,
      authorizationId:preflight.authorization.authorizationId
    });
    const selectionEvidenceHash=sha256({
      executionRequestHash:before.identity.requestHash,
      excludedParticipantIds,
      roleContractHash:preflight.resolved.contract.contractHash,
      participantDescriptorHash:preflight.resolved.participant.descriptorHash,
      runtimeBindingHash:preflight.resolved.binding.bindingHash,
      roleConformanceEvidenceHash:preflight.resolved.conformance.evidence.evidenceHash,
      failoverReceiptHash:receipt.receiptHash
    });
    const durablePreparation=await this.failoverController.executionStore.storeReplacementPreparation(executionId,next.attempt.attemptId,{
      previousAttemptId:fromAttempt.attemptId,
      previousParticipantId:fromAttempt.participantId,
      selectedParticipantId:preflight.resolved.participant.participantId,
      selectedParticipantDescriptorHash:preflight.resolved.participant.descriptorHash,
      runtimeKind:preflight.resolved.binding.runtimeKind,
      runtimeId:preflight.resolved.binding.runtimeId,
      runtimeBindingHash:preflight.resolved.binding.bindingHash,
      roleConformanceEvidenceHash:preflight.resolved.conformance.evidence.evidenceHash,
      ownerBindingHash:reservation.binding.recordHash,
      failoverReceiptHash:receipt.receiptHash,
      requestHash:before.identity.requestHash,
      roleContractHash:before.identity.roleContractHash,
      authorizationDecisionHash,
      selectionEvidenceHash,
      excludedParticipantIds,
      preparedAt:this.now()
    });

    return Object.freeze({
      format:ARCA_RECONCILED_SUBSTITUTION_PREPARATION_FORMAT,
      version:1,
      state:"prepared",
      executionId,
      fromAttemptId:fromAttempt.attemptId,
      nextAttemptId:next.attempt.attemptId,
      previousParticipantId:fromAttempt.participantId,
      selectedParticipantId:preflight.resolved.participant.participantId,
      selectedParticipantDescriptorHash:preflight.resolved.participant.descriptorHash,
      runtimeKind:preflight.resolved.binding.runtimeKind,
      runtimeId:preflight.resolved.binding.runtimeId,
      runtimeBindingHash:preflight.resolved.binding.bindingHash,
      roleConformanceEvidenceHash:preflight.resolved.conformance.evidence.evidenceHash,
      remoteRequestId:descriptor.requestId,
      remoteJobId:descriptor.jobId,
      selectedNodeId:descriptor.selectedNodeId,
      payloadHash:descriptor.payloadHash,
      ownerBindingHash:reservation.binding.recordHash,
      failoverReceiptHash:receipt.receiptHash,
      requestHash:before.identity.requestHash,
      roleContractHash:before.identity.roleContractHash,
      authorizationDecisionHash,
      selectionEvidenceHash,
      excludedParticipantIds:Object.freeze([...excludedParticipantIds]),
      preparationRecordHash:durablePreparation.preparation.recordHash,
      automaticDispatchPerformed:false,
      dispatchAuthorizedByPreparation:false
    });
  }

  snapshot(){
    return Object.freeze({
      format:"arca-reconciled-substitution-coordinator-v1",
      version:1,
      preparesReplacementAttempt:true,
      dispatches:false,
      excludesPreviousParticipant:true,
      requiresCognitivePreflight:true,
      requiresRoleConformance:true,
      requiresSignedFailoverAuthorization:true,
      requiresCrossPeerOwnershipReservation:true
    });
  }
}
