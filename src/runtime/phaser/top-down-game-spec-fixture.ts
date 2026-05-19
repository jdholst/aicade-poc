import {
  GameSpecValidationError,
  validateTopDownGameSpec,
  type GameSpecValidationIssue,
  type TopDownGameSpec,
} from "@/game-spec";

export const TOP_DOWN_GAME_SPEC_FIXTURE_ENV =
  "NEXT_PUBLIC_AICADE_TOP_DOWN_FIXTURE";
export const DEFAULT_TOP_DOWN_GAME_SPEC_FIXTURE_ID = "crystal_spec_chase";

const crystalSpecChaseGameSpecFixtureInput = {
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
      targetIds: ["entity_player", "entity_crystal"],
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

const prismRelayGauntletGameSpecFixtureInput = {
  schemaVersion: "game-spec/v1",
  id: "game_prism_relay_gauntlet",
  title: "Prism Relay Gauntlet",
  currentIntentSummary:
    "Collect relay prisms in a hazard-lined gauntlet without enemy chase pressure.",
  template: {
    id: "template_top_down",
    version: "1.0.0",
    config: {
      scenes: [
        {
          id: "scene_relay_gauntlet",
          name: "Relay Gauntlet",
          objectiveIds: ["objective_collect_relay_prisms"],
          validationGoalIds: ["validation_prism_route_reachable"],
          arena: {
            id: "arena_relay_gauntlet",
            width: 900,
            height: 600,
          },
          layout: {
            walls: [
              {
                id: "wall_north",
                x: 0,
                y: 0,
                width: 900,
                height: 24,
              },
              {
                id: "wall_south",
                x: 0,
                y: 576,
                width: 900,
                height: 24,
              },
              {
                id: "wall_west",
                x: 0,
                y: 0,
                width: 24,
                height: 600,
              },
              {
                id: "wall_east",
                x: 876,
                y: 0,
                width: 24,
                height: 600,
              },
            ],
            obstacles: [
              {
                id: "obstacle_upper_relay_wall",
                shape: "rect",
                x: 240,
                y: 96,
                width: 360,
                height: 36,
              },
              {
                id: "obstacle_lower_relay_wall",
                shape: "rect",
                x: 240,
                y: 468,
                width: 360,
                height: 36,
              },
              {
                id: "obstacle_left_gate",
                shape: "rect",
                x: 276,
                y: 240,
                width: 76,
                height: 120,
              },
              {
                id: "obstacle_right_gate",
                shape: "rect",
                x: 548,
                y: 240,
                width: 76,
                height: 120,
              },
              {
                id: "obstacle_prism_pillar",
                shape: "circle",
                x: 725,
                y: 420,
                radius: 30,
              },
            ],
            spawnZones: [
              {
                id: "spawn_player",
                x: 72,
                y: 240,
                width: 96,
                height: 120,
                entityIds: ["entity_player"],
              },
              {
                id: "spawn_reset_gate",
                x: 402,
                y: 248,
                width: 96,
                height: 104,
                entityIds: ["entity_reset_gate"],
              },
            ],
            pickupZones: [
              {
                id: "pickup_relay_prisms",
                x: 650,
                y: 180,
                width: 180,
                height: 240,
                assetIds: ["asset_relay_prism"],
              },
            ],
            regions: [
              {
                id: "region_launch_pad",
                label: "Launch Pad",
                x: 48,
                y: 216,
                width: 144,
                height: 168,
              },
              {
                id: "region_prism_lane",
                label: "Prism Lane",
                x: 626,
                y: 156,
                width: 228,
                height: 288,
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
      name: "Runner",
    },
    {
      id: "entity_relay_prism",
      role: "pickup",
      name: "Relay Prism",
    },
    {
      id: "entity_reset_gate",
      role: "hazard",
      name: "Reset Gate",
    },
  ],
  assets: [
    {
      id: "asset_player",
      role: "player",
      name: "Runner Placeholder",
      source: "template",
    },
    {
      id: "asset_relay_prism",
      role: "pickup",
      name: "Relay Prism Placeholder",
      source: "template",
    },
  ],
  objectives: [
    {
      id: "objective_collect_relay_prisms",
      label: "Relay prisms",
      description: "Collect relay prisms while avoiding the reset gate.",
      primary: true,
    },
  ],
  validationGoals: [
    {
      id: "validation_prism_route_reachable",
      label: "Prism route reachable",
      description: "The relay prism route stays reachable around the reset gate.",
      objectiveId: "objective_collect_relay_prisms",
    },
  ],
  mechanics: [
    {
      id: "mechanic_relay_movement",
      type: "player_movement",
      targetIds: ["entity_player"],
      objectiveIds: ["objective_collect_relay_prisms"],
      config: {
        speed: 280,
      },
    },
    {
      id: "mechanic_relay_pickup_collection",
      type: "pickup_collection",
      targetIds: ["entity_player", "entity_relay_prism"],
      sceneIds: ["scene_relay_gauntlet"],
      assetIds: ["asset_relay_prism"],
      objectiveIds: ["objective_collect_relay_prisms"],
      config: {
        assetId: "asset_relay_prism",
      },
    },
    {
      id: "mechanic_reset_gate_contact",
      type: "hazard_contact",
      targetIds: ["entity_reset_gate", "entity_player"],
      objectiveIds: ["objective_collect_relay_prisms"],
      config: {},
    },
  ],
};

const topDownGameSpecFixtureInputs = {
  crystal_spec_chase: crystalSpecChaseGameSpecFixtureInput,
  prism_relay_gauntlet: prismRelayGauntletGameSpecFixtureInput,
} as const;

export type TopDownGameSpecFixtureId = keyof typeof topDownGameSpecFixtureInputs;

export type TopDownGameSpecFixtureState =
  | {
      fixture: TopDownGameSpec;
      status: "valid";
    }
  | {
      issues: GameSpecValidationIssue[];
      message: string;
      status: "invalid";
    };

const topDownGameSpecFixtureStateById = new Map<
  TopDownGameSpecFixtureId,
  TopDownGameSpecFixtureState
>();

function createInvalidFixtureState(error: unknown): TopDownGameSpecFixtureState {
  if (error instanceof GameSpecValidationError) {
    return {
      status: "invalid",
      issues: error.issues,
      message: error.message.replace(/^Game Spec validation failed: /, ""),
    };
  }

  return {
    status: "invalid",
    issues: [],
    message:
      error instanceof Error
        ? error.message
        : "Game Spec validation failed for the selected fixture.",
  };
}

export function createTopDownGameSpecFixtureState(
  fixtureInput: unknown
): TopDownGameSpecFixtureState {
  try {
    return {
      status: "valid",
      fixture: validateTopDownGameSpec(fixtureInput),
    };
  } catch (error) {
    return createInvalidFixtureState(error);
  }
}

function createTopDownGameSpecFixtureStateForId(
  fixtureId: TopDownGameSpecFixtureId
): TopDownGameSpecFixtureState {
  return createTopDownGameSpecFixtureState(topDownGameSpecFixtureInputs[fixtureId]);
}

export function getTopDownGameSpecFixture(
  fixtureId = process.env[TOP_DOWN_GAME_SPEC_FIXTURE_ENV]
): TopDownGameSpec {
  const fixtureState = getTopDownGameSpecFixtureState(fixtureId);

  if (fixtureState.status === "valid") {
    return fixtureState.fixture;
  }

  throw new GameSpecValidationError(fixtureState.issues);
}

export function getTopDownGameSpecFixtureState(
  fixtureId = process.env[TOP_DOWN_GAME_SPEC_FIXTURE_ENV]
): TopDownGameSpecFixtureState {
  const resolvedFixtureId = resolveTopDownGameSpecFixtureId(fixtureId);
  const cachedState = topDownGameSpecFixtureStateById.get(resolvedFixtureId);

  if (cachedState) {
    return cachedState;
  }

  const fixtureState = createTopDownGameSpecFixtureStateForId(resolvedFixtureId);
  topDownGameSpecFixtureStateById.set(resolvedFixtureId, fixtureState);

  return fixtureState;
}

function resolveTopDownGameSpecFixtureId(
  fixtureId: string | undefined
): TopDownGameSpecFixtureId {
  if (fixtureId && fixtureId in topDownGameSpecFixtureInputs) {
    return fixtureId as TopDownGameSpecFixtureId;
  }

  return DEFAULT_TOP_DOWN_GAME_SPEC_FIXTURE_ID;
}

export const topDownGameSpecFixture =
  topDownGameSpecFixtureInputs[
    DEFAULT_TOP_DOWN_GAME_SPEC_FIXTURE_ID
  ] as TopDownGameSpec;
