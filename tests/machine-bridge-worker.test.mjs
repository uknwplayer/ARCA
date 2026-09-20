import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ActionRegistry,createDefaultActionRegistry} from "../src/machine-bridge/action-registry.mjs";
import {FsMachineBridgeTransport} from "../src/machine-bridge/fs-transport.mjs";
import {canExecuteJob,executeClaimedJob} from "../src/machine-bridge/worker-runtime.mjs";

const worker={format:"arca-worker-v1",workerId:"worker-test",capabilities:["node","repository"],heartbeatAt:"2026-09-16T00:00:00.000Z"};
const job=(overrides={})=>({format:"arca-remote-job-v3",protocolVersion:3,jobId:"job-1",action:"worker.ping",requires:[],params:{echo:"ok"},...overrides});

test("default action registry exposes only explicitly registered safe actions",async()=>{
  const registry=createDefaultActionRegistry({worker,clock:()=>new Date("2026-09-16T12:00:00.000Z")});
  assert.deepEqual(registry.list(),[
    {name:"aie.analyze",requires:["aie"]},
    {name:"aie.procurement-profile",requires:["aie"]},
    {name:"pncp.discovery-plan",requires:["pncp-plan"]},
    {name:"pncp.plan",requires:["pncp-plan"]},
    {name:"repository.check",requires:["node","repository"]},
    {name:"repository.test",requires:["node","repository"]},
    {name:"worker.describe",requires:[]},
    {name:"worker.ping",requires:[]}
  ]);
  assert.deepEqual(await registry.run(job(),{worker}),{ok:true,workerId:"worker-test",at:"2026-09-16T12:00:00.000Z",echo:"ok"});
  await assert.rejects(()=>registry.run(job({action:"shell.exec"}),{worker}),/unregistered action/);
});

test("capability routing rejects incompatible workers without failing the job",()=>{
  const registry=new ActionRegistry().register("repo.inspect",{requires:["repository"],handler:async()=>({ok:true})});
  assert.equal(canExecuteJob(job({action:"repo.inspect",requires:["repository"]}),worker,registry),true);
  assert.equal(canExecuteJob(job({action:"repo.inspect",requires:["gpu"]}),worker,registry),false);
  assert.equal(canExecuteJob(job({action:"unknown"}),worker,registry),false);
});

test("filesystem transport grants one active lease and permits takeover after expiry",async()=>{
  const root=await mkdtemp(join(tmpdir(),"arca-worker-"));
  const transport=new FsMachineBridgeTransport(root);
  await transport.init(worker.workerId);
  const first=await transport.claim(job(),worker,{leaseMs:1000,now:new Date("2026-09-16T12:00:00.000Z")});
  assert.equal(first.attempt,1);
  assert.equal(await transport.claim(job(),worker,{leaseMs:1000,now:new Date("2026-09-16T12:00:00.500Z")}),null);
  const second=await transport.claim(job(),worker,{leaseMs:1000,now:new Date("2026-09-16T12:00:02.000Z")});
  assert.equal(second.attempt,2);
});

test("claimed registered job preserves request correlation in durable terminal result",async()=>{
  const root=await mkdtemp(join(tmpdir(),"arca-worker-"));
  const transport=new FsMachineBridgeTransport(root);
  const registry=createDefaultActionRegistry({worker,clock:()=>new Date("2026-09-16T12:00:00.500Z")});
  const correlatedJob=job({requestId:"req-direct-1"});
  await transport.init(worker.workerId);
  const claim=await transport.claim(correlatedJob,worker,{leaseMs:60000,now:new Date("2026-09-16T12:00:00.000Z")});
  const times=[new Date("2026-09-16T12:00:00.100Z"),new Date("2026-09-16T12:00:00.600Z")];
  const result=await executeClaimedJob({job:correlatedJob,worker,claim,registry,now:()=>times.shift()||new Date("2026-09-16T12:00:00.600Z")});
  assert.equal(result.status,"completed");
  assert.equal(result.requestId,"req-direct-1");
  assert.equal(result.output.echo,"ok");
  assert.equal(await transport.writeResult(result),true);
  assert.equal(await transport.writeResult(result),false);
  const stored=JSON.parse(await readFile(transport.resultPath("job-1"),"utf8"));
  assert.equal(stored.workerId,"worker-test");
  assert.equal(stored.requestId,"req-direct-1");
  assert.equal(stored.attempt,1);
});

test("action errors become bounded failed results and preserve request correlation",async()=>{
  const registry=new ActionRegistry().register("worker.fail",{handler:async()=>{throw new Error("boom")}});
  const failing=job({action:"worker.fail",requestId:"req-failed-1"});
  const transport=new FsMachineBridgeTransport(await mkdtemp(join(tmpdir(),"arca-worker-")));
  await transport.init(worker.workerId);
  const claim=await transport.claim(failing,worker,{leaseMs:60000});
  const result=await executeClaimedJob({job:failing,worker,claim,registry});
  assert.equal(result.status,"failed");
  assert.equal(result.requestId,"req-failed-1");
  assert.deepEqual(result.error,{name:"Error",message:"boom"});
  assert.equal("stack" in result.error,false);
});
