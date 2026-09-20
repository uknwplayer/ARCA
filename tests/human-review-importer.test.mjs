import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HumanReviewQueue, materializeMachineBridgeReviews } from "../packages/agent/src/index.ts";

async function withQueue(run) {
  const home = await mkdtemp(join(tmpdir(), "arca-review-import-"));
  const queue = new HumanReviewQueue(home);
  await queue.init();
  try { await run(queue); }
  finally { await rm(home, { recursive: true, force: true }); }
}

test("Machine Bridge AIE findings marked for review become durable queue items", async () => {
  await withQueue(async (queue) => {
    const result = {
      format: "arca-result-v1",
      protocolVersion: 3,
      jobId: "mb-aie-review-1",
      workerId: "github-actions",
      status: "completed",
      output: {
        format: "arca-aie-analysis-v1",
        engineVersion: "0.4.0",
        humanReviewRequired: true,
        limitations: ["Sinais analíticos não são conclusão de culpa ou irregularidade."],
        findings: [
          {
            findingId: "FND-1",
            summary: "Valor fora do baseline robusto",
            triage: "investigate",
            humanReviewRequired: true,
            gaps: ["Confirmar comparabilidade do objeto."],
            observed: { value: 1000 }
          },
          {
            findingId: "FND-2",
            summary: "Concentração elevada",
            triage: "investigate",
            humanReviewRequired: true,
            gaps: ["Comparar com outros períodos."],
            observed: { share: 0.86 }
          },
          {
            findingId: "FND-IGNORED",
            summary: "Não exige revisão",
            humanReviewRequired: false
          }
        ]
      }
    };

    const created = await materializeMachineBridgeReviews(queue, result);
    assert.equal(created.length, 2);
    assert.ok(created.every((item) => item.status === "pending"));
    assert.ok(created.every((item) => item.source.system === "machine-bridge"));
    assert.deepEqual(created.map((item) => item.source.findingId).sort(), ["FND-1", "FND-2"]);
    assert.ok(created.every((item) => item.priority === "high"));

    const repeated = await materializeMachineBridgeReviews(queue, result);
    assert.equal(repeated.length, 2);
    assert.deepEqual(repeated.map((item) => item.reviewId).sort(), created.map((item) => item.reviewId).sort());
    assert.equal((await queue.list()).length, 2);
  });
});

test("Machine Bridge result-level review flag is materialized when there are no findings", async () => {
  await withQueue(async (queue) => {
    const created = await materializeMachineBridgeReviews(queue, {
      jobId: "mb-generic-review-1",
      status: "completed",
      output: {
        format: "custom-analysis-v1",
        humanReviewRequired: true,
        note: "review before use"
      }
    });
    assert.equal(created.length, 1);
    assert.equal(created[0].kind, "machine-bridge.result");
    assert.equal(created[0].source.jobId, "mb-generic-review-1");
  });
});

test("failed or non-reviewable Machine Bridge results do not create human review work", async () => {
  await withQueue(async (queue) => {
    assert.deepEqual(await materializeMachineBridgeReviews(queue, { jobId: "failed-1", status: "failed", error: { message: "x" } }), []);
    assert.deepEqual(await materializeMachineBridgeReviews(queue, { jobId: "done-1", status: "completed", output: { ok: true } }), []);
    assert.equal((await queue.list()).length, 0);
  });
});
