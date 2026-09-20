import {createHash} from "node:crypto";
import {CognitiveSubstitutionRouter} from "./cognitive-substitution.ts";
import {ExecutionIdentityStore} from "../../../src/machine-bridge/execution-identity.mjs";
import {CrossPeerRequestOwnershipStore,crossPeerFailureCategory} from "../../../src/machine-bridge/cross-peer-request-ownership.mjs";

export const ARCA_CONTROLLED_REPLACEMENT_DISPATCH_RESULT_FORMAT="arca-controlled-replacement-dispatch-result-v1";

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
function resultHash(result){
  if(!plain(result))throw coded("ARCA_REPLACEMENT_RESULT_INVALID","replacement dispatch result must be a structured object");
  if(typeof result.resultHash==="string"&&HASH.test(result.resultHash))return result.resultHash;
  return sha256(result);
}
function authorizationHash(value){
  return sha256({allowed:value.allowed,authorizationId:value.authorizationId});
}

export class ControlledReplacementDispatcher{
  constructor({
    router,
    executionStore,
    ownershipStore,
    dispatchAttempt,
    now=()=>new Date()
  }={}){
    if(!(router instanceof CognitiveSubstitutionRouter))throw new TypeError("CognitiveSubstitutionRouter required");
    if(!(executionStore instanceof ExecutionIdentityStore))throw new TypeError("ExecutionIdentityStore required");
    if(!(ownershipStore instanceof CrossPeerRequestOwnershipStore))throw new TypeError("CrossPeerRequestOwnershipStore required");
    if(typeof dispatchAttempt!=="function")throw new TypeError("dispatchAttempt(context) required");
    if(typeof now!=="function")throw new TypeError("controlled replacement clock required");
    this.router=router;
    this.executionStore=executionStore;
    this.ownershipStore=ownershipStore;
    this.dispatchAttempt=dispatchAttempt;
    this.now=now;
  }

  async #recoverWithoutDispatch(status,ownership){
    const attempt=status.latestAttempt.attempt;
    if(status.latestAttempt.state==="planned"&&["in-flight","uncertain","completed"].includes(ownership.state)){
      await this.executionStore.markAttemptStarted(status.identity.executionId,attempt.attemptId,{startedAt:ownership.dispatchStartedAt??this.now()});
      status=await this.executionStore.status(status.identity.executionId);
    }
    if(ownership.state==="completed"&&status.latestAttempt.state!=="completed"){
      await this.executionStore.markAttemptCompleted(status.identity.executionId,attempt.attemptId,{
        resultHash:safeHash(ownership.resultHash,"ownership resultHash"),
        completedAt:ownership.completedAt??this.now()
      });
      status=await this.executionStore.status(status.identity.executionId);
    }
    if(ownership.state==="completed"){
      return Object.freeze({
        format:ARCA_CONTROLLED_REPLACEMENT_DISPATCH_RESULT_FORMAT,
        version:1,
        state:"completed-recovered",
        executionId:status.identity.executionId,
        attemptId:attempt.attemptId,
        participantId:attempt.participantId,
        networkDispatchPerformed:false,
        automaticRetryPerformed:false,
        resultHash:ownership.resultHash
      });
    }
    if(ownership.state==="uncertain"){
      return Object.freeze({
        format:ARCA_CONTROLLED_REPLACEMENT_DISPATCH_RESULT_FORMAT,
        version:1,
        state:"uncertain",
        executionId:status.identity.executionId,
        attemptId:attempt.attemptId,
        participantId:attempt.participantId,
        networkDispatchPerformed:false,
        automaticRetryPerformed:false,
        failureCategory:ownership.failureCategory
      });
    }
    if(ownership.state==="in-flight"){
      return Object.freeze({
        format:ARCA_CONTROLLED_REPLACEMENT_DISPATCH_RESULT_FORMAT,
        version:1,
        state:"already-dispatched",
        executionId:status.identity.executionId,
        attemptId:attempt.attemptId,
        participantId:attempt.participantId,
        networkDispatchPerformed:false,
        automaticRetryPerformed:false
      });
    }
    return null;
  }

  async dispatch(executionId,{request,authorizationContext={}}={}){
    safeId(executionId,"executionId");
    if(!plain(request))throw new TypeError("replacement dispatch request required");
    let status=await this.executionStore.status(executionId);
    if(!status||!status.latestAttempt)throw coded("ARCA_EXECUTION_NOT_FOUND","execution/attempt not found");
    const attempt=status.latestAttempt.attempt;
    if(attempt.attemptNumber<2)throw coded("ARCA_REPLACEMENT_ATTEMPT_REQUIRED","controlled replacement dispatch requires attempt >= 2");
    if(status.latestAttempt.state==="superseded")throw coded("ARCA_REPLACEMENT_ATTEMPT_SUPERSEDED","cannot dispatch superseded replacement attempt");

    const preparation=await this.executionStore.getReplacementPreparation(executionId,attempt.attemptId);
    if(!preparation)throw coded("ARCA_REPLACEMENT_PREPARATION_MISSING","durable replacement preparation required");
    const requestHash=sha256(request);
    if(requestHash!==status.identity.requestHash||requestHash!==preparation.requestHash){
      throw coded("ARCA_REPLACEMENT_REQUEST_MISMATCH","replacement dispatch request does not match execution");
    }
    if(preparation.roleContractHash!==status.identity.roleContractHash){
      throw coded("ARCA_REPLACEMENT_ROLE_MISMATCH","replacement preparation role contract does not match execution");
    }

    let ownership=await this.ownershipStore.status(attempt.requestId);
    if(ownership.state==="unbound")throw coded("ARCA_REPLACEMENT_OWNERSHIP_MISSING","replacement attempt ownership reservation missing");
    if(
      ownership.requestId!==attempt.requestId||
      ownership.jobId!==attempt.jobId||
      ownership.payloadHash!==attempt.payloadHash||
      ownership.selectedNodeId!==attempt.selectedNodeId||
      ownership.bindingHash!==attempt.ownerBindingHash
    )throw coded("ARCA_REPLACEMENT_OWNERSHIP_MISMATCH","replacement ownership evidence does not match attempt");

    if(status.latestAttempt.state==="completed"){
      return Object.freeze({
        format:ARCA_CONTROLLED_REPLACEMENT_DISPATCH_RESULT_FORMAT,
        version:1,
        state:"completed",
        executionId,
        attemptId:attempt.attemptId,
        participantId:attempt.participantId,
        networkDispatchPerformed:false,
        automaticRetryPerformed:false,
        resultHash:status.latestAttempt.resultHash
      });
    }
    const recovered=await this.#recoverWithoutDispatch(status,ownership);
    if(recovered)return recovered;

    if(!["planned","started"].includes(status.latestAttempt.state))throw coded("ARCA_REPLACEMENT_STATE_INVALID","replacement attempt is not dispatchable");
    if(ownership.state!=="reserved")throw coded("ARCA_REPLACEMENT_OWNERSHIP_NOT_RESERVED","replacement ownership is not in reserved state");

    const preflight=await this.router.preflight(request,{
      roleId:status.identity.roleId,
      preferredParticipantId:attempt.participantId,
      requiredParticipantId:attempt.participantId,
      excludedParticipantIds:preparation.excludedParticipantIds??[preparation.previousParticipantId],
      authorizationContext:{
        ...clone(authorizationContext),
        executionId,
        attemptId:attempt.attemptId,
        preparationRecordHash:preparation.recordHash,
        controlledReplacementDispatch:true
      }
    });
    if(
      preflight.resolved.participant.participantId!==attempt.participantId||
      preflight.resolved.participant.descriptorHash!==attempt.participantDescriptorHash||
      preflight.resolved.binding.bindingHash!==attempt.runtimeBindingHash||
      preflight.resolved.conformance.evidence.evidenceHash!==attempt.roleConformanceEvidenceHash
    )throw coded("ARCA_REPLACEMENT_PREFLIGHT_DRIFT","replacement participant/runtime/conformance drifted after preparation");

    const currentAuthorizationHash=authorizationHash(preflight.authorization);
    const gate=await this.executionStore.storeDispatchGate(executionId,attempt.attemptId,{
      preparationHash:preparation.recordHash,
      participantId:attempt.participantId,
      participantDescriptorHash:attempt.participantDescriptorHash,
      runtimeBindingHash:attempt.runtimeBindingHash,
      roleConformanceEvidenceHash:attempt.roleConformanceEvidenceHash,
      authorizationDecisionHash:currentAuthorizationHash,
      authorizedAt:this.now()
    });

    if(status.latestAttempt.state==="planned"){
      await this.executionStore.markAttemptStarted(executionId,attempt.attemptId,{startedAt:this.now()});
      status=await this.executionStore.status(executionId);
    }

    const dispatchEvidence=await this.ownershipStore.markDispatchStarted(attempt.requestId,{now:this.now()});
    if(!dispatchEvidence.created){
      ownership=await this.ownershipStore.status(attempt.requestId);
      const afterRace=await this.#recoverWithoutDispatch(status,ownership);
      if(afterRace)return afterRace;
      throw coded("ARCA_REPLACEMENT_DISPATCH_ALREADY_STARTED","replacement dispatch already started; automatic retry refused");
    }

    let result;
    let hash;
    try{
      result=await this.dispatchAttempt(Object.freeze({
        execution:clone(status.identity),
        attempt:clone(attempt),
        preparation:clone(preparation),
        dispatchGate:clone(gate.gate),
        participant:clone(preflight.resolved.participant),
        binding:clone(preflight.resolved.binding),
        conformance:clone(preflight.resolved.conformance),
        authorization:clone(preflight.authorization),
        request:clone(request)
      }));
      if(result?.requestId!==undefined&&result.requestId!==attempt.requestId)throw coded("ARCA_REPLACEMENT_RESULT_CORRELATION_MISMATCH","replacement result correlation mismatch: requestId");
      if(result?.jobId!==undefined&&result.jobId!==attempt.jobId)throw coded("ARCA_REPLACEMENT_RESULT_CORRELATION_MISMATCH","replacement result correlation mismatch: jobId");
      hash=resultHash(result);
      await this.ownershipStore.markCompleted(attempt.requestId,{resultHash:hash,now:this.now()});
      await this.executionStore.markAttemptCompleted(executionId,attempt.attemptId,{resultHash:hash,completedAt:this.now()});
    }catch(cause){
      const observed=await this.ownershipStore.status(attempt.requestId);
      if(observed.state==="completed"){
        const local=await this.executionStore.status(executionId);
        const recoveredCompletion=await this.#recoverWithoutDispatch(local,observed);
        if(recoveredCompletion)return recoveredCompletion;
      }
      const category=crossPeerFailureCategory(cause);
      await this.ownershipStore.markUncertain(attempt.requestId,{category,now:this.now()});
      throw coded("ARCA_REPLACEMENT_DISPATCH_UNCERTAIN","replacement dispatch outcome is uncertain; automatic retry refused",{
        executionId,
        attemptId:attempt.attemptId,
        participantId:attempt.participantId,
        failureCategory:category,
        automaticRetryPerformed:false,
        cause
      });
    }

    return Object.freeze({
      format:ARCA_CONTROLLED_REPLACEMENT_DISPATCH_RESULT_FORMAT,
      version:1,
      state:"completed",
      executionId,
      attemptId:attempt.attemptId,
      participantId:attempt.participantId,
      runtimeKind:preparation.runtimeKind,
      runtimeId:preparation.runtimeId,
      dispatchGateHash:gate.gate.recordHash,
      networkDispatchPerformed:true,
      automaticRetryPerformed:false,
      resultHash:hash,
      output:result
    });
  }

  snapshot(){
    return Object.freeze({
      format:"arca-controlled-replacement-dispatcher-v1",
      version:1,
      exactPreparedParticipantOnly:true,
      livePreflightRequired:true,
      dispatchGateRequired:true,
      crossPeerDispatchEvidenceRequired:true,
      automaticRetryAfterDispatch:false,
      automaticPostStartFailover:false
    });
  }
}
