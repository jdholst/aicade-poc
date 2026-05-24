import {
  GameSpecValidationError,
  validateTopDownGameSpec,
  type GameSpecValidationIssue,
  type TopDownGameSpec,
} from "@/game-spec";

import { crystalSpecChaseGameSpecFixtureInput } from "./fixtures/crystal-spec-chase";
import { prismRelayGauntletGameSpecFixtureInput } from "./fixtures/prism-relay-gauntlet";

export const TOP_DOWN_GAME_SPEC_FIXTURE_ENV =
  "NEXT_PUBLIC_AICADE_TOP_DOWN_FIXTURE";
export const DEFAULT_TOP_DOWN_GAME_SPEC_FIXTURE_ID = "crystal_spec_chase";

const topDownGameSpecFixtureInputs = {
  crystal_spec_chase: crystalSpecChaseGameSpecFixtureInput,
  malformed_top_down_template: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_malformed_top_down_template",
    title: "Malformed Top-down Template",
    template: {
      ...crystalSpecChaseGameSpecFixtureInput.template,
      id: "template_canvas",
    },
  },
  missing_primary_objective: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_missing_primary_objective",
    title: "Missing Primary Objective",
    objectives: crystalSpecChaseGameSpecFixtureInput.objectives.map(
      (objective) => ({
        ...objective,
        primary: false,
      })
    ),
  },
  multiple_primary_objectives: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_multiple_primary_objectives",
    title: "Multiple Primary Objectives",
    objectives: [
      ...crystalSpecChaseGameSpecFixtureInput.objectives,
      {
        id: "objective_escape_arena",
        label: "Escape arena",
        description: "Reach the exit after collecting enough crystals.",
        primary: true,
      },
    ],
  },
  missing_player_entity: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_missing_player_entity",
    title: "Missing Player Entity",
    entities: crystalSpecChaseGameSpecFixtureInput.entities.map((entity) =>
      entity.id === "entity_player"
        ? {
            ...entity,
            role: "pickup",
          }
        : entity
    ),
  },
  missing_enemy_target_role: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_missing_enemy_target_role",
    title: "Missing Enemy Target Role",
    mechanics: crystalSpecChaseGameSpecFixtureInput.mechanics.map((mechanic) =>
      mechanic.type === "enemy_chase"
        ? {
            ...mechanic,
            targetIds: ["entity_player"],
          }
        : mechanic
    ),
  },
  missing_hazard_target_role: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_missing_hazard_target_role",
    title: "Missing Hazard Target Role",
    mechanics: crystalSpecChaseGameSpecFixtureInput.mechanics.map((mechanic) =>
      mechanic.type === "hazard_contact"
        ? {
            ...mechanic,
            targetIds: ["entity_player"],
          }
        : mechanic
    ),
  },
  missing_pickup_asset_reference: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_missing_pickup_asset_reference",
    title: "Missing Pickup Asset Reference",
    mechanics: crystalSpecChaseGameSpecFixtureInput.mechanics.map((mechanic) =>
      mechanic.type === "pickup_collection"
        ? {
            ...mechanic,
            assetIds: ["asset_player"],
          }
        : mechanic
    ),
  },
  missing_pickup_zone_coverage: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_missing_pickup_zone_coverage",
    title: "Missing Pickup Zone Coverage",
    template: {
      ...crystalSpecChaseGameSpecFixtureInput.template,
      config: {
        scenes: crystalSpecChaseGameSpecFixtureInput.template.config.scenes.map(
          (scene) => ({
            ...scene,
            layout: {
              ...scene.layout,
              pickupZones: [],
            },
          })
        ),
      },
    },
  },
  unknown_scene_reference: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_unknown_scene_reference",
    title: "Unknown Scene Reference",
    mechanics: crystalSpecChaseGameSpecFixtureInput.mechanics.map((mechanic) =>
      mechanic.type === "pickup_collection"
        ? {
            ...mechanic,
            sceneIds: ["scene_missing"],
          }
        : mechanic
    ),
  },
  missing_mechanic_objective_reference: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_missing_mechanic_objective_reference",
    title: "Missing Mechanic Objective Reference",
    mechanics: crystalSpecChaseGameSpecFixtureInput.mechanics.map((mechanic) =>
      mechanic.type === "pickup_collection"
        ? {
            ...mechanic,
            objectiveIds: [],
          }
        : mechanic
    ),
  },
  unsupported_mechanic_type: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_unsupported_mechanic_type",
    title: "Unsupported Mechanic Type",
    mechanics: crystalSpecChaseGameSpecFixtureInput.mechanics.map((mechanic) =>
      mechanic.type === "player_movement"
        ? {
            ...mechanic,
            type: "teleport_player",
          }
        : mechanic
    ),
  },
  unknown_validation_goal_objective_reference: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_unknown_validation_goal_objective_reference",
    title: "Unknown Validation Goal Objective Reference",
    validationGoals: crystalSpecChaseGameSpecFixtureInput.validationGoals.map(
      (validationGoal) => ({
        ...validationGoal,
        objectiveId: "objective_missing",
      })
    ),
  },
  unknown_mechanic_references: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_unknown_mechanic_references",
    title: "Unknown Mechanic References",
    mechanics: crystalSpecChaseGameSpecFixtureInput.mechanics.map((mechanic) =>
      mechanic.type === "player_movement"
        ? {
            ...mechanic,
            targetIds: ["entity_missing"],
            sceneIds: ["scene_missing"],
            regionIds: ["region_missing"],
            assetIds: ["asset_missing"],
            objectiveIds: ["objective_missing"],
          }
        : mechanic
    ),
  },
  unknown_scene_references: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_unknown_scene_references",
    title: "Unknown Scene References",
    template: {
      ...crystalSpecChaseGameSpecFixtureInput.template,
      config: {
        scenes: crystalSpecChaseGameSpecFixtureInput.template.config.scenes.map(
          (scene) => ({
            ...scene,
            objectiveIds: ["objective_missing"],
            validationGoalIds: ["validation_missing"],
            layout: {
              ...scene.layout,
              spawnZones: scene.layout.spawnZones.map((spawnZone) =>
                spawnZone.id === "spawn_player"
                  ? {
                      ...spawnZone,
                      entityIds: ["entity_missing"],
                    }
                  : spawnZone
              ),
              pickupZones: scene.layout.pickupZones.map((pickupZone) =>
                pickupZone.id === "pickup_crystals"
                  ? {
                      ...pickupZone,
                      assetIds: ["asset_missing"],
                    }
                  : pickupZone
              ),
            },
          })
        ),
      },
    },
  },
  unused_modules: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_unused_modules",
    title: "Unused Modules",
    entities: [
      ...crystalSpecChaseGameSpecFixtureInput.entities,
      {
        id: "entity_unused_enemy",
        role: "enemy",
        name: "Unused Enemy",
      },
    ],
    assets: [
      ...crystalSpecChaseGameSpecFixtureInput.assets,
      {
        id: "asset_unused_pickup",
        role: "pickup",
        name: "Unused Pickup",
        source: "template",
      },
    ],
    objectives: [
      ...crystalSpecChaseGameSpecFixtureInput.objectives,
      {
        id: "objective_unused_bonus",
        label: "Unused bonus",
        description: "This objective is not wired into the scene or mechanics.",
        primary: false,
      },
    ],
    validationGoals: [
      ...crystalSpecChaseGameSpecFixtureInput.validationGoals,
      {
        id: "validation_unused_bonus",
        label: "Unused validation",
        description: "This validation goal is not wired into the scene.",
        objectiveId: "objective_collect_crystals",
      },
    ],
  },
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
  return createTopDownGameSpecFixtureState(
    topDownGameSpecFixtureInputs[fixtureId]
  );
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

export function getDefaultTopDownGameSpecFixture(): TopDownGameSpec {
  return getTopDownGameSpecFixture(DEFAULT_TOP_DOWN_GAME_SPEC_FIXTURE_ID);
}

export function getFirstValidTopDownGameSpecFixture(): TopDownGameSpec {
  const fixtureIds = Object.keys(
    topDownGameSpecFixtureInputs
  ) as TopDownGameSpecFixtureId[];

  for (const fixtureId of fixtureIds) {
    const fixtureState = getTopDownGameSpecFixtureState(fixtureId);

    if (fixtureState.status === "valid") {
      return fixtureState.fixture;
    }
  }

  throw new GameSpecValidationError(
    fixtureIds.flatMap((fixtureId) => {
      const fixtureState = getTopDownGameSpecFixtureState(fixtureId);

      return fixtureState.status === "invalid" ? fixtureState.issues : [];
    })
  );
}
