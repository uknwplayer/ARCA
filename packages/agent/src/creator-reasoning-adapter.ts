import {createHash} from "node:crypto";
import {CapabilityRegistry} from "./capability-registry.ts";
import {classifyPrivacyRecord} from "./privacy-classification.ts";
import {ReasoningProviderRegistry} from "./reasoning-capability.ts";
import type {CreatorSession} from "./creator-control.ts";

export const CREATOR_REASONING_ADAPTER_FORMAT="arca-creator-reasoning-adapter-v1";

const SAFE_REQUEST_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const RESPONSE_FORMATS=new Set(["text","json"]);

export type CreatorReasoningAdapterOptions={
  providerId:string;
  responseFormat?:"text"|"json";
  allowExternal?:boolean;
  allowPrivateExternalReasoning?:boolean;
  externalProviderIdentityVerified?:boolean;
};

export type CreatorReasoningInput={
  message:string;
  requestId:string;
  session:CreatorSession;
  context?:{home?:string};
};

function normalizeRequestId(value:unknown){
  if(typeof value!=="string"||!SAFE_REQUEST_ID.test(value))throw new TypeError("Creator reasoning requestId invalido");
  return value;
}
function normalizeMessage(value:unknown){
  const message=String(value??"").trim();
  if(!message)throw new TypeError("Creator reasoning message obrigatoria");
  if(message.length>16000)throw new RangeError("Creator reasoning message excede 16000 caracteres");
  return message;
}
function normalizeProviderId(value:unknown){
  const id=String(value??"").trim();
  if(!/^[A-Za-z0-9._:-]{1,160}$/.test(id))throw new TypeError("Creator reasoning providerId invalido");
  return id;
}
function strongSession(session:any){
  return session?.authMethod==="webauthn"||session?.authMethod==="hardware-key";
}
function payloadIdFor(requestId:string){
  return `creator-chat.${createHash("sha256").update(requestId).digest("hex")}`;
}
function verifiedReasoningProvider(capabilities:CapabilityRegistry,providers:ReasoningProviderRegistry,providerId:string){
  const descriptor=providers.getDescriptor(providerId);
  if(!descriptor)throw new Error(`Creator reasoning provider desconhecido: ${providerId}`);
  const passport=capabilities.getPassport(providerId);
  if(!passport)throw new Error(`Creator reasoning provider nao registrado no Capability Registry: ${providerId}`);
  const reasoning=passport.capabilities.find((item:any)=>item.id==="reasoning");
  if(!reasoning)throw new Error(`Creator reasoning provider nao declara capability reasoning: ${providerId}`);
  if(reasoning.status!=="verified")throw new Error(`Creator reasoning exige capability reasoning verificada: ${providerId}`);
  if(passport.labels?.reasoningContract!=="v1")throw new Error("Creator reasoning contract label divergente");
  if(passport.labels?.transportHash!==descriptor.transportHash)throw new Error("Creator reasoning transport hash divergente do Capability Passport");
  if(passport.labels?.transportId!==descriptor.transportId)throw new Error("Creator reasoning transport id divergente do Capability Passport");
  if(passport.provider!==descriptor.provider||passport.model!==descriptor.model)throw new Error("Creator reasoning provider/model divergente do Capability Passport");
  return descriptor;
}

export function createCreatorChatHandlerFromReasoningProvider(
  providers:ReasoningProviderRegistry,
  capabilities:CapabilityRegistry,
  options:CreatorReasoningAdapterOptions
){
  if(!(providers instanceof ReasoningProviderRegistry))throw new TypeError("ReasoningProviderRegistry obrigatorio");
  if(!(capabilities instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio");
  if(!options||typeof options!=="object")throw new TypeError("CreatorReasoningAdapterOptions obrigatorio");
  const providerId=normalizeProviderId(options.providerId);
  const responseFormat=String(options.responseFormat??"json").trim().toLowerCase();
  if(!RESPONSE_FORMATS.has(responseFormat))throw new TypeError(`Creator reasoning responseFormat invalido: ${responseFormat}`);
  const allowExternal=options.allowExternal===true;
  const allowPrivateExternalReasoning=options.allowPrivateExternalReasoning===true;
  const externalProviderIdentityVerified=options.externalProviderIdentityVerified===true;

  return async function creatorReasoningHandler(input:CreatorReasoningInput){
    const requestId=normalizeRequestId(input?.requestId);
    const message=normalizeMessage(input?.message);
    if(!input?.session||typeof input.session!=="object")throw new TypeError("Creator session obrigatoria");
    const subject=String(input.session.subject??"").trim();
    if(!subject)throw new TypeError("Creator session subject obrigatorio");

    const descriptor=verifiedReasoningProvider(capabilities,providers,providerId);
    if(descriptor.external===true){
      if(!allowExternal)throw new Error("Creator reasoning externo nao autorizado pelo host");
      if(!allowPrivateExternalReasoning)throw new Error("Creator reasoning privado externo nao autorizado pelo host");
      if(!externalProviderIdentityVerified)throw new Error("Creator reasoning externo exige identidade/endpoint verificado");
      if(!strongSession(input.session))throw new Error("Creator reasoning externo exige sessao forte WebAuthn/hardware-key");
    }

    const payloadId=payloadIdFor(requestId);
    const classification=classifyPrivacyRecord({
      recordId:payloadId,
      subjectType:"mixed",
      sourceType:"user-provided",
      privacyClass:"restricted",
      purpose:"Creator Chat semantic reasoning",
      indicators:{
        privateCommunication:true,
        canMinimize:false
      },
      sourceRefs:[`creator-chat:${requestId}`]
    });

    const reasoning=await providers.run(providerId,{
      requestId,
      payloadId,
      instruction:message,
      context:{
        channel:"arca-creator-console"
      },
      responseFormat:responseFormat as "text"|"json",
      classification,
      purposeConfirmed:true,
      providerVerified:descriptor.external===true?externalProviderIdentityVerified:false,
      privateProcessingAuthorized:descriptor.external===true?allowPrivateExternalReasoning:false,
      publicPayloadApproved:false
    });

    if(reasoning?.requestId!==requestId)throw new Error("Creator reasoning perdeu correlacao de requestId");
    if(reasoning?.humanReviewRequired!==true)throw new Error("Creator reasoning recusa resultado sem Human Review boundary");
    if(reasoning?.coreMutationPerformed!==false)throw new Error("Creator reasoning recusa resultado que declare Core mutation");

    return Object.freeze({
      format:CREATOR_REASONING_ADAPTER_FORMAT,
      version:"1.0.0",
      requestId,
      payloadId,
      provider:{
        providerId:descriptor.providerId,
        provider:descriptor.provider,
        model:descriptor.model,
        external:descriptor.external,
        transportId:descriptor.transportId,
        transportKind:descriptor.transportKind,
        descriptorHash:descriptor.descriptorHash
      },
      reasoningCapabilityVerified:true,
      privacyClass:classification.privacyClass,
      classificationHash:classification.classificationHash,
      payloadHash:reasoning.payloadHash,
      transportDecisionHash:reasoning.transportDecisionHash,
      humanReviewRequired:true,
      coreMutationPerformed:false,
      privacyReclassificationRequired:true,
      output:reasoning.output
    });
  };
}
