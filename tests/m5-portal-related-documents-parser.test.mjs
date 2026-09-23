import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  GATE046_OBSERVED_SCHEMA_SHA256,
  normalizePortalRelatedDocumentRecord,
  normalizePortalRelatedDocumentsFixture
} from "../src/investigation/m5-portal-related-documents-parser.mjs";

const fixture=()=>JSON.parse(fs.readFileSync(
  path.join(process.cwd(),"examples/multisource-offline-fixtures/m5-portal-related-documents-parser-v1.json"),
  "utf8"
));

test("parser V1 fica preso ao schema observado no Gate 046",()=>{
  assert.equal(
    fixture().observedSchemaSha256,
    GATE046_OBSERVED_SCHEMA_SHA256
  );
  const out=normalizePortalRelatedDocumentsFixture(fixture());
  assert.equal(out.executionMode,"SYNTHETIC_FIXTURE");
  assert.equal(out.normalizationState,"NORMALIZED_SYNTHETIC_FIXTURE");
  assert.equal(out.liveNormalizationAuthorized,false);
  assert.equal(out.networkUsed,false);
  assert.equal(out.publicationAttempted,false);
  assert.equal(out.adverseFinding,false);
  assert.match(out.normalizationSha256,/^[a-f0-9]{64}$/);
});

test("parser normaliza data, fase e valor sem inferir identidade",()=>{
  const first=normalizePortalRelatedDocumentRecord(fixture().records[0]);
  assert.equal(first.date,"2026-09-23");
  assert.equal(first.phase,"PAGAMENTO");
  assert.equal(first.amountCents,123456);
  assert.equal(first.currency,"BRL");
  assert.equal(first.identityInferencesMade,false);
  assert.equal(first.publicationAuthorized,false);
  assert.match(first.beneficiaryRef,/^portal:beneficiary-text:sha256:[a-f0-9]{64}$/);
  assert.match(first.managementUnitRef,/^portal:management-unit-text:sha256:[a-f0-9]{64}$/);

  const second=normalizePortalRelatedDocumentRecord(fixture().records[1]);
  assert.equal(second.date,"2026-09-22");
  assert.equal(second.phase,"LIQUIDACAO");
  assert.equal(second.amountCents,-5000);
});

test("parser falha fechado em drift de campo",()=>{
  const row=fixture().records[0];
  assert.throws(()=>normalizePortalRelatedDocumentRecord({...row,campoNovo:"x"}),/SCHEMA_DRIFT/);
  const missing={...row}; delete missing.orgaoVinculado;
  assert.throws(()=>normalizePortalRelatedDocumentRecord(missing),/SCHEMA_DRIFT/);
});

test("parser falha fechado em data, fase e valor inesperados",()=>{
  const base=fixture().records[0];
  assert.throws(()=>normalizePortalRelatedDocumentRecord({...base,data:"09-23-2026"}),/DATE_FORMAT_UNSUPPORTED/);
  assert.throws(()=>normalizePortalRelatedDocumentRecord({...base,fase:"fase desconhecida"}),/PHASE_UNSUPPORTED/);
  assert.throws(()=>normalizePortalRelatedDocumentRecord({...base,valor:"1234.56"}),/VALUE_FORMAT_UNSUPPORTED/);
});

test("parser recusa hash divergente e qualquer modo live",()=>{
  const doc=fixture();
  assert.throws(()=>normalizePortalRelatedDocumentsFixture({
    ...doc,observedSchemaSha256:"0".repeat(64)
  }),/SCHEMA_HASH_MISMATCH/);
  assert.throws(()=>normalizePortalRelatedDocumentsFixture({
    ...doc,executionMode:"CUSTODIAL_LIVE"
  }),/LIVE_NORMALIZATION_NOT_AUTHORIZED/);
});

test("normalizacao sintetica e deterministica",()=>{
  const one=normalizePortalRelatedDocumentsFixture(fixture());
  const two=normalizePortalRelatedDocumentsFixture(fixture());
  assert.equal(one.normalizationSha256,two.normalizationSha256);
  assert.equal(one.records.length,2);
});
