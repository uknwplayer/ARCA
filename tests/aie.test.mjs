import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AIE_BASELINE_FORMAT,
  AIE_FINDING_FORMAT,
  RISK_PATTERN_LIBRARY_V1,
  auditFinding,
  buildHypothesisSet,
  buildNumericBaseline,
  detectConcentration,
  detectLowCompetition,
  detectRobustOutliers,
  markPublicTrailEnd,
  proposeCase
} from "../packages/aie/src/index.ts";

const pricePositive = [
  { id: "P1", amount: 100 },
  { id: "P2", amount: 101 },
  { id: "P3", amount: 99 },
  { id: "P4", amount: 100 },
  { id: "P5", amount: 102 },
  { id: "P6", amount: 1000 }
];

const priceNegative = [
  { id: "N1", amount: 100 },
  { id: "N2", amount: 101 },
  { id: "N3", amount: 99 },
  { id: "N4", amount: 100 },
  { id: "N5", amount: 102 },
  { id: "N6", amount: 98 }
];

test("AIE baseline preserva universo, exclusoes e estatistica robusta", () => {
  const baseline = buildNumericBaseline([...priceNegative, { id: "NX", amount: null }], "amount", {
    filters: { objectClass: "fixture" }
  });
  assert.equal(baseline.format, AIE_BASELINE_FORMAT);
  assert.equal(baseline.sampleSize, 6);
  assert.equal(baseline.universe.recordCount, 7);
  assert.equal(baseline.universe.excludedCount, 1);
  assert.equal(baseline.statistics.median, 100);
  assert.ok(baseline.limitations.some((item) => item.includes("excluidos")));
});

test("AIE encontra outlier sintético forte sem converter anomalia em culpa", () => {
  const findings = detectRobustOutliers(pricePositive, { field: "amount", threshold: 3.5 });
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.equal(finding.format, AIE_FINDING_FORMAT);
  assert.equal(finding.observed.recordId, "P6");
  assert.equal(finding.triage, "investigate");
  assert.equal(finding.humanReviewRequired, true);
  assert.ok(finding.alternativeExplanations.length >= 2);
  assert.ok(finding.gaps.length >= 1);
  assert.doesNotMatch(finding.summary, /fraude|culpado|crime/i);
});

test("AIE dataset normal nao produz falso outlier no detector robusto", () => {
  assert.deepEqual(detectRobustOutliers(priceNegative, { field: "amount", threshold: 3.5 }), []);
});

test("AIE detecta baixa competicao recorrente por grupo e ignora grupo normal", () => {
  const records = [
    { id: "L1", supplierId: "A", participantCount: 1 },
    { id: "L2", supplierId: "A", participantCount: 1 },
    { id: "L3", supplierId: "A", participantCount: 1 },
    { id: "L4", supplierId: "B", participantCount: 4 },
    { id: "L5", supplierId: "B", participantCount: 5 },
    { id: "L6", supplierId: "B", participantCount: 3 }
  ];
  const findings = detectLowCompetition(records, { minimumOccurrences: 2 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].observed.group, "A");
  assert.equal(findings[0].triage, "investigate");
});

test("AIE detecta concentracao de valor e registra explicacoes legitimas", () => {
  const records = [
    { id: "C1", supplierId: "A", amount: 800 },
    { id: "C2", supplierId: "A", amount: 100 },
    { id: "C3", supplierId: "B", amount: 50 },
    { id: "C4", supplierId: "C", amount: 50 }
  ];
  const findings = detectConcentration(records, { thresholdShare: 0.6 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].observed.entity, "A");
  assert.equal(findings[0].observed.share, 0.9);
  assert.equal(findings[0].triage, "investigate");
  assert.ok(findings[0].alternativeExplanations.length >= 2);
});

test("AIE gera hipoteses concorrentes incluindo explicacao legitima e erro de dados", () => {
  const finding = detectRobustOutliers(pricePositive, { field: "amount" })[0];
  const set = buildHypothesisSet(finding);
  assert.equal(set.findingId, finding.findingId);
  assert.equal(set.humanReviewRequired, true);
  assert.ok(set.hypotheses.some((item) => item.kind === "risk"));
  assert.ok(set.hypotheses.some((item) => item.kind === "legitimate"));
  assert.ok(set.hypotheses.some((item) => item.kind === "data-error"));
});

test("auditor adversarial preserva achado robusto e derruba achado com erro material", () => {
  const finding = detectRobustOutliers(pricePositive, { field: "amount" })[0];
  const survived = auditFinding(finding, {
    parameterVariants: [
      { threshold: 3, findingPersists: true },
      { threshold: 4, findingPersists: true }
    ]
  });
  assert.equal(survived.audit.status, "survived");
  assert.equal(survived.finding.triage, "investigate");

  const rejected = auditFinding(finding, { dataQualityIssue: true });
  assert.equal(rejected.audit.status, "rejected");
  assert.equal(rejected.finding.triage, "data-error");
});

test("proposta de caso exige achado investigavel que sobreviveu ao auditor", () => {
  const finding = detectRobustOutliers(pricePositive, { field: "amount" })[0];
  const { finding: auditedFinding, audit } = auditFinding(finding);
  const proposal = proposeCase({
    finding: auditedFinding,
    audit,
    territory: "Municipio Fixture/SP",
    domain: "public-procurement",
    period: "2026",
    sources: ["fixture-publica"],
    limits: ["Dataset sintetico."]
  });
  assert.equal(proposal.humanReviewRequired, true);
  assert.equal(proposal.findings.length, 1);
  assert.ok(proposal.hypotheses.length >= 3);
  assert.match(proposal.suggestedQuestion, /sem presumir irregularidade/i);

  const weakAudit = auditFinding(finding, {
    parameterVariants: [{ threshold: 5, findingPersists: false }]
  });
  assert.throws(() => proposeCase({
    finding: weakAudit.finding,
    audit: weakAudit.audit,
    territory: "Fixture",
    domain: "public-procurement",
    period: "2026"
  }), /Somente achado investigável/);
});

test("Cadeia do Dinheiro Publico termina explicitamente antes de dado restrito", () => {
  const end = markPublicTrailEnd({
    lastPublicStep: "PAGAMENTO AO FORNECEDOR",
    reason: "Etapa seguinte dependeria de movimentacao bancaria privada.",
    restrictedCategory: "banking-secrecy",
    sourceRefs: ["DOC-PAYMENT-001"]
  });
  assert.equal(end.event, "PUBLIC_TRAIL_END");
  assert.equal(end.continuationAllowed, false);
  assert.equal(end.humanReviewRequired, true);
});

test("schemas AIE existem e exigem revisao humana", async () => {
  const files = [
    "schemas/arca-aie-baseline-v1.schema.json",
    "schemas/arca-aie-detector-v1.schema.json",
    "schemas/arca-aie-finding-v1.schema.json"
  ];
  for (const path of files) {
    const schema = JSON.parse(await readFile(path, "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  }
  const findingSchema = JSON.parse(await readFile("schemas/arca-aie-finding-v1.schema.json", "utf8"));
  assert.equal(findingSchema.properties.humanReviewRequired.const, true);
  assert.deepEqual(findingSchema.properties.triage.enum, ["discarded", "weak", "review", "investigate", "blocked", "data-error"]);
  assert.equal(RISK_PATTERN_LIBRARY_V1.length, 3);
});
