import test from "node:test";
import assert from "node:assert/strict";
import {createDefaultActionRegistry} from "../src/machine-bridge/action-registry.mjs";
import {canExecuteJob,executeClaimedJob} from "../src/machine-bridge/worker-runtime.mjs";

const worker={format:"arca-worker-v1",workerId:"aie-worker",capabilities:["node","aie"],heartbeatAt:"2026-09-16T12:00:00.000Z"};
const records=[
  {id:"P1",amount:100,supplierId:"A",participantCount:1},
  {id:"P2",amount:101,supplierId:"A",participantCount:1},
  {id:"P3",amount:99,supplierId:"A",participantCount:1},
  {id:"P4",amount:100,supplierId:"B",participantCount:4},
  {id:"P5",amount:102,supplierId:"C",participantCount:5},
  {id:"P6",amount:1000,supplierId:"A",participantCount:1}
];
const job={format:"arca-remote-job-v3",protocolVersion:3,jobId:"aie-test-1",action:"aie.analyze",requires:["aie"],params:{records}};

test("AIE Machine Bridge action is capability-gated and review-bound",async()=>{
  const registry=createDefaultActionRegistry({worker});
  assert.equal(registry.get("aie.analyze").requires.includes("aie"),true);
  assert.equal(canExecuteJob(job,worker,registry),true);
  assert.equal(canExecuteJob(job,{...worker,capabilities:["node"]},registry),false);
  const output=await registry.run(job,{worker});
  assert.equal(output.format,"arca-aie-analysis-v1");
  assert.equal(output.humanReviewRequired,true);
  assert.equal(output.recordCount,6);
  assert.ok(output.findingCount>=1);
  assert.ok(output.findings.every(item=>item.humanReviewRequired===true));
  assert.ok(output.hypotheses.length===output.findings.length);
  assert.doesNotMatch(JSON.stringify(output),/\bculpado\b|\bfraude comprovada\b|\bcrime comprovado\b/i);
});

test("AIE remote execution returns a durable-compatible terminal result",async()=>{
  const registry=createDefaultActionRegistry({worker});
  const claim={format:"arca-claim-v1",jobId:job.jobId,workerId:worker.workerId,claimedAt:"2026-09-16T12:00:00.000Z",leaseExpiresAt:"2026-09-16T12:10:00.000Z",attempt:1};
  const times=[new Date("2026-09-16T12:00:01.000Z"),new Date("2026-09-16T12:00:02.000Z"),new Date("2026-09-16T12:00:03.000Z")];
  const result=await executeClaimedJob({job,worker,claim,registry,now:()=>times.shift()||new Date("2026-09-16T12:00:03.000Z")});
  assert.equal(result.status,"completed");
  assert.equal(result.output.humanReviewRequired,true);
  assert.equal(result.workerId,"aie-worker");
});

test("AIE action rejects unbounded and unknown analytical requests",async()=>{
  const registry=createDefaultActionRegistry({worker});
  await assert.rejects(()=>registry.run({...job,params:{records,detectors:["unknown"]}},{worker}),/unsupported AIE detector/);
  await assert.rejects(()=>registry.run({...job,params:{records:Array.from({length:10001},(_,id)=>({id,amount:id}))}},{worker}),/at most 10000 records/);
});
