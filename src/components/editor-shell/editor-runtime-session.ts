"use client";

import { useEffect, useMemo, useRef } from "react";

import type { RuntimeIframeStatus } from "@/components/runtime-iframe-host";
import {
  createGamePackPersistenceKey,
  createIndexedDbGenerationRunRepository,
  finalizeGenerationRunFromFirstPlayable,
  type FirstPlayableValidationAttempt,
  type GamePackRepository,
  type GenerationRunRepository,
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
  generationRunRepository?: Pick<GenerationRunRepository, "update"> | null;
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
  generationRunRepository,
  onGameStatusChange,
}: UseEditorRuntimeSessionInput): EditorRuntimeSession {
  const { gameResetNonce, loadState } = canvas;
  const activeGeneratedSpec =
    loadState.status === "success" && loadState.source === "phaser-spec"
      ? canvas.activeGeneratedSpec
      : null;
  const lastPersistedGamePackKeyRef = useRef<string | null>(null);
  const resolvedGenerationRunRepository = useMemo(
    () => generationRunRepository ?? getBrowserGenerationRunRepository(),
    [generationRunRepository]
  );
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
        activeGeneratedSpec,
        generationSource: canvas.generationSource,
        restoredGamePack,
      }),
    [activeGeneratedSpec, canvas.generationSource, restoredGamePack]
  );
  const {
    firstPlayableGenerationRunId,
    firstPlayableGamePack,
    firstPlayableValidationAttempt,
    handleRuntimeStatusChange,
    handleRuntimeValidationEvidence,
  } = useFirstPlayableValidationGate({
    generationRunRepository: resolvedGenerationRunRepository,
    gameResetNonce,
    loadStateStatus: loadState.status,
    onGameStatusChange,
    readyPolicy:
      runtimeTemplate.type === "phaser-valid"
        ? runtimeTemplate.readyPolicy
        : undefined,
    validationSource: runtimeTemplate.firstPlayableValidationSource,
  });
  const persistencePolicy =
    runtimeTemplate.type === "phaser-valid"
      ? runtimeTemplate.persistencePolicy
      : null;

  useEffect(() => {
    if (
      gamePackPersistenceStatus !== "loaded" ||
      persistencePolicy !== "persist-after-first-playable" ||
      firstPlayableValidationAttempt?.status !== "passed" ||
      !firstPlayableGamePack
    ) {
      return;
    }

    const passedAttempt = firstPlayableValidationAttempt;
    const gamePackKey = createGamePackPersistenceKey(firstPlayableGamePack);

    if (lastPersistedGamePackKeyRef.current === gamePackKey) {
      return;
    }

    lastPersistedGamePackKeyRef.current = gamePackKey;
    void persistValidatedGamePack(firstPlayableGamePack)
      .then((savedGamePack) => {
        if (
          !savedGamePack ||
          !firstPlayableGenerationRunId ||
          !resolvedGenerationRunRepository
        ) {
          return;
        }

        return finalizeGenerationRunFromFirstPlayable({
          attempt: passedAttempt,
          completedAt: savedGamePack.updatedAt,
          gamePack: savedGamePack,
          generationRunId: firstPlayableGenerationRunId,
          repository: resolvedGenerationRunRepository,
        });
      })
      .catch(() => {
        lastPersistedGamePackKeyRef.current = null;
      });
  }, [
    firstPlayableGenerationRunId,
    firstPlayableGamePack,
    firstPlayableValidationAttempt,
    gamePackPersistenceStatus,
    persistencePolicy,
    persistValidatedGamePack,
    resolvedGenerationRunRepository,
  ]);

  return {
    firstPlayableValidationAttempt,
    handleRuntimeStatusChange,
    handleRuntimeValidationEvidence,
    runtimeTemplate,
  };
}

function getBrowserGenerationRunRepository():
  | Pick<GenerationRunRepository, "update">
  | null {
  if (typeof globalThis.indexedDB === "undefined") {
    return null;
  }

  return createIndexedDbGenerationRunRepository();
}
