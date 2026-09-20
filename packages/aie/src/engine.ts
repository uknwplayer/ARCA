import { createHash } from "node:crypto";

export const AIE_FINDING_FORMAT = "arca-aie-finding-v1";
export const AIE_BASELINE_FORMAT = "arca-aie-baseline-v1";
export const AIE_DETECTOR_FORMAT = "arca-aie-detector-v1";

export const TRIAGE_STATES = Object.freeze([
  "discarded",
  "weak",
  "review",
  "investigate",
  "blocked",
  "data-error"
]);

export const RISK_PATTERN_LIBRARY_V1 = Object.freeze([
  Object.freeze({
    detectorId: "RISK-PRICE-OUTLIER-001",
    domain: "public-procurement",
    description: "Valor numerico materialmente distante de comparaveis robustos.",
    severity: "medium",
    legitimateExplanations: [
      "Especificacao, quantidade ou unidade de medida diferente.",
      "Urgencia, logistica, qualidade ou condicao contratual diferente.",
      "Erro de origem, normalizacao ou unidade monetaria."
    ]
  }),
  Object.freeze({
    detectorId: "RISK-LOW-COMPETITION-001",
    domain: "public-procurement",
    description: "Baixa competicao recorrente em grupo comparavel.",
    severity: "medium",
    legitimateExplanations: [
      "Mercado local com poucos fornecedores aptos.",
      "Objeto altamente especializado.",
      "Modalidade ou evento legalmente restritivo da competicao."
    ]
  }),
  Object.freeze({
    detectorId: "RISK-CONCENTRATION-001",
    domain: "public-procurement",
    description: "Concentracao elevada de valor em uma mesma entidade dentro do universo analisado.",
    severity: "medium",
    legitimateExplanations: [
      "Fornecedor possui escala ou especializacao dominante legitima.",
      "Universo analisado e pequeno ou filtrado de forma estreita.",
      "Contratos plurianuais ou objetos de grande valor distorcem a participacao."
    ]
  })
]);

function assertRecordArray(records) {
  if (!Array.isArray(records)) throw new TypeError("records deve ser array");
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function median(sorted) {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function deterministicId(prefix, value) {
  const digest = createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 12).toUpperCase();
  return `${prefix}-${digest}`;
}

export function buildNumericBaseline(records, field, options = {}) {
  assertRecordArray(records);
  if (!field || typeof field !== "string") throw new TypeError("field deve ser string nao vazia");

  const values = records.map((record) => record?.[field]).filter(finiteNumber).sort((a, b) => a - b);
  const sampleSize = values.length;
  const mean = sampleSize ? values.reduce((sum, value) => sum + value, 0) / sampleSize : null;
  const med = median(values);
  const deviations = med === null ? [] : values.map((value) => Math.abs(value - med)).sort((a, b) => a - b);
  const mad = median(deviations);
  const variance = sampleSize && mean !== null
    ? values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / sampleSize
    : null;
  const standardDeviation = variance === null ? null : Math.sqrt(variance);
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);

  const universe = {
    recordCount: records.length,
    numericCount: sampleSize,
    excludedCount: records.length - sampleSize,
    filters: options.filters ?? {},
    group: options.group ?? null
  };

  return {
    format: AIE_BASELINE_FORMAT,
    baselineId: deterministicId("BLN", { field, values, universe }),
    field,
    method: "robust-descriptive-v1",
    universe,
    sampleSize,
    statistics: {
      min: sampleSize ? values[0] : null,
      max: sampleSize ? values[sampleSize - 1] : null,
      mean,
      median: med,
      mad,
      q1,
      q3,
      iqr: q1 === null || q3 === null ? null : q3 - q1,
      standardDeviation
    },
    limitations: [
      ...(options.limitations ?? []),
      ...(sampleSize < 5 ? ["Amostra pequena; resultados devem ser tratados como exploratorios."] : []),
      ...(records.length !== sampleSize ? ["Registros sem valor numerico foram excluidos do baseline."] : [])
    ]
  };
}

function robustScore(value, baseline) {
  const med = baseline.statistics.median;
  const mad = baseline.statistics.mad;
  if (med === null) return 0;
  if (finiteNumber(mad) && mad > 0) return 0.6745 * (value - med) / mad;
  const sd = baseline.statistics.standardDeviation;
  const mean = baseline.statistics.mean;
  if (finiteNumber(sd) && sd > 0 && finiteNumber(mean)) return (value - mean) / sd;
  return 0;
}

function detectorDefinition(detectorId, parameters) {
  const pattern = RISK_PATTERN_LIBRARY_V1.find((item) => item.detectorId === detectorId);
  return {
    format: AIE_DETECTOR_FORMAT,
    detectorId,
    version: "0.4.0",
    domain: pattern?.domain ?? "general",
    description: pattern?.description ?? detectorId,
    parameters,
    legitimateExplanations: pattern?.legitimateExplanations ?? [],
    humanReviewRequired: true
  };
}

function makeFinding({ detector, summary, inputs, baseline, observed, supportingEvidence = [], counterEvidence = [], gaps = [], triage = "review", alternativeExplanations = [] }) {
  if (!TRIAGE_STATES.includes(triage)) throw new Error(`triage invalido: ${triage}`);
  const findingBody = {
    format: AIE_FINDING_FORMAT,
    domain: detector.domain,
    detectorId: detector.detectorId,
    detectorVersion: detector.version,
    summary,
    inputs,
    baseline,
    observed,
    alternativeExplanations,
    supportingEvidence,
    counterEvidence,
    gaps,
    triage,
    humanReviewRequired: true
  };
  return { findingId: deterministicId("FND", findingBody), ...findingBody };
}

export function detectRobustOutliers(records, options = {}) {
  assertRecordArray(records);
  const field = options.field ?? "amount";
  const threshold = options.threshold ?? 3.5;
  const minimumSampleSize = options.minimumSampleSize ?? 5;
  const baseline = options.baseline ?? buildNumericBaseline(records, field, options.baselineOptions);
  const detector = detectorDefinition(options.detectorId ?? "RISK-PRICE-OUTLIER-001", { field, threshold, minimumSampleSize });

  if (baseline.sampleSize < minimumSampleSize) return [];

  const findings = [];
  for (const record of records) {
    const value = record?.[field];
    if (!finiteNumber(value)) continue;
    const score = robustScore(value, baseline);
    if (Math.abs(score) < threshold) continue;
    const recordId = String(record.id ?? record.recordId ?? deterministicId("REC", record));
    const triage = Math.abs(score) >= threshold * 1.5 ? "investigate" : "review";
    findings.push(makeFinding({
      detector,
      summary: `Valor de ${field} fora do baseline robusto`,
      inputs: [{ recordId, field, value }],
      baseline,
      observed: { recordId, field, value, robustScore: score, absoluteRobustScore: Math.abs(score), threshold },
      supportingEvidence: [{ kind: "analytic-observation", recordId, field, value, robustScore: score }],
      alternativeExplanations: detector.legitimateExplanations,
      gaps: ["Confirmar comparabilidade de objeto, unidade, quantidade e condicoes contratuais antes de qualquer inferencia substantiva."],
      triage
    }));
  }
  return findings;
}

export function detectLowCompetition(records, options = {}) {
  assertRecordArray(records);
  const participantField = options.participantField ?? "participantCount";
  const groupBy = options.groupBy ?? "supplierId";
  const maximumParticipants = options.maximumParticipants ?? 1;
  const minimumOccurrences = options.minimumOccurrences ?? 2;
  const detector = detectorDefinition(options.detectorId ?? "RISK-LOW-COMPETITION-001", {
    participantField,
    groupBy,
    maximumParticipants,
    minimumOccurrences
  });
  const baseline = buildNumericBaseline(records, participantField, { group: "all-records" });
  const grouped = new Map();

  for (const record of records) {
    const participants = record?.[participantField];
    const group = record?.[groupBy];
    if (!finiteNumber(participants) || group === undefined || group === null) continue;
    if (!grouped.has(String(group))) grouped.set(String(group), []);
    grouped.get(String(group)).push(record);
  }

  const findings = [];
  for (const [group, groupRecords] of grouped) {
    const low = groupRecords.filter((record) => record[participantField] <= maximumParticipants);
    if (low.length < minimumOccurrences) continue;
    const ratio = low.length / groupRecords.length;
    findings.push(makeFinding({
      detector,
      summary: `Baixa competicao recorrente no grupo ${group}`,
      inputs: low.map((record) => ({ recordId: String(record.id ?? deterministicId("REC", record)), participants: record[participantField] })),
      baseline,
      observed: { groupBy, group, lowCompetitionOccurrences: low.length, groupRecordCount: groupRecords.length, ratio, maximumParticipants },
      supportingEvidence: low.map((record) => ({ kind: "analytic-observation", recordId: String(record.id ?? deterministicId("REC", record)), participantCount: record[participantField] })),
      alternativeExplanations: detector.legitimateExplanations,
      gaps: ["Verificar modalidade, objeto, habilitacao exigida e universo real de fornecedores aptos."],
      triage: ratio >= 0.75 && low.length >= 3 ? "investigate" : "review"
    }));
  }
  return findings;
}

export function detectConcentration(records, options = {}) {
  assertRecordArray(records);
  const entityField = options.entityField ?? "supplierId";
  const valueField = options.valueField ?? "amount";
  const thresholdShare = options.thresholdShare ?? 0.6;
  const minimumRecords = options.minimumRecords ?? 4;
  if (records.length < minimumRecords) return [];

  const totals = new Map();
  let totalValue = 0;
  for (const record of records) {
    const entity = record?.[entityField];
    const value = record?.[valueField];
    if (entity === undefined || entity === null || !finiteNumber(value) || value < 0) continue;
    totalValue += value;
    const key = String(entity);
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  if (totalValue <= 0 || totals.size < 2) return [];

  const shares = [...totals.entries()]
    .map(([entity, value]) => ({ entity, value, share: value / totalValue }))
    .sort((a, b) => b.share - a.share);
  const top = shares[0];
  if (top.share < thresholdShare) return [];

  const hhi = shares.reduce((sum, item) => sum + item.share ** 2, 0);
  const detector = detectorDefinition(options.detectorId ?? "RISK-CONCENTRATION-001", {
    entityField,
    valueField,
    thresholdShare,
    minimumRecords
  });
  const baseline = buildNumericBaseline(records, valueField, { group: "all-records" });

  return [makeFinding({
    detector,
    summary: `Concentracao elevada de ${valueField} em ${top.entity}`,
    inputs: records.filter((record) => String(record?.[entityField]) === top.entity).map((record) => ({
      recordId: String(record.id ?? deterministicId("REC", record)),
      value: record[valueField]
    })),
    baseline,
    observed: { entityField, entity: top.entity, entityValue: top.value, totalValue, share: top.share, thresholdShare, hhi, entityCount: shares.length },
    supportingEvidence: [{ kind: "aggregate", entity: top.entity, share: top.share, totalValue, hhi }],
    alternativeExplanations: detector.legitimateExplanations,
    gaps: ["Comparar com outros periodos, objetos e mercados antes de interpretar concentracao como risco substantivo."],
    triage: top.share >= Math.max(0.8, thresholdShare + 0.15) ? "investigate" : "review"
  })];
}

export function buildHypothesisSet(finding) {
  if (!finding || finding.format !== AIE_FINDING_FORMAT) throw new TypeError("finding AIE invalido");
  const suspicious = {
    hypothesisId: deterministicId("HYP", { findingId: finding.findingId, kind: "risk" }),
    kind: "risk",
    statement: `O padrao observado em ${finding.findingId} pode refletir um risco material que merece verificacao.`,
    increasesWith: ["Fonte primaria adicional confirma o padrao e sua comparabilidade.", "O padrao persiste em baseline alternativo adequado."],
    decreasesWith: ["Explicacao legitima documentada explica integralmente o desvio.", "O achado desaparece apos correcao de dados ou unidade."]
  };
  const legitimate = (finding.alternativeExplanations ?? []).map((statement, index) => ({
    hypothesisId: deterministicId("HYP", { findingId: finding.findingId, kind: "legitimate", index, statement }),
    kind: "legitimate",
    statement,
    increasesWith: ["Documento ou dado independente confirma esta explicacao."],
    decreasesWith: ["Evidencia primaria contradiz esta explicacao."]
  }));
  const dataError = {
    hypothesisId: deterministicId("HYP", { findingId: finding.findingId, kind: "data-error" }),
    kind: "data-error",
    statement: "O achado pode decorrer de erro de origem, transformacao, unidade, duplicidade ou normalizacao.",
    increasesWith: ["Divergencia entre registro normalizado e fonte primaria."],
    decreasesWith: ["Reproducao independente confirma os mesmos valores e unidades."]
  };
  return {
    findingId: finding.findingId,
    hypotheses: [suspicious, ...legitimate, dataError],
    gaps: [...(finding.gaps ?? [])],
    humanReviewRequired: true
  };
}

export function auditFinding(finding, options = {}) {
  if (!finding || finding.format !== AIE_FINDING_FORMAT) throw new TypeError("finding AIE invalido");
  const minimumSampleSize = options.minimumSampleSize ?? 5;
  const sampleSize = finding.baseline?.sampleSize ?? 0;
  const counterEvidence = [...(finding.counterEvidence ?? []), ...(options.counterEvidence ?? [])];
  const parameterVariants = options.parameterVariants ?? [];
  const reasons = [];
  let triage = finding.triage;
  let status = "survived";

  if (options.dataQualityIssue === true) {
    status = "rejected";
    triage = "data-error";
    reasons.push("Auditoria identificou problema material de qualidade ou normalizacao dos dados.");
  } else if (sampleSize < minimumSampleSize) {
    status = "blocked";
    triage = "blocked";
    reasons.push(`Amostra ${sampleSize} inferior ao minimo ${minimumSampleSize}.`);
  } else if (parameterVariants.length > 0 && parameterVariants.every((variant) => variant?.findingPersists === false)) {
    status = "rejected";
    triage = "discarded";
    reasons.push("O achado desapareceu em todos os parametros alternativos testados.");
  } else if (parameterVariants.some((variant) => variant?.findingPersists === false)) {
    status = "downgraded";
    triage = "weak";
    reasons.push("O achado e sensivel a parametros alternativos plausiveis.");
  } else if (counterEvidence.length > (finding.supportingEvidence?.length ?? 0)) {
    status = "downgraded";
    triage = "weak";
    reasons.push("Contraevidencia registrada supera numericamente o suporte analitico atual.");
  } else {
    reasons.push("Nenhum teste adversarial fornecido derrubou o achado nas regras deterministicas atuais.");
  }

  return {
    finding: { ...finding, counterEvidence, triage },
    audit: {
      auditId: deterministicId("AUD", { findingId: finding.findingId, status, triage, reasons, parameterVariants, counterEvidence }),
      findingId: finding.findingId,
      status,
      triage,
      reasons,
      tests: {
        minimumSampleSize,
        sampleSize,
        parameterVariants,
        counterEvidenceCount: counterEvidence.length
      },
      humanReviewRequired: true
    }
  };
}

export function proposeCase({ finding, audit, territory, domain, period, sources = [], limits = [] }) {
  if (!finding || finding.format !== AIE_FINDING_FORMAT) throw new TypeError("finding AIE invalido");
  if (!audit || audit.findingId !== finding.findingId) throw new TypeError("audit ausente ou incompatível");
  if (audit.status !== "survived" || finding.triage !== "investigate") {
    throw new Error("Somente achado investigável que sobreviveu à auditoria pode gerar proposta de caso");
  }
  if (!territory || !domain || !period) throw new Error("territory, domain e period sao obrigatorios");

  const hypothesisSet = buildHypothesisSet(finding);
  const body = {
    format: "arca-aie-case-proposal-v1",
    territory,
    domain,
    period,
    suggestedQuestion: `Qual explicacao verificavel melhor responde ao achado ${finding.findingId} sem presumir irregularidade?`,
    scope: `Verificar ${finding.summary} no dominio ${domain}, territorio ${territory}, periodo ${period}.`,
    limits: [...limits, "Usar somente fontes publicas ou legitimamente acessiveis.", "Nao inferir culpa a partir de associacao ou anomalia."],
    sources,
    findings: [finding],
    hypotheses: hypothesisSet.hypotheses,
    gaps: hypothesisSet.gaps,
    justification: "Achado deterministico classificado como investigate e preservado apos auditoria adversarial.",
    humanReviewRequired: true
  };
  return { proposalId: deterministicId("AIECASE", body), ...body };
}

export function markPublicTrailEnd({ lastPublicStep, reason, restrictedCategory, sourceRefs = [] }) {
  if (!lastPublicStep || !reason) throw new Error("lastPublicStep e reason sao obrigatorios");
  return {
    event: "PUBLIC_TRAIL_END",
    lastPublicStep,
    reason,
    restrictedCategory: restrictedCategory ?? "non-public-data",
    sourceRefs,
    continuationAllowed: false,
    humanReviewRequired: true
  };
}
