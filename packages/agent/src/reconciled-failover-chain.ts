import {ReconciledSubstitutionCoordinator} from "./reconciled-substitution.ts";
import {ControlledReplacementDispatcher} from "./controlled-replacement-dispatch.ts";
import {ExecutionIdentityStore} from "../../../src/machine-bridge/execution-identity.mjs";

export const ARCA_RECONCILED_FAILOVER_CHAIN_RESULT_FORMAT="arca-reconciled-failover-chain-result-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const WAIT_REASONS=new Set([
  "remote-outcome-unseen",
  "remote-accepted",
  "remote-outcome-uncertain"
]);

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function safeId(value,label){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);return value}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function boundedInt(value,{label,min,max}){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error("invalid "+label);
  return n;
}
function publicTrace(trace){
  return Object.freeze(trace.map(item=>Object.freeze({...item})));
}
function result(state,status,trace,fields={}){
  return Object.freeze({
    format:ARCA_RECONCILED_FAILOVER_CHAIN_RESULT_FORMAT,
    version:1,
    state,
    executionId:status?.identity?.executionId??null,
    attemptCount:status?.attemptCount??0,
    latestAttemptId:status?.latestAttempt?.attempt?.attemptId??null,
    latestParticipantId:status?.latestAttempt?.attempt?.participantId??null,
    transitions:Object.freeze(publicTrace(trace)),
    safePreExecutionRejectionOnly:true,
    automaticNetworkRedispatch:false,
    automaticPostStartFailover:false,
    ...fields
  });
}

export class ReconciledFailoverChainController{
  constructor({
    coordinator,
    dispatcher,
    executionStore,
    maxAttempts=8,
    maxTransitionsPerRun=8
  }={}){
    if(!(coordinator instanceof ReconciledSubstitutionCoordinator))throw new TypeError("ReconciledSubstitutionCoordinator required");
    if(!(dispatcher instanceof ControlledReplacementDispatcher))throw new TypeError("ControlledReplacementDispatcher required");
    if(!(executionStore instanceof ExecutionIdentityStore))throw new TypeError("ExecutionIdentityStore required");
    this.coordinator=coordinator;
    this.dispatcher=dispatcher;
    this.executionStore=executionStore;
    this.maxAttempts=boundedInt(maxAttempts,{label:"maxAttempts",min:2,max:32});
    this.maxTransitionsPerRun=boundedInt(maxTransitionsPerRun,{label:"maxTransitionsPerRun",min:1,max:32});
  }

  async run(executionId,{request,authorizationContext={}}={}){
    safeId(executionId,"executionId");
    if(!plain(request))throw new TypeError("failover chain request required");
    const trace=[];

    for(let transition=0;transition<this.maxTransitionsPerRun;transition+=1){
      let status=await this.executionStore.status(executionId);
      if(!status)throw Object.assign(new Error("execution not found: "+executionId),{code:"ARCA_EXECUTION_NOT_FOUND"});
      if(!status.latestAttempt){
        return result("blocked",status,trace,{reason:"execution-has-no-attempt"});
      }
      if(status.latestAttempt.state==="completed"){
        return result("completed",status,trace,{
          resultHash:status.latestAttempt.resultHash,
          completedAttemptId:status.latestAttempt.attempt.attemptId
        });
      }

      const latest=status.latestAttempt;
      if(latest.attempt.attemptNumber>=2&&["planned","started"].includes(latest.state)){
        try{
          const dispatched=await this.dispatcher.dispatch(executionId,{
            request,
            authorizationContext:{
              ...clone(authorizationContext),
              failoverChain:true,
              chainAttemptNumber:latest.attempt.attemptNumber
            }
          });
          trace.push({
            kind:"dispatch",
            attemptId:latest.attempt.attemptId,
            participantId:latest.attempt.participantId,
            state:dispatched.state,
            networkDispatchPerformed:dispatched.networkDispatchPerformed===true
          });
          status=await this.executionStore.status(executionId);
          if(dispatched.state==="completed"||dispatched.state==="completed-recovered"||status?.latestAttempt?.state==="completed"){
            return result("completed",status,trace,{
              resultHash:status.latestAttempt.resultHash??dispatched.resultHash??null,
              completedAttemptId:status.latestAttempt.attempt.attemptId
            });
          }
        }catch(error){
          if(error?.code!=="ARCA_REPLACEMENT_DISPATCH_UNCERTAIN")throw error;
          trace.push({
            kind:"dispatch",
            attemptId:latest.attempt.attemptId,
            participantId:latest.attempt.participantId,
            state:"uncertain",
            failureCategory:error.failureCategory??"unknown",
            networkDispatchPerformed:true
          });
          status=await this.executionStore.status(executionId);
        }
      }

      status=await this.executionStore.status(executionId);
      if(status.latestAttempt?.state==="completed"){
        return result("completed",status,trace,{
          resultHash:status.latestAttempt.resultHash,
          completedAttemptId:status.latestAttempt.attempt.attemptId
        });
      }

      if(status.attemptCount>=this.maxAttempts){
        return result("attempt-limit-reached",status,trace,{
          reason:"max-attempts-reached",
          maxAttempts:this.maxAttempts
        });
      }

      try{
        const prepared=await this.coordinator.prepare(executionId,{
          request,
          authorizationContext:{
            ...clone(authorizationContext),
            failoverChain:true,
            chainFromAttemptId:status.latestAttempt?.attempt?.attemptId??null
          }
        });
        trace.push({
          kind:"prepare",
          fromAttemptId:prepared.fromAttemptId,
          nextAttemptId:prepared.nextAttemptId,
          previousParticipantId:prepared.previousParticipantId,
          selectedParticipantId:prepared.selectedParticipantId,
          state:prepared.state
        });
      }catch(error){
        status=await this.executionStore.status(executionId);
        if(error?.code==="ARCA_RECONCILED_FAILOVER_NOT_ELIGIBLE"){
          const reason=String(error.reason??"failover-not-eligible");
          return result(WAIT_REASONS.has(reason)?"awaiting-reconciliation":"blocked",status,trace,{
            reason,
            automaticReplacementPrepared:false
          });
        }
        if(error?.code==="ARCA_SUBSTITUTION_NO_ELIGIBLE_PARTICIPANT"){
          return result("awaiting-participant",status,trace,{
            reason:"no-eligible-participant",
            automaticReplacementPrepared:false
          });
        }
        throw error;
      }
    }

    const status=await this.executionStore.status(executionId);
    return result("bounded-run-paused",status,trace,{
      reason:"max-transitions-per-run",
      maxTransitionsPerRun:this.maxTransitionsPerRun
    });
  }

  snapshot(){
    return Object.freeze({
      format:"arca-reconciled-failover-chain-controller-v1",
      version:1,
      maxAttempts:this.maxAttempts,
      maxTransitionsPerRun:this.maxTransitionsPerRun,
      signedPreExecutionRejectionOnly:true,
      priorParticipantsExcluded:true,
      automaticReplacementPreparation:true,
      automaticReplacementDispatch:true,
      automaticNetworkRedispatch:false,
      automaticPostStartFailover:false,
      stateTransfer:false
    });
  }
}
