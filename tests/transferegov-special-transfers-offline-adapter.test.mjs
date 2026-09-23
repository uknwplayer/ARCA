import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createOfflineTransferegovSpecialTransfersAdapter,
  normalizeTransferegovSpecialTransferFixture,
  TRANSFEREGOV_SOURCE_ID
} from "../src/investigation/transferegov-special-transfers-offline-adapter.mjs";
import {
  loadOfflineFixture,
  loadPublicSourceRegistry,
  runMultisourceOfflineGate
} from "../src/investigation/multisource-offline-gate.mjs";

const registry=()=>loadPublicSourceRegistry(path.join(process.cwd(),"config/public-source-registry-s1.json"));
const fixture=()=>loadOfflineFixture(path.join(process.cwd(),"examples/multisource-offline-fixtures/transferegov-special-transfers-sp-mg-v1.json"));
const queueRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-transferegov-s1-"));
const clock=()=>new Date("2026-09-23T16:40:00.000Z");
const run=(extra={})=>runMultisourceOfflineGate({
  registry:registry(),fixture:fixture(),queueRoot:queueRoot(),clock,...extra
});

test("Transferegov public source is active only for offline fixture",()=>{
  const source=registry().get(TRANSFEREGOV_SOURCE_ID);
  assert.equal(source.adapterStatus,"ACTIVE");
  assert.deepEqual(source.executableModes,["OFFLINE_FIXTURE"]);
  assert.equal(source.canonicalPublicUrl,"https://api-publica.transferegov.gestao.gov.br/");
  assert.deepEqual(source.allowedOrigins,["https://api-publica.transferegov.gestao.gov.br"]);
});

test("special-transfer fixture normalizes bounded public-transfer fields",()=>{
  const row=fixture().shards[0].records[0].record;
  const normalized=normalizeTransferegovSpecialTransferFixture(row);
  assert.equal(normalized.recordKey,"transferegov-special-transfer:TE-FIXTURE-SP-001");
  assert.equal(normalized.beneficiaryUf,"SP");
  assert.equal(normalized.beneficiaryMunicipalityCode,"3500000");
  assert.equal(normalized.amountCents,150000000);
  assert.equal(normalized.paidAmountCents,75000000);
  assert.equal(normalized.currency,"BRL");
});

test("offline Transferegov fixture emits hash-only envelopes and preserves source gap",async()=>{
  const report=await run();
  assert.deepEqual(report.coverage.requestedUfs,["SP","MG","BA"]);
  assert.deepEqual(report.coverage.availableUfs,["SP","MG"]);
  assert.deepEqual(report.coverage.unavailableUfs,["BA"]);
  assert.deepEqual(report.sources.requested,[TRANSFEREGOV_SOURCE_ID]);
  assert.equal(report.evidence.deduplicatedCount,2);
  assert.equal(report.gaps[0].suspicion,false);
  assert.ok(report.evidence.envelopes.every(envelope=>
    envelope.sourceId===TRANSFEREGOV_SOURCE_ID&&
    envelope.sourceUrl==="https://api-publica.transferegov.gestao.gov.br/"&&
    envelope.coverage.knownGaps.includes("synthetic-record-not-observed-in-live-api")&&
    !("rawRecord" in envelope)&&!("normalizedRecord" in envelope)
  ));
  assert.equal(report.investigation.state,"HUMAN_REVIEW");
  assert.equal(report.safety.adverseFinding,false);
  assert.deepEqual(report.network,{enabled:false,used:false});
  assert.deepEqual(report.publication,{enabled:false,attempted:false});
});

test("Transferegov fixture rejects unsafe or semantically inconsistent records",async()=>{
  for(const [change,expected] of [
    [item=>{item.sourceUrl="https://example.invalid/"},/CANONICAL_URL_REQUIRED/],
    [item=>{item.record.paidAmountCents=item.record.amountCents+1},/PAID_EXCEEDS_AMOUNT/],
    [item=>{item.record.beneficiaryUf="RJ"},/UF_MISMATCH/],
    [item=>{item.record.extra="unexpected"},/UNEXPECTED_FIELD/]
  ]){
    const changed=fixture();
    change(changed.shards[0].records[0]);
    await assert.rejects(()=>run({fixture:changed}),expected);
  }
});

test("adapter itself remains fail-closed when source is not executable",async()=>{
  const document=JSON.parse(fs.readFileSync(path.join(process.cwd(),"config/public-source-registry-v1.json"),"utf8"));
  const source=document.sources.find(item=>item.id===TRANSFEREGOV_SOURCE_ID);
  source.adapterStatus="DECLARED_ONLY";
  source.executableModes=[];
  const {createPublicSourceRegistry}=await import("../src/investigation/public-source-contract.mjs");
  await assert.rejects(()=>run({
    registry:createPublicSourceRegistry(document),
    adapters:[createOfflineTransferegovSpecialTransfersAdapter()]
  }),/SOURCE_NOT_EXECUTABLE/);
});
