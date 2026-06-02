import {
  validateTopDownGameSpec,
  type TopDownGameSpec,
} from "@/game-spec";
import type { OpenAIModelId } from "@/utils/openai-utils";
import type { RuntimeKind } from "@/runtime/runtime-adapter";
import type { StarterProjectRequest } from "@/service/starter-project/starter-project-client";
import type {
  SPEC_GENERATION_TASK_ROUTE,
  SpecGenerationFailureStage,
  SpecGenerationIssue,
  SpecGenerationRepairAttemptSummary,
  SpecGenerationRepairStatus,
} from "./spec-generation-service";

export type TopDownSpecGenerationClientResult = {
  metadata: {
    taskRoute: typeof SPEC_GENERATION_TASK_ROUTE;
    model: OpenAIModelId;
    attemptCount: number;
    repairAttempts?: SpecGenerationRepairAttemptSummary[];
    repairStatus?: SpecGenerationRepairStatus;
  };
  runtimeKind: Extract<RuntimeKind, "phaser">;
  spec: TopDownGameSpec;
};

export type SpecGenerationValidationFailure = {
  attemptCount: number;
  issues: SpecGenerationIssue[];
  repairAttempts?: SpecGenerationRepairAttemptSummary[];
  stage: SpecGenerationFailureStage;
  taskRoute: typeof SPEC_GENERATION_TASK_ROUTE;
};

export class SpecGenerationClientError extends Error {
  readonly validationFailure?: SpecGenerationValidationFailure;

  constructor(
    message: string,
    validationFailure?: SpecGenerationValidationFailure
  ) {
    super(message);
    this.name = "SpecGenerationClientError";
    this.validationFailure = validationFailure;
  }
}

type SpecGenerationPayload =
  | {
      ok: true;
      spec: unknown;
      metadata?: {
        taskRoute?: unknown;
        model?: unknown;
        attemptCount?: unknown;
        repairAttempts?: unknown;
        repairStatus?: unknown;
      };
    }
  | {
      ok: false;
      attemptCount?: unknown;
      repairAttempts?: unknown;
      stage?: unknown;
      taskRoute?: unknown;
      userMessage?: unknown;
      validationIssues?: unknown;
    };

export async function requestTopDownSpecGeneration(
  request: StarterProjectRequest,
  signal?: AbortSignal
): Promise<TopDownSpecGenerationClientResult> {
  const response = await fetch("/api/spec-generation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      enteredPrompt: request.prompt || undefined,
      openAiApiKey: request.openAiApiKey,
      openAiKeyword: request.openAiKeyword,
      openAiModel: request.openAiModel,
    }),
  });

  const payload = (await response.json()) as SpecGenerationPayload;

  if (!response.ok || payload.ok === false) {
    throw new SpecGenerationClientError(
      getSpecGenerationErrorMessage(payload),
      getSpecGenerationValidationFailure(payload)
    );
  }

  if (payload.ok !== true) {
    throw new Error("Spec Generation returned an invalid response.");
  }

  const spec = validateTopDownGameSpec(payload.spec);
  const repairStatus = getRepairStatus(payload.metadata?.repairStatus);
  const repairAttempts = getRepairAttempts(payload.metadata?.repairAttempts);
  const metadata = {
    taskRoute: "spec_generation.primary" as const,
    model: getMetadataString(payload.metadata?.model) as OpenAIModelId,
    attemptCount: getMetadataNumber(payload.metadata?.attemptCount),
    ...(repairAttempts.length > 0 ? { repairAttempts } : {}),
    ...(repairStatus ? { repairStatus } : {}),
  };

  return {
    metadata,
    runtimeKind: "phaser",
    spec,
  };
}

function getSpecGenerationErrorMessage(payload: SpecGenerationPayload) {
  if (
    payload.ok === false &&
    typeof payload.userMessage === "string" &&
    payload.userMessage.trim()
  ) {
    return payload.userMessage;
  }

  return "Spec Generation could not create a playable Phaser game plan.";
}

function getMetadataString(value: unknown) {
  return typeof value === "string" && value ? value : "gpt-5.4-mini";
}

function getMetadataNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 1;
}

function getRepairStatus(value: unknown): SpecGenerationRepairStatus | null {
  return value === "repaired" ? value : null;
}

function getSpecGenerationValidationFailure(
  payload: SpecGenerationPayload
): SpecGenerationValidationFailure | undefined {
  if (payload.ok !== false) {
    return undefined;
  }

  const issues = getValidationIssues(payload.validationIssues);
  const repairAttempts = getRepairAttempts(payload.repairAttempts);

  if (issues.length === 0) {
    return undefined;
  }

  return {
    attemptCount: getMetadataNumber(payload.attemptCount),
    issues,
    ...(repairAttempts.length > 0 ? { repairAttempts } : {}),
    stage: getValidationStage(payload.stage),
    taskRoute: "spec_generation.primary",
  };
}

function getRepairAttempts(
  value: unknown
): SpecGenerationRepairAttemptSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((repairAttempt) => {
    if (!repairAttempt || typeof repairAttempt !== "object") {
      return [];
    }

    const attempt =
      "attempt" in repairAttempt ? repairAttempt.attempt : undefined;
    const outcome =
      "outcome" in repairAttempt ? repairAttempt.outcome : undefined;
    const stage = "stage" in repairAttempt ? repairAttempt.stage : undefined;
    const issues =
      "issues" in repairAttempt ? repairAttempt.issues : undefined;

    if (
      typeof attempt !== "number" ||
      !Number.isFinite(attempt) ||
      !isRepairAttemptOutcome(outcome) ||
      !isValidationStage(stage)
    ) {
      return [];
    }

    return [
      {
        attempt,
        outcome,
        stage,
        issues: getValidationIssues(issues),
      },
    ];
  });
}

function getValidationIssues(value: unknown): SpecGenerationIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((issue) => {
    if (!issue || typeof issue !== "object") {
      return [];
    }

    const path = "path" in issue ? issue.path : undefined;
    const message = "message" in issue ? issue.message : undefined;
    const code = "code" in issue ? issue.code : undefined;

    if (typeof path !== "string" || typeof message !== "string") {
      return [];
    }

    return [
      {
        path,
        message,
        ...(typeof code === "string" ? { code } : {}),
      },
    ];
  });
}

function getValidationStage(value: unknown): SpecGenerationFailureStage {
  if (isValidationStage(value)) {
    return value;
  }

  return "schema_validation";
}

function isValidationStage(
  value: unknown
): value is Extract<
  SpecGenerationFailureStage,
  "schema_validation" | "semantic_validation" | "mechanic_validation"
> {
  return (
    value === "schema_validation" ||
    value === "semantic_validation" ||
    value === "mechanic_validation"
  );
}

function isRepairAttemptOutcome(
  value: unknown
): value is SpecGenerationRepairAttemptSummary["outcome"] {
  return (
    value === "failed_validation" ||
    value === "repaired" ||
    value === "repair_failed"
  );
}
