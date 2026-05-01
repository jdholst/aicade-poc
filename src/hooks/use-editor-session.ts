"use client";

import { useCallback, useState } from "react";

import { DEFAULT_OPENAI_MODEL } from "@/constants";
import type { GeneratedGameStatus } from "@/components/generated-game-host";
import { useStarterProjectGeneration } from "@/hooks/use-starter-project-generation";
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
  generationStages: EditorGenerationStage[];
  generationStepIndex: number;
  isGenerating: boolean;
  loadState: StarterProjectLoadState;
  needsOpenAiApiKey: boolean;
  needsOpenAiModel: boolean;
  openAiApiKey: string;
  openAiKeyword: string;
  openAiModel: OpenAIModelId;
  submittedPrompt: string;
};

export type EditorAIChatActions = {
  onOpenAiApiKeyChange: (value: string) => void;
  onOpenAiKeywordChange: (value: string) => void;
  onOpenAiModelChange: (value: OpenAIModelId) => void;
  onRegenerateGame: () => void;
  onStartGeneration: () => void;
};

export type EditorGameCanvasSession = {
  currentGenerationStage: EditorGenerationStage;
  gameResetNonce: number;
  gameStatus: GeneratedGameStatus;
  isGamePaused: boolean;
  loadState: StarterProjectLoadState;
};

export type EditorGameCanvasActions = {
  onGameStatusChange: (status: GeneratedGameStatus) => void;
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
  const [openAiApiKey, setOpenAiApiKey] = useState(enteredOpenAiApiKey);
  const [openAiKeyword, setOpenAiKeyword] = useState(enteredOpenAiKeyword);
  const [openAiModel, setOpenAiModel] = useState<OpenAIModelId>(
    isOpenAIModelId(enteredOpenAiModel)
      ? enteredOpenAiModel
      : DEFAULT_OPENAI_MODEL
  );
  const [gameResetNonce, setGameResetNonce] = useState(0);
  const [isGamePaused, setIsGamePaused] = useState(false);
  const [gameStatus, setGameStatus] = useState<GeneratedGameStatus>({
    state: "loading",
    message: "Ready to build starter game.",
  });

  const handleGenerationStarted = useCallback(() => {
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
  const submittedPrompt =
    enteredPrompt.trim() ||
    "No prompt was provided, so AI-Cade will use the default starter platformer prompt.";
  const canStartGeneration =
    !isGenerating &&
    (!needsOpenAiApiKey ||
      Boolean(openAiApiKey.trim() || openAiKeyword.trim()));
  const projectName =
    loadState.status === "success"
      ? loadState.pack.project.name
      : "Starter Project";

  function startGeneration() {
    if (!canStartGeneration) {
      return;
    }

    setGameResetNonce(0);
    startGenerationRequest({
      prompt: enteredPrompt.trim(),
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
        ? "Generated module is paused in the sandbox."
        : "Generated module is running in the sandbox.",
    });
  }

  function resetGame() {
    setIsGamePaused(false);
    setGameStatus({
      state: "loading",
      message: "Resetting generated canvas module...",
    });
    setGameResetNonce((value) => value + 1);
  }

  const chat: EditorAIChatSession = {
    canStartGeneration,
    generationStages,
    generationStepIndex,
    isGenerating,
    loadState,
    needsOpenAiApiKey,
    needsOpenAiModel,
    openAiApiKey,
    openAiKeyword,
    openAiModel,
    submittedPrompt,
  };

  const canvas: EditorGameCanvasSession = {
    currentGenerationStage,
    gameResetNonce,
    gameStatus,
    isGamePaused,
    loadState,
  };

  return {
    session: {
      canvas,
      chat,
      projectName,
    },
    actions: {
      canvas: {
        onGameStatusChange: setGameStatus,
        onRegenerate: startGeneration,
        onReset: resetGame,
        onTogglePaused: toggleGamePaused,
      },
      chat: {
        onOpenAiApiKeyChange: setOpenAiApiKey,
        onOpenAiKeywordChange: setOpenAiKeyword,
        onOpenAiModelChange: setOpenAiModel,
        onRegenerateGame: startGeneration,
        onStartGeneration: startGeneration,
      },
    },
  };
}

