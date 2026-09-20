import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  BLIND_CORPUS_FORMAT,
  buildBlindCorpusManifest
} from "../../aie/src/index.ts";
import {
  PNCP_DEEPENING_CHECKPOINT_FORMAT,
  PNCP_DEEPENING_RESULT_FORMAT
} from "./deepening.ts";
import { PNCP_OPERATIONAL_FORMAT } from "./operational.ts";

export const PNCP_BLIND_FREEZE_FORMAT = "arca-pncp-blind-freeze-v1";

function nonEmpty(value: unknown, field: string, max = 4096): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} e obrigatorio`);
  const text = value.trim();
  if (text.length > max) throw new RangeError(`${field} excede ${max} caracteres`);
  return text;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function structuralTargetKey(target: any): string {
  const cnpj = String(target?.cnpj ?? "");
  const ano = Number(target?.ano);
  const sequencial = Number(target?.sequencial);
  if (!cnpj || !Number.isSafeInteger(ano) || !Number.isSafeInteger(sequencial)) {
    throw new Error("target PNCP sem identificador estrutural suficiente");
  }
  return `${cnpj}-${ano}-${sequencial}`;
}

function targetKey(target: any): string {
  if (target?.procurementControlNumber) return String(target.procurementControlNumber);
  return structuralTargetKey(target);
}

function sampleIdFor(key: string): string {
  const direct = `PNCP-${key}`;
  return direct.length <= 120 ? direct : `PNCP-${sha256(key).slice(0, 24).toUpperCase()}`;
}

function assertWithinHome(home: string, candidate: string): string {
  const absolute = resolve(candidate);
  const rel = relative(home, absolute);
  if (!rel || rel === ".") throw new Error("reportPath nao pode apontar para a raiz ARCA");
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("reportPath fora do ARCA_HOME");
  return absolute;
}

function sourceRefFrom(node: any, fallback: string): string {
  if (typeof node?.sourceRef === "string" && node.sourceRef.trim()) return node.sourceRef.trim();
  if (Array.isArray(node?.sourceRefs)) {
    const first = node.sourceRefs.find((value: unknown) => typeof value === "string" && value.trim());
    if (first) return String(first).trim();
  }
  return fallback;
}

function inputOnlyRecord(record: any, fallbackSourceRef: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("registro analitico PNCP invalido");
  const { findings: _findings, procurementProfile: _profile, ...input } = record;
  return {
    ...input,
    sourceRef: sourceRefFrom(record, fallbackSourceRef)
  };
}

function inputOnlyItem(item: any, fallbackSourceRef: string) {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("item analitico PNCP invalido");
  const { findings: _findings, itemComparabilityProfile: _profile, ...input } = item;
  return {
    ...input,
    sourceRef: sourceRefFrom(item, fallbackSourceRef)
  };
}

function acquisitionSummary(value: any) {
  if (!value || typeof value !== "object") throw new Error("aquisicao de custodia invalida");
  return {
    acquisitionId: nonEmpty(value.acquisitionId, "acquisitionId", 160),
    originalSha256: nonEmpty(value.originalSha256, "originalSha256", 128),
    locator: nonEmpty(value.locator, "locator", 4096)
  };
}

function reportToSample(report: any, key: string, context: any) {
  if (!report || report.format !== PNCP_OPERATIONAL_FORMAT) {
    throw new Error(`relatorio ${key} nao possui formato ${PNCP_OPERATIONAL_FORMAT}`);
  }
  if (report.investigationId !== context.investigationId) throw new Error(`relatorio ${key} pertence a outra investigacao`);
  if (report.custody?.analysisMayProceed !== true) throw new Error(`relatorio ${key} nao possui gate de custodia aprovado`);
  const records = report.analysis?.procurementRecords;
  const items = report.analysis?.items;
  if (!Array.isArray(records) || !Array.isArray(items)) throw new Error(`relatorio ${key} nao contem records/items analiticos`);
  if (records.length === 0 && items.length === 0) throw new Error(`relatorio ${key} nao possui dados analisaveis`);

  const checkpointTarget = context.checkpointTarget;
  const checkpointPreferredKey = targetKey(checkpointTarget);
  const checkpointStructuralKey = structuralTargetKey(checkpointTarget);
  const reportStructuralKey = structuralTargetKey(report.target);
  if (key !== checkpointPreferredKey || reportStructuralKey !== checkpointStructuralKey) {
    throw new Error(`relatorio ${key} nao corresponde ao alvo do checkpoint`);
  }

  const fallbackSourceRef = `pncp:${key}`;
  const acquisitions = (report.custody?.acquisitions ?? []).map(acquisitionSummary);
  if (acquisitions.length === 0) throw new Error(`relatorio ${key} nao possui aquisicoes preservadas`);

  return {
    sampleId: sampleIdFor(key),
    records: records.map((record: any) => inputOnlyRecord(record, fallbackSourceRef)),
    items: items.map((item: any) => inputOnlyItem(item, fallbackSourceRef)),
    metadata: {
      benchmarkSource: "PNCP",
      investigationId: context.investigationId,
      discoveryFingerprint: context.discoveryFingerprint,
      sourceId: report.sourceId ?? null,
      targetKey: key,
      target: checkpointTarget,
      retrievedAt: report.retrievedAt ?? null,
      publicAccessOnly: report.publicAccessOnly === true,
      custody: {
        analysisMayProceed: true,
        acquisitionCount: acquisitions.length,
        acquisitions
      }
    }
  };
}

export function buildPncpBlindCorpusFromReports(reports: any[], options: any) {
  if (!Array.isArray(reports) || reports.length === 0) throw new TypeError("reports deve ser array nao vazio");
  const investigationId = nonEmpty(options?.investigationId, "investigationId", 72);
  const discoveryFingerprint = nonEmpty(options?.discoveryFingerprint, "discoveryFingerprint", 128);
  const corpusId = nonEmpty(
    options?.corpusId ?? `D2-PNCP-${discoveryFingerprint.slice(0, 20).toUpperCase()}`,
    "corpusId",
    120
  );

  const samples = reports.map((entry: any) => reportToSample(entry.report ?? entry, nonEmpty(entry.key ?? targetKey(entry.report?.target ?? entry.target), "targetKey", 200), {
    investigationId,
    discoveryFingerprint,
    checkpointTarget: entry.checkpointTarget ?? entry.target ?? entry.report?.target
  })).sort((a, b) => a.sampleId.localeCompare(b.sampleId));

  const ids = new Set(samples.map((sample) => sample.sampleId));
  if (ids.size !== samples.length) throw new Error("sampleId duplicado no corpus PNCP congelado");

  return {
    format: BLIND_CORPUS_FORMAT,
    corpusId,
    samples
  };
}

async function readJson(path: string, label: string) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error: any) {
    throw new Error(`${label} nao pode ser lido: ${error?.message ?? error}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} nao contem JSON valido`);
  }
}

function validateDeepeningPair(checkpoint: any, summary: any) {
  if (!checkpoint || checkpoint.format !== PNCP_DEEPENING_CHECKPOINT_FORMAT) {
    throw new Error(`checkpoint.format deve ser ${PNCP_DEEPENING_CHECKPOINT_FORMAT}`);
  }
  if (!summary || summary.format !== PNCP_DEEPENING_RESULT_FORMAT) {
    throw new Error(`summary.format deve ser ${PNCP_DEEPENING_RESULT_FORMAT}`);
  }
  if (checkpoint.investigationId !== summary.investigationId) throw new Error("checkpoint e summary pertencem a investigacoes diferentes");
  if (checkpoint.discoveryFingerprint !== summary.discoveryFingerprint) throw new Error("checkpoint e summary pertencem a corpora diferentes");
}

function readiness(summary: any, checkpoint: any) {
  const discoveredTargets = Number(summary.stats?.discoveredTargets ?? 0);
  const completedTotal = Number(summary.stats?.completedTotal ?? Object.keys(checkpoint.completed ?? {}).length);
  const failedTotal = Number(summary.stats?.failedTotal ?? Object.keys(checkpoint.failed ?? {}).length);
  const pendingTotal = Number(summary.stats?.pendingTotal ?? Math.max(0, discoveredTargets - completedTotal - failedTotal));
  const complete = discoveredTargets > 0 && completedTotal === discoveredTargets && failedTotal === 0 && pendingTotal === 0;
  return { discoveredTargets, completedTotal, failedTotal, pendingTotal, complete };
}

export async function freezePncpBlindCorpusFromDeepening(input: any) {
  const home = resolve(nonEmpty(input?.home, "home"));
  const checkpointPath = assertWithinHome(home, nonEmpty(input?.checkpointPath, "checkpointPath"));
  const summaryPath = assertWithinHome(home, nonEmpty(input?.summaryPath, "summaryPath"));
  const checkpoint = await readJson(checkpointPath, "checkpoint C4");
  const summary = await readJson(summaryPath, "summary C4");
  validateDeepeningPair(checkpoint, summary);

  const state = readiness(summary, checkpoint);
  if (input?.allowIncomplete !== true && !state.complete) {
    throw new Error(`corpus C4 incompleto: completed=${state.completedTotal}, failed=${state.failedTotal}, pending=${state.pendingTotal}, discovered=${state.discoveredTargets}`);
  }

  const entries = Object.entries(checkpoint.completed ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) throw new Error("checkpoint C4 nao possui alvos concluidos");
  const reports = [];
  for (const [key, value] of entries as [string, any][]) {
    const reportPath = assertWithinHome(home, nonEmpty(value?.reportPath, `completed.${key}.reportPath`));
    const report = await readJson(reportPath, `relatorio C2 ${key}`);
    reports.push({ key, checkpointTarget: value.target, report });
  }

  const corpus = buildPncpBlindCorpusFromReports(reports, {
    corpusId: input?.corpusId,
    investigationId: checkpoint.investigationId,
    discoveryFingerprint: checkpoint.discoveryFingerprint
  });
  const manifest = buildBlindCorpusManifest(corpus);
  return {
    format: PNCP_BLIND_FREEZE_FORMAT,
    corpus,
    manifest,
    readiness: state,
    invariants: {
      sourceIsPublicPncp: true,
      onlyCompletedC2ReportsIncluded: true,
      custodyRequiredPerSample: true,
      detectorOutputsExcludedFromCorpus: true,
      answerKeyIncluded: false,
      coreMutationPerformed: false,
      incompleteCorpusRequiresExplicitOptIn: true
    }
  };
}
