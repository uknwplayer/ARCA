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
  AutonomyWorkflowStore,
  AutonomyWorkflowCoordinator
} from "../packages/agent/src/index.ts";

class FakeWorkflowClient{
  constructor(){this.results=new Map();this.jobs=new Map();this.submitCalls=[];this.waitCalls=[];this.failEchoOnce=new Set();this.failedEchoes=new Set();this.resultFactory=null;this.transport={getResult:async jobId=>this.results.has(jobId)?{result:this.results.get(jobId)}:null}}
  async submit(job){this.submitCalls.push(structuredClone(job));const echo=job.params?.echo;if(this.failEchoOnce.has(echo)&&!this.failedEchoes.has(echo)){this.failedEchoes.add(echo);throw new Error("temporary transport outage")}if(this.jobs.has(job.jobId))throw new Error(`job already exists: ${job.jobId}`);this.jobs.set(job.jobId,structuredClone(job));return {jobId:job.jobId,requestId:job.requestId}}
  async waitForResult(job){this.waitCalls.push(job.jobId);if(this.results.has(job.jobId))return this.results.get(job.jobId);const result=this.resultFactory?await this.resultFactory(structuredClone(job)):{format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,status:"completed",output:{ok:true,echo:job.params?.echo??null}};this.results.set(job.jobId,structuredClone(result));return result}
}

async function setup(t,{resultFactory}={}){
  const home=await mkdtemp(join(tmpdir(),"arca-autonomy-workflow-"));
  const queue=new HumanReviewQueue(home);const pointerStore=new ReviewContinuationStore(home);const gate=new ReviewGatedContinuation(queue,{continuationStore:pointerStore});const client=new FakeWorkflowClient();client.resultFactory=resultFactory??null;
  const coordinator=new AutonomyWorkflowCoordinator({home,gate,client,waitTimeoutMs:2000,pollIntervalMs:100});
  const runtime=new ReviewAutonomyRuntime(queue,[coordinator.handler],{pointerStore,consumerId:"runtime:workflow-test",wakeRecoveryIntervalMs:1000,wakeDebounceMs:10,dispatchRecoveryIntervalMs:1000,dispatchBatchLimit:20});
  t.after(async()=>{await runtime.stop().catch(()=>{});await rm(home,{recursive:true,force:true})});
  return {home,queue,pointerStore,gate,client,coordinator,runtime};
}
function initialResult(requestId){return {format:"arca-result-v1",protocolVersion:3,jobId:`initial-${requestId}`,requestId,status:"completed",output:{humanReviewRequired:true,summary:"initial gate"}}}
async function createInitialBarrier(ctx,requestId){const snap=await ctx.gate.consumeResult(initialResult(requestId),{execution:{jobId:`initial-${requestId}`,action:"worker.ping"}});assert.equal(snap.state,"awaiting-human-review");const review=(await ctx.queue.list()).find(item=>item.source?.requestId===requestId&&item.status==="pending");assert.ok(review);return review}
async function approve(ctx,review){return ctx.queue.resolve({reviewId:review.reviewId,reviewerId:"creator:primary",decision:"approve",reason:"autorizar workflow",expectedRecordHash:review.recordHash})}
function twoStep(requestId){return {requestId,steps:[{stepId:"step-1",recipeId:"mb.worker.ping",params:{echo:"step-1"}},{stepId:"step-2",recipeId:"mb.worker.ping",params:{echo:"step-2"}}]}}

test("workflow registry rejects unknown recipes, network escalation and secret-like params",async t=>{
  const home=await mkdtemp(join(tmpdir(),"arca-autonomy-workflow-store-"));t.after(()=>rm(home,{recursive:true,force:true}));const store=new AutonomyWorkflowStore(home);
  await assert.rejects(()=>store.register({requestId:"req-unknown",steps:[{stepId:"s1",recipeId:"mb.pncp.acquire-public",params:{}}]}),/fora do Workflow Registry/);
  await assert.rejects(()=>store.register({requestId:"req-network",steps:[{stepId:"s1",recipeId:"mb.pncp.plan",params:{allowNetwork:true}}]}),/nao aceita network/);
  await assert.rejects(()=>store.register({requestId:"req-secret",steps:[{stepId:"s1",recipeId:"mb.worker.ping",params:{token:"secret"}}]}),/secrets\/credentials/);
});

test("one authorized wake executes multiple safe steps under the same requestId",async t=>{
  const ctx=await setup(t);const requestId="req-workflow-two";const first=await createInitialBarrier(ctx,requestId);const registration=await ctx.coordinator.register(ctx.runtime,twoStep(requestId));await approve(ctx,first);
  await ctx.runtime.runOnce();
  assert.equal(ctx.client.submitCalls.length,2);assert.equal(ctx.client.submitCalls[0].requestId,requestId);assert.equal(ctx.client.submitCalls[1].requestId,requestId);assert.notEqual(ctx.client.submitCalls[0].jobId,ctx.client.submitCalls[1].jobId);assert.match(ctx.client.submitCalls[0].jobId,/^mbwf-[a-f0-9]{40}$/);assert.equal(registration.workflow.definitionHash.length,64);
  const workflow=await ctx.coordinator.store.get(requestId);assert.equal(workflow.state,"completed");assert.equal(workflow.cursor,2);assert.deepEqual(workflow.steps.map(step=>step.status),["completed","completed"]);assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
  await ctx.runtime.runOnce();assert.equal(ctx.client.submitCalls.length,2);
});

test("reviewable middle step pauses the workflow and a later approval resumes without replay",async t=>{
  const ctx=await setup(t,{resultFactory:job=>({format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,status:"completed",output:job.params?.echo==="step-1"?{humanReviewRequired:true,summary:"review step 1"}:{ok:true}})});const requestId="req-workflow-review";const first=await createInitialBarrier(ctx,requestId);await ctx.coordinator.register(ctx.runtime,twoStep(requestId));await approve(ctx,first);
  await ctx.runtime.runOnce();
  let workflow=await ctx.coordinator.store.get(requestId);assert.equal(workflow.state,"awaiting-human-review");assert.equal(workflow.cursor,1);assert.equal(ctx.client.submitCalls.length,1);assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
  const pending=(await ctx.queue.list()).filter(item=>item.source?.requestId===requestId&&item.status==="pending");assert.equal(pending.length,1);await approve(ctx,pending[0]);
  await ctx.runtime.runOnce();
  workflow=await ctx.coordinator.store.get(requestId);assert.equal(workflow.state,"completed");assert.equal(workflow.cursor,2);assert.equal(ctx.client.submitCalls.length,2);assert.equal(ctx.client.submitCalls.filter(job=>job.params?.echo==="step-1").length,1);assert.equal(ctx.client.submitCalls.filter(job=>job.params?.echo==="step-2").length,1);assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
});

test("transient transport failure retries only the current step on a later recovery cycle",async t=>{
  const ctx=await setup(t);ctx.client.failEchoOnce.add("step-2");const requestId="req-workflow-retry";const first=await createInitialBarrier(ctx,requestId);await ctx.coordinator.register(ctx.runtime,twoStep(requestId));await approve(ctx,first);
  await ctx.runtime.runOnce();
  let workflow=await ctx.coordinator.store.get(requestId);assert.equal(workflow.state,"running");assert.equal(workflow.cursor,1);assert.equal(workflow.steps[0].status,"completed");assert.equal(workflow.steps[1].status,"pending");assert.equal(workflow.steps[1].lastErrorCode,"transport-failed");assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,true);assert.equal(ctx.client.submitCalls.filter(job=>job.params?.echo==="step-1").length,1);assert.equal(ctx.client.submitCalls.filter(job=>job.params?.echo==="step-2").length,1);
  await ctx.runtime.runOnce();
  workflow=await ctx.coordinator.store.get(requestId);assert.equal(workflow.state,"completed");assert.equal(workflow.cursor,2);assert.equal(ctx.client.submitCalls.filter(job=>job.params?.echo==="step-1").length,1);assert.equal(ctx.client.submitCalls.filter(job=>job.params?.echo==="step-2").length,2);assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
});

test("terminal technical failure stops the workflow and acknowledges the consumed wake",async t=>{
  const ctx=await setup(t,{resultFactory:job=>job.params?.echo==="step-2"?{format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,status:"failed",error:{code:"synthetic"}}:{format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,status:"completed",output:{ok:true}}});const requestId="req-workflow-terminal";const first=await createInitialBarrier(ctx,requestId);await ctx.coordinator.register(ctx.runtime,twoStep(requestId));await approve(ctx,first);
  await ctx.runtime.runOnce();
  const workflow=await ctx.coordinator.store.get(requestId);assert.equal(workflow.state,"failed");assert.equal(workflow.cursor,1);assert.equal(workflow.steps[0].status,"completed");assert.equal(workflow.steps[1].status,"failed");assert.equal(workflow.steps[1].lastErrorCode,"execution-failed");assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);const submits=ctx.client.submitCalls.length;await ctx.runtime.runOnce();assert.equal(ctx.client.submitCalls.length,submits);
});

test("correlation mismatch fails closed without advancing the workflow",async t=>{
  const ctx=await setup(t,{resultFactory:job=>({format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:"wrong-request",status:"completed",output:{ok:true}})});const requestId="req-workflow-correlation";const first=await createInitialBarrier(ctx,requestId);await ctx.coordinator.register(ctx.runtime,{requestId,steps:[{stepId:"step-1",recipeId:"mb.worker.ping",params:{echo:"step-1"}}]});await approve(ctx,first);
  await ctx.runtime.runOnce();
  const workflow=await ctx.coordinator.store.get(requestId);assert.equal(workflow.state,"running");assert.equal(workflow.cursor,0);assert.equal(workflow.steps[0].status,"pending");assert.equal(workflow.steps[0].lastErrorCode,"transport-failed");assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,true);
});
