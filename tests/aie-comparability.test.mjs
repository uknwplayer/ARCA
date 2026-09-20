import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PROCUREMENT_ITEM_FORMAT,
  buildComparableItemGroups,
  buildItemComparabilityProfile,
  detectComparableUnitPriceOutliers,
  normalizePncpItems,
  normalizeProcurementItem,
  normalizeProcurementItems,
  normalizeUnit
} from "../packages/aie/src/index.ts";

const fixture = JSON.parse(await readFile("examples/aie-fixtures/procurement-items-synthetic.json", "utf8"));

test("B4 normaliza unidades equivalentes e deriva preco unitario de total e quantidade", () => {
  const item = normalizeProcurementItem({
    procurementId: "PROC-1",
    itemNumber: 1,
    description: "Arroz tipo 1",
    objectClass: "arroz tipo 1",
    quantity: 100,
    unit: "Quilogramas",
    totalPrice: "R$ 500,00"
  });
  assert.equal(item.format, PROCUREMENT_ITEM_FORMAT);
  assert.equal(item.unit, "kg");
  assert.equal(item.unitPrice, 5);
  assert.ok(item.normalization.warnings.includes("unit-price-derived-from-total-and-quantity"));
  assert.match(item.comparabilityKey, /class:arroz tipo 1\|unit:kg/);
});

test("B4 preserva preco unitario explicito e reconhece aliases de unidade", () => {
  assert.equal(normalizeUnit("UNIDADE"), "unit");
  assert.equal(normalizeUnit("litros"), "l");
  assert.equal(normalizeUnit("KG"), "kg");
  const item = normalizeProcurementItem({
    description: "Leite integral",
    objectClass: "leite integral",
    quantity: 10,
    unit: "litro",
    unitPrice: "5,40",
    totalPrice: 1000
  });
  assert.equal(item.unitPrice, 5.4);
  assert.equal(item.normalization.warnings.includes("unit-price-derived-from-total-and-quantity"), false);
});

test("B4 separa grupos por classe sem comparar objetos diferentes apenas porque usam a mesma unidade", () => {
  const items = normalizeProcurementItems(fixture.risk, { sourceRef: "fixture-risk" });
  const grouping = buildComparableItemGroups(items, { minimumGroupSize: 5 });
  const rice = grouping.groups.find((group) => group.comparabilityKey.includes("class:arroz tipo 1"));
  const beans = grouping.groups.find((group) => group.comparabilityKey.includes("class:feijao carioca"));
  assert.equal(rice.recordCount, 6);
  assert.equal(rice.eligible, true);
  assert.equal(beans.recordCount, 1);
  assert.equal(beans.eligible, false);
});

test("B4 detecta preco unitario anomalo somente dentro do grupo comparavel", () => {
  const items = normalizeProcurementItems(fixture.risk, { sourceRef: "fixture-risk" });
  const findings = detectComparableUnitPriceOutliers(items, { minimumGroupSize: 5, threshold: 3.5 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].detectorId, "RISK-COMPARABLE-UNIT-PRICE-001");
  assert.equal(findings[0].observed.value, 12);
  assert.match(findings[0].observed.comparabilityKey, /arroz tipo 1/);
  assert.equal(findings[0].observed.comparableRecordCount, 6);
  assert.ok(findings[0].alternativeExplanations.length >= 3);
  assert.ok(findings[0].gaps.length >= 2);
});

test("B4 fixture normal nao gera falso alerta de preco unitario", () => {
  const items = normalizeProcurementItems(fixture.normal, { sourceRef: "fixture-normal" });
  assert.deepEqual(detectComparableUnitPriceOutliers(items, { minimumGroupSize: 5, threshold: 3.5 }), []);
});

test("B4 recusa inferencia de preco quando o grupo comparavel e pequeno", () => {
  const items = normalizeProcurementItems(fixture.risk.slice(0, 4), { sourceRef: "fixture-small" });
  const profile = buildItemComparabilityProfile(items, { minimumGroupSize: 5 });
  assert.equal(profile.eligibleGroupCount, 0);
  assert.equal(profile.findingCount, 0);
  assert.equal(profile.humanReviewRequired, true);
});

test("B4 adapta itens de fixture PNCP e preserva quantidade, unidade e preco unitario", () => {
  const items = normalizePncpItems(fixture.pncpBundle, { sourceRef: "pncp-bundle-fixture" });
  assert.equal(items.length, 2);
  assert.equal(items[0].procurementId, fixture.pncpBundle.contratacao.numeroControlePNCP);
  assert.equal(items[0].unit, "l");
  assert.equal(items[0].unitPrice, 5.4);
  assert.equal(items[1].unit, "unit");
  assert.equal(items[1].unitPrice, 0.18);
  assert.ok(items[1].normalization.warnings.includes("unit-price-derived-from-total-and-quantity"));
});

test("B4 perfil e schema explicitam comparabilidade e revisao humana", async () => {
  const items = normalizeProcurementItems(fixture.risk, { sourceRef: "fixture-profile" });
  const profile = buildItemComparabilityProfile(items, { minimumGroupSize: 5 });
  assert.equal(profile.format, "arca-aie-item-comparability-profile-v1");
  assert.equal(profile.itemCount, 7);
  assert.equal(profile.eligibleGroupCount, 1);
  assert.equal(profile.findingCount, 1);
  assert.equal(profile.humanReviewRequired, true);

  const schema = JSON.parse(await readFile("schemas/arca-aie-procurement-item-v1.schema.json", "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.format.const, PROCUREMENT_ITEM_FORMAT);
  assert.equal(schema.properties.normalization.properties.method.const, "public-procurement-item-normalizer-v1");
});
