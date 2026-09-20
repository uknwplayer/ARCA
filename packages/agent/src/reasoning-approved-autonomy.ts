import {createHash} from "node:crypto";
import {
  AutonomyWorkflowCoordinator,
  type AutonomyWorkflowInput
} from "./autonomy-workflow.ts";
import {
  DurableReasoningPendingCoordinator,
  DurableReasoningPendingRuntime
} from "./reasoning-pending.ts";
import {ReasoningOutputReviewGate} from "./reasoning-output-review.ts";
import {ReviewAutonomyRuntime} from "./review-autonomy-runtime.ts";
import {HumanReviewQueue} from "./reviews.ts";
import type {ReasoningRunInput} from "./reasoning-capability.ts";

export const ARCA_REASONING_APPROVED_AUTONOMY_FORMAT="arca-reasoning-approved-autonomy-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;

function safeId(value:unknown,label:string){
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new TypeError(`${label} invalido`);
  return value;
}
function hash(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex")}

export type ReasoningApprovedAutonomyRegistration={
  reasoning:ReasoningRunInput;
  workflow:AutonomyWorkflowInput;
};

export class ReasoningApprovedAutonomyBridge{
  readonly reasoning:DurableReasoningPendingCoordinator;
  readonly workflow:AutonomyWorkflowCoordinator;
  readonly reviewRuntime:ReviewAutonomyRuntime;
  readonly reviewGate:ReasoningOutputReviewGate;

  constructor(input:{
    reasoning:DurableReasoningPendingCoordinator;
    workflow:AutonomyWorkflowCoordinator;
    reviewRuntime:ReviewAutonomyRuntime;
    reviewGate?:ReasoningOutputReviewGate;
  }){
    if(!(input?.reasoning instanceof DurableReasoningPendingCoordinator))throw new TypeError("DurableReasoningPendingCoordinator obrigatorio");
    if(!(input?.workflow instanceof AutonomyWorkflowCoordinator))throw new TypeError("AutonomyWorkflowCoordinator obrigatorio");
    if(!(input?.reviewRuntime instanceof ReviewAutonomyRuntime))throw new TypeError("ReviewAutonomyRuntime obrigatorio");
    this.reasoning=input.reasoning;
    this.workflow=input.workflow;
    this.reviewRuntime=input.reviewRuntime;
    this.reviewGate=input.reviewGate??new ReasoningOutputReviewGate(new HumanReviewQueue(this.reasoning.store.home));
  }

  private async materializeCompleted(value:any){
    if(value?.state!=="completed"||!value?.result)throw new Error("reasoning approved autonomy exige resultado completed");
    const reviewed=await this.reviewGate.materialize(value.result);
    return Object.freeze({
      format:ARCA_REASONING_APPROVED_AUTONOMY_FORMAT,
      version:"1.0.0",
      requestId:value.requestId,
      payloadId:value.payloadId,
      state:String(reviewed.gate?.state??"awaiting-human-review"),
      reasoningCompleted:true,
      reviewId:reviewed.review?.reviewId??null,
      privacyClass:reviewed.classification?.privacyClass??null,
      outputHash:reviewed.outputHash,
      authorizedToContinue:reviewed.gate?.authorizedToContinue===true,
      coreMutationPerformed:false
    });
  }

  async register(input:ReasoningApprovedAutonomyRegistration,options:{decidedAt?:string;signal?:AbortSignal}={}){
    if(!input||typeof input!=="object")throw new TypeError("ReasoningApprovedAutonomyRegistration obrigatorio");
    const reasoningRequestId=safeId(input.reasoning?.requestId,"reasoning.requestId");
    const workflowRequestId=safeId(input.workflow?.requestId,"workflow.requestId");
    if(reasoningRequestId!==workflowRequestId)throw new Error("reasoning/workflow requestId divergente");

    const registration=await this.workflow.register(this.reviewRuntime,input.workflow);
    const started=await this.reasoning.start(input.reasoning,options);
    if(started?.state==="completed"){
      const review=await this.materializeCompleted(started);
      return Object.freeze({
        ...review,
        workflowDefinitionHash:registration.workflow.definitionHash,
        workflowIntentHash:registration.intent.recordHash,
        workflowContextRef:registration.contextRef
      });
    }
    return Object.freeze({
      format:ARCA_REASONING_APPROVED_AUTONOMY_FORMAT,
      version:"1.0.0",
      requestId:reasoningRequestId,
      payloadId:started?.payloadId??input.reasoning.payloadId,
      state:String(started?.state??"awaiting-reasoning"),
      reasoningCompleted:false,
      reviewId:null,
      privacyClass:null,
      outputHash:null,
      authorizedToContinue:false,
      workflowDefinitionHash:registration.workflow.definitionHash,
      workflowIntentHash:registration.intent.recordHash,
      workflowContextRef:registration.contextRef,
      coreMutationPerformed:false
    });
  }

  async handleReady(event:any){
    const requestId=safeId(event?.requestId,"ready.requestId");
    if(event?.format!=="arca-durable-reasoning-ready-v1")throw new Error("durable reasoning ready event invalido");
    const value=await this.reasoning.collect(requestId);
    if(value?.state!=="completed")throw new Error("durable reasoning ready event sem resultado completed");
    const reviewed=await this.materializeCompleted(value);
    return Object.freeze({
      ...reviewed,
      readySequence:event.readySequence,
      readyIdempotencyKey:String(event.idempotencyKey??""),
      readyEventHash:hash({
        requestId,
        readySequence:event.readySequence,
        terminalResultHash:event.terminalResultHash??null
      })
    });
  }

  createPendingRuntime({
    intervalMs=10_000,
    onReady
  }:{
    intervalMs?:number;
    onReady?:(value:{event:any;review:any})=>Promise<void>|void;
  }={}){
    return new DurableReasoningPendingRuntime(this.reasoning,{
      intervalMs,
      onReady:async event=>{
        const review=await this.handleReady(event);
        await onReady?.({event,review});
      }
    });
  }

  async status(requestIdInput:string){
    const requestId=safeId(requestIdInput,"requestId");
    const reasoning=await this.reasoning.getStatus(requestId);
    const review=await this.reviewGate.status(requestId);
    const workflow=await this.workflow.store.getIfExists(requestId);
    return Object.freeze({
      format:ARCA_REASONING_APPROVED_AUTONOMY_FORMAT,
      version:"1.0.0",
      requestId,
      state:review.reviewIds.length?review.state:reasoning.state,
      reasoning,
      review,
      workflow:workflow?{
        state:workflow.state,
        cursor:workflow.cursor,
        definitionHash:workflow.definitionHash,
        recordHash:workflow.recordHash
      }:null
    });
  }
}
