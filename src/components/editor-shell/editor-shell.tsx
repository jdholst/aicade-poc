"use client";

import { useCallback, useState } from "react";

import { type GeneratedGameStatus } from "@/components/generated-game-host";
import { EditorHeader } from "@/components/editor-shell/editor-header";
import { EditorAIChat } from "@/components/editor-shell/editor-ai-chat";
import { EditorGameCanvas } from "@/components/editor-shell/editor-game-canvas";
import { DEFAULT_OPENAI_MODEL } from "@/constants";
import { isOpenAIModelId, type OpenAIModelId } from "@/utils/openai-utils";
import { useStarterProjectGeneration } from "@/hooks/use-starter-project-generation";

type EditorShellProps = {
  enteredPrompt: string;
  enteredOpenAiApiKey: string;
  enteredOpenAiKeyword: string;
  enteredOpenAiModel: string;
  needsOpenAiApiKey: boolean;
  needsOpenAiModel: boolean;
};

const generationStages = [
  {
    title: "Reading your game idea",
    detail: "Preparing the prompt and editor context for generation.",
    progress: 14,
  },
  {
    title: "Designing the starter game",
    detail: "Asking AI for the manifest, playable rules, and editable spec.",
    progress: 26,
  },
  {
    title: "Writing canvas runtime code",
    detail: "Generating the TypeScript module that will own the game loop.",
    progress: 38,
  },
  {
    title: "Checking generated code",
    detail: "Validating the pack and transpiling the module on the server.",
    progress: 56,
  },
  {
    title: "Booting the sandbox",
    detail:
      "Finalizing the generated pack before mounting it in an isolated iframe.",
    progress: 72,
  },
];

export function EditorShell({
  enteredPrompt,
  enteredOpenAiApiKey,
  enteredOpenAiKeyword,
  enteredOpenAiModel,
  needsOpenAiApiKey,
  needsOpenAiModel,
}: EditorShellProps) {
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

  const projectName =
    loadState.status === "success"
      ? loadState.pack.project.name
      : "Starter Project";
  const currentGenerationStage = generationStages[generationStepIndex];
  const isGenerating = loadState.status === "loading";
  const submittedPrompt =
    enteredPrompt.trim() ||
    "No prompt was provided, so AI-Cade will use the default starter platformer prompt.";
  const canStartGeneration =
    !isGenerating &&
    (!needsOpenAiApiKey ||
      Boolean(openAiApiKey.trim() || openAiKeyword.trim()));

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

  function regenerateGame() {
    startGeneration();
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

  function handleResetGame() {
    setIsGamePaused(false);
    setGameStatus({
      state: "loading",
      message: "Resetting generated canvas module...",
    });
    setGameResetNonce((value) => value + 1);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f5efe3_0%,_#ede3d2_36%,_#e0e9e1_100%)] px-4 py-4 text-[var(--ink)] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <EditorHeader projectName={projectName} gameStatus={gameStatus} />

        <section className="grid h-[calc(100vh-9.5rem)] min-h-[620px] gap-4 lg:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.25fr)]">
          <EditorAIChat
            canStartGeneration={canStartGeneration}
            generationStages={generationStages}
            generationStepIndex={generationStepIndex}
            isGenerating={isGenerating}
            loadState={loadState}
            needsOpenAiApiKey={needsOpenAiApiKey}
            needsOpenAiModel={needsOpenAiModel}
            onOpenAiApiKeyChange={setOpenAiApiKey}
            onOpenAiKeywordChange={setOpenAiKeyword}
            onOpenAiModelChange={setOpenAiModel}
            onRegenerateGame={regenerateGame}
            onStartGeneration={startGeneration}
            openAiApiKey={openAiApiKey}
            openAiKeyword={openAiKeyword}
            openAiModel={openAiModel}
            submittedPrompt={submittedPrompt}
          />

          <EditorGameCanvas
            currentGenerationStage={currentGenerationStage}
            gameResetNonce={gameResetNonce}
            gameStatus={gameStatus}
            isGamePaused={isGamePaused}
            loadState={loadState}
            onGameStatusChange={setGameStatus}
            onRegenerate={regenerateGame}
            onReset={handleResetGame}
            onTogglePaused={toggleGamePaused}
          />
        </section>
      </div>
    </main>
  );
}
