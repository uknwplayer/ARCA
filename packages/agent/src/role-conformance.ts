import {createHash} from "node:crypto";

export const ARCA_ROLE_CONFORMANCE_PROFILE_FORMAT="arca-role-conformance-profile-v1";
export const ARCA_ROLE_CONFORMANCE_EVIDENCE_FORMAT="arca-role-conformance-evidence-v1";
export const ARCA_ROLE_CONFORMANCE_RESULT_FORMAT="arca-role-conformance-result-v1";

const IDENTIFIER=/^[A-Za-z0-9._:-]{1,120}$/;
const PATH=/^[A-Za-z0-9_-]{1,120}(?:\.[A-Za-z0-9_-]{1,120}){0,7}$/;
const HASH=/^[a-f0-9]{64}$/;
const SCHEMA_TYPES=new Set(["any","object","array","string","number","integer","boolean","null"]);
const ASSERTION_TYPES=new Set(["exact-json","json-subset","path-equals","path-equals-input","text-contains-all","text-excludes-all","boolean-path-true","array-min-items"]);
const MAX_FIXTURES=20;
const MAX_ASSERTIONS=20;
const MAX_SCHEMA_DEPTH=6;
const MAX_SCHEMA_PROPERTIES=64;
const MAX_FIXTURE_INPUT_BYTES=32*1024;
const MAX_OUTPUT_BYTES=256*1024;
const MAX_PROFILE_BYTES=256*1024;
const MIN_MAX_AGE_MS=60_000;
const MAX_MAX_AGE_MS=30*24*60*60*1000;
const SECRET_KEY=/(authorization|bearer|token|password|secret|api[_-]?key|client[_-]?secret|private[_-]?key|cookie|credential)/i;

function plainObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){
  if(value===undefined)return undefined;
  return JSON.parse(JSON.stringify(value));
}
function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(plainObject(value)){
    const out={};
    for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonicalize(value[key]);
    return out;
  }
  return value;
}
function stable(value){return JSON.stringify(canonicalize(value))}
function sha256Json(value){return createHash("sha256").update(stable(value)).digest("hex")}
function bytes(value){
  const encoded=JSON.stringify(value);
  if(encoded===undefined)throw new TypeError("valor deve ser JSON serializavel");
  return Buffer.byteLength(encoded,"utf8");
}
function text(value,field,max,{required=true}={}){
  const normalized=String(value??"").trim();
  if(required&&!normalized)throw new TypeError(field+" obrigatorio");
  if(normalized.length>max)throw new RangeError(field+" excede "+max+" caracteres");
  return normalized;
}
function identifier(value,field){
  const normalized=text(value,field,120);
  if(!IDENTIFIER.test(normalized))throw new TypeError(field+" invalido");
  return normalized;
}
function hash(value,field){
  const normalized=text(value,field,64);
  if(!HASH.test(normalized))throw new TypeError(field+" deve ser SHA-256 hexadecimal");
  return normalized;
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
function sortedUnique(values,field,{max=120}={}){
  if(values==null)return [];
  if(!Array.isArray(values))throw new TypeError(field+" deve ser array");
  return [...new Set(values.map(value=>text(value,field,max)))].sort();
}
function assertNoSecrets(value,path="conformance"){
  if(Array.isArray(value)){
    value.forEach((item,index)=>assertNoSecrets(item,path+"["+index+"]"));
    return;
  }
  if(!plainObject(value))return;
  for(const [key,item] of Object.entries(value)){
    if(SECRET_KEY.test(key))throw new Error("campo sensivel nao permitido em "+path+"."+key);
    assertNoSecrets(item,path+"."+key);
  }
}
function jsonType(value){
  if(value===null)return "null";
  if(Array.isArray(value))return "array";
  if(Number.isInteger(value))return "integer";
  if(typeof value==="number")return "number";
  if(plainObject(value))return "object";
  return typeof value;
}
function normalizeSchema(input={type:"any"},depth=0,path="schema"){
  if(depth>MAX_SCHEMA_DEPTH)throw new RangeError(path+" excede profundidade maxima");
  if(!plainObject(input))throw new TypeError(path+" deve ser objeto");
  const type=String(input.type??"any").trim().toLowerCase();
  if(!SCHEMA_TYPES.has(type))throw new TypeError(path+".type invalido");
  const out={type};
  if(Array.isArray(input.enum)){
    if(!input.enum.length||input.enum.length>32)throw new RangeError(path+".enum invalido");
    const values=clone(input.enum);
    assertNoSecrets(values,path+".enum");
    if(bytes(values)>16*1024)throw new RangeError(path+".enum excede limite");
    out.enum=values;
  }
  if(type==="object"){
    const required=sortedUnique(input.required??[],path+".required");
    const rawProperties=input.properties??{};
    if(!plainObject(rawProperties))throw new TypeError(path+".properties deve ser objeto");
    const keys=Object.keys(rawProperties).sort();
    if(keys.length>MAX_SCHEMA_PROPERTIES)throw new RangeError(path+".properties excede "+MAX_SCHEMA_PROPERTIES);
    const properties={};
    for(const key of keys){
      if(!IDENTIFIER.test(key))throw new TypeError(path+".properties contem chave invalida");
      if(SECRET_KEY.test(key))throw new Error("campo sensivel nao permitido em "+path+".properties."+key);
      properties[key]=normalizeSchema(rawProperties[key],depth+1,path+".properties."+key);
    }
    for(const key of required)if(!Object.prototype.hasOwnProperty.call(properties,key))throw new Error(path+".required referencia propriedade ausente: "+key);
    out.required=required;
    out.properties=properties;
    out.additionalProperties=input.additionalProperties!==false;
  }
  if(type==="array"){
    const minItems=Number(input.minItems??0);
    const maxItems=Number(input.maxItems??1000);
    if(!Number.isSafeInteger(minItems)||minItems<0)throw new RangeError(path+".minItems invalido");
    if(!Number.isSafeInteger(maxItems)||maxItems<minItems||maxItems>10000)throw new RangeError(path+".maxItems invalido");
    out.minItems=minItems;
    out.maxItems=maxItems;
    out.items=normalizeSchema(input.items??{type:"any"},depth+1,path+".items");
  }
  if(type==="string"){
    const minLength=Number(input.minLength??0);
    const maxLength=Number(input.maxLength??100000);
    if(!Number.isSafeInteger(minLength)||minLength<0)throw new RangeError(path+".minLength invalido");
    if(!Number.isSafeInteger(maxLength)||maxLength<minLength||maxLength>1_000_000)throw new RangeError(path+".maxLength invalido");
    out.minLength=minLength;
    out.maxLength=maxLength;
  }
  return Object.freeze(out);
}
function validateSchema(schema,value,path="$",errors=[]){
  if(schema.enum&&!schema.enum.some(item=>stable(item)===stable(value)))errors.push(path+": valor fora de enum");
  if(schema.type!=="any"){
    const actual=jsonType(value);
    const matches=schema.type==="number"?actual==="number"||actual==="integer":actual===schema.type;
    if(!matches){
      errors.push(path+": esperado "+schema.type+", recebido "+actual);
      return errors;
    }
  }
  if(schema.type==="object"&&plainObject(value)){
    for(const key of schema.required)if(!Object.prototype.hasOwnProperty.call(value,key))errors.push(path+"."+key+": obrigatorio");
    for(const [key,item] of Object.entries(value)){
      const child=schema.properties[key];
      if(child)validateSchema(child,item,path+"."+key,errors);
      else if(schema.additionalProperties===false)errors.push(path+"."+key+": propriedade adicional nao permitida");
    }
  }
  if(schema.type==="array"&&Array.isArray(value)){
    if(value.length<schema.minItems)errors.push(path+": menos de "+schema.minItems+" itens");
    if(value.length>schema.maxItems)errors.push(path+": mais de "+schema.maxItems+" itens");
    value.forEach((item,index)=>validateSchema(schema.items,item,path+"["+index+"]",errors));
  }
  if(schema.type==="string"&&typeof value==="string"){
    if(value.length<schema.minLength)errors.push(path+": string curta");
    if(value.length>schema.maxLength)errors.push(path+": string longa");
  }
  return errors;
}
function deepSubset(actual,expected){
  if(Array.isArray(expected)){
    if(!Array.isArray(actual)||actual.length<expected.length)return false;
    return expected.every((item,index)=>deepSubset(actual[index],item));
  }
  if(plainObject(expected)){
    if(!plainObject(actual))return false;
    return Object.entries(expected).every(([key,value])=>Object.prototype.hasOwnProperty.call(actual,key)&&deepSubset(actual[key],value));
  }
  return Object.is(actual,expected);
}
function valueAt(value,path){
  let current=value;
  for(const segment of String(path).split(".")){
    if(!plainObject(current)&&!Array.isArray(current))return {found:false,value:undefined};
    if(!Object.prototype.hasOwnProperty.call(current,segment))return {found:false,value:undefined};
    current=current[segment];
  }
  return {found:true,value:current};
}
function normalizePath(value,field){
  const normalized=text(value,field,500);
  if(!PATH.test(normalized))throw new TypeError(field+" invalido");
  if(normalized.split(".").some(segment=>SECRET_KEY.test(segment)))throw new Error("campo sensivel nao permitido em "+field);
  return normalized;
}
function normalizeAssertion(input,path){
  if(!plainObject(input))throw new TypeError(path+" deve ser objeto");
  const type=String(input.type??"").trim().toLowerCase();
  if(!ASSERTION_TYPES.has(type))throw new TypeError(path+".type invalido: "+type);
  if(type==="exact-json"||type==="json-subset"){
    if(input.expected===undefined)throw new TypeError(path+".expected obrigatorio");
    const expected=clone(input.expected);
    assertNoSecrets(expected,path+".expected");
    return Object.freeze({type,expected});
  }
  if(type==="path-equals"){
    if(input.expected===undefined)throw new TypeError(path+".expected obrigatorio");
    const expected=clone(input.expected);
    assertNoSecrets(expected,path+".expected");
    return Object.freeze({type,path:normalizePath(input.path,path+".path"),expected});
  }
  if(type==="path-equals-input"){
    return Object.freeze({
      type,
      path:normalizePath(input.path,path+".path"),
      inputPath:normalizePath(input.inputPath,path+".inputPath")
    });
  }
  if(type==="text-contains-all"||type==="text-excludes-all"){
    const values=sortedUnique(input.values,path+".values",{max:500});
    if(!values.length)throw new TypeError(path+".values deve ser array nao vazio");
    return Object.freeze({type,values});
  }
  if(type==="boolean-path-true"){
    return Object.freeze({type,path:normalizePath(input.path,path+".path")});
  }
  if(type==="array-min-items"){
    const minItems=Number(input.minItems??1);
    if(!Number.isSafeInteger(minItems)||minItems<1||minItems>10000)throw new RangeError(path+".minItems invalido");
    return Object.freeze({type,path:normalizePath(input.path,path+".path"),minItems});
  }
  throw new TypeError(path+".type nao suportado");
}
function evaluateAssertion(assertion,input,output){
  if(assertion.type==="exact-json")return {passed:deepSubset(output,assertion.expected)&&deepSubset(assertion.expected,output),reason:"exact-json"};
  if(assertion.type==="json-subset")return {passed:deepSubset(output,assertion.expected),reason:"json-subset"};
  if(assertion.type==="path-equals"){
    const actual=valueAt(output,assertion.path);
    return {passed:actual.found&&stable(actual.value)===stable(assertion.expected),reason:"path-equals"};
  }
  if(assertion.type==="path-equals-input"){
    const actual=valueAt(output,assertion.path);
    const expected=valueAt(input,assertion.inputPath);
    return {passed:actual.found&&expected.found&&stable(actual.value)===stable(expected.value),reason:"path-equals-input"};
  }
  if(assertion.type==="text-contains-all"){
    const body=typeof output==="string"?output:JSON.stringify(output);
    return {passed:assertion.values.every(value=>body.includes(value)),reason:"text-contains-all"};
  }
  if(assertion.type==="text-excludes-all"){
    const body=typeof output==="string"?output:JSON.stringify(output);
    return {passed:assertion.values.every(value=>!body.includes(value)),reason:"text-excludes-all"};
  }
  if(assertion.type==="boolean-path-true"){
    const actual=valueAt(output,assertion.path);
    return {passed:actual.found&&actual.value===true,reason:"boolean-path-true"};
  }
  if(assertion.type==="array-min-items"){
    const actual=valueAt(output,assertion.path);
    return {passed:actual.found&&Array.isArray(actual.value)&&actual.value.length>=assertion.minItems,reason:"array-min-items"};
  }
  return {passed:false,reason:"unsupported"};
}
function normalizeFixture(input,index){
  if(!plainObject(input))throw new TypeError("fixtures["+index+"] deve ser objeto");
  const fixtureId=identifier(input.fixtureId??input.id,"fixtures["+index+"].fixtureId");
  const fixtureInput=clone(input.input??{});
  assertNoSecrets(fixtureInput,"fixtures["+index+"].input");
  if(bytes(fixtureInput)>MAX_FIXTURE_INPUT_BYTES)throw new RangeError("fixture input excede "+MAX_FIXTURE_INPUT_BYTES+" bytes");
  if(!Array.isArray(input.assertions)||!input.assertions.length||input.assertions.length>MAX_ASSERTIONS)throw new RangeError("fixtures["+index+"].assertions deve conter 1-"+MAX_ASSERTIONS+" itens");
  const assertions=input.assertions.map((assertion,assertionIndex)=>normalizeAssertion(assertion,"fixtures["+index+"].assertions["+assertionIndex+"]"));
  return Object.freeze({fixtureId,input:fixtureInput,assertions});
}
function normalizeProfile(role,input){
  if(!plainObject(role)||role.format!=="arca-role-contract-v1"||typeof role.contractHash!=="string"||!HASH.test(role.contractHash))throw new TypeError("role contract valido obrigatorio");
  if(!plainObject(input))throw new TypeError("role conformance profile invalido");
  if(input.syntheticOnly!==true)throw new Error("role conformance profile exige syntheticOnly=true");
  if(input.sideEffects!==false)throw new Error("role conformance profile exige sideEffects=false");
  if(input.subjectNetworkRequired===true)throw new Error("role conformance profile nao pode exigir rede externa");
  const profileId=identifier(input.profileId??role.roleId+".conformance.v1","profileId");
  const version=text(input.version??"1","profile.version",40);
  const timeoutMs=Number(input.timeoutMs??10000);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw new RangeError("timeoutMs deve estar entre 1000 e 30000");
  const maxEvidenceAgeMs=Number(input.maxEvidenceAgeMs??24*60*60*1000);
  if(!Number.isSafeInteger(maxEvidenceAgeMs)||maxEvidenceAgeMs<MIN_MAX_AGE_MS||maxEvidenceAgeMs>MAX_MAX_AGE_MS)throw new RangeError("maxEvidenceAgeMs fora do limite");
  const fixtures=(input.fixtures??[]).map(normalizeFixture);
  if(!fixtures.length||fixtures.length>MAX_FIXTURES)throw new RangeError("fixtures deve conter 1-"+MAX_FIXTURES+" itens");
  if(new Set(fixtures.map(item=>item.fixtureId)).size!==fixtures.length)throw new Error("fixtureId duplicado");
  const inputSchema=normalizeSchema(input.inputSchema??{type:"object"},0,"inputSchema");
  const outputSchema=normalizeSchema(input.outputSchema??{type:"object"},0,"outputSchema");
  for(const fixture of fixtures){
    const errors=validateSchema(inputSchema,fixture.input);
    if(errors.length)throw new Error("fixture "+fixture.fixtureId+" viola inputSchema: "+errors[0]);
  }
  const body={
    format:ARCA_ROLE_CONFORMANCE_PROFILE_FORMAT,
    version:1,
    profileId,
    profileVersion:version,
    roleId:role.roleId,
    roleContractHash:role.contractHash,
    syntheticOnly:true,
    sideEffects:false,
    subjectNetworkRequired:false,
    timeoutMs,
    maxEvidenceAgeMs,
    inputSchema,
    outputSchema,
    fixtures
  };
  if(bytes(body)>MAX_PROFILE_BYTES)throw new RangeError("role conformance profile excede "+MAX_PROFILE_BYTES+" bytes");
  return Object.freeze({...body,profileHash:sha256Json(body)});
}
function verifyRequiredCapabilities(role,passport){
  if(!plainObject(passport)||passport.participantId==null||!HASH.test(passport.descriptorHash??""))throw new TypeError("capability passport valido obrigatorio");
  const status=new Map((passport.capabilities??[]).map(item=>[String(item.id).toLowerCase(),item.status]));
  for(const capabilityId of role.requiredCapabilities??[]){
    if(status.get(String(capabilityId).toLowerCase())!=="verified")throw codedError("ARCA_ROLE_CONFORMANCE_CAPABILITY_NOT_VERIFIED","capability obrigatoria nao verificada: "+capabilityId,{participantId:passport.participantId,capabilityId});
  }
}
function normalizeFixtureResult(input,profileFixture){
  if(!plainObject(input))throw new TypeError("fixture result invalido");
  const fixtureId=identifier(input.fixtureId,"fixtureResult.fixtureId");
  if(fixtureId!==profileFixture.fixtureId)throw new Error("fixture result fora da ordem/profile: "+fixtureId);
  const executionState=String(input.executionState??"completed").trim().toLowerCase();
  if(!["completed","timeout","execution-error","result-too-large","non-json-serializable"].includes(executionState))throw new TypeError("executionState invalido");
  const outputHash=input.outputHash==null?null:hash(input.outputHash,"outputHash");
  if(executionState==="completed"&&outputHash===null)throw new Error("outputHash obrigatorio para fixture completed");
  if(executionState!=="completed"&&outputHash!==null)throw new Error("outputHash deve ser null quando fixture nao completou");
  const outputBytes=Number(input.outputBytes??0);
  if(!Number.isSafeInteger(outputBytes)||outputBytes<0||outputBytes>MAX_OUTPUT_BYTES)throw new RangeError("outputBytes invalido");
  if(!Array.isArray(input.assertionResults))throw new TypeError("assertionResults deve ser array");
  if(input.assertionResults.length!==profileFixture.assertions.length)throw new Error("assertionResults incompleto");
  const assertionResults=input.assertionResults.map((result,index)=>{
    if(!plainObject(result))throw new TypeError("assertion result invalido");
    const expectedType=profileFixture.assertions[index].type;
    if(result.type!==expectedType)throw new Error("assertion result type divergente");
    return Object.freeze({type:expectedType,passed:result.passed===true,reason:text(result.reason??expectedType,"assertion.reason",120)});
  });
  const passed=executionState==="completed"&&input.schemaPassed===true&&assertionResults.every(item=>item.passed);
  return Object.freeze({
    fixtureId,
    passed,
    executionState,
    schemaPassed:input.schemaPassed===true,
    outputHash,
    outputBytes,
    assertionResults
  });
}

export class RoleConformanceRegistry{
  #profiles=new Map();
  #evidence=new Map();

  registerProfile(role,input){
    const profile=normalizeProfile(role,input);
    if(this.#profiles.has(profile.roleId))throw new Error("role conformance profile ja registrado: "+profile.roleId);
    this.#profiles.set(profile.roleId,profile);
    return clone(profile);
  }

  getProfile(roleId){
    const profile=this.#profiles.get(String(roleId).toLowerCase());
    return profile?clone(profile):null;
  }

  requireProfile(role){
    const profile=this.#profiles.get(String(role?.roleId).toLowerCase());
    if(!profile)throw codedError("ARCA_ROLE_CONFORMANCE_PROFILE_MISSING","role sem conformance profile: "+String(role?.roleId??"<unknown>"));
    if(profile.roleContractHash!==role.contractHash)throw codedError("ARCA_ROLE_CONFORMANCE_PROFILE_STALE","conformance profile vinculado a role contract antigo",{roleId:role.roleId,profileRoleContractHash:profile.roleContractHash,roleContractHash:role.contractHash});
    return clone(profile);
  }

  recordVerification({role,passport,profileId,testedAt,verifierId="arca-role-conformance",fixtureResults}={}){
    const profile=this.requireProfile(role);
    if(profileId!==undefined&&String(profileId)!==profile.profileId)throw new Error("profileId divergente");
    verifyRequiredCapabilities(role,passport);
    if(!Array.isArray(fixtureResults)||fixtureResults.length!==profile.fixtures.length)throw new Error("fixtureResults incompleto");
    const normalizedResults=profile.fixtures.map((fixture,index)=>normalizeFixtureResult(fixtureResults[index],fixture));
    const tested=isoTimestamp(testedAt??new Date());
    const validUntil=new Date(Date.parse(tested)+profile.maxEvidenceAgeMs).toISOString();
    const body={
      format:ARCA_ROLE_CONFORMANCE_EVIDENCE_FORMAT,
      version:1,
      roleId:role.roleId,
      roleContractHash:role.contractHash,
      profileId:profile.profileId,
      profileHash:profile.profileHash,
      participantId:passport.participantId,
      participantDescriptorHash:passport.descriptorHash,
      verifierId:identifier(verifierId,"verifierId"),
      passed:normalizedResults.every(item=>item.passed),
      testedAt:tested,
      validUntil,
      fixtureResults:normalizedResults,
      rawOutputPersisted:false,
      syntheticOnly:true,
      sideEffectsPerformed:false
    };
    const evidence=Object.freeze({...body,evidenceHash:sha256Json(body)});
    this.#evidence.set(role.roleId+":"+passport.participantId,evidence);
    return clone(evidence);
  }

  getEvidence(roleId,participantId){
    const evidence=this.#evidence.get(String(roleId).toLowerCase()+":"+String(participantId));
    return evidence?clone(evidence):null;
  }

  listEvidence(){
    return [...this.#evidence.values()].map(clone).sort((a,b)=>(a.roleId+":"+a.participantId).localeCompare(b.roleId+":"+b.participantId));
  }

  resolve(role,passport,{now=new Date()}={}){
    const profile=this.requireProfile(role);
    const evidence=this.#evidence.get(role.roleId+":"+passport.participantId);
    if(!evidence)throw codedError("ARCA_ROLE_CONFORMANCE_EVIDENCE_MISSING","participant sem role conformance evidence",{roleId:role.roleId,participantId:passport.participantId});
    if(evidence.roleContractHash!==role.contractHash||evidence.profileHash!==profile.profileHash||evidence.participantDescriptorHash!==passport.descriptorHash){
      throw codedError("ARCA_ROLE_CONFORMANCE_EVIDENCE_STALE","role conformance evidence obsoleto",{roleId:role.roleId,participantId:passport.participantId});
    }
    if(evidence.passed!==true)throw codedError("ARCA_ROLE_CONFORMANCE_FAILED","participant falhou role conformance",{roleId:role.roleId,participantId:passport.participantId});
    const current=new Date(now).getTime();
    if(!Number.isFinite(current))throw new TypeError("now invalido");
    if(current>=Date.parse(evidence.validUntil))throw codedError("ARCA_ROLE_CONFORMANCE_EXPIRED","role conformance evidence expirado",{roleId:role.roleId,participantId:passport.participantId,validUntil:evidence.validUntil});
    return Object.freeze({profile:clone(profile),evidence:clone(evidence)});
  }
}

export async function runRoleConformance({registry,role,passport,execute,testedAt,verifierId="arca-role-conformance"}={}){
  if(!(registry instanceof RoleConformanceRegistry))throw new TypeError("RoleConformanceRegistry obrigatorio");
  if(typeof execute!=="function")throw new TypeError("execute obrigatorio");
  const profile=registry.requireProfile(role);
  verifyRequiredCapabilities(role,passport);
  const fixtureResults=[];

  for(const fixture of profile.fixtures){
    const controller=new AbortController();
    let timer;
    let output;
    let executionState="completed";
    try{
      output=await Promise.race([
        Promise.resolve(execute(Object.freeze({
          format:ARCA_ROLE_CONFORMANCE_PROFILE_FORMAT,
          profileId:profile.profileId,
          profileHash:profile.profileHash,
          roleId:role.roleId,
          roleContractHash:role.contractHash,
          participantId:passport.participantId,
          participantDescriptorHash:passport.descriptorHash,
          fixtureId:fixture.fixtureId,
          synthetic:true,
          sideEffects:false,
          input:clone(fixture.input),
          signal:controller.signal
        }))),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("role-conformance-timeout"))},profile.timeoutMs)})
      ]);
    }catch(error){
      executionState=error?.message==="role-conformance-timeout"?"timeout":"execution-error";
    }finally{
      if(timer)clearTimeout(timer);
    }

    let outputHash=null;
    let outputBytes=0;
    let schemaPassed=false;
    let assertionResults=fixture.assertions.map(assertion=>({type:assertion.type,passed:false,reason:"not-executed"}));

    if(executionState==="completed"){
      try{
        outputBytes=bytes(output);
        if(outputBytes>MAX_OUTPUT_BYTES)executionState="result-too-large";
      }catch{
        executionState="non-json-serializable";
      }
    }
    if(executionState==="completed"){
      outputHash=sha256Json(output);
      const schemaErrors=validateSchema(profile.outputSchema,output);
      schemaPassed=schemaErrors.length===0;
      assertionResults=fixture.assertions.map(assertion=>{
        const assessment=evaluateAssertion(assertion,fixture.input,output);
        return {type:assertion.type,passed:assessment.passed,reason:assessment.reason};
      });
    }

    fixtureResults.push({
      fixtureId:fixture.fixtureId,
      executionState,
      schemaPassed,
      outputHash,
      outputBytes,
      assertionResults
    });
  }

  const evidence=registry.recordVerification({
    role,
    passport,
    profileId:profile.profileId,
    testedAt,
    verifierId,
    fixtureResults
  });
  return Object.freeze({
    format:ARCA_ROLE_CONFORMANCE_RESULT_FORMAT,
    version:1,
    roleId:role.roleId,
    profileId:profile.profileId,
    profileHash:profile.profileHash,
    participantId:passport.participantId,
    participantDescriptorHash:passport.descriptorHash,
    passed:evidence.passed,
    testedAt:evidence.testedAt,
    validUntil:evidence.validUntil,
    fixtureCount:fixtureResults.length,
    passedFixtures:fixtureResults.filter(item=>item.executionState==="completed"&&item.schemaPassed&&item.assertionResults.every(assertion=>assertion.passed)).length,
    evidenceHash:evidence.evidenceHash,
    rawOutputPersisted:false,
    syntheticOnly:true,
    sideEffectsPerformed:false
  });
}
