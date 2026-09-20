import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createAgentDispatchPolicy} from "../../src/machine-bridge/event-agent-dispatch-policy.mjs";
import {createPolicyProjectedHandlers} from "../../src/machine-bridge/event-agent-handler-projection.mjs";
import {createEventFabric} from "../../src/machine-bridge/event-fabric.mjs";
import {createEventDeliveryLedger} from "../../src/machine-bridge/event-delivery-ledger.mjs";

const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-policy-delivery-"));
const policy=createAgentDispatchPolicy({routes:{"case.candidate":["auditor.copilot"]}});

function compose({deliveryRoot,handle}){
  const handlers=createPolicyProjectedHandlers({policy,agents:{"auditor.copilot":handle},eventTypes:["case.candidate"]});
  const deliveryLedger=createEventDeliveryLedger({root:deliveryRoot});
  return {fabric:createEventFabric({handlers,deliveryLedger,clock:()=>"2026-09-18T00:00:00Z"}),deliveryLedger};
}

test("projected agent is claimed and acked under its stable handler identity",async()=>{
  const deliveryRoot=root();
  const {fabric,deliveryLedger}=compose({deliveryRoot,handle:async()=>"ok"});
  const result=await fabric.publish({type:"case.candidate",source:"discovery",subject:"case:x"});
  const [{handlerId,status}]=result.results;
  assert.equal(handlerId,"agent:auditor.copilot");
  assert.equal(status,"fulfilled");
  assert.equal(deliveryLedger.get(result.eventId,handlerId).status,"acked");
});

test("failed projected delivery remains failed and cannot be implicitly redelivered",async()=>{
  const deliveryRoot=root();
  let calls=0;
  const first=compose({deliveryRoot,handle:async()=>{calls++;throw new Error("TIMEOUT")}});
  const input={type:"case.candidate",source:"discovery",subject:"case:y"};
  const failed=await first.fabric.publish(input);
  assert.equal(failed.results[0].status,"rejected");
  assert.equal(first.deliveryLedger.get(failed.eventId,"agent:auditor.copilot").status,"failed");

  const second=compose({deliveryRoot,handle:async()=>{calls++;return "must-not-run"}});
  const recovered=await second.fabric.publish(input);
  assert.equal(recovered.results[0].status,"uncertain");
  assert.equal(recovered.results[0].deliveryStatus,"failed");
  assert.equal(calls,1);
});

test("claimed projected delivery remains uncertain after recreation and is not executed",async()=>{
  const deliveryRoot=root();
  const seed=compose({deliveryRoot,handle:async()=>"unused"});
  const probe=await createEventFabric({clock:()=>"2026-09-18T00:00:00Z"}).publish({type:"case.candidate",source:"discovery",subject:"case:z"});
  seed.deliveryLedger.claim(probe.eventId,"agent:auditor.copilot");

  let calls=0;
  const recovered=compose({deliveryRoot,handle:async()=>{calls++;return "must-not-run"}});
  const result=await recovered.fabric.publish({type:"case.candidate",source:"discovery",subject:"case:z"});
  assert.equal(result.eventId,probe.eventId);
  assert.equal(result.results[0].status,"uncertain");
  assert.equal(result.results[0].deliveryStatus,"claimed");
  assert.equal(calls,0);
});
