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

export type SpecGenerationSuccessResult = {
  ok: true;
  spec: TopDownGameSpec;
  metadata: {
    taskRoute: typeof SPEC_GENERATION_TASK_ROUTE;
    model: OpenAIModelId;
    attemptCount: number;
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
};

export type SpecGenerationResult =
  | SpecGenerationSuccessResult
  | SpecGenerationFailureResult;

export type SpecGenerationProviderInput = {
  prompt: string;
  model: OpenAIModelId;
  providerCredential: string;
  taskRoute: typeof SPEC_GENERATION_TASK_ROUTE;
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
};

export async function generateTopDownGameSpec({
  prompt,
  model,
  providerCredential,
  provider,
  includeDebugCandidate = false,
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
  } catch {
    return createFailureResult({
      stage: "model_generation",
      userMessage:
        "I couldn't design a game plan from that prompt. Please try again.",
      validationIssues: [],
      attemptCount,
    });
  }

  try {
    return {
      ok: true,
      spec: validateTopDownGameSpec(candidate),
      metadata: {
        taskRoute: SPEC_GENERATION_TASK_ROUTE,
        model,
        attemptCount,
      },
    };
  } catch (error) {
    return createFailureResult({
      stage: getValidationFailureStage(error),
      userMessage:
        "I designed a game plan, but it did not pass validation. Please try a simpler prompt.",
      validationIssues: getValidationIssues(error),
      attemptCount,
      debugCandidate: includeDebugCandidate ? candidate : undefined,
    });
  }
}

function createFailureResult({
  stage,
  userMessage,
  validationIssues,
  attemptCount,
  debugCandidate,
}: {
  stage: SpecGenerationFailureStage;
  userMessage: string;
  validationIssues: SpecGenerationIssue[];
  attemptCount: number;
  debugCandidate?: unknown;
}): SpecGenerationFailureResult {
  return {
    ok: false,
    userMessage,
    stage,
    validationIssues,
    taskRoute: SPEC_GENERATION_TASK_ROUTE,
    attemptCount,
    ...(debugCandidate === undefined ? {} : { debugCandidate }),
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
