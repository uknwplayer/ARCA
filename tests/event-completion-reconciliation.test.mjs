import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createEventCompletionEvidenceLedger} from "../src/machine-bridge/event-completion-evidence-ledger.mjs";
import {createEventReconciliationController} from "../src/machine-bridge/event-reconciliation-controller.mjs";
import {createEventRecoveryPolicy} from "../src/machine-bridge/event-recovery-policy.mjs";
import {createEventRecoveryView} from "../src/machine-bridge/event-recovery-view.mjs";
import {createFilesystemEventStore} from "../src/machine-bridge/event-filesystem-store.mjs";
import {createEventDeliveryLedger} from "../src/machine-bridge/event-delivery-ledger.mjs";
import {createEventFabric} from "../src/machine-bridge/event-fabric.mjs";

const tempRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-event-reconcile-"));
const clock=()=>"2026-09-19T15:00:00Z";
const handlerId="agent:auditor";
const resultHash="1".repeat(64);
const evidenceHash="2".repeat(64);

async function setup(subject){
  const root=tempRoot();
  const store=createFilesystemEventStore({root});
  const persisted=await createEventFabric({store,clock}).publish({type:"case.candidate",source:"discovery",subject});
  const deliveryLedger=createEventDeliveryLedger({root,clock});
  const evidenceLedger=createEventCompletionEvidenceLedger({root,clock});
  const policy=createEventRecoveryPolicy({rules:{
    [handlerId]:{unclaimed:"first-claim",claimed:"reconcile-only",failed:"reconcile-only"}
  }});
  return {root,store,persisted,deliveryLedger,evidenceLedger,policy};
}

test("completion evidence ledger is create-only and conflict detecting",()=>{
  const root=tempRoot();
  const ledger=createEventCompletionEvidenceLedger({root,clock});
  const eventId="a".repeat(64);
  const first=ledger.record({eventId,handlerId,resultHash,evidenceHash,sourceId:"remote.node"});
  assert.equal(first.created,true);
  const again=ledger.record({eventId,handlerId,resultHash,evidenceHash,sourceId:"remote.node"});
  assert.equal(again.created,false);
  assert.equal(again.evidence.recordHash,first.evidence.recordHash);
  assert.throws(()=>ledger.record({
    eventId,handlerId,resultHash:"3".repeat(64),evidenceHash,sourceId:"remote.node"
  }),/ARCA_COMPLETION_EVIDENCE_CONFLICT/);
});

test("reconciler records verified completion for claimed ambiguous delivery without redispatch",async()=>{
  const s=await setup("case:claimed-evidence");
  s.deliveryLedger.claim(s.persisted.eventId,handlerId);
  let lookups=0;
  const controller=createEventReconciliationController({
    store:s.store,
    deliveryLedger:s.deliveryLedger,
    evidenceLedger:s.evidenceLedger,
    recoveryPolicy:s.policy,
    completionSource:{lookupVerified:async()=>{lookups++;return{
      eventId:s.persisted.eventId,
      handlerId,
      resultHash,
      evidenceHash,
      sourceId:"remote.node"
    }}}
  });

  const result=await controller.reconcile(s.persisted.eventId,handlerId);
  assert.equal(result.status,"completed-evidenced");
  assert.equal(result.created,true);
  assert.equal(lookups,1);
  assert.equal(s.deliveryLedger.get(s.persisted.eventId,handlerId).status,"claimed");

  const view=createEventRecoveryView({deliveryLedger:s.deliveryLedger,completionEvidence:s.evidenceLedger});
  const [state]=view.inspect(s.persisted.eventId,[handlerId]);
  assert.equal(state.state,"completed-evidenced");
  assert.equal(state.action,"none");
  assert.equal(state.resultHash,resultHash);
});

test("failed delivery can be reconciled observationally but is not retried",async()=>{
  const s=await setup("case:failed-evidence");
  s.deliveryLedger.claim(s.persisted.eventId,handlerId);
  s.deliveryLedger.fail(s.persisted.eventId,handlerId,"TIMEOUT");
  const controller=createEventReconciliationController({
    store:s.store,
    deliveryLedger:s.deliveryLedger,
    evidenceLedger:s.evidenceLedger,
    recoveryPolicy:s.policy,
    completionSource:{lookupVerified:async()=>({
      eventId:s.persisted.eventId,handlerId,resultHash,evidenceHash,sourceId:"remote.node"
    })}
  });

  const result=await controller.reconcile(s.persisted.eventId,handlerId);
  assert.equal(result.status,"completed-evidenced");
  assert.equal(s.deliveryLedger.get(s.persisted.eventId,handlerId).status,"failed");
});

test("reconciler leaves ambiguous delivery unresolved when verified source has no completion",async()=>{
  const s=await setup("case:no-evidence");
  s.deliveryLedger.claim(s.persisted.eventId,handlerId);
  const controller=createEventReconciliationController({
    store:s.store,
    deliveryLedger:s.deliveryLedger,
    evidenceLedger:s.evidenceLedger,
    recoveryPolicy:s.policy,
    completionSource:{lookupVerified:async()=>null}
  });
  const result=await controller.reconcile(s.persisted.eventId,handlerId);
  assert.equal(result.status,"unresolved");
  assert.equal(s.evidenceLedger.get(s.persisted.eventId,handlerId),null);
  assert.equal(s.deliveryLedger.get(s.persisted.eventId,handlerId).status,"claimed");
});

test("reconciler never queries completion source for unclaimed delivery",async()=>{
  const s=await setup("case:unclaimed-no-reconcile");
  let lookups=0;
  const controller=createEventReconciliationController({
    store:s.store,
    deliveryLedger:s.deliveryLedger,
    evidenceLedger:s.evidenceLedger,
    recoveryPolicy:s.policy,
    completionSource:{lookupVerified:async()=>{lookups++;return null}}
  });
  const result=await controller.reconcile(s.persisted.eventId,handlerId);
  assert.equal(result.status,"blocked");
  assert.equal(result.reason,"no-delivery");
  assert.equal(lookups,0);
});

test("mismatched completion evidence fails closed and is not persisted",async()=>{
  const s=await setup("case:mismatch-evidence");
  s.deliveryLedger.claim(s.persisted.eventId,handlerId);
  const controller=createEventReconciliationController({
    store:s.store,
    deliveryLedger:s.deliveryLedger,
    evidenceLedger:s.evidenceLedger,
    recoveryPolicy:s.policy,
    completionSource:{lookupVerified:async()=>({
      eventId:"f".repeat(64),handlerId,resultHash,evidenceHash,sourceId:"remote.node"
    })}
  });
  await assert.rejects(()=>controller.reconcile(s.persisted.eventId,handlerId),/ARCA_RECONCILIATION_EVIDENCE_CORRELATION_MISMATCH/);
  assert.equal(s.evidenceLedger.get(s.persisted.eventId,handlerId),null);
});
