import { describe, expect, it } from "vitest";

import { createEmptyGamePackFixture } from "@/game-spec/game-pack/testing/game-pack-fixtures";

import {
  createFirstPlayableAttemptFixture,
  createRunningPhaserSpecGenerationRun,
} from "./generation-run-test-harness";

describe("GenerationRun test harness", () => {
  describe("createRunningPhaserSpecGenerationRun", () => {
    it("creates a running Phaser Spec Generation run without terminal fields", () => {
      const gamePack = createEmptyGamePackFixture();

      const generationRun = createRunningPhaserSpecGenerationRun({
        id: "generation_run_running_fixture",
        gamePack,
      });

      expect(generationRun).toMatchObject({
        id: "generation_run_running_fixture",
        operationType: "generate",
        status: "running",
        runtimeKind: "phaser",
        templateId: gamePack.templateId,
        mechanicIds: gamePack.gameSpec.mechanics.map((mechanic) => mechanic.id),
        attempts: [
          expect.objectContaining({
            attemptNumber: 1,
            kind: "initial",
            status: "succeeded",
          }),
        ],
      });
      expect(generationRun).not.toHaveProperty("completedAt");
      expect(generationRun).not.toHaveProperty("durationMs");
      expect(generationRun).not.toHaveProperty("failureClass");
      expect(generationRun).not.toHaveProperty("relationships");
      expect(generationRun).not.toHaveProperty("repairStatus");
      expect(generationRun).not.toHaveProperty("stage");
    });

    it("creates a running repaired Phaser Spec Generation run with failed and repair attempts", () => {
      const generationRun = createRunningPhaserSpecGenerationRun({
        id: "generation_run_running_repaired_fixture",
        attempts: "repaired-success",
      });

      expect(generationRun).toMatchObject({
        id: "generation_run_running_repaired_fixture",
        status: "running",
        attempts: [
          expect.objectContaining({
            attemptNumber: 1,
            kind: "initial",
            status: "failed",
          }),
          expect.objectContaining({
            attemptNumber: 2,
            kind: "repair",
            status: "succeeded",
          }),
        ],
      });
      expect(generationRun).not.toHaveProperty("completedAt");
      expect(generationRun).not.toHaveProperty("relationships");
      expect(generationRun).not.toHaveProperty("repairStatus");
    });
  });

  describe("createFirstPlayableAttemptFixture", () => {
    it("drives a passed first-playable attempt through production validation steps", () => {
      const { attempt, gamePack } = createFirstPlayableAttemptFixture({
        scenario: "passed",
      });

      expect(attempt).toMatchObject({
        gamePackId: gamePack.id,
        shouldBlockPlayable: false,
        status: "passed",
        evidence: expect.arrayContaining([
          expect.objectContaining({
            checkId: "runtime_boot",
            status: "passed",
          }),
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
    });

    it("drives a runtime-failed first-playable attempt through runtime evidence", () => {
      const { attempt, gamePack } = createFirstPlayableAttemptFixture({
        scenario: "runtime-failed",
      });

      expect(attempt).toMatchObject({
        gamePackId: gamePack.id,
        failureMessage: "Runtime did not respond to movement input.",
        shouldBlockPlayable: true,
        status: "failed",
        evidence: expect.arrayContaining([
          expect.objectContaining({
            checkId: "runtime_boot",
            status: "passed",
          }),
          expect.objectContaining({
            checkId: "input_response",
            status: "failed",
          }),
        ]),
      });
    });

    it("creates a pre-runtime failed attempt when no Game Pack is supplied", () => {
      const { attempt, gamePack } = createFirstPlayableAttemptFixture({
        scenario: "pre-runtime-failed",
      });

      expect(gamePack.gameSpec.objectives.every((objective) => !objective.primary))
        .toBe(true);
      expect(attempt).toMatchObject({
        gamePackId: gamePack.id,
        failureMessage: "Expected exactly one primary objective.",
        shouldBlockPlayable: true,
        status: "failed",
      });
    });
  });
});
