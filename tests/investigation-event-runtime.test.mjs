import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createDurableInvestigationQueue} from "../src/machine-bridge/investigation-queue.mjs";
import {
  createInvestigationAutonomyRuntime,
  INVESTIGATION_WAKEUP_SCHEMA,
  PRIVATE_INVESTIGATIVE_WORK_SCHEMA
} from "../src/machine-bridge/investigation-event-runtime.mjs";

const roots=()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"arca-investigation-runtime-"));
  return {queueRoot:path.join(base,"queue"),eventRoot:path.join(base,"events")};
};
const clock=()=>new Date("2026-09-20T23:00:00.000Z");
const scope=()=>({
  jurisdiction:"BR/NATIONAL",
  subjectRef:"public-body:fixture",
  topic:"public-procurement",
  timeWindow:"2026-Q3",
  sourceScopes:["pncp"]
});
const request=(participantRef="human:1")=>({
  scope:scope(),
  triggerKind:"HUMAN_REQUEST",
  triggerRef:"public-request:fixture",
  participantRef,
  priority:40
});

test("durable request is persisted, evented and accepted by the private backend",async()=>{
  const root=roots();
  const received=[];
  const runtime=createInvestigationAutonomyRuntime({
    ...root,clock,
    backend:{async acceptWork(work){received.push(work);return {accepted:true,receiptRef:"private:receipt:1"}}}
  });
  const result=await runtime.request(request());
  assert.equal(result.created,true);
  assert.equal(result.events[0].status,"accepted");
  assert.equal(result.events[0].results[0].status,"fulfilled");
  assert.equal(received.length,1);
  assert.equal(received[0].schema,PRIVATE_INVESTIGATIVE_WORK_SCHEMA);
  assert.equal(received[0].investigationId,result.record.investigationId);
  assert.equal(received[0].humanReviewRequired,true);
  assert.equal(runtime.get(result.record.investigationId).pendingWakeReasons.length,0);
  const serialized=JSON.stringify(received[0]);
  assert.equal(serialized.includes("jurisdiction"),false);
  assert.equal(serialized.includes("subjectRef"),false);
  assert.equal(serialized.includes("participantRef"),false);
  assert.equal(serialized.includes("public-request:fixture"),false);
});

test("ten humans converge on one backend execution and one canonical investigation",async()=>{
  const root=roots();
  let calls=0;
  const runtime=createInvestigationAutonomyRuntime({
    ...root,clock,
    backend:{async acceptWork(){calls++;return {accepted:true}}}
  });
  let id;
  for(let index=0;index<10;index++){
    const result=await runtime.request(request(`human:${index}`));
    id??=result.record.investigationId;
    assert.equal(result.record.investigationId,id);
  }
  assert.equal(calls,1);
  assert.equal(runtime.list().length,1);
  assert.equal(runtime.get(id).subscribers.length,10);
});

test("passive human activity persists without waking the backend",async()=>{
  const root=roots();
  let calls=0;
  const runtime=createInvestigationAutonomyRuntime({
    ...root,clock,
    backend:{async acceptWork(){calls++;return {accepted:true}}}
  });
  const opened=await runtime.request(request());
  assert.equal(calls,1);
  const comment=await runtime.contribute(opened.record.investigationId,{
    participantRef:"human:2",kind:"COMMENT",reference:"comment:public:1"
  });
  assert.equal(comment.stored,true);
  assert.equal(comment.awakened,false);
  assert.deepEqual(comment.events,[]);
  assert.equal(calls,1);
});

test("public source and dispute wake the shared backend without leaking their locator",async()=>{
  const root=roots();
  const received=[];
  const runtime=createInvestigationAutonomyRuntime({
    ...root,clock,
    backend:{async acceptWork(work){received.push(work);return {accepted:true}}}
  });
  const opened=await runtime.request(request());
  await runtime.contribute(opened.record.investigationId,{
    participantRef:"human:2",kind:"PUBLIC_SOURCE",reference:"https://public.example/record/123"
  });
  await runtime.contribute(opened.record.investigationId,{
    participantRef:"human:3",kind:"DISPUTE",reference:"public-dispute:456"
  });
  assert.equal(received.length,3);
  assert.equal(JSON.stringify(received).includes("public.example"),false);
  assert.equal(JSON.stringify(received).includes("public-dispute:456"),false);
});

test("restart recovers queue work that was persisted before its event",async()=>{
  const root=roots();
  const queue=createDurableInvestigationQueue({root:root.queueRoot,clock});
  const seeded=queue.request(request());
  let calls=0;
  const runtime=createInvestigationAutonomyRuntime({
    ...root,clock,
    backend:{async acceptWork(){calls++;return {accepted:true}}}
  });
  const recovered=await runtime.recoverPending();
  assert.equal(recovered.length,1);
  assert.equal(recovered[0].event.status,"accepted");
  assert.equal(calls,1);
  assert.equal(runtime.get(seeded.record.investigationId).pendingWakeReasons.length,0);
});

test("backend failure keeps work pending and retry requires explicit authorization",async()=>{
  const root=roots();
  let fail=true,calls=0;
  const runtime=createInvestigationAutonomyRuntime({
    ...root,clock,
    backend:{async acceptWork(){
      calls++;
      if(fail)throw new Error("PRIVATE_BACKEND_UNAVAILABLE");
      return {accepted:true,receiptRef:"private:recovered"};
    }}
  });
  const opened=await runtime.request(request());
  assert.equal(opened.events[0].results[0].status,"rejected");
  assert.equal(runtime.get(opened.record.investigationId).pendingWakeReasons.length,1);
  assert.equal(runtime.queue.getLease(opened.record.investigationId).status,"released-failed");

  fail=false;
  const passive=await runtime.recoverPending();
  assert.equal(passive[0].event.status,"duplicate");
  assert.equal(calls,1);
  assert.equal(runtime.get(opened.record.investigationId).pendingWakeReasons.length,1);

  const authorized=await runtime.recoverPending({authorizeFailedRetry:true});
  const retry=authorized.find(item=>item.kind==="authorized-retry");
  assert.equal(retry.event.status,"accepted");
  assert.equal(retry.event.results[0].status,"fulfilled");
  assert.equal(calls,2);
  assert.equal(runtime.get(opened.record.investigationId).pendingWakeReasons.length,0);
});

test("backend rejection and unsafe runtime configuration fail closed",async()=>{
  const root=roots();
  const runtime=createInvestigationAutonomyRuntime({
    ...root,clock,
    backend:{async acceptWork(){return {accepted:false}}}
  });
  const result=await runtime.request(request());
  assert.equal(result.events[0].results[0].status,"rejected");
  assert.equal(runtime.get(result.record.investigationId).pendingWakeReasons.length,1);
  assert.throws(()=>createInvestigationAutonomyRuntime({...roots(),clock}),/BACKEND_REQUIRED/);
  assert.equal(INVESTIGATION_WAKEUP_SCHEMA,"arca.investigation-wakeup.v0.1");
});
