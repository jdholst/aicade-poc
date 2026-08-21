import { afterEach, describe, expect, it, vi } from "vitest";

import { getTopDownMechanicDefinition, validateTopDownGameSpec } from "@/game-spec";

import {
  createTopDownPhaserTemplate,
  createTopDownPhaserTemplateState,
  getTopDownPhaserTemplateState,
  TOP_DOWN_MECHANIC_CONTEXT_SERVICE_KEYS,
  topDownPhaserTemplate,
} from ".";
import {
  createTopDownGameSpecFixtureState,
  getTopDownGameSpecFixture,
  getTopDownGameSpecFixtureState,
  TOP_DOWN_GAME_SPEC_FIXTURE_ENV,
} from "./top-down-game-spec-fixture";
import {
  createRuntimeHarness,
  createTemplateWithSceneLayout,
  loadPublicRuntimeSource,
  loadTopDownRuntimeSource,
  runScriptInContext,
  runTopDownRuntime,
} from "./testing/top-down-runtime-harness";
import type { TopDownMechanicInstaller } from "./top-down-mechanic-runtime";

describe("top-down Phaser template", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("describes a hand-authored top-down runtime template", () => {
    expect(topDownPhaserTemplate).toMatchObject({
      id: "game_crystal_spec_chase-phaser-template",
      runtime: "phaser",
      title: "Crystal Spec Chase",
      runtimeScriptPath: "/runtime/phaser/top-down-template.js",
      viewport: {
        width: 800,
        height: 600,
        scaling: "stretch_to_fill",
      },
      controls: [
        {
          action: "move",
          kind: "axis",
          keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"],
          label: "Move",
        },
      ],
    });
    expect(topDownPhaserTemplate.gameSpec.template.id).toBe(
      "template_top_down"
    );
    expect(topDownPhaserTemplate.gameSpec.title).toBe("Crystal Spec Chase");
  });

  it("builds template artifacts from validated top-down Game Spec input", () => {
    const spec = validateTopDownGameSpec({
      ...topDownPhaserTemplate.gameSpec,
      id: "game_custom_arena",
      title: "Custom Arena",
      template: {
        ...topDownPhaserTemplate.gameSpec.template,
        config: {
          scenes: [
            {
              ...topDownPhaserTemplate.gameSpec.template.config.scenes[0],
              arena: {
                id: "arena_custom",
                width: 640,
                height: 480,
              },
            },
          ],
        },
      },
    });

    expect(createTopDownPhaserTemplate(spec)).toMatchObject({
      id: "game_custom_arena-phaser-template",
      title: "Custom Arena",
      viewport: {
        width: 640,
        height: 480,
        scaling: "stretch_to_fill",
      },
    });

    expect(() =>
      createTopDownPhaserTemplate(
        validateTopDownGameSpec({
          ...topDownPhaserTemplate.gameSpec,
          template: {
            ...topDownPhaserTemplate.gameSpec.template,
            id: "template_canvas",
          },
        })
      )
    ).toThrow("Invalid input");

    expect(() =>
      createTopDownPhaserTemplate(
        validateTopDownGameSpec({
          ...topDownPhaserTemplate.gameSpec,
          objectives: [
            {
              ...topDownPhaserTemplate.gameSpec.objectives[0],
              primary: false,
            },
          ],
        })
      )
    ).toThrow("Expected exactly one primary objective.");
  });

  it("returns a stable valid template state for mounted runtime renders", () => {
    expect(getTopDownPhaserTemplateState()).toBe(getTopDownPhaserTemplateState());
  });

  it("returns an invalid template state instead of throwing for semantically invalid Game Specs", () => {
    const invalidFixtureState = createTopDownGameSpecFixtureState({
      ...topDownPhaserTemplate.gameSpec,
      mechanics: topDownPhaserTemplate.gameSpec.mechanics.map((mechanic) =>
        mechanic.type === "player_movement"
          ? {
              ...mechanic,
              entityIds: [],
            }
          : mechanic
      ),
    });

    expect(invalidFixtureState).toMatchObject({
      status: "invalid",
      message:
        'mechanics.mechanic_player_movement.entityIds: Expected target role "player".',
      issues: [
        {
          path: "mechanics.mechanic_player_movement.entityIds",
          message: 'Expected target role "player".',
        },
      ],
    });
    expect(createTopDownPhaserTemplateState(invalidFixtureState))
      .toMatchObject({
        status: "invalid",
        message:
          'mechanics.mechanic_player_movement.entityIds: Expected target role "player".',
      });
  });

  it("selects named valid top-down fixtures from the fixture catalog", () => {
    expect(getTopDownGameSpecFixture().title).toBe("Crystal Spec Chase");
    expect(getTopDownGameSpecFixture("prism_relay_gauntlet").title).toBe(
      "Prism Relay Gauntlet"
    );
    expect(getTopDownGameSpecFixture("unknown_fixture").title).toBe(
      "Crystal Spec Chase"
    );
  });

  it.each([
    ["malformed_top_down_template", "Invalid input"],
    ["missing_primary_objective", "Expected exactly one primary objective."],
    ["multiple_primary_objectives", "Expected exactly one primary objective."],
    ["missing_player_entity", 'Expected target role "player".'],
    ["missing_enemy_target_role", 'Expected target role "enemy".'],
    ["missing_hazard_target_role", 'Expected target role "hazard".'],
    ["missing_pickup_asset_reference", 'Expected asset role "pickup".'],
    [
      "missing_pickup_zone_coverage",
      "Expected a referenced pickup asset to be placed in a pickup zone.",
    ],
    ["unknown_scene_reference", 'Unknown scene ID "scene_missing".'],
    [
      "missing_mechanic_objective_reference",
      "Expected an objective reference.",
    ],
    ["unsupported_mechanic_type", 'Unsupported mechanic type "teleport_player".'],
    [
      "unknown_validation_goal_objective_reference",
      'Unknown objective ID "objective_missing".',
    ],
    ["unknown_mechanic_references", 'Unknown entity ID "entity_missing".'],
    ["unknown_scene_references", 'Unknown validation goal ID "validation_missing".'],
    ["unused_modules", "Entity is not referenced by any spawn zone or active mechanic."],
  ] as const)(
    "exposes invalid fixture %s for manual failure-surface checks",
    (fixtureId, expectedMessage) => {
      const fixtureState = getTopDownGameSpecFixtureState(fixtureId);

      expect(fixtureState).toMatchObject({
        status: "invalid",
      });
      expect(fixtureState.message).toContain(expectedMessage);
      expect(createTopDownPhaserTemplateState(fixtureState)).toMatchObject({
        status: "invalid",
      });
    }
  );

  it("uses the selected fixture when building the Phaser template state", () => {
    vi.stubEnv(TOP_DOWN_GAME_SPEC_FIXTURE_ENV, "prism_relay_gauntlet");

    const selectedState = getTopDownPhaserTemplateState();

    expect(selectedState).toBe(getTopDownPhaserTemplateState());
    expect(selectedState).toMatchObject({
      status: "valid",
      template: {
        id: "game_prism_relay_gauntlet-phaser-template",
        title: "Prism Relay Gauntlet",
      },
    });
  });

  it("declares every gameplay behavior as an active Game Spec mechanic", () => {
    expect(
      topDownPhaserTemplate.gameSpec.mechanics.map((mechanic) => mechanic.type)
    ).toEqual([
      "player_movement",
      "pickup_collection",
      "enemy_chase",
      "hazard_contact",
    ]);
  });

  it("exposes runtime installer keys from the Mechanic Registry", () => {
    expect(topDownPhaserTemplate.mechanicInstallerKeys).toEqual(
      Object.fromEntries(
        topDownPhaserTemplate.gameSpec.mechanics.map((mechanic) => [
          mechanic.type,
          getTopDownMechanicDefinition(mechanic.type)?.runtimeInstallerKey,
        ])
      )
    );
    expect(topDownPhaserTemplate.mechanicInstallerKeys).toEqual({
      enemy_chase: "install_enemy_chase",
      hazard_contact: "install_hazard_contact",
      pickup_collection: "install_pickup_collection",
      player_movement: "install_player_movement",
    });
  });

  it("exposes runtime dependency scripts for active mechanics from the Mechanic Registry", () => {
    expect(topDownPhaserTemplate.runtimeDependencyScriptPaths).toEqual([
      "/runtime/phaser/mechanics/player-movement.js",
      "/runtime/phaser/mechanics/pickup-collection.js",
      "/runtime/phaser/mechanics/enemy-chase.js",
      "/runtime/phaser/mechanics/hazard-contact.js",
    ]);

    const pickupOnlyTemplate = createTopDownPhaserTemplate({
      ...topDownPhaserTemplate.gameSpec,
      mechanics: topDownPhaserTemplate.gameSpec.mechanics.filter(
        (mechanic) => mechanic.type === "pickup_collection"
      ),
    });

    expect(pickupOnlyTemplate.mechanicInstallerKeys).toEqual({
      pickup_collection: "install_pickup_collection",
    });
    expect(pickupOnlyTemplate.runtimeDependencyScriptPaths).toEqual([
      "/runtime/phaser/mechanics/pickup-collection.js",
    ]);
  });

  it("builds the Prism Relay Gauntlet fixture with movement, pickup, and hazard but no chase", () => {
    const relayTemplate = createTopDownPhaserTemplate(
      getTopDownGameSpecFixture("prism_relay_gauntlet")
    );

    expect(relayTemplate.mechanicInstallerKeys).toEqual({
      hazard_contact: "install_hazard_contact",
      pickup_collection: "install_pickup_collection",
      player_movement: "install_player_movement",
    });
    expect(relayTemplate.runtimeDependencyScriptPaths).toEqual([
      "/runtime/phaser/mechanics/player-movement.js",
      "/runtime/phaser/mechanics/pickup-collection.js",
      "/runtime/phaser/mechanics/hazard-contact.js",
    ]);
    expect(relayTemplate.gameSpec.entities.map((entity) => entity.role)).toEqual(
      ["player", "pickup", "hazard"]
    );
  });

  it("installs active mechanics through the external runtime mechanic registry", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const installedTypes: string[] = [];
    const installerContexts: Array<Record<string, unknown>> = [];
    const { context } = createRuntimeHarness(topDownPhaserTemplate);

    Object.assign(context.globalThis, {
      __AICADE_TOP_DOWN_MECHANICS__: {
        install_enemy_chase(installerContext: Record<string, unknown>) {
          installedTypes.push("enemy_chase");
          installerContexts.push(installerContext);
          return {};
        },
        install_hazard_contact(installerContext: Record<string, unknown>) {
          installedTypes.push("hazard_contact");
          installerContexts.push(installerContext);
          return {};
        },
        install_pickup_collection(installerContext: Record<string, unknown>) {
          installedTypes.push("pickup_collection");
          installerContexts.push(installerContext);
          return {};
        },
        install_player_movement(installerContext: Record<string, unknown>) {
          installedTypes.push("player_movement");
          installerContexts.push(installerContext);
          return {};
        },
      },
    });

    runScriptInContext(runtimeSource, context);

    expect(installedTypes).toEqual([
      "player_movement",
      "pickup_collection",
      "enemy_chase",
      "hazard_contact",
    ]);
    expect(installerContexts).toHaveLength(4);
    installerContexts.forEach((installerContext) => {
      const entities = installerContext.entities as Record<string, unknown>;
      const input = installerContext.input as Record<string, unknown>;
      const layout = installerContext.layout as Record<string, unknown>;
      const math = installerContext.math as Record<string, unknown>;
      const objective = installerContext.objective as Record<string, unknown>;
      const physics = installerContext.physics as Record<string, unknown>;
      const runtime = installerContext.runtime as Record<string, unknown>;

      expect(typeof entities.createHandle).toBe("function");
      expect(typeof entities.findById).toBe("function");
      expect(typeof entities.findByRole).toBe("function");
      expect(typeof entities.getHandle).toBe("function");
      expect(typeof entities.resetHandle).toBe("function");
      expect(typeof layout.findPickupPoint).toBe("function");
      expect(typeof layout.findSpawnPointForEntity).toBe("function");
      expect(typeof layout.isPathBlocked).toBe("function");
      expect(typeof layout.isPointBlocked).toBe("function");
      expect(Array.isArray(layout.staticBodies)).toBe(true);
      expect(typeof input.createCursorKeys).toBe("function");
      expect(typeof math.normalizeVector).toBe("function");
      expect(typeof math.randomBetween).toBe("function");
      expect(typeof math.scaleVector).toBe("function");
      expect(typeof objective.increment).toBe("function");
      expect(typeof objective.reset).toBe("function");
      expect(typeof physics.addCollider).toBe("function");
      expect(typeof physics.addOverlap).toBe("function");
      expect(typeof runtime.getViewport).toBe("function");
      expect(typeof runtime.resetEntity).toBe("function");
      expect(Object.keys(installerContext)).not.toEqual(
        expect.arrayContaining([
          "Phaser",
          "collectObjective",
          "createChaser",
          "createObjective",
          "gameSpec",
          "getChaser",
          "getChaseVelocity",
          "getObjective",
          "getPlayer",
          "resetAfterChaserCatch",
          "scene",
          "viewport",
        ])
      );
    });
  });

  it("installs duplicate mechanic types with their own mechanic entries", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const baseMechanic = topDownPhaserTemplate.gameSpec.mechanics[0];
    const duplicateMechanic = {
      ...baseMechanic,
      id: "mechanic_player_movement_second",
      entityIds: ["entity_player_second"],
      config: {
        ...baseMechanic.config,
        speed: 320,
      },
    };
    const templateWithDuplicateMechanic = {
      ...topDownPhaserTemplate,
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        mechanics: [
          baseMechanic,
          duplicateMechanic,
          ...topDownPhaserTemplate.gameSpec.mechanics.slice(1),
        ],
      },
    };
    const installedMechanics: Array<{
      config: unknown;
      id: unknown;
      entityIds: unknown;
    }> = [];
    const { context } = createRuntimeHarness(templateWithDuplicateMechanic);

    Object.assign(context.globalThis, {
      __AICADE_TOP_DOWN_MECHANICS__: {
        install_enemy_chase() {
          return {};
        },
        install_hazard_contact() {
          return {};
        },
        install_pickup_collection() {
          return {};
        },
        install_player_movement(installerContext: {
          mechanic?: {
            config?: unknown;
            id?: unknown;
            entityIds?: unknown;
          };
        }) {
          installedMechanics.push({
            config: installerContext.mechanic?.config,
            id: installerContext.mechanic?.id,
            entityIds: installerContext.mechanic?.entityIds,
          });

          return {};
        },
      },
    });

    runScriptInContext(runtimeSource, context);

    expect(installedMechanics).toEqual([
      {
        config: baseMechanic.config,
        id: "mechanic_player_movement",
        entityIds: ["entity_player"],
      },
      {
        config: duplicateMechanic.config,
        id: "mechanic_player_movement_second",
        entityIds: ["entity_player_second"],
      },
    ]);
  });

  it("registers built-in installers from runtime dependency scripts", () => {
    const context: {
      globalThis: {
        __AICADE_TOP_DOWN_MECHANICS__?: Record<string, unknown>;
      };
    } = {
      globalThis: {},
    };

    topDownPhaserTemplate.runtimeDependencyScriptPaths.forEach((scriptPath) => {
      runScriptInContext(loadPublicRuntimeSource(scriptPath), context);
    });

    expect(
      Object.keys(
        context.globalThis.__AICADE_TOP_DOWN_MECHANICS__ as Record<
          string,
          unknown
        >
      )
    ).toEqual([
      "install_player_movement",
      "install_pickup_collection",
      "install_enemy_chase",
      "install_hazard_contact",
    ]);
  });

  it("defines a narrow typed runtime context for top-down mechanic installers", () => {
    const installer = ((context) => {
      const services = TOP_DOWN_MECHANIC_CONTEXT_SERVICE_KEYS.map(
        (key) => context[key]
      );
      const helperResults = [
        context.entities.findTargetByRole("player"),
        context.entities.getTargetIdByRole("player", "entity_player"),
        context.objective.getPrimaryId(),
      ];

      expect(services).toHaveLength(7);
      expect(helperResults).toHaveLength(3);

      return {
        dispose() {},
        update() {},
      };
    }) satisfies TopDownMechanicInstaller;

    expect(typeof installer).toBe("function");
    expect(TOP_DOWN_MECHANIC_CONTEXT_SERVICE_KEYS).toEqual([
      "entities",
      "layout",
      "physics",
      "objective",
      "input",
      "math",
      "runtime",
    ]);
  });

  it("installs the declared movement, pickup, and chase mechanics for the valid fixture", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const { context, gameElements, moveToObjectCalls, runUpdate } =
      createRuntimeHarness(topDownPhaserTemplate, { right: true });

    runTopDownRuntime(runtimeSource, context);
    runUpdate();

    const player = gameElements.find(
      (element) => element.kind === "rectangle" && element.x === 156
    );
    const chaser = gameElements.find(
      (element) => element.kind === "circle" && element.x === 668
    );

    expect(player?.body?.velocityCalls).toEqual([{ x: 220, y: 0 }]);
    expect(gameElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "star", x: 224, y: 224 }),
        expect.objectContaining({ kind: "circle", x: 668, y: 428 }),
      ])
    );
    expect(chaser?.body?.velocityCalls).toHaveLength(1);
    expect(chaser?.body?.velocityCalls[0].x).toBeLessThan(0);
    expect(chaser?.body?.velocityCalls[0].y).toBeLessThan(0);
    expect(moveToObjectCalls).toEqual([]);
  });

  it("preserves a stronger generated player velocity until the generated mechanic releases it", async () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const generatedMechanic = {
      id: "mechanic_generated_dash",
      type: "generated_dash",
      entityIds: ["entity_player"],
      config: {},
    };
    const generatedTemplate = {
      ...topDownPhaserTemplate,
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        mechanics: [
          ...topDownPhaserTemplate.gameSpec.mechanics,
          generatedMechanic,
        ],
      },
    };
    const { context, dispatchWindowEvent, gameElements, messages, runUpdate } =
      createRuntimeHarness(generatedTemplate, { right: true });
    let getEntityHandle:
      | ((entityId: string) => {
          body?: {
            setVelocity: (x: number, y: number) => void;
          };
        } | null)
      | undefined;
    Object.assign(context.globalThis, {
      __AICADE_GENERATED_MECHANIC_HOST__: {
        mechanicId: generatedMechanic.id,
        install: vi.fn(
          async (input: {
            getEntityHandle: typeof getEntityHandle;
          }) => {
            getEntityHandle = input.getEntityHandle;
            return {
              identity: { artifactId: "extension_generated_dash_v1" },
              advanceSimulation: vi.fn(async () => undefined),
              dispatchLogicalAction: vi.fn(async () => {
                getEntityHandle?.("entity_player")?.body?.setVelocity(550, 0);
              }),
              dispose: vi.fn(async () => undefined),
            };
          }
        ),
      },
    });

    runTopDownRuntime(runtimeSource, context, generatedTemplate);
    await vi.waitFor(() => {
      expect(messages).toContainEqual(
        expect.objectContaining({ type: "game-ready" })
      );
    });

    dispatchWindowEvent("keydown", {
      isTrusted: true,
      key: "ArrowRight",
      repeat: false,
    });
    const player = gameElements.find(
      (element) => element.kind === "rectangle" && element.x === 156
    );
    await vi.waitFor(() => {
      expect(player?.body?.velocity).toEqual({ x: 550, y: 0 });
    });

    runUpdate();

    expect(player?.body?.velocity).toEqual({ x: 550, y: 0 });

    player?.body?.setVelocity(160, 0);
    runUpdate();

    expect(player?.body?.velocity).toEqual({ x: 220, y: 0 });
  });

  it("does not apply player movement when the player_movement mechanic is omitted", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const templateWithoutMovement = {
      ...topDownPhaserTemplate,
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        mechanics: topDownPhaserTemplate.gameSpec.mechanics.filter(
          (mechanic) => mechanic.type !== "player_movement"
        ),
      },
    };
    const { context, gameElements, runUpdate } = createRuntimeHarness(
      templateWithoutMovement,
      { right: true }
    );

    runTopDownRuntime(runtimeSource, context);
    runUpdate();

    const player = gameElements.find(
      (element) => element.kind === "rectangle" && element.x === 156
    );
    expect(player?.body?.velocityCalls).toEqual([]);
  });

  it("does not install pickup collection when the pickup_collection mechanic is omitted", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const templateWithoutPickupCollection = {
      ...topDownPhaserTemplate,
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        mechanics: topDownPhaserTemplate.gameSpec.mechanics.filter(
          (mechanic) => mechanic.type !== "pickup_collection"
        ),
      },
    };
    const { context, gameElements, overlapCalls } = createRuntimeHarness(
      templateWithoutPickupCollection
    );

    runTopDownRuntime(runtimeSource, context);

    expect(
      gameElements.some((element) => element.kind === "star")
    ).toBe(false);
    expect(
      overlapCalls.some(
        ({ first, second }) => first.kind === "star" || second.kind === "star"
      )
    ).toBe(false);
  });

  it("places pickup crystals away from wall and obstacle geometry", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const templateWithBlockedPickupCenter = createTemplateWithSceneLayout({
      ...topDownPhaserTemplate.gameSpec.template.config.scenes[0].layout,
      obstacles: [
        {
          id: "obstacle_pickup_center",
          shape: "rect",
          x: 190,
          y: 190,
          width: 20,
          height: 20,
        },
      ],
      pickupZones: [
        {
          id: "pickup_blocked_center",
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          assetIds: ["asset_crystal"],
        },
      ],
    });
    const { context, gameElements } = createRuntimeHarness(
      templateWithBlockedPickupCenter
    );

    runTopDownRuntime(runtimeSource, context);

    const crystal = gameElements.find((element) => element.kind === "star");
    expect(crystal).toEqual(
      expect.not.objectContaining({ x: 200, y: 200 })
    );
  });

  it("does not install enemy chase when the enemy_chase mechanic is omitted", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const templateWithoutEnemyChase = {
      ...topDownPhaserTemplate,
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        mechanics: topDownPhaserTemplate.gameSpec.mechanics.filter(
          (mechanic) => mechanic.type !== "enemy_chase"
        ),
      },
    };
    const { context, gameElements, moveToObjectCalls, runUpdate } =
      createRuntimeHarness(templateWithoutEnemyChase);

    runTopDownRuntime(runtimeSource, context);
    runUpdate();

    expect(
      gameElements.some(
        (element) =>
          element.kind === "circle" && element.x === 668 && element.y === 428
      )
    ).toBe(false);
    expect(moveToObjectCalls).toEqual([]);
  });

  it("installs hazard contact as a typed service-backed mechanic", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const { context, gameElements, overlapCalls, textLabels } =
      createRuntimeHarness(topDownPhaserTemplate);

    runTopDownRuntime(runtimeSource, context);

    const player = gameElements.find(
      (element) => element.kind === "rectangle" && element.x === 156
    );
    const hazard = gameElements.find(
      (element) => element.kind === "circle" && element.x === 500
    );
    const pickupOverlap = overlapCalls.find(
      ({ second }) => second.kind === "star"
    );
    const hazardOverlap = overlapCalls.find(
      ({ first, second }) => first === player && second === hazard
    );

    expect(hazard).toEqual(
      expect.objectContaining({ kind: "circle", x: 500, y: 120 })
    );
    expect(hazardOverlap?.handler).toEqual(expect.any(Function));

    pickupOverlap?.handler?.();
    player?.setPosition?.(300, 300);
    hazardOverlap?.handler?.();

    expect(player).toEqual(expect.objectContaining({ x: 156, y: 316 }));
    expect(textLabels.at(-1)).toBe("Collect crystals: 0");
  });

  it("runs Prism Relay Gauntlet as a different behavior combination without enemy chase", () => {
    const relayTemplate = createTopDownPhaserTemplate(
      getTopDownGameSpecFixture("prism_relay_gauntlet")
    );
    const runtimeSource = loadTopDownRuntimeSource(relayTemplate);
    const { context, gameElements, overlapCalls, runUpdate, textLabels } =
      createRuntimeHarness(relayTemplate, { right: true });

    runTopDownRuntime(runtimeSource, context, relayTemplate);
    runUpdate();

    const player = gameElements.find(
      (element) => element.kind === "rectangle" && element.x === 120
    );
    const hazard = gameElements.find(
      (element) => element.kind === "circle" && element.x === 450
    );
    const pickupOverlap = overlapCalls.find(
      ({ second }) => second.kind === "star"
    );
    const hazardOverlap = overlapCalls.find(
      ({ first, second }) => first === player && second === hazard
    );

    expect(player?.body?.velocityCalls).toEqual([{ x: 280, y: 0 }]);
    expect(hazard).toEqual(expect.objectContaining({ x: 450, y: 300 }));
    expect(
      gameElements
        .filter((element) => element.kind === "circle")
        .flatMap((element) => element.body?.velocityCalls ?? [])
    ).toEqual([]);
    expect(gameElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "star", x: 674, y: 204 }),
      ])
    );
    expect(hazardOverlap?.handler).toEqual(expect.any(Function));

    pickupOverlap?.handler?.();
    player?.setPosition?.(560, 300);
    hazardOverlap?.handler?.();

    expect(player).toEqual(expect.objectContaining({ x: 120, y: 300 }));
    expect(textLabels).toContain("Relay prisms: 1");
    expect(textLabels.at(-1)).toBe("Relay prisms: 0");
  });

  it("steers the enemy around blocking obstacles instead of chasing directly into them", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const templateWithBlockedChaseLine = createTemplateWithSceneLayout({
      ...topDownPhaserTemplate.gameSpec.template.config.scenes[0].layout,
      obstacles: [
        {
          id: "obstacle_chase_blocker",
          shape: "rect",
          x: 360,
          y: 260,
          width: 80,
          height: 80,
        },
      ],
      pickupZones: [],
      spawnZones: [
        {
          id: "spawn_player",
          x: 140,
          y: 240,
          width: 120,
          height: 120,
          entityIds: ["entity_player"],
        },
        {
          id: "spawn_chaser",
          x: 540,
          y: 240,
          width: 120,
          height: 120,
          entityIds: ["entity_chaser"],
        },
      ],
    });
    const { context, gameElements, moveToObjectCalls, runUpdate } =
      createRuntimeHarness(templateWithBlockedChaseLine);

    runTopDownRuntime(runtimeSource, context);
    runUpdate();

    const chaser = gameElements.find(
      (element) => element.kind === "circle" && element.x === 600
    );
    expect(chaser?.body?.velocityCalls).toHaveLength(1);
    expect(chaser?.body?.velocityCalls.at(-1)?.y).not.toBe(0);
    expect(moveToObjectCalls).toEqual([]);
  });

  it("does not keep pushing the enemy into an obstacle face while detouring", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const templateWithChaserPressedAgainstObstacle =
      createTemplateWithSceneLayout({
        ...topDownPhaserTemplate.gameSpec.template.config.scenes[0].layout,
        obstacles: [
          {
            id: "obstacle_chaser_face",
            shape: "rect",
            x: 360,
            y: 280,
            width: 120,
            height: 80,
          },
        ],
        pickupZones: [],
        spawnZones: [
          {
            id: "spawn_player",
            x: 480,
            y: 380,
            width: 80,
            height: 80,
            entityIds: ["entity_player"],
          },
          {
            id: "spawn_chaser",
            x: 360,
            y: 220,
            width: 80,
            height: 80,
            entityIds: ["entity_chaser"],
          },
        ],
      });
    const { context, gameElements, runUpdate } = createRuntimeHarness(
      templateWithChaserPressedAgainstObstacle
    );

    runTopDownRuntime(
      runtimeSource,
      context,
      templateWithChaserPressedAgainstObstacle
    );
    runUpdate();

    const chaser = gameElements.find(
      (element) => element.kind === "circle" && element.x === 400
    );
    const velocity = chaser?.body?.velocityCalls.at(-1);
    expect(velocity?.x).toBeGreaterThan(0);
    expect(velocity?.y).toBeLessThanOrEqual(0);
  });

  it("reports mechanic install failures without preventing the runtime from becoming ready", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const { context, messages } = createRuntimeHarness(
      topDownPhaserTemplate,
      {},
      { throwOnCreateCursorKeys: true }
    );

    runTopDownRuntime(runtimeSource, context);

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: {
            mechanicId: "mechanic_player_movement",
            mechanicType: "player_movement",
            message:
              "Mechanic mechanic_player_movement install failed: Keyboard setup failed",
            phase: "install",
            recoverable: true,
            severity: "warning",
            type: "mechanic-disabled",
          },
          message:
            "Mechanic mechanic_player_movement install failed: Keyboard setup failed",
          type: "game-error",
        }),
        expect.objectContaining({
          type: "game-ready",
        }),
      ])
    );
  });

  it("reports missing external installers without preventing the runtime from becoming ready", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const { context, messages } = createRuntimeHarness(topDownPhaserTemplate);

    runScriptInContext(runtimeSource, context);

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: {
            mechanicId: "mechanic_player_movement",
            mechanicType: "player_movement",
            message:
              'Mechanic mechanic_player_movement install failed: Missing runtime installer "install_player_movement".',
            phase: "install",
            recoverable: true,
            severity: "warning",
            type: "mechanic-disabled",
          },
          message:
            'Mechanic mechanic_player_movement install failed: Missing runtime installer "install_player_movement".',
          type: "game-error",
        }),
        expect.objectContaining({
          type: "game-ready",
        }),
      ])
    );
  });

  it("loads an externally hosted generated mechanic before ready and contains update failure through disposal", async () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const generatedMechanic = {
      id: "mechanic_generated_drift",
      type: "generated_drift",
      entityIds: ["entity_player"],
      config: { speed: 12 },
    };
    const generatedTemplate = {
      ...topDownPhaserTemplate,
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        mechanics: [
          ...topDownPhaserTemplate.gameSpec.mechanics,
          generatedMechanic,
        ],
      },
    };
    const { context, dispatchWindowEvent, messages, runUpdate } =
      createRuntimeHarness(generatedTemplate);
    let finishInstall:
      | ((session: {
          identity: Record<string, unknown>;
          advanceSimulation: (milliseconds: number) => Promise<void>;
          dispatchLogicalAction: (actionId: string) => Promise<void>;
          dispose: () => Promise<void>;
        }) => void)
      | undefined;
    const advanceSimulation = vi.fn(async () => undefined);
    const dispatchLogicalAction = vi.fn(async () => undefined);
    const dispose = vi.fn(async () => undefined);
    const install = vi.fn(
      () =>
        new Promise<{
          identity: Record<string, unknown>;
          advanceSimulation: (milliseconds: number) => Promise<void>;
          dispatchLogicalAction: (actionId: string) => Promise<void>;
          dispose: () => Promise<void>;
        }>((resolve) => {
          finishInstall = resolve;
        })
    );
    Object.assign(context.globalThis, {
      __AICADE_GENERATED_MECHANIC_HOST__: {
        mechanicId: generatedMechanic.id,
        install,
      },
    });

    runTopDownRuntime(runtimeSource, context, generatedTemplate);

    expect(install).toHaveBeenCalledWith(
      expect.objectContaining({
        gameSpec: generatedTemplate.gameSpec,
        mechanic: generatedMechanic,
        template: generatedTemplate,
        createOwnedObject: expect.any(Function),
        getEntityDefinition: expect.any(Function),
        getEntityHandle: expect.any(Function),
      })
    );
    const installInput = install.mock.calls[0]?.[0] as
      | {
          createOwnedObject(input: {
            objectId: string;
            objectKind: string;
            initial: Record<string, unknown>;
          }): {
            object: {
              body?: { velocity?: { x: number; y: number } };
              destroy?: () => void;
              x: number;
              y: number;
            };
            observeProperties?: () => Record<string, unknown>;
          };
        }
      | undefined;
    if (!installInput) {
      throw new Error("Expected one generated host install input.");
    }
    const owned = installInput.createOwnedObject({
      objectId: "owned_effect_1",
      objectKind: "effect",
      initial: {
        position: { x: 24, y: 32 },
        velocity: { x: 80, y: 0 },
        shape: "circle",
        radius: 6,
        color: 0xffcc44,
        properties: { strength: 2 },
      },
    });
    expect(owned.object).toMatchObject({
      kind: "circle",
      x: 24,
      y: 32,
      body: { velocity: { x: 80, y: 0 } },
    });
    expect(owned.observeProperties?.()).toEqual({ strength: 2 });
    expect(owned.object.destroy).toEqual(expect.any(Function));
    const boundedOwned = installInput.createOwnedObject({
      objectId: "owned_effect_bounded",
      objectKind: "effect",
      initial: {
        active: false,
        position: { x: 2_000_000, y: -2_000_000 },
        velocity: { x: 3_000, y: -3_000 },
      },
    });
    expect(boundedOwned.object).toMatchObject({
      active: true,
      x: 1_000_000,
      y: -1_000_000,
      body: { velocity: { x: 2_000, y: -2_000 } },
    });
    expect(messages).not.toContainEqual(
      expect.objectContaining({ type: "game-ready" })
    );
    expect(messages).not.toContainEqual(
      expect.objectContaining({
        issue: expect.objectContaining({
          mechanicId: generatedMechanic.id,
        }),
      })
    );

    const identity = {
      artifactId: "extension_generated_drift_v1",
      sourceArtifactId: "source_generated_drift_v1",
    };
    finishInstall?.({
      identity,
      advanceSimulation,
      dispatchLogicalAction,
      dispose,
    });
    await vi.waitFor(() => {
      expect(messages.length).toBeGreaterThan(0);
    });

    const readyMessage = messages.find(({ type }) => type === "game-ready");
    expect(
      readyMessage
        ? JSON.parse(JSON.stringify(readyMessage))
        : readyMessage
    ).toMatchObject({
      type: "game-ready",
      manifest: { generatedMechanic: identity },
    });
    runUpdate();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(advanceSimulation).toHaveBeenCalledWith(16);

    dispatchWindowEvent("keydown", {
      isTrusted: true,
      key: "ArrowRight",
      repeat: false,
    });
    await vi.waitFor(() => {
      expect(dispatchLogicalAction).toHaveBeenCalledWith("move");
    });
    dispatchWindowEvent("keydown", {
      isTrusted: false,
      key: "ArrowLeft",
      repeat: false,
    });
    dispatchWindowEvent("keydown", {
      isTrusted: true,
      key: "ArrowLeft",
      repeat: true,
    });
    expect(dispatchLogicalAction).toHaveBeenCalledTimes(1);

    advanceSimulation.mockRejectedValueOnce(new Error("Generated tick failed"));
    runUpdate();
    await vi.waitFor(() => {
      expect(messages).toContainEqual(
        expect.objectContaining({
          message: "Generated mechanic update failed: Generated tick failed",
          type: "game-error",
        })
      );
    });
    expect(dispose).toHaveBeenCalledTimes(1);

    dispatchWindowEvent("beforeunload");
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("dispatches a trusted Game Spec control action without a fixed-step update", async () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const generatedMechanic = {
      id: "mechanic_generated_action",
      type: "generated_action",
      entityIds: ["entity_player"],
      config: {},
    };
    const generatedTemplate = {
      ...topDownPhaserTemplate,
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        mechanics: [
          ...topDownPhaserTemplate.gameSpec.mechanics,
          generatedMechanic,
        ],
      },
    };
    const { context, dispatchWindowEvent, messages } =
      createRuntimeHarness(generatedTemplate);
    const advanceSimulation = vi.fn(async () => undefined);
    const dispatchLogicalAction = vi.fn(async () => undefined);
    Object.assign(context.globalThis, {
      __AICADE_GENERATED_MECHANIC_HOST__: {
        mechanicId: generatedMechanic.id,
        install: vi.fn(async () => ({
          identity: { artifactId: "extension_generated_action_v1" },
          advanceSimulation,
          dispatchLogicalAction,
          dispose: vi.fn(async () => undefined),
        })),
      },
    });

    runTopDownRuntime(runtimeSource, context, generatedTemplate);
    await vi.waitFor(() => {
      expect(messages).toContainEqual(
        expect.objectContaining({ type: "game-ready" })
      );
    });

    dispatchWindowEvent("keydown", {
      isTrusted: true,
      key: "ArrowRight",
      repeat: false,
    });

    await vi.waitFor(() => {
      expect(dispatchLogicalAction).toHaveBeenCalledWith("move");
    });
    expect(advanceSimulation).not.toHaveBeenCalled();
  });

  it("serializes generated updates and accumulates elapsed time behind a fixed catch-up cap", async () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const generatedMechanic = {
      id: "mechanic_generated_clock",
      type: "generated_clock",
      entityIds: ["entity_player"],
      config: {},
    };
    const generatedTemplate = {
      ...topDownPhaserTemplate,
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        mechanics: [
          ...topDownPhaserTemplate.gameSpec.mechanics,
          generatedMechanic,
        ],
      },
    };
    const { context, dispatchWindowEvent, messages, runUpdate } =
      createRuntimeHarness(generatedTemplate);
    const finishAdvances: Array<() => void> = [];
    let activeAdvances = 0;
    let maximumConcurrentAdvances = 0;
    const advanceSimulation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          activeAdvances += 1;
          maximumConcurrentAdvances = Math.max(
            maximumConcurrentAdvances,
            activeAdvances
          );
          finishAdvances.push(() => {
            activeAdvances -= 1;
            resolve();
          });
        })
    );
    const dispose = vi.fn(async () => undefined);
    Object.assign(context.globalThis, {
      __AICADE_GENERATED_MECHANIC_HOST__: {
        mechanicId: generatedMechanic.id,
        install: () => ({
          identity: {
            artifactId: "extension_generated_clock_v1",
            sourceArtifactId: "source_generated_clock_v1",
          },
          advanceSimulation,
          dispatchLogicalAction: vi.fn(async () => undefined),
          dispose,
        }),
      },
    });

    runTopDownRuntime(runtimeSource, context, generatedTemplate);
    await vi.waitFor(() => {
      expect(messages).toContainEqual(
        expect.objectContaining({ type: "game-ready" })
      );
    });

    runUpdate(11.75);
    expect(advanceSimulation).toHaveBeenCalledTimes(1);
    expect(advanceSimulation).toHaveBeenLastCalledWith(11);

    runUpdate(0);
    expect(advanceSimulation).toHaveBeenCalledTimes(1);

    runUpdate(13);
    runUpdate(17);
    runUpdate(19);
    expect(advanceSimulation).toHaveBeenCalledTimes(1);

    finishAdvances.shift()?.();
    await vi.waitFor(() => {
      expect(advanceSimulation).toHaveBeenCalledTimes(2);
    });
    expect(advanceSimulation).toHaveBeenLastCalledWith(49);
    expect(maximumConcurrentAdvances).toBe(1);

    for (let frame = 0; frame < 10; frame += 1) {
      runUpdate(15 + frame);
    }
    expect(advanceSimulation).toHaveBeenCalledTimes(2);

    finishAdvances.shift()?.();
    await vi.waitFor(() => {
      expect(advanceSimulation).toHaveBeenCalledTimes(3);
    });
    expect(advanceSimulation).toHaveBeenLastCalledWith(128);
    expect(maximumConcurrentAdvances).toBe(1);

    finishAdvances.shift()?.();
    dispatchWindowEvent("beforeunload");
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledTimes(1);
    });
  });

  it("asks the generated host to tear down when the frame unloads during installation", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const generatedMechanic = {
      id: "mechanic_generated_pending",
      type: "generated_pending",
      entityIds: ["entity_player"],
      config: {},
    };
    const generatedTemplate = {
      ...topDownPhaserTemplate,
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        mechanics: [
          ...topDownPhaserTemplate.gameSpec.mechanics,
          generatedMechanic,
        ],
      },
    };
    const { context, dispatchWindowEvent } =
      createRuntimeHarness(generatedTemplate);
    const disposeHost = vi.fn();
    Object.assign(context.globalThis, {
      __AICADE_GENERATED_MECHANIC_HOST__: {
        mechanicId: generatedMechanic.id,
        install: () => new Promise(() => undefined),
        dispose: disposeHost,
      },
    });

    runTopDownRuntime(runtimeSource, context, generatedTemplate);
    dispatchWindowEvent("beforeunload");

    expect(disposeHost).toHaveBeenCalledTimes(1);
  });

  it("reports mechanic update failures without throwing out of the frame loop", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const { context, messages, runUpdate } = createRuntimeHarness(
      topDownPhaserTemplate,
      { right: true },
      { throwOnSetVelocity: true }
    );

    runTopDownRuntime(runtimeSource, context);

    expect(() => runUpdate()).not.toThrow();
    expect(messages).toContainEqual(
      expect.objectContaining({
        issue: {
          mechanicId: "mechanic_player_movement",
          mechanicType: "player_movement",
          message:
            "Mechanic mechanic_player_movement update failed: Velocity update failed",
          phase: "update",
          recoverable: true,
          severity: "warning",
          type: "mechanic-disabled",
        },
        message:
          "Mechanic mechanic_player_movement update failed: Velocity update failed",
        type: "game-error",
      })
    );
  });

  it("reports mechanic dispose failures without interrupting teardown", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const disposedTypes: string[] = [];
    const { context, dispatchWindowEvent, messages } =
      createRuntimeHarness(topDownPhaserTemplate);

    Object.assign(context.globalThis, {
      __AICADE_TOP_DOWN_MECHANICS__: {
        install_enemy_chase() {
          return {
            dispose() {
              disposedTypes.push("enemy_chase");
            },
          };
        },
        install_hazard_contact() {
          return {
            dispose() {
              disposedTypes.push("hazard_contact");
            },
          };
        },
        install_pickup_collection() {
          return {
            dispose() {
              disposedTypes.push("pickup_collection");
            },
          };
        },
        install_player_movement() {
          return {
            dispose() {
              disposedTypes.push("player_movement");
              throw new Error("Dispose failed");
            },
          };
        },
      },
    });

    runScriptInContext(runtimeSource, context);

    expect(() => dispatchWindowEvent("beforeunload")).not.toThrow();
    expect(disposedTypes).toEqual([
      "player_movement",
      "pickup_collection",
      "enemy_chase",
      "hazard_contact",
    ]);
    expect(messages).toContainEqual(
      expect.objectContaining({
        issue: {
          mechanicId: "mechanic_player_movement",
          mechanicType: "player_movement",
          message:
            "Mechanic mechanic_player_movement dispose failed: Dispose failed",
          phase: "dispose",
          recoverable: true,
          severity: "warning",
          type: "mechanic-disabled",
        },
        message:
          "Mechanic mechanic_player_movement dispose failed: Dispose failed",
        type: "game-error",
      })
    );
  });

  it("points to an authored Phaser runtime script with protocol and gameplay hooks", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const playerMovementSource = loadPublicRuntimeSource(
      "/runtime/phaser/mechanics/player-movement.js"
    );
    const pickupCollectionSource = loadPublicRuntimeSource(
      "/runtime/phaser/mechanics/pickup-collection.js"
    );
    const enemyChaseSource = loadPublicRuntimeSource(
      "/runtime/phaser/mechanics/enemy-chase.js"
    );
    const hazardContactSource = loadPublicRuntimeSource(
      "/runtime/phaser/mechanics/hazard-contact.js"
    );
    const mechanicSources = [
      playerMovementSource,
      pickupCollectionSource,
      enemyChaseSource,
      hazardContactSource,
    ];

    expect(runtimeSource).toContain("new Phaser.Game");
    expect(runtimeSource).toContain('notify("game-ready"');
    expect(runtimeSource).toContain('notify("game-error"');
    expect(runtimeSource).toContain("createPlayer");
    expect(runtimeSource).toContain("createEntityHandle");
    expect(runtimeSource).toContain("createMechanicContext");
    expect(runtimeSource).toContain("findTargetByRole");
    expect(runtimeSource).toContain("getTargetIdByRole");
    expect(runtimeSource).toContain("getPrimaryId");
    expect(runtimeSource).not.toContain("function createObjective");
    expect(runtimeSource).not.toContain("function createChaser");
    expect(runtimeSource).not.toContain("function getChaseVelocity");
    expect(playerMovementSource).not.toContain("context.scene");
    expect(playerMovementSource).not.toContain("context.Phaser");
    expect(playerMovementSource).toContain("cursors.left.isDown");
    mechanicSources.forEach((mechanicSource) => {
      expect(mechanicSource).not.toContain("function findTargetEntityByRole");
      expect(mechanicSource).not.toContain("function getPrimaryObjectiveId");
    });
  });

  it("reads title, objective, and entity placement from Game Spec input", () => {
    const runtimeSource = loadTopDownRuntimeSource();

    expect(runtimeSource).toContain("template.gameSpec");
    expect(runtimeSource).toContain("const gameSpec");
    expect(runtimeSource).toContain("const primaryObjective");
    expect(runtimeSource).toContain("function findEntityByRole(role)");
    expect(runtimeSource).toContain("function findZoneForEntity(entityId)");
    expect(runtimeSource).toContain("function getZoneCenter(zone, fallback)");
    expect(runtimeSource).toContain("gameSpec.title");
    expect(runtimeSource).not.toContain('add.text(40, 24, "Top-Down Chase"');
    expect(runtimeSource).not.toContain("player.setPosition(160, 270)");
    expect(runtimeSource).not.toContain("chaser.setPosition(780, 405)");
  });

  it("consumes deterministic layout primitives from the top-down spec", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const enemyChaseSource = loadPublicRuntimeSource(
      "/runtime/phaser/mechanics/enemy-chase.js"
    );
    const pickupCollectionSource = loadPublicRuntimeSource(
      "/runtime/phaser/mechanics/pickup-collection.js"
    );

    expect(runtimeSource).toContain("function createWall(scene, wall)");
    expect(runtimeSource).toContain("function createObstacle(scene, obstacle)");
    expect(runtimeSource).toContain("function createLayoutBodies(scene)");
    expect(runtimeSource).toContain("layout.walls");
    expect(runtimeSource).toContain("layout.obstacles");
    expect(runtimeSource).toContain('obstacle.shape === "circle"');
    expect(runtimeSource).toContain("scene.physics.add.existing(wallBody, true)");
    expect(runtimeSource).toContain("this.physics.add.collider(player, body)");
    expect(enemyChaseSource).toContain("context.physics.addCollider(enemy, body)");
    expect(enemyChaseSource).toContain("context.layout.isPathBlocked");
    expect(enemyChaseSource).toContain("context.layout.isPointBlocked");
    expect(enemyChaseSource).not.toContain("context.scene");
    expect(enemyChaseSource).not.toContain("context.Phaser");
    expect(pickupCollectionSource).not.toContain("context.scene");
    expect(pickupCollectionSource).not.toContain("context.Phaser");
  });

  it("keeps the authored runtime bootable without hidden pickup behavior when optional spec pieces are missing", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const { context, gameElements, messages, textLabels } =
      createRuntimeHarness({});

    runTopDownRuntime(runtimeSource, context);

    expect(messages).toContainEqual({
      manifest: {
        runtime: "phaser",
        title: "Top-Down Chase",
      },
      type: "game-ready",
      viewport: {
        height: 540,
        scaling: "stretch_to_fill",
        width: 960,
      },
    });
    expect(textLabels).toContain("Top-Down Chase");
    expect(textLabels).toContain("Collect crystals: 0");
    expect(gameElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "rectangle", x: 160, y: 270 }),
      ])
    );
    expect(gameElements.some((element) => element.kind === "star")).toBe(false);
  });

  it("emits first-playable runtime evidence from the host validation command", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const { context, dispatchWindowEvent, messages } = createRuntimeHarness(
      topDownPhaserTemplate
    );

    runTopDownRuntime(runtimeSource, context);
    dispatchWindowEvent("message", {
      data: { type: "game-run-first-playable-checks" },
    });

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "game-validation-evidence",
          data: expect.objectContaining({
            checkId: "nonblank_render",
            status: "passed",
            evidence: expect.objectContaining({
              renderedObjectCount: expect.any(Number),
            }),
          }),
        }),
        expect.objectContaining({
          type: "game-validation-evidence",
          data: expect.objectContaining({
            checkId: "player_visible",
            status: "passed",
            evidence: expect.objectContaining({
              hasBody: true,
              playerPosition: { x: 156, y: expect.any(Number) },
            }),
          }),
        }),
        expect.objectContaining({
          type: "game-validation-evidence",
          data: expect.objectContaining({
            checkId: "input_response",
            status: "passed",
            evidence: expect.objectContaining({
              inputAction: "move_right",
              playerVelocity: { x: 220, y: 0 },
            }),
          }),
        }),
      ])
    );
  });

  it("dispatches the generated logical action during first-playable input validation", async () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const generatedMechanic = {
      id: "mechanic_generated_first_playable",
      type: "generated_mechanic",
      entityIds: ["entity_player"],
      config: {},
    };
    const generatedTemplate = {
      ...topDownPhaserTemplate,
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        mechanics: [
          ...topDownPhaserTemplate.gameSpec.mechanics,
          generatedMechanic,
        ],
      },
    };
    const { context, dispatchWindowEvent, messages } =
      createRuntimeHarness(generatedTemplate);
    const dispatchLogicalAction = vi.fn(async () => undefined);
    Object.assign(context.globalThis, {
      __AICADE_GENERATED_MECHANIC_HOST__: {
        mechanicId: generatedMechanic.id,
        install: vi.fn(async () => ({
          identity: { artifactId: "extension_generated_first_playable_v1" },
          advanceSimulation: vi.fn(async () => undefined),
          dispatchLogicalAction,
          dispose: vi.fn(async () => undefined),
        })),
      },
    });

    runTopDownRuntime(runtimeSource, context, generatedTemplate);
    await vi.waitFor(() => {
      expect(messages).toContainEqual(
        expect.objectContaining({ type: "game-ready" })
      );
    });

    dispatchWindowEvent("message", {
      data: {
        type: "game-run-first-playable-checks",
        actionId: "move",
      },
    });

    await vi.waitFor(() => {
      expect(dispatchLogicalAction).toHaveBeenCalledWith("move");
    });
    await vi.waitFor(() => {
      const inputEvidence = messages.find(
        (message) =>
          message.type === "game-validation-evidence" &&
          message.data?.checkId === "input_response"
      );
      expect(
        inputEvidence
          ? JSON.parse(JSON.stringify(inputEvidence))
          : inputEvidence
      ).toMatchObject({
        type: "game-validation-evidence",
        data: {
          checkId: "input_response",
          status: "passed",
          evidence: {
            generatedActionId: "move",
            generatedActionDispatched: true,
          },
        },
      });
    });
  });

  it("emits structured generated-action evidence before containing its fatal failure", async () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const generatedMechanic = {
      id: "mechanic_generated_failing_first_playable",
      type: "generated_mechanic",
      entityIds: ["entity_player"],
      config: {},
    };
    const generatedTemplate = {
      ...topDownPhaserTemplate,
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        mechanics: [
          ...topDownPhaserTemplate.gameSpec.mechanics,
          generatedMechanic,
        ],
      },
    };
    const { context, dispatchWindowEvent, messages } =
      createRuntimeHarness(generatedTemplate);
    Object.assign(context.globalThis, {
      __AICADE_GENERATED_MECHANIC_HOST__: {
        mechanicId: generatedMechanic.id,
        install: vi.fn(async () => ({
          identity: { artifactId: "extension_generated_failure_v1" },
          advanceSimulation: vi.fn(async () => undefined),
          dispatchLogicalAction: vi.fn(async () => {
            throw new Error(
              'Mechanic private state "dash_ends_at" requires an integer value.'
            );
          }),
          dispose: vi.fn(async () => undefined),
        })),
      },
    });

    runTopDownRuntime(runtimeSource, context, generatedTemplate);
    await vi.waitFor(() => {
      expect(messages).toContainEqual(
        expect.objectContaining({ type: "game-ready" })
      );
    });
    dispatchWindowEvent("message", {
      data: {
        type: "game-run-first-playable-checks",
        actionId: "move",
      },
    });

    await vi.waitFor(() => {
      expect(
        messages.some(
          (message) =>
            message.type === "game-validation-evidence" &&
            message.data?.checkId === "input_response" &&
            message.data?.status === "failed"
        )
      ).toBe(true);
      expect(messages.some((message) => message.type === "game-error")).toBe(
        true
      );
    });
    const failedEvidenceIndex = messages.findIndex(
      (message) =>
        message.type === "game-validation-evidence" &&
        message.data?.checkId === "input_response" &&
        message.data?.status === "failed"
    );
    const fatalErrorIndex = messages.findIndex(
      (message) => message.type === "game-error"
    );
    expect(failedEvidenceIndex).toBeGreaterThanOrEqual(0);
    expect(fatalErrorIndex).toBeGreaterThan(failedEvidenceIndex);
    expect(messages[failedEvidenceIndex]).toMatchObject({
      data: {
        issues: [
          {
            code: "generated_action_probe_failed",
            path: "runtime.generatedMechanic.action",
            message:
              'Mechanic private state "dash_ends_at" requires an integer value.',
          },
        ],
      },
    });
  });

  it("fails input-response runtime evidence when movement is not installed", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const templateWithoutMovement = {
      ...topDownPhaserTemplate,
      gameSpec: {
        ...topDownPhaserTemplate.gameSpec,
        mechanics: topDownPhaserTemplate.gameSpec.mechanics.filter(
          (mechanic) => mechanic.type !== "player_movement"
        ),
      },
    };
    const { context, dispatchWindowEvent, messages } = createRuntimeHarness(
      templateWithoutMovement
    );

    runTopDownRuntime(runtimeSource, context, templateWithoutMovement);
    dispatchWindowEvent("message", {
      data: { type: "game-run-first-playable-checks" },
    });

    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "game-validation-evidence",
        data: expect.objectContaining({
          checkId: "input_response",
          status: "failed",
          issues: [
            {
              code: "input_probe_no_velocity",
              path: "runtime.input",
              message:
                "Expected player velocity to change during the movement probe.",
            },
          ],
        }),
      })
    );
  });

  it("handles the shared host command protocol", () => {
    const runtimeSource = loadTopDownRuntimeSource();

    expect(runtimeSource).toContain('window.addEventListener("message"');
    expect(runtimeSource).toContain('command.type === "game-reload"');
    expect(runtimeSource).toContain('command.type === "game-focus"');
    expect(runtimeSource).toContain('command.type === "game-pause"');
    expect(runtimeSource).toContain('command.type === "game-resize"');
    expect(runtimeSource).toContain(
      'command.type === "game-run-first-playable-checks"'
    );
    expect(runtimeSource).toContain("function setPaused(nextIsPaused)");
    expect(runtimeSource).toContain("function applyHostViewport(nextViewport)");
    expect(runtimeSource).toContain(
      "function runFirstPlayableChecks(generatedActionId)"
    );
    expect(runtimeSource).toContain("game.scene.pause");
    expect(runtimeSource).toContain("game.scene.resume");
    expect(runtimeSource).toContain("game.scale.resize");
  });

  it("routes generated-shell commands through the trusted command authorizer", () => {
    const runtimeSource = loadTopDownRuntimeSource();
    const { context, dispatchWindowEvent } = createRuntimeHarness(
      topDownPhaserTemplate
    );
    const reload = vi.fn();
    context.location.reload = reload;
    const authorize = vi.fn(() => null as { type: string } | null);
    Object.assign(context.globalThis, {
      __AICADE_RUNTIME_AUTHORIZE_COMMAND__: authorize,
    });
    runTopDownRuntime(runtimeSource, context);

    dispatchWindowEvent("message", { data: { type: "game-reload" } });
    expect(reload).not.toHaveBeenCalled();

    authorize.mockReturnValue({ type: "game-reload" });
    dispatchWindowEvent("message", { data: { wrapped: true } });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
