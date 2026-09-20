import {createHash} from "node:crypto";

export const ARCA_RETENTION_POLICY_FORMAT="arca-retention-policy-v1";
export const ARCA_RETENTION_ASSESSMENT_FORMAT="arca-retention-assessment-v1";

const CLASSES=new Set(["operational-log","temporary-artifact","user-provided","investigation-evidence","public-export","credential-audit","subject-request","incident-record","other"]);
const GROUNDS=new Set(["legal-regulatory-obligation","research","lawful-third-party-transfer","exclusive-controller-anonymized-use","other-documented"]);
const ACTIONS=new Set(["retain","review","anonymize","delete-eligible","legal-hold"]);
const IDENTIFIER=/^[A-Za-z0-9._:-]{1,120}$/;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function text(value,field,max,{required=true}={}){const out=String(value??"").trim();if(required&&!out)throw new TypeError(`${field} obrigatorio`);if(out.length>max)throw new RangeError(`${field} excede ${max} caracteres`);return out}
function id(value,field){const out=text(value,field,120);if(!IDENTIFIER.test(out))throw new TypeError(`${field} invalido`);return out}
function iso(value=new Date().toISOString()){const parsed=new Date(value);if(Number.isNaN(parsed.getTime()))throw new TypeError("timestamp invalido");return parsed.toISOString()}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(plain(value)){const out={};for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonical(value[key]);return out}return value}
function hash(value){return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}
function normalizeGrounds(values=[]){if(!Array.isArray(values))throw new TypeError("conservationGrounds deve ser array");const out=[...new Set(values.map(v=>String(v).trim()))];for(const item of out)if(!GROUNDS.has(item))throw new TypeError(`conservationGround invalido: ${item}`);return out.sort()}
function addDays(value,days){const date=new Date(value);date.setUTCDate(date.getUTCDate()+days);return date.toISOString()}

export function createRetentionPolicy(input={},options={}){
  if(!plain(input))throw new TypeError("retention policy invalida");
  const dataClass=String(input.dataClass??"").trim();if(!CLASSES.has(dataClass))throw new TypeError("dataClass invalida");
  const maxRetentionDays=input.maxRetentionDays==null?null:Number(input.maxRetentionDays);
  if(maxRetentionDays!==null&&(!Number.isInteger(maxRetentionDays)||maxRetentionDays<1||maxRetentionDays>36500))throw new RangeError("maxRetentionDays invalido");
  const reviewIntervalDays=input.reviewIntervalDays==null?null:Number(input.reviewIntervalDays);
  if(reviewIntervalDays!==null&&(!Number.isInteger(reviewIntervalDays)||reviewIntervalDays<1||reviewIntervalDays>3650))throw new RangeError("reviewIntervalDays invalido");
  const payload={
    format:ARCA_RETENTION_POLICY_FORMAT,
    policyId:id(input.policyId??input.id,"policyId"),
    dataClass,
    purpose:text(input.purpose,"purpose",1000),
    maxRetentionDays,
    reviewIntervalDays,
    legalBasisRef:input.legalBasisRef==null?null:id(input.legalBasisRef,"legalBasisRef"),
    conservationGrounds:normalizeGrounds(input.conservationGrounds??[]),
    notes:text(input.notes??"","notes",2000,{required:false}),
    legalAdviceProvided:false,
    automatedLegalConclusion:false,
    createdAt:iso(options.createdAt)
  };
  return Object.freeze({...clone(payload),policyHash:hash(payload)});
}

export function verifyRetentionPolicy(policy){
  if(!plain(policy)||policy.format!==ARCA_RETENTION_POLICY_FORMAT)return false;
  const {policyHash,...payload}=policy;
  return typeof policyHash==="string"&&policyHash===hash(payload);
}

export function assessRetention(input={},options={}){
  if(!plain(input))throw new TypeError("retention assessment invalido");
  const policy=input.policy;
  if(!verifyRetentionPolicy(policy))throw new Error("retention policy invalida ou adulterada");
  const recordId=id(input.recordId,"recordId");
  const collectedAt=iso(input.collectedAt);
  const assessedAt=iso(options.assessedAt);
  const purposeStillActive=input.purposeStillActive===true;
  const legalHold=input.legalHold===true;
  const grounds=normalizeGrounds(input.conservationGrounds??policy.conservationGrounds);
  const minimumRetentionUntil=input.minimumRetentionUntil==null?null:iso(input.minimumRetentionUntil);
  const policyExpiry=policy.maxRetentionDays==null?null:addDays(collectedAt,policy.maxRetentionDays);
  const minFloorActive=minimumRetentionUntil!==null&&new Date(assessedAt)<new Date(minimumRetentionUntil);
  const policyExpired=policyExpiry!==null&&new Date(assessedAt)>=new Date(policyExpiry);
  let action;const reasons=[];
  if(legalHold){action="legal-hold";reasons.push("legal-hold-active")}
  else if(minFloorActive){action="retain";reasons.push("minimum-retention-floor-active")}
  else if(purposeStillActive&&!policyExpired){action="retain";reasons.push("purpose-still-active")}
  else if(purposeStillActive&&policyExpired){action="review";reasons.push("policy-window-reached","purpose-still-active")}
  else if(grounds.includes("exclusive-controller-anonymized-use")){action="anonymize";reasons.push("conservation-requires-anonymized-exclusive-use")}
  else if(grounds.length){action="review";reasons.push("documented-conservation-ground")}
  else {action="delete-eligible";reasons.push("purpose-ended-no-conservation-ground")}
  if(!ACTIONS.has(action))throw new Error("retention action invalida");
  const payload={
    format:ARCA_RETENTION_ASSESSMENT_FORMAT,
    assessmentId:id(input.assessmentId??`retention:${recordId}:${assessedAt.replace(/[-:.TZ]/g,"")}`,"assessmentId"),
    recordId,
    policyId:policy.policyId,
    policyHash:policy.policyHash,
    action,
    reasons:[...new Set(reasons)].sort(),
    purposeStillActive,
    conservationGrounds:grounds,
    minimumRetentionUntil,
    policyExpiry,
    automaticDeletionPerformed:false,
    humanReviewRequired:action!=="retain"||policyExpired,
    legalAdviceProvided:false,
    automatedLegalConclusion:false,
    assessedAt
  };
  return Object.freeze({...clone(payload),assessmentHash:hash(payload)});
}

export function verifyRetentionAssessment(value){
  if(!plain(value)||value.format!==ARCA_RETENTION_ASSESSMENT_FORMAT)return false;
  const {assessmentHash,...payload}=value;
  return typeof assessmentHash==="string"&&assessmentHash===hash(payload);
}
