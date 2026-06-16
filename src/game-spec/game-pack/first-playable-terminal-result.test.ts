import { describe, expect, it } from "vitest";

import { type GamePack } from "@/game-spec";
import { createEmptyGamePackFixture } from "@/game-spec/game-pack/testing/game-pack-fixtures";
import { topDownPhaserTemplate } from "@/runtime/phaser";
import {
  createFirstPlayableAttemptFixture,
  createGenerationRunTestRepository,
  createRunningPhaserSpecGenerationRun,
} from "@/service/generation-run/testing/generation-run-test-harness";

import { writeFirstPlayableTerminalResult } from "./first-playable-terminal-result";

describe("writeFirstPlayableTerminalResult", () => {
  it("writes passed first-playable results without succeeding the GenerationRun before durable persistence", async () => {
    const repository = createGenerationRunTestRepository().repository;
    const gamePack = createGamePack();
    const { attempt } = createFirstPlayableAttemptFixture({
      gamePack,
      scenario: "passed",
    });

    await repository.create(
      createRunningPhaserSpecGenerationRun({
        gamePack,
        id: "generation_run_terminal_success",
      })
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
    const { attempt } = createFirstPlayableAttemptFixture({
      gamePack,
      scenario: "runtime-failed",
    });

    await repository.create(
      {
        ...createRunningPhaserSpecGenerationRun({
          gamePack,
          id: "generation_run_terminal_failure",
        }),
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
    const { attempt, gamePack } = createFirstPlayableAttemptFixture({
      scenario: "pre-runtime-failed",
    });

    await repository.create(
      createRunningPhaserSpecGenerationRun({
        gamePack,
        id: "generation_run_terminal_pre_runtime",
      })
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
