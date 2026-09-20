import { randomUUID, createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const HUMAN_REVIEW_FORMAT = "arca-human-review-v1";
export const HUMAN_REVIEW_VERSION = "0.1.0";

const REVIEW_ID_PATTERN = /^HRV-[a-f0-9-]{36}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_RECORD_BYTES = 512 * 1024;
const STATUSES = new Set(["pending", "resolved", "dismissed"]);
const PRIORITIES = new Set(["low", "normal", "high", "critical"]);
const DECISIONS = new Set(["approve", "reject", "acknowledge", "needs-more-information"]);

type JsonObject = Record<string, any>;

function plain(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown): any {
  if (Array.isArray(value)) return value.map(clean);
  if (plain(value)) {
    const out: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = clean(item);
    }
    return out;
  }
  return value;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : stable(value)).digest("hex");
}

function text(value: unknown, field: string, max = 4000): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} é obrigatório`);
  const normalized = value.trim();
  if (normalized.length > max) throw new Error(`${field} excede ${max} caracteres`);
  return normalized;
}

function optionalText(value: unknown, field: string, max = 4000): string | null {
  if (value === undefined || value === null || value === "") return null;
  return text(value, field, max);
}

function assertReviewId(reviewId: string): void {
  if (!REVIEW_ID_PATTERN.test(reviewId) || reviewId.includes("..")) throw new Error(`reviewId inválido: ${reviewId}`);
}

function bodyForHash(record: JsonObject): JsonObject {
  const { recordHash: _ignored, ...content } = record;
  return content;
}

function seal(record: JsonObject): JsonObject {
  const content = clean(record);
  return { ...content, recordHash: sha256(content) };
}

function validateRecord(record: JsonObject): JsonObject {
  if (record.format !== HUMAN_REVIEW_FORMAT) throw new Error("format de revisão inválido");
  assertReviewId(record.reviewId);
  if (!STATUSES.has(record.status)) throw new Error(`status de revisão inválido: ${record.status}`);
  if (!PRIORITIES.has(record.priority)) throw new Error(`prioridade inválida: ${record.priority}`);
  if (typeof record.createdAt !== "string" || Number.isNaN(Date.parse(record.createdAt))) throw new Error("createdAt inválido");
  if (!HASH_PATTERN.test(String(record.recordHash ?? ""))) throw new Error("recordHash inválido");
  if (sha256(bodyForHash(record)) !== record.recordHash) throw new Error(`registro de revisão adulterado: ${record.reviewId}`);
  if (record.status === "pending" && record.resolution !== null) throw new Error("revisão pendente não pode conter resolução");
  if (record.status !== "pending" && !plain(record.resolution)) throw new Error("revisão encerrada exige resolução");
  return record;
}

async function atomicWrite(path: string, value: JsonObject): Promise<void> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_RECORD_BYTES) throw new Error(`registro de revisão excede ${MAX_RECORD_BYTES} bytes`);
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, serialized, { encoding: "utf8", flag: "wx" });
  await rename(tmp, path);
}

export interface HumanReviewSubmitInput {
  kind: string;
  title: string;
  summary: string;
  priority?: "low" | "normal" | "high" | "critical";
  source: {
    system: string;
    jobId?: string | null;
    requestId?: string | null;
    investigationId?: string | null;
    findingId?: string | null;
  };
  payload?: JsonObject;
  recommendations?: string[];
  idempotencyKey?: string | null;
}

export class HumanReviewQueue {
  readonly home: string;
  readonly root: string;
  readonly itemsRoot: string;

  constructor(home: string) {
    if (!home) throw new Error("home é obrigatório");
    this.home = resolve(home);
    this.root = join(this.home, "human-review");
    this.itemsRoot = join(this.root, "items");
  }

  async init(): Promise<void> {
    await mkdir(this.itemsRoot, { recursive: true });
  }

  private path(reviewId: string): string {
    assertReviewId(reviewId);
    return join(this.itemsRoot, `${reviewId}.json`);
  }

  async submit(input: HumanReviewSubmitInput): Promise<JsonObject> {
    await this.init();
    if (!plain(input)) throw new Error("item de revisão deve ser objeto");
    const kind = text(input.kind, "kind", 120);
    const title = text(input.title, "title", 500);
    const summary = text(input.summary, "summary", 8000);
    const priority = input.priority ?? "normal";
    if (!PRIORITIES.has(priority)) throw new Error(`prioridade inválida: ${priority}`);
    if (!plain(input.source)) throw new Error("source é obrigatório");
    const source = clean({
      system: text(input.source.system, "source.system", 160),
      jobId: optionalText(input.source.jobId, "source.jobId", 200),
      requestId: optionalText(input.source.requestId, "source.requestId", 200),
      investigationId: optionalText(input.source.investigationId, "source.investigationId", 200),
      findingId: optionalText(input.source.findingId, "source.findingId", 200)
    });
    const idempotencyKey = optionalText(input.idempotencyKey, "idempotencyKey", 500);
    if (idempotencyKey) {
      const existing = (await this.list()).find((item) => item.idempotencyKey === idempotencyKey);
      if (existing) return existing;
    }
    const reviewId = `HRV-${randomUUID()}`;
    const now = new Date().toISOString();
    const record = seal({
      format: HUMAN_REVIEW_FORMAT,
      version: HUMAN_REVIEW_VERSION,
      reviewId,
      kind,
      title,
      summary,
      priority,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      source,
      payload: clean(input.payload ?? {}),
      recommendations: Array.isArray(input.recommendations) ? input.recommendations.map((item, index) => text(item, `recommendations[${index}]`, 2000)) : [],
      idempotencyKey,
      resolution: null
    });
    const path = this.path(reviewId);
    const handle = await open(path, "wx");
    try {
      const serialized = `${JSON.stringify(record, null, 2)}\n`;
      if (Buffer.byteLength(serialized) > MAX_RECORD_BYTES) throw new Error(`registro de revisão excede ${MAX_RECORD_BYTES} bytes`);
      await handle.writeFile(serialized, "utf8");
    } finally {
      await handle.close();
    }
    return record;
  }

  async get(reviewId: string): Promise<JsonObject> {
    await this.init();
    const record = JSON.parse(await readFile(this.path(reviewId), "utf8"));
    return validateRecord(record);
  }

  async list(filters: { status?: string; kind?: string; sourceSystem?: string } = {}): Promise<JsonObject[]> {
    await this.init();
    const records: JsonObject[] = [];
    for (const name of (await readdir(this.itemsRoot)).filter((item) => item.endsWith(".json")).sort()) {
      try {
        const record = validateRecord(JSON.parse(await readFile(join(this.itemsRoot, name), "utf8")));
        if (filters.status && record.status !== filters.status) continue;
        if (filters.kind && record.kind !== filters.kind) continue;
        if (filters.sourceSystem && record.source?.system !== filters.sourceSystem) continue;
        records.push(record);
      } catch (error) {
        throw new Error(`falha ao carregar item de revisão ${name}: ${String((error as Error)?.message ?? error)}`);
      }
    }
    return records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async resolve(input: {
    reviewId: string;
    reviewerId: string;
    decision: "approve" | "reject" | "acknowledge" | "needs-more-information";
    reason: string;
    expectedRecordHash: string;
  }): Promise<JsonObject> {
    await this.init();
    const current = await this.get(input.reviewId);
    if (current.status !== "pending") throw new Error(`revisão já encerrada: ${input.reviewId}`);
    if (!HASH_PATTERN.test(input.expectedRecordHash ?? "")) throw new Error("expectedRecordHash inválido");
    if (current.recordHash !== input.expectedRecordHash) throw new Error("Conflito de concorrência: item de revisão foi alterado");
    if (!DECISIONS.has(input.decision)) throw new Error(`decisão inválida: ${input.decision}`);
    const now = new Date().toISOString();
    const next = seal({
      ...bodyForHash(current),
      status: input.decision === "reject" ? "dismissed" : "resolved",
      updatedAt: now,
      resolution: {
        reviewerId: text(input.reviewerId, "reviewerId", 160),
        decision: input.decision,
        reason: text(input.reason, "reason", 8000),
        reviewedAt: now
      }
    });
    await atomicWrite(this.path(input.reviewId), next);
    return next;
  }
}
