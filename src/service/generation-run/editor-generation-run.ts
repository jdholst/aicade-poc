import { GENERATION_TIMEOUT_MS } from "@/constants";
import {
  type GamePack,
  createIndexedDbGenerationRunRepository,
  type GenerationRun,
  type GenerationRunRepository,
} from "@/game-spec";
import {
  dispatchCreatorGenerationPlan,
  CreatorGenerationRoutingError,
  type CreatorGenerationPlanClientResult,
  type ContinueGeneratedMechanicGeneration,
} from "@/service/creator-generation/creator-game-generation-dispatcher";
import {
  continueGeneratedMechanicGeneration,
  type ContinueGeneratedMechanicGenerationResult,
} from "@/service/creator-generation/continue-generated-mechanic-generation";
import { requestTopDownCreatorGenerationPlanning } from "@/service/creator-generation-planning/creator-generation-planning-client";
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
export const GENERATED_MECHANIC_GENERATION_TIMEOUT_MS = 600_000;
export const GENERATED_MECHANIC_GENERATION_TIMEOUT_MESSAGE =
  "Generated mechanic creation timed out before it could finish evaluation and browser validation. Please retry the request.";

export type EditorGenerationRunCompletion =
  | { generationRunId?: GenerationRun["id"]; status: "cancelled" }
  | {
      generationRunId?: GenerationRun["id"];
      status: "error";
      message: string;
      reason: "request-failed" | "timed-out";
      generatedMechanicFailure?: GeneratedMechanicGenerationFailureEvidence;
      validationFailure?: SpecGenerationValidationFailure;
    }
  | {
      status: "success";
      pack: GeneratedGamePack;
      source: "canvas-starter";
    }
  | {
      generationRunId: GenerationRun["id"];
      gamePack: GamePack;
      status: "success";
      source: "phaser-game-pack";
    }
  | ({
      generationRunId?: GenerationRun["id"];
      status: "success";
      source: "phaser-spec";
    } & TopDownSpecGenerationClientResult);

type TimerId = ReturnType<typeof globalThis.setTimeout>;

export type GeneratedMechanicGenerationFailureEvidence = Extract<
  ContinueGeneratedMechanicGenerationResult,
  { outcome: "rejected" }
>["evidence"];

class GeneratedMechanicGenerationError extends Error {
  readonly evidence: GeneratedMechanicGenerationFailureEvidence;

  constructor(evidence: GeneratedMechanicGenerationFailureEvidence) {
    super(evidence.issues.map(({ message }) => message).join(" "));
    this.name = "GeneratedMechanicGenerationError";
    this.evidence = evidence;
  }
}

type EditorGenerationRunTimer = {
  clearTimeout: (timeoutId: TimerId) => void;
  setTimeout: (handler: () => void, timeoutMs: number) => TimerId;
};

type StartEditorGenerationRunInput = {
  continueGeneratedMechanicGeneration?: ContinueGeneratedMechanicGeneration<ContinueGeneratedMechanicGenerationResult>;
  createGenerationRunId?: () => GenerationRun["id"];
  generationRunRepository?: Pick<GenerationRunRepository, "create" | "update"> | null;
  generatedMechanicTimeoutMs?: number;
  generationSource: EditorGenerationSource;
  now?: () => string;
  request: StarterProjectRequest;
  requestCanvasStarterProject?: typeof requestStarterProject;
  requestPhaserSpecGeneration?: (
    request: StarterProjectRequest,
    signal?: AbortSignal,
    options?: TopDownSpecGenerationClientOptions
  ) => Promise<CreatorGenerationPlanClientResult>;
  timeoutMs?: number;
  timer?: EditorGenerationRunTimer;
};

export type EditorGenerationRun = {
  abort: () => void;
  done: Promise<EditorGenerationRunCompletion>;
};

export function startEditorGenerationRun({
  continueGeneratedMechanicGeneration: continueGeneratedMechanic = continueGeneratedMechanicGeneration,
  createGenerationRunId,
  generationRunRepository = getBrowserGenerationRunRepository(),
  generatedMechanicTimeoutMs = GENERATED_MECHANIC_GENERATION_TIMEOUT_MS,
  generationSource,
  now = () => new Date().toISOString(),
  request,
  requestCanvasStarterProject = requestStarterProject,
  requestPhaserSpecGeneration = requestCreatorGenerationPlan,
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
  let generatedMechanicDeadlineArmed = false;
  const armTimeout = (durationMs: number) => {
    if (timeoutId !== undefined) {
      timer.clearTimeout(timeoutId);
    }
    timeoutId = timer.setTimeout(() => {
      didTimeOut = true;
      abortController.abort("timed-out");
    }, durationMs);
  };

  const done = (async (): Promise<EditorGenerationRunCompletion> => {
    if (generationSource === "phaser-fixture") {
      return { status: "cancelled" };
    }

    try {
      await receiptLifecycle.createInitialReceipt();

      armTimeout(timeoutMs);

      const adapterPromise = runGenerationAdapter({
        generationSource,
        continueGeneratedMechanicGeneration: continueGeneratedMechanic,
        request,
        requestCanvasStarterProject,
        requestPhaserSpecGeneration,
        receiptLifecycle,
        signal: abortController.signal,
        onGeneratedMechanicRoute() {
          if (generatedMechanicDeadlineArmed) {
            return;
          }
          generatedMechanicDeadlineArmed = true;
          armTimeout(generatedMechanicTimeoutMs);
        },
      });
      return await Promise.race([
        adapterPromise,
        waitForAbort(abortController.signal, async () => {
          const interruptionResult =
            await receiptLifecycle.recordSpecGenerationInterruption(
              didTimeOut ? "timed-out" : "cancelled",
              generatedMechanicDeadlineArmed
                ? "generated_mechanic_continuation"
                : undefined
            );
          if (
            generatedMechanicDeadlineArmed &&
            interruptionResult !== "recorded"
          ) {
            return adapterPromise;
          }

          return didTimeOut
            ? {
                ...(generationRunId ? { generationRunId } : {}),
                status: "error",
                reason: "timed-out",
                message: generatedMechanicDeadlineArmed
                  ? GENERATED_MECHANIC_GENERATION_TIMEOUT_MESSAGE
                  : GENERATION_RUN_TIMEOUT_MESSAGE,
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
          didTimeOut ? "timed-out" : "cancelled",
          generatedMechanicDeadlineArmed
            ? "generated_mechanic_continuation"
            : undefined
        );

        return didTimeOut
          ? {
              ...(generationRunId ? { generationRunId } : {}),
              status: "error",
              reason: "timed-out",
              message: generatedMechanicDeadlineArmed
                ? GENERATED_MECHANIC_GENERATION_TIMEOUT_MESSAGE
                : GENERATION_RUN_TIMEOUT_MESSAGE,
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
    abort: () => abortController.abort("cancelled"),
    done,
  };
}

async function runGenerationAdapter({
  continueGeneratedMechanicGeneration,
  generationSource,
  receiptLifecycle,
  request,
  requestCanvasStarterProject,
  requestPhaserSpecGeneration,
  signal,
  onGeneratedMechanicRoute,
}: {
  continueGeneratedMechanicGeneration: ContinueGeneratedMechanicGeneration<ContinueGeneratedMechanicGenerationResult>;
  generationSource: Exclude<EditorGenerationSource, "phaser-fixture">;
  receiptLifecycle: PhaserGenerationRunReceiptLifecycle;
  request: StarterProjectRequest;
  requestCanvasStarterProject: typeof requestStarterProject;
  requestPhaserSpecGeneration: (
    request: StarterProjectRequest,
    signal?: AbortSignal,
    options?: TopDownSpecGenerationClientOptions
  ) => Promise<CreatorGenerationPlanClientResult>;
  signal: AbortSignal;
  onGeneratedMechanicRoute: () => void;
}): Promise<EditorGenerationRunCompletion> {
  if (generationSource === "phaser-ai") {
    const result = receiptLifecycle.generationRunId
      ? await requestPhaserSpecGeneration(request, signal, {
          generationRunId: receiptLifecycle.generationRunId,
        })
      : await requestPhaserSpecGeneration(request, signal);

    await receiptLifecycle.recordSpecGenerationSuccess(result);

    const dispatched = await dispatchCreatorGenerationPlan({
      continueGeneratedMechanicGeneration: (input) => {
        onGeneratedMechanicRoute();
        return continueGeneratedMechanicGeneration(input);
      },
      generationRunId: receiptLifecycle.generationRunId,
      plan: result,
      request,
      signal,
    });
    if (dispatched.kind === "rejected") {
      const message = dispatched.evidence.issues
        .map((issue) => issue.message)
        .join(" ");
      throw new CreatorGenerationRoutingError({
        message,
        routeKind: dispatched.routeKind,
        validationFailure: {
          attemptCount: result.metadata.attemptCount,
          ...(receiptLifecycle.generationRunId
            ? { generationRunId: receiptLifecycle.generationRunId }
            : {}),
          issues: dispatched.evidence.issues.map((issue) => ({ ...issue })),
          stage: "mechanic_validation",
          taskRoute: "spec_generation.primary",
        },
      });
    }
    if (dispatched.kind === "generated_mechanic") {
      if (dispatched.result.outcome === "rejected") {
        throw new GeneratedMechanicGenerationError(
          dispatched.result.evidence
        );
      }
      if (!receiptLifecycle.generationRunId) {
        throw new Error(
          "Generated mechanic acceptance requires its exact GenerationRun identity."
        );
      }
      return {
        generationRunId: receiptLifecycle.generationRunId,
        gamePack: dispatched.result.value.gamePack,
        status: "success",
        source: "phaser-game-pack",
      };
    }

    return {
      ...(receiptLifecycle.generationRunId
        ? { generationRunId: receiptLifecycle.generationRunId }
        : {}),
      status: "success",
      source: "phaser-spec",
      ...dispatched.result,
    };
  }

  const pack = await requestCanvasStarterProject(request, signal);

  return {
    status: "success",
    source: "canvas-starter",
    pack,
  };
}

function requestCreatorGenerationPlan(
  request: StarterProjectRequest,
  signal?: AbortSignal,
  options?: TopDownSpecGenerationClientOptions
): Promise<CreatorGenerationPlanClientResult> {
  return options?.generationRunId
    ? requestTopDownCreatorGenerationPlanning(request, signal, {
        generationRunId: options.generationRunId,
      })
    : requestTopDownSpecGeneration(request, signal);
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
  const generatedMechanicFailure =
    error instanceof GeneratedMechanicGenerationError
      ? error.evidence
      : undefined;

  return {
    ...(generationRunId ? { generationRunId } : {}),
    status: "error",
    reason: "request-failed",
    message,
    ...(generatedMechanicFailure ? { generatedMechanicFailure } : {}),
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
