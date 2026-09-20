import {createHash} from "node:crypto";
import {mkdir,open,readFile,readdir} from "node:fs/promises";
import {join,resolve} from "node:path";
import {classifyPrivacyRecord} from "./privacy-classification.ts";
import {CreatorWorkflowProposalService} from "./creator-workflow-proposal.ts";
import {HumanReviewQueue} from "./reviews.ts";
import {ReasoningOutputReviewGate} from "./reasoning-output-review.ts";
import {
  ARCA_DURABLE_REASONING_PENDING_STATUS_FORMAT,
  DurableReasoningPendingCoordinator,
  DurableReasoningPendingRuntime
} from "./reasoning-pending.ts";
import type {CreatorSession} from "./creator-control.ts";

export const CREATOR_WORKFLOW_REASONING_BINDING_FORMAT="arca-creator-workflow-reasoning-binding-v1";
export const CREATOR_WORKFLOW_REASONING_FORMAT="arca-creator-workflow-reasoning-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,200}$/;
const HASH=/^[a-f0-9]{64}$/;
const RESPONSE_FORMATS=new Set(["text","json"]);
const MAX_RECORD_BYTES=128*1024;

type JsonObject=Record<string,any>;
type StartInput={
  proposalId:string;
  expectedRecordHash:string;
  expectedPlanHash:string;
  message:string;
  session:CreatorSession;
};
type StatusInput={requestId:string;session:CreatorSession};

function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function stable(value:any):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function sha256(value:any){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function safeId(value:unknown,label:string){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error(`${label} invalido`);return value}
function exactHash(value:unknown,label:string){if(typeof value!=="string"||!HASH.test(value))throw new Error(`${label} invalido`);return value}
function strongSession(session:any){return session?.authMethod==="webauthn"||session?.authMethod==="hardware-key"}
function sessionCheck(session:any){if(!session||typeof session!=="object"||!String(session.subject??"").trim())throw new TypeError("Creator session obrigatoria");if(!strongSession(session))throw new Error("Creator workflow reasoning exige sessao forte WebAuthn/hardware-key")}
function instruction(value:unknown){const text=String(value??"").trim();if(!text)throw new TypeError("workflow reasoning message obrigatoria");if(text.length>16000)throw new RangeError("workflow reasoning message excede 16000 caracteres");return text}
function pendingStatus(coordinator:DurableReasoningPendingCoordinator,value:any){
  if(value?.format===ARCA_DURABLE_REASONING_PENDING_STATUS_FORMAT)return value;
  return coordinator.status(value);
}
function validateBinding(record:any){
  if(!plain(record)||record.format!==CREATOR_WORKFLOW_REASONING_BINDING_FORMAT)throw new Error("workflow reasoning binding invalido");
  safeId(record.requestId,"requestId");safeId(record.proposalId,"proposalId");safeId(record.payloadId,"payloadId");
  for(const key of ["proposalHash","planHash","workflowDefinitionHash","workflowRecordHash","intentRecordHash","instructionHash","bindingHash","recordHash"])exactHash(record[key],key);
  const {recordHash,...body}=record;if(sha256(body)!==recordHash)throw new Error(`workflow reasoning binding adulterado: ${record.requestId}`);
  const bindingBody={requestId:record.requestId,proposalId:record.proposalId,proposalHash:record.proposalHash,planHash:record.planHash,workflowDefinitionHash:record.workflowDefinitionHash,workflowRecordHash:record.workflowRecordHash,intentRecordHash:record.intentRecordHash,payloadId:record.payloadId,instructionHash:record.instructionHash,responseFormat:record.responseFormat};
  if(sha256(bindingBody)!==record.bindingHash)throw new Error("bindingHash invalido");
  if(!RESPONSE_FORMATS.has(record.responseFormat))throw new Error("binding responseFormat invalido");
  return record;
}

export class CreatorWorkflowReasoningBindingStore{
  readonly home:string;readonly root:string;
  constructor(home:string){if(!home)throw new Error("home obrigatorio");this.home=resolve(home);this.root=join(this.home,"creator-control","workflow-reasoning-bindings")}
  async init(){await mkdir(this.root,{recursive:true})}
  private path(requestId:string){return join(this.root,`${safeId(requestId,"requestId")}.json`)}
  async get(requestId:string){await this.init();return validateBinding(JSON.parse(await readFile(this.path(requestId),"utf8")))}
  async getIfExists(requestId:string){try{return await this.get(requestId)}catch(error:any){if(error?.code==="ENOENT")return null;throw error}}
  async list(){await this.init();const out=[];for(const name of (await readdir(this.root)).filter(name=>name.endsWith(".json")).sort())out.push(validateBinding(JSON.parse(await readFile(join(this.root,name),"utf8"))));return out.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))}
  async create(input:JsonObject){
    await this.init();const bindingBody={
      requestId:safeId(input.requestId,"requestId"),
      proposalId:safeId(input.proposalId,"proposalId"),
      proposalHash:exactHash(input.proposalHash,"proposalHash"),
      planHash:exactHash(input.planHash,"planHash"),
      workflowDefinitionHash:exactHash(input.workflowDefinitionHash,"workflowDefinitionHash"),
      workflowRecordHash:exactHash(input.workflowRecordHash,"workflowRecordHash"),
      intentRecordHash:exactHash(input.intentRecordHash,"intentRecordHash"),
      payloadId:safeId(input.payloadId,"payloadId"),
      instructionHash:exactHash(input.instructionHash,"instructionHash"),
      responseFormat:String(input.responseFormat??"json")
    };
    if(!RESPONSE_FORMATS.has(bindingBody.responseFormat))throw new Error("responseFormat invalido");
    const bindingHash=sha256(bindingBody);const existing=await this.getIfExists(bindingBody.requestId);
    if(existing){if(existing.bindingHash!==bindingHash)throw new Error("requestId ja possui workflow reasoning binding divergente");return existing}
    const now=new Date().toISOString();const body={format:CREATOR_WORKFLOW_REASONING_BINDING_FORMAT,version:"0.1.0",...bindingBody,bindingHash,createdAt:now};const record={...body,recordHash:sha256(body)};
    const serialized=`${JSON.stringify(record,null,2)}\n`;if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error(`workflow reasoning binding excede ${MAX_RECORD_BYTES} bytes`);
    const handle=await open(this.path(bindingBody.requestId),"wx");try{await handle.writeFile(serialized,"utf8")}finally{await handle.close()}return validateBinding(record)
  }
}

export class CreatorWorkflowReasoningService{
  readonly coordinator:DurableReasoningPendingCoordinator;
  readonly proposals:CreatorWorkflowProposalService;
  readonly reviewGate:ReasoningOutputReviewGate;
  readonly bindings:CreatorWorkflowReasoningBindingStore;
  readonly responseFormat:"text"|"json";
  constructor(input:{coordinator:DurableReasoningPendingCoordinator;proposals:CreatorWorkflowProposalService;reviewGate?:ReasoningOutputReviewGate;responseFormat?:"text"|"json"}){
    if(!(input?.coordinator instanceof DurableReasoningPendingCoordinator))throw new TypeError("DurableReasoningPendingCoordinator obrigatorio");
    if(!(input?.proposals instanceof CreatorWorkflowProposalService))throw new TypeError("CreatorWorkflowProposalService obrigatorio");
    if(resolve(input.coordinator.store.home)!==resolve(input.proposals.store.home))throw new Error("reasoning/proposal services devem compartilhar ARCA_HOME");
    const format=String(input.responseFormat??"json").toLowerCase();if(!RESPONSE_FORMATS.has(format))throw new TypeError("responseFormat invalido");
    this.coordinator=input.coordinator;this.proposals=input.proposals;this.responseFormat=format as "text"|"json";
    this.reviewGate=input.reviewGate??new ReasoningOutputReviewGate(new HumanReviewQueue(input.coordinator.store.home));
    this.bindings=new CreatorWorkflowReasoningBindingStore(input.coordinator.store.home);
  }
  private provider(){
    const descriptor=this.coordinator.providerRegistry.getDescriptor(this.coordinator.providerId);if(!descriptor)throw new Error("workflow reasoning provider indisponivel");
    return {providerId:descriptor.providerId,provider:descriptor.provider,model:descriptor.model,external:descriptor.external,transportId:descriptor.transportId,transportKind:descriptor.transportKind,descriptorHash:descriptor.descriptorHash}
  }
  private publicBinding(binding:any){return {requestId:binding.requestId,proposalId:binding.proposalId,proposalHash:binding.proposalHash,planHash:binding.planHash,workflowDefinitionHash:binding.workflowDefinitionHash,payloadId:binding.payloadId,instructionHash:binding.instructionHash,bindingHash:binding.bindingHash,recordHash:binding.recordHash}}
  private async materialize(value:any,binding:any){
    if(value?.state!=="completed"||!value?.result)throw new Error("workflow reasoning completed result invalido");
    const reviewed=await this.reviewGate.materialize(value.result,{privacyClass:"restricted",authorizationContext:{kind:"registered-workflow",proposalId:binding.proposalId,proposalHash:binding.proposalHash,planHash:binding.planHash,workflowDefinitionHash:binding.workflowDefinitionHash,bindingHash:binding.bindingHash}});
    return Object.freeze({format:CREATOR_WORKFLOW_REASONING_FORMAT,version:"1.0.0",requestId:binding.requestId,payloadId:binding.payloadId,state:reviewed.gate.authorizedToContinue===true?"completed":reviewed.gate.state,provider:this.provider(),binding:this.publicBinding(binding),review:{reviewId:reviewed.review.reviewId,recordHash:reviewed.review.recordHash,gateState:reviewed.gate.state,authorizedToContinue:reviewed.gate.authorizedToContinue,outputHash:reviewed.outputHash},humanReviewRequired:true,coreMutationPerformed:false,output:value.result.reasoning?.output});
  }
  private statusEnvelope(status:any,binding:any,gate:any=null){
    const state=gate?.reviewIds?.length
      ?(gate.authorizedToContinue===true?"completed":gate.state)
      :(status.state==="completed"?"result-ready":status.state);
    return Object.freeze({format:CREATOR_WORKFLOW_REASONING_FORMAT,version:"1.0.0",requestId:binding.requestId,payloadId:binding.payloadId,state,provider:this.provider(),binding:this.publicBinding(binding),review:gate?.reviewIds?.length?{reviewIds:[...gate.reviewIds],pendingReviewIds:[...gate.pendingReviewIds],gateState:gate.state,authorizedToContinue:gate.authorizedToContinue}:null,humanReviewRequired:true,coreMutationPerformed:false,readySequence:status.readySequence??0});
  }
  async start(input:StartInput){
    sessionCheck(input?.session);const proposalId=safeId(input?.proposalId,"proposalId");const text=instruction(input?.message);exactHash(input?.expectedRecordHash,"expectedRecordHash");exactHash(input?.expectedPlanHash,"expectedPlanHash");
    const proposal=await this.proposals.get(proposalId);
    if(proposal.status!=="registered"||!proposal.registration)throw new Error("workflow proposal deve estar registered antes do reasoning");
    if(proposal.recordHash!==input.expectedRecordHash)throw new Error("Conflito de concorrencia: workflow proposal foi alterada");
    if(proposal.plan.planHash!==input.expectedPlanHash)throw new Error("planHash divergente");
    const workflow=await this.proposals.workflow.store.get(proposal.requestId);if(workflow.state!=="registered")throw new Error("workflow ja deixou estado registered");
    if(workflow.definitionHash!==proposal.registration.workflowDefinitionHash||workflow.recordHash!==proposal.registration.workflowRecordHash)throw new Error("workflow registration hash drift");
    const intent=await this.proposals.reviewRuntime.intentStore.get(proposal.requestId);if(intent.recordHash!==proposal.registration.intentRecordHash)throw new Error("workflow continuation intent hash drift");
    const pointer=await this.proposals.reviewRuntime.pointerStore.getIfExists(proposal.requestId);if(pointer)throw new Error("requestId ja possui continuation pointer; novo workflow reasoning recusado");
    const instructionHash=sha256(text);const payloadId=`creator-workflow.${sha256({requestId:proposal.requestId,proposalId,planHash:proposal.plan.planHash,instructionHash}).slice(0,64)}`;
    const binding=await this.bindings.create({requestId:proposal.requestId,proposalId,proposalHash:proposal.proposalHash,planHash:proposal.plan.planHash,workflowDefinitionHash:proposal.registration.workflowDefinitionHash,workflowRecordHash:proposal.registration.workflowRecordHash,intentRecordHash:proposal.registration.intentRecordHash,payloadId,instructionHash,responseFormat:this.responseFormat});
    const classification=classifyPrivacyRecord({recordId:payloadId,subjectType:"mixed",sourceType:"user-provided",privacyClass:"restricted",purpose:"Creator reasoning bound to a registered closed workflow",indicators:{privateCommunication:true,canMinimize:false},sourceRefs:[`workflow-proposal:${proposalId}`,`workflow-plan-hash:${proposal.plan.planHash}`,`workflow-binding-hash:${binding.bindingHash}`]});
    const result=await this.coordinator.start({requestId:proposal.requestId,payloadId,instruction:text,context:{channel:"arca-creator-workflow",proposalId,planHash:proposal.plan.planHash,workflowDefinitionHash:proposal.registration.workflowDefinitionHash,bindingHash:binding.bindingHash},responseFormat:this.responseFormat,classification,purposeConfirmed:true,providerVerified:true,privateProcessingAuthorized:true,publicPayloadApproved:false});
    if(result?.state==="completed")return this.materialize(result,binding);
    return this.statusEnvelope(pendingStatus(this.coordinator,result),binding);
  }
  async status(input:StatusInput){
    sessionCheck(input?.session);const requestId=safeId(input?.requestId,"requestId");const binding=await this.bindings.get(requestId);const record=await this.coordinator.poll(requestId);const status=this.coordinator.status(record);if(record.state==="completed"){const gate=await this.reviewGate.status(requestId);return this.statusEnvelope(status,binding,gate)}return this.statusEnvelope(status,binding)
  }
  async collect(input:StatusInput){
    sessionCheck(input?.session);const requestId=safeId(input?.requestId,"requestId");const binding=await this.bindings.get(requestId);const value=await this.coordinator.collect(requestId);if(value?.state==="completed")return this.materialize(value,binding);return this.statusEnvelope(pendingStatus(this.coordinator,value),binding)
  }
  async list(input:{session:CreatorSession}){
    sessionCheck(input?.session);const bindings=await this.bindings.list();const items=[];for(const binding of bindings){try{const record=await this.coordinator.poll(binding.requestId);const status=this.coordinator.status(record);const gate=record.state==="completed"?await this.reviewGate.status(binding.requestId):null;items.push(this.statusEnvelope(status,binding,gate))}catch(error:any){items.push({format:CREATOR_WORKFLOW_REASONING_FORMAT,version:"1.0.0",requestId:binding.requestId,payloadId:binding.payloadId,state:"binding-error",binding:this.publicBinding(binding),error:String(error?.message??error).slice(0,240)})}}return Object.freeze({format:"arca-creator-workflow-reasoning-list-v1",items})
  }
  async handleReady(event:any){
    if(event?.format!=="arca-durable-reasoning-ready-v1")throw new Error("durable reasoning ready event invalido");const requestId=safeId(event.requestId,"ready.requestId");const binding=await this.bindings.get(requestId);if(event.payloadId!==binding.payloadId)throw new Error("ready payloadId divergente do workflow binding");const value=await this.coordinator.collect(requestId);return this.materialize(value,binding)
  }
  createPendingRuntime({intervalMs=10_000,onReady}:{intervalMs?:number;onReady?:(value:{event:any;review:any})=>Promise<void>|void}={}){
    return new DurableReasoningPendingRuntime(this.coordinator,{
      intervalMs,
      shouldHandle:async record=>!!await this.bindings.getIfExists(String(record?.requestId??"")),
      onReady:async event=>{const review=await this.handleReady(event);await onReady?.({event,review})}
    })
  }
}
