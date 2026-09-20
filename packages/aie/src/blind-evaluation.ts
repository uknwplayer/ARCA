import { createHash } from "node:crypto";
import {
  auditFinding,
  deterministicId,
  stableStringify
} from "./engine.ts";
import {
  buildProcurementProfile,
  normalizeProcurementDataset
} from "./procurement.ts";
import {
  buildItemComparabilityProfile,
  normalizeProcurementItems
} from "./comparability.ts";

export const BLIND_CORPUS_FORMAT = "arca-aie-blind-procurement-corpus-v1";
export const BLIND_CORPUS_MANIFEST_FORMAT = "arca-aie-blind-corpus-manifest-v1";
export const BLIND_RUN_FORMAT = "arca-aie-blind-procurement-run-v1";
export const BLIND_ANSWER_KEY_FORMAT = "arca-aie-blind-procurement-answer-key-v1";
export const BLIND_ANSWER_KEY_COMMITMENT_FORMAT = "arca-aie-blind-answer-key-commitment-v1";
export const BLIND_SCORE_FORMAT = "arca-aie-blind-procurement-score-v1";

const FORBIDDEN_LABEL_FIELDS = new Set([
  "answerKey",
  "expected",
  "expectedDetectorIds",
  "groundTruth",
  "label",
  "labels",
  "truth"
]);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function nonEmpty(value: unknown, field: string, max = 160): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} e obrigatorio`);
  const text = value.trim();
  if (text.length > max) throw new RangeError(`${field} excede ${max} caracteres`);
  return text;
}

function uniqueStrings(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} deve ser array`);
  const values = value.map((item) => nonEmpty(item, field, 200));
  return [...new Set(values)].sort();
}

function rejectEmbeddedLabels(value: any, path = "corpus") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectEmbeddedLabels(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_LABEL_FIELDS.has(key)) {
      throw new Error(`rotulo cego proibido dentro do corpus: ${path}.${key}`);
    }
    rejectEmbeddedLabels(child, `${path}.${key}`);
  }
}

function validateCorpus(corpus: any) {
  if (!corpus || corpus.format !== BLIND_CORPUS_FORMAT) throw new TypeError(`corpus.format deve ser ${BLIND_CORPUS_FORMAT}`);
  rejectEmbeddedLabels(corpus);
  const corpusId = nonEmpty(corpus.corpusId, "corpusId", 120);
  if (!Array.isArray(corpus.samples) || corpus.samples.length === 0) throw new TypeError("corpus.samples deve ser array nao vazio");
  const ids = new Set<string>();
  const samples = corpus.samples.map((sample: any, index: number) => {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) throw new TypeError(`sample ${index + 1} invalido`);
    const sampleId = nonEmpty(sample.sampleId, `samples[${index}].sampleId`, 120);
    if (ids.has(sampleId)) throw new Error(`sampleId duplicado: ${sampleId}`);
    ids.add(sampleId);
    const records = sample.records ?? [];
    const items = sample.items ?? [];
    if (!Array.isArray(records) || !Array.isArray(items)) throw new TypeError(`sample ${sampleId} exige records/items como arrays`);
    if (records.length === 0 && items.length === 0) throw new Error(`sample ${sampleId} nao possui dados analisaveis`);
    return {
      sampleId,
      records,
      items,
      metadata: sample.metadata && typeof sample.metadata === "object" && !Array.isArray(sample.metadata)
        ? sample.metadata
        : {}
    };
  });
  return { corpusId, samples };
}

function normalizedCorpusMaterial(validated: any) {
  return {
    corpusId: validated.corpusId,
    samples: [...validated.samples]
      .map((sample: any) => ({
        sampleId: sample.sampleId,
        records: sample.records,
        items: sample.items,
        metadata: sample.metadata
      }))
      .sort((a, b) => a.sampleId.localeCompare(b.sampleId))
  };
}

export function buildBlindCorpusManifest(corpus: any) {
  const validated = validateCorpus(corpus);
  const material = normalizedCorpusMaterial(validated);
  return {
    format: BLIND_CORPUS_MANIFEST_FORMAT,
    corpusId: validated.corpusId,
    corpusFingerprint: deterministicId("BLINDCORPUS", material),
    sampleCount: validated.samples.length,
    samples: [...validated.samples]
      .map((sample: any) => ({
        sampleId: sample.sampleId,
        recordCount: sample.records.length,
        itemCount: sample.items.length
      }))
      .sort((a, b) => a.sampleId.localeCompare(b.sampleId)),
    invariants: {
      embeddedLabelsRejected: true,
      answerKeyIncluded: false
    }
  };
}

function sourceCoverage(nodes: any[]) {
  if (nodes.length === 0) return { covered: 0, total: 0, ratio: 1 };
  const covered = nodes.filter((node) => Array.isArray(node?.sourceRefs) && node.sourceRefs.length > 0).length;
  return { covered, total: nodes.length, ratio: covered / nodes.length };
}

function materialAudit(entry: any) {
  return entry?.audit?.status === "survived" && ["review", "investigate"].includes(entry?.finding?.triage);
}

export function buildBlindProcurementRun(corpus: any, options: any = {}) {
  const validated = validateCorpus(corpus);
  const manifest = buildBlindCorpusManifest(corpus);
  const samples = validated.samples.map((sample) => {
    const sourcePrefix = `blind:${validated.corpusId}:${sample.sampleId}`;
    const records = normalizeProcurementDataset(sample.records, { sourceRef: `${sourcePrefix}:record` });
    const items = normalizeProcurementItems(sample.items, { sourceRef: `${sourcePrefix}:item` });
    const procurementProfile = buildProcurementProfile(records, options.procurementProfileOptions ?? {});
    const itemComparabilityProfile = buildItemComparabilityProfile(items, options.itemComparabilityOptions ?? {});
    const findings = [
      ...(procurementProfile.findings ?? []),
      ...(itemComparabilityProfile.findings ?? [])
    ];
    const audits = findings.map((finding) => auditFinding(finding, options.auditOptions ?? {}));
    const materialFindings = audits.filter(materialAudit).map((entry) => entry.finding);
    const recordProvenance = sourceCoverage(records);
    const itemProvenance = sourceCoverage(items);
    const allNodes = records.length + items.length;
    const coveredNodes = recordProvenance.covered + itemProvenance.covered;
    return {
      sampleId: sample.sampleId,
      metadata: sample.metadata,
      normalized: {
        recordCount: records.length,
        itemCount: items.length,
        recordProvenance,
        itemProvenance
      },
      procurementProfile,
      itemComparabilityProfile,
      audits,
      materialFindingCount: materialFindings.length,
      materialDetectorIds: [...new Set(materialFindings.map((finding) => finding.detectorId))].sort(),
      provenanceCoverage: {
        coveredNodes,
        totalNodes: allNodes,
        ratio: allNodes === 0 ? 1 : coveredNodes / allNodes
      }
    };
  });

  const signatureMaterial = {
    corpusId: validated.corpusId,
    corpusFingerprint: manifest.corpusFingerprint,
    samples: samples.map((sample) => ({
      sampleId: sample.sampleId,
      procurementProfile: sample.procurementProfile,
      itemComparabilityProfile: sample.itemComparabilityProfile,
      audits: sample.audits,
      materialDetectorIds: sample.materialDetectorIds,
      provenanceCoverage: sample.provenanceCoverage
    }))
  };

  return {
    format: BLIND_RUN_FORMAT,
    corpusId: validated.corpusId,
    corpusFingerprint: manifest.corpusFingerprint,
    runId: deterministicId("BLINDRUN", signatureMaterial),
    sampleCount: samples.length,
    samples,
    invariants: {
      answerKeyAvailableDuringAnalysis: false,
      embeddedLabelsRejected: true,
      corpusFingerprintBound: true,
      anomalyIsNotIrregularity: true,
      humanReviewRequired: true,
      coreMutationPerformed: false
    }
  };
}

function normalizeAnswerKey(answerKey: any) {
  if (!answerKey || answerKey.format !== BLIND_ANSWER_KEY_FORMAT) {
    throw new TypeError(`answerKey.format deve ser ${BLIND_ANSWER_KEY_FORMAT}`);
  }
  const corpusId = nonEmpty(answerKey.corpusId, "answerKey.corpusId", 120);
  if (!Array.isArray(answerKey.expectations)) throw new TypeError("answerKey.expectations deve ser array");
  const bySample = new Map<string, any>();
  for (const expectation of answerKey.expectations) {
    const sampleId = nonEmpty(expectation?.sampleId, "expectation.sampleId", 120);
    if (bySample.has(sampleId)) throw new Error(`expectativa duplicada: ${sampleId}`);
    bySample.set(sampleId, {
      sampleId,
      expectedDetectorIds: uniqueStrings(expectation?.expectedDetectorIds ?? [], "expectedDetectorIds"),
      allowAdditionalDetectors: expectation?.allowAdditionalDetectors === true
    });
  }
  const normalized = {
    format: BLIND_ANSWER_KEY_FORMAT,
    corpusId,
    expectations: [...bySample.values()].sort((a, b) => a.sampleId.localeCompare(b.sampleId))
  };
  return { corpusId, bySample, normalized };
}

function validateAnswerKey(answerKey: any, run: any) {
  const normalized = normalizeAnswerKey(answerKey);
  if (normalized.corpusId !== run.corpusId) throw new Error("answer key pertence a outro corpus");
  const runIds = run.samples.map((sample: any) => sample.sampleId).sort();
  const keyIds = [...normalized.bySample.keys()].sort();
  if (stableStringify(runIds) !== stableStringify(keyIds)) {
    throw new Error("answer key deve cobrir exatamente os samples executados");
  }
  return normalized.bySample;
}

function answerKeyCommitmentDigest(answerKey: any, nonce: string) {
  const normalized = normalizeAnswerKey(answerKey);
  const secret = nonEmpty(nonce, "nonce", 4096);
  return {
    normalized,
    digest: sha256(`ARCA-BLIND-ANSWER-KEY-COMMITMENT-V1\n${secret}\n${stableStringify(normalized.normalized)}`)
  };
}

export function createBlindAnswerKeyCommitment(answerKey: any, nonce: string) {
  const { normalized, digest } = answerKeyCommitmentDigest(answerKey, nonce);
  return {
    format: BLIND_ANSWER_KEY_COMMITMENT_FORMAT,
    corpusId: normalized.corpusId,
    algorithm: "sha256",
    commitment: digest,
    expectationCount: normalized.normalized.expectations.length,
    nonceRequiredToOpen: true,
    answerKeyIncluded: false
  };
}

export function verifyBlindAnswerKeyCommitment(commitment: any, answerKey: any, nonce: string) {
  if (!commitment || commitment.format !== BLIND_ANSWER_KEY_COMMITMENT_FORMAT) {
    throw new TypeError(`commitment.format deve ser ${BLIND_ANSWER_KEY_COMMITMENT_FORMAT}`);
  }
  if (commitment.algorithm !== "sha256") throw new Error("algoritmo de commitment nao suportado");
  const { normalized, digest } = answerKeyCommitmentDigest(answerKey, nonce);
  const valid = commitment.corpusId === normalized.corpusId && commitment.commitment === digest;
  return {
    valid,
    corpusId: normalized.corpusId,
    commitment: commitment.commitment,
    computedCommitment: digest
  };
}

export function scoreBlindProcurementRun(run: any, answerKey: any) {
  if (!run || run.format !== BLIND_RUN_FORMAT) throw new TypeError(`run.format deve ser ${BLIND_RUN_FORMAT}`);
  if (run.invariants?.answerKeyAvailableDuringAnalysis !== false) throw new Error("run nao preserva separacao cega do answer key");
  const expectations = validateAnswerKey(answerKey, run);
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let expectedEmptySamples = 0;
  let correctEmptySamples = 0;
  let allFindingCount = 0;
  let survivedFindingCount = 0;
  let provenanceCovered = 0;
  let provenanceTotal = 0;

  const samples = run.samples.map((sample: any) => {
    const expectation = expectations.get(sample.sampleId);
    const expected = new Set(expectation.expectedDetectorIds);
    const predicted = new Set(sample.materialDetectorIds ?? []);
    const tp = [...expected].filter((detectorId) => predicted.has(detectorId));
    const fn = [...expected].filter((detectorId) => !predicted.has(detectorId));
    const fp = expectation.allowAdditionalDetectors
      ? []
      : [...predicted].filter((detectorId) => !expected.has(detectorId));
    truePositive += tp.length;
    falsePositive += fp.length;
    falseNegative += fn.length;
    if (expected.size === 0) {
      expectedEmptySamples += 1;
      if (predicted.size === 0) correctEmptySamples += 1;
    }
    allFindingCount += sample.audits?.length ?? 0;
    survivedFindingCount += (sample.audits ?? []).filter(materialAudit).length;
    provenanceCovered += sample.provenanceCoverage?.coveredNodes ?? 0;
    provenanceTotal += sample.provenanceCoverage?.totalNodes ?? 0;
    return {
      sampleId: sample.sampleId,
      expectedDetectorIds: [...expected].sort(),
      predictedDetectorIds: [...predicted].sort(),
      truePositiveDetectorIds: tp.sort(),
      falsePositiveDetectorIds: fp.sort(),
      falseNegativeDetectorIds: fn.sort(),
      exactDetectorMatch: fp.length === 0 && fn.length === 0
    };
  });

  const precision = truePositive + falsePositive === 0 ? 1 : truePositive / (truePositive + falsePositive);
  const recall = truePositive + falseNegative === 0 ? 1 : truePositive / (truePositive + falseNegative);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const noFindingAccuracy = expectedEmptySamples === 0 ? null : correctEmptySamples / expectedEmptySamples;
  const provenanceCoverage = provenanceTotal === 0 ? 1 : provenanceCovered / provenanceTotal;
  const auditorSurvivalRate = allFindingCount === 0 ? null : survivedFindingCount / allFindingCount;

  return {
    format: BLIND_SCORE_FORMAT,
    corpusId: run.corpusId,
    corpusFingerprint: run.corpusFingerprint ?? null,
    runId: run.runId,
    answerKeyFingerprint: deterministicId("BLINDKEY", normalizeAnswerKey(answerKey).normalized),
    metrics: {
      truePositive,
      falsePositive,
      falseNegative,
      precision,
      recall,
      f1,
      expectedEmptySamples,
      correctEmptySamples,
      noFindingAccuracy,
      provenanceCoverage,
      auditorSurvivalRate,
      blindTruePositiveCount: truePositive
    },
    samples,
    invariants: {
      scoringOccurredAfterAnalysis: true,
      answerKeyAvailableDuringAnalysis: false,
      scoreDoesNotDeclareIrregularity: true
    }
  };
}

export function scoreCommittedBlindProcurementRun(run: any, commitment: any, answerKey: any, nonce: string) {
  if (!run || run.format !== BLIND_RUN_FORMAT) throw new TypeError(`run.format deve ser ${BLIND_RUN_FORMAT}`);
  if (commitment?.corpusId !== run.corpusId) throw new Error("commitment pertence a outro corpus");
  const verification = verifyBlindAnswerKeyCommitment(commitment, answerKey, nonce);
  if (!verification.valid) throw new Error("answer key ou nonce nao corresponde ao commitment pre-registrado");
  const score = scoreBlindProcurementRun(run, answerKey);
  return {
    ...score,
    preregistration: {
      answerKeyCommitmentFormat: commitment.format,
      commitment: commitment.commitment,
      commitmentVerified: true,
      nonceDisclosedOnlyAtScoring: true
    }
  };
}

export function compareBlindProcurementRuns(left: any, right: any) {
  if (!left || left.format !== BLIND_RUN_FORMAT || !right || right.format !== BLIND_RUN_FORMAT) {
    throw new TypeError("runs cegos invalidos");
  }
  if (left.corpusId !== right.corpusId) throw new Error("runs pertencem a corpora diferentes");
  if (left.corpusFingerprint !== right.corpusFingerprint) throw new Error("runs usam fingerprints de corpus diferentes");
  const leftById = new Map(left.samples.map((sample: any) => [sample.sampleId, sample]));
  const rightById = new Map(right.samples.map((sample: any) => [sample.sampleId, sample]));
  const sampleIds = [...new Set([...leftById.keys(), ...rightById.keys()])].sort();
  const changedSampleIds = sampleIds.filter((sampleId) => {
    const a: any = leftById.get(sampleId);
    const b: any = rightById.get(sampleId);
    if (!a || !b) return true;
    return stableStringify({
      procurementProfile: a.procurementProfile,
      itemComparabilityProfile: a.itemComparabilityProfile,
      audits: a.audits,
      materialDetectorIds: a.materialDetectorIds
    }) !== stableStringify({
      procurementProfile: b.procurementProfile,
      itemComparabilityProfile: b.itemComparabilityProfile,
      audits: b.audits,
      materialDetectorIds: b.materialDetectorIds
    });
  });
  return {
    corpusId: left.corpusId,
    corpusFingerprint: left.corpusFingerprint,
    leftRunId: left.runId,
    rightRunId: right.runId,
    reproducible: changedSampleIds.length === 0 && left.runId === right.runId,
    changedSampleIds
  };
}
