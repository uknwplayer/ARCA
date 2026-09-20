import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  HumanReviewQueue,
  ReasoningOutputReviewGate
} from "../packages/agent/src/index.ts";

function reasoningResult(requestId="req-reasoning-review",output={analysis:"review me"}){
  return {
    format:"arca-reasoning-result-v1",
    version:"1.0.0",
    requestId,
    payloadId:"payload."+requestId,
    providerId:"reasoner.fixture",
    providerDescriptorHash:"a".repeat(64),
    transportId:"local.fixture",
    transportDecisionHash:"b".repeat(64),
    payloadHash:"c".repeat(64),
    status:"completed",
    responseFormat:"json",
    output,
    outputBytes:JSON.stringify(output).length,
    outputPersisted:false,
    privacyReclassificationRequired:true,
    humanReviewRequired:true,
    coreMutationPerformed:false
  };
}

async function fixture(t,options={}){
  const home=await mkdtemp(join(tmpdir(),"arca-reasoning-review-"));
  const queue=new HumanReviewQueue(home);
  const manager=new ReasoningOutputReviewGate(queue,options);
  t.after(()=>rm(home,{recursive:true,force:true}));
  return {home,queue,manager};
}

test("reasoning output is reclassified and materialized as Human Review before substantive continuation",async(t)=>{
  const ctx=await fixture(t);
  const result=reasoningResult();
  const materialized=await ctx.manager.materialize(result,{
    indicators:{privateCommunication:true}
  });

  assert.equal(materialized.format,"arca-reasoning-output-review-v1");
  assert.equal(materialized.classification.privacyClass,"restricted");
  assert.equal(materialized.classification.indicators.privateCommunication,true);
  assert.equal(materialized.outputPersistedInReview,true);
  assert.equal(materialized.review.kind,"reasoning.output");
  assert.equal(materialized.review.status,"pending");
  assert.deepEqual(materialized.review.payload.output,{analysis:"review me"});
  assert.equal(materialized.gate.state,"awaiting-human-review");
  assert.equal(materialized.gate.authorizedToContinue,false);
  assert.equal(materialized.continuationPointer.wake.pending,false);

  const resolved=await ctx.queue.resolve({
    reviewId:materialized.review.reviewId,
    reviewerId:"creator:primary",
    decision:"approve",
    reason:"reviewed and approved for this continuation",
    expectedRecordHash:materialized.review.recordHash
  });
  assert.equal(resolved.resolution.decision,"approve");
  const reconciled=await ctx.manager.reconcile(result.requestId);
  assert.equal(reconciled.gate.state,"authorized-to-continue");
  assert.equal(reconciled.gate.authorizedToContinue,true);
  assert.equal(reconciled.pointer.wake.pending,true);
  assert.equal(reconciled.pointer.wake.sequence,1);
});

test("reasoning output review is idempotent for same request and exact output hash",async(t)=>{
  const ctx=await fixture(t);
  const result=reasoningResult("req-review-idempotent",{analysis:"same output"});
  const first=await ctx.manager.materialize(result);
  const second=await ctx.manager.materialize(result);
  assert.equal(second.review.reviewId,first.review.reviewId);
  assert.equal(second.outputHash,first.outputHash);
  assert.equal((await ctx.queue.list({kind:"reasoning.output"})).length,1);
});

test("large semantic output is hash-bound but omitted from durable Human Review payload",async(t)=>{
  const ctx=await fixture(t,{maxPersistedOutputBytes:4096});
  const marker="PRIVATE-LARGE-MARKER-DO-NOT-PERSIST";
  const result=reasoningResult("req-review-large",{analysis:marker+"x".repeat(10_000)});
  const materialized=await ctx.manager.materialize(result);
  assert.equal(materialized.outputPersistedInReview,false);
  assert.equal(materialized.review.payload.outputOmitted,true);
  assert.equal("output" in materialized.review.payload,false);
  assert.match(materialized.review.payload.outputHash,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(materialized.review).includes(marker),false);
});

test("explicit high-risk reclassification raises review priority without auto-authorizing",async(t)=>{
  const ctx=await fixture(t);
  const result=reasoningResult("req-review-high-risk",{finding:"possible adverse inference"});
  const materialized=await ctx.manager.materialize(result,{
    privacyClass:"high-risk",
    indicators:{accusationOrAdverseInference:true}
  });
  assert.equal(materialized.classification.privacyClass,"high-risk");
  assert.equal(materialized.classification.indicators.accusationOrAdverseInference,true);
  assert.equal(materialized.review.priority,"high");
  assert.equal(materialized.gate.authorizedToContinue,false);
});

test("rejected reasoning review blocks the continuation",async(t)=>{
  const ctx=await fixture(t);
  const result=reasoningResult("req-review-reject",{analysis:"do not continue"});
  const materialized=await ctx.manager.materialize(result);
  await ctx.queue.resolve({
    reviewId:materialized.review.reviewId,
    reviewerId:"creator:primary",
    decision:"reject",
    reason:"insufficient support",
    expectedRecordHash:materialized.review.recordHash
  });
  const reconciled=await ctx.manager.reconcile(result.requestId);
  assert.equal(reconciled.gate.state,"blocked");
  assert.equal(reconciled.gate.authorizedToContinue,false);
  assert.equal(reconciled.pointer.wake.pending,false);
});

test("reasoning output review fails closed on missing review/reclassification boundaries or invalid hashes",async(t)=>{
  const ctx=await fixture(t);
  await assert.rejects(()=>ctx.manager.materialize({...reasoningResult("req-no-review"),humanReviewRequired:false}),/humanReviewRequired/);
  await assert.rejects(()=>ctx.manager.materialize({...reasoningResult("req-core-mutation"),coreMutationPerformed:true}),/Core mutation/);
  await assert.rejects(()=>ctx.manager.materialize({...reasoningResult("req-no-reclass"),privacyReclassificationRequired:false}),/privacyReclassificationRequired/);
  await assert.rejects(()=>ctx.manager.materialize({...reasoningResult("req-bad-hash"),payloadHash:"bad"}),/payloadHash/);
});
