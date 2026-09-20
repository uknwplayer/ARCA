import {createHash} from "node:crypto";
import {CapabilityRegistry} from "./capability-registry.ts";
import {
  ARCA_REASONING_PROVIDER_RESULT_FORMAT,
  ARCA_REASONING_REQUEST_FORMAT,
  ReasoningProviderRegistry,
  type ReasoningRunInput
} from "./reasoning-capability.ts";
import {
  createOpaqueReasoningTransportAttestation,
  verifyReasoningTransportProfile
} from "./reasoning-transport-gate.ts";
import {
  DurableOpaqueRpcOriginClient,
  verifyDurableOpaqueRpcOriginResult
} from "../../../src/machine-bridge/durable-opaque-rpc-origin.mjs";

export const ARCA_DURABLE_OPAQUE_REASONING_EVIDENCE_FORMAT="arca-durable-opaque-reasoning-evidence-v1";
export const ARCA_VERIFIED_DURABLE_OPAQUE_REASONING_RESULT_FORMAT="arca-verified-durable-opaque-reasoning-result-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;

function plain(value:unknown):value is Record<string,any>{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function safeId(value:unknown,label:string){const text=String(value??"").trim();if(!SAFE_ID.test(text))throw new TypeError(label+" invalido");return text}
function stable(value:any):string{
  if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
  if(plain(value))return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stable(value[key])).join(",")+"}";
  return JSON.stringify(value);
}
function sha256(value:any){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function evidenceBody(value:any){const {evidenceHash:_ignored,...body}=value;return body}

export function verifyDurableOpaqueReasoningProvider(capabilities:CapabilityRegistry,providers:ReasoningProviderRegistry,providerId:string,transport:any){
  if(!(capabilities instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio");
  if(!(providers instanceof ReasoningProviderRegistry))throw new TypeError("ReasoningProviderRegistry obrigatorio");
  if(!verifyReasoningTransportProfile(transport)||transport.kind!=="opaque-relay")throw new Error("opaque-relay transport verificado obrigatorio");
  const descriptor=providers.getDescriptor(providerId);
  if(!descriptor)throw new Error("reasoning provider desconhecido: "+providerId);
  if(descriptor.transportKind!=="opaque-relay")throw new Error("reasoning provider nao usa opaque-relay");
  if(descriptor.transportId!==transport.transportId||descriptor.transportHash!==transport.profileHash)throw new Error("reasoning provider transport divergente");
  const passport=capabilities.getPassport(providerId);
  if(!passport)throw new Error("reasoning provider sem Capability Passport: "+providerId);
  const reasoning=passport.capabilities.find((item:any)=>item.id==="reasoning");
  if(!reasoning||reasoning.status!=="verified")throw new Error("reasoning capability nao verificada: "+providerId);
  if(passport.labels?.reasoningContract!=="v1")throw new Error("reasoning capability contract divergente");
  if(passport.labels?.transportId!==transport.transportId||passport.labels?.transportHash!==transport.profileHash)throw new Error("reasoning Capability Passport transport divergente");
  if(passport.provider!==descriptor.provider||passport.model!==descriptor.model)throw new Error("reasoning Capability Passport provider/model divergente");
  return descriptor;
}

export function createDurableOpaqueReasoningEvidence(terminal:any,{transportDecisionHash,opaqueRelayAttestationHash}:{transportDecisionHash:string;opaqueRelayAttestationHash:string}){
  if(!verifyDurableOpaqueRpcOriginResult(terminal))throw new Error("durable opaque reasoning origin result invalido");
  if(typeof transportDecisionHash!=="string"||!HASH.test(transportDecisionHash))throw new Error("durable opaque reasoning transportDecisionHash invalido");
  if(typeof opaqueRelayAttestationHash!=="string"||!HASH.test(opaqueRelayAttestationHash))throw new Error("durable opaque reasoning opaqueRelayAttestationHash invalido");
  const evidenceBase={
    format:ARCA_DURABLE_OPAQUE_REASONING_EVIDENCE_FORMAT,
    version:"1.0.0",
    requestId:terminal.requestId,
    payloadId:terminal.payloadId,
    endpointNode:terminal.endpointNode,
    requestPacketHash:terminal.requestPacketHash,
    requestEnvelopeHash:terminal.requestEnvelopeHash,
    responseEnvelopeHash:terminal.responseEnvelopeHash,
    resultHash:terminal.resultHash,
    recipientIdentityId:terminal.recipientIdentityId,
    recipientKeyFingerprint:terminal.recipientKeyFingerprint,
    route:[...terminal.route],
    replyRoute:[...terminal.replyRoute],
    signedReceiptsVerified:terminal.signedReceiptsVerified===true,
    trustedRecipientIdentity:terminal.trustedRecipientIdentity===true,
    durableContinuation:terminal.durableContinuation===true,
    ciphertextOnlyProtocol:terminal.ciphertextOnlyProtocol===true,
    responsePayloadHash:terminal.responsePayloadHash,
    transportDecisionHash,
    opaqueRelayAttestationHash,
    semanticOutputPersisted:false,
    coreMutationPerformed:false,
    humanReviewRequired:true
  };
  return Object.freeze({...evidenceBase,evidenceHash:sha256(evidenceBase)});
}

export class DurableOpaqueReasoningProviderAdapter{
  readonly origin:DurableOpaqueRpcOriginClient;
  readonly expectedEndpointNode:string|null;
  #evidence=new Map<string,any>();

  constructor(origin:DurableOpaqueRpcOriginClient,{expectedEndpointNode=null}:{expectedEndpointNode?:string|null}={}){
    if(!(origin instanceof DurableOpaqueRpcOriginClient))throw new TypeError("DurableOpaqueRpcOriginClient obrigatorio");
    this.origin=origin;
    this.expectedEndpointNode=expectedEndpointNode==null?null:safeId(expectedEndpointNode,"expectedEndpointNode");
  }

  get send(){
    return async(request:any,context:any)=>{
      if(!plain(request)||request.format!==ARCA_REASONING_REQUEST_FORMAT)throw new Error("durable opaque reasoning request invalido");
      const requestId=safeId(request.requestId,"reasoning requestId");
      const payloadId=safeId(request.payloadId,"reasoning payloadId");
      if(context?.requestId!==requestId||context?.payloadId!==payloadId)throw new Error("durable opaque reasoning transport correlation mismatch");
      const decision=context?.transportDecision;
      if(!plain(decision)||decision.allowed!==true||decision.transportKind!=="opaque-relay")throw new Error("durable opaque reasoning exige transport decision opaque-relay autorizada");
      if(typeof decision.opaqueRelayAttestationHash!=="string"||!HASH.test(decision.opaqueRelayAttestationHash))throw new Error("durable opaque reasoning exige attestation hash vinculada");

      const terminal=await this.origin.runOrPend(request,{
        requestId,
        payloadId,
        requiredCapabilities:["reasoning"],
        processorId:"reasoning-origin-"+sha256(requestId).slice(0,16)
      });
      if(!verifyDurableOpaqueRpcOriginResult(terminal))throw new Error("durable opaque reasoning origin result invalido");
      if(this.expectedEndpointNode&&terminal.endpointNode!==this.expectedEndpointNode)throw new Error("durable opaque reasoning endpoint divergente");
      if(!plain(terminal.output)||terminal.output.format!==ARCA_REASONING_PROVIDER_RESULT_FORMAT)throw new Error("durable opaque endpoint nao retornou Reasoning Provider Result V1");
      if(terminal.output.requestId!==requestId||terminal.output.payloadId!==payloadId)throw new Error("durable opaque provider result correlation mismatch");

      const evidence=createDurableOpaqueReasoningEvidence(terminal,{transportDecisionHash:decision.decisionHash,opaqueRelayAttestationHash:decision.opaqueRelayAttestationHash});
      this.#evidence.set(requestId,evidence);
      return terminal.output;
    };
  }

  getEvidence(requestId:string){
    const value=this.#evidence.get(safeId(requestId,"reasoning evidence requestId"));
    return value?structuredClone(value):null;
  }
}

export function verifyDurableOpaqueReasoningEvidence(value:any){
  if(!plain(value)||value.format!==ARCA_DURABLE_OPAQUE_REASONING_EVIDENCE_FORMAT||value.version!=="1.0.0")return false;
  if(!SAFE_ID.test(value.requestId||"")||!SAFE_ID.test(value.payloadId||"")||!SAFE_ID.test(value.endpointNode||""))return false;
  for(const key of ["requestPacketHash","requestEnvelopeHash","responseEnvelopeHash","resultHash","recipientKeyFingerprint","responsePayloadHash","transportDecisionHash","opaqueRelayAttestationHash","evidenceHash"]){
    if(typeof value[key]!=="string"||!HASH.test(value[key]))return false;
  }
  if(value.signedReceiptsVerified!==true||value.trustedRecipientIdentity!==true||value.durableContinuation!==true||value.ciphertextOnlyProtocol!==true)return false;
  if(value.semanticOutputPersisted!==false||value.coreMutationPerformed!==false||value.humanReviewRequired!==true)return false;
  return value.evidenceHash===sha256(evidenceBody(value));
}

export async function runVerifiedDurableOpaqueReasoning(input:{
  providerRegistry:ReasoningProviderRegistry;
  capabilityRegistry:CapabilityRegistry;
  providerId:string;
  transport:any;
  adapter:DurableOpaqueReasoningProviderAdapter;
  reasoning:ReasoningRunInput;
  options?:{decidedAt?:string;signal?:AbortSignal};
}){
  if(!plain(input))throw new TypeError("verified durable opaque reasoning input obrigatorio");
  if(!(input.adapter instanceof DurableOpaqueReasoningProviderAdapter))throw new TypeError("DurableOpaqueReasoningProviderAdapter obrigatorio");
  const providerId=safeId(input.providerId,"providerId");
  const descriptor=verifyDurableOpaqueReasoningProvider(input.capabilityRegistry,input.providerRegistry,providerId,input.transport);
  if(input.reasoning?.purposeConfirmed!==true)throw new Error("verified durable opaque reasoning exige purposeConfirmed=true");
  if(input.reasoning?.providerVerified!==true)throw new Error("verified durable opaque reasoning exige providerVerified=true");
  if(input.reasoning?.privateProcessingAuthorized!==true)throw new Error("verified durable opaque reasoning exige privateProcessingAuthorized=true");
  const requestId=safeId(input.reasoning.requestId,"reasoning requestId");
  const payloadId=safeId(input.reasoning.payloadId,"reasoning payloadId");
  const attestation=createOpaqueReasoningTransportAttestation({
    requestId,
    payloadId,
    transport:input.transport
  });
  const reasoning=await input.providerRegistry.run(providerId,{
    ...input.reasoning,
    opaqueRelayAttestation:attestation
  },input.options);
  const evidence=input.adapter.getEvidence(requestId);
  if(!verifyDurableOpaqueReasoningEvidence(evidence))throw new Error("durable opaque reasoning execution evidence ausente ou invalida");
  if(evidence.payloadId!==payloadId||evidence.opaqueRelayAttestationHash!==attestation.attestationHash)throw new Error("durable opaque reasoning evidence correlation mismatch");
  if(reasoning.transportDecisionHash!==evidence.transportDecisionHash)throw new Error("durable opaque reasoning decision/evidence mismatch");
  const body={
    format:ARCA_VERIFIED_DURABLE_OPAQUE_REASONING_RESULT_FORMAT,
    version:"1.0.0",
    requestId,
    payloadId,
    providerId,
    providerDescriptorHash:descriptor.descriptorHash,
    opaqueRelayAttestationHash:attestation.attestationHash,
    transportDecisionHash:reasoning.transportDecisionHash,
    executionEvidenceHash:evidence.evidenceHash,
    humanReviewRequired:true,
    coreMutationPerformed:false,
    privacyReclassificationRequired:true,
    reasoning,
    executionEvidence:evidence
  };
  return Object.freeze({...body,resultHash:sha256(body)});
}
