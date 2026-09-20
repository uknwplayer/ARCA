import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createEventRecoveryPolicy} from "../src/machine-bridge/event-recovery-policy.mjs";
import {createEventRecoveryController} from "../src/machine-bridge/event-recovery-controller.mjs";
import {createFilesystemEventStore} from "../src/machine-bridge/event-filesystem-store.mjs";
import {createEventDeliveryLedger} from "../src/machine-bridge/event-delivery-ledger.mjs";
import {createEventFabric} from "../src/machine-bridge/event-fabric.mjs";

const tempRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-recovery-policy-"));
const clock=()=>"2026-09-19T14:00:00Z";
const handlerId="agent:auditor";

async function persisted(root,subject){
  const store=createFilesystemEventStore({root});
  const event=await createEventFabric({store,clock}).publish({type:"case.candidate",source:"discovery",subject});
  return {store,event};
}

test("recovery policy has no implicit handler authorization",()=>{
  const policy=createEventRecoveryPolicy();
  assert.deepEqual(policy.decide({handlerId,delivery:null}),{action:"blocked",reason:"no-explicit-rule"});
  assert.deepEqual(policy.decide({handlerId,delivery:{status:"claimed"}}),{action:"blocked",reason:"no-explicit-rule"});
  assert.deepEqual(policy.decide({handlerId,delivery:{status:"acked"}}),{action:"complete",reason:"already-acked"});
});

test("policy can authorize first claim while keeping ambiguous states reconcile-only",()=>{
  const policy=createEventRecoveryPolicy({rules:{
    [handlerId]:{unclaimed:"first-claim",claimed:"reconcile-only",failed:"reconcile-only"}
  }});
  assert.equal(policy.decide({handlerId,delivery:null}).action,"first-claim");
  assert.equal(policy.decide({handlerId,delivery:{status:"claimed"}}).action,"reconcile-only");
  assert.equal(policy.decide({handlerId,delivery:{status:"failed"}}).action,"reconcile-only");
});

test("recovery controller obeys explicit first-claim policy",async()=>{
  const root=tempRoot();
  const {store,event}=await persisted(root,"case:policy-first");
  const ledger=createEventDeliveryLedger({root,clock});
  const policy=createEventRecoveryPolicy({rules:{
    [handlerId]:{unclaimed:"first-claim",claimed:"reconcile-only",failed:"reconcile-only"}
  }});
  let calls=0;
  const controller=createEventRecoveryController({
    store,
    deliveryLedger:ledger,
    recoveryPolicy:policy,
    handlers:{"case.candidate":[{id:handlerId,handle:async()=>{calls++;return "ok"}}]}
  });

  const result=await controller.recover(event.eventId);
  assert.equal(result.results[0].status,"fulfilled");
  assert.equal(result.results[0].recoveryAction,"first-claim");
  assert.equal(calls,1);
});

test("recovery controller blocks unclaimed work when policy has no rule",async()=>{
  const root=tempRoot();
  const {store,event}=await persisted(root,"case:policy-block");
  const ledger=createEventDeliveryLedger({root,clock});
  let calls=0;
  const controller=createEventRecoveryController({
    store,
    deliveryLedger:ledger,
    recoveryPolicy:createEventRecoveryPolicy(),
    handlers:{"case.candidate":[{id:handlerId,handle:async()=>{calls++}}]}
  });

  const result=await controller.recover(event.eventId);
  assert.equal(result.results[0].status,"blocked");
  assert.equal(result.results[0].recoveryReason,"no-explicit-rule");
  assert.equal(ledger.get(event.eventId,handlerId),null);
  assert.equal(calls,0);
});

test("recovery policy never converts claimed or failed into retry",async()=>{
  const root=tempRoot();
  const {store,event}=await persisted(root,"case:policy-ambiguous");
  const ledger=createEventDeliveryLedger({root,clock});
  ledger.claim(event.eventId,handlerId);
  ledger.fail(event.eventId,handlerId,"TIMEOUT");
  const policy=createEventRecoveryPolicy({rules:{
    [handlerId]:{unclaimed:"first-claim",claimed:"reconcile-only",failed:"reconcile-only"}
  }});
  let calls=0;
  const controller=createEventRecoveryController({
    store,
    deliveryLedger:ledger,
    recoveryPolicy:policy,
    handlers:{"case.candidate":[{id:handlerId,handle:async()=>{calls++}}]}
  });

  const result=await controller.recover(event.eventId);
  assert.equal(result.results[0].status,"uncertain");
  assert.equal(result.results[0].deliveryStatus,"failed");
  assert.equal(result.results[0].recoveryAction,"reconcile-only");
  assert.equal(calls,0);
});

test("unsupported retry-like policy actions fail closed",()=>{
  assert.throws(()=>createEventRecoveryPolicy({rules:{
    [handlerId]:{unclaimed:"first-claim",failed:"retry"}
  }}),/ARCA_RECOVERY_POLICY_ACTION_INVALID/);
});
