import {createHash} from "node:crypto";

export const ARCA_DATA_SUBJECT_REQUEST_FORMAT="arca-data-subject-request-v1";
export const ARCA_DATA_SUBJECT_EVENT_FORMAT="arca-data-subject-event-v1";

const TYPES=new Set(["correction","dispute","access","restriction","deletion","opposition","automated-decision-review"]);
const STATES=new Set(["open","reviewing","resolved","rejected","withdrawn"]);
const OUTCOMES=new Set(["corrected","partially-corrected","no-change","restricted","deleted","retained-with-reason","rejected","withdrawn"]);
const IDENTIFIER=/^[A-Za-z0-9._:-]{1,160}$/;
function plain(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
function clone(v){return JSON.parse(JSON.stringify(v))}
function text(v,f,max,{required=true}={}){const s=String(v??"").trim();if(required&&!s)throw new TypeError(`${f} obrigatorio`);if(s.length>max)throw new RangeError(`${f} excede ${max} caracteres`);return s}
function id(v,f){const s=text(v,f,160);if(!IDENTIFIER.test(s))throw new TypeError(`${f} invalido`);return s}
function iso(v=new Date().toISOString()){const d=new Date(v);if(Number.isNaN(d.getTime()))throw new TypeError("timestamp invalido");return d.toISOString()}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(plain(v)){const o={};for(const k of Object.keys(v).sort())if(v[k]!==undefined)o[k]=canonical(v[k]);return o}return v}
function hash(v){return createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex")}
function refs(values,field,max=100){if(!Array.isArray(values)||values.length>max)throw new TypeError(`${field} invalido`);return [...new Set(values.map(v=>id(v,field)))].sort()}

export class DataSubjectRequestRegistry{
  #requests=new Map();
  #events=new Map();
  open(input={},options={}){
    if(!plain(input))throw new TypeError("request input invalido");
    const requestId=id(input.requestId,"requestId");if(this.#requests.has(requestId))throw new Error("requestId ja existe");
    const requestType=text(input.requestType,"requestType",80);if(!TYPES.has(requestType))throw new TypeError("requestType invalido");
    const openedAt=iso(options.openedAt);
    const payload={
      format:ARCA_DATA_SUBJECT_REQUEST_FORMAT,
      requestId,
      requestType,
      subjectRef:id(input.subjectRef,"subjectRef"),
      recordIds:refs(input.recordIds??[],"recordId"),
      requestedAction:text(input.requestedAction??"","requestedAction",1000,{required:false}),
      claimSummary:text(input.claimSummary,"claimSummary",3000),
      evidenceRefs:Array.isArray(input.evidenceRefs)?[...new Set(input.evidenceRefs.map(v=>text(v,"evidenceRef",500)))].slice(0,50).sort():[],
      contactRef:input.contactRef==null?null:id(input.contactRef,"contactRef"),
      identityVerification:["not-requested","pending","verified","failed"].includes(input.identityVerification)?input.identityVerification:"not-requested",
      state:"open",
      openedAt,
      updatedAt:openedAt,
      rawIdentityDocumentStored:false,
      publicDisclosureAllowed:false
    };
    const request=Object.freeze({...clone(payload),requestHash:hash(payload)});
    this.#requests.set(requestId,request);this.#events.set(requestId,[]);
    this.#append(requestId,"opened",{actorId:input.actorId??"system",at:openedAt,notes:""});
    return clone(request);
  }
  #append(requestId,type,{actorId,at,notes,outcome=null}){
    const list=this.#events.get(requestId);const prev=list.length?list.at(-1).eventHash:null;
    const payload={format:ARCA_DATA_SUBJECT_EVENT_FORMAT,requestId,eventType:type,actorId:id(actorId,"actorId"),at:iso(at),notes:text(notes??"","notes",2000,{required:false}),outcome,previousEventHash:prev};
    const event=Object.freeze({...payload,eventHash:hash(payload)});list.push(event);return event;
  }
  startReview(requestId,input={},options={}){
    const req=this.#getRequired(requestId);if(req.state!=="open")throw new Error("request nao esta aberta");
    const at=iso(options.at);this.#replace(req,{state:"reviewing",updatedAt:at});this.#append(req.requestId,"review-started",{actorId:input.reviewerId,at,notes:input.notes});return this.get(req.requestId);
  }
  resolve(requestId,input={},options={}){
    const req=this.#getRequired(requestId);if(!["open","reviewing"].includes(req.state))throw new Error("request nao pode ser resolvida");
    const outcome=text(input.outcome,"outcome",80);if(!OUTCOMES.has(outcome))throw new TypeError("outcome invalido");
    const state=outcome==="rejected"?"rejected":outcome==="withdrawn"?"withdrawn":"resolved";const at=iso(options.at);
    this.#replace(req,{state,updatedAt:at});this.#append(req.requestId,"resolved",{actorId:input.reviewerId,at,notes:input.notes,outcome});return this.get(req.requestId);
  }
  #replace(req,patch){const {requestHash,...base}=req;const payload={...base,...patch};this.#requests.set(req.requestId,Object.freeze({...clone(payload),requestHash:hash(payload)}))}
  #getRequired(requestId){const req=this.#requests.get(id(requestId,"requestId"));if(!req)throw new Error("request nao encontrada");return req}
  get(requestId){const req=this.#requests.get(id(requestId,"requestId"));return req?clone(req):null}
  events(requestId){return clone(this.#events.get(id(requestId,"requestId"))??[])}
  listActive(){return [...this.#requests.values()].filter(r=>["open","reviewing"].includes(r.state)).map(clone).sort((a,b)=>a.openedAt.localeCompare(b.openedAt))}
  hasActivePublicationHold(recordId){const target=id(recordId,"recordId");return this.listActive().some(r=>["correction","dispute","restriction","deletion","opposition","automated-decision-review"].includes(r.requestType)&&r.recordIds.includes(target))}
  verifyRequest(requestId){const req=this.#requests.get(id(requestId,"requestId"));if(!req)return false;const {requestHash,...payload}=req;if(requestHash!==hash(payload))return false;const events=this.#events.get(req.requestId)??[];for(let i=0;i<events.length;i++){const {eventHash,...body}=events[i];if(eventHash!==hash(body))return false;if((events[i].previousEventHash??null)!==(i?events[i-1].eventHash:null))return false}return true}
}
