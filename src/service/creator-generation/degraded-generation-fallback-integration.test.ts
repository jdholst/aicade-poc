import { describe, expect, it, vi } from "vitest";

import {
  createInitialGamePack,
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  writeFirstPlayableValidationResult,
} from "@/game-spec";
import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { generateTopDownCreatorPlan } from "../creator-generation-planning/creator-generation-planning-service";
import { dispatchCreatorGenerationPlan } from "./creator-game-generation-dispatcher";

describe("degraded creator generation fallback", () => {
  it("keeps the built-in collection game playable while omitting an unsupported optional dash and provider-authored connections", async () => {
    const fixture = getFirstValidTopDownGameSpecFixture();
    const pickupMechanic = fixture.mechanics.find(
      ({ type }) => type === "pickup_collection"
    );
    expect(pickupMechanic).toBeDefined();
    const providerSpec = {
      ...fixture,
      mechanicConnections: {
        schemaVersion: "mechanic_port_connections/v1" as const,
        connections: [
          {
            id: "collection_objective_progress",
            output: {
              ownerKind: "mechanic" as const,
              ownerId: pickupMechanic!.id,
              portId: "objective_progress",
            },
            input: {
              ownerKind: "game_system" as const,
              ownerId: "objective_tracker",
              portId: "objective_progress",
            },
          },
        ],
      },
    };
    const provider = vi.fn().mockResolvedValue({
      gameSpec: providerSpec,
      mechanicIntent: {
        id: "intent_optional_dash",
        summary:
          "Make the player dash visibly faster when the movement action is pressed.",
        triggers: ["logical_action"],
        actors: ["player"],
        targets: [],
        behaviors: ["dash_actor"],
        ownedObjects: [],
        stateChanges: [],
        temporalRules: [],
        spatialRules: ["remain_inside_arena"],
        constraints: [],
        configuration: [],
        connections: [{ direction: "input", port: "move" }],
        references: [{ kind: "entity", id: "entity_player" }],
        outcomes: ["actor_moves_visibly_faster"],
        requiredCapabilities: ["object_motion_write"],
        ambiguities: [],
      },
    });
    const plan = await generateTopDownCreatorPlan({
      prompt:
        "Create a collection game and make the player dash when movement is pressed.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      generationRunId: "generation_run_degraded_integration",
      availableCapabilities: ["object_read"],
      provider,
    });

    expect(plan).toMatchObject({
      ok: true,
      routing: {
        kind: "capability_gap",
        intentSummary:
          "Make the player dash visibly faster when the movement action is pressed.",
      },
    });
    if (!plan.ok) {
      throw new Error("Expected the base Game Spec to remain valid.");
    }

    const continueGeneratedMechanicGeneration = vi.fn();
    const dispatched = await dispatchCreatorGenerationPlan({
      continueGeneratedMechanicGeneration,
      generationRunId: "generation_run_degraded_integration",
      plan,
      request: {
        prompt:
          "Create a collection game and make the player dash when movement is pressed.",
      },
      signal: new AbortController().signal,
    });

    expect(dispatched).toMatchObject({
      kind: "degraded",
      result: {
        spec: {
          id: fixture.id,
          mechanicConnections: {
            schemaVersion: "mechanic_port_connections/v1",
            connections: [],
          },
        },
      },
      warning: {
        code: "generated_mechanic_omitted",
        omittedBehavior:
          "The requested behavior “Make the player dash visibly faster when the movement action is pressed.” could not be safely added. The playable base game was generated without it.",
      },
    });
    expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
    if (dispatched.kind !== "degraded") {
      throw new Error("Expected degraded dispatch.");
    }
    expect(providerSpec.mechanicConnections.connections).toHaveLength(1);

    expect(dispatched.result.spec.mechanics.map(({ type }) => type)).toEqual(
      expect.arrayContaining(["player_movement", "pickup_collection"])
    );
    const gamePack = createInitialGamePack({
      gameSpec: dispatched.result.spec,
      runtimeKind: "phaser",
    });
    let attempt = startFirstPlayableValidation({
      gamePack,
      runtimeCandidate: {
        runtimeKind: "phaser",
        runtimeScriptPath: "/runtime/phaser/top-down-template.js",
        templateId: dispatched.result.spec.template.id,
      },
      startedAt: "2026-08-20T12:00:00.000Z",
    });

    expect(attempt).toMatchObject({ status: "running", shouldBlockPlayable: false });
    attempt = recordFirstPlayableRuntimeStatus({
      attempt,
      observedAt: "2026-08-20T12:00:01.000Z",
      status: { state: "ready" },
    });
    for (const [index, checkId] of (
      ["nonblank_render", "player_visible", "input_response"] as const
    ).entries()) {
      attempt = recordFirstPlayableRuntimeEvidence({
        attempt,
        observedAt: `2026-08-20T12:00:0${index + 2}.000Z`,
        evidence: {
          checkId,
          status: "passed",
          message: `Trusted ${checkId} evidence passed.`,
          evidence: {},
        },
      });
    }

    expect(attempt.status).toBe("passed");
    const validatedGamePack = writeFirstPlayableValidationResult({
      attempt,
      completedAt: "2026-08-20T12:00:05.000Z",
      gamePack,
    });
    expect(validatedGamePack).toMatchObject({
      gameSpec: {
        id: fixture.id,
        mechanicConnections: {
          schemaVersion: "mechanic_port_connections/v1",
          connections: [],
        },
      },
      currentCheckpointId: "checkpoint_initial_playable",
      failedAttempts: [],
    });
  });
});
