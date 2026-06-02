import { ZodError } from "zod";

import {
  GameSpecValidationError,
  validateTopDownGameSpec,
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

export class SpecGenerationProviderError extends Error {
  readonly details: SpecGenerationProviderErrorDetails;

  constructor(message: string, details: SpecGenerationProviderErrorDetails) {
    super(message);
    this.name = "SpecGenerationProviderError";
    this.details = details;
  }
}

export type SpecGenerationSuccessResult = {
  ok: true;
  spec: TopDownGameSpec;
  metadata: {
    taskRoute: typeof SPEC_GENERATION_TASK_ROUTE;
    model: OpenAIModelId;
    attemptCount: number;
    repairStatus?: SpecGenerationRepairStatus;
  };
};

export type SpecGenerationFailureResult = {
  ok: false;
  userMessage: string;
  stage: SpecGenerationFailureStage;
  validationIssues: SpecGenerationIssue[];
  taskRoute: typeof SPEC_GENERATION_TASK_ROUTE;
  attemptCount: number;
  debugCandidate?: unknown;
  debugProviderError?: SpecGenerationProviderErrorDetails;
};

export type SpecGenerationResult =
  | SpecGenerationSuccessResult
  | SpecGenerationFailureResult;

export type SpecGenerationProviderInput = {
  prompt: string;
  model: OpenAIModelId;
  providerCredential: string;
  taskRoute: typeof SPEC_GENERATION_TASK_ROUTE;
  repairContext?: {
    failedAttempt: number;
    invalidCandidate: unknown;
    stage: SpecGenerationFailureStage;
    validationIssues: SpecGenerationIssue[];
  };
};

export type SpecGenerationProvider = (
  input: SpecGenerationProviderInput
) => Promise<unknown>;

export type GenerateTopDownGameSpecInput = {
  prompt: string;
  model: OpenAIModelId;
  providerCredential: string;
  provider: SpecGenerationProvider;
  includeDebugCandidate?: boolean;
  repairEnabled?: boolean;
};

export async function generateTopDownGameSpec({
  prompt,
  model,
  providerCredential,
  provider,
  includeDebugCandidate = false,
  repairEnabled = true,
}: GenerateTopDownGameSpecInput): Promise<SpecGenerationResult> {
  const attemptCount = 1;
  let candidate: unknown;

  try {
    candidate = await provider({
      prompt,
      model,
      providerCredential,
      taskRoute: SPEC_GENERATION_TASK_ROUTE,
    });
  } catch (error) {
    return createFailureResult({
      stage: "model_generation",
      userMessage:
        "I couldn't design a game plan from that prompt. Please try again.",
      validationIssues: [],
      attemptCount,
      debugProviderError:
        includeDebugCandidate && error instanceof SpecGenerationProviderError
          ? error.details
          : undefined,
    });
  }

  const firstAttempt = validateCandidate(candidate);

  if (firstAttempt.ok) {
    return {
      ok: true,
      spec: firstAttempt.spec,
      metadata: {
        taskRoute: SPEC_GENERATION_TASK_ROUTE,
        model,
        attemptCount,
      },
    };
  }

  if (!repairEnabled) {
    return createFailureResult({
      stage: firstAttempt.stage,
      userMessage:
        "I designed a game plan, but it did not pass validation. Please try a simpler prompt.",
      validationIssues: firstAttempt.validationIssues,
      attemptCount,
      debugCandidate: includeDebugCandidate ? candidate : undefined,
    });
  }

  const repairAttemptCount = attemptCount + 1;
  let repairedCandidate: unknown;

  try {
    repairedCandidate = await provider({
      prompt,
      model,
      providerCredential,
      taskRoute: SPEC_GENERATION_TASK_ROUTE,
      repairContext: {
        failedAttempt: attemptCount,
        invalidCandidate: candidate,
        stage: firstAttempt.stage,
        validationIssues: firstAttempt.validationIssues,
      },
    });
  } catch (error) {
    return createFailureResult({
      stage: "model_generation",
      userMessage:
        "I couldn't design a game plan from that prompt. Please try again.",
      validationIssues: [],
      attemptCount: repairAttemptCount,
      debugProviderError:
        includeDebugCandidate && error instanceof SpecGenerationProviderError
          ? error.details
          : undefined,
    });
  }

  const repairAttempt = validateCandidate(repairedCandidate);

  if (repairAttempt.ok) {
    return {
      ok: true,
      spec: repairAttempt.spec,
      metadata: {
        taskRoute: SPEC_GENERATION_TASK_ROUTE,
        model,
        attemptCount: repairAttemptCount,
        repairStatus: "repaired",
      },
    };
  }

  return createFailureResult({
    stage: repairAttempt.stage,
    userMessage:
      "I designed a game plan, but it did not pass validation. Please try a simpler prompt.",
    validationIssues: repairAttempt.validationIssues,
    attemptCount: repairAttemptCount,
    debugCandidate: includeDebugCandidate ? repairedCandidate : undefined,
  });
}

function validateCandidate(
  candidate: unknown
):
  | { ok: true; spec: TopDownGameSpec }
  | {
      ok: false;
      stage: SpecGenerationFailureStage;
      validationIssues: SpecGenerationIssue[];
    } {
  try {
    return {
      ok: true,
      spec: validateTopDownGameSpec(candidate),
    };
  } catch (error) {
    return {
      ok: false,
      stage: getValidationFailureStage(error),
      validationIssues: getValidationIssues(error),
    };
  }
}

function createFailureResult({
  stage,
  userMessage,
  validationIssues,
  attemptCount,
  debugCandidate,
  debugProviderError,
}: {
  stage: SpecGenerationFailureStage;
  userMessage: string;
  validationIssues: SpecGenerationIssue[];
  attemptCount: number;
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
    ...(debugCandidate === undefined ? {} : { debugCandidate }),
    ...(debugProviderError === undefined ? {} : { debugProviderError }),
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

function isMechanicIssue(issue: GameSpecValidationIssue) {
  return (
    issue.path.startsWith("mechanics.") &&
    (issue.message.startsWith("Unsupported mechanic type") ||
      issue.message.startsWith("Expected "))
  );
}
