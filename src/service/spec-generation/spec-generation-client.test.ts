import { afterEach, describe, expect, it, vi } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { requestTopDownSpecGeneration } from "./spec-generation-client";

describe("requestTopDownSpecGeneration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes the GenerationRun correlation ID in the Spec Generation request body when provided", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        spec: getFirstValidTopDownGameSpecFixture(),
        metadata: {
          attemptCount: 1,
          generationRunId: "generation_run_test",
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
      })
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      requestTopDownSpecGeneration(
        {
          openAiApiKey: "sk-test",
          openAiModel: "gpt-5.4-mini",
          prompt: "make a top-down crystal chase",
        },
        undefined,
        {
          generationRunId: "generation_run_test",
        }
      )
    ).resolves.toMatchObject({
      metadata: {
        generationRunId: "generation_run_test",
      },
    });

    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      enteredPrompt: "make a top-down crystal chase",
      generationRunId: "generation_run_test",
      openAiApiKey: "sk-test",
      openAiModel: "gpt-5.4-mini",
    });
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    json: async () => payload,
  };
}
