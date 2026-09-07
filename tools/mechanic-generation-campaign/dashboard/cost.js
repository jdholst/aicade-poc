export const COST_TIMEFRAMES = {
  day: 24 * 60 * 60 * 1_000,
  week: 7 * 24 * 60 * 60 * 1_000,
  month: 30 * 24 * 60 * 60 * 1_000,
  all: null,
};

export const DEFAULT_COST_TIMEFRAME = "week";

const COST_GROUPINGS = {
  day: {
    start(date) {
      return new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
      ));
    },
    next(date) {
      return new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 1
      ));
    },
    key(date) {
      return date.toISOString().slice(0, 10);
    },
    shortLabel(date) {
      return formatUtcDate(date, { month: "short", day: "numeric" });
    },
    label(date) {
      return formatUtcDate(date, { year: "numeric", month: "long", day: "numeric" });
    },
  },
  week: {
    start(date) {
      const start = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
      ));
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      return start;
    },
    next(date) {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    },
    key(date) {
      return date.toISOString().slice(0, 10);
    },
    shortLabel(date) {
      return formatUtcDate(date, { month: "short", day: "numeric" });
    },
    label(date) {
      return `Week of ${formatUtcDate(date, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`;
    },
  },
  month: {
    start(date) {
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    },
    next(date) {
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    },
    key(date) {
      return date.toISOString().slice(0, 7);
    },
    shortLabel(date) {
      return formatUtcDate(date, { year: "numeric", month: "short" });
    },
    label(date) {
      return formatUtcDate(date, { year: "numeric", month: "long" });
    },
  },
};

export function createKnownCostSeries(
  attempts,
  { groupBy = "day", now = new Date() } = {}
) {
  const grouping = COST_GROUPINGS[groupBy];
  if (!grouping) throw new Error(`Unknown cost grouping ${groupBy}.`);
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("Known cost series requires a valid current time.");

  const result = {
    groupBy,
    exactNanoUsd: 0,
    estimatedNanoUsd: 0,
    totalNanoUsd: 0,
    pricedCalls: 0,
    unknownCalls: 0,
    invalidCalls: 0,
    futureCalls: 0,
    fixtureCalls: 0,
    buckets: [],
  };
  const totalsByBucket = new Map();
  let earliestBucket = null;

  for (const attempt of attempts) {
    const calls = attempt.providerCallReceipts ?? [];
    const actualReceiptCount = calls.filter(({ source }) => !source || source === "actual").length;
    const actualCallCount = Object.entries(attempt.providerCalls ?? {}).reduce(
      (sum, [stage, count]) =>
        attempt.providerModes?.[stage] === "fixture" ? sum : sum + count,
      0
    );
    result.unknownCalls += Math.max(0, actualCallCount - actualReceiptCount);

    for (const call of calls) {
      if (call.source && call.source !== "actual") {
        result.fixtureCalls += 1;
        continue;
      }
      const completedAt = Date.parse(call.completedAt ?? "");
      if (!Number.isFinite(completedAt)) {
        result.invalidCalls += 1;
        continue;
      }
      if (completedAt > nowMs) {
        result.futureCalls += 1;
        continue;
      }
      const quality = call.cost?.quality;
      const totalNanoUsd = call.cost?.totalNanoUsd;
      if (
        !["exact", "conservative_estimate"].includes(quality) ||
        !Number.isSafeInteger(totalNanoUsd) ||
        totalNanoUsd < 0
      ) {
        result.unknownCalls += 1;
        continue;
      }

      const bucketStart = grouping.start(new Date(completedAt));
      const key = grouping.key(bucketStart);
      const bucket = totalsByBucket.get(key) ?? {
        exactNanoUsd: 0,
        estimatedNanoUsd: 0,
        totalNanoUsd: 0,
        pricedCalls: 0,
      };
      if (quality === "exact") {
        bucket.exactNanoUsd += totalNanoUsd;
        result.exactNanoUsd += totalNanoUsd;
      } else {
        bucket.estimatedNanoUsd += totalNanoUsd;
        result.estimatedNanoUsd += totalNanoUsd;
      }
      bucket.totalNanoUsd += totalNanoUsd;
      bucket.pricedCalls += 1;
      totalsByBucket.set(key, bucket);
      result.totalNanoUsd += totalNanoUsd;
      result.pricedCalls += 1;
      if (!earliestBucket || bucketStart < earliestBucket) earliestBucket = bucketStart;
    }
  }

  if (!earliestBucket) return result;
  const currentBucket = grouping.start(now);
  for (
    let bucketStart = earliestBucket;
    bucketStart <= currentBucket;
    bucketStart = grouping.next(bucketStart)
  ) {
    const key = grouping.key(bucketStart);
    const bucketEnd = grouping.next(bucketStart);
    result.buckets.push({
      key,
      startAt: bucketStart.toISOString(),
      endAt: bucketEnd.toISOString(),
      shortLabel: grouping.shortLabel(bucketStart),
      label: grouping.label(bucketStart),
      exactNanoUsd: 0,
      estimatedNanoUsd: 0,
      totalNanoUsd: 0,
      pricedCalls: 0,
      ...totalsByBucket.get(key),
    });
  }
  return result;
}

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

export function formatSummaryCost(value) {
  return formatNanoUsd(value, { digits: 2 });
}

function formatUtcDate(date, options) {
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(date);
}
