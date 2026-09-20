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
  WorkflowExecutionBudgetStore,
  GuardedAutonomyWorkflowCoordinator
} from "../packages/agent/src/index.ts";

const NOW=Date.parse("2026-09-17T22:45:00.000Z");

class FakeClient{
  constructor(){this.results=new Map();this.jobs=new Map();this.submitCalls=[];this.failSubmits=0;this.transport={getResult:async jobId=>this.results.has(jobId)?{result:this.results.get(jobId)}:null}}
  async submit(job){this.submitCalls.push(structuredClone(job));if(this.failSubmits>0){this.failSubmits--;throw new Error("temporary outage")}if(this.jobs.has(job.jobId))throw new Error(`job already exists: ${job.jobId}`);this.jobs.set(job.jobId,structuredClone(job));return {jobId:job.jobId,requestId:job.requestId}}
  async waitForResult(job){if(this.results.has(job.jobId))return this.results.get(job.jobId);const result={format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,status:"completed",output:{ok:true,echo:job.params?.echo??null}};this.results.set(job.jobId,structuredClone(result));return result}
}

async function setup(t,{now=()=>NOW}={}){
  const home=await mkdtemp(join(tmpdir(),"arca-workflow-guard-"));const queue=new HumanReviewQueue(home);const pointerStore=new ReviewContinuationStore(home);const gate=new ReviewGatedContinuation(queue,{continuationStore:pointerStore});const client=new FakeClient();const coordinator=new GuardedAutonomyWorkflowCoordinator({home,gate,client,now,waitTimeoutMs:2000,pollIntervalMs:100});const runtime=new ReviewAutonomyRuntime(queue,[coordinator.handler],{pointerStore,consumerId:"runtime:guard-test",wakeRecoveryIntervalMs:1000,wakeDebounceMs:10,dispatchRecoveryIntervalMs:1000,dispatchBatchLimit:20});t.after(async()=>{await runtime.stop().catch(()=>{});await rm(home,{recursive:true,force:true})});return {home,queue,pointerStore,gate,client,coordinator,runtime};
}
function initialResult(requestId){return {format:"arca-result-v1",protocolVersion:3,jobId:`initial-${requestId}`,requestId,status:"completed",output:{humanReviewRequired:true}}}
async function barrier(ctx,requestId){const snap=await ctx.gate.consumeResult(initialResult(requestId),{execution:{jobId:`initial-${requestId}`,action:"worker.ping"}});assert.equal(snap.state,"awaiting-human-review");const review=(await ctx.queue.list()).find(item=>item.source?.requestId===requestId&&item.status==="pending");assert.ok(review);return review}
async function approve(ctx,review){return ctx.queue.resolve({reviewId:review.reviewId,reviewerId:"creator:primary",decision:"approve",reason:"autorizar guardado",expectedRecordHash:review.recordHash})}
function step(id,echo=id){return {stepId:id,recipeId:"mb.worker.ping",params:{echo}}}

test("execution policy is durable and immutable for a requestId",async t=>{
  const home=await mkdtemp(join(tmpdir(),"arca-workflow-budget-"));t.after(()=>rm(home,{recursive:true,force:true}));const store=new WorkflowExecutionBudgetStore(home,{now:()=>NOW});const first=await store.register({requestId:"req-budget-policy",policy:{maxSubmitAttemptsPerJob:2,maxTotalSubmitAttempts:5,deadlineAt:"2026-09-18T00:00:00Z"}});assert.equal(first.policy.maxSubmitAttemptsPerJob,2);assert.equal(first.policy.maxTotalSubmitAttempts,5);assert.match(first.policyHash,/^[a-f0-9]{64}$/);await assert.rejects(()=>store.register({requestId:"req-budget-policy",policy:{maxSubmitAttemptsPerJob:3,maxTotalSubmitAttempts:5,deadlineAt:"2026-09-18T00:00:00Z"}}),/definicao divergente/);
});

test("expired deadline stops workflow before delegating a new submission",async t=>{
  const ctx=await setup(t);const requestId="req-guard-deadline";const review=await barrier(ctx,requestId);await ctx.coordinator.register(ctx.runtime,{requestId,steps:[step("one")],executionPolicy:{deadlineAt:"2026-09-17T22:44:59Z",maxSubmitAttemptsPerJob:3,maxTotalSubmitAttempts:3}});await approve(ctx,review);await ctx.runtime.runOnce();const workflow=await ctx.coordinator.store.get(requestId);const budget=await ctx.coordinator.budgetStore.get(requestId);assert.equal(ctx.client.submitCalls.length,0);assert.equal(workflow.state,"failed");assert.equal(workflow.steps[0].resultStatus,"failed");assert.equal(workflow.steps[0].lastErrorCode,"execution-failed");assert.equal(budget.totalSubmitAttempts,0);assert.equal(budget.lastDecision.code,"deadline-exceeded");assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
});

test("per-job attempt budget converts repeated transient outages into a bounded terminal stop",async t=>{
  const ctx=await setup(t);ctx.client.failSubmits=10;const requestId="req-guard-attempts";const review=await barrier(ctx,requestId);await ctx.coordinator.register(ctx.runtime,{requestId,steps:[step("one")],executionPolicy:{maxSubmitAttemptsPerJob:2,maxTotalSubmitAttempts:10}});await approve(ctx,review);
  await ctx.runtime.runOnce();assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,true);assert.equal(ctx.client.submitCalls.length,1);
  await ctx.runtime.runOnce();assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,true);assert.equal(ctx.client.submitCalls.length,2);
  await ctx.runtime.runOnce();const workflow=await ctx.coordinator.store.get(requestId);const budget=await ctx.coordinator.budgetStore.get(requestId);assert.equal(workflow.state,"failed");assert.equal(ctx.client.submitCalls.length,2);assert.equal(budget.totalSubmitAttempts,2);assert.equal(budget.lastDecision.code,"job-attempt-budget-exceeded");assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
});

test("total submission budget can stop a later step without replaying the first",async t=>{
  const ctx=await setup(t);const requestId="req-guard-total";const review=await barrier(ctx,requestId);await ctx.coordinator.register(ctx.runtime,{requestId,steps:[step("one"),step("two")],executionPolicy:{maxSubmitAttemptsPerJob:3,maxTotalSubmitAttempts:1}});await approve(ctx,review);await ctx.runtime.runOnce();const workflow=await ctx.coordinator.store.get(requestId);const budget=await ctx.coordinator.budgetStore.get(requestId);assert.equal(workflow.state,"failed");assert.equal(workflow.cursor,1);assert.equal(workflow.steps[0].status,"completed");assert.equal(workflow.steps[1].status,"failed");assert.equal(ctx.client.submitCalls.length,1);assert.equal(budget.totalSubmitAttempts,1);assert.equal(budget.lastDecision.code,"total-attempt-budget-exceeded");assert.equal((await ctx.pointerStore.get(requestId)).wake.pending,false);
});

test("already durable Machine Bridge result consumes no new submission budget",async t=>{
  const ctx=await setup(t);const requestId="req-guard-existing";const review=await barrier(ctx,requestId);const registration=await ctx.coordinator.register(ctx.runtime,{requestId,steps:[step("one")],executionPolicy:{maxSubmitAttemptsPerJob:1,maxTotalSubmitAttempts:1}});const jobId=registration.workflow.steps[0].jobId;ctx.client.results.set(jobId,{format:"arca-result-v1",protocolVersion:3,jobId,requestId,status:"completed",output:{ok:true}});await approve(ctx,review);await ctx.runtime.runOnce();const budget=await ctx.coordinator.budgetStore.get(requestId);assert.equal(ctx.client.submitCalls.length,0);assert.equal(budget.totalSubmitAttempts,0);assert.equal((await ctx.coordinator.store.get(requestId)).state,"completed");
});
