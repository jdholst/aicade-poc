import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  EditorAIChatActions,
  EditorAIChatSession,
} from "@/hooks/use-editor-session";
import type { OpenAIModelId } from "@/utils/openai-utils";
import { topDownPhaserTemplate } from "@/runtime/phaser";
import type { GeneratedGamePack } from "@/service/starter-project";

import { EditorAIChat } from "./editor-ai-chat";

const generationStages = [
  {
    title: "Reading your game idea",
    detail: "Preparing the prompt and editor context for generation.",
    progress: 14,
  },
];

const canvasPack: GeneratedGamePack = {
  project: {
    name: "Canvas Override Test",
    summary: "A generated canvas runtime for override tests.",
  },
  chatTranscript: [
    { role: "user", text: "make an override test" },
    { role: "assistant", text: "planning the override test" },
    { role: "assistant", text: "built the override test" },
  ],
  manifest: {
    title: "Canvas Override Test",
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
  editableSpec: {},
  editorMetadata: {
    panels: [
      {
        title: "Runtime",
        items: [{ label: "Engine", value: "Canvas 2D" }],
      },
    ],
  },
  moduleSourceTs:
    "globalThis.createGameModule = function createGameModule() {};",
  moduleSourceJs:
    "globalThis.createGameModule = function createGameModule() {};",
};

function createChatSession(
  overrides: Partial<EditorAIChatSession> = {}
): EditorAIChatSession {
  return {
    canRegeneratePrompt: true,
    canStartGeneration: true,
    canSubmitPrompt: true,
    generationStages,
    generationStepIndex: 0,
    hasSubmittedPrompt: true,
    isEditingPrompt: false,
    isGenerating: false,
    loadState: {
      status: "idle",
    },
    needsOpenAiApiKey: true,
    needsOpenAiModel: true,
    openAiApiKey: "",
    openAiKeyword: "Green Panda",
    openAiModel: "gpt-5.4-mini",
    promptDraft: "a top-down dodging game",
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
    onPromptDraftChange: vi.fn(),
    onPromptEdit: vi.fn(),
    onPromptRegenerate: vi.fn(),
    onPromptSubmit: vi.fn(),
    onRegenerateGame: vi.fn(),
    onStartGeneration: vi.fn(),
    ...overrides,
  };
}

describe("EditorAIChat", () => {
  it("shows the AI config bubble while asking for the first prompt", () => {
    const onPromptDraftChange = vi.fn();
    const onPromptSubmit = vi.fn();

    render(
      <EditorAIChat
        actions={createActions({
          onPromptDraftChange,
          onPromptSubmit,
        })}
        chat={createChatSession({
          canStartGeneration: false,
          canSubmitPrompt: true,
          hasSubmittedPrompt: false,
          isEditingPrompt: true,
          promptDraft: "make a maze game",
          submittedPrompt: "",
        })}
      />
    );

    expect(screen.getByLabelText("Game prompt")).toBeVisible();
    expect(screen.getByLabelText("OpenAI API key")).toBeVisible();
    expect(screen.getByLabelText("Key word")).toBeVisible();
    expect(screen.getByRole("button", { name: "Build the project" }))
      .toBeDisabled();

    fireEvent.change(screen.getByLabelText("Game prompt"), {
      target: { value: "make a platformer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));

    expect(onPromptDraftChange).toHaveBeenCalledWith("make a platformer");
    expect(onPromptSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows the AI config bubble after a prompt is submitted", () => {
    render(
      <EditorAIChat
        actions={createActions()}
        chat={createChatSession({
          hasSubmittedPrompt: true,
          submittedPrompt: "make a maze game",
        })}
      />
    );

    expect(screen.getByText("make a maze game")).toBeVisible();
    expect(screen.getByText("I have your prompt ready.", { exact: false }))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "Build the project" }))
      .toBeVisible();
  });

  it("lets a submitted prompt reopen for editing before generation starts", () => {
    const onPromptEdit = vi.fn();
    const onPromptDraftChange = vi.fn();
    const onPromptSubmit = vi.fn();
    const { rerender } = render(
      <EditorAIChat
        actions={createActions({
          onPromptDraftChange,
          onPromptEdit,
          onPromptSubmit,
        })}
        chat={createChatSession({
          hasSubmittedPrompt: true,
          isEditingPrompt: false,
          promptDraft: "make a maze game",
          submittedPrompt: "make a maze game",
        })}
      />
    );

    expect(screen.getByText("make a maze game")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit Prompt" }));

    expect(onPromptEdit).toHaveBeenCalledTimes(1);

    rerender(
      <EditorAIChat
        actions={createActions({
          onPromptDraftChange,
          onPromptEdit,
          onPromptSubmit,
        })}
        chat={createChatSession({
          canStartGeneration: false,
          hasSubmittedPrompt: true,
          isEditingPrompt: true,
          promptDraft: "make a maze game",
          submittedPrompt: "make a maze game",
        })}
      />
    );

    expect(screen.getByLabelText("Game prompt")).toHaveValue(
      "make a maze game"
    );
    expect(screen.getByLabelText("OpenAI API key")).toBeVisible();
    expect(screen.getByLabelText("Key word")).toBeVisible();
    expect(screen.getByRole("button", { name: "Build the project" }))
      .toBeDisabled();

    fireEvent.change(screen.getByLabelText("Game prompt"), {
      target: { value: "make a stealth maze" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));

    expect(onPromptDraftChange).toHaveBeenCalledWith("make a stealth maze");
    expect(onPromptSubmit).toHaveBeenCalledTimes(1);
  });

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
    expect(screen.getByRole("button", { name: "Change Prompt" }))
      .toBeVisible();

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

  it("regenerates from the edited prompt after a generation error", () => {
    const onPromptDraftChange = vi.fn();
    const onPromptRegenerate = vi.fn();

    render(
      <EditorAIChat
        actions={createActions({
          onPromptDraftChange,
          onPromptRegenerate,
        })}
        chat={createChatSession({
          canRegeneratePrompt: true,
          isEditingPrompt: true,
          loadState: {
            status: "error",
            message: 'No OpenAI API key is configured for keyword "Panda".',
          },
          promptDraft: "make a better maze game",
          submittedPrompt: "make a maze game",
        })}
      />
    );

    expect(screen.getByLabelText("Game prompt")).toHaveValue(
      "make a better maze game"
    );
    expect(screen.getByText("Generation error")).toBeVisible();
    expect(screen.getByLabelText("OpenAI API key")).toBeVisible();
    expect(screen.getByLabelText("Key word")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Game prompt"), {
      target: { value: "make a maze game with fewer enemies" },
    });
    const regenerateButtons = screen.getAllByRole("button", {
      name: "Regenerate",
    });
    fireEvent.click(regenerateButtons[1]);

    expect(onPromptDraftChange).toHaveBeenCalledWith(
      "make a maze game with fewer enemies"
    );
    expect(onPromptRegenerate).toHaveBeenCalledTimes(1);
  });

  it("uses the same generated project summary for Canvas and Phaser successes", () => {
    const { unmount } = render(
      <EditorAIChat
        actions={createActions()}
        chat={createChatSession({
          loadState: {
            status: "success",
            source: "canvas-starter",
            pack: canvasPack,
          },
        })}
      />
    );

    expect(
      screen.getByText(
        "The generated project was validated and mounted in the sandbox."
      )
    ).toBeVisible();
    expect(screen.getByText("Generated project")).toBeVisible();
    expect(screen.getByText("A generated canvas runtime for override tests."))
      .toBeVisible();
    expect(screen.getByText("Controls")).toBeVisible();

    unmount();

    render(
      <EditorAIChat
        actions={createActions()}
        chat={createChatSession({
          loadState: {
            status: "success",
            source: "phaser-spec",
            metadata: {
              attemptCount: 1,
              model: "gpt-5.4-mini",
              taskRoute: "spec_generation.primary",
            },
            runtimeKind: "phaser",
            spec: topDownPhaserTemplate.gameSpec,
          },
        })}
      />
    );

    expect(
      screen.getByText(
        "The generated project was validated and mounted in the sandbox."
      )
    ).toBeVisible();
    expect(screen.getByText("Generated project")).toBeVisible();
    expect(
      screen.getByText(topDownPhaserTemplate.gameSpec.currentIntentSummary)
    ).toBeVisible();
    expect(screen.getByText("Controls")).toBeVisible();
    expect(screen.queryByText(/automatic repair/i)).not.toBeInTheDocument();
  });

  it("shows a change prompt action after a game has been built", () => {
    const onPromptEdit = vi.fn();

    render(
      <EditorAIChat
        actions={createActions({ onPromptEdit })}
        chat={createChatSession({
          loadState: {
            status: "success",
            source: "phaser-spec",
            metadata: {
              attemptCount: 1,
              model: "gpt-5.4-mini",
              taskRoute: "spec_generation.primary",
            },
            runtimeKind: "phaser",
            spec: topDownPhaserTemplate.gameSpec,
          },
          submittedPrompt: "make a maze game",
        })}
      />
    );

    expect(screen.getByText("make a maze game")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Change Prompt" }));

    expect(onPromptEdit).toHaveBeenCalledTimes(1);
  });

  it("regenerates from the edited post-build prompt without hiding generated details", () => {
    const onPromptDraftChange = vi.fn();
    const onPromptRegenerate = vi.fn();

    render(
      <EditorAIChat
        actions={createActions({
          onPromptDraftChange,
          onPromptRegenerate,
        })}
        chat={createChatSession({
          canStartGeneration: true,
          hasSubmittedPrompt: true,
          isEditingPrompt: true,
          loadState: {
            status: "success",
            source: "phaser-spec",
            metadata: {
              attemptCount: 1,
              model: "gpt-5.4-mini",
              taskRoute: "spec_generation.primary",
            },
            runtimeKind: "phaser",
            spec: topDownPhaserTemplate.gameSpec,
          },
          promptDraft: "make a maze game with stealth",
          submittedPrompt: "make a maze game",
        })}
      />
    );

    expect(screen.getByLabelText("Game prompt")).toHaveValue(
      "make a maze game with stealth"
    );
    expect(screen.getByText("Generated project")).toBeVisible();
    expect(screen.getByText("Controls")).toBeVisible();
    expect(
      screen.getByText(topDownPhaserTemplate.gameSpec.currentIntentSummary)
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText("Game prompt"), {
      target: { value: "make a maze game with patrol guards" },
    });
    const regenerateButtons = screen.getAllByRole("button", {
      name: "Regenerate",
    });
    fireEvent.click(regenerateButtons[1]);

    expect(onPromptDraftChange).toHaveBeenCalledWith(
      "make a maze game with patrol guards"
    );
    expect(onPromptRegenerate).toHaveBeenCalledTimes(1);
  });

  it("shows one friendly repair note for repaired Phaser Spec Generation success", () => {
    render(
      <EditorAIChat
        actions={createActions()}
        chat={createChatSession({
          loadState: {
            status: "success",
            source: "phaser-spec",
            metadata: {
              attemptCount: 2,
              model: "gpt-5.4-mini",
              repairStatus: "repaired",
              repairAttempts: [
                {
                  attempt: 1,
                  outcome: "failed_validation",
                  stage: "semantic_validation",
                  issues: [
                    {
                      path: "mechanics.mechanic_player_movement.entityIds",
                      message: 'Unknown entity ID "entity_missing".',
                    },
                    {
                      path: "objectives",
                      message: "Expected exactly one primary objective.",
                    },
                    {
                      path: "regions.region_arena.bounds",
                      message: "Expected region bounds inside the scene.",
                    },
                    {
                      path: "assets.asset_pickup.role",
                      message: 'Expected asset role "pickup".',
                    },
                  ],
                },
              ],
              taskRoute: "spec_generation.primary",
            },
            runtimeKind: "phaser",
            spec: topDownPhaserTemplate.gameSpec,
          },
        })}
      />
    );

    expect(
      screen.getByText(
        "Generated a playable project plan from the prompt after 1 automatic repair."
      )
    ).toBeVisible();
    expect(
      screen.queryByText(/Unknown entity ID "entity_missing"/)
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("AI")).toHaveLength(1);
  });
});
