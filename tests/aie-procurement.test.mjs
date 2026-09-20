import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PROCUREMENT_RECORD_FORMAT,
  buildProcurementProfile,
  detectAdditiveBurden,
  normalizeProcurementDataset,
  normalizeProcurementRecord,
  resolveProcurementEntities
} from "../packages/aie/src/index.ts";

async function fixture(name) {
  return JSON.parse(await readFile(`examples/aie-fixtures/${name}.json`, "utf8"));
}

test("perfil de licitacoes normaliza moeda, CNPJ e participantes", () => {
  const record = normalizeProcurementRecord({
    id: "X1",
    numeroProcesso: "PX-1",
    supplier: { cnpj: "12.345.678/0001-90", name: "Fornecedor Fixture" },
    amount: "R$ 1.234,56",
    participants: ["A", "B", "C"],
    additivePercent: "12,5"
  }, { sourceRef: "fixture#1" });
  assert.equal(record.format, PROCUREMENT_RECORD_FORMAT);
  assert.equal(record.supplierCnpj, "12345678000190");
  assert.equal(record.supplierId, "CNPJ-12345678000190");
  assert.equal(record.amount, 1234.56);
  assert.equal(record.participantCount, 3);
  assert.equal(record.additivePercent, 12.5);
  assert.deepEqual(record.normalization.warnings, []);
});

test("perfil de licitacoes preserva lacunas de normalizacao sem inventar dados", () => {
  const record = normalizeProcurementRecord({ id: "X2", amount: "invalido" });
  assert.equal(record.amount, null);
  assert.equal(record.supplierId, null);
  assert.ok(record.normalization.warnings.includes("missing-supplier-cnpj"));
  assert.ok(record.normalization.warnings.includes("invalid-amount"));
  assert.ok(record.normalization.warnings.includes("missing-participant-count"));
});

test("resolucao de entidade une aliases somente por CNPJ exato", async () => {
  const records = normalizeProcurementDataset(await fixture("procurement-risk"), { sourceRef: "risk-fixture" });
  const result = resolveProcurementEntities(records);
  const alfa = result.entities.find((entity) => entity.entityId === "CNPJ-11111111000111");
  assert.ok(alfa);
  assert.equal(alfa.confidence, 1);
  assert.equal(alfa.recordIds.length, 5);
  assert.deepEqual(alfa.aliases, ["Fornecedor Alfa", "Fornecedor Alfa Ltda"]);
  assert.equal(result.ambiguous.length, 0);
});

test("detector de aditivos sinaliza limiar sem declarar irregularidade", async () => {
  const records = normalizeProcurementDataset(await fixture("procurement-risk"));
  const findings = detectAdditiveBurden(records, { thresholdPercent: 25 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].observed.procurementId, "R3");
  assert.equal(findings[0].observed.additivePercent, 35);
  assert.equal(findings[0].humanReviewRequired, true);
  assert.ok(findings[0].alternativeExplanations.length >= 2);
  assert.doesNotMatch(findings[0].summary, /fraude|crime|culpa/i);
});

test("fixture de risco gera achados de preco, competicao, concentracao e aditivo", async () => {
  const records = normalizeProcurementDataset(await fixture("procurement-risk"), { sourceRef: "risk-fixture" });
  const profile = buildProcurementProfile(records);
  assert.equal(profile.recordCount, 6);
  assert.equal(profile.entityCount, 2);
  assert.equal(profile.normalizationWarningCount, 0);
  assert.ok(profile.byDetector["RISK-PRICE-OUTLIER-001"] >= 1);
  assert.ok(profile.byDetector["RISK-LOW-COMPETITION-001"] >= 1);
  assert.ok(profile.byDetector["RISK-CONCENTRATION-001"] >= 1);
  assert.ok(profile.byDetector["RISK-ADDITIVE-BURDEN-001"] >= 1);
  assert.ok(profile.investigateCount >= 1);
  assert.equal(profile.humanReviewRequired, true);
});

test("fixture normal nao produz achados de risco nos detectores atuais", async () => {
  const records = normalizeProcurementDataset(await fixture("procurement-normal"), { sourceRef: "normal-fixture" });
  const profile = buildProcurementProfile(records);
  assert.equal(profile.recordCount, 6);
  assert.equal(profile.entityCount, 3);
  assert.equal(profile.findingCount, 0);
  assert.equal(profile.investigateCount, 0);
  assert.deepEqual(profile.byDetector, {});
});
