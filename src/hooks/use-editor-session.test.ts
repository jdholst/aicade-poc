import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useEditorSession } from "./use-editor-session";

const generationStages = [
  {
    title: "Booting the sandbox",
    detail: "Mounting the runtime iframe.",
    progress: 72,
  },
];

describe("useEditorSession", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts with the hand-authored Phaser runtime marked ready by default", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    expect(result.current.session.canvas.gameStatus).toEqual({
      state: "ready",
      message: "Phaser runtime is running in the sandbox.",
    });
  });

  it("starts in the generated Canvas initial state when the runtime override is canvas2d", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_EDITOR_RUNTIME", "canvas2d");

    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    expect(result.current.session.canvas.gameStatus).toEqual({
      state: "loading",
      message: "Ready to build starter game.",
    });
  });

  it("keeps the runtime status callback stable across status updates", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    const onGameStatusChange = result.current.actions.canvas.onGameStatusChange;

    act(() => {
      onGameStatusChange({ state: "loading" });
    });

    expect(result.current.actions.canvas.onGameStatusChange).toBe(
      onGameStatusChange
    );
  });

  it("persists recoverable runtime warnings separately from game status", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    const warning = {
      type: "mechanic-disabled" as const,
      severity: "warning" as const,
      recoverable: true as const,
      mechanicId: "mechanic_player_movement",
      mechanicType: "player_movement",
      phase: "install" as const,
      message:
        "Mechanic mechanic_player_movement install failed: Keyboard setup failed",
    };

    act(() => {
      result.current.actions.canvas.onGameStatusChange({
        state: "warning",
        issue: warning,
      });
      result.current.actions.canvas.onGameStatusChange({
        state: "warning",
        issue: warning,
      });
    });

    expect(result.current.session.canvas.gameStatus).toEqual({
      state: "ready",
      message: "Phaser runtime is running in the sandbox.",
    });
    expect(result.current.session.canvas.runtimeWarnings).toEqual([warning]);
  });

  it("clears runtime warnings when the runtime starts loading again", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    act(() => {
      result.current.actions.canvas.onGameStatusChange({
        state: "warning",
        issue: {
          type: "mechanic-disabled",
          severity: "warning",
          recoverable: true,
          mechanicId: "mechanic_player_movement",
          mechanicType: "player_movement",
          phase: "install",
          message:
            "Mechanic mechanic_player_movement install failed: Keyboard setup failed",
        },
      });
      result.current.actions.canvas.onGameStatusChange({ state: "loading" });
    });

    expect(result.current.session.canvas.runtimeWarnings).toEqual([]);
    expect(result.current.session.canvas.gameStatus).toEqual({
      state: "loading",
      message: "Booting Phaser runtime...",
    });
  });

  it("preserves fatal runtime errors in the editor game status", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    act(() => {
      result.current.actions.canvas.onGameStatusChange({
        state: "error",
        message: "Runtime crashed during boot.",
      });
    });

    expect(result.current.session.canvas.gameStatus).toEqual({
      state: "error",
      message: "Runtime crashed during boot.",
    });
  });
});
