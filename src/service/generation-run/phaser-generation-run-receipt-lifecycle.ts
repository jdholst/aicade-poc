import {
  type GenerationRun,
  type GenerationRunAttemptReceipt,
  type GenerationRunRepository,
} from "@/game-spec";
import type { EditorGenerationSource } from "@/runtime/editor-runtime-mode";
import {
  SpecGenerationClientError,
  type SpecGenerationRepairAttemptSummary,
  type SpecGenerationValidationFailure,
  type TopDownSpecGenerationClientResult,
} from "@/service/spec-generation";
import type { StarterProjectRequest } from "@/service/starter-project/starter-project-client";

export type PhaserGenerationRunReceiptLifecycle = {
  generationRunId?: GenerationRun["id"];
  createInitialReceipt: () => Promise<void>;
  recordSpecGenerationFailure: (error: unknown) => Promise<void>;
  recordSpecGenerationInterruption: (
    status: Extract<GenerationRun["status"], "cancelled" | "timed-out">
  ) => Promise<void>;
  recordSpecGenerationSuccess: (
    result: TopDownSpecGenerationClientResult
  ) => Promise<void>;
};

type CreatePhaserGenerationRunReceiptLifecycleInput = {
  createGenerationRunId?: () => GenerationRun["id"];
  generationSource: EditorGenerationSource;
  now?: () => string;
  repository?: Pick<GenerationRunRepository, "create" | "update"> | null;
  request: StarterProjectRequest;
};

export function createPhaserGenerationRunReceiptLifecycle({
  createGenerationRunId = createDefaultGenerationRunId,
  generationSource,
  now = () => new Date().toISOString(),
  repository,
  request,
}: CreatePhaserGenerationRunReceiptLifecycleInput): PhaserGenerationRunReceiptLifecycle {
  const generationRunId =
    generationSource === "phaser-ai" && repository
      ? createGenerationRunId()
      : undefined;
  let isPersistenceDisabled = false;

  return {
    ...(generationRunId ? { generationRunId } : {}),

    async createInitialReceipt() {
      if (!generationRunId || !repository) {
        return;
      }

      await persistGenerationRunReceipt(() =>
        createInitialPhaserGenerationRunReceipt({
          generationRunId,
          now,
          repository,
          request,
        })
      );
    },

    async recordSpecGenerationFailure(error) {
      if (!generationRunId || !repository) {
        return;
      }

      await persistGenerationRunReceipt(() =>
        recordFailedSpecGenerationAttempt({
          completedAt: now(),
          error,
          generationRunId,
          repository,
          request,
        })
      );
    },

    async recordSpecGenerationInterruption(status) {
      if (!generationRunId || !repository) {
        return;
      }

      await persistGenerationRunReceipt(() =>
        recordInterruptedSpecGenerationAttempt({
          completedAt: now(),
          generationRunId,
          repository,
          request,
          status,
        })
      );
    },

    async recordSpecGenerationSuccess(result) {
      if (!generationRunId || !repository) {
        return;
      }

      await persistGenerationRunReceipt(() =>
        recordSuccessfulSpecGenerationAttempt({
          completedAt: now(),
          generationRunId,
          repository,
          request,
          result,
        })
      );
    },
  };

  async function persistGenerationRunReceipt(persist: () => Promise<void>) {
    if (isPersistenceDisabled) {
      return;
    }

    try {
      await persist();
    } catch {
      isPersistenceDisabled = true;
    }
  }
}

async function createInitialPhaserGenerationRunReceipt({
  generationRunId,
  now,
  repository,
  request,
}: {
  generationRunId: GenerationRun["id"];
  now: () => string;
  repository: Pick<GenerationRunRepository, "create">;
  request: StarterProjectRequest;
}) {
  const startedAt = now();

  await repository.create({
    id: generationRunId,
    operationType: "generate",
    status: "running",
    createdAt: startedAt,
    startedAt,
    request: {
      summary: summarizePrompt(request.prompt),
      ...(request.prompt ? { promptText: request.prompt } : {}),
    },
    runtimeKind: "phaser",
    attempts: [],
  });
}

async function recordSuccessfulSpecGenerationAttempt({
  completedAt,
  generationRunId,
  repository,
  request,
  result,
}: {
  completedAt: string;
  generationRunId: GenerationRun["id"];
  repository: Pick<GenerationRunRepository, "update">;
  request: StarterProjectRequest;
  result: TopDownSpecGenerationClientResult;
}) {
  await repository.update(generationRunId, (generationRun) => {
    const startedAt = generationRun.startedAt;

    return {
      ...generationRun,
      templateId: result.spec.template.id,
      mechanicIds: result.spec.mechanics.map((mechanic) => mechanic.id),
      attempts: createSuccessfulSpecGenerationAttempts({
        completedAt,
        generationRunId,
        request,
        result,
        startedAt,
      }),
    };
  });
}

function createSuccessfulSpecGenerationAttempts({
  completedAt,
  generationRunId,
  request,
  result,
  startedAt,
}: {
  completedAt: string;
  generationRunId: GenerationRun["id"];
  request: StarterProjectRequest;
  result: TopDownSpecGenerationClientResult;
  startedAt: string;
}): GenerationRunAttemptReceipt[] {
  const finalAttemptNumber = result.metadata.attemptCount;
  const finalAttemptId = `${generationRunId}_attempt_${finalAttemptNumber}`;
  const validatedAttempt: GenerationRunAttemptReceipt = {
    id: finalAttemptId,
    attemptNumber: finalAttemptNumber,
    kind: result.metadata.repairStatus === "repaired" ? "repair" : "initial",
    status: "succeeded",
    provider: "openai",
    model: result.metadata.model,
    taskRoute: result.metadata.taskRoute,
    requestSummary: summarizePrompt(request.prompt),
    startedAt,
    completedAt,
    durationMs: getDurationMs(startedAt, completedAt),
    validation: {
      stage: "semantic-validation",
      status: "passed",
    },
    ...(result.metadata.repairStatus === "repaired"
      ? {
          repair: {
            sourceAttemptId: `${generationRunId}_attempt_${
              result.metadata.repairAttempts?.[0]?.attempt ?? 1
            }`,
            reason: "Repair attempt fixed validation issues from attempt 1.",
            validationIssueCount:
              result.metadata.repairAttempts?.[0]?.issues.length ?? 0,
          },
        }
      : {}),
    candidate: {
      kind: "validated_spec",
      gameSpecId: result.spec.id,
      summary: `Validated Phaser Game Spec "${result.spec.title}".`,
      referencedMechanicIds: result.spec.mechanics.map(
        (mechanic) => mechanic.id
      ),
      metadata: {
        validatedSpec: result.spec,
      },
    },
  };

  if (result.metadata.repairStatus !== "repaired") {
    return [validatedAttempt];
  }

  return [
    ...(result.metadata.repairAttempts ?? []).map((repairAttempt) =>
      createFailedSpecGenerationAttemptReceipt({
        completedAt,
        generationRunId,
        model: result.metadata.model,
        repairAttempt,
        request,
        startedAt,
        taskRoute: result.metadata.taskRoute,
      })
    ),
    validatedAttempt,
  ];
}

async function recordFailedSpecGenerationAttempt({
  completedAt,
  error,
  generationRunId,
  repository,
  request,
}: {
  completedAt: string;
  error: unknown;
  generationRunId: GenerationRun["id"];
  repository: Pick<GenerationRunRepository, "update">;
  request: StarterProjectRequest;
}) {
  const validationFailure =
    error instanceof SpecGenerationClientError
      ? error.validationFailure
      : undefined;

  await repository.update(generationRunId, (generationRun) => {
    const startedAt = generationRun.startedAt;
    const stage = validationFailure
      ? toGenerationRunFailureStage(validationFailure.stage)
      : "model-generation";
    const hasRepairExhausted =
      validationFailure?.repairAttempts?.some(
        (repairAttempt) => repairAttempt.outcome === "repair_failed"
      ) ?? false;

    return {
      ...generationRun,
      status: "failed",
      ...(hasRepairExhausted
        ? { repairStatus: "repair-exhausted" as const }
        : {}),
      completedAt,
      durationMs: getDurationMs(startedAt, completedAt),
      stage,
      failureClass: hasRepairExhausted
        ? "repair-exhausted"
        : validationFailure
          ? "invalid-model-output"
          : "provider-request-failure",
      attempts: createFailedSpecGenerationAttemptReceipts({
        completedAt,
        error,
        generationRunId,
        request,
        startedAt,
        validationFailure,
      }),
    };
  });
}

async function recordInterruptedSpecGenerationAttempt({
  completedAt,
  generationRunId,
  repository,
  request,
  status,
}: {
  completedAt: string;
  generationRunId: GenerationRun["id"];
  repository: Pick<GenerationRunRepository, "update">;
  request: StarterProjectRequest;
  status: Extract<GenerationRun["status"], "cancelled" | "timed-out">;
}) {
  await repository.update(generationRunId, (generationRun) => {
    if (generationRun.status !== "running") {
      return generationRun;
    }

    const startedAt = generationRun.startedAt;
    const isTimeout = status === "timed-out";

    return {
      ...generationRun,
      status,
      completedAt,
      durationMs: getDurationMs(startedAt, completedAt),
      stage: isTimeout ? "timeout" : "cancellation",
      failureClass: isTimeout ? "timeout" : "cancellation",
      attempts: [
        {
          id: `${generationRunId}_attempt_1`,
          attemptNumber: 1,
          kind: "initial",
          status,
          provider: "openai",
          model: request.openAiModel ?? "unknown",
          taskRoute: "spec_generation.primary",
          requestSummary: summarizePrompt(request.prompt),
          startedAt,
          completedAt,
          durationMs: getDurationMs(startedAt, completedAt),
          candidate: {
            kind: "no_candidate",
            summary: isTimeout
              ? "Spec Generation timed out before a candidate was returned."
              : "Spec Generation was cancelled before a candidate was returned.",
          },
        },
      ],
    };
  });
}

function createFailedSpecGenerationAttemptReceipts({
  completedAt,
  error,
  generationRunId,
  request,
  startedAt,
  validationFailure,
}: {
  completedAt: string;
  error: unknown;
  generationRunId: GenerationRun["id"];
  request: StarterProjectRequest;
  startedAt: string;
  validationFailure?: SpecGenerationValidationFailure;
}): GenerationRunAttemptReceipt[] {
  if (validationFailure) {
    const repairAttempts =
      validationFailure.repairAttempts && validationFailure.repairAttempts.length > 0
        ? validationFailure.repairAttempts
        : [
            {
              attempt: 1,
              outcome: "failed_validation" as const,
              stage: validationFailure.stage,
              issues: validationFailure.issues,
            },
          ];

    return repairAttempts.map((repairAttempt) =>
      createFailedSpecGenerationAttemptReceipt({
        completedAt,
        generationRunId,
        model: request.openAiModel ?? "unknown",
        repairAttempt,
        request,
        startedAt,
        taskRoute: validationFailure.taskRoute,
      })
    );
  }

  return [
    {
      id: `${generationRunId}_attempt_1`,
      attemptNumber: 1,
      kind: "initial",
      status: "failed",
      provider: "openai",
      model: request.openAiModel ?? "unknown",
      taskRoute: "spec_generation.primary",
      requestSummary: summarizePrompt(request.prompt),
      startedAt,
      completedAt,
      durationMs: getDurationMs(startedAt, completedAt),
      candidate: {
        kind: "provider_error",
        summary:
          error instanceof Error
            ? error.message
            : "Spec Generation provider request failed.",
      },
    },
  ];
}

function createFailedSpecGenerationAttemptReceipt({
  completedAt,
  generationRunId,
  model,
  repairAttempt,
  request,
  startedAt,
  taskRoute,
}: {
  completedAt: string;
  generationRunId: GenerationRun["id"];
  model: string;
  repairAttempt: SpecGenerationRepairAttemptSummary;
  request: StarterProjectRequest;
  startedAt: string;
  taskRoute: string;
}): GenerationRunAttemptReceipt {
  const stage = toGenerationRunFailureStage(repairAttempt.stage);

  return {
    id: `${generationRunId}_attempt_${repairAttempt.attempt}`,
    attemptNumber: repairAttempt.attempt,
    kind: repairAttempt.attempt === 1 ? "initial" : "repair",
    status: "failed",
    provider: "openai",
    model,
    taskRoute,
    requestSummary: summarizePrompt(request.prompt),
    startedAt,
    completedAt,
    durationMs: getDurationMs(startedAt, completedAt),
    ...(repairAttempt.attempt > 1
      ? {
          repair: {
            sourceAttemptId: `${generationRunId}_attempt_1`,
            reason: "Repair attempt could not fix validation issues.",
            validationIssueCount: repairAttempt.issues.length,
          },
        }
      : {}),
    validation: {
      stage,
      status: "failed",
      issues: repairAttempt.issues,
    },
    candidate: {
      kind: "invalid_candidate",
      summary: createInvalidCandidateSummary(stage, repairAttempt.issues.length),
      issueCount: repairAttempt.issues.length,
    },
  };
}

function summarizePrompt(prompt: string | undefined): string {
  const summary = prompt?.replace(/\s+/g, " ").trim();

  return summary ? summary.slice(0, 500) : "Generate a Phaser game.";
}

function getDurationMs(startedAt: string, completedAt: string): number {
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
}

function toGenerationRunFailureStage(
  stage: SpecGenerationValidationFailure["stage"]
): NonNullable<GenerationRun["stage"]> {
  switch (stage) {
    case "mechanic_validation":
      return "mechanic-validation";
    case "semantic_validation":
      return "semantic-validation";
    case "schema_validation":
      return "schema-validation";
    case "model_generation":
      return "model-generation";
    case "bad_request":
    case "configuration":
      return "model-generation";
  }
}

function createInvalidCandidateSummary(
  stage: NonNullable<GenerationRun["stage"]>,
  issueCount: number
) {
  const issueLabel = issueCount === 1 ? "issue" : "issues";
  const readableStage = stage.replaceAll("-", " ");

  return `Spec Generation failed ${readableStage} with ${issueCount} ${issueLabel}.`;
}

function createDefaultGenerationRunId(): GenerationRun["id"] {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10) || "0";

  return `generation_run_${timestamp}_${random}`;
}
