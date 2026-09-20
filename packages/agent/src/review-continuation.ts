import {HumanReviewQueue} from "./reviews.ts";
import {materializeMachineBridgeReviews} from "./review-importer.ts";
import {ReviewContinuationStore,hashContinuationDescriptor,type ReviewContinuationExecutionRef} from "./review-continuation-store.ts";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,200}$/;
const TERMINAL_GATE_STATES=new Set(["authorized-to-continue","blocked","needs-more-information","manual-policy-required","execution-failed","correlation-required"]);

export type ReviewGateState=
  | "authorized-to-continue"
  | "awaiting-human-review"
  | "blocked"
  | "needs-more-information"
  | "manual-policy-required"
  | "execution-failed"
  | "correlation-required";

export type ReviewGateSnapshot={
  format:"arca-review-gate-v1";
  requestId:string|null;
  jobId:string|null;
  executed:boolean;
  authorizedToContinue:boolean;
  state:ReviewGateState;
  reason:string;
  reviewIds:string[];
  pendingReviewIds:string[];
  decisions:Array<{reviewId:string;status:string;decision:string|null}>;
};

export type ReviewGatedContinuationOptions={
  allowAcknowledge?:boolean;
  defaultPollIntervalMs?:number;
  defaultWaitTimeoutMs?:number;
  continuationStore?:ReviewContinuationStore;
};

function safeId(value:unknown,label:string,{required=true}:{required?:boolean}={}){
  if((value===undefined||value===null||value==="")&&!required)return null;
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error(`${label} invalido`);
  return value;
}
function positiveInteger(value:number,label:string,{min=10,max=300_000}:{min?:number;max?:number}={}){if(!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError(`${label} invalido`);return value}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
function sourceRequestId(item:any){return typeof item?.source?.requestId==="string"?item.source.requestId:null}
function decisionOf(item:any){return typeof item?.resolution?.decision==="string"?item.resolution.decision:null}
function executionFromJob(job:any):ReviewContinuationExecutionRef{
  const jobId=typeof job?.jobId==="string"?job.jobId:null;
  const action=typeof job?.action==="string"?job.action:null;
  const descriptorHash=hashContinuationDescriptor({jobId,requestId:job?.requestId??null,action,requires:Array.isArray(job?.requires)?job.requires:[],workerTarget:job?.workerTarget??null,params:job?.params??null});
  return {jobId,action,descriptorHash};
}

export class ReviewGatedContinuation{
  readonly queue:HumanReviewQueue;
  readonly continuationStore:ReviewContinuationStore;
  readonly allowAcknowledge:boolean;
  readonly defaultPollIntervalMs:number;
  readonly defaultWaitTimeoutMs:number;

  constructor(queue:HumanReviewQueue,options:ReviewGatedContinuationOptions={}){
    if(!(queue instanceof HumanReviewQueue))throw new TypeError("HumanReviewQueue obrigatoria");
    this.queue=queue;
    this.continuationStore=options.continuationStore??new ReviewContinuationStore(queue.home);
    if(!(this.continuationStore instanceof ReviewContinuationStore))throw new TypeError("ReviewContinuationStore invalido");
    this.allowAcknowledge=options.allowAcknowledge===true;
    this.defaultPollIntervalMs=positiveInteger(options.defaultPollIntervalMs??1000,"defaultPollIntervalMs",{min:10,max:60_000});
    this.defaultWaitTimeoutMs=positiveInteger(options.defaultWaitTimeoutMs??30_000,"defaultWaitTimeoutMs",{min:10,max:300_000});
  }

  private snapshotForReviews(requestId:string,items:any[],jobId:string|null=null):ReviewGateSnapshot{
    const relevant=items.filter(item=>sourceRequestId(item)===requestId);
    const reviewIds=relevant.map(item=>String(item.reviewId)).sort();
    const pending=relevant.filter(item=>item.status==="pending");
    const decisions=relevant.map(item=>({reviewId:String(item.reviewId),status:String(item.status),decision:decisionOf(item)})).sort((a,b)=>a.reviewId.localeCompare(b.reviewId));

    if(!relevant.length)return {format:"arca-review-gate-v1",requestId,jobId,executed:true,authorizedToContinue:true,state:"authorized-to-continue",reason:"nenhuma barreira humana foi materializada para o requestId",reviewIds,pendingReviewIds:[],decisions};
    if(pending.length)return {format:"arca-review-gate-v1",requestId,jobId,executed:true,authorizedToContinue:false,state:"awaiting-human-review",reason:"existem revisoes humanas pendentes",reviewIds,pendingReviewIds:pending.map(item=>String(item.reviewId)).sort(),decisions};
    if(relevant.some(item=>item.status==="dismissed"||decisionOf(item)==="reject"))return {format:"arca-review-gate-v1",requestId,jobId,executed:true,authorizedToContinue:false,state:"blocked",reason:"ao menos uma revisao humana rejeitou o uso substantivo do resultado",reviewIds,pendingReviewIds:[],decisions};
    if(relevant.some(item=>decisionOf(item)==="needs-more-information"))return {format:"arca-review-gate-v1",requestId,jobId,executed:true,authorizedToContinue:false,state:"needs-more-information",reason:"a revisao humana exige informacao adicional antes da continuacao",reviewIds,pendingReviewIds:[],decisions};
    if(relevant.some(item=>decisionOf(item)==="acknowledge")&&!this.allowAcknowledge)return {format:"arca-review-gate-v1",requestId,jobId,executed:true,authorizedToContinue:false,state:"manual-policy-required",reason:"acknowledge encerra a revisao, mas nao equivale a aprovacao substantiva na politica padrao",reviewIds,pendingReviewIds:[],decisions};
    const allowedDecisions=this.allowAcknowledge?new Set(["approve","acknowledge"]):new Set(["approve"]);
    if(relevant.every(item=>item.status==="resolved"&&allowedDecisions.has(decisionOf(item))))return {format:"arca-review-gate-v1",requestId,jobId,executed:true,authorizedToContinue:true,state:"authorized-to-continue",reason:"todas as barreiras humanas foram resolvidas por decisoes autorizadoras",reviewIds,pendingReviewIds:[],decisions};
    return {format:"arca-review-gate-v1",requestId,jobId,executed:true,authorizedToContinue:false,state:"manual-policy-required",reason:"revisoes encerradas nao satisfazem a politica automatica de continuacao",reviewIds,pendingReviewIds:[],decisions};
  }

  async status(requestIdInput:string,{jobId=null}:{jobId?:string|null}={}):Promise<ReviewGateSnapshot>{
    const requestId=safeId(requestIdInput,"requestId")!;
    const normalizedJobId=safeId(jobId,"jobId",{required:false});
    const items=await this.queue.list();
    return this.snapshotForReviews(requestId,items,normalizedJobId);
  }

  async reconcileRequest(requestIdInput:string,{jobId=null,execution=null}:{jobId?:string|null;execution?:ReviewContinuationExecutionRef|null}={}){
    const requestId=safeId(requestIdInput,"requestId")!;const snapshot=await this.status(requestId,{jobId});const existing=await this.continuationStore.getIfExists(requestId);
    if(!existing&&!snapshot.reviewIds.length)return {gate:snapshot,pointer:null};
    const pointer=await this.continuationStore.reconcile(snapshot,{requestId,execution:execution??(jobId?{jobId}:null)});return {gate:snapshot,pointer};
  }

  async consumeResult(result:any,{execution=null}:{execution?:ReviewContinuationExecutionRef|null}={}):Promise<ReviewGateSnapshot>{
    if(!result||typeof result!=="object"||Array.isArray(result))throw new TypeError("resultado Machine Bridge invalido");
    const jobId=safeId(result.jobId,"jobId",{required:false});
    const requestId=safeId(result.requestId,"requestId",{required:false});
    if(result.status!=="completed")return {format:"arca-review-gate-v1",requestId,jobId,executed:false,authorizedToContinue:false,state:"execution-failed",reason:`execucao tecnica nao concluida: ${String(result.status??"<missing>")}`,reviewIds:[],pendingReviewIds:[],decisions:[]};
    if(!requestId)return {format:"arca-review-gate-v1",requestId:null,jobId,executed:true,authorizedToContinue:false,state:"correlation-required",reason:"resultado concluido sem requestId nao pode ser retomado de forma duravel",reviewIds:[],pendingReviewIds:[],decisions:[]};
    await materializeMachineBridgeReviews(this.queue,result);
    const snapshot=await this.status(requestId,{jobId});
    if(snapshot.reviewIds.length)await this.continuationStore.reconcile(snapshot,{requestId,execution:execution??(jobId?{jobId}:null)});
    return snapshot;
  }

  async call(client:{call:(job:any,options?:any)=>Promise<any>},job:any,options?:any):Promise<{format:"arca-review-gated-call-v1";requestId:string;executionResult:any;gate:ReviewGateSnapshot}>{
    if(!client||typeof client.call!=="function")throw new TypeError("client.call obrigatorio");
    const requestId=safeId(job?.requestId,"job.requestId")!;
    const executionResult=await client.call(job,options);
    if(executionResult?.requestId!==requestId)throw new Error("Review-Gated Continuation detectou requestId divergente no resultado");
    const gate=await this.consumeResult(executionResult,{execution:executionFromJob(job)});
    return {format:"arca-review-gated-call-v1",requestId,executionResult,gate};
  }

  async waitForDecision(requestIdInput:string,{timeoutMs=this.defaultWaitTimeoutMs,pollIntervalMs=this.defaultPollIntervalMs}:{timeoutMs?:number;pollIntervalMs?:number}={}):Promise<ReviewGateSnapshot>{
    const requestId=safeId(requestIdInput,"requestId")!;
    const timeout=positiveInteger(timeoutMs,"timeoutMs",{min:10,max:300_000});
    const poll=positiveInteger(pollIntervalMs,"pollIntervalMs",{min:10,max:60_000});
    const deadline=Date.now()+timeout;
    while(true){
      const snapshot=await this.status(requestId);
      if(TERMINAL_GATE_STATES.has(snapshot.state))return snapshot;
      if(Date.now()>=deadline)throw new Error(`timeout aguardando decisao humana para ${requestId}`);
      await sleep(Math.min(poll,Math.max(1,deadline-Date.now())));
    }
  }
}
