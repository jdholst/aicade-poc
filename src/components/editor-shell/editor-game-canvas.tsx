import {
  GeneratedGameHost,
  type GeneratedGameHostHandle,
  type GeneratedGameStatus,
} from "@/components/generated-game-host";
import type { StarterProjectLoadState } from "@/hooks/use-starter-project-generation";
import type { GenerationStage } from "@/components/editor-shell/editor-ai-chat";
import { useEffect, useRef } from "react";

type EditorGameCanvasProps = {
  currentGenerationStage: GenerationStage;
  gameResetNonce: number;
  gameStatus: GeneratedGameStatus;
  isGamePaused: boolean;
  loadState: StarterProjectLoadState;
  onGameStatusChange: (status: GeneratedGameStatus) => void;
  onRegenerate: () => void;
  onReset: () => void;
  onTogglePaused: () => void;
};

export function EditorGameCanvas({
  currentGenerationStage,
  gameResetNonce,
  gameStatus,
  isGamePaused,
  loadState,
  onGameStatusChange,
  onRegenerate,
  onReset,
  onTogglePaused,
}: EditorGameCanvasProps) {
  const gameHostRef = useRef<GeneratedGameHostHandle | null>(null);
  const shouldFocusGameAfterResetRef = useRef(false);


  useEffect(() => {
    if (!shouldFocusGameAfterResetRef.current) {
      return;
    }

    if (gameStatus.state === "error") {
      shouldFocusGameAfterResetRef.current = false;
      return;
    }

    if (gameStatus.state !== "ready") {
      return;
    }

    shouldFocusGameAfterResetRef.current = false;
    const focusId = window.setTimeout(() => {
      gameHostRef.current?.focusGame();
    }, 0);
    const followUpFocusId = window.setTimeout(() => {
      gameHostRef.current?.focusGame();
    }, 120);

    return () => {
      window.clearTimeout(focusId);
      window.clearTimeout(followUpFocusId);
    };
  }, [gameStatus.state, gameResetNonce]);

  const toggleGamePaused = () => {
    onTogglePaused();

    window.setTimeout(() => {
      gameHostRef.current?.focusGame();
    }, 0);
  };

  const handleResetGame = () => {
    shouldFocusGameAfterResetRef.current = true;
    onReset();
  }
    
  return (
    <section className="flex min-h-0 flex-col gap-4">
      {loadState.status === "success" ? (
        <>
          <div className="flex flex-col gap-3 border border-[var(--line-strong)] bg-[rgba(255,249,242,0.82)] px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Runtime controls
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Reset restarts this generated module from its original editable
                spec without regenerating.
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
                onClick={handleResetGame}
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
                onClick={onRegenerate}
                className="inline-flex items-center justify-center border border-[#9d4b31]/30 bg-[#9d4b31] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#81402b]"
              >
                Regenerate game
              </button>
            </div>
          ) : null}
          <GeneratedGameHost
            ref={gameHostRef}
            key={`${loadState.pack.manifest.title}-${gameResetNonce}`}
            pack={loadState.pack}
            isPaused={isGamePaused}
            onStatusChange={onGameStatusChange}
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
  );
}
