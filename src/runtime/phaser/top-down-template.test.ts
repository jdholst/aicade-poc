import { describe, expect, it } from "vitest";

import packageJson from "../../../package.json";
import { topDownPhaserTemplate } from ".";

describe("top-down Phaser template", () => {
  it("declares Phaser as a runtime dependency", () => {
    expect(packageJson.dependencies).toMatchObject({
      phaser: "^3.90.0",
    });
  });

  it("describes a hand-authored top-down runtime template", () => {
    expect(topDownPhaserTemplate).toMatchObject({
      id: "top-down-chase-v1",
      runtime: "phaser",
      title: "Top-Down Chase",
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

  it("includes authored Phaser runtime source with protocol and gameplay hooks", () => {
    expect(topDownPhaserTemplate.runtimeSource).toContain("new Phaser.Game");
    expect(topDownPhaserTemplate.runtimeSource).toContain('notify("game-ready"');
    expect(topDownPhaserTemplate.runtimeSource).toContain('notify("game-error"');
    expect(topDownPhaserTemplate.runtimeSource).toContain("createPlayer");
    expect(topDownPhaserTemplate.runtimeSource).toContain("createObjective");
    expect(topDownPhaserTemplate.runtimeSource).toContain("createChaser");
    expect(topDownPhaserTemplate.runtimeSource).toContain("cursors.left.isDown");
  });
});
