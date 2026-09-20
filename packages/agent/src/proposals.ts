import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, rm, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  ArcaCore,
  EVIDENCE_EFFECTS,
  OBJECT_TYPES,
  RELATION_CATEGORIES,
  assertSafeId,
  atomicWriteJson,
  canonicalStringify,
  cleanJson,
  findObject,
  sha256,
  typeFromId,
  utcNow
} from "../../core/src/index.ts";

export const AGENT_PROPOSAL_FORMAT = "arca-agent-proposal-v1";
export const AGENT_BUNDLE_VERSION = "0.2.0";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PROPOSAL_ID_PATTERN = /^APR-[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX_PROPOSAL_BYTES = 1024 * 1024;
const OPERATION_KINDS = new Set([
  "create_object",
  "update_object",
  "create_relation",
  "invalidate_object",
  "reevaluate_object",
  "close_conclusion",
  "reopen_conclusion"
]);

type JsonObject = Record<string, any>;

function isPlainObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireObject(value: unknown, field: string): JsonObject {
  if (!isPlainObject(value)) throw new Error(`${field} deve ser um objeto JSON`);
  return value;
}

function requireText(value: unknown, field: string, maxLength = 2000): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} é obrigatório`);
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${field} excede ${maxLength} caracteres`);
  return text;
}

function optionalText(value: unknown, field: string, maxLength = 2000): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return requireText(value, field, maxLength);
}

function exactKeys(value: JsonObject, required: string[], optional: string[], field: string): void {
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (missing.length) throw new Error(`${field}: campos obrigatórios ausentes: ${missing.join(", ")}`);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`${field}: campos não permitidos: ${extras.join(", ")}`);
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} deve ser uma lista`);
  if (value.length > 100) throw new Error(`${field} excede 100 itens`);
  return value.map((item, index) => {
    if (typeof item !== "string") throw new Error(`${field}[${index}] deve ser texto`);
    if (item.length > 2000) throw new Error(`${field}[${index}] excede 2000 caracteres`);
    return item.trim();
  });
}

function validateId(value: unknown, field: string, expectedType?: string): string {
  const id = requireText(value, field, 200);
  assertSafeId(id, expectedType);
  return id;
}

function validateOperation(raw: unknown): JsonObject {
  const operation = requireObject(raw, "operation");
  const kind = requireText(operation.kind, "operation.kind", 80);
  if (!OPERATION_KINDS.has(kind)) throw new Error(`operation.kind não suportado: ${kind}`);

  if (kind === "create_object") {
    exactKeys(operation, ["kind", "objectType", "data"], ["id"], "operation");
    const objectType = requireText(operation.objectType, "operation.objectType", 20).toUpperCase();
    if (!OBJECT_TYPES.includes(objectType as any)) throw new Error(`Tipo de objeto inválido: ${objectType}`);
    const normalized: JsonObject = {
      kind,
      objectType,
      data: cleanJson(requireObject(operation.data, "operation.data"))
    };
    if (operation.id !== undefined) normalized.id = validateId(operation.id, "operation.id", objectType);
    return normalized;
  }

  if (kind === "update_object") {
    exactKeys(operation, ["kind", "id", "patch", "reason"], [], "operation");
    const patch = requireObject(operation.patch, "operation.patch");
    if (!Object.keys(patch).length) throw new Error("operation.patch não pode ser vazio");
    for (const protectedField of ["id", "type", "createdAt"]) {
      if (Object.hasOwn(patch, protectedField)) throw new Error(`operation.patch não pode alterar ${protectedField}`);
    }
    return cleanJson({
      kind,
      id: validateId(operation.id, "operation.id"),
      patch,
      reason: requireText(operation.reason, "operation.reason")
    }) as JsonObject;
  }

  if (kind === "create_relation") {
    exactKeys(
      operation,
      ["kind", "from", "to", "relationType", "category", "justification"],
      ["id", "effect", "materiality", "extensions"],
      "operation"
    );
    const category = requireText(operation.category, "operation.category", 80).toLowerCase();
    if (!RELATION_CATEGORIES.includes(category)) throw new Error(`Categoria de relação inválida: ${category}`);
    const normalized: JsonObject = {
      kind,
      from: validateId(operation.from, "operation.from"),
      to: validateId(operation.to, "operation.to"),
      relationType: requireText(operation.relationType, "operation.relationType", 160),
      category,
      justification: requireText(operation.justification, "operation.justification")
    };
    if (operation.id !== undefined) normalized.id = validateId(operation.id, "operation.id", "REL");
    if (operation.effect !== undefined) normalized.effect = requireText(operation.effect, "operation.effect", 80);
    if (operation.materiality !== undefined) normalized.materiality = requireText(operation.materiality, "operation.materiality", 80);
    if (operation.extensions !== undefined) normalized.extensions = cleanJson(requireObject(operation.extensions, "operation.extensions"));
    if (category === "evidence") {
      if (typeFromId(normalized.from) !== "INF" || typeFromId(normalized.to) !== "PRO") {
        throw new Error("Evidência deve ser relação INF → PRO");
      }
      const effect = normalized.effect ?? normalized.relationType;
      if (!EVIDENCE_EFFECTS.includes(effect)) throw new Error("Evidência exige effect controlado");
    }
    return normalized;
  }

  if (kind === "invalidate_object") {
    exactKeys(operation, ["kind", "id", "reason"], [], "operation");
    return {
      kind,
      id: validateId(operation.id, "operation.id"),
      reason: requireText(operation.reason, "operation.reason")
    };
  }

  if (kind === "reevaluate_object") {
    exactKeys(operation, ["kind", "id"], ["justification"], "operation");
    const normalized: JsonObject = { kind, id: validateId(operation.id, "operation.id") };
    if (operation.justification !== undefined) {
      normalized.justification = requireText(operation.justification, "operation.justification");
    }
    return normalized;
  }

  if (kind === "close_conclusion") {
    exactKeys(operation, ["kind", "id"], ["limitJustification"], "operation");
    const normalized: JsonObject = { kind, id: validateId(operation.id, "operation.id", "CON") };
    if (operation.limitJustification !== undefined) {
      normalized.limitJustification = requireText(operation.limitJustification, "operation.limitJustification");
    }
    return normalized;
  }

  exactKeys(operation, ["kind", "id", "reason"], [], "operation");
  return {
    kind,
    id: validateId(operation.id, "operation.id", "CON"),
    reason: requireText(operation.reason, "operation.reason")
  };
}

export function validateAgentProposalInput(raw: unknown): JsonObject {
  const proposal = requireObject(raw, "proposta");
  exactKeys(
    proposal,
    [
      "format",
      "investigationId",
      "expectedEventHead",
      "agent",
      "intent",
      "operation",
      "assumptions",
      "uncertainties",
      "requiresHumanReview"
    ],
    [],
    "proposta"
  );
  if (proposal.format !== AGENT_PROPOSAL_FORMAT) throw new Error(`format deve ser ${AGENT_PROPOSAL_FORMAT}`);
  const investigationId = validateId(proposal.investigationId, "investigationId", "INV");
  if (proposal.expectedEventHead !== null && (
    typeof proposal.expectedEventHead !== "string" || !HASH_PATTERN.test(proposal.expectedEventHead)
  )) {
    throw new Error("expectedEventHead deve ser null ou SHA-256 hexadecimal");
  }
  const agent = requireObject(proposal.agent, "agent");
  exactKeys(agent, ["id"], ["provider", "model"], "agent");
  const normalizedAgent: JsonObject = { id: requireText(agent.id, "agent.id", 160) };
  const provider = optionalText(agent.provider, "agent.provider", 160);
  const model = optionalText(agent.model, "agent.model", 160);
  if (provider !== undefined) normalizedAgent.provider = provider;
  if (model !== undefined) normalizedAgent.model = model;
  if (proposal.requiresHumanReview !== true) throw new Error("requiresHumanReview deve ser true");
  return cleanJson({
    format: AGENT_PROPOSAL_FORMAT,
    investigationId,
    expectedEventHead: proposal.expectedEventHead,
    agent: normalizedAgent,
    intent: requireText(proposal.intent, "intent"),
    operation: validateOperation(proposal.operation),
    assumptions: requireStringArray(proposal.assumptions, "assumptions"),
    uncertainties: requireStringArray(proposal.uncertainties, "uncertainties"),
    requiresHumanReview: true
  }) as JsonObject;
}

function immutableContent(record: JsonObject): JsonObject {
  return {
    format: record.format,
    proposalId: record.proposalId,
    investigationId: record.investigationId,
    expectedEventHead: record.expectedEventHead,
    createdAt: record.createdAt,
    agent: record.agent,
    intent: record.intent,
    operation: record.operation,
    assumptions: record.assumptions,
    uncertainties: record.uncertainties,
    requiresHumanReview: record.requiresHumanReview
  };
}

export function computeProposalHash(record: JsonObject): string {
  return sha256(canonicalStringify(immutableContent(record)));
}

function computeRecordHash(record: JsonObject): string {
  const { recordHash: _ignored, ...content } = record;
  return sha256(canonicalStringify(content));
}

function sealRecord(record: JsonObject): JsonObject {
  const content = cleanJson(record) as JsonObject;
  return { ...content, recordHash: computeRecordHash(content) };
}

function assertProposalId(proposalId: unknown): asserts proposalId is string {
  if (typeof proposalId !== "string" || !PROPOSAL_ID_PATTERN.test(proposalId) || proposalId.includes("..")) {
    throw new Error(`proposalId inválido ou inseguro: ${String(proposalId)}`);
  }
}

function validateStoredRecord(raw: unknown): JsonObject {
  const record = requireObject(raw, "registro de proposta");
  exactKeys(
    record,
    [
      "format", "proposalId", "investigationId", "expectedEventHead", "createdAt", "agent", "intent",
      "operation", "assumptions", "uncertainties", "requiresHumanReview", "proposalHash", "status", "review", "recordHash"
    ],
    [],
    "registro de proposta"
  );
  assertProposalId(record.proposalId);
  const input = validateAgentProposalInput({
    format: record.format,
    investigationId: record.investigationId,
    expectedEventHead: record.expectedEventHead,
    agent: record.agent,
    intent: record.intent,
    operation: record.operation,
    assumptions: record.assumptions,
    uncertainties: record.uncertainties,
    requiresHumanReview: record.requiresHumanReview
  });
  if (typeof record.createdAt !== "string" || Number.isNaN(Date.parse(record.createdAt))) {
    throw new Error("createdAt inválido no registro de proposta");
  }
  if (!HASH_PATTERN.test(String(record.proposalHash))) throw new Error("proposalHash inválido");
  if (!HASH_PATTERN.test(String(record.recordHash))) throw new Error("recordHash inválido");
  if (!["pending", "applied", "rejected"].includes(record.status)) throw new Error(`status inválido: ${record.status}`);
  if (record.status === "pending" && record.review !== null) throw new Error("Proposta pendente não pode conter revisão");
  if (record.status !== "pending" && !isPlainObject(record.review)) throw new Error("Proposta decidida exige registro de revisão");
  const normalized = { ...input, proposalId: record.proposalId, createdAt: record.createdAt };
  const expectedProposalHash = computeProposalHash(normalized);
  if (record.proposalHash !== expectedProposalHash) throw new Error(`Proposta adulterada: proposalHash inválido em ${record.proposalId}`);
  const expectedRecordHash = computeRecordHash(record);
  if (record.recordHash !== expectedRecordHash) throw new Error(`Registro adulterado: recordHash inválido em ${record.proposalId}`);
  return record;
}

function validateOperationAgainstState(record: JsonObject, state: any): void {
  if (record.investigationId !== state.investigation.id) throw new Error("Proposta pertence a outra investigação");
  const operation = record.operation;
  if (operation.kind === "create_object") {
    if (operation.id && findObject(state, operation.id)) throw new Error(`ID já existe: ${operation.id}`);
    if (operation.objectType === "DOC" && !findObject(state, operation.data.sourceId)) {
      throw new Error(`Fonte inexistente: ${String(operation.data.sourceId)}`);
    }
    if (operation.objectType === "INF" && !findObject(state, operation.data.documentId)) {
      throw new Error(`Documento inexistente: ${String(operation.data.documentId)}`);
    }
    if (operation.objectType === "CON" && !findObject(state, operation.data.questionId)) {
      throw new Error(`Questão inexistente: ${String(operation.data.questionId)}`);
    }
    return;
  }
  if (operation.kind === "create_relation") {
    if (!findObject(state, operation.from)) throw new Error(`Nó de origem inexistente: ${operation.from}`);
    if (!findObject(state, operation.to)) throw new Error(`Nó de destino inexistente: ${operation.to}`);
    if (operation.id && findObject(state, operation.id)) throw new Error(`ID já existe: ${operation.id}`);
    return;
  }
  const target = findObject(state, operation.id);
  if (!target) throw new Error(`Objeto inexistente: ${operation.id}`);
  if (operation.kind === "invalidate_object" && target.validity === "invalidated") {
    throw new Error(`Objeto já invalidado: ${operation.id}`);
  }
  if (operation.kind === "reevaluate_object" && target.validity !== "active") {
    throw new Error("Somente objeto ativo pode ser reavaliado");
  }
  if (["close_conclusion", "reopen_conclusion"].includes(operation.kind) && target.type !== "CON") {
    throw new Error(`Conclusão inexistente: ${operation.id}`);
  }
}

function approvalMethod(record: JsonObject): string {
  return `arca-workbench-agent-approval@${AGENT_BUNDLE_VERSION};proposal=${record.proposalId};sha256=${record.proposalHash};agent=${encodeURIComponent(record.agent.id)}`;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export class AgentProposalStore {
  readonly home: string;
  readonly root: string;
  readonly core: ArcaCore;

  constructor(home: string, core?: ArcaCore) {
    if (!home || typeof home !== "string") throw new Error("ARCA_HOME é obrigatório");
    this.home = resolve(home);
    this.root = join(this.home, "agent-proposals");
    this.core = core ?? new ArcaCore(this.home);
  }

  async init(): Promise<void> {
    await this.core.init();
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.root);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Diretório de propostas inseguro");
  }

  private pathFor(proposalId: string): string {
    assertProposalId(proposalId);
    const path = join(this.root, `${proposalId}.json`);
    if (!path.startsWith(`${this.root}${sep}`)) throw new Error("Caminho de proposta fora do ARCA_HOME");
    return path;
  }

  private async readRecord(proposalId: string): Promise<JsonObject> {
    await this.init();
    const path = this.pathFor(proposalId);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Arquivo de proposta inseguro: ${proposalId}`);
    if (info.size > MAX_PROPOSAL_BYTES) throw new Error(`Proposta excede ${MAX_PROPOSAL_BYTES} bytes`);
    const raw = await readFile(path, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`JSON inválido na proposta ${proposalId}`);
    }
    return validateStoredRecord(parsed);
  }

  private async acquireLock(proposalId: string, timeoutMs = 5000): Promise<{ handle: any; path: string }> {
    await this.init();
    const path = `${this.pathFor(proposalId)}.lock`;
    const started = Date.now();
    while (true) {
      try {
        const handle = await open(path, "wx", 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: utcNow() }), "utf8");
        await handle.sync();
        return { handle, path };
      } catch (error: any) {
        if (error?.code !== "EEXIST") throw error;
        if (Date.now() - started >= timeoutMs) throw new Error(`Proposta ocupada por outra revisão: ${proposalId}`);
        await delay(25);
      }
    }
  }

  private async releaseLock(lock: { handle: any; path: string }): Promise<void> {
    await lock.handle.close();
    await rm(lock.path, { force: true });
  }

  private async writeRecord(record: JsonObject): Promise<JsonObject> {
    const sealed = sealRecord(record);
    await atomicWriteJson(this.pathFor(sealed.proposalId), sealed);
    return sealed;
  }

  private async withFreshness(record: JsonObject): Promise<JsonObject> {
    const state = await this.core.get(record.investigationId);
    return {
      ...record,
      freshness: state.projection.eventHead === record.expectedEventHead ? "current" : "stale",
      currentEventHead: state.projection.eventHead
    };
  }

  async create(raw: unknown): Promise<JsonObject> {
    await this.init();
    const input = validateAgentProposalInput(raw);
    const state = await this.core.get(input.investigationId);
    validateOperationAgainstState(input, state);
    let proposalId: string;
    let path: string;
    do {
      proposalId = `APR-${randomUUID()}`;
      path = this.pathFor(proposalId);
    } while (await stat(path).then(() => true, (error: any) => error?.code === "ENOENT" ? false : Promise.reject(error)));
    const createdAt = utcNow();
    const base = {
      ...input,
      proposalId,
      createdAt,
      status: "pending",
      review: null
    };
    const record = await this.writeRecord({ ...base, proposalHash: computeProposalHash(base) });
    return this.withFreshness(record);
  }

  async get(proposalId: string): Promise<JsonObject> {
    return this.withFreshness(await this.readRecord(proposalId));
  }

  async list(filters: { investigationId?: string; status?: string } = {}): Promise<JsonObject[]> {
    await this.init();
    if (filters.investigationId) assertSafeId(filters.investigationId, "INV");
    if (filters.status && !["pending", "applied", "rejected"].includes(filters.status)) {
      throw new Error(`Filtro de status inválido: ${filters.status}`);
    }
    const entries = (await readdir(this.root, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && /^APR-.*\.json$/.test(entry.name));
    const records: JsonObject[] = [];
    for (const entry of entries) {
      const proposalId = entry.name.slice(0, -5);
      const record = await this.readRecord(proposalId);
      if (filters.investigationId && record.investigationId !== filters.investigationId) continue;
      if (filters.status && record.status !== filters.status) continue;
      records.push(await this.withFreshness(record));
    }
    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async findAppliedEvent(record: JsonObject): Promise<any | undefined> {
    const marker = `proposal=${record.proposalId};sha256=${record.proposalHash};`;
    const events = await this.core.store.loadEvents(record.investigationId);
    return events.find((event) => event.actor?.method?.includes(marker));
  }

  private async execute(record: JsonObject, reviewerId: string): Promise<any> {
    const operation = record.operation;
    const common = {
      investigationId: record.investigationId,
      expectedEventHead: record.expectedEventHead,
      actor: { id: reviewerId, type: "human" as const, method: approvalMethod(record) }
    };
    switch (operation.kind) {
      case "create_object":
        return this.core.addObject({ ...common, type: operation.objectType, id: operation.id, data: operation.data });
      case "update_object":
        return this.core.updateObject({ ...common, id: operation.id, patch: operation.patch });
      case "create_relation":
        return this.core.relate({
          ...common,
          id: operation.id,
          from: operation.from,
          to: operation.to,
          relationType: operation.relationType,
          category: operation.category,
          effect: operation.effect,
          justification: operation.justification,
          materiality: operation.materiality,
          extensions: operation.extensions
        });
      case "invalidate_object":
        return this.core.invalidate({ ...common, id: operation.id, reason: operation.reason });
      case "reevaluate_object":
        return this.core.reevaluate({ ...common, id: operation.id, justification: operation.justification });
      case "close_conclusion":
        return this.core.closeConclusion({ ...common, id: operation.id, limitJustification: operation.limitJustification });
      case "reopen_conclusion":
        return this.core.reopenConclusion({ ...common, id: operation.id, reason: operation.reason });
      default:
        throw new Error(`Operação de proposta não suportada: ${String(operation.kind)}`);
    }
  }

  private async markApplied(record: JsonObject, reviewerId: string, confirmation: string, event: any): Promise<JsonObject> {
    return this.writeRecord({
      ...record,
      status: "applied",
      review: {
        decision: "approved",
        reviewerId,
        reviewedAt: utcNow(),
        confirmation,
        eventId: event.eventId,
        eventHash: event.eventHash,
        sequence: event.sequence
      }
    });
  }

  async apply(input: { proposalId: string; reviewerId: string; confirmation: string }): Promise<JsonObject> {
    assertProposalId(input.proposalId);
    const reviewerId = requireText(input.reviewerId, "reviewerId", 160);
    const confirmation = requireText(input.confirmation, "confirmation", 240);
    const requiredConfirmation = `APLICAR ${input.proposalId}`;
    if (confirmation !== requiredConfirmation) {
      throw new Error(`Confirmação inválida; digite exatamente: ${requiredConfirmation}`);
    }
    const lock = await this.acquireLock(input.proposalId);
    try {
      let record = await this.readRecord(input.proposalId);
      if (record.status !== "pending") throw new Error(`Proposta já está ${record.status}: ${record.proposalId}`);

      const recoveredEvent = await this.findAppliedEvent(record);
      if (recoveredEvent) {
        record = await this.markApplied(record, reviewerId, confirmation, recoveredEvent);
        return { proposal: await this.withFreshness(record), event: recoveredEvent, recovered: true };
      }

      const state = await this.core.get(record.investigationId);
      if (state.projection.eventHead !== record.expectedEventHead) {
        throw new Error(
          `Proposta obsoleta: eventHead atual ${state.projection.eventHead}, esperado ${record.expectedEventHead}`
        );
      }
      validateOperationAgainstState(record, state);
      const result = await this.execute(record, reviewerId);
      const event = await this.findAppliedEvent(record);
      if (!event) throw new Error("Operação aplicada, mas o evento vinculado à proposta não foi localizado");
      record = await this.markApplied(record, reviewerId, confirmation, event);
      return { proposal: await this.withFreshness(record), event, result, recovered: false };
    } finally {
      await this.releaseLock(lock);
    }
  }

  async reject(input: { proposalId: string; reviewerId: string; reason: string }): Promise<JsonObject> {
    assertProposalId(input.proposalId);
    const reviewerId = requireText(input.reviewerId, "reviewerId", 160);
    const reason = requireText(input.reason, "reason");
    const lock = await this.acquireLock(input.proposalId);
    try {
      const record = await this.readRecord(input.proposalId);
      if (record.status !== "pending") throw new Error(`Proposta já está ${record.status}: ${record.proposalId}`);
      if (await this.findAppliedEvent(record)) {
        throw new Error("Proposta já gerou evento canônico e não pode ser rejeitada");
      }
      const updated = await this.writeRecord({
        ...record,
        status: "rejected",
        review: { decision: "rejected", reviewerId, reviewedAt: utcNow(), reason }
      });
      return this.withFreshness(updated);
    } finally {
      await this.releaseLock(lock);
    }
  }
}
