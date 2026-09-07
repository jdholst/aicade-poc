import type {
  FirstPlayableValidationAttempt,
  GameSpecValidationIssue,
  ValidationEvidence,
} from "@/game-spec";
import type {
  SpecGenerationFailureStage,
  SpecGenerationValidationFailure,
} from "@/service/spec-generation";
import type { GeneratedMechanicGenerationFailureEvidence } from "@/service/generation-run";

export type FailureReceiptStage =
  | ValidationEvidence["stage"]
  | SpecGenerationFailureStage
  | GeneratedMechanicGenerationFailureEvidence["stage"];

export type FailureReceiptViewModel = {
  checkId: string;
  evidenceJson: string | null;
  issueGroups?: FailureReceiptIssueGroupViewModel[];
  issueMessages: string[];
  message: string;
  stage: FailureReceiptStage;
  status: ValidationEvidence["status"];
};

export type FailureReceiptIssueGroupViewModel = {
  id: string;
  issueMessages: string[];
  label: string;
};

export type FailureReceiptSurfaceViewModel = {
  debugReceipts: FailureReceiptViewModel[];
  summary: string;
};

export function createGenerationFailureReceiptSurface({
  generatedMechanicFailure,
  message,
  validationFailure,
}: {
  generatedMechanicFailure?: GeneratedMechanicGenerationFailureEvidence;
  message: string;
  validationFailure?: SpecGenerationValidationFailure;
}): FailureReceiptSurfaceViewModel {
  if (generatedMechanicFailure) {
    const conformanceFailure = createRealmConformanceFailurePresentation(
      generatedMechanicFailure
    );

    return {
      debugReceipts: [
        {
          checkId: generatedMechanicFailure.stage,
          evidenceJson: JSON.stringify(generatedMechanicFailure, null, 2),
          ...(conformanceFailure
            ? {
                issueGroups: conformanceFailure.issueGroups,
                issueMessages: [],
              }
            : {
                issueMessages: generatedMechanicFailure.issues.map(
                  ({ message: issueMessage, path }) =>
                    `${path}: ${issueMessage}`
                ),
              }),
          message: conformanceFailure?.receiptMessage ?? message,
          stage: generatedMechanicFailure.stage,
          status: "failed",
        },
      ],
      summary: conformanceFailure?.summary ?? message,
    };
  }

  if (validationFailure) {
    return createSpecGenerationValidationFailureReceiptSurface({
      message,
      validationFailure,
    });
  }

  return {
    debugReceipts: [
      {
        checkId: "generation_request",
        evidenceJson: null,
        issueMessages: [],
        message,
        stage: "model_generation",
        status: "failed",
      },
    ],
    summary: message,
  };
}

const REALM_CONFORMANCE_PATH_PREFIX = "foundation.realm_conformance.";

const REALM_CONFORMANCE_GROUP_LABELS: Readonly<Record<string, string>> =
  Object.freeze({
    browser_integration: "Browser runtime",
    cleanup_and_recovery: "Cleanup and recovery",
    determinism: "Deterministic replay",
    diagnostic_quality: "Diagnostic quality",
    escape_resistance: "Escape resistance",
    forbidden_authority_isolation: "Forbidden authority",
    opaque_handle_isolation: "Opaque handle isolation",
    resource_enforcement: "Resource limits",
    runaway_termination: "Runaway containment",
    usable_capability_execution: "Capability execution",
  });

function createRealmConformanceFailurePresentation(
  failure: GeneratedMechanicGenerationFailureEvidence
): Readonly<{
  issueGroups: FailureReceiptIssueGroupViewModel[];
  receiptMessage: string;
  summary: string;
}> | null {
  if (
    failure.stage !== "foundation" ||
    failure.issues.length === 0 ||
    !failure.issues.every(({ path }) =>
      path.startsWith(REALM_CONFORMANCE_PATH_PREFIX)
    )
  ) {
    return null;
  }

  const groups = new Map<string, FailureReceiptIssueGroupViewModel>();
  for (const issue of failure.issues) {
    const id = issue.path.slice(REALM_CONFORMANCE_PATH_PREFIX.length);
    const existingGroup = groups.get(id);
    if (existingGroup) {
      existingGroup.issueMessages.push(issue.message);
      continue;
    }

    groups.set(id, {
      id,
      issueMessages: [issue.message],
      label: REALM_CONFORMANCE_GROUP_LABELS[id] ?? humanizeIdentifier(id),
    });
  }

  const issueCount = failure.issues.length;
  return {
    issueGroups: [...groups.values()],
    receiptMessage:
      "Mechanic execution conformance stopped before source generation began.",
    summary: `The secure mechanic runtime could not be verified. Review ${issueCount} failed conformance ${issueCount === 1 ? "check" : "checks"} below.`,
  };
}

function humanizeIdentifier(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.length === 0
    ? "Conformance check"
    : `${words[0]?.toUpperCase() ?? ""}${words.slice(1)}`;
}

export function createFirstPlayableFailureReceiptSurface(
  attempt: FirstPlayableValidationAttempt | null
): FailureReceiptSurfaceViewModel | null {
  if (!attempt?.shouldBlockPlayable) {
    return null;
  }

  const failedReceipts = attempt.evidence.filter(
    (receipt) => receipt.status === "failed"
  );
  const debugReceipts = (
    failedReceipts.length > 0 ? failedReceipts : attempt.evidence
  ).map(createValidationEvidenceReceiptViewModel);
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

export function createGameSpecFailureReceiptSurface({
  issues,
  message,
}: {
  issues: GameSpecValidationIssue[];
  message: string;
}): FailureReceiptSurfaceViewModel {
  return {
    debugReceipts: [
      {
        checkId: "game_spec_validation",
        evidenceJson:
          issues.length > 0 ? JSON.stringify({ issues }, null, 2) : null,
        issueMessages: issues.map((issue) => issue.message),
        message,
        stage: "spec-validation",
        status: "failed",
      },
    ],
    summary: message,
  };
}

function createSpecGenerationValidationFailureReceiptSurface({
  message,
  validationFailure,
}: {
  message: string;
  validationFailure: SpecGenerationValidationFailure;
}): FailureReceiptSurfaceViewModel {
  return {
    debugReceipts: [
      {
        checkId: validationFailure.stage,
        evidenceJson: JSON.stringify(
          {
            attemptCount: validationFailure.attemptCount,
            issues: validationFailure.issues,
            ...(validationFailure.repairAttempts
              ? { repairAttempts: validationFailure.repairAttempts }
              : {}),
            taskRoute: validationFailure.taskRoute,
          },
          null,
          2
        ),
        issueMessages: [
          ...createRepairAttemptIssueMessages(
            validationFailure.repairAttempts
          ),
          ...validationFailure.issues.map(
            (issue) => `${issue.path}: ${issue.message}`
          ),
        ],
        message,
        stage: validationFailure.stage,
        status: "failed",
      },
    ],
    summary: message,
  };
}

function createRepairAttemptIssueMessages(
  repairAttempts: SpecGenerationValidationFailure["repairAttempts"]
) {
  if (!repairAttempts || repairAttempts.length === 0) {
    return [];
  }

  return [
    "Automatic repair was attempted once and stopped.",
    ...repairAttempts.flatMap((repairAttempt) =>
      repairAttempt.issues
        .slice(0, 3)
        .map(
          (issue) =>
            `Attempt ${repairAttempt.attempt} ${repairAttempt.outcome}: ${issue.path}: ${issue.message}`
        )
    ),
  ];
}

function createValidationEvidenceReceiptViewModel(
  receipt: ValidationEvidence
): FailureReceiptViewModel {
  return {
    checkId: receipt.checkId,
    evidenceJson: receipt.evidence
      ? JSON.stringify(receipt.evidence, null, 2)
      : null,
    issueMessages: receipt.issues?.map((issue) => issue.message) ?? [],
    message: receipt.message ?? "Validation receipt did not include a message.",
    stage: receipt.stage,
    status: receipt.status,
  };
}
