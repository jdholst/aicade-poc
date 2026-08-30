import { describe, expect, it, vi } from "vitest";

import { reportOpenAiProviderUsage } from "./openai-provider-usage-receipt";

describe("OpenAI provider usage reporting", () => {
  it("prefers provider-returned token usage over a local estimate", () => {
    const reporter = vi.fn();

    reportOpenAiProviderUsage(
      reporter,
      {
        id: "resp_exact",
        model: "gpt-5.6-luna",
        service_tier: "default",
        usage: {
          input_tokens: 120,
          output_tokens: 30,
          total_tokens: 150,
        },
      },
      { model: "gpt-5.6-luna", input: "actual request" }
    );

    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: "openai_provider_usage_receipt/v1",
        usage: expect.objectContaining({
          inputTokens: 120,
          outputTokens: 30,
          totalTokens: 150,
        }),
      })
    );
  });

  it("estimates tokens only from the actual request and response payloads when usage is absent", () => {
    const reporter = vi.fn();
    const requestPayload = {
      model: "gpt-5.6-luna",
      service_tier: "default",
      instructions: "Use this exact provider request.",
      input: "Generate the result.",
    };
    const responsePayload = {
      id: "resp_without_usage",
      model: "gpt-5.6-luna",
      service_tier: "default",
      output: [{ type: "output_text", text: "Generated result." }],
    };

    reportOpenAiProviderUsage(reporter, responsePayload, requestPayload);

    expect(reporter).toHaveBeenCalledWith({
      schemaVersion: "openai_provider_usage_estimate/v1",
      responseId: "resp_without_usage",
      model: "gpt-5.6-luna",
      serviceTier: "default",
      completedAt: expect.any(String),
      usage: {
        inputTokens: expect.any(Number),
        cachedInputTokens: 0,
        cacheWriteInputTokens: 0,
        outputTokens: expect.any(Number),
        totalTokens: expect.any(Number),
      },
      estimation: {
        method: "utf8_bytes_divided_by_4",
        source: "actual_api_request_and_response",
        inputUtf8Bytes: expect.any(Number),
        outputUtf8Bytes: expect.any(Number),
      },
    });
  });
});
