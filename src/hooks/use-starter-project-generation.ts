"use client";

import { useCallback, useEffect, useState } from "react";

import {
  requestStarterProject,
  type StarterProjectRequest,
} from "@/service/starter-project/starter-project-client";
import { GENERATION_TIMEOUT_MS } from "@/constants";
import { type GeneratedGamePack } from "@/service/starter-project/starter-project-schema";
import {
  SpecGenerationClientError,
  requestTopDownSpecGeneration,
  type SpecGenerationValidationFailure,
  type TopDownSpecGenerationClientResult,
} from "@/service/spec-generation";
import type { EditorGenerationSource } from "@/runtime/editor-runtime-mode";

export type StarterProjectLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; pack: GeneratedGamePack; source: "canvas-starter" }
  | ({
      status: "success";
      source: "phaser-spec";
    } & TopDownSpecGenerationClientResult)
  | {
      status: "error";
      message: string;
      validationFailure?: SpecGenerationValidationFailure;
    };

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

    const activeGenerationRequest = generationRequest;
    const controller = new AbortController();
    let didTimeOut = false;
    let timeoutId: number | undefined;

    async function loadStarterProject() {
      setGenerationStepIndex(0);
      setLoadState({ status: "loading" });

      try {
        timeoutId = window.setTimeout(() => {
          didTimeOut = true;
          controller.abort();
        }, GENERATION_TIMEOUT_MS);

        if (generationSource === "phaser-ai") {
          const result = await requestTopDownSpecGeneration(
            activeGenerationRequest,
            controller.signal
          );

          setLoadState({
            status: "success",
            source: "phaser-spec",
            ...result,
          });
        } else {
          const pack = await requestStarterProject(
            activeGenerationRequest,
            controller.signal
          );

          setLoadState({
            status: "success",
            source: "canvas-starter",
            pack,
          });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          if (didTimeOut) {
            onGenerationFailed?.();
            setLoadState({
              status: "error",
              message:
                "Generation took longer than two minutes. Please retry; the model may have stalled while creating or validating the game module.",
            });
          }

          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Generated game creation failed.";
        const validationFailure =
          error instanceof SpecGenerationClientError
            ? error.validationFailure
            : undefined;

        onGenerationFailed?.();
        setLoadState({
          status: "error",
          message,
          ...(validationFailure ? { validationFailure } : {}),
        });
      } finally {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
      }
    }

    void loadStarterProject();

    return () => controller.abort();
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
