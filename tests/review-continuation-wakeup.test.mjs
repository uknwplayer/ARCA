import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {HumanReviewQueue,ReviewGatedContinuation,ReviewContinuationStore,ReviewContinuationWakeController} from "../packages/agent/src/index.ts";

async function fixture(t){
  const home=await mkdtemp(join(tmpdir(),"arca-review-wakeup-"));
  const queue=new HumanReviewQueue(home);const store=new ReviewContinuationStore(home);const gate=new ReviewGatedContinuation(queue,{continuationStore:store,defaultPollIntervalMs:10,defaultWaitTimeoutMs:500});const wakes=[];const controller=new ReviewContinuationWakeController(queue,{gate,store,recoveryIntervalMs:1000,debounceMs:10,onWake:event=>wakes.push(event)});
  t.after(async()=>{await controller.stop();await rm(home,{recursive:true,force:true})});return {home,queue,store,gate,controller,wakes};
}
function result({requestId="req-wake-1",jobId="job-wake-1",output={humanReviewRequired:true}}={}){return {format:"arca-result-v1",protocolVersion:3,jobId,requestId,status:"completed",output}}
async function reviewFor(queue,requestId){const item=(await queue.list()).find(item=>item.source?.requestId===requestId);assert.ok(item);return item}
async function resolve(queue,item,decision){return queue.resolve({reviewId:item.reviewId,reviewerId:"creator:primary",decision,reason:`decision:${decision}`,expectedRecordHash:item.recordHash})}
async function until(fn,{timeout=500,interval=10}={}){const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,interval))}throw new Error("timeout")}

test("pending review creates durable pointer and approval creates exactly one wake",async(t)=>{
  const {queue,store,gate,controller,wakes}=await fixture(t);
  const snapshot=await gate.consumeResult(result({requestId:"req-ready",jobId:"job-ready"}));assert.equal(snapshot.state,"awaiting-human-review");
  let pointer=await store.get("req-ready");assert.equal(pointer.gateState,"awaiting-human-review");assert.equal(pointer.wake.pending,false);assert.equal(pointer.wake.sequence,0);
  const item=await reviewFor(queue,"req-ready");await resolve(queue,item,"approve");const scan=await controller.runOnce();assert.equal(scan.wakes.length,1);assert.equal(wakes.length,1);
  pointer=await store.get("req-ready");assert.equal(pointer.gateState,"authorized-to-continue");assert.equal(pointer.authorizedToContinue,true);assert.equal(pointer.wake.pending,true);assert.equal(pointer.wake.sequence,1);
  const second=await controller.runOnce();assert.equal(second.wakes.length,0);assert.equal((await store.get("req-ready")).wake.sequence,1);
});

test("wake acknowledgement uses optimistic concurrency and is durable",async(t)=>{
  const {queue,store,gate,controller}=await fixture(t);await gate.consumeResult(result({requestId:"req-ack-wake",jobId:"job-ack-wake"}));await resolve(queue,await reviewFor(queue,"req-ack-wake"),"approve");await controller.runOnce();
  const ready=await store.get("req-ack-wake");await assert.rejects(()=>store.acknowledgeWake({requestId:"req-ack-wake",consumerId:"orchestrator-1",expectedRecordHash:"0".repeat(64)}),/Conflito/);
  const acked=await store.acknowledgeWake({requestId:"req-ack-wake",consumerId:"orchestrator-1",expectedRecordHash:ready.recordHash});assert.equal(acked.wake.pending,false);assert.equal(acked.wake.acknowledgedBy,"orchestrator-1");assert.ok(acked.wake.acknowledgedAt);
});

test("reject and needs-more-information update pointer but never create wake",async(t)=>{
  for(const decision of ["reject","needs-more-information"]){const f=await fixture(t);const requestId=`req-${decision}`;await f.gate.consumeResult(result({requestId,jobId:`job-${decision}`}));await resolve(f.queue,await reviewFor(f.queue,requestId),decision);const scan=await f.controller.runOnce();assert.equal(scan.wakes.length,0);const pointer=await f.store.get(requestId);assert.equal(pointer.wake.pending,false);assert.equal(pointer.authorizedToContinue,false);assert.equal(pointer.gateState,decision==="reject"?"blocked":"needs-more-information")}
});

test("execution descriptor is hashed and raw params are not persisted",async(t)=>{
  const {home,store,gate}=await fixture(t);const secret="nao-persistir-este-parametro";const client={call:async job=>result({requestId:job.requestId,jobId:job.jobId})};await gate.call(client,{jobId:"job-private",requestId:"req-private",action:"worker.ping",params:{echo:secret},requires:[]});const pointer=await store.get("req-private");assert.equal(pointer.executionRefs[0].action,"worker.ping");assert.match(pointer.executionRefs[0].descriptorHash,/^[a-f0-9]{64}$/);const raw=await readFile(join(home,"review-continuations","pointers","req-private.json"),"utf8");assert.equal(raw.includes(secret),false);
});

test("filesystem watcher wakes continuation after review resolution without polling caller",async(t)=>{
  const {queue,store,gate,controller}=await fixture(t);await gate.consumeResult(result({requestId:"req-watch",jobId:"job-watch"}));await controller.start();await resolve(queue,await reviewFor(queue,"req-watch"),"approve");const pointer=await until(async()=>{const value=await store.get("req-watch");return value.wake.pending?value:null},{timeout:800});assert.equal(pointer.gateState,"authorized-to-continue");assert.equal(pointer.wake.sequence,1);
});
