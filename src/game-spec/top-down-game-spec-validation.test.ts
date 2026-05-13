import { describe, expect, it } from "vitest";

import { validateTopDownGameSpec } from ".";

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
      targetIds: ["entity_player"],
      sceneIds: ["scene_arena"],
      assetIds: ["asset_crystal"],
      objectiveIds: ["objective_collect_crystal"],
      config: {
        assetId: "asset_crystal",
      },
    },
  ],
};

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

    expect(() =>
      validateTopDownGameSpec({
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
      })
    ).toThrow(
      [
        "validationGoals.validation_collectible_reachable.objectiveId: Unknown objective ID \"objective_missing\".",
        "mechanics.mechanic_player_movement.targetIds: Unknown entity ID \"entity_missing\".",
        "mechanics.mechanic_player_movement.sceneIds: Unknown scene ID \"scene_missing\".",
        "mechanics.mechanic_player_movement.regionIds: Unknown region ID \"region_missing\".",
        "mechanics.mechanic_player_movement.assetIds: Unknown asset ID \"asset_missing\".",
        "mechanics.mechanic_player_movement.objectiveIds: Unknown objective ID \"objective_missing\".",
        "scenes.scene_arena.objectiveIds: Unknown objective ID \"objective_missing\".",
        "scenes.scene_arena.validationGoalIds: Unknown validation goal ID \"validation_missing\".",
        "scenes.scene_arena.layout.spawnZones.spawn_player.entityIds: Unknown entity ID \"entity_missing\".",
        "scenes.scene_arena.layout.pickupZones.pickup_crystals.assetIds: Unknown asset ID \"asset_missing\".",
      ].join(" ")
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
});
