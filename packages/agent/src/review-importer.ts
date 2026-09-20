import { HumanReviewQueue } from "./reviews.ts";

type JsonObject = Record<string, any>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function priorityFor(finding: JsonObject): "low" | "normal" | "high" | "critical" {
  const triage = String(finding.triage ?? "").toLowerCase();
  if (triage === "critical") return "critical";
  if (["investigate", "high"].includes(triage)) return "high";
  if (["low", "informational"].includes(triage)) return "low";
  return "normal";
}

function recommendationsFor(finding: JsonObject): string[] {
  const values = [
    ...(Array.isArray(finding.gaps) ? finding.gaps : []),
    ...(Array.isArray(finding.recommendations) ? finding.recommendations : [])
  ];
  return [...new Set(values.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))].slice(0, 100);
}

export async function materializeMachineBridgeReviews(
  queue: HumanReviewQueue,
  result: JsonObject
): Promise<JsonObject[]> {
  if (!(queue instanceof HumanReviewQueue)) throw new Error("HumanReviewQueue inválida");
  if (!isObject(result)) throw new Error("resultado Machine Bridge inválido");
  if (typeof result.jobId !== "string" || !result.jobId.trim()) throw new Error("resultado sem jobId");
  if (result.status !== "completed") return [];
  const output = isObject(result.output) ? result.output : null;
  if (!output) return [];

  const findings = Array.isArray(output.findings)
    ? output.findings.filter((finding) => isObject(finding) && finding.humanReviewRequired === true)
    : [];

  const created: JsonObject[] = [];
  for (const finding of findings) {
    const findingId = typeof finding.findingId === "string" && finding.findingId.trim()
      ? finding.findingId.trim()
      : `finding-${created.length + 1}`;
    created.push(await queue.submit({
      kind: "aie.finding",
      title: typeof finding.summary === "string" && finding.summary.trim()
        ? finding.summary.trim()
        : `Achado ${findingId} requer revisão`,
      summary: typeof finding.summary === "string" && finding.summary.trim()
        ? finding.summary.trim()
        : "Resultado analítico marcado para revisão humana.",
      priority: priorityFor(finding),
      source: {
        system: "machine-bridge",
        jobId: result.jobId,
        requestId: typeof result.requestId === "string" ? result.requestId : null,
        investigationId: typeof output.investigationId === "string" ? output.investigationId : null,
        findingId
      },
      payload: {
        resultFormat: output.format ?? null,
        engineVersion: output.engineVersion ?? null,
        finding,
        limitations: Array.isArray(output.limitations) ? output.limitations : []
      },
      recommendations: recommendationsFor(finding),
      idempotencyKey: `machine-bridge:${result.jobId}:${findingId}`
    }));
  }

  if (!findings.length && output.humanReviewRequired === true) {
    created.push(await queue.submit({
      kind: "machine-bridge.result",
      title: `Resultado ${result.jobId} requer revisão humana`,
      summary: "A execução foi concluída, mas o produtor marcou o resultado para revisão humana antes de qualquer uso substantivo.",
      priority: "normal",
      source: {
        system: "machine-bridge",
        jobId: result.jobId,
        requestId: typeof result.requestId === "string" ? result.requestId : null,
        investigationId: typeof output.investigationId === "string" ? output.investigationId : null
      },
      payload: { output },
      recommendations: [],
      idempotencyKey: `machine-bridge:${result.jobId}:result`
    }));
  }

  return created;
}
