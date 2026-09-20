import {createHash} from "node:crypto";
import {ARCA_PRIVACY_CLASSIFICATION_FORMAT,verifyPrivacyClassification} from "./privacy-classification.ts";

export const ARCA_REASONING_TRANSPORT_PROFILE_FORMAT="arca-reasoning-transport-profile-v1";
export const ARCA_REASONING_TRANSPORT_DECISION_FORMAT="arca-reasoning-transport-decision-v1";
export const ARCA_SECURE_REASONING_RESULT_FORMAT="arca-secure-reasoning-result-v1";

export const REASONING_TRANSPORT_KINDS=Object.freeze([
  "local",
  "private-direct",
  "opaque-relay",
  "repository-backed"
] as const);

const KIND_SET=new Set<string>(REASONING_TRANSPORT_KINDS as readonly string[]);
const PERSISTENCE_SET=new Set(["none","ephemeral","durable"]);
const VISIBILITY_SET=new Set(["none","metadata-only","plaintext-storage"]);
const ENCRYPTION_SET=new Set(["none","tls","end-to-end"]);
const IDENTIFIER=/^[A-Za-z0-9._:-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;
const SECRET_KEY=/(authorization|bearer|token|password|secret|api[_-]?key|client[_-]?secret|private[_-]?key|cookie|credential)/i;
const MAX_PAYLOAD_BYTES=512*1024;

type JsonValue=null|boolean|number|string|JsonValue[]|{[key:string]:JsonValue};
type JsonObject=Record<string,any>;
export type ReasoningTransportKind=typeof REASONING_TRANSPORT_KINDS[number];

export type ReasoningTransportProfileInput={
  transportId:string;
  kind:ReasoningTransportKind;
  persistence:"none"|"ephemeral"|"durable";
  relayVisibility:"none"|"metadata-only"|"plaintext-storage";
  encryption:"none"|"tls"|"end-to-end";
  external:boolean;
  operator?:string|null;
};

export type ReasoningTransportEvaluationInput={
  requestId:string;
  payloadId:string;
  payload:JsonValue;
  classification:any;
  transport:any;
  purposeConfirmed?:boolean;
  providerVerified?:boolean;
  privateProcessingAuthorized?:boolean;
  publicPayloadApproved?:boolean;
  opaqueRelayAttestation?:any;
};

export const ARCA_OPAQUE_REASONING_TRANSPORT_ATTESTATION_FORMAT="arca-opaque-reasoning-transport-attestation-v1";

function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clean(value:any):any{if(Array.isArray(value))return value.map(clean);if(plain(value)){const out:JsonObject={};for(const [key,item] of Object.entries(value))if(item!==undefined)out[key]=clean(item);return out}return value}
function stable(value:any):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function sha256(value:any){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function identifier(value:unknown,label:string){const text=String(value??"").trim();if(!IDENTIFIER.test(text))throw new TypeError(`${label} invalido`);return text}
function iso(value=new Date().toISOString()){const date=new Date(value);if(Number.isNaN(date.getTime()))throw new TypeError("timestamp invalido");return date.toISOString()}
function enumValue(value:unknown,set:Set<string>,label:string){const text=String(value??"").trim().toLowerCase();if(!set.has(text))throw new TypeError(`${label} invalido: ${text||"<empty>"}`);return text}
function normalizeOperator(value:unknown){if(value===undefined||value===null)return null;const text=String(value).trim();if(!text)return null;if(text.length>160)throw new RangeError("operator excede 160 caracteres");return text}
function serializePayload(payload:any){let serialized:string;try{serialized=JSON.stringify(payload)}catch{throw new TypeError("reasoning payload deve ser JSON serializavel")}if(serialized===undefined)throw new TypeError("reasoning payload ausente");const bytes=Buffer.byteLength(serialized);if(bytes>MAX_PAYLOAD_BYTES)throw new RangeError(`reasoning payload excede ${MAX_PAYLOAD_BYTES} bytes`);return {normalized:JSON.parse(serialized),bytes}}
function hasSecretLikeKey(value:any):boolean{if(Array.isArray(value))return value.some(hasSecretLikeKey);if(!plain(value))return false;for(const [key,item] of Object.entries(value)){if(SECRET_KEY.test(key))return true;if(hasSecretLikeKey(item))return true}return false}
function privateIndicators(classification:any){const i=classification?.indicators??{};return Boolean(
  i.directIdentifier||
  i.financialIdentifier||
  i.precisePrivateLocation||
  i.healthOrBiometric||
  i.politicalReligiousUnionSexualSensitive||
  i.childOrAdolescent||
  i.privateCommunication||
  i.secretOrCredential||
  i.accusationOrAdverseInference
)}
function profileBody(profile:any){const {profileHash:_ignored,...body}=profile;return body}
function decisionBody(decision:any){const {decisionHash:_ignored,...body}=decision;return body}

export function createReasoningTransportProfile(input:ReasoningTransportProfileInput){
  if(!plain(input))throw new TypeError("reasoning transport profile invalido");
  const transportId=identifier(input.transportId,"transportId");
  const kind=enumValue(input.kind,KIND_SET,"transport.kind") as ReasoningTransportKind;
  const persistence=enumValue(input.persistence,PERSISTENCE_SET,"transport.persistence");
  const relayVisibility=enumValue(input.relayVisibility,VISIBILITY_SET,"transport.relayVisibility");
  const encryption=enumValue(input.encryption,ENCRYPTION_SET,"transport.encryption");
  if(typeof input.external!=="boolean")throw new TypeError("transport.external deve ser boolean");
  const external=input.external;
  const operator=normalizeOperator(input.operator);

  if(kind==="local"){
    if(external)throw new Error("transport local nao pode ser external");
    if(relayVisibility!=="none")throw new Error("transport local nao possui relay visibility");
  }
  if(kind==="private-direct"){
    if(!external)throw new Error("private-direct deve ser external");
    if(relayVisibility!=="none")throw new Error("private-direct nao deve expor payload a relay");
    if(!["tls","end-to-end"].includes(encryption))throw new Error("private-direct exige TLS ou end-to-end encryption");
    if(persistence==="durable")throw new Error("private-direct V0 nao permite persistencia duravel do payload");
  }
  if(kind==="opaque-relay"){
    if(!external)throw new Error("opaque-relay deve ser external");
    if(relayVisibility!=="metadata-only")throw new Error("opaque-relay deve expor somente metadata ao relay");
    if(encryption!=="end-to-end")throw new Error("opaque-relay exige end-to-end encryption");
  }
  if(kind==="repository-backed"){
    if(!external)throw new Error("repository-backed deve ser external");
    if(persistence!=="durable")throw new Error("repository-backed deve declarar persistencia duravel");
    if(relayVisibility!=="plaintext-storage")throw new Error("repository-backed V0 deve declarar plaintext-storage");
  }

  const body={format:ARCA_REASONING_TRANSPORT_PROFILE_FORMAT,version:"0.1.0",transportId,kind,persistence,relayVisibility,encryption,external,operator};
  return Object.freeze({...body,profileHash:sha256(body)});
}

export function verifyReasoningTransportProfile(profile:any){
  if(!plain(profile)||profile.format!==ARCA_REASONING_TRANSPORT_PROFILE_FORMAT)return false;
  if(typeof profile.profileHash!=="string"||!HASH.test(profile.profileHash))return false;
  try{
    const normalized=createReasoningTransportProfile({
      transportId:profile.transportId,
      kind:profile.kind,
      persistence:profile.persistence,
      relayVisibility:profile.relayVisibility,
      encryption:profile.encryption,
      external:profile.external,
      operator:profile.operator
    });
    return normalized.profileHash===profile.profileHash&&stable(profileBody(normalized))===stable(profileBody(profile));
  }catch{return false}
}

export function reasoningPayloadHash(payload:JsonValue){const {normalized}=serializePayload(payload);return sha256(normalized)}

function verifyOpaqueReasoningTransportAttestation(value:any,{requestId,payloadId,transport}:any){
  if(!plain(value)||value.format!==ARCA_OPAQUE_REASONING_TRANSPORT_ATTESTATION_FORMAT||value.version!=="1.0.0")return false;
  if(value.requestId!==requestId||value.payloadId!==payloadId)return false;
  if(value.transportId!==transport.transportId||value.transportHash!==transport.profileHash)return false;
  if(value.protocol!=="opaque-mesh-rpc-v1"||value.envelope!=="arca-mesh-encrypted-envelope-v1")return false;
  if(value.encryption!=="X25519+HKDF-SHA-256+AES-256-GCM")return false;
  if(value.requestEncrypted!==true||value.responseEncrypted!==true||value.ciphertextOnlyDurableState!==true)return false;
  if(value.trustedRecipientIdentity!==true||value.signedReceiptsRequired!==true||value.restartSafeContinuation!==true)return false;
  if(value.relayPlaintextAccess!==false||value.coreMutationAuthorized!==false||value.humanReviewRequired!==true)return false;
  if(typeof value.attestationHash!=="string"||!HASH.test(value.attestationHash))return false;
  const {attestationHash:_ignored,...body}=value;
  return value.attestationHash===sha256(body);
}

export function createOpaqueReasoningTransportAttestation(input:any){
  if(!plain(input))throw new TypeError("opaque reasoning transport attestation invalida");
  const requestId=identifier(input.requestId,"requestId");
  const payloadId=identifier(input.payloadId,"payloadId");
  if(!verifyReasoningTransportProfile(input.transport)||input.transport.kind!=="opaque-relay")throw new Error("opaque-relay transport profile obrigatorio");
  const body={
    format:ARCA_OPAQUE_REASONING_TRANSPORT_ATTESTATION_FORMAT,
    version:"1.0.0",
    requestId,
    payloadId,
    transportId:input.transport.transportId,
    transportHash:input.transport.profileHash,
    protocol:"opaque-mesh-rpc-v1",
    envelope:"arca-mesh-encrypted-envelope-v1",
    encryption:"X25519+HKDF-SHA-256+AES-256-GCM",
    requestEncrypted:true,
    responseEncrypted:true,
    ciphertextOnlyDurableState:true,
    trustedRecipientIdentity:true,
    signedReceiptsRequired:true,
    restartSafeContinuation:true,
    relayPlaintextAccess:false,
    humanReviewRequired:true,
    coreMutationAuthorized:false
  };
  return Object.freeze({...body,attestationHash:sha256(body)});
}

export function evaluateReasoningTransport(input:ReasoningTransportEvaluationInput,options:{decidedAt?:string}={}){
  if(!plain(input))throw new TypeError("reasoning transport evaluation invalida");
  const requestId=identifier(input.requestId,"requestId");
  const payloadId=identifier(input.payloadId,"payloadId");
  const {normalized:payload,bytes:payloadBytes}=serializePayload(input.payload);
  const payloadHash=sha256(payload);
  const classification=input.classification;
  if(!plain(classification)||classification.format!==ARCA_PRIVACY_CLASSIFICATION_FORMAT||!verifyPrivacyClassification(classification))throw new Error("privacy classification invalida ou adulterada");
  if(classification.recordId!==payloadId)throw new Error("privacy classification nao corresponde ao payloadId");
  const transport=input.transport;
  if(!verifyReasoningTransportProfile(transport))throw new Error("reasoning transport profile invalido ou adulterado");

  const purposeConfirmed=input.purposeConfirmed===true;
  const providerVerified=input.providerVerified===true;
  const privateProcessingAuthorized=input.privateProcessingAuthorized===true;
  const publicPayloadApproved=input.publicPayloadApproved===true;
  const reasons:string[]=[];
  const privacyClass=String(classification.privacyClass);
  const hasPrivateIndicators=privateIndicators(classification);
  const hasSecretKey=hasSecretLikeKey(payload);
  const secretIndicator=classification.indicators?.secretOrCredential===true;
  const nonPublic=privacyClass!=="public"||hasPrivateIndicators;
  const opaqueRelayAttestationValid=transport.kind==="opaque-relay"&&verifyOpaqueReasoningTransportAttestation(input.opaqueRelayAttestation,{requestId,payloadId,transport});
  const opaqueRelayAttestationHash=opaqueRelayAttestationValid?input.opaqueRelayAttestation.attestationHash:null;

  if(!purposeConfirmed)reasons.push("purpose-not-confirmed");
  if(hasSecretKey)reasons.push("secret-like-payload-key");
  if(secretIndicator)reasons.push("secret-or-credential");
  if(transport.external===true&&!providerVerified)reasons.push("provider-not-verified");

  if(transport.kind==="repository-backed"){
    if(nonPublic)reasons.push("repository-backed-private-payload-prohibited");
    if(!publicPayloadApproved)reasons.push("public-payload-approval-required");
  }else if(transport.kind==="private-direct"){
    if(nonPublic&&!privateProcessingAuthorized)reasons.push("private-processing-authorization-required");
    if(nonPublic&&transport.persistence==="durable")reasons.push("private-payload-durable-persistence-prohibited");
  }else if(transport.kind==="opaque-relay"){
    if(nonPublic){
      if(!opaqueRelayAttestationValid)reasons.push("opaque-relay-private-crypto-attestation-required");
      if(transport.encryption!=="end-to-end")reasons.push("opaque-relay-end-to-end-encryption-required");
      if(transport.relayVisibility!=="metadata-only")reasons.push("opaque-relay-metadata-only-required");
      if(!privateProcessingAuthorized)reasons.push("private-processing-authorization-required");
    }else if(!publicPayloadApproved){
      reasons.push("public-payload-approval-required");
    }
  }else if(transport.kind==="local"){
    // Local processing may handle non-public material, but credentials remain forbidden.
  }else{
    reasons.push("transport-kind-unsupported");
  }

  if(privacyClass==="redact-before-publication"&&transport.kind==="repository-backed")reasons.push("redaction-required-before-repository-transport");
  if((privacyClass==="sensitive"||privacyClass==="high-risk"||privacyClass==="restricted")&&transport.kind!=="local"&&transport.kind!=="private-direct"&&transport.kind!=="opaque-relay")reasons.push("high-risk-transport-prohibited");

  const uniqueReasons=[...new Set(reasons)].sort();
  const allowed=uniqueReasons.length===0;
  const body={
    format:ARCA_REASONING_TRANSPORT_DECISION_FORMAT,
    version:"0.1.0",
    requestId,
    payloadId,
    payloadHash,
    payloadBytes,
    classificationHash:classification.classificationHash,
    privacyClass,
    transportId:transport.transportId,
    transportHash:transport.profileHash,
    transportKind:transport.kind,
    allowed,
    reasons:uniqueReasons,
    purposeConfirmed,
    providerVerified,
    privateProcessingAuthorized,
    publicPayloadApproved,
    opaqueRelayAttestationHash,
    executionAuthorized:false,
    coreMutationAuthorized:false,
    humanReviewBypassed:false,
    payloadPersisted:false,
    decidedAt:iso(options.decidedAt)
  };
  return Object.freeze({...clean(body),decisionHash:sha256(body)});
}

export function verifyReasoningTransportDecision(decision:any){
  if(!plain(decision)||decision.format!==ARCA_REASONING_TRANSPORT_DECISION_FORMAT)return false;
  if(typeof decision.decisionHash!=="string"||!HASH.test(decision.decisionHash))return false;
  return decision.decisionHash===sha256(decisionBody(decision));
}

export class ReasoningTransportDeniedError extends Error{
  decision:any;
  constructor(decision:any){
    super(`reasoning transport denied: ${Array.isArray(decision?.reasons)&&decision.reasons.length?decision.reasons.join(","):"policy"}`);
    this.name="ReasoningTransportDeniedError";
    this.decision=decision;
  }
}

export class SecureReasoningTransportClient{
  readonly transport:any;
  readonly send:(payload:any,context:any)=>Promise<any>|any;
  constructor(input:{transport:any;send:(payload:any,context:any)=>Promise<any>|any}){
    if(!plain(input)||!verifyReasoningTransportProfile(input.transport))throw new TypeError("transport profile verificado obrigatorio");
    if(typeof input.send!=="function")throw new TypeError("send function obrigatoria");
    this.transport=input.transport;
    this.send=input.send;
  }
  async run(input:Omit<ReasoningTransportEvaluationInput,"transport">,options:{decidedAt?:string;signal?:AbortSignal}={}){
    const decision=evaluateReasoningTransport({...input,transport:this.transport},options);
    if(!decision.allowed)throw new ReasoningTransportDeniedError(decision);
    const result=await this.send(clean(input.payload),{requestId:decision.requestId,payloadId:decision.payloadId,payloadHash:decision.payloadHash,decision,signal:options.signal});
    return Object.freeze({
      format:ARCA_SECURE_REASONING_RESULT_FORMAT,
      version:"0.1.0",
      requestId:decision.requestId,
      payloadId:decision.payloadId,
      payloadHash:decision.payloadHash,
      transportId:decision.transportId,
      transportDecisionHash:decision.decisionHash,
      opaqueRelayAttestationHash:decision.opaqueRelayAttestationHash,
      humanReviewRequired:true,
      coreMutationPerformed:false,
      output:result
    });
  }
}
