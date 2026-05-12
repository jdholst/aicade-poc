import { describe, expect, it } from "vitest";

import { parseTopDownGameSpec, parseTopDownSpec } from ".";

const topDownGameSpecFixture = {
  schemaVersion: "game-spec/v1",
  id: "game_crystal_chase",
  title: "Crystal Chase",
  currentIntentSummary: "Collect crystals while avoiding the chaser.",
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
            width: 960,
            height: 540,
          },
          layout: {
            walls: [
              {
                id: "wall_north",
                x: 0,
                y: 0,
                width: 960,
                height: 24,
              },
            ],
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
                y: 120,
                width: 360,
                height: 240,
                assetIds: ["asset_crystal"],
              },
            ],
            regions: [
              {
                id: "region_safe_start",
                label: "Safe Start",
                x: 48,
                y: 48,
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
      description: "Collect 5 crystals before the timer expires.",
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
  ],
};

describe("Top-down Game Spec schema", () => {
  it("parses a valid top-down Game Spec with one arena scene", () => {
    expect(parseTopDownGameSpec(topDownGameSpecFixture)).toEqual(
      topDownGameSpecFixture
    );
  });

  it("keeps scenes forward-compatible while requiring one arena for the first template", () => {
    expect(() =>
      parseTopDownGameSpec({
        ...topDownGameSpecFixture,
        template: {
          ...topDownGameSpecFixture.template,
          config: {
            scenes: [
              topDownGameSpecFixture.template.config.scenes[0],
              {
                ...topDownGameSpecFixture.template.config.scenes[0],
                id: "scene_boss_arena",
                name: "Boss Arena",
              },
            ],
          },
        },
      })
    ).toThrow("Too big");
  });

  it("accepts deterministic layout primitives and rejects runtime hook fields", () => {
    const scene = topDownGameSpecFixture.template.config.scenes[0];
    const spec = parseTopDownGameSpec({
      ...topDownGameSpecFixture,
      template: {
        ...topDownGameSpecFixture.template,
        config: {
          scenes: [
            {
              ...scene,
              layout: {
                ...scene.layout,
                obstacles: [
                  {
                    id: "obstacle_crate",
                    shape: "rect",
                    x: 420,
                    y: 220,
                    width: 48,
                    height: 48,
                  },
                  {
                    id: "obstacle_boulder",
                    shape: "circle",
                    x: 560,
                    y: 260,
                    radius: 32,
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(spec.template.config.scenes[0].layout.obstacles).toEqual([
      {
        id: "obstacle_crate",
        shape: "rect",
        x: 420,
        y: 220,
        width: 48,
        height: 48,
      },
      {
        id: "obstacle_boulder",
        shape: "circle",
        x: 560,
        y: 260,
        radius: 32,
      },
    ]);

    expect(() =>
      parseTopDownGameSpec({
        ...topDownGameSpecFixture,
        template: {
          ...topDownGameSpecFixture.template,
          config: {
            scenes: [
              {
                ...scene,
                layout: {
                  ...scene.layout,
                  regions: [
                    {
                      ...scene.layout.regions[0],
                      onEnter: "spawn_boss",
                    },
                  ],
                },
              },
            ],
          },
        },
      })
    ).toThrow("Unrecognized key");
  });

  it("rejects invalid stable IDs inside top-down config blocks", () => {
    const scene = topDownGameSpecFixture.template.config.scenes[0];

    expect(() =>
      parseTopDownGameSpec({
        ...topDownGameSpecFixture,
        template: {
          ...topDownGameSpecFixture.template,
          config: {
            scenes: [
              {
                ...scene,
                layout: {
                  ...scene.layout,
                  walls: [
                    {
                      ...scene.layout.walls[0],
                      id: "WallNorth",
                    },
                  ],
                },
              },
            ],
          },
        },
      })
    ).toThrow("Use lowercase stable IDs with underscore-separated segments.");
  });

  it("keeps objectives and validation goals top-level while allowing stable-ID references", () => {
    const scene = topDownGameSpecFixture.template.config.scenes[0];
    const spec = parseTopDownGameSpec({
      ...topDownGameSpecFixture,
      template: {
        ...topDownGameSpecFixture.template,
        config: {
          scenes: [
            {
              ...scene,
              objectiveIds: ["objective_future_bonus"],
              validationGoalIds: ["validation_future_bonus"],
            },
          ],
        },
      },
    });

    expect(spec.objectives).toEqual(topDownGameSpecFixture.objectives);
    expect(spec.validationGoals).toEqual(topDownGameSpecFixture.validationGoals);
    expect(spec.template.config.scenes[0].objectiveIds).toEqual([
      "objective_future_bonus",
    ]);
    expect(spec.template.config.scenes[0].validationGoalIds).toEqual([
      "validation_future_bonus",
    ]);
    expect(spec.mechanics[0].config).not.toHaveProperty("validationGoals");
  });

  it("parses standalone top-down config and specializes full specs to the top-down template", () => {
    expect(
      parseTopDownSpec({
        ...topDownGameSpecFixture.template.config,
        extensions: {
          experimentalLayoutNote: "Keep the center lane open.",
        },
      })
    ).toEqual({
      ...topDownGameSpecFixture.template.config,
      extensions: {
        experimentalLayoutNote: "Keep the center lane open.",
      },
    });

    expect(() =>
      parseTopDownGameSpec({
        ...topDownGameSpecFixture,
        template: {
          ...topDownGameSpecFixture.template,
          id: "template_canvas",
        },
      })
    ).toThrow("Invalid input");
  });
});
