import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  M5_PNCP_AP_OBSERVED_STRUCTURE_SHA256,
  M5_PNCP_LIVE_PARSER_CONTRACT_SHA256,
  normalizePncpLivePageFixture,
  normalizePncpLiveProcurementRecord
} from "../src/investigation/m5-pncp-live-parser.mjs";

const fixture=()=>JSON.parse(fs.readFileSync(
  path.join(process.cwd(),"examples/multisource-offline-fixtures/m5-pncp-live-parser-v1.json"),"utf8"
));

test("PNCP parser V1 is pinned to observed custody structure",()=>{
  const doc=fixture();
  assert.equal(doc.observedStructureSha256,M5_PNCP_AP_OBSERVED_STRUCTURE_SHA256);
  assert.match(M5_PNCP_LIVE_PARSER_CONTRACT_SHA256,/^[a-f0-9]{64}$/);
  const result=normalizePncpLivePageFixture(doc);
  assert.equal(result.normalizationState,"NORMALIZED_SYNTHETIC_FIXTURE");
  assert.equal(result.recordCount,1);
  assert.equal(result.liveNormalizationAuthorized,false);
  assert.equal(result.networkUsed,false);
  assert.equal(result.correlationAttempted,false);
});

test("PNCP parser normalizes procurement target without inventing supplier",()=>{
  const row=normalizePncpLiveProcurementRecord(fixture().page.data[0]);
  assert.equal(row.procurementControlNumber,"00000000000000-1-1/2026");
  assert.deepEqual(row.agencyIdentifier,{namespace:"CNPJ",value:"00000000000000"});
  assert.equal(row.uf,"AP");
  assert.equal(row.municipalityCode,"1600303");
  assert.equal(row.publishedAt,"2026-09-18");
  assert.equal(row.estimatedValueCents,123456);
  assert.equal(row.supplierIdentifier,null);
  assert.equal(row.supplierObserved,false);
  assert.equal(row.identityInferencesMade,false);
  assert.equal(row.correlationAuthorized,false);
});

test("PNCP parser preserves empty objetoCompra as null without inventing content",()=>{
  const row=fixture().page.data[0];
  const normalized=normalizePncpLiveProcurementRecord({...row,objetoCompra:""});
  assert.equal(normalized.objectDescription,null);
  assert.equal(normalized.supplierObserved,false);
});

test("PNCP parser fails closed on field drift and control mismatch",()=>{
  const row=fixture().page.data[0];
  assert.throws(()=>normalizePncpLiveProcurementRecord({...row,novoCampo:"x"}),/SCHEMA_DRIFT/);
  assert.throws(()=>normalizePncpLiveProcurementRecord({
    ...row,anoCompra:2025
  }),/CONTROL_BINDING_MISMATCH/);
  assert.throws(()=>normalizePncpLiveProcurementRecord({
    ...row,orgaoEntidade:{...row.orgaoEntidade,cnpj:"11111111111111"}
  }),/CONTROL_BINDING_MISMATCH/);
});

test("PNCP parser rejects ambiguous money, nested drift and live mode",()=>{
  const row=fixture().page.data[0];
  assert.throws(()=>normalizePncpLiveProcurementRecord({...row,valorTotalEstimado:1.234}),/VALOR_ESTIMADO/);
  assert.throws(()=>normalizePncpLiveProcurementRecord({
    ...row,unidadeOrgao:{...row.unidadeOrgao,extra:"x"}
  }),/UNIDADE_SCHEMA_DRIFT/);
  assert.throws(()=>normalizePncpLivePageFixture({
    ...fixture(),executionMode:"CUSTODIAL_LIVE"
  }),/LIVE_NORMALIZATION_NOT_AUTHORIZED/);
});

test("PNCP parser normalization is deterministic",()=>{
  const a=normalizePncpLivePageFixture(fixture());
  const b=normalizePncpLivePageFixture(fixture());
  assert.equal(a.normalizationSha256,b.normalizationSha256);
});
