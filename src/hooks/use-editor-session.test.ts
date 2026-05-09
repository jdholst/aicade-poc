import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useEditorSession } from "./use-editor-session";

const generationStages = [
  {
    title: "Booting the sandbox",
    detail: "Mounting the runtime iframe.",
    progress: 72,
  },
];

describe("useEditorSession", () => {
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
});
