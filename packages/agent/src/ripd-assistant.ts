import {createHash} from "node:crypto";

export const ARCA_RIPD_ASSESSMENT_FORMAT="arca-ripd-assessment-v1";
const IDENTIFIER=/^[A-Za-z0-9._:-]{1,120}$/;
const SIGNAL_KEYS=["sensitiveData","childrenOrAdolescents","largeScale","systematicMonitoring","automatedAdverseDecision","novelTechnology","preciseLocation","financialOrAuthenticationData","dataCombinationOrProfiling"];

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function text(value,field,max,{required=true}={}){const out=String(value??"").trim();if(required&&!out)throw new TypeError(`${field} obrigatorio`);if(out.length>max)throw new RangeError(`${field} excede ${max} caracteres`);return out}
function id(value,field){const out=text(value,field,120);if(!IDENTIFIER.test(out))throw new TypeError(`${field} invalido`);return out}
function iso(value=new Date().toISOString()){const parsed=new Date(value);if(Number.isNaN(parsed.getTime()))throw new TypeError("timestamp invalido");return parsed.toISOString()}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(plain(value)){const out={};for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonical(value[key]);return out}return value}
function hash(value){return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}
function strings(values,field,maxItems=100){if(!Array.isArray(values))throw new TypeError(`${field} deve ser array`);return [...new Set(values.map(v=>text(v,field,500)))].slice(0,maxItems).sort()}

export function buildRipdAssessment(input={},options={}){
  if(!plain(input))throw new TypeError("RIPD assessment invalido");
  const indicators={};for(const key of SIGNAL_KEYS)indicators[key]=input.indicators?.[key]===true;
  const highRiskSignals=SIGNAL_KEYS.filter(key=>indicators[key]);
  const legitimateInterestBasis=input.legitimateInterestBasis===true;
  const purpose=text(input.purpose,"purpose",1500);
  const dataCategories=strings(input.dataCategories??[],"dataCategories");
  const processingOperations=strings(input.processingOperations??[],"processingOperations");
  const subjectGroups=strings(input.subjectGroups??[],"subjectGroups");
  const safeguards=strings(input.safeguards??[],"safeguards");
  const identifiedRisks=strings(input.identifiedRisks??[],"identifiedRisks");
  const legalBasisRefs=strings(input.legalBasisRefs??[],"legalBasisRefs");
  const gaps=[];
  if(!dataCategories.length)gaps.push("data-categories-missing");
  if(!processingOperations.length)gaps.push("processing-operations-missing");
  if(!subjectGroups.length)gaps.push("subject-groups-missing");
  if(!legalBasisRefs.length)gaps.push("legal-basis-reference-missing");
  if(!safeguards.length)gaps.push("safeguards-missing");
  if(highRiskSignals.length&&!identifiedRisks.length)gaps.push("risk-analysis-missing");
  let recommendation="routine-review";
  if(highRiskSignals.length)recommendation="prepare-ripd";
  else if(legitimateInterestBasis||identifiedRisks.length)recommendation="consider-ripd";
  const payload={
    format:ARCA_RIPD_ASSESSMENT_FORMAT,
    assessmentId:id(input.assessmentId??input.id,"assessmentId"),
    processingId:id(input.processingId,"processingId"),
    purpose,
    dataCategories,
    processingOperations,
    subjectGroups,
    legalBasisRefs,
    safeguards,
    identifiedRisks,
    indicators,
    highRiskSignals,
    legitimateInterestBasis,
    recommendation,
    gaps:gaps.sort(),
    necessityAssessment:text(input.necessityAssessment??"","necessityAssessment",3000,{required:false}),
    proportionalityAssessment:text(input.proportionalityAssessment??"","proportionalityAssessment",3000,{required:false}),
    residualRiskAssessment:text(input.residualRiskAssessment??"","residualRiskAssessment",3000,{required:false}),
    formalRipdGenerated:false,
    anpdSubmissionPerformed:false,
    humanReviewRequired:recommendation!=="routine-review"||gaps.length>0,
    legalAdviceProvided:false,
    automatedLegalConclusion:false,
    assessedAt:iso(options.assessedAt)
  };
  return Object.freeze({...clone(payload),assessmentHash:hash(payload)});
}

export function verifyRipdAssessment(value){
  if(!plain(value)||value.format!==ARCA_RIPD_ASSESSMENT_FORMAT)return false;
  const {assessmentHash,...payload}=value;
  return typeof assessmentHash==="string"&&assessmentHash===hash(payload);
}
