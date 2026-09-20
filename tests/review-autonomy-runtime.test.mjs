import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  HumanReviewQueue,
  ReviewGatedContinuation,
  ReviewAutonomyRuntime
} from "../packages/agent/src/index.ts";

async function fixture(t,{handler}={}){
  const home=await mkdtemp(join(tmpdir(),"arca-review-autonomy-"));
  const queue=new HumanReviewQueue(home);const calls=[];const dispatchEvents=[];
  const runtime=new ReviewAutonomyRuntime(queue,[{id:"arca.test.resume",version:"1",handle:async context=>{calls.push(context);return handler?handler(context):{format:"arca-continuation-handler-result-v1",requestId:context.requestId,wakeSequence:context.wakeSequence,status:"completed"}}}],{consumerId:"runtime:test",wakeRecoveryIntervalMs:1000,wakeDebounceMs:10,dispatchRecoveryIntervalMs:1000,dispatchBatchLimit:20,onDispatch:value=>dispatchEvents.push(value)});
  const gate=new ReviewGatedContinuation(queue,{continuationStore:runtime.pointerStore});
  t.after(async()=>{await runtime.stop().catch(()=>{});await rm(home,{recursive:true,force:true})});
  return {home,queue,runtime,gate,calls,dispatchEvents};
}
function result(requestId){return {format:"arca-result-v1",protocolVersion:3,jobId:`job-${requestId}`,requestId,status:"completed",output:{humanReviewRequired:true}}}
async function createBarrier(ctx,requestId){
  const gate=await ctx.gate.consumeResult(result(requestId),{execution:{jobId:`job-${requestId}`,action:"worker.ping"}});assert.equal(gate.state,"awaiting-human-review");const review=(await ctx.queue.list()).find(item=>item.source?.requestId===requestId);assert.ok(review);return review;
}
async function approve(ctx,review){return ctx.queue.resolve({reviewId:review.reviewId,reviewerId:"creator:primary",decision:"approve",reason:"continuar",expectedRecordHash:review.recordHash})}

test("runtime startup recovers approved review and dispatches without original caller",async t=>{
  const ctx=await fixture(t);const requestId="req-runtime-start";const review=await createBarrier(ctx,requestId);await ctx.runtime.registerIntent({requestId,handlerId:"arca.test.resume",contextRef:"state:runtime"});await approve(ctx,review);
  await ctx.runtime.start();
  assert.equal(ctx.calls.length,1);assert.equal(ctx.calls[0].requestId,requestId);assert.equal(ctx.calls[0].contextRef,"state:runtime");assert.equal((await ctx.runtime.pointerStore.get(requestId)).wake.pending,false);assert.equal((await ctx.runtime.intentStore.get(requestId)).lastCompletedWakeSequence,1);assert.equal(ctx.runtime.status().running,true);
});

test("runOnce reconciles review state and recovery-scans pending dispatches",async t=>{
  const ctx=await fixture(t);const requestId="req-runtime-once";const review=await createBarrier(ctx,requestId);await ctx.runtime.registerIntent({requestId,handlerId:"arca.test.resume"});await approve(ctx,review);
  const scan=await ctx.runtime.runOnce();
  assert.equal(scan.format,"arca-review-autonomy-scan-v1");assert.equal(ctx.calls.length,1);assert.equal((await ctx.runtime.pointerStore.get(requestId)).wake.pending,false);
});

test("runtime never invents continuation intent",async t=>{
  const ctx=await fixture(t);const requestId="req-runtime-no-intent";const review=await createBarrier(ctx,requestId);await approve(ctx,review);
  await ctx.runtime.runOnce();
  const pointer=await ctx.runtime.pointerStore.get(requestId);assert.equal(pointer.wake.pending,true);assert.equal(ctx.calls.length,0);assert.ok(ctx.dispatchEvents.some(event=>event?.results?.some?.(item=>item.reason==="no-registered-intent"))||ctx.dispatchEvents.some(event=>event?.reason==="no-registered-intent"));
});

test("failed event-driven attempt remains durable and retries only on a later recovery cycle",async t=>{
  let attempts=0;const ctx=await fixture(t,{handler:async context=>{attempts++;if(attempts===1)throw new Error("temporary outage");return {format:"arca-continuation-handler-result-v1",requestId:context.requestId,wakeSequence:context.wakeSequence,status:"completed"}}});const requestId="req-runtime-retry";const review=await createBarrier(ctx,requestId);await ctx.runtime.registerIntent({requestId,handlerId:"arca.test.resume"});await approve(ctx,review);
  const first=await ctx.runtime.runOnce();assert.equal(attempts,1);assert.equal(first.dispatch.scanned,0);assert.equal((await ctx.runtime.pointerStore.get(requestId)).wake.pending,true);assert.equal((await ctx.runtime.intentStore.get(requestId)).dispatch.status,"failed");
  const second=await ctx.runtime.runOnce();assert.equal(attempts,2);assert.equal((await ctx.runtime.pointerStore.get(requestId)).wake.pending,false);assert.ok(second.dispatch.results.some(item=>item.status==="completed"));
});

test("runtime status exposes only operational metadata",async t=>{
  const ctx=await fixture(t);const status=ctx.runtime.status();assert.deepEqual(status,{format:"arca-review-autonomy-runtime-v1",version:"0.1.0",running:false,dispatchRecoveryIntervalMs:1000,dispatchBatchLimit:20,consumerId:"runtime:test"});
});
