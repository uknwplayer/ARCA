import { canonicalStringify, cleanJson, sha256 } from "./canonical.ts";
import {
  EPISTEMIC_STATES,
  EVIDENCE_EFFECTS,
  EXPORT_FORMAT,
  GAP_STATES,
  OBJECT_TYPES,
  PROTOCOL_VERSION,
  RELATION_CATEGORIES
} from "./constants.ts";
import { assertSafeId, collectionForType, nextInvestigationId, nextRelationId, nextTypedId, typeFromId } from "./ids.ts";
import { migrateLegacyState } from "./migration.ts";
import { findObject, normalizeActor, utcNow } from "./model.ts";
import type { Actor } from "./model.ts";
import { ArcaStore } from "./store.ts";
import { descendantIds, hasDirectedPath, traceGraph } from "./trace.ts";
import { validateState } from "./validate.ts";

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} é obrigatório`);
  return value.trim();
}

function normalizeType(type: string): string {
  const normalized = type.toUpperCase();
  if (normalized === "SEA") return "SEARCH";
  if (!OBJECT_TYPES.includes(normalized as any)) throw new Error(`Tipo de objeto inválido: ${type}`);
  return normalized;
}

function normalizeObject(type: string, input: Record<string, any>, id: string, timestamp: string, simulation: boolean): any {
  const object: any = {
    ...cleanJson(input),
    id,
    type,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: timestamp,
    validity: input.validity ?? "active",
    simulation: input.simulation ?? simulation
  };
  if (type === "Q") object.text = requireText(object.text, "text");
  if (type === "SRC") object.name = requireText(object.name, "name");
  if (type === "DOC") {
    object.title = requireText(object.title, "title");
    object.sourceId = requireText(object.sourceId, "sourceId");
    object.acquiredAt ??= timestamp;
    object.acquisitionMethod ??= simulation ? "simulation" : null;
    object.hashStatus ??= "not_computed";
  }
  if (type === "INF") {
    object.documentId = requireText(object.documentId, "documentId");
    object.content = requireText(object.content, "content");
  }
  if (type === "PRO") {
    object.text = requireText(object.text, "text");
    object.epistemicStatus ??= "Desconhecido";
    if (!EPISTEMIC_STATES.includes(object.epistemicStatus)) throw new Error("epistemicStatus fora do vocabulário ARCA");
    object.classificationJustification ??= null;
  }
  if (type === "HIP") {
    object.statement = requireText(object.statement ?? object.name, "statement");
    object.tests ??= [];
    object.alternatives ??= [];
    object.devilsAdvocateCompleted ??= false;
  }
  if (type === "CON") {
    object.statement = requireText(object.statement, "statement");
    object.questionId = requireText(object.questionId, "questionId");
    object.scope = requireText(object.scope, "scope");
    object.lifecycleStatus ??= "draft";
    object.epistemicStatus ??= "Desconhecido";
    object.favorableBases ??= [];
    object.contraryBases ??= [];
    object.materialGaps ??= [];
    object.limitations ??= [];
    object.reopeningConditions ??= [];
    object.dependencyIds ??= [];
  }
  if (type === "GAP") {
    object.gapState ??= "L0";
    if (!GAP_STATES.includes(object.gapState)) throw new Error("gapState deve estar entre L0 e L6");
    object.description = requireText(object.description, "description");
    object.materiality ??= "medium";
    object.likelyToChangeResult ??= null;
  }
  if (type === "SEARCH") {
    object.query = requireText(object.query, "query");
  }
  return object;
}

export class ArcaCore {
  readonly store: ArcaStore;

  constructor(home: string) {
    this.store = new ArcaStore(home);
  }

  async init(): Promise<any> {
    return this.store.init();
  }

  async createInvestigation(input: {
    id?: string;
    question: string;
    objective: string;
    scope: string;
    limits: string;
    simulation?: boolean;
    actor?: Partial<Actor>;
  }): Promise<any> {
    await this.store.init();
    const id = input.id ?? nextInvestigationId(await this.store.listInvestigations());
    assertSafeId(id, "INV");
    if (await this.store.hasInvestigation(id)) throw new Error(`Investigação já existe: ${id}`);
    const suffix = id.slice("INV-".length);
    const questionId = `Q-${suffix}`;
    assertSafeId(questionId, "Q");
    const timestamp = utcNow();
    const simulation = Boolean(input.simulation);
    const investigation = {
      id,
      type: "INV",
      questionIds: [questionId],
      objective: requireText(input.objective, "objective"),
      scope: requireText(input.scope, "scope"),
      limits: requireText(input.limits, "limits"),
      lifecycleStatus: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
      simulation
    };
    const question = {
      id: questionId,
      type: "Q",
      text: requireText(input.question, "question"),
      createdAt: timestamp,
      updatedAt: timestamp,
      validity: "active",
      simulation
    };
    const relation = {
      id: "REL-000001",
      type: "REL",
      from: id,
      to: questionId,
      relationType: "has_question",
      category: "investigation",
      justification: "A questão define o objeto verificável da investigação.",
      createdAt: timestamp,
      validity: "active"
    };
    await this.store.append({
      investigationId: id,
      operation: "INVESTIGATION_CREATE",
      payload: { investigation, question, relation },
      actor: input.actor,
      timestamp,
      allowCreate: true
    });
    return this.store.loadState(id);
  }

  async get(investigationId: string): Promise<any> {
    return this.store.loadState(investigationId);
  }

  async list(): Promise<string[]> {
    return this.store.listInvestigations();
  }

  async addObject(input: {
    investigationId: string;
    type: string;
    id?: string;
    data: Record<string, any>;
    actor?: Partial<Actor>;
    expectedEventHead?: string | null;
  }): Promise<any> {
    const state = await this.get(input.investigationId);
    const type = normalizeType(input.type);
    const id = input.id ?? nextTypedId(state, type);
    assertSafeId(id, type);
    if (findObject(state, id)) throw new Error(`ID já existe: ${id}`);
    const timestamp = utcNow();
    const object = normalizeObject(type, input.data, id, timestamp, Boolean(state.investigation.simulation));
    if (type === "DOC" && !findObject(state, object.sourceId)) throw new Error(`Fonte inexistente: ${object.sourceId}`);
    if (type === "INF" && !findObject(state, object.documentId)) throw new Error(`Documento inexistente: ${object.documentId}`);
    if (type === "CON" && !findObject(state, object.questionId)) throw new Error(`Questão inexistente: ${object.questionId}`);
    await this.store.append({
      investigationId: input.investigationId,
      operation: "OBJECT_CREATE",
      payload: { collection: collectionForType(type), object },
      actor: input.actor,
      timestamp,
      expectedEventHead: input.expectedEventHead
    });
    return object;
  }

  async updateObject(input: {
    investigationId: string;
    id: string;
    patch: Record<string, any>;
    actor?: Partial<Actor>;
    expectedEventHead?: string | null;
  }): Promise<any> {
    const state = await this.get(input.investigationId);
    const existing = findObject(state, input.id);
    if (!existing) throw new Error(`Objeto inexistente: ${input.id}`);
    if (Object.hasOwn(input.patch, "id") || Object.hasOwn(input.patch, "type") || Object.hasOwn(input.patch, "createdAt")) {
      throw new Error("UPDATE não pode alterar id, type ou createdAt");
    }
    await this.store.append({
      investigationId: input.investigationId,
      operation: "OBJECT_UPDATE",
      payload: { id: input.id, patch: cleanJson(input.patch) as any },
      actor: input.actor,
      expectedEventHead: input.expectedEventHead
    });
    return findObject(await this.get(input.investigationId), input.id);
  }

  async relate(input: {
    investigationId: string;
    from: string;
    to: string;
    relationType: string;
    category: string;
    effect?: string;
    justification?: string;
    materiality?: string;
    id?: string;
    extensions?: Record<string, any>;
    actor?: Partial<Actor>;
    expectedEventHead?: string | null;
  }): Promise<any> {
    const state = await this.get(input.investigationId);
    assertSafeId(input.from);
    assertSafeId(input.to);
    if (!findObject(state, input.from)) throw new Error(`Nó de origem inexistente: ${input.from}`);
    if (!findObject(state, input.to)) throw new Error(`Nó de destino inexistente: ${input.to}`);
    const category = input.category.toLowerCase();
    if (!RELATION_CATEGORIES.includes(category)) throw new Error(`Categoria de relação inválida: ${category}`);
    const effect = input.effect ?? (category === "evidence" && EVIDENCE_EFFECTS.includes(input.relationType) ? input.relationType : undefined);
    if (category === "evidence") {
      if (typeFromId(input.from) !== "INF" || typeFromId(input.to) !== "PRO") {
        throw new Error("Evidência deve ser relação INF → PRO");
      }
      if (!effect || !EVIDENCE_EFFECTS.includes(effect)) throw new Error("Evidência exige effect controlado");
      requireText(input.justification, "justification");
    }
    if (input.from.startsWith("DOC-") && input.to.startsWith("CON-") && ["evidence", "epistemic"].includes(category)) {
      throw new Error("Relação epistêmica direta DOC → CON é proibida");
    }
    if (category !== "identity" && hasDirectedPath(state, input.to, input.from)) {
      throw new Error(`A relação criaria ciclo dirigido: ${input.from} → ${input.to}`);
    }
    const id = input.id ?? nextRelationId(state);
    assertSafeId(id, "REL");
    if (findObject(state, id)) throw new Error(`ID já existe: ${id}`);
    const relation = cleanJson({
      id,
      type: "REL",
      from: input.from,
      to: input.to,
      relationType: requireText(input.relationType, "relationType"),
      category,
      effect,
      justification: input.justification ?? null,
      materiality: input.materiality ?? null,
      createdAt: utcNow(),
      validity: "active",
      extensions: input.extensions ?? {}
    });
    await this.store.append({
      investigationId: input.investigationId,
      operation: "RELATION_CREATE",
      payload: { relation },
      actor: input.actor,
      expectedEventHead: input.expectedEventHead
    });
    return relation;
  }

  async trace(investigationId: string, target: string, direction: "ancestors" | "descendants" = "ancestors"): Promise<any> {
    return traceGraph(await this.get(investigationId), target, direction);
  }

  async invalidate(input: {
    investigationId: string;
    id: string;
    reason: string;
    actor?: Partial<Actor>;
    expectedEventHead?: string | null;
  }): Promise<any> {
    const state = await this.get(input.investigationId);
    const target = findObject(state, input.id);
    if (!target) throw new Error(`Objeto inexistente: ${input.id}`);
    if (target.validity === "invalidated") throw new Error(`Objeto já invalidado: ${input.id}`);
    const dependentIds = descendantIds(state, input.id)
      .filter((id) => findObject(state, id)?.validity === "active");
    await this.store.append({
      investigationId: input.investigationId,
      operation: "OBJECT_INVALIDATE",
      payload: { id: input.id, reason: requireText(input.reason, "reason"), dependentIds },
      actor: input.actor,
      expectedEventHead: input.expectedEventHead
    });
    return { invalidated: input.id, dependentIds };
  }

  async reevaluate(input: {
    investigationId: string;
    id: string;
    justification?: string;
    actor?: Partial<Actor>;
    expectedEventHead?: string | null;
  }): Promise<any> {
    const state = await this.get(input.investigationId);
    const target = findObject(state, input.id);
    if (!target) throw new Error(`Objeto inexistente: ${input.id}`);
    if (target.validity !== "active") throw new Error("Somente objeto ativo pode ser reavaliado");
    const incoming = state.relations.filter((relation: any) => relation.to === input.id && relation.validity === "active");
    const hasInvalidatedAncestor = (nodeId: string): boolean => {
      const trace = traceGraph(state, nodeId, "ancestors", { includeInvalidated: true });
      return trace.nodeIds.some((id) => findObject(state, id)?.validity === "invalidated");
    };
    const usable = incoming.filter((relation: any) =>
      findObject(state, relation.from)?.validity === "active" && !hasInvalidatedAncestor(relation.from)
    );
    const supports = usable.filter((relation: any) => ["supports", "compatible"].includes(relation.effect ?? relation.relationType));
    const contradictions = usable.filter((relation: any) => (relation.effect ?? relation.relationType) === "contradicts");
    const type = typeFromId(input.id);
    const epistemic = ["PRO", "HIP", "CON"].includes(type);
    const result: any = {
      reevaluationJustification: input.justification ?? "Reavaliação estrutural das dependências ativas.",
      reevaluationSummary: {
        incomingRelations: incoming.length,
        usableRelations: usable.length,
        supportingRelations: supports.map((item: any) => item.id),
        contradictingRelations: contradictions.map((item: any) => item.id)
      }
    };
    if (epistemic && !supports.length) {
      result.epistemicStatus = "Não verificado";
      result.pendingSemanticReview = contradictions.length > 0;
      result.reevaluationOutcome = "support_removed_without_automatic_falsity";
    } else {
      result.pendingSemanticReview = epistemic;
      result.reevaluationOutcome = epistemic ? "active_support_requires_semantic_review" : "dependencies_recomputed";
    }
    await this.store.append({
      investigationId: input.investigationId,
      operation: "OBJECT_REEVALUATE",
      payload: { id: input.id, result },
      actor: input.actor,
      expectedEventHead: input.expectedEventHead
    });
    return findObject(await this.get(input.investigationId), input.id);
  }

  async closeConclusion(input: {
    investigationId: string;
    id: string;
    limitJustification?: string;
    actor?: Partial<Actor>;
    expectedEventHead?: string | null;
  }): Promise<any> {
    const state = await this.get(input.investigationId);
    const conclusion = findObject(state, input.id);
    if (!conclusion || typeFromId(input.id) !== "CON") throw new Error(`Conclusão inexistente: ${input.id}`);
    const fields = ["favorableBases", "contraryBases", "materialGaps", "limitations", "reopeningConditions"];
    const missing = fields.filter((field) => !Array.isArray(conclusion[field]));
    if (!conclusion.scope || missing.length) throw new Error(`Conclusão não auditável; faltam: ${[...missing, ...(!conclusion.scope ? ["scope"] : [])].join(", ")}`);
    if (!conclusion.reopeningConditions.length && !conclusion.noKnownReopeningConditionJustification) {
      throw new Error("Conclusão fechada exige condição objetiva de reabertura");
    }
    const trace = traceGraph(state, input.id);
    const relevantHypotheses = trace.nodeIds.map((id) => findObject(state, id)).filter((item) => item?.type === "HIP");
    const failedDevil = relevantHypotheses.filter((item) => !item.devilsAdvocateCompleted || !item.alternatives?.length);
    if (failedDevil.length) throw new Error(`Advogado do Diabo incompleto: ${failedDevil.map((item) => item.id).join(", ")}`);
    const materialGaps = (conclusion.materialGaps ?? [])
      .map((id: string) => findObject(state, id))
      .filter((gap: any) => gap?.validity === "active" && gap.likelyToChangeResult === true);
    const limitJustification = input.limitJustification ?? conclusion.limitJustification;
    if (materialGaps.length && !limitJustification) {
      throw new Error(`O Limite bloqueou o fechamento; lacunas materiais: ${materialGaps.map((item: any) => item.id).join(", ")}`);
    }
    await this.store.append({
      investigationId: input.investigationId,
      operation: "CONCLUSION_CLOSE",
      payload: { id: input.id, limitJustification: limitJustification ?? null },
      actor: input.actor,
      expectedEventHead: input.expectedEventHead
    });
    return findObject(await this.get(input.investigationId), input.id);
  }

  async reopenConclusion(input: {
    investigationId: string;
    id: string;
    reason: string;
    actor?: Partial<Actor>;
    expectedEventHead?: string | null;
  }): Promise<any> {
    const state = await this.get(input.investigationId);
    const conclusion = findObject(state, input.id);
    if (!conclusion || conclusion.type !== "CON") throw new Error(`Conclusão inexistente: ${input.id}`);
    if (conclusion.lifecycleStatus !== "closed") throw new Error("Somente conclusão fechada pode ser reaberta");
    await this.store.append({
      investigationId: input.investigationId,
      operation: "CONCLUSION_REOPEN",
      payload: { id: input.id, reason: requireText(input.reason, "reason") },
      actor: input.actor,
      expectedEventHead: input.expectedEventHead
    });
    return findObject(await this.get(input.investigationId), input.id);
  }

  async validate(investigationId: string, portableExport = false): Promise<any> {
    const events = await this.store.loadEvents(investigationId);
    const state = await this.store.loadState(investigationId);
    return validateState(state, { events, portableExport });
  }

  async exportInvestigation(investigationId: string, outputPath?: string): Promise<any> {
    const events = await this.store.loadEvents(investigationId);
    const state = await this.store.loadState(investigationId);
    const validation = validateState(state, { events, portableExport: true });
    const base = {
      format: EXPORT_FORMAT,
      protocolVersion: PROTOCOL_VERSION,
      exportedAt: utcNow(),
      state,
      events,
      validation
    };
    const exported = {
      ...base,
      integrity: {
        algorithm: "sha256",
        canonicalContentHash: sha256(canonicalStringify(base)),
        eventHead: events.at(-1)?.eventHash ?? null
      }
    };
    if (outputPath) await this.store.writeExport(outputPath, exported);
    return exported;
  }

  async importLegacy(input: {
    raw: any;
    originalBytes?: string | Uint8Array;
    actor?: Partial<Actor>;
  }): Promise<any> {
    const migratedAt = utcNow();
    const { state, report } = migrateLegacyState(input.raw, { originalBytes: input.originalBytes, migratedAt });
    const investigationId = state.investigation.id;
    if (await this.store.hasInvestigation(investigationId)) throw new Error(`Investigação já existe: ${investigationId}`);
    await this.store.append({
      investigationId,
      operation: "LEGACY_IMPORT",
      payload: { state, report },
      actor: normalizeActor({ id: input.actor?.id ?? "legacy-migrator", type: input.actor?.type ?? "migration", method: input.actor?.method ?? "migrate-legacy-v0-to-v1@0.1.0" }),
      timestamp: migratedAt,
      allowCreate: true
    });
    const validation = await this.validate(investigationId);
    return { state: await this.get(investigationId), report, validation };
  }

  async status(investigationId: string): Promise<any> {
    const state = await this.get(investigationId);
    const validation = await this.validate(investigationId);
    return {
      investigationId,
      lifecycleStatus: state.investigation.lifecycleStatus,
      sequence: state.projection.sequence,
      eventHead: state.projection.eventHead,
      counts: {
        nodes: Object.values(state.objects).reduce((sum: number, items: any) => sum + items.length, 1),
        relations: state.relations.length,
        pendingReevaluation: Object.values(state.objects).flat().filter((item: any) => item.needsReevaluation).length
      },
      validation: {
        profiles: validation.profiles,
        summary: validation.summary,
        eligibleForSeal: validation.eligibleForSeal,
        blockers: validation.blockers
      }
    };
  }
}
