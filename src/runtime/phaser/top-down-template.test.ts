import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { validateTopDownGameSpec } from "@/game-spec";

import { createTopDownPhaserTemplate, topDownPhaserTemplate } from ".";

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

function createRuntimeHarness(template: unknown) {
  const messages: PostedMessage[] = [];
  const textLabels: string[] = [];
  const gameElements: Array<{ kind: string; x: number; y: number }> = [];

  const createBody = () => ({
    setAllowGravity() {},
    setCollideWorldBounds() {},
    setVelocity() {},
  });

  const attachBody = (element: { body?: ReturnType<typeof createBody> }) => {
    element.body = createBody();
  };

  const scene = {
    add: {
      circle(x: number, y: number) {
        const element = { kind: "circle", x, y };
        gameElements.push(element);
        return element;
      },
      rectangle(x: number, y: number) {
        const element = {
          kind: "rectangle",
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
        const element = { kind: "star", x, y };
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
          return {
            down: { isDown: false },
            left: { isDown: false },
            right: { isDown: false },
            up: { isDown: false },
          };
        },
      },
    },
    physics: {
      add: {
        collider() {},
        existing(element: { body?: ReturnType<typeof createBody> }) {
          attachBody(element);
        },
        overlap() {},
      },
      moveToObject() {},
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

      constructor(config: { scene: { create: () => void } }) {
        config.scene.create.call(scene);
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

  const context = {
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
      addEventListener() {},
    },
  };

  return { context, gameElements, messages, textLabels };
}

describe("top-down Phaser template", () => {
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

  it("points to an authored Phaser runtime script with protocol and gameplay hooks", () => {
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );

    expect(runtimeSource).toContain("new Phaser.Game");
    expect(runtimeSource).toContain('notify("game-ready"');
    expect(runtimeSource).toContain('notify("game-error"');
    expect(runtimeSource).toContain("createPlayer");
    expect(runtimeSource).toContain("createObjective");
    expect(runtimeSource).toContain("createChaser");
    expect(runtimeSource).toContain("cursors.left.isDown");
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

    expect(runtimeSource).toContain("function createWall(scene, wall)");
    expect(runtimeSource).toContain("function createObstacle(scene, obstacle)");
    expect(runtimeSource).toContain("function createLayoutBodies(scene)");
    expect(runtimeSource).toContain("layout.walls");
    expect(runtimeSource).toContain("layout.obstacles");
    expect(runtimeSource).toContain('obstacle.shape === "circle"');
    expect(runtimeSource).toContain("scene.physics.add.existing(wallBody, true)");
    expect(runtimeSource).toContain("this.physics.add.collider(player, body)");
    expect(runtimeSource).toContain("this.physics.add.collider(chaser, body)");
  });

  it("keeps the authored runtime bootable with fallback values when optional spec pieces are missing", () => {
    const runtimeSource = readFileSync(
      join(process.cwd(), "public", topDownPhaserTemplate.runtimeScriptPath),
      "utf8"
    );
    const { context, gameElements, messages, textLabels } =
      createRuntimeHarness({});

    runInNewContext(runtimeSource, context);

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
        expect.objectContaining({ kind: "star", x: 780, y: 150 }),
        expect.objectContaining({ kind: "circle", x: 780, y: 405 }),
      ])
    );
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
