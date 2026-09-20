import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BRAZIL_UF_CODES,
  buildPncpNationalWatchPlan,
  createPncpNationalInvestigationIngress,
  PNCP_NATIONAL_WATCH_PLAN_FORMAT,
  PNCP_WATCH_OBSERVATION_SCHEMA
} from "../src/machine-bridge/pncp-national-watcher.mjs";
import {createInvestigationAutonomyRuntime} from "../src/machine-bridge/investigation-event-runtime.mjs";

const roots=()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"arca-pncp-national-watch-"));
  return {queueRoot:path.join(base,"queue"),eventRoot:path.join(base,"events")};
};
const clock=()=>new Date("2026-09-21T00:00:00.000Z");
const observation=(extra={})=>({
  schema:PNCP_WATCH_OBSERVATION_SCHEMA,
  category:"POTENTIAL_INTEGRITY_RELEVANCE",
  recordRef:"pncp:fixture-control-2026",
  jurisdictionRef:"BR/NATIONAL",
  sourceRef:"https://pncp.gov.br/app/editais/fixture",
  observedAt:"2026-09-20T23:45:00.000Z",
  humanReviewRequired:true,
  anomalyIsNotIrregularity:true,
  ...extra
});

test("national plan covers all 27 federative units without municipality default",()=>{
  const plan=buildPncpNationalWatchPlan({
    dataInicial:"20260901",
    dataFinal:"20260907",
    modalidadeIds:[6,8]
  });
  assert.equal(plan.format,PNCP_NATIONAL_WATCH_PLAN_FORMAT);
  assert.equal(plan.coverage.country,"BR");
  assert.equal(plan.coverage.ufCount,27);
  assert.equal(plan.coverage.municipalityDefault,null);
  assert.deepEqual(plan.coverage.ufCodes,[...BRAZIL_UF_CODES]);
  assert.equal(new Set(plan.shards.map(shard=>shard.uf)).size,27);
  assert.ok(plan.shards.every(shard=>shard.discovery.scope.uf===shard.uf));
  assert.ok(plan.shards.every(shard=>shard.discovery.scope.codigoMunicipioIbge===null));
  assert.equal(plan.networkDefault,"blocked");
  assert.equal(plan.custodyRequiredBeforeClassification,true);
  assert.equal(plan.anomalyIsNotIrregularity,true);
});

test("national plan rejects municipality or organization filters and bounds cycle budgets",()=>{
  const base={dataInicial:"20260901",dataFinal:"20260902",modalidadeIds:[6]};
  assert.throws(()=>buildPncpNationalWatchPlan({...base,codigoMunicipioIbge:"0000000"}),/LOCAL_FILTER_FORBIDDEN/);
  assert.throws(()=>buildPncpNationalWatchPlan({...base,cnpj:"00000000000000"}),/LOCAL_FILTER_FORBIDDEN/);
  assert.throws(()=>buildPncpNationalWatchPlan(base,{maxConcurrentShards:9}),/maxConcurrentShards/);
  const plan=buildPncpNationalWatchPlan(base,{maxTotalPages:2,maxRecords:100});
  assert.equal(plan.budgets.maximumPagesPerCycle,54);
  assert.equal(plan.budgets.maximumRecordsPerCycle,2700);
});

test("actionable PNCP signal creates one shared investigation and reaches private backend",async()=>{
  const received=[];
  const runtime=createInvestigationAutonomyRuntime({
    ...roots(),clock,
    backend:{async acceptWork(work){received.push(work);return {accepted:true,receiptRef:"private:pncp:1"}}}
  });
  const ingress=createPncpNationalInvestigationIngress({investigationRuntime:runtime});
  const first=await ingress.ingest(observation());
  const duplicate=await ingress.ingest(observation());
  assert.equal(first.created,true);
  assert.equal(first.awakened,true);
  assert.equal(duplicate.created,false);
  assert.equal(duplicate.awakened,false);
  assert.equal(first.investigationId,duplicate.investigationId);
  assert.equal(runtime.list().length,1);
  assert.equal(received.length,1);
  assert.equal(JSON.stringify(received).includes("pncp.gov.br"),false);
  assert.equal(JSON.stringify(received).includes("BR/NATIONAL"),false);
  assert.equal(JSON.stringify(received).includes("fixture-control"),false);
});

test("different national jurisdictions use the same generic ingress contract",async()=>{
  const runtime=createInvestigationAutonomyRuntime({
    ...roots(),clock,
    backend:{async acceptWork(){return {accepted:true}}}
  });
  const ingress=createPncpNationalInvestigationIngress({investigationRuntime:runtime});
  const state=await ingress.ingest(observation({jurisdictionRef:"BR/UF/AC"}));
  const municipality=await ingress.ingest(observation({
    jurisdictionRef:"BR/IBGE/0000000",
    recordRef:"pncp:fixture-control-municipal-2026",
    sourceRef:"pncp:sha256:"+"a".repeat(64)
  }));
  assert.notEqual(state.investigationId,municipality.investigationId);
  assert.equal(runtime.list().length,2);
});

test("a new material signal joins the same monthly case but creates new work",async()=>{
  let calls=0;
  const runtime=createInvestigationAutonomyRuntime({
    ...roots(),clock,
    backend:{async acceptWork(){calls++;return {accepted:true}}}
  });
  const ingress=createPncpNationalInvestigationIngress({investigationRuntime:runtime});
  const first=await ingress.ingest(observation());
  const changed=await ingress.ingest(observation({
    category:"MATERIAL_PUBLIC_RECORD_CHANGE",
    sourceRef:"https://pncp.gov.br/app/editais/fixture?version=2"
  }));
  assert.equal(first.investigationId,changed.investigationId);
  assert.equal(changed.created,false);
  assert.equal(changed.awakened,true);
  assert.equal(calls,2);
});

test("ingress rejects non-actionable, non-public and accusation-like observations",async()=>{
  const runtime=createInvestigationAutonomyRuntime({
    ...roots(),clock,
    backend:{async acceptWork(){return {accepted:true}}}
  });
  const ingress=createPncpNationalInvestigationIngress({investigationRuntime:runtime});
  await assert.rejects(()=>ingress.ingest(observation({category:"NEW_PUBLICATION"})),/NOT_ACTIONABLE/);
  await assert.rejects(()=>ingress.ingest(observation({sourceRef:"https://example.invalid/record"})),/SOURCE_NOT_PUBLIC/);
  await assert.rejects(()=>ingress.ingest(observation({humanReviewRequired:false})),/SAFETY_ASSERTIONS_REQUIRED/);
  await assert.rejects(()=>ingress.ingest(observation({anomalyIsNotIrregularity:false})),/SAFETY_ASSERTIONS_REQUIRED/);
  assert.equal(runtime.list().length,0);
});
