import {
  ACS_REQUIREMENTS,
  COLLECTION_TO_TYPE,
  EPISTEMIC_STATES,
  EVIDENCE_EFFECTS,
  EVENT_OPERATIONS,
  GAP_STATES,
  TYPE_TO_PREFIX
} from "./constants.ts";
import { verifyEventChain } from "./events.ts";
import { allObjects, findObject } from "./model.ts";
import { hasDirectedPath, traceGraph } from "./trace.ts";

type RequirementStatus = "PASS" | "PARTIAL" | "FAIL" | "UNSPECIFIED" | "N/A";

const NAMES: Record<string, string> = {
  "S-001": "Investigação definida", "S-002": "IDs tipados e estáveis",
  "S-003": "Fronteiras ontológicas", "S-004": "Evidência como relação",
  "S-005": "Grafo real, não cadeia simulada", "S-006": "Conclusão rastreável à pergunta",
  "S-007": "Sem prova direta Documento→Conclusão", "S-008": "Sem órfãos materiais",
  "S-009": "Cardinalidade preservada", "S-010": "Identidade incerta",
  "E-001": "Informação não vira fato automaticamente", "E-002": "Documento não é verdade",
  "E-003": "Alegação não vira conclusão", "E-004": "Proposição avaliável e atômica",
  "E-005": "Estados epistêmicos controlados", "E-006": "Justificativa da classificação",
  "E-007": "Ausência de evidência ≠ evidência de ausência", "E-008": "Independência evidencial",
  "E-009": "Contradição material e localizada", "E-010": "Causalidade não deriva de temporalidade",
  "E-011": "Severidade proporcional", "E-012": "Invalidação de suporte não equivale a falsidade",
  "E-013": "Enquadramento separado", "E-014": "Conclusão auditável",
  "E-015": "Sem pseudo-precisão", "O-001": "Operações controladas",
  "O-002": "Histórico append-only", "O-003": "Invalidação propagável",
  "O-004": "Reavaliação não destrutiva", "O-005": "Hipótese testável",
  "O-006": "Advogado do Diabo obrigatório", "O-007": "Lacuna formal",
  "O-008": "Fonte estruturalmente inacessível", "O-009": "O Limite",
  "O-010": "Condição de reabertura", "O-011": "Transformações registradas",
  "O-012": "Exportação de estado", "P-001": "Fonte do documento",
  "P-002": "Autoria ≠ custódia", "P-003": "Aquisição registrada",
  "P-004": "Integridade verdadeira", "P-005": "Simulação isolada",
  "P-006": "Transformação derivada", "P-007": "Conteúdo exato",
  "P-008": "Proveniência não pode ser inventada", "L-001": "Acesso legítimo",
  "L-002": "Sem intrusão"
};

function resultTemplate(): Map<string, any> {
  return new Map(ACS_REQUIREMENTS.map(([id, critical]) => [id, {
    id,
    name: NAMES[id],
    status: "UNSPECIFIED" as RequirementStatus,
    critical,
    evidence: "Não avaliado automaticamente.",
    reason: "O método disponível não demonstrou o requisito."
  }]));
}

function profileStatus(requirements: any[], prefix: string): RequirementStatus {
  const selected = requirements.filter((item) => item.id.startsWith(`${prefix}-`));
  if (selected.some((item) => item.critical && item.status === "FAIL")) return "FAIL";
  if (selected.some((item) => item.critical && ["PARTIAL", "UNSPECIFIED"].includes(item.status))) return "PARTIAL";
  return "PASS";
}

function containsPseudoPrecision(value: any, path = ""): string[] {
  if (!value || typeof value !== "object") return [];
  const hits: string[] = [];
  for (const [key, item] of Object.entries(value)) {
    const current = path ? `${path}.${key}` : key;
    if (typeof item === "number" && /(truth|confidence|strength|probability|certeza|força|probabilidade)/i.test(key)) {
      hits.push(current);
    }
    hits.push(...containsPseudoPrecision(item, current));
  }
  return hits;
}

export function validateState(state: any, options: {
  events?: any[];
  portableExport?: boolean;
  implementation?: string;
} = {}): any {
  const evaluated = resultTemplate();
  const errors: string[] = [];
  const warnings: string[] = [];
  const set = (id: string, status: RequirementStatus, evidence: string, reason = ""): void => {
    const item = evaluated.get(id);
    evaluated.set(id, { ...item, status, evidence, reason });
  };

  const investigation = state?.investigation;
  const questions = state?.objects?.questions ?? [];
  const sources = state?.objects?.sources ?? [];
  const documents = state?.objects?.documents ?? [];
  const information = state?.objects?.information ?? [];
  const propositions = state?.objects?.propositions ?? [];
  const entities = state?.objects?.entities ?? [];
  const hypotheses = state?.objects?.hypotheses ?? [];
  const conclusions = state?.objects?.conclusions ?? [];
  const frames = state?.objects?.frames ?? [];
  const gaps = state?.objects?.gaps ?? [];
  const searches = state?.objects?.searches ?? [];
  const relations = state?.relations ?? [];
  const nodes = state ? allObjects(state) : [];

  const invFields = ["id", "objective", "scope", "limits", "lifecycleStatus", "createdAt", "updatedAt"];
  const invMissing = invFields.filter((field) => !investigation?.[field]);
  const questionOk = Array.isArray(investigation?.questionIds) && investigation.questionIds.length > 0 &&
    investigation.questionIds.every((id: string) => questions.some((question: any) => question.id === id && question.text));
  set("S-001", invMissing.length === 0 && questionOk ? "PASS" : "FAIL",
    invMissing.length ? `Campos ausentes: ${invMissing.join(", ")}` : `${investigation?.questionIds?.length ?? 0} questão(ões) explícita(s).`,
    questionOk ? "" : "A investigação precisa apontar para nó Q com texto.");

  const idRows = [...nodes, ...relations];
  const duplicates = idRows.map((item: any) => item?.id).filter((id: string, index: number, all: string[]) => id && all.indexOf(id) !== index);
  const mistyped = idRows.filter((item: any) => {
    if (!item?.id || !item?.type) return true;
    const prefix = TYPE_TO_PREFIX[item.type];
    return !prefix || !item.id.startsWith(`${prefix}-`);
  }).map((item: any) => item?.id ?? "<sem-id>");
  if (duplicates.length) errors.push(`IDs duplicados: ${[...new Set(duplicates)].join(", ")}`);
  if (mistyped.length) errors.push(`IDs incompatíveis com tipo: ${mistyped.join(", ")}`);
  set("S-002", !duplicates.length && !mistyped.length ? "PASS" : "FAIL",
    `${idRows.length} IDs avaliados; ${duplicates.length} duplicações; ${mistyped.length} incompatibilidades.`);

  const collapsed = Object.entries(state?.objects ?? {}).flatMap(([collection, items]: [string, any]) =>
    (items ?? []).filter((item: any) => COLLECTION_TO_TYPE[collection] !== item.type).map((item: any) => item.id)
  );
  set("S-003", collapsed.length ? "FAIL" : "PASS",
    collapsed.length ? `Objetos em coleção incompatível: ${collapsed.join(", ")}` : "Coleções ontológicas permanecem separadas.");

  const evidenceRelations = relations.filter((relation: any) => relation.category === "evidence");
  const invalidEvidence = evidenceRelations.filter((relation: any) =>
    !relation.from?.startsWith("INF-") || !relation.to?.startsWith("PRO-") ||
    !EVIDENCE_EFFECTS.includes(relation.effect ?? relation.relationType) || !relation.justification
  );
  set("S-004", invalidEvidence.length ? "FAIL" : (evidenceRelations.length ? "PASS" : "N/A"),
    invalidEvidence.length ? `Relações probatórias inválidas: ${invalidEvidence.map((item: any) => item.id).join(", ")}` : `${evidenceRelations.length} relação(ões) de evidência válida(s).`);

  const missingEndpoints = relations.filter((relation: any) => !findObject(state, relation.from) || !findObject(state, relation.to));
  if (missingEndpoints.length) errors.push(`Relações com ponta ausente: ${missingEndpoints.map((item: any) => item.id).join(", ")}`);
  let traceFailure = false;
  for (const conclusion of conclusions) {
    try {
      const trace = traceGraph(state, conclusion.id);
      if (trace.truncated) warnings.push(`TRACE truncado para ${conclusion.id}`);
      if (trace.cycles.length) warnings.push(`Ciclos detectados no TRACE de ${conclusion.id}`);
    } catch {
      traceFailure = true;
    }
  }
  set("S-005", missingEndpoints.length || traceFailure ? "FAIL" : "PASS",
    `${relations.length} arestas; ${missingEndpoints.length} com ponta ausente; TRACE enumerativo executado.`);

  const untracedConclusions = conclusions.filter((conclusion: any) =>
    !conclusion.questionId || !findObject(state, conclusion.questionId) || !hasDirectedPath(state, conclusion.questionId, conclusion.id)
  );
  set("S-006", untracedConclusions.length ? "FAIL" : (conclusions.length ? "PASS" : "N/A"),
    untracedConclusions.length ? `Conclusões sem caminho desde Q: ${untracedConclusions.map((item: any) => item.id).join(", ")}` : `${conclusions.length} conclusão(ões) ligada(s) à questão.`);

  const directDocConclusion = relations.filter((relation: any) => relation.from?.startsWith("DOC-") && relation.to?.startsWith("CON-") && ["evidence", "epistemic"].includes(relation.category));
  set("S-007", directDocConclusion.length ? "FAIL" : "PASS",
    directDocConclusion.length ? `Arestas proibidas: ${directDocConclusion.map((item: any) => item.id).join(", ")}` : "Nenhuma prova epistêmica direta DOC→CON.");

  const connected = new Set(relations.flatMap((relation: any) => [relation.from, relation.to]));
  const materialTypes = new Set(["INF", "PRO", "HIP", "CON"]);
  const orphans = nodes.filter((node: any) => materialTypes.has(node.type) && !connected.has(node.id));
  set("S-008", orphans.length ? "PARTIAL" : "PASS",
    orphans.length ? `Nós materiais órfãos: ${orphans.map((item: any) => item.id).join(", ")}` : "Nenhum nó material órfão.");

  const cardinalityLost = conclusions.filter((conclusion: any) => {
    const incoming = relations.filter((relation: any) => relation.to === conclusion.id && relation.validity !== "invalidated");
    const declared = conclusion.dependencyIds ?? [];
    return declared.length > 1 && incoming.length < 2;
  });
  set("S-009", cardinalityLost.length ? "FAIL" : "PASS",
    cardinalityLost.length ? `Cardinalidade não materializada: ${cardinalityLost.map((item: any) => item.id).join(", ")}` : "Arestas são armazenadas como coleção, sem predecessor único.");

  const uncertainEntities = entities.filter((entity: any) => /incert|poss|unknown|não.verific/i.test(JSON.stringify(entity)));
  const uncertainWithoutMarker = uncertainEntities.filter((entity: any) => !entity.identityConfidence && !relations.some((relation: any) => relation.from === entity.id && relation.relationType === "possibly_same_entity"));
  set("S-010", !entities.length ? "N/A" : (uncertainWithoutMarker.length ? "PARTIAL" : "PASS"),
    uncertainWithoutMarker.length ? `Identidades incertas sem marcador suficiente: ${uncertainWithoutMarker.map((item: any) => item.id).join(", ")}` : "Incerteza de identidade possui representação quando aplicável.");

  const informationPromoted = information.filter((item: any) => item.fact === true || item.isFact === true);
  set("E-001", informationPromoted.length ? "FAIL" : "PASS",
    informationPromoted.length ? `Informações promovidas automaticamente: ${informationPromoted.map((item: any) => item.id).join(", ")}` : "Nenhum INF possui marcador automático de fato.");
  const documentsAsTruth = documents.filter((item: any) => item.truth === true || item.epistemicStatus === "Confirmado");
  set("E-002", documentsAsTruth.length ? "FAIL" : "PASS",
    documentsAsTruth.length ? `Documentos tratados como verdade: ${documentsAsTruth.map((item: any) => item.id).join(", ")}` : "Documentos permanecem registros de proveniência.");
  const allegationCollapses = information.filter((item: any) => item.type === "CON" || item.conclusion === true);
  set("E-003", allegationCollapses.length ? "FAIL" : "PASS", "Alegações, informações e conclusões usam tipos separados.");
  set("E-004", propositions.length ? "UNSPECIFIED" : "N/A",
    propositions.length ? "Atomicidade requer revisão semântica do enunciado." : "Não há proposições.",
    "A presença de um campo de texto não demonstra atomicidade.");

  const badEpistemic = propositions.filter((item: any) => !EPISTEMIC_STATES.includes(item.epistemicStatus));
  set("E-005", badEpistemic.length ? "FAIL" : (propositions.length ? "PASS" : "N/A"),
    badEpistemic.length ? `Estados fora do vocabulário: ${badEpistemic.map((item: any) => item.id).join(", ")}` : "Estados qualitativos controlados.");
  const unjustified = propositions.filter((item: any) => {
    if (item.epistemicStatus === "Desconhecido" || item.classificationJustification) return false;
    return !evidenceRelations.some((relation: any) => relation.to === item.id && relation.justification && relation.validity !== "invalidated");
  });
  set("E-006", unjustified.length ? "FAIL" : (propositions.length ? "PASS" : "N/A"),
    unjustified.length ? `Classificações sem justificativa: ${unjustified.map((item: any) => item.id).join(", ")}` : "Classificações materiais possuem justificativa.");
  const negativeWithoutRule = searches.filter((item: any) => /nenhum|não localiz|not found|zero result/i.test(String(item.result ?? "")) && !item.negativeSearchRule);
  set("E-007", negativeWithoutRule.length ? "FAIL" : (searches.length ? "PASS" : "N/A"),
    negativeWithoutRule.length ? `Buscas negativas sem regra: ${negativeWithoutRule.map((item: any) => item.id).join(", ")}` : "Buscas negativas preservam limitação quando detectadas.");
  const sourcesWithoutGroup = sources.filter((item: any) => item.simulation !== true && !item.independenceGroup);
  set("E-008", sourcesWithoutGroup.length ? "PARTIAL" : (sources.length ? "PASS" : "N/A"),
    sourcesWithoutGroup.length ? `Fontes reais sem independenceGroup: ${sourcesWithoutGroup.map((item: any) => item.id).join(", ")}` : "Grupos de independência registrados.");
  const vagueContradictions = evidenceRelations.filter((item: any) => (item.effect ?? item.relationType) === "contradicts" && (!item.justification || !item.materiality));
  set("E-009", vagueContradictions.length ? "PARTIAL" : (evidenceRelations.some((item: any) => (item.effect ?? item.relationType) === "contradicts") ? "PASS" : "N/A"),
    vagueContradictions.length ? `Contradições sem localização/materialidade completa: ${vagueContradictions.map((item: any) => item.id).join(", ")}` : "Contradições estruturadas ou não aplicáveis.");
  set("E-010", "UNSPECIFIED", "Causalidade exige auditoria semântica; o Core não a infere.");
  set("E-011", conclusions.length ? "UNSPECIFIED" : "N/A", "Proporcionalidade exige auditoria semântica humana/independente.");
  const invalidationContradictions = [...propositions, ...hypotheses, ...conclusions].filter((item: any) => item.reevaluationReason && item.epistemicStatus === "Contradito");
  set("E-012", invalidationContradictions.length ? "FAIL" : "PASS",
    invalidationContradictions.length ? `Contradição automática após invalidação: ${invalidationContradictions.map((item: any) => item.id).join(", ")}` : "Invalidação não produz Contradito automaticamente.");
  const frameCollapsed = frames.filter((frame: any) => frame.type !== "FRM");
  set("E-013", frameCollapsed.length ? "FAIL" : (frames.length ? "PASS" : "N/A"), "Enquadramentos ocupam coleção FRM separada.");
  const incompleteConclusions = conclusions.filter((item: any) =>
    !item.scope || !Array.isArray(item.limitations) || !Array.isArray(item.favorableBases) ||
    !Array.isArray(item.contraryBases) || !Array.isArray(item.materialGaps) || !Array.isArray(item.reopeningConditions)
  );
  set("E-014", incompleteConclusions.length ? "FAIL" : (conclusions.length ? "PASS" : "N/A"),
    incompleteConclusions.length ? `Conclusões incompletas: ${incompleteConclusions.map((item: any) => item.id).join(", ")}` : "Conclusões expõem bases, lacunas, limites, escopo e reabertura.");
  const precisionHits = containsPseudoPrecision({ investigation, objects: state?.objects, relations });
  set("E-015", precisionHits.length ? "PARTIAL" : "PASS",
    precisionHits.length ? `Métricas numéricas exigem calibração: ${precisionHits.slice(0, 10).join(", ")}` : "Nenhuma pseudo-probabilidade detectada.");

  const historyOperations = (state?.history ?? []).map((item: any) => item.operation);
  const unknownOperations = historyOperations.filter((operation: string) => !EVENT_OPERATIONS.includes(operation));
  set("O-001", unknownOperations.length ? "FAIL" : "PASS", `${historyOperations.length} operações explícitas registradas.`);
  if (options.events) {
    try {
      const chain = verifyEventChain(options.events, investigation.id);
      set("O-002", "PASS", `${chain.count} evento(s) append-only; head ${chain.head?.slice(0, 12) ?? "n/a"}…`);
    } catch (error: any) {
      set("O-002", "FAIL", error.message);
      errors.push(error.message);
    }
  } else {
    set("O-002", "UNSPECIFIED", "Event log não fornecido ao validador.");
  }
  const invalidated = [...nodes, ...relations].filter((item: any) => item.validity === "invalidated");
  const unmarkedDependents = invalidated.flatMap((item: any) => {
    const outgoing = relations.filter((relation: any) => relation.from === item.id && relation.validity !== "invalidated");
    return outgoing.map((relation: any) => findObject(state, relation.to)).filter((dependent: any) => dependent && dependent.validity === "active" && !dependent.needsReevaluation && !dependent.lastReevaluatedAt);
  });
  set("O-003", unmarkedDependents.length ? "FAIL" : (invalidated.length ? "PASS" : "N/A"),
    unmarkedDependents.length ? `Dependentes sem propagação: ${unmarkedDependents.map((item: any) => item.id).join(", ")}` : "Invalidações propagadas ou não aplicáveis.");
  set("O-004", invalidationContradictions.length ? "FAIL" : (invalidated.length ? "PASS" : "N/A"),
    invalidated.length ? "Reavaliação preserva história e não converte ausência de suporte em falsidade." : "Nenhuma invalidação nesta projeção.");
  const untestableHypotheses = hypotheses.filter((item: any) => !(item.tests?.length) && !item.untestableReason);
  set("O-005", untestableHypotheses.length ? "PARTIAL" : (hypotheses.length ? "PASS" : "N/A"),
    untestableHypotheses.length ? `Hipóteses sem teste: ${untestableHypotheses.map((item: any) => item.id).join(", ")}` : "Hipóteses possuem testes ou justificativa.");
  const closed = conclusions.filter((item: any) => item.lifecycleStatus === "closed");
  const relevantHypothesisIds = new Set(closed.flatMap((item: any) => item.dependencyIds ?? []).filter((id: string) => id.startsWith("HIP-")));
  const devilMissing = hypotheses.filter((item: any) => (relevantHypothesisIds.has(item.id) || ["Provável", "Confirmado"].includes(item.epistemicStatus)) && (!item.devilsAdvocateCompleted || !(item.alternatives?.length)));
  set("O-006", devilMissing.length ? "FAIL" : (relevantHypothesisIds.size || hypotheses.length ? (hypotheses.every((item: any) => item.devilsAdvocateCompleted && item.alternatives?.length) ? "PASS" : "PARTIAL") : "N/A"),
    devilMissing.length ? `Advogado do Diabo ausente: ${devilMissing.map((item: any) => item.id).join(", ")}` : "Gate preservado; hipóteses parciais permanecem explicitadas.");
  const invalidGaps = gaps.filter((item: any) => !GAP_STATES.includes(item.gapState));
  set("O-007", invalidGaps.length ? "FAIL" : (gaps.length ? "PASS" : "N/A"),
    invalidGaps.length ? `Lacunas fora de L0–L6: ${invalidGaps.map((item: any) => item.id).join(", ")}` : "L0–L6 usados como estados operacionais.");
  const inaccessible = gaps.filter((item: any) => item.gapState === "L3");
  set("O-008", inaccessible.length ? "PASS" : "N/A", `${inaccessible.length} lacuna(s) estruturalmente inacessível(is).`);
  const limitViolations = closed.filter((item: any) => {
    const referenced = new Set(item.materialGaps ?? []);
    const material = gaps.filter((gap: any) => referenced.has(gap.id) && gap.likelyToChangeResult === true && gap.validity === "active");
    return material.length && !item.limitJustification;
  });
  set("O-009", limitViolations.length ? "FAIL" : (closed.length ? "PASS" : "N/A"),
    limitViolations.length ? `Fechamento apesar de lacuna material sem justificativa: ${limitViolations.map((item: any) => item.id).join(", ")}` : "O Limite respeitado nas conclusões fechadas.");
  const noReopening = closed.filter((item: any) => !(item.reopeningConditions?.length) && !item.noKnownReopeningConditionJustification);
  set("O-010", noReopening.length ? "FAIL" : (closed.length ? "PASS" : "N/A"),
    noReopening.length ? `Conclusões fechadas sem reabertura: ${noReopening.map((item: any) => item.id).join(", ")}` : "Condições de reabertura registradas.");
  const transformed = information.filter((item: any) => item.transformation || item.transformationDegree || item.extractionMethod);
  const transformedIncomplete = transformed.filter((item: any) => !item.documentId || !(item.transformation || item.extractionMethod));
  set("O-011", transformedIncomplete.length ? "PARTIAL" : (transformed.length ? "PASS" : "N/A"),
    transformedIncomplete.length ? `Transformações incompletas: ${transformedIncomplete.map((item: any) => item.id).join(", ")}` : "Transformações apontam para documento e método.");
  set("O-012", options.portableExport ? "PASS" : "UNSPECIFIED",
    options.portableExport ? "Implementação fornece exportação com estado, eventos, validação e hash." : "Exportação não demonstrada nesta chamada.");

  const unknownSources = new Set(sources.filter((source: any) => source.originUnknown === true).map((source: any) => source.id));
  const documentsWithoutSource = documents.filter((item: any) => !item.sourceId || (!findObject(state, item.sourceId) && !unknownSources.has(item.sourceId)));
  set("P-001", documentsWithoutSource.length ? "FAIL" : (documents.length ? "PASS" : "N/A"),
    documentsWithoutSource.length ? `Documentos sem fonte: ${documentsWithoutSource.map((item: any) => item.id).join(", ")}` : "Documentos apontam para fonte conhecida/explicitamente desconhecida.");
  const custodyIncomplete = documents.filter((item: any) => item.author && !Object.hasOwn(item, "custodian"));
  set("P-002", custodyIncomplete.length ? "PARTIAL" : (documents.length ? "PASS" : "N/A"),
    custodyIncomplete.length ? "Autoria existe sem campo de custódia separável em parte do acervo." : "Modelo permite autoria e custódia separadas.");
  const acquisitionIncomplete = documents.filter((item: any) => !item.acquiredAt || !item.acquisitionMethod || (!item.url && !item.localPath && !item.location && !item.simulation));
  set("P-003", acquisitionIncomplete.length ? "FAIL" : (documents.length ? "PASS" : "N/A"),
    acquisitionIncomplete.length ? `Aquisição incompleta: ${acquisitionIncomplete.map((item: any) => item.id).join(", ")}` : "Aquisição registra instante, método e local.");
  const fakeHashes = documents.filter((item: any) => item.hashSha256 && !/^[a-f0-9]{64}$/.test(item.hashSha256) || item.hashStatus === "computed" && !item.hashSha256);
  set("P-004", fakeHashes.length ? "FAIL" : (documents.length ? "PASS" : "N/A"),
    fakeHashes.length ? `Integridade inconsistente: ${fakeHashes.map((item: any) => item.id).join(", ")}` : "Hashes ausentes permanecem not_computed; valores declarados têm formato real.");
  const simulatedIds = new Set(nodes.filter((item: any) => item.simulation === true).map((item: any) => item.id));
  const mixedSimulation = evidenceRelations.filter((item: any) => simulatedIds.has(item.from) && !state.investigation.simulation && item.eligibleAsRealEvidence !== false);
  set("P-005", mixedSimulation.length ? "FAIL" : "PASS",
    mixedSimulation.length ? `Simulação elegível como prova real: ${mixedSimulation.map((item: any) => item.id).join(", ")}` : "Conteúdo simulado permanece marcado e isolado.");
  const derivedIncomplete = transformed.filter((item: any) => item.derivedFrom && !item.transformation && !item.extractionMethod);
  set("P-006", derivedIncomplete.length ? "FAIL" : (transformed.length ? "PASS" : "N/A"),
    derivedIncomplete.length ? `Derivações sem método: ${derivedIncomplete.map((item: any) => item.id).join(", ")}` : "Derivações registram original/método quando aplicáveis.");
  const withoutLocator = information.filter((item: any) => !item.locator);
  set("P-007", withoutLocator.length ? "PARTIAL" : (information.length ? "PASS" : "N/A"),
    withoutLocator.length ? `Informações sem localização exata: ${withoutLocator.map((item: any) => item.id).join(", ")}` : "Informações possuem localização.");
  set("P-008", documents.some((item: any) => item.simulation !== true) ? "UNSPECIFIED" : "N/A",
    "A estrutura não consegue provar sozinha que uma aquisição declarada realmente ocorreu; requer auditoria externa.");
  set("L-001", state?.investigation?.simulation ? "N/A" : "UNSPECIFIED",
    state?.investigation?.simulation ? "Investigação inteiramente simulada." : "Legitimidade do acesso requer revisão do caso e das autorizações.");
  set("L-002", state?.investigation?.simulation ? "N/A" : "UNSPECIFIED",
    state?.investigation?.simulation ? "Investigação inteiramente simulada." : "Ausência de intrusão requer auditoria do processo de aquisição.");

  const requirements = ACS_REQUIREMENTS.map(([id]) => evaluated.get(id));
  const profiles: Record<string, RequirementStatus> = {
    "ACS-S": profileStatus(requirements, "S"),
    "ACS-E": profileStatus(requirements, "E"),
    "ACS-O": profileStatus(requirements, "O"),
    "ACS-P": profileStatus(requirements, "P")
  };
  const criticalCore = requirements.filter((item) => item.critical && !item.id.startsWith("L-"));
  const eligibleForSeal = criticalCore.every((item) => ["PASS", "N/A"].includes(item.status)) &&
    !requirements.some((item) => item.status === "FAIL");
  profiles["ACS-FULL"] = eligibleForSeal ? "PASS" : "FAIL";

  return {
    conformanceSpec: "ACS-v0.1",
    implementation: options.implementation ?? "@arca/core@0.1.0",
    testedAt: new Date().toISOString(),
    investigationId: investigation?.id ?? null,
    profiles,
    eligibleForSeal,
    declaration: eligibleForSeal ? "ARCA-Compatible candidate" : "partially conformant to ACS-v0.1",
    summary: Object.fromEntries(["PASS", "PARTIAL", "FAIL", "UNSPECIFIED", "N/A"].map((status) => [
      status,
      requirements.filter((item) => item.status === status).length
    ])),
    requirements,
    blockers: requirements.filter((item) => item.critical && !["PASS", "N/A"].includes(item.status)).map((item) => item.id),
    errors,
    warnings
  };
}
