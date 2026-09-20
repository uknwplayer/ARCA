import {
  AIE_FINDING_FORMAT,
  buildNumericBaseline,
  detectConcentration,
  detectLowCompetition,
  detectRobustOutliers,
  deterministicId
} from "./engine.ts";

export const PROCUREMENT_RECORD_FORMAT = "arca-aie-procurement-record-v1";

function taxIdentifier(value) {
  return String(value ?? "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function numberFrom(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const sanitized = text
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  if (!sanitized || sanitized === "-" || sanitized === "." || sanitized === "-.") return null;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerFrom(value) {
  const n = numberFrom(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function pick(raw, paths) {
  for (const path of paths) {
    const parts = path.split(".");
    let current = raw;
    for (const part of parts) current = current?.[part];
    if (current !== undefined && current !== null && current !== "") return current;
  }
  return null;
}

export function normalizeProcurementRecord(raw, options = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("registro bruto de contratação inválido");

  const sourceRef = options.sourceRef ?? pick(raw, ["sourceRef", "source.ref"]) ?? "synthetic-fixture";
  const procurementId = String(pick(raw, ["procurementId", "id", "numeroControlePNCP", "process.id"]) ?? "").trim();
  const processId = String(pick(raw, ["processId", "numeroProcesso", "process.number"]) ?? procurementId).trim();
  const supplierDocumentRaw = pick(raw, ["supplierCnpj", "supplier.cnpj", "supplier.document", "fornecedor.cnpj", "fornecedor.documento"]);
  const supplierCnpj = taxIdentifier(supplierDocumentRaw);
  const supplierName = String(pick(raw, ["supplierName", "supplier.name", "fornecedor.nome", "fornecedor.razaoSocial"]) ?? "").trim();
  const amount = numberFrom(pick(raw, ["amount", "valorTotal", "value.total", "contract.amount"]));
  const participantCountRaw = pick(raw, ["participantCount", "competition.participantCount"]);
  const participantArray = pick(raw, ["participants", "competition.participants"]);
  const participantCount = participantCountRaw !== null
    ? integerFrom(participantCountRaw)
    : Array.isArray(participantArray) ? participantArray.length : null;
  const additivePercent = numberFrom(pick(raw, ["additivePercent", "aditivo.percentual", "contract.additivePercent"])) ?? 0;
  const modality = String(pick(raw, ["modality", "modalidadeNome", "process.modality"]) ?? "unknown").trim();
  const objectDescription = String(pick(raw, ["objectDescription", "objetoCompra", "object.description"]) ?? "").trim();
  const publishedAt = pick(raw, ["publishedAt", "dataPublicacaoPncp", "publication.date"]);

  const warnings = [];
  if (!procurementId) warnings.push("missing-procurement-id");
  if (!supplierCnpj) warnings.push("missing-supplier-cnpj");
  if (!supplierName) warnings.push("missing-supplier-name");
  if (amount === null || amount < 0) warnings.push("invalid-amount");
  if (participantCount === null) warnings.push("missing-participant-count");

  return {
    format: PROCUREMENT_RECORD_FORMAT,
    procurementId: procurementId || deterministicId("PROC", { sourceRef, raw }),
    processId: processId || null,
    supplierId: supplierCnpj ? `CNPJ-${supplierCnpj}` : null,
    supplierCnpj: supplierCnpj || null,
    supplierName: supplierName || null,
    amount,
    participantCount,
    additivePercent,
    modality,
    objectDescription: objectDescription || null,
    publishedAt: publishedAt ? String(publishedAt) : null,
    sourceRefs: [String(sourceRef)],
    normalization: {
      method: "public-procurement-normalizer-v1",
      warnings,
      originalShapeHash: deterministicId("RAW", raw)
    }
  };
}

export function normalizeProcurementDataset(records, options = {}) {
  if (!Array.isArray(records)) throw new TypeError("dataset deve ser array");
  return records.map((raw, index) => normalizeProcurementRecord(raw, {
    sourceRef: options.sourceRef ? `${options.sourceRef}#${index + 1}` : undefined
  }));
}

export function resolveProcurementEntities(records) {
  if (!Array.isArray(records)) throw new TypeError("records deve ser array");
  const byCnpj = new Map();
  const unresolved = [];

  for (const record of records) {
    if (!record?.supplierCnpj) {
      unresolved.push({ procurementId: record?.procurementId ?? null, reason: "missing-supplier-cnpj" });
      continue;
    }
    const key = record.supplierCnpj;
    if (!byCnpj.has(key)) byCnpj.set(key, []);
    byCnpj.get(key).push(record);
  }

  const entities = [...byCnpj.entries()].map(([cnpj, group]) => {
    const aliases = [...new Set(group.map((record) => record.supplierName).filter(Boolean))].sort();
    return {
      entityId: `CNPJ-${cnpj}`,
      kind: "supplier",
      resolutionMethod: "exact-cnpj",
      confidence: 1,
      identifiers: [{ type: "CNPJ", value: cnpj }],
      aliases,
      recordIds: group.map((record) => record.procurementId).sort(),
      evidence: group.map((record) => ({ procurementId: record.procurementId, sourceRefs: record.sourceRefs }))
    };
  }).sort((a, b) => a.entityId.localeCompare(b.entityId));

  return {
    entities,
    unresolved,
    method: "procurement-entity-resolution-v1",
    ambiguous: []
  };
}

export function detectAdditiveBurden(records, options = {}) {
  if (!Array.isArray(records)) throw new TypeError("records deve ser array");
  const thresholdPercent = options.thresholdPercent ?? 25;
  const baseline = buildNumericBaseline(records, "additivePercent", { group: "public-procurement" });
  const findings = [];

  for (const record of records) {
    const percent = record?.additivePercent;
    if (typeof percent !== "number" || !Number.isFinite(percent) || percent < thresholdPercent) continue;
    const body = {
      format: AIE_FINDING_FORMAT,
      domain: "public-procurement",
      detectorId: "RISK-ADDITIVE-BURDEN-001",
      detectorVersion: "0.4.0",
      summary: "Percentual acumulado de aditivo acima do limiar de triagem",
      inputs: [{ procurementId: record.procurementId, additivePercent: percent }],
      baseline,
      observed: { procurementId: record.procurementId, additivePercent: percent, thresholdPercent },
      alternativeExplanations: [
        "Alteração de escopo formalmente justificada e permitida.",
        "Evento superveniente ou adequação técnica documentada.",
        "Percentual agregado incorretamente pela fonte ou normalização."
      ],
      supportingEvidence: [{ kind: "analytic-observation", procurementId: record.procurementId, additivePercent: percent }],
      counterEvidence: [],
      gaps: ["Verificar termos aditivos, justificativas, base legal e cálculo do percentual sobre o contrato original."],
      triage: percent >= Math.max(40, thresholdPercent + 15) ? "investigate" : "review",
      humanReviewRequired: true
    };
    findings.push({ findingId: deterministicId("FND", body), ...body });
  }
  return findings;
}

export function buildProcurementProfile(records, options = {}) {
  if (!Array.isArray(records)) throw new TypeError("records deve ser array");
  const validAmount = records.filter((record) => typeof record?.amount === "number" && Number.isFinite(record.amount));
  const validCompetition = records.filter((record) => typeof record?.participantCount === "number" && Number.isFinite(record.participantCount));

  const findings = [
    ...detectRobustOutliers(validAmount, {
      field: "amount",
      threshold: options.priceOutlierThreshold ?? 3.5,
      minimumSampleSize: options.minimumPriceSampleSize ?? 5,
      detectorId: "RISK-PRICE-OUTLIER-001"
    }),
    ...detectLowCompetition(validCompetition, {
      participantField: "participantCount",
      groupBy: "supplierId",
      maximumParticipants: options.maximumParticipants ?? 1,
      minimumOccurrences: options.minimumLowCompetitionOccurrences ?? 2,
      detectorId: "RISK-LOW-COMPETITION-001"
    }),
    ...detectConcentration(validAmount, {
      entityField: "supplierId",
      valueField: "amount",
      thresholdShare: options.concentrationThresholdShare ?? 0.6,
      minimumRecords: options.minimumConcentrationRecords ?? 4,
      detectorId: "RISK-CONCENTRATION-001"
    }),
    ...detectAdditiveBurden(records, {
      thresholdPercent: options.additiveThresholdPercent ?? 25
    })
  ];

  const resolution = resolveProcurementEntities(records);
  const warningCount = records.reduce((sum, record) => sum + (record?.normalization?.warnings?.length ?? 0), 0);
  const byDetector = Object.fromEntries([...new Set(findings.map((finding) => finding.detectorId))]
    .sort()
    .map((detectorId) => [detectorId, findings.filter((finding) => finding.detectorId === detectorId).length]));

  return {
    format: "arca-aie-procurement-profile-v1",
    recordCount: records.length,
    entityCount: resolution.entities.length,
    unresolvedEntityCount: resolution.unresolved.length,
    normalizationWarningCount: warningCount,
    findingCount: findings.length,
    investigateCount: findings.filter((finding) => finding.triage === "investigate").length,
    reviewCount: findings.filter((finding) => finding.triage === "review").length,
    byDetector,
    findings,
    entities: resolution.entities,
    unresolved: resolution.unresolved,
    humanReviewRequired: true
  };
}
