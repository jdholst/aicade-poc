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

  it("repairs non-dispatchable control labels before routing a generated mechanic", async () => {
    const validSpec = structuredClone(getFirstValidTopDownGameSpecFixture());
    validSpec.controls[0].action = "move_action";
    const invalidSpec = structuredClone(validSpec);
    invalidSpec.controls[0].keys = ["WASD", "ARROW KEYS"];
    const intent = {
      ...createGeneratedDashIntent(),
      connections: [{ direction: "input", port: "move_action" }],
    };
    const provider = vi.fn(async (input) => ({
      gameSpec: input.repairContext ? validSpec : invalidSpec,
      mechanicIntent: intent,
    }));

    const result = await generateTopDownCreatorPlan({
      prompt: "Dash whenever the existing movement action is pressed.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      generationRunId: "generation_run_control_binding_repair",
      availableCapabilities: ["object_motion_write"],
      provider,
    });

    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls[1]?.[0]).toMatchObject({
      repairContext: {
        stage: "semantic_validation",
        validationIssues: [
          {
            path: "controls.control_move.keys.0",
          },
          {
            path: "controls.control_move.keys.1",
          },
        ],
      },
    });
    expect(result).toMatchObject({
      ok: true,
      spec: validSpec,
      metadata: {
        attemptCount: 2,
        repairStatus: "repaired",
      },
      routing: {
        kind: "generated_mechanic",
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

  it("retains a valid Game Spec and returns typed intent-transport evidence when only the intent is malformed", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const provider = vi.fn().mockResolvedValue({
      gameSpec: spec,
      mechanicIntent: {
        ...createMovementIntent(),
        generatedSource: "return null",
      },
    });

    const result = await generateTopDownCreatorPlan({
      prompt: "Make a crystal arena and add an optional flourish.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      generationRunId: "generation_run_invalid_intent_transport",
      availableCapabilities: ["object_read", "object_motion_write"],
      provider,
    });

    expect(provider).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      spec,
      routing: {
        kind: "intent_validation_failure",
        generationRunId: "generation_run_invalid_intent_transport",
        evidence: {
          stage: "routing",
          code: "invalid_intent_transport",
          issues: [
            {
              path: "mechanicIntent",
              code: "invalid_intent_transport",
            },
          ],
        },
      },
    });
  });

  it("retains provider-inferred defaults as reversible assumptions and continues generated routing", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const provider = vi.fn().mockResolvedValue({
      gameSpec: spec,
      mechanicIntent: createGeneratedDashIntent(),
    });

    const result = await generateTopDownCreatorPlan({
      prompt:
        "Make the player perform a short, visibly faster dash when movement is pressed.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      generationRunId: "generation_run_inferred_dash",
      availableCapabilities: ["object_motion_write"],
      provider,
    });

    expect(result).toMatchObject({
      ok: true,
      routing: {
        kind: "generated_mechanic",
        admittedRequest: {
          resolution: {
            kind: "generated_mechanic",
            assumptions: [
              {
                ambiguityId: "ambiguity_dash_direction",
                inferredValue: "current_movement_direction",
                rationale:
                  "Following the actor's current movement preserves player intent.",
                reversible: true,
              },
              {
                ambiguityId: "ambiguity_dash_cooldown",
                inferredValue: "250_milliseconds",
                rationale:
                  "A short cooldown keeps repeated dashes responsive but bounded.",
                reversible: true,
              },
            ],
          },
        },
      },
    });
  });

  it("raises an underpowered dash to the retained host perceptibility floor before generated routing", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const providerIntent = {
      ...createGeneratedDashIntent(),
      configuration: [
        { key: "dash_speed", value: 360 },
        { key: "dash_duration_ms", value: 180 },
        { key: "normal_movement_speed", value: 150 },
        { key: "dash_cooldown_ms", value: 600 },
      ],
    };
    const provider = vi.fn().mockResolvedValue({
      gameSpec: spec,
      mechanicIntent: providerIntent,
    });

    const result = await generateTopDownCreatorPlan({
      prompt:
        "Make the player perform a short, visibly faster dash when movement is pressed.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      generationRunId: "generation_run_perceptible_dash",
      availableCapabilities: ["object_motion_write"],
      provider,
    });

    expect(result).toMatchObject({
      ok: true,
      routing: {
        kind: "generated_mechanic",
        intent: {
          configuration: [
            { key: "dash_speed", value: 440 },
            { key: "dash_duration_ms", value: 180 },
            { key: "normal_movement_speed", value: 220 },
            { key: "dash_cooldown_ms", value: 600 },
          ],
          ambiguities: expect.arrayContaining([
            {
              id: "assumption_dash_perceptibility_floor",
              description:
                "The provider-selected dash contrast was below the retained top-down host perceptibility floor.",
              inferredValue:
                "dash_speed_440_normal_movement_speed_220_duration_180_ms",
              rationale:
                "A two-times speed burst with at least 32 pixels of extra travel is the temporary retained-host floor for a visibly faster dash.",
              reversible: true,
            },
          ]),
        },
        admittedRequest: {
          resolution: {
            assumptions: expect.arrayContaining([
              expect.objectContaining({
                ambiguityId: "assumption_dash_perceptibility_floor",
                inferredValue:
                  "dash_speed_440_normal_movement_speed_220_duration_180_ms",
              }),
            ]),
          },
        },
      },
    });
    expect(providerIntent.configuration).toEqual([
      { key: "dash_speed", value: 360 },
      { key: "dash_duration_ms", value: 180 },
      { key: "normal_movement_speed", value: 150 },
      { key: "dash_cooldown_ms", value: 600 },
    ]);
  });

  it("adds retained-host rediscovery authority for a transient owned-object lifecycle", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const providerIntent = createTransientOwnedObjectIntent();
    const provider = vi.fn().mockResolvedValue({
      gameSpec: spec,
      mechanicIntent: providerIntent,
    });

    const result = await generateTopDownCreatorPlan({
      prompt: "Launch a short-lived moving object when the player acts.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      generationRunId: "generation_run_transient_owned_object",
      availableCapabilities: [
        "object_read",
        "object_create",
        "object_motion_write",
        "object_destroy",
        "spatial_query",
      ],
      provider,
    });

    expect(result).toMatchObject({
      ok: true,
      routing: {
        kind: "generated_mechanic",
        intent: {
          requiredCapabilities: [
            "object_create",
            "object_motion_write",
            "object_destroy",
            "object_read",
            "spatial_query",
          ],
          ambiguities: expect.arrayContaining([
            expect.objectContaining({
              id: "assumption_transient_owned_object_rediscovery",
              inferredValue: "spatial_query",
              reversible: true,
            }),
            expect.objectContaining({
              id: "assumption_transient_owned_object_actor_observation",
              inferredValue: "object_read",
              reversible: true,
            }),
          ]),
        },
      },
    });
    expect(providerIntent.requiredCapabilities).not.toContain("spatial_query");
    expect(providerIntent.requiredCapabilities).not.toContain("object_read");
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

function createGeneratedDashIntent() {
  return {
    id: "intent_dash_player",
    summary: "Dash the player in the current movement direction.",
    triggers: ["logical_action"],
    actors: ["player"],
    targets: [],
    behaviors: ["dash_actor"],
    ownedObjects: [],
    stateChanges: [],
    temporalRules: ["cooldown_250_milliseconds"],
    spatialRules: ["follow_current_movement_direction"],
    constraints: ["bounded_dash"],
    configuration: [
      { key: "speed_multiplier", value: 2 },
      { key: "duration_milliseconds", value: 160 },
      { key: "cooldown_milliseconds", value: 250 },
    ],
    connections: [{ direction: "input", port: "move" }],
    references: [{ kind: "entity", id: "entity_player" }],
    outcomes: ["actor_moves_visibly_faster"],
    requiredCapabilities: ["object_motion_write"],
    ambiguities: [
      {
        id: "ambiguity_dash_direction",
        description: "The creator did not specify a dash direction.",
        inferredValue: "current_movement_direction",
        rationale:
          "Following the actor's current movement preserves player intent.",
        reversible: true,
      },
      {
        id: "ambiguity_dash_cooldown",
        description: "The creator did not specify a dash cooldown.",
        inferredValue: "250_milliseconds",
        rationale:
          "A short cooldown keeps repeated dashes responsive but bounded.",
        reversible: true,
      },
    ],
  };
}

function createTransientOwnedObjectIntent() {
  return {
    id: "intent_transient_owned_object",
    summary: "Launch, move, and later clean up a transient owned object.",
    triggers: ["logical_action"],
    actors: ["player"],
    targets: [],
    behaviors: ["launch_transient_owned_object"],
    ownedObjects: ["transient_object"],
    stateChanges: [],
    temporalRules: ["object_exists_across_simulated_time"],
    spatialRules: ["object_moves_before_cleanup"],
    constraints: ["destroy_transient_object_after_lifetime"],
    configuration: [{ key: "lifetime_milliseconds", value: 500 }],
    connections: [{ direction: "input", port: "move" }],
    references: [{ kind: "entity", id: "entity_player" }],
    outcomes: ["owned_object_travels_then_is_destroyed"],
    requiredCapabilities: [
      "object_create",
      "object_motion_write",
      "object_destroy",
    ],
    ambiguities: [],
  };
}
