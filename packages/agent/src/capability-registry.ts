import {createHash} from "node:crypto";

export const ARCA_CAPABILITY_PASSPORT_FORMAT="arca-capability-passport-v1";
export const ARCA_CAPABILITY_VERIFICATION_FORMAT="arca-capability-verification-v1";
export const ARCA_CAPABILITY_CATALOG_FORMAT="arca-capability-catalog-v1";

export const CAPABILITY_STATUSES=Object.freeze([
  "declared",
  "verified",
  "degraded",
  "unavailable",
  "unknown",
  "verification-needed"
]);

const STATUS_SET=new Set(CAPABILITY_STATUSES);
const PARTICIPANT_KINDS=new Set(["agent","worker","tool","connector","model","service"]);
const RISK_CLASSES=new Set(["low","medium","high","critical","unspecified"]);
const IDENTIFIER=/^[A-Za-z0-9._:-]{1,120}$/;
const SECRET_KEYS=new Set([
  "apikey","api_key","token","accesstoken","access_token","secret","clientsecret","client_secret",
  "password","authorization","credential","credentials","credentialref","credential_ref"
]);

function plainObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function text(value,field,max,{required=true}={}){
  const normalized=String(value??"").trim();
  if(required&&!normalized)throw new TypeError(`${field} obrigatorio`);
  if(normalized.length>max)throw new RangeError(`${field} excede ${max} caracteres`);
  return normalized;
}
function identifier(value,field){const normalized=text(value,field,120);if(!IDENTIFIER.test(normalized))throw new TypeError(`${field} invalido`);return normalized}
function sortedUnique(values,field,max=80){
  if(values==null)return [];
  if(!Array.isArray(values))throw new TypeError(`${field} deve ser array`);
  return [...new Set(values.map(value=>text(value,field,max)))].sort();
}
function assertNoSecrets(value,path="metadata"){
  if(Array.isArray(value)){value.forEach((item,index)=>assertNoSecrets(item,`${path}[${index}]`));return}
  if(!plainObject(value))return;
  for(const [key,item] of Object.entries(value)){
    const normalized=key.toLowerCase().replaceAll("-","");
    if(SECRET_KEYS.has(key.toLowerCase())||SECRET_KEYS.has(normalized))throw new Error(`campo sensivel nao permitido em ${path}.${key}`);
    assertNoSecrets(item,`${path}.${key}`);
  }
}
function normalizeLabels(value={}){
  if(!plainObject(value))throw new TypeError("labels deve ser objeto");
  assertNoSecrets(value,"labels");
  const result={};
  for(const key of Object.keys(value).sort()){
    const name=text(key,"labels key",80);
    const item=value[key];
    if(item===null||typeof item==="boolean"||typeof item==="number")result[name]=item;
    else result[name]=text(item,`labels.${name}`,240,{required:false});
  }
  return result;
}
function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(plainObject(value)){
    const result={};
    for(const key of Object.keys(value).sort())if(value[key]!==undefined)result[key]=canonicalize(value[key]);
    return result;
  }
  return value;
}
function sha256Json(value){return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}
function isoTimestamp(value=new Date().toISOString()){
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime()))throw new TypeError("timestamp invalido");
  return parsed.toISOString();
}
function nullableBoolean(value,field){if(value===undefined||value===null)return null;if(typeof value!=="boolean")throw new TypeError(`${field} deve ser boolean ou null`);return value}
function normalizeMedia(values,field){return sortedUnique(values??[],field,80).map(value=>value.toLowerCase())}

function structuralCapability(input){
  const source=typeof input==="string"?{id:input}:input;
  if(!plainObject(source))throw new TypeError("capability invalida");
  const id=identifier(source.id,"capability.id").toLowerCase();
  const version=text(source.version??"1","capability.version",40);
  const riskClass=String(source.riskClass??"unspecified").toLowerCase();
  if(!RISK_CLASSES.has(riskClass))throw new TypeError(`riskClass invalida: ${riskClass}`);
  return {
    id,
    version,
    input:normalizeMedia(source.input,"capability.input"),
    output:normalizeMedia(source.output,"capability.output"),
    networkRequired:nullableBoolean(source.networkRequired,"capability.networkRequired"),
    humanReviewRequired:nullableBoolean(source.humanReviewRequired,"capability.humanReviewRequired"),
    riskClass
  };
}

function normalizeParticipant(input,{source="declared"}={}){
  if(!plainObject(input))throw new TypeError("participant descriptor invalido");
  assertNoSecrets(input,"participant");
  const participantId=identifier(input.participantId??input.id,"participantId");
  const kind=String(input.kind??"agent").trim().toLowerCase();
  if(!PARTICIPANT_KINDS.has(kind))throw new TypeError(`participant kind invalido: ${kind}`);
  const provider=text(input.provider??"unknown","provider",120);
  const model=input.model==null?null:text(input.model,"model",160);
  const labels=normalizeLabels(input.labels??{});
  const rawCapabilities=input.capabilities??[];
  if(!Array.isArray(rawCapabilities))throw new TypeError("capabilities deve ser array");
  const byId=new Map();
  for(const raw of rawCapabilities){
    const structural=structuralCapability(raw);
    if(byId.has(structural.id))throw new Error(`capability duplicada: ${structural.id}`);
    byId.set(structural.id,structural);
  }
  const environment={participantId,kind,provider,model,labels};
  const capabilities=[...byId.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const descriptorHash=sha256Json({environment,capabilities});
  return {participantId,kind,provider,model,labels,source:text(source,"source",80),capabilities,descriptorHash};
}

function publicPassport(entry){
  return clone({
    format:ARCA_CAPABILITY_PASSPORT_FORMAT,
    participantId:entry.participantId,
    kind:entry.kind,
    provider:entry.provider,
    model:entry.model,
    labels:entry.labels,
    source:entry.source,
    descriptorHash:entry.descriptorHash,
    capabilities:entry.capabilities.map(capability=>({
      id:capability.id,
      version:capability.version,
      status:capability.status,
      input:capability.input,
      output:capability.output,
      networkRequired:capability.networkRequired,
      humanReviewRequired:capability.humanReviewRequired,
      riskClass:capability.riskClass,
      fingerprint:capability.fingerprint,
      verifiedAt:capability.verifiedAt
    })),
    updatedAt:entry.updatedAt
  });
}

function capabilityFingerprint(participant,capability){
  return sha256Json({
    participant:{
      participantId:participant.participantId,
      kind:participant.kind,
      provider:participant.provider,
      model:participant.model,
      labels:participant.labels
    },
    capability
  });
}

export function verifyCapabilityVerificationChain(events=[]){
  if(!Array.isArray(events))return false;
  let previous=null;
  for(const raw of events){
    if(!plainObject(raw)||raw.format!==ARCA_CAPABILITY_VERIFICATION_FORMAT)return false;
    if((raw.previousRecordHash??null)!==previous)return false;
    const {recordHash,...payload}=raw;
    if(typeof recordHash!=="string"||recordHash!==sha256Json(payload))return false;
    previous=recordHash;
  }
  return true;
}

export class CapabilityRegistry{
  #participants=new Map();
  #verificationHistory=new Map();

  upsertParticipant(input,options={}){
    const normalized=normalizeParticipant(input,options);
    const previous=this.#participants.get(normalized.participantId)??null;
    const previousCaps=new Map((previous?.capabilities??[]).map(capability=>[capability.id,capability]));
    const now=isoTimestamp(options.updatedAt);
    const entry={...normalized,capabilities:normalized.capabilities.map(structural=>{
      const fingerprint=capabilityFingerprint(normalized,structural);
      const old=previousCaps.get(structural.id);
      let status="declared";
      let verifiedAt=null;
      if(old&&old.fingerprint===fingerprint){status=old.status;verifiedAt=old.verifiedAt}
      else if(old?.status==="verified")status="verification-needed";
      return {...structural,status,fingerprint,verifiedAt};
    }),updatedAt:now};
    this.#participants.set(entry.participantId,entry);
    if(!this.#verificationHistory.has(entry.participantId))this.#verificationHistory.set(entry.participantId,[]);
    return publicPassport(entry);
  }

  registerParticipant(input,options={}){
    const participantId=String(input?.participantId??input?.id??"");
    if(this.#participants.has(participantId))throw new Error(`participant ja registrado: ${participantId}`);
    return this.upsertParticipant(input,options);
  }

  removeParticipant(participantId){return this.#participants.delete(String(participantId))}
  has(participantId){return this.#participants.has(String(participantId))}
  getPassport(participantId){const entry=this.#participants.get(String(participantId));return entry?publicPassport(entry):null}
  listPassports(){return [...this.#participants.values()].map(publicPassport).sort((a,b)=>a.participantId.localeCompare(b.participantId))}

  syncAgentRegistry(agentRegistry,{updatedAt}={}){
    if(!agentRegistry||typeof agentRegistry.list!=="function")throw new TypeError("AgentRegistry com list() obrigatorio");
    const passports=[];
    for(const agent of agentRegistry.list()){
      passports.push(this.upsertParticipant({
        participantId:agent.id,
        kind:"agent",
        provider:agent.provider,
        labels:{agentKind:agent.kind,principal:agent.principal===true},
        capabilities:agent.capabilities
      },{source:"agent-registry",updatedAt}));
    }
    return passports;
  }

  recordVerification(input){
    if(!plainObject(input))throw new TypeError("verification invalida");
    const participantId=identifier(input.participantId,"participantId");
    const capabilityId=identifier(input.capabilityId,"capabilityId").toLowerCase();
    const entry=this.#participants.get(participantId);
    if(!entry)throw new Error(`participant desconhecido: ${participantId}`);
    const index=entry.capabilities.findIndex(capability=>capability.id===capabilityId);
    if(index<0)throw new Error(`capability desconhecida: ${capabilityId}`);
    if(typeof input.passed!=="boolean")throw new TypeError("passed deve ser boolean");
    const capability=entry.capabilities[index];
    const testedAt=isoTimestamp(input.testedAt);
    const verifierId=identifier(input.verifierId??"arca-conformance","verifierId");
    const evidenceHash=input.evidenceHash==null?null:text(input.evidenceHash,"evidenceHash",128);
    if(evidenceHash&&!/^[a-fA-F0-9]{64}$/.test(evidenceHash))throw new TypeError("evidenceHash deve ser SHA-256 hexadecimal");
    const notes=input.notes==null?null:text(input.notes,"notes",500,{required:false});
    const history=this.#verificationHistory.get(participantId)??[];
    const previousRecordHash=history.at(-1)?.recordHash??null;
    const payload={
      format:ARCA_CAPABILITY_VERIFICATION_FORMAT,
      participantId,
      capabilityId,
      capabilityFingerprint:capability.fingerprint,
      verifierId,
      testedAt,
      outcome:input.passed?"passed":"failed",
      evidenceHash,
      notes,
      previousRecordHash
    };
    const record=Object.freeze({...payload,recordHash:sha256Json(payload)});
    history.push(record);
    this.#verificationHistory.set(participantId,history);
    const updated={...capability,status:input.passed?"verified":"degraded",verifiedAt:input.passed?testedAt:null};
    entry.capabilities=[...entry.capabilities.slice(0,index),updated,...entry.capabilities.slice(index+1)];
    entry.updatedAt=testedAt;
    return clone(record);
  }

  setCapabilityStatus(participantId,capabilityId,status,{updatedAt}={}){
    const targetStatus=String(status).trim().toLowerCase();
    if(!STATUS_SET.has(targetStatus))throw new TypeError(`status invalido: ${targetStatus}`);
    if(targetStatus==="verified")throw new Error("status verified exige recordVerification() bem-sucedido");
    const entry=this.#participants.get(String(participantId));
    if(!entry)throw new Error(`participant desconhecido: ${participantId}`);
    const id=String(capabilityId).toLowerCase();
    const index=entry.capabilities.findIndex(capability=>capability.id===id);
    if(index<0)throw new Error(`capability desconhecida: ${id}`);
    const capability=entry.capabilities[index];
    const next={...capability,status:targetStatus,verifiedAt:null};
    entry.capabilities=[...entry.capabilities.slice(0,index),next,...entry.capabilities.slice(index+1)];
    entry.updatedAt=isoTimestamp(updatedAt);
    return publicPassport(entry);
  }

  requireReverification(participantId,{updatedAt}={}){
    const entry=this.#participants.get(String(participantId));
    if(!entry)throw new Error(`participant desconhecido: ${participantId}`);
    entry.capabilities=entry.capabilities.map(capability=>capability.status==="verified"?{...capability,status:"verification-needed",verifiedAt:null}:capability);
    entry.updatedAt=isoTimestamp(updatedAt);
    return publicPassport(entry);
  }

  getVerificationHistory(participantId){return clone(this.#verificationHistory.get(String(participantId))??[])}
  verifyAudit(participantId){return verifyCapabilityVerificationChain(this.getVerificationHistory(participantId))}

  findCompatible(requiredCapabilities=[],options={}){
    const required=sortedUnique(requiredCapabilities,"requiredCapabilities",120).map(value=>value.toLowerCase());
    const allowed=new Set(options.allowedStatuses??["verified"]);
    if(options.includeDeclared===true)allowed.add("declared");
    for(const status of allowed)if(!STATUS_SET.has(status))throw new TypeError(`status de compatibilidade invalido: ${status}`);
    return this.listPassports().filter(passport=>required.every(id=>passport.capabilities.some(capability=>capability.id===id&&allowed.has(capability.status))));
  }

  snapshot({generatedAt}={}){
    return Object.freeze({
      format:ARCA_CAPABILITY_CATALOG_FORMAT,
      generatedAt:isoTimestamp(generatedAt),
      authorizationIncluded:false,
      passports:this.listPassports()
    });
  }
}

export function createCapabilityRegistryFromAgents(agentRegistry,options={}){
  const registry=new CapabilityRegistry();
  registry.syncAgentRegistry(agentRegistry,options);
  return registry;
}
