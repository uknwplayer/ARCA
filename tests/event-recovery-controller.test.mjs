import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createEventFabric} from "../src/machine-bridge/event-fabric.mjs";
import {createFilesystemEventStore} from "../src/machine-bridge/event-filesystem-store.mjs";
import {createEventDeliveryLedger} from "../src/machine-bridge/event-delivery-ledger.mjs";
import {createEventRecoveryController} from "../src/machine-bridge/event-recovery-controller.mjs";

const tempRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-event-recovery-"));
const clock=()=>"2026-09-19T13:00:00Z";

async function persistOnly(store,subject){
  return createEventFabric({store,clock}).publish({
    type:"case.candidate",
    source:"discovery",
    subject
  });
}

test("recovery controller executes only a persisted handler with no prior delivery claim",async()=>{
  const root=tempRoot();
  const store=createFilesystemEventStore({root});
  const ledger=createEventDeliveryLedger({root,clock});
  const persisted=await persistOnly(store,"case:recover-first");

  let calls=0;
  const controller=createEventRecoveryController({
    store,
    deliveryLedger:ledger,
    handlers:{
      "case.candidate":[{
        id:"agent:auditor",
        handle:async event=>{calls++;return event.subject}
      }]
    }
  });

  const recovered=await controller.recover(persisted.eventId);
  assert.equal(recovered.status,"recovered");
  assert.equal(recovered.results[0].status,"fulfilled");
  assert.equal(recovered.results[0].value,"case:recover-first");
  assert.equal(calls,1);
  assert.equal(ledger.get(persisted.eventId,"agent:auditor").status,"acked");

  const repeated=await controller.recover(persisted.eventId);
  assert.equal(repeated.results[0].status,"already-acked");
  assert.equal(calls,1);
});

test("recovery controller never replays an existing claimed delivery",async()=>{
  const root=tempRoot();
  const store=createFilesystemEventStore({root});
  const ledger=createEventDeliveryLedger({root,clock});
  const persisted=await persistOnly(store,"case:claimed");
  ledger.claim(persisted.eventId,"agent:auditor");

  let calls=0;
  const controller=createEventRecoveryController({
    store,
    deliveryLedger:ledger,
    handlers:{"case.candidate":[{id:"agent:auditor",handle:async()=>{calls++}}]}
  });

  const result=await controller.recover(persisted.eventId);
  assert.equal(result.results[0].status,"uncertain");
  assert.equal(result.results[0].deliveryStatus,"claimed");
  assert.equal(calls,0);
});

test("recovery controller never retries a failed delivery",async()=>{
  const root=tempRoot();
  const store=createFilesystemEventStore({root});
  const ledger=createEventDeliveryLedger({root,clock});
  const persisted=await persistOnly(store,"case:failed");
  ledger.claim(persisted.eventId,"agent:auditor");
  ledger.fail(persisted.eventId,"agent:auditor","REMOTE_TIMEOUT");

  let calls=0;
  const controller=createEventRecoveryController({
    store,
    deliveryLedger:ledger,
    handlers:{"case.candidate":[{id:"agent:auditor",handle:async()=>{calls++}}]}
  });

  const result=await controller.recover(persisted.eventId);
  assert.equal(result.results[0].status,"uncertain");
  assert.equal(result.results[0].deliveryStatus,"failed");
  assert.equal(calls,0);
});

test("recovery controller fails closed for missing persisted events",async()=>{
  const root=tempRoot();
  const controller=createEventRecoveryController({
    store:createFilesystemEventStore({root}),
    deliveryLedger:createEventDeliveryLedger({root})
  });
  await assert.rejects(()=>controller.recover("c".repeat(64)),/ARCA_RECOVERY_EVENT_MISSING/);
});
