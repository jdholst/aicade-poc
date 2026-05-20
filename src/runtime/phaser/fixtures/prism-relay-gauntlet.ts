export const prismRelayGauntletGameSpecFixtureInput = {
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
