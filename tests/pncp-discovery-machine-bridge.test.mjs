import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {verifyCustody} from "../packages/acquisition/src/index.ts";
import {createDefaultActionRegistry} from "../src/machine-bridge/action-registry.mjs";
import {canExecuteJob,executeClaimedJob} from "../src/machine-bridge/worker-runtime.mjs";
import {PNCP_REMOTE_DISCOVERY_LIMITS} from "../src/machine-bridge/pncp-discovery-actions.mjs";

const planWorker={format:"arca-worker-v1",workerId:"pncp-plan-01",capabilities:["pncp-plan"],heartbeatAt:"2026-09-16T15:00:00.000Z"};
const networkWorker={...planWorker,workerId:"pncp-network-01",capabilities:["pncp-public-network"]};
const scope={dataInicial:"20260901",dataFinal:"20260905",codigoMunicipioIbge:"3505708"};

function planJob(params={}){
  return {format:"arca-remote-job-v3",protocolVersion:3,jobId:"pncp-discovery-plan-1",action:"pncp.discovery-plan",requires:["pncp-plan"],params:{scope,modalidadeIds:[6],...params}};
}

function publicJob(params={}){
  return {format:"arca-remote-job-v3",protocolVersion:3,jobId:"pncp-discovery-public-1",action:"pncp.discovery-public",requires:["pncp-public-network"],params:{scope,modalidadeIds:[6],investigationId:"INV-PNCP-DISCOVERY",sourceId:"SRC-PNCP-CONSULTA",authorizePublicNetwork:true,...params}};
}

function fakeFetch(){
  return async url=>{
    const parsed=new URL(url);
    assert.equal(parsed.origin,"https://pncp.gov.br");
    assert.equal(parsed.pathname,"/api/consulta/v1/contratacoes/publicacao");
    assert.equal(parsed.searchParams.get("codigoModalidadeContratacao"),"6");
    const body={
      data:[{
        numeroControlePNCP:"12345678000195-1-000007/2026",
        orgaoEntidade:{cnpj:"12345678000195"},
        anoCompra:2026,
        sequencialCompra:7,
        objetoCompra:"Fixture de descoberta controlada",
        modalidadeId:6,
        modalidadeNome:"Fixture",
        dataPublicacaoPncp:"2026-09-03T10:00:00Z",
        valorTotalEstimado:12345.67
      }],
      totalPaginas:1
    };
    const text=JSON.stringify(body);
    return new Response(text,{status:200,headers:{"content-type":"application/json","content-length":String(new TextEncoder().encode(text).byteLength)}});
  };
}

async function harness(t){
  const root=await mkdtemp(join(tmpdir(),"arca-pncp-discovery-"));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const custodyHome=join(root,"custody");
  const stagingRoot=join(root,"staging");
  const registry=createDefaultActionRegistry({worker:networkWorker,pncpNetwork:{enabled:true,custodyHome,stagingRoot,fetchImpl:fakeFetch(),maxRetries:0}});
  return {custodyHome,registry};
}

test("discovery plan is a safe default action and remains capability gated",async()=>{
  const registry=createDefaultActionRegistry({worker:planWorker});
  assert.deepEqual(registry.get("pncp.discovery-plan")?.requires,["pncp-plan"]);
  assert.equal(canExecuteJob(planJob(),planWorker,registry),true);
  assert.equal(canExecuteJob(planJob(),{...planWorker,capabilities:[]},registry),false);
  const output=await registry.run(planJob(),{worker:planWorker});
  assert.equal(output.format,"arca-pncp-discovery-plan-v2");
  assert.equal(output.execution,"plan-only");
  assert.equal(output.networkUsed,false);
  assert.equal(output.custodyRequiredBeforeParsing,true);
  assert.equal(output.humanReviewRequired,true);
});

test("discovery plan refuses network toggles and enforces remote budgets",async()=>{
  const registry=createDefaultActionRegistry({worker:planWorker});
  await assert.rejects(()=>registry.run(planJob({authorizePublicNetwork:true}),{worker:planWorker}),/never enables network/);
  await assert.rejects(()=>registry.run(planJob({maxTotalPages:PNCP_REMOTE_DISCOVERY_LIMITS.maxTotalPages+1}),{worker:planWorker}),/maxTotalPages/);
  await assert.rejects(()=>registry.run(planJob({maxRecords:PNCP_REMOTE_DISCOVERY_LIMITS.maxRecords+1}),{worker:planWorker}),/maxRecords/);
  await assert.rejects(()=>registry.run(planJob({pageSize:PNCP_REMOTE_DISCOVERY_LIMITS.maxPageSize+1}),{worker:planWorker}),/pageSize/);
});

test("network discovery is absent by default and appears only on an explicitly configured network worker",async t=>{
  const defaultRegistry=createDefaultActionRegistry({worker:networkWorker});
  assert.equal(defaultRegistry.get("pncp.discovery-public"),null);
  const {registry}=await harness(t);
  assert.deepEqual(registry.get("pncp.discovery-public")?.requires,["pncp-public-network"]);
  assert.equal(canExecuteJob(publicJob(),networkWorker,registry),true);
  assert.equal(canExecuteJob(publicJob(),{...networkWorker,capabilities:[]},registry),false);
});

test("network discovery captures the page before parsing and returns a bounded reviewed result",async t=>{
  const {registry,custodyHome}=await harness(t);
  const output=await registry.run(publicJob({maxTotalPages:2,maxPagesPerModality:2,maxRecords:10,pageSize:10}),{worker:networkWorker});
  assert.equal(output.format,"arca-pncp-discovery-result-v2");
  assert.equal(output.networkUsed,true);
  assert.equal(output.humanReviewRequired,true);
  assert.equal(output.targets.length,1);
  assert.equal(output.targets[0].cnpj,"12345678000195");
  assert.equal(output.targets[0].ano,2026);
  assert.equal(output.targets[0].sequencial,7);
  assert.equal(output.pages.length,1);
  assert.match(output.pages[0].sha256,/^[a-f0-9]{64}$/);
  const verified=await verifyCustody({home:custodyHome,investigationId:"INV-PNCP-DISCOVERY",acquisitionId:output.pages[0].acquisitionId});
  assert.equal(verified.valid,true);
  assert.equal(verified.manifest.original.originalSha256,output.pages[0].sha256);
  assert.equal(JSON.stringify(output).includes("Uint8Array"),false);
  assert.ok(JSON.stringify(output).length<100000);
});

test("network discovery can produce a durable terminal Machine Bridge result",async t=>{
  const {registry}=await harness(t);
  const current=publicJob({maxTotalPages:1,maxPagesPerModality:1,maxRecords:10,pageSize:10});
  const claim={format:"arca-claim-v1",jobId:current.jobId,workerId:networkWorker.workerId,claimedAt:"2026-09-16T15:00:00.000Z",leaseExpiresAt:"2026-09-16T15:05:00.000Z",attempt:1};
  const result=await executeClaimedJob({job:current,worker:networkWorker,claim,registry,now:()=>new Date("2026-09-16T15:00:01.000Z")});
  assert.equal(result.status,"completed");
  assert.equal(result.output.format,"arca-pncp-discovery-result-v2");
  assert.equal(result.output.targets.length,1);
  assert.ok(JSON.stringify(result).length<100000);
});
