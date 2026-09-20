import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createEventDeliveryLedger} from "../src/machine-bridge/event-delivery-ledger.mjs";
import {createEventFabric} from "../src/machine-bridge/event-fabric.mjs";

const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-delivery-owner-"));
const eventId="b".repeat(64);

test("delivery claim distinguishes the acquiring process from an observer",()=>{
  const deliveryRoot=root();
  const first=createEventDeliveryLedger({root:deliveryRoot,clock:()=>"t1"});
  const second=createEventDeliveryLedger({root:deliveryRoot,clock:()=>"t2"});

  const acquired=first.claim(eventId,"agent:auditor");
  const observed=second.claim(eventId,"agent:auditor");

  assert.equal(acquired.status,"claimed");
  assert.equal(acquired.acquired,true);
  assert.equal(observed.status,"claimed");
  assert.equal(observed.acquired,false);
  assert.equal(observed.delivery.claimedAt,"t1");
});

test("Event Fabric never executes a handler from an already-owned claim",async()=>{
  const deliveryRoot=root();
  const clock=()=>"2026-09-19T12:00:00Z";
  const input={type:"case.candidate",source:"discovery",subject:"case:claim-owner"};

  const probe=await createEventFabric({clock}).publish(input);
  const ledger=createEventDeliveryLedger({root:deliveryRoot,clock:()=>"claim-time"});
  const seeded=ledger.claim(probe.eventId,"agent:auditor");
  assert.equal(seeded.acquired,true);

  let calls=0;
  const fabric=createEventFabric({
    clock,
    deliveryLedger:ledger,
    handlers:{
      "case.candidate":[{
        id:"agent:auditor",
        handle:async()=>{calls++;return "must-not-run"}
      }]
    }
  });

  const result=await fabric.publish(input);
  assert.equal(result.eventId,probe.eventId);
  assert.equal(result.results[0].status,"uncertain");
  assert.equal(result.results[0].deliveryStatus,"claimed");
  assert.equal(calls,0);
});
