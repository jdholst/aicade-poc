"use client";

import { useEffect, useMemo, useRef } from "react";

import type { RuntimeIframeStatus } from "@/components/runtime-iframe-host";
import {
  attachFinalizedGenerationRunToGamePack,
  createGamePackPersistenceKey,
  createIndexedDbGenerationRunRepository,
  finalizeGenerationRunFromFirstPlayable,
  writeCreatorGenerationPersistenceTransaction,
  type FirstPlayableValidationAttempt,
  type GamePack,
  type GamePackRepository,
  type GenerationRun,
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
  generationRunRepository?: Pick<
    GenerationRunRepository,
    "fetch" | "list" | "update"
  > | null;
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
  const activeGamePack =
    loadState.status === "success" && loadState.source === "phaser-game-pack"
      ? loadState.gamePack
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
    generationRunRepository: resolvedGenerationRunRepository,
    repository: gamePackRepository,
  });
  const runtimeTemplate = useMemo(
    () =>
      createEditorRuntimeTemplatePlan({
        activeGamePack,
        activeGeneratedSpec,
        generationSource: canvas.generationSource,
        restoredGamePack,
      }),
    [activeGamePack, activeGeneratedSpec, canvas.generationSource, restoredGamePack]
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
    void persistFirstPlayableGamePack({
      attempt: passedAttempt,
      gamePack: firstPlayableGamePack,
      generationRunId: firstPlayableGenerationRunId,
      generationRunRepository: resolvedGenerationRunRepository,
      persistValidatedGamePack,
    }).catch(async (error: unknown) => {
        lastPersistedGamePackKeyRef.current = null;
        const isFinalizationFailure =
          error instanceof EditorGenerationRunFinalizationError;
        const isFinalGamePackWriteFailure =
          isFinalizationFailure && error.phase === "final_game_pack_write";
        onGameStatusChange({
          state: "error",
          message: isFinalGamePackWriteFailure
            ? "The generation receipt was finalized, but its final Game Pack linkage could not be saved, so generation remains blocked."
            : isFinalizationFailure
              ? "The validated game was saved, but its generation receipt could not be finalized, so generation remains blocked."
            : "The validated game could not be saved, so generation remains blocked.",
        });

        if (
          !firstPlayableGenerationRunId ||
          !resolvedGenerationRunRepository
        ) {
          return;
        }

        try {
          const completedAt = new Date().toISOString();
          await resolvedGenerationRunRepository.update(
            firstPlayableGenerationRunId,
            (generationRun) => {
              const canCompensateSucceededRun = Boolean(
                isFinalGamePackWriteFailure &&
                  error.pendingGamePack &&
                  attachFinalizedGenerationRunToGamePack({
                    gamePack: error.pendingGamePack,
                    generationRun,
                  })
              );
              if (
                generationRun.status !== "running" &&
                !canCompensateSucceededRun
              ) {
                return generationRun;
              }

              const failedGenerationRun = { ...generationRun };
              delete failedGenerationRun.relationships;
              delete failedGenerationRun.repairStatus;

              return {
                ...failedGenerationRun,
                status: "failed" as const,
                completedAt,
                durationMs: Math.max(
                  0,
                  Date.parse(completedAt) - Date.parse(generationRun.startedAt)
                ),
                stage: "artifact-build" as const,
                failureClass: "build-failure" as const,
                metadata: {
                  ...(generationRun.metadata ?? {}),
                  creatorGenerationPersistenceFailure: {
                    code: isFinalGamePackWriteFailure
                      ? "game_pack_finalization_failed"
                      : isFinalizationFailure
                        ? "generation_run_finalization_failed"
                      : "game_pack_persistence_failed",
                    message:
                      error instanceof Error
                        ? error.message.slice(0, 500)
                        : "Validated GamePack persistence failed.",
                  },
                },
              };
            }
          );
        } catch {
          // The blocking runtime status remains authoritative when the receipt
          // repository is also unavailable.
        }
      });
  }, [
    firstPlayableGenerationRunId,
    firstPlayableGamePack,
    firstPlayableValidationAttempt,
    gamePackPersistenceStatus,
    persistencePolicy,
    persistValidatedGamePack,
    resolvedGenerationRunRepository,
    onGameStatusChange,
  ]);

  return {
    firstPlayableValidationAttempt,
    handleRuntimeStatusChange,
    handleRuntimeValidationEvidence,
    runtimeTemplate,
  };
}

async function persistFirstPlayableGamePack({
  attempt,
  gamePack,
  generationRunId,
  generationRunRepository,
  persistValidatedGamePack,
}: Readonly<{
  attempt: FirstPlayableValidationAttempt;
  gamePack: GamePack;
  generationRunId: GenerationRun["id"] | null;
  generationRunRepository: Pick<
    GenerationRunRepository,
    "fetch" | "list" | "update"
  > | null;
  persistValidatedGamePack: ReturnType<
    typeof useEditorGamePackPersistence
  >["persistValidatedGamePack"];
}>) {
  if (!generationRunId || !generationRunRepository) {
    return persistValidatedGamePack(gamePack);
  }

  const pendingGamePack = writeCreatorGenerationPersistenceTransaction({
    gamePack,
    generationRunId,
    status: "pending",
  });
  const savedGamePack = await persistValidatedGamePack(pendingGamePack);

  if (!savedGamePack) {
    return null;
  }

  let finalizedGamePack: GamePack;
  try {
    await finalizeGenerationRunFromFirstPlayable({
      attempt,
      completedAt: savedGamePack.updatedAt,
      gamePack: savedGamePack,
      generationRunId,
      repository: generationRunRepository,
    });

    const finalizedGenerationRun =
      await generationRunRepository.fetch(generationRunId);
    const exactFinalizedGamePack = finalizedGenerationRun
      ? attachFinalizedGenerationRunToGamePack({
          gamePack: savedGamePack,
          generationRun: finalizedGenerationRun,
        })
      : null;

    if (!exactFinalizedGamePack) {
      throw new Error(
        "The GenerationRun did not finalize with exact Game Pack relationships."
      );
    }
    finalizedGamePack = exactFinalizedGamePack;
  } catch (error) {
    throw new EditorGenerationRunFinalizationError({
      cause: error,
      pendingGamePack: savedGamePack,
      phase: "generation_run_finalization",
    });
  }

  try {
    return await persistValidatedGamePack(finalizedGamePack);
  } catch (error) {
    throw new EditorGenerationRunFinalizationError({
      cause: error,
      pendingGamePack: savedGamePack,
      phase: "final_game_pack_write",
    });
  }
}

class EditorGenerationRunFinalizationError extends Error {
  readonly cause: unknown;
  readonly pendingGamePack: GamePack;
  readonly phase: "generation_run_finalization" | "final_game_pack_write";

  constructor({
    cause,
    pendingGamePack,
    phase,
  }: Readonly<{
    cause: unknown;
    pendingGamePack: GamePack;
    phase: EditorGenerationRunFinalizationError["phase"];
  }>) {
    super(
      cause instanceof Error
        ? cause.message
        : "The GenerationRun could not be finalized."
    );
    this.name = "EditorGenerationRunFinalizationError";
    this.cause = cause;
    this.pendingGamePack = pendingGamePack;
    this.phase = phase;
  }
}

function getBrowserGenerationRunRepository():
  | Pick<GenerationRunRepository, "fetch" | "list" | "update">
  | null {
  if (typeof globalThis.indexedDB === "undefined") {
    return null;
  }

  return createIndexedDbGenerationRunRepository();
}
