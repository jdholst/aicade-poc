import type { RuntimeIssue } from "@/runtime/runtime-adapter";

import type { JsonValue } from "../game-spec-schema";
import type { GamePack, ValidationEvidence } from "./game-pack-schema";

export type FirstPlayableValidationStatus = "running" | "passed" | "failed";

export type FirstPlayableValidationAttempt = {
  evidence: ValidationEvidence[];
  failureMessage?: string;
  gamePackId: GamePack["id"];
  shouldBlockPlayable: boolean;
  startedAt: string;
  status: FirstPlayableValidationStatus;
};

export type StartFirstPlayableValidationInput = {
  gamePack: GamePack;
  startedAt: string;
};

export type RecordFirstPlayableRuntimeStatusInput = {
  attempt: FirstPlayableValidationAttempt;
  observedAt: string;
  status: FirstPlayableRuntimeStatus;
};

export type FirstPlayableRuntimeStatus =
  | { state: "loading" }
  | { state: "ready" }
  | { state: "warning"; issue: Extract<RuntimeIssue, { recoverable: true }> }
  | { state: "error"; message: string };

const BASIC_OBJECTIVE_EVIDENCE_ID = "evidence_basic_objective_presence";
const BASIC_OBJECTIVE_CHECK_ID = "basic_objective_presence";
const RUNTIME_BOOT_EVIDENCE_ID = "evidence_runtime_boot";
const RUNTIME_BOOT_CHECK_ID = "runtime_boot";

export function startFirstPlayableValidation({
  gamePack,
  startedAt,
}: StartFirstPlayableValidationInput): FirstPlayableValidationAttempt {
  const basicObjectiveEvidence =
    createBasicObjectivePresenceEvidence(gamePack);
  const failed = basicObjectiveEvidence.status === "failed";

  return {
    gamePackId: gamePack.id,
    startedAt,
    status: failed ? "failed" : "running",
    shouldBlockPlayable: failed,
    failureMessage: failed
      ? "The Game Spec needs one primary objective before the runtime can be presented as playable."
      : undefined,
    evidence: [basicObjectiveEvidence],
  };
}

export function recordFirstPlayableRuntimeStatus({
  attempt,
  observedAt,
  status,
}: RecordFirstPlayableRuntimeStatusInput): FirstPlayableValidationAttempt {
  if (attempt.status === "failed" || status.state === "loading") {
    return attempt;
  }

  if (status.state === "warning") {
    return attempt;
  }

  if (status.state === "ready") {
    return updateAttemptWithRuntimeEvidence(
      attempt,
      createRuntimeBootEvidence({
        attempt,
        observedAt,
        status: "passed",
        message: "Runtime reported ready without a fatal boot error.",
        evidence: {
          runtimeStatus: "ready",
        },
      })
    );
  }

  return updateAttemptWithRuntimeEvidence(
    attempt,
    createRuntimeBootEvidence({
      attempt,
      observedAt,
      status: "failed",
      message: "Runtime failed before first-playable validation completed.",
      evidence: {
        runtimeStatus: "error",
        message: status.message,
      },
      issues: [
        {
          code: "fatal_runtime_error",
          path: "runtime",
          message: status.message,
        },
      ],
    })
  );
}

function createBasicObjectivePresenceEvidence(
  gamePack: GamePack
): ValidationEvidence {
  const hasPrimaryObjective = gamePack.gameSpec.objectives.some(
    (objective) => objective.primary
  );

  if (hasPrimaryObjective) {
    return {
      id: BASIC_OBJECTIVE_EVIDENCE_ID,
      checkId: BASIC_OBJECTIVE_CHECK_ID,
      stage: "spec-validation",
      status: "passed",
      durationMs: 0,
      message: "A primary objective is present in the Game Spec.",
      evidence: {
        primaryObjectiveCount: gamePack.gameSpec.objectives.filter(
          (objective) => objective.primary
        ).length,
      },
    };
  }

  return {
    id: BASIC_OBJECTIVE_EVIDENCE_ID,
    checkId: BASIC_OBJECTIVE_CHECK_ID,
    stage: "spec-validation",
    status: "failed",
    durationMs: 0,
    message:
      "Game Spec must include one primary objective before runtime boot can be treated as playable.",
    issues: [
      {
        code: "missing_primary_objective",
        path: "gameSpec.objectives",
        message: "Expected at least one primary objective.",
      },
    ],
  };
}

function createRuntimeBootEvidence({
  attempt,
  observedAt,
  status,
  message,
  evidence,
  issues,
}: {
  attempt: FirstPlayableValidationAttempt;
  observedAt: string;
  status: Extract<ValidationEvidence["status"], "passed" | "failed">;
  message: string;
  evidence: Record<string, JsonValue>;
  issues?: ValidationEvidence["issues"];
}): ValidationEvidence {
  return {
    id: RUNTIME_BOOT_EVIDENCE_ID,
    checkId: RUNTIME_BOOT_CHECK_ID,
    stage: "runtime-boot",
    status,
    durationMs: getDurationMs(attempt.startedAt, observedAt),
    message,
    evidence,
    issues,
  };
}

function updateAttemptWithRuntimeEvidence(
  attempt: FirstPlayableValidationAttempt,
  runtimeEvidence: ValidationEvidence
): FirstPlayableValidationAttempt {
  const evidence = replaceEvidence(attempt.evidence, runtimeEvidence);
  const failed = evidence.some((item) => item.status === "failed");
  const hasRuntimeBootPass = evidence.some(
    (item) =>
      item.checkId === RUNTIME_BOOT_CHECK_ID && item.status === "passed"
  );

  return {
    ...attempt,
    evidence,
    status: failed ? "failed" : hasRuntimeBootPass ? "passed" : "running",
    shouldBlockPlayable: failed,
    failureMessage: failed
      ? getFirstFailureMessage(evidence)
      : attempt.failureMessage,
  };
}

function replaceEvidence(
  evidence: ValidationEvidence[],
  nextEvidence: ValidationEvidence
) {
  const existingIndex = evidence.findIndex(
    (item) => item.id === nextEvidence.id
  );

  if (existingIndex === -1) {
    return [...evidence, nextEvidence];
  }

  return evidence.map((item, index) =>
    index === existingIndex ? nextEvidence : item
  );
}

function getFirstFailureMessage(evidence: ValidationEvidence[]) {
  const failedEvidence = evidence.find((item) => item.status === "failed");

  return failedEvidence?.issues?.[0]?.message ?? failedEvidence?.message;
}

function getDurationMs(startedAt: string, observedAt: string) {
  const durationMs = Date.parse(observedAt) - Date.parse(startedAt);

  return Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
}
