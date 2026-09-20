import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../packages/aie/bin/arca-aie-blind.mjs", import.meta.url));

function run(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { env: { ...process.env, NO_COLOR: "1" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function fixture(name) {
  return JSON.parse(await readFile(`examples/aie-fixtures/${name}.json`, "utf8"));
}

async function setup(t, { risk = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "arca-blind-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const records = await fixture(risk ? "procurement-risk" : "procurement-normal");
  const corpus = {
    format: "arca-aie-blind-procurement-corpus-v1",
    corpusId: risk ? "CLI-BLIND-RISK" : "CLI-BLIND-NORMAL",
    samples: [{ sampleId: "S-1", records, items: [] }]
  };
  const expected = risk
    ? ["RISK-PRICE-OUTLIER-001", "RISK-LOW-COMPETITION-001", "RISK-CONCENTRATION-001", "RISK-ADDITIVE-BURDEN-001"]
    : [];
  const answerKey = {
    format: "arca-aie-blind-procurement-answer-key-v1",
    corpusId: corpus.corpusId,
    expectations: [{ sampleId: "S-1", expectedDetectorIds: expected }]
  };
  const paths = {
    root,
    corpus: join(root, "corpus.json"),
    manifest: join(root, "manifest.json"),
    runA: join(root, "run-a.json"),
    runB: join(root, "run-b.json"),
    answerKey: join(root, "answer-key.json"),
    nonce: join(root, "nonce.txt"),
    wrongNonce: join(root, "wrong-nonce.txt"),
    commitment: join(root, "commitment.json"),
    score: join(root, "score.json")
  };
  await writeFile(paths.corpus, `${JSON.stringify(corpus)}\n`, { mode: 0o600 });
  await writeFile(paths.answerKey, `${JSON.stringify(answerKey)}\n`, { mode: 0o600 });
  await writeFile(paths.nonce, "nonce-super-secreto-cli-1234567890-abcdefghijklmnopqrstuvwxyz\n", { mode: 0o600 });
  await writeFile(paths.wrongNonce, "nonce-incorreto\n", { mode: 0o600 });
  return paths;
}

test("blind CLI gera manifesto offline com fingerprint e sem gabarito", async (t) => {
  const paths = await setup(t);
  const result = await run(["manifest", "--corpus", paths.corpus, "--out", paths.manifest, "--json"]);
  assert.equal(result.code, 0, result.stderr);
  const manifest = JSON.parse(await readFile(paths.manifest, "utf8"));
  assert.equal(manifest.format, "arca-aie-blind-corpus-manifest-v1");
  assert.match(manifest.corpusFingerprint, /^BLINDCORPUS-/);
  assert.equal(manifest.invariants.answerKeyIncluded, false);
});

test("blind CLI executa duas vezes e compare confirma reprodutibilidade", async (t) => {
  const paths = await setup(t);
  const first = await run(["run", "--corpus", paths.corpus, "--out", paths.runA]);
  const second = await run(["run", "--corpus", paths.corpus, "--out", paths.runB]);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  const compared = await run(["compare", "--left", paths.runA, "--right", paths.runB]);
  assert.equal(compared.code, 0, compared.stderr);
  assert.equal(JSON.parse(compared.stdout).reproducible, true);
});

test("blind CLI cria commitment sem expor answer key ou nonce", async (t) => {
  const paths = await setup(t, { risk: true });
  const result = await run([
    "commit-key", "--answer-key", paths.answerKey,
    "--nonce-file", paths.nonce, "--out", paths.commitment, "--json"
  ]);
  assert.equal(result.code, 0, result.stderr);
  const raw = await readFile(paths.commitment, "utf8");
  const commitment = JSON.parse(raw);
  assert.equal(commitment.format, "arca-aie-blind-answer-key-commitment-v1");
  assert.match(commitment.commitment, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(raw, /nonce-super-secreto|RISK-PRICE-OUTLIER/);
});

test("blind CLI score comprometido aceita abertura correta e rejeita nonce errado", async (t) => {
  const paths = await setup(t);
  assert.equal((await run(["run", "--corpus", paths.corpus, "--out", paths.runA])).code, 0);
  assert.equal((await run([
    "commit-key", "--answer-key", paths.answerKey,
    "--nonce-file", paths.nonce, "--out", paths.commitment
  ])).code, 0);
  const score = await run([
    "score", "--run", paths.runA, "--commitment", paths.commitment,
    "--answer-key", paths.answerKey, "--nonce-file", paths.nonce,
    "--out", paths.score, "--json"
  ]);
  assert.equal(score.code, 0, score.stderr);
  const stored = JSON.parse(await readFile(paths.score, "utf8"));
  assert.equal(stored.preregistration.commitmentVerified, true);
  assert.equal(stored.metrics.noFindingAccuracy, 1);
  const rejected = await run([
    "score", "--run", paths.runA, "--commitment", paths.commitment,
    "--answer-key", paths.answerKey, "--nonce-file", paths.wrongNonce,
    "--out", join(paths.root, "bad-score.json")
  ]);
  assert.equal(rejected.code, 1);
  assert.match(rejected.stderr, /nao corresponde ao commitment/);
});

test("blind CLI falha fechado quando corpus tenta carregar rotulo esperado", async (t) => {
  const paths = await setup(t);
  const contaminated = JSON.parse(await readFile(paths.corpus, "utf8"));
  contaminated.samples[0].expectedDetectorIds = ["RISK-CONCENTRATION-001"];
  await writeFile(paths.corpus, `${JSON.stringify(contaminated)}\n`);
  const result = await run(["run", "--corpus", paths.corpus, "--out", paths.runA]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /rotulo cego proibido/);
});
