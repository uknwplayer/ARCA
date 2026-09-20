import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const ACQUISITION_VERSION = "0.3.0";
export const REQUEST_FORMAT = "arca-acquisition-request-v1";
export const CUSTODY_FORMAT = "arca-custody-manifest-v1";
export const EVENT_FORMAT = "arca-custody-event-v1";
export const QUEUE_FORMAT = "arca-acquisition-queue-entry-v1";
export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

const ID_PATTERNS = {
  investigationId: /^INV-[A-Z0-9][A-Z0-9-]{0,63}$/,
  acquisitionId: /^ACQ-[A-Z0-9][A-Z0-9-]{0,63}$/,
  queueId: /^QAQ-[A-Z0-9][A-Z0-9-]{0,63}$/
};
const ACCESS_BASES = new Set(["public", "owner-provided", "authorized"]);
const EVENT_KINDS = new Set(["ACQUISITION_CAPTURED", "TRANSFORMATION_RECORDED", "REVIEW_RECORDED"]);
const REVIEW_OUTCOMES = new Set(["accepted", "rejected", "needs-work"]);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type AccessDeclaration = {
  basis: "public" | "owner-provided" | "authorized";
  declaration: string;
};
export type Actor = { id: string; role: string };
export type AcquisitionRequest = {
  format: typeof REQUEST_FORMAT;
  acquisitionId: string;
  investigationId: string;
  sourceId: string;
  title: string;
  sourcePath: string;
  locator: string;
  accessedAt: string;
  acquisitionMethod: "local-file" | "authorized-download" | "manual-import";
  access: AccessDeclaration;
  mediaType?: string;
  expectedEventHead?: string | null;
  actor: Actor;
};

function clean(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JSON de custódia rejeita números não finitos");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => item === undefined ? null : clean(item));
  if (value && typeof value === "object") {
    const output: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item !== undefined) output[key] = clean(item);
    }
    return output;
  }
  throw new TypeError(`Valor não serializável na custódia: ${typeof value}`);
}

export function canonicalStringify(value: unknown): string {
  const sort = (item: Json): Json => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object") {
      const output: Record<string, Json> = {};
      for (const key of Object.keys(item).sort()) output[key] = sort((item as Record<string, Json>)[key]);
      return output;
    }
    return item;
  };
  return JSON.stringify(sort(clean(value)));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function nonEmpty(value: unknown, field: string, max = 4096): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} é obrigatório`);
  if (value.length > max) throw new RangeError(`${field} excede ${max} caracteres`);
  return value;
}

function validTimestamp(value: unknown, field: string): string {
  const text = nonEmpty(value, field, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new TypeError(`${field} deve ser RFC 3339 em UTC`);
  }
  return text;
}

function validId(value: unknown, field: keyof typeof ID_PATTERNS): string {
  const text = nonEmpty(value, field, 72);
  if (!ID_PATTERNS[field].test(text) || text.includes("..")) throw new TypeError(`${field} inválido`);
  return text;
}

function validActor(value: unknown): Actor {
  if (!value || typeof value !== "object") throw new TypeError("actor é obrigatório");
  const actor = value as Record<string, unknown>;
  return { id: nonEmpty(actor.id, "actor.id", 160), role: nonEmpty(actor.role, "actor.role", 80) };
}

export function validateAccessDeclaration(value: unknown): AccessDeclaration {
  if (!value || typeof value !== "object") throw new TypeError("declaração de acesso é obrigatória");
  const accessValue = value as Record<string, unknown>;
  const basis = nonEmpty(accessValue.basis, "access.basis", 40);
  if (!ACCESS_BASES.has(basis)) throw new TypeError("access.basis não autorizado");
  return {
    basis: basis as AccessDeclaration["basis"],
    declaration: nonEmpty(accessValue.declaration, "access.declaration", 1000)
  };
}

export function validateRequest(value: unknown): AcquisitionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("requisição inválida");
  const input = value as Record<string, unknown>;
  if (input.format !== REQUEST_FORMAT) throw new TypeError(`format deve ser ${REQUEST_FORMAT}`);
  const acquisitionMethod = nonEmpty(input.acquisitionMethod, "acquisitionMethod", 40);
  if (!["local-file", "authorized-download", "manual-import"].includes(acquisitionMethod)) {
    throw new TypeError("acquisitionMethod inválido");
  }
  if (typeof input.expectedEventHead !== "undefined" && input.expectedEventHead !== null &&
      !/^[a-f0-9]{64}$/.test(String(input.expectedEventHead))) {
    throw new TypeError("expectedEventHead inválido");
  }
  return {
    format: REQUEST_FORMAT,
    acquisitionId: validId(input.acquisitionId, "acquisitionId"),
    investigationId: validId(input.investigationId, "investigationId"),
    sourceId: nonEmpty(input.sourceId, "sourceId", 72),
    title: nonEmpty(input.title, "title", 500),
    sourcePath: nonEmpty(input.sourcePath, "sourcePath", 4096),
    locator: nonEmpty(input.locator, "locator", 4096),
    accessedAt: validTimestamp(input.accessedAt, "accessedAt"),
    acquisitionMethod: acquisitionMethod as AcquisitionRequest["acquisitionMethod"],
    access: validateAccessDeclaration(input.access),
    mediaType: input.mediaType === undefined ? "application/octet-stream" : nonEmpty(input.mediaType, "mediaType", 255),
    expectedEventHead: input.expectedEventHead === undefined ? null : input.expectedEventHead as string | null,
    actor: validActor(input.actor)
  };
}

function within(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel) && rel !== ".." && !rel.split(sep).includes(".."));
}

function safeName(name: string): string {
  const normalized = basename(name).normalize("NFKC").replace(/[^A-Za-z0-9._-]/g, "_");
  if (!normalized || normalized === "." || normalized === "..") return "original.bin";
  return normalized.slice(0, 180);
}

async function syncDirectory(path: string): Promise<void> {
  try {
    const handle = await open(path, "r");
    try { await handle.sync(); } finally { await handle.close(); }
  } catch {
    // Alguns sistemas não permitem fsync de diretório. O arquivo já foi sincronizado.
  }
}

async function atomicWrite(path: string, bytes: string | Uint8Array, mode = 0o600): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  const handle = await open(temporary, "wx", mode);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}

async function readAuthorizedFile(path: string, allowedRoot: string | undefined, maxBytes: number) {
  const lexical = resolve(path);
  const before = await lstat(lexical);
  if (before.isSymbolicLink()) throw new Error("fonte simbólica recusada");
  if (!before.isFile()) throw new Error("fonte deve ser arquivo regular");
  if (before.size > maxBytes) throw new RangeError(`arquivo excede limite de ${maxBytes} bytes`);
  const physical = await realpath(lexical);
  if (allowedRoot) {
    const rootPhysical = await realpath(resolve(allowedRoot));
    if (!within(rootPhysical, physical)) throw new Error("fonte fora da raiz autorizada");
  }
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const handle = await open(physical, constants.O_RDONLY | noFollow);
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw new Error("fonte deve permanecer arquivo regular");
    if (opened.size > maxBytes) throw new RangeError(`arquivo excede limite de ${maxBytes} bytes`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (bytes.byteLength !== opened.size || after.size !== opened.size ||
        after.mtimeMs !== opened.mtimeMs || after.ino !== opened.ino) {
      throw new Error("fonte mudou durante a aquisição");
    }
    return { bytes, physical, stat: after };
  } finally {
    await handle.close();
  }
}

function acquisitionRoot(home: string, investigationId: string, acquisitionId: string): string {
  const root = resolve(home);
  const target = resolve(root, "acquisitions", investigationId, acquisitionId);
  if (!within(root, target)) throw new Error("caminho de aquisição escapou da raiz");
  return target;
}

async function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await mkdir(path, { mode: 0o700 });
      try { return await fn(); } finally { await rm(path, { recursive: true, force: true }); }
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10 + attempt));
    }
  }
  throw new Error("timeout ao adquirir lock de custódia");
}

type CustodyEvent = {
  format: typeof EVENT_FORMAT;
  sequence: number;
  kind: "ACQUISITION_CAPTURED" | "TRANSFORMATION_RECORDED" | "REVIEW_RECORDED";
  recordedAt: string;
  actor: Actor;
  payload: Record<string, Json>;
  previousEventHash: string | null;
  eventHash: string;
};

function buildEvent(events: CustodyEvent[], kind: CustodyEvent["kind"], actor: Actor, payload: Record<string, Json>): CustodyEvent {
  if (!EVENT_KINDS.has(kind)) throw new TypeError("evento de custódia inválido");
  const base = {
    format: EVENT_FORMAT,
    sequence: events.length + 1,
    kind,
    recordedAt: new Date().toISOString(),
    actor: validActor(actor),
    payload: clean(payload) as Record<string, Json>,
    previousEventHash: events.at(-1)?.eventHash ?? null
  };
  return { ...base, eventHash: sha256(canonicalStringify(base)) };
}

async function loadEvents(root: string): Promise<CustodyEvent[]> {
  const path = join(root, "custody.ndjson");
  const text = await readFile(path, "utf8");
  return text.split("\n").filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as CustodyEvent; }
    catch { throw new Error(`evento de custódia ${index + 1} não é JSON válido`); }
  });
}

function verifyEvents(events: CustodyEvent[]): string[] {
  const errors: string[] = [];
  let previous: string | null = null;
  events.forEach((event, index) => {
    if (event.sequence !== index + 1) errors.push(`sequência inválida em ${index + 1}`);
    if (event.previousEventHash !== previous) errors.push(`previousEventHash inválido em ${index + 1}`);
    const { eventHash, ...base } = event;
    const expected = sha256(canonicalStringify(base));
    if (eventHash !== expected) errors.push(`eventHash inválido em ${index + 1}`);
    previous = event.eventHash;
  });
  if (!events.length || events[0]?.kind !== "ACQUISITION_CAPTURED") errors.push("evento inicial de aquisição ausente");
  return errors;
}

function project(events: CustodyEvent[]) {
  const capture = events.find((event) => event.kind === "ACQUISITION_CAPTURED");
  if (!capture) throw new Error("captura inicial ausente");
  return {
    format: CUSTODY_FORMAT,
    adapterVersion: ACQUISITION_VERSION,
    acquisitionId: capture.payload.acquisitionId,
    investigationId: capture.payload.investigationId,
    original: capture.payload,
    transformations: events.filter((event) => event.kind === "TRANSFORMATION_RECORDED").map((event) => event.payload),
    reviews: events.filter((event) => event.kind === "REVIEW_RECORDED").map((event) => event.payload),
    eventCount: events.length,
    eventHead: events.at(-1)?.eventHash ?? null
  };
}

async function persistProjection(root: string, events: CustodyEvent[]): Promise<void> {
  await atomicWrite(join(root, "manifest.json"), JSON.stringify(project(events), null, 2) + "\n");
}

async function appendEvent(root: string, kind: CustodyEvent["kind"], actor: Actor, payload: Record<string, Json>) {
  return withLock(join(root, ".custody.lock"), async () => {
    const events = await loadEvents(root);
    const chainErrors = verifyEvents(events);
    if (chainErrors.length) throw new Error(`cadeia de custódia inválida: ${chainErrors.join("; ")}`);
    const event = buildEvent(events, kind, actor, payload);
    const logPath = join(root, "custody.ndjson");
    const currentLog = await readFile(logPath);
    const separator = currentLog.byteLength > 0 && currentLog.at(-1) !== 0x0a ? "\n" : "";
    const handle = await open(logPath, "a", 0o600);
    try {
      await handle.writeFile(separator + JSON.stringify(event) + "\n", "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    events.push(event);
    await persistProjection(root, events);
    return { event, manifest: project(events) };
  });
}

export async function captureFile(input: unknown, options: {
  home: string;
  allowedRoot?: string;
  maxBytes?: number;
}): Promise<any> {
  const request = validateRequest(input);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError("maxBytes inválido");
  const source = await readAuthorizedFile(request.sourcePath, options.allowedRoot, maxBytes);
  const root = acquisitionRoot(options.home, request.investigationId, request.acquisitionId);
  const parent = dirname(root);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  try {
    await mkdir(root, { mode: 0o700 });
  } catch (error: any) {
    if (error?.code === "EEXIST") throw new Error("acquisitionId já existe");
    throw error;
  }
  try {
    const originalName = safeName(basename(source.physical));
    const originalRelativePath = join("original", originalName).split(sep).join("/");
    const originalPath = join(root, "original", originalName);
    await atomicWrite(originalPath, source.bytes);
    const originalSha256 = sha256(source.bytes);
    const payload = {
      acquisitionId: request.acquisitionId,
      investigationId: request.investigationId,
      sourceId: request.sourceId,
      title: request.title,
      locator: request.locator,
      accessedAt: request.accessedAt,
      acquisitionMethod: request.acquisitionMethod,
      access: request.access,
      mediaType: request.mediaType ?? "application/octet-stream",
      originalFileName: originalName,
      originalRelativePath,
      originalSha256,
      byteLength: source.bytes.byteLength
    };
    const event = buildEvent([], "ACQUISITION_CAPTURED", request.actor, payload as Record<string, Json>);
    await atomicWrite(join(root, "custody.ndjson"), JSON.stringify(event) + "\n");
    const events = [event];
    await persistProjection(root, events);
    const proposal = {
      format: "arca-agent-proposal-v1",
      investigationId: request.investigationId,
      expectedEventHead: request.expectedEventHead ?? null,
      agent: { id: "arca-acquisition-adapter", version: ACQUISITION_VERSION },
      intent: "Registrar documento adquirido com proveniência e revisão humana",
      operation: {
        kind: "create_object",
        objectType: "DOC",
        data: {
          title: request.title,
          sourceId: request.sourceId,
          location: request.locator,
          acquisitionMethod: request.acquisitionMethod,
          acquiredAt: request.accessedAt,
          hashAlgorithm: "sha256",
          contentHash: originalSha256,
          hashStatus: "computed",
          custodyManifest: join("acquisitions", request.investigationId, request.acquisitionId, "manifest.json").split(sep).join("/")
        }
      },
      assumptions: ["A declaração de acesso foi fornecida pela pessoa operadora."],
      uncertainties: [],
      humanReviewRequired: true
    };
    return { root, manifest: project(events), proposal };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function recordTransformation(input: {
  home: string;
  investigationId: string;
  acquisitionId: string;
  outputPath: string;
  allowedRoot?: string;
  maxBytes?: number;
  inputSha256: string;
  tool: { name: string; version: string; parameters?: Record<string, Json> };
  performedAt: string;
  actor: Actor;
  mediaType?: string;
}): Promise<any> {
  const investigationId = validId(input.investigationId, "investigationId");
  const acquisitionId = validId(input.acquisitionId, "acquisitionId");
  const root = acquisitionRoot(input.home, investigationId, acquisitionId);
  const events = await loadEvents(root);
  const knownHashes = new Set<string>();
  for (const event of events) {
    if (typeof event.payload.originalSha256 === "string") knownHashes.add(event.payload.originalSha256);
    if (typeof event.payload.outputSha256 === "string") knownHashes.add(event.payload.outputSha256);
  }
  if (!knownHashes.has(input.inputSha256)) throw new Error("inputSha256 não pertence à cadeia");
  const output = await readAuthorizedFile(input.outputPath, input.allowedRoot, input.maxBytes ?? DEFAULT_MAX_BYTES);
  const outputSha256 = sha256(output.bytes);
  const name = `${outputSha256}-${safeName(basename(output.physical))}`;
  const relativePath = join("derivatives", name).split(sep).join("/");
  await atomicWrite(join(root, "derivatives", name), output.bytes);
  const payload = {
    transformationId: `TRN-${randomBytes(8).toString("hex").toUpperCase()}`,
    inputSha256: input.inputSha256,
    outputSha256,
    outputRelativePath: relativePath,
    byteLength: output.bytes.byteLength,
    mediaType: input.mediaType ?? "application/octet-stream",
    tool: {
      name: nonEmpty(input.tool?.name, "tool.name", 200),
      version: nonEmpty(input.tool?.version, "tool.version", 100),
      parameters: clean(input.tool?.parameters ?? {}) as Record<string, Json>
    },
    performedAt: validTimestamp(input.performedAt, "performedAt")
  };
  return appendEvent(root, "TRANSFORMATION_RECORDED", validActor(input.actor), payload as Record<string, Json>);
}

export async function recordReview(input: {
  home: string;
  investigationId: string;
  acquisitionId: string;
  outcome: "accepted" | "rejected" | "needs-work";
  notes: string;
  reviewedAt: string;
  actor: Actor;
}): Promise<any> {
  const investigationId = validId(input.investigationId, "investigationId");
  const acquisitionId = validId(input.acquisitionId, "acquisitionId");
  if (!REVIEW_OUTCOMES.has(input.outcome)) throw new TypeError("outcome de revisão inválido");
  const root = acquisitionRoot(input.home, investigationId, acquisitionId);
  return appendEvent(root, "REVIEW_RECORDED", validActor(input.actor), {
    outcome: input.outcome,
    notes: nonEmpty(input.notes, "notes", 5000),
    reviewedAt: validTimestamp(input.reviewedAt, "reviewedAt")
  });
}

export async function verifyCustody(input: {
  home: string;
  investigationId: string;
  acquisitionId: string;
}): Promise<{ valid: boolean; errors: string[]; manifest: any }> {
  const investigationId = validId(input.investigationId, "investigationId");
  const acquisitionId = validId(input.acquisitionId, "acquisitionId");
  const root = acquisitionRoot(input.home, investigationId, acquisitionId);
  const events = await loadEvents(root);
  const errors = verifyEvents(events);
  let manifest: any = null;
  try { manifest = project(events); } catch (error: any) { errors.push(error.message); }
  if (manifest?.original) {
    const originalPath = resolve(root, String(manifest.original.originalRelativePath));
    if (!within(root, originalPath)) errors.push("caminho original escapou da raiz");
    else {
      try {
        const meta = await lstat(originalPath);
        if (meta.isSymbolicLink() || !meta.isFile()) errors.push("original não é arquivo regular");
        else {
          const bytes = await readFile(originalPath);
          if (sha256(bytes) !== manifest.original.originalSha256) errors.push("hash do original divergente");
          if (bytes.byteLength !== manifest.original.byteLength) errors.push("tamanho do original divergente");
        }
      } catch { errors.push("bytes originais ausentes"); }
    }
  }
  for (const transformation of manifest?.transformations ?? []) {
    const outputPath = resolve(root, String(transformation.outputRelativePath));
    if (!within(root, outputPath)) errors.push("caminho derivado escapou da raiz");
    else {
      try {
        const meta = await lstat(outputPath);
        if (meta.isSymbolicLink() || !meta.isFile()) errors.push("derivado não é arquivo regular");
        else if (sha256(await readFile(outputPath)) !== transformation.outputSha256) errors.push("hash derivado divergente");
      } catch { errors.push("arquivo derivado ausente"); }
    }
  }
  try {
    const stored = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
    if (canonicalStringify(stored) !== canonicalStringify(manifest)) errors.push("projeção manifest.json divergente");
  } catch { errors.push("manifest.json ausente ou inválido"); }
  return { valid: errors.length === 0, errors, manifest };
}

export function createQueueEntry(input: {
  queueId: string;
  investigationId: string;
  acquisitionId: string;
  locator: string;
  accessedAt: string;
  acquisitionMethod: AcquisitionRequest["acquisitionMethod"];
  access: AccessDeclaration;
  requestedBy: Actor;
}) {
  return {
    format: QUEUE_FORMAT,
    queueId: validId(input.queueId, "queueId"),
    investigationId: validId(input.investigationId, "investigationId"),
    acquisitionId: validId(input.acquisitionId, "acquisitionId"),
    locator: nonEmpty(input.locator, "locator", 4096),
    accessedAt: validTimestamp(input.accessedAt, "accessedAt"),
    acquisitionMethod: nonEmpty(input.acquisitionMethod, "acquisitionMethod", 40),
    access: validateAccessDeclaration(input.access),
    requestedBy: validActor(input.requestedBy),
    status: "pending-human-or-authorized-adapter",
    networkActionPerformed: false,
    createdAt: new Date().toISOString()
  };
}

export async function enqueueAcquisition(home: string, input: Parameters<typeof createQueueEntry>[0]) {
  const entry = createQueueEntry(input);
  const path = resolve(home, "queues", "acquisition", `${entry.queueId}.json`);
  if (!within(resolve(home), path)) throw new Error("fila escapou da raiz");
  try {
    await access(path);
    throw new Error("queueId já existe");
  } catch (error: any) {
    if (error?.message === "queueId já existe") throw error;
    if (error?.code && error.code !== "ENOENT") throw error;
  }
  await atomicWrite(path, JSON.stringify(entry, null, 2) + "\n");
  return { path, entry };
}
