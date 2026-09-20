import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  HumanReviewQueue,
  ReviewContinuationStore,
  ReviewGatedContinuation,
  ReviewAutonomyRuntime,
  MachineBridgeContinuationPlanStore,
  MachineBridgeContinuationCoordinator
} from "../packages/agent/src/index.ts";

class FakeRecoverableClient{
  constructor(){this.results=new Map();this.jobs=new Map();this.submitCalls=[];this.waitCalls=[];this.failSubmitCount=0;this.resultFactory=null;this.transport={getResult:async jobId=>this.results.has(jobId)?{result:this.results.get(jobId)}:null}}
  async submit(job){this.submitCalls.push(structuredClone(job));if(this.failSubmitCount>0){this.failSubmitCount--;throw new Error("temporary transport outage")}if(this.jobs.has(job.jobId))throw new Error(`job already exists: ${job.jobId}`);this.jobs.set(job.jobId,structuredClone(job));return {jobId:job.jobId,requestId:job.requestId}}
  async waitForResult(job){this.waitCalls.push(job.jobId);if(this.results.has(job.jobId))return this.results.get(job.jobId);const result=this.resultFactory?await this.resultFactory(structuredClone(job)):{format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,status:"completed",output:{ok:true}};this.results.set(job.jobId,structuredClone(result));return result}
}

async function fixture(t,{resultFactory}={}){
  const home=await mkdtemp(join(tmpdir(),"arca-mb-continuation-"));
  const queue=new HumanReviewQueue(home);const pointerStore=new ReviewContinuationStore(home);const gate=new ReviewGatedContinuation(queue,{continuationStore:pointerStore});const client=new FakeRecoverableClient();client.resultFactory=resultFactory??null;
  const coordinator=new MachineBridgeContinuationCoordinator({home,gate,client,waitTimeoutMs:2000,pollIntervalMs:100});
  const runtime=new ReviewAutonomyRuntime(queue,[coordinator.handler],{pointerStore,consumerId:"runtime:mb-test",wakeRecoveryIntervalMs:1000,wakeDebounceMs:10,dispatchRecoveryIntervalMs:1000,dispatchBatchLimit:20});
  t.after(async()=>{await runtime.stop().catch(()=>{});await rm(home,{recursive:true,force:true})});
  return {home,queue,pointerStore,gate,client,coordinator,runtime};
}
function initialResult(requestId){return {format:"arca-result-v1",protocolVersion:3,jobId:`initial-${requestId}`,requestId,status:"completed",output:{humanReviewRequired:true}}}
async function barrier(ctx,requestId){const snap=await ctx.gate.consumeResult(initialResult(requestId),{execution:{jobId:`initial-${requestId}`,action:"worker.ping"}});assert.equal(snap.state,"awaiting-human-review");const review=(await ctx.queue.list()).find(item=>item.source?.requestId===requestId&&item.status==="pending");assert.ok(review);return review}
async function approve(ctx,review){return ctx.queue.resolve({reviewId:review.reviewId,reviewerId:"creator:primary",decision:"approve",reason:"autorizar continuacao",expectedRecordHash:review.recordHash})}


test("closed recipe registry rejects network execution, secrets and unexpected repository params",async t=>{
  const home=await mkdtemp(join(tmpdir(),"arca-mb-plan-"));t.after(()=>rm(home,{recursive:true,force:true}));const store=new MachineBridgeContinuationPlanStore(home);
  await assert.rejects(()=>store.register({requestId:"req-unknown",recipeId:"mb.pncp.acquire-public",params:{}}),/fora do Machine Bridge Continuation Registry/);
  await assert.rejects(()=>store.register({requestId:"req-secret",recipeId:"mb.worker.ping",params:{token:"secret"}}),/secrets\/credentials/);
  await assert.rejects(()=>store.register({requestId:"req-network",recipeId:"mb.pncp.plan",params:{allowNetwork:true}}),/nao aceita network/);
  await assert.rejects(()=>store.register({requestId:"req-repo-param",recipeId:"mb.repository.check",params:{command:"rm"}}),/param nao permitido/);
});

test("approved wake submits one deterministic safe Machine Bridge job and acknowledges it",async t=>{
  const ctx=await fixture(t);const requestId="req-mb-once";const review=await barrier(ctx,requestId);const registration=await ctx.coordinator.register(ctx.runtime,{requestId,recipeId:"mb.worker.ping",params:{echo:"resume-safe"}});await approve(ctx,review);
  await ctx.runtime.runOnce();
  assert.equal(ctx.client.submitCalls.length,1);const job=ctx.client.submitCalls[0];assert.equal(job.requestId,requestId);assert.equal(job.jobId,registration.plan.jobId);assert.match(job.jobId,/^mbc-[a-f0-9]{40}$/);assert.equal(job.action,"worker.ping");assert.deepEqual(job.requires,[]);assert.deepEqual(job.params,{echo:"resume-safe"});
  const plan=await ctx.coordinator.store.get(requestId);assert.equal(plan.status,"completed");assert.equal(plan.resultStatus,"completed");assert.ok(plan.resultHash);assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
  await ctx.runtime.runOnce();assert.equal(ctx.client.submitCalls.length,1);
});

test("existing durable result is recovered by deterministic jobId without resubmission",async t=>{
  const ctx=await fixture(t);const requestId="req-mb-existing";const review=await barrier(ctx,requestId);const registration=await ctx.coordinator.register(ctx.runtime,{requestId,recipeId:"mb.worker.describe"});ctx.client.results.set(registration.plan.jobId,{format:"arca-result-v1",protocolVersion:3,jobId:registration.plan.jobId,requestId,status:"completed",output:{format:"arca-worker-v1",workerId:"existing",capabilities:[]}});await approve(ctx,review);
  await ctx.runtime.runOnce();assert.equal(ctx.client.submitCalls.length,0);assert.equal(ctx.client.waitCalls.length,0);assert.equal((await ctx.coordinator.store.get(requestId)).status,"completed");assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
});

test("reviewable resumed result creates a second gate and later approval never resubmits the completed action",async t=>{
  const ctx=await fixture(t,{resultFactory:job=>({format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,status:"completed",output:{humanReviewRequired:true,summary:"requires second review"}})});const requestId="req-mb-second-review";const first=await barrier(ctx,requestId);await ctx.coordinator.register(ctx.runtime,{requestId,recipeId:"mb.worker.ping",params:{echo:"review-again"}});await approve(ctx,first);
  await ctx.runtime.runOnce();assert.equal(ctx.client.submitCalls.length,1);const pointerAfterAction=await ctx.pointerStore.get(requestId);assert.equal(pointerAfterAction.authorizedToContinue,false);assert.equal(pointerAfterAction.gateState,"awaiting-human-review");assert.equal(pointerAfterAction.wake.pending,false);assert.equal((await ctx.coordinator.store.get(requestId)).status,"completed");
  const pending=(await ctx.queue.list()).filter(item=>item.source?.requestId===requestId&&item.status==="pending");assert.equal(pending.length,1);await approve(ctx,pending[0]);await ctx.runtime.runOnce();assert.equal(ctx.client.submitCalls.length,1);assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
});

test("terminal failed Machine Bridge result stays deferred and never becomes approval",async t=>{
  const ctx=await fixture(t,{resultFactory:job=>({format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,status:"failed",error:{code:"synthetic"}})});const requestId="req-mb-terminal";const review=await barrier(ctx,requestId);await ctx.coordinator.register(ctx.runtime,{requestId,recipeId:"mb.worker.ping"});await approve(ctx,review);
  await ctx.runtime.runOnce();const plan=await ctx.coordinator.store.get(requestId);assert.equal(plan.status,"failed");assert.equal(plan.resultStatus,"failed");assert.equal(plan.lastErrorCode,"execution-failed");assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,true);assert.equal(ctx.client.submitCalls.length,1);
  await ctx.runtime.runOnce();assert.equal(ctx.client.submitCalls.length,1);assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,true);
});

test("transient transport failure remains planned and succeeds on a later recovery cycle",async t=>{
  const ctx=await fixture(t);ctx.client.failSubmitCount=1;const requestId="req-mb-transport-retry";const review=await barrier(ctx,requestId);await ctx.coordinator.register(ctx.runtime,{requestId,recipeId:"mb.worker.ping"});await approve(ctx,review);
  await ctx.runtime.runOnce();let plan=await ctx.coordinator.store.get(requestId);assert.equal(plan.status,"planned");assert.equal(plan.lastErrorCode,"transport-failed");assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,true);assert.equal(ctx.client.submitCalls.length,1);
  await ctx.runtime.runOnce();plan=await ctx.coordinator.store.get(requestId);assert.equal(plan.status,"completed");assert.equal(ctx.client.submitCalls.length,2);assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
});

test("result correlation mismatch fails closed and leaves a retryable wake",async t=>{
  const ctx=await fixture(t,{resultFactory:job=>({format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:"different-request",status:"completed",output:{ok:true}})});const requestId="req-mb-correlation";const review=await barrier(ctx,requestId);await ctx.coordinator.register(ctx.runtime,{requestId,recipeId:"mb.worker.ping"});await approve(ctx,review);
  await ctx.runtime.runOnce();const plan=await ctx.coordinator.store.get(requestId);assert.equal(plan.status,"planned");assert.equal(plan.lastErrorCode,"transport-failed");assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,true);assert.equal((await ctx.queue.list()).filter(item=>item.source?.requestId===requestId&&item.status==="pending").length,0);
});
