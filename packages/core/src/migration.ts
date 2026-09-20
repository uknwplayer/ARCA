import { canonicalStringify, clone, sha256 } from "./canonical.ts";
import { EVIDENCE_EFFECTS, PROTOCOL_VERSION, STATE_SCHEMA_VERSION } from "./constants.ts";
import { assertSafeId } from "./ids.ts";
import { createEmptyObjects, utcNow } from "./model.ts";

const COLLECTIONS: Array<[string, string, string]> = [
  ["sources", "sources", "SRC"],
  ["documents", "documents", "DOC"],
  ["information", "information", "INF"],
  ["propositions", "propositions", "PRO"],
  ["entities", "entities", "ENT"],
  ["events", "events", "EVT"],
  ["hypotheses", "hypotheses", "HIP"],
  ["conclusions", "conclusions", "CON"],
  ["frames", "frames", "FRM"],
  ["gaps", "gaps", "GAP"],
  ["searches", "searches", "SEARCH"]
];

const RECOGNIZED_TOP_LEVEL = new Set([
  "arca_version", "conformance_spec", "conformance", "investigation", "history",
  "sources", "documents", "information", "propositions", "entities", "events",
  "hypotheses", "conclusions", "frames", "gaps", "searches", "relations",
  "subjects", "evidence", "conclusion"
]);

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase());
}

export function deepCamel(value: any): any {
  if (Array.isArray(value)) return value.map(deepCamel);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [snakeToCamel(key), deepCamel(item)])
  );
}

function rewriteExactIds(value: any, aliases: Map<string, string>): any {
  if (typeof value === "string") return aliases.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => rewriteExactIds(item, aliases));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, rewriteExactIds(item, aliases)])
  );
}

function isoDateTime(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`;
  if (!Number.isNaN(Date.parse(value))) return value;
  return fallback;
}

function lifecycle(value: unknown, fallback = "active"): string {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
  if (["fechada", "fechado", "closed"].includes(normalized) || normalized.startsWith("concluida")) return "closed";
  if (["reaberta", "reaberto", "reopened"].includes(normalized)) return "reopened";
  if (["arquivada", "arquivado", "archived"].includes(normalized)) return "archived";
  if (["provisoria", "provisional"].includes(normalized)) return "provisional";
  if (["rascunho", "draft"].includes(normalized)) return "draft";
  return fallback;
}

function normalizeEpistemicStatus(value: unknown): { canonical: string; mappingReason: string } {
  const original = String(value ?? "Desconhecido");
  const normalized = original
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
  if (normalized === "confirmado") return { canonical: "Confirmado", mappingReason: "equivalência direta" };
  if (normalized === "provavel") return { canonical: "Provável", mappingReason: "equivalência direta" };
  if (normalized === "possivel") return { canonical: "Possível", mappingReason: "equivalência direta" };
  if (normalized === "nao verificado") return { canonical: "Não verificado", mappingReason: "equivalência direta" };
  if (["contradito", "contradita"].includes(normalized)) return { canonical: "Contradito", mappingReason: "equivalência direta" };
  if (normalized === "desconhecido") return { canonical: "Desconhecido", mappingReason: "equivalência direta" };
  if (normalized === "confirmado parcial") {
    return { canonical: "Possível", mappingReason: "estado legado misto; mapeado conservadoramente sem promover a parte não verificada" };
  }
  if (normalized.startsWith("confirmado como limite inferencial")) {
    return { canonical: "Confirmado", mappingReason: "a proposição confirma um limite, não o fato limitado" };
  }
  if (normalized.startsWith("confirmado como resultado de busca")) {
    return { canonical: "Confirmado", mappingReason: "confirma apenas o resultado da busca, não inexistência" };
  }
  if (normalized.startsWith("confirmado com lacuna")) {
    return { canonical: "Confirmado", mappingReason: "confirmação legada preservada com lacunas explicitadas separadamente" };
  }
  if (normalized.includes("possivel") && normalized.includes("nao verificado")) {
    return { canonical: "Possível", mappingReason: "estado composto legado mapeado para o nível menos conclusivo compatível" };
  }
  if (normalized.startsWith("confirmado")) {
    return { canonical: "Confirmado", mappingReason: "variante legada de confirmação; qualificadores permanecem preservados" };
  }
  if (normalized.startsWith("possivel")) {
    return { canonical: "Possível", mappingReason: "variante legada de possibilidade" };
  }
  if (normalized.startsWith("nao verificado")) {
    return { canonical: "Não verificado", mappingReason: "variante legada de não verificado" };
  }
  return { canonical: "Desconhecido", mappingReason: "estado legado sem equivalente seguro; promoção recusada" };
}

function normalizeObject(raw: any, type: string, migratedAt: string, context: {
  questionId: string;
  investigationScope: string;
  gapIds: string[];
}): any {
  const object = deepCamel(raw);
  const legacyType = object.type;
  object.type = type;
  object.createdAt = isoDateTime(object.createdAt, migratedAt);
  object.updatedAt = isoDateTime(object.updatedAt, object.createdAt);
  object.validity ??= object.status === "invalidated" ? "invalidated" : "active";
  object.extensions ??= {};
  if (legacyType && legacyType !== type) object.extensions.legacyType = legacyType;

  if (type === "SRC") {
    object.name ??= object.title ?? `Fonte legada ${object.id}`;
    object.sourceType ??= legacyType && legacyType !== "SRC" ? legacyType : object.sourceType;
  }
  if (type === "DOC") {
    object.title ??= object.name ?? `Documento legado ${object.id}`;
    object.location ??= object.url ?? object.webRef ?? object.localPath ?? null;
    if (!object.acquiredAt) {
      object.acquiredAt = migratedAt;
      object.acquisitionOriginalUnknown = true;
    } else {
      object.acquiredAt = isoDateTime(object.acquiredAt, migratedAt);
    }
    if (!object.acquisitionMethod) {
      object.acquisitionMethod = "legacy_unknown";
      object.acquisitionOriginalUnknown = true;
    }
    object.hashStatus ??= object.hashSha256 ? "computed" : "not_computed";
  }
  if (type === "INF") {
    object.content ??= object.text ?? object.fact ?? `Informação legada ${object.id}`;
    object.locator ??= object.location ?? null;
  }
  if (type === "PRO") {
    const legacyStatus = object.epistemicStatus ?? object.status ?? "Desconhecido";
    const mapping = normalizeEpistemicStatus(legacyStatus);
    object.epistemicStatus = mapping.canonical;
    object.extensions.legacyEpistemicStatus = {
      value: legacyStatus,
      mappedTo: mapping.canonical,
      reason: mapping.mappingReason
    };
    if (object.classificationJustification === undefined) object.classificationJustification = null;
  }
  if (type === "ENT") {
    object.canonicalName ??= object.name ?? `Entidade legada ${object.id}`;
  }
  if (type === "HIP") {
    object.statement ??= object.text ?? object.name ?? "Hipótese legada sem enunciado separado";
    const mapping = normalizeEpistemicStatus(object.epistemicStatus ?? object.status ?? "Desconhecido");
    object.epistemicStatus = mapping.canonical;
    object.extensions.legacyEpistemicStatus = {
      value: object.status ?? null,
      mappedTo: mapping.canonical,
      reason: mapping.mappingReason
    };
    object.tests ??= [];
    object.alternatives ??= [];
    object.devilsAdvocateCompleted ??= false;
  }
  if (type === "CON") {
    object.questionId = context.questionId;
    object.lifecycleStatus = lifecycle(object.lifecycleStatus ?? object.status, "provisional");
    const mapping = normalizeEpistemicStatus(object.epistemicStatus ?? object.status ?? "Desconhecido");
    object.epistemicStatus = mapping.canonical;
    object.extensions.legacyEpistemicStatus = {
      value: object.status ?? null,
      mappedTo: mapping.canonical,
      reason: mapping.mappingReason
    };
    object.scope ??= context.investigationScope;
    object.favorableBases ??= object.favorableToIrregularity ?? (object.dependencyIds ?? []).filter((id: string) => id.startsWith("PRO-"));
    object.contraryBases ??= object.contraryOrLimiting ?? [];
    object.materialGaps ??= (object.dependencyIds ?? []).filter((id: string) => id.startsWith("GAP-"));
    if (!object.materialGaps.length) object.materialGaps = context.gapIds;
    object.limitations ??= [];
    if (!object.reopeningConditions) {
      object.reopeningConditions = object.reopeningCondition ? [object.reopeningCondition] : [];
    }
    object.dependencyIds ??= [
      ...new Set([
        ...object.favorableBases.filter((item: any) => typeof item === "string" && /^[A-Z]+-/.test(item)),
        ...object.contraryBases.filter((item: any) => typeof item === "string" && /^[A-Z]+-/.test(item)),
        ...object.materialGaps
      ])
    ];
  }
  if (type === "GAP") {
    object.gapState ??= object.state ?? "L0";
    delete object.state;
    object.description ??= object.text ?? `Lacuna legada ${object.id}`;
    object.materiality ??= "medium";
    object.likelyToChangeResult ??= null;
  }
  if (type === "SEARCH") {
    object.executedAt = isoDateTime(object.executedAt ?? object.date, migratedAt);
    object.query ??= `Busca legada ${object.id}`;
  }
  return object;
}

function normalizeRelation(raw: any, migratedAt: string): any {
  const relation = deepCamel(raw);
  relation.type = "REL";
  relation.createdAt = isoDateTime(relation.createdAt, migratedAt);
  relation.validity ??= "active";
  const legacyCategory = relation.category;
  const legacyEvidence = relation.from?.startsWith("INF-") && relation.to?.startsWith("PRO-") && (
    relation.category === "evidence" ||
    relation.relationType === "constitutes_evidence_for" ||
    EVIDENCE_EFFECTS.includes(relation.epistemicEffect) ||
    String(relation.id).startsWith("REL-EV-")
  );
  if (legacyEvidence) {
    relation.category = "evidence";
    relation.effect = relation.effect ?? relation.epistemicEffect ?? (EVIDENCE_EFFECTS.includes(relation.relationType) ? relation.relationType : "supports");
    relation.extensions ??= {};
    relation.extensions.legacyCategory = legacyCategory ?? null;
    relation.extensions.legacyRelationType = relation.relationType;
  }
  if (relation.category === "analysis") relation.category = "epistemic";
  if (!relation.category) relation.category = "semantic";
  if (relation.category === "evidence" && EVIDENCE_EFFECTS.includes(relation.relationType)) {
    relation.effect ??= relation.relationType;
  }
  return relation;
}

function prepareLegacyShape(rawInput: any, migratedAt: string, questionId: string): {
  prepared: any;
  aliases: Map<string, string>;
  transformations: string[];
} {
  let prepared = clone(rawInput);
  const aliases = new Map<string, string>();
  const transformations: string[] = [];
  const legacyInvestigation = deepCamel(prepared.investigation ?? {});
  if (legacyInvestigation.questionId && legacyInvestigation.questionId !== questionId) {
    aliases.set(legacyInvestigation.questionId, questionId);
    transformations.push(`question-id:${legacyInvestigation.questionId}→${questionId}`);
  }

  if (!Array.isArray(prepared.entities) && Array.isArray(prepared.subjects)) {
    prepared.entities = prepared.subjects.map((subject: any) => ({ ...subject, type: "ENT" }));
    transformations.push("subjects→entities");
  }
  if (!Array.isArray(prepared.conclusions) && prepared.conclusion) {
    prepared.conclusions = [prepared.conclusion];
    transformations.push("conclusion-singular→conclusions");
  }

  if (Array.isArray(prepared.searches)) {
    prepared.searches = prepared.searches.map((search: any) => {
      if (typeof search.id === "string" && search.id.startsWith("SEARCH-")) {
        const canonical = `SEA-${search.id.slice("SEARCH-".length)}`;
        aliases.set(search.id, canonical);
        transformations.push(`search-id:${search.id}→${canonical}`);
        return { ...search, id: canonical };
      }
      return search;
    });
  }

  prepared.documents = Array.isArray(prepared.documents) ? prepared.documents : [];
  prepared.information = Array.isArray(prepared.information) ? prepared.information : [];
  prepared.relations = Array.isArray(prepared.relations) ? prepared.relations : [];
  const usedRelationIds = new Set(prepared.relations.map((relation: any) => relation.id));
  let relationCounter = 1;
  const nextRelationId = (): string => {
    let id = `REL-MIG-${String(relationCounter).padStart(6, "0")}`;
    while (usedRelationIds.has(id)) {
      relationCounter += 1;
      id = `REL-MIG-${String(relationCounter).padStart(6, "0")}`;
    }
    relationCounter += 1;
    usedRelationIds.add(id);
    return id;
  };
  const hasRelation = (from: string, to: string, relationType?: string): boolean => prepared.relations.some((relation: any) =>
    relation.from === from && relation.to === to && (!relationType || (relation.relation_type ?? relation.relationType) === relationType)
  );
  const addRelation = (relation: any): void => {
    if (hasRelation(relation.from, relation.to, relation.relation_type ?? relation.relationType)) return;
    prepared.relations.push({ id: nextRelationId(), type: "REL", created_at: migratedAt, ...relation });
  };

  const documentIds = new Set(prepared.documents.map((document: any) => document.id));
  const sourceDocument = new Map<string, string>();
  for (const document of prepared.documents) {
    if (document.source_id) sourceDocument.set(document.source_id, document.id);
    if (document.sourceId) sourceDocument.set(document.sourceId, document.id);
  }

  if (Array.isArray(prepared.evidence)) {
    for (const source of prepared.sources ?? []) {
      if (sourceDocument.has(source.id)) continue;
      const suffix = String(source.id).replace(/^SRC-/, "");
      let documentId = `DOC-${suffix}`;
      let collision = 1;
      while (documentIds.has(documentId)) {
        documentId = `DOC-MIG-${String(collision).padStart(6, "0")}`;
        collision += 1;
      }
      documentIds.add(documentId);
      sourceDocument.set(source.id, documentId);
      prepared.documents.push({
        id: documentId,
        type: "DOC",
        source_id: source.id,
        title: source.title ?? source.name ?? `Documento derivado da fonte ${source.id}`,
        date: source.date ?? null,
        url: source.url ?? null,
        acquired_at: null,
        acquisition_method: "legacy_unknown",
        acquisition_original_unknown: true,
        hash_status: "not_computed",
        simulation: false,
        extensions: { generatedFromLegacySourceRecord: source.id }
      });
      addRelation({
        from: source.id,
        to: documentId,
        relation_type: "acquired_from",
        category: "provenance",
        justification: "Documento materializado a partir do registro de fonte documental legado; aquisição original permanece desconhecida."
      });
    }

    const informationIds = new Set(prepared.information.map((item: any) => item.id));
    for (const evidence of prepared.evidence) {
      const suffix = String(evidence.id).replace(/^EVD-/, "");
      let informationId = `INF-${suffix}`;
      let collision = 1;
      while (informationIds.has(informationId)) {
        informationId = `INF-MIG-${String(collision).padStart(6, "0")}`;
        collision += 1;
      }
      informationIds.add(informationId);
      aliases.set(evidence.id, informationId);
      const documentId = sourceDocument.get(evidence.source);
      if (!documentId) continue;
      prepared.information.push({
        id: informationId,
        type: "INF",
        document_id: documentId,
        content: evidence.fact,
        locator: evidence.location ?? null,
        extraction_method: "legacy_evidence_normalization",
        transformation: {
          method: "EVD-object-to-INF-node",
          migrator: "migrate-legacy-v0-to-v1@0.1.0",
          original_evidence_id: evidence.id,
          reviewed: false
        },
        attribution: evidence.attribution ?? null,
        temporal_fit: evidence.temporal_fit ?? null,
        limitations: evidence.limitations ?? [],
        simulation: false,
        extensions: { legacyEvidence: evidence }
      });
      addRelation({
        from: documentId,
        to: informationId,
        relation_type: "extracted_from",
        category: "provenance",
        justification: `Informação normalizada do objeto legado ${evidence.id}.`
      });
      for (const propositionId of evidence.supports ?? []) {
        addRelation({
          from: informationId,
          to: propositionId,
          relation_type: "supports",
          category: "evidence",
          effect: "supports",
          justification: `Relação preservada do campo supports de ${evidence.id}; requer revisão semântica independente.`
        });
      }
      for (const propositionId of evidence.weakens ?? []) {
        addRelation({
          from: informationId,
          to: propositionId,
          relation_type: "weakens",
          category: "evidence",
          effect: "weakens",
          justification: `Relação preservada do campo weakens de ${evidence.id}; requer revisão semântica independente.`
        });
      }
    }
    transformations.push(`${prepared.evidence.length} evidence-objects→INF+REL`);
  }

  prepared = rewriteExactIds(prepared, aliases);

  const hypotheses = Array.isArray(prepared.hypotheses) ? prepared.hypotheses : [];
  const hypothesisIds = hypotheses.map((hypothesis: any) => hypothesis.id);
  const globalDevil = deepCamel(prepared.devils_advocate ?? null);
  prepared.hypotheses = hypotheses.map((hypothesis: any) => ({
    ...hypothesis,
    alternatives: hypothesis.alternatives ?? hypothesisIds.filter((id: string) => id !== hypothesis.id),
    devils_advocate_completed: hypothesis.devils_advocate_completed ?? Boolean(
      globalDevil?.forDirectEmployment?.length && globalDevil?.againstDirectEmployment?.length
    ),
    extensions: {
      ...(hypothesis.extensions ?? {}),
      ...(globalDevil ? { globalDevilsAdvocateRecord: globalDevil } : {})
    }
  }));

  const allGapIds = (prepared.gaps ?? []).map((gap: any) => gap.id);
  const allPropositionIds = (prepared.propositions ?? []).map((proposition: any) => proposition.id);
  prepared.conclusions = (prepared.conclusions ?? []).map((conclusion: any) => {
    const dependencyIds = conclusion.dependency_ids ?? conclusion.dependencyIds ?? [
      ...allPropositionIds,
      ...hypothesisIds,
      ...allGapIds
    ];
    return {
      ...conclusion,
      question_id: questionId,
      scope: conclusion.scope ?? legacyInvestigation.scope,
      dependency_ids: dependencyIds,
      favorable_bases: conclusion.favorable_bases ?? conclusion.favorableBases ?? globalDevil?.forDirectEmployment ?? dependencyIds.filter((id: string) => id.startsWith("PRO-")),
      contrary_bases: conclusion.contrary_bases ?? conclusion.contraryBases ?? globalDevil?.againstDirectEmployment ?? [],
      material_gaps: conclusion.material_gaps ?? conclusion.materialGaps ?? allGapIds,
      reopening_conditions: conclusion.reopening_conditions ?? conclusion.reopeningConditions ??
        (conclusion.reopening_condition ? [conclusion.reopening_condition] : legacyInvestigation.reopeningConditions ?? [])
    };
  });

  for (const document of prepared.documents) {
    const sourceId = document.source_id ?? document.sourceId;
    if (sourceId && !hasRelation(sourceId, document.id)) {
      addRelation({
        from: sourceId,
        to: document.id,
        relation_type: "acquired_from",
        category: "provenance",
        justification: "Relação materializada do campo source_id legado."
      });
    }
  }
  for (const item of prepared.information) {
    const documentId = item.document_id ?? item.documentId;
    if (documentId && !hasRelation(documentId, item.id)) {
      addRelation({
        from: documentId,
        to: item.id,
        relation_type: "extracted_from",
        category: "provenance",
        justification: "Relação materializada do campo document_id legado."
      });
    }
  }
  for (const hypothesis of prepared.hypotheses) {
    addRelation({
      from: questionId,
      to: hypothesis.id,
      relation_type: "generates",
      category: "investigation",
      justification: "Hipótese legada vinculada à questão canônica durante a migração."
    });
    for (const propositionId of hypothesis.supports ?? []) {
      if (!String(propositionId).startsWith("PRO-")) continue;
      addRelation({
        from: propositionId,
        to: hypothesis.id,
        relation_type: "supports_hypothesis",
        category: "epistemic",
        justification: "Relação materializada do campo supports da hipótese legada."
      });
    }
    for (const propositionId of hypothesis.weakens ?? []) {
      if (!String(propositionId).startsWith("PRO-")) continue;
      addRelation({
        from: propositionId,
        to: hypothesis.id,
        relation_type: "weakens_hypothesis",
        category: "epistemic",
        justification: "Relação materializada do campo weakens da hipótese legada."
      });
    }
  }
  for (const conclusion of prepared.conclusions) {
    addRelation({
      from: questionId,
      to: conclusion.id,
      relation_type: "answered_by",
      category: "investigation",
      justification: "Conclusão legada vinculada à questão canônica durante a migração."
    });
    for (const dependencyId of conclusion.dependency_ids ?? []) {
      if (hasRelation(dependencyId, conclusion.id)) continue;
      const category = String(dependencyId).startsWith("GAP-") ? "operational" : "epistemic";
      const relationType = String(dependencyId).startsWith("GAP-") ? "limits" : "depends_on";
      addRelation({
        from: dependencyId,
        to: conclusion.id,
        relation_type: relationType,
        category,
        justification: "Relação materializada do campo dependency_ids da conclusão legada."
      });
    }
  }

  return { prepared, aliases, transformations };
}

export function migrateLegacyState(rawInput: any, options: {
  originalBytes?: string | Uint8Array;
  migratedAt?: string;
  migratorId?: string;
} = {}): { state: any; report: any } {
  const original = clone(rawInput);
  const migratedAt = options.migratedAt ?? utcNow();
  const migratorId = options.migratorId ?? "migrate-legacy-v0-to-v1@0.1.0";
  const initialInvestigation = deepCamel(original.investigation ?? {});
  const investigationId = initialInvestigation.id;
  assertSafeId(investigationId, "INV");
  const suffix = investigationId.slice("INV-".length);
  const legacyQuestionId = initialInvestigation.questionId;
  const questionId = typeof legacyQuestionId === "string" && legacyQuestionId.startsWith("Q-")
    ? legacyQuestionId
    : typeof legacyQuestionId === "string" && legacyQuestionId.startsWith("QUE-")
      ? `Q-${legacyQuestionId.slice("QUE-".length)}`
      : `Q-${suffix}`;
  assertSafeId(questionId, "Q");

  const { prepared: raw, aliases, transformations } = prepareLegacyShape(original, migratedAt, questionId);
  const legacyInvestigation = deepCamel(raw.investigation ?? {});
  const questionText = legacyInvestigation.question || raw.question || "Questão não registrada no estado legado";
  const createdAt = isoDateTime(legacyInvestigation.createdAt, migratedAt);
  const updatedAt = isoDateTime(legacyInvestigation.updatedAt, createdAt);
  const question = {
    id: questionId,
    type: "Q",
    text: questionText,
    createdAt,
    updatedAt,
    validity: "active",
    simulation: Boolean(legacyInvestigation.simulation),
    extensions: legacyQuestionId && legacyQuestionId !== questionId ? { legacyId: legacyQuestionId } : {}
  };

  const reserved = new Set([
    "id", "type", "question", "questionId", "objective", "scope", "limits",
    "status", "createdAt", "updatedAt", "simulation"
  ]);
  const preservedInvestigationFields = Object.fromEntries(
    Object.entries(legacyInvestigation).filter(([key]) => !reserved.has(key))
  );
  const investigationScope = typeof legacyInvestigation.scope === "string"
    ? legacyInvestigation.scope
    : JSON.stringify(legacyInvestigation.scope ?? "Escopo não registrado no estado legado");
  const investigationLimits = Array.isArray(legacyInvestigation.limits)
    ? legacyInvestigation.limits.join("\n")
    : legacyInvestigation.limits || "Limites não registrados no estado legado";
  const investigation = {
    id: investigationId,
    type: "INV",
    questionIds: [questionId],
    objective: legacyInvestigation.objective || "Objetivo não registrado no estado legado",
    scope: investigationScope,
    limits: investigationLimits,
    lifecycleStatus: lifecycle(legacyInvestigation.status, "active"),
    createdAt,
    updatedAt,
    simulation: Boolean(legacyInvestigation.simulation),
    extensions: {
      legacyFields: preservedInvestigationFields,
      ...(Array.isArray(legacyInvestigation.limits) ? { legacyLimitsArray: legacyInvestigation.limits } : {})
    }
  };

  const gapIds = (raw.gaps ?? []).map((gap: any) => gap.id);
  const context = { questionId, investigationScope, gapIds };
  const objects = createEmptyObjects();
  objects.questions.push(question);
  for (const [legacyKey, collection, type] of COLLECTIONS) {
    const items = Array.isArray(raw[legacyKey]) ? raw[legacyKey] : [];
    objects[collection].push(...items.map((item: any) => normalizeObject(item, type, migratedAt, context)));
  }

  const relations = (raw.relations ?? []).map((relation: any) => normalizeRelation(relation, migratedAt));
  if (!relations.some((relation: any) => relation.from === investigationId && relation.to === questionId)) {
    let counter = 1;
    let relationId = `REL-MIG-ROOT-${String(counter).padStart(6, "0")}`;
    const ids = new Set(relations.map((relation: any) => relation.id));
    while (ids.has(relationId)) {
      counter += 1;
      relationId = `REL-MIG-ROOT-${String(counter).padStart(6, "0")}`;
    }
    relations.unshift({
      id: relationId,
      type: "REL",
      from: investigationId,
      to: questionId,
      relationType: "has_question",
      category: "investigation",
      justification: "Relação materializada pelo migrador; a questão existia como atributo legado.",
      createdAt: migratedAt,
      validity: "active"
    });
  }

  const originalHash = options.originalBytes
    ? sha256(options.originalBytes)
    : sha256(canonicalStringify(rawInput));
  const unmappedSections = Object.fromEntries(
    Object.entries(original).filter(([key]) => !RECOGNIZED_TOP_LEVEL.has(key)).map(([key, value]) => [snakeToCamel(key), deepCamel(value)])
  );
  const state = {
    protocolVersion: PROTOCOL_VERSION,
    schemaVersion: STATE_SCHEMA_VERSION,
    investigation,
    objects,
    relations,
    projection: {
      sequence: 0,
      eventHead: null,
      createdAt: investigation.createdAt,
      updatedAt: migratedAt
    },
    history: [],
    legacyHistory: deepCamel(raw.history ?? []),
    extensions: {
      legacyImport: {
        migratorId,
        sourceArcaVersion: original.arca_version ?? null,
        sourceConformanceSpec: original.conformance_spec ?? null,
        originalSha256: originalHash,
        migratedAt,
        legacyConformance: deepCamel(original.conformance ?? null),
        preservedTopLevelKeys: Object.keys(original).sort(),
        idAliases: Object.fromEntries(aliases),
        transformations,
        unmappedSections
      }
    }
  };

  const missingHashes = objects.documents.filter((document: any) => !document.hashSha256).map((document: any) => document.id);
  const unknownAcquisition = objects.documents.filter((document: any) => document.acquisitionOriginalUnknown).map((document: any) => document.id);
  const report = {
    migratorId,
    investigationId,
    questionId,
    originalSha256: originalHash,
    migratedAt,
    counts: Object.fromEntries([
      ...Object.entries(objects).map(([key, value]) => [key, (value as any[]).length]),
      ["relations", relations.length]
    ]),
    idAliases: Object.fromEntries(aliases),
    transformations,
    warnings: [
      ...(questionText.startsWith("Questão não registrada") ? ["Questão ausente no legado; placeholder criado."] : []),
      ...(missingHashes.length ? [`${missingHashes.length} documento(s) sem hash real preservados como não verificados.`] : []),
      ...(unknownAcquisition.length ? [`${unknownAcquisition.length} documento(s) sem instante/método original de aquisição; importação não foi promovida a aquisição real.`] : []),
      ...(Object.keys(unmappedSections).length ? [`${Object.keys(unmappedSections).length} seção(ões) legada(s) preservada(s) em extensions.unmappedSections.`] : [])
    ],
    destructiveChanges: 0
  };
  return { state, report };
}
