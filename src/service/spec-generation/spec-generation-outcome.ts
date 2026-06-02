import { ZodError } from "zod";

import { DEFAULT_OPENAI_MODEL } from "@/constants";
import {
  GameSpecValidationError,
  type GameSpecValidationIssue,
  type TopDownGameSpec,
} from "@/game-spec";
import type { OpenAIModelId } from "@/utils/openai-utils";

export const SPEC_GENERATION_TASK_ROUTE = "spec_generation.primary";

export type SpecGenerationFailureStage =
  | "bad_request"
  | "configuration"
  | "model_generation"
  | "schema_validation"
  | "semantic_validation"
  | "mechanic_validation";

export type SpecGenerationIssue = GameSpecValidationIssue & {
  code?: string;
};

export type SpecGenerationProviderErrorDetails = {
  code?: string;
  message: string;
  param?: string;
  provider: "openai";
  requestId?: string;
  status?: number;
  type?: string;
};

export type SpecGenerationRepairStatus = "repaired";

export type SpecGenerationRepairAttemptSummary = {
  attempt: number;
  outcome: "failed_validation" | "repaired" | "repair_failed";
  stage: SpecGenerationFailureStage;
  issues: SpecGenerationIssue[];
};

export type SpecGenerationSuccessMetadata = {
  taskRoute: typeof SPEC_GENERATION_TASK_ROUTE;
  model: OpenAIModelId;
  attemptCount: number;
  repairStatus?: SpecGenerationRepairStatus;
  repairAttempts?: SpecGenerationRepairAttemptSummary[];
};

export type SpecGenerationSuccessResult = {
  ok: true;
  spec: TopDownGameSpec;
  metadata: SpecGenerationSuccessMetadata;
};

export type SpecGenerationFailureResult = {
  ok: false;
  userMessage: string;
  stage: SpecGenerationFailureStage;
  validationIssues: SpecGenerationIssue[];
  taskRoute: typeof SPEC_GENERATION_TASK_ROUTE;
  attemptCount: number;
  repairAttempts?: SpecGenerationRepairAttemptSummary[];
  debugCandidate?: unknown;
  debugProviderError?: SpecGenerationProviderErrorDetails;
};

export type SpecGenerationResult =
  | SpecGenerationSuccessResult
  | SpecGenerationFailureResult;

export type SpecGenerationValidationFailure = {
  attemptCount: number;
  issues: SpecGenerationIssue[];
  repairAttempts?: SpecGenerationRepairAttemptSummary[];
  stage: SpecGenerationFailureStage;
  taskRoute: typeof SPEC_GENERATION_TASK_ROUTE;
};

export class SpecGenerationProviderError extends Error {
  readonly details: SpecGenerationProviderErrorDetails;

  constructor(message: string, details: SpecGenerationProviderErrorDetails) {
    super(message);
    this.name = "SpecGenerationProviderError";
    this.details = details;
  }
}

export function createSpecGenerationSuccessResult({
  spec,
  model,
  attemptCount,
  repairStatus,
  repairAttempts,
}: {
  spec: TopDownGameSpec;
  model: OpenAIModelId;
  attemptCount: number;
  repairStatus?: SpecGenerationRepairStatus;
  repairAttempts?: SpecGenerationRepairAttemptSummary[];
}): SpecGenerationSuccessResult {
  return {
    ok: true,
    spec,
    metadata: {
      taskRoute: SPEC_GENERATION_TASK_ROUTE,
      model,
      attemptCount,
      ...(repairStatus === undefined ? {} : { repairStatus }),
      ...(repairAttempts === undefined ? {} : { repairAttempts }),
    },
  };
}

export function createSpecGenerationFailureResult({
  stage,
  userMessage,
  validationIssues,
  attemptCount,
  repairAttempts,
  debugCandidate,
  debugProviderError,
}: {
  stage: SpecGenerationFailureStage;
  userMessage: string;
  validationIssues: SpecGenerationIssue[];
  attemptCount: number;
  repairAttempts?: SpecGenerationRepairAttemptSummary[];
  debugCandidate?: unknown;
  debugProviderError?: SpecGenerationProviderErrorDetails;
}): SpecGenerationFailureResult {
  return {
    ok: false,
    userMessage,
    stage,
    validationIssues,
    taskRoute: SPEC_GENERATION_TASK_ROUTE,
    attemptCount,
    ...(repairAttempts === undefined ? {} : { repairAttempts }),
    ...(debugCandidate === undefined ? {} : { debugCandidate }),
    ...(debugProviderError === undefined ? {} : { debugProviderError }),
  };
}

export function createSpecGenerationPreflightFailure({
  userMessage,
  stage,
}: Pick<
  SpecGenerationFailureResult,
  "userMessage" | "stage"
>): SpecGenerationFailureResult {
  return createSpecGenerationFailureResult({
    userMessage,
    stage,
    validationIssues: [],
    attemptCount: 0,
  });
}

export function createSpecGenerationRepairAttemptSummary({
  attempt,
  outcome,
  stage,
  issues,
}: SpecGenerationRepairAttemptSummary): SpecGenerationRepairAttemptSummary {
  return {
    attempt,
    outcome,
    stage,
    issues,
  };
}

export function createSpecGenerationValidationAttemptFailure(
  error: unknown
): {
  stage: SpecGenerationFailureStage;
  validationIssues: SpecGenerationIssue[];
} {
  return {
    stage: getValidationFailureStage(error),
    validationIssues: getValidationIssues(error),
  };
}

export function getSpecGenerationResultStatus(
  result: SpecGenerationResult
) {
  if (result.ok) {
    return 200;
  }

  if (result.stage === "model_generation") {
    return 502;
  }

  return 422;
}

export function getSpecGenerationErrorMessage(payload: unknown) {
  if (
    isRecord(payload) &&
    payload.ok === false &&
    typeof payload.userMessage === "string" &&
    payload.userMessage.trim()
  ) {
    return payload.userMessage;
  }

  return "Spec Generation could not create a playable Phaser game plan.";
}

export function getSpecGenerationSuccessMetadata(
  payload: unknown
): SpecGenerationSuccessMetadata {
  const metadata =
    isRecord(payload) && isRecord(payload.metadata) ? payload.metadata : {};
  const repairStatus = getRepairStatus(metadata.repairStatus);
  const repairAttempts = getSpecGenerationRepairAttempts(
    metadata.repairAttempts
  );

  return {
    taskRoute: SPEC_GENERATION_TASK_ROUTE,
    model: getMetadataModel(metadata.model),
    attemptCount: getMetadataNumber(metadata.attemptCount),
    ...(repairAttempts.length > 0 ? { repairAttempts } : {}),
    ...(repairStatus ? { repairStatus } : {}),
  };
}

export function getSpecGenerationValidationFailure(
  payload: unknown
): SpecGenerationValidationFailure | undefined {
  if (!isRecord(payload) || payload.ok !== false) {
    return undefined;
  }

  const issues = getSpecGenerationValidationIssues(payload.validationIssues);
  const repairAttempts = getSpecGenerationRepairAttempts(
    payload.repairAttempts
  );

  if (issues.length === 0) {
    return undefined;
  }

  return {
    attemptCount: getMetadataNumber(payload.attemptCount),
    issues,
    ...(repairAttempts.length > 0 ? { repairAttempts } : {}),
    stage: getValidationStage(payload.stage),
    taskRoute: SPEC_GENERATION_TASK_ROUTE,
  };
}

function getValidationFailureStage(error: unknown): SpecGenerationFailureStage {
  if (error instanceof ZodError) {
    return "schema_validation";
  }

  if (error instanceof GameSpecValidationError) {
    return error.issues.some((issue) => isMechanicIssue(issue))
      ? "mechanic_validation"
      : "semantic_validation";
  }

  return "schema_validation";
}

function getValidationIssues(error: unknown): SpecGenerationIssue[] {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join(".") : "root",
      message: issue.message,
      code: issue.code,
    }));
  }

  if (error instanceof GameSpecValidationError) {
    return error.issues;
  }

  return [
    {
      path: "root",
      message: error instanceof Error ? error.message : "Invalid Game Spec.",
    },
  ];
}

function getSpecGenerationRepairAttempts(
  value: unknown
): SpecGenerationRepairAttemptSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((repairAttempt) => {
    if (!isRecord(repairAttempt)) {
      return [];
    }

    const { attempt, outcome, stage, issues } = repairAttempt;

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
        issues: getSpecGenerationValidationIssues(issues),
      },
    ];
  });
}

function getSpecGenerationValidationIssues(
  value: unknown
): SpecGenerationIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((issue) => {
    if (!isRecord(issue)) {
      return [];
    }

    const { path, message, code } = issue;

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

function getRepairStatus(value: unknown): SpecGenerationRepairStatus | null {
  return value === "repaired" ? value : null;
}

function getMetadataModel(value: unknown): OpenAIModelId {
  return (
    typeof value === "string" && value ? value : DEFAULT_OPENAI_MODEL
  ) as OpenAIModelId;
}

function getMetadataNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 1;
}

function isMechanicIssue(issue: GameSpecValidationIssue) {
  return (
    issue.path.startsWith("mechanics.") &&
    (issue.message.startsWith("Unsupported mechanic type") ||
      issue.message.startsWith("Expected "))
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
