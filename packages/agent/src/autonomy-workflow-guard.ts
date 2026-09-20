import {createHash} from "node:crypto";
import {mkdir,open,readFile,readdir,rename,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";

export const AUTONOMY_WORKFLOW_BUDGET_FORMAT="arca-autonomy-workflow-budget-v1";
export const AUTONOMY_WORKFLOW_BUDGET_VERSION="0.1.0";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,200}$/;
const HASH=/^[a-f0-9]{64}$/;
const MAX_RECORD_BYTES=256*1024;
const MAX_TRACKED_JOBS=100;

type JsonObject=Record<string,any>;
export type WorkflowExecutionPolicy={deadlineAt?:string|null;maxSubmitAttemptsPerJob?:number;maxTotalSubmitAttempts?:number};

function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clean(value:any):any{if(Array.isArray(value))return value.map(clean);if(plain(value)){const out:JsonObject={};for(const [key,item] of Object.entries(value))if(item!==undefined)out[key]=clean(item);return out}return value}
function stable(value:any):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function sha256(value:any){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function bodyForHash(record:JsonObject){const {recordHash:_ignored,...body}=record;return body}
function seal(record:JsonObject){const body=clean(record);return {...body,recordHash:sha256(body)}}
function safeId(value:unknown,label:string){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error(`${label} invalido`);return value}
function integer(value:unknown,label:string,{min,max}:{min:number;max:number}){const number=Number(value);if(!Number.isSafeInteger(number)||number<min||number>max)throw new Error(`${label} invalido`);return number}
function deadline(value:unknown){if(value===undefined||value===null||value==="")return null;if(typeof value!=="string")throw new Error("deadlineAt invalido");const parsed=new Date(value);if(Number.isNaN(parsed.getTime()))throw new Error("deadlineAt invalido");return parsed.toISOString()}
export function normalizeWorkflowExecutionPolicy(input:WorkflowExecutionPolicy={}){return {deadlineAt:deadline(input.deadlineAt),maxSubmitAttemptsPerJob:integer(input.maxSubmitAttemptsPerJob??3,"maxSubmitAttemptsPerJob",{min:1,max:20}),maxTotalSubmitAttempts:integer(input.maxTotalSubmitAttempts??20,"maxTotalSubmitAttempts",{min:1,max:500})}}
function validate(record:any){if(!plain(record)||record.format!==AUTONOMY_WORKFLOW_BUDGET_FORMAT)throw new Error("workflow budget invalido");safeId(record.requestId,"requestId");if(!plain(record.policy))throw new Error("workflow budget policy invalida");normalizeWorkflowExecutionPolicy(record.policy);if(!Number.isSafeInteger(record.totalSubmitAttempts)||record.totalSubmitAttempts<0)throw new Error("totalSubmitAttempts invalido");if(!plain(record.jobAttempts))throw new Error("jobAttempts invalido");const entries=Object.entries(record.jobAttempts);if(entries.length>MAX_TRACKED_JOBS)throw new Error("jobAttempts excede limite");for(const [jobId,count] of entries){safeId(jobId,"jobId");if(!Number.isSafeInteger(count)||Number(count)<0)throw new Error("jobAttempts count invalido")}if(!HASH.test(String(record.policyHash??""))||record.policyHash!==sha256(record.policy))throw new Error("policyHash invalido");if(!HASH.test(String(record.recordHash??""))||record.recordHash!==sha256(bodyForHash(record)))throw new Error(`workflow budget adulterado: ${record.requestId}`);return record}
async function atomicWrite(path:string,value:JsonObject){const serialized=`${JSON.stringify(value,null,2)}\n`;if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error(`workflow budget excede ${MAX_RECORD_BYTES} bytes`);const tmp=`${path}.${process.pid}.${Date.now()}.tmp`;await writeFile(tmp,serialized,{encoding:"utf8",flag:"wx"});await rename(tmp,path)}

export class WorkflowExecutionBudgetStore{
  readonly home:string;readonly root:string;readonly budgetsRoot:string;readonly now:()=>number;
  constructor(home:string,{now=Date.now}:{now?:()=>number}={}){if(!home)throw new Error("home obrigatorio");if(typeof now!=="function")throw new Error("clock invalido");this.home=resolve(home);this.root=join(this.home,"review-continuations");this.budgetsRoot=join(this.root,"workflow-budgets");this.now=now}
  async init(){await mkdir(this.budgetsRoot,{recursive:true})}
  private path(requestId:string){return join(this.budgetsRoot,`${safeId(requestId,"requestId")}.json`)}
  async get(requestId:string){await this.init();return validate(JSON.parse(await readFile(this.path(requestId),"utf8")))}
  async getIfExists(requestId:string){try{return await this.get(requestId)}catch(error:any){if(error?.code==="ENOENT")return null;throw error}}
  async list(){await this.init();const out=[];for(const name of (await readdir(this.budgetsRoot)).filter(name=>name.endsWith(".json")).sort())out.push(validate(JSON.parse(await readFile(join(this.budgetsRoot,name),"utf8"))));return out.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))}
  async register(input:{requestId:string;policy?:WorkflowExecutionPolicy}){await this.init();const requestId=safeId(input?.requestId,"requestId");const policy=normalizeWorkflowExecutionPolicy(input?.policy??{});const policyHash=sha256(policy);const existing=await this.getIfExists(requestId);if(existing){if(existing.policyHash!==policyHash)throw new Error("workflow execution policy ja existe com definicao divergente");return existing}const now=new Date(this.now()).toISOString();const record=seal({format:AUTONOMY_WORKFLOW_BUDGET_FORMAT,version:AUTONOMY_WORKFLOW_BUDGET_VERSION,requestId,policy,policyHash,totalSubmitAttempts:0,jobAttempts:{},lastDecision:null,createdAt:now,updatedAt:now});const handle=await open(this.path(requestId),"wx");try{const serialized=`${JSON.stringify(record,null,2)}\n`;if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error(`workflow budget excede ${MAX_RECORD_BYTES} bytes`);await handle.writeFile(serialized,"utf8")}finally{await handle.close()}return record}
  async reserveSubmission(input:{requestId:string;jobId:string}){const requestId=safeId(input?.requestId,"requestId");const jobId=safeId(input?.jobId,"jobId");const current=await this.get(requestId);const nowMs=this.now();const now=new Date(nowMs).toISOString();const deadlineMs=current.policy.deadlineAt?new Date(current.policy.deadlineAt).getTime():null;let allowed=true,code="allowed";const currentJobAttempts=Number(current.jobAttempts[jobId]??0);if(deadlineMs!==null&&nowMs>deadlineMs){allowed=false;code="deadline-exceeded"}else if(current.totalSubmitAttempts>=current.policy.maxTotalSubmitAttempts){allowed=false;code="total-attempt-budget-exceeded"}else if(currentJobAttempts>=current.policy.maxSubmitAttemptsPerJob){allowed=false;code="job-attempt-budget-exceeded"}if(!allowed){const next=seal({...bodyForHash(current),lastDecision:{allowed:false,code,jobId,at:now},updatedAt:now});await atomicWrite(this.path(requestId),next);return {allowed:false,code,record:next}}
    const jobAttempts={...current.jobAttempts,[jobId]:currentJobAttempts+1};if(Object.keys(jobAttempts).length>MAX_TRACKED_JOBS)throw new Error("workflow tracked job limit excedido");const next=seal({...bodyForHash(current),totalSubmitAttempts:current.totalSubmitAttempts+1,jobAttempts,lastDecision:{allowed:true,code:"allowed",jobId,at:now},updatedAt:now});await atomicWrite(this.path(requestId),next);return {allowed:true,code:"allowed",record:next}}
}

export class BudgetGuardedMachineBridgeClient{
  readonly client:any;readonly budgetStore:WorkflowExecutionBudgetStore;readonly synthetic=new Map<string,any>();readonly transport:any;
  constructor(client:any,budgetStore:WorkflowExecutionBudgetStore){if(!client||!client.transport||typeof client.transport.getResult!=="function"||typeof client.submit!=="function"||typeof client.waitForResult!=="function")throw new TypeError("Machine Bridge client invalido");if(!(budgetStore instanceof WorkflowExecutionBudgetStore))throw new TypeError("WorkflowExecutionBudgetStore invalido");this.client=client;this.budgetStore=budgetStore;this.transport={getResult:(jobId:string)=>this.client.transport.getResult(jobId)}}
  async submit(job:any,options?:any){const requestId=safeId(job?.requestId,"job.requestId");const jobId=safeId(job?.jobId,"job.jobId");const decision=await this.budgetStore.reserveSubmission({requestId,jobId});if(!decision.allowed){const result={format:"arca-result-v1",protocolVersion:3,jobId,requestId,status:"failed",error:{code:`workflow-${decision.code}`},output:null};this.synthetic.set(jobId,result);return {jobId,requestId,guarded:true,code:decision.code}}return this.client.submit(job,options)}
  async waitForResult(job:any,options?:any){const synthetic=this.synthetic.get(String(job?.jobId));if(synthetic)return synthetic;return this.client.waitForResult(job,options)}
}
