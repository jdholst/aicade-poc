import { type RefObject, useEffect, useMemo, useRef } from "react";

import type {
  RuntimeIframeHostHandle,
  RuntimeIframeStatus,
} from "@/components/runtime-iframe-host";
import type { GamePack, GamePackRepository } from "@/game-spec";
import type { RuntimeValidationEvidence } from "@/runtime/runtime-adapter";
import type {
  EditorGameCanvasActions,
  EditorGameCanvasSession,
} from "@/hooks/use-editor-session";

import { useFirstPlayableValidationGate } from "./editor-first-playable-validation-gate";
import { useEditorGamePackPersistence } from "./editor-game-pack-persistence";
import {
  createEditorRuntimePanelViewModel,
  type EditorRuntimePrimarySurface,
  type EditorRuntimeSecondarySurface,
} from "./editor-game-canvas-view-model";
import { createEditorRuntimeTemplatePlan } from "./editor-runtime-template-plan";
import { RuntimeControls } from "./editor-runtime-controls";
import { RuntimeErrorBanner } from "./editor-runtime-error-banner";
import { EditorRuntimeHostMount } from "./editor-runtime-host-mount";
import {
  FirstPlayableValidationBlockedScreen,
  GameSpecValidationErrorScreen,
  InitialRuntimeScreen,
  LoadingRuntimeScreen,
  RuntimeErrorScreen,
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
  const { gameResetNonce, isGamePaused, loadState } = canvas;
  const { onGameStatusChange, onRegenerate, onReset, onTogglePaused } =
    actions;
  const gameHostRef = useRef<RuntimeIframeHostHandle | null>(null);
  const lastPersistedGamePackKeyRef = useRef<string | null>(null);
  const {
    loadStatus: gamePackPersistenceStatus,
    persistValidatedGamePack,
    restoredGamePack,
  } = useEditorGamePackPersistence({
    repository: gamePackRepository,
  });
  const runtimeTemplate = useMemo(
    () =>
      createEditorRuntimeTemplatePlan({
        restoredGamePack,
      }),
    [restoredGamePack]
  );
  const {
    firstPlayableGamePack,
    firstPlayableValidationAttempt,
    handleRuntimeStatusChange,
    handleRuntimeValidationEvidence,
  } = useFirstPlayableValidationGate({
    gameResetNonce,
    loadStateStatus: loadState.status,
    onGameStatusChange,
    validationSource: runtimeTemplate.firstPlayableValidationSource,
  });

  useEffect(() => {
    if (
      gamePackPersistenceStatus !== "loaded" ||
      firstPlayableValidationAttempt?.status !== "passed" ||
      !firstPlayableGamePack
    ) {
      return;
    }

    const gamePackKey = createPersistedGamePackKey(firstPlayableGamePack);

    if (lastPersistedGamePackKeyRef.current === gamePackKey) {
      return;
    }

    lastPersistedGamePackKeyRef.current = gamePackKey;
    void persistValidatedGamePack(firstPlayableGamePack).catch(() => {
      lastPersistedGamePackKeyRef.current = null;
    });
  }, [
    firstPlayableGamePack,
    firstPlayableValidationAttempt?.status,
    gamePackPersistenceStatus,
    persistValidatedGamePack,
  ]);

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

function createPersistedGamePackKey(gamePack: GamePack) {
  return [
    gamePack.id,
    gamePack.updatedAt,
    gamePack.builds.length,
    gamePack.checkpoints.length,
    gamePack.validationEvidence.length,
  ].join(":");
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

  if (surface.type === "canvas-initial") {
    return <InitialRuntimeScreen />;
  }

  if (surface.type === "generation-error") {
    return (
      <RuntimeErrorScreen
        message={surface.message}
        onRegenerate={onRegenerate}
      />
    );
  }

  if (surface.type === "phaser-validation-error") {
    return <GameSpecValidationErrorScreen message={surface.message} />;
  }

  if (surface.type === "first-playable-validation-error") {
    return (
      <FirstPlayableValidationBlockedScreen
        debugReceipts={surface.debugReceipts}
        onRegenerate={onRegenerate}
        onReset={onReset}
        summary={surface.summary}
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
