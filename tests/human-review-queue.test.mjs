import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HumanReviewQueue } from "../packages/agent/src/index.ts";

async function withQueue(run) {
  const home = await mkdtemp(join(tmpdir(), "arca-human-review-"));
  const queue = new HumanReviewQueue(home);
  await queue.init();
  try { await run(queue, home); }
  finally { await rm(home, { recursive: true, force: true }); }
}

test("human review queue persists, lists and resolves a bridge finding", async () => {
  await withQueue(async (queue) => {
    const created = await queue.submit({
      kind: "aie.finding",
      title: "Outlier sintético requer revisão",
      summary: "Registro P6 está fora do baseline robusto.",
      priority: "high",
      source: { system: "machine-bridge", jobId: "job-aie-1", findingId: "FND-TEST-1" },
      payload: { detectorId: "RISK-PRICE-OUTLIER-001", recordId: "P6", value: 1000 },
      recommendations: ["Confirmar comparabilidade antes de inferência substantiva."],
      idempotencyKey: "job-aie-1:FND-TEST-1"
    });

    assert.equal(created.status, "pending");
    assert.equal(created.source.system, "machine-bridge");
    assert.match(created.recordHash, /^[a-f0-9]{64}$/);

    const pending = await queue.list({ status: "pending" });
    assert.equal(pending.length, 1);
    assert.equal(pending[0].reviewId, created.reviewId);

    const resolved = await queue.resolve({
      reviewId: created.reviewId,
      reviewerId: "human-reviewer",
      decision: "acknowledge",
      reason: "Achado revisado como sinal analítico, sem conclusão substantiva.",
      expectedRecordHash: created.recordHash
    });

    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.resolution.decision, "acknowledge");
    assert.equal((await queue.list({ status: "pending" })).length, 0);
    assert.equal((await queue.list({ status: "resolved" })).length, 1);
  });
});

test("human review queue is idempotent while an equivalent item is pending", async () => {
  await withQueue(async (queue) => {
    const input = {
      kind: "machine-bridge.failure",
      title: "Falha de validação",
      summary: "Uma política bloqueou o job.",
      source: { system: "machine-bridge", jobId: "job-2" },
      idempotencyKey: "job-2:failure"
    };
    const first = await queue.submit(input);
    const second = await queue.submit(input);
    assert.equal(second.reviewId, first.reviewId);
    assert.equal((await queue.list()).length, 1);
  });
});

test("human review resolution rejects stale decisions", async () => {
  await withQueue(async (queue) => {
    const item = await queue.submit({
      kind: "test",
      title: "Concorrência",
      summary: "Teste de conflito.",
      source: { system: "test" }
    });

    await queue.resolve({
      reviewId: item.reviewId,
      reviewerId: "reviewer-1",
      decision: "approve",
      reason: "Primeira decisão.",
      expectedRecordHash: item.recordHash
    });

    await assert.rejects(() => queue.resolve({
      reviewId: item.reviewId,
      reviewerId: "reviewer-2",
      decision: "reject",
      reason: "Decisão concorrente.",
      expectedRecordHash: item.recordHash
    }), /já encerrada|Conflito de concorrência/);
  });
});

test("human review queue detects tampering on stored records", async () => {
  await withQueue(async (queue, home) => {
    const item = await queue.submit({
      kind: "test",
      title: "Integridade",
      summary: "Teste de adulteração.",
      source: { system: "test" }
    });
    const path = join(home, "human-review", "items", `${item.reviewId}.json`);
    const record = JSON.parse(await readFile(path, "utf8"));
    record.summary = "conteúdo adulterado";
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
    await assert.rejects(() => queue.get(item.reviewId), /adulterado/);
  });
});
