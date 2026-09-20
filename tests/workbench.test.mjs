import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkbenchServer, MAX_REQUEST_BYTES } from "../packages/workbench/src/server.ts";

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), "arca-workbench-test-"));
  const instance = createWorkbenchServer({ home, host: "127.0.0.1", port: 0 });
  const address = await instance.start();
  t.after(async () => {
    await instance.stop();
    await rm(home, { recursive: true, force: true });
  });
  const sessionResponse = await fetch(`${address.url}/api/session`);
  const session = await sessionResponse.json();
  const json = async (path, { method = "GET", body, csrf = true, headers = {} } = {}) => {
    const response = await fetch(`${address.url}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(csrf && !["GET", "HEAD"].includes(method) ? { "X-ARCA-CSRF": session.csrfToken } : {}),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json();
    return { response, payload };
  };
  return { instance, address, session, json };
}

test("Workbench serve interface local com cabeçalhos defensivos", async (t) => {
  const { address, session } = await fixture(t);
  assert.equal(session.localOnly, true);
  assert.equal(session.workbenchVersion, "0.2.2");
  assert.equal(session.humanReviewVersion, "0.1.0");
  const response = await fetch(`${address.url}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(html, /ARCA Workbench/);
  assert.match(html, /Inbox de revisão/);
});

test("API exige CSRF e rejeita Origin divergente", async (t) => {
  const { address, json } = await fixture(t);
  const body = { question: "CSRF?", objective: "Testar.", scope: "Fixture.", limits: "Fixture." };
  const withoutCsrf = await json("/api/investigations", { method: "POST", body, csrf: false });
  assert.equal(withoutCsrf.response.status, 403);
  assert.equal(withoutCsrf.payload.error.code, "CSRF_REJECTED");
  const badOrigin = await fetch(`${address.url}/api/health`, { headers: { Origin: "https://evil.invalid" } });
  assert.equal(badOrigin.status, 403);
  assert.equal((await badOrigin.json()).error.code, "ORIGIN_REJECTED");
});

test("fluxo HTTP cria investigação e artefato com concorrência explícita", async (t) => {
  const { json } = await fixture(t);
  const created = await json("/api/investigations", { method: "POST", body: {
    question: "A API preserva o grafo?", objective: "Testar o Workbench.", scope: "Fixture local.", limits: "Simulação.", simulation: true
  }});
  assert.equal(created.response.status, 201);
  const investigationId = created.payload.investigation.id;
  const eventHead = created.payload.projection.eventHead;
  const source = await json(`/api/investigations/${investigationId}/objects`, { method: "POST", body: {
    type: "SRC", data: { name: "Fonte da fixture" }, expectedEventHead: eventHead
  }});
  assert.equal(source.response.status, 201);
  assert.match(source.payload.id, /^SRC-/);
  const stale = await json(`/api/investigations/${investigationId}/objects`, { method: "POST", body: {
    type: "SRC", data: { name: "Fonte obsoleta" }, expectedEventHead: eventHead
  }});
  assert.equal(stale.response.status, 409);
  assert.match(stale.payload.error.message, /Conflito de concorrência/);
  const status = await json(`/api/investigations/${investigationId}/status`);
  assert.equal(status.payload.sequence, 2);
});

test("API recusa corpo maior que 1 MiB", async (t) => {
  const { address, session } = await fixture(t);
  const response = await fetch(`${address.url}/api/investigations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ARCA-CSRF": session.csrfToken },
    body: JSON.stringify({ question: "x".repeat(MAX_REQUEST_BYTES + 1) })
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "BODY_TOO_LARGE");
});

test("rotas do Agent Bundle registram e aplicam proposta após revisão", async (t) => {
  const { json } = await fixture(t);
  const created = await json("/api/investigations", { method: "POST", body: {
    question: "Revisão humana?", objective: "Testar agente.", scope: "Fixture.", limits: "Fixture.", simulation: true
  }});
  const investigationId = created.payload.investigation.id;
  const proposalInput = {
    format: "arca-agent-proposal-v1",
    investigationId,
    expectedEventHead: created.payload.projection.eventHead,
    agent: { id: "http-fixture" },
    intent: "Criar uma lacuna explícita.",
    operation: { kind: "create_object", objectType: "GAP", data: { description: "Falta material primário.", gapState: "L0" } },
    assumptions: [], uncertainties: ["Busca ainda não executada."], requiresHumanReview: true
  };
  const proposal = await json("/api/agent/proposals", { method: "POST", body: proposalInput });
  assert.equal(proposal.response.status, 201);
  assert.equal(proposal.payload.status, "pending");
  const proposalId = proposal.payload.proposalId;
  const applied = await json(`/api/agent/proposals/${proposalId}/apply`, { method: "POST", body: {
    reviewerId: "revisor-http", confirmation: `APLICAR ${proposalId}`
  }});
  assert.equal(applied.response.status, 200);
  assert.equal(applied.payload.proposal.status, "applied");
  assert.equal(applied.payload.event.actor.id, "revisor-http");
  const stateResponse = await json(`/api/investigations/${investigationId}`);
  assert.equal(stateResponse.payload.objects.gaps.length, 1);
});

test("Workbench materializa resultado Machine Bridge em fila e registra decisão humana", async (t) => {
  const { json } = await fixture(t);
  const bridgeResult = {
    format: "arca-result-v1",
    protocolVersion: 3,
    jobId: "mb-http-aie-1",
    workerId: "github-actions",
    status: "completed",
    output: {
      format: "arca-aie-analysis-v1",
      engineVersion: "0.4.0",
      humanReviewRequired: true,
      findings: [{
        findingId: "FND-HTTP-1",
        summary: "Sinal sintético para revisão",
        triage: "investigate",
        humanReviewRequired: true,
        gaps: ["Confirmar fonte primária."],
        observed: { value: 1000 }
      }]
    }
  };

  const imported = await json("/api/reviews/import-machine-bridge", { method: "POST", body: bridgeResult });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.payload.count, 1);
  const item = imported.payload.created[0];
  assert.equal(item.status, "pending");
  assert.equal(item.source.jobId, "mb-http-aie-1");

  const pending = await json("/api/reviews?status=pending&sourceSystem=machine-bridge");
  assert.equal(pending.response.status, 200);
  assert.equal(pending.payload.reviews.length, 1);
  assert.equal(pending.payload.reviews[0].reviewId, item.reviewId);

  const resolved = await json(`/api/reviews/${item.reviewId}/resolve`, { method: "POST", body: {
    reviewerId: "revisor-http",
    decision: "acknowledge",
    reason: "Sinal revisado; não é conclusão substantiva.",
    expectedRecordHash: item.recordHash
  }});
  assert.equal(resolved.response.status, 200);
  assert.equal(resolved.payload.status, "resolved");
  assert.equal(resolved.payload.resolution.reviewerId, "revisor-http");

  const stale = await json(`/api/reviews/${item.reviewId}/resolve`, { method: "POST", body: {
    reviewerId: "outro-revisor",
    decision: "reject",
    reason: "Tentativa concorrente.",
    expectedRecordHash: item.recordHash
  }});
  assert.equal(stale.response.status, 409);
});

test("servidor recusa bind não local sem autorização explícita", () => {
  assert.throws(
    () => createWorkbenchServer({ home: "/tmp/arca-test-remote", host: "0.0.0.0", port: 0 }),
    /recusa bind remoto/
  );
});
