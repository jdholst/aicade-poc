import { createHash } from "node:crypto";

import { isCountedCohortFailure } from "./contracts.mjs";

export function clusterCampaignFailures(attempts) {
  const clusters = new Map();
  for (const attempt of attempts.filter(isCountedCohortFailure)) {
    const normalizedFailure = normalizeFailure(attempt.failure);
    const signature = [
      attempt.classification ?? "unknown",
      attempt.furthestStage ?? "unknown",
      normalizedFailure,
    ].join("|");
    const existing = clusters.get(signature) ?? {
      id: `failure-${createHash("sha256").update(signature).digest("hex").slice(0, 12)}`,
      classification: attempt.classification ?? "unknown",
      furthestStage: attempt.furthestStage ?? "unknown",
      normalizedFailure,
      attemptIds: [],
      count: 0,
    };
    existing.attemptIds.push(attempt.id);
    existing.count += 1;
    clusters.set(signature, existing);
  }
  return [...clusters.values()].sort(
    (left, right) => right.count - left.count || left.id.localeCompare(right.id)
  );
}

function normalizeFailure(value) {
  return String(value ?? "unspecified failure")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hash>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
}
