import {
  RuntimeIframeHost,
  type RuntimeIframeHostHandle,
} from "@/components/runtime-iframe-host";
import { GeneratedGameHost } from "@/components/generated-game-host";
import type {
  EditorGameCanvasActions,
  EditorGenerationStage,
  EditorGameCanvasSession,
} from "@/hooks/use-editor-session";
import type { StarterProjectLoadState } from "@/hooks/use-starter-project-generation";
import { getEditorRuntimeMode } from "@/runtime/editor-runtime-mode";
import {
  getTopDownPhaserTemplateState,
  phaserRuntimeAdapter,
} from "@/runtime/phaser";
import { useRef, useState, type ReactNode } from "react";

type EditorGameCanvasProps = {
  actions: EditorGameCanvasActions;
  canvas: EditorGameCanvasSession;
};

export function EditorGameCanvas({
  actions,
  canvas,
}: EditorGameCanvasProps) {
  const {
    currentGenerationStage,
    gameResetNonce,
    gameStatus,
    isGamePaused,
    loadState,
    runtimeWarnings,
  } = canvas;
  const { onGameStatusChange, onRegenerate, onReset, onTogglePaused } =
    actions;
  const gameHostRef = useRef<RuntimeIframeHostHandle | null>(null);
  const runtimeMode = getEditorRuntimeMode();
  const phaserTemplateState = getTopDownPhaserTemplateState();
  const shouldShowPhaserRuntime =
    runtimeMode === "phaser" &&
    phaserTemplateState.status === "valid" &&
    (loadState.status === "idle" || loadState.status === "success");
  const shouldShowPhaserValidationError =
    runtimeMode === "phaser" &&
    phaserTemplateState.status === "invalid" &&
    loadState.status !== "loading";
  const shouldShowCanvasInitial =
    runtimeMode === "canvas2d" && loadState.status === "idle";
  const shouldShowCanvasRuntime =
    runtimeMode === "canvas2d" && loadState.status === "success";
  const hasMountedRuntime = shouldShowPhaserRuntime || shouldShowCanvasRuntime;
  const canPauseRuntime =
    hasMountedRuntime &&
    (gameStatus.state === "ready" || gameStatus.state === "paused");
  const canResetRuntime =
    hasMountedRuntime &&
    (gameStatus.state === "ready" ||
      gameStatus.state === "paused" ||
      gameStatus.state === "error");
  const toggleGamePaused = () => {
    if (!canPauseRuntime) {
      return;
    }

    onTogglePaused();

    window.setTimeout(() => {
      gameHostRef.current?.focusGame();
    }, 0);
  };

  const handleResetGame = () => {
    if (!canResetRuntime) {
      return;
    }

    onReset();
  };

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <RuntimeControls
        canPauseRuntime={canPauseRuntime}
        canResetRuntime={canResetRuntime}
        isGamePaused={isGamePaused}
        onReset={handleResetGame}
        onTogglePaused={toggleGamePaused}
      />
      {loadState.status !== "loading" ? (
        <>
          {gameStatus.state === "error" ? (
            <div className="flex flex-col gap-3 border border-[rgba(169,72,42,0.24)] bg-[rgba(255,243,236,0.92)] px-4 py-3 text-sm text-[#613128] sm:flex-row sm:items-center sm:justify-between">
              <div>Runtime error: {gameStatus.message}</div>
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center justify-center border border-[#9d4b31]/30 bg-[#9d4b31] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#81402b]"
              >
                Regenerate game
              </button>
            </div>
          ) : null}
          {runtimeWarnings.length > 0 ? (
            <RuntimeWarningPanel warnings={runtimeWarnings} />
          ) : null}
          {shouldShowCanvasInitial ? <InitialRuntimeScreen /> : null}
          {loadState.status === "error" ? (
            <RuntimeErrorScreen
              message={loadState.message}
              onRegenerate={onRegenerate}
            />
          ) : null}
          {shouldShowPhaserValidationError ? (
            <GameSpecValidationErrorScreen
              message={phaserTemplateState.message}
            />
          ) : null}
          {shouldShowPhaserRuntime ? (
            <RuntimeIframeHost
              ref={gameHostRef}
              key={`${phaserTemplateState.template.id}-${gameResetNonce}`}
              artifact={phaserTemplateState.template}
              runtimeAdapter={phaserRuntimeAdapter}
              isPaused={isGamePaused}
              focusOnReadyKey={gameResetNonce}
              frameLabel="Phaser runtime"
              frameDetail="Sandboxed iframe"
              onStatusChange={onGameStatusChange}
            />
          ) : null}
          {shouldShowCanvasRuntime ? (
            <GeneratedGameHost
              ref={gameHostRef}
              key={`${loadState.pack.manifest.title}-${gameResetNonce}`}
              pack={loadState.pack}
              isPaused={isGamePaused}
              focusOnReadyKey={gameResetNonce}
              onStatusChange={onGameStatusChange}
            />
          ) : null}
        </>
      ) : (
        <LoadingRuntimeScreen stage={currentGenerationStage} />
      )}
    </section>
  );
}

function RuntimeWarningPanel({
  warnings,
}: {
  warnings: EditorGameCanvasSession["runtimeWarnings"];
}) {
  const [selectedWarningIndex, setSelectedWarningIndex] = useState(0);
  const visibleWarningIndex =
    warnings.length === 0
      ? 0
      : Math.min(selectedWarningIndex, warnings.length - 1);
  const warning = warnings[visibleWarningIndex];

  if (!warning) {
    return null;
  }

  const hasMultipleWarnings = warnings.length > 1;

  return (
    <div className="flex flex-col gap-3 border border-[#b7791f]/30 bg-[#fff7df] px-4 py-3 text-sm text-[#5a3a09] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a5b12]">
          <span>Mechanic warning</span>
          <span>Warning {visibleWarningIndex + 1} of {warnings.length}</span>
          <span>{warning.phase}</span>
        </div>
        <div className="mt-1 font-semibold text-[#3d2b08]">
          {warning.mechanicType} disabled
        </div>
        <p className="mt-1 text-sm leading-6 text-[#6b4810]">
          {warning.message}
        </p>
      </div>
      {hasMultipleWarnings ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous warning"
            onClick={() => {
              setSelectedWarningIndex((index) =>
                index <= 0 ? warnings.length - 1 : index - 1
              );
            }}
            className="inline-flex h-9 w-9 items-center justify-center border border-[#b7791f]/35 bg-white/45 text-sm font-semibold text-[#5a3a09] transition hover:bg-white"
          >
            {"<"}
          </button>
          <button
            type="button"
            aria-label="Next warning"
            onClick={() => {
              setSelectedWarningIndex((index) =>
                index >= warnings.length - 1 ? 0 : index + 1
              );
            }}
            className="inline-flex h-9 w-9 items-center justify-center border border-[#b7791f]/35 bg-white/45 text-sm font-semibold text-[#5a3a09] transition hover:bg-white"
          >
            {">"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RuntimeControls({
  canPauseRuntime,
  canResetRuntime,
  isGamePaused,
  onReset,
  onTogglePaused,
}: {
  canPauseRuntime: boolean;
  canResetRuntime: boolean;
  isGamePaused: boolean;
  onReset: () => void;
  onTogglePaused: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border border-[var(--line-strong)] bg-[rgba(255,249,242,0.82)] px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Runtime controls
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Reset restarts the runtime without regenerating.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <button
          type="button"
          disabled={!canPauseRuntime}
          onClick={onTogglePaused}
          className="inline-flex items-center justify-center border border-[var(--line)] bg-[rgba(21,18,14,0.08)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--muted)] disabled:opacity-55"
        >
          {isGamePaused ? "Resume game" : "Pause game"}
        </button>
        <button
          type="button"
          disabled={!canResetRuntime}
          onClick={onReset}
          className="inline-flex items-center justify-center border border-[var(--line)] bg-[var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[rgba(21,18,14,0.08)] disabled:text-[var(--muted)] disabled:opacity-55"
        >
          Reset game
        </button>
      </div>
    </div>
  );
}

function RuntimeScreenShell({
  children,
  statusLabel,
}: {
  children: ReactNode;
  statusLabel: string;
}) {
  return (
    <div className="flex h-full min-h-[440px] flex-col border border-[var(--line-strong)] bg-[linear-gradient(180deg,_#18242f_0%,_#10171e_100%)] p-6 text-white">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/55">
        <span>Generated canvas</span>
        <span>{statusLabel}</span>
      </div>
      <div className="mt-6 flex flex-1 items-center justify-center border border-dashed border-white/15 bg-[radial-gradient(circle_at_top,_rgba(255,197,92,0.14),_transparent_34%),linear-gradient(135deg,_rgba(15,127,104,0.12),_transparent_42%)]">
        {children}
      </div>
    </div>
  );
}

function InitialRuntimeScreen() {
  return (
    <RuntimeScreenShell statusLabel="Ready">
      <div className="max-w-lg space-y-6 px-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <div className="h-12 w-12 rounded-full border border-white/15 bg-[radial-gradient(circle_at_center,_rgba(246,196,107,0.28),_transparent_62%)]" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            First magic moment
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
            The generated game module will boot here.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/65">
            Build a starter game to mount the canvas runtime in an isolated
            iframe.
          </p>
        </div>
      </div>
    </RuntimeScreenShell>
  );
}

function LoadingRuntimeScreen({ stage }: { stage: EditorGenerationStage }) {
  return (
    <RuntimeScreenShell statusLabel="Generating">
      <div className="w-full max-w-xl space-y-6 px-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <div className="h-12 w-12 rounded-full border-2 border-white/10 border-t-[#f6c46b] border-r-[#0f7f68] animate-spin" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            Generating your game
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
            {stage.title}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/65">
            {stage.detail}
          </p>
        </div>
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,_#f6c46b,_#0f7f68)] transition-[width] duration-700 ease-out"
              style={{
                width: `${stage.progress}%`,
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            <span>AI is building the starter</span>
            <span>{stage.progress}%</span>
          </div>
        </div>
      </div>
    </RuntimeScreenShell>
  );
}

function RuntimeErrorScreen({
  message,
  onRegenerate,
}: {
  message: Extract<StarterProjectLoadState, { status: "error" }>["message"];
  onRegenerate: () => void;
}) {
  return (
    <RuntimeScreenShell statusLabel="Error">
      <div className="max-w-xl space-y-6 px-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#9d4b31]/30 bg-[#9d4b31]/10">
          <div className="h-12 w-12 rounded-full border-2 border-[#9d4b31]/35 border-t-[#f6c46b]" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f1b7a3]">
            Generation stopped
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
            The runtime could not be prepared.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/65">
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center justify-center border border-[#f1b7a3]/30 bg-[#9d4b31] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#81402b]"
        >
          Try again
        </button>
      </div>
    </RuntimeScreenShell>
  );
}

function GameSpecValidationErrorScreen({ message }: { message: string }) {
  return (
    <RuntimeScreenShell statusLabel="Validation stopped">
      <div className="max-w-2xl space-y-6 px-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#f1b7a3]/30 bg-[#9d4b31]/10">
          <div className="h-12 w-12 rounded-full border-2 border-[#9d4b31]/35 border-t-[#f6c46b]" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f1b7a3]">
            Game Spec validation failed
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
            The runtime was not started.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/65">
            {message}
          </p>
        </div>
      </div>
    </RuntimeScreenShell>
  );
}
