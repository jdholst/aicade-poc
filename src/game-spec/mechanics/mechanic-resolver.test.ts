import { describe, expect, it } from "vitest";

import {
  resolveMechanicIntent,
  resolveTopDownMechanicIntent,
  TOP_DOWN_PHASER_MECHANIC_SCOPE,
  topDownBuiltInMechanicContracts,
  topDownMechanicRegistry,
  type BuiltInMechanicContract,
  type MechanicIntent,
} from "..";

const movementIntent: MechanicIntent = {
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
  configuration: [
    {
      key: "speed",
      value: 180,
    },
  ],
  connections: [
    {
      direction: "input",
      port: "move_action",
    },
  ],
  references: [
    {
      kind: "entity",
      id: "entity_player",
    },
  ],
  outcomes: ["actor_position_changes"],
  requiredCapabilities: ["logical_input", "entity_motion"],
  ambiguities: [],
};

const contentFreeIntent: MechanicIntent = {
  id: "intent_empty",
  summary: "",
  triggers: [],
  actors: [],
  targets: [],
  behaviors: [],
  ownedObjects: [],
  stateChanges: [],
  temporalRules: [],
  spatialRules: [],
  constraints: [],
  configuration: [],
  connections: [],
  references: [],
  outcomes: [],
  requiredCapabilities: [],
  ambiguities: [],
};

const movementContract: BuiltInMechanicContract = {
  mechanicType: "player_movement",
  scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
  coverage: {
    triggers: ["logical_move_action"],
    actors: ["player"],
    targets: [],
    behaviors: ["move_actor"],
    ownedObjects: [],
    stateChanges: [],
    temporalRules: [],
    spatialRules: ["remain_inside_arena"],
    constraints: [],
    configuration: [
      {
        key: "speed",
        valueType: "number",
        minimum: 1,
        maximum: 500,
      },
    ],
    connections: [
      {
        direction: "input",
        port: "move_action",
      },
    ],
    references: ["entity"],
    outcomes: ["actor_position_changes"],
  },
  compatibleWith: ["pickup_collection"],
};

const pickupContract: BuiltInMechanicContract = {
  mechanicType: "pickup_collection",
  scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
  coverage: {
    triggers: ["actor_overlaps_target"],
    actors: ["player"],
    targets: ["pickup"],
    behaviors: ["consume_target"],
    ownedObjects: [],
    stateChanges: ["increment_score"],
    temporalRules: [],
    spatialRules: [],
    constraints: [],
    configuration: [
      {
        key: "required_count",
        valueType: "number",
        minimum: 1,
        maximum: 100,
      },
    ],
    connections: [
      {
        direction: "output",
        port: "objective_progress",
      },
    ],
    references: ["asset", "entity", "objective"],
    outcomes: ["score_increases", "target_removed"],
  },
  compatibleWith: ["player_movement"],
};

describe("resolveMechanicIntent", () => {
  it("accepts a single built-in only when its contract covers the complete intent", () => {
    expect(
      resolveMechanicIntent({
        intent: movementIntent,
        builtInContracts: [movementContract],
        availableCapabilities: ["logical_input", "entity_motion"],
        clarificationStrategy: "infer_or_fail",
      })
    ).toMatchObject({
      kind: "built_in",
      intentId: "intent_player_movement",
      mechanicType: "player_movement",
      assumptions: [],
      coverage: {
        coveredRequirements: expect.arrayContaining([
          {
            category: "reference",
            value: "entity:entity_player",
            coveredBy: ["player_movement"],
          },
        ]),
        uncoveredRequirements: [],
      },
    });
  });

  it("preserves uncovered requirements instead of accepting partial built-in coverage", () => {
    const spawningIntent: MechanicIntent = {
      ...movementIntent,
      id: "intent_move_and_spawn",
      summary: "Move the player and spawn an enemy every five seconds.",
      behaviors: ["move_actor", "spawn_owned_object"],
      ownedObjects: ["enemy"],
      temporalRules: ["repeat_every_interval"],
      outcomes: ["actor_position_changes", "owned_object_created"],
      requiredCapabilities: [
        "logical_input",
        "entity_motion",
        "dynamic_object_creation",
        "deterministic_time",
      ],
    };

    expect(
      resolveMechanicIntent({
        intent: spawningIntent,
        builtInContracts: [movementContract],
        availableCapabilities: spawningIntent.requiredCapabilities,
        clarificationStrategy: "infer_or_fail",
      })
    ).toMatchObject({
      kind: "generated_mechanic",
      intentId: "intent_move_and_spawn",
      candidateBuiltInTypes: ["player_movement"],
      assumptions: [],
      coverage: {
        uncoveredRequirements: [
          {
            category: "behavior",
            value: "spawn_owned_object",
            coveredBy: [],
          },
          {
            category: "owned_object",
            value: "enemy",
            coveredBy: [],
          },
          {
            category: "temporal_rule",
            value: "repeat_every_interval",
            coveredBy: [],
          },
          {
            category: "outcome",
            value: "owned_object_created",
            coveredBy: [],
          },
        ],
      },
    });
  });

  it.each([
    {
      label: "numeric",
      value: "180",
      configuration: movementContract.coverage.configuration,
    },
    {
      label: "boolean",
      value: "true",
      configuration: [
        {
          key: "speed",
          valueType: "boolean" as const,
        },
      ],
    },
  ])(
    "does not coerce a string intent value into a $label contract value",
    ({ value, configuration }) => {
      expect(
        resolveMechanicIntent({
          intent: {
            ...movementIntent,
            configuration: [
              {
                key: "speed",
                value,
              },
            ],
          },
          builtInContracts: [
            {
              ...movementContract,
              coverage: {
                ...movementContract.coverage,
                configuration,
              },
            },
          ],
          availableCapabilities: ["logical_input", "entity_motion"],
          clarificationStrategy: "infer_or_fail",
        })
      ).toMatchObject({
        kind: "generated_mechanic",
        coverage: {
          uncoveredRequirements: [
            {
              category: "configuration",
              value: `speed=${value}`,
              coveredBy: [],
            },
          ],
        },
      });
    }
  );

  it("returns a capability gap when uncovered behavior needs an unavailable primitive", () => {
    const navigationIntent: MechanicIntent = {
      ...movementIntent,
      id: "intent_obstacle_aware_navigation",
      summary: "Navigate an actor to a target around obstacles.",
      targets: ["destination"],
      behaviors: ["navigate_to_target"],
      spatialRules: ["avoid_obstacles"],
      outcomes: ["actor_reaches_destination"],
      requiredCapabilities: ["entity_motion", "navmesh_pathfinding"],
    };

    expect(
      resolveMechanicIntent({
        intent: navigationIntent,
        builtInContracts: [movementContract],
        availableCapabilities: ["entity_motion"],
        clarificationStrategy: "infer_or_fail",
      })
    ).toMatchObject({
      kind: "capability_gap",
      intentId: "intent_obstacle_aware_navigation",
      missingCapabilities: ["navmesh_pathfinding"],
      coverage: {
        uncoveredRequirements: expect.arrayContaining([
          {
            category: "behavior",
            value: "navigate_to_target",
            coveredBy: [],
          },
        ]),
      },
    });
  });

  it("fails clarification when an ambiguity has no safe bounded inference", () => {
    const ambiguousIntent: MechanicIntent = {
      ...movementIntent,
      id: "intent_move_ambiguous_actor",
      summary: "Make it move when I press the arrows.",
      ambiguities: [
        {
          id: "ambiguity_actor_reference",
          description: 'The phrase "it" does not identify an actor.',
        },
      ],
    };

    expect(
      resolveMechanicIntent({
        intent: ambiguousIntent,
        builtInContracts: [movementContract],
        availableCapabilities: ["logical_input", "entity_motion"],
        clarificationStrategy: "infer_or_fail",
      })
    ).toEqual({
      kind: "clarification_failure",
      intentId: "intent_move_ambiguous_actor",
      strategy: "infer_or_fail",
      unresolvedAmbiguities: ambiguousIntent.ambiguities,
    });
  });

  it("records bounded reversible assumptions before continuing resolution", () => {
    const inferredIntent: MechanicIntent = {
      ...movementIntent,
      id: "intent_move_inferred_actor",
      ambiguities: [
        {
          id: "ambiguity_actor_reference",
          description: 'The phrase "my character" could name several actors.',
          inferredValue: "player",
          rationale: "The Game Spec has exactly one player-role entity.",
          reversible: true,
        },
      ],
    };

    expect(
      resolveMechanicIntent({
        intent: inferredIntent,
        builtInContracts: [movementContract],
        availableCapabilities: ["logical_input", "entity_motion"],
        clarificationStrategy: "infer_or_fail",
      })
    ).toMatchObject({
      kind: "built_in",
      assumptions: [
        {
          ambiguityId: "ambiguity_actor_reference",
          description: 'The phrase "my character" could name several actors.',
          inferredValue: "player",
          rationale: "The Game Spec has exactly one player-role entity.",
          reversible: true,
        },
      ],
    });
  });

  it("accepts a compatible built-in composition only when its contracts cover the complete intent", () => {
    const moveAndCollectIntent: MechanicIntent = {
      ...movementIntent,
      id: "intent_move_and_collect",
      summary: "Move the player, collect a pickup, and advance the objective.",
      triggers: ["logical_move_action", "actor_overlaps_target"],
      targets: ["pickup"],
      behaviors: ["move_actor", "consume_target"],
      stateChanges: ["increment_score"],
      configuration: [
        ...movementIntent.configuration,
        {
          key: "required_count",
          value: 5,
        },
      ],
      connections: [
        ...movementIntent.connections,
        {
          direction: "output",
          port: "objective_progress",
        },
      ],
      references: [
        {
          kind: "asset",
          id: "asset_pickup",
        },
        {
          kind: "entity",
          id: "entity_player",
        },
        {
          kind: "objective",
          id: "objective_primary",
        },
      ],
      outcomes: [
        "actor_position_changes",
        "score_increases",
        "target_removed",
      ],
      requiredCapabilities: [
        "logical_input",
        "entity_motion",
        "collision_observation",
        "game_system_signal",
      ],
    };

    expect(
      resolveMechanicIntent({
        intent: moveAndCollectIntent,
        builtInContracts: [movementContract, pickupContract],
        availableCapabilities: moveAndCollectIntent.requiredCapabilities,
        clarificationStrategy: "infer_or_fail",
      })
    ).toMatchObject({
      kind: "built_in_composition",
      intentId: "intent_move_and_collect",
      mechanicTypes: ["player_movement", "pickup_collection"],
      assumptions: [],
      coverage: {
        uncoveredRequirements: [],
      },
    });
  });

  it("does not combine incompatible contracts or hide the requirements they leave uncovered", () => {
    const moveAndCollectIntent: MechanicIntent = {
      ...movementIntent,
      id: "intent_incompatible_move_and_collect",
      triggers: ["logical_move_action", "actor_overlaps_target"],
      targets: ["pickup"],
      behaviors: ["move_actor", "consume_target"],
      stateChanges: ["increment_score"],
      configuration: [
        ...movementIntent.configuration,
        {
          key: "required_count",
          value: 5,
        },
      ],
      connections: [
        ...movementIntent.connections,
        {
          direction: "output",
          port: "objective_progress",
        },
      ],
      references: [
        {
          kind: "asset",
          id: "asset_pickup",
        },
        {
          kind: "entity",
          id: "entity_player",
        },
        {
          kind: "objective",
          id: "objective_primary",
        },
      ],
      outcomes: [
        "actor_position_changes",
        "score_increases",
        "target_removed",
      ],
      requiredCapabilities: ["entity_motion", "collision_observation"],
    };

    expect(
      resolveMechanicIntent({
        intent: moveAndCollectIntent,
        builtInContracts: [
          {
            ...movementContract,
            compatibleWith: [],
          },
          {
            ...pickupContract,
            compatibleWith: [],
          },
        ],
        availableCapabilities: moveAndCollectIntent.requiredCapabilities,
        clarificationStrategy: "infer_or_fail",
      })
    ).toMatchObject({
      kind: "generated_mechanic",
      coverage: {
        uncoveredRequirements: expect.arrayContaining([
          {
            category: "behavior",
            value: "move_actor",
            coveredBy: [],
          },
        ]),
      },
    });
  });

  it("declares auditable intent coverage for every trusted top-down built-in", () => {
    expect(
      topDownBuiltInMechanicContracts.map((contract) => contract.mechanicType)
    ).toEqual(topDownMechanicRegistry.map((mechanic) => mechanic.type));

    expect(
      topDownBuiltInMechanicContracts.find(
        (contract) => contract.mechanicType === "player_movement"
      )
    ).toEqual({
      mechanicType: "player_movement",
      scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
      coverage: {
        triggers: ["logical_move_action"],
        actors: ["player"],
        targets: [],
        behaviors: ["move_actor"],
        ownedObjects: [],
        stateChanges: [],
        temporalRules: [],
        spatialRules: ["remain_inside_arena"],
        constraints: [],
        configuration: [
          {
            key: "speed",
            valueType: "number",
            minimum: 1,
            maximum: 500,
          },
        ],
        connections: [
          {
            direction: "input",
            port: "move_action",
          },
        ],
        references: ["entity"],
        outcomes: ["actor_position_changes"],
      },
      compatibleWith: [
        "enemy_chase",
        "pickup_collection",
        "hazard_contact",
      ],
    });
  });

  it("resolves an existing supported top-down intent through the trusted contracts", () => {
    expect(
      resolveTopDownMechanicIntent({
        intent: movementIntent,
        availableCapabilities: ["logical_input", "entity_motion"],
      })
    ).toMatchObject({
      kind: "built_in",
      mechanicType: "player_movement",
      coverage: {
        uncoveredRequirements: [],
      },
    });
  });

  it("resolves supported pickup intent without claiming ignored asset or region bindings", () => {
    expect(
      resolveTopDownMechanicIntent({
        intent: {
          id: "intent_pickup_collection",
          summary: "Collect and reposition a pickup to advance the objective.",
          triggers: ["actor_overlaps_target"],
          actors: ["player"],
          targets: ["pickup"],
          behaviors: ["collect_target", "reposition_target"],
          ownedObjects: [],
          stateChanges: ["increment_objective_progress"],
          temporalRules: [],
          spatialRules: ["reposition_inside_pickup_zone"],
          constraints: [],
          configuration: [],
          connections: [
            {
              direction: "output",
              port: "objective_progress",
            },
          ],
          references: [
            {
              kind: "entity",
              id: "entity_player",
            },
            {
              kind: "objective",
              id: "objective_primary",
            },
          ],
          outcomes: [
            "objective_progress_increases",
            "target_repositions",
          ],
          requiredCapabilities: [
            "collision_observation",
            "entity_motion",
            "game_system_signal",
          ],
          ambiguities: [],
        },
        availableCapabilities: [],
      })
    ).toMatchObject({
      kind: "built_in",
      mechanicType: "pickup_collection",
      coverage: {
        coveredRequirements: expect.arrayContaining([
          {
            category: "reference",
            value: "objective:objective_primary",
            coveredBy: ["pickup_collection"],
          },
        ]),
        uncoveredRequirements: [],
      },
    });
  });

  it("fails clarification instead of selecting a built-in for content-free intent", () => {
    expect(
      resolveTopDownMechanicIntent({
        intent: contentFreeIntent,
        availableCapabilities: [],
      })
    ).toEqual({
      kind: "clarification_failure",
      intentId: "intent_empty",
      strategy: "infer_or_fail",
      unresolvedAmbiguities: [
        {
          id: "ambiguity_missing_requirements",
          description:
            "The mechanic intent does not contain any behavior requirements to resolve.",
        },
      ],
    });
  });

  it.each([
    {
      label: "reference-only",
      intent: {
        ...contentFreeIntent,
        id: "intent_reference_only",
        references: [
          {
            kind: "entity" as const,
            id: "entity_player",
          },
        ],
      },
    },
    {
      label: "configuration-only",
      intent: {
        ...contentFreeIntent,
        id: "intent_configuration_only",
        configuration: [
          {
            key: "speed",
            value: 180,
          },
        ],
      },
    },
  ])("fails clarification for $label intent fragments", ({ intent }) => {
    expect(
      resolveTopDownMechanicIntent({
        intent,
        availableCapabilities: [],
      })
    ).toMatchObject({
      kind: "clarification_failure",
      intentId: intent.id,
      strategy: "infer_or_fail",
      unresolvedAmbiguities: [
        {
          id: "ambiguity_missing_requirements",
        },
      ],
    });
  });
});
