import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import {
  topDownPhaserTemplate,
  type HandAuthoredPhaserTemplate,
} from "../top-down-template";

export type PostedMessage = {
  data?: unknown;
  manifest?: {
    title?: string;
  };
  type: string;
  viewport?: {
    height: number;
    width: number;
  };
};

export type GameElement = {
  body?: {
    setAllowGravity: () => void;
    setCollideWorldBounds: () => void;
    setVelocity: (x: number, y: number) => void;
    velocity: { x: number; y: number };
    velocityCalls: Array<{ x: number; y: number }>;
  };
  kind: string;
  setPosition?: (x: number, y: number) => void;
  setStrokeStyle?: () => GameElement;
  x: number;
  y: number;
};

export type RuntimeHarnessContext = {
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
      listener: (event?: RuntimeHarnessWindowEvent) => void
    ) => void;
  };
};

export type RuntimeHarnessWindowEvent = {
  data?: unknown;
  isTrusted?: boolean;
  key?: string;
  repeat?: boolean;
};

export type RuntimeCursorState = Partial<
  Record<"down" | "left" | "right" | "up", boolean>
>;

export type RuntimeHarnessOptions = {
  throwOnCreateCursorKeys?: boolean;
  throwOnSetVelocity?: boolean;
};

export function createTemplateWithSceneLayout(
  layout: typeof topDownPhaserTemplate.gameSpec.template.config.scenes[0]["layout"]
): HandAuthoredPhaserTemplate {
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

export function createRuntimeHarness(
  template: unknown,
  cursorState: RuntimeCursorState = {},
  options: RuntimeHarnessOptions = {}
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
    Array<(event?: RuntimeHarnessWindowEvent) => void>
  > = {};
  let sceneConfig: {
    create: () => void;
    update?: (time: number, delta: number) => void;
  } | null = null;

  const createBody = () => {
    const body = {
      velocity: { x: 0, y: 0 },
      velocityCalls: [] as Array<{ x: number; y: number }>,
      setAllowGravity() {},
      setCollideWorldBounds() {},
      setVelocity(x: number, y: number) {
        if (options.throwOnSetVelocity) {
          throw new Error("Velocity update failed");
        }

        body.velocity = { x, y };
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
      addEventListener(
        type: string,
        listener: (event?: RuntimeHarnessWindowEvent) => void
      ) {
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
    dispatchWindowEvent(type: string, event?: RuntimeHarnessWindowEvent) {
      windowEventListeners[type]?.forEach((listener) => listener(event));
    },
    runUpdate(delta = 16) {
      sceneConfig?.update?.call(scene, 0, delta);
    },
    textLabels,
  };
}

export function loadPublicRuntimeSource(scriptPath: string): string {
  return readFileSync(join(process.cwd(), "public", scriptPath), "utf8");
}

export function loadTopDownRuntimeSource(
  template = topDownPhaserTemplate
): string {
  return loadPublicRuntimeSource(template.runtimeScriptPath);
}

export function runScriptInContext(runtimeSource: string, context: object) {
  runInNewContext(runtimeSource, context);
}

export function runTopDownRuntime(
  runtimeSource: string,
  context: object,
  template = topDownPhaserTemplate
) {
  template.runtimeDependencyScriptPaths.forEach((scriptPath) => {
    runScriptInContext(loadPublicRuntimeSource(scriptPath), context);
  });
  runScriptInContext(runtimeSource, context);
}
