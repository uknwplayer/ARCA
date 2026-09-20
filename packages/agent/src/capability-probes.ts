import {createHash} from "node:crypto";
import {CapabilityRegistry} from "./capability-registry.ts";

export const ARCA_CAPABILITY_PROBE_FORMAT="arca-capability-probe-v1";
export const ARCA_CAPABILITY_PROBE_RESULT_FORMAT="arca-capability-probe-result-v1";

const IDENTIFIER=/^[A-Za-z0-9._:-]{1,120}$/;
const ASSERTION_TYPES=new Set(["exact-json","json-subset","text-contains-all","nonempty-text","boolean-true"]);
const SECRET_KEYS=new Set(["apikey","api_key","token","accesstoken","access_token","secret","clientsecret","client_secret","password","authorization","credential","credentials","credentialref","credential_ref"]);
const MAX_PROBE_INPUT_BYTES=32*1024;
const MAX_RESULT_BYTES=256*1024;

function plainObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function text(value,field,max,{required=true}={}){const normalized=String(value??"").trim();if(required&&!normalized)throw new TypeError(`${field} obrigatorio`);if(normalized.length>max)throw new RangeError(`${field} excede ${max} caracteres`);return normalized}
function identifier(value,field){const normalized=text(value,field,120);if(!IDENTIFIER.test(normalized))throw new TypeError(`${field} invalido`);return normalized}
function assertNoSecrets(value,path="probe"){
  if(Array.isArray(value)){value.forEach((item,index)=>assertNoSecrets(item,`${path}[${index}]`));return}
  if(!plainObject(value))return;
  for(const [key,item] of Object.entries(value)){
    const normalized=key.toLowerCase().replaceAll("-","");
    if(SECRET_KEYS.has(key.toLowerCase())||SECRET_KEYS.has(normalized))throw new Error(`campo sensivel nao permitido em ${path}.${key}`);
    assertNoSecrets(item,`${path}.${key}`);
  }
}
function canonicalize(value){if(Array.isArray(value))return value.map(canonicalize);if(plainObject(value)){const out={};for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonicalize(value[key]);return out}return value}
function sha256Json(value){return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}
function byteLength(value){return Buffer.byteLength(JSON.stringify(value),"utf8")}
function deepSubset(actual,expected){
  if(Array.isArray(expected)){if(!Array.isArray(actual)||actual.length<expected.length)return false;return expected.every((item,index)=>deepSubset(actual[index],item))}
  if(plainObject(expected)){if(!plainObject(actual))return false;return Object.entries(expected).every(([key,value])=>Object.prototype.hasOwnProperty.call(actual,key)&&deepSubset(actual[key],value))}
  return Object.is(actual,expected);
}
function normalizeAssertion(input){
  if(!plainObject(input))throw new TypeError("assertion obrigatoria");
  const type=String(input.type??"").trim().toLowerCase();
  if(!ASSERTION_TYPES.has(type))throw new TypeError(`assertion.type invalido: ${type}`);
  if(type==="exact-json"||type==="json-subset"){
    if(input.expected===undefined)throw new TypeError("assertion.expected obrigatorio");
    assertNoSecrets(input.expected,"assertion.expected");
    return {type,expected:clone(input.expected)};
  }
  if(type==="text-contains-all"){
    if(!Array.isArray(input.values)||!input.values.length)throw new TypeError("assertion.values deve ser array nao vazio");
    return {type,values:[...new Set(input.values.map(value=>text(value,"assertion.values",200)))].sort()};
  }
  return {type};
}
function normalizeProbe(input){
  if(!plainObject(input))throw new TypeError("probe invalido");
  assertNoSecrets(input,"probe");
  const probeId=identifier(input.probeId??input.id,"probeId");
  const capabilityId=identifier(input.capabilityId,"capabilityId").toLowerCase();
  const version=text(input.version??"1","probe.version",40);
  const timeoutMs=Number(input.timeoutMs??10000);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw new RangeError("timeoutMs deve estar entre 1000 e 30000");
  if(input.syntheticOnly!==true)throw new Error("probe deve declarar syntheticOnly=true");
  if(input.sideEffects!==false)throw new Error("probe deve declarar sideEffects=false");
  if(input.subjectNetworkRequired===true)throw new Error("probe seguro nao pode exigir rede externa do participante");
  const payload=clone(input.input??{});
  assertNoSecrets(payload,"probe.input");
  if(byteLength(payload)>MAX_PROBE_INPUT_BYTES)throw new RangeError(`probe.input excede ${MAX_PROBE_INPUT_BYTES} bytes`);
  return Object.freeze({
    format:ARCA_CAPABILITY_PROBE_FORMAT,
    probeId,
    capabilityId,
    version,
    timeoutMs,
    syntheticOnly:true,
    sideEffects:false,
    subjectNetworkRequired:false,
    input:payload,
    assertion:normalizeAssertion(input.assertion)
  });
}
function evaluate(assertion,output){
  switch(assertion.type){
    case "exact-json": return {passed:deepSubset(output,assertion.expected)&&deepSubset(assertion.expected,output),reason:"exact-json"};
    case "json-subset": return {passed:deepSubset(output,assertion.expected),reason:"json-subset"};
    case "text-contains-all": {const body=typeof output==="string"?output:JSON.stringify(output);return {passed:assertion.values.every(value=>body.includes(value)),reason:"text-contains-all"}}
    case "nonempty-text": return {passed:typeof output==="string"&&output.trim().length>0,reason:"nonempty-text"};
    case "boolean-true": return {passed:output===true,reason:"boolean-true"};
    default: return {passed:false,reason:"unsupported-assertion"};
  }
}
function publicProbe(probe){return clone(probe)}

export class CapabilityProbeRegistry{
  #probes=new Map();
  register(input){const probe=normalizeProbe(input);if(this.#probes.has(probe.probeId))throw new Error(`probe ja registrado: ${probe.probeId}`);this.#probes.set(probe.probeId,probe);return this}
  has(probeId){return this.#probes.has(String(probeId))}
  get(probeId){const probe=this.#probes.get(String(probeId));return probe?publicProbe(probe):null}
  list(){return [...this.#probes.values()].map(publicProbe).sort((a,b)=>a.probeId.localeCompare(b.probeId))}
}

export function createDefaultCapabilityProbeRegistry(){
  return new CapabilityProbeRegistry().register({
    probeId:"arca.json.structured-output.v1",
    capabilityId:"json.structured-output",
    version:"1",
    timeoutMs:10000,
    syntheticOnly:true,
    sideEffects:false,
    subjectNetworkRequired:false,
    input:{instruction:"Return exactly this JSON object and nothing else.",expected:{ok:true,marker:"ARCA-CAPABILITY-PROBE"}},
    assertion:{type:"exact-json",expected:{ok:true,marker:"ARCA-CAPABILITY-PROBE"}}
  });
}

export async function runCapabilityProbe({capabilityRegistry,probeRegistry,participantId,probeId,execute,testedAt,verifierId="arca-conformance"}={}){
  if(!(capabilityRegistry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio");
  if(!(probeRegistry instanceof CapabilityProbeRegistry))throw new TypeError("CapabilityProbeRegistry obrigatorio");
  if(typeof execute!=="function")throw new TypeError("execute obrigatorio");
  const id=identifier(participantId,"participantId");
  const probe=probeRegistry.get(probeId);
  if(!probe)throw new Error(`probe desconhecido: ${probeId}`);
  const passport=capabilityRegistry.getPassport(id);
  if(!passport)throw new Error(`participant desconhecido: ${id}`);
  const capability=passport.capabilities.find(item=>item.id===probe.capabilityId);
  if(!capability)throw new Error(`participant nao declara capability: ${probe.capabilityId}`);
  if(capability.status==="unavailable")throw new Error(`capability indisponivel: ${probe.capabilityId}`);

  const controller=new AbortController();
  let timer;
  let output;
  let executionState="completed";
  try{
    output=await Promise.race([
      Promise.resolve(execute({
        format:ARCA_CAPABILITY_PROBE_FORMAT,
        probeId:probe.probeId,
        participantId:id,
        capabilityId:probe.capabilityId,
        synthetic:true,
        input:clone(probe.input),
        signal:controller.signal
      })),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("probe-timeout"))},probe.timeoutMs)})
    ]);
  }catch(error){executionState=error?.message==="probe-timeout"?"timeout":"execution-error"}
  finally{if(timer)clearTimeout(timer)}

  if(executionState==="completed"){
    try{if(byteLength(output)>MAX_RESULT_BYTES)executionState="result-too-large"}
    catch{executionState="non-json-serializable"}
  }
  const assessment=executionState==="completed"?evaluate(probe.assertion,output):{passed:false,reason:executionState};
  const evidenceHash=sha256Json({
    probe:{probeId:probe.probeId,capabilityId:probe.capabilityId,version:probe.version,input:probe.input,assertion:probe.assertion},
    participantId:id,
    capabilityFingerprint:capability.fingerprint,
    executionState,
    output:executionState==="completed"?output:null
  });
  const verification=capabilityRegistry.recordVerification({
    participantId:id,
    capabilityId:probe.capabilityId,
    verifierId,
    passed:assessment.passed,
    testedAt,
    evidenceHash,
    notes:`probe=${probe.probeId}; reason=${assessment.reason}`
  });
  return Object.freeze({
    format:ARCA_CAPABILITY_PROBE_RESULT_FORMAT,
    participantId:id,
    probeId:probe.probeId,
    capabilityId:probe.capabilityId,
    passed:assessment.passed,
    executionState,
    reason:assessment.reason,
    evidenceHash,
    verificationRecordHash:verification.recordHash,
    authorizationIncluded:false,
    sideEffectsPerformed:false,
    rawOutputPersisted:false
  });
}
