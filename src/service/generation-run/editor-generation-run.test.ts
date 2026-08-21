import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PHASE_9_GENERATION_CONSTRAINT_SET,
  TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITY_IDS,
  createInitialGamePack,
} from "@/game-spec";
import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";
import { SpecGenerationClientError } from "@/service/spec-generation";
import { createCreatorGenerationRouting } from "@/service/creator-generation/creator-generation-routing";

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

  it("routes an admitted generated mechanic through the browser continuation and returns its accepted Game Pack", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const intent = {
      id: "intent_generated_entry",
      summary: "Dash the routed player after a logical action.",
      triggers: ["logical_action"],
      actors: ["player"],
      targets: [],
      behaviors: ["action_dash"],
      ownedObjects: [],
      stateChanges: ["player_velocity_changed"],
      temporalRules: [],
      spatialRules: [],
      constraints: [],
      configuration: [],
      connections: [
        { direction: "input" as const, port: spec.controls[0]!.action },
      ],
      references: [{ kind: "entity" as const, id: spec.entities[0].id }],
      outcomes: ["player_velocity_changed"],
      requiredCapabilities: ["object_motion_write"],
      ambiguities: [],
    };
    const routing = createCreatorGenerationRouting({
      availableCapabilities:
        TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITY_IDS,
      baseGameSpec: spec,
      generationRunId: "generation_run_generated_entry",
      intent,
    });
    if (routing.kind !== "generated_mechanic") {
      throw new Error(`Expected generated routing, received ${routing.kind}.`);
    }
    const gamePack = createInitialGamePack({
      createdAt: "2026-06-10T12:00:05.000Z",
      gameSpec: spec,
      id: "game_pack_generated_entry",
      runtimeKind: "phaser",
    });
    const continueGeneratedMechanicGeneration = vi.fn().mockResolvedValue({
      outcome: "accepted",
      value: { gamePack },
    });
    const requestPhaserSpecGeneration = vi.fn().mockResolvedValue({
      metadata: {
        attemptCount: 1,
        generationRunId: "generation_run_generated_entry",
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      routing,
      runtimeKind: "phaser",
      spec,
    });

    const run = startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => "generation_run_generated_entry",
      generationRunRepository: createGenerationRunTestRepository().repository,
      generationSource: "phaser-ai",
      request: { prompt: "make the player drift after collecting a crystal" },
      requestPhaserSpecGeneration,
    });

    await expect(run.done).resolves.toEqual({
      generationRunId: "generation_run_generated_entry",
      status: "success",
      source: "phaser-game-pack",
      gamePack,
    });
    expect(continueGeneratedMechanicGeneration).toHaveBeenCalledTimes(1);
    expect(continueGeneratedMechanicGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          prompt: "make the player drift after collecting a crystal",
        }),
        routing: expect.objectContaining({
          kind: "generated_mechanic",
          generationRunId: "generation_run_generated_entry",
        }),
      })
    );
  });

  it("returns durable generated acceptance when abort races its committed handoff", async () => {
    const generationRunId = "generation_run_abort_after_acceptance_commit";
    const spec = getFirstValidTopDownGameSpecFixture();
    const intent = {
      id: "intent_abort_after_acceptance_commit",
      summary: "Dash the routed player after a logical action.",
      triggers: ["logical_action"],
      actors: ["player"],
      targets: [],
      behaviors: ["action_dash"],
      ownedObjects: [],
      stateChanges: ["player_velocity_changed"],
      temporalRules: [],
      spatialRules: [],
      constraints: [],
      configuration: [],
      connections: [
        { direction: "input" as const, port: spec.controls[0]!.action },
      ],
      references: [{ kind: "entity" as const, id: spec.entities[0].id }],
      outcomes: ["player_velocity_changed"],
      requiredCapabilities: ["object_motion_write"],
      ambiguities: [],
    };
    const routing = createCreatorGenerationRouting({
      availableCapabilities:
        TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITY_IDS,
      baseGameSpec: spec,
      generationRunId,
      intent,
    });
    if (routing.kind !== "generated_mechanic") {
      throw new Error(`Expected generated routing, received ${routing.kind}.`);
    }
    const gamePack = createInitialGamePack({
      createdAt: "2026-06-10T12:00:05.000Z",
      gameSpec: spec,
      id: "game_pack_abort_after_acceptance_commit",
      runtimeKind: "phaser",
    });
    const accepted = deferred<{ outcome: "accepted"; value: { gamePack: typeof gamePack } }>();
    const acceptanceRecorded = deferred<void>();
    const repository = createGenerationRunTestRepository().repository;
    const continueGeneratedMechanicGeneration = vi.fn(async () => {
      await repository.update(generationRunId, (generationRun) => ({
        ...generationRun,
        metadata: {
          ...(generationRun.metadata ?? {}),
          generatedMechanicAcceptanceTransaction: {
            schemaVersion: "generated_mechanic_acceptance_transaction/v1",
            status: "finalized",
            transactionId: "acceptance_abort_after_commit",
            generationRunId,
            artifactId: "artifact_abort_after_commit",
            buildId: "build_abort_after_commit",
            checkpointId: "checkpoint_abort_after_commit",
          },
        },
      }));
      acceptanceRecorded.resolve();
      return accepted.promise;
    });
    const requestPhaserSpecGeneration = vi.fn().mockResolvedValue({
      metadata: {
        attemptCount: 1,
        generationRunId,
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      routing,
      runtimeKind: "phaser",
      spec,
    });
    const run = startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => generationRunId,
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      request: { prompt: "make the player dash after the action" },
      requestPhaserSpecGeneration,
    });
    await acceptanceRecorded.promise;

    run.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));
    accepted.resolve({ outcome: "accepted", value: { gamePack } });

    await expect(run.done).resolves.toEqual({
      generationRunId,
      status: "success",
      source: "phaser-game-pack",
      gamePack,
    });
  });

  it("keeps the built-in path free of generated-mechanic continuation work", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const continueGeneratedMechanicGeneration = vi.fn();
    const plan = {
      metadata: {
        attemptCount: 1,
        generationRunId: "generation_run_builtin_entry",
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      routing: {
        kind: "built_in" as const,
        generationRunId: "generation_run_builtin_entry",
        intentId: "intent_player_movement",
        resolutionKind: "built_in" as const,
      },
      runtimeKind: "phaser" as const,
      spec,
    };

    const run = startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => "generation_run_builtin_entry",
      generationRunRepository: createGenerationRunTestRepository().repository,
      generationSource: "phaser-ai",
      request: { prompt: "make a top-down crystal chase" },
      requestPhaserSpecGeneration: vi.fn().mockResolvedValue(plan),
    });

    await expect(run.done).resolves.toEqual({
      generationRunId: "generation_run_builtin_entry",
      status: "success",
      source: "phaser-spec",
      metadata: plan.metadata,
      runtimeKind: "phaser",
      spec,
    });
    expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
  });

  it("returns a degraded playable spec and records exact omission evidence without starting generated work", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const { repository } = createGenerationRunTestRepository();
    const continueGeneratedMechanicGeneration = vi.fn();
    const issue = {
      path: "intent.requiredCapabilities.0",
      code: "missing_capability" as const,
      message:
        'The selected generated-mechanic host does not provide capability "object_create".',
    };
    const run = startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => "generation_run_capability_gap",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:03.000Z",
        "2026-06-10T12:00:04.000Z",
      ]),
      request: { prompt: "spawn a new object" },
      requestPhaserSpecGeneration: vi.fn().mockResolvedValue({
        metadata: {
          attemptCount: 1,
          generationRunId: "generation_run_capability_gap",
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
        routing: {
          kind: "capability_gap",
          generationRunId: "generation_run_capability_gap",
          intentId: "intent_capability_gap",
          evidence: {
            stage: "routing",
            code: "capability_gap",
            missingCapabilities: ["object_create"],
            issues: [issue],
          },
        },
        runtimeKind: "phaser",
        spec,
      }),
    });

    await expect(run.done).resolves.toMatchObject({
      status: "success",
      source: "phaser-spec",
      spec,
      degradedWarning: {
        schemaVersion: "degraded_creator_generation/v1",
        code: "generated_mechanic_omitted",
        intentId: "intent_capability_gap",
        issues: [issue],
        fallbackValidation: {
          status: "passed",
          gameSpecId: spec.id,
        },
      },
    });
    expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
    await expect(
      repository.fetch("generation_run_capability_gap")
    ).resolves.toMatchObject({
      status: "running",
      attempts: [
        expect.objectContaining({
          validation: {
            stage: "semantic-validation",
            status: "passed",
          },
        }),
      ],
      metadata: {
        creatorGenerationOutcome: {
          schemaVersion: "degraded_creator_generation/v1",
          status: "degraded",
          warning: expect.objectContaining({
            code: "generated_mechanic_omitted",
            issues: [issue],
          }),
          generatedStageCallCounts: {
            contract: 0,
            source: 0,
            realm: 0,
            browser: 0,
            handoff: 0,
            persistence: 0,
          },
        },
      },
    });
  });

  it("lets cancellation win when it arrives while the degraded warning receipt is being written", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const durableRepository = createGenerationRunTestRepository().repository;
    let updateCount = 0;
    let releaseDegradedWrite!: () => void;
    const degradedWriteReleased = new Promise<void>((resolve) => {
      releaseDegradedWrite = resolve;
    });
    let reportDegradedWriteStarted!: () => void;
    const degradedWriteStarted = new Promise<void>((resolve) => {
      reportDegradedWriteStarted = resolve;
    });
    const repository = {
      create: durableRepository.create,
      update: vi.fn(
        async (...args: Parameters<typeof durableRepository.update>) => {
          updateCount += 1;
          const updated = await durableRepository.update(...args);
          if (updateCount === 2) {
            reportDegradedWriteStarted();
            await degradedWriteReleased;
          }
          return updated;
        }
      ),
    };
    const run = startEditorGenerationRun({
      continueGeneratedMechanicGeneration: vi.fn(),
      createGenerationRunId: () => "generation_run_degraded_cancel_race",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      request: { prompt: "spawn a new object" },
      requestPhaserSpecGeneration: vi.fn().mockResolvedValue({
        metadata: {
          attemptCount: 1,
          generationRunId: "generation_run_degraded_cancel_race",
          model: "gpt-5.6-luna",
          taskRoute: "spec_generation.primary",
        },
        routing: {
          kind: "capability_gap",
          generationRunId: "generation_run_degraded_cancel_race",
          intentId: "intent_capability_gap",
          evidence: {
            stage: "routing",
            code: "capability_gap",
            missingCapabilities: ["object_create"],
            issues: [
              {
                path: "intent.requiredCapabilities.0",
                code: "missing_capability",
                message: "The selected host cannot create objects.",
              },
            ],
          },
        },
        runtimeKind: "phaser",
        spec,
      }),
    });

    await degradedWriteStarted;
    run.abort();
    releaseDegradedWrite();

    await expect(run.done).resolves.toMatchObject({
      generationRunId: "generation_run_degraded_cancel_race",
      status: "cancelled",
    });
    await expect(
      durableRepository.fetch("generation_run_degraded_cancel_race")
    ).resolves.toMatchObject({
      status: "cancelled",
    });
  });

  it("lets production manual QA disable degraded fallback through one URL policy switch", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const continueGeneratedMechanicGeneration = vi.fn();
    const originalUrl = globalThis.location.href;
    globalThis.history.replaceState(
      {},
      "",
      "/editor?degradedGenerationFallback=off"
    );

    try {
      const run = startEditorGenerationRun({
        continueGeneratedMechanicGeneration,
        createGenerationRunId: () => "generation_run_fallback_disabled",
        generationRunRepository: createGenerationRunTestRepository().repository,
        generationSource: "phaser-ai",
        request: { prompt: "spawn a new object" },
        requestPhaserSpecGeneration: vi.fn().mockResolvedValue({
          metadata: {
            attemptCount: 1,
            generationRunId: "generation_run_fallback_disabled",
            model: "gpt-5.6-luna",
            taskRoute: "spec_generation.primary",
          },
          routing: {
            kind: "capability_gap",
            generationRunId: "generation_run_fallback_disabled",
            intentId: "intent_capability_gap",
            evidence: {
              stage: "routing",
              code: "capability_gap",
              missingCapabilities: ["object_create"],
              issues: [
                {
                  path: "intent.requiredCapabilities.0",
                  code: "missing_capability",
                  message: "The selected host cannot create objects.",
                },
              ],
            },
          },
          runtimeKind: "phaser",
          spec,
        }),
      });

      await expect(run.done).resolves.toMatchObject({
        status: "error",
        reason: "request-failed",
        validationFailure: {
          stage: "mechanic_validation",
          issues: [{ code: "missing_capability" }],
        },
      });
      expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
    } finally {
      globalThis.history.replaceState({}, "", originalUrl);
    }
  });

  it("fails closed when the degraded warning receipt cannot be persisted", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const { repository: durableRepository } = createGenerationRunTestRepository();
    let updateCount = 0;
    const repository = {
      create: durableRepository.create,
      update: vi.fn(async (...args: Parameters<typeof durableRepository.update>) => {
        updateCount += 1;
        if (updateCount === 2) {
          throw new Error("Degraded receipt write failed.");
        }
        return durableRepository.update(...args);
      }),
    };
    const continueGeneratedMechanicGeneration = vi.fn();
    const run = startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => "generation_run_degraded_receipt_failure",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      request: { prompt: "spawn a new object" },
      requestPhaserSpecGeneration: vi.fn().mockResolvedValue({
        metadata: {
          attemptCount: 1,
          generationRunId: "generation_run_degraded_receipt_failure",
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
        routing: {
          kind: "capability_gap",
          generationRunId: "generation_run_degraded_receipt_failure",
          intentId: "intent_capability_gap",
          evidence: {
            stage: "routing",
            code: "capability_gap",
            missingCapabilities: ["object_create"],
            issues: [
              {
                path: "intent.requiredCapabilities.0",
                code: "missing_capability",
                message: "The selected host cannot create objects.",
              },
            ],
          },
        },
        runtimeKind: "phaser",
        spec,
      }),
    });

    await expect(run.done).resolves.toMatchObject({
      status: "error",
      reason: "request-failed",
      message:
        "Degraded creator generation could not persist its required warning receipt.",
    });
    expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
    const receipt = await durableRepository.fetch(
      "generation_run_degraded_receipt_failure"
    );
    expect(receipt?.status).toBe("running");
    expect(receipt?.metadata?.creatorGenerationOutcome).toBeUndefined();
  });

  it("does not overwrite terminal generated-mechanic failure evidence at the outer editor boundary", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const { repository } = createGenerationRunTestRepository();
    const continueGeneratedMechanicGeneration = vi.fn(async () => {
      await repository.update("generation_run_terminal_failure", (run) => ({
        ...run,
        status: "failed",
        completedAt: "2026-06-10T12:00:09.000Z",
        durationMs: 9000,
        stage: "browser-check",
        failureClass: "first-playable-failure",
        metadata: {
          generatedMechanicOutcome: {
            status: "rejected",
            stage: "first_playable",
            issues: [
              {
                path: "firstPlayable",
                code: "first_playable_not_passed",
                message: "The generated mechanic browser proof failed.",
              },
            ],
          },
        },
      }));
      return {
        outcome: "rejected" as const,
        evidence: {
          stage: "first_playable",
          issues: [
            {
              path: "firstPlayable",
              code: "first_playable_not_passed",
              message: "The generated mechanic browser proof failed.",
            },
          ],
        },
      };
    });
    const routing = {
      kind: "generated_mechanic" as const,
      generationRunId: "generation_run_terminal_failure",
      intent: {
        id: "intent_terminal_failure",
        summary: "Create a generated behavior.",
        triggers: [],
        actors: [],
        targets: [],
        behaviors: ["generated_behavior"],
        ownedObjects: [],
        stateChanges: [],
        temporalRules: [],
        spatialRules: [],
        constraints: [],
        configuration: [],
        connections: [],
        references: [],
        outcomes: ["generated_outcome"],
        requiredCapabilities: ["state_write"],
        ambiguities: [],
      },
      admittedRequest: {
        kind: "generated_mechanic_request" as const,
        generationRunId: "generation_run_terminal_failure",
        resolution: {
          kind: "generated" as const,
          intentId: "intent_terminal_failure",
          requiredCapabilities: ["state_write"],
        },
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      },
    };

    const run = startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => "generation_run_terminal_failure",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:03.000Z",
        "2026-06-10T12:00:10.000Z",
      ]),
      request: { prompt: "make a generated behavior" },
      requestPhaserSpecGeneration: vi.fn().mockResolvedValue({
        metadata: {
          attemptCount: 1,
          generationRunId: "generation_run_terminal_failure",
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
        routing,
        runtimeKind: "phaser",
        spec,
      }),
    });

    await expect(run.done).resolves.toMatchObject({
      status: "error",
      message: "The generated mechanic browser proof failed.",
      generatedMechanicFailure: {
        stage: "first_playable",
        issues: [
          {
            path: "firstPlayable",
            code: "first_playable_not_passed",
            message: "The generated mechanic browser proof failed.",
          },
        ],
      },
    });
    await expect(
      repository.fetch("generation_run_terminal_failure")
    ).resolves.toMatchObject({
      status: "failed",
      stage: "browser-check",
      failureClass: "first-playable-failure",
      metadata: {
        generatedMechanicOutcome: {
          stage: "first_playable",
          status: "rejected",
        },
      },
    });
  });

  it("extends only an admitted generated-mechanic continuation beyond the built-in timeout", async () => {
    vi.useFakeTimers();
    const spec = getFirstValidTopDownGameSpecFixture();
    const repository = createGenerationRunTestRepository().repository;
    const continueGeneratedMechanicGeneration = vi.fn(
      () => new Promise<never>(() => undefined)
    );
    const routing = {
      kind: "generated_mechanic" as const,
      generationRunId: "generation_run_extended_timeout",
      intent: {
        id: "intent_extended_timeout",
        summary: "Create a generated behavior.",
        triggers: [],
        actors: [],
        targets: [],
        behaviors: ["generated_behavior"],
        ownedObjects: [],
        stateChanges: [],
        temporalRules: [],
        spatialRules: [],
        constraints: [],
        configuration: [],
        connections: [],
        references: [],
        outcomes: ["generated_outcome"],
        requiredCapabilities: ["state_write"],
        ambiguities: [],
      },
      admittedRequest: {
        resolution: {
          kind: "generated_mechanic" as const,
          intentId: "intent_extended_timeout",
          candidateBuiltInTypes: [],
          assumptions: [],
          coverage: {
            coveredRequirements: [],
            uncoveredRequirements: [],
          },
        },
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      },
    };
    const run = startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => "generation_run_extended_timeout",
      generatedMechanicTimeoutMs: 600,
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      request: { prompt: "make a generated behavior" },
      requestPhaserSpecGeneration: vi.fn().mockResolvedValue({
        metadata: {
          attemptCount: 1,
          generationRunId: "generation_run_extended_timeout",
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
        routing,
        runtimeKind: "phaser",
        spec,
      }),
      timeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);
    let settled = false;
    void run.done.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(575);
    await expect(run.done).resolves.toMatchObject({
      status: "error",
      reason: "timed-out",
      message: expect.stringContaining("Generated mechanic creation"),
    });
    expect(continueGeneratedMechanicGeneration).toHaveBeenCalledTimes(1);
    await expect(
      repository.fetch("generation_run_extended_timeout")
    ).resolves.toMatchObject({
      status: "timed-out",
      stage: "timeout",
      failureClass: "timeout",
      attempts: [
        expect.objectContaining({
          attemptNumber: 1,
          status: "succeeded",
          candidate: expect.objectContaining({
            kind: "validated_spec",
            gameSpecId: spec.id,
          }),
        }),
        expect.objectContaining({
          attemptNumber: 2,
          status: "timed-out",
          taskRoute: "generated_mechanic.continuation",
          candidate: {
            kind: "no_candidate",
            summary:
              "Generated mechanic continuation timed out before acceptance.",
          },
        }),
      ],
      metadata: {
        generatedMechanicOutcome: {
          status: "rejected",
          stage: "continuation",
          issues: [
            expect.objectContaining({ code: "generation_cancelled" }),
          ],
        },
      },
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
    expect(observedSignal?.reason).toBe("timed-out");
  });

  it("does not convert a late eligible planning result into degraded success after timeout", async () => {
    vi.useFakeTimers();
    const spec = getFirstValidTopDownGameSpecFixture();
    const repository = createGenerationRunTestRepository().repository;
    const continueGeneratedMechanicGeneration = vi.fn();
    const run = startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => "generation_run_late_degraded_timeout",
      generationRunRepository: repository,
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:25.000Z",
      ]),
      request: { prompt: "make a collection game with an optional dash" },
      requestPhaserSpecGeneration: vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  metadata: {
                    attemptCount: 1,
                    generationRunId:
                      "generation_run_late_degraded_timeout",
                    model: "gpt-5.6-luna",
                    taskRoute: "spec_generation.primary",
                  },
                  routing: {
                    kind: "capability_gap",
                    generationRunId:
                      "generation_run_late_degraded_timeout",
                    intentId: "intent_optional_dash",
                    evidence: {
                      stage: "routing",
                      code: "capability_gap",
                      missingCapabilities: ["object_motion_write"],
                      issues: [
                        {
                          path: "intent.requiredCapabilities",
                          code: "missing_capability",
                          message: "The selected host cannot provide motion.",
                        },
                      ],
                    },
                  },
                  runtimeKind: "phaser",
                  spec,
                }),
              50
            );
          })
      ),
      timeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);
    await expect(run.done).resolves.toMatchObject({
      generationRunId: "generation_run_late_degraded_timeout",
      reason: "timed-out",
      status: "error",
    });
    await vi.advanceTimersByTimeAsync(25);
    expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
    const receipt = await repository.fetch(
      "generation_run_late_degraded_timeout"
    );
    expect(receipt?.status).toBe("timed-out");
    expect(receipt?.metadata?.creatorGenerationOutcome).toBeUndefined();
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
    let observedSignal: AbortSignal | undefined;
    const requestPhaserSpecGeneration = vi.fn(
      (_request, signal?: AbortSignal) =>
        new Promise<never>(() => {
          observedSignal = signal;
        })
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
    expect(observedSignal?.reason).toBe("cancelled");
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

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
