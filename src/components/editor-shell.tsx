"use client";

import { useEffect, useState } from "react";

import {
  GeneratedGameHost,
  type GeneratedGameStatus,
} from "@/components/generated-game-host";
import {
  GeneratedGamePack,
  generatedGamePackSchema,
} from "@/lib/starter-project";

type LoadState =
  | { status: "loading" }
  | { status: "success"; pack: GeneratedGamePack }
  | { status: "error"; message: string };

type EditorShellProps = {
  enteredPrompt: string;
};

const GENERATION_TIMEOUT_MS = 120_000;

const generationStages = [
  {
    title: "Reading your game idea",
    detail: "Preparing the prompt and editor context for generation.",
    progress: 14,
  },
  {
    title: "Designing the starter game",
    detail:
      "Asking AI for the manifest, playable rules, AI behavior, and editable spec.",
    progress: 38,
  },
  {
    title: "Writing canvas runtime code",
    detail: "Generating the TypeScript module that will own the game loop.",
    progress: 62,
  },
  {
    title: "Checking generated code",
    detail: "Validating the pack and transpiling the module on the server.",
    progress: 82,
  },
  {
    title: "Booting the sandbox",
    detail:
      "Finalizing the generated pack before mounting it in an isolated iframe.",
    progress: 94,
  },
];

function getSpecSummary(pack: GeneratedGamePack) {
  const specSize = JSON.stringify(pack.editableSpec).length;
  return [
    `${pack.manifest.genre} genre`,
    `${pack.manifest.viewport.width} x ${pack.manifest.viewport.height} viewport`,
    `${pack.manifest.controls.length} controls`,
    `${pack.manifest.capabilities.length} capabilities`,
    `${pack.manifest.ai.agents.length} AI agents`,
    `${pack.manifest.ai.difficulty} AI`,
    `${specSize.toLocaleString()} chars spec`,
    `${pack.moduleSourceTs.split("\n").length} lines TS`,
  ];
}

export function EditorShell({ enteredPrompt }: EditorShellProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [requestNonce, setRequestNonce] = useState(0);
  const [gameResetNonce, setGameResetNonce] = useState(0);
  const [isGamePaused, setIsGamePaused] = useState(false);
  const [generationStepIndex, setGenerationStepIndex] = useState(0);
  const [gameStatus, setGameStatus] = useState<GeneratedGameStatus>({
    state: "loading",
    message: "Waiting for generated module...",
  });

  useEffect(() => {
    const controller = new AbortController();
    let didTimeOut = false;
    let timeoutId: number | undefined;

    async function loadStarterProject() {
      setGenerationStepIndex(0);
      setLoadState({ status: "loading" });
      setGameStatus({
        state: "loading",
        message: "Waiting for generated module...",
      });
      setIsGamePaused(false);

      try {
        timeoutId = window.setTimeout(() => {
          didTimeOut = true;
          controller.abort();
        }, GENERATION_TIMEOUT_MS);

        const response = await fetch("/api/starter-project", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            enteredPrompt: enteredPrompt || undefined,
          }),
        });

        const payload = (await response.json()) as
          | GeneratedGamePack
          | { error?: string };

        if (!response.ok || ("error" in payload && payload.error)) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Generated game creation failed."
          );
        }

        const parsed = generatedGamePackSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error("The server returned an invalid generated game pack.");
        }

        setLoadState({
          status: "success",
          pack: parsed.data,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          if (didTimeOut) {
            setLoadState({
              status: "error",
              message:
                "Generation took longer than two minutes. Please retry; the model may have stalled while creating or validating the game module.",
            });
          }

          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Generated game creation failed.";

        setLoadState({
          status: "error",
          message,
        });
      } finally {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
      }
    }

    void loadStarterProject();

    return () => controller.abort();
  }, [enteredPrompt, requestNonce]);

  useEffect(() => {
    if (loadState.status !== "loading") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setGenerationStepIndex((currentIndex) =>
        Math.min(currentIndex + 1, generationStages.length - 1)
      );
    }, 1800);

    return () => window.clearInterval(intervalId);
  }, [loadState.status, enteredPrompt, requestNonce]);

  const projectName =
    loadState.status === "success"
      ? loadState.pack.project.name
      : "Starter Project";
  const currentGenerationStage = generationStages[generationStepIndex];
  const isGenerating = loadState.status === "loading";

  function regenerateGame() {
    setIsGamePaused(false);
    setGameResetNonce(0);
    setRequestNonce((value) => value + 1);
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

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f5efe3_0%,_#ede3d2_36%,_#e0e9e1_100%)] px-4 py-4 text-[var(--ink)] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <header className="flex flex-col gap-4 border border-[var(--line-strong)] bg-[rgba(255,249,242,0.82)] px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              AI-cade editor
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.05em] sm:text-3xl">
              {projectName}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <span className="inline-flex items-center gap-2 border border-[var(--line)] px-3 py-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  gameStatus.state === "ready"
                    ? "bg-[var(--accent)]"
                    : gameStatus.state === "paused"
                      ? "bg-[#c79236]"
                    : gameStatus.state === "error"
                      ? "bg-[#9d4b31]"
                      : "bg-[#c79236]"
                }`}
              />
              {gameStatus.message}
            </span>
            <span className="border border-[var(--line)] px-3 py-2">
              Generated module POC
            </span>
          </div>
        </header>

        <section className="grid h-[calc(100vh-9.5rem)] min-h-[620px] gap-4 lg:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.25fr)]">
          <aside className="flex min-h-0 flex-col border border-[var(--line-strong)] bg-[rgba(255,249,242,0.78)] backdrop-blur">
            <div className="shrink-0 border-b border-[var(--line)] px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                    Chat
                  </div>
                  <div className="mt-2 text-lg font-semibold">
                    Generated project log
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Read only
                  </div>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={regenerateGame}
                    className="inline-flex items-center justify-center border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[rgba(21,18,14,0.12)] disabled:text-[var(--muted)]"
                  >
                    {isGenerating ? "Generating..." : "Regenerate"}
                  </button>
                </div>
              </div>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--muted)]">
                This run uses your submitted prompt to generate the canvas
                runtime code, the editable JSON spec, controls, and editor
                metadata below.
              </p>
            </div>

            <div className="chat-history-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5">
              {loadState.status === "loading" ? (
                <>
                  <div className="border border-[var(--line)] bg-white/76 px-4 py-3 text-sm text-[var(--muted)]">
                    Building the starter game. The live generation indicator is
                    on the canvas while this log tracks each phase.
                  </div>
                  {generationStages.map((stage, index) => {
                    const isComplete = index < generationStepIndex;
                    const isActive = index === generationStepIndex;

                    return (
                    <div
                      key={stage.title}
                      className={`flex items-start gap-3 border-l pl-4 ${
                        isActive
                          ? "border-[var(--accent)]"
                          : "border-[var(--line)]"
                      }`}
                    >
                      <div
                        className={`mt-1 flex h-3 w-3 items-center justify-center rounded-full ${
                          isComplete
                            ? "bg-[var(--accent)]"
                            : isActive
                              ? "bg-[#f6c46b] shadow-[0_0_0_6px_rgba(246,196,107,0.16)]"
                              : "bg-[var(--line-strong)]"
                        }`}
                      />
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          Step {index + 1}
                        </div>
                        <div className="mt-2 text-sm leading-7 text-[var(--ink)]">
                          {stage.title}
                        </div>
                        {isActive ? (
                          <p className="mt-1 text-xs leading-6 text-[var(--muted)]">
                            {stage.detail}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    );
                  })}
                </>
              ) : null}

              {loadState.status === "error" ? (
                <div className="space-y-4 border border-[rgba(169,72,42,0.24)] bg-[rgba(255,243,236,0.92)] p-5">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9d4b31]">
                      Generation error
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[#613128]">
                      {loadState.message}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={regenerateGame}
                    className="inline-flex items-center justify-center border border-[#9d4b31]/30 bg-[#9d4b31] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#81402b]"
                  >
                    Retry generation
                  </button>
                </div>
              ) : null}

              {loadState.status === "success" ? (
                <>
                  <div className="border border-[var(--line)] bg-white/76 px-4 py-3 text-sm text-[var(--muted)]">
                    Generated TypeScript was validated, transpiled on the
                    server, and mounted in a sandboxed iframe.
                  </div>

                  {loadState.pack.chatTranscript.map((message, index) => (
                    <article
                      key={`${message.role}-${index}-${message.text}`}
                      className={`max-w-[92%] border px-4 py-3 ${
                        message.role === "user"
                          ? "ml-auto border-[var(--line)] bg-[rgba(21,18,14,0.93)] text-white"
                          : "border-[var(--line)] bg-white/88 text-[var(--ink)]"
                      }`}
                    >
                      <div
                        className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          message.role === "user"
                            ? "text-white/60"
                            : "text-[var(--muted)]"
                        }`}
                      >
                        {message.role === "user" ? "Prompt" : "AI"}
                      </div>
                      <p className="mt-2 text-sm leading-7">{message.text}</p>
                    </article>
                  ))}

                  <section className="border border-[var(--line)] bg-[rgba(240,247,243,0.9)] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      Manifest
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                      {loadState.pack.project.summary}
                    </p>
                    <div className="mt-4 grid gap-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)] sm:grid-cols-2">
                      <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                        {loadState.pack.manifest.runtime}
                      </div>
                      <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                        {loadState.pack.manifest.editableSpecVersion}
                      </div>
                      <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                        {loadState.pack.manifest.genre}
                      </div>
                      <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                        {loadState.pack.manifest.viewport.scaling}
                      </div>
                      <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                        {loadState.pack.manifest.controls.length} controls
                      </div>
                      <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                        {loadState.pack.manifest.ai.tickRate} AI tick
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-3 sm:grid-cols-2">
                    {getSpecSummary(loadState.pack).map((item) => (
                      <div
                        key={item}
                        className="border border-[var(--line)] bg-white/74 px-3 py-3 text-xs uppercase tracking-[0.16em] text-[var(--muted)]"
                      >
                        {item}
                      </div>
                    ))}
                  </section>

                  <section className="border border-[var(--line)] bg-white/78 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      Controls
                    </div>
                    <div className="mt-3 space-y-2">
                      {loadState.pack.manifest.controls.map((control) => (
                        <div
                          key={control.action}
                          className="flex items-start justify-between gap-4 text-sm"
                        >
                          <span className="text-[var(--muted)]">
                            {control.label}
                          </span>
                          <span className="max-w-[58%] text-right font-medium text-[var(--ink)]">
                            {control.keys.join(", ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="border border-[var(--line)] bg-white/78 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      AI behavior
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                      {loadState.pack.manifest.ai.summary}
                    </p>
                    <div className="mt-4 grid gap-3 text-xs uppercase tracking-[0.16em] text-[var(--muted)] sm:grid-cols-3">
                      <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                        {loadState.pack.manifest.ai.difficulty}
                      </div>
                      <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                        {loadState.pack.manifest.ai.tickRate}
                      </div>
                      <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                        {loadState.pack.manifest.ai.updateBudget} budget
                      </div>
                    </div>
                    <div className="mt-4 space-y-4">
                      {loadState.pack.manifest.ai.agents.map((agent) => (
                        <div
                          key={agent.id}
                          className="border-t border-[var(--line)] pt-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-sm font-semibold text-[var(--ink)]">
                                {agent.label}
                              </div>
                              <p className="mt-1 text-sm leading-7 text-[var(--muted)]">
                                {agent.goal}
                              </p>
                            </div>
                            <span className="shrink-0 border border-[var(--line)] px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                              {agent.role}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {agent.states.map((state) => (
                              <span
                                key={`${agent.id}-${state.name}`}
                                className="border border-[var(--line)] bg-[rgba(240,247,243,0.82)] px-2.5 py-1 text-xs text-[var(--muted)]"
                              >
                                {state.name}
                              </span>
                            ))}
                          </div>
                          <div className="mt-3 text-xs leading-6 text-[var(--muted)]">
                            Observes {agent.observes.join(", ")}
                          </div>
                          <div className="mt-1 text-xs leading-6 text-[var(--muted)]">
                            Tuning{" "}
                            {agent.tuning
                              .map(
                                (item) => `${item.parameter} ${item.value}`
                              )
                              .join(", ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    {loadState.pack.editorMetadata.panels.map((panel) => (
                      <div
                        key={panel.title}
                        className="border border-[var(--line)] bg-white/78 p-4"
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          {panel.title}
                        </div>
                        <div className="mt-3 space-y-2">
                          {panel.items.map((item) => (
                            <div
                              key={`${panel.title}-${item.label}`}
                              className="flex items-start justify-between gap-4 text-sm"
                            >
                              <span className="text-[var(--muted)]">
                                {item.label}
                              </span>
                              <span className="max-w-[58%] text-right font-medium text-[var(--ink)]">
                                {item.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>

                  <section className="border border-[var(--line)] bg-[rgba(17,24,31,0.92)] p-4 text-white">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                      Capabilities
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {loadState.pack.manifest.capabilities.map((capability) => (
                        <span
                          key={capability}
                          className="border border-white/12 bg-white/8 px-2.5 py-1 text-xs text-white/78"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-[var(--line)] bg-[rgba(255,252,248,0.92)] px-5 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Follow-up prompts
              </div>
              <div className="mt-3 flex gap-3">
                <textarea
                  disabled
                  className="min-h-24 flex-1 resize-none border border-[var(--line)] bg-white/75 px-4 py-3 text-sm text-[var(--muted)] outline-none"
                  placeholder="Follow-up prompts will use this generated module manifest and editable spec in v1."
                />
                <button
                  type="button"
                  disabled
                  className="min-w-28 border border-[var(--line)] bg-[rgba(21,18,14,0.08)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
                >
                  Send
                </button>
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col gap-4">
            {loadState.status === "success" ? (
              <>
                <div className="flex flex-col gap-3 border border-[var(--line-strong)] bg-[rgba(255,249,242,0.82)] px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      Runtime controls
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Reset restarts this generated module from its original
                      editable spec without regenerating.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <button
                      type="button"
                      disabled={
                        gameStatus.state !== "ready" &&
                        gameStatus.state !== "paused"
                      }
                      onClick={toggleGamePaused}
                      className="inline-flex items-center justify-center border border-[var(--line)] bg-[rgba(21,18,14,0.08)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--muted)] disabled:opacity-55"
                    >
                      {isGamePaused ? "Resume game" : "Pause game"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsGamePaused(false);
                        setGameStatus({
                          state: "loading",
                          message: "Resetting generated canvas module...",
                        });
                        setGameResetNonce((value) => value + 1);
                      }}
                      className="inline-flex items-center justify-center border border-[var(--line)] bg-[var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--accent)]"
                    >
                      Reset game
                    </button>
                  </div>
                </div>
                {gameStatus.state === "error" ? (
                  <div className="flex flex-col gap-3 border border-[rgba(169,72,42,0.24)] bg-[rgba(255,243,236,0.92)] px-4 py-3 text-sm text-[#613128] sm:flex-row sm:items-center sm:justify-between">
                    <div>Canvas runtime error: {gameStatus.message}</div>
                    <button
                      type="button"
                      onClick={regenerateGame}
                      className="inline-flex items-center justify-center border border-[#9d4b31]/30 bg-[#9d4b31] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#81402b]"
                    >
                      Regenerate game
                    </button>
                  </div>
                ) : null}
                <GeneratedGameHost
                  key={`${loadState.pack.manifest.title}-${gameResetNonce}`}
                  pack={loadState.pack}
                  isPaused={isGamePaused}
                  onStatusChange={setGameStatus}
                />
              </>
            ) : (
              <div className="flex h-full min-h-[440px] flex-col border border-[var(--line-strong)] bg-[linear-gradient(180deg,_#18242f_0%,_#10171e_100%)] p-6 text-white">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/55">
                  <span>Generated canvas</span>
                  <span>
                    {loadState.status === "loading"
                      ? "Generating"
                      : "Waiting for module"}
                  </span>
                </div>
                <div className="mt-6 flex flex-1 items-center justify-center border border-dashed border-white/15 bg-[radial-gradient(circle_at_top,_rgba(255,197,92,0.14),_transparent_34%),linear-gradient(135deg,_rgba(15,127,104,0.12),_transparent_42%)]">
                  {loadState.status === "loading" ? (
                    <div className="w-full max-w-xl space-y-6 px-4 text-center">
                      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
                        <div className="h-12 w-12 rounded-full border-2 border-white/10 border-t-[#f6c46b] border-r-[#0f7f68] animate-spin" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                          Generating your game
                        </div>
                        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
                          {currentGenerationStage.title}
                        </h2>
                        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/65">
                          {currentGenerationStage.detail}
                        </p>
                      </div>
                      <div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,_#f6c46b,_#0f7f68)] transition-[width] duration-700 ease-out"
                            style={{
                              width: `${currentGenerationStage.progress}%`,
                            }}
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                          <span>AI is building the starter</span>
                          <span>{currentGenerationStage.progress}%</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-md space-y-4 text-center">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                        First magic moment
                      </div>
                      <h2 className="text-3xl font-semibold tracking-[-0.05em] text-balance">
                        The AI-generated game module will boot here.
                      </h2>
                      <p className="text-sm leading-7 text-white/65">
                        The React editor stays stable while the canvas runtime is
                        generated and sandboxed.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
