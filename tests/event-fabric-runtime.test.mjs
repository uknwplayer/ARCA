import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createAgentDispatchPolicy} from "../src/machine-bridge/event-agent-dispatch-policy.mjs";
import {createEventFabricRuntime} from "../src/machine-bridge/event-fabric-runtime.mjs";

const tempRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-event-runtime-"));
const fixedClock=()=>"2026-09-19T00:00:00Z";
const policy=createAgentDispatchPolicy({routes:{"case.candidate":["auditor.copilot"]}});

test("event fabric runtime composes durable store, stable policy handler and ACK recovery",async()=>{
  const root=tempRoot();
  const runtime=createEventFabricRuntime({
    root,
    policy,
    agents:{"auditor.copilot":async event=>({subject:event.subject})},
    eventTypes:["case.candidate"],
    clock:fixedClock
  });

  const result=await runtime.publish({type:"case.candidate",source:"discovery",subject:"case:runtime"});
  assert.equal(result.status,"accepted");
  assert.equal(result.results[0].handlerId,"agent:auditor.copilot");
  assert.equal(result.results[0].status,"fulfilled");
  assert.deepEqual(runtime.handlerIds("case.candidate"),["agent:auditor.copilot"]);
  assert.equal(runtime.recover(result.eventId,"case.candidate")[0].state,"completed");
  assert.equal(runtime.events().length,1);
});

test("runtime recreation observes failed delivery without implicit redelivery",async()=>{
  const root=tempRoot();
  let calls=0;
  const first=createEventFabricRuntime({
    root,
    policy,
    agents:{"auditor.copilot":async()=>{calls++;throw new Error("REMOTE_TIMEOUT")}},
    eventTypes:["case.candidate"],
    clock:fixedClock
  });
  const input={type:"case.candidate",source:"discovery",subject:"case:uncertain"};

  const failed=await first.publish(input);
  assert.equal(failed.results[0].status,"rejected");
  assert.equal(calls,1);

  const second=createEventFabricRuntime({
    root,
    policy,
    agents:{"auditor.copilot":async()=>{calls++;return "must-not-run"}},
    eventTypes:["case.candidate"],
    clock:fixedClock
  });

  const duplicate=await second.publish(input);
  assert.equal(duplicate.eventId,failed.eventId);
  assert.equal(duplicate.status,"duplicate");
  assert.equal(calls,1);

  const [state]=second.recover(failed.eventId,"case.candidate");
  assert.equal(state.state,"failed-uncertain");
  assert.equal(state.action,"human-or-idempotency-policy-review");
  assert.equal(state.errorCode,"REMOTE_TIMEOUT");
});

test("runtime fails closed on unsupported or unconfigured recovery event types",()=>{
  const root=tempRoot();
  const runtime=createEventFabricRuntime({
    root,
    policy,
    agents:{"auditor.copilot":async()=>null},
    eventTypes:["case.candidate"],
    clock:fixedClock
  });
  assert.throws(()=>runtime.handlerIds("shell.execute"),/ARCA_EVENT_RUNTIME_EVENT_TYPE_INVALID/);
  assert.throws(()=>runtime.recover("a".repeat(64),"ci.completed"),/ARCA_EVENT_RUNTIME_EVENT_TYPE_NOT_CONFIGURED/);
});
