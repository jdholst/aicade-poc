import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getTopDownMechanicDefinition, validateTopDownGameSpec } from "@/game-spec";

import {
  createTopDownPhaserTemplate,
  getTopDownPhaserTemplateState,
  TOP_DOWN_MECHANIC_CONTEXT_SERVICE_KEYS,
  topDownPhaserTemplate,
} from ".";
import type { TopDownMechanicInstaller } from "./top-down-mechanic-runtime";

type PostedMessage = {
  manifest?: {
    title?: string;
  };
  type: string;
  viewport?: {
    height: number;
    width: number;
  };
};

type GameElement = {
  body?: {
    setAllowGravity: () => void;
    setCollideWorldBounds: () => void;
    setVelocity: (x: number, y: number) => void;
    velocityCalls: Array<{ x: number; y: number }>;
  };
  kind: string;
  setPosition?: (x: number, y: number) => void;
  setStrokeStyle?: () => GameElement;
  x: number;
  y: number;
};

type RuntimeHarnessContext = {
  Phaser: Record<string, unknown>;
  globalThis: {
    __AICADE_PHASER_TEMPLATE__: unknown;
    Phaser: unknown;
    __AICADE_TOP_DOWN_MECHANICS__?: Record<string, unknown>;
  };
  location: { reload: () => void };
  parent: { postMessage: (message: PostedMessage) => void };
  window: {
    addEventListener: (
      type: string,
      listener: (event?: { data?: unknown }) => void
    ) => void;
  };
};

function createTemplateWithSceneLayout(
  layout: typeof topDownPhaserTemplate.gameSpec.template.config.scenes[0]["layout"]
) {
  const scene = topDownPhaserTemplate.gameSpec.template.config.scenes[0];

  return {
    ...topDownPhaserTemplate,
    gameSpec: {
      ...topDownPhaserTemplate.gameSpec,
      template: {
        ...topDownPhaserTemplate.gameSpec.template,
        config: {
          scenes: [
            {
              ...scene,
              layout,
            },
          ],
        },
      },
    },
  };
}

function createRuntimeHarness(
  template: unknown,
  cursorState: Partial<Record<"down" | "left" | "right" | "up", boolean>> = {},
  options: {
    throwOnCreateCursorKeys?: boolean;
    throwOnSetVelocity?: boolean;
  } = {}
) {
  const messages: PostedMessage[] = [];
  const textLabels: string[] = [];
  const gameElements: GameElement[] = [];
  const moveToObjectCalls: Array<{ speed: number }> = [];
  const overlapCalls: Array<{
    first: GameElement;
    handler?: () => void;
    second: GameElement;
  }> = [];
  const windowEventListeners: Record<
    string,
    Array<(event?: { data?: unknown }) => void>
  > = {};
  let sceneConfig: { create: () => void; update?: () => void } | null = null;

  const createBody = () => {
    const body = {
      velocityCalls: [] as Array<{ x: number; y: number }>,
      setAllowGravity() {},
      setCollideWorldBounds() {},
      setVelocity(x: number, y: number) {
        if (options.throwOnSetVelocity) {
          throw new Error("Velocity update failed");
        }

        body.velocityCalls.push({ x, y });
      },
    };

    return body;
  };

  const attachBody = (element: GameElement) => {
    element.body = createBody();
  };

  const scene = {
    add: {
      circle(x: number, y: number) {
        const element: GameElement = {
          kind: "circle",
          setPosition(nextX: number, nextY: number) {
            element.x = nextX;
            element.y = nextY;
          },
          x,
          y,
        };
        gameElements.push(element);
        return element;
      },
      rectangle(x: number, y: number) {
        const element: GameElement = {
          kind: "rectangle",
          setPosition(nextX: number, nextY: number) {
            element.x = nextX;
            element.y = nextY;
          },
          setStrokeStyle() {
            return element;
          },
          x,
          y,
        };
        gameElements.push(element);
        return element;
      },
      star(x: number, y: number) {
        const element: GameElement = {
          kind: "star",
          setPosition(nextX: number, nextY: number) {
            element.x = nextX;
            element.y = nextY;
          },
          x,
          y,
        };
        gameElements.push(element);
        return element;
      },
      text(_x: number, _y: number, label: string) {
        textLabels.push(label);
        return {
          setText(nextLabel: string) {
            textLabels.push(nextLabel);
          },
        };
      },
    },
    cameras: {
      main: {
        setBackgroundColor() {},
        setSize() {},
      },
    },
    input: {
      keyboard: {
        createCursorKeys() {
          if (options.throwOnCreateCursorKeys) {
            throw new Error("Keyboard setup failed");
          }

          return {
            down: { isDown: cursorState.down ?? false },
            left: { isDown: cursorState.left ?? false },
            right: { isDown: cursorState.right ?? false },
            up: { isDown: cursorState.up ?? false },
          };
        },
      },
    },
    physics: {
      add: {
        collider() {},
        existing(element: GameElement) {
          attachBody(element);
        },
        overlap(first: GameElement, second: GameElement, handler?: () => void) {
          overlapCalls.push({ first, handler, second });
        },
      },
      moveToObject(_from: GameElement, _to: GameElement, speed: number) {
        moveToObjectCalls.push({ speed });
      },
      world: {
        setBounds() {},
      },
    },
  };

  const phaser = {
    AUTO: "AUTO",
    Game: class FakeGame {
      scale = {
        resize() {},
      };
      scene = {
        pause() {},
        resume() {},
      };

      constructor(config: { scene: { create: () => void; update?: () => void } }) {
        sceneConfig = config.scene;
        sceneConfig.create.call(scene);
      }

      destroy() {}
    },
    Math: {
      Between(min: number) {
        return min;
      },
      Vector2: class FakeVector2 {
        x: number;
        y: number;

        constructor(x: number, y: number) {
          this.x = x;
          this.y = y;
        }

        normalize() {
          return this;
        }

        scale(nextScale: number) {
          this.x *= nextScale;
          this.y *= nextScale;
          return this;
        }
      },
    },
  };

  const context: RuntimeHarnessContext = {
    Phaser: phaser,
    globalThis: {
      __AICADE_PHASER_TEMPLATE__: template,
      Phaser: phaser,
    },
    location: {
      reload() {},
    },
    parent: {
      postMessage(message: PostedMessage) {
        messages.push(message);
      },
    },
    window: {
      addEventListener(type: string, listener: (event?: { data?: unknown }) => void) {
        windowEventListeners[type] = windowEventListeners[type] || [];
        windowEventListeners[type].push(listener);
      },
    },
  };

  return {
    context,
    gameElements,
    moveToObjectCalls,
    overlapCalls,
    messages,
    dispatchWindowEvent(type: string, event?: { data?: unknown }) {
      windowEventListeners[type]?.forEach((listener) => listener(event));
    },
    runUpdate() {
      sceneConfig?.update?.call(scene);
    },
    textLabels,
  };
}

function runTopDownRuntime(
  runtimeSource: string,
  context: object,
  template = topDownPhaserTemplate
) {
  template.runtimeDependencyScriptPaths.forEach((scriptPath) => {
    runInNewContext(
      readFileSync(join(process.cwd(), "public", scriptPath), "utf8"),
      context
    );
  });
  runInNewContext(runtimeSource, context);
}

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

  it("reports invalid fixture state without crashing module import", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_USE_INVALID_GAME_SPEC", "1");

    expect(getTopDownPhaserTemplateState()).toMatchObject({
      message:
        "Game Spec validation failed: objectives: Expected exactly one primary objective.",
      status: "invalid",
    });
  });

  it("returns a stable valid template state for mounted runtime renders", () => {
    expect(getTopDownPhaserTemplateState()).toBe(getTopDownPhaserTemplateState());
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

  it("installs active mechanics through the external runtime mechanic registry", () => {
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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

    runInNewContext(runtimeSource, context);

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

  it("registers built-in installers from runtime dependency scripts", () => {
    const context: {
      globalThis: {
        __AICADE_TOP_DOWN_MECHANICS__?: Record<string, unknown>;
      };
    } = {
      globalThis: {},
    };

    topDownPhaserTemplate.runtimeDependencyScriptPaths.forEach((scriptPath) => {
      runInNewContext(
        readFileSync(join(process.cwd(), "public", scriptPath), "utf8"),
        context
      );
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

      expect(services).toHaveLength(7);

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
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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

  it("does not apply player movement when the player_movement mechanic is omitted", () => {
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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

  it("steers the enemy around blocking obstacles instead of chasing directly into them", () => {
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
    const { context, messages } = createRuntimeHarness(topDownPhaserTemplate);

    runInNewContext(runtimeSource, context);

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

  it("reports mechanic update failures without throwing out of the frame loop", () => {
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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

    runInNewContext(runtimeSource, context);

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
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
    const playerMovementSource = readFileSync(
      join(
        process.cwd(),
        "public",
        "/runtime/phaser/mechanics/player-movement.js"
      ),
      "utf8"
    );

    expect(runtimeSource).toContain("new Phaser.Game");
    expect(runtimeSource).toContain('notify("game-ready"');
    expect(runtimeSource).toContain('notify("game-error"');
    expect(runtimeSource).toContain("createPlayer");
    expect(runtimeSource).toContain("createEntityHandle");
    expect(runtimeSource).toContain("createMechanicContext");
    expect(runtimeSource).not.toContain("function createObjective");
    expect(runtimeSource).not.toContain("function createChaser");
    expect(runtimeSource).not.toContain("function getChaseVelocity");
    expect(playerMovementSource).not.toContain("context.scene");
    expect(playerMovementSource).not.toContain("context.Phaser");
    expect(playerMovementSource).toContain("cursors.left.isDown");
  });

  it("reads title, objective, and entity placement from Game Spec input", () => {
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );

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
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
    const enemyChaseSource = readFileSync(
      join(process.cwd(), "public", "/runtime/phaser/mechanics/enemy-chase.js"),
      "utf8"
    );
    const pickupCollectionSource = readFileSync(
      join(
        process.cwd(),
        "public",
        "/runtime/phaser/mechanics/pickup-collection.js"
      ),
      "utf8"
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
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
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

  it("handles the shared host command protocol", () => {
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );

    expect(runtimeSource).toContain('window.addEventListener("message"');
    expect(runtimeSource).toContain('event.data.type === "game-reload"');
    expect(runtimeSource).toContain('event.data.type === "game-focus"');
    expect(runtimeSource).toContain('event.data.type === "game-pause"');
    expect(runtimeSource).toContain('event.data.type === "game-resize"');
    expect(runtimeSource).toContain("function setPaused(nextIsPaused)");
    expect(runtimeSource).toContain("function applyHostViewport(nextViewport)");
    expect(runtimeSource).toContain("game.scene.pause");
    expect(runtimeSource).toContain("game.scene.resume");
    expect(runtimeSource).toContain("game.scale.resize");
  });
});
