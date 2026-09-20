import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {FsMachineBridgeTransport} from "../src/machine-bridge/fs-transport.mjs";
import {MachineBridgeRemoteClient} from "../src/machine-bridge/remote-client.mjs";

const job=(overrides={})=>({
  format:"arca-remote-job-v3",protocolVersion:3,jobId:"job-direct-1",requestId:"req-direct-1",
  action:"worker.ping",requires:[],params:{echo:"hello"},...overrides
});

test("remote client submits and returns only the correlated terminal result",async()=>{
  let polls=0;let submitted=null;
  const transport={
    async enqueue(value,options){submitted={value,options};return true},
    async getResult(){polls+=1;if(polls===1)return null;return {result:{format:"arca-result-v1",protocolVersion:3,jobId:"job-direct-1",requestId:"req-direct-1",status:"completed",output:{ok:true}}}}
  };
  const client=new MachineBridgeRemoteClient({transport,sleepImpl:async()=>{},now:()=>0});
  const result=await client.call(job(),{queue:"shared",waitTimeoutMs:5000,pollIntervalMs:100});
  assert.equal(submitted.value.requestId,"req-direct-1");
  assert.equal(submitted.options.queue,"shared");
  assert.equal(polls,2);
  assert.equal(result.status,"completed");
});

test("remote client fails closed on request correlation mismatch",async()=>{
  const transport={
    async enqueue(){return true},
    async getResult(){return {result:{jobId:"job-direct-1",requestId:"req-other",status:"completed"}}}
  };
  const client=new MachineBridgeRemoteClient({transport,sleepImpl:async()=>{},now:()=>0});
  await assert.rejects(()=>client.call(job(),{waitTimeoutMs:5000,pollIntervalMs:100}),/request correlation mismatch/);
});

test("remote client rejects duplicate submission and bounded wait timeout",async()=>{
  const duplicate=new MachineBridgeRemoteClient({transport:{enqueue:async()=>false,getResult:async()=>null}});
  await assert.rejects(()=>duplicate.submit(job()),/job already exists/);

  let now=-1000;
  const timeout=new MachineBridgeRemoteClient({
    transport:{enqueue:async()=>true,getResult:async()=>null},
    sleepImpl:async()=>{},now:()=>{now+=1000;return now}
  });
  await timeout.submit(job());
  await assert.rejects(()=>timeout.waitForResult(job(),{waitTimeoutMs:1000,pollIntervalMs:100}),/timed out waiting for result/);
});

test("filesystem transport supports direct result lookup for transport-neutral calls",async()=>{
  const root=await mkdtemp(join(tmpdir(),"arca-direct-call-"));
  const transport=new FsMachineBridgeTransport(root);
  await transport.init("worker-test");
  assert.equal(await transport.getResult("job-direct-1"),null);
  const result={format:"arca-result-v1",protocolVersion:3,jobId:"job-direct-1",requestId:"req-direct-1",status:"completed"};
  assert.equal(await transport.writeResult(result),true);
  const loaded=await transport.getResult("job-direct-1");
  assert.equal(loaded.result.requestId,"req-direct-1");
  assert.equal(await transport.hasResult("job-direct-1"),true);
});
