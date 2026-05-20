import { describe, expect, it } from "vitest";

import { GameSpecValidationError, validateTopDownGameSpec } from ".";

const validTopDownGameSpec = {
  schemaVersion: "game-spec/v1",
  id: "game_validation_fixture",
  title: "Validation Fixture",
  currentIntentSummary: "Collect a crystal in a validated arena.",
  template: {
    id: "template_top_down",
    version: "1.0.0",
    config: {
      scenes: [
        {
          id: "scene_arena",
          name: "Arena",
          objectiveIds: ["objective_collect_crystal"],
          validationGoalIds: ["validation_collectible_reachable"],
          arena: {
            id: "arena_main",
            width: 800,
            height: 600,
          },
          layout: {
            walls: [],
            obstacles: [],
            spawnZones: [
              {
                id: "spawn_player",
                x: 80,
                y: 80,
                width: 120,
                height: 120,
                entityIds: ["entity_player"],
              },
            ],
            pickupZones: [
              {
                id: "pickup_crystals",
                x: 320,
                y: 160,
                width: 240,
                height: 180,
                assetIds: ["asset_crystal"],
              },
            ],
            regions: [],
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
      id: "objective_collect_crystal",
      label: "Collect crystal",
      description: "Collect the crystal.",
      primary: true,
    },
  ],
  validationGoals: [
    {
      id: "validation_collectible_reachable",
      label: "Collectible reachable",
      description: "The collectible can be reached by the player.",
      objectiveId: "objective_collect_crystal",
    },
  ],
  mechanics: [
    {
      id: "mechanic_player_movement",
      type: "player_movement",
      targetIds: ["entity_player"],
      objectiveIds: ["objective_collect_crystal"],
      config: {},
    },
    {
      id: "mechanic_pickup_collection",
      type: "pickup_collection",
      targetIds: ["entity_player", "entity_crystal"],
      sceneIds: ["scene_arena"],
      assetIds: ["asset_crystal"],
      objectiveIds: ["objective_collect_crystal"],
      config: {
        assetId: "asset_crystal",
      },
    },
  ],
};

function getValidationIssues(input: unknown) {
  try {
    validateTopDownGameSpec(input);
  } catch (error) {
    expect(error).toBeInstanceOf(GameSpecValidationError);

    return (error as GameSpecValidationError).issues;
  }

  throw new Error("Expected Game Spec validation to fail.");
}

describe("Top-down Game Spec pre-runtime validation", () => {
  it("accepts a structurally and semantically valid top-down fixture", () => {
    expect(validateTopDownGameSpec(validTopDownGameSpec)).toEqual(
      validTopDownGameSpec
    );
  });

  it("rejects malformed specs before semantic checks run", () => {
    expect(() =>
      validateTopDownGameSpec({
        ...validTopDownGameSpec,
        template: {
          ...validTopDownGameSpec.template,
          id: "template_canvas",
        },
      })
    ).toThrow("Invalid input");
  });

  it("rejects specs without a primary objective", () => {
    expect(() =>
      validateTopDownGameSpec({
        ...validTopDownGameSpec,
        objectives: [
          {
            ...validTopDownGameSpec.objectives[0],
            primary: false,
          },
        ],
      })
    ).toThrow(
      "Game Spec validation failed: objectives: Expected exactly one primary objective."
    );
  });

  it("rejects broken objective, validation goal, entity, and asset references", () => {
    const scene = validTopDownGameSpec.template.config.scenes[0];

    const issues = getValidationIssues({
      ...validTopDownGameSpec,
      validationGoals: [
        {
          ...validTopDownGameSpec.validationGoals[0],
          objectiveId: "objective_missing",
        },
      ],
      mechanics: [
        {
          ...validTopDownGameSpec.mechanics[0],
          targetIds: ["entity_missing"],
          sceneIds: ["scene_missing"],
          regionIds: ["region_missing"],
          assetIds: ["asset_missing"],
          objectiveIds: ["objective_missing"],
        },
      ],
      template: {
        ...validTopDownGameSpec.template,
        config: {
          scenes: [
            {
              ...scene,
              objectiveIds: ["objective_missing"],
              validationGoalIds: ["validation_missing"],
              layout: {
                ...scene.layout,
                spawnZones: [
                  {
                    ...scene.layout.spawnZones[0],
                    entityIds: ["entity_missing"],
                  },
                ],
                pickupZones: [
                  {
                    ...scene.layout.pickupZones[0],
                    assetIds: ["asset_missing"],
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        {
          path: "validationGoals.validation_collectible_reachable.objectiveId",
          message: 'Unknown objective ID "objective_missing".',
        },
        {
          path: "mechanics.mechanic_player_movement.targetIds",
          message: 'Unknown entity ID "entity_missing".',
        },
        {
          path: "mechanics.mechanic_player_movement.sceneIds",
          message: 'Unknown scene ID "scene_missing".',
        },
        {
          path: "mechanics.mechanic_player_movement.regionIds",
          message: 'Unknown region ID "region_missing".',
        },
        {
          path: "mechanics.mechanic_player_movement.assetIds",
          message: 'Unknown asset ID "asset_missing".',
        },
        {
          path: "mechanics.mechanic_player_movement.objectiveIds",
          message: 'Unknown objective ID "objective_missing".',
        },
        {
          path: "scenes.scene_arena.objectiveIds",
          message: 'Unknown objective ID "objective_missing".',
        },
        {
          path: "scenes.scene_arena.validationGoalIds",
          message: 'Unknown validation goal ID "validation_missing".',
        },
        {
          path: "scenes.scene_arena.layout.spawnZones.spawn_player.entityIds",
          message: 'Unknown entity ID "entity_missing".',
        },
        {
          path: "scenes.scene_arena.layout.pickupZones.pickup_crystals.assetIds",
          message: 'Unknown asset ID "asset_missing".',
        },
      ])
    );
  });

  it("rejects unsupported active mechanic types before runtime binding", () => {
    expect(() =>
      validateTopDownGameSpec({
        ...validTopDownGameSpec,
        mechanics: [
          {
            ...validTopDownGameSpec.mechanics[0],
            type: "teleport_player",
          },
        ],
      })
    ).toThrow(
      'mechanics.mechanic_player_movement.type: Unsupported mechanic type "teleport_player".'
    );
  });

  it("rejects mechanics missing required target roles", () => {
    const issues = getValidationIssues({
      ...validTopDownGameSpec,
      mechanics: [
        {
          ...validTopDownGameSpec.mechanics[0],
          targetIds: ["entity_crystal"],
        },
      ],
    });

    expect(issues).toContainEqual({
      path: "mechanics.mechanic_player_movement.targetIds",
      message: 'Expected target role "player".',
    });
  });

  it("rejects mechanics missing required asset roles and objective references", () => {
    const issues = getValidationIssues({
      ...validTopDownGameSpec,
      mechanics: [
        {
          ...validTopDownGameSpec.mechanics[1],
          assetIds: ["asset_player"],
          objectiveIds: [],
        },
      ],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        {
          path: "mechanics.mechanic_pickup_collection.assetIds",
          message: 'Expected asset role "pickup".',
        },
        {
          path: "mechanics.mechanic_pickup_collection.objectiveIds",
          message: "Expected an objective reference.",
        },
      ])
    );
  });

  it("rejects pickup collection when referenced pickup assets are not covered by a pickup zone", () => {
    const scene = validTopDownGameSpec.template.config.scenes[0];
    const issues = getValidationIssues({
      ...validTopDownGameSpec,
      template: {
        ...validTopDownGameSpec.template,
        config: {
          scenes: [
            {
              ...scene,
              layout: {
                ...scene.layout,
                pickupZones: [],
              },
            },
          ],
        },
      },
    });

    expect(issues).toContainEqual({
      path: "mechanics.mechanic_pickup_collection.assetIds",
      message: "Expected a referenced pickup asset to be placed in a pickup zone.",
    });
  });

  it("rejects unused non-player entities, pickup assets, objectives, and validation goals", () => {
    const issues = getValidationIssues({
      ...validTopDownGameSpec,
      entities: [
        ...validTopDownGameSpec.entities,
        {
          id: "entity_unused_enemy",
          role: "enemy",
          name: "Unused Enemy",
        },
      ],
      assets: [
        ...validTopDownGameSpec.assets,
        {
          id: "asset_unused_pickup",
          role: "pickup",
          name: "Unused Pickup",
          source: "template",
        },
      ],
      objectives: [
        ...validTopDownGameSpec.objectives,
        {
          id: "objective_unused_bonus",
          label: "Unused bonus",
          description: "This objective is not wired into the scene or mechanics.",
          primary: false,
        },
      ],
      validationGoals: [
        ...validTopDownGameSpec.validationGoals,
        {
          id: "validation_unused_bonus",
          label: "Unused validation",
          description: "This validation goal is not wired into the scene.",
          objectiveId: "objective_collect_crystal",
        },
      ],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        {
          path: "entities.entity_unused_enemy",
          message: "Entity is not referenced by any spawn zone or active mechanic.",
        },
        {
          path: "assets.asset_unused_pickup",
          message:
            "Pickup asset is not referenced by any pickup zone or active mechanic.",
        },
        {
          path: "objectives.objective_unused_bonus",
          message:
            "Objective is not referenced by any scene, validation goal, or active mechanic.",
        },
        {
          path: "validationGoals.validation_unused_bonus",
          message: "Validation goal is not referenced by any scene.",
        },
      ])
    );
  });
});
