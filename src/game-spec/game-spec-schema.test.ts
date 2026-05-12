import { describe, expect, it } from "vitest";

import { parseGameSpec } from ".";

const minimalCoreGameSpec = {
  schemaVersion: "game-spec/v1",
  id: "game_crystal_chase",
  title: "Crystal Chase",
  currentIntentSummary: "Collect crystals while avoiding the chaser.",
  template: {
    id: "template_top_down",
    version: "1.0.0",
    config: {},
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
  ],
  assets: [
    {
      id: "asset_player",
      role: "player",
      name: "Player Placeholder",
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
      id: "validation_player_visible",
      label: "Player visible",
      description: "The player appears when the game boots.",
    },
  ],
  mechanics: [
    {
      id: "mechanic_player_movement",
      type: "player_movement",
      targetIds: ["entity_player"],
      config: {},
    },
  ],
};

describe("Game Spec schema", () => {
  it("parses a minimal valid core Game Spec", () => {
    expect(parseGameSpec(minimalCoreGameSpec)).toEqual(minimalCoreGameSpec);
  });

  it("rejects invalid stable IDs with a useful failure", () => {
    expect(() =>
      parseGameSpec({
        ...minimalCoreGameSpec,
        entities: [
          {
            id: "EntityPlayer",
            role: "player",
            name: "Player",
          },
        ],
      })
    ).toThrow("Use lowercase stable IDs with underscore-separated segments.");
  });

  it("keeps objectives, validation goals, and mechanics as separate referenceable collections", () => {
    const spec = parseGameSpec({
      ...minimalCoreGameSpec,
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
          id: "mechanic_collect_crystals",
          type: "pickup_collection",
          targetIds: ["entity_player"],
          objectiveIds: ["objective_collect_crystals"],
          config: {
            requiredCount: 5,
          },
        },
      ],
    });

    expect(spec.objectives).toEqual(minimalCoreGameSpec.objectives);
    expect(spec.validationGoals).toEqual([
      {
        id: "validation_collectible_reachable",
        label: "Collectible reachable",
        description: "At least one collectible can be reached by the player.",
        objectiveId: "objective_collect_crystals",
      },
    ]);
    expect(spec.mechanics).toEqual([
      {
        id: "mechanic_collect_crystals",
        type: "pickup_collection",
        targetIds: ["entity_player"],
        objectiveIds: ["objective_collect_crystals"],
        config: {
          requiredCount: 5,
        },
      },
    ]);
  });

  it("accepts JSON-compatible template config and extension data", () => {
    const spec = parseGameSpec({
      ...minimalCoreGameSpec,
      template: {
        ...minimalCoreGameSpec.template,
        config: {
          difficulty: "easy",
          spawnCount: 3,
          debug: false,
          regions: [{ id: "config_spawn_zone", weight: 1 }],
        },
      },
      extensions: {
        experimentalMechanicHints: {
          tags: ["collect", "avoid"],
          enabled: true,
        },
      },
    });

    expect(spec.template.config).toEqual({
      difficulty: "easy",
      spawnCount: 3,
      debug: false,
      regions: [{ id: "config_spawn_zone", weight: 1 }],
    });
    expect(spec.extensions).toEqual({
      experimentalMechanicHints: {
        tags: ["collect", "avoid"],
        enabled: true,
      },
    });
  });

  it("rejects non-JSON template config and extension values", () => {
    expect(() =>
      parseGameSpec({
        ...minimalCoreGameSpec,
        template: {
          ...minimalCoreGameSpec.template,
          config: {
            generatedAt: new Date("2026-05-11T00:00:00.000Z"),
          },
        },
      })
    ).toThrow("Game Spec JSON fields must contain only JSON-compatible values.");
  });

  it("rejects unknown top-level fields while allowing explicit extensions", () => {
    expect(() =>
      parseGameSpec({
        ...minimalCoreGameSpec,
        strayField: "not part of the core contract",
      })
    ).toThrow("Unrecognized key");

    expect(
      parseGameSpec({
        ...minimalCoreGameSpec,
        extensions: {
          futureTemplateNote: "Allowed only through the extension boundary.",
        },
      }).extensions
    ).toEqual({
      futureTemplateNote: "Allowed only through the extension boundary.",
    });
  });
});
