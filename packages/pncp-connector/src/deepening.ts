import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildItemComparabilityProfile, buildProcurementProfile } from "../../aie/src/index.ts";
import { PNCP_DISCOVERY_FORMAT } from "./discovery.ts";
import {
  PNCP_NETWORK_CONFIRMATION,
  PNCP_OPERATIONAL_FORMAT,
  runPncpOperationalCollection
} from "./operational.ts";

export const PNCP_DEEPENING_PLAN_FORMAT = "arca-pncp-deepening-plan-v1";
export const PNCP_DEEPENING_CHECKPOINT_FORMAT = "arca-pncp-deepening-checkpoint-v1";
export const PNCP_DEEPENING_RESULT_FORMAT = "arca-pncp-deepening-result-v1";
export const DEFAULT_DEEPENING_MAX_TARGETS_PER_RUN = 20;
export const DEFAULT_DEEPENING_MAX_FAILURES_PER_RUN = 5;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function positiveInteger(value: unknown, field: string, max: number): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > max) throw new TypeError(`${field} deve ser inteiro entre 1 e ${max}`);
  return parsed;
}

function nonEmpty(value: unknown, field: string, max = 4096): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} e obrigatorio`);
  if (value.length > max) throw new RangeError(`${field} excede ${max} caracteres`);
  return value.trim();
}

function validateInvestigationId(value: unknown): string {
  const id = nonEmpty(value, "investigationId", 72);
  if (!/^INV-[A-Z0-9][A-Z0-9-]{0,63}$/.test(id) || id.includes("..")) throw new TypeError("investigationId invalido");
  return id;
}

function validateTarget(target: any) {
  if (!target || typeof target !== "object") return null;
  const cnpj = String(target.cnpj ?? "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]+/g, "");
  const ano = Number(target.ano);
  const sequencial = Number(target.sequencial);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj)) return null;
  if (!Number.isSafeInteger(ano) || ano <= 0 || !Number.isSafeInteger(sequencial) || sequencial <= 0) return null;
  return {
    procurementControlNumber: target.procurementControlNumber ? String(target.procurementControlNumber) : null,
    cnpj,
    ano,
    sequencial,
    objectDescription: target.objectDescription ?? null,
    modalityId: target.modalityId ?? null,
    modalityName: target.modalityName ?? null,
    publishedAt: target.publishedAt ?? null,
    estimatedValue: target.estimatedValue ?? null
  };
}

function targetKey(target: any): string {
  return target.procurementControlNumber || `${target.cnpj}-${target.ano}-${target.sequencial}`;
}

function safeKey(value: string): string {
  const clean = value.normalize("NFKC").replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-");
  return clean.slice(0, 160) || sha256(value).slice(0, 24);
}

function discoveryFingerprint(discovery: any, targets: any[]): string {
  const material = {
    format: discovery.format,
    investigationId: discovery.investigationId,
    scope: discovery.scope ?? null,
    targets: targets.map((target) => targetKey(target)).sort()
  };
  return sha256(JSON.stringify(material));
}

function normalizeDiscovery(discovery: any) {
  if (!discovery || discovery.format !== PNCP_DISCOVERY_FORMAT) throw new TypeError(`discovery.format deve ser ${PNCP_DISCOVERY_FORMAT}`);
  const investigationId = validateInvestigationId(discovery.investigationId);
  if (!Array.isArray(discovery.targets)) throw new TypeError("discovery.targets deve ser array");
  const map = new Map<string, any>();
  for (const raw of discovery.targets) {
    const target = validateTarget(raw);
    if (!target) continue;
    const key = targetKey(target);
    if (!map.has(key)) map.set(key, target);
  }
  const targets = [...map.values()].sort((a, b) => targetKey(a).localeCompare(targetKey(b)));
  return { investigationId, targets, fingerprint: discoveryFingerprint(discovery, targets), scope: discovery.scope ?? null };
}

export function buildPncpDeepeningPlan(discovery: any, options: any = {}) {
  const normalized = normalizeDiscovery(discovery);
  const maxTargetsPerRun = positiveInteger(
    options.maxTargetsPerRun ?? DEFAULT_DEEPENING_MAX_TARGETS_PER_RUN,
    "maxTargetsPerRun",
    500
  );
  const maxFailuresPerRun = positiveInteger(
    options.maxFailuresPerRun ?? DEFAULT_DEEPENING_MAX_FAILURES_PER_RUN,
    "maxFailuresPerRun",
    100
  );
  return {
    format: PNCP_DEEPENING_PLAN_FORMAT,
    investigationId: normalized.investigationId,
    discoveryFingerprint: normalized.fingerprint,
    scope: normalized.scope,
    targets: normalized.targets,
    budgets: { maxTargetsPerRun, maxFailuresPerRun },
    scheduling: "lexicographic-target-key-v1",
    checkpointRequired: true,
    networkDefault: "blocked",
    humanReviewRequired: true,
    coreMutationPerformed: false
  };
}

async function atomicJson(path: string, value: any) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function loadCheckpoint(path: string, plan: any) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (parsed.format !== PNCP_DEEPENING_CHECKPOINT_FORMAT) throw new Error("checkpoint PNCP C4 possui formato invalido");
    if (parsed.investigationId !== plan.investigationId) throw new Error("checkpoint PNCP C4 pertence a outra investigacao");
    if (parsed.discoveryFingerprint !== plan.discoveryFingerprint) throw new Error("checkpoint PNCP C4 pertence a outro corpus de descoberta");
    return parsed;
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
    return {
      format: PNCP_DEEPENING_CHECKPOINT_FORMAT,
      investigationId: plan.investigationId,
      discoveryFingerprint: plan.discoveryFingerprint,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: {},
      failed: {}
    };
  }
}

function reportPathFor(home: string, target: any) {
  return resolve(home, "runs", "pncp-deepening", `${safeKey(targetKey(target))}.json`);
}

async function collectCompletedReports(checkpoint: any) {
  const reports: any[] = [];
  for (const entry of Object.values(checkpoint.completed ?? {}) as any[]) {
    if (!entry?.reportPath) continue;
    try {
      const report = JSON.parse(await readFile(entry.reportPath, "utf8"));
      if (report.format === PNCP_OPERATIONAL_FORMAT) reports.push(report);
    } catch {
      // Um relatório ausente não é recriado silenciosamente; o resumo registra a perda abaixo.
    }
  }
  return reports;
}

function aggregateCorpus(reports: any[]) {
  const records = reports.flatMap((report) => Array.isArray(report?.analysis?.procurementRecords) ? report.analysis.procurementRecords : []);
  const items = reports.flatMap((report) => Array.isArray(report?.analysis?.items) ? report.analysis.items : []);
  return {
    procurementRecords: records,
    items,
    procurementProfile: buildProcurementProfile(records),
    itemComparabilityProfile: buildItemComparabilityProfile(items)
  };
}

export async function runPncpDiscoveryDeepening(input: any, options: any = {}) {
  const discovery = input?.discovery;
  const plan = buildPncpDeepeningPlan(discovery, {
    maxTargetsPerRun: input?.maxTargetsPerRun ?? options.maxTargetsPerRun,
    maxFailuresPerRun: input?.maxFailuresPerRun ?? options.maxFailuresPerRun
  });
  const investigationId = validateInvestigationId(input?.investigationId ?? plan.investigationId);
  if (investigationId !== plan.investigationId) throw new Error("investigationId difere do corpus de descoberta");
  const home = resolve(nonEmpty(input?.home, "home"));
  const checkpointPath = resolve(input?.checkpointPath ?? `${home}/checkpoints/pncp-deepening/${plan.discoveryFingerprint}.json`);
  const sourceId = nonEmpty(input?.sourceId ?? "SRC-PNCP-PUBLIC", "sourceId", 72);
  if (!input?.actor?.id || !input?.actor?.role) throw new TypeError("actor de custodia obrigatorio");

  const customRunner = options.deepeningRunner;
  if (!customRunner) {
    if (input?.allowNetwork !== true) throw new Error("rede PNCP C4 bloqueada: allowNetwork=true e obrigatorio");
    if (input?.confirmation !== PNCP_NETWORK_CONFIRMATION) throw new Error(`confirmacao de rede invalida: use ${PNCP_NETWORK_CONFIRMATION}`);
  }

  const checkpoint = await loadCheckpoint(checkpointPath, plan);
  const retryFailed = input?.retryFailed === true;
  const pending = plan.targets.filter((target: any) => {
    const key = targetKey(target);
    if (checkpoint.completed?.[key]) return false;
    if (checkpoint.failed?.[key] && !retryFailed) return false;
    return true;
  });

  const selected = pending.slice(0, plan.budgets.maxTargetsPerRun);
  const runCompleted: string[] = [];
  const runFailed: string[] = [];
  for (const target of selected) {
    if (runFailed.length >= plan.budgets.maxFailuresPerRun) break;
    const key = targetKey(target);
    const reportPath = reportPathFor(home, target);
    try {
      const runner = customRunner ?? (async (runnerTarget: any) => runPncpOperationalCollection({
        target: runnerTarget,
        investigationId,
        sourceId,
        actor: input.actor,
        home,
        allowNetwork: true,
        confirmation: PNCP_NETWORK_CONFIRMATION,
        includeHistory: input?.includeHistory === true,
        includeBudgetSources: input?.includeBudgetSources !== false,
        maxBytes: input?.maxBytes,
        timeoutMs: input?.timeoutMs,
        maxRetries: input?.maxRetries
      }));
      const report = await runner(target, { investigationId, sourceId, actor: input.actor, home });
      if (!report || report.format !== PNCP_OPERATIONAL_FORMAT) throw new Error("runner C4 retornou relatório operacional invalido");
      if (report.investigationId !== investigationId) throw new Error("relatório C2 pertence a outra investigação");
      await atomicJson(reportPath, report);
      checkpoint.completed[key] = {
        target,
        reportPath,
        completedAt: new Date().toISOString(),
        acquisitionIds: (report.custody?.acquisitions ?? []).map((item: any) => item.acquisitionId),
        procurementRecordCount: report.analysis?.procurementRecords?.length ?? 0,
        itemCount: report.analysis?.items?.length ?? 0
      };
      delete checkpoint.failed[key];
      runCompleted.push(key);
    } catch (error: any) {
      checkpoint.failed[key] = {
        target,
        failedAt: new Date().toISOString(),
        error: String(error?.message ?? error).slice(0, 2000)
      };
      runFailed.push(key);
    }
    checkpoint.updatedAt = new Date().toISOString();
    await atomicJson(checkpointPath, checkpoint);
  }

  checkpoint.updatedAt = new Date().toISOString();
  await atomicJson(checkpointPath, checkpoint);
  const reports = await collectCompletedReports(checkpoint);
  const corpus = aggregateCorpus(reports);
  const completedKeys = Object.keys(checkpoint.completed ?? {});
  const failedKeys = Object.keys(checkpoint.failed ?? {});
  const stillPending = plan.targets.filter((target: any) => {
    const key = targetKey(target);
    return !checkpoint.completed?.[key] && (!checkpoint.failed?.[key] || retryFailed);
  }).length;

  const result = {
    format: PNCP_DEEPENING_RESULT_FORMAT,
    investigationId,
    discoveryFingerprint: plan.discoveryFingerprint,
    checkpointPath,
    budgets: plan.budgets,
    stats: {
      discoveredTargets: plan.targets.length,
      selectedThisRun: selected.length,
      completedThisRun: runCompleted.length,
      failedThisRun: runFailed.length,
      completedTotal: completedKeys.length,
      failedTotal: failedKeys.length,
      pendingTotal: stillPending,
      reportsAvailable: reports.length
    },
    completedThisRun: runCompleted,
    failedThisRun: runFailed,
    corpus: {
      reportCount: reports.length,
      procurementRecordCount: corpus.procurementRecords.length,
      itemCount: corpus.items.length,
      procurementProfile: corpus.procurementProfile,
      itemComparabilityProfile: corpus.itemComparabilityProfile
    },
    invariants: {
      deterministicScheduling: true,
      checkpointed: true,
      completedTargetsNotRepeated: true,
      custodyDelegatedToC2: true,
      anomalyIsNotIrregularity: true,
      coreMutationPerformed: false,
      humanReviewRequired: true
    }
  };

  if (input?.out) await atomicJson(resolve(String(input.out)), result);
  return result;
}
