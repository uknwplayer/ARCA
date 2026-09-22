import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  M5_REQUIRED_STOP_CONDITIONS,
  buildM5InvestigationManifest,
  evaluateM5PreCorrelationGate,
  loadM5PhaseAFixture,
  verifyM5InvestigationManifest
} from "../src/investigation/m5-investigation-manifest.mjs";

const fixturePath=path.join(process.cwd(),"examples","multisource-offline-fixtures","m5-phase-a-v1.json");
const fixture=()=>loadM5PhaseAFixture(JSON.parse(fs.readFileSync(fixturePath,"utf8")));
const build=()=>buildM5InvestigationManifest(fixture().manifestInput);

test("M5 manifest preregisters exactly PNCP + Portal without granting network or publication",()=>{
  const manifest=build();
  assert.equal(manifest.schema,"arca.m5-investigation-manifest.v1");
  assert.equal(manifest.questionKind,"DOCUMENT_RECONCILIATION");
  assert.equal(manifest.jurisdiction,"BR/FEDERAL");
  assert.deepEqual(Object.keys(manifest.sourceScopes),["PNCP","PORTAL"]);
  assert.equal(manifest.budgets.maxSources,2);
  assert.equal(manifest.budgets.maxAgentReports,2);
  assert.equal(manifest.budgets.retries,0);
  assert.equal(manifest.networkAuthorizedByManifest,false);
  assert.equal(manifest.publicationEnabled,false);
  assert.equal(manifest.humanReviewRequired,true);
  assert.equal(manifest.adverseFinding,false);
  assert.match(manifest.manifestSha256,/^[a-f0-9]{64}$/);
  assert.equal(build().manifestSha256,manifest.manifestSha256);
  assert.deepEqual([...manifest.stopConditions].sort(),[...M5_REQUIRED_STOP_CONDITIONS].sort());
  assert.equal(Object.isFrozen(manifest),true);
});

test("M5 manifest is integrity-verifiable and rejects tampering",()=>{
  const manifest=build();
  assert.equal(verifyM5InvestigationManifest(manifest).manifestSha256,manifest.manifestSha256);
  assert.throws(()=>verifyM5InvestigationManifest({...manifest,operationalQuestion:"tampered"}),/INTEGRITY/);
});

test("M5 manifest fails closed on source, review, publication, budget and secret injection",()=>{
  const base=fixture().manifestInput;
  assert.throws(()=>buildM5InvestigationManifest({...base,sourceScopes:{PNCP:base.sourceScopes.PNCP}}),/SOURCE_SCOPES/);
  assert.throws(()=>buildM5InvestigationManifest({...base,humanReviewRequired:false}),/HUMAN_REVIEW/);
  assert.throws(()=>buildM5InvestigationManifest({...base,publicationEnabled:true}),/PUBLICATION/);
  assert.throws(()=>buildM5InvestigationManifest({...base,budgets:{...base.budgets,retries:1}}),/BUDGETS/);
  assert.throws(()=>buildM5InvestigationManifest({...base,apiKey:"secret"}),/UNEXPECTED_FIELD/);
  assert.throws(()=>buildM5InvestigationManifest({...base,stopConditions:base.stopConditions.slice(1)}),/STOP_CONDITIONS/);
});

test("two verified normalized custodial inputs are correlation-eligible",()=>{
  const data=fixture();
  const manifest=buildM5InvestigationManifest(data.manifestInput);
  const gate=evaluateM5PreCorrelationGate({manifest,inputs:data.custodyInputs});
  assert.equal(gate.status,"READY_FOR_CORRELATION");
  assert.equal(gate.readyForCorrelation,true);
  assert.equal(gate.custodyVerified,true);
  assert.equal(gate.evidence.length,2);
  assert.equal(gate.blockedSources.length,0);
  assert.equal(gate.networkUsed,false);
  assert.equal(gate.publicationAttempted,false);
  assert.equal(gate.humanReviewRequired,true);
  assert.equal(gate.adverseFinding,false);
  assert.match(gate.gateSha256,/^[a-f0-9]{64}$/);
  assert.equal(evaluateM5PreCorrelationGate({manifest,inputs:data.custodyInputs}).gateSha256,gate.gateSha256);
});

test("custodied but unnormalized input blocks correlation without becoming an adverse finding",()=>{
  const data=fixture();
  data.custodyInputs[1].normalizationState="NORMALIZATION_FAILED";
  const gate=evaluateM5PreCorrelationGate({
    manifest:buildM5InvestigationManifest(data.manifestInput),
    inputs:data.custodyInputs
  });
  assert.equal(gate.status,"BLOCKED");
  assert.equal(gate.readyForCorrelation,false);
  assert.deepEqual(gate.blockedSources,[{source:"PORTAL",normalizationState:"NORMALIZATION_FAILED"}]);
  assert.equal(gate.adverseFinding,false);
  assert.equal(gate.humanReviewRequired,true);
});

test("pre-correlation gate rejects non-private, mismatched, duplicate and raw injected inputs",()=>{
  const data=fixture();
  const manifest=buildM5InvestigationManifest(data.manifestInput);

  const nonPrivate=structuredClone(data.custodyInputs);
  nonPrivate[0].custody.private=false;
  assert.throws(()=>evaluateM5PreCorrelationGate({manifest,inputs:nonPrivate}),/NOT_VERIFIED/);

  const scopeMismatch=structuredClone(data.custodyInputs);
  scopeMismatch[0].scopeSha256="f".repeat(64);
  assert.throws(()=>evaluateM5PreCorrelationGate({manifest,inputs:scopeMismatch}),/SCOPE_MISMATCH/);

  const duplicate=[structuredClone(data.custodyInputs[0]),structuredClone(data.custodyInputs[0])];
  assert.throws(()=>evaluateM5PreCorrelationGate({manifest,inputs:duplicate}),/DUPLICATE_SOURCE/);

  const injected=structuredClone(data.custodyInputs);
  injected[0].rawBody="forbidden";
  assert.throws(()=>evaluateM5PreCorrelationGate({manifest,inputs:injected}),/UNEXPECTED_FIELD/);
});
