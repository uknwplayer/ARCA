import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createPublicSourceRegistry} from "../src/investigation/public-source-contract.mjs";
import {
  createOfflineTcuAcordaosAdapter,
  normalizeTcuAcordaoFixture,
  TCU_ACORDAOS_ENDPOINT,
  TCU_SOURCE_ID
} from "../src/investigation/tcu-acordaos-offline-adapter.mjs";

const registry=()=>createPublicSourceRegistry(JSON.parse(
  fs.readFileSync(path.join(process.cwd(),"config/public-source-registry-s2.json"),"utf8")
));
const fixture=()=>JSON.parse(
  fs.readFileSync(path.join(process.cwd(),"examples/multisource-offline-fixtures/tcu-acordaos-national-v1.json"),"utf8")
);

test("S2 activates TCU Acordaos only for offline fixture",()=>{
  const source=registry().get(TCU_SOURCE_ID);
  assert.equal(source.adapterStatus,"ACTIVE");
  assert.deepEqual(source.executableModes,["OFFLINE_FIXTURE"]);
  assert.equal(source.canonicalPublicUrl,TCU_ACORDAOS_ENDPOINT);
  assert.deepEqual(source.allowedOrigins,["https://dados-abertos.apps.tcu.gov.br"]);
});

test("TCU fixture normalizes documented decision fields",()=>{
  const normalized=normalizeTcuAcordaoFixture(fixture().records[0].record);
  assert.equal(normalized.recordKey,"tcu-acordao:ACORDAO-FICTICIO-001");
  assert.equal(normalized.year,2026);
  assert.equal(normalized.number,"1001/2026");
  assert.equal(normalized.sessionDate,"2026-09-10");
  assert.equal(normalized.status,"PUBLICADO");
  assert.equal(normalized.decisionUrl,"https://contas.tcu.gov.br/fixture/acordao-001");
});

test("TCU offline adapter emits national hash-only evidence envelopes",()=>{
  const source=registry().get(TCU_SOURCE_ID);
  const result=createOfflineTcuAcordaosAdapter().collect({source,fixture:fixture()});
  assert.equal(result.status,"AVAILABLE");
  assert.equal(result.jurisdiction,"BR/NATIONAL");
  assert.equal(result.records.length,2);
  for(const envelope of result.records){
    assert.equal(envelope.sourceId,TCU_SOURCE_ID);
    assert.equal(envelope.jurisdiction,"BR/NATIONAL");
    assert.equal(envelope.retrievalMode,"OFFLINE_FIXTURE");
    assert.equal(envelope.humanReviewRequired,true);
    assert.equal(envelope.adverseFinding,false);
    assert.ok(envelope.coverage.knownGaps.includes("decision-context-must-be-read"));
    assert.equal("rawRecord" in envelope,false);
    assert.equal("normalizedRecord" in envelope,false);
    assert.match(envelope.rawSha256,/^[0-9a-f]{64}$/);
    assert.match(envelope.normalizedSha256,/^[0-9a-f]{64}$/);
    assert.match(envelope.envelopeSha256,/^[0-9a-f]{64}$/);
  }
});

test("TCU adapter fails closed on malformed or non-official fixture content",()=>{
  const source=registry().get(TCU_SOURCE_ID);
  const adapter=createOfflineTcuAcordaosAdapter();
  for(const [change,expected] of [
    [f=>{f.records[0].sourceUrl="https://example.invalid/api"},/CANONICAL_URL_REQUIRED/],
    [f=>{f.records[0].record.dataSessao="31\/02\/2026"},/INVALID_DATA_SESSAO/],
    [f=>{f.records[0].record.urlAcordao="https://example.invalid/acordao"},/INVALID_URL_ACORDAO/],
    [f=>{f.records[0].record.extra="unexpected"},/UNEXPECTED_FIELD/]
  ]){
    const changed=fixture();
    change(changed);
    assert.throws(()=>adapter.collect({source,fixture:changed}),expected);
  }
});

test("national jurisdiction is accepted without weakening invalid jurisdiction checks",()=>{
  const source=registry().get(TCU_SOURCE_ID);
  const result=createOfflineTcuAcordaosAdapter().collect({source,fixture:fixture()});
  assert.ok(result.records.every(item=>item.jurisdiction==="BR/NATIONAL"));
});

test("TCU adapter remains disabled under historical S1 registry",()=>{
  const s1=createPublicSourceRegistry(JSON.parse(
    fs.readFileSync(path.join(process.cwd(),"config/public-source-registry-s1.json"),"utf8")
  ));
  const source=s1.get(TCU_SOURCE_ID);
  assert.equal(source.adapterStatus,"DECLARED_ONLY");
  assert.throws(()=>createOfflineTcuAcordaosAdapter().collect({source,fixture:fixture()}),/SOURCE_NOT_EXECUTABLE/);
});
