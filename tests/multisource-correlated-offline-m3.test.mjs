import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadOfflineFixture,
  loadPublicSourceRegistry,
  runMultisourceOfflineGate
} from "../src/investigation/multisource-offline-gate.mjs";
import {runFinancialCorrelationOffline} from "../src/investigation/financial-correlation-offline.mjs";

const registryPath=path.join(process.cwd(),"config","public-source-registry-v1.json");
const sourceFixturePath=path.join(process.cwd(),"examples","multisource-offline-fixtures","correlated-multisource-m3-v1.json");
const correlationFixturePath=path.join(process.cwd(),"examples","multisource-offline-fixtures","financial-correlation-m3-v1.json");
const registry=()=>loadPublicSourceRegistry(registryPath);
const sourceFixture=()=>loadOfflineFixture(sourceFixturePath);
const correlationFixture=()=>JSON.parse(fs.readFileSync(correlationFixturePath,"utf8"));
const queueRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-m3-correlated-"));
const clock=()=>new Date("2026-09-22T05:00:00.000Z");
const correlation=()=>runFinancialCorrelationOffline({fixture:correlationFixture()});
const run=(extra={})=>runMultisourceOfflineGate({
  registry:registry(),
  fixture:sourceFixture(),
  correlationReport:correlation(),
  queueRoot:queueRoot(),
  clock,
  ...extra
});

test("M3 joins PNCP, payments and impacted commitments across exactly three UFs",async()=>{
  const report=await run();
  assert.deepEqual(report.coverage.requestedUfs,["AC","AL","AM"]);
  assert.deepEqual(report.sources.requested,[
    "br.pncp.public-api",
    "br.portal-transparencia.download-despesas"
  ]);
  assert.deepEqual(report.coverage.availableUfs,["AC","AM"]);
  assert.deepEqual(report.coverage.unavailableUfs,["AL"]);
  assert.deepEqual(report.coverage.availabilityBySource["br.pncp.public-api"],{
    availableUfs:["AC","AM"],unavailableUfs:["AL"]
  });
  assert.deepEqual(report.coverage.availabilityBySource["br.portal-transparencia.download-despesas"],{
    availableUfs:["AC","AM"],unavailableUfs:["AL"]
  });
  assert.equal(report.evidence.receivedCount,11);
  assert.equal(report.evidence.deduplicatedCount,11);
  assert.equal(report.gaps.length,2);
  assert.ok(report.gaps.every(item=>item.uf==="AL"&&item.suspicion===false));
});

test("M3 correlation is evidence-bound and preserves all four epistemic relation states",async()=>{
  const report=await run();
  assert.deepEqual(report.correlation.relationStateCounts,{
    CANDIDATE:1,CONFIRMED:1,CONFLICTING:1,NOT_OBSERVED:1
  });
  assert.equal(report.correlation.relationCount,4);
  assert.equal(report.correlation.paymentCommitmentRelationCount,4);
  assert.equal(report.correlation.evidenceBinding.boundRelationCount,8);
  assert.match(report.correlation.evidenceBinding.bindingSha256,/^[0-9a-f]{64}$/);
  assert.equal(report.correlation.evidenceBinding.bindings.length,8);
  const envelopeRefs=new Set(report.evidence.envelopes.map(item=>item.envelopeSha256));
  for(const binding of report.correlation.evidenceBinding.bindings){
    assert.match(binding.relationId,/^[0-9a-f]{64}$/);
    assert.ok(binding.evidenceEnvelopeRefs.length>=1);
    assert.ok(binding.evidenceEnvelopeRefs.every(ref=>envelopeRefs.has(ref)));
  }
});

test("two independent agents inspect the same correlation-aware digest and stop at human review",async()=>{
  const report=await run();
  assert.equal(report.reports.length,2);
  assert.equal(new Set(report.reports.map(item=>item.agentId)).size,2);
  assert.equal(new Set(report.reports.map(item=>item.role)).size,2);
  assert.ok(report.reports.every(item=>item.inputDigest===report.inputDigest));
  assert.ok(report.reports.every(item=>item.adverseFinding===false&&item.humanReviewRequired===true));
  assert.equal(report.reports.find(item=>item.role==="COMPARABILITY_ANALYST").assessment,"CROSS_SOURCE_CORRELATION_AVAILABLE");
  assert.equal(report.verification.outcome,"ADVANCE_TO_HUMAN_REVIEW");
  assert.ok(report.verification.challenges.some(item=>item.kind==="CROSS_SOURCE_CONFLICT_PRESERVED"&&!item.resolved));
  assert.ok(report.verification.challenges.some(item=>item.kind==="CROSS_SOURCE_NOT_OBSERVED_PRESERVED"&&!item.resolved));
  assert.equal(report.verification.counterEvidencePreserved,true);
  assert.equal(report.verification.outcomeIsNotGuiltFinding,true);
  assert.equal(report.investigation.state,"HUMAN_REVIEW");
});

test("human request and observer wake deduplicate into the same canonical investigation",async()=>{
  const root=queueRoot();
  const base={
    registry:registry(),fixture:sourceFixture(),correlationReport:correlation(),
    queueRoot:root,clock
  };
  const human=await runMultisourceOfflineGate({
    ...base,triggerKind:"HUMAN_REQUEST",triggerRef:"human:m3:001",participantRef:"human-reviewer"
  });
  const observer=await runMultisourceOfflineGate({
    ...base,triggerKind:"SCHEDULED_REVIEW",triggerRef:"observer:m3:001"
  });
  assert.equal(human.investigation.investigationId,observer.investigation.investigationId);
  assert.equal(human.investigation.deduplicated,false);
  assert.equal(observer.investigation.deduplicated,true);
  assert.equal(human.investigation.state,"HUMAN_REVIEW");
  assert.equal(observer.investigation.state,"HUMAN_REVIEW");
});

test("M3 enforces three-UF scope while allowing each source to cover the same UF",async()=>{
  const duplicate=sourceFixture();
  duplicate.shards[2]=structuredClone(duplicate.shards[0]);
  await assert.rejects(()=>runMultisourceOfflineGate({
    registry:registry(),fixture:duplicate,correlationReport:correlation(),queueRoot:queueRoot(),clock
  }),/DUPLICATE_SOURCE_UF/);

  const tooManyShards=sourceFixture();
  tooManyShards.shards.push(structuredClone(tooManyShards.shards[0]));
  await assert.rejects(()=>runMultisourceOfflineGate({
    registry:registry(),fixture:tooManyShards,correlationReport:correlation(),queueRoot:queueRoot(),clock
  }),/SHARD_BUDGET_EXCEEDED/);

  const over=sourceFixture();
  over.shards[2].uf="AP";
  over.shards[5].uf="AM";
  await assert.rejects(()=>runMultisourceOfflineGate({
    registry:registry(),fixture:over,correlationReport:null,queueRoot:queueRoot(),clock
  }),/UF_BUDGET_EXCEEDED/);

  const report=await run();
  assert.equal(report.coverage.requestedUfs.length,3);
});

test("tampered or unrelated correlation cannot enter the M3 evidence graph",async()=>{
  const unsafe=correlation();
  const tampered=structuredClone(unsafe);
  tampered.network.used=true;
  await assert.rejects(()=>runMultisourceOfflineGate({
    registry:registry(),fixture:sourceFixture(),correlationReport:tampered,queueRoot:queueRoot(),clock
  }),/CORRELATION_SAFETY_INVALID/);

  const unrelatedFixture=correlationFixture();
  const originalCode=unrelatedFixture.payments[0].documentCode;
  const unrelatedCode="FIXTURE-PAYMENT-NOT-COLLECTED";
  unrelatedFixture.payments[0].documentCode=unrelatedCode;
  for(const impact of unrelatedFixture.commitmentImpacts)
    if(impact.paymentDocumentCode===originalCode)impact.paymentDocumentCode=unrelatedCode;
  const unrelated=runFinancialCorrelationOffline({fixture:unrelatedFixture});
  await assert.rejects(()=>runMultisourceOfflineGate({
    registry:registry(),fixture:sourceFixture(),correlationReport:unrelated,queueRoot:queueRoot(),clock
  }),/EVIDENCE_BINDING_MISSING/);
});

test("M3 remains deterministic, offline, non-public and non-adverse",async()=>{
  const first=await run();
  const second=await run();
  assert.equal(first.reportSha256,second.reportSha256);
  assert.match(first.reportSha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(first.network,{enabled:false,used:false});
  assert.deepEqual(first.publication,{enabled:false,attempted:false});
  assert.equal(first.safety.anomalyIsNotIrregularity,true);
  assert.equal(first.safety.adverseFinding,false);
  assert.equal(first.safety.humanReviewRequired,true);
  await assert.rejects(()=>run({networkEnabled:true}),/NETWORK_FORBIDDEN/);
  await assert.rejects(()=>run({publicationEnabled:true}),/PUBLICATION_FORBIDDEN/);
});

test("M0 and M1 single-source report digests remain unchanged after M3 integration",async()=>{
  const m0=await runMultisourceOfflineGate({
    registry:registry(),
    fixture:loadOfflineFixture(path.join(process.cwd(),"examples","multisource-offline-fixtures","pncp-three-uf-v1.json")),
    queueRoot:queueRoot(),
    clock:()=>new Date("2026-09-21T13:00:00.000Z")
  });
  const m1=await runMultisourceOfflineGate({
    registry:registry(),
    fixture:loadOfflineFixture(path.join(process.cwd(),"examples","multisource-offline-fixtures","portal-expenses-ac-al-am-v1.json")),
    queueRoot:queueRoot(),
    clock:()=>new Date("2026-09-21T13:00:00.000Z")
  });
  assert.equal(m0.reportSha256,"29678dca8d120012ad5183c209a8c48b836893a81d9b223a54a8efa96e0f2af2");
  assert.equal(m1.reportSha256,"d33af20d7382df409032ecac0d94e24f97bd1ab6e04b02d55d05856182281bf9");
});
