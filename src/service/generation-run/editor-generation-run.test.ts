import { afterEach, describe, expect, it, vi } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";
import { SpecGenerationClientError } from "@/service/spec-generation";

import { startEditorGenerationRun } from "./editor-generation-run";
import {
  createDeterministicClock,
  createGenerationRunTestRepository,
} from "./testing/generation-run-test-harness";

describe("startEditorGenerationRun", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes Phaser AI generation through the Spec Generation adapter and normalizes the result", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const requestPhaserSpecGeneration = vi.fn().mockResolvedValue({
      metadata: {
        attemptCount: 1,
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      runtimeKind: "phaser",
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
      metadata: {
        attemptCount: 1,
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      runtimeKind: "phaser",
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

  it("creates a running GenerationRun receipt for Phaser AI generation and passes its correlation ID to Spec Generation", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const repository = createGenerationRunTestRepository().repository;
    const requestPhaserSpecGeneration = vi.fn().mockResolvedValue({
      metadata: {
        attemptCount: 1,
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      runtimeKind: "phaser",
      spec,
    });

    const run = startEditorGenerationRun({
      createGenerationRunId: () => "generation_run_test",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:03.000Z",
      ]),
      request: {
        prompt: "make a top-down crystal chase",
      },
      requestPhaserSpecGeneration,
    });

    await expect(run.done).resolves.toMatchObject({
      generationRunId: "generation_run_test",
      status: "success",
    });
    expect(requestPhaserSpecGeneration).toHaveBeenCalledWith(
      {
        prompt: "make a top-down crystal chase",
      },
      expect.any(AbortSignal),
      {
        generationRunId: "generation_run_test",
      }
    );
    await expect(repository.fetch("generation_run_test")).resolves.toMatchObject({
      id: "generation_run_test",
      operationType: "generate",
      request: {
        promptText: "make a top-down crystal chase",
        summary: "make a top-down crystal chase",
      },
      runtimeKind: "phaser",
      status: "running",
      attempts: [
        expect.objectContaining({
          attemptNumber: 1,
          candidate: expect.objectContaining({
            gameSpecId: spec.id,
            kind: "validated_spec",
            metadata: {
              validatedSpec: spec,
            },
            referencedMechanicIds: spec.mechanics.map(
              (mechanic) => mechanic.id
            ),
          }),
          completedAt: "2026-06-10T12:00:03.000Z",
          durationMs: 3000,
          kind: "initial",
          model: "gpt-5.4-mini",
          provider: "openai",
          status: "succeeded",
          taskRoute: "spec_generation.primary",
        }),
      ],
    });
  });

  it("keeps Phaser AI generation running when GenerationRun persistence is unavailable", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const repository = {
      create: vi.fn().mockRejectedValue(new Error("Storage blocked.")),
      update: vi.fn().mockRejectedValue(new Error("Storage blocked.")),
    };
    const requestPhaserSpecGeneration = vi.fn().mockResolvedValue({
      metadata: {
        attemptCount: 1,
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      runtimeKind: "phaser",
      spec,
    });

    const run = startEditorGenerationRun({
      createGenerationRunId: () => "generation_run_storage_blocked",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      request: {
        prompt: "make a top-down crystal chase",
      },
      requestPhaserSpecGeneration,
    });

    await expect(run.done).resolves.toMatchObject({
      generationRunId: "generation_run_storage_blocked",
      status: "success",
      source: "phaser-spec",
      spec,
    });
    expect(requestPhaserSpecGeneration).toHaveBeenCalledWith(
      {
        prompt: "make a top-down crystal chase",
      },
      expect.any(AbortSignal),
      {
        generationRunId: "generation_run_storage_blocked",
      }
    );
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.update).not.toHaveBeenCalled();
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

  it("finalizes stalled Phaser AI generation receipts as timed out", async () => {
    vi.useFakeTimers();
    const repository = createGenerationRunTestRepository().repository;
    let observedSignal: AbortSignal | null = null;
    const requestPhaserSpecGeneration = vi.fn(
      (_request, signal?: AbortSignal) =>
        new Promise<never>(() => {
          observedSignal = signal ?? null;
        })
    );

    const run = startEditorGenerationRun({
      createGenerationRunId: () => "generation_run_timeout",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:30.000Z",
      ]),
      request: {
        openAiModel: "gpt-5.4-mini",
        prompt: "make a top-down crystal chase",
      },
      requestPhaserSpecGeneration,
      timeoutMs: 30,
    });

    await vi.advanceTimersByTimeAsync(30);

    await expect(run.done).resolves.toMatchObject({
      generationRunId: "generation_run_timeout",
      reason: "timed-out",
      status: "error",
    });
    expect(observedSignal?.aborted).toBe(true);
    await expect(repository.fetch("generation_run_timeout")).resolves.toMatchObject({
      failureClass: "timeout",
      id: "generation_run_timeout",
      stage: "timeout",
      status: "timed-out",
      attempts: [
        expect.objectContaining({
          candidate: {
            kind: "no_candidate",
            summary: "Spec Generation timed out before a candidate was returned.",
          },
          status: "timed-out",
        }),
      ],
    });
  });

  it("finalizes explicitly aborted Phaser AI generation receipts as cancelled", async () => {
    const repository = createGenerationRunTestRepository().repository;
    const requestPhaserSpecGeneration = vi.fn(
      () => new Promise<never>(() => {})
    );

    const run = startEditorGenerationRun({
      createGenerationRunId: () => "generation_run_cancelled",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:02.000Z",
      ]),
      request: {
        openAiModel: "gpt-5.4-mini",
        prompt: "make a top-down crystal chase",
      },
      requestPhaserSpecGeneration,
    });

    run.abort();

    await expect(run.done).resolves.toEqual({
      generationRunId: "generation_run_cancelled",
      status: "cancelled",
    });
    await expect(repository.fetch("generation_run_cancelled")).resolves.toMatchObject({
      failureClass: "cancellation",
      id: "generation_run_cancelled",
      stage: "cancellation",
      status: "cancelled",
      attempts: [
        expect.objectContaining({
          candidate: {
            kind: "no_candidate",
            summary:
              "Spec Generation was cancelled before a candidate was returned.",
          },
          status: "cancelled",
        }),
      ],
    });
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

  it("finalizes Phaser validation failures as compact failed GenerationRun receipts", async () => {
    const repository = createGenerationRunTestRepository().repository;
    const validationFailure = {
      attemptCount: 1,
      issues: [
        {
          path: "mechanics.mechanic_pickup_collection.assetIds",
          message: "Expected asset role \"pickup\".",
          code: "invalid_pickup_asset",
        },
      ],
      stage: "mechanic_validation" as const,
      taskRoute: "spec_generation.primary" as const,
    };

    const run = startEditorGenerationRun({
      createGenerationRunId: () => "generation_run_validation_failure",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:02.000Z",
      ]),
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

    await expect(run.done).resolves.toMatchObject({
      generationRunId: "generation_run_validation_failure",
      status: "error",
      validationFailure,
    });
    await expect(
      repository.fetch("generation_run_validation_failure")
    ).resolves.toMatchObject({
      failureClass: "invalid-model-output",
      id: "generation_run_validation_failure",
      stage: "mechanic-validation",
      status: "failed",
      attempts: [
        expect.objectContaining({
          attemptNumber: 1,
          candidate: {
            kind: "invalid_candidate",
            issueCount: 1,
            summary:
              "Spec Generation failed mechanic validation with 1 issue.",
          },
          completedAt: "2026-06-10T12:00:02.000Z",
          durationMs: 2000,
          kind: "initial",
          status: "failed",
          validation: {
            stage: "mechanic-validation",
            status: "failed",
            issues: validationFailure.issues,
          },
        }),
      ],
    });
    expect(
      await repository.fetch("generation_run_validation_failure")
    ).not.toHaveProperty("metadata.rawInvalidCandidate");
  });

  it("records repaired Phaser successes as one running GenerationRun with nested failed and repair attempts", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const repository = createGenerationRunTestRepository().repository;
    const repairAttempts = [
      {
        attempt: 1,
        outcome: "failed_validation" as const,
        stage: "semantic_validation" as const,
        issues: [
          {
            path: "entities.entity_player.regionId",
            message: 'Unknown region ID "region_missing".',
          },
        ],
      },
    ];

    const run = startEditorGenerationRun({
      createGenerationRunId: () => "generation_run_repaired_success",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:04.000Z",
      ]),
      request: {
        prompt: "make a top-down crystal chase",
      },
      requestPhaserSpecGeneration: vi.fn().mockResolvedValue({
        metadata: {
          attemptCount: 2,
          model: "gpt-5.4-mini",
          repairAttempts,
          repairStatus: "repaired",
          taskRoute: "spec_generation.primary",
        },
        runtimeKind: "phaser",
        spec,
      }),
    });

    await expect(run.done).resolves.toMatchObject({
      generationRunId: "generation_run_repaired_success",
      status: "success",
    });
    await expect(
      repository.fetch("generation_run_repaired_success")
    ).resolves.toMatchObject({
      id: "generation_run_repaired_success",
      status: "running",
      attempts: [
        expect.objectContaining({
          attemptNumber: 1,
          candidate: {
            kind: "invalid_candidate",
            issueCount: 1,
            summary:
              "Spec Generation failed semantic validation with 1 issue.",
          },
          kind: "initial",
          status: "failed",
          validation: {
            stage: "semantic-validation",
            status: "failed",
            issues: repairAttempts[0].issues,
          },
        }),
        expect.objectContaining({
          attemptNumber: 2,
          candidate: expect.objectContaining({
            gameSpecId: spec.id,
            kind: "validated_spec",
          }),
          kind: "repair",
          repair: {
            reason:
              "Repair attempt fixed validation issues from attempt 1.",
            sourceAttemptId: "generation_run_repaired_success_attempt_1",
            validationIssueCount: 1,
          },
          status: "succeeded",
        }),
      ],
    });
  });

  it("finalizes repaired Phaser failures as one repair-exhausted GenerationRun", async () => {
    const repository = createGenerationRunTestRepository().repository;
    const repairAttempts = [
      {
        attempt: 1,
        outcome: "failed_validation" as const,
        stage: "mechanic_validation" as const,
        issues: [
          {
            path: "mechanics.mechanic_pickup_collection.assetIds",
            message: "Expected asset role \"pickup\".",
          },
        ],
      },
      {
        attempt: 2,
        outcome: "repair_failed" as const,
        stage: "mechanic_validation" as const,
        issues: [
          {
            path: "mechanics.mechanic_pickup_collection.assetIds",
            message:
              "Expected a referenced pickup asset to be placed in a pickup zone.",
          },
        ],
      },
    ];
    const validationFailure = {
      attemptCount: 2,
      issues: repairAttempts[1].issues,
      repairAttempts,
      stage: "mechanic_validation" as const,
      taskRoute: "spec_generation.primary" as const,
    };

    const run = startEditorGenerationRun({
      createGenerationRunId: () => "generation_run_repair_exhausted",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:05.000Z",
      ]),
      request: {
        prompt: "make a top-down crystal chase",
      },
      requestPhaserSpecGeneration: vi.fn().mockRejectedValue(
        new SpecGenerationClientError(
          "I designed a game plan, but it did not pass validation.",
          validationFailure
        )
      ),
    });

    await expect(run.done).resolves.toMatchObject({
      generationRunId: "generation_run_repair_exhausted",
      status: "error",
      validationFailure,
    });
    await expect(
      repository.fetch("generation_run_repair_exhausted")
    ).resolves.toMatchObject({
      failureClass: "repair-exhausted",
      repairStatus: "repair-exhausted",
      stage: "mechanic-validation",
      status: "failed",
      attempts: [
        expect.objectContaining({
          attemptNumber: 1,
          kind: "initial",
          status: "failed",
        }),
        expect.objectContaining({
          attemptNumber: 2,
          kind: "repair",
          repair: {
            reason: "Repair attempt could not fix validation issues.",
            sourceAttemptId: "generation_run_repair_exhausted_attempt_1",
            validationIssueCount: 1,
          },
          status: "failed",
          validation: {
            stage: "mechanic-validation",
            status: "failed",
            issues: repairAttempts[1].issues,
          },
        }),
      ],
    });
  });

  it("finalizes provider errors as provider-request-failure GenerationRun receipts", async () => {
    const repository = createGenerationRunTestRepository().repository;

    const run = startEditorGenerationRun({
      createGenerationRunId: () => "generation_run_provider_error",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:01.000Z",
      ]),
      request: {
        openAiModel: "gpt-5.4-mini",
        prompt: "make a top-down crystal chase",
      },
      requestPhaserSpecGeneration: vi
        .fn()
        .mockRejectedValue(new Error("OpenAI request failed.")),
    });

    await expect(run.done).resolves.toMatchObject({
      generationRunId: "generation_run_provider_error",
      reason: "request-failed",
      status: "error",
    });
    await expect(
      repository.fetch("generation_run_provider_error")
    ).resolves.toMatchObject({
      failureClass: "provider-request-failure",
      id: "generation_run_provider_error",
      stage: "model-generation",
      status: "failed",
      attempts: [
        expect.objectContaining({
          candidate: {
            kind: "provider_error",
            summary: "OpenAI request failed.",
          },
          model: "gpt-5.4-mini",
          status: "failed",
        }),
      ],
    });
  });
});
