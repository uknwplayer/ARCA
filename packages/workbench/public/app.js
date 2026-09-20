const TYPE_LABELS = {
  INV: "Investigação", Q: "Questão", SRC: "Fonte", DOC: "Documento", INF: "Informação",
  PRO: "Proposição", ENT: "Entidade", EVT: "Evento", HIP: "Hipótese", CON: "Conclusão",
  FRM: "Enquadramento", GAP: "Lacuna", SEARCH: "Busca", REL: "Relação"
};

const COLLECTION_ORDER = [
  "questions", "sources", "documents", "information", "propositions", "entities",
  "events", "hypotheses", "conclusions", "frames", "gaps", "searches"
];

const TYPE_ORDER = ["Q", "SRC", "DOC", "INF", "PRO", "ENT", "EVT", "HIP", "CON", "FRM", "GAP", "SEARCH"];

const EPISTEMIC_STATES = ["Confirmado", "Provável", "Possível", "Não verificado", "Contradito", "Desconhecido"];

const OBJECT_DEFINITIONS = {
  Q: {
    label: "Questão",
    hint: "Uma pergunta verificável que orienta a investigação.",
    fields: [{ name: "text", label: "Questão verificável", kind: "textarea", required: true, wide: true }]
  },
  SRC: {
    label: "Fonte",
    hint: "Origem responsável por um documento ou informação.",
    fields: [
      { name: "name", label: "Nome da fonte", kind: "text", required: true },
      { name: "sourceKind", label: "Natureza", kind: "text", placeholder: "institucional, pessoa, base de dados" },
      { name: "location", label: "Localização pública ou interna", kind: "text", wide: true },
      { name: "independenceGroup", label: "Grupo de independência", kind: "text", placeholder: "Origem editorial ou operacional comum" }
    ]
  },
  DOC: {
    label: "Documento",
    hint: "Unidade adquirida de uma fonte; documento não é verdade.",
    fields: [
      { name: "title", label: "Título", kind: "text", required: true, wide: true },
      { name: "sourceId", label: "Fonte de origem", kind: "object-select", types: ["SRC"], required: true },
      { name: "location", label: "Localização", kind: "text", placeholder: "URL, caminho ou referência" },
      { name: "acquisitionMethod", label: "Método de aquisição", kind: "text", placeholder: "download, captura, consulta local" },
      { name: "hashStatus", label: "Estado do hash", kind: "select", options: ["not_computed", "computed", "verified", "simulated"] }
    ]
  },
  INF: {
    label: "Informação",
    hint: "Trecho ou dado extraído de um documento com localizador.",
    fields: [
      { name: "documentId", label: "Documento de origem", kind: "object-select", types: ["DOC"], required: true },
      { name: "locator", label: "Localizador", kind: "text", placeholder: "página, parágrafo, célula ou timestamp" },
      { name: "content", label: "Conteúdo extraído", kind: "textarea", required: true, wide: true },
      { name: "extractionMethod", label: "Método de extração", kind: "text", placeholder: "manual, OCR revisado, parser" },
      { name: "verbatim", label: "Transcrição literal", kind: "checkbox", wide: true }
    ]
  },
  PRO: {
    label: "Proposição",
    hint: "Enunciado verificável sobre o qual informações podem exercer efeito probatório.",
    fields: [
      { name: "text", label: "Proposição", kind: "textarea", required: true, wide: true },
      { name: "epistemicStatus", label: "Estado epistêmico", kind: "select", options: EPISTEMIC_STATES, required: true },
      { name: "classificationJustification", label: "Justificativa da classificação", kind: "textarea", wide: true }
    ]
  },
  ENT: {
    label: "Entidade",
    hint: "Pessoa, organização, local ou outro referente identificado.",
    fields: [
      { name: "name", label: "Nome", kind: "text", required: true },
      { name: "entityKind", label: "Tipo de entidade", kind: "text", placeholder: "pessoa, organização, local" },
      { name: "identifiers", label: "Identificadores — um por linha", kind: "array", wide: true }
    ]
  },
  EVT: {
    label: "Evento",
    hint: "Ocorrência temporal representada no grafo.",
    fields: [
      { name: "title", label: "Título do evento", kind: "text", required: true },
      { name: "occurredAt", label: "Data ou instante", kind: "datetime" },
      { name: "description", label: "Descrição", kind: "textarea", wide: true }
    ]
  },
  HIP: {
    label: "Hipótese",
    hint: "Explicação testável, acompanhada de alternativas rivais.",
    fields: [
      { name: "statement", label: "Enunciado da hipótese", kind: "textarea", required: true, wide: true },
      { name: "tests", label: "Testes discriminantes — um por linha", kind: "array" },
      { name: "alternatives", label: "Hipóteses alternativas — uma por linha", kind: "array" },
      { name: "devilsAdvocateCompleted", label: "Advogado do Diabo concluído", kind: "checkbox", wide: true }
    ]
  },
  CON: {
    label: "Conclusão",
    hint: "Resposta limitada, auditável e reaberta por condições objetivas.",
    fields: [
      { name: "statement", label: "Enunciado da conclusão", kind: "textarea", required: true, wide: true },
      { name: "questionId", label: "Questão respondida", kind: "object-select", types: ["Q"], required: true },
      { name: "epistemicStatus", label: "Estado epistêmico", kind: "select", options: EPISTEMIC_STATES, required: true },
      { name: "scope", label: "Escopo da resposta", kind: "textarea", required: true, wide: true },
      { name: "favorableBases", label: "Bases favoráveis", kind: "object-multi", types: ["PRO", "HIP", "INF"] },
      { name: "contraryBases", label: "Bases contrárias", kind: "object-multi", types: ["PRO", "HIP", "INF"] },
      { name: "materialGaps", label: "Lacunas materiais", kind: "object-multi", types: ["GAP"] },
      { name: "dependencyIds", label: "Dependências declaradas", kind: "object-multi", types: ["PRO", "HIP", "GAP", "INF"] },
      { name: "limitations", label: "Limitações — uma por linha", kind: "array" },
      { name: "reopeningConditions", label: "Condições de reabertura — uma por linha", kind: "array" }
    ]
  },
  FRM: {
    label: "Enquadramento",
    hint: "Recorte interpretativo explicitamente declarado.",
    fields: [
      { name: "name", label: "Nome do enquadramento", kind: "text", required: true },
      { name: "description", label: "Descrição e limites", kind: "textarea", wide: true }
    ]
  },
  GAP: {
    label: "Lacuna",
    hint: "Ausência de informação tratada como problema operacional, não como prova.",
    fields: [
      { name: "description", label: "Descrição da lacuna", kind: "textarea", required: true, wide: true },
      { name: "gapState", label: "Estado operacional", kind: "select", options: ["L0", "L1", "L2", "L3", "L4", "L5", "L6"], required: true },
      { name: "materiality", label: "Materialidade", kind: "select", options: ["low", "medium", "high", "critical"] },
      { name: "likelyToChangeResult", label: "Pode alterar o resultado?", kind: "tristate" },
      { name: "nextAction", label: "Próxima ação", kind: "textarea", wide: true }
    ]
  },
  SEARCH: {
    label: "Busca",
    hint: "Consulta executada ou planejada, sem converter ausência de resultado em inexistência.",
    fields: [
      { name: "query", label: "Consulta", kind: "textarea", required: true, wide: true },
      { name: "status", label: "Estado", kind: "select", options: ["planned", "running", "completed", "blocked"] },
      { name: "searchedAt", label: "Data da busca", kind: "datetime" },
      { name: "limitations", label: "Limitações — uma por linha", kind: "array", wide: true }
    ]
  }
};

const state = {
  session: null,
  investigations: [],
  investigationId: null,
  investigation: null,
  status: null,
  validation: null,
  events: [],
  proposals: [],
  view: "overview",
  objectFilter: "ALL",
  objectSearch: "",
  selectedProposalId: null,
  trace: null,
  traceTarget: null,
  traceDirection: "ancestors",
  action: null
};

const elements = {
  viewRoot: document.querySelector("#view-root"),
  emptyState: document.querySelector("#empty-state"),
  investigationSelect: document.querySelector("#investigation-select"),
  exportButton: document.querySelector("#export-button"),
  syncStatus: document.querySelector("#sync-status"),
  proposalCount: document.querySelector("#proposal-count"),
  sidebar: document.querySelector(".sidebar"),
  sidebarScrim: document.querySelector("#sidebar-scrim"),
  investigationDialog: document.querySelector("#investigation-dialog"),
  investigationForm: document.querySelector("#investigation-form"),
  objectDialog: document.querySelector("#object-dialog"),
  objectForm: document.querySelector("#object-form"),
  objectFields: document.querySelector("#object-fields"),
  objectType: document.querySelector("#object-type"),
  relationDialog: document.querySelector("#relation-dialog"),
  relationForm: document.querySelector("#relation-form"),
  actionDialog: document.querySelector("#action-dialog"),
  actionForm: document.querySelector("#action-form"),
  actionBody: document.querySelector("#action-body"),
  proposalDialog: document.querySelector("#proposal-dialog"),
  proposalForm: document.querySelector("#proposal-form"),
  toastRegion: document.querySelector("#toast-region")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncate(value, length = 120) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function toast(message, kind = "success") {
  const node = document.createElement("div");
  node.className = `toast${kind === "error" ? " is-error" : ""}`;
  node.textContent = message;
  elements.toastRegion.append(node);
  window.setTimeout(() => node.remove(), 4300);
}

async function api(path, options = {}) {
  const method = options.method ?? "GET";
  const headers = { Accept: "application/json", ...(options.headers ?? {}) };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  if (!["GET", "HEAD"].includes(method) && state.session?.csrfToken) headers["X-ARCA-CSRF"] = state.session.csrfToken;
  const response = await fetch(path, { ...options, method, headers });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(payload?.error?.message ?? `Falha HTTP ${response.status}`);
  return payload;
}

function allNodes() {
  if (!state.investigation) return [];
  return [state.investigation.investigation, ...COLLECTION_ORDER.flatMap((key) => state.investigation.objects[key] ?? [])];
}

function artifactNodes() {
  if (!state.investigation) return [];
  return COLLECTION_ORDER.flatMap((key) => state.investigation.objects[key] ?? []);
}

function findNode(id) {
  if (!id || !state.investigation) return null;
  if (state.investigation.investigation.id === id) return state.investigation.investigation;
  return artifactNodes().find((item) => item.id === id) ?? state.investigation.relations.find((item) => item.id === id) ?? null;
}

function objectTitle(object) {
  if (!object) return "Objeto desconhecido";
  return object.text ?? object.name ?? object.title ?? object.content ?? object.statement ?? object.description ?? object.query ?? object.objective ?? object.relationType ?? object.id;
}

function objectSubtitle(object) {
  if (!object) return "";
  if (object.type === "DOC") return object.location ?? `Fonte ${object.sourceId}`;
  if (object.type === "INF") return object.locator ?? `Documento ${object.documentId}`;
  if (object.type === "GAP") return `${object.gapState ?? "L0"} · materialidade ${object.materiality ?? "não informada"}`;
  if (object.type === "CON") return `${object.epistemicStatus ?? "Desconhecido"} · ${object.lifecycleStatus ?? "draft"}`;
  if (object.epistemicStatus) return object.epistemicStatus;
  return object.validity ?? "active";
}

function badgeFor(value) {
  const text = String(value ?? "—");
  const normalized = text.toLowerCase();
  let color = "";
  if (["pass", "current", "active", "applied", "confirmado", "closed"].some((item) => normalized.includes(item))) color = " badge-green";
  else if (["fail", "invalid", "rejected", "contradito", "critical"].some((item) => normalized.includes(item))) color = " badge-red";
  else if (["pending", "stale", "warn", "possível", "provável", "reopened"].some((item) => normalized.includes(item))) color = " badge-amber";
  else if (["não verificado", "unknown", "unspecified", "desconhecido"].some((item) => normalized.includes(item))) color = " badge-blue";
  return `<span class="badge${color}">${escapeHtml(text)}</span>`;
}

function setBusy(busy) {
  elements.syncStatus.innerHTML = `<span class="status-dot${busy ? " is-warn" : ""}"></span>${busy ? "Atualizando" : "Íntegro"}`;
}

function renderInvestigationSelect() {
  const previous = state.investigationId;
  elements.investigationSelect.innerHTML = `<option value="">Nenhuma investigação</option>${state.investigations.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} · ${escapeHtml(truncate(item.question, 74))}</option>`).join("")}`;
  elements.investigationSelect.value = previous ?? "";
}

function updateShell() {
  const hasInvestigation = Boolean(state.investigation);
  elements.emptyState.classList.toggle("is-hidden", hasInvestigation);
  elements.viewRoot.classList.toggle("is-hidden", !hasInvestigation);
  elements.exportButton.disabled = !hasInvestigation;
  const pending = state.proposals.filter((item) => item.status === "pending").length;
  elements.proposalCount.textContent = String(pending);
  elements.proposalCount.classList.toggle("is-hidden", pending === 0);
}

async function loadInvestigation(id, { preserveView = true } = {}) {
  if (!id) {
    state.investigationId = null;
    state.investigation = null;
    state.status = null;
    state.validation = null;
    state.events = [];
    state.proposals = [];
    state.trace = null;
    updateShell();
    return;
  }
  setBusy(true);
  state.investigationId = id;
  localStorage.setItem("arca.lastInvestigation", id);
  elements.viewRoot.innerHTML = `<div class="loading"><div><div class="spinner"></div></div></div>`;
  elements.viewRoot.classList.remove("is-hidden");
  elements.emptyState.classList.add("is-hidden");
  try {
    const [investigation, status, validation, eventPayload, proposalPayload] = await Promise.all([
      api(`/api/investigations/${encodeURIComponent(id)}`),
      api(`/api/investigations/${encodeURIComponent(id)}/status`),
      api(`/api/investigations/${encodeURIComponent(id)}/validate`),
      api(`/api/investigations/${encodeURIComponent(id)}/events`),
      api(`/api/agent/proposals?investigationId=${encodeURIComponent(id)}`)
    ]);
    state.investigation = investigation;
    state.status = status;
    state.validation = validation;
    state.events = eventPayload.events;
    state.proposals = proposalPayload.proposals;
    if (!preserveView) state.view = "overview";
    if (state.selectedProposalId && !state.proposals.some((item) => item.proposalId === state.selectedProposalId)) state.selectedProposalId = null;
    renderInvestigationSelect();
    updateShell();
    render();
  } finally {
    setBusy(false);
  }
}

async function refreshList(selectId) {
  const payload = await api("/api/investigations");
  state.investigations = payload.investigations;
  const remembered = selectId ?? state.investigationId ?? localStorage.getItem("arca.lastInvestigation");
  const next = state.investigations.some((item) => item.id === remembered) ? remembered : state.investigations[0]?.id ?? null;
  state.investigationId = next;
  renderInvestigationSelect();
  await loadInvestigation(next);
}

function render() {
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === state.view));
  if (!state.investigation) return updateShell();
  const renderers = {
    overview: renderOverview,
    graph: renderGraph,
    objects: renderObjects,
    trace: renderTrace,
    validation: renderValidation,
    proposals: renderProposals,
    history: renderHistory
  };
  (renderers[state.view] ?? renderOverview)();
  document.querySelector("#main-content")?.focus({ preventScroll: true });
}

function renderOverview() {
  const investigation = state.investigation.investigation;
  const question = state.investigation.objects.questions.find((item) => investigation.questionIds.includes(item.id));
  const counts = state.status.counts;
  const chains = [
    ["SRC", "Fontes", state.investigation.objects.sources.length],
    ["DOC", "Documentos", state.investigation.objects.documents.length],
    ["INF", "Informações", state.investigation.objects.information.length],
    ["PRO", "Proposições", state.investigation.objects.propositions.length],
    ["CON", "Conclusões", state.investigation.objects.conclusions.length]
  ];
  const unresolvedGaps = state.investigation.objects.gaps.filter((item) => item.validity === "active").length;
  const pending = counts.pendingReevaluation;
  elements.viewRoot.innerHTML = `
    <section class="hero-grid">
      <article class="panel question-panel">
        <div><p class="eyebrow">${escapeHtml(investigation.id)} · questão central</p><h1>${escapeHtml(question?.text ?? "Questão não localizada")}</h1></div>
        <div class="question-meta">${badgeFor(investigation.lifecycleStatus)}${investigation.simulation ? badgeFor("simulação") : badgeFor("registro factual")}</div>
      </article>
      <article class="panel integrity-panel">
        <div><p class="eyebrow">Integridade estrutural</p><div class="integrity-score is-integral"><span>OK</span></div><h3>Cadeia de eventos verificada</h3><p>${state.events.length} eventos reproduzem a projeção atual. Conformidade e verdade factual são avaliações separadas.</p></div>
        <div class="hash-line"><span>eventHead</span><code title="${escapeHtml(state.investigation.projection.eventHead)}">${escapeHtml(state.investigation.projection.eventHead)}</code></div>
      </article>
    </section>
    <section class="metric-grid">
      <article class="panel metric-card"><span class="metric-label">Nós no grafo</span><strong>${counts.nodes}</strong><small>${state.investigation.relations.length} relações explícitas</small></article>
      <article class="panel metric-card"><span class="metric-label">Trilhas probatórias</span><strong>${state.investigation.relations.filter((item) => item.category === "evidence").length}</strong><small>relações INF → PRO</small></article>
      <article class="panel metric-card${unresolvedGaps ? " is-alert" : ""}"><span class="metric-label">Lacunas abertas</span><strong>${unresolvedGaps}</strong><small>ausência não é inexistência</small></article>
      <article class="panel metric-card${pending ? " is-alert" : ""}"><span class="metric-label">Reavaliações</span><strong>${pending}</strong><small>dependências aguardando revisão</small></article>
    </section>
    <section class="dashboard-grid">
      <article class="panel">
        <div class="section-heading"><div><h2>Cadeia epistemológica</h2><p>Separação entre origem, conteúdo e efeito.</p></div><button class="button button-small button-ghost" data-view-link="graph">Abrir mapa</button></div>
        <div class="chain">${chains.map(([type, label, count]) => `<div class="chain-row"><span class="type-token">${type}</span><div><strong>${label}</strong><small>${TYPE_LABELS[type]}</small></div><span class="chain-count">${count}</span></div>`).join("")}</div>
      </article>
      <article class="panel">
        <div class="section-heading"><div><h2>Princípios de operação</h2><p>Restrições ativas em toda escrita.</p></div></div>
        <div class="principles"><div class="principle">O Crivo não procura uma conclusão. Procura evidências.</div><div class="principle">Investigação é grafo, não narrativa.</div><div class="principle">Sem inferência automática.</div></div>
      </article>
    </section>`;
}

function renderGraph() {
  const evidenceRelations = state.investigation.relations.filter((item) => item.category === "evidence");
  elements.viewRoot.innerHTML = `
    <header class="page-header"><div><p class="eyebrow">Grafo canônico</p><h1>Mapa probatório</h1><p>Origens, extrações, proposições e conclusões permanecem objetos distintos. As arestas tornam explícito o papel de cada ligação.</p></div><div class="page-actions"><button class="button button-ghost" data-action="add-relation">+ Relação</button><button class="button button-primary" data-action="add-object">+ Artefato</button></div></header>
    <article class="panel graph-panel">
      <div class="section-heading"><div><h2>${allNodes().length} nós · ${state.investigation.relations.length} arestas</h2><p>Selecione um nó para revisar seus campos.</p></div>${badgeFor(`${evidenceRelations.length} relações probatórias`)}</div>
      <div class="legend"><span><i></i>Relação estrutural</span><span><i class="evidence-line"></i>Evidência INF → PRO</span></div>
      <div id="graph-canvas" class="graph-canvas" aria-label="Visualização do grafo ARCA"></div>
    </article>
    <article class="panel">
      <div class="section-heading"><div><h2>Relações registradas</h2><p>Arestas canônicas e suas justificativas.</p></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Origem</th><th>Relação</th><th>Destino</th><th>Categoria / efeito</th><th>Justificativa</th></tr></thead><tbody>
      ${state.investigation.relations.map((relation) => `<tr><td><code>${escapeHtml(relation.id)}</code></td><td><span class="cell-main">${escapeHtml(relation.from)}</span><span class="cell-sub">${escapeHtml(truncate(objectTitle(findNode(relation.from)), 56))}</span></td><td>${escapeHtml(relation.relationType)}</td><td><span class="cell-main">${escapeHtml(relation.to)}</span><span class="cell-sub">${escapeHtml(truncate(objectTitle(findNode(relation.to)), 56))}</span></td><td>${badgeFor(relation.category)} ${relation.effect ? badgeFor(relation.effect) : ""}</td><td><span class="cell-main">${escapeHtml(relation.justification ?? "—")}</span></td></tr>`).join("")}
      </tbody></table></div>
    </article>`;
  renderGraphSvg(document.querySelector("#graph-canvas"));
}

function renderObjects() {
  const search = state.objectSearch.trim().toLocaleLowerCase("pt-BR");
  const objects = artifactNodes().filter((item) => {
    if (state.objectFilter !== "ALL" && item.type !== state.objectFilter) return false;
    if (!search) return true;
    return `${item.id} ${objectTitle(item)} ${objectSubtitle(item)}`.toLocaleLowerCase("pt-BR").includes(search);
  });
  elements.viewRoot.innerHTML = `
    <header class="page-header"><div><p class="eyebrow">Inventário do caso</p><h1>Artefatos</h1><p>Cada registro tem identidade, tipo, validade e histórico próprios. Edite a projeção somente por operações auditáveis.</p></div><div class="page-actions"><button class="button button-ghost" data-action="add-relation">+ Relação</button><button class="button button-primary" data-action="add-object">+ Artefato</button></div></header>
    <div class="toolbar"><input id="object-search" class="search-field" type="search" value="${escapeHtml(state.objectSearch)}" placeholder="Buscar por ID ou conteúdo…"><select id="object-filter" class="search-field"><option value="ALL">Todos os tipos</option>${TYPE_ORDER.map((type) => `<option value="${type}"${state.objectFilter === type ? " selected" : ""}>${type} · ${TYPE_LABELS[type]}</option>`).join("")}</select><span class="badge">${objects.length} exibidos</span></div>
    ${objects.length ? `<section class="object-grid">${objects.map((object) => `<article class="panel object-card"><div class="object-card-top"><span class="type-token">${escapeHtml(object.type)}</span>${badgeFor(object.validity ?? object.lifecycleStatus ?? "active")}</div><h3>${escapeHtml(truncate(objectTitle(object), 115))}</h3><p>${escapeHtml(truncate(objectSubtitle(object), 150))}</p><div class="object-card-footer"><code>${escapeHtml(object.id)}</code><div class="card-actions"><button class="button button-small button-ghost" data-action="trace-object" data-id="${escapeHtml(object.id)}">TRACE</button><button class="button button-small" data-action="edit-object" data-id="${escapeHtml(object.id)}">Revisar</button></div></div></article>`).join("")}</section>` : `<article class="panel empty-panel"><div><p>Nenhum artefato corresponde ao filtro.</p><button class="button button-primary" data-action="add-object">Adicionar artefato</button></div></article>`}`;
}

function renderTrace() {
  const options = artifactNodes().map((item) => `<option value="${escapeHtml(item.id)}"${state.traceTarget === item.id ? " selected" : ""}>${escapeHtml(item.id)} · ${escapeHtml(truncate(objectTitle(item), 70))}</option>`).join("");
  const trace = state.trace;
  elements.viewRoot.innerHTML = `
    <header class="page-header"><div><p class="eyebrow">Rastreabilidade bidirecional</p><h1>TRACE</h1><p>Reconstrua todas as trilhas reais até um artefato ou a partir dele, sem inventar atalhos nem ocultar ramos.</p></div></header>
    <form id="trace-form" class="toolbar"><select name="target" class="search-field" required><option value="">Selecione o nó-alvo…</option>${options}</select><select name="direction" class="search-field"><option value="ancestors"${state.traceDirection === "ancestors" ? " selected" : ""}>Antecedentes</option><option value="descendants"${state.traceDirection === "descendants" ? " selected" : ""}>Dependentes</option></select><button class="button button-primary" type="submit">Executar TRACE</button></form>
    ${trace ? `<section class="trace-layout"><article class="panel graph-panel"><div class="section-heading"><div><h2>Subgrafo rastreado</h2><p>${trace.nodeIds.length} nós · ${trace.relationIds.length} relações${trace.truncated ? " · resultado truncado" : ""}</p></div>${trace.cycles.length ? badgeFor(`${trace.cycles.length} ciclos detectados`) : badgeFor("sem ciclos")}</div><div id="trace-graph" class="graph-canvas"></div></article><article class="panel"><div class="section-heading"><div><h2>Trilhas completas</h2><p>${trace.paths.length} caminhos encontrados.</p></div></div><div class="trace-paths">${trace.paths.length ? trace.paths.map((path, index) => `<div class="trace-path"><div class="trace-path-header"><span>Caminho ${index + 1}</span><span>${path.nodeIds.length} nós</span></div><div class="trace-nodes">${path.nodeIds.map((id, nodeIndex) => `${nodeIndex ? `<span class="trace-arrow">→</span>` : ""}<button type="button" data-action="edit-object" data-id="${escapeHtml(id)}">${escapeHtml(id)}</button>`).join("")}</div></div>`).join("") : `<p>Nenhum caminho além do alvo.</p>`}</div></article></section>` : `<article class="panel empty-panel"><div><span class="type-token">↯</span><p>Escolha um artefato para revelar sua proveniência, bases e dependências.</p></div></article>`}`;
  if (trace) renderGraphSvg(document.querySelector("#trace-graph"), new Set(trace.nodeIds), new Set(trace.relationIds), true);
  document.querySelector("#trace-form")?.addEventListener("submit", handleTraceSubmit);
}

function renderValidation() {
  const validation = state.validation;
  const profiles = Object.entries(validation.profiles ?? {});
  const requirements = validation.requirements ?? [];
  const summary = validation.summary ?? {};
  elements.viewRoot.innerHTML = `
    <header class="page-header"><div><p class="eyebrow">47 requisitos verificáveis</p><h1>Conformidade ACS</h1><p>O validador mede estrutura e auditabilidade. Aprovação técnica não equivale a verdade factual, selo oficial ou revisão independente.</p></div>${validation.eligibleForSeal ? badgeFor("elegível para avaliação de selo") : badgeFor("sem selo")}</header>
    <section class="validation-hero">${profiles.map(([name, status]) => `<article class="panel profile-card">${badgeFor(status)}<h3>${escapeHtml(name)}</h3><p>Perfil avaliado contra os requisitos declarados no protocolo.</p></article>`).join("")}</section>
    ${validation.blockers?.length ? `<article class="warning-callout"><strong>Bloqueadores</strong><span>${escapeHtml(validation.blockers.join(" · "))}</span></article>` : ""}
    <article class="panel">
      <div class="validation-summary">${Object.entries(summary).map(([key, value]) => `<div class="summary-chip"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(key)}</span></div>`).join("")}</div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Requisito</th><th>Criticidade</th><th>Estado</th><th>Evidência do validador</th></tr></thead><tbody>${requirements.map((item) => `<tr><td><code>${escapeHtml(item.id)}</code><span class="cell-sub">${escapeHtml(item.title ?? item.description ?? "")}</span></td><td>${item.mandatory || item.critical ? badgeFor("obrigatório") : badgeFor("complementar")}</td><td>${badgeFor(item.status)}</td><td><span class="cell-main">${escapeHtml(item.evidence ?? item.message ?? "—")}</span></td></tr>`).join("")}</tbody></table></div>
    </article>`;
}

function renderProposals() {
  const proposals = state.proposals;
  const selected = proposals.find((item) => item.proposalId === state.selectedProposalId) ?? proposals[0] ?? null;
  state.selectedProposalId = selected?.proposalId ?? null;
  elements.viewRoot.innerHTML = `
    <header class="page-header"><div><p class="eyebrow">Agente sem autoridade de escrita</p><h1>Revisão humana</h1><p>Agentes podem propor uma única operação vinculada ao estado observado. Somente sua aprovação explícita pode submetê-la ao Core.</p></div><div class="page-actions"><a class="button button-ghost" href="/api/agent/prompt" download>Prompt</a><a class="button button-ghost" href="/api/agent/schema" download>Schema</a><button class="button button-primary" data-action="import-proposal">Importar proposta</button></div></header>
    <section class="proposal-layout">
      <article class="panel"><div class="section-heading"><div><h2>Caixa de entrada</h2><p>${proposals.length} propostas registradas</p></div></div><div class="proposal-list">${proposals.length ? proposals.map((proposal) => `<button class="proposal-list-item${proposal.proposalId === selected?.proposalId ? " is-active" : ""}" data-action="select-proposal" data-id="${escapeHtml(proposal.proposalId)}"><div>${badgeFor(proposal.status)} ${badgeFor(proposal.freshness)}</div><h3>${escapeHtml(truncate(proposal.intent, 95))}</h3><p>${escapeHtml(proposal.operation.kind)} · ${formatDate(proposal.createdAt)}</p></button>`).join("") : `<div class="empty-panel"><p>Nenhuma proposta recebida.</p></div>`}</div></article>
      <article class="panel proposal-detail">${selected ? proposalDetail(selected) : `<div class="empty-panel"><div><p>Importe uma proposta compatível para iniciar a revisão.</p><button class="button button-primary" data-action="import-proposal">Importar proposta</button></div></div>`}</article>
    </section>`;
}

function proposalDetail(proposal) {
  const operationRows = Object.entries(proposal.operation).map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(typeof value === "object" ? JSON.stringify(value, null, 2) : value)}</dd>`).join("");
  const pending = proposal.status === "pending";
  return `<div>${badgeFor(proposal.status)} ${badgeFor(proposal.freshness)}<h2>${escapeHtml(proposal.intent)}</h2><p class="cell-main">Agente: ${escapeHtml(proposal.agent.id)}${proposal.agent.model ? ` · ${escapeHtml(proposal.agent.model)}` : ""}</p></div>
    <div class="proposal-metadata"><div class="meta-box"><span>ID da proposta</span><code>${escapeHtml(proposal.proposalId)}</code></div><div class="meta-box"><span>SHA-256 canônico</span><code>${escapeHtml(proposal.proposalHash)}</code></div><div class="meta-box"><span>Estado observado</span><code>${escapeHtml(proposal.expectedEventHead)}</code></div><div class="meta-box"><span>Estado atual</span><code>${escapeHtml(proposal.currentEventHead)}</code></div></div>
    <div class="operation-box"><h3>Operação proposta · não aplicada</h3><dl class="operation-grid">${operationRows}</dl></div>
    <div class="dashboard-grid"><div><p class="eyebrow">Premissas</p>${proposal.assumptions.length ? `<ul>${proposal.assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="cell-sub">Nenhuma declarada.</p>`}</div><div><p class="eyebrow">Incertezas</p>${proposal.uncertainties.length ? `<ul>${proposal.uncertainties.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="cell-sub">Nenhuma declarada.</p>`}</div></div>
    ${pending ? `<div class="review-box">${proposal.freshness === "stale" ? `<div class="warning-callout"><strong>Proposta obsoleta</strong><span>O grafo mudou depois da observação do agente. A aplicação falhará fechada; rejeite e solicite nova proposta.</span></div>` : `<p class="confirmation-hint">Aprovação exigirá a frase exata “APLICAR ${escapeHtml(proposal.proposalId)}”.</p>`}<div class="review-actions"><button class="button button-danger" data-action="reject-proposal" data-id="${escapeHtml(proposal.proposalId)}">Rejeitar</button><button class="button button-primary" data-action="approve-proposal" data-id="${escapeHtml(proposal.proposalId)}"${proposal.freshness === "stale" ? " disabled" : ""}>Revisar e aplicar</button></div></div>` : `<div class="review-box"><p class="eyebrow">Decisão registrada</p><div class="meta-box"><span>${escapeHtml(proposal.review?.decision ?? "decisão")}</span><strong>${escapeHtml(proposal.review?.reviewerId ?? "—")} · ${escapeHtml(formatDate(proposal.review?.reviewedAt))}</strong></div></div>`}`;
}

function renderHistory() {
  elements.viewRoot.innerHTML = `
    <header class="page-header"><div><p class="eyebrow">Fonte de verdade</p><h1>Histórico de eventos</h1><p>O estado visível é uma projeção reproduzível. Cada mutação entra em uma cadeia append-only ligada por SHA-256.</p></div><div class="page-actions"><button class="button button-ghost" data-action="copy-event-head">Copiar eventHead</button></div></header>
    <article class="panel"><div class="section-heading"><div><h2>${state.events.length} eventos canônicos</h2><p>Do primeiro evento ao estado atual.</p></div>${badgeFor("cadeia verificada")}</div><div class="timeline">${[...state.events].reverse().map((event) => `<div class="timeline-item"><h3>${escapeHtml(event.operation)}</h3><p><code>${escapeHtml(event.eventId)}</code> · sequência ${event.sequence} · ${escapeHtml(event.actor.type)}:${escapeHtml(event.actor.id)} · ${escapeHtml(formatDate(event.timestamp))}</p><p title="${escapeHtml(event.eventHash)}">hash ${escapeHtml(event.eventHash.slice(0, 20))}…</p></div>`).join("")}</div></article>`;
}

function renderGraphSvg(container, highlightedNodes = new Set(), highlightedRelations = new Set(), traceOnly = false) {
  if (!container) return;
  const all = allNodes();
  const nodes = traceOnly ? all.filter((item) => highlightedNodes.has(item.id)) : all;
  if (!nodes.length) {
    container.innerHTML = `<div class="graph-empty">O grafo ainda não possui nós para exibir.</div>`;
    return;
  }
  const ranks = new Map([["INV", 0], ["Q", 0], ["SRC", 1], ["DOC", 2], ["INF", 3], ["PRO", 4], ["ENT", 2], ["EVT", 3], ["FRM", 3], ["HIP", 5], ["GAP", 5], ["SEARCH", 4], ["CON", 6]]);
  const grouped = new Map();
  nodes.forEach((node) => {
    const rank = ranks.get(node.type) ?? 3;
    if (!grouped.has(rank)) grouped.set(rank, []);
    grouped.get(rank).push(node);
  });
  for (const items of grouped.values()) items.sort((a, b) => a.id.localeCompare(b.id));
  const nodeWidth = 146;
  const nodeHeight = 52;
  const horizontalGap = 34;
  const verticalGap = 24;
  const margin = 38;
  const columns = 7;
  const width = margin * 2 + columns * nodeWidth + (columns - 1) * horizontalGap;
  const maxRows = Math.max(...[...grouped.values()].map((items) => items.length));
  const height = Math.max(430, margin * 2 + maxRows * nodeHeight + Math.max(0, maxRows - 1) * verticalGap);
  const positions = new Map();
  for (const [rank, items] of grouped.entries()) {
    const blockHeight = items.length * nodeHeight + Math.max(0, items.length - 1) * verticalGap;
    const startY = Math.max(margin, (height - blockHeight) / 2);
    items.forEach((node, index) => positions.set(node.id, { x: margin + rank * (nodeWidth + horizontalGap), y: startY + index * (nodeHeight + verticalGap) }));
  }

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Grafo de investigação ARCA");

  state.investigation.relations.forEach((relation) => {
    const from = positions.get(relation.from);
    const to = positions.get(relation.to);
    if (!from || !to) return;
    const path = document.createElementNS(ns, "path");
    const x1 = from.x + nodeWidth;
    const y1 = from.y + nodeHeight / 2;
    const x2 = to.x;
    const y2 = to.y + nodeHeight / 2;
    const curve = Math.max(26, Math.abs(x2 - x1) * .42);
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`);
    path.setAttribute("class", `graph-edge${relation.category === "evidence" ? " is-evidence" : ""}${highlightedRelations.has(relation.id) ? " is-highlighted" : ""}`);
    const title = document.createElementNS(ns, "title");
    title.textContent = `${relation.id}: ${relation.relationType}`;
    path.append(title);
    svg.append(path);
  });

  nodes.forEach((node) => {
    const position = positions.get(node.id);
    const group = document.createElementNS(ns, "g");
    group.setAttribute("class", `graph-node${highlightedNodes.has(node.id) ? " is-highlighted" : ""}`);
    group.dataset.action = "edit-object";
    group.dataset.id = node.id;
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", String(position.x));
    rect.setAttribute("y", String(position.y));
    rect.setAttribute("width", String(nodeWidth));
    rect.setAttribute("height", String(nodeHeight));
    rect.setAttribute("rx", "9");
    const type = document.createElementNS(ns, "text");
    type.setAttribute("x", String(position.x + 11));
    type.setAttribute("y", String(position.y + 16));
    type.setAttribute("class", "node-type");
    type.textContent = `${node.type} · ${node.id}`;
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(position.x + 11));
    label.setAttribute("y", String(position.y + 35));
    label.textContent = truncate(objectTitle(node), 22);
    const title = document.createElementNS(ns, "title");
    title.textContent = `${node.id}: ${objectTitle(node)}`;
    group.append(rect, type, label, title);
    svg.append(group);
  });
  container.replaceChildren(svg);
}

function objectOptions(types, selected = [], multiple = false) {
  const selectedSet = new Set(Array.isArray(selected) ? selected : [selected]);
  return artifactNodes()
    .filter((item) => types.includes(item.type))
    .map((item) => `<option value="${escapeHtml(item.id)}"${selectedSet.has(item.id) ? " selected" : ""}>${escapeHtml(item.id)} · ${escapeHtml(truncate(objectTitle(item), multiple ? 52 : 70))}</option>`)
    .join("");
}

function renderField(field, value) {
  const wide = field.wide ? " field-wide" : "";
  const required = field.required ? " required" : "";
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
  if (field.kind === "textarea" || field.kind === "array") {
    const content = field.kind === "array" && Array.isArray(value) ? value.join("\n") : value ?? "";
    return `<label class="field${wide}"><span>${escapeHtml(field.label)}</span><textarea name="${field.name}" rows="${field.kind === "array" ? 4 : 3}"${required}${placeholder}>${escapeHtml(content)}</textarea></label>`;
  }
  if (field.kind === "select") {
    return `<label class="field${wide}"><span>${escapeHtml(field.label)}</span><select name="${field.name}"${required}>${!field.required ? `<option value="">Não informado</option>` : ""}${field.options.map((option) => `<option value="${escapeHtml(option)}"${value === option ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
  }
  if (field.kind === "object-select") {
    return `<label class="field${wide}"><span>${escapeHtml(field.label)}</span><select name="${field.name}"${required}><option value="">Selecione…</option>${objectOptions(field.types, value)}</select></label>`;
  }
  if (field.kind === "object-multi") {
    return `<label class="field${wide}"><span>${escapeHtml(field.label)}</span><select name="${field.name}" multiple>${objectOptions(field.types, value ?? [], true)}</select><small>Use Ctrl/Cmd para selecionar vários itens.</small></label>`;
  }
  if (field.kind === "checkbox") {
    return `<label class="check-field${wide}"><input type="checkbox" name="${field.name}"${value ? " checked" : ""}><span><strong>${escapeHtml(field.label)}</strong></span></label>`;
  }
  if (field.kind === "tristate") {
    const normalized = value === true ? "true" : value === false ? "false" : "";
    return `<label class="field${wide}"><span>${escapeHtml(field.label)}</span><select name="${field.name}"><option value=""${normalized === "" ? " selected" : ""}>Ainda não avaliado</option><option value="true"${normalized === "true" ? " selected" : ""}>Sim</option><option value="false"${normalized === "false" ? " selected" : ""}>Não</option></select></label>`;
  }
  const inputType = field.kind === "datetime" ? "datetime-local" : "text";
  const normalizedValue = inputType === "datetime-local" && value ? String(value).slice(0, 16) : value ?? "";
  return `<label class="field${wide}"><span>${escapeHtml(field.label)}</span><input type="${inputType}" name="${field.name}" value="${escapeHtml(normalizedValue)}"${required}${placeholder}></label>`;
}

function openObjectDialog(object = null) {
  if (!state.investigation) return;
  elements.objectForm.reset();
  const typeSelect = elements.objectType;
  typeSelect.innerHTML = TYPE_ORDER.map((type) => `<option value="${type}">${type} · ${OBJECT_DEFINITIONS[type].label}</option>`).join("");
  const type = object?.type ?? "SRC";
  typeSelect.value = type;
  typeSelect.disabled = Boolean(object);
  elements.objectForm.elements.editId.value = object?.id ?? "";
  document.querySelector("#object-dialog-eyebrow").textContent = object ? `${object.id} · revisão` : "Novo artefato";
  document.querySelector("#object-dialog-title").textContent = object ? `Revisar ${OBJECT_DEFINITIONS[type]?.label ?? type}` : "Adicionar ao grafo";
  document.querySelector("#object-submit").textContent = object ? "Registrar atualização" : "Adicionar artefato";
  renderObjectFields(type, object);
  elements.objectDialog.showModal();
}

function renderObjectFields(type, object = null) {
  const definition = OBJECT_DEFINITIONS[type];
  if (!definition) return;
  let actions = "";
  if (object) {
    const lifecycleAction = type === "CON"
      ? object.lifecycleStatus === "closed"
        ? `<button type="button" class="button button-small" data-action="reopen" data-id="${escapeHtml(object.id)}">Reabrir conclusão</button>`
        : `<button type="button" class="button button-small" data-action="close" data-id="${escapeHtml(object.id)}">Tentar fechar</button>`
      : "";
    actions = `<div class="artifact-actions field-wide"><div><span>Operações de ciclo de vida</span><small>Cada ação gera um evento separado.</small></div><div>${object.validity === "active" ? `<button type="button" class="button button-small button-ghost" data-action="reevaluate" data-id="${escapeHtml(object.id)}">Reavaliar</button><button type="button" class="button button-small button-danger" data-action="invalidate" data-id="${escapeHtml(object.id)}">Invalidar</button>` : ""}${lifecycleAction}</div></div>`;
  }
  elements.objectFields.innerHTML = `<div class="rule-callout field-wide"><strong>${type} · ${escapeHtml(definition.label)}</strong><span>${escapeHtml(definition.hint)}</span></div>${definition.fields.map((field) => renderField(field, object?.[field.name])).join("")}${actions}`;
}

function collectObjectData(type) {
  const definition = OBJECT_DEFINITIONS[type];
  const data = {};
  for (const field of definition.fields) {
    const input = elements.objectForm.elements.namedItem(field.name);
    if (!input) continue;
    if (field.kind === "checkbox") data[field.name] = input.checked;
    else if (field.kind === "array") data[field.name] = input.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    else if (field.kind === "object-multi") data[field.name] = [...input.selectedOptions].map((option) => option.value);
    else if (field.kind === "tristate") data[field.name] = input.value === "" ? null : input.value === "true";
    else if (field.kind === "datetime") {
      if (input.value) data[field.name] = new Date(input.value).toISOString();
    } else if (input.value.trim()) data[field.name] = input.value.trim();
  }
  return data;
}

function populateRelationOptions() {
  const category = elements.relationForm.elements.category.value;
  const from = elements.relationForm.elements.from;
  const to = elements.relationForm.elements.to;
  const previousFrom = from.value;
  const previousTo = to.value;
  const sourceNodes = category === "evidence" ? artifactNodes().filter((item) => item.type === "INF") : allNodes();
  const targetNodes = category === "evidence" ? artifactNodes().filter((item) => item.type === "PRO") : allNodes();
  from.innerHTML = `<option value="">Selecione…</option>${sourceNodes.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} · ${escapeHtml(truncate(objectTitle(item), 65))}</option>`).join("")}`;
  to.innerHTML = `<option value="">Selecione…</option>${targetNodes.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} · ${escapeHtml(truncate(objectTitle(item), 65))}</option>`).join("")}`;
  if ([...from.options].some((option) => option.value === previousFrom)) from.value = previousFrom;
  if ([...to.options].some((option) => option.value === previousTo)) to.value = previousTo;
  const effect = elements.relationForm.elements.effect;
  effect.required = category === "evidence";
  if (category === "evidence" && !effect.value) effect.value = "supports";
}

function openRelationDialog(fromId = "", toId = "") {
  elements.relationForm.reset();
  populateRelationOptions();
  if (fromId) elements.relationForm.elements.from.value = fromId;
  if (toId) elements.relationForm.elements.to.value = toId;
  elements.relationDialog.showModal();
}

function openAction(kind, id) {
  const object = findNode(id);
  state.action = { kind, id };
  const title = document.querySelector("#action-title");
  const eyebrow = document.querySelector("#action-eyebrow");
  const submit = document.querySelector("#action-submit");
  elements.actionForm.reset();
  if (kind === "invalidate") {
    eyebrow.textContent = `${id} · propagação de dependências`;
    title.textContent = "Invalidar artefato";
    submit.textContent = "Invalidar e marcar dependentes";
    submit.className = "button button-danger";
    elements.actionBody.innerHTML = `<div class="warning-callout field-wide"><strong>Sem falsidade automática</strong><span>A invalidação marcará dependentes para reavaliação, mas não os converterá em “Contradito”.</span></div><label class="field field-wide"><span>Motivo da invalidação</span><textarea name="reason" rows="4" required maxlength="2000" placeholder="Explique por que ${escapeHtml(id)} deixou de ser utilizável."></textarea></label>`;
  } else if (kind === "reevaluate") {
    eyebrow.textContent = `${id} · recomputação estrutural`;
    title.textContent = "Reavaliar dependências";
    submit.textContent = "Registrar reavaliação";
    submit.className = "button button-primary";
    elements.actionBody.innerHTML = `<p class="cell-main field-wide">${escapeHtml(truncate(objectTitle(object), 240))}</p><label class="field field-wide"><span>Justificativa</span><textarea name="justification" rows="4" required maxlength="2000" placeholder="Contexto humano para esta reavaliação."></textarea></label>`;
  } else if (kind === "close") {
    eyebrow.textContent = `${id} · O Limite`;
    title.textContent = "Tentar fechar conclusão";
    submit.textContent = "Submeter ao Crivo";
    submit.className = "button button-primary";
    elements.actionBody.innerHTML = `<div class="rule-callout field-wide"><strong>Fechamento condicionado</strong><span>O Core verificará escopo, bases, lacunas, limitações, condições de reabertura e Advogado do Diabo.</span></div><label class="field field-wide"><span>Justificativa excepcional de O Limite</span><textarea name="limitJustification" rows="4" maxlength="2000" placeholder="Preencha somente se uma lacuna material permanecer e o fechamento limitado for justificável."></textarea></label>`;
  } else if (kind === "reopen") {
    eyebrow.textContent = `${id} · ciclo de vida`;
    title.textContent = "Reabrir conclusão";
    submit.textContent = "Reabrir conclusão";
    submit.className = "button button-primary";
    elements.actionBody.innerHTML = `<label class="field field-wide"><span>Condição de reabertura observada</span><textarea name="reason" rows="4" required maxlength="2000"></textarea></label>`;
  } else if (kind === "approve-proposal") {
    const proposal = state.proposals.find((item) => item.proposalId === id);
    eyebrow.textContent = `${id} · decisão humana`;
    title.textContent = "Aplicar proposta";
    submit.textContent = "Aplicar uma operação";
    submit.className = "button button-primary";
    elements.actionBody.innerHTML = `<div class="warning-callout field-wide"><strong>Último crivo humano</strong><span>Você está aprovando exatamente “${escapeHtml(proposal?.intent)}”. O Core ainda validará a operação e o eventHead.</span></div><label class="field field-wide"><span>Identificação do revisor</span><input name="reviewerId" required maxlength="160" value="workbench-user"></label><label class="field field-wide"><span>Digite exatamente: APLICAR ${escapeHtml(id)}</span><input name="confirmation" required autocomplete="off"></label>`;
  } else if (kind === "reject-proposal") {
    eyebrow.textContent = `${id} · decisão humana`;
    title.textContent = "Rejeitar proposta";
    submit.textContent = "Registrar rejeição";
    submit.className = "button button-danger";
    elements.actionBody.innerHTML = `<label class="field field-wide"><span>Identificação do revisor</span><input name="reviewerId" required maxlength="160" value="workbench-user"></label><label class="field field-wide"><span>Motivo da rejeição</span><textarea name="reason" rows="4" required maxlength="2000"></textarea></label>`;
  }
  elements.actionDialog.showModal();
}

async function handleTraceSubmit(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const target = data.get("target");
  const direction = data.get("direction");
  if (!target) return;
  try {
    state.traceTarget = target;
    state.traceDirection = direction;
    state.trace = await api(`/api/investigations/${encodeURIComponent(state.investigationId)}/trace?target=${encodeURIComponent(target)}&direction=${encodeURIComponent(direction)}`);
    renderTrace();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleActionSubmit(event) {
  event.preventDefault();
  if (!state.action) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const { kind, id } = state.action;
  try {
    if (kind === "invalidate") await api(`/api/investigations/${encodeURIComponent(state.investigationId)}/invalidate`, { method: "POST", body: { id, reason: data.reason, expectedEventHead: state.investigation.projection.eventHead } });
    else if (kind === "reevaluate") await api(`/api/investigations/${encodeURIComponent(state.investigationId)}/reevaluate`, { method: "POST", body: { id, justification: data.justification, expectedEventHead: state.investigation.projection.eventHead } });
    else if (kind === "close") await api(`/api/investigations/${encodeURIComponent(state.investigationId)}/conclusions/${encodeURIComponent(id)}/close`, { method: "POST", body: { limitJustification: data.limitJustification || undefined, expectedEventHead: state.investigation.projection.eventHead } });
    else if (kind === "reopen") await api(`/api/investigations/${encodeURIComponent(state.investigationId)}/conclusions/${encodeURIComponent(id)}/reopen`, { method: "POST", body: { reason: data.reason, expectedEventHead: state.investigation.projection.eventHead } });
    else if (kind === "approve-proposal") await api(`/api/agent/proposals/${encodeURIComponent(id)}/apply`, { method: "POST", body: { reviewerId: data.reviewerId, confirmation: data.confirmation } });
    else if (kind === "reject-proposal") await api(`/api/agent/proposals/${encodeURIComponent(id)}/reject`, { method: "POST", body: { reviewerId: data.reviewerId, reason: data.reason } });
    elements.actionDialog.close();
    toast("Ação registrada no ARCA.");
    await loadInvestigation(state.investigationId);
  } catch (error) {
    toast(error.message, "error");
  }
}

elements.investigationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    const created = await api("/api/investigations", { method: "POST", body: { ...data, simulation: form.elements.simulation.checked } });
    elements.investigationDialog.close();
    form.reset();
    state.view = "overview";
    toast(`Investigação ${created.investigation.id} criada.`);
    await refreshList(created.investigation.id);
  } catch (error) {
    toast(error.message, "error");
  }
});

elements.objectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const type = elements.objectType.value;
  const editId = elements.objectForm.elements.editId.value;
  const data = collectObjectData(type);
  try {
    if (editId) {
      await api(`/api/investigations/${encodeURIComponent(state.investigationId)}/objects/${encodeURIComponent(editId)}`, { method: "PATCH", body: { patch: data, expectedEventHead: state.investigation.projection.eventHead } });
      toast(`${editId} atualizado por novo evento.`);
    } else {
      const created = await api(`/api/investigations/${encodeURIComponent(state.investigationId)}/objects`, { method: "POST", body: { type, data, expectedEventHead: state.investigation.projection.eventHead } });
      toast(`${created.id} adicionado ao grafo.`);
    }
    elements.objectDialog.close();
    await loadInvestigation(state.investigationId);
  } catch (error) {
    toast(error.message, "error");
  }
});

elements.relationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const relation = await api(`/api/investigations/${encodeURIComponent(state.investigationId)}/relations`, { method: "POST", body: { ...data, effect: data.effect || undefined, materiality: data.materiality || undefined, expectedEventHead: state.investigation.projection.eventHead } });
    elements.relationDialog.close();
    toast(`${relation.id} adicionada ao grafo.`);
    await loadInvestigation(state.investigationId);
  } catch (error) {
    toast(error.message, "error");
  }
});

elements.proposalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = new FormData(event.currentTarget).get("proposalJson");
  try {
    const proposal = JSON.parse(text);
    const created = await api("/api/agent/proposals", { method: "POST", body: proposal });
    state.selectedProposalId = created.proposalId;
    elements.proposalDialog.close();
    toast("Proposta validada e registrada; nenhuma operação foi aplicada.");
    await loadInvestigation(state.investigationId);
  } catch (error) {
    toast(error instanceof SyntaxError ? "O texto não é um objeto JSON válido." : error.message, "error");
  }
});

elements.actionForm.addEventListener("submit", handleActionSubmit);
elements.objectType.addEventListener("change", () => renderObjectFields(elements.objectType.value));
elements.relationForm.elements.category.addEventListener("change", populateRelationOptions);

document.addEventListener("click", async (event) => {
  const close = event.target.closest("[data-close-dialog]");
  if (close) return close.closest("dialog")?.close();
  const nav = event.target.closest("[data-view]");
  if (nav) {
    state.view = nav.dataset.view;
    elements.sidebar.classList.remove("is-open");
    elements.sidebarScrim.classList.add("is-hidden");
    return render();
  }
  const viewLink = event.target.closest("[data-view-link]");
  if (viewLink) {
    state.view = viewLink.dataset.viewLink;
    return render();
  }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const id = action.dataset.id;
  switch (action.dataset.action) {
    case "new-investigation": elements.investigationDialog.showModal(); break;
    case "add-object": openObjectDialog(); break;
    case "add-relation": openRelationDialog(); break;
    case "edit-object": {
      const object = findNode(id);
      if (object?.type === "INV") toast("Os metadados da investigação permanecem imutáveis nesta versão.", "error");
      else if (object?.type === "REL") toast("Arestas são imutáveis; registre nova relação ou invalide o suporte associado.", "error");
      else if (object) openObjectDialog(object);
      break;
    }
    case "trace-object": state.traceTarget = id; state.trace = null; state.view = "trace"; render(); break;
    case "invalidate": elements.objectDialog.open && elements.objectDialog.close(); openAction("invalidate", id); break;
    case "reevaluate": elements.objectDialog.open && elements.objectDialog.close(); openAction("reevaluate", id); break;
    case "close": elements.objectDialog.open && elements.objectDialog.close(); openAction("close", id); break;
    case "reopen": elements.objectDialog.open && elements.objectDialog.close(); openAction("reopen", id); break;
    case "import-proposal": {
      const example = {
        format: "arca-agent-proposal-v1",
        investigationId: state.investigationId,
        expectedEventHead: state.investigation.projection.eventHead,
        agent: { id: "agent-local", provider: null, model: null },
        intent: "Descreva a finalidade estreita desta única operação.",
        operation: { kind: "create_object", objectType: "GAP", data: { description: "Descreva a lacuna", gapState: "L0" } },
        assumptions: [],
        uncertainties: [],
        requiresHumanReview: true
      };
      elements.proposalForm.elements.proposalJson.value = JSON.stringify(example, null, 2);
      elements.proposalDialog.showModal();
      break;
    }
    case "select-proposal": state.selectedProposalId = id; renderProposals(); break;
    case "approve-proposal": openAction("approve-proposal", id); break;
    case "reject-proposal": openAction("reject-proposal", id); break;
    case "copy-event-head": {
      try { await navigator.clipboard.writeText(state.investigation.projection.eventHead); toast("eventHead copiado."); }
      catch { toast("Não foi possível acessar a área de transferência.", "error"); }
      break;
    }
  }
});

elements.viewRoot.addEventListener("input", (event) => {
  if (event.target.id === "object-search") {
    state.objectSearch = event.target.value;
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(renderObjects, 120);
  }
});

elements.viewRoot.addEventListener("change", (event) => {
  if (event.target.id === "object-filter") {
    state.objectFilter = event.target.value;
    renderObjects();
  }
});

elements.investigationSelect.addEventListener("change", async (event) => {
  try { await loadInvestigation(event.target.value, { preserveView: false }); }
  catch (error) { toast(error.message, "error"); }
});

document.querySelector("#new-investigation-button").addEventListener("click", () => elements.investigationDialog.showModal());
elements.exportButton.addEventListener("click", () => {
  if (state.investigationId) window.location.assign(`/api/investigations/${encodeURIComponent(state.investigationId)}/export`);
});
document.querySelector("#menu-button").addEventListener("click", () => {
  elements.sidebar.classList.add("is-open");
  elements.sidebarScrim.classList.remove("is-hidden");
});
elements.sidebarScrim.addEventListener("click", () => {
  elements.sidebar.classList.remove("is-open");
  elements.sidebarScrim.classList.add("is-hidden");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.closest(".graph-node")) {
    const object = findNode(event.target.closest(".graph-node").dataset.id);
    if (object && object.type !== "INV") openObjectDialog(object);
  }
});

async function bootstrap() {
  try {
    state.session = await api("/api/session");
    document.querySelector("#version-label").textContent = state.session.workbenchVersion;
    if (!state.session.localOnly) toast("Modo remoto ativo sem autenticação integrada.", "error");
    await refreshList();
  } catch (error) {
    elements.emptyState.classList.remove("is-hidden");
    elements.emptyState.innerHTML = `<p class="eyebrow">Falha de inicialização</p><h1>O Workbench não conectou ao Core.</h1><p>${escapeHtml(error.message)}</p>`;
    toast(error.message, "error");
  }
}

bootstrap();
