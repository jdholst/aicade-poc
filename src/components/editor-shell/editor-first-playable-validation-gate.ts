import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RuntimeIframeStatus } from "@/components/runtime-iframe-host";
import {
  createInitialGamePack,
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  type FirstPlayableValidationAttempt,
  type GamePack,
  writeFirstPlayableValidationResult,
} from "@/game-spec";
import type { RuntimeValidationEvidence } from "@/runtime/runtime-adapter";
import type {
  EditorGameCanvasActions,
  EditorGameCanvasSession,
} from "@/hooks/use-editor-session";
import type { PlayableDraftReadyPolicy } from "@/runtime/playable-draft-source";

import type { FirstPlayableValidationSource } from "./editor-runtime-template-plan";

type FirstPlayableValidationState = {
  attempt: FirstPlayableValidationAttempt;
  gamePack: GamePack;
  key: string;
  readyPolicy: PlayableDraftReadyPolicy;
  resultWritten: boolean;
  source: FirstPlayableValidationSource["source"];
};

type UseFirstPlayableValidationGateInput = {
  gameResetNonce: EditorGameCanvasSession["gameResetNonce"];
  loadStateStatus: EditorGameCanvasSession["loadState"]["status"];
  onGameStatusChange: EditorGameCanvasActions["onGameStatusChange"];
  readyPolicy?: PlayableDraftReadyPolicy;
  validationSource: FirstPlayableValidationSource | null;
};

export type FirstPlayableValidationGate = {
  firstPlayableGamePack: GamePack | null;
  firstPlayableValidationAttempt: FirstPlayableValidationAttempt | null;
  handleRuntimeStatusChange: (status: RuntimeIframeStatus) => void;
  handleRuntimeValidationEvidence: (
    evidence: RuntimeValidationEvidence
  ) => void;
};

export function useFirstPlayableValidationGate({
  gameResetNonce,
  loadStateStatus,
  onGameStatusChange,
  readyPolicy = "ready-on-runtime-ready",
  validationSource,
}: UseFirstPlayableValidationGateInput): FirstPlayableValidationGate {
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

  useEffect(() => {
    activeValidationStateRef.current = activeValidationState;
  }, [activeValidationState]);

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

      const nextValidationState = writeTerminalValidationResult({
        currentValidationState,
        attempt: nextAttempt,
      });

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
    [onGameStatusChange, validationSeed]
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

      const nextValidationState = writeTerminalValidationResult({
        currentValidationState,
        attempt: nextAttempt,
      });

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
    [onGameStatusChange, validationSeed]
  );

  return {
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

  return writeTerminalValidationResult({
    currentValidationState: {
      key,
      gamePack: activeGamePack,
      attempt,
      readyPolicy,
      resultWritten: false,
      source: validationSource.source,
    },
    attempt,
  });
}

function writeTerminalValidationResult({
  currentValidationState,
  attempt,
}: {
  currentValidationState: FirstPlayableValidationState;
  attempt: FirstPlayableValidationAttempt;
}): FirstPlayableValidationState {
  if (attempt.status === "running" || currentValidationState.resultWritten) {
    return {
      ...currentValidationState,
      attempt,
    };
  }

  const nextGamePack = writeFirstPlayableValidationResult({
    gamePack: currentValidationState.gamePack,
    attempt,
    completedAt: new Date().toISOString(),
  });

  return {
    ...currentValidationState,
    attempt,
    gamePack: nextGamePack,
    resultWritten: true,
  };
}
