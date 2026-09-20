import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildItemComparabilityProfile,
  buildProcurementProfile,
  normalizePncpBundle,
  normalizePncpItems
} from "../../aie/src/index.ts";
import {
  buildPncpProcurementRequestPlan,
  capturePncpSnapshotResponses,
  collectPncpSnapshot,
  createPncpHttpTransport,
  validatePncpPublicTarget
} from "./index.ts";

export const PNCP_OPERATIONAL_FORMAT = "arca-pncp-operational-result-v1";
export const PNCP_NETWORK_CONFIRMATION = "PNCP_PUBLIC_GET_ONLY";

function nonEmpty(value: unknown, field: string, max = 4096): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} e obrigatorio`);
  if (value.length > max) throw new RangeError(`${field} excede ${max} caracteres`);
  return value.trim();
}

function investigationId(value: unknown): string {
  const id = nonEmpty(value, "investigationId", 72);
  if (!/^INV-[A-Z0-9][A-Z0-9-]{0,63}$/.test(id) || id.includes("..")) throw new TypeError("investigationId invalido");
  return id;
}

function custodyActor(value: any) {
  if (!value || typeof value !== "object") throw new TypeError("actor e obrigatorio");
  return {
    id: nonEmpty(value.id, "actor.id", 160),
    role: nonEmpty(value.role ?? value.type ?? "human", "actor.role", 80)
  };
}

function responseSummary(snapshot: any) {
  return snapshot.responses.map(({ descriptor, response }: any) => ({
    kind: descriptor.kind,
    required: descriptor.required,
    status: response.status,
    ok: response.ok,
    url: response.url,
    accessedAt: response.accessedAt,
    sha256: response.sha256,
    byteLength: response.bytes?.byteLength ?? 0,
    attemptCount: response.attemptCount
  }));
}

export function buildPncpOperationalPlan(input: any, options: any = {}) {
  const target = validatePncpPublicTarget(input);
  const requestPlan = buildPncpProcurementRequestPlan(target, options);
  return {
    format: "arca-pncp-operational-plan-v1",
    target,
    requestPlan,
    networkDefault: "blocked",
    networkActivationRequires: {
      allowNetwork: true,
      confirmation: PNCP_NETWORK_CONFIRMATION
    },
    custodyRequiredBeforeAnalysis: true,
    coreMutationPerformed: false,
    humanReviewRequired: true
  };
}

export async function runPncpOperationalCollection(input: any, options: any = {}) {
  const target = validatePncpPublicTarget(input?.target ?? input);
  const invId = investigationId(input?.investigationId);
  const sourceId = nonEmpty(input?.sourceId ?? "SRC-PNCP-PUBLIC", "sourceId", 72);
  const actor = custodyActor(input?.actor);
  const home = resolve(nonEmpty(input?.home, "home"));
  const stagingRoot = resolve(input?.stagingRoot ?? `${home}/staging/pncp`);
  const custodyHome = resolve(input?.custodyHome ?? home);
  const suppliedTransport = options.transport;
  const networkTransport = suppliedTransport?.networkEnabled === true || !suppliedTransport;

  if (networkTransport) {
    if (input?.allowNetwork !== true) throw new Error("rede PNCP bloqueada: allowNetwork=true e obrigatorio");
    if (input?.confirmation !== PNCP_NETWORK_CONFIRMATION) {
      throw new Error(`confirmacao de rede invalida: use ${PNCP_NETWORK_CONFIRMATION}`);
    }
  }

  const transport = suppliedTransport ?? createPncpHttpTransport({
    allowNetwork: true,
    maxBytes: input?.maxBytes,
    timeoutMs: input?.timeoutMs,
    maxRetries: input?.maxRetries
  });

  const snapshot = await collectPncpSnapshot(target, {
    transport,
    includeHistory: input?.includeHistory === true,
    includeBudgetSources: input?.includeBudgetSources !== false
  });

  const custody = await capturePncpSnapshotResponses(snapshot, {
    investigationId: invId,
    sourceId,
    actor,
    stagingRoot,
    custodyHome,
    maxBytes: input?.maxBytes,
    keepStaging: input?.keepStaging === true
  });

  if (!custody.analysisMayProceed) {
    throw new Error("analise bloqueada: nem todas as respostas bem sucedidas foram preservadas na cadeia de custodia");
  }

  const records = normalizePncpBundle(snapshot.bundle, {
    sourceRef: `pncp:${snapshot.bundle?.contratacao?.numeroControlePNCP ?? `${target.cnpj}-${target.ano}-${target.sequencial}`}`
  });
  const procurementProfile = buildProcurementProfile(records);
  const items = normalizePncpItems(snapshot.bundle, {
    sourceRef: `pncp:${snapshot.bundle?.contratacao?.numeroControlePNCP ?? `${target.cnpj}-${target.ano}-${target.sequencial}`}`
  });
  const itemComparabilityProfile = buildItemComparabilityProfile(items);

  const result = {
    format: PNCP_OPERATIONAL_FORMAT,
    target,
    investigationId: invId,
    sourceId,
    retrievedAt: snapshot.retrievedAt,
    networkUsed: snapshot.networkUsed,
    publicAccessOnly: snapshot.publicAccessOnly,
    custody: {
      analysisMayProceed: custody.analysisMayProceed,
      capturedCount: custody.capturedCount,
      acquisitions: custody.captures.map((capture: any) => ({
        acquisitionId: capture.manifest.acquisitionId,
        eventHead: capture.manifest.eventHead,
        originalSha256: capture.manifest.original.originalSha256,
        locator: capture.manifest.original.locator,
        proposal: capture.proposal
      }))
    },
    sourceResponses: responseSummary(snapshot),
    analysis: {
      procurementRecords: records,
      procurementProfile,
      items,
      itemComparabilityProfile
    },
    invariants: {
      custodyCompletedBeforeAnalysis: true,
      coreMutationPerformed: false,
      anomalyIsNotIrregularity: true,
      humanReviewRequired: true
    }
  };

  const out = input?.out ? resolve(String(input.out)) : null;
  if (out) {
    await mkdir(dirname(out), { recursive: true, mode: 0o700 });
    await writeFile(out, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  }

  return { ...result, outputPath: out };
}
