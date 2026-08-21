import {
  ARTIFACT_SCOPED_MECHANIC_REPAIR_VERSION,
  ARTIFACT_SCOPED_REPAIR_STAGES,
  artifactScopedRepairAttemptIdSchema,
  generationRunSchema,
  getArtifactScopedRepairGenerationRunOutcome,
  type ArtifactScopedMechanicRepairReceipt,
  type ArtifactScopedRepairArtifactReceipt,
  type ArtifactScopedRepairArtifactId,
  type ArtifactScopedRepairAttemptReceipt,
  type ArtifactScopedRepairAttemptId,
  type ArtifactScopedRepairIssue,
  type ArtifactScopedRepairStage,
  type GenerationConstraintSet,
  type GenerationRun,
} from "@/game-spec";

export {
  ARTIFACT_SCOPED_MECHANIC_REPAIR_VERSION,
  ARTIFACT_SCOPED_REPAIR_STAGES,
  artifactScopedRepairArtifactIdSchema,
  artifactScopedRepairAttemptIdSchema,
  type ArtifactScopedMechanicRepairReceipt,
  type ArtifactScopedRepairArtifactId,
  type ArtifactScopedRepairAttemptId,
  type ArtifactScopedRepairIssue,
  type ArtifactScopedRepairStage,
} from "@/game-spec";

export type ArtifactScopedRepairArtifact = Readonly<{
  id: ArtifactScopedRepairArtifactId;
  value: unknown;
}>;

export type ArtifactScopedRepairStageInput = Readonly<{
  generationRunId: GenerationRun["id"];
  stage: ArtifactScopedRepairStage;
  attemptNumber: number;
  kind: "initial" | "repair";
  upstreamArtifacts: Readonly<
    Partial<Record<ArtifactScopedRepairStage, ArtifactScopedRepairArtifact>>
  >;
  repair?: Readonly<{
    trigger: "stage_failure" | "upstream_invalidation";
    failureAttemptId: ArtifactScopedRepairAttemptId;
    issues: ArtifactScopedRepairIssue[];
    invalidatedArtifactIds: ArtifactScopedRepairArtifactId[];
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

type AttemptReceipt = ArtifactScopedRepairAttemptReceipt;
type ArtifactReceipt = ArtifactScopedRepairArtifactReceipt;
type AttemptReceiptBase = Pick<
  AttemptReceipt,
  | "id"
  | "stage"
  | "attemptNumber"
  | "kind"
  | "durationMs"
  | "inputArtifactIds"
  | "repair"
>;

export type ArtifactScopedMechanicRepairResult =
  | Readonly<{
      status: "succeeded";
      artifacts: Readonly<
        Record<ArtifactScopedRepairStage, ArtifactScopedRepairArtifact>
      >;
      generationRun: GenerationRun;
      receipt: ArtifactScopedMechanicRepairReceipt;
    }>
  | Readonly<{
      status: "repair_exhausted";
      generationRun: GenerationRun;
      receipt: ArtifactScopedMechanicRepairReceipt;
    }>;

export type RunArtifactScopedMechanicRepairInput = Readonly<{
  generationRun: GenerationRun;
  constraintSet: GenerationConstraintSet;
  stageRunners: ArtifactScopedRepairStageRunners;
  now?: () => number;
  completedAt?: () => string;
}>;

export async function runArtifactScopedMechanicRepair({
  generationRun,
  constraintSet,
  stageRunners,
  now = () => Date.now(),
  completedAt = () => new Date().toISOString(),
}: RunArtifactScopedMechanicRepairInput): Promise<ArtifactScopedMechanicRepairResult> {
  const runningGenerationRun = parseRunningGenerationRun(generationRun);
  const generationRunId = runningGenerationRun.id;
  const runStartedAt = now();
  const maximumAttempts = maximumAttemptsForConstraintSet(constraintSet);
  const attemptCounts: AttemptCounts = {
    contract: 0,
    source: 0,
    finalGameSpec: 0,
  };
  const attempts: AttemptReceipt[] = [];
  const artifacts: ArtifactReceipt[] = [];
  const artifactIds = new Set<ArtifactScopedRepairArtifactId>();
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
      const failureAttempt = attempts.find(
        (attempt) => attempt.id === repair.failureAttemptId
      );
      if (
        !failureAttempt ||
        failureAttempt.status !== "rejected" ||
        !failureAttempt.issues ||
        failureAttempt.issues.length === 0
      ) {
        throw new TypeError(
          `Repair stage "${stage}" exhausted without exact rejected-attempt issues.`
        );
      }
      const receipt = createReceipt({
        generationRunId,
        status: "repair_exhausted",
        durationMs: elapsedDuration(runStartedAt, now()),
        maximumAttempts,
        attemptCounts,
        attempts,
        artifacts,
        exhausted: {
          trigger: repair.trigger,
          stage,
          maximumAttempts: stageMaximumAttempts,
          failureAttemptId: repair.failureAttemptId,
          issues: [...failureAttempt.issues],
        },
      });
      return snapshot({
        status: "repair_exhausted",
        generationRun: finalizeGenerationRun({
          generationRun: runningGenerationRun,
          receipt,
          completedAt: completedAt(),
        }),
        receipt,
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
    const attemptReceiptBase = createAttemptReceiptBase({
      attemptId,
      stageInput,
      durationMs,
    });

    if (result.success) {
      claimArtifactId(result.data.artifact.id, artifactIds);
      acceptedArtifacts[stage] = result.data.artifact;
      attempts.push({
        ...attemptReceiptBase,
        status: "accepted",
        artifactId: result.data.artifact.id,
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
      ...attemptReceiptBase,
      status: "rejected",
      ...(result.evidence.artifact
        ? { artifactId: result.evidence.artifact.id }
        : {}),
      issues: [...result.evidence.issues],
      responsibleStage: result.evidence.responsibleStage,
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
    const invalidatedArtifactIds: ArtifactScopedRepairArtifactId[] = [];
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
      issues: [...result.evidence.issues],
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

  const receipt = createReceipt({
    generationRunId,
    status: "succeeded",
    durationMs: elapsedDuration(runStartedAt, now()),
    maximumAttempts,
    attemptCounts,
    attempts,
    artifacts,
  });
  return snapshot({
    status: "succeeded",
    artifacts: acceptedArtifacts as Record<
      ArtifactScopedRepairStage,
      ArtifactScopedRepairArtifact
    >,
    generationRun: finalizeGenerationRun({
      generationRun: runningGenerationRun,
      receipt,
      completedAt: completedAt(),
    }),
    receipt,
  });
}

function parseRunningGenerationRun(generationRun: GenerationRun): GenerationRun {
  const parsedGenerationRun = generationRunSchema.parse(generationRun);

  if (parsedGenerationRun.status !== "running") {
    throw new TypeError(
      `Artifact-scoped repair requires a running GenerationRun; received "${parsedGenerationRun.status}".`
    );
  }
  if (parsedGenerationRun.artifactScopedRepair) {
    throw new TypeError(
      `GenerationRun "${parsedGenerationRun.id}" already contains artifact-scoped repair evidence.`
    );
  }

  return snapshot(parsedGenerationRun);
}

function finalizeGenerationRun({
  generationRun,
  receipt,
  completedAt,
}: {
  generationRun: GenerationRun;
  receipt: ArtifactScopedMechanicRepairReceipt;
  completedAt: string;
}): GenerationRun {
  const runningFields = { ...generationRun };
  delete runningFields.artifactScopedRepair;
  delete runningFields.completedAt;
  delete runningFields.durationMs;
  delete runningFields.failureClass;
  delete runningFields.repairStatus;
  delete runningFields.stage;
  const completedAtMs = new Date(completedAt).getTime();
  const startedAtMs = new Date(generationRun.startedAt).getTime();
  const terminalOutcome = getArtifactScopedRepairGenerationRunOutcome(receipt);

  return generationRunSchema.parse({
    ...runningFields,
    ...terminalOutcome,
    completedAt,
    durationMs: Math.max(0, completedAtMs - startedAtMs),
    artifactScopedRepair: receipt,
  });
}

function createAttemptReceiptBase({
  attemptId,
  stageInput,
  durationMs,
}: {
  attemptId: ArtifactScopedRepairAttemptId;
  stageInput: ArtifactScopedRepairStageInput;
  durationMs: number;
}): AttemptReceiptBase {
  return {
    id: attemptId,
    stage: stageInput.stage,
    attemptNumber: stageInput.attemptNumber,
    kind: stageInput.kind,
    durationMs,
    inputArtifactIds: Object.values(stageInput.upstreamArtifacts).map(
      (artifact) => artifact.id
    ),
    ...(stageInput.repair ? { repair: stageInput.repair } : {}),
  };
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
  generationRunId: GenerationRun["id"],
  stage: ArtifactScopedRepairStage,
  attemptNumber: number
): ArtifactScopedRepairAttemptId {
  return artifactScopedRepairAttemptIdSchema.parse(
    `${generationRunId}_${stage}_${attemptNumber}`
  );
}

function claimArtifactId(
  artifactId: ArtifactScopedRepairArtifactId,
  artifactIds: Set<ArtifactScopedRepairArtifactId>
) {
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
  generationRunId: GenerationRun["id"];
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
