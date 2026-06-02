import {
  validateTopDownGameSpec,
  type TopDownGameSpec,
} from "@/game-spec";
import type { OpenAIModelId } from "@/utils/openai-utils";
import {
  createSpecGenerationFailureResult,
  createSpecGenerationRepairAttemptSummary,
  createSpecGenerationSuccessResult,
  createSpecGenerationValidationAttemptFailure,
  SPEC_GENERATION_TASK_ROUTE,
  SpecGenerationProviderError,
  type SpecGenerationFailureStage,
  type SpecGenerationIssue,
  type SpecGenerationResult,
} from "./spec-generation-outcome";

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
    return createSpecGenerationFailureResult({
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
    return createSpecGenerationSuccessResult({
      spec: firstAttempt.spec,
      model,
      attemptCount,
    });
  }

  const firstRepairAttemptSummary = createSpecGenerationRepairAttemptSummary({
    attempt: attemptCount,
    outcome: "failed_validation",
    stage: firstAttempt.stage,
    issues: firstAttempt.validationIssues,
  });

  if (!repairEnabled) {
    return createSpecGenerationFailureResult({
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
    return createSpecGenerationFailureResult({
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
    return createSpecGenerationSuccessResult({
      spec: repairAttempt.spec,
      model,
      attemptCount: repairAttemptCount,
      repairStatus: "repaired",
      repairAttempts: [firstRepairAttemptSummary],
    });
  }

  const repairAttempts = [
    firstRepairAttemptSummary,
    createSpecGenerationRepairAttemptSummary({
      attempt: repairAttemptCount,
      outcome: "repair_failed",
      stage: repairAttempt.stage,
      issues: repairAttempt.validationIssues,
    }),
  ];

  return createSpecGenerationFailureResult({
    stage: repairAttempt.stage,
    userMessage:
      "I designed a game plan, but it did not pass validation. Please try a simpler prompt.",
    validationIssues: repairAttempt.validationIssues,
    attemptCount: repairAttemptCount,
    repairAttempts,
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
      ...createSpecGenerationValidationAttemptFailure(error),
    };
  }
}
