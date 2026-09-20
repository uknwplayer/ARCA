import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildPncpBlindCorpusFromReports,
  freezePncpBlindCorpusFromDeepening,
  PNCP_BLIND_FREEZE_FORMAT
} from "../packages/pncp-connector/src/blind-corpus.ts";

const investigationId = "INV-PNCP-D2-FREEZE";
const discoveryFingerprint = "a".repeat(64);

function checkpointTarget(sequence = 1) {
  return {
    procurementControlNumber: `12345678000195-1-${String(sequence).padStart(6, "0")}/2026`,
    cnpj: "12345678000195",
    ano: 2026,
    sequencial: sequence,
    objectDescription: `Objeto ${sequence}`
  };
}

function operationalReport(sequence = 1) {
  const target = checkpointTarget(sequence);
  return {
    format: "arca-pncp-operational-result-v1",
    target: { cnpj: target.cnpj, ano: target.ano, sequencial: target.sequencial },
    investigationId,
    sourceId: "SRC-PNCP-PUBLIC",
    retrievedAt: "2026-09-15T12:00:00.000Z",
    networkUsed: true,
    publicAccessOnly: true,
    custody: {
      analysisMayProceed: true,
      capturedCount: 1,
      acquisitions: [{
        acquisitionId: `ACQ-PNCP-${sequence}`,
        eventHead: "b".repeat(64),
        originalSha256: String(sequence).padStart(64, "0"),
        locator: `https://pncp.gov.br/api/pncp/v1/orgaos/12345678000195/compras/2026/${sequence}`,
        proposal: { operation: "DOC" }
      }]
    },
    analysis: {
      procurementRecords: [{
        format: "arca-aie-procurement-record-v1",
        procurementId: target.procurementControlNumber,
        processId: `PROC-${sequence}`,
        supplierId: "CNPJ-11222333000181",
        supplierCnpj: "11222333000181",
        supplierName: "Fornecedor Fixture",
        amount: 100 + sequence,
        participantCount: 3,
        additivePercent: 0,
        modality: "Pregao",
        objectDescription: target.objectDescription,
        publishedAt: "2026-09-15T10:00:00Z",
        sourceRefs: [`pncp:${target.procurementControlNumber}`],
        procurementProfile: { mustNotLeak: true }
      }],
      procurementProfile: { findings: [{ detectorId: "MUST-NOT-LEAK" }] },
      items: [{
        format: "arca-aie-procurement-item-v1",
        itemId: `ITEM-${sequence}`,
        procurementId: target.procurementControlNumber,
        itemNumber: "1",
        description: "Item fixture",
        objectClass: "item fixture",
        quantity: 10,
        unit: "unit",
        unitPrice: 10,
        totalPrice: 100,
        comparabilityKey: "class:item fixture|unit:unit",
        sourceRefs: [`pncp:${target.procurementControlNumber}`],
        itemComparabilityProfile: { mustNotLeak: true }
      }],
      itemComparabilityProfile: { findings: [{ detectorId: "MUST-NOT-LEAK" }] }
    },
    invariants: {
      custodyCompletedBeforeAnalysis: true,
      coreMutationPerformed: false,
      anomalyIsNotIrregularity: true,
      humanReviewRequired: true
    }
  };
}

function buildEntry(sequence = 1) {
  const target = checkpointTarget(sequence);
  return { key: target.procurementControlNumber, checkpointTarget: target, report: operationalReport(sequence) };
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function fixtureHome({ complete = true, outsideReport = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "arca-pncp-blind-"));
  const home = join(root, "arca-home");
  const checkpointPath = join(home, "checkpoints", "pncp-deepening", "checkpoint.json");
  const summaryPath = join(home, "runs", "pncp-deepening", "summary.json");
  const reportPath = outsideReport ? join(root, "outside-report.json") : join(home, "runs", "pncp-deepening", "target-1.json");
  const target = checkpointTarget(1);
  await writeJson(reportPath, operationalReport(1));
  await writeJson(checkpointPath, {
    format: "arca-pncp-deepening-checkpoint-v1",
    investigationId,
    discoveryFingerprint,
    completed: {
      [target.procurementControlNumber]: { target, reportPath, completedAt: "2026-09-15T12:01:00Z" }
    },
    failed: {}
  });
  await writeJson(summaryPath, {
    format: "arca-pncp-deepening-result-v1",
    investigationId,
    discoveryFingerprint,
    checkpointPath,
    stats: {
      discoveredTargets: complete ? 1 : 2,
      selectedThisRun: 1,
      completedThisRun: 1,
      failedThisRun: 0,
      completedTotal: 1,
      failedTotal: 0,
      pendingTotal: complete ? 0 : 1,
      reportsAvailable: 1
    }
  });
  return { root, home, checkpointPath, summaryPath };
}

test("D2 PNCP freeze gera corpus sem perfis ou achados do C2", () => {
  const corpus = buildPncpBlindCorpusFromReports([buildEntry(1)], {
    investigationId,
    discoveryFingerprint,
    corpusId: "D2-PNCP-UNIT"
  });
  assert.equal(corpus.format, "arca-aie-blind-procurement-corpus-v1");
  assert.equal(corpus.samples.length, 1);
  assert.equal(corpus.samples[0].records[0].procurementProfile, undefined);
  assert.equal(corpus.samples[0].items[0].itemComparabilityProfile, undefined);
  assert.equal(JSON.stringify(corpus).includes("MUST-NOT-LEAK"), false);
});

test("D2 PNCP freeze preserva referencia publica e resumo verificavel de custodia", () => {
  const corpus = buildPncpBlindCorpusFromReports([buildEntry(1)], {
    investigationId,
    discoveryFingerprint
  });
  const sample = corpus.samples[0];
  assert.match(sample.records[0].sourceRef, /^pncp:/);
  assert.equal(sample.metadata.publicAccessOnly, true);
  assert.equal(sample.metadata.custody.analysisMayProceed, true);
  assert.equal(sample.metadata.custody.acquisitionCount, 1);
  assert.equal(sample.metadata.custody.acquisitions[0].acquisitionId, "ACQ-PNCP-1");
  assert.match(sample.metadata.custody.acquisitions[0].locator, /^https:\/\/pncp\.gov\.br\//);
});

test("D2 PNCP freeze rejeita relatorio que nao corresponde ao alvo do checkpoint", () => {
  const entry = buildEntry(1);
  entry.report.target.sequencial = 99;
  assert.throws(
    () => buildPncpBlindCorpusFromReports([entry], { investigationId, discoveryFingerprint }),
    /nao corresponde ao alvo/
  );
});

test("D2 PNCP freeze recusa coleta C4 incompleta por padrao", async (t) => {
  const fx = await fixtureHome({ complete: false });
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await assert.rejects(
    freezePncpBlindCorpusFromDeepening({ home: fx.home, checkpointPath: fx.checkpointPath, summaryPath: fx.summaryPath }),
    /corpus C4 incompleto/
  );
});

test("D2 PNCP freeze permite coleta incompleta somente com opt-in explicito", async (t) => {
  const fx = await fixtureHome({ complete: false });
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  const frozen = await freezePncpBlindCorpusFromDeepening({
    home: fx.home,
    checkpointPath: fx.checkpointPath,
    summaryPath: fx.summaryPath,
    allowIncomplete: true,
    corpusId: "D2-PNCP-INCOMPLETE"
  });
  assert.equal(frozen.format, PNCP_BLIND_FREEZE_FORMAT);
  assert.equal(frozen.readiness.complete, false);
  assert.equal(frozen.corpus.samples.length, 1);
  assert.equal(frozen.manifest.corpusId, "D2-PNCP-INCOMPLETE");
  assert.equal(frozen.invariants.incompleteCorpusRequiresExplicitOptIn, true);
});

test("D2 PNCP freeze recusa reportPath fora do ARCA_HOME", async (t) => {
  const fx = await fixtureHome({ outsideReport: true });
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await assert.rejects(
    freezePncpBlindCorpusFromDeepening({ home: fx.home, checkpointPath: fx.checkpointPath, summaryPath: fx.summaryPath }),
    /reportPath fora do ARCA_HOME/
  );
});

