import {createHash} from "node:crypto";

export const ARCA_LEGAL_BASIS_RECORD_FORMAT="arca-legal-basis-record-v1";
export const ARCA_LEGAL_BASIS_CATALOG_FORMAT="arca-legal-basis-catalog-v1";

const BASIS_CODES=new Set(["not-assessed","consent","contract","legal-regulatory-obligation","public-policy-public-authority","research","exercise-rights","protection-life","health","legitimate-interest","credit-protection","other-explicit-lawful-basis"]);
const SENSITIVE_BASIS_CODES=new Set(["not-applicable","not-assessed","specific-consent","legal-regulatory-obligation","public-policy-public-authority","research","exercise-rights","protection-life","health","fraud-security","other-explicit-lawful-basis"]);
const STATUSES=new Set(["draft","active","rejected","superseded","withdrawn"]);
const IDENTIFIER=/^[A-Za-z0-9._:-]{1,160}$/;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){return JSON.parse(JSON.stringify(value))}
function text(value,field,max,{required=true}={}){const v=String(value??"").trim();if(required&&!v)throw new TypeError(`${field} obrigatorio`);if(v.length>max)throw new RangeError(`${field} excede ${max} caracteres`);return v}
function id(value,field){const v=text(value,field,160);if(!IDENTIFIER.test(v))throw new TypeError(`${field} invalido`);return v}
function iso(value=new Date().toISOString()){const d=new Date(value);if(Number.isNaN(d.getTime()))throw new TypeError("timestamp invalido");return d.toISOString()}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(plain(value)){const out={};for(const k of Object.keys(value).sort())if(value[k]!==undefined)out[k]=canonical(value[k]);return out}return value}
function hash(value){return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}
function boundedRefs(values=[]){if(!Array.isArray(values)||values.length>50)throw new TypeError("sourceRefs invalido");return [...new Set(values.map(v=>text(v,"sourceRef",500)))].sort()}

function buildRecord(input,meta){
  if(!plain(input))throw new TypeError("legal basis input invalido");
  const basisCode=text(input.basisCode??"not-assessed","basisCode",80);if(!BASIS_CODES.has(basisCode))throw new TypeError("basisCode invalido");
  const sensitiveBasisCode=text(input.sensitiveBasisCode??"not-applicable","sensitiveBasisCode",80);if(!SENSITIVE_BASIS_CODES.has(sensitiveBasisCode))throw new TypeError("sensitiveBasisCode invalido");
  const status=text(meta.status,"status",40);if(!STATUSES.has(status))throw new TypeError("status invalido");
  const payload={
    format:ARCA_LEGAL_BASIS_RECORD_FORMAT,
    basisId:id(input.basisId,"basisId"),
    processingActivityId:id(input.processingActivityId,"processingActivityId"),
    purpose:text(input.purpose,"purpose",1000),
    basisCode,
    sensitiveBasisCode,
    legalReference:text(input.legalReference??"","legalReference",1000,{required:false}),
    rationale:text(input.rationale??"","rationale",2000,{required:false}),
    publicInterestRationale:text(input.publicInterestRationale??"","publicInterestRationale",2000,{required:false}),
    sourceRefs:boundedRefs(input.sourceRefs??[]),
    status,
    reviewedBy:meta.reviewedBy??null,
    reviewedAt:meta.reviewedAt??null,
    reviewNotes:meta.reviewNotes??"",
    previousRecordHash:meta.previousRecordHash??null,
    createdAt:meta.createdAt,
    updatedAt:meta.updatedAt,
    legalAdviceProvided:false,
    automatedLegalConclusion:false
  };
  return Object.freeze({...clone(payload),recordHash:hash(payload)});
}

export function verifyLegalBasisRecord(record){if(!plain(record)||record.format!==ARCA_LEGAL_BASIS_RECORD_FORMAT)return false;const {recordHash,...payload}=record;return typeof recordHash==="string"&&recordHash===hash(payload)}

export class LegalBasisRegistry{
  #records=new Map();
  register(input,options={}){
    const basisId=id(input?.basisId,"basisId");if(this.#records.has(basisId))throw new Error(`basisId ja existe: ${basisId}`);
    const at=iso(options.createdAt);
    const record=buildRecord(input,{status:"draft",createdAt:at,updatedAt:at,previousRecordHash:null});
    this.#records.set(basisId,[record]);return clone(record);
  }
  review(basisId,input={},options={}){
    const history=this.#records.get(id(basisId,"basisId"));if(!history)throw new Error("base nao encontrada");
    const current=history.at(-1);if(["superseded","withdrawn"].includes(current.status))throw new Error("base encerrada");
    const accepted=input.accepted===true;
    const reviewerId=id(input.reviewerId,"reviewerId");
    const reviewedAt=iso(options.reviewedAt);
    const record=buildRecord(current,{status:accepted?"active":"rejected",createdAt:current.createdAt,updatedAt:reviewedAt,reviewedBy:reviewerId,reviewedAt,reviewNotes:text(input.notes??"","notes",2000,{required:false}),previousRecordHash:current.recordHash});
    history.push(record);return clone(record);
  }
  close(basisId,status,options={}){
    if(!["superseded","withdrawn"].includes(status))throw new TypeError("status de fechamento invalido");
    const history=this.#records.get(id(basisId,"basisId"));if(!history)throw new Error("base nao encontrada");
    const current=history.at(-1);const at=iso(options.updatedAt);
    const record=buildRecord(current,{status,createdAt:current.createdAt,updatedAt:at,reviewedBy:current.reviewedBy,reviewedAt:current.reviewedAt,reviewNotes:current.reviewNotes,previousRecordHash:current.recordHash});
    history.push(record);return clone(record);
  }
  get(basisId){const history=this.#records.get(id(basisId,"basisId"));return history?clone(history.at(-1)):null}
  history(basisId){const history=this.#records.get(id(basisId,"basisId"));return history?clone(history):[]}
  list({status=null}={}){return [...this.#records.values()].map(v=>clone(v.at(-1))).filter(r=>!status||r.status===status).sort((a,b)=>a.basisId.localeCompare(b.basisId))}
  snapshot(options={}){const payload={format:ARCA_LEGAL_BASIS_CATALOG_FORMAT,generatedAt:iso(options.generatedAt),records:this.list(),legalAdviceProvided:false,automatedLegalConclusion:false};return Object.freeze({...payload,catalogHash:hash(payload)})}
  verifyHistory(basisId){const history=this.#records.get(id(basisId,"basisId"));if(!history)return false;for(let i=0;i<history.length;i++){if(!verifyLegalBasisRecord(history[i]))return false;if((history[i].previousRecordHash??null)!==(i?history[i-1].recordHash:null))return false}return true}
}
