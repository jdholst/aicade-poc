import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RuntimeIframeStatus } from "@/components/runtime-iframe-host";
import {
  createInitialGamePack,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  type FirstPlayableValidationAttempt,
} from "@/game-spec";
import type {
  EditorGameCanvasActions,
  EditorGameCanvasSession,
} from "@/hooks/use-editor-session";
import type { EditorRuntimeMode } from "@/runtime/editor-runtime-mode";
import type { TopDownPhaserTemplateState } from "@/runtime/phaser";

type FirstPlayableValidationState = {
  attempt: FirstPlayableValidationAttempt;
  key: string;
};

type UseFirstPlayableValidationGateInput = {
  gameResetNonce: EditorGameCanvasSession["gameResetNonce"];
  loadStateStatus: EditorGameCanvasSession["loadState"]["status"];
  onGameStatusChange: EditorGameCanvasActions["onGameStatusChange"];
  phaserTemplateState: TopDownPhaserTemplateState;
  runtimeMode: EditorRuntimeMode;
};

export type FirstPlayableValidationGate = {
  firstPlayableValidationAttempt: FirstPlayableValidationAttempt | null;
  handleRuntimeStatusChange: (status: RuntimeIframeStatus) => void;
};

export function useFirstPlayableValidationGate({
  gameResetNonce,
  loadStateStatus,
  onGameStatusChange,
  phaserTemplateState,
  runtimeMode,
}: UseFirstPlayableValidationGateInput): FirstPlayableValidationGate {
  const validationSeed = useMemo(
    () =>
      createFirstPlayableValidationSeed({
        gameResetNonce,
        loadStateStatus,
        phaserTemplateState,
        runtimeMode,
      }),
    [gameResetNonce, loadStateStatus, phaserTemplateState, runtimeMode]
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

  return {
    firstPlayableValidationAttempt: activeValidationState?.attempt ?? null,
    handleRuntimeStatusChange,
  };
}

function createFirstPlayableValidationSeed({
  gameResetNonce,
  loadStateStatus,
  phaserTemplateState,
  runtimeMode,
}: {
  gameResetNonce: EditorGameCanvasSession["gameResetNonce"];
  loadStateStatus: EditorGameCanvasSession["loadState"]["status"];
  phaserTemplateState: TopDownPhaserTemplateState;
  runtimeMode: EditorRuntimeMode;
}): FirstPlayableValidationState | null {
  if (
    runtimeMode !== "phaser" ||
    phaserTemplateState.status !== "valid" ||
    (loadStateStatus !== "idle" && loadStateStatus !== "success")
  ) {
    return null;
  }

  const gamePack = createInitialGamePack({
    gameSpec: phaserTemplateState.template.gameSpec,
    runtimeKind: "phaser",
  });
  const key = `${gamePack.id}-${gameResetNonce}-${loadStateStatus}`;

  return {
    key,
    attempt: startFirstPlayableValidation({
      gamePack,
      startedAt: new Date().toISOString(),
    }),
  };
}
