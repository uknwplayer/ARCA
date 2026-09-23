import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildM5InvestigationManifest,
  evaluateM5PreCorrelationGate
} from "../src/investigation/m5-investigation-manifest.mjs";
import {
  buildM5NormalizedCorrelationBundle,
  createM5IndependentAgents,
  runM5PostCustodyCorrelation,
  verifyM5NormalizedCorrelationBundle
} from "../src/investigation/m5-post-custody-correlation.mjs";

const fixturePath=path.join(process.cwd(),"examples","multisource-offline-fixtures","m5-phase-b-v1.json");
const fixture=()=>JSON.parse(fs.readFileSync(fixturePath,"utf8"));
const queueRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-m5-phase-b-"));
const clock=()=>new Date("2026-09-23T10:40:00.000Z");

function build(doc=fixture()){
  const manifest=buildM5InvestigationManifest(doc.manifestInput);
  const gate=evaluateM5PreCorrelationGate({manifest,inputs:doc.custodyInputs});
  const bundle=buildM5NormalizedCorrelationBundle({
    manifest,
    gate,
    sourceBindings:doc.sourceBindings,
    correlationFixture:doc.correlationFixture
  });
  return {doc,manifest,gate,bundle};
}

test("M5 Phase B binds normalized records to verified custody and reaches HUMAN_REVIEW",async()=>{
  const {manifest,gate,bundle}=build();
  const report=await runM5PostCustodyCorrelation({
    manifest,gate,bundle,queueRoot:queueRoot(),clock
  });
  assert.equal(report.schema,"arca.m5-correlated-review.v1");
  assert.equal(report.investigation.state,"HUMAN_REVIEW");
  assert.equal(report.investigation.deduplicated,false);
  assert.equal(report.correlation.totalRelationCount,8);
  assert.deepEqual(report.correlation.relationStateCounts,{
    CANDIDATE:1,CONFIRMED:1,CONFLICTING:1,NOT_OBSERVED:1
  });
  assert.equal(report.reports.length,2);
  assert.deepEqual(new Set(report.reports.map(item=>item.role)),new Set([
    "PROVENANCE_ANALYST","COMPARABILITY_ANALYST"
  ]));
  assert.ok(report.reports.every(item=>item.inputDigest===report.inputDigest));
  assert.equal(report.verification.outcome,"ADVANCE_TO_HUMAN_REVIEW");
  assert.equal(report.verification.counterEvidencePreserved,true);
  assert.equal(report.verification.notObservedIsNotDisappearance,true);
  assert.deepEqual(report.network,{enabled:false,used:false});
  assert.deepEqual(report.publication,{enabled:false,attempted:false});
  assert.equal(report.safety.adverseFinding,false);
  assert.equal(report.safety.m5Accepted,false);
  assert.equal(report.safety.phaseBOfflineContractProof,true);
  assert.equal(report.safety.rawLiveBytesIncluded,false);
  assert.match(report.reportSha256,/^[a-f0-9]{64}$/);
});

test("M5 Phase B bundle is deterministic and integrity-verifiable",()=>{
  const first=build();
  const second=build();
  assert.equal(first.bundle.bundleSha256,second.bundle.bundleSha256);
  assert.equal(
    verifyM5NormalizedCorrelationBundle({
      bundle:first.bundle,manifest:first.manifest,gate:first.gate
    }).bundleSha256,
    first.bundle.bundleSha256
  );
  const tampered=structuredClone(first.bundle);
  tampered.correlationFixture.payments[0].amountCents+=1;
  assert.throws(()=>verifyM5NormalizedCorrelationBundle({
    bundle:tampered,manifest:first.manifest,gate:first.gate
  }),/INTEGRITY/);
});

test("M5 Phase B rejects normalized Portal records without custody provenance",()=>{
  const doc=fixture();
  doc.correlationFixture.payments[0].provenanceRefs=
    doc.correlationFixture.payments[0].provenanceRefs.filter(item=>!item.startsWith("custody:PORTAL:"));
  const manifest=buildM5InvestigationManifest(doc.manifestInput);
  const gate=evaluateM5PreCorrelationGate({manifest,inputs:doc.custodyInputs});
  assert.throws(()=>buildM5NormalizedCorrelationBundle({
    manifest,gate,sourceBindings:doc.sourceBindings,correlationFixture:doc.correlationFixture
  }),/PORTAL_PROVENANCE_UNBOUND/);
});

test("M5 Phase B rejects normalized PNCP records without custody provenance",()=>{
  const doc=fixture();
  doc.correlationFixture.procurements[0].provenanceRefs=
    doc.correlationFixture.procurements[0].provenanceRefs.filter(item=>!item.startsWith("custody:PNCP:"));
  const manifest=buildM5InvestigationManifest(doc.manifestInput);
  const gate=evaluateM5PreCorrelationGate({manifest,inputs:doc.custodyInputs});
  assert.throws(()=>buildM5NormalizedCorrelationBundle({
    manifest,gate,sourceBindings:doc.sourceBindings,correlationFixture:doc.correlationFixture
  }),/PNCP_PROVENANCE_UNBOUND/);
});

test("M5 Phase B rejects a strong bridge not anchored to both custody envelopes",()=>{
  const doc=fixture();
  doc.correlationFixture.strongBindings[0].provenanceRefs=
    doc.correlationFixture.strongBindings[0].provenanceRefs.filter(item=>!item.startsWith("custody:PORTAL:"));
  const manifest=buildM5InvestigationManifest(doc.manifestInput);
  const gate=evaluateM5PreCorrelationGate({manifest,inputs:doc.custodyInputs});
  assert.throws(()=>buildM5NormalizedCorrelationBundle({
    manifest,gate,sourceBindings:doc.sourceBindings,correlationFixture:doc.correlationFixture
  }),/BRIDGE_PROVENANCE_UNBOUND/);
});

test("M5 Phase B refuses to start when pre-correlation gate is blocked",()=>{
  const doc=fixture();
  doc.custodyInputs[1].normalizationState="SCHEMA_OBSERVED";
  const manifest=buildM5InvestigationManifest(doc.manifestInput);
  const gate=evaluateM5PreCorrelationGate({manifest,inputs:doc.custodyInputs});
  assert.equal(gate.readyForCorrelation,false);
  assert.throws(()=>buildM5NormalizedCorrelationBundle({
    manifest,gate,sourceBindings:doc.sourceBindings,correlationFixture:doc.correlationFixture
  }),/GATE_NOT_READY/);
});

test("M5 Phase B enforces manifest relation budget",async()=>{
  const doc=fixture();
  doc.manifestInput.budgets.maxCorrelationRelations=7;
  const {manifest,gate,bundle}=build(doc);
  await assert.rejects(()=>runM5PostCustodyCorrelation({
    manifest,gate,bundle,queueRoot:queueRoot(),clock
  }),/CORRELATION_BUDGET_EXCEEDED/);
});

test("M5 Phase B requires exactly two independent analyst roles",async()=>{
  const {manifest,gate,bundle}=build();
  const [first]=createM5IndependentAgents();
  await assert.rejects(()=>runM5PostCustodyCorrelation({
    manifest,gate,bundle,queueRoot:queueRoot(),clock,agents:[first,first]
  }),/AGENTS_NOT_INDEPENDENT/);
});

test("M5 Phase B remains offline, non-public and non-adverse",async()=>{
  const {manifest,gate,bundle}=build();
  await assert.rejects(()=>runM5PostCustodyCorrelation({
    manifest,gate,bundle,queueRoot:queueRoot(),clock,networkEnabled:true
  }),/NETWORK_FORBIDDEN/);
  await assert.rejects(()=>runM5PostCustodyCorrelation({
    manifest,gate,bundle,queueRoot:queueRoot(),clock,publicationEnabled:true
  }),/PUBLICATION_FORBIDDEN/);
});
