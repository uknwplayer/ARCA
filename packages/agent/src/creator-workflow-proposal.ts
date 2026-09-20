import {createHash} from "node:crypto";
import {mkdir,open,readFile,readdir,rename,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {
  ARCA_CAPABILITY_WORKFLOW_PLAN_FORMAT,
  CapabilityWorkflowPolicyRegistry,
  buildCapabilityWorkflowPlan
} from "./capability-workflow-planner.ts";
import {CapabilityRegistry} from "./capability-registry.ts";
import {
  normalizeWorkflowExecutionPolicy,
  type WorkflowExecutionPolicy
} from "./autonomy-workflow-guard.ts";
import {GuardedAutonomyWorkflowCoordinator} from "./guarded-autonomy-workflow.ts";
import {ReviewAutonomyRuntime} from "./review-autonomy-runtime.ts";

export const CREATOR_WORKFLOW_PROPOSAL_FORMAT="arca-creator-workflow-proposal-v1";
export const CREATOR_WORKFLOW_PROPOSAL_VERSION="0.1.0";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,200}$/;
const HASH=/^[a-f0-9]{64}$/;
const MAX_RECORD_BYTES=512*1024;
const STATUS=new Set(["blocked","ready","registered"]);
const TOP_LEVEL_KEYS=new Set(["requestId","objectiveId","steps","executionPolicy"]);
const STEP_KEYS=new Set(["stepId","capabilityId","params"]);
const POLICY_KEYS=new Set(["deadlineAt","maxSubmitAttemptsPerJob","maxTotalSubmitAttempts"]);

type JsonObject=Record<string,any>;
export type CreatorWorkflowProposalInput={
  requestId:string;
  objectiveId?:string;
  steps:Array<{stepId:string;capabilityId:string;params?:JsonObject}>;
  executionPolicy?:WorkflowExecutionPolicy;
};
export type CreatorWorkflowRegistrationInput={
  proposalId:string;
  expectedRecordHash:string;
  expectedPlanHash:string;
  confirmRegistration:true;
};

function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clean(value:any):any{if(Array.isArray(value))return value.map(clean);if(plain(value)){const out:JsonObject={};for(const [key,item] of Object.entries(value))if(item!==undefined)out[key]=clean(item);return out}return value}
function stable(value:any):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function sha256(value:any){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function bodyForHash(record:JsonObject){const {recordHash:_ignored,...body}=record;return body}
function seal(record:JsonObject){const body=clean(record);return {...body,recordHash:sha256(body)}}
function safeId(value:unknown,label:string){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error(`${label} invalido`);return value}
function exactHash(value:unknown,label:string){if(typeof value!=="string"||!HASH.test(value))throw new Error(`${label} invalido`);return value}
function keysOnly(value:JsonObject,allowed:Set<string>,label:string){for(const key of Object.keys(value))if(!allowed.has(key))throw new Error(`${label} contem campo nao permitido: ${key}`)}
function atomicWrite(path:string,value:JsonObject){const serialized=`${JSON.stringify(value,null,2)}\n`;if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error(`workflow proposal excede ${MAX_RECORD_BYTES} bytes`);const tmp=`${path}.${process.pid}.${Date.now()}.tmp`;return writeFile(tmp,serialized,{encoding:"utf8",flag:"wx"}).then(()=>rename(tmp,path))}
function validate(record:any){
  if(!plain(record)||record.format!==CREATOR_WORKFLOW_PROPOSAL_FORMAT)throw new Error("creator workflow proposal invalida");
  safeId(record.proposalId,"proposalId");safeId(record.requestId,"requestId");
  if(record.objectiveId!==null)safeId(record.objectiveId,"objectiveId");
  if(!STATUS.has(String(record.status)))throw new Error("proposal status invalido");
  if(!plain(record.plan)||record.plan.format!==ARCA_CAPABILITY_WORKFLOW_PLAN_FORMAT)throw new Error("proposal plan invalido");
  if(record.plan.requestId!==record.requestId)throw new Error("proposal requestId divergente");
  exactHash(record.plan.planHash,"planHash");
  const policy=normalizeWorkflowExecutionPolicy(record.executionPolicy??{});
  if(stable(policy)!==stable(record.executionPolicy))throw new Error("proposal executionPolicy nao normalizada");
  const expectedProposalHash=sha256({planHash:record.plan.planHash,executionPolicy:policy});
  if(record.proposalHash!==expectedProposalHash)throw new Error("proposalHash invalido");
  if(record.proposalId!==`CWP-${expectedProposalHash.slice(0,40)}`)throw new Error("proposalId divergente");
  if(record.status==="registered"&&!plain(record.registration))throw new Error("proposal registrada sem registration metadata");
  if(record.status!=="registered"&&record.registration!==null)throw new Error("proposal nao registrada contem registration metadata");
  if(record.status==="ready"&&record.plan.status!=="ready")throw new Error("proposal ready com plan bloqueado");
  if(record.status==="blocked"&&record.plan.status!=="blocked")throw new Error("proposal blocked com plan ready");
  if(!HASH.test(String(record.recordHash??""))||record.recordHash!==sha256(bodyForHash(record)))throw new Error(`creator workflow proposal adulterada: ${record.proposalId}`);
  return record;
}
function normalizeProposalInput(input:CreatorWorkflowProposalInput){
  if(!plain(input))throw new TypeError("workflow proposal input invalido");keysOnly(input,TOP_LEVEL_KEYS,"workflow proposal");
  const requestId=safeId(input.requestId,"requestId");const objectiveId=input.objectiveId==null?undefined:safeId(input.objectiveId,"objectiveId");
  if(!Array.isArray(input.steps)||input.steps.length<1||input.steps.length>50)throw new Error("steps deve conter entre 1 e 50 itens");
  const steps=input.steps.map((step,index)=>{if(!plain(step))throw new Error(`steps[${index}] invalido`);keysOnly(step,STEP_KEYS,`steps[${index}]`);return {stepId:safeId(step.stepId,`steps[${index}].stepId`),capabilityId:safeId(step.capabilityId,`steps[${index}].capabilityId`),...(step.params===undefined?{}:{params:step.params})}});
  const rawPolicy=input.executionPolicy??{};if(!plain(rawPolicy))throw new Error("executionPolicy deve ser objeto");keysOnly(rawPolicy,POLICY_KEYS,"executionPolicy");
  const executionPolicy=normalizeWorkflowExecutionPolicy(rawPolicy);
  return {requestId,...(objectiveId?{objectiveId}:{}),steps,executionPolicy};
}

export class CreatorWorkflowProposalStore{
  readonly home:string;readonly root:string;
  constructor(home:string){if(!home)throw new Error("home obrigatorio");this.home=resolve(home);this.root=join(this.home,"creator-control","workflow-proposals")}
  async init(){await mkdir(this.root,{recursive:true})}
  private path(proposalId:string){return join(this.root,`${safeId(proposalId,"proposalId")}.json`)}
  async get(proposalId:string){await this.init();return validate(JSON.parse(await readFile(this.path(proposalId),"utf8")))}
  async getIfExists(proposalId:string){try{return await this.get(proposalId)}catch(error:any){if(error?.code==="ENOENT")return null;throw error}}
  async list({status}:{status?:string}={}){await this.init();if(status!==undefined&&!STATUS.has(status))throw new Error("proposal status filter invalido");const out=[];for(const name of (await readdir(this.root)).filter(name=>name.endsWith(".json")).sort()){const record=validate(JSON.parse(await readFile(join(this.root,name),"utf8")));if(status&&record.status!==status)continue;out.push(record)}return out.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))}
  async create(input:{plan:any;executionPolicy:WorkflowExecutionPolicy}){
    await this.init();if(!plain(input?.plan)||input.plan.format!==ARCA_CAPABILITY_WORKFLOW_PLAN_FORMAT)throw new Error("capability workflow plan obrigatorio");
    const executionPolicy=normalizeWorkflowExecutionPolicy(input.executionPolicy??{});const proposalHash=sha256({planHash:input.plan.planHash,executionPolicy});const proposalId=`CWP-${proposalHash.slice(0,40)}`;
    const existing=await this.getIfExists(proposalId);if(existing)return existing;
    const now=new Date().toISOString();const record=seal({
      format:CREATOR_WORKFLOW_PROPOSAL_FORMAT,version:CREATOR_WORKFLOW_PROPOSAL_VERSION,
      proposalId,requestId:input.plan.requestId,objectiveId:input.plan.objectiveId??null,
      status:input.plan.status==="ready"?"ready":"blocked",proposalHash,
      plan:clean(input.plan),executionPolicy,registration:null,createdAt:now,updatedAt:now
    });
    const handle=await open(this.path(proposalId),"wx");try{const serialized=`${JSON.stringify(record,null,2)}\n`;if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error(`workflow proposal excede ${MAX_RECORD_BYTES} bytes`);await handle.writeFile(serialized,"utf8")}finally{await handle.close()}return validate(record)
  }
  async markRegistered(input:{proposalId:string;expectedRecordHash:string;registration:JsonObject}){
    const current=await this.get(input.proposalId);exactHash(input.expectedRecordHash,"expectedRecordHash");
    if(current.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: workflow proposal foi alterada");
    if(current.status==="registered")return current;if(current.status!=="ready")throw new Error("workflow proposal bloqueada nao pode ser registrada");
    const now=new Date().toISOString();const next=seal({...bodyForHash(current),status:"registered",registration:clean(input.registration),updatedAt:now});await atomicWrite(this.path(input.proposalId),next);return validate(next)
  }
}

export class CreatorWorkflowProposalService{
  readonly registry:CapabilityRegistry;readonly policyRegistry:CapabilityWorkflowPolicyRegistry;readonly workflow:GuardedAutonomyWorkflowCoordinator;readonly reviewRuntime:ReviewAutonomyRuntime;readonly store:CreatorWorkflowProposalStore;
  constructor(input:{home:string;registry:CapabilityRegistry;workflow:GuardedAutonomyWorkflowCoordinator;reviewRuntime:ReviewAutonomyRuntime;policyRegistry?:CapabilityWorkflowPolicyRegistry}){
    if(!(input?.registry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio");
    if(!(input?.workflow instanceof GuardedAutonomyWorkflowCoordinator))throw new TypeError("GuardedAutonomyWorkflowCoordinator obrigatorio");
    if(!(input?.reviewRuntime instanceof ReviewAutonomyRuntime))throw new TypeError("ReviewAutonomyRuntime obrigatorio");
    this.registry=input.registry;this.workflow=input.workflow;this.reviewRuntime=input.reviewRuntime;this.policyRegistry=input.policyRegistry??new CapabilityWorkflowPolicyRegistry();this.store=new CreatorWorkflowProposalStore(input.home);
  }
  describe(){return Object.freeze({format:"arca-creator-workflow-capabilities-v1",policies:this.policyRegistry.list(),capabilities:this.registry.snapshot(),executionPerformed:false,authorizationIncluded:false})}
  async propose(input:CreatorWorkflowProposalInput){
    const normalized=normalizeProposalInput(input);const plan=buildCapabilityWorkflowPlan(this.registry,{requestId:normalized.requestId,objectiveId:normalized.objectiveId,steps:normalized.steps},{policyRegistry:this.policyRegistry});
    return this.store.create({plan,executionPolicy:normalized.executionPolicy});
  }
  async list(options:{status?:string}={}){return this.store.list(options)}
  async get(proposalId:string){return this.store.get(proposalId)}
  async register(input:CreatorWorkflowRegistrationInput){
    if(!plain(input))throw new TypeError("workflow registration input invalido");keysOnly(input,new Set(["proposalId","expectedRecordHash","expectedPlanHash","confirmRegistration"]),"workflow registration");
    if(input.confirmRegistration!==true)throw new Error("confirmRegistration=true obrigatorio");
    const proposal=await this.store.get(safeId(input.proposalId,"proposalId"));exactHash(input.expectedRecordHash,"expectedRecordHash");exactHash(input.expectedPlanHash,"expectedPlanHash");
    if(proposal.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: workflow proposal foi alterada");
    if(proposal.plan.planHash!==input.expectedPlanHash)throw new Error("planHash divergente");
    if(proposal.status==="registered")return proposal;
    if(proposal.status!=="ready"||!proposal.plan.workflow)throw new Error("workflow proposal nao esta ready");
    const pointer=await this.reviewRuntime.pointerStore.getIfExists(proposal.requestId);
    if(pointer&&(pointer.authorizedToContinue===true||pointer.wake?.pending===true))throw new Error("requestId ja possui continuation authorization/wake; registro tardio recusado");
    const registered=await this.workflow.register(this.reviewRuntime,{...proposal.plan.workflow,executionPolicy:proposal.executionPolicy});
    return this.store.markRegistered({
      proposalId:proposal.proposalId,expectedRecordHash:proposal.recordHash,
      registration:{
        registeredAt:new Date().toISOString(),
        workflowDefinitionHash:registered.workflow.definitionHash,
        workflowRecordHash:registered.workflow.recordHash,
        intentRecordHash:registered.intent.recordHash,
        contextRef:registered.contextRef,
        budgetPolicyHash:registered.budget.policyHash,
        budgetRecordHash:registered.budget.recordHash,
        executionPerformed:false
      }
    });
  }
}
