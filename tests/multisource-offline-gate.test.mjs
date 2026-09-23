import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createIndependentOfflineAgents,
  createOfflinePncpAdapter,
  defaultMultisourcePaths,
  loadOfflineFixture,
  loadPublicSourceRegistry,
  runMultisourceOfflineGate
} from "../src/investigation/multisource-offline-gate.mjs";
import {createEvidenceEnvelope,sha256} from "../src/investigation/public-source-contract.mjs";

const paths=defaultMultisourcePaths();
const registry=()=>loadPublicSourceRegistry(paths.registry);
const fixture=()=>loadOfflineFixture(paths.fixture);
const queueRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-multisource-gate-"));
const clock=()=>new Date("2026-09-21T13:00:00.000Z");
const run=(extra={})=>runMultisourceOfflineGate({registry:registry(),fixture:fixture(),queueRoot:queueRoot(),clock,...extra});

test("registry declares multiple national sources with three offline adapters",()=>{
  const sources=registry();
  assert.ok(sources.sources.length>=8);
  assert.deepEqual(sources.executable().map(source=>source.id),[
    "br.pncp.public-api","br.portal-transparencia.download-despesas","br.transferegov.public"
  ]);
  assert.ok(sources.sources.every(source=>source.coverage.country==="BR"&&source.coverage.municipalityDefault===null));
  assert.ok(sources.sources.filter(source=>source.adapterStatus==="DECLARED_ONLY").every(source=>source.executableModes.length===0));
});

test("offline gate covers three UFs, isolates unavailability and never creates suspicion",async()=>{
  const report=await run();
  assert.deepEqual(report.coverage.requestedUfs,["AC","AL","AM"]);
  assert.deepEqual(report.coverage.availableUfs,["AC","AM"]);
  assert.deepEqual(report.coverage.unavailableUfs,["AL"]);
  assert.equal(report.coverage.municipalityDefault,null);
  assert.equal(report.gaps[0].suspicion,false);
  assert.equal(report.safety.sourceFailureCreatesSuspicion,false);
});

test("evidence envelopes hash raw and normalized representations without embedding raw bytes",async()=>{
  const report=await run();
  assert.equal(report.evidence.deduplicatedCount,2);
  for(const envelope of report.evidence.envelopes){
    assert.match(envelope.rawSha256,/^[0-9a-f]{64}$/);
    assert.match(envelope.normalizedSha256,/^[0-9a-f]{64}$/);
    assert.match(envelope.envelopeSha256,/^[0-9a-f]{64}$/);
    assert.equal("rawRecord" in envelope,false);
    assert.equal("normalizedRecord" in envelope,false);
    assert.equal(envelope.humanReviewRequired,true);
    assert.equal(envelope.adverseFinding,false);
  }
});

test("duplicate observations collapse deterministically and conflicting duplicates fail closed",async()=>{
  const report=await run();
  assert.equal(report.evidence.receivedCount,3);
  assert.equal(report.evidence.deduplicatedCount,2);
  const broken=fixture();
  broken.shards[0].records[1].estimatedValue=999999;
  await assert.rejects(()=>runMultisourceOfflineGate({registry:registry(),fixture:broken,queueRoot:queueRoot(),clock}),/DUPLICATE_RECORD_CONFLICT/);
});

test("two independent agent roles receive the same immutable evidence digest",async()=>{
  const report=await run();
  assert.equal(report.reports.length,2);
  assert.equal(new Set(report.reports.map(item=>item.agentId)).size,2);
  assert.equal(new Set(report.reports.map(item=>item.role)).size,2);
  assert.ok(report.reports.every(item=>item.inputDigest===report.inputDigest));
  assert.ok(report.reports.every(item=>item.adverseFinding===false&&item.humanReviewRequired===true));
});

test("adversarial verification preserves limitations and advances only to human review",async()=>{
  const report=await run();
  assert.equal(report.verification.outcome,"ADVANCE_TO_HUMAN_REVIEW");
  assert.equal(report.verification.counterEvidencePreserved,true);
  assert.equal(report.verification.outcomeIsNotGuiltFinding,true);
  assert.ok(report.verification.challenges.some(item=>item.kind==="SOURCE_NOT_INDEPENDENT"&&!item.resolved));
  assert.equal(report.investigation.state,"HUMAN_REVIEW");
  assert.equal(report.safety.adverseFinding,false);
});

test("network and publication are fail-closed",async()=>{
  await assert.rejects(()=>run({networkEnabled:true}),/NETWORK_FORBIDDEN/);
  await assert.rejects(()=>run({publicationEnabled:true}),/PUBLICATION_FORBIDDEN/);
  const report=await run();
  assert.deepEqual(report.network,{enabled:false,used:false});
  assert.deepEqual(report.publication,{enabled:false,attempted:false});
});

test("non-implemented declared source cannot be executed",async()=>{
  const changed=fixture();
  changed.shards[0].sourceId="br.tcu.open-data";
  await assert.rejects(()=>runMultisourceOfflineGate({registry:registry(),fixture:changed,queueRoot:queueRoot(),clock}),/ADAPTER_NOT_IMPLEMENTED/);
});

test("evidence envelope rejects a URL outside the registered official origin",()=>{
  const source=registry().get("br.pncp.public-api");
  assert.throws(()=>createEvidenceEnvelope({
    source,rawRecord:{a:1},normalizedRecord:{a:1},recordKey:"record-1",
    sourceUrl:"https://example.invalid/record",acquiredAt:"2026-09-21T00:00:00Z",
    transformations:["fixture"],coverage:{jurisdiction:"BR/UF/AC",temporal:"2026",fields:["a"]}
  }),/SOURCE_ORIGIN_NOT_ALLOWED/);
  assert.equal(sha256({a:1}),sha256({a:1}));
  assert.equal(createIndependentOfflineAgents().length,2);
  assert.equal(createOfflinePncpAdapter().mode,"OFFLINE_FIXTURE");
});
