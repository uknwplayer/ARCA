import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {HumanReviewQueue,ReviewGatedContinuation} from "../packages/agent/src/index.ts";

async function fixture(t,options={}){
  const home=await mkdtemp(join(tmpdir(),"arca-review-continuation-"));
  const queue=new HumanReviewQueue(home);
  const gate=new ReviewGatedContinuation(queue,{defaultPollIntervalMs:10,defaultWaitTimeoutMs:300,...options});
  t.after(()=>rm(home,{recursive:true,force:true}));
  return {home,queue,gate};
}
function result({requestId="req-review-1",jobId="job-review-1",status="completed",output={}}={}){return {format:"arca-result-v1",protocolVersion:3,jobId,requestId,status,output}}
async function resolveFirst(queue,requestId,decision,reason=`decision:${decision}`){
  const item=(await queue.list()).find(entry=>entry.source?.requestId===requestId);
  assert.ok(item);
  return queue.resolve({reviewId:item.reviewId,reviewerId:"creator:primary",decision,reason,expectedRecordHash:item.recordHash});
}

test("completed result without review barrier is immediately authorized",async(t)=>{
  const {gate}=await fixture(t);
  const snapshot=await gate.consumeResult(result({output:{ok:true}}));
  assert.equal(snapshot.executed,true);
  assert.equal(snapshot.authorizedToContinue,true);
  assert.equal(snapshot.state,"authorized-to-continue");
  assert.deepEqual(snapshot.reviewIds,[]);
});

test("reviewable result pauses after technical completion and resumes only after approve",async(t)=>{
  const {queue,gate}=await fixture(t);
  const first=await gate.consumeResult(result({requestId:"req-approve",jobId:"job-approve",output:{humanReviewRequired:true}}));
  assert.equal(first.executed,true);
  assert.equal(first.authorizedToContinue,false);
  assert.equal(first.state,"awaiting-human-review");
  assert.equal(first.pendingReviewIds.length,1);

  await resolveFirst(queue,"req-approve","approve","resultado aprovado para continuacao");
  const resumed=await gate.status("req-approve",{jobId:"job-approve"});
  assert.equal(resumed.state,"authorized-to-continue");
  assert.equal(resumed.authorizedToContinue,true);
  assert.equal(resumed.decisions[0].decision,"approve");
});

test("reject and needs-more-information never become automatic approval",async(t)=>{
  const rejected=await fixture(t);
  await rejected.gate.consumeResult(result({requestId:"req-reject",jobId:"job-reject",output:{humanReviewRequired:true}}));
  await resolveFirst(rejected.queue,"req-reject","reject","nao autorizado");
  assert.equal((await rejected.gate.status("req-reject")).state,"blocked");

  const more=await fixture(t);
  await more.gate.consumeResult(result({requestId:"req-more",jobId:"job-more",output:{humanReviewRequired:true}}));
  await resolveFirst(more.queue,"req-more","needs-more-information","coletar documento adicional");
  const snapshot=await more.gate.status("req-more");
  assert.equal(snapshot.state,"needs-more-information");
  assert.equal(snapshot.authorizedToContinue,false);
});

test("acknowledge is not substantive approval unless policy explicitly opts in",async(t)=>{
  const normal=await fixture(t);
  await normal.gate.consumeResult(result({requestId:"req-ack",jobId:"job-ack",output:{humanReviewRequired:true}}));
  await resolveFirst(normal.queue,"req-ack","acknowledge","ciente");
  assert.equal((await normal.gate.status("req-ack")).state,"manual-policy-required");

  const permissive=await fixture(t,{allowAcknowledge:true});
  await permissive.gate.consumeResult(result({requestId:"req-ack-ok",jobId:"job-ack-ok",output:{humanReviewRequired:true}}));
  await resolveFirst(permissive.queue,"req-ack-ok","acknowledge","ciente e policy permite");
  assert.equal((await permissive.gate.status("req-ack-ok")).state,"authorized-to-continue");
});

test("failed or uncorrelated executions fail closed before continuation",async(t)=>{
  const {gate}=await fixture(t);
  const failed=await gate.consumeResult(result({requestId:"req-failed",status:"failed",output:{error:"boom"}}));
  assert.equal(failed.state,"execution-failed");
  assert.equal(failed.executed,false);

  const uncorrelated={format:"arca-result-v1",protocolVersion:3,jobId:"job-no-request",status:"completed",output:{ok:true}};
  const missing=await gate.consumeResult(uncorrelated);
  assert.equal(missing.state,"correlation-required");
  assert.equal(missing.authorizedToContinue,false);
});

test("gated call preserves requestId and returns execution separately from authorization",async(t)=>{
  const {gate}=await fixture(t);
  const client={call:async job=>result({requestId:job.requestId,jobId:job.jobId,output:{humanReviewRequired:true}})};
  const response=await gate.call(client,{jobId:"job-call",requestId:"req-call"});
  assert.equal(response.format,"arca-review-gated-call-v1");
  assert.equal(response.executionResult.status,"completed");
  assert.equal(response.gate.state,"awaiting-human-review");
  assert.equal(response.gate.authorizedToContinue,false);
});

test("waitForDecision wakes on the same requestId after durable human approval",async(t)=>{
  const {queue,gate}=await fixture(t);
  await gate.consumeResult(result({requestId:"req-wait",jobId:"job-wait",output:{humanReviewRequired:true}}));
  const item=(await queue.list()).find(entry=>entry.source?.requestId==="req-wait");assert.ok(item);
  setTimeout(()=>{queue.resolve({reviewId:item.reviewId,reviewerId:"creator:primary",decision:"approve",reason:"liberado",expectedRecordHash:item.recordHash}).catch(()=>{})},30);
  const snapshot=await gate.waitForDecision("req-wait",{timeoutMs:250,pollIntervalMs:10});
  assert.equal(snapshot.state,"authorized-to-continue");
  assert.equal(snapshot.authorizedToContinue,true);
});
