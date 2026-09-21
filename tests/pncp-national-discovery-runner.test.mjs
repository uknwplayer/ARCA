import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildPncpNationalWatchPlan,
  BRAZIL_UF_CODES
} from "../src/machine-bridge/pncp-national-watcher.mjs";
import {createPncpNationalScheduler} from "../src/machine-bridge/pncp-national-scheduler.mjs";
import {
  createPncpNationalDiscoveryRunner,
  PNCP_NATIONAL_NETWORK_CONFIRMATION
} from "../src/machine-bridge/pncp-national-discovery-runner.mjs";
import {createPncpConsultaFixtureTransport} from "../packages/pncp-connector/src/discovery.ts";

const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-pncp-national-runner-"));
const clock=()=>new Date("2026-09-21T02:00:00.000Z");
const plan=()=>buildPncpNationalWatchPlan({
  dataInicial:"20260901",
  dataFinal:"20260901",
  modalidadeIds:[6]
},{maxPagesPerModality:1,maxTotalPages:1,maxRecords:10,pageSize:10});

function fixtureFor(shard){
  const index=BRAZIL_UF_CODES.indexOf(shard.uf)+1;
  const sequence=String(index).padStart(6,"0");
  return createPncpConsultaFixtureTransport({
    "discovery-modality-6-page-1":{
      data:[{
        numeroControlePNCP:`12345678000195-1-${sequence}/2026`,
        orgaoEntidade:{cnpj:"12345678000195"},
        anoCompra:2026,
        sequencialCompra:index,
        objetoCompra:`Fixture nacional ${shard.uf}`,
        modalidadeId:6,
        modalidadeNome:"Fixture",
        dataPublicacaoPncp:"2026-09-01T00:00:00Z",
        valorTotalEstimado:100+index
      }],
      totalPaginas:1
    }
  });
}

function countFiles(root,name){
  if(!fs.existsSync(root))return 0;
  let count=0;
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    const target=path.join(root,entry.name);
    if(entry.isDirectory())count+=countFiles(target,name);
    else if(entry.name===name)count+=1;
  }
  return count;
}

test("national discovery runner performs custody-backed offline discovery",async()=>{
  const root=temp();
  const runner=createPncpNationalDiscoveryRunner({
    custodyRoot:path.join(root,"custody"),
    stagingRoot:path.join(root,"staging"),
    transportFactory:fixtureFor
  });
  const shard=plan().shards[0];
  const result=await runner.run(shard);
  assert.equal(runner.networkEnabled,false);
  assert.equal(result.format,"arca-pncp-discovery-result-v2");
  assert.equal(result.scope.uf,shard.uf);
  assert.equal(result.networkUsed,false);
  assert.equal(result.invariants.custodyBeforeParsing,true);
  assert.equal(result.targets.length,1);
  assert.equal(result.pages.length,1);
  assert.match(result.pages[0].sha256,/^[a-f0-9]{64}$/);
  assert.ok(result.pages[0].acquisitionId);
  assert.equal(countFiles(path.join(root,"custody"),"manifest.json"),1);
});

test("integral offline proof completes all 27 UF shards with real custody path",async()=>{
  const root=temp();
  const nationalPlan=plan();
  const runner=createPncpNationalDiscoveryRunner({
    custodyRoot:path.join(root,"custody"),
    stagingRoot:path.join(root,"staging"),
    transportFactory:fixtureFor
  });
  const scheduler=createPncpNationalScheduler({root:path.join(root,"scheduler"),clock});
  const result=await scheduler.runCycle({
    plan:nationalPlan,
    discoveryRunner:runner,
    classifier:{async classify(){return []}},
    ingress:{async ingest(){throw new Error("no synthetic signal should be emitted")}},
    maxShardsPerRun:27,
    maxFailuresPerRun:1
  });
  assert.equal(result.status,"COMPLETED");
  assert.equal(result.processed,27);
  assert.equal(result.succeeded,27);
  assert.equal(result.failed,0);
  assert.equal(result.totals.completed,27);
  assert.equal(result.totals.remaining,0);
  assert.equal(countFiles(path.join(root,"custody"),"manifest.json"),27);
  const checkpoint=scheduler.getCheckpoint(nationalPlan);
  assert.equal(checkpoint.status,"COMPLETED");
  assert.equal(Object.keys(checkpoint.completed).length,27);
  assert.ok(Object.values(checkpoint.completed).every(entry=>entry.targetCount===1));
  assert.equal(JSON.stringify(checkpoint).includes("Fixture nacional"),false);
});

test("network runner requires authorization at construction and scheduler gate",async()=>{
  const root=temp();
  const transportFactory=()=>({
    networkEnabled:true,
    async get(){throw new Error("network must not be reached in this test")}
  });
  assert.throws(()=>createPncpNationalDiscoveryRunner({
    custodyRoot:path.join(root,"custody"),
    stagingRoot:path.join(root,"staging"),
    transportFactory,
    networkEnabled:true
  }),/NETWORK_NOT_AUTHORIZED/);

  const authorized=createPncpNationalDiscoveryRunner({
    custodyRoot:path.join(root,"custody"),
    stagingRoot:path.join(root,"staging"),
    transportFactory,
    networkEnabled:true,
    authorizePublicNetwork:true,
    confirmation:PNCP_NATIONAL_NETWORK_CONFIRMATION
  });
  const scheduler=createPncpNationalScheduler({root:path.join(root,"scheduler"),clock});
  await assert.rejects(()=>scheduler.runCycle({
    plan:plan(),discoveryRunner:authorized,
    classifier:{async classify(){return []}},
    ingress:{async ingest(){return null}},
    maxShardsPerRun:1
  }),/PUBLIC_NETWORK_NOT_AUTHORIZED/);
});

test("transport mode mismatch fails before acquisition",async()=>{
  const root=temp();
  const runner=createPncpNationalDiscoveryRunner({
    custodyRoot:path.join(root,"custody"),
    stagingRoot:path.join(root,"staging"),
    transportFactory:()=>({networkEnabled:true,async get(){throw new Error("must not run")}})
  });
  await assert.rejects(()=>runner.run(plan().shards[0]),/TRANSPORT_MODE_MISMATCH/);
  assert.equal(countFiles(path.join(root,"custody"),"manifest.json"),0);
});


test("network transport failures are typed as source unavailable without raw detail",async()=>{
  const root=temp();
  const runner=createPncpNationalDiscoveryRunner({
    custodyRoot:path.join(root,"custody"),
    stagingRoot:path.join(root,"staging"),
    transportFactory:()=>({
      networkEnabled:true,
      async get(){
        const error=new TypeError("fetch failed");
        error.cause={code:"UND_ERR_SOCKET",message:"private socket detail"};
        throw error;
      }
    }),
    networkEnabled:true,
    authorizePublicNetwork:true,
    confirmation:PNCP_NATIONAL_NETWORK_CONFIRMATION
  });
  let caught=null;
  try{await runner.run(plan().shards[0])}catch(error){caught=error}
  assert.ok(caught);
  assert.equal(caught.code,"ARCA_PNCP_SOURCE_UNAVAILABLE");
  assert.equal(caught.sourceFailureRef,"code:UND_ERR_SOCKET");
  assert.equal(String(caught.message),"ARCA_PNCP_SOURCE_UNAVAILABLE");
  assert.equal(JSON.stringify(caught).includes("private socket detail"),false);
  assert.equal(countFiles(path.join(root,"custody"),"manifest.json"),0);
});

test("custody or parsing failures are not misclassified as source unavailable",async()=>{
  const root=temp();
  const runner=createPncpNationalDiscoveryRunner({
    custodyRoot:path.join(root,"custody"),
    stagingRoot:path.join(root,"staging"),
    transportFactory:()=>({
      networkEnabled:true,
      async get(){
        const body=new TextEncoder().encode("{not-json");
        return {
          resourceKind:"discovery-modality-6-page-1",
          url:"https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao",
          method:"GET",
          status:200,
          ok:true,
          contentType:"application/json",
          accessedAt:"2026-09-21T02:00:00.000Z",
          bytes:body,
          sha256:"0".repeat(64),
          attemptCount:1
        };
      }
    }),
    networkEnabled:true,
    authorizePublicNetwork:true,
    confirmation:PNCP_NATIONAL_NETWORK_CONFIRMATION
  });
  await assert.rejects(()=>runner.run(plan().shards[0]),error=>{
    assert.notEqual(error?.code,"ARCA_PNCP_SOURCE_UNAVAILABLE");
    return true;
  });
});
