import { describe, expect, it } from "vitest";

import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";

import { canvasRuntimeAdapter } from "./canvas-runtime-adapter";

const pack: GeneratedGamePack = {
  project: {
    name: "Adapter Test Game",
    summary: "A tiny generated game pack for adapter tests.",
  },
  chatTranscript: [
    { role: "user", text: "make a tiny game" },
    { role: "assistant", text: "planning a tiny game" },
    { role: "assistant", text: "built a tiny game" },
  ],
  manifest: {
    title: "Adapter Test Game",
    genre: "arcade",
    runtime: "canvas2d",
    editableSpecVersion: "1",
    viewport: {
      width: 960,
      height: 540,
      scaling: "stretch_to_fill",
    },
    capabilities: ["start", "update", "render"],
    controls: [
      {
        action: "move_left",
        label: "Move left",
        keys: ["ArrowLeft"],
        kind: "button",
      },
    ],
  },
  editableSpec: {
    player: "triangle",
  },
  editorMetadata: {
    panels: [
      {
        title: "Runtime",
        items: [{ label: "Engine", value: "Canvas 2D" }],
      },
    ],
  },
  moduleSourceTs: "globalThis.createGameModule = function createGameModule() {};",
  moduleSourceJs: "globalThis.createGameModule = function createGameModule() {};",
};

describe("canvas runtime adapter", () => {
  it("creates an iframe mount descriptor from a generated game pack", () => {
    const descriptor = canvasRuntimeAdapter.createMountDescriptor(pack);

    expect(canvasRuntimeAdapter.kind).toBe("canvas2d");
    expect(descriptor.title).toBe("Adapter Test Game");
    expect(descriptor.sandbox).toBe("allow-scripts");
    expect(descriptor.srcDoc).toMatch(/__AICADE_SPEC__/);
    expect(descriptor.srcDoc).toMatch(/createGameModule/);
  });
});
