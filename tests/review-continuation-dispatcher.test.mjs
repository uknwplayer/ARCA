import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  HumanReviewQueue,
  ReviewGatedContinuation,
  ReviewContinuationStore,
  ReviewContinuationIntentStore,
  ReviewContinuationDispatcher
} from "../packages/agent/src/index.ts";

async function fixture(t,handlerImpl){
  const home=await mkdtemp(join(tmpdir(),"arca-continuation-dispatcher-"));
  const queue=new HumanReviewQueue(home);
  const pointerStore=new ReviewContinuationStore(home);
  const intentStore=new ReviewContinuationIntentStore(home);
  const gate=new ReviewGatedContinuation(queue,{continuationStore:pointerStore});
  const calls=[];
  const handler={id:"arca.test.resume",version:"1",handle:async context=>{calls.push(context);return handlerImpl?handlerImpl(context):{format:"arca-continuation-handler-result-v1",requestId:context.requestId,wakeSequence:context.wakeSequence,status:"completed",outcomeRef:"outcome:test"}}};
  const dispatcher=new ReviewContinuationDispatcher(pointerStore,[handler],{intentStore,consumerId:"dispatcher:test",leaseMs:5000});
  t.after(()=>rm(home,{recursive:true,force:true}));
  return {home,queue,pointerStore,intentStore,gate,dispatcher,calls};
}
function result(requestId,jobId=`job-${requestId}`){return {format:"arca-result-v1",protocolVersion:3,jobId,requestId,status:"completed",output:{humanReviewRequired:true}}}
async function makeWake(ctx,requestId){
  await ctx.gate.consumeResult(result(requestId),{execution:{jobId:`job-${requestId}`,action:"worker.ping"}});
  const item=(await ctx.queue.list()).find(entry=>entry.source?.requestId===requestId);assert.ok(item);
  await ctx.queue.resolve({reviewId:item.reviewId,reviewerId:"creator:primary",decision:"approve",reason:"autorizar continuation",expectedRecordHash:item.recordHash});
  const reconciled=await ctx.gate.reconcileRequest(requestId);
  assert.equal(reconciled.pointer.wake.pending,true);
  return reconciled.pointer;
}

test("registered closed-registry continuation dispatches once and acknowledges wake",async t=>{
  const ctx=await fixture(t);const requestId="req-dispatch-1";await makeWake(ctx,requestId);
  await ctx.dispatcher.registerIntent({requestId,handlerId:"arca.test.resume",contextRef:"state:alpha"});
  const dispatched=await ctx.dispatcher.dispatchRequest(requestId);
  assert.equal(dispatched.status,"completed");assert.equal(dispatched.replayed,false);assert.equal(ctx.calls.length,1);
  assert.equal(ctx.calls[0].requestId,requestId);assert.equal(ctx.calls[0].wakeSequence,1);assert.equal(ctx.calls[0].idempotencyKey,`review-continuation:${requestId}:1`);assert.equal(ctx.calls[0].contextRef,"state:alpha");
  const pointer=await ctx.pointerStore.get(requestId);assert.equal(pointer.wake.pending,false);assert.equal(pointer.wake.acknowledgedBy,"dispatcher:test");
  const intent=await ctx.intentStore.get(requestId);assert.equal(intent.lastCompletedWakeSequence,1);assert.equal(intent.lastOutcomeRef,"outcome:test");
  const again=await ctx.dispatcher.dispatchRequest(requestId);assert.equal(again.status,"skipped");assert.equal(again.reason,"no-pending-wake");assert.equal(ctx.calls.length,1);
});

test("pending wake without a registered intent is never executed or acknowledged",async t=>{
  const ctx=await fixture(t);const requestId="req-no-intent";await makeWake(ctx,requestId);
  const value=await ctx.dispatcher.dispatchRequest(requestId);assert.equal(value.status,"skipped");assert.equal(value.reason,"no-registered-intent");assert.equal(ctx.calls.length,0);
  assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,true);
});

test("handler registry is closed and descriptor cannot be changed after registration",async t=>{
  const ctx=await fixture(t);
  await assert.rejects(()=>ctx.dispatcher.registerIntent({requestId:"req-unknown",handlerId:"shell.execute"}),/fora do Continuation Action Registry/);
  await ctx.dispatcher.registerIntent({requestId:"req-fixed",handlerId:"arca.test.resume",contextRef:"state:one"});
  await assert.rejects(()=>ctx.dispatcher.registerIntent({requestId:"req-fixed",handlerId:"arca.test.resume",contextRef:"state:two"}),/descriptor divergente/);
});

test("handler failure leaves wake pending and a later retry keeps the same idempotency key",async t=>{
  let attempts=0;const ctx=await fixture(t,async context=>{attempts++;if(attempts===1)throw new Error("synthetic handler failure");return {format:"arca-continuation-handler-result-v1",requestId:context.requestId,wakeSequence:context.wakeSequence,status:"completed"}});
  const requestId="req-retry";await makeWake(ctx,requestId);await ctx.dispatcher.registerIntent({requestId,handlerId:"arca.test.resume"});
  await assert.rejects(()=>ctx.dispatcher.dispatchRequest(requestId),/synthetic handler failure/);assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,true);assert.equal((await ctx.intentStore.get(requestId)).dispatch.status,"failed");
  const second=await ctx.dispatcher.dispatchRequest(requestId);assert.equal(second.status,"completed");assert.equal(ctx.calls.length,2);assert.equal(ctx.calls[0].idempotencyKey,ctx.calls[1].idempotencyKey);assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
});

test("completed intent plus unacknowledged pointer recovers without replaying handler",async t=>{
  const ctx=await fixture(t);const requestId="req-ack-recovery";const pointer=await makeWake(ctx,requestId);let intent=await ctx.dispatcher.registerIntent({requestId,handlerId:"arca.test.resume"});
  intent=await ctx.intentStore.claim({requestId,wakeSequence:pointer.wake.sequence,consumerId:"dispatcher:test",leaseMs:5000,expectedRecordHash:intent.recordHash});
  await ctx.intentStore.complete({requestId,wakeSequence:pointer.wake.sequence,consumerId:"dispatcher:test",expectedRecordHash:intent.recordHash,outcomeRef:"outcome:already-done"});
  assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,true);
  const recovered=await ctx.dispatcher.dispatchRequest(requestId);assert.equal(recovered.status,"completed");assert.equal(recovered.reason,"already-dispatched-wake-acknowledged");assert.equal(ctx.calls.length,0);assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
});

test("deferred handler and bounded scan keep wake durable for later work",async t=>{
  const ctx=await fixture(t,async context=>({format:"arca-continuation-handler-result-v1",requestId:context.requestId,wakeSequence:context.wakeSequence,status:"deferred"}));const requestId="req-deferred";await makeWake(ctx,requestId);await ctx.dispatcher.registerIntent({requestId,handlerId:"arca.test.resume"});
  const scan=await ctx.dispatcher.dispatchPending({limit:10});assert.equal(scan.scanned,1);assert.equal(scan.results[0].status,"deferred");assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,true);assert.equal((await ctx.intentStore.get(requestId)).dispatch.lastErrorCode,"handler-deferred");
});
