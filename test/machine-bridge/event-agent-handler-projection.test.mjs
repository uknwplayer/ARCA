import test from "node:test";
import assert from "node:assert/strict";
import {createAgentDispatchPolicy} from "../../src/machine-bridge/event-agent-dispatch-policy.mjs";
import {projectAgentHandlers,createPolicyProjectedHandlers} from "../../src/machine-bridge/event-agent-handler-projection.mjs";

test("policy routes become stable identified handlers",()=>{
  const policy=createAgentDispatchPolicy({routes:{"case.candidate":["auditor.copilot"]}});
  const handle=async()=>"ok";
  const project=projectAgentHandlers({policy,agents:{"auditor.copilot":handle}});
  const [entry]=project({type:"case.candidate"});
  assert.equal(entry.id,"agent:auditor.copilot");assert.equal(entry.status,"ready");assert.equal(entry.handle,handle);
});

test("unavailable agent remains observable and is never substituted",()=>{
  const policy=createAgentDispatchPolicy({routes:{"auditor.contradiction":["auditor.copilot"]}});
  assert.deepEqual(projectAgentHandlers({policy,agents:{}})({type:"auditor.contradiction"}),[{id:"agent:auditor.copilot",agentId:"auditor.copilot",status:"unavailable"}]);
});

test("fabric handler table includes only explicit ready routes",()=>{
  const policy=createAgentDispatchPolicy({routes:{"ci.completed":["steward.tech"],"case.candidate":["auditor.copilot"]}});
  const handlers=createPolicyProjectedHandlers({policy,agents:{"steward.tech":async()=>true},eventTypes:["ci.completed","case.candidate"]});
  assert.equal(handlers["ci.completed"].length,1);assert.equal(handlers["ci.completed"][0].id,"agent:steward.tech");assert.deepEqual(handlers["case.candidate"],[]);
});
