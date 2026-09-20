import { HumanReviewQueue } from "./reviews.ts";
import { materializeMachineBridgeReviews } from "./review-importer.ts";

type JsonObject = Record<string, any>;

type ResultEnvelope = {
  path?: string;
  result?: JsonObject;
  sha?: string;
};

export interface MachineBridgeResultSource {
  listResults(): Promise<ResultEnvelope[]>;
}

export async function syncMachineBridgeReviews({
  transport,
  queue
}: {
  transport: MachineBridgeResultSource;
  queue: HumanReviewQueue;
}) {
  if (!transport || typeof transport.listResults !== "function") {
    throw new Error("transport does not support listResults");
  }
  if (!(queue instanceof HumanReviewQueue)) throw new Error("HumanReviewQueue inválida");

  const entries = await transport.listResults();
  const errors: Array<{ path: string | null; jobId: string | null; message: string }> = [];
  let resultsScanned = 0;
  let reviewableResults = 0;
  let reviewItemsMaterialized = 0;

  for (const entry of entries) {
    const result = entry?.result;
    if (!result || typeof result !== "object" || Array.isArray(result)) continue;
    resultsScanned += 1;
    try {
      const items = await materializeMachineBridgeReviews(queue, result);
      if (items.length) reviewableResults += 1;
      reviewItemsMaterialized += items.length;
    } catch (error) {
      errors.push({
        path: typeof entry?.path === "string" ? entry.path : null,
        jobId: typeof result.jobId === "string" ? result.jobId : null,
        message: String((error as Error)?.message ?? error).slice(0, 4000)
      });
    }
  }

  const pendingReviews = (await queue.list({ status: "pending" })).length;
  return {
    format: "arca-machine-bridge-review-sync-v1",
    resultsScanned,
    reviewableResults,
    reviewItemsMaterialized,
    pendingReviews,
    errors
  };
}
