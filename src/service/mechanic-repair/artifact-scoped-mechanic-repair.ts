import type { GenerationConstraintSet } from "@/game-spec";

export const ARTIFACT_SCOPED_MECHANIC_REPAIR_VERSION =
  "artifact_scoped_mechanic_repair/v1";

export const ARTIFACT_SCOPED_REPAIR_STAGES = [
  "contract",
  "source",
  "finalGameSpec",
] as const;

export type ArtifactScopedRepairStage =
  (typeof ARTIFACT_SCOPED_REPAIR_STAGES)[number];

export type ArtifactScopedRepairIssue = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export type ArtifactScopedRepairArtifact = Readonly<{
  id: string;
  value: unknown;
}>;

export type ArtifactScopedRepairStageInput = Readonly<{
  generationRunId: string;
  stage: ArtifactScopedRepairStage;
  attemptNumber: number;
  kind: "initial" | "repair";
  upstreamArtifacts: Readonly<
    Partial<Record<ArtifactScopedRepairStage, ArtifactScopedRepairArtifact>>
  >;
  repair?: Readonly<{
    trigger: "stage_failure" | "upstream_invalidation";
    failureAttemptId: string;
    issues: readonly ArtifactScopedRepairIssue[];
    invalidatedArtifactIds: readonly string[];
  }>;
}>;

export type ArtifactScopedRepairStageResult =
  | Readonly<{
      success: true;
      data: Readonly<{ artifact: ArtifactScopedRepairArtifact }>;
    }>
  | Readonly<{
      success: false;
      evidence: Readonly<{
        responsibleStage: ArtifactScopedRepairStage;
        issues: readonly ArtifactScopedRepairIssue[];
        artifact?: ArtifactScopedRepairArtifact;
      }>;
    }>;

export type ArtifactScopedRepairStageRunner = (
  input: ArtifactScopedRepairStageInput
) => Promise<ArtifactScopedRepairStageResult>;

export type ArtifactScopedRepairStageRunners = Readonly<
  Record<ArtifactScopedRepairStage, ArtifactScopedRepairStageRunner>
>;

type AttemptCounts = Record<ArtifactScopedRepairStage, number>;

type AttemptReceipt = Readonly<{
  id: string;
  stage: ArtifactScopedRepairStage;
  attemptNumber: number;
  kind: "initial" | "repair";
  status: "accepted" | "rejected";
  durationMs: number;
  inputArtifactIds: readonly string[];
  artifactId?: string;
  issues?: readonly ArtifactScopedRepairIssue[];
  responsibleStage?: ArtifactScopedRepairStage;
  repair?: NonNullable<ArtifactScopedRepairStageInput["repair"]>;
}>;

type ArtifactReceipt = {
  artifactId: string;
  stage: ArtifactScopedRepairStage;
  attemptId: string;
  status: "accepted" | "rejected" | "invalidated";
  dependsOnArtifactIds: string[];
  invalidatedByAttemptId?: string;
};

export type ArtifactScopedMechanicRepairReceipt = Readonly<{
  schemaVersion: typeof ARTIFACT_SCOPED_MECHANIC_REPAIR_VERSION;
  generationRunId: string;
  status: "succeeded" | "repair_exhausted";
  repairStatus: "not_needed" | "repaired" | "repair_exhausted";
  durationMs: number;
  maximumAttempts: Readonly<AttemptCounts>;
  attemptCounts: Readonly<AttemptCounts>;
  attempts: readonly AttemptReceipt[];
  artifacts: readonly Readonly<ArtifactReceipt>[];
  exhausted?: Readonly<{
    stage: ArtifactScopedRepairStage;
    maximumAttempts: number;
    failureAttemptId: string;
    issues: readonly ArtifactScopedRepairIssue[];
  }>;
}>;

export type ArtifactScopedMechanicRepairResult =
  | Readonly<{
      status: "succeeded";
      artifacts: Readonly<
        Record<ArtifactScopedRepairStage, ArtifactScopedRepairArtifact>
      >;
      receipt: ArtifactScopedMechanicRepairReceipt;
    }>
  | Readonly<{
      status: "repair_exhausted";
      receipt: ArtifactScopedMechanicRepairReceipt;
    }>;

export type RunArtifactScopedMechanicRepairInput = Readonly<{
  generationRunId: string;
  constraintSet: GenerationConstraintSet;
  stageRunners: ArtifactScopedRepairStageRunners;
  now?: () => number;
}>;

export async function runArtifactScopedMechanicRepair({
  generationRunId,
  constraintSet,
  stageRunners,
  now = () => Date.now(),
}: RunArtifactScopedMechanicRepairInput): Promise<ArtifactScopedMechanicRepairResult> {
  const runStartedAt = now();
  const maximumAttempts = maximumAttemptsForConstraintSet(constraintSet);
  const attemptCounts: AttemptCounts = {
    contract: 0,
    source: 0,
    finalGameSpec: 0,
  };
  const attempts: AttemptReceipt[] = [];
  const artifacts: ArtifactReceipt[] = [];
  const artifactIds = new Set<string>();
  const acceptedArtifacts: Partial<
    Record<ArtifactScopedRepairStage, ArtifactScopedRepairArtifact>
  > = {};
  const pendingRepairs: Partial<
    Record<ArtifactScopedRepairStage, ArtifactScopedRepairStageInput["repair"]>
  > = {};
  let stageIndex = 0;

  while (stageIndex < ARTIFACT_SCOPED_REPAIR_STAGES.length) {
    const stage = ARTIFACT_SCOPED_REPAIR_STAGES[stageIndex];
    const stageMaximumAttempts = maximumAttempts[stage];
    if (attemptCounts[stage] >= stageMaximumAttempts) {
      const repair = pendingRepairs[stage];
      if (!repair) {
        throw new TypeError(
          `Repair stage "${stage}" exhausted without failure evidence.`
        );
      }
      return snapshot({
        status: "repair_exhausted",
        receipt: createReceipt({
          generationRunId,
          status: "repair_exhausted",
          durationMs: elapsedDuration(runStartedAt, now()),
          maximumAttempts,
          attemptCounts,
          attempts,
          artifacts,
          exhausted: {
            stage,
            maximumAttempts: stageMaximumAttempts,
            failureAttemptId: repair.failureAttemptId,
            issues: repair.issues,
          },
        }),
      });
    }

    const attemptNumber = ++attemptCounts[stage];
    const attemptId = createAttemptId(
      generationRunId,
      stage,
      attemptNumber
    );
    const upstreamArtifacts = upstreamArtifactsForStage(
      acceptedArtifacts,
      stageIndex
    );
    const attemptStartedAt = now();
    const stageInput: ArtifactScopedRepairStageInput = snapshot({
      generationRunId,
      stage,
      attemptNumber,
      kind: attemptNumber === 1 ? "initial" : "repair",
      upstreamArtifacts,
      ...(pendingRepairs[stage]
        ? { repair: pendingRepairs[stage] }
        : {}),
    });
    const result = snapshot(await stageRunners[stage](stageInput));
    const durationMs = elapsedDuration(attemptStartedAt, now());

    if (result.success) {
      claimArtifactId(result.data.artifact.id, artifactIds);
      acceptedArtifacts[stage] = result.data.artifact;
      attempts.push({
        id: attemptId,
        stage,
        attemptNumber,
        kind: attemptNumber === 1 ? "initial" : "repair",
        status: "accepted",
        durationMs,
        inputArtifactIds: Object.values(upstreamArtifacts).map(
          (artifact) => artifact.id
        ),
        artifactId: result.data.artifact.id,
        ...(stageInput.repair ? { repair: stageInput.repair } : {}),
      });
      artifacts.push({
        artifactId: result.data.artifact.id,
        stage,
        attemptId,
        status: "accepted",
        dependsOnArtifactIds: directDependencyIdsForStage(
          upstreamArtifacts,
          stageIndex
        ),
      });
      delete pendingRepairs[stage];
      stageIndex += 1;
      continue;
    }

    const responsibleStageIndex = ARTIFACT_SCOPED_REPAIR_STAGES.indexOf(
      result.evidence.responsibleStage
    );
    if (responsibleStageIndex < 0 || responsibleStageIndex > stageIndex) {
      throw new TypeError(
        `The "${stage}" stage cannot classify a failure as downstream "${result.evidence.responsibleStage}".`
      );
    }
    if (result.evidence.issues.length === 0) {
      throw new TypeError(
        `The "${stage}" stage must return at least one exact repair issue.`
      );
    }
    if (result.evidence.artifact) {
      claimArtifactId(result.evidence.artifact.id, artifactIds);
    }

    attempts.push({
      id: attemptId,
      stage,
      attemptNumber,
      kind: attemptNumber === 1 ? "initial" : "repair",
      status: "rejected",
      durationMs,
      inputArtifactIds: Object.values(upstreamArtifacts).map(
        (artifact) => artifact.id
      ),
      ...(result.evidence.artifact
        ? { artifactId: result.evidence.artifact.id }
        : {}),
      issues: result.evidence.issues,
      responsibleStage: result.evidence.responsibleStage,
      ...(stageInput.repair ? { repair: stageInput.repair } : {}),
    });
    if (result.evidence.artifact) {
      artifacts.push({
        artifactId: result.evidence.artifact.id,
        stage,
        attemptId,
        status: "rejected",
        dependsOnArtifactIds: directDependencyIdsForStage(
          upstreamArtifacts,
          stageIndex
        ),
      });
    }
    const invalidatedArtifactIds: string[] = [];
    for (
      let dependentIndex = responsibleStageIndex;
      dependentIndex < ARTIFACT_SCOPED_REPAIR_STAGES.length;
      dependentIndex += 1
    ) {
      const dependentStage = ARTIFACT_SCOPED_REPAIR_STAGES[dependentIndex];
      const acceptedArtifact = acceptedArtifacts[dependentStage];
      if (!acceptedArtifact) {
        continue;
      }
      invalidatedArtifactIds.push(acceptedArtifact.id);
      const artifactReceipt = artifacts.find(
        (artifact) =>
          artifact.artifactId === acceptedArtifact.id &&
          artifact.status === "accepted"
      );
      if (artifactReceipt) {
        artifactReceipt.status = "invalidated";
        artifactReceipt.invalidatedByAttemptId = attemptId;
      }
      delete acceptedArtifacts[dependentStage];
    }
    pendingRepairs[result.evidence.responsibleStage] = {
      trigger: "stage_failure",
      failureAttemptId: attemptId,
      issues: result.evidence.issues,
      invalidatedArtifactIds,
    };
    for (
      let dependentIndex = responsibleStageIndex + 1;
      dependentIndex < ARTIFACT_SCOPED_REPAIR_STAGES.length;
      dependentIndex += 1
    ) {
      const dependentStage = ARTIFACT_SCOPED_REPAIR_STAGES[dependentIndex];
      if (attemptCounts[dependentStage] === 0) {
        continue;
      }
      pendingRepairs[dependentStage] = {
        trigger: "upstream_invalidation",
        failureAttemptId: attemptId,
        issues: [],
        invalidatedArtifactIds,
      };
    }
    stageIndex = responsibleStageIndex;
  }

  return snapshot({
    status: "succeeded",
    artifacts: acceptedArtifacts as Record<
      ArtifactScopedRepairStage,
      ArtifactScopedRepairArtifact
    >,
    receipt: createReceipt({
      generationRunId,
      status: "succeeded",
      durationMs: elapsedDuration(runStartedAt, now()),
      maximumAttempts,
      attemptCounts,
      attempts,
      artifacts,
    }),
  });
}

function repairLimitForStage(
  constraintSet: GenerationConstraintSet,
  stage: ArtifactScopedRepairStage
) {
  return stage === "finalGameSpec"
    ? constraintSet.maximumRepairAttempts.finalGameSpec
    : constraintSet.maximumRepairAttempts[stage];
}

function maximumAttemptsForConstraintSet(
  constraintSet: GenerationConstraintSet
): AttemptCounts {
  return {
    contract: 1 + repairLimitForStage(constraintSet, "contract"),
    source: 1 + repairLimitForStage(constraintSet, "source"),
    finalGameSpec: 1 + repairLimitForStage(constraintSet, "finalGameSpec"),
  };
}

function upstreamArtifactsForStage(
  artifacts: Partial<
    Record<ArtifactScopedRepairStage, ArtifactScopedRepairArtifact>
  >,
  stageIndex: number
) {
  return Object.fromEntries(
    ARTIFACT_SCOPED_REPAIR_STAGES.slice(0, stageIndex).flatMap((stage) =>
      artifacts[stage] ? [[stage, artifacts[stage]]] : []
    )
  ) as Partial<
    Record<ArtifactScopedRepairStage, ArtifactScopedRepairArtifact>
  >;
}

function directDependencyIdsForStage(
  artifacts: Partial<
    Record<ArtifactScopedRepairStage, ArtifactScopedRepairArtifact>
  >,
  stageIndex: number
) {
  if (stageIndex === 0) {
    return [];
  }
  const dependency = artifacts[ARTIFACT_SCOPED_REPAIR_STAGES[stageIndex - 1]];
  return dependency ? [dependency.id] : [];
}

function createAttemptId(
  generationRunId: string,
  stage: ArtifactScopedRepairStage,
  attemptNumber: number
) {
  return `${generationRunId}_${stage}_${attemptNumber}`;
}

function claimArtifactId(artifactId: string, artifactIds: Set<string>) {
  if (artifactId.length === 0) {
    throw new TypeError("Artifact IDs must not be empty.");
  }
  if (artifactIds.has(artifactId)) {
    throw new TypeError(
      `Artifact ID "${artifactId}" was already used in this GenerationRun.`
    );
  }
  artifactIds.add(artifactId);
}

function createReceipt({
  generationRunId,
  status,
  durationMs,
  maximumAttempts,
  attemptCounts,
  attempts,
  artifacts,
  exhausted,
}: {
  generationRunId: string;
  status: ArtifactScopedMechanicRepairReceipt["status"];
  durationMs: number;
  maximumAttempts: AttemptCounts;
  attemptCounts: AttemptCounts;
  attempts: AttemptReceipt[];
  artifacts: ArtifactReceipt[];
  exhausted?: NonNullable<ArtifactScopedMechanicRepairReceipt["exhausted"]>;
}): ArtifactScopedMechanicRepairReceipt {
  const hadRepair = attempts.some((attempt) => attempt.kind === "repair");
  return {
    schemaVersion: ARTIFACT_SCOPED_MECHANIC_REPAIR_VERSION,
    generationRunId,
    status,
    repairStatus:
      status === "repair_exhausted"
        ? "repair_exhausted"
        : hadRepair
          ? "repaired"
          : "not_needed",
    durationMs,
    maximumAttempts: { ...maximumAttempts },
    attemptCounts: { ...attemptCounts },
    attempts: [...attempts],
    artifacts: artifacts.map((artifact) => ({
      ...artifact,
      dependsOnArtifactIds: [...artifact.dependsOnArtifactIds],
    })),
    ...(exhausted ? { exhausted } : {}),
  };
}

function elapsedDuration(startedAt: number, completedAt: number) {
  return Math.max(0, completedAt - startedAt);
}

function snapshot<Value>(value: Value): Value {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
