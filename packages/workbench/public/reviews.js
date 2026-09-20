const state = {
  session: null,
  reviews: [],
  selectedReviewId: null,
  filter: "pending"
};

const elements = {
  root: document.querySelector("#review-root"),
  pendingCount: document.querySelector("#pending-count"),
  syncStatus: document.querySelector("#sync-status"),
  refreshButton: document.querySelector("#refresh-button"),
  reviewVersion: document.querySelector("#review-version"),
  dialog: document.querySelector("#review-dialog"),
  form: document.querySelector("#review-form"),
  dialogTitle: document.querySelector("#review-dialog-title"),
  dialogBody: document.querySelector("#review-dialog-body"),
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

function truncate(value, length = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? String(value)
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function badge(value) {
  const text = String(value ?? "—");
  const normalized = text.toLowerCase();
  let color = "";
  if (["resolved", "approve", "acknowledge"].some((item) => normalized.includes(item))) color = " badge-green";
  else if (["dismissed", "reject", "critical"].some((item) => normalized.includes(item))) color = " badge-red";
  else if (["pending", "high", "needs-more-information"].some((item) => normalized.includes(item))) color = " badge-amber";
  else color = " badge-blue";
  return `<span class="badge${color}">${escapeHtml(text)}</span>`;
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
  let body = options.body;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  if (!["GET", "HEAD"].includes(method) && state.session?.csrfToken) headers["X-ARCA-CSRF"] = state.session.csrfToken;
  const response = await fetch(path, { ...options, method, headers, body });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? `Falha HTTP ${response.status}`);
  return payload;
}

function setBusy(busy) {
  elements.syncStatus.innerHTML = `<span class="status-dot${busy ? " is-warn" : ""}"></span>${busy ? "Atualizando" : "Íntegro"}`;
  elements.refreshButton.disabled = busy;
}

function reviewSource(item) {
  const parts = [item.source?.system];
  if (item.source?.jobId) parts.push(`job ${item.source.jobId}`);
  if (item.source?.findingId) parts.push(`finding ${item.source.findingId}`);
  if (item.source?.investigationId) parts.push(item.source.investigationId);
  return parts.filter(Boolean).join(" · ") || "origem não informada";
}

function render() {
  const pending = state.reviews.filter((item) => item.status === "pending").length;
  elements.pendingCount.textContent = String(pending);
  elements.pendingCount.classList.toggle("is-hidden", pending === 0);

  const selected = state.reviews.find((item) => item.reviewId === state.selectedReviewId)
    ?? state.reviews[0]
    ?? null;
  state.selectedReviewId = selected?.reviewId ?? null;

  const visible = state.reviews.filter((item) => state.filter === "all" || item.status === state.filter);
  elements.root.innerHTML = `
    <header class="page-header">
      <div>
        <p class="eyebrow">Ponto de encontro humano-máquina</p>
        <h1>Inbox de revisão</h1>
        <p>Resultados de agentes e workers só aparecem aqui quando uma política exige decisão humana. Mensagens e execuções normais continuam pela Machine Bridge sem bloquear o fluxo.</p>
      </div>
      <div class="page-actions">
        ${badge(`${pending} pendentes`)}
      </div>
    </header>

    <section class="metric-grid">
      <article class="panel metric-card${pending ? " is-alert" : ""}"><span class="metric-label">Pendentes</span><strong>${pending}</strong><small>aguardam decisão humana</small></article>
      <article class="panel metric-card"><span class="metric-label">Resolvidas</span><strong>${state.reviews.filter((item) => item.status === "resolved").length}</strong><small>decisão registrada</small></article>
      <article class="panel metric-card"><span class="metric-label">Descartadas</span><strong>${state.reviews.filter((item) => item.status === "dismissed").length}</strong><small>rejeitadas pelo revisor</small></article>
      <article class="panel metric-card"><span class="metric-label">Machine Bridge</span><strong>${state.reviews.filter((item) => item.source?.system === "machine-bridge").length}</strong><small>itens materializados da ponte</small></article>
    </section>

    <div class="toolbar">
      <button class="button button-small${state.filter === "pending" ? " button-primary" : " button-ghost"}" data-filter="pending">Pendentes</button>
      <button class="button button-small${state.filter === "resolved" ? " button-primary" : " button-ghost"}" data-filter="resolved">Resolvidas</button>
      <button class="button button-small${state.filter === "dismissed" ? " button-primary" : " button-ghost"}" data-filter="dismissed">Descartadas</button>
      <button class="button button-small${state.filter === "all" ? " button-primary" : " button-ghost"}" data-filter="all">Todas</button>
    </div>

    ${visible.length ? `<section class="proposal-layout">
      <article class="panel">
        <div class="section-heading"><div><h2>Fila</h2><p>${visible.length} itens no filtro atual</p></div></div>
        <div class="proposal-list">
          ${visible.map((item) => `<button class="proposal-list-item${item.reviewId === selected?.reviewId ? " is-active" : ""}" data-review-id="${escapeHtml(item.reviewId)}">
            <span>${badge(item.status)} ${badge(item.priority)}</span>
            <strong>${escapeHtml(truncate(item.title, 72))}</strong>
            <small>${escapeHtml(truncate(reviewSource(item), 95))}</small>
          </button>`).join("")}
        </div>
      </article>
      <article class="panel">
        ${selected ? renderDetail(selected) : ""}
      </article>
    </section>` : `<article class="panel empty-panel"><div><span class="type-token">✓</span><p>Nenhum item neste filtro.</p></div></article>`}
  `;
}

function renderDetail(item) {
  const recommendations = Array.isArray(item.recommendations) ? item.recommendations : [];
  const resolution = item.resolution;
  return `
    <div class="section-heading">
      <div><p class="eyebrow">${escapeHtml(item.reviewId)}</p><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(reviewSource(item))}</p></div>
      <div>${badge(item.status)} ${badge(item.priority)}</div>
    </div>
    <div class="rule-callout"><strong>Resumo</strong><span>${escapeHtml(item.summary)}</span></div>
    ${recommendations.length ? `<div class="principles">${recommendations.map((text) => `<div class="principle">${escapeHtml(text)}</div>`).join("")}</div>` : ""}
    <div class="table-wrap"><table class="data-table"><tbody>
      <tr><th>Criado</th><td>${escapeHtml(formatDate(item.createdAt))}</td></tr>
      <tr><th>Atualizado</th><td>${escapeHtml(formatDate(item.updatedAt))}</td></tr>
      <tr><th>Tipo</th><td><code>${escapeHtml(item.kind)}</code></td></tr>
      <tr><th>Origem</th><td>${escapeHtml(reviewSource(item))}</td></tr>
      <tr><th>recordHash</th><td><code>${escapeHtml(item.recordHash)}</code></td></tr>
    </tbody></table></div>
    ${resolution ? `<div class="warning-callout"><strong>Decisão: ${escapeHtml(resolution.decision)}</strong><span>${escapeHtml(resolution.reason)} · ${escapeHtml(resolution.reviewerId)} · ${escapeHtml(formatDate(resolution.reviewedAt))}</span></div>` : ""}
    ${item.status === "pending" ? `<div class="page-actions">
      <button class="button button-primary" data-resolve="acknowledge" data-review-id="${escapeHtml(item.reviewId)}">Reconhecer</button>
      <button class="button button-ghost" data-resolve="needs-more-information" data-review-id="${escapeHtml(item.reviewId)}">Pedir mais informação</button>
      <button class="button button-danger" data-resolve="reject" data-review-id="${escapeHtml(item.reviewId)}">Rejeitar</button>
    </div>` : ""}
    <details><summary>Payload técnico</summary><pre class="code-input">${escapeHtml(JSON.stringify(item.payload ?? {}, null, 2))}</pre></details>
  `;
}

async function loadReviews() {
  setBusy(true);
  try {
    const payload = await api("/api/reviews");
    state.reviews = payload.reviews ?? [];
    if (state.selectedReviewId && !state.reviews.some((item) => item.reviewId === state.selectedReviewId)) state.selectedReviewId = null;
    render();
  } finally {
    setBusy(false);
  }
}

function openResolution(reviewId, decision) {
  const item = state.reviews.find((candidate) => candidate.reviewId === reviewId);
  if (!item || item.status !== "pending") return;
  state.selectedReviewId = reviewId;
  elements.form.dataset.reviewId = reviewId;
  elements.form.dataset.decision = decision;
  const labels = {
    acknowledge: "Reconhecer revisão",
    reject: "Rejeitar item",
    "needs-more-information": "Solicitar mais informação",
    approve: "Aprovar item"
  };
  elements.dialogTitle.textContent = labels[decision] ?? "Resolver revisão";
  elements.dialogBody.innerHTML = `
    <div class="rule-callout field-wide"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.summary)}</span></div>
    <label class="field field-wide"><span>Identificação do revisor</span><input name="reviewerId" required maxlength="160" value="workbench-user"></label>
    <label class="field field-wide"><span>Justificativa da decisão</span><textarea name="reason" rows="5" required maxlength="8000" placeholder="Registre o fundamento humano desta decisão."></textarea></label>
  `;
  elements.dialog.showModal();
}

elements.refreshButton.addEventListener("click", () => loadReviews().catch((error) => toast(error.message, "error")));

document.addEventListener("click", (event) => {
  const close = event.target.closest("[data-close-dialog]");
  if (close) return close.closest("dialog")?.close();
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    state.filter = filter.dataset.filter;
    return render();
  }
  const review = event.target.closest("[data-review-id]");
  const decision = event.target.closest("[data-resolve]");
  if (decision) return openResolution(decision.dataset.reviewId, decision.dataset.resolve);
  if (review) {
    state.selectedReviewId = review.dataset.reviewId;
    return render();
  }
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const reviewId = elements.form.dataset.reviewId;
  const decision = elements.form.dataset.decision;
  const item = state.reviews.find((candidate) => candidate.reviewId === reviewId);
  if (!item) return;
  const data = Object.fromEntries(new FormData(elements.form));
  try {
    await api(`/api/reviews/${encodeURIComponent(reviewId)}/resolve`, {
      method: "POST",
      body: {
        reviewerId: data.reviewerId,
        decision,
        reason: data.reason,
        expectedRecordHash: item.recordHash
      }
    });
    elements.dialog.close();
    elements.form.reset();
    toast("Decisão humana registrada com integridade e correlação ao item original.");
    await loadReviews();
  } catch (error) {
    toast(error.message, "error");
  }
});

async function bootstrap() {
  try {
    state.session = await api("/api/session");
    elements.reviewVersion.textContent = state.session.humanReviewVersion ?? "0.1.0";
    if (!state.session.localOnly) toast("Modo remoto ativo sem autenticação integrada.", "error");
    await loadReviews();
  } catch (error) {
    elements.root.innerHTML = `<article class="panel empty-panel"><div><p>Não foi possível abrir a fila de revisão.</p><code>${escapeHtml(error.message)}</code></div></article>`;
    toast(error.message, "error");
  }
}

bootstrap();
