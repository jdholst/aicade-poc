import { GENERATION_TIMEOUT_MS } from "@/constants";
import {
  createIndexedDbGenerationRunRepository,
  type GenerationRun,
  type GenerationRunRepository,
} from "@/game-spec";
import type { EditorGenerationSource } from "@/runtime/editor-runtime-mode";
import {
  requestTopDownSpecGeneration,
  SpecGenerationClientError,
  type TopDownSpecGenerationClientOptions,
  type SpecGenerationValidationFailure,
  type TopDownSpecGenerationClientResult,
} from "@/service/spec-generation";
import {
  requestStarterProject,
  type StarterProjectRequest,
} from "@/service/starter-project/starter-project-client";
import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";

import {
  createPhaserGenerationRunReceiptLifecycle,
  type PhaserGenerationRunReceiptLifecycle,
} from "./phaser-generation-run-receipt-lifecycle";

export const GENERATION_RUN_TIMEOUT_MESSAGE =
  "Generation took longer than two minutes. Please retry; the model may have stalled while creating or validating the game module.";

export type EditorGenerationRunCompletion =
  | { generationRunId?: GenerationRun["id"]; status: "cancelled" }
  | {
      generationRunId?: GenerationRun["id"];
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
      generationRunId?: GenerationRun["id"];
      status: "success";
      source: "phaser-spec";
    } & TopDownSpecGenerationClientResult);

type TimerId = ReturnType<typeof globalThis.setTimeout>;

type EditorGenerationRunTimer = {
  clearTimeout: (timeoutId: TimerId) => void;
  setTimeout: (handler: () => void, timeoutMs: number) => TimerId;
};

type StartEditorGenerationRunInput = {
  createGenerationRunId?: () => GenerationRun["id"];
  generationRunRepository?: Pick<GenerationRunRepository, "create" | "update"> | null;
  generationSource: EditorGenerationSource;
  now?: () => string;
  request: StarterProjectRequest;
  requestCanvasStarterProject?: typeof requestStarterProject;
  requestPhaserSpecGeneration?: (
    request: StarterProjectRequest,
    signal?: AbortSignal,
    options?: TopDownSpecGenerationClientOptions
  ) => Promise<TopDownSpecGenerationClientResult>;
  timeoutMs?: number;
  timer?: EditorGenerationRunTimer;
};

export type EditorGenerationRun = {
  abort: () => void;
  done: Promise<EditorGenerationRunCompletion>;
};

export function startEditorGenerationRun({
  createGenerationRunId,
  generationRunRepository = getBrowserGenerationRunRepository(),
  generationSource,
  now = () => new Date().toISOString(),
  request,
  requestCanvasStarterProject = requestStarterProject,
  requestPhaserSpecGeneration = requestTopDownSpecGeneration,
  timeoutMs = GENERATION_TIMEOUT_MS,
  timer = globalThis,
}: StartEditorGenerationRunInput): EditorGenerationRun {
  const abortController = new AbortController();
  let didTimeOut = false;
  const receiptLifecycle = createPhaserGenerationRunReceiptLifecycle({
    createGenerationRunId,
    generationSource,
    now,
    repository: generationRunRepository,
    request,
  });
  const generationRunId = receiptLifecycle.generationRunId;
  let timeoutId: TimerId | undefined;

  const done = (async (): Promise<EditorGenerationRunCompletion> => {
    if (generationSource === "phaser-fixture") {
      return { status: "cancelled" };
    }

    try {
      await receiptLifecycle.createInitialReceipt();

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
          receiptLifecycle,
          signal: abortController.signal,
        }),
        waitForAbort(abortController.signal, async () => {
          await receiptLifecycle.recordSpecGenerationInterruption(
            didTimeOut ? "timed-out" : "cancelled"
          );

          return didTimeOut
            ? {
                ...(generationRunId ? { generationRunId } : {}),
                status: "error",
                reason: "timed-out",
                message: GENERATION_RUN_TIMEOUT_MESSAGE,
              }
            : {
                ...(generationRunId ? { generationRunId } : {}),
                status: "cancelled",
              };
        }),
      ]);
    } catch (error) {
      if (abortController.signal.aborted) {
        await receiptLifecycle.recordSpecGenerationInterruption(
          didTimeOut ? "timed-out" : "cancelled"
        );

        return didTimeOut
          ? {
              ...(generationRunId ? { generationRunId } : {}),
              status: "error",
              reason: "timed-out",
              message: GENERATION_RUN_TIMEOUT_MESSAGE,
            }
          : {
              ...(generationRunId ? { generationRunId } : {}),
              status: "cancelled",
            };
      }

      await receiptLifecycle.recordSpecGenerationFailure(error);

      return createRequestFailure(error, generationRunId);
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
  receiptLifecycle,
  request,
  requestCanvasStarterProject,
  requestPhaserSpecGeneration,
  signal,
}: {
  generationSource: Exclude<EditorGenerationSource, "phaser-fixture">;
  receiptLifecycle: PhaserGenerationRunReceiptLifecycle;
  request: StarterProjectRequest;
  requestCanvasStarterProject: typeof requestStarterProject;
  requestPhaserSpecGeneration: (
    request: StarterProjectRequest,
    signal?: AbortSignal,
    options?: TopDownSpecGenerationClientOptions
  ) => Promise<TopDownSpecGenerationClientResult>;
  signal: AbortSignal;
}): Promise<EditorGenerationRunCompletion> {
  if (generationSource === "phaser-ai") {
    const result = receiptLifecycle.generationRunId
      ? await requestPhaserSpecGeneration(request, signal, {
          generationRunId: receiptLifecycle.generationRunId,
        })
      : await requestPhaserSpecGeneration(request, signal);

    await receiptLifecycle.recordSpecGenerationSuccess(result);

    return {
      ...(receiptLifecycle.generationRunId
        ? { generationRunId: receiptLifecycle.generationRunId }
        : {}),
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
  createCompletion: () =>
    | EditorGenerationRunCompletion
    | Promise<EditorGenerationRunCompletion>
): Promise<EditorGenerationRunCompletion> {
  if (signal.aborted) {
    return Promise.resolve(createCompletion());
  }

  return new Promise((resolve) => {
    signal.addEventListener("abort", () => void resolve(createCompletion()), {
      once: true,
    });
  });
}

function createRequestFailure(
  error: unknown,
  generationRunId?: GenerationRun["id"]
): EditorGenerationRunCompletion {
  const message =
    error instanceof Error
      ? error.message
      : "Generated game creation failed.";
  const validationFailure =
    error instanceof SpecGenerationClientError
      ? error.validationFailure
      : undefined;

  return {
    ...(generationRunId ? { generationRunId } : {}),
    status: "error",
    reason: "request-failed",
    message,
    ...(validationFailure ? { validationFailure } : {}),
  };
}

function getBrowserGenerationRunRepository():
  | Pick<GenerationRunRepository, "create" | "update">
  | null {
  if (typeof globalThis.indexedDB === "undefined") {
    return null;
  }

  return createIndexedDbGenerationRunRepository();
}
