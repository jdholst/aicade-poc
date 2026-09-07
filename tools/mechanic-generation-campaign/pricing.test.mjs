import { describe, expect, it } from "vitest";

import {
  aggregateProviderCallCosts,
  calculateProviderCallCost,
  createProviderCallReceipts,
  parseOpenAiPricingSnapshot,
} from "./lib/pricing.mjs";

const snapshot = parseOpenAiPricingSnapshot({
  schemaVersion: "openai-pricing-snapshot/v1",
  id: "openai-2026-08-29",
  effectiveAt: "2026-08-29",
  retrievedAt: "2026-08-29T12:00:00.000Z",
  sources: [
    { url: "https://developers.openai.com/api/docs/pricing", sha256: "a".repeat(64) },
    { url: "https://developers.openai.com/api/docs/models/gpt-5.6-luna", sha256: "b".repeat(64) },
  ],
  models: [
    {
      id: "gpt-5.6-luna",
      aliases: ["gpt-5.6-luna-2026-08-01"],
      contextWindowTokens: 1_050_000,
      maxOutputTokens: 128_000,
      serviceTiers: {
        default: {
          inputNanoUsdPerMillionTokens: 200_000_000,
          cachedInputNanoUsdPerMillionTokens: 20_000_000,
          cacheWriteInputNanoUsdPerMillionTokens: 250_000_000,
          outputNanoUsdPerMillionTokens: 1_200_000_000,
        },
      },
      longContext: {
        thresholdInputTokens: 272_000,
        inputMultiplier: { numerator: 2, denominator: 1 },
        outputMultiplier: { numerator: 3, denominator: 2 },
      },
    },
  ],
});

function receipt(overrides = {}) {
  return {
    schemaVersion: "openai_provider_usage_receipt/v1",
    responseId: "resp_1",
    model: "gpt-5.6-luna-2026-08-01",
    serviceTier: "default",
    completedAt: "2026-08-29T12:05:00.000Z",
    usage: {
      inputTokens: 1_000,
      cachedInputTokens: 200,
      cacheWriteInputTokens: 100,
      outputTokens: 300,
      totalTokens: 1_300,
    },
    ...overrides,
  };
}

describe("campaign OpenAI pricing", () => {
  it("prices uncached, cached, cache-write, and output tokens with integer nano-USD arithmetic", () => {
    expect(calculateProviderCallCost({ receipt: receipt(), snapshot })).toMatchObject({
      quality: "exact",
      totalNanoUsd: 529_000,
      components: {
        uncachedInputNanoUsd: 140_000,
        cachedInputNanoUsd: 4_000,
        cacheWriteInputNanoUsd: 25_000,
        outputNanoUsd: 360_000,
      },
      modelId: "gpt-5.6-luna",
    });
  });

  it("applies published long-context input and output multipliers", () => {
    const result = calculateProviderCallCost({
      receipt: receipt({
        usage: {
          inputTokens: 300_000,
          cachedInputTokens: 0,
          cacheWriteInputTokens: 0,
          outputTokens: 10_000,
          totalTokens: 310_000,
        },
      }),
      snapshot,
    });
    expect(result.totalNanoUsd).toBe(138_000_000);
    expect(result.longContextApplied).toBe(true);
  });

  it("fails closed for an unsupported service tier", () => {
    expect(() =>
      calculateProviderCallCost({
        receipt: receipt({ serviceTier: "priority" }),
        snapshot,
      })
    ).toThrow(/service tier/i);
  });

  it("aggregates exact, estimated, and unknown calls without inventing historical cost", () => {
    expect(
      aggregateProviderCallCosts([
        { callId: "one", completedAt: "2026-08-29T12:00:00.000Z", cost: { quality: "exact", totalNanoUsd: 10 } },
        { callId: "two", completedAt: "2026-08-29T12:01:00.000Z", cost: { quality: "call_derived_estimate", totalNanoUsd: 20 } },
        { callId: "three", completedAt: "2026-08-29T12:02:00.000Z", cost: { quality: "conservative_estimate", totalNanoUsd: 30 } },
        { callId: "four", completedAt: "2026-08-29T12:03:00.000Z", cost: { quality: "unknown" } },
      ])
    ).toEqual({
      exactNanoUsd: 10,
      estimatedNanoUsd: 20,
      totalNanoUsd: 30,
      pricedCalls: 2,
      unknownCalls: 2,
    });
  });

  it("prices captured actual calls and leaves missing call-derived usage unknown", () => {
    const calls = createProviderCallReceipts({
      networkCaptures: [
        {
          callId: "a01:planning:1",
          stage: "planning",
          source: "actual",
          requestedAt: "2026-08-29T12:00:00.000Z",
          completedAt: "2026-08-29T12:00:01.000Z",
          response: { providerUsage: receipt() },
        },
        {
          callId: "a01:source:1",
          stage: "source",
          source: "actual",
          requestedAt: "2026-08-29T12:00:02.000Z",
          completedAt: "2026-08-29T12:00:03.000Z",
          responseStatus: 502,
        },
        { stage: "contract", source: "fixture" },
      ],
      snapshot,
      requestedModel: "gpt-5.6-luna",
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].cost.quality).toBe("exact");
    expect(calls[1].cost.quality).toBe("unknown");
    expect(calls[1].receipt).toBeUndefined();
  });

  it("prices a call-derived token estimate without replacing provider-returned usage", () => {
    const cost = calculateProviderCallCost({
      receipt: {
        schemaVersion: "openai_provider_usage_estimate/v1",
        responseId: "resp_estimated",
        model: "gpt-5.6-luna",
        serviceTier: "default",
        completedAt: "2026-08-29T12:05:00.000Z",
        usage: {
          inputTokens: 1_000,
          cachedInputTokens: 0,
          cacheWriteInputTokens: 0,
          outputTokens: 300,
          totalTokens: 1_300,
        },
        estimation: {
          method: "utf8_bytes_divided_by_4",
          source: "actual_api_request_and_response",
          inputUtf8Bytes: 4_000,
          outputUtf8Bytes: 1_200,
        },
      },
      snapshot,
    });

    expect(cost).toMatchObject({
      quality: "call_derived_estimate",
      totalNanoUsd: 560_000,
    });
  });
});
