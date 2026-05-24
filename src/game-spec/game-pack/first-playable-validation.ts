import type {
  RuntimeIssue,
  RuntimeValidationEvidence as RuntimeValidationEvidenceReport,
} from "@/runtime/runtime-adapter";

import type { GamePack, ValidationEvidence } from "./game-pack-schema";
import { parseGamePack } from "./game-pack-schema";
import {
  createFailedAttemptRecord,
  createInitialVersionCheckpointRecord,
  createPlayableBuildRecord,
  getCheckpointIdForValidationWrite,
  hasMountedRuntimeValidationArtifact,
  upsertGamePackRecordsById,
} from "./game-pack-lineage";
import {
  createFirstPlayablePreRuntimeEvidence,
  createFirstPlayableRuntimeBootEvidence,
  createFirstPlayableRuntimeBrowserEvidence,
  getFirstPlayableFailureMessage,
  hasFirstPlayableEvidencePassed,
  type FirstPlayableRuntimeCandidate,
} from "./first-playable-validation-bar";

export type { FirstPlayableRuntimeCandidate } from "./first-playable-validation-bar";

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
  runtimeCandidate: FirstPlayableRuntimeCandidate;
  startedAt: string;
};

export type RecordFirstPlayableRuntimeStatusInput = {
  attempt: FirstPlayableValidationAttempt;
  observedAt: string;
  status: FirstPlayableRuntimeStatus;
};

export type RecordFirstPlayableRuntimeEvidenceInput = {
  attempt: FirstPlayableValidationAttempt;
  evidence: RuntimeValidationEvidenceReport;
  observedAt: string;
};

export type WriteFirstPlayableValidationResultInput = {
  attempt: FirstPlayableValidationAttempt;
  completedAt: string;
  gamePack: GamePack;
};

export type FirstPlayableRuntimeStatus =
  | { state: "loading" }
  | { state: "ready" }
  | { state: "warning"; issue: Extract<RuntimeIssue, { recoverable: true }> }
  | { state: "error"; message: string };

export function startFirstPlayableValidation({
  gamePack,
  runtimeCandidate,
  startedAt,
}: StartFirstPlayableValidationInput): FirstPlayableValidationAttempt {
  const evidence = createFirstPlayablePreRuntimeEvidence({
    gamePack,
    runtimeCandidate,
  });
  const failed = evidence.some((item) => item.status === "failed");

  return {
    gamePackId: gamePack.id,
    startedAt,
    status: failed ? "failed" : "running",
    shouldBlockPlayable: failed,
    failureMessage: failed
      ? getFirstPlayableFailureMessage(evidence)
      : undefined,
    evidence,
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
      createFirstPlayableRuntimeBootEvidence({
        startedAt: attempt.startedAt,
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
    createFirstPlayableRuntimeBootEvidence({
      startedAt: attempt.startedAt,
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

export function recordFirstPlayableRuntimeEvidence({
  attempt,
  evidence,
  observedAt,
}: RecordFirstPlayableRuntimeEvidenceInput): FirstPlayableValidationAttempt {
  if (attempt.status === "failed") {
    return attempt;
  }

  return updateAttemptWithRuntimeEvidence(
    attempt,
    createFirstPlayableRuntimeBrowserEvidence({
      startedAt: attempt.startedAt,
      observedAt,
      report: evidence,
    })
  );
}

export function writeFirstPlayableValidationResult({
  attempt,
  completedAt,
  gamePack,
}: WriteFirstPlayableValidationResultInput): GamePack {
  if (attempt.gamePackId !== gamePack.id) {
    throw new Error("Validation attempt must belong to the target Game Pack.");
  }

  if (attempt.status === "running") {
    throw new Error("Cannot write a running first-playable validation attempt.");
  }

  const validationEvidence = upsertGamePackRecordsById(
    gamePack.validationEvidence,
    attempt.evidence
  );

  if (attempt.status === "passed") {
    const checkpointId = getCheckpointIdForValidationWrite(gamePack);
    const build = createPlayableBuildRecord({
      id: "build_initial_playable",
      startedAt: attempt.startedAt,
      completedAt,
      gamePack,
      checkpointId,
      status: "validated",
      validationEvidence: attempt.evidence,
    });
    const checkpoints =
      gamePack.checkpoints.length === 0
        ? [
            createInitialVersionCheckpointRecord({
              startedAt: attempt.startedAt,
              build,
              completedAt,
              gamePack,
              validationEvidence: attempt.evidence,
            }),
          ]
        : gamePack.checkpoints;

    return parseGamePack({
      ...gamePack,
      updatedAt: completedAt,
      currentCheckpointId: checkpointId,
      validationEvidence,
      builds: upsertGamePackRecordsById(gamePack.builds, [build]),
      checkpoints,
    });
  }

  const failedBuild = hasMountedRuntimeValidationArtifact(attempt.evidence)
    ? createPlayableBuildRecord({
        id: "build_failed_first_playable",
        startedAt: attempt.startedAt,
        completedAt,
        gamePack,
        status: "failed",
        validationEvidence: attempt.evidence,
      })
    : null;
  const failedAttempt = createFailedAttemptRecord({
    id: failedBuild
      ? "failed_attempt_first_playable_runtime"
      : "failed_attempt_first_playable_pre_runtime",
    startedAt: attempt.startedAt,
    buildId: failedBuild?.id,
    completedAt,
    gamePack,
    summary:
      attempt.failureMessage ??
      "First-playable validation failed before the draft was accepted.",
    validationEvidence: attempt.evidence,
  });

  return parseGamePack({
    ...gamePack,
    updatedAt: completedAt,
    validationEvidence,
    builds: failedBuild
      ? upsertGamePackRecordsById(gamePack.builds, [failedBuild])
      : gamePack.builds,
    failedAttempts: upsertGamePackRecordsById(gamePack.failedAttempts, [
      failedAttempt,
    ]),
  });
}

function updateAttemptWithRuntimeEvidence(
  attempt: FirstPlayableValidationAttempt,
  runtimeEvidence: ValidationEvidence
): FirstPlayableValidationAttempt {
  const evidence = replaceEvidence(attempt.evidence, runtimeEvidence);
  const failed = evidence.some((item) => item.status === "failed");

  return {
    ...attempt,
    evidence,
    status: failed
      ? "failed"
      : hasFirstPlayableEvidencePassed(evidence)
        ? "passed"
        : "running",
    shouldBlockPlayable: failed,
    failureMessage: failed
      ? getFirstPlayableFailureMessage(evidence)
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
