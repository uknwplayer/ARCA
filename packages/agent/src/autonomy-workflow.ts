import {createHash} from "node:crypto";
import {mkdir,open,readFile,readdir,rename,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {ReviewGatedContinuation} from "./review-continuation.ts";
import {hashContinuationDescriptor} from "./review-continuation-store.ts";
import {defaultMachineBridgeContinuationRecipes} from "./machine-bridge-continuation-handler.ts";
import type {ContinuationHandler} from "./review-continuation-dispatcher.ts";

export const AUTONOMY_WORKFLOW_FORMAT="arca-autonomy-workflow-v1";
export const AUTONOMY_WORKFLOW_VERSION="0.1.0";
export const AUTONOMY_WORKFLOW_HANDLER_ID="machine-bridge.workflow-v1";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;
const SECRET_KEY=/(authorization|bearer|token|password|secret|api[_-]?key|client[_-]?secret|private[_-]?key|cookie)/i;
const MAX_STEPS=50;
const MAX_PARAMS_BYTES=64*1024;
const MAX_RECORD_BYTES=1024*1024;

const PAUSED_STATES=new Set(["awaiting-human-review","blocked","needs-more-information","manual-policy-required"]);
const TERMINAL_STATES=new Set(["completed","failed"]);

type JsonObject=Record<string,any>;
type RemoteClientLike={
  transport:{getResult:(jobId:string)=>Promise<any>|any};
  submit:(job:any,options?:any)=>Promise<any>|any;
  waitForResult:(job:any,options?:any)=>Promise<any>|any;
};

type WorkflowStepInput={stepId:string;recipeId:string;params?:JsonObject};
export type AutonomyWorkflowInput={requestId:string;steps:WorkflowStepInput[]};

function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clean(value:any):any{if(Array.isArray(value))return value.map(clean);if(plain(value)){const out:JsonObject={};for(const [key,item] of Object.entries(value))if(item!==undefined)out[key]=clean(item);return out}return value}
function stable(value:any):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function sha256(value:any){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function bodyForHash(record:JsonObject){const {recordHash:_ignored,...body}=record;return body}
function seal(record:JsonObject){const body=clean(record);return {...body,recordHash:sha256(body)}}
function safeId(value:unknown,label:string){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error(`${label} invalido`);return value}
function hasSecret(value:any):boolean{if(Array.isArray(value))return value.some(hasSecret);if(!plain(value))return false;for(const [key,item] of Object.entries(value)){if(SECRET_KEY.test(key))return true;if(hasSecret(item))return true}return false}
function jsonObject(value:unknown,label="params"){if(!plain(value))throw new Error(`${label} deve ser objeto`);let serialized:string;try{serialized=JSON.stringify(value)}catch{throw new Error(`${label} deve ser JSON serializavel`)}if(serialized===undefined||Buffer.byteLength(serialized)>MAX_PARAMS_BYTES)throw new Error(`${label} excede ${MAX_PARAMS_BYTES} bytes ou e invalido`);const normalized=JSON.parse(serialized);if(!plain(normalized))throw new Error(`${label} deve permanecer objeto JSON`);return normalized as JsonObject}
function normalizeParams(value:unknown){const params=jsonObject(value===undefined?{}:value);if(hasSecret(params))throw new Error("params de workflow nao podem conter secrets/credentials");return clean(params)}
function validateRecord(record:any){
  if(!plain(record)||record.format!==AUTONOMY_WORKFLOW_FORMAT)throw new Error("workflow invalido");
  safeId(record.requestId,"requestId");
  if(!HASH.test(String(record.definitionHash??"")))throw new Error("definitionHash invalido");
  if(!Array.isArray(record.steps)||record.steps.length<1||record.steps.length>MAX_STEPS)throw new Error("steps invalido");
  if(!Number.isSafeInteger(record.cursor)||record.cursor<0||record.cursor>record.steps.length)throw new Error("cursor invalido");
  const stepIds=new Set<string>();
  for(const step of record.steps){if(!plain(step))throw new Error("workflow step invalido");const stepId=safeId(step.stepId,"stepId");if(stepIds.has(stepId))throw new Error(`step duplicado: ${stepId}`);stepIds.add(stepId);safeId(step.recipeId,"recipeId");safeId(step.action,"action");safeId(step.jobId,"jobId");if(!Array.isArray(step.requires))throw new Error("step requires invalido");if(!plain(step.params)||hasSecret(step.params))throw new Error("step params invalido");if(!["pending","completed","failed"].includes(step.status))throw new Error("step status invalido");if(!HASH.test(String(step.descriptorHash??"")))throw new Error("step descriptorHash invalido");if(step.resultHash!==null&&!HASH.test(String(step.resultHash??"")))throw new Error("step resultHash invalido")}
  if(!HASH.test(String(record.recordHash??""))||sha256(bodyForHash(record))!==record.recordHash)throw new Error(`workflow adulterado: ${record.requestId}`);
  return record;
}
async function atomicWrite(path:string,value:JsonObject){const serialized=`${JSON.stringify(value,null,2)}\n`;if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error(`workflow excede ${MAX_RECORD_BYTES} bytes`);const tmp=`${path}.${process.pid}.${Date.now()}.tmp`;await writeFile(tmp,serialized,{encoding:"utf8",flag:"wx"});await rename(tmp,path)}
function correlation(result:any,job:any){if(!plain(result))throw new Error("Machine Bridge result invalido");if(result.jobId!==job.jobId)throw new Error("workflow detectou jobId divergente");if(result.requestId!==job.requestId)throw new Error("workflow detectou requestId divergente");return result}

function recipeRegistry(){return new Map(defaultMachineBridgeContinuationRecipes().map(recipe=>[recipe.id,recipe]))}

async function recoverableCall(client:RemoteClientLike,job:any,options:any){
  if(!client||!client.transport||typeof client.transport.getResult!=="function"||typeof client.submit!=="function"||typeof client.waitForResult!=="function")throw new TypeError("recoverable Machine Bridge client obrigatorio");
  const loaded=await client.transport.getResult(job.jobId);if(loaded)return correlation(loaded.result??loaded,job);
  try{await client.submit(job,{queue:options.queue,notify:options.notify})}catch(error:any){if(!/already exists/i.test(String(error?.message??error)))throw error}
  return correlation(await client.waitForResult(job,{waitTimeoutMs:options.waitTimeoutMs,pollIntervalMs:options.pollIntervalMs}),job);
}

export class AutonomyWorkflowStore{
  readonly home:string;readonly root:string;readonly workflowsRoot:string;
  constructor(home:string){if(!home)throw new Error("home obrigatorio");this.home=resolve(home);this.root=join(this.home,"review-continuations");this.workflowsRoot=join(this.root,"workflows")}
  async init(){await mkdir(this.workflowsRoot,{recursive:true})}
  private path(requestId:string){return join(this.workflowsRoot,`${safeId(requestId,"requestId")}.json`)}
  async get(requestId:string){await this.init();return validateRecord(JSON.parse(await readFile(this.path(requestId),"utf8")))}
  async getIfExists(requestId:string){try{return await this.get(requestId)}catch(error:any){if(error?.code==="ENOENT")return null;throw error}}
  async list(){await this.init();const out=[];for(const name of (await readdir(this.workflowsRoot)).filter(name=>name.endsWith(".json")).sort())out.push(validateRecord(JSON.parse(await readFile(join(this.workflowsRoot,name),"utf8"))));return out.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))}
  async register(input:AutonomyWorkflowInput){
    await this.init();const requestId=safeId(input?.requestId,"requestId");if(!Array.isArray(input?.steps)||input.steps.length<1||input.steps.length>MAX_STEPS)throw new Error(`steps deve conter entre 1 e ${MAX_STEPS} itens`);const registry=recipeRegistry();const ids=new Set<string>();
    const steps=input.steps.map((raw,index)=>{if(!plain(raw))throw new Error(`steps[${index}] invalido`);const stepId=safeId(raw.stepId,`steps[${index}].stepId`);if(ids.has(stepId))throw new Error(`step duplicado: ${stepId}`);ids.add(stepId);const recipeId=safeId(raw.recipeId,`steps[${index}].recipeId`);const recipe=registry.get(recipeId);if(!recipe)throw new Error(`recipe fora do Workflow Registry: ${recipeId}`);const rawParams=normalizeParams(raw.params);const params=jsonObject(recipe.normalizeParams(rawParams),`steps[${index}].params`);if(hasSecret(params))throw new Error("recipe produziu params secretos");const descriptor={requestId,stepId,recipeId,action:recipe.action,requires:[...recipe.requires],params};const descriptorHash=hashContinuationDescriptor(descriptor);const jobId=`mbwf-${sha256(descriptor).slice(0,40)}`;return {stepId,recipeId,action:recipe.action,requires:[...recipe.requires],params,jobId,descriptorHash,status:"pending",resultStatus:null,resultHash:null,gateState:null,completedAt:null,lastErrorCode:null}});
    const definition={requestId,steps:steps.map(step=>({stepId:step.stepId,recipeId:step.recipeId,action:step.action,requires:step.requires,params:step.params,jobId:step.jobId,descriptorHash:step.descriptorHash}))};const definitionHash=hashContinuationDescriptor(definition);const existing=await this.getIfExists(requestId);if(existing){if(existing.definitionHash!==definitionHash)throw new Error("workflow ja existe com definicao divergente");return existing}
    const now=new Date().toISOString();const record=seal({format:AUTONOMY_WORKFLOW_FORMAT,version:AUTONOMY_WORKFLOW_VERSION,requestId,definitionHash,state:"registered",cursor:0,steps,lastWakeSequence:0,lastErrorCode:null,createdAt:now,updatedAt:now});const handle=await open(this.path(requestId),"wx");try{const serialized=`${JSON.stringify(record,null,2)}\n`;if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error(`workflow excede ${MAX_RECORD_BYTES} bytes`);await handle.writeFile(serialized,"utf8")}finally{await handle.close()}return record;
  }
  async markRunning(input:{requestId:string;expectedRecordHash:string;wakeSequence:number;allowPaused?:boolean}){const current=await this.get(input.requestId);if(current.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: workflow alterado");if(TERMINAL_STATES.has(current.state))return current;if(PAUSED_STATES.has(current.state)&&input.allowPaused!==true)return current;const now=new Date().toISOString();const next=seal({...bodyForHash(current),state:"running",lastWakeSequence:Math.max(Number(current.lastWakeSequence)||0,Number(input.wakeSequence)||0),updatedAt:now});await atomicWrite(this.path(input.requestId),next);return next}
  async markTransient(input:{requestId:string;expectedRecordHash:string;stepIndex:number;errorCode:string}){const current=await this.get(input.requestId);if(current.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: workflow alterado");if(current.cursor!==input.stepIndex)throw new Error("cursor divergente ao registrar falha transitoria");const now=new Date().toISOString();const code=safeId(input.errorCode,"errorCode");const steps=current.steps.map((step:any,index:number)=>index===input.stepIndex?{...step,lastErrorCode:code}:step);const next=seal({...bodyForHash(current),state:"running",steps,lastErrorCode:code,updatedAt:now});await atomicWrite(this.path(input.requestId),next);return next}
  async completeStep(input:{requestId:string;expectedRecordHash:string;stepIndex:number;result:any;gate:any}){const current=await this.get(input.requestId);if(current.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: workflow alterado");if(current.cursor!==input.stepIndex)throw new Error("cursor divergente ao concluir step");const step=current.steps[input.stepIndex];if(!step)throw new Error("step inexistente");const now=new Date().toISOString();const resultHash=sha256(clean(input.result));const steps=current.steps.map((item:any,index:number)=>index===input.stepIndex?{...item,status:"completed",resultStatus:String(input.result?.status??"unknown"),resultHash,gateState:String(input.gate?.state??"unknown"),completedAt:now,lastErrorCode:null}:item);const cursor=input.stepIndex+1;let state:string;if(input.gate?.authorizedToContinue===true)state=cursor>=steps.length?"completed":"running";else state=String(input.gate?.state??"manual-policy-required");const next=seal({...bodyForHash(current),state,cursor,steps,lastErrorCode:null,updatedAt:now});await atomicWrite(this.path(input.requestId),next);return next}
  async failStep(input:{requestId:string;expectedRecordHash:string;stepIndex:number;result:any;errorCode:string}){const current=await this.get(input.requestId);if(current.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: workflow alterado");if(current.cursor!==input.stepIndex)throw new Error("cursor divergente ao falhar step");const now=new Date().toISOString();const resultHash=sha256(clean(input.result));const code=safeId(input.errorCode,"errorCode");const steps=current.steps.map((item:any,index:number)=>index===input.stepIndex?{...item,status:"failed",resultStatus:String(input.result?.status??"unknown"),resultHash,completedAt:now,lastErrorCode:code}:item);const next=seal({...bodyForHash(current),state:"failed",steps,lastErrorCode:code,updatedAt:now});await atomicWrite(this.path(input.requestId),next);return next}
  async failPolicy(input:{requestId:string;expectedRecordHash:string;stepIndex:number;errorCode:string}){const current=await this.get(input.requestId);if(current.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: workflow alterado");if(current.cursor!==input.stepIndex)throw new Error("cursor divergente ao falhar policy");const now=new Date().toISOString();const code=safeId(input.errorCode,"errorCode");const steps=current.steps.map((item:any,index:number)=>index===input.stepIndex?{...item,status:"failed",resultStatus:"policy-failed",resultHash:null,completedAt:now,lastErrorCode:code}:item);const next=seal({...bodyForHash(current),state:"failed",steps,lastErrorCode:code,updatedAt:now});await atomicWrite(this.path(input.requestId),next);return next}
}

export class AutonomyWorkflowCoordinator{
  readonly store:AutonomyWorkflowStore;readonly gate:ReviewGatedContinuation;readonly client:RemoteClientLike;readonly queue:string;readonly notify:boolean;readonly waitTimeoutMs:number;readonly pollIntervalMs:number;readonly handler:ContinuationHandler;
  constructor(input:{home:string;gate:ReviewGatedContinuation;client:RemoteClientLike;queue?:string;notify?:boolean;waitTimeoutMs?:number;pollIntervalMs?:number}){
    if(!(input?.gate instanceof ReviewGatedContinuation))throw new TypeError("ReviewGatedContinuation obrigatorio");if(!input.home)throw new Error("home obrigatorio");this.gate=input.gate;this.client=input.client;this.store=new AutonomyWorkflowStore(input.home);this.queue=safeId(input.queue??"shared","queue");this.notify=input.notify!==false;this.waitTimeoutMs=Number(input.waitTimeoutMs??180000);this.pollIntervalMs=Number(input.pollIntervalMs??1000);if(!Number.isSafeInteger(this.waitTimeoutMs)||this.waitTimeoutMs<1000||this.waitTimeoutMs>900000)throw new Error("waitTimeoutMs invalido");if(!Number.isSafeInteger(this.pollIntervalMs)||this.pollIntervalMs<100||this.pollIntervalMs>30000)throw new Error("pollIntervalMs invalido");this.handler=Object.freeze({id:AUTONOMY_WORKFLOW_HANDLER_ID,version:"1",handle:context=>this.handle(context)});
  }
  async register(runtime:{registerIntent:(input:any)=>Promise<any>},input:AutonomyWorkflowInput){if(!runtime||typeof runtime.registerIntent!=="function")throw new TypeError("runtime.registerIntent obrigatorio");const workflow=await this.store.register(input);const contextRef=`mbworkflow.${workflow.requestId}`;const intent=await runtime.registerIntent({requestId:workflow.requestId,handlerId:AUTONOMY_WORKFLOW_HANDLER_ID,handlerVersion:"1",contextRef,contextHash:workflow.definitionHash});return {workflow,intent,contextRef}}
  private async handle(context:any){
    const requestId=safeId(context?.requestId,"requestId");const expectedContext=`mbworkflow.${requestId}`;if(context?.contextRef!==expectedContext)throw new Error("workflow contextRef divergente");let workflow=await this.store.get(requestId);if(context.contextHash!==workflow.definitionHash)throw new Error("workflow contextHash divergente");
    if(TERMINAL_STATES.has(workflow.state))return {format:"arca-continuation-handler-result-v1",requestId,wakeSequence:context.wakeSequence,status:"completed" as const,outcomeRef:`mbworkflow.${requestId}`,outcomeHash:workflow.recordHash};
    if(PAUSED_STATES.has(workflow.state)){
      const gate=await this.gate.status(requestId);
      if(gate.authorizedToContinue!==true)return {format:"arca-continuation-handler-result-v1",requestId,wakeSequence:context.wakeSequence,status:"completed" as const,outcomeRef:`mbworkflow.${requestId}`,outcomeHash:workflow.recordHash};
      workflow=await this.store.markRunning({requestId,expectedRecordHash:workflow.recordHash,wakeSequence:Number(context.wakeSequence)||0,allowPaused:true});
    }else workflow=await this.store.markRunning({requestId,expectedRecordHash:workflow.recordHash,wakeSequence:Number(context.wakeSequence)||0});
    while(workflow.cursor<workflow.steps.length){
      const stepIndex=workflow.cursor;const step=workflow.steps[stepIndex];const recipe=recipeRegistry().get(step.recipeId);let normalizedParams:any=null;
      try{if(!recipe||recipe.action!==step.action||stable(recipe.requires)!==stable(step.requires))throw new Error("recipe metadata drift");normalizedParams=jsonObject(recipe.normalizeParams(normalizeParams(step.params)),`step ${step.stepId} params`);if(stable(normalizedParams)!==stable(step.params))throw new Error("recipe params drift")}catch{workflow=await this.store.failPolicy({requestId,expectedRecordHash:workflow.recordHash,stepIndex,errorCode:"recipe-drift"});return {format:"arca-continuation-handler-result-v1",requestId,wakeSequence:context.wakeSequence,status:"completed" as const,outcomeRef:`mbworkflow.${requestId}`,outcomeHash:workflow.recordHash}}
      const job={format:"arca-remote-job-v3",protocolVersion:3,jobId:step.jobId,requestId,action:step.action,requires:[...step.requires],params:clean(normalizedParams)};
      let result:any;try{result=await recoverableCall(this.client,job,{queue:this.queue,notify:this.notify,waitTimeoutMs:this.waitTimeoutMs,pollIntervalMs:this.pollIntervalMs})}catch(error){await this.store.markTransient({requestId,expectedRecordHash:workflow.recordHash,stepIndex,errorCode:"transport-failed"});throw error}
      if(result.status!=="completed"){workflow=await this.store.failStep({requestId,expectedRecordHash:workflow.recordHash,stepIndex,result,errorCode:"execution-failed"});return {format:"arca-continuation-handler-result-v1",requestId,wakeSequence:context.wakeSequence,status:"completed" as const,outcomeRef:`mbworkflow.${requestId}`,outcomeHash:workflow.recordHash}}
      const gate=await this.gate.consumeResult(result,{execution:{jobId:job.jobId,action:job.action,descriptorHash:step.descriptorHash}});workflow=await this.store.completeStep({requestId,expectedRecordHash:workflow.recordHash,stepIndex,result,gate});
      if(gate.authorizedToContinue!==true)return {format:"arca-continuation-handler-result-v1",requestId,wakeSequence:context.wakeSequence,status:"completed" as const,outcomeRef:`mbworkflow.${requestId}`,outcomeHash:workflow.recordHash};
    }
    return {format:"arca-continuation-handler-result-v1",requestId,wakeSequence:context.wakeSequence,status:"completed" as const,outcomeRef:`mbworkflow.${requestId}`,outcomeHash:workflow.recordHash};
  }
}
