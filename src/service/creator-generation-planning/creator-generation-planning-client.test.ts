import { afterEach, describe, expect, it, vi } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { requestTopDownCreatorGenerationPlanning } from "./creator-generation-planning-client";

describe("requestTopDownCreatorGenerationPlanning", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns validated spec, metadata, and typed routing data", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        spec,
        metadata: {
          attemptCount: 1,
          generationRunId: "generation_run_client",
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
        routing: {
          kind: "built_in",
          generationRunId: "generation_run_client",
          intentId: "intent_player_movement",
          resolutionKind: "built_in",
        },
      })
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      requestTopDownCreatorGenerationPlanning(
        {
          prompt: "Make a crystal arena.",
          openAiKeyword: "arcade lab",
        },
        undefined,
        { generationRunId: "generation_run_client" }
      )
    ).resolves.toEqual({
      metadata: {
        attemptCount: 1,
        generationRunId: "generation_run_client",
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      routing: {
        kind: "built_in",
        generationRunId: "generation_run_client",
        intentId: "intent_player_movement",
        resolutionKind: "built_in",
      },
      runtimeKind: "phaser",
      spec,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/creator-generation-planning",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
      })
    );
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      enteredPrompt: "Make a crystal arena.",
      generationRunId: "generation_run_client",
      openAiKeyword: "arcade lab",
    });
  });

  it("rejects malformed or mismatched routing data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ok: true,
          spec: getFirstValidTopDownGameSpecFixture(),
          metadata: {
            attemptCount: 1,
            generationRunId: "generation_run_client",
            model: "gpt-5.4-mini",
            taskRoute: "spec_generation.primary",
          },
          routing: {
            kind: "built_in",
            generationRunId: "generation_run_other",
            intentId: "intent_player_movement",
            resolutionKind: "built_in",
          },
        })
      )
    );

    await expect(
      requestTopDownCreatorGenerationPlanning(
        { prompt: "Make a crystal arena." },
        undefined,
        { generationRunId: "generation_run_client" }
      )
    ).rejects.toThrow("mismatched GenerationRun correlation");
  });

  it("preserves an honest host-policy gap that has issues but no missing primitive capability", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ok: true,
          spec,
          metadata: {
            attemptCount: 1,
            generationRunId: "generation_run_host_policy_gap",
            model: "gpt-5.4-mini",
            taskRoute: "spec_generation.primary",
          },
          routing: {
            kind: "capability_gap",
            generationRunId: "generation_run_host_policy_gap",
            intentId: "intent_timer_trigger",
            evidence: {
              stage: "routing",
              code: "capability_gap",
              missingCapabilities: [],
              issues: [
                {
                  path: "intent.triggers",
                  code: "unsupported_generated_host_trigger",
                  message:
                    "The retained host cannot causally prove this trigger.",
                },
              ],
            },
          },
        })
      )
    );

    await expect(
      requestTopDownCreatorGenerationPlanning(
        { prompt: "Move the player after a timer fires." },
        undefined,
        { generationRunId: "generation_run_host_policy_gap" }
      )
    ).resolves.toMatchObject({
      routing: {
        kind: "capability_gap",
        evidence: {
          missingCapabilities: [],
          issues: [
            expect.objectContaining({
              code: "unsupported_generated_host_trigger",
            }),
          ],
        },
      },
    });
  });

  it("preserves a typed intent-transport failure alongside the valid base Game Spec", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ok: true,
          spec,
          metadata: {
            attemptCount: 1,
            generationRunId: "generation_run_invalid_intent_client",
            model: "gpt-5.4-mini",
            taskRoute: "spec_generation.primary",
          },
          routing: {
            kind: "intent_validation_failure",
            generationRunId: "generation_run_invalid_intent_client",
            evidence: {
              stage: "routing",
              code: "invalid_intent_transport",
              issues: [
                {
                  path: "mechanicIntent.references.0.id",
                  code: "invalid_intent_transport",
                  message:
                    "Mechanic Intent did not match the planning transport schema.",
                },
              ],
            },
          },
        })
      )
    );

    await expect(
      requestTopDownCreatorGenerationPlanning(
        { prompt: "Make a crystal arena with an optional flourish." },
        undefined,
        { generationRunId: "generation_run_invalid_intent_client" }
      )
    ).resolves.toMatchObject({
      spec,
      routing: {
        kind: "intent_validation_failure",
        evidence: {
          code: "invalid_intent_transport",
          issues: [
            expect.objectContaining({
              path: "mechanicIntent.references.0.id",
            }),
          ],
        },
      },
    });
  });

  it("classifies cancellation after response headers arrive before decoding JSON", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        controller.abort("cancelled");
        return Response.json({ ok: true });
      })
    );

    await expect(
      requestTopDownCreatorGenerationPlanning(
        { prompt: "Make a crystal arena." },
        controller.signal,
        { generationRunId: "generation_run_cancelled_headers" }
      )
    ).rejects.toMatchObject({
      name: "AbortError",
      message: expect.stringContaining("cancelled"),
    });
  });

  it("classifies cancellation during response JSON decoding", async () => {
    const controller = new AbortController();
    const response = Response.json({ ok: true });
    vi.spyOn(response, "json").mockImplementation(async () => {
      controller.abort("cancelled");
      throw new SyntaxError("partial response body");
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(
      requestTopDownCreatorGenerationPlanning(
        { prompt: "Make a crystal arena." },
        controller.signal,
        { generationRunId: "generation_run_cancelled_json" }
      )
    ).rejects.toMatchObject({
      name: "AbortError",
      message: expect.stringContaining("cancelled"),
    });
  });
});
