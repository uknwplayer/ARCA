import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFixtureTransport } from "../packages/pncp-connector/src/index.ts";
import { runPncpOperationalCollection } from "../packages/pncp-connector/src/operational.ts";
import {
  buildPncpDeepeningPlan,
  PNCP_DEEPENING_CHECKPOINT_FORMAT,
  PNCP_DEEPENING_RESULT_FORMAT,
  runPncpDiscoveryDeepening
} from "../packages/pncp-connector/src/deepening.ts";

function target(n) {
  return {
    procurementControlNumber: `12345678000195-1-${String(n).padStart(6, "0")}/2026`,
    cnpj: "12345678000195",
    ano: 2026,
    sequencial: n,
    objectDescription: `Objeto sintético ${n}`,
    modalityId: 6,
    modalityName: "Pregão"
  };
}

function discovery(targets = [target(1), target(2), target(3)]) {
  return {
    format: "arca-pncp-discovery-result-v2",
    investigationId: "INV-PNCP-C4-TEST",
    scope: { cnpj: "12345678000195", dataInicial: "20260901", dataFinal: "20260903", inclusiveDays: 3 },
    targets
  };
}

function fixturesFor(t) {
  const base = t.sequencial;
  return {
    contratacao: {
      numeroControlePNCP: t.procurementControlNumber,
      processo: `PROC-${base}/2026`,
      modalidadeNome: "Pregao",
      objetoCompra: `Objeto sintético ${base}`,
      dataPublicacaoPncp: `2026-09-0${Math.min(base, 9)}T12:00:00Z`
    },
    itens: [{
      numeroItem: 1,
      descricao: `Item sintético ${base}`,
      quantidade: 10 + base,
      unidadeMedida: "unidade",
      valorUnitarioEstimado: 10 + base
    }],
    contratos: [{
      numeroControlePNCP: `12345678000195-2-${String(base).padStart(6, "0")}/2026`,
      numeroControlePNCPCompra: t.procurementControlNumber,
      niFornecedor: "11222333000181",
      nomeRazaoSocialFornecedor: "Fornecedor Fixture",
      valorInicial: 100 + base
    }],
    "resultados-item-1": {
      listaResultados: [{ numeroItem: 1, niFornecedor: "11222333000181", valorUnitarioHomologado: 9 + base }]
    }
  };
}

function fixtureRunner(root, calls = []) {
  return async (t, context) => {
    calls.push(t.sequencial);
    return runPncpOperationalCollection({
      target: t,
      investigationId: context.investigationId,
      sourceId: context.sourceId,
      actor: context.actor,
      home: context.home
    }, { transport: createFixtureTransport(fixturesFor(t)) });
  };
}

function input(root, extra = {}) {
  return {
    discovery: discovery(),
    investigationId: "INV-PNCP-C4-TEST",
    sourceId: "SRC-PNCP-PUBLIC",
    actor: { id: "c4-test", role: "human-operator" },
    home: join(root, "arca-home"),
    ...extra
  };
}

test("C4 plano deduplica e ordena alvos deterministicamente", () => {
  const plan = buildPncpDeepeningPlan(discovery([target(3), target(1), target(2), target(1)]), {
    maxTargetsPerRun: 2,
    maxFailuresPerRun: 1
  });
  assert.equal(plan.targets.length, 3);
  assert.equal(plan.targets[0].sequencial, 1);
  assert.equal(plan.targets[2].sequencial, 3);
  assert.deepEqual(plan.budgets, { maxTargetsPerRun: 2, maxFailuresPerRun: 1 });
  assert.equal(plan.checkpointRequired, true);
  assert.equal(plan.coreMutationPerformed, false);
});

test("C4 bloqueia aprofundamento real sem opt-in e confirmação de rede", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "arca-pncp-c4-network-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(runPncpDiscoveryDeepening(input(root)), /allowNetwork=true/);
  await assert.rejects(runPncpDiscoveryDeepening(input(root, { allowNetwork: true, confirmation: "ERRADA" })), /confirmacao de rede invalida/);
});

test("C4 processa somente o orçamento da rodada e persiste checkpoint", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "arca-pncp-c4-budget-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const result = await runPncpDiscoveryDeepening(input(root, { maxTargetsPerRun: 2 }), {
    deepeningRunner: fixtureRunner(root, calls)
  });
  assert.equal(result.format, PNCP_DEEPENING_RESULT_FORMAT);
  assert.deepEqual(calls, [1, 2]);
  assert.equal(result.stats.completedThisRun, 2);
  assert.equal(result.stats.completedTotal, 2);
  assert.equal(result.stats.pendingTotal, 1);
  const checkpoint = JSON.parse(await readFile(result.checkpointPath, "utf8"));
  assert.equal(checkpoint.format, PNCP_DEEPENING_CHECKPOINT_FORMAT);
  assert.equal(Object.keys(checkpoint.completed).length, 2);
});

test("C4 retoma checkpoint e não repete alvos concluídos", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "arca-pncp-c4-resume-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const runner = fixtureRunner(root, calls);
  const first = await runPncpDiscoveryDeepening(input(root, { maxTargetsPerRun: 2 }), { deepeningRunner: runner });
  const second = await runPncpDiscoveryDeepening(input(root, { maxTargetsPerRun: 2, checkpointPath: first.checkpointPath }), { deepeningRunner: runner });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(second.stats.completedThisRun, 1);
  assert.equal(second.stats.completedTotal, 3);
  assert.equal(second.stats.pendingTotal, 0);
  assert.equal(second.invariants.completedTargetsNotRepeated, true);
});

test("C4 registra falha e não a repete sem retryFailed explicito", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "arca-pncp-c4-failure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const runner = async (tg, context) => {
    calls.push(tg.sequencial);
    if (tg.sequencial === 2) throw new Error("falha sintetica de aprofundamento");
    return fixtureRunner(root)(tg, context);
  };
  const first = await runPncpDiscoveryDeepening(input(root, { maxTargetsPerRun: 3, maxFailuresPerRun: 1 }), { deepeningRunner: runner });
  assert.deepEqual(calls, [1, 2]);
  assert.equal(first.stats.failedTotal, 1);
  const second = await runPncpDiscoveryDeepening(input(root, { checkpointPath: first.checkpointPath, maxTargetsPerRun: 3 }), { deepeningRunner: runner });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(second.stats.completedTotal, 2);
  assert.equal(second.stats.failedTotal, 1);
});

test("C4 rejeita checkpoint pertencente a corpus diferente", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "arca-pncp-c4-fingerprint-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await runPncpDiscoveryDeepening(input(root, { maxTargetsPerRun: 1 }), {
    deepeningRunner: fixtureRunner(root)
  });
  await assert.rejects(
    runPncpDiscoveryDeepening(input(root, {
      discovery: discovery([target(1), target(2), target(4)]),
      checkpointPath: first.checkpointPath
    }), { deepeningRunner: fixtureRunner(root) }),
    /outro corpus/
  );
});

test("C4 agrega relatórios C2 em corpus analítico sem promover conclusão", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "arca-pncp-c4-corpus-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runPncpDiscoveryDeepening(input(root, { maxTargetsPerRun: 3 }), {
    deepeningRunner: fixtureRunner(root)
  });
  assert.equal(result.corpus.reportCount, 3);
  assert.equal(result.corpus.procurementRecordCount, 3);
  assert.equal(result.corpus.itemCount, 3);
  assert.equal(result.corpus.procurementProfile.humanReviewRequired, true);
  assert.equal(result.corpus.itemComparabilityProfile.humanReviewRequired, true);
  assert.equal(result.invariants.anomalyIsNotIrregularity, true);
  assert.equal(result.invariants.coreMutationPerformed, false);
});
