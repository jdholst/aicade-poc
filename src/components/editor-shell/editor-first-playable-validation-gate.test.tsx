import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createValidatedGamePackFixture } from "@/game-spec/game-pack/testing/game-pack-fixtures";
import { topDownPhaserTemplate } from "@/runtime/phaser";
import { createGenerationRunTestRepository } from "@/service/generation-run/testing/generation-run-test-harness";

import { useFirstPlayableValidationGate } from "./editor-first-playable-validation-gate";
import type { FirstPlayableValidationSource } from "./editor-runtime-template-plan";

type GateInput = Parameters<typeof useFirstPlayableValidationGate>[0];

const validationSource: FirstPlayableValidationSource = {
  gameSpec: topDownPhaserTemplate.gameSpec,
  runtimeCandidate: {
    runtimeDependencyScriptPaths:
      topDownPhaserTemplate.runtimeDependencyScriptPaths,
    runtimeKind: "phaser",
    runtimeScriptPath: topDownPhaserTemplate.runtimeScriptPath,
    templateId: topDownPhaserTemplate.gameSpec.template.id,
  },
  source: "fixture",
  runtimeKind: "phaser",
};
function createInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    gameResetNonce: 0,
    loadStateStatus: "idle",
    onGameStatusChange: vi.fn(),
    validationSource,
    ...overrides,
  };
}

describe("useFirstPlayableValidationGate", () => {
  it("starts a first-playable attempt for a valid Phaser runtime", () => {
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(createInput())
    );

    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      gamePackId: `game_pack_${topDownPhaserTemplate.gameSpec.id.replace(
        /^game_/,
        ""
      )}`,
      shouldBlockPlayable: false,
      status: "running",
      evidence: expect.arrayContaining([
        expect.objectContaining({
          checkId: "basic_objective_presence",
          status: "passed",
        }),
        expect.objectContaining({
          checkId: "runtime_template_entrypoint",
          status: "passed",
        }),
      ]),
    });
    expect(result.current.firstPlayableGamePack).toMatchObject({
      builds: [],
      checkpoints: [],
      failedAttempts: [],
    });
  });

  it("seeds first-playable state from a restored Game Pack with its checkpoint", () => {
    const restoredGamePack = createValidatedGamePackFixture({
      id: "game_pack_crystal_spec_chase",
      title: topDownPhaserTemplate.gameSpec.title,
      gameSpec: topDownPhaserTemplate.gameSpec,
    });
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(
        createInput({
          validationSource: {
            ...validationSource,
            gamePack: restoredGamePack,
          },
        })
      )
    );

    expect(result.current.firstPlayableGamePack).toMatchObject({
      id: restoredGamePack.id,
      builds: [
        expect.objectContaining({
          id: "build_initial_playable",
          checkpointId: "checkpoint_initial_playable",
        }),
      ],
      checkpoints: [
        expect.objectContaining({
          id: "checkpoint_initial_playable",
          buildId: "build_initial_playable",
        }),
      ],
    });
    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      gamePackId: restoredGamePack.id,
      status: "running",
    });
  });

  it("stays inactive outside a mountable Phaser runtime", () => {
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(
        createInput({
          onGameStatusChange,
          validationSource: null,
        })
      )
    );

    expect(result.current.firstPlayableValidationAttempt).toBeNull();
    expect(result.current.firstPlayableGamePack).toBeNull();

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
    });

    expect(onGameStatusChange).toHaveBeenCalledWith({ state: "ready" });
  });

  it("records runtime boot success, forwards ready status, and waits for runtime evidence", () => {
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(createInput({ onGameStatusChange }))
    );

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
    });

    expect(onGameStatusChange).toHaveBeenCalledWith({ state: "ready" });
    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      shouldBlockPlayable: false,
      status: "running",
      evidence: expect.arrayContaining([
        expect.objectContaining({
          checkId: "runtime_boot",
          status: "passed",
        }),
      ]),
    });
    expect(result.current.firstPlayableGamePack).toMatchObject({
      builds: [],
      checkpoints: [],
      failedAttempts: [],
    });
  });

  it("holds ready-after-first-playable drafts out of ready state until runtime evidence passes", () => {
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(
        createInput({
          onGameStatusChange,
          readyPolicy: "ready-after-first-playable",
          validationSource,
        })
      )
    );

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
    });

    expect(onGameStatusChange).not.toHaveBeenCalledWith({ state: "ready" });
    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      shouldBlockPlayable: false,
      status: "running",
    });

    act(() => {
      result.current.handleRuntimeValidationEvidence({
        checkId: "nonblank_render",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "player_visible",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "input_response",
        status: "passed",
      });
    });

    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      shouldBlockPlayable: false,
      status: "passed",
    });
    expect(onGameStatusChange).toHaveBeenLastCalledWith({ state: "ready" });
  });

  it("passes after nonblank, player, and input runtime evidence all pass", () => {
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(createInput({ onGameStatusChange }))
    );

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
      result.current.handleRuntimeValidationEvidence({
        checkId: "nonblank_render",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "player_visible",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "input_response",
        status: "passed",
      });
    });

    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      shouldBlockPlayable: false,
      status: "passed",
      evidence: expect.arrayContaining([
        expect.objectContaining({
          checkId: "nonblank_render",
          status: "passed",
        }),
        expect.objectContaining({
          checkId: "player_visible",
          status: "passed",
        }),
        expect.objectContaining({
          checkId: "input_response",
          status: "passed",
        }),
      ]),
    });
    expect(result.current.firstPlayableGamePack).toMatchObject({
      builds: [
        expect.objectContaining({
          id: "build_initial_playable",
          checkpointId: "checkpoint_initial_playable",
          status: "validated",
        }),
      ],
      checkpoints: [
        expect.objectContaining({
          id: "checkpoint_initial_playable",
          buildId: "build_initial_playable",
        }),
      ],
      failedAttempts: [],
    });
  });

  it("keeps a generated Phaser GenerationRun running after first-playable validation passes before durable persistence", async () => {
    const repository = createGenerationRunTestRepository().repository;

    await repository.create({
      id: "generation_run_first_playable_success",
      operationType: "generate",
      status: "running",
      createdAt: "2026-06-10T12:00:00.000Z",
      startedAt: "2026-06-10T12:00:00.000Z",
      request: {
        summary: "make a top-down crystal chase",
        promptText: "make a top-down crystal chase",
      },
      runtimeKind: "phaser",
      templateId: topDownPhaserTemplate.gameSpec.template.id,
      mechanicIds: topDownPhaserTemplate.gameSpec.mechanics.map(
        (mechanic) => mechanic.id
      ),
      attempts: [
        {
          id: "generation_run_first_playable_success_attempt_1",
          attemptNumber: 1,
          kind: "initial",
          status: "succeeded",
          provider: "openai",
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
          requestSummary: "make a top-down crystal chase",
          startedAt: "2026-06-10T12:00:00.000Z",
          completedAt: "2026-06-10T12:00:03.000Z",
          durationMs: 3000,
          validation: {
            stage: "semantic-validation",
            status: "passed",
          },
          candidate: {
            kind: "validated_spec",
            gameSpecId: topDownPhaserTemplate.gameSpec.id,
            summary: `Validated Phaser Game Spec "${topDownPhaserTemplate.gameSpec.title}".`,
            referencedMechanicIds: topDownPhaserTemplate.gameSpec.mechanics.map(
              (mechanic) => mechanic.id
            ),
          },
        },
      ],
    });

    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(
        createInput({
          generationRunRepository: repository,
          validationSource: {
            ...validationSource,
            generationRunId: "generation_run_first_playable_success",
            source: "generated-spec",
          },
        })
      )
    );

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
      result.current.handleRuntimeValidationEvidence({
        checkId: "nonblank_render",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "player_visible",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "input_response",
        status: "passed",
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    const generationRun = await repository.fetch(
      "generation_run_first_playable_success"
    );

    expect(result.current.firstPlayableGenerationRunId).toBe(
      "generation_run_first_playable_success"
    );
    expect(generationRun).toMatchObject({
      status: "running",
    });
    expect(generationRun?.relationships).toBeUndefined();
  });

  it("blocks editor state when runtime validation evidence fails", () => {
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(createInput({ onGameStatusChange }))
    );

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
      result.current.handleRuntimeValidationEvidence({
        checkId: "input_response",
        status: "failed",
        message: "Runtime did not respond to movement input.",
        issues: [
          {
            code: "input_probe_no_velocity",
            path: "runtime.input",
            message: "Runtime did not respond to movement input.",
          },
        ],
      });
    });

    expect(onGameStatusChange).toHaveBeenLastCalledWith({
      state: "error",
      message: "Runtime did not respond to movement input.",
    });
    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      failureMessage: "Runtime did not respond to movement input.",
      shouldBlockPlayable: true,
      status: "failed",
    });
    expect(result.current.firstPlayableGamePack).toMatchObject({
      builds: [
        expect.objectContaining({
          id: "build_failed_first_playable",
          status: "failed",
        }),
      ],
      checkpoints: [],
      failedAttempts: [
        expect.objectContaining({
          id: "failed_attempt_first_playable_runtime",
          buildId: "build_failed_first_playable",
        }),
      ],
    });
  });

  it("finalizes a generated Phaser GenerationRun when first-playable validation fails", async () => {
    const repository = createGenerationRunTestRepository().repository;

    await repository.create(
      createRunningSpecGenerationRun("generation_run_first_playable_failure")
    );

    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(
        createInput({
          generationRunRepository: repository,
          validationSource: {
            ...validationSource,
            generationRunId: "generation_run_first_playable_failure",
            source: "generated-spec",
          },
        })
      )
    );

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
      result.current.handleRuntimeValidationEvidence({
        checkId: "input_response",
        status: "failed",
        message: "Runtime did not respond to movement input.",
        issues: [
          {
            code: "input_probe_no_velocity",
            path: "runtime.input",
            message: "Runtime did not respond to movement input.",
          },
        ],
      });
    });

    await waitFor(async () => {
      await expect(
        repository.fetch("generation_run_first_playable_failure")
      ).resolves.toMatchObject({
        failureClass: "first-playable-failure",
        stage: "browser-check",
        status: "failed",
      });
    });
    const generationRun = await repository.fetch(
      "generation_run_first_playable_failure"
    );

    expect(generationRun?.relationships).toBeUndefined();
  });

  it("records fatal runtime errors as blocking editor errors", () => {
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(createInput({ onGameStatusChange }))
    );

    act(() => {
      result.current.handleRuntimeStatusChange({
        state: "error",
        message: "Runtime crashed during boot.",
      });
    });

    expect(onGameStatusChange).toHaveBeenCalledWith({
      state: "error",
      message: "Runtime crashed during boot.",
    });
    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      failureMessage: "Runtime crashed during boot.",
      shouldBlockPlayable: true,
      status: "failed",
    });
    expect(result.current.firstPlayableGamePack).toMatchObject({
      builds: [
        expect.objectContaining({
          id: "build_failed_first_playable",
          status: "failed",
        }),
      ],
      failedAttempts: [
        expect.objectContaining({
          id: "failed_attempt_first_playable_runtime",
          buildId: "build_failed_first_playable",
        }),
      ],
    });
  });

  it("blocks before boot when the Game Spec has no primary objective", () => {
    const gameSpec = {
      ...topDownPhaserTemplate.gameSpec,
      objectives: topDownPhaserTemplate.gameSpec.objectives.map(
        (objective) => ({
          ...objective,
          primary: false,
        })
      ),
    };
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(
        createInput({
          validationSource: {
            gameSpec,
            runtimeCandidate: {
              ...validationSource.runtimeCandidate,
            },
            source: "fixture",
            runtimeKind: "phaser",
          },
        })
      )
    );

    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      failureMessage: "Expected exactly one primary objective.",
      shouldBlockPlayable: true,
      status: "failed",
    });
    expect(result.current.firstPlayableGamePack).toMatchObject({
      builds: [],
      checkpoints: [],
      failedAttempts: [
        expect.objectContaining({
          id: "failed_attempt_first_playable_pre_runtime",
        }),
      ],
    });
  });

  it("finalizes a generated Phaser GenerationRun when first-playable validation fails before runtime boot", async () => {
    const repository = createGenerationRunTestRepository().repository;
    const gameSpec = {
      ...topDownPhaserTemplate.gameSpec,
      objectives: topDownPhaserTemplate.gameSpec.objectives.map(
        (objective) => ({
          ...objective,
          primary: false,
        })
      ),
    };

    await repository.create(
      createRunningSpecGenerationRun("generation_run_pre_runtime_failure")
    );

    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(
        createInput({
          generationRunRepository: repository,
          validationSource: {
            gameSpec,
            generationRunId: "generation_run_pre_runtime_failure",
            runtimeCandidate: {
              ...validationSource.runtimeCandidate,
            },
            source: "generated-spec",
            runtimeKind: "phaser",
          },
        })
      )
    );

    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      failureMessage: "Expected exactly one primary objective.",
      shouldBlockPlayable: true,
      status: "failed",
    });

    await waitFor(async () => {
      await expect(
        repository.fetch("generation_run_pre_runtime_failure")
      ).resolves.toMatchObject({
        failureClass: "first-playable-failure",
        stage: "artifact-build",
        status: "failed",
      });
    });
    const generationRun = await repository.fetch(
      "generation_run_pre_runtime_failure"
    );

    expect(generationRun?.relationships).toBeUndefined();
  });

  it("starts a new attempt when the runtime reset key changes", () => {
    const initialInput = createInput();
    const { rerender, result } = renderHook(
      (input: GateInput) => useFirstPlayableValidationGate(input),
      {
        initialProps: initialInput,
      }
    );

    act(() => {
      result.current.handleRuntimeStatusChange({
        state: "error",
        message: "Runtime crashed during boot.",
      });
    });

    expect(result.current.firstPlayableValidationAttempt?.status).toBe(
      "failed"
    );

    rerender({
      ...initialInput,
      gameResetNonce: 1,
    });

    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      shouldBlockPlayable: false,
      status: "running",
    });
  });
});

function createRunningSpecGenerationRun(id: string) {
  return {
    id,
    operationType: "generate" as const,
    status: "running" as const,
    createdAt: "2026-06-10T12:00:00.000Z",
    startedAt: "2026-06-10T12:00:00.000Z",
    request: {
      summary: "make a top-down crystal chase",
      promptText: "make a top-down crystal chase",
    },
    runtimeKind: "phaser" as const,
    templateId: topDownPhaserTemplate.gameSpec.template.id,
    mechanicIds: topDownPhaserTemplate.gameSpec.mechanics.map(
      (mechanic) => mechanic.id
    ),
    attempts: [
      {
        id: `${id}_attempt_1`,
        attemptNumber: 1,
        kind: "initial" as const,
        status: "succeeded" as const,
        provider: "openai",
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
        requestSummary: "make a top-down crystal chase",
        startedAt: "2026-06-10T12:00:00.000Z",
        completedAt: "2026-06-10T12:00:03.000Z",
        durationMs: 3000,
        validation: {
          stage: "semantic-validation" as const,
          status: "passed" as const,
        },
        candidate: {
          kind: "validated_spec" as const,
          gameSpecId: topDownPhaserTemplate.gameSpec.id,
          summary: `Validated Phaser Game Spec "${topDownPhaserTemplate.gameSpec.title}".`,
          referencedMechanicIds: topDownPhaserTemplate.gameSpec.mechanics.map(
            (mechanic) => mechanic.id
          ),
        },
      },
    ],
  };
}
