import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RuntimeIframeStatus } from "@/components/runtime-iframe-host";
import {
  createInitialGamePack,
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  type FirstPlayableValidationAttempt,
} from "@/game-spec";
import type { RuntimeValidationEvidence } from "@/runtime/runtime-adapter";
import type {
  EditorGameCanvasActions,
  EditorGameCanvasSession,
} from "@/hooks/use-editor-session";

import type { FirstPlayableValidationSource } from "./editor-runtime-template-plan";

type FirstPlayableValidationState = {
  attempt: FirstPlayableValidationAttempt;
  key: string;
};

type UseFirstPlayableValidationGateInput = {
  gameResetNonce: EditorGameCanvasSession["gameResetNonce"];
  loadStateStatus: EditorGameCanvasSession["loadState"]["status"];
  onGameStatusChange: EditorGameCanvasActions["onGameStatusChange"];
  validationSource: FirstPlayableValidationSource | null;
};

export type FirstPlayableValidationGate = {
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
  validationSource,
}: UseFirstPlayableValidationGateInput): FirstPlayableValidationGate {
  const validationSeed = useMemo(
    () =>
      createFirstPlayableValidationSeed({
        gameResetNonce,
        loadStateStatus,
        validationSource,
      }),
    [gameResetNonce, loadStateStatus, validationSource]
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

      const nextValidationState = {
        key: currentValidationState.key,
        attempt: nextAttempt,
      };

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

      const nextValidationState = {
        key: currentValidationState.key,
        attempt: nextAttempt,
      };

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
      }
    },
    [onGameStatusChange, validationSeed]
  );

  return {
    firstPlayableValidationAttempt: activeValidationState?.attempt ?? null,
    handleRuntimeStatusChange,
    handleRuntimeValidationEvidence,
  };
}

function createFirstPlayableValidationSeed({
  gameResetNonce,
  loadStateStatus,
  validationSource,
}: {
  gameResetNonce: EditorGameCanvasSession["gameResetNonce"];
  loadStateStatus: EditorGameCanvasSession["loadState"]["status"];
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
  const key = `${gamePack.id}-${gameResetNonce}-${loadStateStatus}`;

  return {
    key,
    attempt: startFirstPlayableValidation({
      gamePack,
      runtimeCandidate: validationSource.runtimeCandidate,
      startedAt: new Date().toISOString(),
    }),
  };
}
