import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { topDownPhaserTemplate } from ".";

describe("top-down Phaser template", () => {
  it("describes a hand-authored top-down runtime template", () => {
    expect(topDownPhaserTemplate).toMatchObject({
      id: "top-down-chase-v1",
      runtime: "phaser",
      title: "Top-Down Chase",
      runtimeScriptPath: "/runtime/phaser/top-down-template.js",
      viewport: {
        width: 960,
        height: 540,
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
