import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createOfflinePortalExpensesAdapter,normalizePortalExpenseRow,PORTAL_EXPENSE_SOURCE_ID} from "../src/investigation/portal-expenses-offline-adapter.mjs";
import {loadOfflineFixture,loadPublicSourceRegistry,runMultisourceOfflineGate} from "../src/investigation/multisource-offline-gate.mjs";

const registry=()=>loadPublicSourceRegistry(path.join(process.cwd(),"config/public-source-registry-v1.json"));
const fixture=()=>loadOfflineFixture(path.join(process.cwd(),"examples/multisource-offline-fixtures/portal-expenses-ac-al-am-v1.json"));
const queueRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-portal-m1-"));
const clock=()=>new Date("2026-09-21T13:00:00.000Z");
const run=(extra={})=>runMultisourceOfflineGate({registry:registry(),fixture:fixture(),queueRoot:queueRoot(),clock,...extra});

test("CGU download adapter is offline executable and normalizes documented payment fields",()=>{
  const source=registry().get(PORTAL_EXPENSE_SOURCE_ID);
  assert.equal(source.adapterStatus,"ACTIVE");
  assert.deepEqual(source.executableModes,["OFFLINE_FIXTURE"]);
  assert.deepEqual(source.coverage.levels,["federal"]);
  const row=fixture().shards[0].records[0].row;
  const normalized=normalizePortalExpenseRow(row);
  assert.equal(normalized.amountCents,125050);
  assert.equal(normalized.issuedAt,"2026-09-02");
  assert.equal(normalized.beneficiaryCode,"PJ-FICTICIA-AC");
  assert.equal(normalized.period,"2026-09");
});

test("portal fixture emits hash-only envelopes, preserves gaps and reaches human review",async()=>{
  const report=await run();
  assert.deepEqual(report.coverage.requestedUfs,["AC","AL","AM"]);
  assert.deepEqual(report.sources.requested,[PORTAL_EXPENSE_SOURCE_ID]);
  assert.equal(report.evidence.deduplicatedCount,2);
  assert.equal(report.gaps[0].suspicion,false);
  assert.ok(report.evidence.envelopes.every(envelope=>
    envelope.sourceId===PORTAL_EXPENSE_SOURCE_ID&&
    envelope.sourceUrl==="https://portaldatransparencia.gov.br/download-de-dados/despesas"&&
    envelope.coverage.knownGaps.includes("uf-attribution-unverified")&&
    !("rawRecord" in envelope)&&!("normalizedRecord" in envelope)
  ));
  assert.equal(report.reports[1].assessment,"SECOND_SOURCE_REQUIRED");
  assert.equal(report.investigation.state,"HUMAN_REVIEW");
  assert.equal(report.safety.adverseFinding,false);
  assert.deepEqual(report.network,{enabled:false,used:false});
  assert.deepEqual(report.publication,{enabled:false,attempted:false});
});

test("portal fixture rejects fake catalog, invalid value, date and unexpected fields",async()=>{
  for(const [change,expected] of [
    [record=>{record.sourceUrl="https://other.example/despesas"},/CATALOG_URL_REQUIRED/],
    [record=>{record.row["Valor do Pagamento Convertido pra R$"]="1.250,50"},/INVALID_AMOUNT/],
    [record=>{record.row["Data Emissão"]="31/02/2026"},/INVALID_DATE/],
    [record=>{record.row["Dados Bancários"]="secret"},/UNEXPECTED_FIELD/]
  ]){
    const changed=fixture();
    change(changed.shards[0].records[0]);
    await assert.rejects(()=>run({fixture:changed}),expected);
  }
});

test("declared-only source fails closed even if an adapter is explicitly passed",async()=>{
  const document=JSON.parse(fs.readFileSync(path.join(process.cwd(),"config/public-source-registry-v1.json"),"utf8"));
  const source=document.sources.find(item=>item.id===PORTAL_EXPENSE_SOURCE_ID);
  source.adapterStatus="DECLARED_ONLY";
  source.executableModes=[];
  const {createPublicSourceRegistry}=await import("../src/investigation/public-source-contract.mjs");
  await assert.rejects(()=>run({registry:createPublicSourceRegistry(document),adapters:[createOfflinePortalExpensesAdapter()]}),/SOURCE_NOT_EXECUTABLE/);
});

test("conflicting portal payment duplicates and live flags fail closed",async()=>{
  const changed=fixture();
  changed.shards[0].records.push(structuredClone(changed.shards[0].records[0]));
  changed.shards[0].records[1].row["Valor do Pagamento Convertido pra R$"]="2,00";
  await assert.rejects(()=>run({fixture:changed}),/DUPLICATE_RECORD_CONFLICT/);
  await assert.rejects(()=>run({networkEnabled:true}),/NETWORK_FORBIDDEN/);
  await assert.rejects(()=>run({publicationEnabled:true}),/PUBLICATION_FORBIDDEN/);
});
