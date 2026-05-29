import { afterEach, describe, expect, it, vi } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";
import { SpecGenerationClientError } from "@/service/spec-generation";

import { startEditorGenerationRun } from "./editor-generation-run";

describe("startEditorGenerationRun", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes Phaser AI generation through the Spec Generation adapter and normalizes the result", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const requestPhaserSpecGeneration = vi.fn().mockResolvedValue({
      gamePack: {
        id: "game_pack_test",
        runtimeKind: "phaser",
        title: "Test Phaser Pack",
      },
      metadata: {
        attemptCount: 1,
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      spec,
    });
    const requestCanvasStarterProject = vi.fn();

    const run = startEditorGenerationRun({
      generationSource: "phaser-ai",
      request: {
        prompt: "make a top-down crystal chase",
      },
      requestCanvasStarterProject,
      requestPhaserSpecGeneration,
    });

    await expect(run.done).resolves.toEqual({
      status: "success",
      source: "phaser-spec",
      gamePack: {
        id: "game_pack_test",
        runtimeKind: "phaser",
        title: "Test Phaser Pack",
      },
      metadata: {
        attemptCount: 1,
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      spec,
    });
    expect(requestPhaserSpecGeneration).toHaveBeenCalledWith(
      {
        prompt: "make a top-down crystal chase",
      },
      expect.any(AbortSignal)
    );
    expect(requestCanvasStarterProject).not.toHaveBeenCalled();
  });

  it("aborts the active adapter and returns a timeout error when generation stalls", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | null = null;
    const requestCanvasStarterProject = vi.fn(
      (_request, signal?: AbortSignal) =>
        new Promise<never>(() => {
          observedSignal = signal ?? null;
        })
    );

    const run = startEditorGenerationRun({
      generationSource: "canvas-starter",
      request: {
        prompt: "make a canvas game",
      },
      requestCanvasStarterProject,
      timeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);

    await expect(run.done).resolves.toEqual({
      status: "error",
      reason: "timed-out",
      message:
        "Generation took longer than two minutes. Please retry; the model may have stalled while creating or validating the game module.",
    });
    expect(observedSignal?.aborted).toBe(true);
  });

  it("normalizes Spec Generation validation failures into display-ready error state", async () => {
    const validationFailure = {
      attemptCount: 1,
      issues: [
        {
          path: "mechanics.mechanic_pickup_collection.assetIds",
          message: "Expected asset role \"pickup\".",
        },
      ],
      stage: "mechanic_validation" as const,
      taskRoute: "spec_generation.primary" as const,
    };

    const run = startEditorGenerationRun({
      generationSource: "phaser-ai",
      request: {
        prompt: "make a top-down crystal chase",
      },
      requestPhaserSpecGeneration: vi.fn().mockRejectedValue(
        new SpecGenerationClientError(
          "I designed a game plan, but it needs a clearer pickup goal.",
          validationFailure
        )
      ),
    });

    await expect(run.done).resolves.toEqual({
      status: "error",
      reason: "request-failed",
      message: "I designed a game plan, but it needs a clearer pickup goal.",
      validationFailure,
    });
  });
});
