import type { RuntimeViewport } from "@/runtime/runtime-adapter";
import type { TopDownGameSpec } from "@/game-spec";

import { topDownGameSpecFixture } from "./top-down-game-spec-fixture";

type PhaserTemplateControl = {
  action: string;
  kind: "axis" | "button" | "toggle";
  keys: string[];
  label: string;
};

export type HandAuthoredPhaserTemplate = {
  controls: PhaserTemplateControl[];
  gameSpec: TopDownGameSpec;
  id: string;
  runtime: "phaser";
  runtimeScriptPath: string;
  title: string;
  viewport: RuntimeViewport;
};

export function createTopDownPhaserTemplate(
  gameSpec: TopDownGameSpec
): HandAuthoredPhaserTemplate {
  const scene = gameSpec.template.config.scenes[0];

  return {
    id: `${gameSpec.id}-phaser-template`,
    runtime: "phaser",
    title: gameSpec.title,
    viewport: {
      width: scene.arena.width,
      height: scene.arena.height,
      scaling: "stretch_to_fill",
    },
    controls: gameSpec.controls.map(({ action, kind, keys, label }) => ({
      action,
      kind,
      keys,
      label,
    })),
    gameSpec,
    runtimeScriptPath: "/runtime/phaser/top-down-template.js",
  };
}

export const topDownPhaserTemplate =
  createTopDownPhaserTemplate(topDownGameSpecFixture);
