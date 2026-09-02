import { describe, expect, it } from "vitest";

import { MECHANIC_CAPABILITY_VERSION, type MechanicIntent } from "@/game-spec";
import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";
import { TOP_DOWN_CREATOR_GENERATION_HOST_CAPABILITY_IDS } from "@/service/creator-generation-planning/creator-generation-planning-policy";

import { createCreatorGenerationRouting } from "./creator-generation-routing";

describe("createCreatorGenerationRouting", () => {
  it("keeps fully covered mechanics on the built-in route", () => {
    const result = createCreatorGenerationRouting({
      availableCapabilities: ["object_read", "object_motion_write"],
      baseGameSpec: getFirstValidTopDownGameSpecFixture(),
      generationRunId: "generation_run_built_in",
      intent: createIntent({
        actors: ["player"],
        behaviors: ["move_actor"],
        configuration: [{ key: "speed", value: 180 }],
        connections: [{ direction: "input", port: "move_action" }],
        references: [{ kind: "entity", id: "entity_player" }],
        outcomes: ["actor_position_changes"],
        spatialRules: ["remain_inside_arena"],
        triggers: ["logical_move_action"],
      }),
    });

    expect(result.kind).toBe("built_in");
    expect(result).toMatchObject({
      generationRunId: "generation_run_built_in",
      intentId: "intent_creator",
    });
  });

  it("maps a partially covered movement-triggered dash to the generated host lifecycle", () => {
    const result = createCreatorGenerationRouting({
      availableCapabilities: ["object_motion_write"],
      baseGameSpec: getFirstValidTopDownGameSpecFixture(),
      generationRunId: "generation_run_dash_extension",
      intent: createIntent({
        actors: ["player"],
        behaviors: ["dash_actor"],
        configuration: [
          { key: "speed_multiplier", value: 2 },
          { key: "duration_milliseconds", value: 160 },
        ],
        connections: [{ direction: "input", port: "move" }],
        outcomes: ["actor_moves_visibly_faster"],
        references: [{ kind: "entity", id: "entity_player" }],
        requiredCapabilities: ["object_motion_write"],
        triggers: ["logical_move_action"],
      }),
    });

    expect(result).toMatchObject({
      kind: "generated_mechanic",
      generationRunId: "generation_run_dash_extension",
      intent: {
        triggers: ["logical_action"],
        connections: [{ direction: "input", port: "move" }],
      },
      admittedRequest: {
        resolution: {
          kind: "generated_mechanic",
          intentId: "intent_creator",
        },
      },
    });
  });

  it("maps one action-specific logical trigger to the generated host lifecycle", () => {
    const baseGameSpec = getFirstValidTopDownGameSpecFixture();
    const gameSpec = {
      ...baseGameSpec,
      controls: [
        ...baseGameSpec.controls,
        {
          id: "control_shoot",
          action: "shoot_action",
          label: "Shoot",
          kind: "button" as const,
          keys: ["ArrowRight"],
        },
      ],
    };
    const result = createCreatorGenerationRouting({
      availableCapabilities: TOP_DOWN_CREATOR_GENERATION_HOST_CAPABILITY_IDS,
      baseGameSpec: gameSpec,
      generationRunId: "generation_run_action_extension",
      intent: createIntent({
        actors: ["player"],
        behaviors: ["launch_transient_object"],
        connections: [{ direction: "input", port: "shoot_action" }],
        ownedObjects: ["transient_object"],
        outcomes: ["transient_object_moves_visibly"],
        references: [{ kind: "entity", id: "entity_player" }],
        requiredCapabilities: [
          "object_create",
          "object_motion_write",
          "spatial_query",
          "object_destroy",
        ],
        triggers: ["logical_shoot_action"],
      }),
    });

    expect(result).toMatchObject({
      kind: "generated_mechanic",
      generationRunId: "generation_run_action_extension",
      intent: {
        triggers: ["logical_action"],
        connections: [{ direction: "input", port: "shoot_action" }],
      },
    });
  });

  it("admits one autonomous install-triggered intent without an action connection", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const result = createCreatorGenerationRouting({
      availableCapabilities: TOP_DOWN_CREATOR_GENERATION_HOST_CAPABILITY_IDS,
      baseGameSpec: gameSpec,
      generationRunId: "generation_run_autonomous_spawner",
      intent: createIntent({
        actors: [gameSpec.entities[0]!.role],
        behaviors: ["spawn_seeded_hazards"],
        connections: [],
        ownedObjects: ["spawned_hazard"],
        outcomes: ["hazards_spawn_over_time"],
        references: [{ kind: "entity", id: gameSpec.entities[0]!.id }],
        requiredCapabilities: [
          "object_read",
          "object_motion_write",
          "object_create",
          "object_destroy",
          "random_next",
          "time_schedule",
        ],
        triggers: ["install"],
      }),
    });

    expect(result).toMatchObject({
      kind: "generated_mechanic",
      generationRunId: "generation_run_autonomous_spawner",
      intent: {
        triggers: ["install"],
        connections: [],
      },
    });
  });

  it("admits an autonomous owned-object lifecycle without invented motion", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const result = createCreatorGenerationRouting({
      availableCapabilities: TOP_DOWN_CREATOR_GENERATION_HOST_CAPABILITY_IDS,
      baseGameSpec: gameSpec,
      generationRunId: "generation_run_stationary_hazard_spawner",
      intent: createIntent({
        actors: [gameSpec.entities[0]!.role],
        behaviors: ["spawn_seeded_stationary_hazards"],
        connections: [],
        ownedObjects: ["spawned_hazard"],
        outcomes: ["hazards_spawn_and_expire_over_time"],
        references: [{ kind: "entity", id: gameSpec.entities[0]!.id }],
        requiredCapabilities: [
          "object_create",
          "object_destroy",
          "random_next",
          "time_schedule",
        ],
        triggers: ["install"],
      }),
    });

    expect(result).toMatchObject({
      kind: "generated_mechanic",
      generationRunId: "generation_run_stationary_hazard_spawner",
      intent: {
        triggers: ["install"],
        connections: [],
        requiredCapabilities: expect.not.arrayContaining([
          "object_motion_write",
        ]),
      },
    });
  });

  it("does not normalize multiple action-specific logical triggers", () => {
    const result = createCreatorGenerationRouting({
      availableCapabilities: ["object_motion_write"],
      baseGameSpec: getFirstValidTopDownGameSpecFixture(),
      generationRunId: "generation_run_ambiguous_actions",
      intent: createIntent({
        actors: ["player"],
        behaviors: ["custom_action_effect"],
        connections: [{ direction: "input", port: "move" }],
        references: [{ kind: "entity", id: "entity_player" }],
        requiredCapabilities: ["object_motion_write"],
        triggers: ["logical_primary_action", "logical_secondary_action"],
      }),
    });

    expect(result).toMatchObject({
      kind: "capability_gap",
      evidence: {
        issues: [
          expect.objectContaining({
            code: "unsupported_generated_host_trigger",
          }),
        ],
      },
    });
  });

  it("admits one uncovered, capability-supported intent for generated work", () => {
    const intent = createIntent({
      actors: ["player"],
      behaviors: ["orbit_around_actor"],
      connections: [{ direction: "input", port: "move" }],
      requiredCapabilities: ["object_read", "object_motion_write"],
      references: [{ kind: "entity", id: "entity_player" }],
    });

    const result = createCreatorGenerationRouting({
      availableCapabilities: ["object_read", "object_motion_write"],
      baseGameSpec: getFirstValidTopDownGameSpecFixture(),
      generationRunId: "generation_run_generated",
      intent,
    });

    expect(result).toMatchObject({
      kind: "generated_mechanic",
      generationRunId: "generation_run_generated",
      intent,
      admittedRequest: {
        resolution: {
          kind: "generated_mechanic",
          intentId: intent.id,
        },
        constraintSet: {
          capabilityVersion: MECHANIC_CAPABILITY_VERSION,
          maximumGeneratedMechanicsPerRun: 1,
        },
      },
    });
  });

  it("routes a generic transient owned-object intent through the production host profile", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const targetEntity = gameSpec.entities.find(({ role }) => role !== "player");
    if (!targetEntity) {
      throw new Error("Expected a non-player target entity.");
    }
    const intent = createIntent({
      actors: ["player"],
      targets: [targetEntity.role],
      behaviors: ["spawn_transient_effect"],
      connections: [{ direction: "input", port: "move" }],
      ownedObjects: ["transient_effect"],
      references: [
        { kind: "entity", id: "entity_player" },
        { kind: "entity", id: targetEntity.id },
      ],
      requiredCapabilities: [
        "object_create",
        "object_motion_write",
        "spatial_query",
        "object_destroy",
      ],
    });

    const result = createCreatorGenerationRouting({
      availableCapabilities: TOP_DOWN_CREATOR_GENERATION_HOST_CAPABILITY_IDS,
      baseGameSpec: gameSpec,
      generationRunId: "generation_run_transient_owned_object",
      intent,
    });

    expect(result).toMatchObject({
      kind: "generated_mechanic",
      generationRunId: "generation_run_transient_owned_object",
      intent,
      admittedRequest: {
        resolution: {
          kind: "generated_mechanic",
          intentId: intent.id,
        },
      },
    });
  });

  it("reports the retained host's missing trusted action connection before generated work", () => {
    const result = createCreatorGenerationRouting({
      availableCapabilities: ["object_motion_write"],
      baseGameSpec: getFirstValidTopDownGameSpecFixture(),
      generationRunId: "generation_run_action_gap",
      intent: createIntent({
        actors: ["player"],
        behaviors: ["action_dash"],
        requiredCapabilities: ["object_motion_write"],
        references: [{ kind: "entity", id: "entity_player" }],
      }),
    });

    expect(result).toMatchObject({
      kind: "capability_gap",
      generationRunId: "generation_run_action_gap",
      intentSummary: "Apply one creator-requested behavior.",
      evidence: {
        missingCapabilities: [],
        issues: [
          expect.objectContaining({
            code: "trusted_action_connection_required",
          }),
        ],
      },
    });
  });

  it("reports an unrepresented actor before generated work", () => {
    const result = createCreatorGenerationRouting({
      availableCapabilities: ["object_motion_write"],
      baseGameSpec: getFirstValidTopDownGameSpecFixture(),
      generationRunId: "generation_run_actor_gap",
      intent: createIntent({
        actors: ["enemy"],
        behaviors: ["action_dash"],
        connections: [{ direction: "input", port: "move" }],
        requiredCapabilities: ["object_motion_write"],
        references: [{ kind: "entity", id: "entity_player" }],
      }),
    });

    expect(result).toMatchObject({
      kind: "capability_gap",
      generationRunId: "generation_run_actor_gap",
      evidence: {
        missingCapabilities: [],
        issues: [
          expect.objectContaining({
            code: "observable_actor_reference_required",
          }),
        ],
      },
    });
  });

  it("allows an independently positioned autonomous owned-object lifecycle without an actor role", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const hazardEntity = gameSpec.entities.find(
      ({ role }) => role === "hazard"
    );
    if (!hazardEntity) {
      throw new Error("Expected a hazard entity.");
    }
    const intent = createIntent({
      triggers: ["install"],
      actors: [],
      behaviors: ["spawn_seeded_hazards"],
      ownedObjects: ["spawned_hazard"],
      temporalRules: ["spawn_on_schedule", "destroy_after_lifetime"],
      spatialRules: ["spawn_at_seeded_arena_position"],
      connections: [],
      references: [{ kind: "entity", id: hazardEntity.id }],
      requiredCapabilities: [
        "object_create",
        "object_destroy",
        "time_schedule",
        "random_next",
      ],
    });

    const result = createCreatorGenerationRouting({
      availableCapabilities: TOP_DOWN_CREATOR_GENERATION_HOST_CAPABILITY_IDS,
      baseGameSpec: gameSpec,
      generationRunId: "generation_run_autonomous_owned_object",
      intent,
    });

    expect(result).toMatchObject({
      kind: "generated_mechanic",
      generationRunId: "generation_run_autonomous_owned_object",
      intent,
    });
  });

  it("reports an unrepresented target before transient-object generation", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const targetEntity = gameSpec.entities.find(({ role }) => role !== "player");
    if (!targetEntity) {
      throw new Error("Expected a non-player target entity.");
    }
    const result = createCreatorGenerationRouting({
      availableCapabilities: TOP_DOWN_CREATOR_GENERATION_HOST_CAPABILITY_IDS,
      baseGameSpec: gameSpec,
      generationRunId: "generation_run_target_gap",
      intent: createIntent({
        actors: ["player"],
        targets: ["visible_target"],
        behaviors: ["launch_transient_object"],
        ownedObjects: ["transient_object"],
        connections: [{ direction: "input", port: "move" }],
        requiredCapabilities: [
          "object_create",
          "object_motion_write",
          "spatial_query",
          "object_destroy",
        ],
        references: [
          { kind: "entity", id: "entity_player" },
          { kind: "entity", id: targetEntity.id },
        ],
      }),
    });

    expect(result).toMatchObject({
      kind: "capability_gap",
      generationRunId: "generation_run_target_gap",
      evidence: {
        missingCapabilities: [],
        issues: [
          expect.objectContaining({
            code: "observable_target_reference_required",
          }),
        ],
      },
    });
  });

  it("fails closed before generation when the host capability profile has a gap", () => {
    const result = createCreatorGenerationRouting({
      availableCapabilities: ["object_read"],
      baseGameSpec: getFirstValidTopDownGameSpecFixture(),
      generationRunId: "generation_run_gap",
      intent: createIntent({
        behaviors: ["spawn_companion"],
        requiredCapabilities: ["object_create"],
      }),
    });

    expect(result).toMatchObject({
      kind: "capability_gap",
      generationRunId: "generation_run_gap",
      evidence: {
        code: "capability_gap",
        missingCapabilities: ["object_create"],
        stage: "routing",
      },
    });
  });

  it("reports the retained host's independent-evidence gap before paid generated stages", () => {
    const result = createCreatorGenerationRouting({
      availableCapabilities: ["state_write", "object_motion_write"],
      baseGameSpec: getFirstValidTopDownGameSpecFixture(),
      generationRunId: "generation_run_evidence_gap",
      intent: createIntent({
        actors: ["player"],
        behaviors: ["toggle_private_state"],
        connections: [{ direction: "input", port: "move" }],
        requiredCapabilities: ["state_write"],
        references: [{ kind: "entity", id: "entity_player" }],
      }),
    });

    expect(result).toMatchObject({
      kind: "capability_gap",
      generationRunId: "generation_run_evidence_gap",
      evidence: {
        code: "capability_gap",
        missingCapabilities: ["object_motion_write"],
        issues: [
          expect.objectContaining({
            code: "independent_visible_effect_unavailable",
          }),
        ],
      },
    });
  });

  it("returns clarification evidence for unresolved intent ambiguity", () => {
    const result = createCreatorGenerationRouting({
      availableCapabilities: ["object_read"],
      baseGameSpec: getFirstValidTopDownGameSpecFixture(),
      generationRunId: "generation_run_clarification",
      intent: createIntent({
        ambiguities: [
          {
            id: "ambiguity_target",
            description: "Which actor should orbit?",
          },
        ],
      }),
    });

    expect(result).toMatchObject({
      kind: "clarification_failure",
      evidence: {
        code: "clarification_required",
        stage: "routing",
      },
    });
  });

  it("rejects planner references that are absent from the exact base spec", () => {
    const result = createCreatorGenerationRouting({
      availableCapabilities: ["object_read"],
      baseGameSpec: getFirstValidTopDownGameSpecFixture(),
      generationRunId: "generation_run_unknown_reference",
      intent: createIntent({
        references: [{ kind: "entity", id: "entity_not_in_spec" }],
      }),
    });

    expect(result).toEqual({
      kind: "clarification_failure",
      generationRunId: "generation_run_unknown_reference",
      intentId: "intent_creator",
      intentSummary: "Apply one creator-requested behavior.",
      evidence: {
        stage: "routing",
        code: "invalid_intent_references",
        issues: [
          {
            path: "intent.references.0.id",
            code: "unknown_reference",
            message:
              'Mechanic Intent reference "entity_not_in_spec" is not present in the exact base Game Spec entity catalog.',
          },
        ],
      },
    });
  });

  it("rejects duplicate planner references before generated work", () => {
    const result = createCreatorGenerationRouting({
      availableCapabilities: ["object_motion_write"],
      baseGameSpec: getFirstValidTopDownGameSpecFixture(),
      generationRunId: "generation_run_duplicate_reference",
      intent: createIntent({
        actors: ["player"],
        connections: [{ direction: "input", port: "move" }],
        references: [
          { kind: "entity", id: "entity_player" },
          { kind: "entity", id: "entity_player" },
        ],
        requiredCapabilities: ["object_motion_write"],
      }),
    });

    expect(result).toEqual({
      kind: "clarification_failure",
      generationRunId: "generation_run_duplicate_reference",
      intentId: "intent_creator",
      intentSummary: "Apply one creator-requested behavior.",
      evidence: {
        stage: "routing",
        code: "invalid_intent_references",
        issues: [
          {
            path: "intent.references.1",
            code: "duplicate_reference",
            message:
              'Mechanic Intent reference "entity:entity_player" is duplicated.',
          },
        ],
      },
    });
  });
});

function createIntent(
  overrides: Partial<MechanicIntent> = {}
): MechanicIntent {
  return {
    id: "intent_creator",
    summary: "Apply one creator-requested behavior.",
    triggers: ["logical_action"],
    actors: [],
    targets: [],
    behaviors: ["custom_behavior"],
    ownedObjects: [],
    stateChanges: [],
    temporalRules: [],
    spatialRules: [],
    constraints: [],
    configuration: [],
    connections: [],
    references: [],
    outcomes: ["custom_outcome"],
    requiredCapabilities: [],
    ambiguities: [],
    ...overrides,
  };
}
