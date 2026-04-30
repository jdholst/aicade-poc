"use client";

import { useCallback, useEffect, useState } from "react";

import {
  requestStarterProject,
  type StarterProjectRequest,
} from "@/service/starter-project/starter-project-client";
import { type GeneratedGamePack } from "@/service/starter-project";

export type StarterProjectLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; pack: GeneratedGamePack }
  | { status: "error"; message: string };

type GenerationRequest = StarterProjectRequest & {
  id: number;
};

type UseStarterProjectGenerationOptions = {
  generationStageCount: number;
  onGenerationStarted: () => void;
};

export function useStarterProjectGeneration({
  generationStageCount,
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
      onGenerationStarted();
      setGenerationStepIndex(0);
      setLoadState({ status: "loading" });
      setGenerationRequest((currentRequest) => ({
        ...request,
        id: (currentRequest?.id ?? 0) + 1,
      }));
    },
    [onGenerationStarted]
  );

  useEffect(() => {
    if (!generationRequest) {
      return;
    }

    const activeGenerationRequest = generationRequest;
    const controller = new AbortController();

    async function loadStarterProject() {
      setGenerationStepIndex(0);
      setLoadState({ status: "loading" });

      try {

        const pack = await requestStarterProject(
          activeGenerationRequest,
          controller.signal
        );

        setLoadState({
          status: "success",
          pack,
        });
      } catch (error) {

        const message =
          error instanceof Error
            ? error.message
            : "Generated game creation failed.";

        setLoadState({
          status: "error",
          message,
        });
      }
    }

    void loadStarterProject();

    return () => controller.abort();
  }, [generationRequest]);

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
