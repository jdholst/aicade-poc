import { useRef } from "react";

import type { RuntimeIframeHostHandle } from "@/components/runtime-iframe-host";
import type {
  EditorGameCanvasActions,
  EditorGameCanvasSession,
} from "@/hooks/use-editor-session";
import { getEditorRuntimeMode } from "@/runtime/editor-runtime-mode";
import { getTopDownPhaserTemplateState } from "@/runtime/phaser";

import { createEditorRuntimePanelViewModel } from "./editor-game-canvas-view-model";
import { RuntimeControls } from "./editor-runtime-controls";
import { RuntimeErrorBanner } from "./editor-runtime-error-banner";
import { EditorRuntimeHostMount } from "./editor-runtime-host-mount";
import {
  GameSpecValidationErrorScreen,
  InitialRuntimeScreen,
  LoadingRuntimeScreen,
  RuntimeErrorScreen,
} from "./editor-runtime-screens";
import { RuntimeWarningPanel } from "./editor-runtime-warning-panel";

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
  const runtimePanel = createEditorRuntimePanelViewModel({
    canvas,
    phaserTemplateState,
    runtimeMode,
  });

  const toggleGamePaused = () => {
    if (!runtimePanel.canPauseRuntime) {
      return;
    }

    onTogglePaused();

    window.setTimeout(() => {
      gameHostRef.current?.focusGame();
    }, 0);
  };

  const handleResetGame = () => {
    if (!runtimePanel.canResetRuntime) {
      return;
    }

    onReset();
  };

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <RuntimeControls
        canPauseRuntime={runtimePanel.canPauseRuntime}
        canResetRuntime={runtimePanel.canResetRuntime}
        isGamePaused={isGamePaused}
        onReset={handleResetGame}
        onTogglePaused={toggleGamePaused}
      />
      {runtimePanel.isLoading ? (
        <LoadingRuntimeScreen stage={currentGenerationStage} />
      ) : (
        <>
          {runtimePanel.showRuntimeErrorBanner &&
          gameStatus.state === "error" ? (
            <RuntimeErrorBanner
              message={gameStatus.message}
              onRegenerate={onRegenerate}
            />
          ) : null}
          {runtimePanel.showWarningPanel ? (
            <RuntimeWarningPanel warnings={runtimeWarnings} />
          ) : null}
          {runtimePanel.showCanvasInitial ? <InitialRuntimeScreen /> : null}
          {runtimePanel.showGenerationError && loadState.status === "error" ? (
            <RuntimeErrorScreen
              message={loadState.message}
              onRegenerate={onRegenerate}
            />
          ) : null}
          {runtimePanel.showPhaserValidationError ? (
            <GameSpecValidationErrorScreen
              message={runtimePanel.phaserValidationErrorMessage ?? ""}
            />
          ) : null}
          <EditorRuntimeHostMount
            focusOnReadyKey={gameResetNonce}
            host={runtimePanel.host}
            hostRef={gameHostRef}
            isPaused={isGamePaused}
            onStatusChange={onGameStatusChange}
          />
        </>
      )}
    </section>
  );
}
