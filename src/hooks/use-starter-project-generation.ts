"use client";

import { useCallback, useEffect, useState } from "react";

import type { EditorGenerationSource } from "@/runtime/editor-runtime-mode";
import {
  startEditorGenerationRun,
  type EditorGenerationRunCompletion,
} from "@/service/generation-run";
import type { StarterProjectRequest } from "@/service/starter-project/starter-project-client";

type StarterProjectGenerationSuccess = Extract<
  EditorGenerationRunCompletion,
  { status: "success" }
>;

type StarterProjectGenerationError = Pick<
  Extract<EditorGenerationRunCompletion, { status: "error" }>,
  "generatedMechanicFailure" | "message" | "status" | "validationFailure"
>;

export type StarterProjectLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | StarterProjectGenerationSuccess
  | StarterProjectGenerationError;

type GenerationRequest = StarterProjectRequest & {
  id: number;
};

type UseStarterProjectGenerationOptions = {
  generationSource: EditorGenerationSource;
  generationStageCount: number;
  onGenerationFailed?: () => void;
  onGenerationStarted: () => void;
};

export function useStarterProjectGeneration({
  generationSource,
  generationStageCount,
  onGenerationFailed,
  onGenerationStarted,
}: UseStarterProjectGenerationOptions) {
  const [loadState, setLoadState] = useState<StarterProjectLoadState>({
    status: "idle",
  });
  const [generationRequest, setGenerationRequest] =
    useState<GenerationRequest | null>(null);
  const [generationStepIndex, setGenerationStepIndex] = useState(0);

  const startGenerationRequest = useCallback(
    (request: StarterProjectRequest) => {
      if (generationSource === "phaser-fixture") {
        return;
      }

      onGenerationStarted();
      setGenerationStepIndex(0);
      setLoadState({ status: "loading" });
      setGenerationRequest((currentRequest) => ({
        ...request,
        id: (currentRequest?.id ?? 0) + 1,
      }));
    },
    [generationSource, onGenerationStarted]
  );

  useEffect(() => {
    if (!generationRequest) {
      return;
    }

    const run = startEditorGenerationRun({
      generationSource,
      request: generationRequest,
    });

    void run.done.then((completion) => {
      if (completion.status === "cancelled") {
        return;
      }

      if (completion.status === "error") {
        onGenerationFailed?.();
        setLoadState({
          status: "error",
          message: completion.message,
          ...(completion.generatedMechanicFailure
            ? {
                generatedMechanicFailure:
                  completion.generatedMechanicFailure,
              }
            : {}),
          ...(completion.validationFailure
            ? { validationFailure: completion.validationFailure }
            : {}),
        });
        return;
      }

      setLoadState(completion);
    });

    return () => run.abort();
  }, [generationRequest, generationSource, onGenerationFailed]);

  useEffect(() => {
    if (loadState.status !== "loading") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setGenerationStepIndex((currentIndex) =>
        Math.min(currentIndex + 1, Math.max(generationStageCount - 1, 0))
      );
    }, 1800);

    return () => window.clearInterval(intervalId);
  }, [generationStageCount, loadState.status]);

  return {
    generationStepIndex,
    loadState,
    startGenerationRequest,
  };
}
