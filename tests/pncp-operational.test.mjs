import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFixtureTransport } from "../packages/pncp-connector/src/index.ts";
import {
  buildPncpOperationalPlan,
  PNCP_NETWORK_CONFIRMATION,
  runPncpOperationalCollection
} from "../packages/pncp-connector/src/operational.ts";

const target = { cnpj: "12345678000195", ano: 2026, sequencial: 7 };

function fixtures() {
  return {
    contratacao: {
      numeroControlePNCP: "12345678000195-1-000007/2026",
      processo: "PROC-7/2026",
      modalidadeNome: "Pregao",
      objetoCompra: "Alimentos",
      dataPublicacaoPncp: "2026-09-01T12:00:00Z"
    },
    itens: [
      { numeroItem: 1, descricao: "Arroz tipo 1", quantidade: 100, unidadeMedida: "kg", valorUnitarioEstimado: 5 },
      { numeroItem: 2, descricao: "Feijao carioca", quantidade: 50, unidadeMedida: "kg", valorUnitarioEstimado: 8 }
    ],
    contratos: [{
      numeroControlePNCP: "12345678000195-2-000003/2026",
      numeroControlePNCPCompra: "12345678000195-1-000007/2026",
      niFornecedor: "11222333000181",
      nomeRazaoSocialFornecedor: "Fornecedor Fixture",
      valorInicial: 900
    }],
    "fontes-orcamentarias": { fonteOrcamentaria: [{ id: 1, nome: "Tesouro" }] },
    "resultados-item-1": { listaResultados: [{ numeroItem: 1, niFornecedor: "11222333000181", valorUnitarioHomologado: 4.9 }] },
    "resultados-item-2": { listaResultados: [{ numeroItem: 2, niFornecedor: "11222333000181", valorUnitarioHomologado: 7.8 }] }
  };
}

function operationalInput(root, extra = {}) {
  return {
    target,
    investigationId: "INV-PNCP-C2-TEST",
    sourceId: "SRC-PNCP-PUBLIC",
    actor: { id: "c2-test", role: "human-operator" },
    home: join(root, "arca-home"),
    ...extra
  };
}

test("C2 plano operacional permanece offline e explicita confirmacao de rede", () => {
  const plan = buildPncpOperationalPlan(target);
  assert.equal(plan.format, "arca-pncp-operational-plan-v1");
  assert.equal(plan.networkDefault, "blocked");
  assert.equal(plan.networkActivationRequires.confirmation, PNCP_NETWORK_CONFIRMATION);
  assert.equal(plan.custodyRequiredBeforeAnalysis, true);
  assert.equal(plan.coreMutationPerformed, false);
});

test("C2 recusa transporte de rede sem opt-in e confirmacao textual exata", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "arca-pncp-c2-auth-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const networkTransport = { networkEnabled: true, async get() { throw new Error("nao deveria executar"); } };
  await assert.rejects(
    runPncpOperationalCollection(operationalInput(root), { transport: networkTransport }),
    /allowNetwork=true/
  );
  await assert.rejects(
    runPncpOperationalCollection(operationalInput(root, { allowNetwork: true, confirmation: "ERRADA" }), { transport: networkTransport }),
    /confirmacao de rede invalida/
  );
});

test("C2 fixture offline preserva respostas em custodia antes de liberar AIE", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "arca-pncp-c2-flow-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runPncpOperationalCollection(operationalInput(root), {
    transport: createFixtureTransport(fixtures())
  });
  assert.equal(result.format, "arca-pncp-operational-result-v1");
  assert.equal(result.networkUsed, false);
  assert.equal(result.custody.analysisMayProceed, true);
  assert.equal(result.custody.capturedCount, result.sourceResponses.filter((entry) => entry.ok).length);
  assert.ok(result.custody.acquisitions.every((entry) => entry.proposal.humanReviewRequired === true));
  assert.equal(result.invariants.custodyCompletedBeforeAnalysis, true);
});

test("C2 entrega snapshot preservado ao perfil AIE sem promover anomalia a irregularidade", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "arca-pncp-c2-aie-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runPncpOperationalCollection(operationalInput(root), {
    transport: createFixtureTransport(fixtures())
  });
  assert.equal(result.analysis.procurementRecords.length, 1);
  assert.equal(result.analysis.procurementProfile.humanReviewRequired, true);
  assert.equal(result.analysis.items.length, 2);
  assert.equal(result.analysis.itemComparabilityProfile.humanReviewRequired, true);
  assert.equal(result.invariants.anomalyIsNotIrregularity, true);
  assert.equal(result.invariants.coreMutationPerformed, false);
});

test("C2 resumo operacional nao replica bytes brutos da resposta fora da custodia", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "arca-pncp-c2-summary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runPncpOperationalCollection(operationalInput(root), {
    transport: createFixtureTransport(fixtures())
  });
  assert.ok(result.sourceResponses.length > 0);
  assert.ok(result.sourceResponses.every((entry) => !("bytes" in entry)));
  assert.ok(result.sourceResponses.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
});

test("C2 grava relatorio operacional reproduzivel quando --out equivalente e informado", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "arca-pncp-c2-out-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const out = join(root, "reports", "pncp.json");
  const result = await runPncpOperationalCollection(operationalInput(root, { out }), {
    transport: createFixtureTransport(fixtures())
  });
  assert.equal(result.outputPath, out);
  const stored = JSON.parse(await readFile(out, "utf8"));
  assert.equal(stored.format, "arca-pncp-operational-result-v1");
  assert.equal(stored.investigationId, "INV-PNCP-C2-TEST");
  assert.equal(stored.custody.analysisMayProceed, true);
  assert.equal(stored.invariants.humanReviewRequired, true);
});
