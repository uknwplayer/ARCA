import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  captureFile,
  createQueueEntry,
  enqueueAcquisition,
  recordReview,
  recordTransformation,
  verifyCustody
} from "../packages/acquisition/src/index.ts";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "arca-acquisition-test-"));
  const sourceRoot = join(root, "authorized");
  const home = join(root, "home");
  await mkdir(sourceRoot, { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, sourceRoot, home };
}

function request(sourcePath, overrides = {}) {
  return {
    format: "arca-acquisition-request-v1",
    acquisitionId: "ACQ-000001",
    investigationId: "INV-000001",
    sourceId: "SRC-000001",
    title: "Fixture autorizada",
    sourcePath,
    locator: "file://declared/fixture.bin",
    accessedAt: "2026-09-14T12:00:00Z",
    acquisitionMethod: "manual-import",
    access: { basis: "owner-provided", declaration: "Arquivo fornecido pelo titular para o teste." },
    expectedEventHead: null,
    actor: { id: "reviewer@test", role: "operator" },
    ...overrides
  };
}

async function captured(t, bytes = Buffer.from([0, 1, 2, 3, 255, 195, 169])) {
  const env = await fixture(t);
  const path = join(env.sourceRoot, "fixture.bin");
  await writeFile(path, bytes);
  const result = await captureFile(request(path), { home: env.home, allowedRoot: env.sourceRoot });
  return { ...env, path, bytes, result };
}

test("31 — preserva bytes originais reais sem normalização", async (t) => {
  const { bytes, result } = await captured(t);
  const saved = await readFile(join(result.root, result.manifest.original.originalRelativePath));
  assert.deepEqual(saved, bytes);
});

test("32 — calcula SHA-256 real local sobre os bytes preservados", async (t) => {
  const { bytes, result } = await captured(t);
  const expected = createHash("sha256").update(bytes).digest("hex");
  assert.equal(result.manifest.original.originalSha256, expected);
  assert.equal(result.manifest.original.byteLength, bytes.length);
});

test("33 — conserva localizador, timestamp e declaração de acesso", async (t) => {
  const { result } = await captured(t);
  assert.equal(result.manifest.original.locator, "file://declared/fixture.bin");
  assert.equal(result.manifest.original.accessedAt, "2026-09-14T12:00:00Z");
  assert.deepEqual(result.manifest.original.access, {
    basis: "owner-provided",
    declaration: "Arquivo fornecido pelo titular para o teste."
  });
});

test("34 — detecta adulteração dos bytes originais", async (t) => {
  const { result, home } = await captured(t);
  await writeFile(join(result.root, result.manifest.original.originalRelativePath), "adulterado");
  const verification = await verifyCustody({ home, investigationId: "INV-000001", acquisitionId: "ACQ-000001" });
  assert.equal(verification.valid, false);
  assert.ok(verification.errors.some((item) => item.includes("hash do original")));
});

test("35 — recusa fonte simbólica", async (t) => {
  const env = await fixture(t);
  const target = join(env.sourceRoot, "target.bin");
  const link = join(env.sourceRoot, "link.bin");
  await writeFile(target, "conteúdo");
  await symlink(target, link);
  await assert.rejects(captureFile(request(link), { home: env.home, allowedRoot: env.sourceRoot }), /simbólica/);
});

test("36 — recusa traversal, ID inválido e fonte fora da raiz autorizada", async (t) => {
  const env = await fixture(t);
  const outside = join(env.root, "outside.bin");
  await writeFile(outside, "fora");
  await assert.rejects(captureFile(request(outside), { home: env.home, allowedRoot: env.sourceRoot }), /fora da raiz/);
  await assert.rejects(captureFile(request(outside, { acquisitionId: "ACQ-../../escape" }), { home: env.home }), /acquisitionId inválido/);
});

test("37 — aplica limite de tamanho sem deixar estado parcial", async (t) => {
  const env = await fixture(t);
  const path = join(env.sourceRoot, "large.bin");
  await writeFile(path, Buffer.alloc(33, 7));
  await assert.rejects(captureFile(request(path), { home: env.home, allowedRoot: env.sourceRoot, maxBytes: 32 }), /excede limite/);
  await assert.rejects(access(join(env.home, "acquisitions", "INV-000001", "ACQ-000001")));
});

test("38 — registra transformação com hashes de entrada e saída", async (t) => {
  const state = await captured(t);
  const output = join(state.sourceRoot, "derivative.txt");
  await writeFile(output, "texto extraído");
  const update = await recordTransformation({
    home: state.home,
    investigationId: "INV-000001",
    acquisitionId: "ACQ-000001",
    outputPath: output,
    allowedRoot: state.sourceRoot,
    inputSha256: state.result.manifest.original.originalSha256,
    tool: { name: "fixture-extractor", version: "1.0.0", parameters: { mode: "text" } },
    performedAt: "2026-09-14T12:05:00Z",
    actor: { id: "operator@test", role: "operator" },
    mediaType: "text/plain"
  });
  assert.equal(update.manifest.transformations.length, 1);
  assert.equal(update.manifest.transformations[0].inputSha256, state.result.manifest.original.originalSha256);
  assert.equal(update.manifest.transformations[0].tool.name, "fixture-extractor");
  assert.equal(await readFile(join(state.result.root, update.manifest.transformations[0].outputRelativePath), "utf8"), "texto extraído");
});

test("39 — registra revisão humana na cadeia verificável", async (t) => {
  const state = await captured(t);
  const logPath = join(state.result.root, "custody.ndjson");
  const initialLog = await readFile(logPath, "utf8");
  await writeFile(logPath, initialLog.trimEnd(), "utf8");
  const update = await recordReview({
    home: state.home,
    investigationId: "INV-000001",
    acquisitionId: "ACQ-000001",
    outcome: "accepted",
    notes: "Bytes e proveniência conferidos.",
    reviewedAt: "2026-09-14T12:10:00Z",
    actor: { id: "human-reviewer@test", role: "reviewer" }
  });
  assert.equal(update.manifest.reviews.length, 1);
  const verification = await verifyCustody({ home: state.home, investigationId: "INV-000001", acquisitionId: "ACQ-000001" });
  assert.equal(verification.valid, true, verification.errors.join("; "));
  assert.equal(verification.manifest.eventCount, 2);
});

test("40 — detecta adulteração do event log de custódia", async (t) => {
  const state = await captured(t);
  const logPath = join(state.result.root, "custody.ndjson");
  const original = await readFile(logPath, "utf8");
  await writeFile(logPath, original.replace("Fixture autorizada", "Título adulterado"));
  const verification = await verifyCustody({ home: state.home, investigationId: "INV-000001", acquisitionId: "ACQ-000001" });
  assert.equal(verification.valid, false);
  assert.ok(verification.errors.some((item) => item.includes("eventHash inválido")));
});

test("41 — fila exige acesso declarado e nunca executa rede", async (t) => {
  const env = await fixture(t);
  assert.throws(() => createQueueEntry({
    queueId: "QAQ-000001",
    investigationId: "INV-000001",
    acquisitionId: "ACQ-000001",
    locator: "https://example.invalid/public-record",
    accessedAt: "2026-09-14T12:00:00Z",
    acquisitionMethod: "authorized-download",
    access: { basis: "authorized", declaration: "" },
    requestedBy: { id: "operator@test", role: "operator" }
  }), /declaration/);
  const queued = await enqueueAcquisition(env.home, {
    queueId: "QAQ-000001",
    investigationId: "INV-000001",
    acquisitionId: "ACQ-000001",
    locator: "https://example.invalid/public-record",
    accessedAt: "2026-09-14T12:00:00Z",
    acquisitionMethod: "authorized-download",
    access: { basis: "authorized", declaration: "Acesso público permitido; obtenção ainda não executada." },
    requestedBy: { id: "operator@test", role: "operator" }
  });
  assert.equal(queued.entry.networkActionPerformed, false);
  assert.equal(queued.entry.status, "pending-human-or-authorized-adapter");
});

test("42 — produz proposta revisável e não escreve no event log do Core", async (t) => {
  const state = await captured(t);
  assert.equal(state.result.proposal.humanReviewRequired, true);
  assert.equal(state.result.proposal.operation.kind, "create_object");
  assert.equal(state.result.proposal.operation.objectType, "DOC");
  await assert.rejects(access(join(state.home, "investigations", "INV-000001", "events.ndjson")));
});
