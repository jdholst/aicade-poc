export const COST_TIMEFRAMES = {
  day: 24 * 60 * 60 * 1_000,
  week: 7 * 24 * 60 * 60 * 1_000,
  month: 30 * 24 * 60 * 60 * 1_000,
  all: null,
};

export function createKnownCostSummary(
  attempts,
  { timeframe = "all", now = new Date() } = {}
) {
  const windowMs = COST_TIMEFRAMES[timeframe];
  if (windowMs === undefined) throw new Error(`Unknown cost timeframe ${timeframe}.`);
  const cutoff = windowMs === null ? -Infinity : now.getTime() - windowMs;
  const result = {
    exactNanoUsd: 0,
    estimatedNanoUsd: 0,
    totalNanoUsd: 0,
    pricedCalls: 0,
    unknownCalls: 0,
  };

  for (const attempt of attempts) {
    const calls = attempt.providerCallReceipts ?? [];
    const actualCallCount = Object.values(attempt.providerCalls ?? {}).reduce(
      (sum, count) => sum + count,
      0
    );
    if (timeframe === "all") {
      result.unknownCalls += Math.max(0, actualCallCount - calls.length);
    }
    for (const call of calls) {
      const completedAt = Date.parse(call.completedAt ?? "");
      if (!Number.isFinite(completedAt) || completedAt < cutoff || completedAt > now.getTime()) {
        continue;
      }
      if (call.cost?.quality === "exact") {
        result.exactNanoUsd += call.cost.totalNanoUsd;
        result.totalNanoUsd += call.cost.totalNanoUsd;
        result.pricedCalls += 1;
      } else if (call.cost?.quality === "call_derived_estimate") {
        result.estimatedNanoUsd += call.cost.totalNanoUsd;
        result.totalNanoUsd += call.cost.totalNanoUsd;
        result.pricedCalls += 1;
      } else {
        result.unknownCalls += 1;
      }
    }
  }
  return result;
}

export function formatNanoUsd(value, { empty = "—", digits = 6 } = {}) {
  return value === undefined || value === null
    ? empty
    : `$${(value / 1_000_000_000).toFixed(digits)}`;
}
