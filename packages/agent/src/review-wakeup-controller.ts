import {watch,type FSWatcher} from "node:fs";
import {HumanReviewQueue} from "./reviews.ts";
import {ReviewGatedContinuation} from "./review-continuation.ts";
import {ReviewContinuationStore} from "./review-continuation-store.ts";

export const REVIEW_WAKE_CONTROLLER_VERSION="0.1.0";

export type ReviewWakeEvent={
  format:"arca-review-wake-v1";
  requestId:string;
  sequence:number;
  readyAt:string|null;
  pointerHash:string;
};

export type ReviewWakeControllerOptions={
  gate?:ReviewGatedContinuation;
  store?:ReviewContinuationStore;
  recoveryIntervalMs?:number;
  debounceMs?:number;
  onWake?:(event:ReviewWakeEvent)=>Promise<void>|void;
};

function integer(value:number,label:string,{min,max}:{min:number;max:number}){if(!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError(`${label} invalido`);return value}

export class ReviewContinuationWakeController{
  readonly queue:HumanReviewQueue;
  readonly gate:ReviewGatedContinuation;
  readonly store:ReviewContinuationStore;
  readonly recoveryIntervalMs:number;
  readonly debounceMs:number;
  readonly onWake:ReviewWakeControllerOptions["onWake"];
  private watcher:FSWatcher|null=null;
  private timer:NodeJS.Timeout|null=null;
  private debounceTimer:NodeJS.Timeout|null=null;
  private running=false;
  private runChain=Promise.resolve();

  constructor(queue:HumanReviewQueue,options:ReviewWakeControllerOptions={}){
    if(!(queue instanceof HumanReviewQueue))throw new TypeError("HumanReviewQueue obrigatoria");
    this.queue=queue;
    this.store=options.store??new ReviewContinuationStore(queue.home);
    this.gate=options.gate??new ReviewGatedContinuation(queue,{continuationStore:this.store});
    if(!(this.store instanceof ReviewContinuationStore))throw new TypeError("ReviewContinuationStore invalido");
    if(!(this.gate instanceof ReviewGatedContinuation))throw new TypeError("ReviewGatedContinuation invalido");
    this.recoveryIntervalMs=integer(options.recoveryIntervalMs??30_000,"recoveryIntervalMs",{min:1000,max:3_600_000});
    this.debounceMs=integer(options.debounceMs??50,"debounceMs",{min:10,max:10_000});
    this.onWake=options.onWake;
  }

  async runOnce(){
    const pointers=await this.store.list();const transitions:ReviewWakeEvent[]=[];
    for(const before of pointers){
      const requestId=String(before.requestId);const result=await this.gate.reconcileRequest(requestId);const after=result.pointer;if(!after)continue;
      const newlyReady=after.wake?.pending===true&&(before.wake?.pending!==true||after.wake.sequence!==before.wake.sequence);
      if(newlyReady){const event:ReviewWakeEvent={format:"arca-review-wake-v1",requestId,sequence:Number(after.wake.sequence),readyAt:after.wake.readyAt??null,pointerHash:String(after.recordHash)};transitions.push(event);try{await this.onWake?.(event)}catch{/* durable pointer remains pending for recovery */}}
    }
    return {format:"arca-review-wake-scan-v1",scanned:pointers.length,wakes:transitions};
  }

  private schedule(){
    if(this.debounceTimer)clearTimeout(this.debounceTimer);
    this.debounceTimer=setTimeout(()=>{this.debounceTimer=null;this.runChain=this.runChain.then(()=>this.runOnce()).then(()=>undefined,()=>undefined)},this.debounceMs);
  }

  async start(){
    if(this.running)return;await this.queue.init();await this.store.init();await this.runOnce();
    this.watcher=watch(this.queue.itemsRoot,{persistent:true},()=>this.schedule());
    this.watcher.on("error",()=>this.schedule());
    this.timer=setInterval(()=>this.schedule(),this.recoveryIntervalMs);
    this.timer.unref?.();this.running=true;
  }

  async stop(){
    this.running=false;if(this.debounceTimer){clearTimeout(this.debounceTimer);this.debounceTimer=null}if(this.timer){clearInterval(this.timer);this.timer=null}this.watcher?.close();this.watcher=null;await this.runChain;
  }
}
