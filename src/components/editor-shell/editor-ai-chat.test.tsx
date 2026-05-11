import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  EditorAIChatActions,
  EditorAIChatSession,
} from "@/hooks/use-editor-session";
import type { OpenAIModelId } from "@/utils/openai-utils";

import { EditorAIChat } from "./editor-ai-chat";

const generationStages = [
  {
    title: "Reading your game idea",
    detail: "Preparing the prompt and editor context for generation.",
    progress: 14,
  },
];

function createChatSession(
  overrides: Partial<EditorAIChatSession> = {}
): EditorAIChatSession {
  return {
    canStartGeneration: true,
    generationStages,
    generationStepIndex: 0,
    isGenerating: false,
    loadState: {
      status: "idle",
    },
    needsOpenAiApiKey: true,
    needsOpenAiModel: true,
    openAiApiKey: "",
    openAiKeyword: "Green Panda",
    openAiModel: "gpt-5.4-mini",
    submittedPrompt: "a top-down dodging game",
    ...overrides,
  };
}

function createActions(
  overrides: Partial<EditorAIChatActions> = {}
): EditorAIChatActions {
  return {
    onOpenAiApiKeyChange: vi.fn(),
    onOpenAiKeywordChange: vi.fn(),
    onOpenAiModelChange: vi.fn(),
    onRegenerateGame: vi.fn(),
    onStartGeneration: vi.fn(),
    ...overrides,
  };
}

describe("EditorAIChat", () => {
  it("shows editable OpenAI config when generation errors", () => {
    const onOpenAiApiKeyChange = vi.fn();
    const onOpenAiKeywordChange = vi.fn();
    const onOpenAiModelChange = vi.fn();
    const onRegenerateGame = vi.fn();

    render(
      <EditorAIChat
        actions={createActions({
          onOpenAiApiKeyChange,
          onOpenAiKeywordChange,
          onOpenAiModelChange,
          onRegenerateGame,
        })}
        chat={createChatSession({
          loadState: {
            status: "error",
            message: 'No OpenAI API key is configured for keyword "Panda".',
          },
        })}
      />
    );

    expect(screen.getByText("Generation error")).toBeVisible();

    fireEvent.change(screen.getByLabelText("OpenAI API key"), {
      target: { value: "sk-test" },
    });
    fireEvent.change(screen.getByLabelText("Key word"), {
      target: { value: "Panda" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "gpt-5.5" satisfies OpenAIModelId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry generation" }));

    expect(onOpenAiApiKeyChange).toHaveBeenCalledWith("sk-test");
    expect(onOpenAiKeywordChange).toHaveBeenCalledWith("Panda");
    expect(onOpenAiModelChange).toHaveBeenCalledWith("gpt-5.5");
    expect(onRegenerateGame).toHaveBeenCalledTimes(1);
  });
});
