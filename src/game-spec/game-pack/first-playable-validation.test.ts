import { describe, expect, it } from "vitest";

import { getDefaultTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { createInitialGamePack } from "./game-pack-factory";
import {
  type FirstPlayableRuntimeCandidate,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
} from "./first-playable-validation";
import type { GamePack } from "./game-pack-schema";

const startedAt = "2026-05-21T13:00:00.000Z";
const observedAt = "2026-05-21T13:00:01.500Z";

function createGamePack() {
  return createInitialGamePack({
    gameSpec: getDefaultTopDownGameSpecFixture(),
    runtimeKind: "phaser",
    createdAt: startedAt,
  });
}

function createRuntimeCandidate(
  gamePack: GamePack,
  overrides: Partial<FirstPlayableRuntimeCandidate> = {}
): FirstPlayableRuntimeCandidate {
  return {
    runtimeDependencyScriptPaths: [
      "/runtime/phaser/mechanics/player-movement.js",
    ],
    runtimeKind: gamePack.runtimeKind,
    runtimeScriptPath: "/runtime/phaser/top-down-template.js",
    templateId: gamePack.templateId,
    ...overrides,
  };
}

function startValidation(gamePack = createGamePack()) {
  return startFirstPlayableValidation({
    gamePack,
    runtimeCandidate: createRuntimeCandidate(gamePack),
    startedAt,
  });
}

describe("first-playable validation orchestration", () => {
  it("records passing pre-runtime evidence for a valid top-down Phaser fixture", () => {
    const attempt = startValidation();

    expect(attempt).toMatchObject({
      status: "running",
      shouldBlockPlayable: false,
    });
    expect(attempt.evidence).toEqual([
      expect.objectContaining({
        id: "evidence_basic_objective_presence",
        checkId: "basic_objective_presence",
        stage: "spec-validation",
        status: "passed",
      }),
      expect.objectContaining({
        id: "evidence_player_entity_presence",
        checkId: "player_entity_presence",
        stage: "spec-validation",
        status: "passed",
      }),
      expect.objectContaining({
        id: "evidence_first_playable_reference_consistency",
        checkId: "first_playable_reference_consistency",
        stage: "spec-validation",
        status: "passed",
      }),
      expect.objectContaining({
        id: "evidence_runtime_template_entrypoint",
        checkId: "runtime_template_entrypoint",
        stage: "artifact-build",
        status: "passed",
      }),
      expect.objectContaining({
        id: "evidence_render_placeholder_asset_refs",
        checkId: "render_placeholder_asset_refs",
        stage: "spec-validation",
        status: "passed",
      }),
    ]);
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

    const attempt = startValidation(gamePack);

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
          message: "Expected exactly one primary objective.",
        },
      ],
    });
  });

  it("fails and blocks playable state when the Game Spec has multiple primary objectives", () => {
    const gameSpec = getDefaultTopDownGameSpecFixture();
    const gamePack = createInitialGamePack({
      gameSpec: {
        ...gameSpec,
        objectives: [
          ...gameSpec.objectives,
          {
            id: "objective_escape",
            label: "Escape",
            description: "Escape after collecting crystals.",
            primary: true,
          },
        ],
      },
      runtimeKind: "phaser",
      createdAt: startedAt,
    });

    const attempt = startValidation(gamePack);

    expect(attempt.status).toBe("failed");
    expect(attempt.shouldBlockPlayable).toBe(true);
    expect(attempt.evidence).toContainEqual(
      expect.objectContaining({
        checkId: "basic_objective_presence",
        status: "failed",
        issues: [
          {
            code: "multiple_primary_objectives",
            path: "gameSpec.objectives",
            message: "Expected exactly one primary objective.",
          },
        ],
      })
    );
  });

  it("fails and blocks playable state when no player entity exists", () => {
    const gameSpec = getDefaultTopDownGameSpecFixture();
    const gamePack = createInitialGamePack({
      gameSpec: {
        ...gameSpec,
        entities: gameSpec.entities.filter((entity) => entity.role !== "player"),
      },
      runtimeKind: "phaser",
      createdAt: startedAt,
    });

    const attempt = startValidation(gamePack);

    expect(attempt.status).toBe("failed");
    expect(attempt.shouldBlockPlayable).toBe(true);
    expect(attempt.evidence).toContainEqual(
      expect.objectContaining({
        checkId: "player_entity_presence",
        status: "failed",
        issues: [
          {
            code: "missing_player_entity",
            path: "gameSpec.entities",
            message: 'Expected at least one entity with role "player".',
          },
        ],
      })
    );
  });

  it("fails when critical first-playable references do not resolve", () => {
    const gameSpec = getDefaultTopDownGameSpecFixture();
    const gamePack = createInitialGamePack({
      gameSpec: {
        ...gameSpec,
        mechanics: gameSpec.mechanics.map((mechanic) =>
          mechanic.id === "mechanic_player_movement"
            ? {
                ...mechanic,
                targetIds: ["entity_missing"],
              }
            : mechanic
        ),
      },
      runtimeKind: "phaser",
      createdAt: startedAt,
    });

    const attempt = startValidation(gamePack);

    expect(attempt.status).toBe("failed");
    expect(attempt.evidence).toContainEqual(
      expect.objectContaining({
        checkId: "first_playable_reference_consistency",
        status: "failed",
        issues: [
          {
            code: "unknown_entity_reference",
            path: "gameSpec.mechanics.mechanic_player_movement.targetIds",
            message: 'Unknown entity ID "entity_missing".',
          },
        ],
      })
    );
  });

  it("fails when runtime template metadata is mismatched or missing", () => {
    const gamePack = createGamePack();
    const attempt = startFirstPlayableValidation({
      gamePack,
      runtimeCandidate: createRuntimeCandidate(gamePack, {
        runtimeScriptPath: "",
        templateId: "template_other",
      }),
      startedAt,
    });

    expect(attempt.status).toBe("failed");
    expect(attempt.evidence).toContainEqual(
      expect.objectContaining({
        checkId: "runtime_template_entrypoint",
        stage: "artifact-build",
        status: "failed",
        issues: [
          {
            code: "runtime_template_mismatch",
            path: "runtimeCandidate.templateId",
            message: 'Expected runtime template "template_top_down".',
          },
          {
            code: "missing_runtime_script_path",
            path: "runtimeCandidate.runtimeScriptPath",
            message: "Expected a Phaser runtime script path before boot.",
          },
        ],
      })
    );
  });

  it("fails when render-critical placeholder asset references are missing", () => {
    const gameSpec = getDefaultTopDownGameSpecFixture();
    const gamePack = createInitialGamePack({
      gameSpec: {
        ...gameSpec,
        assets: gameSpec.assets.filter((asset) => asset.role !== "player"),
        mechanics: gameSpec.mechanics.map((mechanic) =>
          mechanic.type === "pickup_collection"
            ? {
                ...mechanic,
                assetIds: ["asset_player"],
              }
            : mechanic
        ),
      },
      runtimeKind: "phaser",
      createdAt: startedAt,
    });

    const attempt = startValidation(gamePack);

    expect(attempt.status).toBe("failed");
    expect(attempt.evidence).toContainEqual(
      expect.objectContaining({
        checkId: "render_placeholder_asset_refs",
        status: "failed",
        issues: [
          {
            code: "missing_player_placeholder_asset",
            path: "gameSpec.assets",
            message: "Expected at least one tracked player asset.",
          },
          {
            code: "missing_pickup_placeholder_asset_reference",
            path: "gameSpec.mechanics.mechanic_pickup_collection.assetIds",
            message: "Expected pickup collection mechanic to reference a pickup asset.",
          },
        ],
      })
    );
  });

  it("records runtime boot success from a ready status", () => {
    const attempt = startValidation();

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
    const attempt = startValidation();

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
    const attempt = startValidation();

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

  it("does not mutate an already failed pre-runtime attempt from runtime status", () => {
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
    const attempt = startValidation(gamePack);

    expect(
      recordFirstPlayableRuntimeStatus({
        attempt,
        observedAt,
        status: { state: "ready" },
      })
    ).toBe(attempt);
  });
});
