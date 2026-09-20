import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {verifyCustody} from "../packages/acquisition/src/index.ts";
import {createDefaultActionRegistry} from "../src/machine-bridge/action-registry.mjs";
import {canExecuteJob,executeClaimedJob} from "../src/machine-bridge/worker-runtime.mjs";

const target={cnpj:"12345678000195",ano:2026,sequencial:7};
const worker={format:"arca-worker-v1",workerId:"pncp-local-01",capabilities:["pncp-public-network"],heartbeatAt:"2026-09-16T13:40:00.000Z"};

function fakeFetch(){
  return async url=>{
    const path=new URL(url).pathname;
    let status=404;
    let body={};
    if(path.endsWith("/compras/2026/7")){
      status=200;
      body={numeroControlePNCP:"12345678000195-1-000007/2026",processo:"PROC-7/2026",objetoCompra:"Fixture"};
    }else if(path.endsWith("/compras/2026/7/itens")){
      status=200;
      body=[];
    }
    const text=JSON.stringify(body);
    return new Response(text,{status,headers:{"content-type":"application/json","content-length":String(new TextEncoder().encode(text).byteLength)}});
  };
}

async function harness(t){
  const root=await mkdtemp(join(tmpdir(),"arca-pncp-network-"));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const custodyHome=join(root,"custody");
  const stagingRoot=join(root,"staging");
  const registry=createDefaultActionRegistry({
    worker,
    pncpNetwork:{enabled:true,custodyHome,stagingRoot,fetchImpl:fakeFetch(),maxRetries:0}
  });
  return {root,custodyHome,stagingRoot,registry};
}

function job(params={}){
  return {
    format:"arca-remote-job-v3",
    protocolVersion:3,
    jobId:"pncp-network-job-1",
    action:"pncp.acquire-public",
    requires:["pncp-public-network"],
    params:{target,investigationId:"INV-PNCP-NETWORK-TEST",sourceId:"SRC-PNCP-PUBLIC",...params}
  };
}

test("network action is absent unless host explicitly configures PNCP network",()=>{
  const registry=createDefaultActionRegistry({worker});
  assert.equal(registry.get("pncp.acquire-public"),null);
});

test("configured PNCP network action remains capability gated",async t=>{
  const {registry}=await harness(t);
  assert.deepEqual(registry.get("pncp.acquire-public").requires,["pncp-public-network"]);
  assert.equal(canExecuteJob(job({authorizePublicNetwork:true}),worker,registry),true);
  assert.equal(canExecuteJob(job({authorizePublicNetwork:true}),{...worker,capabilities:[]},registry),false);
});

test("PNCP public acquisition refuses a job without explicit network authorization",async t=>{
  const {registry}=await harness(t);
  await assert.rejects(()=>registry.run(job(),{worker}),/autorizacao explicita/);
});

test("PNCP public acquisition captures every successful response before releasing metadata",async t=>{
  const {registry,custodyHome}=await harness(t);
  const output=await registry.run(job({authorizePublicNetwork:true}),{worker});
  assert.equal(output.format,"arca-pncp-public-acquisition-v1");
  assert.equal(output.networkUsed,true);
  assert.equal(output.analysisMayProceed,true);
  assert.equal(output.rawBytesReturned,false);
  assert.equal(output.humanReviewRequired,true);
  assert.equal(output.resources.length,4);
  assert.equal(output.resources.filter(item=>item.ok).length,2);
  assert.equal(output.capturedCount,2);
  assert.equal(output.captures.length,2);
  assert.ok(output.captures.every(item=>item.humanReviewRequired===true));
  assert.ok(output.captures.every(item=>/^[a-f0-9]{64}$/.test(item.originalSha256)));
  assert.equal(JSON.stringify(output).includes("numeroControlePNCP"),false);

  for(const capture of output.captures){
    const verified=await verifyCustody({home:custodyHome,investigationId:"INV-PNCP-NETWORK-TEST",acquisitionId:capture.acquisitionId});
    assert.equal(verified.valid,true);
    assert.equal(verified.manifest.original.originalSha256,capture.originalSha256);
  }
});

test("PNCP network action produces a bounded durable terminal result",async t=>{
  const {registry}=await harness(t);
  const networkJob=job({authorizePublicNetwork:true});
  const claim={format:"arca-claim-v1",jobId:networkJob.jobId,workerId:worker.workerId,claimedAt:"2026-09-16T13:40:00.000Z",leaseExpiresAt:"2026-09-16T13:45:00.000Z",attempt:1};
  const result=await executeClaimedJob({job:networkJob,worker,claim,registry,now:()=>new Date("2026-09-16T13:40:01.000Z")});
  assert.equal(result.status,"completed");
  assert.equal(result.output.rawBytesReturned,false);
  assert.equal(result.output.analysisMayProceed,true);
  assert.ok(JSON.stringify(result).length<100000);
});
