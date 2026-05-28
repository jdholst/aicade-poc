import type {
  FirstPlayableValidationAttempt,
  GameSpecValidationIssue,
  ValidationEvidence,
} from "@/game-spec";
import type { SpecGenerationValidationFailure } from "@/service/spec-generation/spec-generation-client";

export type ValidationFailureReceiptViewModel = {
  checkId: string;
  evidenceJson: string | null;
  issueMessages: string[];
  message: string;
  stage: ValidationEvidence["stage"];
  status: ValidationEvidence["status"];
};

export type ValidationFailureSurfaceViewModel = {
  debugReceipts: ValidationFailureReceiptViewModel[];
  summary: string;
};

export function createFirstPlayableValidationFailureSurface(
  attempt: FirstPlayableValidationAttempt | null
): ValidationFailureSurfaceViewModel | null {
  if (!attempt?.shouldBlockPlayable) {
    return null;
  }

  const failedReceipts = attempt.evidence.filter(
    (receipt) => receipt.status === "failed"
  );
  const debugReceipts = (
    failedReceipts.length > 0 ? failedReceipts : attempt.evidence
  ).map(createValidationFailureReceiptViewModel);
  const primaryReceipt = debugReceipts[0] ?? null;
  const primaryIssueMessage = primaryReceipt?.issueMessages[0];

  return {
    debugReceipts,
    summary:
      attempt.failureMessage ??
      primaryIssueMessage ??
      primaryReceipt?.message ??
      "First-playable validation failed before the runtime could be marked playable.",
  };
}

export function createGameSpecValidationFailureSurface({
  issues,
  message,
}: {
  issues: GameSpecValidationIssue[];
  message: string;
}): ValidationFailureSurfaceViewModel {
  return {
    debugReceipts: [
      {
        checkId: "game_spec_validation",
        evidenceJson:
          issues.length > 0
            ? JSON.stringify({ issues }, null, 2)
            : null,
        issueMessages: issues.map((issue) => issue.message),
        message,
        stage: "spec-validation",
        status: "failed",
      },
    ],
    summary: message,
  };
}

export function createSpecGenerationValidationFailureSurface({
  message,
  validationFailure,
}: {
  message: string;
  validationFailure: SpecGenerationValidationFailure;
}): ValidationFailureSurfaceViewModel {
  return {
    debugReceipts: [
      {
        checkId: validationFailure.stage,
        evidenceJson: JSON.stringify(
          {
            attemptCount: validationFailure.attemptCount,
            issues: validationFailure.issues,
            taskRoute: validationFailure.taskRoute,
          },
          null,
          2
        ),
        issueMessages: validationFailure.issues.map(
          (issue) => `${issue.path}: ${issue.message}`
        ),
        message,
        stage: "spec-validation",
        status: "failed",
      },
    ],
    summary: message,
  };
}

function createValidationFailureReceiptViewModel(
  receipt: ValidationEvidence
): ValidationFailureReceiptViewModel {
  return {
    checkId: receipt.checkId,
    evidenceJson: receipt.evidence
      ? JSON.stringify(receipt.evidence, null, 2)
      : null,
    issueMessages:
      receipt.issues?.map((issue) => issue.message) ?? [],
    message: receipt.message ?? "Validation receipt did not include a message.",
    stage: receipt.stage,
    status: receipt.status,
  };
}
