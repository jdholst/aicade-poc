"use client";

import { useEffect, useMemo, useRef } from "react";

import type { RuntimeIframeStatus } from "@/components/runtime-iframe-host";
import {
  createGamePackPersistenceKey,
  type FirstPlayableValidationAttempt,
  type GamePackRepository,
} from "@/game-spec";
import type { RuntimeValidationEvidence } from "@/runtime/runtime-adapter";
import type {
  EditorGameCanvasActions,
  EditorGameCanvasSession,
} from "@/hooks/use-editor-session";

import { useFirstPlayableValidationGate } from "./editor-first-playable-validation-gate";
import { useEditorGamePackPersistence } from "./editor-game-pack-persistence";
import {
  createEditorRuntimeTemplatePlan,
  type EditorRuntimeTemplatePlan,
} from "./editor-runtime-template-plan";

export type UseEditorRuntimeSessionInput = {
  canvas: EditorGameCanvasSession;
  gamePackRepository?: GamePackRepository;
  onGameStatusChange: EditorGameCanvasActions["onGameStatusChange"];
};

export type EditorRuntimeSession = {
  firstPlayableValidationAttempt: FirstPlayableValidationAttempt | null;
  handleRuntimeStatusChange: (status: RuntimeIframeStatus) => void;
  handleRuntimeValidationEvidence: (
    evidence: RuntimeValidationEvidence
  ) => void;
  runtimeTemplate: EditorRuntimeTemplatePlan;
};

export function useEditorRuntimeSession({
  canvas,
  gamePackRepository,
  onGameStatusChange,
}: UseEditorRuntimeSessionInput): EditorRuntimeSession {
  const { gameResetNonce, loadState } = canvas;
  const generatedGamePack =
    loadState.status === "success" && loadState.source === "phaser-spec"
      ? loadState.gamePack
      : null;
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
        generationSource: canvas.generationSource,
        restoredGamePack: generatedGamePack ?? restoredGamePack,
      }),
    [canvas.generationSource, generatedGamePack, restoredGamePack]
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

    const gamePackKey = createGamePackPersistenceKey(firstPlayableGamePack);

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

  return {
    firstPlayableValidationAttempt,
    handleRuntimeStatusChange,
    handleRuntimeValidationEvidence,
    runtimeTemplate,
  };
}
