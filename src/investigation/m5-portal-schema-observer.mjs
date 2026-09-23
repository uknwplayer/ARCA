import {createHash} from "node:crypto";
import {canonicalJson} from "./public-source-contract.mjs";

export const M5_PORTAL_SCHEMA_OBSERVATION_SCHEMA="arca.m5-portal-schema-observation.v1";
export const M5_PORTAL_SCHEMA_REVIEW_SCHEMA="arca.m5-portal-schema-review.v1";

const HASH=/^[a-f0-9]{64}$/;

function sha256Bytes(bytes){
  return createHash("sha256").update(bytes).digest("hex");
}
function sha256Canonical(value){
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
function plain(value){
  return !!value&&typeof value==="object"&&!Array.isArray(value);
}
function boundedText(value,code,max=160){
  const out=String(value??"").normalize("NFKC").trim();
  if(!out||out.length>max||/[\u0000-\u001f\u007f]/.test(out))throw new Error(code);
  return out;
}
function hash(value,code){
  const out=String(value??"").trim().toLowerCase();
  if(!HASH.test(out))throw new Error(code);
  return out;
}
function valueType(value){
  if(value===null)return "null";
  if(Array.isArray(value))return "array";
  return typeof value==="object"?"object":typeof value;
}
function ensureBytes(input){
  if(Buffer.isBuffer(input))return Buffer.from(input);
  if(input instanceof Uint8Array)return Buffer.from(input);
  throw new Error("ARCA_M5_PORTAL_SCHEMA_BYTES_REQUIRED");
}
function decodeJson(bytes){
  let text;
  try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}
  catch{throw new Error("ARCA_M5_PORTAL_SCHEMA_UTF8_INVALID")}
  try{return JSON.parse(text)}
  catch{throw new Error("ARCA_M5_PORTAL_SCHEMA_JSON_INVALID")}
}
function validateBinding(binding,bytes){
  if(!plain(binding))throw new Error("ARCA_M5_PORTAL_SCHEMA_CUSTODY_BINDING_REQUIRED");
  if(binding.source!=="PORTAL")throw new Error("ARCA_M5_PORTAL_SCHEMA_SOURCE_INVALID");
  const normalized=Object.freeze({
    source:"PORTAL",
    scopeSha256:hash(binding.scopeSha256,"ARCA_M5_PORTAL_SCHEMA_SCOPE_HASH_INVALID"),
    custodyEnvelopeSha256:hash(binding.custodyEnvelopeSha256,"ARCA_M5_PORTAL_SCHEMA_ENVELOPE_HASH_INVALID"),
    custodyReceiptSha256:hash(binding.custodyReceiptSha256,"ARCA_M5_PORTAL_SCHEMA_RECEIPT_HASH_INVALID"),
    responseBytesSha256:hash(binding.responseBytesSha256,"ARCA_M5_PORTAL_SCHEMA_RESPONSE_HASH_INVALID")
  });
  if(sha256Bytes(bytes)!==normalized.responseBytesSha256)
    throw new Error("ARCA_M5_PORTAL_SCHEMA_RESPONSE_HASH_MISMATCH");
  return normalized;
}
function fieldSummary(records){
  const byName=new Map();
  let nonObjectRecordCount=0;
  for(const record of records){
    if(!plain(record)){
      nonObjectRecordCount++;
      continue;
    }
    for(const [rawName,value] of Object.entries(record)){
      const name=boundedText(rawName,"ARCA_M5_PORTAL_SCHEMA_FIELD_NAME_INVALID",160);
      let state=byName.get(name);
      if(!state){
        state={name,presenceCount:0,types:new Set()};
        byName.set(name,state);
      }
      state.presenceCount++;
      state.types.add(valueType(value));
    }
  }
  if(byName.size>128)throw new Error("ARCA_M5_PORTAL_SCHEMA_FIELD_BUDGET_EXCEEDED");
  const fields=[...byName.values()]
    .sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"))
    .map(item=>Object.freeze({
      name:item.name,
      presenceCount:item.presenceCount,
      requiredInObservedObjectRecords:records.length>0&&
        nonObjectRecordCount===0&&item.presenceCount===records.length,
      types:Object.freeze([...item.types].sort())
    }));
  return Object.freeze({fields:Object.freeze(fields),nonObjectRecordCount});
}
export function observePortalJsonSchema({
  bytes,
  custodyBinding,
  sourceCaptureNetworkUsed=false
}={}){
  const raw=ensureBytes(bytes);
  const binding=validateBinding(custodyBinding,raw);
  if(sourceCaptureNetworkUsed!==true&&sourceCaptureNetworkUsed!==false)
    throw new Error("ARCA_M5_PORTAL_SCHEMA_NETWORK_FLAG_INVALID");
  const parsed=decodeJson(raw);
  const rootType=valueType(parsed);
  const records=Array.isArray(parsed)?parsed:[];
  const summary=fieldSummary(records);
  const recordCount=Array.isArray(parsed)?parsed.length:null;
  const budgetExceeded=Array.isArray(parsed)&&parsed.length>25;
  const structuralState=
    rootType==="array"&&summary.nonObjectRecordCount===0&&!budgetExceeded
      ?"SCHEMA_OBSERVED"
      :"SCHEMA_DRIFT_REVIEW_REQUIRED";
  const structuralBody={
    rootType,
    recordCount,
    objectRecordCount:Array.isArray(parsed)?records.length-summary.nonObjectRecordCount:0,
    nonObjectRecordCount:summary.nonObjectRecordCount,
    budgetExceeded,
    fields:summary.fields
  };
  const observedSchemaSha256=sha256Canonical(structuralBody);
  const base={
    schema:M5_PORTAL_SCHEMA_OBSERVATION_SCHEMA,
    version:1,
    source:"PORTAL",
    observationState:structuralState,
    scopeSha256:binding.scopeSha256,
    custodyEnvelopeSha256:binding.custodyEnvelopeSha256,
    custodyReceiptSha256:binding.custodyReceiptSha256,
    responseBytesSha256:binding.responseBytesSha256,
    observedSchemaSha256,
    structure:Object.freeze(structuralBody),
    sourceCaptureNetworkUsed,
    observerNetworkUsed:false,
    valuesIncluded:false,
    rawBytesIncluded:false,
    normalizationPerformed:false,
    parserAdmitted:false,
    publicationAttempted:false,
    adverseFinding:false,
    humanReviewRequired:true
  };
  return Object.freeze({...base,observationSha256:sha256Canonical(base)});
}
export function verifyPortalSchemaObservation({observation,bytes,custodyBinding}={}){
  if(!plain(observation)||observation.schema!==M5_PORTAL_SCHEMA_OBSERVATION_SCHEMA)
    throw new Error("ARCA_M5_PORTAL_SCHEMA_OBSERVATION_INVALID");
  const rebuilt=observePortalJsonSchema({
    bytes,
    custodyBinding,
    sourceCaptureNetworkUsed:observation.sourceCaptureNetworkUsed
  });
  if(canonicalJson(rebuilt)!==canonicalJson(observation))
    throw new Error("ARCA_M5_PORTAL_SCHEMA_OBSERVATION_INTEGRITY_INVALID");
  return rebuilt;
}
export function reviewPortalObservedSchema({
  observation,
  reviewedObservationSha256,
  decision,
  reviewerRef,
  reviewedAt
}={}){
  if(!plain(observation)||observation.schema!==M5_PORTAL_SCHEMA_OBSERVATION_SCHEMA)
    throw new Error("ARCA_M5_PORTAL_SCHEMA_REVIEW_OBSERVATION_INVALID");
  if(hash(reviewedObservationSha256,"ARCA_M5_PORTAL_SCHEMA_REVIEW_HASH_INVALID")!==observation.observationSha256)
    throw new Error("ARCA_M5_PORTAL_SCHEMA_REVIEW_HASH_MISMATCH");
  const normalizedDecision=boundedText(decision,"ARCA_M5_PORTAL_SCHEMA_REVIEW_DECISION_INVALID",64);
  if(!["APPROVE_FOR_PARSER_DESIGN","REJECT_SCHEMA","HOLD_FOR_MORE_EVIDENCE"].includes(normalizedDecision))
    throw new Error("ARCA_M5_PORTAL_SCHEMA_REVIEW_DECISION_INVALID");
  const ref=boundedText(reviewerRef,"ARCA_M5_PORTAL_SCHEMA_REVIEWER_INVALID",160);
  const at=boundedText(reviewedAt,"ARCA_M5_PORTAL_SCHEMA_REVIEWED_AT_INVALID",64);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(at))
    throw new Error("ARCA_M5_PORTAL_SCHEMA_REVIEWED_AT_INVALID");
  if(normalizedDecision==="APPROVE_FOR_PARSER_DESIGN"&&
     observation.observationState!=="SCHEMA_OBSERVED")
    throw new Error("ARCA_M5_PORTAL_SCHEMA_DRIFT_CANNOT_BE_APPROVED");
  const base={
    schema:M5_PORTAL_SCHEMA_REVIEW_SCHEMA,
    version:1,
    observationSha256:observation.observationSha256,
    observedSchemaSha256:observation.observedSchemaSha256,
    decision:normalizedDecision,
    reviewerRef:ref,
    reviewedAt:at,
    parserImplementationAuthorized:false,
    normalizationAuthorized:false,
    networkAuthorized:false,
    publicationAuthorized:false,
    humanReviewRecorded:true
  };
  return Object.freeze({...base,reviewSha256:sha256Canonical(base)});
}
