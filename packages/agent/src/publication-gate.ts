import {createHash} from "node:crypto";
import {ARCA_PRIVACY_CLASSIFICATION_FORMAT,verifyPrivacyClassification} from "./privacy-classification.ts";

export const ARCA_PUBLICATION_DECISION_FORMAT="arca-publication-decision-v1";

const ACTIONS=new Set(["publish","publish-with-redaction","hold","reject"]);
const IDENTIFIER=/^[A-Za-z0-9._:-]{1,120}$/;

function plainObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function text(value,field,max,{required=true}={}){const normalized=String(value??"").trim();if(required&&!normalized)throw new TypeError(`${field} obrigatorio`);if(normalized.length>max)throw new RangeError(`${field} excede ${max} caracteres`);return normalized}
function identifier(value,field){const normalized=text(value,field,120);if(!IDENTIFIER.test(normalized))throw new TypeError(`${field} invalido`);return normalized}
function isoTimestamp(value=new Date().toISOString()){const parsed=new Date(value);if(Number.isNaN(parsed.getTime()))throw new TypeError("timestamp invalido");return parsed.toISOString()}
function canonicalize(value){if(Array.isArray(value))return value.map(canonicalize);if(plainObject(value)){const out={};for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonicalize(value[key]);return out}return value}
function sha256(value){return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}

function normalizeRedactions(values=[]){
  if(!Array.isArray(values))throw new TypeError("redactions deve ser array");
  const seen=new Set();const out=[];
  for(const raw of values){
    if(!plainObject(raw))throw new TypeError("redaction invalida");
    const field=text(raw.field,"redaction.field",240);
    if(seen.has(field))continue;seen.add(field);
    const reason=text(raw.reason??"privacy-minimization","redaction.reason",240);
    out.push({field,reason,replacement:raw.replacement==null?"[REDACTED]":text(raw.replacement,"redaction.replacement",120,{required:false})});
  }
  return out.sort((a,b)=>a.field.localeCompare(b.field));
}

function decide(classification,{purposeConfirmed,necessityConfirmed,sourceVerified,humanReviewCompleted,legalReviewCompleted,publicInterestRationale,redactions,activeSubjectRequest}){
  const i=classification.indicators;
  const reasons=[];
  if(!purposeConfirmed)reasons.push("purpose-not-confirmed");
  if(!necessityConfirmed)reasons.push("necessity-not-confirmed");
  if(!sourceVerified)reasons.push("source-not-verified");
  if(activeSubjectRequest)reasons.push("active-data-subject-request");
  if(i.disputedOrOutdated)reasons.push("disputed-or-outdated");
  if(i.secretOrCredential)reasons.push("secret-or-credential");
  if(i.privateCommunication)reasons.push("private-communication");
  if(i.childOrAdolescent)reasons.push("child-or-adolescent");
  if(i.precisePrivateLocation)reasons.push("precise-private-location");
  if(i.healthOrBiometric||i.politicalReligiousUnionSexualSensitive)reasons.push("sensitive-personal-data");
  if(i.accusationOrAdverseInference)reasons.push("adverse-inference-requires-human-review");
  if(classification.legalReviewState==="required"&&!legalReviewCompleted)reasons.push("legal-review-required");
  const highRisk=classification.privacyClass==="high-risk"||classification.privacyClass==="sensitive"||i.childOrAdolescent||i.precisePrivateLocation||i.healthOrBiometric||i.politicalReligiousUnionSexualSensitive||i.accusationOrAdverseInference;
  if(highRisk&&!publicInterestRationale)reasons.push("public-interest-rationale-required");

  if(i.secretOrCredential||i.privateCommunication)return {action:"reject",reasons};
  if(!purposeConfirmed||!necessityConfirmed||!sourceVerified)return {action:"hold",reasons};
  if(activeSubjectRequest)return {action:"hold",reasons};
  if(classification.legalReviewState==="required"&&!legalReviewCompleted)return {action:"hold",reasons};
  if(highRisk){
    if(!publicInterestRationale)return {action:"hold",reasons};
    if(!humanReviewCompleted)return {action:"hold",reasons:[...reasons,"human-review-required"]};
  }
  if(classification.privacyClass==="restricted")return {action:"hold",reasons:[...reasons,"restricted-class"]};
  if(classification.privacyClass==="redact-before-publication"||i.canMinimize){
    if(!redactions.length)return {action:"hold",reasons:[...reasons,"redaction-required"]};
    return {action:"publish-with-redaction",reasons:[...reasons,"privacy-minimization"]};
  }
  if(i.disputedOrOutdated)return {action:"hold",reasons};
  return {action:"publish",reasons};
}

export function evaluatePublication(input={},options={}){
  if(!plainObject(input))throw new TypeError("publication input invalido");
  const publicationId=identifier(input.publicationId??input.id,"publicationId");
  const classification=input.classification;
  if(!plainObject(classification)||classification.format!==ARCA_PRIVACY_CLASSIFICATION_FORMAT||!verifyPrivacyClassification(classification))throw new Error("classification invalida ou adulterada");
  const purposeConfirmed=input.purposeConfirmed===true;
  const necessityConfirmed=input.necessityConfirmed===true;
  const sourceVerified=input.sourceVerified===true;
  const humanReviewCompleted=input.humanReviewCompleted===true;
  const activeSubjectRequest=input.activeSubjectRequest===true;
  const legalReviewCompleted=input.legalReviewCompleted===true||classification.legalReviewState==="completed"||classification.legalReviewState==="not-required";
  const publicInterestRationale=text(input.publicInterestRationale??"","publicInterestRationale",1000,{required:false});
  const redactions=normalizeRedactions(input.redactions??[]);
  const decision=decide(classification,{purposeConfirmed,necessityConfirmed,sourceVerified,humanReviewCompleted,legalReviewCompleted,publicInterestRationale,redactions,activeSubjectRequest});
  if(!ACTIONS.has(decision.action))throw new Error("publication action invalida");
  const decidedAt=isoTimestamp(options.decidedAt);
  const payload={
    format:ARCA_PUBLICATION_DECISION_FORMAT,
    publicationId,
    recordId:classification.recordId,
    classificationHash:classification.classificationHash,
    action:decision.action,
    reasons:[...new Set(decision.reasons)].sort(),
    redactions,
    purposeConfirmed,
    necessityConfirmed,
    sourceVerified,
    humanReviewCompleted,
    legalReviewCompleted,
    activeSubjectRequest,
    publicInterestRationale,
    legalAdviceProvided:false,
    automatedLegalConclusion:false,
    publicationPerformed:false,
    humanReviewRequired:decision.action!=="publish"||classification.privacyClass!=="public",
    decidedAt
  };
  return Object.freeze({...clone(payload),decisionHash:sha256(payload)});
}

export function verifyPublicationDecision(decision){
  if(!plainObject(decision)||decision.format!==ARCA_PUBLICATION_DECISION_FORMAT)return false;
  const {decisionHash,...payload}=decision;
  return typeof decisionHash==="string"&&decisionHash===sha256(payload);
}
