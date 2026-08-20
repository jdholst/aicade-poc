import { describe, expect, it, vi } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { generateTopDownCreatorPlan } from "./creator-generation-planning-service";

describe("generateTopDownCreatorPlan", () => {
  it("routes a provider-produced normal movement plan through the one-call built-in fast path", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const provider = vi.fn().mockResolvedValue({
      gameSpec: spec,
      mechanicIntent: createMovementIntent(),
    });

    const result = await generateTopDownCreatorPlan({
      prompt: "Let arrow keys move the player around the arena.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      generationRunId: "generation_run_planning",
      availableCapabilities: ["object_read", "object_motion_write"],
      provider,
    });

    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Let arrow keys move the player around the arena.",
      })
    );
    expect(result).toMatchObject({
      ok: true,
      spec,
      metadata: {
        taskRoute: "spec_generation.primary",
        attemptCount: 1,
      },
      routing: {
        kind: "built_in",
        generationRunId: "generation_run_planning",
        intentId: "intent_player_movement",
        resolutionKind: "built_in",
      },
    });
  });

  it("uses the repaired successful envelope rather than stale intent from the rejected attempt", async () => {
    const validSpec = getFirstValidTopDownGameSpecFixture();
    const invalidSpec = structuredClone(validSpec);
    invalidSpec.mechanics[0].entityIds = ["entity_missing"];
    const provider = vi.fn(async (input) =>
      input.repairContext
        ? {
            gameSpec: validSpec,
            mechanicIntent: createMovementIntent(),
          }
        : {
            gameSpec: invalidSpec,
            mechanicIntent: createGeneratedIntent(),
          }
    );

    const result = await generateTopDownCreatorPlan({
      prompt: "Make a crystal arena.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      generationRunId: "generation_run_repaired_plan",
      availableCapabilities: ["object_read", "object_motion_write"],
      provider,
    });

    expect(provider).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        attemptCount: 2,
        repairStatus: "repaired",
      },
      routing: {
        kind: "built_in",
        intentId: "intent_player_movement",
      },
    });
  });

  it("returns typed capability-gap evidence without invoking another provider stage", async () => {
    const provider = vi.fn().mockResolvedValue({
      gameSpec: getFirstValidTopDownGameSpecFixture(),
      mechanicIntent: createGeneratedIntent(),
    });

    const result = await generateTopDownCreatorPlan({
      prompt: "Make the player teleport.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      generationRunId: "generation_run_capability_gap",
      availableCapabilities: ["object_read"],
      provider,
    });

    expect(provider).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      routing: {
        kind: "capability_gap",
        intentId: "intent_teleport_player",
        evidence: {
          code: "capability_gap",
          missingCapabilities: ["object_motion_write"],
        },
      },
    });
  });
});

function createMovementIntent() {
  return {
    id: "intent_player_movement",
    summary: "Move the player with logical directional input.",
    triggers: ["logical_move_action"],
    actors: ["player"],
    targets: [],
    behaviors: ["move_actor"],
    ownedObjects: [],
    stateChanges: [],
    temporalRules: [],
    spatialRules: ["remain_inside_arena"],
    constraints: [],
    configuration: [{ key: "speed", value: 180 }],
    connections: [{ direction: "input", port: "move_action" }],
    references: [{ kind: "entity", id: "entity_player" }],
    outcomes: ["actor_position_changes"],
    requiredCapabilities: ["logical_input", "entity_motion"],
    ambiguities: [],
  };
}

function createGeneratedIntent() {
  return {
    id: "intent_teleport_player",
    summary: "Teleport the player to a selected position.",
    triggers: ["logical_teleport_action"],
    actors: ["player"],
    targets: [],
    behaviors: ["teleport_actor"],
    ownedObjects: [],
    stateChanges: [],
    temporalRules: [],
    spatialRules: ["remain_inside_arena"],
    constraints: [],
    configuration: [],
    connections: [],
    references: [{ kind: "entity", id: "entity_player" }],
    outcomes: ["actor_position_changes"],
    requiredCapabilities: ["object_motion_write"],
    ambiguities: [],
  };
}
