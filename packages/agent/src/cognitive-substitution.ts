import {createHash} from "node:crypto";
import {CapabilityRegistry} from "./capability-registry.ts";
import {RoleConformanceRegistry} from "./role-conformance.ts";
import {
  MESH_COGNITIVE_SUBSTITUTION_RECEIPT_DOMAIN,
  signMeshCognitiveSubstitutionReceipt,
  verifySignedMeshCognitiveSubstitutionReceipt
} from "../../../src/machine-bridge/mesh-identity.mjs";

export const ARCA_ROLE_CONTRACT_FORMAT="arca-role-contract-v1";
export const ARCA_PARTICIPANT_RUNTIME_BINDING_FORMAT="arca-participant-runtime-binding-v1";
export const ARCA_COGNITIVE_SUBSTITUTION_RESULT_FORMAT="arca-cognitive-substitution-result-v1";
export const ARCA_COGNITIVE_SUBSTITUTION_RECEIPT_FORMAT="arca-cognitive-substitution-receipt-v1";

const IDENTIFIER=/^[A-Za-z0-9._:-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;
const PARTICIPANT_KINDS=new Set(["agent","worker","tool","connector","model","service"]);
const RUNTIME_KINDS=new Set(["agent-gateway","machine-bridge-worker","endpoint","custom"]);
const RISK_CLASSES=new Set(["low","medium","high","critical","unspecified"]);
const TOP_LEVEL_KEY=/^[A-Za-z0-9._:-]{1,120}$/;
const DEFAULT_MAX_OUTPUT_BYTES=256*1024;
const MAX_OUTPUT_BYTES=2*1024*1024;
const RECEIPT_TTL_MS=24*60*60*1000;

function plainObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(plainObject(value)){
    const output={};
    for(const key of Object.keys(value).sort())if(value[key]!==undefined)output[key]=canonicalize(value[key]);
    return output;
  }
  return value;
}
function stable(value){return JSON.stringify(canonicalize(value))}
function sha256Json(value){return createHash("sha256").update(stable(value)).digest("hex")}
function text(value,field,max,{required=true}={}){
  const normalized=String(value??"").trim();
  if(required&&!normalized)throw new TypeError(`${field} obrigatorio`);
  if(normalized.length>max)throw new RangeError(`${field} excede ${max} caracteres`);
  return normalized;
}
function identifier(value,field){
  const normalized=text(value,field,120);
  if(!IDENTIFIER.test(normalized))throw new TypeError(`${field} invalido`);
  return normalized;
}
function hash(value,field){
  const normalized=text(value,field,64);
  if(!HASH.test(normalized))throw new TypeError(`${field} deve ser SHA-256 hexadecimal`);
  return normalized;
}
function sortedUnique(values,field,{lowercase=false,max=120}={}){
  if(values==null)return [];
  if(!Array.isArray(values))throw new TypeError(`${field} deve ser array`);
  const normalized=values.map(value=>text(value,field,max)).map(value=>lowercase?value.toLowerCase():value);
  return [...new Set(normalized)].sort();
}
function isoTimestamp(value=new Date()){
  const parsed=value instanceof Date?value:new Date(value);
  if(Number.isNaN(parsed.getTime()))throw new TypeError("timestamp invalido");
  return parsed.toISOString();
}
function codedError(code,message,metadata={}){
  const error=new Error(message);
  error.code=code;
  for(const [key,value] of Object.entries(metadata))error[key]=value;
  return error;
}
function normalizeBehaviorEnvelope(input={}){
  if(!plainObject(input))throw new TypeError("behaviorEnvelope deve ser objeto");
  const maxOutputBytes=Number(input.maxOutputBytes??DEFAULT_MAX_OUTPUT_BYTES);
  if(!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1024||maxOutputBytes>MAX_OUTPUT_BYTES)throw new RangeError(`behaviorEnvelope.maxOutputBytes deve estar entre 1024 e ${MAX_OUTPUT_BYTES}`);
  const requiredTopLevelKeys=sortedUnique(input.requiredTopLevelKeys??[],"behaviorEnvelope.requiredTopLevelKeys");
  if(requiredTopLevelKeys.some(key=>!TOP_LEVEL_KEY.test(key)))throw new TypeError("behaviorEnvelope.requiredTopLevelKeys contem chave invalida");
  if(input.requireRequestCorrelation!==undefined&&typeof input.requireRequestCorrelation!=="boolean")throw new TypeError("behaviorEnvelope.requireRequestCorrelation deve ser boolean");
  return Object.freeze({
    maxOutputBytes,
    requiredTopLevelKeys,
    requireRequestCorrelation:input.requireRequestCorrelation===true
  });
}
function normalizeRole(input){
  if(!plainObject(input))throw new TypeError("role contract invalido");
  const roleId=identifier(input.roleId??input.id,"roleId").toLowerCase();
  const version=text(input.version??"1","role.version",40);
  const description=text(input.description??roleId,"role.description",500);
  const requiredCapabilities=sortedUnique(input.requiredCapabilities??[],"requiredCapabilities",{lowercase:true});
  if(!requiredCapabilities.length)throw new Error("role contract exige ao menos uma capability");
  const allowedKinds=sortedUnique(input.allowedKinds??[...PARTICIPANT_KINDS],"allowedKinds",{lowercase:true});
  if(!allowedKinds.length||allowedKinds.some(kind=>!PARTICIPANT_KINDS.has(kind)))throw new TypeError("allowedKinds invalido");
  const riskClass=String(input.riskClass??"unspecified").trim().toLowerCase();
  if(!RISK_CLASSES.has(riskClass))throw new TypeError("riskClass invalida");
  if(input.authorizationRequired===false)throw new Error("cognitive substitution nao pode desativar authorizationRequired");
  const substitutionPolicy=String(input.substitutionPolicy??"preflight-only").trim().toLowerCase();
  if(substitutionPolicy!=="preflight-only")throw new Error("V0.1 suporta somente substitutionPolicy=preflight-only");
  if(input.verifiedOnly===false)throw new Error("cognitive substitution exige verifiedOnly=true");
  if(input.conformanceRequired===false)throw new Error("cognitive substitution V0.2 exige conformanceRequired=true");
  if(input.humanReviewRequired!==undefined&&typeof input.humanReviewRequired!=="boolean")throw new TypeError("humanReviewRequired deve ser boolean");
  const base={
    format:ARCA_ROLE_CONTRACT_FORMAT,
    roleId,
    version,
    description,
    requiredCapabilities,
    allowedKinds,
    riskClass,
    verifiedOnly:true,
    conformanceRequired:true,
    authorizationRequired:true,
    substitutionPolicy:"preflight-only",
    humanReviewRequired:input.humanReviewRequired!==false,
    behaviorEnvelope:normalizeBehaviorEnvelope(input.behaviorEnvelope??{})
  };
  return Object.freeze({...base,contractHash:sha256Json(base)});
}
function normalizeRuntimeBinding(input,{boundAt}={}){
  if(!plainObject(input))throw new TypeError("runtime binding invalido");
  const participantId=identifier(input.participantId,"participantId");
  const participantDescriptorHash=hash(input.participantDescriptorHash,"participantDescriptorHash");
  const runtimeKind=String(input.runtimeKind??"").trim().toLowerCase();
  if(!RUNTIME_KINDS.has(runtimeKind))throw new TypeError(`runtimeKind invalido: ${runtimeKind||"<empty>"}`);
  const runtimeId=identifier(input.runtimeId,"runtimeId");
  const body={
    format:ARCA_PARTICIPANT_RUNTIME_BINDING_FORMAT,
    version:1,
    participantId,
    participantDescriptorHash,
    runtimeKind,
    runtimeId,
    boundAt:isoTimestamp(boundAt??input.boundAt??new Date())
  };
  return Object.freeze({...body,bindingHash:sha256Json(body)});
}
function validateOutput(output,request,envelope){
  const encoded=JSON.stringify(output===undefined?null:output);
  const outputBytes=Buffer.byteLength(encoded,"utf8");
  if(outputBytes>envelope.maxOutputBytes)throw codedError("ARCA_SUBSTITUTION_OUTPUT_TOO_LARGE",`substitution output excede ${envelope.maxOutputBytes} bytes`,{outputBytes});
  if(envelope.requiredTopLevelKeys.length){
    if(!plainObject(output))throw codedError("ARCA_SUBSTITUTION_OUTPUT_CONTRACT_MISMATCH","substitution output deve ser objeto");
    for(const key of envelope.requiredTopLevelKeys)if(!Object.prototype.hasOwnProperty.call(output,key))throw codedError("ARCA_SUBSTITUTION_OUTPUT_CONTRACT_MISMATCH",`substitution output sem chave obrigatoria: ${key}`);
  }
  if(envelope.requireRequestCorrelation){
    if(!plainObject(output))throw codedError("ARCA_SUBSTITUTION_CORRELATION_MISMATCH","substitution output deve preservar correlacao");
    for(const key of ["requestId","jobId","taskId"]){
      if(request[key]!==undefined&&output[key]!==request[key])throw codedError("ARCA_SUBSTITUTION_CORRELATION_MISMATCH",`substitution output diverge em ${key}`);
    }
  }
  return {outputBytes,outputHash:sha256Json(output===undefined?null:output)};
}
function normalizeAuthorization(value){
  if(!plainObject(value)||value.allowed!==true)throw codedError("ARCA_SUBSTITUTION_NOT_AUTHORIZED","authorization gate recusou substitution");
  const authorizationId=value.authorizationId==null?null:text(value.authorizationId,"authorizationId",200);
  return Object.freeze({allowed:true,authorizationId});
}
function publicContract(contract){return clone(contract)}
function publicBinding(binding){return clone(binding)}
function signerIdentity(signer){
  const identity=signer?.identity;
  if(!identity||typeof identity.nodeId!=="string"||!identity.nodeId)return null;
  return identity;
}

export async function signCognitiveSubstitutionReceipt(receiptBody,signer,{issuedAt,ttlMs=RECEIPT_TTL_MS}={}){
  if(!plainObject(receiptBody)||receiptBody.format!==ARCA_COGNITIVE_SUBSTITUTION_RECEIPT_FORMAT)throw new TypeError("cognitive substitution receipt body invalido");
  const identity=signerIdentity(signer);
  if(!identity)throw codedError("ARCA_SUBSTITUTION_RECEIPT_SIGNER_REQUIRED","receipt signer identity obrigatoria");
  const base={...clone(receiptBody),issuerNodeId:identity.nodeId};
  delete base.receiptHash;
  delete base.signedReceipt;
  const receiptHash=sha256Json(base);
  const payload=Object.freeze({...base,receiptHash});
  const options={issuedAt:issuedAt??base.completedAt,ttlMs};
  const signedReceipt=typeof signer.signCognitiveSubstitutionReceipt==="function"
    ?await signer.signCognitiveSubstitutionReceipt(payload,options)
    :signMeshCognitiveSubstitutionReceipt(payload,signer,options);
  return Object.freeze({...payload,signedReceipt});
}

export function verifyCognitiveSubstitutionReceipt(receipt,{trustStore,now=null,clockSkewMs=0}={}){
  try{
    if(!plainObject(receipt)||receipt.format!==ARCA_COGNITIVE_SUBSTITUTION_RECEIPT_FORMAT)return false;
    if(typeof receipt.receiptHash!=="string"||!HASH.test(receipt.receiptHash)||!plainObject(receipt.signedReceipt))return false;
    if(typeof trustStore?.verify!=="function")return false;
    const {receiptHash,signedReceipt,...body}=receipt;
    if(sha256Json(body)!==receiptHash)return false;
    if(body.issuerNodeId!==signedReceipt?.signer?.nodeId)return false;
    const expectedPayload={...body,receiptHash};
    if(stable(signedReceipt.payload)!==stable(expectedPayload))return false;
    const verificationNow=now??new Date(body.completedAt);
    verifySignedMeshCognitiveSubstitutionReceipt(signedReceipt,{
      expectedNodeId:body.issuerNodeId,
      now:verificationNow,
      clockSkewMs
    });
    trustStore.verify(signedReceipt,{
      expectedDomain:MESH_COGNITIVE_SUBSTITUTION_RECEIPT_DOMAIN,
      expectedNodeId:body.issuerNodeId,
      now:verificationNow,
      clockSkewMs
    });
    return true;
  }catch{
    return false;
  }
}

export class RoleContractRegistry{
  #roles=new Map();

  register(input){
    const contract=normalizeRole(input);
    if(this.#roles.has(contract.roleId))throw new Error(`role contract ja registrado: ${contract.roleId}`);
    this.#roles.set(contract.roleId,contract);
    return publicContract(contract);
  }

  get(roleId){
    const contract=this.#roles.get(String(roleId).toLowerCase());
    return contract?publicContract(contract):null;
  }

  has(roleId){return this.#roles.has(String(roleId).toLowerCase())}
  remove(roleId){return this.#roles.delete(String(roleId).toLowerCase())}
  list(){return [...this.#roles.values()].map(publicContract).sort((a,b)=>a.roleId.localeCompare(b.roleId))}
}

export class ParticipantRuntimeBindingRegistry{
  #bindings=new Map();

  register(input,options={}){
    const binding=normalizeRuntimeBinding(input,options);
    if(this.#bindings.has(binding.participantId))throw new Error(`runtime binding ja registrado: ${binding.participantId}`);
    this.#bindings.set(binding.participantId,binding);
    return publicBinding(binding);
  }

  bindPassport(passport,runtime,{boundAt}={}){
    if(!plainObject(passport))throw new TypeError("capability passport obrigatorio");
    return this.register({
      participantId:passport.participantId,
      participantDescriptorHash:passport.descriptorHash,
      runtimeKind:runtime?.runtimeKind,
      runtimeId:runtime?.runtimeId
    },{boundAt});
  }

  get(participantId){
    const binding=this.#bindings.get(String(participantId));
    return binding?publicBinding(binding):null;
  }

  remove(participantId){return this.#bindings.delete(String(participantId))}
  list(){return [...this.#bindings.values()].map(publicBinding).sort((a,b)=>a.participantId.localeCompare(b.participantId))}

  resolveForPassport(passport){
    if(!plainObject(passport))throw new TypeError("capability passport obrigatorio");
    const binding=this.#bindings.get(String(passport.participantId));
    if(!binding)throw codedError("ARCA_SUBSTITUTION_RUNTIME_BINDING_MISSING",`runtime binding ausente: ${passport.participantId}`,{participantId:passport.participantId});
    if(binding.participantDescriptorHash!==passport.descriptorHash)throw codedError("ARCA_SUBSTITUTION_RUNTIME_BINDING_STALE",`runtime binding obsoleto: ${passport.participantId}`,{
      participantId:passport.participantId,
      bindingDescriptorHash:binding.participantDescriptorHash,
      participantDescriptorHash:passport.descriptorHash
    });
    return publicBinding(binding);
  }
}

export class CognitiveSubstitutionRouter{
  constructor({
    capabilityRegistry,
    roleRegistry,
    bindingRegistry,
    conformanceRegistry,
    dispatch,
    authorize,
    receiptSigner,
    trustStore,
    isAvailable=async()=>true,
    now=()=>new Date()
  }={}){
    if(!(capabilityRegistry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio");
    if(!(roleRegistry instanceof RoleContractRegistry))throw new TypeError("RoleContractRegistry obrigatorio");
    if(!(bindingRegistry instanceof ParticipantRuntimeBindingRegistry))throw new TypeError("ParticipantRuntimeBindingRegistry obrigatorio");
    if(!(conformanceRegistry instanceof RoleConformanceRegistry))throw new TypeError("RoleConformanceRegistry obrigatorio");
    if(typeof dispatch!=="function")throw new TypeError("dispatch(participantId, request, context) obrigatorio");
    if(typeof authorize!=="function")throw new TypeError("authorize(context) obrigatorio");
    if(!signerIdentity(receiptSigner))throw new TypeError("receiptSigner com identity obrigatorio");
    if(typeof trustStore?.verify!=="function")throw new TypeError("trustStore.verify() obrigatorio");
    if(typeof isAvailable!=="function")throw new TypeError("isAvailable(context) deve ser funcao");
    if(typeof now!=="function")throw new TypeError("clock now() obrigatorio");
    this.capabilityRegistry=capabilityRegistry;
    this.roleRegistry=roleRegistry;
    this.bindingRegistry=bindingRegistry;
    this.conformanceRegistry=conformanceRegistry;
    this.dispatch=dispatch;
    this.authorize=authorize;
    this.receiptSigner=receiptSigner;
    this.trustStore=trustStore;
    this.isAvailable=isAvailable;
    this.now=now;
  }

  candidates(roleId,{preferredParticipantId=null,excludedParticipantIds=[],requiredParticipantId=null}={}){
    const contract=this.roleRegistry.get(roleId);
    if(!contract)throw codedError("ARCA_SUBSTITUTION_ROLE_UNKNOWN",`role contract desconhecido: ${roleId}`);
    const excluded=new Set(sortedUnique(excludedParticipantIds,"excludedParticipantIds"));
    const required=requiredParticipantId==null?null:identifier(requiredParticipantId,"requiredParticipantId");
    const candidates=this.capabilityRegistry.findCompatible(contract.requiredCapabilities)
      .filter(passport=>contract.allowedKinds.includes(passport.kind))
      .filter(passport=>!excluded.has(passport.participantId))
      .filter(passport=>required===null||passport.participantId===required)
      .sort((a,b)=>{
        if(preferredParticipantId){
          if(a.participantId===preferredParticipantId&&b.participantId!==preferredParticipantId)return -1;
          if(b.participantId===preferredParticipantId&&a.participantId!==preferredParticipantId)return 1;
        }
        return a.participantId.localeCompare(b.participantId);
      });
    return {contract,candidates};
  }

  async resolve(roleId,{preferredParticipantId=null,excludedParticipantIds=[],requiredParticipantId=null,request=null}={}){
    const {contract,candidates}=this.candidates(roleId,{preferredParticipantId,excludedParticipantIds,requiredParticipantId});
    this.conformanceRegistry.requireProfile(contract);
    const unavailable=[];
    const bindingRejected=[];
    const conformanceRejected=[];
    for(const passport of candidates){
      let conformance;
      try{
        conformance=this.conformanceRegistry.resolve(contract,passport,{now:this.now()});
      }catch{
        conformanceRejected.push(passport.participantId);
        continue;
      }
      let binding;
      try{
        binding=this.bindingRegistry.resolveForPassport(passport);
      }catch{
        bindingRejected.push(passport.participantId);
        continue;
      }
      let available=false;
      try{
        available=await this.isAvailable(Object.freeze({
          role:publicContract(contract),
          participant:clone(passport),
          conformance:clone(conformance),
          binding:publicBinding(binding),
          request:clone(request)
        }))===true;
      }catch{
        available=false;
      }
      if(available)return Object.freeze({
        contract,
        participant:passport,
        conformance,
        binding,
        unavailable:Object.freeze([...unavailable]),
        bindingRejected:Object.freeze([...bindingRejected]),
        conformanceRejected:Object.freeze([...conformanceRejected])
      });
      unavailable.push(passport.participantId);
    }
    throw codedError("ARCA_SUBSTITUTION_NO_ELIGIBLE_PARTICIPANT",`nenhum participante verificado, conforme, vinculado e disponivel para role ${contract.roleId}`,{
      unavailableParticipants:[...unavailable],
      bindingRejectedParticipants:[...bindingRejected],
      conformanceRejectedParticipants:[...conformanceRejected]
    });
  }

  async preflight(request,{roleId,preferredParticipantId=null,excludedParticipantIds=[],requiredParticipantId=null,authorizationContext={}}={}){
    if(!plainObject(request))throw new TypeError("substitution request deve ser objeto");
    const safeRequest=clone(request);
    const preferred=preferredParticipantId==null?null:identifier(preferredParticipantId,"preferredParticipantId");
    const excluded=sortedUnique(excludedParticipantIds,"excludedParticipantIds");
    const required=requiredParticipantId==null?null:identifier(requiredParticipantId,"requiredParticipantId");
    const resolved=await this.resolve(roleId,{preferredParticipantId:preferred,excludedParticipantIds:excluded,requiredParticipantId:required,request:safeRequest});
    const authorization=normalizeAuthorization(await this.authorize(Object.freeze({
      role:publicContract(resolved.contract),
      participant:clone(resolved.participant),
      conformance:clone(resolved.conformance),
      binding:publicBinding(resolved.binding),
      request:clone(safeRequest),
      authorizationContext:clone(authorizationContext)
    })));
    return Object.freeze({
      request:safeRequest,
      preferredParticipantId:preferred,
      excludedParticipantIds:Object.freeze([...excluded]),
      requiredParticipantId:required,
      resolved,
      authorization
    });
  }

  async call(request,{roleId,preferredParticipantId=null,excludedParticipantIds=[],authorizationContext={}}={}){
    const preflight=await this.preflight(request,{roleId,preferredParticipantId,excludedParticipantIds,authorizationContext});
    const safeRequest=preflight.request;
    const preferred=preflight.preferredParticipantId;
    const resolved=preflight.resolved;
    const authorization=preflight.authorization;
    let output;
    try{
      output=await this.dispatch(resolved.participant.participantId,clone(safeRequest),Object.freeze({
        role:publicContract(resolved.contract),
        participant:clone(resolved.participant),
        conformance:clone(resolved.conformance),
        binding:publicBinding(resolved.binding),
        authorization
      }));
    }catch(cause){
      throw codedError("ARCA_SUBSTITUTION_EXECUTION_FAILED",`participant ${resolved.participant.participantId} falhou; V0.2 nao executa failover pos-inicio`,{
        selectedParticipantId:resolved.participant.participantId,
        runtimeId:resolved.binding.runtimeId,
        cause
      });
    }
    const validated=validateOutput(output,safeRequest,resolved.contract.behaviorEnvelope);
    const completedAt=isoTimestamp(this.now());
    const substituted=preferred!==null&&preferred!==resolved.participant.participantId;
    const receiptBody={
      format:ARCA_COGNITIVE_SUBSTITUTION_RECEIPT_FORMAT,
      version:1,
      roleId:resolved.contract.roleId,
      roleContractHash:resolved.contract.contractHash,
      preferredParticipantId:preferred,
      selectedParticipantId:resolved.participant.participantId,
      participantDescriptorHash:resolved.participant.descriptorHash,
      roleConformanceProfileHash:resolved.conformance.profile.profileHash,
      roleConformanceEvidenceHash:resolved.conformance.evidence.evidenceHash,
      conformanceVerifiedAt:resolved.conformance.evidence.testedAt,
      conformanceValidUntil:resolved.conformance.evidence.validUntil,
      runtimeBindingHash:resolved.binding.bindingHash,
      runtimeKind:resolved.binding.runtimeKind,
      runtimeId:resolved.binding.runtimeId,
      substituted,
      selectionReason:preferred===null?"role-match":substituted?"preflight-substitute":"preferred",
      unavailableParticipants:[...resolved.unavailable],
      bindingRejectedParticipants:[...resolved.bindingRejected],
      conformanceRejectedParticipants:[...resolved.conformanceRejected],
      substitutionPolicy:resolved.contract.substitutionPolicy,
      dispatchAttempts:1,
      policyDecisionId:authorization.authorizationId,
      requestHash:sha256Json(safeRequest),
      outputHash:validated.outputHash,
      outputBytes:validated.outputBytes,
      completedAt,
      policyMaterialIncluded:false,
      capabilityPolicyConflated:false,
      postFailureFailoverPerformed:false
    };
    const receipt=await signCognitiveSubstitutionReceipt(receiptBody,this.receiptSigner,{issuedAt:new Date(completedAt)});
    if(!verifyCognitiveSubstitutionReceipt(receipt,{trustStore:this.trustStore,now:new Date(completedAt)}))throw codedError("ARCA_SUBSTITUTION_RECEIPT_SIGNATURE_INVALID","signed substitution receipt failed local trust verification");
    return Object.freeze({
      format:ARCA_COGNITIVE_SUBSTITUTION_RESULT_FORMAT,
      version:1,
      roleId:resolved.contract.roleId,
      selectedParticipantId:resolved.participant.participantId,
      roleConformanceEvidenceHash:resolved.conformance.evidence.evidenceHash,
      runtimeKind:resolved.binding.runtimeKind,
      runtimeId:resolved.binding.runtimeId,
      substituted,
      humanReviewRequired:resolved.contract.humanReviewRequired,
      coreMutationPerformed:false,
      output:clone(output),
      receipt
    });
  }
}

export function createAgentGatewaySubstitutionDispatch(gateway,{allowExternal=false,externalClient={}}={}){
  if(!gateway||typeof gateway.dispatch!=="function"||!gateway.registry||typeof gateway.registry.has!=="function")throw new TypeError("AgentGateway compativel obrigatorio");
  return async function dispatchToAgent(_participantId,request,context={}){
    if(!plainObject(request))throw new TypeError("agent substitution request deve ser objeto");
    const role=context?.role;
    const binding=context?.binding;
    if(!plainObject(role)||!Array.isArray(role.requiredCapabilities))throw new TypeError("role context obrigatorio para AgentGateway substitution");
    if(!plainObject(binding)||binding.runtimeKind!=="agent-gateway")throw codedError("ARCA_SUBSTITUTION_RUNTIME_BINDING_KIND_MISMATCH","AgentGateway exige runtimeKind=agent-gateway");
    const requiredCapabilities=[...new Set([...(request.requiredCapabilities??[]),...role.requiredCapabilities].map(value=>String(value).trim().toLowerCase()).filter(Boolean))].sort();
    const task={
      ...clone(request),
      taskId:request.taskId??request.requestId,
      requiredCapabilities
    };
    const result=await gateway.dispatch(task,{
      allowExternal:allowExternal===true,
      targetAgentId:binding.runtimeId,
      externalClient
    });
    if(result?.agent?.id!==binding.runtimeId)throw codedError("ARCA_SUBSTITUTION_TARGET_MISMATCH","AgentGateway executou runtime diferente do binding selecionado");
    return result;
  };
}

export function createMachineBridgeSubstitutionDispatch(client,{callOptions={}}={}){
  if(!client||typeof client.call!=="function")throw new TypeError("Machine Bridge client com call() obrigatorio");
  if(!plainObject(callOptions))throw new TypeError("callOptions deve ser objeto");
  return async function dispatchToMachineBridge(_participantId,request,context={}){
    if(!plainObject(request))throw new TypeError("Machine Bridge substitution request deve ser objeto");
    const role=context?.role;
    const binding=context?.binding;
    if(!plainObject(role)||!Array.isArray(role.requiredCapabilities))throw new TypeError("role context obrigatorio para Machine Bridge substitution");
    if(!plainObject(binding)||binding.runtimeKind!=="machine-bridge-worker")throw codedError("ARCA_SUBSTITUTION_RUNTIME_BINDING_KIND_MISMATCH","Machine Bridge exige runtimeKind=machine-bridge-worker");
    if(request.workerTarget!==undefined&&request.workerTarget!=="any"&&request.workerTarget!==binding.runtimeId)throw codedError("ARCA_SUBSTITUTION_TARGET_MISMATCH","job ja possui workerTarget divergente do runtime binding");
    const requires=[...new Set([...(request.requires??[]),...role.requiredCapabilities].map(value=>String(value).trim()).filter(Boolean))].sort();
    return client.call({...clone(request),workerTarget:binding.runtimeId,requires},clone(callOptions));
  };
}
