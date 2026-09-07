import { TOP_DOWN_PHASER_MECHANIC_SCOPE } from "./mechanic-registry";
import {
  resolveMechanicIntent,
  type BuiltInMechanicContract,
  type MechanicIntent,
} from "./mechanic-resolver";

export const topDownBuiltInMechanicContracts = [
  {
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
  },
  {
    mechanicType: "enemy_chase",
    scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
    coverage: {
      triggers: ["fixed_step", "actor_overlaps_target"],
      actors: ["enemy"],
      targets: ["player"],
      behaviors: ["pursue_target", "reset_round_on_contact"],
      ownedObjects: [],
      stateChanges: ["reset_objective", "reset_actor_positions"],
      temporalRules: ["continuous_while_active"],
      spatialRules: ["avoid_static_obstacles", "remain_inside_arena"],
      constraints: [],
      configuration: [
        {
          key: "speed",
          valueType: "number",
          minimum: 1,
          maximum: 500,
        },
      ],
      connections: [],
      references: ["entity", "objective"],
      outcomes: [
        "actor_distance_to_target_decreases",
        "round_resets_on_contact",
      ],
    },
    compatibleWith: [
      "player_movement",
      "pickup_collection",
      "hazard_contact",
    ],
  },
  {
    mechanicType: "pickup_collection",
    scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
    coverage: {
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
      references: ["entity", "objective"],
      outcomes: ["objective_progress_increases", "target_repositions"],
    },
    compatibleWith: [
      "player_movement",
      "enemy_chase",
      "hazard_contact",
    ],
  },
  {
    mechanicType: "hazard_contact",
    scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
    coverage: {
      triggers: ["actor_overlaps_target"],
      actors: ["hazard"],
      targets: ["player"],
      behaviors: ["reset_round_on_contact"],
      ownedObjects: [],
      stateChanges: ["reset_objective", "reset_actor_position"],
      temporalRules: [],
      spatialRules: [],
      constraints: [],
      configuration: [],
      connections: [],
      references: ["entity", "objective"],
      outcomes: ["round_resets_on_contact"],
    },
    compatibleWith: [
      "player_movement",
      "enemy_chase",
      "pickup_collection",
    ],
  },
] as const satisfies readonly BuiltInMechanicContract[];

export type ResolveTopDownMechanicIntentInput = {
  intent: MechanicIntent;
  availableCapabilities: readonly string[];
};

export function resolveTopDownMechanicIntent({
  intent,
  availableCapabilities,
}: ResolveTopDownMechanicIntentInput) {
  return resolveMechanicIntent({
    intent,
    builtInContracts: topDownBuiltInMechanicContracts,
    availableCapabilities,
    clarificationStrategy: "infer_or_fail",
  });
}
