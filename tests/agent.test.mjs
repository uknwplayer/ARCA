import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentProposalStore } from "../packages/agent/src/index.ts";
import { ArcaCore } from "../packages/core/src/index.ts";

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), "arca-agent-test-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const core = new ArcaCore(home);
  const created = await core.createInvestigation({
    question: "O agente permanece sem autoridade de escrita?",
    objective: "Testar o contrato de propostas.",
    scope: "Fixture local.",
    limits: "Sem chamada externa.",
    simulation: true
  });
  const store = new AgentProposalStore(home, core);
  return { home, core, store, investigationId: created.investigation.id, eventHead: created.projection.eventHead };
}

function proposal({ investigationId, eventHead, operation, overrides = {} }) {
  return {
    format: "arca-agent-proposal-v1",
    investigationId,
    expectedEventHead: eventHead,
    agent: { id: "fixture-agent", provider: "local", model: "deterministic-fixture" },
    intent: "Registrar uma lacuna observada sem convertê-la em prova.",
    operation: operation ?? {
      kind: "create_object",
      objectType: "GAP",
      data: { description: "Material primário ainda não localizado.", gapState: "L0", likelyToChangeResult: true }
    },
    assumptions: ["A investigação existe."],
    uncertainties: ["O material pode ser localizado posteriormente."],
    requiresHumanReview: true,
    ...overrides
  };
}

test("proposta aprovada aplica uma única operação e vincula o evento ao revisor humano", async (t) => {
  const { core, store, investigationId, eventHead } = await fixture(t);
  const created = await store.create(proposal({ investigationId, eventHead }));
  assert.equal(created.status, "pending");
  assert.equal(created.freshness, "current");
  const applied = await store.apply({
    proposalId: created.proposalId,
    reviewerId: "analista-fixture",
    confirmation: `APLICAR ${created.proposalId}`
  });
  assert.equal(applied.proposal.status, "applied");
  assert.equal(applied.event.operation, "OBJECT_CREATE");
  assert.equal(applied.event.actor.type, "human");
  assert.equal(applied.event.actor.id, "analista-fixture");
  assert.match(applied.event.actor.method, new RegExp(`proposal=${created.proposalId};sha256=${created.proposalHash}`));
  const finalState = await core.get(investigationId);
  assert.equal(finalState.objects.gaps.length, 1);
  assert.equal((await core.store.loadEvents(investigationId)).length, 2);
});

test("aplicação exige a confirmação textual exata e não altera o Core em caso de erro", async (t) => {
  const { core, store, investigationId, eventHead } = await fixture(t);
  const created = await store.create(proposal({ investigationId, eventHead }));
  await assert.rejects(
    store.apply({ proposalId: created.proposalId, reviewerId: "revisor", confirmation: "APLICAR" }),
    /digite exatamente/
  );
  assert.equal((await core.store.loadEvents(investigationId)).length, 1);
  assert.equal((await store.get(created.proposalId)).status, "pending");
});

test("proposta fica obsoleta após nova mutação e falha fechada", async (t) => {
  const { core, store, investigationId, eventHead } = await fixture(t);
  const created = await store.create(proposal({ investigationId, eventHead }));
  await core.addObject({ investigationId, type: "SRC", data: { name: "Mutação concorrente" } });
  const stale = await store.get(created.proposalId);
  assert.equal(stale.freshness, "stale");
  await assert.rejects(
    store.apply({ proposalId: created.proposalId, reviewerId: "revisor", confirmation: `APLICAR ${created.proposalId}` }),
    /Proposta obsoleta/
  );
  assert.equal((await core.get(investigationId)).objects.gaps.length, 0);
});

test("adulteração do conteúdo ou do estado da proposta é detectada", async (t) => {
  const { home, store, investigationId, eventHead } = await fixture(t);
  const created = await store.create(proposal({ investigationId, eventHead }));
  const path = join(home, "agent-proposals", `${created.proposalId}.json`);
  const stored = JSON.parse(await readFile(path, "utf8"));
  stored.operation.data.description = "Conteúdo adulterado fora do Workbench";
  await writeFile(path, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  await assert.rejects(store.get(created.proposalId), /proposalHash inválido/);
});

test("contrato rejeita revisão desabilitada e evidência fora de INF → PRO", async (t) => {
  const { store, investigationId, eventHead } = await fixture(t);
  await assert.rejects(
    store.create(proposal({ investigationId, eventHead, overrides: { requiresHumanReview: false } })),
    /requiresHumanReview deve ser true/
  );
  await assert.rejects(
    store.create(proposal({
      investigationId,
      eventHead,
      operation: {
        kind: "create_relation",
        from: investigationId,
        to: `Q-${investigationId.slice(4)}`,
        relationType: "supports",
        category: "evidence",
        effect: "supports",
        justification: "Relação deliberadamente inválida."
      }
    })),
    /INF → PRO/
  );
});

test("rejeição é persistida e impede aplicação posterior", async (t) => {
  const { store, investigationId, eventHead } = await fixture(t);
  const created = await store.create(proposal({ investigationId, eventHead }));
  const rejected = await store.reject({ proposalId: created.proposalId, reviewerId: "revisor", reason: "Payload insuficiente." });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.review.decision, "rejected");
  await assert.rejects(
    store.apply({ proposalId: created.proposalId, reviewerId: "revisor", confirmation: `APLICAR ${created.proposalId}` }),
    /já está rejected/
  );
});

test("Core verifica expectedEventHead dentro do bloqueio de escrita", async (t) => {
  const { core, investigationId, eventHead } = await fixture(t);
  await core.addObject({ investigationId, type: "SRC", data: { name: "Primeira escrita" }, expectedEventHead: eventHead });
  await assert.rejects(
    core.addObject({ investigationId, type: "SRC", data: { name: "Escrita obsoleta" }, expectedEventHead: eventHead }),
    /Conflito de concorrência/
  );
  assert.equal((await core.get(investigationId)).objects.sources.length, 1);
});
