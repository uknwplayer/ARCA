import {createHash} from "node:crypto";
import {classifyPrivacyRecord} from "./privacy-classification.ts";
import {HumanReviewQueue} from "./reviews.ts";
import {ReasoningOutputReviewGate} from "./reasoning-output-review.ts";
import {
  DurableReasoningPendingCoordinator
} from "./reasoning-pending.ts";
import type {CreatorSession} from "./creator-control.ts";

export const CREATOR_DURABLE_REASONING_FORMAT="arca-creator-durable-reasoning-v1";

const SAFE_REQUEST_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const RESPONSE_FORMATS=new Set(["text","json"]);

export type CreatorDurableReasoningOptions={
  responseFormat?:"text"|"json";
  outputReviewGate?:ReasoningOutputReviewGate;
  outputPrivacyClass?:"public"|"personal"|"sensitive"|"high-risk"|"restricted"|"redact-before-publication";
};

type CreatorInput={message:string;requestId:string;session:CreatorSession;context?:{home?:string}};
type CreatorStatusInput={requestId:string;session:CreatorSession;context?:{home?:string}};

function requestId(value:unknown){
  if(typeof value!=="string"||!SAFE_REQUEST_ID.test(value))throw new TypeError("Creator durable reasoning requestId invalido");
  return value;
}
function message(value:unknown){
  const text=String(value??"").trim();
  if(!text)throw new TypeError("Creator durable reasoning message obrigatoria");
  if(text.length>16000)throw new RangeError("Creator durable reasoning message excede 16000 caracteres");
  return text;
}
function strongSession(session:any){return session?.authMethod==="webauthn"||session?.authMethod==="hardware-key"}
function payloadIdFor(rid:string){return `creator-chat.${createHash("sha256").update(rid).digest("hex")}`}
function sessionCheck(session:any){
  if(!session||typeof session!=="object"||!String(session.subject??"").trim())throw new TypeError("Creator session obrigatoria");
  if(!strongSession(session))throw new Error("Creator durable private reasoning exige sessao forte WebAuthn/hardware-key");
}
function publicProvider(coordinator:DurableReasoningPendingCoordinator){
  const descriptor=coordinator.providerRegistry.getDescriptor(coordinator.providerId);
  if(!descriptor)throw new Error("Creator durable reasoning provider indisponivel");
  return Object.freeze({
    providerId:descriptor.providerId,
    provider:descriptor.provider,
    model:descriptor.model,
    external:descriptor.external,
    transportId:descriptor.transportId,
    transportKind:descriptor.transportKind,
    descriptorHash:descriptor.descriptorHash
  });
}
function wrapStatus(coordinator:DurableReasoningPendingCoordinator,status:any){
  return Object.freeze({
    format:CREATOR_DURABLE_REASONING_FORMAT,
    version:"1.0.0",
    requestId:status.requestId,
    payloadId:status.payloadId,
    state:status.state,
    provider:publicProvider(coordinator),
    reasoningCapabilityVerified:true,
    humanReviewRequired:true,
    coreMutationPerformed:false,
    privacyReclassificationRequired:true,
    readySequence:status.readySequence??0,
    terminalResultHash:status.terminalResultHash??null,
    finalResultHash:status.finalResultHash??null
  });
}
function wrapReviewStatus(coordinator:DurableReasoningPendingCoordinator,status:any,gate:any){
  const authorized=gate?.authorizedToContinue===true;
  return Object.freeze({
    ...wrapStatus(coordinator,status),
    state:authorized?"completed":String(gate?.state??status.state),
    privacyReclassificationRequired:false,
    review:{
      reviewIds:Array.isArray(gate?.reviewIds)?[...gate.reviewIds]:[],
      pendingReviewIds:Array.isArray(gate?.pendingReviewIds)?[...gate.pendingReviewIds]:[],
      gateState:gate?.state??null,
      authorizedToContinue:authorized
    }
  });
}
async function wrapReviewedCompleted(
  coordinator:DurableReasoningPendingCoordinator,
  reviewGate:ReasoningOutputReviewGate,
  value:any,
  outputPrivacyClass:CreatorDurableReasoningOptions["outputPrivacyClass"]
){
  if(value?.state!=="completed"||!value?.result)throw new Error("Creator durable reasoning completed result invalido");
  const record=value.record;
  const reviewed=await reviewGate.materialize(value.result,{privacyClass:outputPrivacyClass??"restricted"});
  const authorized=reviewed.gate?.authorizedToContinue===true;
  return Object.freeze({
    format:CREATOR_DURABLE_REASONING_FORMAT,
    version:"1.0.0",
    requestId:value.requestId,
    payloadId:value.payloadId,
    state:authorized?"completed":String(reviewed.gate?.state??"awaiting-human-review"),
    provider:publicProvider(coordinator),
    reasoningCapabilityVerified:true,
    privacyClass:reviewed.classification?.privacyClass??record?.privacyClass??null,
    classificationHash:reviewed.classification?.classificationHash??record?.classificationHash??null,
    payloadHash:value.result.reasoning?.payloadHash??record?.payloadHash??null,
    transportDecisionHash:value.result.transportDecisionHash,
    opaqueRelayAttestationHash:value.result.opaqueRelayAttestationHash,
    executionEvidenceHash:value.result.executionEvidenceHash,
    review:{
      reviewId:reviewed.review?.reviewId??null,
      status:reviewed.review?.status??null,
      recordHash:reviewed.review?.recordHash??null,
      gateState:reviewed.gate?.state??null,
      authorizedToContinue:authorized,
      outputHash:reviewed.outputHash,
      outputBytes:reviewed.outputBytes,
      outputPersistedInReview:reviewed.outputPersistedInReview
    },
    humanReviewRequired:true,
    coreMutationPerformed:false,
    privacyReclassificationRequired:false,
    output:value.result.reasoning?.output
  });
}

export function createCreatorDurableReasoningHandlers(
  coordinator:DurableReasoningPendingCoordinator,
  options:CreatorDurableReasoningOptions={}
){
  if(!(coordinator instanceof DurableReasoningPendingCoordinator))throw new TypeError("DurableReasoningPendingCoordinator obrigatorio");
  const responseFormat=String(options.responseFormat??"json").trim().toLowerCase();
  if(!RESPONSE_FORMATS.has(responseFormat))throw new TypeError("Creator durable reasoning responseFormat invalido");
  const reviewGate=options.outputReviewGate??new ReasoningOutputReviewGate(new HumanReviewQueue(coordinator.store.home));

  return Object.freeze({
    chat:async(input:CreatorInput)=>{
      const rid=requestId(input?.requestId);const instruction=message(input?.message);sessionCheck(input?.session);
      const payloadId=payloadIdFor(rid);
      const classification=classifyPrivacyRecord({
        recordId:payloadId,
        subjectType:"mixed",
        sourceType:"user-provided",
        privacyClass:"restricted",
        purpose:"Creator Chat durable private reasoning",
        indicators:{privateCommunication:true,canMinimize:false},
        sourceRefs:[`creator-chat:${rid}`]
      });
      const result=await coordinator.start({
        requestId:rid,
        payloadId,
        instruction,
        context:{channel:"arca-creator-console"},
        responseFormat:responseFormat as "text"|"json",
        classification,
        purposeConfirmed:true,
        providerVerified:true,
        privateProcessingAuthorized:true,
        publicPayloadApproved:false
      });
      if(result?.state==="completed")return wrapReviewedCompleted(coordinator,reviewGate,result,options.outputPrivacyClass);
      return wrapStatus(coordinator,result);
    },
    status:async(input:CreatorStatusInput)=>{
      const rid=requestId(input?.requestId);sessionCheck(input?.session);
      const record=await coordinator.poll(rid);const status=coordinator.status(record);
      if(record.state==="completed"){
        const gate=await reviewGate.status(rid);
        if(Array.isArray(gate.reviewIds)&&gate.reviewIds.length)return wrapReviewStatus(coordinator,status,gate);
      }
      return wrapStatus(coordinator,status);
    },
    collect:async(input:CreatorStatusInput)=>{
      const rid=requestId(input?.requestId);sessionCheck(input?.session);
      const value=await coordinator.collect(rid);
      if(value?.state==="completed")return wrapReviewedCompleted(coordinator,reviewGate,value,options.outputPrivacyClass);
      return wrapStatus(coordinator,value);
    },
    list:async(input:{session:CreatorSession;context?:{home?:string}})=>{
      sessionCheck(input?.session);
      const records=await coordinator.store.list({states:["registered","awaiting-reasoning","result-ready"]});
      return Object.freeze({
        format:"arca-creator-durable-reasoning-list-v1",
        version:"1.0.0",
        items:records.map(record=>wrapStatus(coordinator,coordinator.status(record)))
      });
    }
  });
}
