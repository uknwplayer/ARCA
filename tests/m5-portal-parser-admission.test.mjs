import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPortalParserAdmissionCandidate,
  recordPortalParserAdmissionDecision
} from "../src/investigation/m5-portal-parser-admission.mjs";
import {
  GATE046_LIVE_BINDING,
  buildGate046ParserAdmissionCandidate
} from "../scripts/prepare-m5-portal-parser-admission.mjs";
import {
  GATE046_OBSERVED_SCHEMA_SHA256,
  M5_PORTAL_RELATED_DOCUMENTS_PARSER_CONTRACT_SHA256
} from "../src/investigation/m5-portal-related-documents-parser.mjs";

const revision="a".repeat(40);
const candidate=()=>buildPortalParserAdmissionCandidate({
  revision,
  ...GATE046_LIVE_BINDING
});

test("M5-G candidato vincula parser, schema e custodia do Gate 046 sem autorizar normalizacao",()=>{
  const value=candidate();
  assert.equal(value.status,"AWAITING_HUMAN_ADMISSION");
  assert.equal(value.observedSchemaSha256,GATE046_OBSERVED_SCHEMA_SHA256);
  assert.equal(value.parserContractSha256,M5_PORTAL_RELATED_DOCUMENTS_PARSER_CONTRACT_SHA256);
  assert.equal(value.liveNormalizationAuthorized,false);
  assert.equal(value.networkAuthorized,false);
  assert.equal(value.publicationAuthorized,false);
  assert.equal(value.correlationAuthorized,false);
  assert.equal(value.rawBytesIncluded,false);
  assert.equal(value.sourceValuesIncluded,false);
  assert.match(value.candidateSha256,/^[a-f0-9]{64}$/);
});

test("M5-G preflight usa apenas hashes sanitizados do Gate 046",()=>{
  const value=buildGate046ParserAdmissionCandidate({env:{GITHUB_SHA:revision}});
  assert.equal(value.revision,revision);
  assert.equal(value.liveRunId,"35917902630");
  assert.equal(value.custodyEnvelopeSha256,GATE046_LIVE_BINDING.custodyEnvelopeSha256);
  assert.equal(value.custodyReceiptSha256,GATE046_LIVE_BINDING.custodyReceiptSha256);
  assert.equal(value.responseBytesSha256,GATE046_LIVE_BINDING.responseBytesSha256);
});

test("M5-G decisao humana pode admitir somente normalizacao custodial, nunca rede/publicacao/correlacao",()=>{
  const value=candidate();
  const decision=recordPortalParserAdmissionDecision({
    candidate:value,
    expectedCandidateSha256:value.candidateSha256,
    decision:"ADMIT_FOR_CUSTODIAL_NORMALIZATION",
    reviewerRef:"human-review:synthetic",
    reviewedAt:"2026-09-23T21:20:00.000Z"
  });
  assert.equal(decision.normalizationAuthorized,true);
  assert.equal(decision.networkAuthorized,false);
  assert.equal(decision.publicationAuthorized,false);
  assert.equal(decision.correlationAuthorized,false);
  assert.match(decision.decisionSha256,/^[a-f0-9]{64}$/);
});

test("M5-G rejeita hash, parser/schema divergente e decisao invalida",()=>{
  const value=candidate();
  assert.throws(()=>recordPortalParserAdmissionDecision({
    candidate:value,
    expectedCandidateSha256:"0".repeat(64),
    decision:"ADMIT_FOR_CUSTODIAL_NORMALIZATION",
    reviewerRef:"human-review:synthetic",
    reviewedAt:"2026-09-23T21:20:00.000Z"
  }),/CANDIDATE_HASH_MISMATCH/);
  assert.throws(()=>buildPortalParserAdmissionCandidate({
    revision,
    ...GATE046_LIVE_BINDING,
    observedSchemaSha256:"0".repeat(64)
  }),/PARSER_BINDING_MISMATCH/);
  assert.throws(()=>recordPortalParserAdmissionDecision({
    candidate:value,
    expectedCandidateSha256:value.candidateSha256,
    decision:"AUTO_APPROVE",
    reviewerRef:"human-review:synthetic",
    reviewedAt:"2026-09-23T21:20:00.000Z"
  }),/DECISION_INVALID/);
});
