import { describe, expect, it } from "vitest";

import {
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  type FirstPlayableValidationAttempt,
  type GamePack,
  type GenerationRun,
} from "@/game-spec";
import {
  createEmptyGamePackFixture,
  createSuccessfulGenerationRunFixture,
} from "@/game-spec/game-pack/testing/game-pack-fixtures";
import { topDownPhaserTemplate } from "@/runtime/phaser";
import { createGenerationRunTestRepository } from "@/service/generation-run/testing/generation-run-test-harness";

import { writeFirstPlayableTerminalResult } from "./first-playable-terminal-result";

describe("writeFirstPlayableTerminalResult", () => {
  it("writes passed first-playable results without succeeding the GenerationRun before durable persistence", async () => {
    const repository = createGenerationRunTestRepository().repository;
    const gamePack = createGamePack();
    const attempt = createPassedAttempt(gamePack);

    await repository.create(
      createRunningGenerationRun(gamePack, "generation_run_terminal_success")
    );

    const result = writeFirstPlayableTerminalResult({
      attempt,
      completedAt: "2026-06-10T12:00:05.000Z",
      currentValidationState: {
        attempt,
        gamePack,
        generationRunId: "generation_run_terminal_success",
        resultWritten: false,
      },
      generationRunRepository: repository,
    });

    expect(result.state).toMatchObject({
      resultWritten: true,
      gamePack: {
        builds: [
          expect.objectContaining({
            id: "build_initial_playable",
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
      },
    });
    expect(result.generationRunFinalization).toBeUndefined();

    const generationRun = await repository.fetch(
      "generation_run_terminal_success"
    );

    expect(generationRun).toMatchObject({
      status: "running",
    });
    expect(generationRun?.relationships).toBeUndefined();
  });

  it("writes failed runtime results and fails the GenerationRun at browser-check", async () => {
    const repository = createGenerationRunTestRepository().repository;
    const gamePack = createGamePack();
    const attempt = createFailedRuntimeAttempt(gamePack);

    await repository.create(
      {
        ...createRunningGenerationRun(
          gamePack,
          "generation_run_terminal_failure"
        ),
        relationships: {
          gamePackId: gamePack.id,
        },
      }
    );

    const result = writeFirstPlayableTerminalResult({
      attempt,
      completedAt: "2026-06-10T12:00:05.000Z",
      currentValidationState: {
        attempt,
        gamePack,
        generationRunId: "generation_run_terminal_failure",
        resultWritten: false,
      },
      generationRunRepository: repository,
    });

    expect(result.state.gamePack).toMatchObject({
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

    await result.generationRunFinalization;

    await expect(
      repository.fetch("generation_run_terminal_failure")
    ).resolves.toMatchObject({
      failureClass: "first-playable-failure",
      stage: "browser-check",
      status: "failed",
    });
    const generationRun = await repository.fetch(
      "generation_run_terminal_failure"
    );

    expect(generationRun?.relationships).toBeUndefined();
  });

  it("writes pre-runtime failures and fails the GenerationRun at artifact-build", async () => {
    const repository = createGenerationRunTestRepository().repository;
    const gamePack = createGamePack({
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        objectives: topDownPhaserTemplate.gameSpec.objectives.map(
          (objective) => ({
            ...objective,
            primary: false,
          })
        ),
      },
    });
    const attempt = startFirstPlayableValidation({
      gamePack,
      runtimeCandidate: createRuntimeCandidate(),
      startedAt: "2026-06-10T12:00:00.000Z",
    });

    await repository.create(
      createRunningGenerationRun(gamePack, "generation_run_terminal_pre_runtime")
    );

    const result = writeFirstPlayableTerminalResult({
      attempt,
      completedAt: "2026-06-10T12:00:05.000Z",
      currentValidationState: {
        attempt,
        gamePack,
        generationRunId: "generation_run_terminal_pre_runtime",
        resultWritten: false,
      },
      generationRunRepository: repository,
    });

    expect(result.state.gamePack).toMatchObject({
      builds: [],
      checkpoints: [],
      failedAttempts: [
        expect.objectContaining({
          id: "failed_attempt_first_playable_pre_runtime",
        }),
      ],
    });

    await result.generationRunFinalization;

    await expect(
      repository.fetch("generation_run_terminal_pre_runtime")
    ).resolves.toMatchObject({
      failureClass: "first-playable-failure",
      stage: "artifact-build",
      status: "failed",
    });
    const generationRun = await repository.fetch(
      "generation_run_terminal_pre_runtime"
    );

    expect(generationRun?.relationships).toBeUndefined();
  });
});

function createGamePack(overrides: Partial<GamePack> = {}) {
  return createEmptyGamePackFixture({
    gameSpec: topDownPhaserTemplate.gameSpec,
    runtimeKind: "phaser",
    templateId: topDownPhaserTemplate.gameSpec.template.id,
    ...overrides,
  });
}

function createPassedAttempt(gamePack: GamePack): FirstPlayableValidationAttempt {
  let attempt = startFirstPlayableValidation({
    gamePack,
    runtimeCandidate: createRuntimeCandidate(),
    startedAt: "2026-06-10T12:00:00.000Z",
  });

  attempt = recordFirstPlayableRuntimeStatus({
    attempt,
    observedAt: "2026-06-10T12:00:01.000Z",
    status: { state: "ready" },
  });

  for (const checkId of [
    "nonblank_render",
    "player_visible",
    "input_response",
  ] as const) {
    attempt = recordFirstPlayableRuntimeEvidence({
      attempt,
      evidence: {
        checkId,
        status: "passed",
      },
      observedAt: "2026-06-10T12:00:02.000Z",
    });
  }

  return attempt;
}

function createFailedRuntimeAttempt(
  gamePack: GamePack
): FirstPlayableValidationAttempt {
  let attempt = startFirstPlayableValidation({
    gamePack,
    runtimeCandidate: createRuntimeCandidate(),
    startedAt: "2026-06-10T12:00:00.000Z",
  });

  attempt = recordFirstPlayableRuntimeStatus({
    attempt,
    observedAt: "2026-06-10T12:00:01.000Z",
    status: { state: "ready" },
  });

  return recordFirstPlayableRuntimeEvidence({
    attempt,
    evidence: {
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
    },
    observedAt: "2026-06-10T12:00:02.000Z",
  });
}

function createRuntimeCandidate() {
  return {
    runtimeDependencyScriptPaths:
      topDownPhaserTemplate.runtimeDependencyScriptPaths,
    runtimeKind: "phaser" as const,
    runtimeScriptPath: topDownPhaserTemplate.runtimeScriptPath,
    templateId: topDownPhaserTemplate.gameSpec.template.id,
  };
}

function createRunningGenerationRun(
  gamePack: GamePack,
  id: GenerationRun["id"]
): GenerationRun {
  const successfulRun = createSuccessfulGenerationRunFixture(gamePack, { id });

  return {
    id: successfulRun.id,
    operationType: successfulRun.operationType,
    status: "running",
    createdAt: successfulRun.createdAt,
    startedAt: successfulRun.startedAt,
    request: successfulRun.request,
    runtimeKind: successfulRun.runtimeKind,
    templateId: successfulRun.templateId,
    mechanicIds: successfulRun.mechanicIds,
    attempts: successfulRun.attempts,
  };
}
