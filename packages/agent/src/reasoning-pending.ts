import {createHash} from "node:crypto";
import {mkdir,open,readFile,readdir,rename,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {CapabilityRegistry} from "./capability-registry.ts";
import {
  ARCA_REASONING_RESULT_FORMAT,
  ReasoningProviderRegistry,
  createReasoningRequest,
  validateReasoningProviderResult,
  type ReasoningRunInput
} from "./reasoning-capability.ts";
import {
  ReasoningTransportDeniedError,
  createOpaqueReasoningTransportAttestation,
  evaluateReasoningTransport,
  reasoningPayloadHash
} from "./reasoning-transport-gate.ts";
import {
  ARCA_VERIFIED_DURABLE_OPAQUE_REASONING_RESULT_FORMAT,
  DurableOpaqueReasoningProviderAdapter,
  createDurableOpaqueReasoningEvidence,
  runVerifiedDurableOpaqueReasoning,
  verifyDurableOpaqueReasoningProvider
} from "./reasoning-durable-opaque-adapter.ts";
import {DurableOpaqueRpcPendingError} from "../../../src/machine-bridge/durable-opaque-rpc-origin.mjs";

export const ARCA_DURABLE_REASONING_PENDING_FORMAT="arca-durable-reasoning-pending-v1";
export const ARCA_DURABLE_REASONING_PENDING_STATUS_FORMAT="arca-durable-reasoning-pending-status-v1";
export const ARCA_DURABLE_REASONING_PENDING_RUNTIME_FORMAT="arca-durable-reasoning-pending-runtime-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;
const STATES=new Set(["registered","awaiting-reasoning","result-ready","completed","failed"]);
const MAX_RECORD_BYTES=128*1024;

type JsonObject=Record<string,any>;
type PendingStartOptions={decidedAt?:string;signal?:AbortSignal};

function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clean(value:any):any{if(Array.isArray(value))return value.map(clean);if(plain(value)){const out:JsonObject={};for(const [key,item] of Object.entries(value))if(item!==undefined)out[key]=clean(item);return out}return value}
function stable(value:any):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function sha256(value:any){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function safeId(value:unknown,label:string){const text=String(value??"").trim();if(!SAFE_ID.test(text))throw new TypeError(`${label} invalido`);return text}
function bodyForHash(value:any){const {recordHash:_ignored,...body}=value;return body}
function seal(value:any){const body=clean(value);return {...body,recordHash:sha256(body)}}
function iso(value=new Date().toISOString()){const d=new Date(value);if(Number.isNaN(d.getTime()))throw new TypeError("timestamp invalido");return d.toISOString()}
function hash(value:unknown,label:string){const text=String(value??"");if(!HASH.test(text))throw new TypeError(`${label} invalido`);return text}
function fileName(requestId:string){return sha256(requestId)+".json"}
async function atomicWrite(path:string,value:any){
  const serialized=`${JSON.stringify(value,null,2)}\n`;
  if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error(`durable reasoning pending record excede ${MAX_RECORD_BYTES} bytes`);
  const tmp=`${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp,serialized,{encoding:"utf8",flag:"wx"});
  await rename(tmp,path);
}
function immutableDescriptor(record:any){
  return {
    requestId:record.requestId,
    payloadId:record.payloadId,
    providerId:record.providerId,
    providerDescriptorHash:record.providerDescriptorHash,
    transportId:record.transportId,
    transportHash:record.transportHash,
    classificationHash:record.classificationHash,
    privacyClass:record.privacyClass,
    responseFormat:record.responseFormat,
    payloadHash:record.payloadHash,
    transportDecisionHash:record.transportDecisionHash,
    opaqueRelayAttestationHash:record.opaqueRelayAttestationHash,
    decisionDecidedAt:record.decisionDecidedAt
  };
}
function validateRecord(record:any){
  if(!plain(record)||record.format!==ARCA_DURABLE_REASONING_PENDING_FORMAT||record.version!=="1.0.0")throw new Error("durable reasoning pending record invalido");
  for(const key of ["requestId","payloadId","providerId","transportId"])safeId(record[key],key);
  for(const key of ["providerDescriptorHash","transportHash","classificationHash","payloadHash","transportDecisionHash","opaqueRelayAttestationHash","descriptorHash","recordHash"])hash(record[key],key);
  if(!STATES.has(record.state))throw new Error("durable reasoning pending state invalido");
  if(!["text","json"].includes(record.responseFormat))throw new Error("durable reasoning responseFormat invalido");
  iso(record.decisionDecidedAt);iso(record.createdAt);iso(record.updatedAt);
  if(!Number.isSafeInteger(record.readySequence)||record.readySequence<0)throw new Error("durable reasoning readySequence invalido");
  if(typeof record.readyPending!=="boolean")throw new Error("durable reasoning readyPending invalido");
  for(const key of ["requestPacketHash","requestEnvelopeHash","continuationHash","terminalResultHash","finalResultHash","executionEvidenceHash"]){
    if(record[key]!==null)hash(record[key],key);
  }
  if(record.descriptorHash!==sha256(immutableDescriptor(record)))throw new Error("durable reasoning descriptorHash divergente");
  if(record.recordHash!==sha256(bodyForHash(record)))throw new Error("durable reasoning pending record adulterado");
  return record;
}

export class DurableReasoningPendingStore{
  readonly home:string;
  readonly root:string;
  constructor(home:string){
    if(!home)throw new Error("home obrigatorio");
    this.home=resolve(home);
    this.root=join(this.home,"reasoning-pending");
  }
  async init(){await mkdir(this.root,{recursive:true})}
  private path(requestId:string){return join(this.root,fileName(safeId(requestId,"requestId")))}
  async get(requestId:string){await this.init();const record=JSON.parse(await readFile(this.path(requestId),"utf8"));validateRecord(record);if(record.requestId!==requestId)throw new Error("durable reasoning filename/requestId mismatch");return record}
  async getIfExists(requestId:string){try{return await this.get(requestId)}catch(error:any){if(error?.code==="ENOENT")return null;throw error}}
  async list({states}: {states?:string[]}={}){
    await this.init();
    const filter=states?new Set(states):null;
    const out=[];
    for(const name of (await readdir(this.root)).filter(name=>name.endsWith(".json")).sort()){
      const record=validateRecord(JSON.parse(await readFile(join(this.root,name),"utf8")));
      if(!filter||filter.has(record.state))out.push(record);
    }
    return out.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  async register(input:any){
    await this.init();
    const now=iso(input.now);
    const base={
      format:ARCA_DURABLE_REASONING_PENDING_FORMAT,
      version:"1.0.0",
      requestId:safeId(input.requestId,"requestId"),
      payloadId:safeId(input.payloadId,"payloadId"),
      providerId:safeId(input.providerId,"providerId"),
      providerDescriptorHash:hash(input.providerDescriptorHash,"providerDescriptorHash"),
      transportId:safeId(input.transportId,"transportId"),
      transportHash:hash(input.transportHash,"transportHash"),
      classificationHash:hash(input.classificationHash,"classificationHash"),
      privacyClass:String(input.privacyClass??""),
      responseFormat:String(input.responseFormat??"json"),
      payloadHash:hash(input.payloadHash,"payloadHash"),
      transportDecisionHash:hash(input.transportDecisionHash,"transportDecisionHash"),
      opaqueRelayAttestationHash:hash(input.opaqueRelayAttestationHash,"opaqueRelayAttestationHash"),
      decisionDecidedAt:iso(input.decisionDecidedAt),
      state:"registered",
      requestPacketHash:null,
      requestEnvelopeHash:null,
      continuationHash:null,
      terminalResultHash:null,
      finalResultHash:null,
      executionEvidenceHash:null,
      lastErrorCode:null,
      readySequence:0,
      readyPending:false,
      readyAt:null,
      readyAckAt:null,
      createdAt:now,
      updatedAt:now
    };
    if(!base.privacyClass||base.privacyClass.length>80)throw new Error("privacyClass invalida");
    if(!["text","json"].includes(base.responseFormat))throw new Error("responseFormat invalido");
    const descriptorHash=sha256(immutableDescriptor({...base,descriptorHash:""}));
    const existing=await this.getIfExists(base.requestId);
    if(existing){
      if(existing.descriptorHash!==descriptorHash)throw new Error("durable reasoning request ja registrado com descriptor divergente");
      return existing;
    }
    const record=seal({...base,descriptorHash});
    const handle=await open(this.path(base.requestId),"wx");
    try{await handle.writeFile(`${JSON.stringify(record,null,2)}\n`,"utf8")}finally{await handle.close()}
    return record;
  }
  async update(requestId:string,expectedRecordHash:string,mutate:(current:any)=>any){
    const current=await this.get(requestId);
    if(current.recordHash!==expectedRecordHash)throw new Error("Conflito de concorrencia: durable reasoning pending alterado");
    const next=seal({...bodyForHash(current),...clean(mutate(structuredClone(current))),updatedAt:new Date().toISOString()});
    validateRecord(next);
    await atomicWrite(this.path(requestId),next);
    return next;
  }
  async markAwaiting(requestId:string,expectedRecordHash:string,submission:any){
    return this.update(requestId,expectedRecordHash,current=>({
      state:"awaiting-reasoning",
      requestPacketHash:submission?.requestPacketHash?hash(submission.requestPacketHash,"requestPacketHash"):current.requestPacketHash,
      requestEnvelopeHash:submission?.requestEnvelopeHash?hash(submission.requestEnvelopeHash,"requestEnvelopeHash"):current.requestEnvelopeHash,
      continuationHash:submission?.continuationHash?hash(submission.continuationHash,"continuationHash"):current.continuationHash,
      lastErrorCode:null
    }));
  }
  async markReady(requestId:string,expectedRecordHash:string,resultHash:string){
    const current=await this.get(requestId);
    if(current.recordHash!==expectedRecordHash)throw new Error("Conflito de concorrencia: durable reasoning pending alterado");
    if(current.state==="completed")return current;
    const hashValue=hash(resultHash,"terminalResultHash");
    if(current.state==="result-ready"&&current.terminalResultHash===hashValue)return current;
    const now=new Date().toISOString();
    const next=seal({...bodyForHash(current),state:"result-ready",terminalResultHash:hashValue,readySequence:Number(current.readySequence)+1,readyPending:true,readyAt:now,readyAckAt:null,lastErrorCode:null,updatedAt:now});
    validateRecord(next);await atomicWrite(this.path(requestId),next);return next;
  }
  async ackReady(requestId:string,expectedRecordHash:string,readySequence:number){
    return this.update(requestId,expectedRecordHash,current=>{
      if(current.readySequence!==readySequence)throw new Error("durable reasoning readySequence divergente");
      if(!current.readyPending)return {};
      return {readyPending:false,readyAckAt:new Date().toISOString()};
    });
  }
  async markCompleted(requestId:string,expectedRecordHash:string,{terminalResultHash,finalResultHash,executionEvidenceHash}:any){
    return this.update(requestId,expectedRecordHash,()=>({
      state:"completed",
      terminalResultHash:hash(terminalResultHash,"terminalResultHash"),
      finalResultHash:hash(finalResultHash,"finalResultHash"),
      executionEvidenceHash:hash(executionEvidenceHash,"executionEvidenceHash"),
      readyPending:false,
      readyAckAt:new Date().toISOString(),
      lastErrorCode:null
    }));
  }
  async markFailed(requestId:string,expectedRecordHash:string,errorCode:string){
    const code=safeId(errorCode,"errorCode");
    return this.update(requestId,expectedRecordHash,()=>({state:"failed",lastErrorCode:code,readyPending:false}));
  }
}

export class DurableReasoningPendingCoordinator{
  readonly store:DurableReasoningPendingStore;
  readonly providerRegistry:ReasoningProviderRegistry;
  readonly capabilityRegistry:CapabilityRegistry;
  readonly providerId:string;
  readonly transport:any;
  readonly adapter:DurableOpaqueReasoningProviderAdapter;

  constructor(input:{home:string;providerRegistry:ReasoningProviderRegistry;capabilityRegistry:CapabilityRegistry;providerId:string;transport:any;adapter:DurableOpaqueReasoningProviderAdapter}){
    this.store=new DurableReasoningPendingStore(input.home);
    if(!(input.providerRegistry instanceof ReasoningProviderRegistry))throw new TypeError("ReasoningProviderRegistry obrigatorio");
    if(!(input.capabilityRegistry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio");
    if(!(input.adapter instanceof DurableOpaqueReasoningProviderAdapter))throw new TypeError("DurableOpaqueReasoningProviderAdapter obrigatorio");
    this.providerRegistry=input.providerRegistry;this.capabilityRegistry=input.capabilityRegistry;this.providerId=safeId(input.providerId,"providerId");this.transport=input.transport;this.adapter=input.adapter;
  }

  private verifyProvider(){
    return verifyDurableOpaqueReasoningProvider(this.capabilityRegistry,this.providerRegistry,this.providerId,this.transport);
  }

  async start(reasoning:ReasoningRunInput,options:PendingStartOptions={}){
    const descriptor=this.verifyProvider();
    if(reasoning?.purposeConfirmed!==true)throw new Error("durable reasoning pending exige purposeConfirmed=true");
    if(reasoning?.providerVerified!==true)throw new Error("durable reasoning pending exige providerVerified=true");
    if(reasoning?.privateProcessingAuthorized!==true)throw new Error("durable reasoning pending exige privateProcessingAuthorized=true");
    const request=createReasoningRequest(reasoning);
    const existing=await this.store.getIfExists(request.requestId);
    const decidedAt=existing?.decisionDecidedAt??iso(options.decidedAt);
    const attestation=createOpaqueReasoningTransportAttestation({requestId:request.requestId,payloadId:request.payloadId,transport:this.transport});
    const decision=evaluateReasoningTransport({
      requestId:request.requestId,payloadId:request.payloadId,payload:request,
      classification:reasoning.classification,transport:this.transport,
      purposeConfirmed:true,providerVerified:true,privateProcessingAuthorized:true,
      publicPayloadApproved:reasoning.publicPayloadApproved,
      opaqueRelayAttestation:attestation
    },{decidedAt});
    if(!decision.allowed)throw new ReasoningTransportDeniedError(decision);
    let record=await this.store.register({
      requestId:request.requestId,payloadId:request.payloadId,providerId:this.providerId,
      providerDescriptorHash:descriptor.descriptorHash,transportId:this.transport.transportId,transportHash:this.transport.profileHash,
      classificationHash:reasoning.classification.classificationHash,privacyClass:reasoning.classification.privacyClass,
      responseFormat:request.responseFormat,payloadHash:reasoningPayloadHash(request),
      transportDecisionHash:decision.decisionHash,opaqueRelayAttestationHash:attestation.attestationHash,
      decisionDecidedAt:decidedAt
    });

    if(record.state==="completed"||record.state==="result-ready")return this.collect(record.requestId);
    if(record.state==="awaiting-reasoning"){
      record=await this.poll(record.requestId);
      if(record.state==="result-ready")return this.collect(record.requestId);
      return this.status(record);
    }
    if(record.state==="failed")throw new Error("durable reasoning request esta em estado failed: "+String(record.lastErrorCode??"unknown"));

    try{
      const result=await runVerifiedDurableOpaqueReasoning({
        providerRegistry:this.providerRegistry,capabilityRegistry:this.capabilityRegistry,providerId:this.providerId,
        transport:this.transport,adapter:this.adapter,reasoning,
        options:{...options,decidedAt}
      });
      const current=await this.store.get(record.requestId);
      record=await this.store.markCompleted(record.requestId,current.recordHash,{
        terminalResultHash:result.executionEvidence.resultHash,
        finalResultHash:result.resultHash,
        executionEvidenceHash:result.executionEvidence.evidenceHash
      });
      return Object.freeze({format:ARCA_DURABLE_REASONING_PENDING_STATUS_FORMAT,state:"completed",requestId:record.requestId,payloadId:record.payloadId,record:clean(record),result});
    }catch(error:any){
      if(error instanceof DurableOpaqueRpcPendingError){
        const current=await this.store.get(record.requestId);
        record=await this.store.markAwaiting(record.requestId,current.recordHash,error.submission);
        return this.status(record);
      }
      const current=await this.store.get(record.requestId);
      if(!["completed","result-ready"].includes(current.state))await this.store.markFailed(record.requestId,current.recordHash,"reasoning-start-failed").catch(()=>{});
      throw error;
    }
  }

  status(record:any){
    validateRecord(record);
    return Object.freeze({
      format:ARCA_DURABLE_REASONING_PENDING_STATUS_FORMAT,
      version:"1.0.0",
      state:record.state,
      requestId:record.requestId,
      payloadId:record.payloadId,
      providerId:record.providerId,
      readySequence:record.readySequence,
      readyPending:record.readyPending,
      terminalResultHash:record.terminalResultHash,
      finalResultHash:record.finalResultHash,
      executionEvidenceHash:record.executionEvidenceHash
    });
  }

  async getStatus(requestId:string){
    const record=await this.store.get(requestId);
    return this.status(record);
  }

  async poll(requestId:string){
    let record=await this.store.get(requestId);
    if(["completed","failed","result-ready"].includes(record.state))return record;
    const remote=await this.adapter.origin.status(requestId);
    if(remote.state==="completed"){
      record=await this.store.markReady(requestId,record.recordHash,remote.resultHash);
    }else if(remote.state==="waiting-reply"&&record.state==="registered"){
      record=await this.store.markAwaiting(requestId,record.recordHash,{requestPacketHash:remote.requestPacketHash});
    }
    return record;
  }

  async collect(requestId:string){
    let record=await this.store.get(requestId);
    this.verifyProvider();
    if(record.providerId!==this.providerId)throw new Error("durable reasoning pending provider divergente");
    const descriptor=this.providerRegistry.getDescriptor(this.providerId);
    if(!descriptor||descriptor.descriptorHash!==record.providerDescriptorHash)throw new Error("durable reasoning provider descriptor mudou");
    if(record.transportId!==this.transport.transportId||record.transportHash!==this.transport.profileHash)throw new Error("durable reasoning transport mudou");
    const terminal=await this.adapter.origin.collect(requestId,{payloadId:record.payloadId});
    if(!terminal)return this.status(record);
    if(record.state!=="result-ready"&&record.state!=="completed")record=await this.store.markReady(requestId,record.recordHash,terminal.resultHash);
    const validated=validateReasoningProviderResult(terminal.output,{requestId:record.requestId,payloadId:record.payloadId,maxOutputBytes:descriptor.maxOutputBytes});
    const evidence=createDurableOpaqueReasoningEvidence(terminal,{transportDecisionHash:record.transportDecisionHash,opaqueRelayAttestationHash:record.opaqueRelayAttestationHash});
    const reasoning=Object.freeze({
      format:ARCA_REASONING_RESULT_FORMAT,
      version:"1.0.0",
      requestId:record.requestId,
      payloadId:record.payloadId,
      providerId:record.providerId,
      providerDescriptorHash:record.providerDescriptorHash,
      transportId:record.transportId,
      transportDecisionHash:record.transportDecisionHash,
      payloadHash:record.payloadHash,
      status:"completed",
      responseFormat:record.responseFormat,
      output:validated.output,
      outputBytes:validated.outputBytes,
      outputPersisted:false,
      privacyReclassificationRequired:true,
      humanReviewRequired:true,
      coreMutationPerformed:false
    });
    const body={
      format:ARCA_VERIFIED_DURABLE_OPAQUE_REASONING_RESULT_FORMAT,
      version:"1.0.0",
      requestId:record.requestId,
      payloadId:record.payloadId,
      providerId:record.providerId,
      providerDescriptorHash:record.providerDescriptorHash,
      opaqueRelayAttestationHash:record.opaqueRelayAttestationHash,
      transportDecisionHash:record.transportDecisionHash,
      executionEvidenceHash:evidence.evidenceHash,
      humanReviewRequired:true,
      coreMutationPerformed:false,
      privacyReclassificationRequired:true,
      reasoning,
      executionEvidence:evidence
    };
    const result=Object.freeze({...body,resultHash:sha256(body)});
    if(record.state!=="completed"){
      const current=await this.store.get(requestId);
      record=await this.store.markCompleted(requestId,current.recordHash,{terminalResultHash:terminal.resultHash,finalResultHash:result.resultHash,executionEvidenceHash:evidence.evidenceHash});
    }
    return Object.freeze({format:ARCA_DURABLE_REASONING_PENDING_STATUS_FORMAT,version:"1.0.0",state:"completed",requestId:record.requestId,payloadId:record.payloadId,record:clean(record),result});
  }
}

export class DurableReasoningPendingRuntime{
  readonly coordinator:DurableReasoningPendingCoordinator;
  readonly intervalMs:number;
  readonly onReady?:((event:any)=>Promise<void>|void);
  readonly shouldHandle?:((record:any)=>Promise<boolean>|boolean);
  private timer:NodeJS.Timeout|null=null;
  private running=false;
  private chain=Promise.resolve();

  constructor(coordinator:DurableReasoningPendingCoordinator,{intervalMs=10_000,onReady,shouldHandle}:{intervalMs?:number;onReady?:(event:any)=>Promise<void>|void;shouldHandle?:(record:any)=>Promise<boolean>|boolean}={}){
    if(!(coordinator instanceof DurableReasoningPendingCoordinator))throw new TypeError("DurableReasoningPendingCoordinator obrigatorio");
    if(!Number.isSafeInteger(intervalMs)||intervalMs<1000||intervalMs>3_600_000)throw new RangeError("durable reasoning pending intervalMs invalido");
    if(shouldHandle!==undefined&&typeof shouldHandle!=="function")throw new TypeError("durable reasoning pending shouldHandle invalido");
    this.coordinator=coordinator;this.intervalMs=intervalMs;this.onReady=onReady;this.shouldHandle=shouldHandle;
  }
  private enqueue(task:()=>Promise<any>){const run=this.chain.then(task,task);this.chain=run.then(()=>undefined,()=>undefined);return run}
  async runOnce(){
    return this.enqueue(async()=>{
      const records=await this.coordinator.store.list({states:["registered","awaiting-reasoning","result-ready"]});
      const events=[];let ignored=0;
      for(let record of records){
        try{
          if(this.shouldHandle&&await this.shouldHandle(record)!==true){ignored+=1;continue}
          if(record.state!=="result-ready")record=await this.coordinator.poll(record.requestId);
          if(record.state==="result-ready"&&record.readyPending){
            const event=Object.freeze({
              format:"arca-durable-reasoning-ready-v1",requestId:record.requestId,payloadId:record.payloadId,
              providerId:record.providerId,readySequence:record.readySequence,idempotencyKey:`durable-reasoning:${record.requestId}:${record.readySequence}`,
              terminalResultHash:record.terminalResultHash
            });
            if(this.onReady){
              await this.onReady(event);
              record=await this.coordinator.store.ackReady(record.requestId,record.recordHash,record.readySequence);
            }
            events.push(event);
          }
        }catch(error:any){
          events.push({format:"arca-durable-reasoning-ready-error-v1",requestId:record.requestId,error:String(error?.message??error).slice(0,240)});
        }
      }
      return Object.freeze({format:ARCA_DURABLE_REASONING_PENDING_RUNTIME_FORMAT,version:"1.0.0",scanned:records.length,ignored,events});
    });
  }
  async start(){
    if(this.running)return;
    await this.coordinator.store.init();
    this.running=true;
    await this.runOnce();
    this.timer=setInterval(()=>{this.runOnce().catch(()=>{})},this.intervalMs);
    this.timer.unref?.();
  }
  async stop(){this.running=false;if(this.timer){clearInterval(this.timer);this.timer=null}await this.chain}
  status(){return Object.freeze({format:ARCA_DURABLE_REASONING_PENDING_RUNTIME_FORMAT,version:"1.0.0",running:this.running,intervalMs:this.intervalMs})}
}
