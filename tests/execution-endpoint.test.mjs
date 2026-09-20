import test from "node:test";
import assert from "node:assert/strict";
import {ExecutionEndpointRegistry,createExecutionEndpointDescriptor,machineBridgeJobTaskHash,wakeExecutionEndpointForJob} from "../src/machine-bridge/execution-endpoint.mjs";

function job(){return {format:"arca-remote-job-v3",protocolVersion:3,jobId:"job-001",requestId:"req-001",action:"worker.describe",requires:[],params:{secretContext:"must-not-leak"}}}

test("endpoint registry discovers capabilities without granting authority",()=>{
  const registry=new ExecutionEndpointRegistry();
  const descriptor=createExecutionEndpointDescriptor({endpointId:"edge.local",participantKind:"worker",capabilities:["routing","routing","extract"],operations:{heartbeat:true},transport:{kind:"filesystem",rootClass:"local-state"}});
  registry.register(descriptor,{heartbeat:async()=>({ok:true})});
  assert.deepEqual(registry.capabilities("edge.local"),["extract","routing"]);
  assert.equal(registry.discover({capability:"routing"})[0].authority.executionAuthority,false);
  assert.equal(registry.get("edge.local").authority.codeMutation,false);
});

test("undeclared endpoint operations fail closed",async()=>{
  const registry=new ExecutionEndpointRegistry();
  registry.register(createExecutionEndpointDescriptor({endpointId:"wake.only",capabilities:[],operations:{wake:true},transport:{kind:"test"}}),{wake:async()=>({ok:true})});
  await assert.rejects(()=>registry.claim("wake.only",{}),error=>error.code==="ARCA_EXECUTION_ENDPOINT_OPERATION_UNSUPPORTED");
});

test("Machine Bridge wake exposes correlation hash but never raw job params",async()=>{
  let observed=null;
  const registry=new ExecutionEndpointRegistry();
  registry.register(createExecutionEndpointDescriptor({endpointId:"work",capabilities:["reasoning"],operations:{wake:true},transport:{kind:"test"}}),{wake:async wake=>(observed=wake,{stored:true})});
  const source=job();
  const result=await wakeExecutionEndpointForJob({registry,endpointId:"work",job:source,createdAt:"2026-09-20T11:00:00.000Z"});
  assert.equal(result.wake.taskRef,"machine-bridge:job-001");
  assert.equal(result.wake.taskHash,machineBridgeJobTaskHash(source));
  assert.equal(result.wake.requestId,"req-001");
  assert.equal(result.wake.authority.codeMutation,false);
  assert.equal("params" in observed,false);
  assert.equal(JSON.stringify(observed).includes("must-not-leak"),false);
});

test("transport descriptors cannot smuggle credential fields",()=>{
  assert.throws(()=>createExecutionEndpointDescriptor({endpointId:"bad",operations:{},transport:{kind:"http",secret:"x"}}),/SECRET_FIELD_FORBIDDEN/);
});
