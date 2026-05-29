import { type RefObject, useRef } from "react";

import type {
  RuntimeIframeHostHandle,
  RuntimeIframeStatus,
} from "@/components/runtime-iframe-host";
import type { GamePackRepository } from "@/game-spec";
import type { RuntimeValidationEvidence } from "@/runtime/runtime-adapter";
import type {
  EditorGameCanvasActions,
  EditorGameCanvasSession,
} from "@/hooks/use-editor-session";

import {
  createEditorRuntimePanelViewModel,
  type EditorRuntimePrimarySurface,
  type EditorRuntimeSecondarySurface,
} from "./editor-game-canvas-view-model";
import { RuntimeControls } from "./editor-runtime-controls";
import { RuntimeErrorBanner } from "./editor-runtime-error-banner";
import { EditorRuntimeHostMount } from "./editor-runtime-host-mount";
import { useEditorRuntimeSession } from "./editor-runtime-session";
import {
  FirstPlayableValidationBlockedScreen,
  GameSpecValidationErrorScreen,
  InitialRuntimeScreen,
  LoadingRuntimeScreen,
} from "./editor-runtime-screens";
import { RuntimeWarningPanel } from "./editor-runtime-warning-panel";

type EditorGameCanvasProps = {
  actions: EditorGameCanvasActions;
  canvas: EditorGameCanvasSession;
  gamePackRepository?: GamePackRepository;
};

export function EditorGameCanvas({
  actions,
  canvas,
  gamePackRepository,
}: EditorGameCanvasProps) {
  const { gameResetNonce, isGamePaused } = canvas;
  const { onGameStatusChange, onRegenerate, onReset, onTogglePaused } =
    actions;
  const gameHostRef = useRef<RuntimeIframeHostHandle | null>(null);
  const {
    firstPlayableValidationAttempt,
    handleRuntimeStatusChange,
    handleRuntimeValidationEvidence,
    runtimeTemplate,
  } = useEditorRuntimeSession({
    canvas,
    gamePackRepository,
    onGameStatusChange,
  });

  const runtimePanel = createEditorRuntimePanelViewModel({
    canvas,
    firstPlayableValidationAttempt,
    runtimeTemplate,
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
      {runtimePanel.secondarySurfaces.map((surface) =>
        renderRuntimeSecondarySurface({
          onRegenerate,
          surface,
        })
      )}
      {renderRuntimePrimarySurface({
        focusOnReadyKey: gameResetNonce,
        hostRef: gameHostRef,
        isPaused: isGamePaused,
        onRegenerate,
        onReset,
        onStatusChange: handleRuntimeStatusChange,
        onValidationEvidence: handleRuntimeValidationEvidence,
        surface: runtimePanel.primarySurface,
      })}
    </section>
  );
}

function renderRuntimeSecondarySurface({
  onRegenerate,
  surface,
}: {
  onRegenerate: () => void;
  surface: EditorRuntimeSecondarySurface;
}) {
  if (surface.type === "runtime-error-banner") {
    return (
      <RuntimeErrorBanner
        key="runtime-error-banner"
        message={surface.message}
        onRegenerate={onRegenerate}
      />
    );
  }

  return (
    <RuntimeWarningPanel
      key="runtime-warning-panel"
      warnings={surface.warnings}
    />
  );
}

function renderRuntimePrimarySurface({
  focusOnReadyKey,
  hostRef,
  isPaused,
  onRegenerate,
  onReset,
  onStatusChange,
  onValidationEvidence,
  surface,
}: {
  focusOnReadyKey: number;
  hostRef: RefObject<RuntimeIframeHostHandle | null>;
  isPaused: boolean;
  onRegenerate: () => void;
  onReset: () => void;
  onStatusChange: (status: RuntimeIframeStatus) => void;
  onValidationEvidence: (evidence: RuntimeValidationEvidence) => void;
  surface: EditorRuntimePrimarySurface;
}) {
  if (surface.type === "loading") {
    return <LoadingRuntimeScreen stage={surface.stage} />;
  }

  if (surface.type === "initial") {
    return (
      <InitialRuntimeScreen
        description={surface.description}
        eyebrow={surface.eyebrow}
        surfaceLabel={surface.surfaceLabel}
        title={surface.title}
      />
    );
  }

  if (surface.type === "generation-error") {
    return (
      <GameSpecValidationErrorScreen
        debugReceipts={surface.failure.debugReceipts}
        eyebrow="Generation stopped"
        message={surface.failure.summary}
        onRegenerate={onRegenerate}
        statusLabel="Generation stopped"
        title="The runtime could not be prepared."
      />
    );
  }

  if (surface.type === "phaser-validation-error") {
    return (
      <GameSpecValidationErrorScreen
        debugReceipts={surface.failure.debugReceipts}
        message={surface.failure.summary}
        onRegenerate={surface.canRegenerate ? onRegenerate : undefined}
      />
    );
  }

  if (surface.type === "first-playable-validation-error") {
    return (
      <FirstPlayableValidationBlockedScreen
        debugReceipts={surface.failure.debugReceipts}
        onRegenerate={onRegenerate}
        onReset={onReset}
        summary={surface.failure.summary}
      />
    );
  }

  return (
    <EditorRuntimeHostMount
      focusOnReadyKey={focusOnReadyKey}
      host={surface.host}
      hostRef={hostRef}
      isPaused={isPaused}
      onStatusChange={onStatusChange}
      onValidationEvidence={onValidationEvidence}
    />
  );
}
