"use client";

import { useCallback, useState } from "react";

import { DEFAULT_OPENAI_MODEL } from "@/constants";
import type { RuntimeIframeStatus } from "@/components/runtime-iframe-host";
import { useStarterProjectGeneration } from "@/hooks/use-starter-project-generation";
import { createInitialGameStatus } from "@/runtime/editor-runtime-mode";
import type { RuntimeIssue } from "@/runtime/runtime-adapter";
import { isOpenAIModelId, type OpenAIModelId } from "@/utils/openai-utils";
import type { StarterProjectLoadState } from "@/hooks/use-starter-project-generation";

export type EditorGenerationStage = {
  title: string;
  detail: string;
  progress: number;
};

type UseEditorSessionOptions = {
  enteredPrompt: string;
  enteredOpenAiApiKey: string;
  enteredOpenAiKeyword: string;
  enteredOpenAiModel: string;
  generationStages: EditorGenerationStage[];
  needsOpenAiApiKey: boolean;
  needsOpenAiModel: boolean;
};

export type EditorAIChatSession = {
  canStartGeneration: boolean;
  canSubmitPrompt: boolean;
  generationStages: EditorGenerationStage[];
  generationStepIndex: number;
  hasSubmittedPrompt: boolean;
  isGenerating: boolean;
  loadState: StarterProjectLoadState;
  needsOpenAiApiKey: boolean;
  needsOpenAiModel: boolean;
  openAiApiKey: string;
  openAiKeyword: string;
  openAiModel: OpenAIModelId;
  promptDraft: string;
  submittedPrompt: string;
};

export type EditorAIChatActions = {
  onOpenAiApiKeyChange: (value: string) => void;
  onOpenAiKeywordChange: (value: string) => void;
  onOpenAiModelChange: (value: OpenAIModelId) => void;
  onPromptDraftChange: (value: string) => void;
  onPromptSubmit: () => void;
  onRegenerateGame: () => void;
  onStartGeneration: () => void;
};

export type EditorGameCanvasSession = {
  currentGenerationStage: EditorGenerationStage;
  gameResetNonce: number;
  gameStatus: GeneratedGameStatus;
  isGamePaused: boolean;
  loadState: StarterProjectLoadState;
  runtimeWarnings: RuntimeWarningIssue[];
};

export type RuntimeWarningIssue = Extract<RuntimeIssue, { recoverable: true }>;

export type GeneratedGameStatus =
  | { state: "loading"; message: string }
  | { state: "ready"; message: string }
  | { state: "paused"; message: string }
  | { state: "error"; message: string };

export type EditorGameCanvasActions = {
  onGameStatusChange: (status: RuntimeIframeStatus) => void;
  onRegenerate: () => void;
  onReset: () => void;
  onTogglePaused: () => void;
};

export function useEditorSession({
  enteredPrompt,
  enteredOpenAiApiKey,
  enteredOpenAiKeyword,
  enteredOpenAiModel,
  generationStages,
  needsOpenAiApiKey,
  needsOpenAiModel,
}: UseEditorSessionOptions) {
  const initialPrompt = enteredPrompt.trim();
  const [promptDraft, setPromptDraft] = useState(initialPrompt);
  const [submittedPrompt, setSubmittedPrompt] = useState(initialPrompt);
  const [openAiApiKey, setOpenAiApiKey] = useState(enteredOpenAiApiKey);
  const [openAiKeyword, setOpenAiKeyword] = useState(enteredOpenAiKeyword);
  const [openAiModel, setOpenAiModel] = useState<OpenAIModelId>(
    isOpenAIModelId(enteredOpenAiModel)
      ? enteredOpenAiModel
      : DEFAULT_OPENAI_MODEL
  );
  const [gameResetNonce, setGameResetNonce] = useState(0);
  const [isGamePaused, setIsGamePaused] = useState(false);
  const [gameStatus, setGameStatus] = useState<GeneratedGameStatus>(() =>
    createInitialGameStatus()
  );
  const [runtimeWarnings, setRuntimeWarnings] = useState<RuntimeWarningIssue[]>(
    []
  );

  const handleGenerationStarted = useCallback(() => {
    setRuntimeWarnings([]);
    setGameStatus({
      state: "loading",
      message: "Waiting for generated module...",
    });
    setIsGamePaused(false);
  }, []);

  const { generationStepIndex, loadState, startGenerationRequest } =
    useStarterProjectGeneration({
      generationStageCount: generationStages.length,
      onGenerationStarted: handleGenerationStarted,
    });

  const currentGenerationStage = generationStages[generationStepIndex];
  const isGenerating = loadState.status === "loading";
  const hasSubmittedPrompt = Boolean(submittedPrompt);
  const canSubmitPrompt = !isGenerating && Boolean(promptDraft.trim());
  const canStartGeneration =
    hasSubmittedPrompt &&
    !isGenerating &&
    (!needsOpenAiApiKey ||
      Boolean(openAiApiKey.trim() || openAiKeyword.trim()));
  const projectName =
    loadState.status === "success"
      ? loadState.pack.project.name
      : "Starter Project";

  function submitPrompt() {
    const normalizedPrompt = promptDraft.replace(/\s+/g, " ").trim();

    if (!normalizedPrompt || isGenerating) {
      return;
    }

    setSubmittedPrompt(normalizedPrompt);
  }

  function startGeneration() {
    if (!canStartGeneration) {
      return;
    }

    setGameResetNonce(0);
    startGenerationRequest({
      prompt: submittedPrompt,
      openAiApiKey: needsOpenAiApiKey ? openAiApiKey.trim() : undefined,
      openAiKeyword: needsOpenAiApiKey ? openAiKeyword.trim() : undefined,
      openAiModel: needsOpenAiModel ? openAiModel : undefined,
    });
  }

  function toggleGamePaused() {
    const nextIsPaused = !isGamePaused;

    setIsGamePaused(nextIsPaused);
    setGameStatus({
      state: nextIsPaused ? "paused" : "ready",
      message: nextIsPaused
        ? "Phaser runtime is paused in the sandbox."
        : "Phaser runtime is running in the sandbox.",
    });
  }

  function resetGame() {
    setIsGamePaused(false);
    setRuntimeWarnings([]);
    setGameStatus({
      state: "loading",
      message: "Resetting Phaser runtime...",
    });
    setGameResetNonce((value) => value + 1);
  }

  const handleRuntimeStatusChange = useCallback(
    (status: RuntimeIframeStatus) => {
      if (status.state === "warning") {
        setRuntimeWarnings((warnings) =>
          appendRuntimeWarning(warnings, status.issue)
        );
        return;
      }

      if (status.state === "loading") {
        setRuntimeWarnings((warnings) =>
          warnings.length === 0 ? warnings : []
        );
        setGameStatus((currentStatus) =>
          currentStatus.state === "loading" &&
          currentStatus.message === "Booting Phaser runtime..."
            ? currentStatus
            : {
                state: "loading",
                message: "Booting Phaser runtime...",
              }
        );
        return;
      }

      if (status.state === "ready") {
        setGameStatus({
          state: "ready",
          message: "Phaser runtime is running in the sandbox.",
        });
        return;
      }

      setGameStatus(status);
    },
    []
  );

  const chat: EditorAIChatSession = {
    canStartGeneration,
    canSubmitPrompt,
    generationStages,
    generationStepIndex,
    hasSubmittedPrompt,
    isGenerating,
    loadState,
    needsOpenAiApiKey,
    needsOpenAiModel,
    openAiApiKey,
    openAiKeyword,
    openAiModel,
    promptDraft,
    submittedPrompt,
  };

  const canvas: EditorGameCanvasSession = {
    currentGenerationStage,
    gameResetNonce,
    gameStatus,
    isGamePaused,
    loadState,
    runtimeWarnings,
  };

  return {
    session: {
      canvas,
      chat,
      projectName,
    },
    actions: {
      canvas: {
        onGameStatusChange: handleRuntimeStatusChange,
        onRegenerate: startGeneration,
        onReset: resetGame,
        onTogglePaused: toggleGamePaused,
      },
      chat: {
        onOpenAiApiKeyChange: setOpenAiApiKey,
        onOpenAiKeywordChange: setOpenAiKeyword,
        onOpenAiModelChange: setOpenAiModel,
        onPromptDraftChange: setPromptDraft,
        onPromptSubmit: submitPrompt,
        onRegenerateGame: startGeneration,
        onStartGeneration: startGeneration,
      },
    },
  };
}

function appendRuntimeWarning(
  warnings: RuntimeWarningIssue[],
  nextWarning: RuntimeWarningIssue
) {
  const hasWarning = warnings.some(
    (warning) =>
      warning.mechanicId === nextWarning.mechanicId &&
      warning.phase === nextWarning.phase &&
      warning.message === nextWarning.message
  );

  return hasWarning ? warnings : [...warnings, nextWarning];
}
