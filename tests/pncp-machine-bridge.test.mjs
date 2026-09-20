import test from "node:test";
import assert from "node:assert/strict";
import {createDefaultActionRegistry} from "../src/machine-bridge/action-registry.mjs";
import {canExecuteJob,executeClaimedJob} from "../src/machine-bridge/worker-runtime.mjs";

const worker={format:"arca-worker-v1",workerId:"pncp-planner",capabilities:["pncp-plan"],heartbeatAt:"2026-09-16T13:00:00.000Z"};
const job={format:"arca-remote-job-v3",protocolVersion:3,jobId:"pncp-plan-1",action:"pncp.plan",requires:["pncp-plan"],params:{target:{cnpj:"12345678000195",ano:2026,sequencial:7}}};

test("pncp.plan e capability-gated, plan-only e sem rede",async()=>{
  const registry=createDefaultActionRegistry({worker});
  assert.equal(canExecuteJob(job,worker,registry),true);
  assert.equal(canExecuteJob(job,{...worker,capabilities:[]},registry),false);
  const output=await registry.run(job,{worker});
  assert.equal(output.format,"arca-pncp-request-plan-v1");
  assert.equal(output.execution,"plan-only");
  assert.equal(output.networkUsed,false);
  assert.equal(output.networkAllowedByPlan,false);
  assert.equal(output.humanAuthorizationRequiredForNetwork,true);
  assert.ok(output.requests.every(request=>request.method==="GET"&&request.authenticationRequired===false));
});

test("pncp.plan recusa tentativa de ligar rede pelo job",async()=>{
  const registry=createDefaultActionRegistry({worker});
  await assert.rejects(()=>registry.run({...job,params:{...job.params,allowNetwork:true}},{worker}),/never enables network/);
});

test("pncp.plan produz resultado terminal duravel sem executar fetch",async()=>{
  const registry=createDefaultActionRegistry({worker});
  const claim={format:"arca-claim-v1",jobId:job.jobId,workerId:worker.workerId,claimedAt:"2026-09-16T13:00:00.000Z",leaseExpiresAt:"2026-09-16T13:10:00.000Z",attempt:1};
  const result=await executeClaimedJob({job,worker,claim,registry,now:()=>new Date("2026-09-16T13:00:01.000Z")});
  assert.equal(result.status,"completed");
  assert.equal(result.output.networkUsed,false);
  assert.equal(result.output.execution,"plan-only");
});
