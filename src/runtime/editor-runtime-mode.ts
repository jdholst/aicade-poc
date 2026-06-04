export type EditorRuntimeMode = "phaser" | "canvas2d";
export type PhaserGenerationSource = "ai" | "fixture";
export type EditorGenerationSource =
  | "canvas-starter"
  | "phaser-ai"
  | "phaser-fixture";

export const EDITOR_RUNTIME_MODE_ENV = "NEXT_PUBLIC_AICADE_EDITOR_RUNTIME";
export const PHASER_GENERATION_SOURCE_ENV =
  "NEXT_PUBLIC_AICADE_PHASER_GENERATION_SOURCE";

export function getEditorRuntimeMode(): EditorRuntimeMode {
  return process.env.NEXT_PUBLIC_AICADE_EDITOR_RUNTIME === "canvas2d"
    ? "canvas2d"
    : "phaser";
}

export function getPhaserGenerationSource(): PhaserGenerationSource {
  return process.env.NEXT_PUBLIC_AICADE_PHASER_GENERATION_SOURCE === "fixture"
    ? "fixture"
    : "ai";
}

export function getEditorGenerationSource(
  runtimeMode = getEditorRuntimeMode(),
  phaserGenerationSource = getPhaserGenerationSource()
): EditorGenerationSource {
  if (runtimeMode === "canvas2d") {
    return "canvas-starter";
  }

  return phaserGenerationSource === "fixture" ? "phaser-fixture" : "phaser-ai";
}

export function createInitialGameStatus(
  generationSource = getEditorGenerationSource()
) {
  if (generationSource !== "phaser-fixture") {
    return {
      state: "loading" as const,
      message: "Ready to build project.",
    };
  }

  return {
    state: "ready" as const,
    message: "Phaser runtime is running in the sandbox.",
  };
}
