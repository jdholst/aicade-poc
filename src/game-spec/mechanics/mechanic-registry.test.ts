import { describe, expect, it } from "vitest";

import {
  createMechanicRuntimeBridge,
  getMechanicDefinitionForScope,
  getMechanicDefinitionsForScope,
  getTopDownMechanicDefinition,
  getTopDownMechanicDefinitionsForSpec,
  TOP_DOWN_PHASER_MECHANIC_SCOPE,
  topDownMechanicRegistry,
  validateTopDownGameSpec,
  type TopDownGameSpec,
} from "..";

const registryBackedTopDownSpec: TopDownGameSpec = {
  schemaVersion: "game-spec/v1",
  id: "game_registry_fixture",
  title: "Registry Fixture",
  currentIntentSummary: "Exercise all built-in top-down mechanics.",
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
      id: "entity_chaser",
      role: "enemy",
      name: "Chaser",
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
      sceneIds: ["scene_arena"],
      objectiveIds: ["objective_collect_crystal"],
      config: {},
    },
    {
      id: "mechanic_chaser_enemy",
      type: "enemy_chase",
      targetIds: ["entity_chaser", "entity_player"],
      sceneIds: ["scene_arena"],
      regionIds: ["region_safe_start"],
      objectiveIds: ["objective_collect_crystal"],
      config: {
        speed: 96,
      },
    },
    {
      id: "mechanic_pickup_collection",
      type: "pickup_collection",
      targetIds: ["entity_player", "entity_crystal"],
      sceneIds: ["scene_arena"],
      regionIds: ["region_safe_start"],
      assetIds: ["asset_crystal"],
      objectiveIds: ["objective_collect_crystal"],
      config: {
        requiredCount: 5,
      },
    },
  ],
};

describe("top-down Mechanic Registry", () => {
  it("exposes built-in mechanics and validates the current active entries through the registry", () => {
    expect(topDownMechanicRegistry.map((entry) => entry.type)).toEqual([
      "player_movement",
      "enemy_chase",
      "pickup_collection",
      "hazard_contact",
    ]);

    expect(getTopDownMechanicDefinition("player_movement")).toMatchObject({
      capabilityTags: ["movement"],
      label: "Player movement",
      runtimeInstallerKey: "install_player_movement",
      runtimeDependencyScriptPath: "/runtime/phaser/mechanics/player-movement.js",
      scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
      type: "player_movement",
    });
    expect(getTopDownMechanicDefinition("enemy_chase")).toMatchObject({
      capabilityTags: ["enemy_ai"],
      label: "Enemy chase",
      runtimeInstallerKey: "install_enemy_chase",
      runtimeDependencyScriptPath: "/runtime/phaser/mechanics/enemy-chase.js",
      scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
      type: "enemy_chase",
    });
    expect(getTopDownMechanicDefinition("pickup_collection")).toMatchObject({
      capabilityTags: ["collection", "score"],
      label: "Pickup collection",
      runtimeInstallerKey: "install_pickup_collection",
      runtimeDependencyScriptPath:
        "/runtime/phaser/mechanics/pickup-collection.js",
      scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
      type: "pickup_collection",
    });
    expect(getTopDownMechanicDefinition("hazard_contact")).toMatchObject({
      capabilityTags: ["health_damage"],
      label: "Hazard contact",
      runtimeInstallerKey: "install_hazard_contact",
      runtimeDependencyScriptPath: "/runtime/phaser/mechanics/hazard-contact.js",
      scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
      type: "hazard_contact",
    });

    expect(validateTopDownGameSpec(registryBackedTopDownSpec)).toEqual(
      registryBackedTopDownSpec
    );
  });

  it("returns only registry definitions declared by the active Game Spec", () => {
    const spec = validateTopDownGameSpec({
      ...registryBackedTopDownSpec,
      entities: registryBackedTopDownSpec.entities.filter(
        (entity) => entity.id !== "entity_crystal"
      ),
      mechanics: registryBackedTopDownSpec.mechanics.slice(0, 2),
    });

    expect(getTopDownMechanicDefinitionsForSpec(spec).map((entry) => entry.type))
      .toEqual(["player_movement", "enemy_chase"]);
  });

  it("declares mechanic validation contracts for built-in top-down mechanics", () => {
    expect(getTopDownMechanicDefinition("player_movement"))
      .toMatchObject({
        validationRequirements: {
          requiredTargetRoles: ["player"],
        },
      });
    expect(getTopDownMechanicDefinition("pickup_collection"))
      .toMatchObject({
        validationRequirements: {
          requiredTargetRoles: ["player"],
          requiredAssetRoles: ["pickup"],
          requiresObjective: true,
          layoutCoverage: [
            {
              kind: "pickup_zone_for_referenced_asset",
              assetRole: "pickup",
            },
          ],
        },
      });
    expect(getTopDownMechanicDefinition("enemy_chase")).toMatchObject({
      validationRequirements: {
        requiredTargetRoles: ["enemy", "player"],
        requiresObjective: true,
      },
    });
    expect(getTopDownMechanicDefinition("hazard_contact")).toMatchObject({
      validationRequirements: {
        requiredTargetRoles: ["hazard", "player"],
        requiresObjective: true,
      },
    });
  });

  it("resolves mechanics by type and runtime scope without namespacing Game Spec mechanic IDs", () => {
    expect(
      getMechanicDefinitionForScope(
        topDownMechanicRegistry,
        "player_movement",
        TOP_DOWN_PHASER_MECHANIC_SCOPE
      )
    ).toMatchObject({
      runtimeInstallerKey: "install_player_movement",
      type: "player_movement",
    });

    expect(
      getMechanicDefinitionForScope(topDownMechanicRegistry, "player_movement", {
        templateId: "template_platformer",
        runtime: "phaser",
      })
    ).toBeUndefined();

    expect(
      getMechanicDefinitionsForScope(
        topDownMechanicRegistry,
        TOP_DOWN_PHASER_MECHANIC_SCOPE
      ).map((entry) => entry.type)
    ).toEqual([
      "player_movement",
      "enemy_chase",
      "pickup_collection",
      "hazard_contact",
    ]);
  });

  it("builds runtime installer keys for active mechanics in the requested scope", () => {
    const bridge = createMechanicRuntimeBridge({
      mechanics: [
        registryBackedTopDownSpec.mechanics[0],
        registryBackedTopDownSpec.mechanics[0],
        registryBackedTopDownSpec.mechanics[1],
      ],
      registry: topDownMechanicRegistry,
      scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
    });

    expect(bridge.mechanicInstallerKeys).toEqual({
      enemy_chase: "install_enemy_chase",
      player_movement: "install_player_movement",
    });
  });

  it("builds runtime dependency script paths from active scoped registry entries", () => {
    const bridge = createMechanicRuntimeBridge({
      mechanics: [
        registryBackedTopDownSpec.mechanics[2],
        registryBackedTopDownSpec.mechanics[0],
        registryBackedTopDownSpec.mechanics[2],
      ],
      registry: topDownMechanicRegistry,
      scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
    });

    expect(bridge.runtimeDependencyScriptPaths).toEqual([
      "/runtime/phaser/mechanics/pickup-collection.js",
      "/runtime/phaser/mechanics/player-movement.js",
    ]);
  });

  it("omits unmatched mechanics from runtime bridge metadata", () => {
    const bridge = createMechanicRuntimeBridge({
      mechanics: [
        registryBackedTopDownSpec.mechanics[0],
        {
          ...registryBackedTopDownSpec.mechanics[1],
          type: "unsupported_mechanic",
          config: {},
        },
      ],
      registry: topDownMechanicRegistry,
      scope: {
        templateId: "template_platformer",
        runtime: "phaser",
      },
    });

    expect(bridge).toEqual({
      mechanicInstallerKeys: {},
      runtimeDependencyScriptPaths: [],
    });
  });
});
