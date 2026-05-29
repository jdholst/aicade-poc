import { GENERATION_TIMEOUT_MS } from "@/constants";
import type { EditorGenerationSource } from "@/runtime/editor-runtime-mode";
import {
  requestTopDownSpecGeneration,
  SpecGenerationClientError,
  type SpecGenerationValidationFailure,
  type TopDownSpecGenerationClientResult,
} from "@/service/spec-generation";
import {
  requestStarterProject,
  type StarterProjectRequest,
} from "@/service/starter-project/starter-project-client";
import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";

export const GENERATION_RUN_TIMEOUT_MESSAGE =
  "Generation took longer than two minutes. Please retry; the model may have stalled while creating or validating the game module.";

export type EditorGenerationRunCompletion =
  | { status: "cancelled" }
  | {
      status: "error";
      message: string;
      reason: "request-failed" | "timed-out";
      validationFailure?: SpecGenerationValidationFailure;
    }
  | {
      status: "success";
      pack: GeneratedGamePack;
      source: "canvas-starter";
    }
  | ({
      status: "success";
      source: "phaser-spec";
    } & TopDownSpecGenerationClientResult);

type TimerId = ReturnType<typeof globalThis.setTimeout>;

type EditorGenerationRunTimer = {
  clearTimeout: (timeoutId: TimerId) => void;
  setTimeout: (handler: () => void, timeoutMs: number) => TimerId;
};

type StartEditorGenerationRunInput = {
  generationSource: EditorGenerationSource;
  request: StarterProjectRequest;
  requestCanvasStarterProject?: typeof requestStarterProject;
  requestPhaserSpecGeneration?: typeof requestTopDownSpecGeneration;
  timeoutMs?: number;
  timer?: EditorGenerationRunTimer;
};

export type EditorGenerationRun = {
  abort: () => void;
  done: Promise<EditorGenerationRunCompletion>;
};

export function startEditorGenerationRun({
  generationSource,
  request,
  requestCanvasStarterProject = requestStarterProject,
  requestPhaserSpecGeneration = requestTopDownSpecGeneration,
  timeoutMs = GENERATION_TIMEOUT_MS,
  timer = globalThis,
}: StartEditorGenerationRunInput): EditorGenerationRun {
  const abortController = new AbortController();
  let didTimeOut = false;
  let timeoutId: TimerId | undefined;

  const done = (async (): Promise<EditorGenerationRunCompletion> => {
    if (generationSource === "phaser-fixture") {
      return { status: "cancelled" };
    }

    try {
      timeoutId = timer.setTimeout(() => {
        didTimeOut = true;
        abortController.abort();
      }, timeoutMs);

      return await Promise.race([
        runGenerationAdapter({
          generationSource,
          request,
          requestCanvasStarterProject,
          requestPhaserSpecGeneration,
          signal: abortController.signal,
        }),
        waitForAbort(abortController.signal, () =>
          didTimeOut
            ? {
                status: "error",
                reason: "timed-out",
                message: GENERATION_RUN_TIMEOUT_MESSAGE,
              }
            : { status: "cancelled" }
        ),
      ]);
    } catch (error) {
      if (abortController.signal.aborted) {
        return didTimeOut
          ? {
              status: "error",
              reason: "timed-out",
              message: GENERATION_RUN_TIMEOUT_MESSAGE,
            }
          : { status: "cancelled" };
      }

      return createRequestFailure(error);
    } finally {
      if (timeoutId !== undefined) {
        timer.clearTimeout(timeoutId);
      }
    }
  })();

  return {
    abort: () => abortController.abort(),
    done,
  };
}

async function runGenerationAdapter({
  generationSource,
  request,
  requestCanvasStarterProject,
  requestPhaserSpecGeneration,
  signal,
}: {
  generationSource: Exclude<EditorGenerationSource, "phaser-fixture">;
  request: StarterProjectRequest;
  requestCanvasStarterProject: typeof requestStarterProject;
  requestPhaserSpecGeneration: typeof requestTopDownSpecGeneration;
  signal: AbortSignal;
}): Promise<EditorGenerationRunCompletion> {
  if (generationSource === "phaser-ai") {
    const result = await requestPhaserSpecGeneration(request, signal);

    return {
      status: "success",
      source: "phaser-spec",
      ...result,
    };
  }

  const pack = await requestCanvasStarterProject(request, signal);

  return {
    status: "success",
    source: "canvas-starter",
    pack,
  };
}

function waitForAbort(
  signal: AbortSignal,
  createCompletion: () => EditorGenerationRunCompletion
): Promise<EditorGenerationRunCompletion> {
  if (signal.aborted) {
    return Promise.resolve(createCompletion());
  }

  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(createCompletion()), {
      once: true,
    });
  });
}

function createRequestFailure(error: unknown): EditorGenerationRunCompletion {
  const message =
    error instanceof Error
      ? error.message
      : "Generated game creation failed.";
  const validationFailure =
    error instanceof SpecGenerationClientError
      ? error.validationFailure
      : undefined;

  return {
    status: "error",
    reason: "request-failed",
    message,
    ...(validationFailure ? { validationFailure } : {}),
  };
}
