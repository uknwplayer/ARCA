import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {HumanReviewQueue,syncMachineBridgeReviews} from "../packages/agent/src/index.ts";
import {FsMachineBridgeTransport} from "../src/machine-bridge/fs-transport.mjs";

async function fixture(run){
  const root=await mkdtemp(join(tmpdir(),"arca-review-sync-"));
  const transport=new FsMachineBridgeTransport(join(root,"bridge"));
  const queue=new HumanReviewQueue(join(root,"arca-home"));
  await transport.init("sync-test-worker");
  await queue.init();
  try{await run({root,transport,queue})}finally{await rm(root,{recursive:true,force:true})}
}

function reviewableResult(jobId="aie-job-1"){
  return {
    format:"arca-result-v1",protocolVersion:3,jobId,workerId:"worker-a",attempt:1,status:"completed",
    startedAt:"2026-09-17T05:00:00.000Z",completedAt:"2026-09-17T05:00:01.000Z",
    output:{
      format:"arca-aie-analysis-v1",engineVersion:"0.4.0",humanReviewRequired:true,
      findings:[{findingId:"FND-SYNC-1",summary:"Sinal sintético",triage:"investigate",humanReviewRequired:true,gaps:["Confirmar fonte primária."],observed:{value:1000}}]
    }
  };
}

test("filesystem transport lists durable results for downstream consumers",async()=>{
  await fixture(async({transport})=>{
    await transport.writeResult(reviewableResult("job-b"));
    await transport.writeResult({...reviewableResult("job-a"),output:{ok:true}});
    const results=await transport.listResults();
    assert.deepEqual(results.map(item=>item.result.jobId),["job-a","job-b"]);
    assert.ok(results.every(item=>item.path.endsWith(".json")));
  });
});

test("review synchronizer materializes only reviewable bridge results",async()=>{
  await fixture(async({transport,queue})=>{
    await transport.writeResult(reviewableResult());
    await transport.writeResult({
      format:"arca-result-v1",protocolVersion:3,jobId:"ping-job",workerId:"worker-a",attempt:1,status:"completed",
      startedAt:"2026-09-17T05:00:00.000Z",completedAt:"2026-09-17T05:00:00.100Z",output:{ok:true}
    });

    const summary=await syncMachineBridgeReviews({transport,queue});
    assert.equal(summary.resultsScanned,2);
    assert.equal(summary.reviewableResults,1);
    assert.equal(summary.reviewItemsMaterialized,1);
    assert.equal(summary.pendingReviews,1);
    assert.deepEqual(summary.errors,[]);

    const pending=await queue.list({status:"pending"});
    assert.equal(pending.length,1);
    assert.equal(pending[0].source.jobId,"aie-job-1");
    assert.equal(pending[0].source.findingId,"FND-SYNC-1");
  });
});

test("resolved reviews never reappear when the same result is synchronized again",async()=>{
  await fixture(async({transport,queue})=>{
    await transport.writeResult(reviewableResult());
    await syncMachineBridgeReviews({transport,queue});
    const [item]=await queue.list({status:"pending"});
    const resolved=await queue.resolve({
      reviewId:item.reviewId,
      reviewerId:"reviewer-sync",
      decision:"acknowledge",
      reason:"Sinal revisado sem inferência substantiva.",
      expectedRecordHash:item.recordHash
    });
    assert.equal(resolved.status,"resolved");

    const second=await syncMachineBridgeReviews({transport,queue});
    assert.equal(second.pendingReviews,0);
    assert.equal((await queue.list()).length,1);
    assert.equal((await queue.list({status:"resolved"}))[0].reviewId,item.reviewId);
  });
});

test("one malformed result does not block synchronization of other results",async()=>{
  await fixture(async({root,transport,queue})=>{
    await transport.writeResult(reviewableResult("good-job"));
    await writeFile(join(root,"bridge","results","malformed.json"),JSON.stringify({format:"arca-result-v1",status:"completed",workerId:"worker-a",output:{humanReviewRequired:true}})+"\n");
    const summary=await syncMachineBridgeReviews({transport,queue});
    assert.equal(summary.resultsScanned,2);
    assert.equal(summary.errors.length,1);
    assert.equal(summary.pendingReviews,1);
  });
});
