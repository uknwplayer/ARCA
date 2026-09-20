import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BLIND_ANSWER_KEY_COMMITMENT_FORMAT,
  BLIND_ANSWER_KEY_FORMAT,
  BLIND_CORPUS_FORMAT,
  BLIND_CORPUS_MANIFEST_FORMAT,
  BLIND_RUN_FORMAT,
  BLIND_SCORE_FORMAT,
  buildBlindCorpusManifest,
  buildBlindProcurementRun,
  compareBlindProcurementRuns,
  createBlindAnswerKeyCommitment,
  scoreBlindProcurementRun,
  scoreCommittedBlindProcurementRun,
  verifyBlindAnswerKeyCommitment
} from "../packages/aie/src/index.ts";

async function fixture(name) {
  return JSON.parse(await readFile(`examples/aie-fixtures/${name}.json`, "utf8"));
}

function corpus(samples, corpusId = "BLIND-PROCUREMENT-D1-SYNTHETIC") {
  return {
    format: BLIND_CORPUS_FORMAT,
    corpusId,
    samples
  };
}

function answerKey(expectations, corpusId = "BLIND-PROCUREMENT-D1-SYNTHETIC") {
  return {
    format: BLIND_ANSWER_KEY_FORMAT,
    corpusId,
    expectations
  };
}

test("D1 recusa rotulos ou answer key embutidos no corpus analisado", () => {
  const contaminated = corpus([{
    sampleId: "S-CONTAMINATED",
    records: [{ id: "R1", amount: 10 }],
    items: [],
    expectedDetectorIds: ["RISK-PRICE-OUTLIER-001"]
  }]);
  assert.throws(() => buildBlindProcurementRun(contaminated), /rotulo cego proibido/);
  const nested = corpus([{
    sampleId: "S-NESTED",
    records: [{ id: "R1", amount: 10, metadata: { groundTruth: "risk" } }],
    items: []
  }]);
  assert.throws(() => buildBlindProcurementRun(nested), /rotulo cego proibido/);
});

test("D1 mesma entrada gera runId e resultado reproduziveis sem acesso ao answer key", async () => {
  const normal = await fixture("procurement-normal");
  const input = corpus([{ sampleId: "S-NORMAL", records: normal, items: [] }]);
  const left = buildBlindProcurementRun(input);
  const right = buildBlindProcurementRun(input);
  assert.equal(left.format, BLIND_RUN_FORMAT);
  assert.equal(left.runId, right.runId);
  assert.equal(left.invariants.answerKeyAvailableDuringAnalysis, false);
  assert.equal(left.corpusFingerprint, right.corpusFingerprint);
  const comparison = compareBlindProcurementRuns(left, right);
  assert.equal(comparison.reproducible, true);
  assert.deepEqual(comparison.changedSampleIds, []);
});

test("D1 corpus de risco encontra os quatro detectores esperados sem receber os rotulos", async () => {
  const risk = await fixture("procurement-risk");
  const run = buildBlindProcurementRun(corpus([{ sampleId: "S-RISK", records: risk, items: [] }]));
  const sample = run.samples[0];
  assert.deepEqual(sample.materialDetectorIds, [
    "RISK-ADDITIVE-BURDEN-001",
    "RISK-CONCENTRATION-001",
    "RISK-LOW-COMPETITION-001",
    "RISK-PRICE-OUTLIER-001"
  ]);
  assert.ok(sample.audits.every((entry) => entry.audit.status === "survived"));
  assert.equal(sample.provenanceCoverage.ratio, 1);
  assert.equal(run.invariants.anomalyIsNotIrregularity, true);
});

test("D1 corpus normal consegue concluir ausencia de achado material nos detectores atuais", async () => {
  const normal = await fixture("procurement-normal");
  const run = buildBlindProcurementRun(corpus([{ sampleId: "S-NORMAL", records: normal, items: [] }]));
  const sample = run.samples[0];
  assert.equal(sample.procurementProfile.findingCount, 0);
  assert.equal(sample.materialFindingCount, 0);
  assert.deepEqual(sample.materialDetectorIds, []);
});

test("D1 avaliacao cega inclui comparabilidade de itens sem misturar grupos materiais", async () => {
  const items = await fixture("procurement-items-synthetic");
  const run = buildBlindProcurementRun(corpus([{ sampleId: "S-ITEM-RISK", records: [], items: items.risk }]));
  const sample = run.samples[0];
  assert.deepEqual(sample.materialDetectorIds, ["RISK-COMPARABLE-UNIT-PRICE-001"]);
  assert.equal(sample.itemComparabilityProfile.findingCount, 1);
  assert.equal(sample.itemComparabilityProfile.humanReviewRequired, true);
});

test("D1 score e calculado somente depois da analise e mede precision recall proveniencia e negativos", async () => {
  const risk = await fixture("procurement-risk");
  const normal = await fixture("procurement-normal");
  const run = buildBlindProcurementRun(corpus([
    { sampleId: "S-RISK", records: risk, items: [] },
    { sampleId: "S-NORMAL", records: normal, items: [] }
  ]));
  const score = scoreBlindProcurementRun(run, answerKey([
    {
      sampleId: "S-RISK",
      expectedDetectorIds: [
        "RISK-PRICE-OUTLIER-001",
        "RISK-LOW-COMPETITION-001",
        "RISK-CONCENTRATION-001",
        "RISK-ADDITIVE-BURDEN-001"
      ]
    },
    { sampleId: "S-NORMAL", expectedDetectorIds: [] }
  ]));
  assert.equal(score.format, BLIND_SCORE_FORMAT);
  assert.equal(score.metrics.truePositive, 4);
  assert.equal(score.metrics.falsePositive, 0);
  assert.equal(score.metrics.falseNegative, 0);
  assert.equal(score.metrics.precision, 1);
  assert.equal(score.metrics.recall, 1);
  assert.equal(score.metrics.f1, 1);
  assert.equal(score.metrics.noFindingAccuracy, 1);
  assert.equal(score.metrics.provenanceCoverage, 1);
  assert.equal(score.metrics.blindTruePositiveCount, 4);
  assert.equal(score.invariants.scoringOccurredAfterAnalysis, true);
  assert.equal(score.invariants.scoreDoesNotDeclareIrregularity, true);
});

test("D1 score torna falsos positivos e falsos negativos explicitos", async () => {
  const risk = await fixture("procurement-risk");
  const run = buildBlindProcurementRun(corpus([{ sampleId: "S-RISK", records: risk, items: [] }]));
  const score = scoreBlindProcurementRun(run, answerKey([{
    sampleId: "S-RISK",
    expectedDetectorIds: ["RISK-LOW-COMPETITION-001", "RISK-NOT-IMPLEMENTED-999"]
  }]));
  assert.equal(score.metrics.truePositive, 1);
  assert.equal(score.metrics.falseNegative, 1);
  assert.equal(score.metrics.falsePositive, 3);
  assert.ok(score.metrics.precision < 1);
  assert.ok(score.metrics.recall < 1);
  assert.deepEqual(score.samples[0].falseNegativeDetectorIds, ["RISK-NOT-IMPLEMENTED-999"]);
});

test("D1 recusa answer key de outro corpus ou cobertura parcial dos samples", async () => {
  const normal = await fixture("procurement-normal");
  const run = buildBlindProcurementRun(corpus([
    { sampleId: "S-1", records: normal, items: [] },
    { sampleId: "S-2", records: normal, items: [] }
  ]));
  assert.throws(
    () => scoreBlindProcurementRun(run, answerKey([], "OUTRO-CORPUS")),
    /outro corpus/
  );
  assert.throws(
    () => scoreBlindProcurementRun(run, answerKey([{ sampleId: "S-1", expectedDetectorIds: [] }])),
    /cobrir exatamente/
  );
});

test("D2-prep manifesto congela fingerprint do corpus e muda quando os dados mudam", async () => {
  const normal = await fixture("procurement-normal");
  const original = corpus([{ sampleId: "S-NORMAL", records: normal, items: [] }], "PUBLIC-CORPUS-PREP-1");
  const changed = corpus([{ sampleId: "S-NORMAL", records: [...normal, { ...normal[0], id: "EXTRA" }], items: [] }], "PUBLIC-CORPUS-PREP-1");
  const first = buildBlindCorpusManifest(original);
  const second = buildBlindCorpusManifest(original);
  const altered = buildBlindCorpusManifest(changed);
  assert.equal(first.format, BLIND_CORPUS_MANIFEST_FORMAT);
  assert.equal(first.corpusFingerprint, second.corpusFingerprint);
  assert.notEqual(first.corpusFingerprint, altered.corpusFingerprint);
  assert.equal(first.invariants.answerKeyIncluded, false);
});

test("D2-prep run fica vinculado ao fingerprint pre-registravel do corpus", async () => {
  const risk = await fixture("procurement-risk");
  const input = corpus([{ sampleId: "S-RISK", records: risk, items: [] }], "PUBLIC-CORPUS-PREP-2");
  const manifest = buildBlindCorpusManifest(input);
  const run = buildBlindProcurementRun(input);
  assert.equal(run.corpusFingerprint, manifest.corpusFingerprint);
  assert.equal(run.invariants.corpusFingerprintBound, true);
});

test("D2-prep commitment nao inclui answer key nem nonce e usa SHA-256", () => {
  const key = answerKey([{ sampleId: "S-1", expectedDetectorIds: [] }], "PUBLIC-CORPUS-PREP-3");
  const nonce = "segredo-pre-registro-32-bytes-minimo-123456";
  const commitment = createBlindAnswerKeyCommitment(key, nonce);
  assert.equal(commitment.format, BLIND_ANSWER_KEY_COMMITMENT_FORMAT);
  assert.equal(commitment.algorithm, "sha256");
  assert.match(commitment.commitment, /^[a-f0-9]{64}$/);
  assert.equal(commitment.answerKeyIncluded, false);
  assert.equal("nonce" in commitment, false);
  assert.doesNotMatch(JSON.stringify(commitment), /RISK-|segredo-pre-registro/);
});

test("D2-prep commitment abre somente com answer key e nonce corretos", () => {
  const key = answerKey([{ sampleId: "S-1", expectedDetectorIds: ["RISK-CONCENTRATION-001"] }], "PUBLIC-CORPUS-PREP-4");
  const nonce = "nonce-correto-1234567890-abcdefghijklmnopqrstuvwxyz";
  const commitment = createBlindAnswerKeyCommitment(key, nonce);
  assert.equal(verifyBlindAnswerKeyCommitment(commitment, key, nonce).valid, true);
  assert.equal(verifyBlindAnswerKeyCommitment(commitment, key, `${nonce}-errado`).valid, false);
  const altered = answerKey([{ sampleId: "S-1", expectedDetectorIds: [] }], "PUBLIC-CORPUS-PREP-4");
  assert.equal(verifyBlindAnswerKeyCommitment(commitment, altered, nonce).valid, false);
});

test("D2-prep score comprometido exige abertura valida antes de pontuar", async () => {
  const normal = await fixture("procurement-normal");
  const corpusId = "PUBLIC-CORPUS-PREP-5";
  const input = corpus([{ sampleId: "S-NORMAL", records: normal, items: [] }], corpusId);
  const key = answerKey([{ sampleId: "S-NORMAL", expectedDetectorIds: [] }], corpusId);
  const nonce = "nonce-antes-do-run-1234567890-abcdefghijklmnopqrstuvwxyz";
  const commitment = createBlindAnswerKeyCommitment(key, nonce);
  const run = buildBlindProcurementRun(input);
  const score = scoreCommittedBlindProcurementRun(run, commitment, key, nonce);
  assert.equal(score.metrics.noFindingAccuracy, 1);
  assert.equal(score.preregistration.commitmentVerified, true);
  assert.equal(score.preregistration.nonceDisclosedOnlyAtScoring, true);
  assert.throws(
    () => scoreCommittedBlindProcurementRun(run, commitment, key, "nonce-incorreto"),
    /nao corresponde/
  );
});

test("D2-prep commitment de outro corpus e recusado antes do scoring", async () => {
  const normal = await fixture("procurement-normal");
  const run = buildBlindProcurementRun(corpus([{ sampleId: "S", records: normal, items: [] }], "CORPUS-A"));
  const key = answerKey([{ sampleId: "S", expectedDetectorIds: [] }], "CORPUS-B");
  const commitment = createBlindAnswerKeyCommitment(key, "nonce-corpus-b-1234567890-abcdefghijklmnop");
  assert.throws(
    () => scoreCommittedBlindProcurementRun(run, commitment, key, "nonce-corpus-b-1234567890-abcdefghijklmnop"),
    /outro corpus/
  );
});
