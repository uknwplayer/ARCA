import {HumanReviewQueue} from "./reviews.ts";
import {ReviewContinuationStore} from "./review-continuation-store.ts";
import {ReviewContinuationWakeController,type ReviewWakeEvent} from "./review-wakeup-controller.ts";
import {ReviewContinuationDispatcher,ReviewContinuationIntentStore,type ContinuationHandler,type ContinuationIntentInput} from "./review-continuation-dispatcher.ts";

export const REVIEW_AUTONOMY_RUNTIME_VERSION="0.1.0";

type RuntimeOptions={
  pointerStore?:ReviewContinuationStore;
  intentStore?:ReviewContinuationIntentStore;
  consumerId?:string;
  leaseMs?:number;
  wakeRecoveryIntervalMs?:number;
  wakeDebounceMs?:number;
  dispatchRecoveryIntervalMs?:number;
  dispatchBatchLimit?:number;
  onWake?:(event:ReviewWakeEvent)=>Promise<void>|void;
  onDispatch?:(result:any)=>Promise<void>|void;
};

function integer(value:number,label:string,{min,max}:{min:number;max:number}){if(!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError(`${label} invalido`);return value}

export class ReviewAutonomyRuntime{
  readonly queue:HumanReviewQueue;
  readonly pointerStore:ReviewContinuationStore;
  readonly intentStore:ReviewContinuationIntentStore;
  readonly dispatcher:ReviewContinuationDispatcher;
  readonly wakeController:ReviewContinuationWakeController;
  readonly dispatchRecoveryIntervalMs:number;
  readonly dispatchBatchLimit:number;
  readonly onDispatch:RuntimeOptions["onDispatch"];
  private dispatchTimer:NodeJS.Timeout|null=null;
  private chain=Promise.resolve();
  private running=false;

  constructor(queue:HumanReviewQueue,handlers:ContinuationHandler[],options:RuntimeOptions={}){
    if(!(queue instanceof HumanReviewQueue))throw new TypeError("HumanReviewQueue obrigatoria");
    this.queue=queue;
    this.pointerStore=options.pointerStore??new ReviewContinuationStore(queue.home);
    this.intentStore=options.intentStore??new ReviewContinuationIntentStore(queue.home);
    this.dispatcher=new ReviewContinuationDispatcher(this.pointerStore,handlers,{intentStore:this.intentStore,consumerId:options.consumerId,leaseMs:options.leaseMs});
    this.dispatchRecoveryIntervalMs=integer(options.dispatchRecoveryIntervalMs??15_000,"dispatchRecoveryIntervalMs",{min:1000,max:3_600_000});
    this.dispatchBatchLimit=integer(options.dispatchBatchLimit??100,"dispatchBatchLimit",{min:1,max:500});
    this.onDispatch=options.onDispatch;
    this.wakeController=new ReviewContinuationWakeController(queue,{store:this.pointerStore,recoveryIntervalMs:options.wakeRecoveryIntervalMs,debounceMs:options.wakeDebounceMs,onWake:async event=>{await options.onWake?.(event);await this.enqueueRequest(event.requestId)}});
  }

  async registerIntent(input:ContinuationIntentInput){return this.dispatcher.registerIntent(input)}

  private enqueue(task:()=>Promise<any>){
    const run=this.chain.then(task,task);
    this.chain=run.then(()=>undefined,()=>undefined);
    return run;
  }

  private async emit(result:any){await this.onDispatch?.(result);return result}

  private enqueueRequest(requestId:string){return this.enqueue(async()=>this.emit(await this.dispatcher.dispatchRequest(requestId)))}

  private enqueueRecovery(){return this.enqueue(async()=>this.emit(await this.dispatcher.dispatchPending({limit:this.dispatchBatchLimit})))}

  private async pendingRequestIds(){
    const pointers=(await this.pointerStore.list({wakePending:true})).slice(0,this.dispatchBatchLimit);
    return [...new Set(pointers.map(pointer=>String(pointer.requestId)))];
  }

  private enqueueRecoveryFor(requestIds:string[]){
    const ids=[...new Set(requestIds)].slice(0,this.dispatchBatchLimit);
    return this.enqueue(async()=>{
      const results=[];
      for(const requestId of ids){
        try{results.push(await this.dispatcher.dispatchRequest(requestId))}
        catch(error:any){results.push({format:"arca-continuation-dispatch-v1",requestId,status:"failed",reason:String(error?.message??error)})}
      }
      return this.emit({format:"arca-continuation-dispatch-scan-v1",scanned:ids.length,results});
    });
  }

  async runOnce(){
    await this.queue.init();await this.pointerStore.init();await this.intentStore.init();
    // Capture recovery work before review reconciliation. A newly-created wake gets
    // exactly one immediate event-driven attempt in this cycle; if that attempt
    // fails, the durable wake is retried only by a later recovery cycle.
    const recoveryIds=await this.pendingRequestIds();
    const wakes=await this.wakeController.runOnce();
    const dispatch=await this.enqueueRecoveryFor(recoveryIds);
    return {format:"arca-review-autonomy-scan-v1",wakes,dispatch};
  }

  async start(){
    if(this.running)return;
    await this.queue.init();await this.pointerStore.init();await this.intentStore.init();
    const recoveryIds=await this.pendingRequestIds();
    this.running=true;
    try{
      await this.wakeController.start();
      await this.enqueueRecoveryFor(recoveryIds);
      this.dispatchTimer=setInterval(()=>{this.enqueueRecovery().catch(()=>{})},this.dispatchRecoveryIntervalMs);
      this.dispatchTimer.unref?.();
    }catch(error){this.running=false;await this.wakeController.stop().catch(()=>{});throw error}
  }

  async stop(){
    this.running=false;
    if(this.dispatchTimer){clearInterval(this.dispatchTimer);this.dispatchTimer=null}
    await this.wakeController.stop();
    await this.chain;
  }

  status(){return Object.freeze({format:"arca-review-autonomy-runtime-v1",version:REVIEW_AUTONOMY_RUNTIME_VERSION,running:this.running,dispatchRecoveryIntervalMs:this.dispatchRecoveryIntervalMs,dispatchBatchLimit:this.dispatchBatchLimit,consumerId:this.dispatcher.consumerId})}
}
