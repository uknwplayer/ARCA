import {createHash} from "node:crypto";
import {mkdir,open,readFile,readdir,rename,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {ReviewGatedContinuation} from "./review-continuation.ts";
import {hashContinuationDescriptor} from "./review-continuation-store.ts";
import type {ContinuationHandler} from "./review-continuation-dispatcher.ts";

export const MACHINE_BRIDGE_CONTINUATION_PLAN_FORMAT="arca-machine-bridge-continuation-plan-v1";
export const MACHINE_BRIDGE_CONTINUATION_VERSION="0.1.0";
export const MACHINE_BRIDGE_CONTINUATION_HANDLER_ID="machine-bridge.resume-once";

const MB_NAME=/^[A-Za-z0-9._-]{1,120}$/;
const RECIPE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;
const SECRET_KEY=/(authorization|bearer|token|password|secret|api[_-]?key|client[_-]?secret|private[_-]?key|cookie)/i;
const MAX_PARAMS_BYTES=64*1024;
const MAX_PLAN_BYTES=128*1024;

type JsonObject=Record<string,any>;
type Recipe={id:string;action:string;requires:string[];normalizeParams:(value:JsonObject)=>JsonObject};
type RemoteClientLike={
  transport:{getResult:(jobId:string)=>Promise<any>|any};
  submit:(job:any,options?:any)=>Promise<any>|any;
  waitForResult:(job:any,options?:any)=>Promise<any>|any;
};

function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clean(value:any):any{if(Array.isArray(value))return value.map(clean);if(plain(value)){const out:JsonObject={};for(const [key,item] of Object.entries(value))if(item!==undefined)out[key]=clean(item);return out}return value}
function stable(value:any):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function sha256(value:any){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function bodyForHash(record:JsonObject){const {recordHash:_ignored,...body}=record;return body}
function seal(record:JsonObject){const body=clean(record);return {...body,recordHash:sha256(body)}}
function mbName(value:unknown,label:string){if(typeof value!=="string"||!MB_NAME.test(value))throw new Error(`${label} invalido`);return value}
function recipeId(value:unknown){if(typeof value!=="string"||!RECIPE_ID.test(value))throw new Error("recipeId invalido");return value}
function hasSecret(value:any):boolean{if(Array.isArray(value))return value.some(hasSecret);if(!plain(value))return false;for(const [key,item] of Object.entries(value)){if(SECRET_KEY.test(key))return true;if(hasSecret(item))return true}return false}
function jsonObject(value:unknown){if(!plain(value))throw new Error("params deve ser objeto");let serialized:string;try{serialized=JSON.stringify(value)}catch{throw new Error("params devem ser JSON serializaveis")}if(serialized===undefined||Buffer.byteLength(serialized)>MAX_PARAMS_BYTES)throw new Error(`params excedem ${MAX_PARAMS_BYTES} bytes ou sao invalidos`);const normalized=JSON.parse(serialized);if(!plain(normalized))throw new Error("params deve permanecer objeto JSON");return normalized as JsonObject}
function boundedParams(value:unknown){const params=jsonObject(value===undefined?{}:value);if(hasSecret(params))throw new Error("params de continuation nao podem conter secrets/credentials");return clean(params)}
function onlyKeys(value:JsonObject,allowed:string[]){for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error(`param nao permitido para recipe: ${key}`);return value}
function emptyParams(value:JsonObject){onlyKeys(value,[]);return {}}
function pingParams(value:JsonObject){onlyKeys(value,["echo"]);if(value.echo!==undefined&&(typeof value.echo!=="string"||value.echo.length>2000))throw new Error("worker.ping echo invalido");return clean(value)}
function planParams(value:JsonObject){if(value.allowNetwork===true||value.network===true)throw new Error("recipe plan-only nao aceita network");return clean(value)}
function validateRecord(record:any){if(!plain(record)||record.format!==MACHINE_BRIDGE_CONTINUATION_PLAN_FORMAT)throw new Error("Machine Bridge continuation plan invalido");mbName(record.requestId,"requestId");recipeId(record.recipeId);mbName(record.jobId,"jobId");if(!["planned","completed","failed"].includes(record.status))throw new Error("status de plan invalido");if(!plain(record.params)||hasSecret(record.params))throw new Error("params persistidos invalidos");if(!HASH.test(String(record.descriptorHash??"")))throw new Error("descriptorHash invalido");if(record.resultHash!==null&&!HASH.test(String(record.resultHash??"")))throw new Error("resultHash invalido");if(!HASH.test(String(record.recordHash??""))||sha256(bodyForHash(record))!==record.recordHash)throw new Error(`Machine Bridge continuation plan adulterado: ${record.requestId}`);return record}
async function atomicWrite(path:string,value:JsonObject){const serialized=`${JSON.stringify(value,null,2)}\n`;if(Buffer.byteLength(serialized)>MAX_PLAN_BYTES)throw new Error(`Machine Bridge continuation plan excede ${MAX_PLAN_BYTES} bytes`);const tmp=`${path}.${process.pid}.${Date.now()}.tmp`;await writeFile(tmp,serialized,{encoding:"utf8",flag:"wx"});await rename(tmp,path)}
function correlation(result:any,job:any){if(!plain(result))throw new Error("Machine Bridge result invalido");if(result.jobId!==job.jobId)throw new Error("Machine Bridge continuation jobId divergente");if(result.requestId!==job.requestId)throw new Error("Machine Bridge continuation requestId divergente");return result}

export function defaultMachineBridgeContinuationRecipes():Recipe[]{
  return [
    {id:"mb.worker.ping",action:"worker.ping",requires:[],normalizeParams:pingParams},
    {id:"mb.worker.describe",action:"worker.describe",requires:[],normalizeParams:emptyParams},
    {id:"mb.repository.test",action:"repository.test",requires:["node","repository"],normalizeParams:emptyParams},
    {id:"mb.repository.check",action:"repository.check",requires:["node","repository"],normalizeParams:emptyParams},
    {id:"mb.pncp.plan",action:"pncp.plan",requires:["pncp-plan"],normalizeParams:planParams},
    {id:"mb.pncp.discovery-plan",action:"pncp.discovery-plan",requires:["pncp-plan"],normalizeParams:planParams}
  ];
}

export class MachineBridgeContinuationPlanStore{
  readonly home:string;readonly root:string;readonly plansRoot:string;readonly recipes:Map<string,Recipe>;
  constructor(home:string,{recipes=defaultMachineBridgeContinuationRecipes()}:{recipes?:Recipe[]}={}){
    if(!home)throw new Error("home obrigatorio");this.home=resolve(home);this.root=join(this.home,"review-continuations");this.plansRoot=join(this.root,"machine-bridge-plans");if(!Array.isArray(recipes)||!recipes.length)throw new Error("Machine Bridge continuation recipes obrigatorias");this.recipes=new Map();
    for(const raw of recipes){const id=recipeId(raw?.id);const action=mbName(raw?.action,"recipe.action");if(!Array.isArray(raw?.requires)||raw.requires.some(item=>typeof item!=="string"||!item.trim()))throw new Error(`requires invalido em ${id}`);if(typeof raw?.normalizeParams!=="function")throw new Error(`normalizeParams obrigatorio em ${id}`);if(this.recipes.has(id))throw new Error(`recipe duplicada: ${id}`);this.recipes.set(id,Object.freeze({id,action,requires:[...new Set(raw.requires.map(String))].sort(),normalizeParams:raw.normalizeParams}))}
  }
  async init(){await mkdir(this.plansRoot,{recursive:true})}
  private path(requestId:string){return join(this.plansRoot,`${mbName(requestId,"requestId")}.json`)}
  recipe(idInput:string){const id=recipeId(idInput);const value=this.recipes.get(id);if(!value)throw new Error(`recipe fora do Machine Bridge Continuation Registry: ${id}`);return value}
  async get(requestId:string){await this.init();return validateRecord(JSON.parse(await readFile(this.path(requestId),"utf8")))}
  async getIfExists(requestId:string){try{return await this.get(requestId)}catch(error:any){if(error?.code==="ENOENT")return null;throw error}}
  async list(){await this.init();const out=[];for(const name of (await readdir(this.plansRoot)).filter(name=>name.endsWith(".json")).sort())out.push(validateRecord(JSON.parse(await readFile(join(this.plansRoot,name),"utf8"))));return out.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))}
  async register(input:{requestId:string;recipeId:string;params?:JsonObject}){
    await this.init();const requestId=mbName(input?.requestId,"requestId");const recipe=this.recipe(input?.recipeId);const raw=boundedParams(input?.params);const params=jsonObject(recipe.normalizeParams(raw));if(hasSecret(params))throw new Error("recipe produziu params secretos");
    const descriptor={requestId,recipeId:recipe.id,action:recipe.action,requires:recipe.requires,params};const descriptorHash=hashContinuationDescriptor(descriptor);const jobId=`mbc-${sha256(descriptor).slice(0,40)}`;const existing=await this.getIfExists(requestId);if(existing){if(existing.descriptorHash!==descriptorHash)throw new Error("Machine Bridge continuation plan ja existe com descriptor divergente");return existing}
    const now=new Date().toISOString();const record=seal({format:MACHINE_BRIDGE_CONTINUATION_PLAN_FORMAT,version:MACHINE_BRIDGE_CONTINUATION_VERSION,requestId,recipeId:recipe.id,action:recipe.action,requires:[...recipe.requires],params,jobId,descriptorHash,status:"planned",resultStatus:null,resultHash:null,gateState:null,completedAt:null,lastErrorCode:null,createdAt:now,updatedAt:now});const handle=await open(this.path(requestId),"wx");try{const serialized=`${JSON.stringify(record,null,2)}\n`;if(Buffer.byteLength(serialized)>MAX_PLAN_BYTES)throw new Error(`Machine Bridge continuation plan excede ${MAX_PLAN_BYTES} bytes`);await handle.writeFile(serialized,"utf8")}finally{await handle.close()}return record;
  }
  async complete(input:{requestId:string;expectedRecordHash:string;result:any;gateState:string}){const current=await this.get(input.requestId);if(current.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: Machine Bridge continuation plan alterado");if(current.status==="completed")return current;const now=new Date().toISOString();const next=seal({...bodyForHash(current),status:"completed",resultStatus:String(input.result?.status??"unknown"),resultHash:sha256(clean(input.result)),gateState:String(input.gateState),completedAt:now,lastErrorCode:null,updatedAt:now});await atomicWrite(this.path(input.requestId),next);return next}
  async fail(input:{requestId:string;expectedRecordHash:string;result?:any;errorCode:string;terminal?:boolean}){const current=await this.get(input.requestId);if(current.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: Machine Bridge continuation plan alterado");const now=new Date().toISOString();const terminal=input.terminal!==false;const next=seal({...bodyForHash(current),status:terminal?"failed":"planned",resultStatus:input.result?String(input.result.status??"unknown"):current.resultStatus,resultHash:input.result?sha256(clean(input.result)):current.resultHash,lastErrorCode:mbName(input.errorCode,"errorCode"),updatedAt:now});await atomicWrite(this.path(input.requestId),next);return next}
}

async function recoverableCall(client:RemoteClientLike,job:any,options:any){
  if(!client||!client.transport||typeof client.transport.getResult!=="function"||typeof client.submit!=="function"||typeof client.waitForResult!=="function")throw new TypeError("recoverable Machine Bridge client obrigatorio");
  const loaded=await client.transport.getResult(job.jobId);if(loaded){const result=loaded.result??loaded;return correlation(result,job)}
  try{await client.submit(job,{queue:options.queue,notify:options.notify})}catch(error:any){if(!/already exists/i.test(String(error?.message??error)))throw error}
  return correlation(await client.waitForResult(job,{waitTimeoutMs:options.waitTimeoutMs,pollIntervalMs:options.pollIntervalMs}),job);
}

export class MachineBridgeContinuationCoordinator{
  readonly store:MachineBridgeContinuationPlanStore;readonly gate:ReviewGatedContinuation;readonly client:RemoteClientLike;readonly queue:string;readonly notify:boolean;readonly waitTimeoutMs:number;readonly pollIntervalMs:number;readonly handler:ContinuationHandler;
  constructor(input:{home:string;gate:ReviewGatedContinuation;client:RemoteClientLike;recipes?:Recipe[];queue?:string;notify?:boolean;waitTimeoutMs?:number;pollIntervalMs?:number}){
    if(!(input?.gate instanceof ReviewGatedContinuation))throw new TypeError("ReviewGatedContinuation obrigatorio");this.gate=input.gate;this.client=input.client;if(!input.home)throw new Error("home obrigatorio");this.store=new MachineBridgeContinuationPlanStore(input.home,{recipes:input.recipes});this.queue=mbName(input.queue??"shared","queue");this.notify=input.notify!==false;this.waitTimeoutMs=Number(input.waitTimeoutMs??180000);this.pollIntervalMs=Number(input.pollIntervalMs??1000);if(!Number.isSafeInteger(this.waitTimeoutMs)||this.waitTimeoutMs<1000||this.waitTimeoutMs>900000)throw new Error("waitTimeoutMs invalido");if(!Number.isSafeInteger(this.pollIntervalMs)||this.pollIntervalMs<100||this.pollIntervalMs>30000)throw new Error("pollIntervalMs invalido");
    this.handler=Object.freeze({id:MACHINE_BRIDGE_CONTINUATION_HANDLER_ID,version:"1",handle:context=>this.handle(context)});
  }
  async register(runtime:{registerIntent:(input:any)=>Promise<any>},input:{requestId:string;recipeId:string;params?:JsonObject}){if(!runtime||typeof runtime.registerIntent!=="function")throw new TypeError("runtime.registerIntent obrigatorio");const plan=await this.store.register(input);const contextRef=`mbplan.${plan.requestId}`;const intent=await runtime.registerIntent({requestId:plan.requestId,handlerId:MACHINE_BRIDGE_CONTINUATION_HANDLER_ID,handlerVersion:"1",contextRef,contextHash:plan.descriptorHash});return {plan,intent,contextRef}}
  private async handle(context:any){
    const requestId=mbName(context?.requestId,"requestId");const expectedContext=`mbplan.${requestId}`;if(context?.contextRef!==expectedContext)throw new Error("Machine Bridge continuation contextRef divergente");let plan=await this.store.get(requestId);if(context.contextHash!==plan.descriptorHash)throw new Error("Machine Bridge continuation contextHash divergente");
    if(plan.status==="completed")return {format:"arca-continuation-handler-result-v1",requestId,wakeSequence:context.wakeSequence,status:"completed" as const,outcomeRef:`mb-result.${plan.jobId}`,outcomeHash:plan.resultHash};
    if(plan.status==="failed")return {format:"arca-continuation-handler-result-v1",requestId,wakeSequence:context.wakeSequence,status:"deferred" as const,outcomeRef:`mb-result.${plan.jobId}`,outcomeHash:plan.resultHash};
    const recipe=this.store.recipe(plan.recipeId);if(recipe.action!==plan.action||stable(recipe.requires)!==stable(plan.requires))throw new Error("Machine Bridge continuation recipe divergente do plan persistido");const job={format:"arca-remote-job-v3",protocolVersion:3,jobId:plan.jobId,requestId,action:recipe.action,requires:[...recipe.requires],params:clean(plan.params)};
    let result:any;try{result=await recoverableCall(this.client,job,{queue:this.queue,notify:this.notify,waitTimeoutMs:this.waitTimeoutMs,pollIntervalMs:this.pollIntervalMs})}catch(error){await this.store.fail({requestId,expectedRecordHash:plan.recordHash,errorCode:"transport-failed",terminal:false});throw error}
    if(result.status!=="completed"){plan=await this.store.fail({requestId,expectedRecordHash:plan.recordHash,result,errorCode:"execution-failed",terminal:true});return {format:"arca-continuation-handler-result-v1",requestId,wakeSequence:context.wakeSequence,status:"deferred" as const,outcomeRef:`mb-result.${plan.jobId}`,outcomeHash:plan.resultHash}}
    const gate=await this.gate.consumeResult(result,{execution:{jobId:job.jobId,action:job.action,descriptorHash:plan.descriptorHash}});plan=await this.store.complete({requestId,expectedRecordHash:plan.recordHash,result,gateState:gate.state});return {format:"arca-continuation-handler-result-v1",requestId,wakeSequence:context.wakeSequence,status:"completed" as const,outcomeRef:`mb-result.${plan.jobId}`,outcomeHash:plan.resultHash};
  }
}
