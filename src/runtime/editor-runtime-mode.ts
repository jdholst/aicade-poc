export type EditorRuntimeMode = "phaser" | "canvas2d";

export const EDITOR_RUNTIME_MODE_ENV = "NEXT_PUBLIC_AICADE_EDITOR_RUNTIME";

export function getEditorRuntimeMode(): EditorRuntimeMode {
  return process.env.NEXT_PUBLIC_AICADE_EDITOR_RUNTIME === "canvas2d"
    ? "canvas2d"
    : "phaser";
}

export function createInitialGameStatus(runtimeMode = getEditorRuntimeMode()) {
  if (runtimeMode === "canvas2d") {
    return {
      state: "loading" as const,
      message: "Ready to build starter game.",
    };
  }

  return {
    state: "ready" as const,
    message: "Phaser runtime is running in the sandbox.",
  };
}
