import { describe, expect, it } from "vitest";

import { getDefaultTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { createInitialGamePack } from "./game-pack-factory";
import {
  type FirstPlayableRuntimeCandidate,
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  writeFirstPlayableValidationResult,
} from "./first-playable-validation";
import { gamePackSchema, type GamePack } from "./game-pack-schema";

const startedAt = "2026-05-21T13:00:00.000Z";
const observedAt = "2026-05-21T13:00:01.500Z";
const completedAt = "2026-05-21T13:00:02.000Z";

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

function recordRuntimeReady(attempt: ReturnType<typeof startValidation>) {
  return recordFirstPlayableRuntimeStatus({
    attempt,
    observedAt,
    status: { state: "ready" },
  });
}

function recordPassingRuntimeEvidence(
  attempt: ReturnType<typeof startValidation>
) {
  return ([
    {
      checkId: "nonblank_render",
      status: "passed",
      message: "Runtime reported nonblank render output.",
      evidence: {
        renderedObjectCount: 4,
      },
    },
    {
      checkId: "player_visible",
      status: "passed",
      message: "Runtime reported a visible player.",
      evidence: {
        hasBody: true,
        playerPosition: { x: 160, y: 270 },
      },
    },
    {
      checkId: "input_response",
      status: "passed",
      message: "Runtime reported player input response.",
      evidence: {
        inputAction: "move_right",
        playerVelocity: { x: 220, y: 0 },
      },
    },
  ] as const).reduce(
    (nextAttempt, evidence) =>
      recordFirstPlayableRuntimeEvidence({
        attempt: nextAttempt,
        evidence,
        observedAt,
      }),
    attempt
  );
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

  it("records runtime boot success from a ready status without passing before runtime evidence", () => {
    const attempt = startValidation();

    const nextAttempt = recordRuntimeReady(attempt);

    expect(nextAttempt.status).toBe("running");
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

  it("passes after runtime boot and nonblank/player/input evidence all pass", () => {
    const attempt = recordRuntimeReady(startValidation());

    const nextAttempt = recordPassingRuntimeEvidence(attempt);

    expect(nextAttempt.status).toBe("passed");
    expect(nextAttempt.shouldBlockPlayable).toBe(false);
    expect(nextAttempt.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "evidence_nonblank_render",
          checkId: "nonblank_render",
          stage: "browser-check",
          status: "passed",
          evidence: {
            source: "runtime-self-report",
            renderedObjectCount: 4,
          },
        }),
        expect.objectContaining({
          id: "evidence_player_visible",
          checkId: "player_visible",
          stage: "browser-check",
          status: "passed",
        }),
        expect.objectContaining({
          id: "evidence_input_response",
          checkId: "input_response",
          stage: "browser-check",
          status: "passed",
        }),
      ])
    );
  });

  it("writes successful validation evidence into a Playable Build and initial checkpoint", () => {
    const gamePack = createGamePack();
    const attempt = recordPassingRuntimeEvidence(
      recordRuntimeReady(startValidation(gamePack))
    );
    const validationEvidenceIds = attempt.evidence.map(
      (evidence) => evidence.id
    );

    const nextGamePack = writeFirstPlayableValidationResult({
      gamePack,
      attempt,
      completedAt,
    });

    expect(gamePackSchema.parse(nextGamePack)).toEqual(nextGamePack);
    expect(nextGamePack.validationEvidence.map((evidence) => evidence.id)).toEqual(
      validationEvidenceIds
    );
    expect(nextGamePack.failedAttempts).toEqual([]);
    expect(nextGamePack.currentCheckpointId).toBe(
      "checkpoint_initial_playable"
    );
    expect(nextGamePack.builds).toEqual([
      expect.objectContaining({
        id: "build_initial_playable",
        checkpointId: "checkpoint_initial_playable",
        createdAt: completedAt,
        gameSpecId: gamePack.gameSpec.id,
        status: "validated",
        validationEvidenceIds,
        artifactMetadata: expect.objectContaining({
          validationEvidenceByStage: expect.objectContaining({
            "browser-check": [
              {
                id: "evidence_nonblank_render",
                checkId: "nonblank_render",
                status: "passed",
              },
              {
                id: "evidence_player_visible",
                checkId: "player_visible",
                status: "passed",
              },
              {
                id: "evidence_input_response",
                checkId: "input_response",
                status: "passed",
              },
            ],
            "runtime-boot": [
              {
                id: "evidence_runtime_boot",
                checkId: "runtime_boot",
                status: "passed",
              },
            ],
          }),
        }),
      }),
    ]);
    expect(nextGamePack.checkpoints).toEqual([
      expect.objectContaining({
        id: "checkpoint_initial_playable",
        buildId: "build_initial_playable",
        gameSpecId: gamePack.gameSpec.id,
        validationEvidenceIds,
      }),
    ]);
  });

  it("writes pre-runtime failures into failedAttempts without creating a normal build or checkpoint", () => {
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
    const validationEvidenceIds = attempt.evidence.map(
      (evidence) => evidence.id
    );

    const nextGamePack = writeFirstPlayableValidationResult({
      gamePack,
      attempt,
      completedAt,
    });

    expect(gamePackSchema.parse(nextGamePack)).toEqual(nextGamePack);
    expect(nextGamePack.builds).toEqual([]);
    expect(nextGamePack.checkpoints).toEqual([]);
    expect(nextGamePack.failedAttempts).toEqual([
      expect.objectContaining({
        id: "failed_attempt_first_playable_pre_runtime",
        gameSpecId: gamePack.gameSpec.id,
        stage: "spec-validation",
        validationEvidenceIds,
      }),
    ]);
    expect(nextGamePack.failedAttempts[0]).not.toHaveProperty("buildId");
  });

  it("writes runtime-mounted failures into a failed build and linked failed attempt", () => {
    const gamePack = createGamePack();
    const attempt = recordFirstPlayableRuntimeStatus({
      attempt: startValidation(gamePack),
      observedAt,
      status: { state: "error", message: "Runtime crashed during boot." },
    });
    const validationEvidenceIds = attempt.evidence.map(
      (evidence) => evidence.id
    );

    const nextGamePack = writeFirstPlayableValidationResult({
      gamePack,
      attempt,
      completedAt,
    });

    expect(gamePackSchema.parse(nextGamePack)).toEqual(nextGamePack);
    expect(nextGamePack.checkpoints).toEqual([]);
    expect(nextGamePack.builds).toEqual([
      expect.objectContaining({
        id: "build_failed_first_playable",
        gameSpecId: gamePack.gameSpec.id,
        status: "failed",
        validationEvidenceIds,
      }),
    ]);
    expect(nextGamePack.builds[0]).not.toHaveProperty("checkpointId");
    expect(nextGamePack.failedAttempts).toEqual([
      expect.objectContaining({
        id: "failed_attempt_first_playable_runtime",
        buildId: "build_failed_first_playable",
        gameSpecId: gamePack.gameSpec.id,
        stage: "runtime-boot",
        validationEvidenceIds,
      }),
    ]);
  });

  it("preserves repair-ready failed evidence and artifact references without running repair", () => {
    const gamePack = createGamePack();
    const attempt = recordFirstPlayableRuntimeEvidence({
      attempt: recordRuntimeReady(startValidation(gamePack)),
      observedAt,
      evidence: {
        checkId: "nonblank_render",
        status: "failed",
        message: "Canvas stayed blank after boot.",
        issues: [
          {
            code: "blank_canvas",
            path: "canvas.drawCalls",
            message: "Expected at least one draw call.",
          },
        ],
        evidence: {
          renderedObjectCount: 0,
          screenshotHash: "sha256-empty-canvas",
        },
      },
    });

    const nextGamePack = writeFirstPlayableValidationResult({
      gamePack,
      attempt,
      completedAt,
    });
    const failedReceipt = nextGamePack.validationEvidence.find(
      (evidence) => evidence.id === "evidence_nonblank_render"
    );

    expect(nextGamePack.generationRuns).toEqual([]);
    expect(nextGamePack.checkpoints).toEqual([]);
    expect(nextGamePack.builds).toEqual([
      expect.objectContaining({
        id: "build_failed_first_playable",
        status: "failed",
        validationEvidenceIds: attempt.evidence.map(
          (evidence) => evidence.id
        ),
        artifactMetadata: expect.objectContaining({
          validationEvidenceByStage: expect.objectContaining({
            "browser-check": [
              {
                id: "evidence_nonblank_render",
                checkId: "nonblank_render",
                status: "failed",
              },
            ],
          }),
        }),
      }),
    ]);
    expect(nextGamePack.failedAttempts).toEqual([
      expect.objectContaining({
        id: "failed_attempt_first_playable_runtime",
        buildId: "build_failed_first_playable",
        gameSpecId: gamePack.gameSpec.id,
        stage: "browser-check",
        summary: "Expected at least one draw call.",
        validationEvidenceIds: attempt.evidence.map(
          (evidence) => evidence.id
        ),
        metadata: expect.objectContaining({
          validationEvidenceByStage: expect.objectContaining({
            "browser-check": [
              {
                id: "evidence_nonblank_render",
                checkId: "nonblank_render",
                status: "failed",
              },
            ],
          }),
        }),
      }),
    ]);
    expect(failedReceipt).toEqual(
      expect.objectContaining({
        id: "evidence_nonblank_render",
        checkId: "nonblank_render",
        stage: "browser-check",
        status: "failed",
        message: "Canvas stayed blank after boot.",
        issues: [
          {
            code: "blank_canvas",
            path: "canvas.drawCalls",
            message: "Expected at least one draw call.",
          },
        ],
        evidence: {
          source: "runtime-self-report",
          renderedObjectCount: 0,
          screenshotHash: "sha256-empty-canvas",
        },
      })
    );
  });

  it.each([
    [
      "nonblank_render",
      "evidence_nonblank_render",
      "runtime.render",
      "Expected the runtime to report at least one visible render object.",
    ],
    [
      "player_visible",
      "evidence_player_visible",
      "runtime.player",
      "Expected the runtime to report a visible player.",
    ],
    [
      "input_response",
      "evidence_input_response",
      "runtime.input",
      "Expected the runtime to report a response to movement input.",
    ],
  ] as const)(
    "blocks playable state when %s runtime evidence fails",
    (checkId, evidenceId, issuePath, message) => {
      const attempt = recordRuntimeReady(startValidation());

      const nextAttempt = recordFirstPlayableRuntimeEvidence({
        attempt,
        observedAt,
        evidence: {
          checkId,
          status: "failed",
          message,
          evidence: {
            probe: "first_playable",
          },
        },
      });

      expect(nextAttempt.status).toBe("failed");
      expect(nextAttempt.shouldBlockPlayable).toBe(true);
      expect(nextAttempt.failureMessage).toBe(message);
      expect(nextAttempt.evidence).toContainEqual(
        expect.objectContaining({
          id: evidenceId,
          checkId,
          stage: "browser-check",
          status: "failed",
          issues: [
            expect.objectContaining({
              path: issuePath,
              message,
            }),
          ],
          evidence: {
            source: "runtime-self-report",
            probe: "first_playable",
          },
        })
      );
    }
  );

  it("keeps runtime evidence JSON-safe by dropping unsupported details", () => {
    const attempt = recordRuntimeReady(startValidation());

    const nextAttempt = recordFirstPlayableRuntimeEvidence({
      attempt,
      observedAt,
      evidence: {
        checkId: "nonblank_render",
        status: "passed",
        evidence: {
          ok: true,
          bad: Number.POSITIVE_INFINITY,
        },
      },
    });

    expect(nextAttempt.evidence).toContainEqual(
      expect.objectContaining({
        checkId: "nonblank_render",
        evidence: {
          source: "runtime-self-report",
          ok: true,
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

  it("does not mutate an already failed pre-runtime attempt from runtime evidence", () => {
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

    expect(
      recordFirstPlayableRuntimeEvidence({
        attempt,
        observedAt,
        evidence: {
          checkId: "nonblank_render",
          status: "passed",
        },
      })
    ).toBe(attempt);
  });
});
