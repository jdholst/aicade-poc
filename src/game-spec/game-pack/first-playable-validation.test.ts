import { describe, expect, it } from "vitest";

import { getDefaultTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { createInitialGamePack } from "./game-pack-factory";
import {
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
} from "./first-playable-validation";

const startedAt = "2026-05-21T13:00:00.000Z";
const observedAt = "2026-05-21T13:00:01.500Z";

function createGamePack() {
  return createInitialGamePack({
    gameSpec: getDefaultTopDownGameSpecFixture(),
    runtimeKind: "phaser",
    createdAt: startedAt,
  });
}

describe("first-playable validation orchestration", () => {
  it("records passing objective presence evidence when a primary objective exists", () => {
    const attempt = startFirstPlayableValidation({
      gamePack: createGamePack(),
      startedAt,
    });

    expect(attempt).toMatchObject({
      status: "running",
      shouldBlockPlayable: false,
      evidence: [
        {
          id: "evidence_basic_objective_presence",
          checkId: "basic_objective_presence",
          stage: "spec-validation",
          status: "passed",
        },
      ],
    });
  });

  it("fails and blocks playable state when the Game Spec has no primary objective", () => {
    const gameSpec = getDefaultTopDownGameSpecFixture();
    const gamePack = createInitialGamePack({
      gameSpec: {
        ...gameSpec,
        objectives: gameSpec.objectives.map((objective) => ({
          ...objective,
          primary: false,
        })),
      },
      runtimeKind: "phaser",
      createdAt: startedAt,
    });

    const attempt = startFirstPlayableValidation({
      gamePack,
      startedAt,
    });

    expect(attempt.status).toBe("failed");
    expect(attempt.shouldBlockPlayable).toBe(true);
    expect(attempt.failureMessage).toContain("primary objective");
    expect(attempt.evidence[0]).toMatchObject({
      id: "evidence_basic_objective_presence",
      checkId: "basic_objective_presence",
      stage: "spec-validation",
      status: "failed",
      issues: [
        {
          code: "missing_primary_objective",
          path: "gameSpec.objectives",
        },
      ],
    });
  });

  it("records runtime boot success from a ready status", () => {
    const attempt = startFirstPlayableValidation({
      gamePack: createGamePack(),
      startedAt,
    });

    const nextAttempt = recordFirstPlayableRuntimeStatus({
      attempt,
      observedAt,
      status: { state: "ready" },
    });

    expect(nextAttempt.status).toBe("passed");
    expect(nextAttempt.shouldBlockPlayable).toBe(false);
    expect(nextAttempt.evidence).toContainEqual(
      expect.objectContaining({
        id: "evidence_runtime_boot",
        checkId: "runtime_boot",
        stage: "runtime-boot",
        status: "passed",
        durationMs: 1500,
        evidence: {
          runtimeStatus: "ready",
        },
      })
    );
  });

  it("records fatal runtime errors as blocking runtime-boot evidence", () => {
    const attempt = startFirstPlayableValidation({
      gamePack: createGamePack(),
      startedAt,
    });

    const nextAttempt = recordFirstPlayableRuntimeStatus({
      attempt,
      observedAt,
      status: { state: "error", message: "Runtime crashed during boot." },
    });

    expect(nextAttempt.status).toBe("failed");
    expect(nextAttempt.shouldBlockPlayable).toBe(true);
    expect(nextAttempt.failureMessage).toBe("Runtime crashed during boot.");
    expect(nextAttempt.evidence).toContainEqual(
      expect.objectContaining({
        id: "evidence_runtime_boot",
        checkId: "runtime_boot",
        stage: "runtime-boot",
        status: "failed",
        issues: [
          {
            code: "fatal_runtime_error",
            path: "runtime",
            message: "Runtime crashed during boot.",
          },
        ],
      })
    );
  });

  it("does not finalize validation for loading or recoverable warning statuses", () => {
    const attempt = startFirstPlayableValidation({
      gamePack: createGamePack(),
      startedAt,
    });

    expect(
      recordFirstPlayableRuntimeStatus({
        attempt,
        observedAt,
        status: { state: "loading" },
      })
    ).toBe(attempt);

    expect(
      recordFirstPlayableRuntimeStatus({
        attempt,
        observedAt,
        status: {
          state: "warning",
          issue: {
            type: "mechanic-disabled",
            severity: "warning",
            recoverable: true,
            mechanicId: "mechanic_player_movement",
            mechanicType: "player_movement",
            phase: "install",
            message: "Movement mechanic failed but runtime can continue.",
          },
        },
      })
    ).toBe(attempt);
  });
});
