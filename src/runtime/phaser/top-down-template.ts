import type { RuntimeViewport } from "@/runtime/runtime-adapter";

type PhaserTemplateControl = {
  action: string;
  kind: "axis" | "button" | "toggle";
  keys: string[];
  label: string;
};

export type HandAuthoredPhaserTemplate = {
  controls: PhaserTemplateControl[];
  id: string;
  runtime: "phaser";
  runtimeScriptPath: string;
  title: string;
  viewport: RuntimeViewport;
};

export const topDownPhaserTemplate: HandAuthoredPhaserTemplate = {
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
  runtimeScriptPath: "/runtime/phaser/top-down-template.js",
};
