import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../packages/cli/bin/arca.mjs", import.meta.url));

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

test("CLI cria, lista e consulta investigação em JSON", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "arca-cli-test-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const created = await run([
    "investigation", "create", "--home", home, "--json", "--simulation",
    "--question", "CLI funciona?", "--objective", "Testar CLI.",
    "--scope", "Fixture.", "--limits", "Fixture."
  ]);
  assert.equal(created.code, 0, created.stderr);
  const state = JSON.parse(created.stdout);
  const id = state.investigation.id;
  const listed = await run(["list", "--home", home, "--json"]);
  assert.equal(listed.code, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).investigations, [id]);
  const status = await run(["investigation", "status", "--home", home, "--investigation", id, "--json"]);
  assert.equal(status.code, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).investigationId, id);
});

test("CLI demo executa fluxo completo e produz TRACE ramificado", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "arca-cli-demo-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const result = await run(["demo", "--home", home, "--json"]);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.match(output.message, /Demonstração ARCA concluída/);
  assert.equal(output.eventCount, 17);
  assert.ok(output.trace.paths.length >= 3);
  assert.equal(output.status.validation.eligibleForSeal, false);
});

test("CLI falha de forma explícita em relação probatória inválida", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "arca-cli-error-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const created = await run([
    "investigation", "create", "--home", home, "--json", "--simulation",
    "--question", "Erro?", "--objective", "Testar erro.", "--scope", "Fixture.", "--limits", "Fixture."
  ]);
  const state = JSON.parse(created.stdout);
  const id = state.investigation.id;
  const invalid = await run([
    "relate", "--home", home, "--investigation", id,
    "--from", id, "--to", state.investigation.questionIds[0],
    "--relation", "supports", "--category", "evidence", "--justification", "inválida"
  ]);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /INF → PRO/);
});
