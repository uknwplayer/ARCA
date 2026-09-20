import {createHash} from "node:crypto";

export const ARCA_PRIVACY_CLASSIFICATION_FORMAT="arca-privacy-classification-v1";
export const PRIVACY_CLASSES=Object.freeze(["public","personal","sensitive","high-risk","restricted","redact-before-publication"]);

const CLASS_SET=new Set(PRIVACY_CLASSES);
const IDENTIFIER=/^[A-Za-z0-9._:-]{1,120}$/;
const SOURCE_TYPES=new Set(["official-public","public-lawful","user-provided","internal-derived","unknown"]);
const SUBJECT_TYPES=new Set(["none","natural-person","legal-entity","mixed"]);
const LEGAL_REVIEW_STATES=new Set(["not-assessed","not-required","required","completed"]);

function plainObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function text(value,field,max,{required=true}={}){const normalized=String(value??"").trim();if(required&&!normalized)throw new TypeError(`${field} obrigatorio`);if(normalized.length>max)throw new RangeError(`${field} excede ${max} caracteres`);return normalized}
function identifier(value,field){const normalized=text(value,field,120);if(!IDENTIFIER.test(normalized))throw new TypeError(`${field} invalido`);return normalized}
function bool(value,field,defaultValue=false){if(value===undefined)return defaultValue;if(typeof value!=="boolean")throw new TypeError(`${field} deve ser boolean`);return value}
function unique(values,field,max=120){if(values==null)return[];if(!Array.isArray(values))throw new TypeError(`${field} deve ser array`);return [...new Set(values.map(item=>text(item,field,max)))].sort()}
function canonicalize(value){if(Array.isArray(value))return value.map(canonicalize);if(plainObject(value)){const out={};for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonicalize(value[key]);return out}return value}
function sha256(value){return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}
function isoTimestamp(value=new Date().toISOString()){const parsed=new Date(value);if(Number.isNaN(parsed.getTime()))throw new TypeError("timestamp invalido");return parsed.toISOString()}

function normalizeIndicators(input={}){
  if(!plainObject(input))throw new TypeError("indicators deve ser objeto");
  return Object.freeze({
    directIdentifier:bool(input.directIdentifier,"indicators.directIdentifier"),
    financialIdentifier:bool(input.financialIdentifier,"indicators.financialIdentifier"),
    precisePrivateLocation:bool(input.precisePrivateLocation,"indicators.precisePrivateLocation"),
    healthOrBiometric:bool(input.healthOrBiometric,"indicators.healthOrBiometric"),
    politicalReligiousUnionSexualSensitive:bool(input.politicalReligiousUnionSexualSensitive,"indicators.politicalReligiousUnionSexualSensitive"),
    childOrAdolescent:bool(input.childOrAdolescent,"indicators.childOrAdolescent"),
    privateCommunication:bool(input.privateCommunication,"indicators.privateCommunication"),
    secretOrCredential:bool(input.secretOrCredential,"indicators.secretOrCredential"),
    accusationOrAdverseInference:bool(input.accusationOrAdverseInference,"indicators.accusationOrAdverseInference"),
    sourcePubliclyAccessible:bool(input.sourcePubliclyAccessible,"indicators.sourcePubliclyAccessible"),
    sourceOfficial:bool(input.sourceOfficial,"indicators.sourceOfficial"),
    publicInterestNecessary:bool(input.publicInterestNecessary,"indicators.publicInterestNecessary"),
    canMinimize:bool(input.canMinimize,"indicators.canMinimize"),
    disputedOrOutdated:bool(input.disputedOrOutdated,"indicators.disputedOrOutdated")
  });
}

function deriveClass({subjectType,sourceType,indicators,requestedClass}){
  if(requestedClass){const normalized=String(requestedClass).trim().toLowerCase();if(!CLASS_SET.has(normalized))throw new TypeError(`privacyClass invalida: ${normalized}`);return normalized}
  if(indicators.secretOrCredential||indicators.privateCommunication)return "restricted";
  if(indicators.childOrAdolescent||indicators.precisePrivateLocation||indicators.accusationOrAdverseInference)return "high-risk";
  if(indicators.healthOrBiometric||indicators.politicalReligiousUnionSexualSensitive)return "sensitive";
  if(subjectType==="natural-person"||subjectType==="mixed"||indicators.directIdentifier||indicators.financialIdentifier)return indicators.canMinimize?"redact-before-publication":"personal";
  if(sourceType==="official-public"||sourceType==="public-lawful")return "public";
  return "restricted";
}

export function classifyPrivacyRecord(input={},options={}){
  if(!plainObject(input))throw new TypeError("classification input invalido");
  const recordId=identifier(input.recordId??input.id,"recordId");
  const subjectType=String(input.subjectType??"none").trim().toLowerCase();if(!SUBJECT_TYPES.has(subjectType))throw new TypeError(`subjectType invalido: ${subjectType}`);
  const sourceType=String(input.sourceType??"unknown").trim().toLowerCase();if(!SOURCE_TYPES.has(sourceType))throw new TypeError(`sourceType invalido: ${sourceType}`);
  const legalReviewState=String(input.legalReviewState??"not-assessed").trim().toLowerCase();if(!LEGAL_REVIEW_STATES.has(legalReviewState))throw new TypeError(`legalReviewState invalido: ${legalReviewState}`);
  const indicators=normalizeIndicators(input.indicators??{});
  const privacyClass=deriveClass({subjectType,sourceType,indicators,requestedClass:input.privacyClass});
  const purpose=text(input.purpose??"","purpose",500,{required:false});
  const sourceRefs=unique(input.sourceRefs,"sourceRefs",500);
  const reasons=[];
  if(indicators.secretOrCredential)reasons.push("secret-or-credential");
  if(indicators.privateCommunication)reasons.push("private-communication");
  if(indicators.childOrAdolescent)reasons.push("child-or-adolescent");
  if(indicators.precisePrivateLocation)reasons.push("precise-private-location");
  if(indicators.healthOrBiometric)reasons.push("health-or-biometric");
  if(indicators.politicalReligiousUnionSexualSensitive)reasons.push("lgpd-sensitive-category");
  if(indicators.accusationOrAdverseInference)reasons.push("adverse-inference-or-accusation");
  if(indicators.directIdentifier)reasons.push("direct-identifier");
  if(indicators.financialIdentifier)reasons.push("financial-identifier");
  if(indicators.canMinimize)reasons.push("minimization-available");
  if(indicators.disputedOrOutdated)reasons.push("disputed-or-outdated");
  const classifiedAt=isoTimestamp(options.classifiedAt);
  const payload={format:ARCA_PRIVACY_CLASSIFICATION_FORMAT,recordId,subjectType,sourceType,privacyClass,purpose,sourceRefs,indicators,reasons,legalReviewState,classifiedAt};
  return Object.freeze({...clone(payload),classificationHash:sha256(payload)});
}

export function verifyPrivacyClassification(record){
  if(!plainObject(record)||record.format!==ARCA_PRIVACY_CLASSIFICATION_FORMAT)return false;
  const {classificationHash,...payload}=record;
  return typeof classificationHash==="string"&&classificationHash===sha256(payload);
}
