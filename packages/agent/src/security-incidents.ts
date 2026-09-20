import {createHash} from "node:crypto";

export const ARCA_SECURITY_INCIDENT_FORMAT="arca-security-incident-v1";
export const ARCA_SECURITY_INCIDENT_REVIEW_FORMAT="arca-security-incident-review-v1";

const CRITERIA=new Set(["sensitive-personal-data","child-adolescent-elderly","financial-data","authentication-data","legal-judicial-professional-secrecy","large-scale"]);
const IDENTIFIER=/^[A-Za-z0-9._:-]{1,120}$/;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function text(value,field,max,{required=true}={}){const out=String(value??"").trim();if(required&&!out)throw new TypeError(`${field} obrigatorio`);if(out.length>max)throw new RangeError(`${field} excede ${max} caracteres`);return out}
function id(value,field){const out=text(value,field,120);if(!IDENTIFIER.test(out))throw new TypeError(`${field} invalido`);return out}
function iso(value=new Date().toISOString()){const parsed=new Date(value);if(Number.isNaN(parsed.getTime()))throw new TypeError("timestamp invalido");return parsed.toISOString()}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(plain(value)){const out={};for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonical(value[key]);return out}return value}
function hash(value){return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}
function addYears(value,years){const d=new Date(value);d.setUTCFullYear(d.getUTCFullYear()+years);return d.toISOString()}
function criteria(values=[]){if(!Array.isArray(values))throw new TypeError("qualifyingCriteria deve ser array");const out=[...new Set(values.map(v=>String(v).trim()))];for(const item of out)if(!CRITERIA.has(item))throw new TypeError(`criterio invalido: ${item}`);return out.sort()}

export function createSecurityIncident(input={},options={}){
  if(!plain(input))throw new TypeError("incident invalido");
  const registeredAt=iso(options.registeredAt);
  const personalDataAffected=input.personalDataAffected===true?true:input.personalDataAffected===false?false:null;
  const payload={
    format:ARCA_SECURITY_INCIDENT_FORMAT,
    incidentId:id(input.incidentId??input.id,"incidentId"),
    discoveredAt:iso(input.discoveredAt??registeredAt),
    controllerKnowledgeAt:input.controllerKnowledgeAt==null?null:iso(input.controllerKnowledgeAt),
    personalDataAffected,
    summary:text(input.summary,"summary",2000),
    affectedDataCategories:Array.isArray(input.affectedDataCategories)?[...new Set(input.affectedDataCategories.map(v=>text(v,"affectedDataCategory",120)))].sort():[],
    affectedSubjectsEstimate:input.affectedSubjectsEstimate==null?null:Number(input.affectedSubjectsEstimate),
    mitigation:text(input.mitigation??"","mitigation",3000,{required:false}),
    communicationStatus:"undetermined",
    notificationWindow:"3-business-days-from-controller-knowledge-of-personal-data-impact",
    smallAgentWindowMayDiffer:true,
    registeredAt,
    retentionNotBefore:addYears(registeredAt,5),
    legalAdviceProvided:false,
    automatedLegalConclusion:false,
    notificationPerformed:false
  };
  if(payload.affectedSubjectsEstimate!==null&&(!Number.isInteger(payload.affectedSubjectsEstimate)||payload.affectedSubjectsEstimate<0))throw new RangeError("affectedSubjectsEstimate invalido");
  return Object.freeze({...clone(payload),incidentHash:hash(payload)});
}

export function verifySecurityIncident(value){
  if(!plain(value)||value.format!==ARCA_SECURITY_INCIDENT_FORMAT)return false;
  const {incidentHash,...payload}=value;
  return typeof incidentHash==="string"&&incidentHash===hash(payload);
}

export function reviewSecurityIncident(input={},options={}){
  if(!plain(input)||!verifySecurityIncident(input.incident))throw new Error("incident invalido ou adulterado");
  if(input.humanReviewCompleted!==true)throw new Error("revisao humana obrigatoria");
  const qualifyingCriteria=criteria(input.qualifyingCriteria??[]);
  const significantImpactConfirmed=input.significantImpactConfirmed===true;
  const communicationRequired=significantImpactConfirmed&&qualifyingCriteria.length>0;
  const payload={
    format:ARCA_SECURITY_INCIDENT_REVIEW_FORMAT,
    reviewId:id(input.reviewId??`${input.incident.incidentId}:review`,"reviewId"),
    incidentId:input.incident.incidentId,
    incidentHash:input.incident.incidentHash,
    reviewerId:id(input.reviewerId,"reviewerId"),
    significantImpactConfirmed,
    qualifyingCriteria,
    communicationRequired,
    communicationStatus:communicationRequired?"required":"not-required",
    notificationWindow:communicationRequired?input.incident.notificationWindow:null,
    decisionReason:text(input.decisionReason,"decisionReason",3000),
    communicationDueAt:null,
    deadlineCalendarResolutionRequired:communicationRequired,
    humanReviewCompleted:true,
    legalAdviceProvided:false,
    automatedLegalConclusion:false,
    reviewedAt:iso(options.reviewedAt)
  };
  return Object.freeze({...clone(payload),reviewHash:hash(payload)});
}

export function verifySecurityIncidentReview(value){
  if(!plain(value)||value.format!==ARCA_SECURITY_INCIDENT_REVIEW_FORMAT)return false;
  const {reviewHash,...payload}=value;
  return typeof reviewHash==="string"&&reviewHash===hash(payload);
}
