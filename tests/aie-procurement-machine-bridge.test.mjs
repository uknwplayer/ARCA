import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createDefaultActionRegistry} from "../src/machine-bridge/action-registry.mjs";
import {canExecuteJob,executeClaimedJob} from "../src/machine-bridge/worker-runtime.mjs";

const worker={format:"arca-worker-v1",workerId:"proc-worker",capabilities:["aie"],heartbeatAt:"2026-09-16T12:00:00.000Z"};
async function fixture(name){return JSON.parse(await readFile(`examples/aie-fixtures/${name}.json`,"utf8"))}
function job(records,id="proc-profile-1"){
  return {format:"arca-remote-job-v3",protocolVersion:3,jobId:id,action:"aie.procurement-profile",requires:["aie"],params:{records,sourceRef:"fixture-publica"}};
}

test("procurement profile action normalizes and profiles without automatic accusation",async()=>{
  const records=await fixture("procurement-risk");
  const registry=createDefaultActionRegistry({worker});
  assert.equal(canExecuteJob(job(records),worker,registry),true);
  const output=await registry.run(job(records),{worker});
  assert.equal(output.format,"arca-aie-procurement-analysis-v1");
  assert.equal(output.humanReviewRequired,true);
  assert.equal(output.rawRecordCount,6);
  assert.equal(output.normalizedRecordCount,6);
  assert.equal(output.profile.humanReviewRequired,true);
  assert.equal(output.profile.entityCount,2);
  assert.ok(output.profile.findingCount>=1);
  assert.ok(output.profile.byDetector["RISK-ADDITIVE-BURDEN-001"]>=1);
  assert.doesNotMatch(JSON.stringify(output),/fraude comprovada|crime comprovado|culpado/i);
});

test("normal procurement fixture remains free of current risk findings",async()=>{
  const records=await fixture("procurement-normal");
  const registry=createDefaultActionRegistry({worker});
  const output=await registry.run(job(records,"proc-profile-normal"),{worker});
  assert.equal(output.profile.findingCount,0);
  assert.equal(output.profile.investigateCount,0);
  assert.deepEqual(output.profile.byDetector,{});
});

test("procurement profile is capability-gated, bounded and durable-compatible",async()=>{
  const records=await fixture("procurement-risk");
  const registry=createDefaultActionRegistry({worker});
  const current=job(records);
  assert.equal(canExecuteJob(current,{...worker,capabilities:[]},registry),false);
  await assert.rejects(()=>registry.run({...current,params:{records:Array.from({length:10001},(_,id)=>({id,amount:id}))}},{worker}),/at most 10000 records/);
  const claim={format:"arca-claim-v1",jobId:current.jobId,workerId:worker.workerId,claimedAt:"2026-09-16T12:00:00.000Z",leaseExpiresAt:"2026-09-16T12:10:00.000Z",attempt:1};
  const times=[new Date("2026-09-16T12:00:01.000Z"),new Date("2026-09-16T12:00:02.000Z"),new Date("2026-09-16T12:00:03.000Z")];
  const result=await executeClaimedJob({job:current,worker,claim,registry,now:()=>times.shift()||new Date("2026-09-16T12:00:03.000Z")});
  assert.equal(result.status,"completed");
  assert.equal(result.output.profile.humanReviewRequired,true);
});
