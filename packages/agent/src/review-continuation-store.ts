import {createHash} from "node:crypto";
import {mkdir,open,readFile,readdir,rename,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";

export const REVIEW_CONTINUATION_POINTER_FORMAT="arca-review-continuation-pointer-v1";
export const REVIEW_CONTINUATION_POINTER_VERSION="0.1.0";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,200}$/;
const HASH=/^[a-f0-9]{64}$/;
const MAX_RECORD_BYTES=256*1024;
const MAX_EXECUTION_REFS=100;

type JsonObject=Record<string,any>;

function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clean(value:any):any{if(Array.isArray(value))return value.map(clean);if(plain(value)){const out:JsonObject={};for(const [key,item] of Object.entries(value))if(item!==undefined)out[key]=clean(item);return out}return value}
function stable(value:any):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function sha256(value:any):string{return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function safeId(value:unknown,label:string,{required=true}:{required?:boolean}={}){if((value===undefined||value===null||value==="")&&!required)return null;if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error(`${label} invalido`);return value}
function bodyForHash(record:JsonObject){const {recordHash:_ignored,...body}=record;return body}
function seal(record:JsonObject){const body=clean(record);return {...body,recordHash:sha256(body)}}
function validate(record:JsonObject){
  if(record.format!==REVIEW_CONTINUATION_POINTER_FORMAT)throw new Error("format de continuation pointer invalido");
  safeId(record.requestId,"requestId");
  if(!Array.isArray(record.executionRefs))throw new Error("executionRefs invalido");
  if(!HASH.test(String(record.recordHash??""))||sha256(bodyForHash(record))!==record.recordHash)throw new Error(`continuation pointer adulterado: ${record.requestId}`);
  if(!plain(record.wake)||typeof record.wake.pending!=="boolean"||!Number.isSafeInteger(record.wake.sequence)||record.wake.sequence<0)throw new Error("wake invalido");
  return record;
}
async function atomicWrite(path:string,value:JsonObject){const serialized=`${JSON.stringify(value,null,2)}\n`;if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error(`continuation pointer excede ${MAX_RECORD_BYTES} bytes`);const tmp=`${path}.${process.pid}.${Date.now()}.tmp`;await writeFile(tmp,serialized,{encoding:"utf8",flag:"wx"});await rename(tmp,path)}

export type ReviewContinuationExecutionRef={jobId?:string|null;action?:string|null;descriptorHash?:string|null};
export type ReviewContinuationRegisterInput={requestId:string;execution?:ReviewContinuationExecutionRef|null};

export class ReviewContinuationStore{
  readonly home:string;
  readonly root:string;
  readonly pointersRoot:string;
  constructor(home:string){if(!home)throw new Error("home obrigatorio");this.home=resolve(home);this.root=join(this.home,"review-continuations");this.pointersRoot=join(this.root,"pointers")}
  async init(){await mkdir(this.pointersRoot,{recursive:true})}
  private path(requestId:string){return join(this.pointersRoot,`${safeId(requestId,"requestId")}.json`)}
  private normalizeExecution(input:ReviewContinuationExecutionRef|null|undefined){if(!input)return null;const jobId=safeId(input.jobId,"jobId",{required:false});const action=safeId(input.action,"action",{required:false});const descriptorHash=input.descriptorHash??null;if(descriptorHash!==null&&!HASH.test(String(descriptorHash)))throw new Error("descriptorHash invalido");if(!jobId&&!action&&!descriptorHash)return null;return clean({jobId,action,descriptorHash})}
  async get(requestId:string){await this.init();return validate(JSON.parse(await readFile(this.path(requestId),"utf8")))}
  async getIfExists(requestId:string){try{return await this.get(requestId)}catch(error:any){if(error?.code==="ENOENT")return null;throw error}}
  async list(filters:{wakePending?:boolean;state?:string}={}){await this.init();const out:JsonObject[]=[];for(const name of (await readdir(this.pointersRoot)).filter(name=>name.endsWith(".json")).sort()){const record=validate(JSON.parse(await readFile(join(this.pointersRoot,name),"utf8")));if(filters.wakePending!==undefined&&record.wake.pending!==filters.wakePending)continue;if(filters.state&&record.gateState!==filters.state)continue;out.push(record)}return out.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))}
  async register(input:ReviewContinuationRegisterInput){
    await this.init();const requestId=safeId(input?.requestId,"requestId")!;const execution=this.normalizeExecution(input.execution);const existing=await this.getIfExists(requestId);const now=new Date().toISOString();
    if(existing){if(!execution)return existing;const refs=[...existing.executionRefs];const key=stable(execution);if(!refs.some((item:any)=>stable(item)===key)){if(refs.length>=MAX_EXECUTION_REFS)throw new Error("limite de executionRefs atingido");refs.push(execution);const next=seal({...bodyForHash(existing),executionRefs:refs,updatedAt:now});await atomicWrite(this.path(requestId),next);return next}return existing}
    const record=seal({format:REVIEW_CONTINUATION_POINTER_FORMAT,version:REVIEW_CONTINUATION_POINTER_VERSION,requestId,executionRefs:execution?[execution]:[],gateState:"unresolved",authorizedToContinue:false,reviewIds:[],pendingReviewIds:[],decisions:[],wake:{pending:false,sequence:0,reason:null,readyAt:null,acknowledgedAt:null,acknowledgedBy:null},createdAt:now,updatedAt:now});
    const handle=await open(this.path(requestId),"wx");try{const serialized=`${JSON.stringify(record,null,2)}\n`;if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error(`continuation pointer excede ${MAX_RECORD_BYTES} bytes`);await handle.writeFile(serialized,"utf8")}finally{await handle.close()}return record;
  }
  async reconcile(snapshot:any,input:ReviewContinuationRegisterInput){
    if(!plain(snapshot)||snapshot.format!=="arca-review-gate-v1")throw new Error("review gate snapshot invalido");const requestId=safeId(input?.requestId??snapshot.requestId,"requestId")!;if(snapshot.requestId!==requestId)throw new Error("requestId divergente no review gate snapshot");
    const current=await this.register({requestId,execution:input.execution});const now=new Date().toISOString();const becameReady=snapshot.authorizedToContinue===true&&current.authorizedToContinue!==true;const wakeSequence=current.wake.sequence+(becameReady?1:0);
    const wake=becameReady?{pending:true,sequence:wakeSequence,reason:"human-review-authorized",readyAt:now,acknowledgedAt:null,acknowledgedBy:null}:snapshot.authorizedToContinue===true?current.wake:{pending:false,sequence:wakeSequence,reason:null,readyAt:null,acknowledgedAt:null,acknowledgedBy:null};
    const next=seal({...bodyForHash(current),gateState:String(snapshot.state),authorizedToContinue:snapshot.authorizedToContinue===true,reviewIds:Array.isArray(snapshot.reviewIds)?[...snapshot.reviewIds]:[],pendingReviewIds:Array.isArray(snapshot.pendingReviewIds)?[...snapshot.pendingReviewIds]:[],decisions:Array.isArray(snapshot.decisions)?clean(snapshot.decisions):[],wake,updatedAt:now});await atomicWrite(this.path(requestId),next);return next;
  }
  async acknowledgeWake(input:{requestId:string;consumerId:string;expectedRecordHash:string}){
    const requestId=safeId(input?.requestId,"requestId")!;const consumerId=safeId(input?.consumerId,"consumerId")!;if(!HASH.test(String(input?.expectedRecordHash??"")))throw new Error("expectedRecordHash invalido");const current=await this.get(requestId);if(current.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: continuation pointer foi alterado");if(current.wake.pending!==true)throw new Error("continuation pointer nao possui wake pendente");const now=new Date().toISOString();const next=seal({...bodyForHash(current),wake:{...current.wake,pending:false,acknowledgedAt:now,acknowledgedBy:consumerId},updatedAt:now});await atomicWrite(this.path(requestId),next);return next;
  }
}

export function hashContinuationDescriptor(value:unknown){return sha256(clean(value??null))}
