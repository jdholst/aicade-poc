"use client";

import { useEffect } from "react";

import { EditorHeader } from "@/components/editor-shell/editor-header";
import { EditorAIChat } from "@/components/editor-shell/editor-ai-chat";
import { EditorGameCanvas } from "@/components/editor-shell/editor-game-canvas";
import { useEditorSession } from "@/hooks/use-editor-session";
import { installGenerationRunDeveloperJsonExport } from "@/service/generation-run";

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
    title: "Designing the project",
    detail: "Asking AI for the playable rules, controls, and editable spec.",
    progress: 26,
  },
  {
    title: "Preparing the runtime",
    detail: "Creating the runtime plan that will own the game loop.",
    progress: 38,
  },
  {
    title: "Checking the project",
    detail: "Validating the generated project before it reaches the sandbox.",
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
  const { actions, session } = useEditorSession({
    enteredPrompt,
    enteredOpenAiApiKey,
    enteredOpenAiKeyword,
    enteredOpenAiModel,
    generationStages,
    needsOpenAiApiKey,
    needsOpenAiModel,
  });

  useEffect(() => {
    const installation = installGenerationRunDeveloperJsonExport();

    return () => installation.uninstall();
  }, []);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f5efe3_0%,_#ede3d2_36%,_#e0e9e1_100%)] px-4 py-4 text-[var(--ink)] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <EditorHeader
          projectName={session.projectName}
          gameStatus={session.canvas.gameStatus}
          loadState={session.canvas.loadState}
        />

        <section className="grid gap-4 lg:h-[calc(100vh-9.5rem)] lg:min-h-[620px] lg:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.25fr)]">
          <EditorAIChat actions={actions.chat} chat={session.chat} />

          <EditorGameCanvas actions={actions.canvas} canvas={session.canvas} />
        </section>
      </div>
    </main>
  );
}
