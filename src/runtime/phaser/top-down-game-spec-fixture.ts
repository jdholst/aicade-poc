import {
  GameSpecValidationError,
  validateTopDownGameSpec,
  type GameSpecValidationIssue,
  type TopDownGameSpec,
} from "@/game-spec";

const validTopDownGameSpecFixtureInput = {
  schemaVersion: "game-spec/v1",
  id: "game_crystal_spec_chase",
  title: "Crystal Spec Chase",
  currentIntentSummary: "Collect crystals in a spec-authored arena.",
  template: {
    id: "template_top_down",
    version: "1.0.0",
    config: {
      scenes: [
        {
          id: "scene_arena",
          name: "Crystal Arena",
          objectiveIds: ["objective_collect_crystals"],
          validationGoalIds: ["validation_collectible_reachable"],
          arena: {
            id: "arena_main",
            width: 800,
            height: 600,
          },
          layout: {
            walls: [
              {
                id: "wall_north",
                x: 0,
                y: 0,
                width: 800,
                height: 24,
              },
              {
                id: "wall_south",
                x: 0,
                y: 576,
                width: 800,
                height: 24,
              },
            ],
            obstacles: [
              {
                id: "obstacle_crate",
                shape: "rect",
                x: 380,
                y: 280,
                width: 64,
                height: 48,
              },
              {
                id: "obstacle_boulder",
                shape: "circle",
                x: 560,
                y: 180,
                radius: 28,
              },
              {
                id: "obstacle_boulder2",
                shape: "circle",
                x: 300,
                y: 100,
                radius: 14,
              },
            ],
            spawnZones: [
              {
                id: "spawn_player",
                x: 96,
                y: 256,
                width: 120,
                height: 120,
                entityIds: ["entity_player"],
              },
              {
                id: "spawn_chaser",
                x: 620,
                y: 380,
                width: 96,
                height: 96,
                entityIds: ["entity_chaser"],
              },
              {
                id: "spawn_hazard",
                x: 452,
                y: 72,
                width: 96,
                height: 96,
                entityIds: ["entity_hazard"],
              },
            ],
            pickupZones: [
              {
                id: "pickup_crystals",
                x: 200,
                y: 200,
                width: 400,
                height: 400,
                assetIds: ["asset_crystal"],
              },
            ],
            regions: [
              {
                id: "region_safe_start",
                label: "Safe Start",
                x: 72,
                y: 232,
                width: 160,
                height: 160,
              },
            ],
          },
        },
      ],
    },
  },
  controls: [
    {
      id: "control_move",
      action: "move",
      label: "Move",
      kind: "axis",
      keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"],
    },
  ],
  entities: [
    {
      id: "entity_player",
      role: "player",
      name: "Player",
    },
    {
      id: "entity_crystal",
      role: "pickup",
      name: "Crystal",
    },
    {
      id: "entity_chaser",
      role: "enemy",
      name: "Chaser",
    },
    {
      id: "entity_hazard",
      role: "hazard",
      name: "Hazard",
    },
  ],
  assets: [
    {
      id: "asset_player",
      role: "player",
      name: "Player Placeholder",
      source: "template",
    },
    {
      id: "asset_crystal",
      role: "pickup",
      name: "Crystal Placeholder",
      source: "template",
    },
  ],
  objectives: [
    {
      id: "objective_collect_crystals",
      label: "Collect crystals",
      description: "Collect 5 crystals before the chaser catches you.",
      primary: true,
    },
  ],
  validationGoals: [
    {
      id: "validation_collectible_reachable",
      label: "Collectible reachable",
      description: "At least one collectible can be reached by the player.",
      objectiveId: "objective_collect_crystals",
    },
  ],
  mechanics: [
    {
      id: "mechanic_player_movement",
      type: "player_movement",
      targetIds: ["entity_player"],
      objectiveIds: ["objective_collect_crystals"],
      config: {},
    },
    {
      id: "mechanic_pickup_collection",
      type: "pickup_collection",
      targetIds: ["entity_player"],
      sceneIds: ["scene_arena"],
      assetIds: ["asset_crystal"],
      objectiveIds: ["objective_collect_crystals"],
      config: {
        assetId: "asset_crystal",
      },
    },
    {
      id: "mechanic_chaser_enemy",
      type: "enemy_chase",
      targetIds: ["entity_chaser", "entity_player"],
      objectiveIds: ["objective_collect_crystals"],
      config: {
        speed: 96,
      },
    },
    {
      id: "mechanic_hazard_contact",
      type: "hazard_contact",
      targetIds: ["entity_hazard", "entity_player"],
      objectiveIds: ["objective_collect_crystals"],
      config: {},
    },
  ],
};

const invalidTopDownGameSpecFixtureInput = {
  ...validTopDownGameSpecFixtureInput,
  title: "Invalid Crystal Spec Chase",
  objectives: validTopDownGameSpecFixtureInput.objectives.map((objective) => ({
    ...objective,
    primary: false,
  })),
};

export type TopDownGameSpecFixtureState =
  | {
      gameSpec: TopDownGameSpec;
      status: "valid";
    }
  | {
      issues: GameSpecValidationIssue[];
      message: string;
      status: "invalid";
    };

export function getTopDownGameSpecFixtureState(
  useValidFixture = true
): TopDownGameSpecFixtureState {
  const input = useValidFixture
    ? validTopDownGameSpecFixtureInput
    : invalidTopDownGameSpecFixtureInput;

  try {
    return {
      gameSpec: validateTopDownGameSpec(input),
      status: "valid",
    };
  } catch (error) {
    if (error instanceof GameSpecValidationError) {
      return {
        issues: error.issues,
        message: error.message,
        status: "invalid",
      };
    }

    if (error instanceof Error) {
      return {
        issues: [],
        message: error.message,
        status: "invalid",
      };
    }

    return {
      issues: [],
      message: "Unknown Game Spec validation failure.",
      status: "invalid",
    };
  }
}

export const topDownGameSpecFixture = validateTopDownGameSpec(
  validTopDownGameSpecFixtureInput
);
