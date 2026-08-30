import { describe, expect, it } from "vitest";

import {
  createKnownCostSummary,
  formatNanoUsd,
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
});

function call(callId, completedAt, quality, totalNanoUsd) {
  return { callId, completedAt, cost: { quality, totalNanoUsd } };
}
