import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RuntimeIframeStatus } from "@/components/runtime-iframe-host";
import {
  createIndexedDbGenerationRunRepository,
  createInitialGamePack,
  finalizeGenerationRunFromFirstPlayable,
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  writeFirstPlayableTerminalResult,
  type FirstPlayableValidationAttempt,
  type GamePack,
  type GenerationRun,
  type GenerationRunRepository,
} from "@/game-spec";
import type { JsonValue } from "@/game-spec/game-spec-schema";
import type { RuntimeValidationEvidence } from "@/runtime/runtime-adapter";
import type {
  EditorGameCanvasActions,
  EditorGameCanvasSession,
} from "@/hooks/use-editor-session";
import type { PlayableDraftReadyPolicy } from "@/runtime/playable-draft-source";

import type { FirstPlayableValidationSource } from "./editor-runtime-template-plan";

type FirstPlayableValidationState = {
  attempt: FirstPlayableValidationAttempt;
  generationRunId?: GenerationRun["id"];
  gamePack: GamePack;
  key: string;
  readyPolicy: PlayableDraftReadyPolicy;
  resultWritten: boolean;
  source: FirstPlayableValidationSource["source"];
};

type UseFirstPlayableValidationGateInput = {
  generationRunRepository?: Pick<GenerationRunRepository, "update"> | null;
  gameResetNonce: EditorGameCanvasSession["gameResetNonce"];
  loadStateStatus: EditorGameCanvasSession["loadState"]["status"];
  onGameStatusChange: EditorGameCanvasActions["onGameStatusChange"];
  readyPolicy?: PlayableDraftReadyPolicy;
  validationSource: FirstPlayableValidationSource | null;
};

export type FirstPlayableValidationGate = {
  firstPlayableGenerationRunId: GenerationRun["id"] | null;
  firstPlayableGamePack: GamePack | null;
  firstPlayableValidationAttempt: FirstPlayableValidationAttempt | null;
  handleRuntimeStatusChange: (status: RuntimeIframeStatus) => void;
  handleRuntimeValidationEvidence: (
    evidence: RuntimeValidationEvidence
  ) => void;
};

export function useFirstPlayableValidationGate({
  generationRunRepository,
  gameResetNonce,
  loadStateStatus,
  onGameStatusChange,
  readyPolicy = "ready-on-runtime-ready",
  validationSource,
}: UseFirstPlayableValidationGateInput): FirstPlayableValidationGate {
  const resolvedGenerationRunRepository = useMemo(
    () => generationRunRepository ?? getBrowserGenerationRunRepository(),
    [generationRunRepository]
  );
  const validationSeed = useMemo(
    () =>
      createFirstPlayableValidationSeed({
        gameResetNonce,
        loadStateStatus,
        readyPolicy,
        validationSource,
      }),
    [gameResetNonce, loadStateStatus, readyPolicy, validationSource]
  );
  const [runtimeValidationState, setRuntimeValidationState] =
    useState<FirstPlayableValidationState | null>(validationSeed);
  const activeValidationState =
    runtimeValidationState?.key === validationSeed?.key
      ? runtimeValidationState
      : validationSeed;
  const activeValidationStateRef =
    useRef<FirstPlayableValidationState | null>(activeValidationState);
  const finalizedSeedGenerationRunKeyRef = useRef<string | null>(null);

  useEffect(() => {
    activeValidationStateRef.current = activeValidationState;
  }, [activeValidationState]);

  useEffect(() => {
    if (
      !activeValidationState ||
      !activeValidationState.generationRunId ||
      !activeValidationState.resultWritten ||
      activeValidationState.attempt.status !== "failed" ||
      !resolvedGenerationRunRepository
    ) {
      return;
    }

    const finalizationKey = [
      activeValidationState.generationRunId,
      activeValidationState.key,
      activeValidationState.attempt.status,
    ].join(":");

    if (finalizedSeedGenerationRunKeyRef.current === finalizationKey) {
      return;
    }

    finalizedSeedGenerationRunKeyRef.current = finalizationKey;

    void finalizeGenerationRunFromFirstPlayable({
      attempt: activeValidationState.attempt,
      completedAt: new Date().toISOString(),
      gamePack: activeValidationState.gamePack,
      generationRunId: activeValidationState.generationRunId,
      repository: resolvedGenerationRunRepository,
    });
  }, [activeValidationState, resolvedGenerationRunRepository]);

  const handleRuntimeStatusChange = useCallback(
    (status: RuntimeIframeStatus) => {
      const currentValidationState =
        activeValidationStateRef.current?.key === validationSeed?.key
          ? activeValidationStateRef.current
          : validationSeed;

      if (!currentValidationState) {
        onGameStatusChange(status);
        return;
      }

      const nextAttempt = recordFirstPlayableRuntimeStatus({
        attempt: currentValidationState.attempt,
        observedAt: new Date().toISOString(),
        status,
      });

      const terminalResult = writeFirstPlayableTerminalResult({
        currentValidationState,
        attempt: nextAttempt,
        generationRunRepository: resolvedGenerationRunRepository,
      });
      const nextValidationState = terminalResult.state;
      void terminalResult.generationRunFinalization;

      activeValidationStateRef.current = nextValidationState;

      if (nextAttempt !== currentValidationState.attempt) {
        setRuntimeValidationState(nextValidationState);
      }

      if (nextAttempt.shouldBlockPlayable && nextAttempt.status === "failed") {
        onGameStatusChange({
          state: "error",
          message:
            nextAttempt.failureMessage ??
            "First-playable validation failed.",
        });
        return;
      }

      if (
        status.state === "ready" &&
        currentValidationState.readyPolicy === "ready-after-first-playable" &&
        nextAttempt.status !== "passed"
      ) {
        return;
      }

      onGameStatusChange(status);
    },
    [onGameStatusChange, resolvedGenerationRunRepository, validationSeed]
  );

  const handleRuntimeValidationEvidence = useCallback(
    (evidence: RuntimeValidationEvidence) => {
      const currentValidationState =
        activeValidationStateRef.current?.key === validationSeed?.key
          ? activeValidationStateRef.current
          : validationSeed;

      if (!currentValidationState) {
        return;
      }

      const nextAttempt = recordFirstPlayableRuntimeEvidence({
        attempt: currentValidationState.attempt,
        evidence,
        observedAt: new Date().toISOString(),
      });

      const terminalResult = writeFirstPlayableTerminalResult({
        currentValidationState,
        attempt: nextAttempt,
        generationRunRepository: resolvedGenerationRunRepository,
      });
      const nextValidationState = terminalResult.state;
      void terminalResult.generationRunFinalization;

      activeValidationStateRef.current = nextValidationState;

      if (nextAttempt !== currentValidationState.attempt) {
        setRuntimeValidationState(nextValidationState);
      }

      if (nextAttempt.shouldBlockPlayable && nextAttempt.status === "failed") {
        onGameStatusChange({
          state: "error",
          message:
            nextAttempt.failureMessage ??
            "First-playable validation failed.",
        });
        return;
      }

      if (
        currentValidationState.readyPolicy === "ready-after-first-playable" &&
        nextAttempt.status === "passed"
      ) {
        onGameStatusChange({ state: "ready" });
      }
    },
    [onGameStatusChange, resolvedGenerationRunRepository, validationSeed]
  );

  return {
    firstPlayableGenerationRunId:
      activeValidationState?.generationRunId ?? null,
    firstPlayableGamePack: activeValidationState?.gamePack ?? null,
    firstPlayableValidationAttempt: activeValidationState?.attempt ?? null,
    handleRuntimeStatusChange,
    handleRuntimeValidationEvidence,
  };
}

function createFirstPlayableValidationSeed({
  gameResetNonce,
  loadStateStatus,
  readyPolicy,
  validationSource,
}: {
  gameResetNonce: EditorGameCanvasSession["gameResetNonce"];
  loadStateStatus: EditorGameCanvasSession["loadState"]["status"];
  readyPolicy: PlayableDraftReadyPolicy;
  validationSource: FirstPlayableValidationSource | null;
}): FirstPlayableValidationState | null {
  if (
    !validationSource ||
    (loadStateStatus !== "idle" && loadStateStatus !== "success")
  ) {
    return null;
  }

  const gamePack = createInitialGamePack({
    gameSpec: validationSource.gameSpec,
    metadata: createGamePackMetadataFromValidationSource(validationSource),
    runtimeKind: validationSource.runtimeKind,
  });
  const restoredGamePack = validationSource.gamePack;
  const activeGamePack = restoredGamePack ?? gamePack;
  const validationSourceKey = restoredGamePack
    ? [
        restoredGamePack.id,
        restoredGamePack.updatedAt,
        restoredGamePack.builds.length,
        restoredGamePack.checkpoints.length,
      ].join("-")
    : activeGamePack.id;
  const key = `${validationSourceKey}-${gameResetNonce}-${loadStateStatus}`;

  const attempt = startFirstPlayableValidation({
    gamePack: activeGamePack,
    runtimeCandidate: validationSource.runtimeCandidate,
    startedAt: new Date().toISOString(),
  });

  return writeFirstPlayableTerminalResult({
    currentValidationState: {
      ...(validationSource.generationRunId
        ? { generationRunId: validationSource.generationRunId }
        : {}),
      key,
      gamePack: activeGamePack,
      attempt,
      readyPolicy,
      resultWritten: false,
      source: validationSource.source,
    },
    attempt,
    generationRunRepository: null,
  }).state;
}

function createGamePackMetadataFromValidationSource(
  validationSource: FirstPlayableValidationSource
): Record<string, JsonValue> | undefined {
  if (validationSource.source !== "generated-spec") {
    return undefined;
  }

  const generatedSpec: Record<string, JsonValue> = {
    source: "phaser-spec",
    ...(validationSource.generationRunId
      ? { generationRunId: validationSource.generationRunId }
      : {}),
    ...(validationSource.generatedSpecMetadata
      ? {
          attemptCount: validationSource.generatedSpecMetadata.attemptCount,
          model: validationSource.generatedSpecMetadata.model,
          taskRoute: validationSource.generatedSpecMetadata.taskRoute,
        }
      : {}),
  };

  return {
    generatedSpec,
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
