import {createHash,randomUUID} from "node:crypto";
import {mkdir,open,readFile,readdir,rename,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {ReviewContinuationStore} from "./review-continuation-store.ts";

export const REVIEW_CONTINUATION_INTENT_FORMAT="arca-review-continuation-intent-v1";
export const REVIEW_CONTINUATION_DISPATCHER_VERSION="0.1.0";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,200}$/;
const HASH=/^[a-f0-9]{64}$/;
const MAX_RECORD_BYTES=128*1024;
const MAX_PENDING_SCAN=500;

type JsonObject=Record<string,any>;
function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clean(value:any):any{if(Array.isArray(value))return value.map(clean);if(plain(value)){const out:JsonObject={};for(const [key,item] of Object.entries(value))if(item!==undefined)out[key]=clean(item);return out}return value}
function stable(value:any):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function sha256(value:any){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function safeId(value:unknown,label:string,{required=true}:{required?:boolean}={}){if((value===undefined||value===null||value==="")&&!required)return null;if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error(`${label} invalido`);return value}
function optionalHash(value:unknown,label:string){if(value===undefined||value===null||value==="")return null;if(typeof value!=="string"||!HASH.test(value))throw new Error(`${label} invalido`);return value}
function bodyForHash(record:JsonObject){const {recordHash:_ignored,...body}=record;return body}
function seal(record:JsonObject){const body=clean(record);return {...body,recordHash:sha256(body)}}
async function atomicWrite(path:string,value:JsonObject){const serialized=`${JSON.stringify(value,null,2)}\n`;if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error(`continuation intent excede ${MAX_RECORD_BYTES} bytes`);const tmp=`${path}.${process.pid}.${Date.now()}.tmp`;await writeFile(tmp,serialized,{encoding:"utf8",flag:"wx"});await rename(tmp,path)}
function validate(record:any){
  if(!plain(record)||record.format!==REVIEW_CONTINUATION_INTENT_FORMAT)throw new Error("continuation intent invalido");safeId(record.requestId,"requestId");safeId(record.handlerId,"handlerId");safeId(record.handlerVersion,"handlerVersion");safeId(record.contextRef,"contextRef",{required:false});optionalHash(record.contextHash,"contextHash");
  if(!Number.isSafeInteger(record.lastCompletedWakeSequence)||record.lastCompletedWakeSequence<0)throw new Error("lastCompletedWakeSequence invalido");if(!plain(record.dispatch)||!Number.isSafeInteger(record.dispatch.attempts)||record.dispatch.attempts<0)throw new Error("dispatch state invalido");
  if(!HASH.test(String(record.recordHash??""))||sha256(bodyForHash(record))!==record.recordHash)throw new Error(`continuation intent adulterado: ${record.requestId}`);return record;
}

export type ContinuationIntentInput={requestId:string;handlerId:string;handlerVersion?:string;contextRef?:string|null;contextHash?:string|null};
export type ContinuationHandlerContext={format:"arca-continuation-dispatch-context-v1";requestId:string;wakeSequence:number;idempotencyKey:string;contextRef:string|null;contextHash:string|null;executionRefs:any[];reviewIds:string[];pointerHash:string};
export type ContinuationHandlerResult={format:"arca-continuation-handler-result-v1";requestId:string;wakeSequence:number;status:"completed"|"deferred";outcomeRef?:string|null;outcomeHash?:string|null};
export type ContinuationHandler={id:string;version:string;handle:(context:ContinuationHandlerContext)=>Promise<ContinuationHandlerResult>|ContinuationHandlerResult};

export class ReviewContinuationIntentStore{
  readonly home:string;readonly root:string;readonly intentsRoot:string;
  constructor(home:string){if(!home)throw new Error("home obrigatorio");this.home=resolve(home);this.root=join(this.home,"review-continuations");this.intentsRoot=join(this.root,"intents")}
  async init(){await mkdir(this.intentsRoot,{recursive:true})}
  private path(requestId:string){return join(this.intentsRoot,`${safeId(requestId,"requestId")}.json`)}
  async get(requestId:string){await this.init();return validate(JSON.parse(await readFile(this.path(requestId),"utf8")))}
  async getIfExists(requestId:string){try{return await this.get(requestId)}catch(error:any){if(error?.code==="ENOENT")return null;throw error}}
  async list(){await this.init();const out=[];for(const name of (await readdir(this.intentsRoot)).filter(name=>name.endsWith(".json")).sort())out.push(validate(JSON.parse(await readFile(join(this.intentsRoot,name),"utf8"))));return out.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))}
  async register(input:ContinuationIntentInput){
    await this.init();const requestId=safeId(input?.requestId,"requestId")!;const handlerId=safeId(input?.handlerId,"handlerId")!;const handlerVersion=safeId(input?.handlerVersion??"1","handlerVersion")!;const contextRef=safeId(input?.contextRef,"contextRef",{required:false});const contextHash=optionalHash(input?.contextHash,"contextHash");const existing=await this.getIfExists(requestId);
    if(existing){if(existing.handlerId!==handlerId||existing.handlerVersion!==handlerVersion||existing.contextRef!==contextRef||existing.contextHash!==contextHash)throw new Error("continuation intent ja existe com descriptor divergente");return existing}
    const now=new Date().toISOString();const record=seal({format:REVIEW_CONTINUATION_INTENT_FORMAT,version:REVIEW_CONTINUATION_DISPATCHER_VERSION,requestId,handlerId,handlerVersion,contextRef,contextHash,lastCompletedWakeSequence:0,lastOutcomeRef:null,lastOutcomeHash:null,dispatch:{status:"idle",wakeSequence:null,attempts:0,consumerId:null,leaseUntil:null,startedAt:null,lastErrorCode:null},createdAt:now,updatedAt:now});
    const handle=await open(this.path(requestId),"wx");try{await handle.writeFile(`${JSON.stringify(record,null,2)}\n`,"utf8")}finally{await handle.close()}return record;
  }
  async claim(input:{requestId:string;wakeSequence:number;consumerId:string;leaseMs?:number;expectedRecordHash:string}){
    const requestId=safeId(input?.requestId,"requestId")!;const consumerId=safeId(input?.consumerId,"consumerId")!;const sequence=input?.wakeSequence;if(!Number.isSafeInteger(sequence)||sequence<1)throw new Error("wakeSequence invalido");const leaseMs=input?.leaseMs??60_000;if(!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>15*60*1000)throw new Error("leaseMs invalido");if(!HASH.test(String(input?.expectedRecordHash??"")))throw new Error("expectedRecordHash invalido");
    const current=await this.get(requestId);if(current.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: continuation intent foi alterado");if(current.lastCompletedWakeSequence>=sequence)return current;
    const now=Date.now();if(current.dispatch.status==="running"&&Date.parse(String(current.dispatch.leaseUntil??""))>now&&current.dispatch.consumerId!==consumerId)throw new Error("continuation intent ocupado por outro dispatcher");
    const at=new Date(now).toISOString();const next=seal({...bodyForHash(current),dispatch:{status:"running",wakeSequence:sequence,attempts:Number(current.dispatch.attempts)+1,consumerId,leaseUntil:new Date(now+leaseMs).toISOString(),startedAt:at,lastErrorCode:null},updatedAt:at});await atomicWrite(this.path(requestId),next);return next;
  }
  async complete(input:{requestId:string;wakeSequence:number;consumerId:string;expectedRecordHash:string;outcomeRef?:string|null;outcomeHash?:string|null}){
    const requestId=safeId(input?.requestId,"requestId")!;const consumerId=safeId(input?.consumerId,"consumerId")!;const outcomeRef=safeId(input?.outcomeRef,"outcomeRef",{required:false});const outcomeHash=optionalHash(input?.outcomeHash,"outcomeHash");const current=await this.get(requestId);if(current.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: continuation intent foi alterado");if(current.dispatch.status!=="running"||current.dispatch.consumerId!==consumerId||current.dispatch.wakeSequence!==input.wakeSequence)throw new Error("continuation intent nao esta claimed por este dispatcher");
    const now=new Date().toISOString();const next=seal({...bodyForHash(current),lastCompletedWakeSequence:input.wakeSequence,lastOutcomeRef:outcomeRef,lastOutcomeHash:outcomeHash,dispatch:{status:"idle",wakeSequence:null,attempts:current.dispatch.attempts,consumerId:null,leaseUntil:null,startedAt:null,lastErrorCode:null},updatedAt:now});await atomicWrite(this.path(requestId),next);return next;
  }
  async releaseFailure(input:{requestId:string;wakeSequence:number;consumerId:string;expectedRecordHash:string;errorCode:string}){
    const requestId=safeId(input?.requestId,"requestId")!;const consumerId=safeId(input?.consumerId,"consumerId")!;const errorCode=safeId(input?.errorCode,"errorCode")!;const current=await this.get(requestId);if(current.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: continuation intent foi alterado");if(current.dispatch.status!=="running"||current.dispatch.consumerId!==consumerId||current.dispatch.wakeSequence!==input.wakeSequence)throw new Error("continuation intent nao esta claimed por este dispatcher");const now=new Date().toISOString();const next=seal({...bodyForHash(current),dispatch:{status:"failed",wakeSequence:input.wakeSequence,attempts:current.dispatch.attempts,consumerId:null,leaseUntil:null,startedAt:current.dispatch.startedAt,lastErrorCode:errorCode},updatedAt:now});await atomicWrite(this.path(requestId),next);return next;
  }
}

export class ReviewContinuationDispatcher{
  readonly pointerStore:ReviewContinuationStore;readonly intentStore:ReviewContinuationIntentStore;readonly consumerId:string;readonly leaseMs:number;private handlers:Map<string,ContinuationHandler>;
  constructor(pointerStore:ReviewContinuationStore,handlers:ContinuationHandler[],options:{intentStore?:ReviewContinuationIntentStore;consumerId?:string;leaseMs?:number}={}){
    if(!(pointerStore instanceof ReviewContinuationStore))throw new TypeError("ReviewContinuationStore obrigatorio");if(!Array.isArray(handlers)||!handlers.length)throw new Error("closed continuation handler registry obrigatorio");this.pointerStore=pointerStore;this.intentStore=options.intentStore??new ReviewContinuationIntentStore(pointerStore.home);this.consumerId=safeId(options.consumerId??`dispatcher-${randomUUID()}`,"consumerId")!;this.leaseMs=options.leaseMs??60_000;if(!Number.isSafeInteger(this.leaseMs)||this.leaseMs<1000||this.leaseMs>15*60*1000)throw new Error("leaseMs invalido");this.handlers=new Map();for(const handler of handlers){const id=safeId(handler?.id,"handler.id")!;const version=safeId(handler?.version,"handler.version")!;if(typeof handler?.handle!=="function")throw new Error(`handler ${id} sem handle`);if(this.handlers.has(id))throw new Error(`handler duplicado: ${id}`);this.handlers.set(id,Object.freeze({id,version,handle:handler.handle}))}
  }
  async registerIntent(input:ContinuationIntentInput){const handler=this.handlers.get(String(input?.handlerId??""));if(!handler)throw new Error("handler fora do Continuation Action Registry");if(input.handlerVersion&&input.handlerVersion!==handler.version)throw new Error("handlerVersion divergente do registry");return this.intentStore.register({...input,handlerVersion:handler.version})}
  private result(value:any,requestId:string,sequence:number){if(!plain(value)||value.format!=="arca-continuation-handler-result-v1"||value.requestId!==requestId||value.wakeSequence!==sequence||!["completed","deferred"].includes(value.status))throw new Error("continuation handler result invalido/correlacao divergente");safeId(value.outcomeRef,"outcomeRef",{required:false});optionalHash(value.outcomeHash,"outcomeHash");return value as ContinuationHandlerResult}
  async dispatchRequest(requestIdInput:string){
    const requestId=safeId(requestIdInput,"requestId")!;let pointer=await this.pointerStore.get(requestId);if(pointer.wake?.pending!==true)return {format:"arca-continuation-dispatch-v1",requestId,status:"skipped",reason:"no-pending-wake"};if(pointer.authorizedToContinue!==true||pointer.gateState!=="authorized-to-continue")throw new Error("pending wake sem autorizacao substantiva valida");const sequence=Number(pointer.wake.sequence);if(!Number.isSafeInteger(sequence)||sequence<1)throw new Error("wake sequence invalida");const intent=await this.intentStore.getIfExists(requestId);if(!intent)return {format:"arca-continuation-dispatch-v1",requestId,status:"skipped",reason:"no-registered-intent",wakeSequence:sequence};const handler=this.handlers.get(intent.handlerId);if(!handler||handler.version!==intent.handlerVersion)throw new Error("registered continuation handler indisponivel/divergente");
    if(intent.lastCompletedWakeSequence>=sequence){pointer=await this.pointerStore.get(requestId);if(pointer.wake?.pending===true&&Number(pointer.wake.sequence)===sequence)await this.pointerStore.acknowledgeWake({requestId,consumerId:this.consumerId,expectedRecordHash:pointer.recordHash});return {format:"arca-continuation-dispatch-v1",requestId,status:"completed",reason:"already-dispatched-wake-acknowledged",wakeSequence:sequence,replayed:false}}
    let claimed=await this.intentStore.claim({requestId,wakeSequence:sequence,consumerId:this.consumerId,leaseMs:this.leaseMs,expectedRecordHash:intent.recordHash});if(claimed.lastCompletedWakeSequence>=sequence)return this.dispatchRequest(requestId);
    const context:ContinuationHandlerContext={format:"arca-continuation-dispatch-context-v1",requestId,wakeSequence:sequence,idempotencyKey:`review-continuation:${requestId}:${sequence}`,contextRef:claimed.contextRef??null,contextHash:claimed.contextHash??null,executionRefs:Array.isArray(pointer.executionRefs)?clean(pointer.executionRefs):[],reviewIds:Array.isArray(pointer.reviewIds)?[...pointer.reviewIds]:[],pointerHash:String(pointer.recordHash)};
    try{
      const output=this.result(await handler.handle(context),requestId,sequence);if(output.status==="deferred"){await this.intentStore.releaseFailure({requestId,wakeSequence:sequence,consumerId:this.consumerId,expectedRecordHash:claimed.recordHash,errorCode:"handler-deferred"});return {format:"arca-continuation-dispatch-v1",requestId,status:"deferred",wakeSequence:sequence,replayed:false}}
      claimed=await this.intentStore.complete({requestId,wakeSequence:sequence,consumerId:this.consumerId,expectedRecordHash:claimed.recordHash,outcomeRef:output.outcomeRef??null,outcomeHash:output.outcomeHash??null});pointer=await this.pointerStore.get(requestId);if(pointer.wake?.pending===true&&Number(pointer.wake.sequence)===sequence)await this.pointerStore.acknowledgeWake({requestId,consumerId:this.consumerId,expectedRecordHash:pointer.recordHash});return {format:"arca-continuation-dispatch-v1",requestId,status:"completed",wakeSequence:sequence,replayed:false,intentHash:claimed.recordHash};
    }catch(error:any){try{const latest=await this.intentStore.get(requestId);if(latest.dispatch.status==="running"&&latest.dispatch.consumerId===this.consumerId&&latest.dispatch.wakeSequence===sequence)await this.intentStore.releaseFailure({requestId,wakeSequence:sequence,consumerId:this.consumerId,expectedRecordHash:latest.recordHash,errorCode:"handler-failed"})}catch{}throw error}
  }
  async dispatchPending({limit=100}:{limit?:number}={}){if(!Number.isSafeInteger(limit)||limit<1||limit>MAX_PENDING_SCAN)throw new Error("limit invalido");const pointers=(await this.pointerStore.list({wakePending:true})).slice(0,limit);const results=[];for(const pointer of pointers){try{results.push(await this.dispatchRequest(String(pointer.requestId)))}catch(error:any){results.push({format:"arca-continuation-dispatch-v1",requestId:String(pointer.requestId),status:"failed",reason:String(error?.message??error)})}}return {format:"arca-continuation-dispatch-scan-v1",scanned:pointers.length,results}}
}
