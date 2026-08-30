import { describe, expect, it } from "vitest";

import {
  DEFAULT_COST_TIMEFRAME,
  createKnownCostSeries,
  createKnownCostSummary,
  formatNanoUsd,
  formatSummaryCost,
} from "./dashboard/cost.js";

const now = new Date("2026-08-30T12:00:00.000Z");
const attempts = [
  {
    providerCalls: { planning: 3, contract: 1, source: 1 },
    providerCallReceipts: [
      call("day-boundary", "2026-08-29T12:00:00.000Z", "exact", 100),
      call("week-only", "2026-08-27T12:00:00.000Z", "call_derived_estimate", 200),
      call("legacy-maximum", "2026-08-28T12:00:00.000Z", "conservative_estimate", 900),
      call("month-only", "2026-08-10T12:00:00.000Z", "exact", 300),
    ],
  },
];

describe("dashboard known cost", () => {
  it("defaults the rolling summary to the past seven days", () => {
    expect(DEFAULT_COST_TIMEFRAME).toBe("week");
  });

  it("uses provider completion timestamps for rolling timeframes", () => {
    expect(createKnownCostSummary(attempts, { timeframe: "day", now })).toMatchObject({
      exactNanoUsd: 100,
      estimatedNanoUsd: 0,
      pricedCalls: 1,
    });
    expect(createKnownCostSummary(attempts, { timeframe: "week", now })).toMatchObject({
      exactNanoUsd: 100,
      estimatedNanoUsd: 200,
      pricedCalls: 2,
    });
    expect(createKnownCostSummary(attempts, { timeframe: "month", now }).totalNanoUsd).toBe(600);
  });

  it("keeps unknown historical calls unpriced and renders missing evidence as a dash", () => {
    expect(createKnownCostSummary(attempts, { timeframe: "all", now }).unknownCalls).toBe(2);
    expect(formatNanoUsd(undefined)).toBe("—");
  });

  it("formats summary-card cost as standard two-decimal currency", () => {
    expect(formatSummaryCost(2_600_000_000)).toBe("$2.60");
    expect(formatSummaryCost(256_653_000)).toBe("$0.26");
  });

  it("groups exact and estimated spend into UTC days and fills empty periods", () => {
    const series = createKnownCostSeries([
      {
        providerCalls: { planning: 3, contract: 1, source: 1 },
        providerCallReceipts: [
          call("exact", "2026-08-29T23:59:59.999Z", "exact", 125),
          call("estimate", "2026-08-31T00:00:00.000Z", "conservative_estimate", 275),
          call("unknown", "2026-08-30T12:00:00.000Z", "unknown"),
          call("invalid", "not-a-date", "exact", 900),
          call("future", "2026-09-02T00:00:00.000Z", "exact", 800),
          { ...call("fixture", "2026-08-30T12:00:00.000Z", "exact", 700), source: "fixture" },
        ],
      },
    ], { groupBy: "day", now: new Date("2026-09-01T12:00:00.000Z") });

    expect(series).toMatchObject({
      exactNanoUsd: 125,
      estimatedNanoUsd: 275,
      totalNanoUsd: 400,
      pricedCalls: 2,
      unknownCalls: 1,
      invalidCalls: 1,
      futureCalls: 1,
      fixtureCalls: 1,
    });
    expect(series.buckets.map((bucket) => [bucket.key, bucket.totalNanoUsd])).toEqual([
      ["2026-08-29", 125],
      ["2026-08-30", 0],
      ["2026-08-31", 275],
      ["2026-09-01", 0],
    ]);
  });

  it("uses Monday-starting ISO weeks across a year boundary", () => {
    const series = createKnownCostSeries([
      {
        providerCallReceipts: [
          call("old-week", "2026-12-31T23:00:00.000Z", "exact", 100),
          call("new-week", "2027-01-04T00:00:00.000Z", "exact", 200),
        ],
      },
    ], { groupBy: "week", now: new Date("2027-01-05T12:00:00.000Z") });

    expect(series.buckets.map((bucket) => [bucket.key, bucket.totalNanoUsd])).toEqual([
      ["2026-12-28", 100],
      ["2027-01-04", 200],
    ]);
  });

  it("uses calendar months, including leap-year February, without changing totals", () => {
    const source = [{
      providerCallReceipts: [
        call("leap-day", "2024-02-29T23:59:59.999Z", "exact", 101),
        call("april", "2024-04-01T00:00:00.000Z", "conservative_estimate", 202),
      ],
    }];
    const current = new Date("2024-04-02T12:00:00.000Z");
    const monthly = createKnownCostSeries(source, { groupBy: "month", now: current });

    expect(monthly.buckets.map((bucket) => [bucket.key, bucket.totalNanoUsd])).toEqual([
      ["2024-02", 101],
      ["2024-03", 0],
      ["2024-04", 202],
    ]);
    expect(["day", "week", "month"].map((groupBy) =>
      createKnownCostSeries(source, { groupBy, now: current }).totalNanoUsd
    )).toEqual([303, 303, 303]);
  });
});

function call(callId, completedAt, quality, totalNanoUsd) {
  return {
    callId,
    completedAt,
    source: "actual",
    cost: totalNanoUsd === undefined ? { quality } : { quality, totalNanoUsd },
  };
}
