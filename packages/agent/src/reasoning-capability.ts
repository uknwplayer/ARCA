import {createHash} from "node:crypto";
import {CapabilityRegistry} from "./capability-registry.ts";
import {classifyPrivacyRecord} from "./privacy-classification.ts";
import {
  ARCA_SECURE_REASONING_RESULT_FORMAT,
  SecureReasoningTransportClient,
  verifyReasoningTransportProfile
} from "./reasoning-transport-gate.ts";

export const ARCA_REASONING_PROVIDER_FORMAT="arca-reasoning-provider-v1";
export const ARCA_REASONING_REQUEST_FORMAT="arca-reasoning-request-v1";
export const ARCA_REASONING_PROVIDER_RESULT_FORMAT="arca-reasoning-provider-result-v1";
export const ARCA_REASONING_RESULT_FORMAT="arca-reasoning-result-v1";
export const ARCA_REASONING_PROBE_RESULT_FORMAT="arca-reasoning-probe-result-v1";

const IDENTIFIER=/^[A-Za-z0-9._:-]{1,160}$/;
const PROVIDER_KINDS=new Set(["model","service","agent"]);
const RESPONSE_FORMATS=new Set(["text","json"]);
const SECRET_KEY=/(authorization|bearer|token|password|secret|api[_-]?key|client[_-]?secret|private[_-]?key|cookie|credential)/i;
const HASH=/^[a-f0-9]{64}$/;
const MAX_INSTRUCTION_CHARS=64000;
const MAX_CONTEXT_BYTES=384*1024;
const MAX_OUTPUT_BYTES_LIMIT=512*1024;

type JsonObject=Record<string,any>;
type JsonValue=null|boolean|number|string|JsonValue[]|{[key:string]:JsonValue};

export type ReasoningProviderDescriptorInput={
  providerId:string;
  name?:string;
  provider:string;
  model?:string|null;
  kind?:"model"|"service"|"agent";
  transport:any;
  timeoutMs?:number;
  maxOutputBytes?:number;
};

export type ReasoningRunInput={
  requestId:string;
  payloadId:string;
  instruction:string;
  context?:JsonObject;
  responseFormat?:"text"|"json";
  classification:any;
  purposeConfirmed?:boolean;
  providerVerified?:boolean;
  privateProcessingAuthorized?:boolean;
  publicPayloadApproved?:boolean;
  opaqueRelayAttestation?:any;
};

function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clean(value:any):any{if(Array.isArray(value))return value.map(clean);if(plain(value)){const out:JsonObject={};for(const [key,item] of Object.entries(value))if(item!==undefined)out[key]=clean(item);return out}return value}
function stable(value:any):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function sha256(value:any){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function identifier(value:unknown,label:string){const text=String(value??"").trim();if(!IDENTIFIER.test(text))throw new TypeError(`${label} invalido`);return text}
function text(value:unknown,label:string,max:number,{required=true}:{required?:boolean}={}){const out=String(value??"").trim();if(required&&!out)throw new TypeError(`${label} obrigatorio`);if(out.length>max)throw new RangeError(`${label} excede ${max} caracteres`);return out}
function jsonClone(value:any){if(value===undefined)return undefined;let serialized:string;try{serialized=JSON.stringify(value)}catch{throw new TypeError("valor deve ser JSON serializavel")}if(serialized===undefined)throw new TypeError("valor JSON ausente");return JSON.parse(serialized)}
function jsonBytes(value:any){return Buffer.byteLength(JSON.stringify(value),"utf8")}
function assertNoSecrets(value:any,path="descriptor"){if(Array.isArray(value)){value.forEach((item,index)=>assertNoSecrets(item,`${path}[${index}]`));return}if(!plain(value))return;for(const [key,item] of Object.entries(value)){if(SECRET_KEY.test(key))throw new Error(`campo sensivel nao permitido em ${path}.${key}`);assertNoSecrets(item,`${path}.${key}`)}}
function descriptorBody(value:any){const {descriptorHash:_ignored,...body}=value;return body}
function iso(value=new Date().toISOString()){const d=new Date(value);if(Number.isNaN(d.getTime()))throw new TypeError("timestamp invalido");return d.toISOString()}
function timeoutPromise(ms:number,controller:AbortController){return new Promise((_,reject)=>setTimeout(()=>{controller.abort();reject(new Error("reasoning-timeout"))},ms))}
function normalizeOutput(value:any,maxBytes:number){
  if(value===undefined)throw new Error("reasoning provider output ausente");
  const output=jsonClone(value);
  const bytes=jsonBytes(output);
  if(bytes>maxBytes)throw new RangeError(`reasoning output excede ${maxBytes} bytes`);
  return {output,bytes};
}

export function createReasoningProviderDescriptor(input:ReasoningProviderDescriptorInput){
  if(!plain(input))throw new TypeError("reasoning provider descriptor invalido");
  assertNoSecrets(input,"provider");
  const providerId=identifier(input.providerId,"providerId");
  const name=text(input.name??providerId,"provider.name",160);
  const provider=text(input.provider,"provider",120);
  const model=input.model==null?null:text(input.model,"model",200,{required:false});
  const kind=String(input.kind??"model").trim().toLowerCase();
  if(!PROVIDER_KINDS.has(kind))throw new TypeError(`provider.kind invalido: ${kind}`);
  if(!verifyReasoningTransportProfile(input.transport))throw new Error("reasoning transport profile invalido");
  const timeoutMs=Number(input.timeoutMs??30000);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw new RangeError("timeoutMs deve estar entre 1000 e 120000");
  const maxOutputBytes=Number(input.maxOutputBytes??256*1024);
  if(!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1024||maxOutputBytes>MAX_OUTPUT_BYTES_LIMIT)throw new RangeError(`maxOutputBytes deve estar entre 1024 e ${MAX_OUTPUT_BYTES_LIMIT}`);
  const body={
    format:ARCA_REASONING_PROVIDER_FORMAT,
    version:"1.0.0",
    providerId,
    name,
    provider,
    model,
    kind,
    transportId:input.transport.transportId,
    transportHash:input.transport.profileHash,
    transportKind:input.transport.kind,
    external:input.transport.external===true,
    timeoutMs,
    maxOutputBytes,
    capability:"reasoning",
    humanReviewRequired:true,
    coreMutationAllowed:false
  };
  return Object.freeze({...body,descriptorHash:sha256(body)});
}

export function verifyReasoningProviderDescriptor(descriptor:any){
  if(!plain(descriptor)||descriptor.format!==ARCA_REASONING_PROVIDER_FORMAT)return false;
  if(typeof descriptor.descriptorHash!=="string"||!HASH.test(descriptor.descriptorHash))return false;
  return descriptor.descriptorHash===sha256(descriptorBody(descriptor));
}

export function createReasoningRequest(input:ReasoningRunInput){
  if(!plain(input))throw new TypeError("reasoning request invalido");
  const requestId=identifier(input.requestId,"requestId");
  const payloadId=identifier(input.payloadId,"payloadId");
  const instruction=text(input.instruction,"instruction",MAX_INSTRUCTION_CHARS);
  const context=input.context===undefined?{}:input.context;
  if(!plain(context))throw new TypeError("reasoning context deve ser objeto");
  const normalizedContext=jsonClone(context);
  if(jsonBytes(normalizedContext)>MAX_CONTEXT_BYTES)throw new RangeError(`reasoning context excede ${MAX_CONTEXT_BYTES} bytes`);
  const responseFormat=String(input.responseFormat??"json").trim().toLowerCase();
  if(!RESPONSE_FORMATS.has(responseFormat))throw new TypeError(`responseFormat invalido: ${responseFormat}`);
  return Object.freeze({
    format:ARCA_REASONING_REQUEST_FORMAT,
    version:"1.0.0",
    requestId,
    payloadId,
    instruction,
    context:normalizedContext,
    responseFormat,
    humanReviewRequired:true,
    coreMutationAllowed:false
  });
}

export function validateReasoningProviderResult(value:any,{requestId,payloadId,maxOutputBytes}:{requestId:string;payloadId:string;maxOutputBytes:number}){
  const rid=identifier(requestId,"provider result requestId");
  const pid=identifier(payloadId,"provider result payloadId");
  if(!plain(value)||value.format!==ARCA_REASONING_PROVIDER_RESULT_FORMAT)throw new Error("reasoning provider result invalido");
  if(value.requestId!==rid)throw new Error("reasoning provider requestId divergente");
  if(value.payloadId!==pid)throw new Error("reasoning provider payloadId divergente");
  if(value.status!=="completed")throw new Error(`reasoning provider nao concluiu: ${String(value.status??"<missing>")}`);
  if(value.humanReviewRequired!==true)throw new Error("reasoning provider result deve preservar Human Review");
  if(value.coreMutationPerformed!==false)throw new Error("reasoning provider result nao pode declarar Core mutation");
  const normalized=normalizeOutput(value.output,maxOutputBytes);
  return {output:normalized.output,outputBytes:normalized.bytes};
}

type ProviderSend=(request:any,context:{signal:AbortSignal;requestId:string;payloadId:string;payloadHash:string;transportDecision:any})=>Promise<any>|any;

class ReasoningProviderRuntime{
  descriptor:any;
  transport:any;
  secureClient:SecureReasoningTransportClient;
  timeoutMs:number;
  maxOutputBytes:number;
  constructor(input:ReasoningProviderDescriptorInput,send:ProviderSend){
    if(typeof send!=="function")throw new TypeError("reasoning provider send obrigatorio");
    this.transport=input.transport;
    this.descriptor=createReasoningProviderDescriptor(input);
    this.timeoutMs=this.descriptor.timeoutMs;
    this.maxOutputBytes=this.descriptor.maxOutputBytes;
    this.secureClient=new SecureReasoningTransportClient({
      transport:input.transport,
      send:async(payload:any,transportContext:any)=>{
        const controller=new AbortController();
        const outerSignal=transportContext.signal;
        if(outerSignal?.aborted)throw new Error("reasoning-aborted");
        const abortFromOuter=()=>controller.abort();
        if(outerSignal)outerSignal.addEventListener("abort",abortFromOuter,{once:true});
        let timer:any;
        try{
          const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("reasoning-timeout"))},this.timeoutMs)});
          return await Promise.race([
            Promise.resolve(send(payload,{
              signal:controller.signal,
              requestId:transportContext.requestId,
              payloadId:transportContext.payloadId,
              payloadHash:transportContext.payloadHash,
              transportDecision:transportContext.decision
            })),
            timeout
          ]);
        }finally{
          if(timer)clearTimeout(timer);
          if(outerSignal)outerSignal.removeEventListener("abort",abortFromOuter);
        }
      }
    });
  }
  async run(input:ReasoningRunInput,options:{decidedAt?:string;signal?:AbortSignal}={}){
    const request=createReasoningRequest(input);
    const secured=await this.secureClient.run({
      requestId:request.requestId,
      payloadId:request.payloadId,
      payload:request,
      classification:input.classification,
      purposeConfirmed:input.purposeConfirmed,
      providerVerified:input.providerVerified,
      privateProcessingAuthorized:input.privateProcessingAuthorized,
      publicPayloadApproved:input.publicPayloadApproved,
      opaqueRelayAttestation:input.opaqueRelayAttestation
    },options);
    if(secured.format!==ARCA_SECURE_REASONING_RESULT_FORMAT)throw new Error("secure reasoning result invalido");
    const providerResult=validateReasoningProviderResult(secured.output,{requestId:request.requestId,payloadId:request.payloadId,maxOutputBytes:this.maxOutputBytes});
    return Object.freeze({
      format:ARCA_REASONING_RESULT_FORMAT,
      version:"1.0.0",
      requestId:request.requestId,
      payloadId:request.payloadId,
      providerId:this.descriptor.providerId,
      providerDescriptorHash:this.descriptor.descriptorHash,
      transportId:this.descriptor.transportId,
      transportDecisionHash:secured.transportDecisionHash,
      payloadHash:secured.payloadHash,
      status:"completed",
      responseFormat:request.responseFormat,
      output:providerResult.output,
      outputBytes:providerResult.outputBytes,
      outputPersisted:false,
      privacyReclassificationRequired:true,
      humanReviewRequired:true,
      coreMutationPerformed:false
    });
  }
}

export class ReasoningProviderRegistry{
  private providers=new Map<string,ReasoningProviderRuntime>();
  register(input:ReasoningProviderDescriptorInput,send:ProviderSend){
    const runtime=new ReasoningProviderRuntime(input,send);
    if(this.providers.has(runtime.descriptor.providerId))throw new Error(`reasoning provider ja registrado: ${runtime.descriptor.providerId}`);
    this.providers.set(runtime.descriptor.providerId,runtime);
    return clean(runtime.descriptor);
  }
  has(providerId:string){return this.providers.has(String(providerId))}
  getDescriptor(providerId:string){const runtime=this.providers.get(String(providerId));return runtime?clean(runtime.descriptor):null}
  list(){return [...this.providers.values()].map(runtime=>clean(runtime.descriptor)).sort((a,b)=>String(a.providerId).localeCompare(String(b.providerId)))}
  async run(providerId:string,input:ReasoningRunInput,options:{decidedAt?:string;signal?:AbortSignal}={}){
    const runtime=this.providers.get(identifier(providerId,"providerId"));
    if(!runtime)throw new Error(`reasoning provider desconhecido: ${providerId}`);
    return runtime.run(input,options);
  }
}

export function registerReasoningProviderCapability(capabilityRegistry:CapabilityRegistry,descriptor:any,options:{updatedAt?:string}={}){
  if(!(capabilityRegistry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio");
  if(!verifyReasoningProviderDescriptor(descriptor))throw new Error("reasoning provider descriptor invalido");
  return capabilityRegistry.upsertParticipant({
    participantId:descriptor.providerId,
    kind:descriptor.kind,
    provider:descriptor.provider,
    model:descriptor.model,
    labels:{
      reasoningContract:"v1",
      transportId:descriptor.transportId,
      transportKind:descriptor.transportKind,
      transportHash:descriptor.transportHash,
      external:descriptor.external
    },
    capabilities:[{
      id:"reasoning",
      version:"1",
      input:["application/json"],
      output:["application/json"],
      networkRequired:descriptor.external,
      humanReviewRequired:true,
      riskClass:"medium"
    }]
  },{source:"reasoning-provider-registry",updatedAt:options.updatedAt});
}

export async function probeReasoningProviderCapability(input:{
  capabilityRegistry:CapabilityRegistry;
  providerRegistry:ReasoningProviderRegistry;
  providerId:string;
  providerIdentityVerified?:boolean;
  testedAt?:string;
  decidedAt?:string;
  verifierId?:string;
}){
  if(!(input?.capabilityRegistry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio");
  if(!(input?.providerRegistry instanceof ReasoningProviderRegistry))throw new TypeError("ReasoningProviderRegistry obrigatorio");
  const providerId=identifier(input.providerId,"providerId");
  const descriptor=input.providerRegistry.getDescriptor(providerId);
  if(!descriptor)throw new Error(`reasoning provider desconhecido: ${providerId}`);
  const passport=input.capabilityRegistry.getPassport(providerId);
  if(!passport)throw new Error(`provider nao registrado no CapabilityRegistry: ${providerId}`);
  if(!passport.capabilities.some((capability:any)=>capability.id==="reasoning"))throw new Error("provider nao declara reasoning");
  if(descriptor.external&&input.providerIdentityVerified!==true)throw new Error("provider externo exige identidade/endpoint verificado antes do conformance probe");

  const payloadId=`reasoning-probe.${providerId}`;
  const classification=classifyPrivacyRecord({
    recordId:payloadId,
    subjectType:"none",
    sourceType:"internal-derived",
    privacyClass:"public",
    purpose:"synthetic reasoning capability conformance",
    indicators:{sourcePubliclyAccessible:true}
  },{classifiedAt:input.testedAt});

  let result:any=null;
  let executionState="completed";
  try{
    result=await input.providerRegistry.run(providerId,{
      requestId:`probe.${providerId}`,
      payloadId,
      instruction:"Synthetic ARCA conformance probe. Return output.data exactly as {marker:'ARCA-REASONING-PROBE-V1',sum:5}. Compute 2+3 locally. Do not use external data.",
      context:{probe:true,a:2,b:3},
      responseFormat:"json",
      classification,
      purposeConfirmed:true,
      providerVerified:descriptor.external?input.providerIdentityVerified===true:false,
      publicPayloadApproved:true
    },{decidedAt:input.decidedAt});
  }catch(error:any){
    executionState=String(error?.message||error||"execution-error").slice(0,200);
  }

  const expected={marker:"ARCA-REASONING-PROBE-V1",sum:5};
  const data=result?.output?.data;
  const passed=executionState==="completed"&&plain(data)&&data.marker===expected.marker&&data.sum===expected.sum;
  const evidenceHash=sha256({
    contract:"reasoning-v1",
    providerDescriptorHash:descriptor.descriptorHash,
    executionState,
    requestPayloadHash:result?.payloadHash??null,
    outputHash:result?sha256(result.output):null,
    expected,
    passed
  });
  const verification=input.capabilityRegistry.recordVerification({
    participantId:providerId,
    capabilityId:"reasoning",
    verifierId:input.verifierId??"arca-reasoning-conformance",
    passed,
    testedAt:input.testedAt,
    evidenceHash,
    notes:`reasoning-contract-v1; state=${executionState}; marker=${passed?"ok":"failed"}`
  });
  return Object.freeze({
    format:ARCA_REASONING_PROBE_RESULT_FORMAT,
    version:"1.0.0",
    providerId,
    capabilityId:"reasoning",
    passed,
    executionState,
    evidenceHash,
    verificationRecordHash:verification.recordHash,
    rawOutputPersisted:false,
    authorizationIncluded:false,
    humanReviewRequired:false
  });
}
