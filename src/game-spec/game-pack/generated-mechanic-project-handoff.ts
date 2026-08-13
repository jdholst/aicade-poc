import { z } from "zod";

import type { JsonValue, StableId } from "../game-spec-schema";
import { configDslValueMatches } from "@/game-spec/mechanics/generated-mechanic-contract";
import { mechanicCapabilityGrantExactlyMatchesContract } from "@/game-spec/mechanics/mechanic-capability-registry";
import type {
  GeneratedMechanicContract,
  GeneratedMechanicReferenceCatalog,
} from "../mechanics/generated-mechanic-contract";
import {
  ACCEPTED_GENERATED_MECHANIC_ARTIFACT_VERSION,
  acceptedGeneratedMechanicArtifactSchema,
  createGeneratedMechanicRuntimePolicy,
  generatedMechanicProjectHostProfileIssues,
  generatedMechanicFinalGameSpecSchema,
  persistedGeneratedMechanicSourceArtifactSchema,
  type AcceptedGeneratedMechanicArtifact,
  type GeneratedMechanicFinalGameSpec,
  type GeneratedMechanicRuntimePolicy,
} from "@/game-spec/mechanics/generated-mechanic-project-artifact";
import {
  validateFinalGameSpecMechanicConnections,
  type MechanicPortContract,
} from "@/runtime/mechanics/mechanic-port-runtime";
import { isGeneratedMechanicProjectRuntimeAuthentic } from "@/runtime/mechanics/generated-mechanic-project-runtime";
import {
  isGeneratedMechanicEvaluationResultAuthentic,
  type GeneratedMechanicEvaluationResult,
} from "@/service/mechanic-evaluation/mechanic-evaluation";
import type { GeneratedMechanicSourceArtifact } from "@/service/mechanic-source-generation";

import type { GenerationRunRepository } from "../generation-run/generation-run-repository";
import type { GenerationRun } from "../generation-run/generation-run-schema";
import { hasExactAcceptedArtifactScopedRepairLineage } from "../generation-run/artifact-scoped-mechanic-repair-receipt";
import type { FirstPlayableValidationAttempt } from "./first-playable-validation";
import { writeFirstPlayableValidationResult } from "./first-playable-validation";
import { hasFirstPlayableEvidencePassed } from "./first-playable-validation-bar";
import type { GamePackRepository } from "./game-pack-repository";
import { createPlayableBuildRecord } from "./game-pack-lineage";
import {
  parseGamePack,
  type GamePack,
  type ValidationEvidence,
} from "./game-pack-schema";

export const GENERATED_MECHANIC_ACTIVATION_CHECK_ID =
  "generated_mechanic_activation" as const;

const acceptedAtSchema = z.string().datetime({ offset: true });

export type GeneratedMechanicProjectDependency = Readonly<{
  contract: GeneratedMechanicContract;
  finalGameSpec: GeneratedMechanicFinalGameSpec;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  runtimePolicy: GeneratedMechanicRuntimePolicy;
  sourceArtifact: GeneratedMechanicSourceArtifact;
  trustedPortContracts: readonly MechanicPortContract[];
}>;

export type LoadedGeneratedMechanicProjectDependency = Readonly<{
  dependency: GeneratedMechanicProjectDependency;
  extensionId: StableId;
  extensionVersionId: StableId;
  mechanicId: StableId;
  sourceArtifactId: StableId;
  capabilityVersion: string;
}>;

export type GeneratedMechanicProjectActivation = Readonly<{
  dependency: GeneratedMechanicProjectDependency;
  extensionId: StableId;
  extensionVersionId: StableId;
  mechanicId: StableId;
  sourceArtifactId: StableId;
  capabilityVersion: string;
}>;

export type GeneratedMechanicProjectBrowserResult = Readonly<{
  activation: GeneratedMechanicProjectActivation;
  attempt: FirstPlayableValidationAttempt;
}>;

export type GeneratedMechanicProjectRuntime = Readonly<{
  loadProjectDependency(
    dependency: GeneratedMechanicProjectDependency
  ): Promise<LoadedGeneratedMechanicProjectDependency>;
  installTrustedTemplate(input: Readonly<{
    finalGameSpec: GeneratedMechanicFinalGameSpec;
    loadedDependency: LoadedGeneratedMechanicProjectDependency;
  }>): Promise<GeneratedMechanicProjectActivation>;
  runFirstPlayableBrowserChecks(input: Readonly<{
    activation: GeneratedMechanicProjectActivation;
    finalGameSpec: GeneratedMechanicFinalGameSpec;
    gamePack: GamePack;
  }>): Promise<GeneratedMechanicProjectBrowserResult>;
  disposeProjectDependency(input: Readonly<{
    activation?: GeneratedMechanicProjectActivation;
    loadedDependency?: LoadedGeneratedMechanicProjectDependency;
  }>): Promise<void>;
}>;

export type GeneratedMechanicProjectHandoffIssue = Readonly<{
  path: string;
  code: StableId;
  message: string;
}>;

export type GeneratedMechanicProjectHandoffResult =
  | Readonly<{
      outcome: "accepted";
      gamePack: GamePack;
      generationRun: GenerationRun;
      artifact: AcceptedGeneratedMechanicArtifact;
    }>
  | Readonly<{
      outcome: "rejected";
      evidence: Readonly<{
        stage:
          | "preflight"
          | "deterministic_evaluation"
          | "runtime_activation"
          | "first_playable"
          | "persistence";
        issues: readonly GeneratedMechanicProjectHandoffIssue[];
        runtimeEvidence?: unknown;
      }>;
    }>;

export type CompleteGeneratedMechanicProjectHandoffInput = Readonly<{
  acceptedAt: string;
  contract: GeneratedMechanicContract;
  deterministicEvaluation: GeneratedMechanicEvaluationResult;
  finalGameSpec: GeneratedMechanicFinalGameSpec;
  gamePack: GamePack;
  gamePackRepository: Pick<GamePackRepository, "compareAndSwap" | "load">;
  generationRunId: GenerationRun["id"];
  generationRunRepository: Pick<GenerationRunRepository, "fetch" | "update">;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  runtime: GeneratedMechanicProjectRuntime;
  sourceArtifact: GeneratedMechanicSourceArtifact;
  trustedPortContracts: readonly MechanicPortContract[];
}>;

export type RestoreGeneratedMechanicProjectHandoffInput = Readonly<{
  gamePackId: GamePack["id"];
  gamePackRepository: Pick<GamePackRepository, "load">;
  runtime: GeneratedMechanicProjectRuntime;
  trustedPortContracts: readonly MechanicPortContract[];
}>;

export type PrepareRestoredGeneratedMechanicProjectInput = Readonly<{
  gamePack: GamePack;
  trustedPortContracts: readonly MechanicPortContract[];
}>;

export type PreparedRestoredGeneratedMechanicProject = Readonly<{
  artifact: AcceptedGeneratedMechanicArtifact;
  dependency: GeneratedMechanicProjectDependency;
}>;

export type PrepareRestoredGeneratedMechanicProjectResult =
  | Readonly<{
      success: true;
      data: PreparedRestoredGeneratedMechanicProject;
    }>
  | Readonly<{
      success: false;
      issues: readonly GeneratedMechanicProjectHandoffIssue[];
    }>;

export type RestoreGeneratedMechanicProjectHandoffResult =
  | Readonly<{
      outcome: "restored";
      gamePack: GamePack;
      artifact: AcceptedGeneratedMechanicArtifact;
      activation: GeneratedMechanicProjectActivation;
      firstPlayableAttempt: FirstPlayableValidationAttempt;
    }>
  | Extract<GeneratedMechanicProjectHandoffResult, { outcome: "rejected" }>;

export async function completeGeneratedMechanicProjectHandoff({
  acceptedAt,
  contract,
  deterministicEvaluation,
  finalGameSpec: finalGameSpecInput,
  gamePack,
  gamePackRepository,
  generationRunId,
  generationRunRepository,
  referenceCatalog,
  runtime,
  sourceArtifact,
  trustedPortContracts,
}: CompleteGeneratedMechanicProjectHandoffInput): Promise<GeneratedMechanicProjectHandoffResult> {
  const acceptedAtResult = acceptedAtSchema.safeParse(acceptedAt);
  if (!acceptedAtResult.success) {
    return reject("preflight", [
      issue(
        "acceptedAt",
        "invalid_accepted_at",
        "Generated mechanic acceptance requires an ISO 8601 timestamp with an explicit offset."
      ),
    ]);
  }
  const acceptedAtMilliseconds = Date.parse(acceptedAtResult.data);

  const finalGameSpecResult = validateGeneratedMechanicFinalGameSpec({
    contract,
    finalGameSpec: finalGameSpecInput,
    referenceCatalog,
    sourceArtifact,
    trustedPortContracts,
  });
  if (!finalGameSpecResult.success) {
    return reject("preflight", finalGameSpecResult.issues);
  }
  const finalGameSpec = finalGameSpecResult.data;
  if (!jsonEqual(gamePack.gameSpec, finalGameSpec.gameSpec)) {
    return reject("preflight", [
      issue(
        "gamePack.gameSpec.id",
        "game_spec_mismatch",
        "Generated mechanic handoff must target the exact Final Game Spec snapshot in the candidate Game Pack."
      ),
    ]);
  }
  if (
    gamePack.acceptedGeneratedMechanicArtifacts?.some(
      ({ id }) => id === finalGameSpec.extension.versionId
    )
  ) {
    return reject("preflight", [
      issue(
        "finalGameSpec.extension.versionId",
        "immutable_version_id_reuse",
        "An accepted generated mechanic extension version ID is immutable and cannot be accepted again."
      ),
    ]);
  }

  const generationRun = await generationRunRepository.fetch(generationRunId);
  if (!generationRun || generationRun.status !== "succeeded") {
    return reject("preflight", [
      issue(
        "generationRunId",
        "generation_run_not_succeeded",
        "Generated mechanic project handoff requires the terminal succeeded GenerationRun that produced the artifact."
      ),
    ]);
  }
  const generationRunIssues = sourceGenerationRunIssues({
    contract,
    finalGameSpec,
    generationRun,
    sourceArtifact,
  });
  if (generationRunIssues.length > 0) {
    return reject("preflight", generationRunIssues);
  }
  const projectStateTimestamps = [
    gamePack.createdAt,
    gamePack.updatedAt,
    generationRun.completedAt,
  ].filter((timestamp): timestamp is string => timestamp !== undefined);
  if (
    projectStateTimestamps.some(
      (timestamp) => Date.parse(timestamp) > acceptedAtMilliseconds
    )
  ) {
    return reject("preflight", [
      issue(
        "acceptedAt",
        "accepted_at_before_project_state",
        "Generated mechanic acceptance cannot predate the retained Game Pack or completed GenerationRun state."
      ),
    ]);
  }

  const evaluationIssues = deterministicEvaluationIssues({
    contract,
    evaluation: deterministicEvaluation,
    sourceArtifact,
  });
  if (evaluationIssues.length > 0) {
    return reject("deterministic_evaluation", evaluationIssues);
  }

  if (!isGeneratedMechanicProjectRuntimeAuthentic(runtime)) {
    return reject("preflight", [
      issue(
        "runtime",
        "untrusted_project_runtime",
        "Generated mechanic handoff requires a trusted project runtime created by the runtime boundary factory."
      ),
    ]);
  }

  const dependency = snapshot({
    contract,
    finalGameSpec,
    referenceCatalog,
    runtimePolicy: createGeneratedMechanicRuntimePolicy({
      contract,
      versionId: finalGameSpec.extension.versionId,
    }),
    sourceArtifact,
    trustedPortContracts: [],
  });
  const expectedRuntimeIdentity = createExpectedRuntimeIdentity(
    dependency,
    finalGameSpec
  );
  let loadedDependency: LoadedGeneratedMechanicProjectDependency;
  let activation: GeneratedMechanicProjectActivation;
  try {
    loadedDependency = await runtime.loadProjectDependency(dependency);
  } catch (error) {
    return rejectAfterRuntimeCleanup({
      runtime,
      stage: "runtime_activation",
      issues: [
        issue(
          "runtime.loadProjectDependency",
          "runtime_dependency_load_failed",
          errorMessage(error, "Generated mechanic dependency load failed.")
        ),
      ],
    });
  }
  const loadedIssues = exactRuntimeIdentityIssues(
    "loadedDependency",
    loadedDependency,
    expectedRuntimeIdentity
  );
  if (loadedIssues.length > 0) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      stage: "runtime_activation",
      issues: loadedIssues,
      runtimeEvidence: loadedDependency,
    });
  }
  try {
    activation = await runtime.installTrustedTemplate({
      finalGameSpec,
      loadedDependency,
    });
  } catch (error) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      stage: "runtime_activation",
      issues: [
        issue(
          "runtime.installTrustedTemplate",
          "runtime_activation_failed",
          errorMessage(error, "Generated mechanic runtime activation failed.")
        ),
      ],
    });
  }

  const activationIssues = exactRuntimeIdentityIssues(
    "activation",
    activation,
    expectedRuntimeIdentity
  );
  if (activationIssues.length > 0) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      activation,
      stage: "runtime_activation",
      issues: activationIssues,
      runtimeEvidence: activation,
    });
  }

  let browserResult: GeneratedMechanicProjectBrowserResult;
  try {
    browserResult = await runtime.runFirstPlayableBrowserChecks({
      activation,
      finalGameSpec,
      gamePack,
    });
  } catch (error) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      activation,
      stage: "first_playable",
      issues: [
        issue(
          "firstPlayable",
          "first_playable_checks_failed",
          errorMessage(error, "First-playable browser checks failed.")
        ),
      ],
    });
  }
  const browserActivationIssues = exactRuntimeIdentityIssues(
    "firstPlayable.activation",
    browserResult.activation,
    expectedRuntimeIdentity
  );
  if (browserActivationIssues.length > 0) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      activation,
      stage: "first_playable",
      issues: browserActivationIssues,
      runtimeEvidence: browserResult,
    });
  }
  const firstPlayableAttempt = browserResult.attempt;
  if (
    firstPlayableAttempt.gamePackId !== gamePack.id ||
    firstPlayableAttempt.status !== "passed" ||
    !hasFirstPlayableEvidencePassed(firstPlayableAttempt.evidence)
  ) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      activation,
      stage: "first_playable",
      issues: firstPlayableAttemptIssues(firstPlayableAttempt, gamePack.id),
      runtimeEvidence: firstPlayableAttempt.evidence,
    });
  }
  const firstPlayableStartedAtMilliseconds = Date.parse(
    firstPlayableAttempt.startedAt
  );
  if (
    !Number.isFinite(firstPlayableStartedAtMilliseconds) ||
    acceptedAtMilliseconds < firstPlayableStartedAtMilliseconds
  ) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      activation,
      stage: "first_playable",
      issues: [
        issue(
          "acceptedAt",
          "accepted_at_before_first_playable",
          "Generated mechanic acceptance cannot predate the retained first-playable validation attempt."
        ),
      ],
      runtimeEvidence: firstPlayableAttempt,
    });
  }
  const cleanupIssues = await runtimeCleanupIssues({
    runtime,
    loadedDependency,
    activation,
  });
  if (cleanupIssues.length > 0) {
    return reject("runtime_activation", cleanupIssues);
  }

  const artifactId = finalGameSpec.extension.versionId;
  const activationEvidence = createActivationEvidence({
    acceptedAt,
    activation,
  });
  const acceptedAttemptInput: FirstPlayableValidationAttempt = {
    ...firstPlayableAttempt,
    evidence: [...firstPlayableAttempt.evidence, activationEvidence],
  };
  const { attempt: acceptedAttempt, gamePack: firstPlayableGamePack } =
    gamePack.acceptedGeneratedMechanicArtifacts?.length
      ? writeGeneratedMechanicVersionValidationResult({
          artifactId,
          attempt: acceptedAttemptInput,
          completedAt: acceptedAt,
          gamePack,
        })
      : {
          attempt: acceptedAttemptInput,
          gamePack: writeFirstPlayableValidationResult({
            attempt: acceptedAttemptInput,
            completedAt: acceptedAt,
            gamePack,
          }),
        };
  const checkpoint = firstPlayableGamePack.checkpoints.find(
    ({ id }) => id === firstPlayableGamePack.currentCheckpointId
  );
  const build = checkpoint?.buildId
    ? firstPlayableGamePack.builds.find(({ id }) => id === checkpoint.buildId)
    : undefined;
  if (!checkpoint || !build) {
    return reject("persistence", [
      issue(
        "gamePack.currentCheckpointId",
        "accepted_lineage_missing",
        "Accepted generated mechanic handoff requires a validated build and current Version Checkpoint."
      ),
    ]);
  }

  const validationEvidenceIds = acceptedAttempt.evidence.map(({ id }) => id);
  const acceptedArtifact = acceptedGeneratedMechanicArtifactSchema.parse({
    schemaVersion: ACCEPTED_GENERATED_MECHANIC_ARTIFACT_VERSION,
    id: artifactId,
    extensionId: finalGameSpec.extension.id,
    versionId: finalGameSpec.extension.versionId,
    sourceGenerationRunId: generationRunId,
    acceptedAt,
    finalGameSpecArtifactId: finalGameSpec.id,
    finalGameSpec,
    gameSpecId: finalGameSpec.gameSpec.id,
    mechanicId: finalGameSpec.extension.mechanicId,
    mechanicType: finalGameSpec.extension.mechanicType,
    contract,
    sourceArtifact: persistedGeneratedMechanicSourceArtifactSchema.parse({
      schemaVersion: sourceArtifact.schemaVersion,
      id: sourceArtifact.id,
      contractId: sourceArtifact.contractId,
      intentId: sourceArtifact.intentId,
      capabilityVersion: sourceArtifact.capabilityVersion,
      grant: sourceArtifact.grant,
      usedCapabilities: sourceArtifact.usedCapabilities,
      callbacks: sourceArtifact.callbacks,
      build: sourceArtifact.build,
    }),
    runtimePolicy: dependency.runtimePolicy,
    config: finalGameSpec.extension.config,
    bindings: finalGameSpec.extension.bindings,
    referenceCatalog,
    buildId: build.id,
    checkpointId: checkpoint.id,
    validationEvidenceIds,
  });
  const acceptedGamePackLineage = {
    ...firstPlayableGamePack,
    acceptedGeneratedMechanicArtifacts: [
      ...(firstPlayableGamePack.acceptedGeneratedMechanicArtifacts ?? []),
      acceptedArtifact,
    ],
    builds: firstPlayableGamePack.builds.map((candidateBuild) =>
      candidateBuild.id === build.id
        ? { ...candidateBuild, generatedMechanicArtifactIds: [artifactId] }
        : candidateBuild
    ),
    checkpoints: firstPlayableGamePack.checkpoints.map((candidateCheckpoint) =>
      candidateCheckpoint.id === checkpoint.id
        ? { ...candidateCheckpoint, generatedMechanicArtifactIds: [artifactId] }
        : candidateCheckpoint
    ),
    validationEvidence: firstPlayableGamePack.validationEvidence.map(
      (evidence) =>
        validationEvidenceIds.includes(evidence.id)
          ? { ...evidence, generatedMechanicArtifactIds: [artifactId] }
          : evidence
    ),
  };
  const linkedGenerationRunSnapshot = attachAcceptedLineage(
    generationRun,
    acceptedGamePackLineage,
    acceptedArtifact
  );
  const acceptedGamePack = parseGamePack({
    ...acceptedGamePackLineage,
    generationRuns: [
      ...firstPlayableGamePack.generationRuns.filter(
        ({ id }) => id !== generationRunId
      ),
      linkedGenerationRunSnapshot,
    ],
  });

  let previousGamePack: GamePack | null;
  try {
    previousGamePack = await gamePackRepository.load(acceptedGamePack.id);
  } catch (error) {
    return reject("persistence", [
      issue(
        "persistence.gamePack",
        "game_pack_commit_preflight_failed",
        errorMessage(
          error,
          "Could not capture the durable Game Pack state before acceptance."
        )
      ),
    ]);
  }
  if (previousGamePack && !jsonEqual(previousGamePack, gamePack)) {
    return reject("persistence", [
      issue(
        "persistence.gamePack",
        "stale_game_pack_snapshot",
        "Generated mechanic acceptance requires the caller Game Pack to match the current durable snapshot."
      ),
    ]);
  }

  let gamePackCommitted = false;
  let generationRunUpdateAttempted = false;
  try {
    const committed = await gamePackRepository.compareAndSwap(
      acceptedGamePack.id,
      previousGamePack,
      acceptedGamePack
    );
    if (!committed) {
      return reject("persistence", [
        issue(
          "persistence.gamePack",
          "stale_game_pack_snapshot",
          "Durable Game Pack state changed while generated mechanic acceptance was committing."
        ),
      ]);
    }
    gamePackCommitted = true;
    const restoredGamePack = await gamePackRepository.load(acceptedGamePack.id);
    const restoredArtifact = restoredGamePack?.acceptedGeneratedMechanicArtifacts?.find(
      ({ id }) => id === artifactId
    );
    if (!restoredGamePack || !restoredArtifact || !jsonEqual(restoredArtifact, acceptedArtifact)) {
      const rollbackIssues = await rollbackAcceptedGamePack({
        gamePackId: acceptedGamePack.id,
        gamePackRepository,
        previousGamePack,
        writtenGamePack: acceptedGamePack,
      });
      return reject("persistence", [
        issue(
          "gamePack.acceptedGeneratedMechanicArtifacts",
          "accepted_artifact_restore_mismatch",
          "Durable restore did not return the exact accepted generated mechanic artifact."
        ),
        ...rollbackIssues,
      ]);
    }
    generationRunUpdateAttempted = true;
    const linkedGenerationRun = await generationRunRepository.update(
      generationRunId,
      (currentRun) =>
        attachAcceptedLineage(currentRun, restoredGamePack, restoredArtifact)
    );
    return snapshot({
      outcome: "accepted" as const,
      gamePack: restoredGamePack,
      generationRun: linkedGenerationRun,
      artifact: restoredArtifact,
    });
  } catch (error) {
    const generationRunRollbackIssues = generationRunUpdateAttempted
      ? await rollbackAcceptedGenerationRun({
          generationRun,
          generationRunRepository,
        })
      : [];
    const rollbackIssues = gamePackCommitted
      ? await rollbackAcceptedGamePack({
          gamePackId: acceptedGamePack.id,
          gamePackRepository,
          previousGamePack,
          writtenGamePack: acceptedGamePack,
        })
      : [];
    return reject("persistence", [
      issue(
        "persistence",
        "accepted_artifact_persistence_failed",
        errorMessage(error, "Accepted generated mechanic persistence failed.")
      ),
      ...generationRunRollbackIssues,
      ...rollbackIssues,
    ]);
  }
}

function writeGeneratedMechanicVersionValidationResult({
  artifactId,
  attempt,
  completedAt,
  gamePack,
}: Readonly<{
  artifactId: StableId;
  attempt: FirstPlayableValidationAttempt;
  completedAt: string;
  gamePack: GamePack;
}>): Readonly<{
  attempt: FirstPlayableValidationAttempt;
  gamePack: GamePack;
}> {
  const evidence = attempt.evidence.map((record) => {
    const {
      generatedMechanicArtifactIds: existingArtifactIds,
      ...unlinkedRecord
    } = record;
    void existingArtifactIds;
    return {
      ...unlinkedRecord,
      id: `${record.id}_${artifactId}`,
    };
  });
  const versionedAttempt = { ...attempt, evidence };
  const checkpointId = `checkpoint_${artifactId}`;
  const build = createPlayableBuildRecord({
    id: `build_${artifactId}`,
    startedAt: attempt.startedAt,
    completedAt,
    gamePack,
    checkpointId,
    status: "validated",
    validationEvidence: evidence,
  });
  const checkpoint = {
    id: checkpointId,
    createdAt: completedAt,
    label: "Generated mechanic version",
    summary: "Validated acceptance checkpoint for a generated mechanic version.",
    gameSpecId: gamePack.gameSpec.id,
    buildId: build.id,
    validationEvidenceIds: evidence.map(({ id }) => id),
    metadata: {
      acceptedGeneratedMechanicArtifactId: artifactId,
      validationAttemptStartedAt: attempt.startedAt,
      validationCompletedAt: completedAt,
    },
  };

  return {
    attempt: versionedAttempt,
    gamePack: parseGamePack({
      ...gamePack,
      updatedAt: completedAt,
      currentCheckpointId: checkpoint.id,
      validationEvidence: [...gamePack.validationEvidence, ...evidence],
      builds: [...gamePack.builds, build],
      checkpoints: [...gamePack.checkpoints, checkpoint],
    }),
  };
}

export function prepareRestoredGeneratedMechanicProject({
  gamePack,
  trustedPortContracts,
}: PrepareRestoredGeneratedMechanicProjectInput): PrepareRestoredGeneratedMechanicProjectResult {
  const checkpoint = gamePack.checkpoints.find(
    ({ id }) => id === gamePack.currentCheckpointId
  );
  const artifactIds = checkpoint?.generatedMechanicArtifactIds ?? [];
  if (!checkpoint || artifactIds.length !== 1) {
    return {
      success: false,
      issues: [
        issue(
          "gamePack.currentCheckpointId",
          "checkpoint_artifact_mismatch",
          "Generated mechanic restore requires exactly one accepted artifact on the current Version Checkpoint."
        ),
      ],
    };
  }
  const artifact = gamePack.acceptedGeneratedMechanicArtifacts?.find(
    ({ id }) => id === artifactIds[0]
  );
  if (!artifact) {
    return {
      success: false,
      issues: [
        issue(
          "gamePack.acceptedGeneratedMechanicArtifacts",
          "accepted_artifact_not_found",
          "Current Version Checkpoint must reference the exact accepted generated mechanic artifact."
        ),
      ],
    };
  }
  const sourceArtifact: GeneratedMechanicSourceArtifact = snapshot(
    artifact.sourceArtifact
  );
  if (!jsonEqual(gamePack.gameSpec, artifact.finalGameSpec.gameSpec)) {
    return {
      success: false,
      issues: [
        issue(
          "gamePack.gameSpec",
          "persisted_final_game_spec_mismatch",
          "The current Game Spec must exactly match the accepted Final Game Spec snapshot."
        ),
      ],
    };
  }
  const validation = validateGeneratedMechanicFinalGameSpec({
    contract: artifact.contract,
    finalGameSpec: artifact.finalGameSpec,
    referenceCatalog: artifact.referenceCatalog,
    sourceArtifact,
    trustedPortContracts,
  });
  if (!validation.success) {
    return validation;
  }
  return {
    success: true,
    data: snapshot({
      artifact,
      dependency: {
        contract: artifact.contract,
        finalGameSpec: validation.data,
        referenceCatalog: artifact.referenceCatalog,
        runtimePolicy: artifact.runtimePolicy,
        sourceArtifact,
        trustedPortContracts: [],
      },
    }),
  };
}

export async function restoreGeneratedMechanicProjectHandoff({
  gamePackId,
  gamePackRepository,
  runtime,
  trustedPortContracts,
}: RestoreGeneratedMechanicProjectHandoffInput): Promise<RestoreGeneratedMechanicProjectHandoffResult> {
  if (!isGeneratedMechanicProjectRuntimeAuthentic(runtime)) {
    return reject("preflight", [
      issue(
        "runtime",
        "untrusted_project_runtime",
        "Generated mechanic restore requires a trusted project runtime created by the runtime boundary factory."
      ),
    ]);
  }

  let gamePack: GamePack | null;
  try {
    gamePack = await gamePackRepository.load(gamePackId);
  } catch (error) {
    return reject("persistence", [
      issue(
        "gamePackId",
        "game_pack_restore_failed",
        errorMessage(error, "Generated mechanic Game Pack restore failed.")
      ),
    ]);
  }
  if (!gamePack) {
    return reject("persistence", [
      issue(
        "gamePackId",
        "game_pack_not_found",
        "Generated mechanic Game Pack could not be restored."
      ),
    ]);
  }
  const prepared = prepareRestoredGeneratedMechanicProject({
    gamePack,
    trustedPortContracts,
  });
  if (!prepared.success) {
    return reject("preflight", prepared.issues);
  }
  const { artifact, dependency } = prepared.data;
  const finalGameSpec = dependency.finalGameSpec;
  const expectedRuntimeIdentity = createExpectedRuntimeIdentity(
    dependency,
    finalGameSpec
  );
  let loadedDependency: LoadedGeneratedMechanicProjectDependency;
  let activation: GeneratedMechanicProjectActivation;
  try {
    loadedDependency = await runtime.loadProjectDependency(dependency);
  } catch (error) {
    return rejectAfterRuntimeCleanup({
      runtime,
      stage: "runtime_activation",
      issues: [
        issue(
          "runtime.loadProjectDependency",
          "runtime_dependency_load_failed",
          errorMessage(error, "Restored generated mechanic load failed.")
        ),
      ],
    });
  }
  const loadedIssues = exactRuntimeIdentityIssues(
    "loadedDependency",
    loadedDependency,
    expectedRuntimeIdentity
  );
  if (loadedIssues.length > 0) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      stage: "runtime_activation",
      issues: loadedIssues,
      runtimeEvidence: loadedDependency,
    });
  }
  try {
    activation = await runtime.installTrustedTemplate({
      finalGameSpec,
      loadedDependency,
    });
  } catch (error) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      stage: "runtime_activation",
      issues: [
        issue(
          "runtime.installTrustedTemplate",
          "runtime_activation_failed",
          errorMessage(error, "Restored generated mechanic activation failed.")
        ),
      ],
    });
  }
  const activationIssues = exactRuntimeIdentityIssues(
    "activation",
    activation,
    expectedRuntimeIdentity
  );
  if (activationIssues.length > 0) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      activation,
      stage: "runtime_activation",
      issues: activationIssues,
      runtimeEvidence: activation,
    });
  }
  let browserResult: GeneratedMechanicProjectBrowserResult;
  try {
    browserResult = await runtime.runFirstPlayableBrowserChecks({
      activation,
      finalGameSpec,
      gamePack,
    });
  } catch (error) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      activation,
      stage: "first_playable",
      issues: [
        issue(
          "firstPlayable",
          "first_playable_checks_failed",
          errorMessage(error, "Restored first-playable browser checks failed.")
        ),
      ],
    });
  }
  const browserActivationIssues = exactRuntimeIdentityIssues(
    "firstPlayable.activation",
    browserResult.activation,
    expectedRuntimeIdentity
  );
  if (browserActivationIssues.length > 0) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      activation,
      stage: "first_playable",
      issues: browserActivationIssues,
      runtimeEvidence: browserResult,
    });
  }
  const firstPlayableAttempt = browserResult.attempt;
  if (
    firstPlayableAttempt.status !== "passed" ||
    firstPlayableAttempt.gamePackId !== gamePack.id ||
    !hasFirstPlayableEvidencePassed(firstPlayableAttempt.evidence)
  ) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      activation,
      stage: "first_playable",
      issues: [
        issue(
          "firstPlayable",
          "restored_first_playable_not_passed",
          "Restored generated mechanic artifact did not repeat first-playable browser proof."
        ),
      ],
      runtimeEvidence: firstPlayableAttempt.evidence,
    });
  }
  const cleanupIssues = await runtimeCleanupIssues({
    runtime,
    loadedDependency,
    activation,
  });
  if (cleanupIssues.length > 0) {
    return reject("runtime_activation", cleanupIssues);
  }
  return snapshot({
    outcome: "restored" as const,
    gamePack,
    artifact,
    activation,
    firstPlayableAttempt,
  });
}

export function validateGeneratedMechanicFinalGameSpec({
  contract,
  finalGameSpec: finalGameSpecInput,
  referenceCatalog,
  sourceArtifact,
  trustedPortContracts,
}: Readonly<{
  contract: GeneratedMechanicContract;
  finalGameSpec: unknown;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  sourceArtifact: GeneratedMechanicSourceArtifact;
  trustedPortContracts: readonly MechanicPortContract[];
}>):
  | Readonly<{ success: true; data: GeneratedMechanicFinalGameSpec }>
  | Readonly<{
      success: false;
      issues: readonly GeneratedMechanicProjectHandoffIssue[];
    }> {
  const parsed = generatedMechanicFinalGameSpecSchema.safeParse(
    finalGameSpecInput
  );
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((parseIssue) =>
        issue(
          parseIssue.path.map(String).join(".") || "finalGameSpec",
          "invalid_final_game_spec",
          parseIssue.message
        )
      ),
    };
  }
  const finalGameSpec = parsed.data;
  const extension = finalGameSpec.extension;
  const issues: GeneratedMechanicProjectHandoffIssue[] = [];
  const mechanic = finalGameSpec.gameSpec.mechanics.find(
    ({ id }) => id === extension.mechanicId
  );
  if (!mechanic) {
    issues.push(
      issue(
        "extension.mechanicId",
        "unknown_mechanic",
        "Generated mechanic extension must bind to one active Final Game Spec mechanic."
      )
    );
  } else {
    if (mechanic.type !== extension.mechanicType) {
      issues.push(
        issue(
          "extension.mechanicType",
          "mechanic_type_mismatch",
          "Generated mechanic type must match the active Final Game Spec mechanic."
        )
      );
    }
    if (!jsonEqual(mechanic.config, extension.config)) {
      issues.push(
        issue(
          "extension.config",
          "mechanic_config_mismatch",
          "Generated mechanic config must match the active Final Game Spec mechanic config."
        )
      );
    }
  }
  if (extension.contractId !== contract.id) {
    issues.push(
      issue(
        "extension.contractId",
        "contract_identity_mismatch",
        "Final Game Spec must reference the exact accepted mechanic contract."
      )
    );
  }
  if (
    extension.sourceArtifactId !== sourceArtifact.id ||
    sourceArtifact.contractId !== contract.id ||
    sourceArtifact.intentId !== contract.intentId
  ) {
    issues.push(
      issue(
        "extension.sourceArtifactId",
        "source_artifact_identity_mismatch",
        "Final Game Spec must reference the exact compiled source artifact for the accepted contract and intent."
      )
    );
  }
  if (
    extension.capabilityVersion !== contract.capabilityVersion ||
    sourceArtifact.capabilityVersion !== contract.capabilityVersion ||
    sourceArtifact.grant.capabilityVersion !== contract.capabilityVersion
  ) {
    issues.push(
      issue(
        "extension.capabilityVersion",
        "capability_version_mismatch",
        "Final Game Spec, contract, and source artifact must share one exact capability version."
      )
    );
  }
  if (!sourceArtifactIsCompiled(sourceArtifact)) {
    issues.push(
      issue(
        "sourceArtifact.build",
        "source_artifact_not_compiled",
        "Final Game Spec requires the parsed, typechecked, compiled, and statically validated source artifact."
      )
    );
  }
  const contractCapabilityIds = [...contract.capabilities].sort();
  const usedCapabilityIds = [...sourceArtifact.usedCapabilities].sort();
  if (
    !mechanicCapabilityGrantExactlyMatchesContract(
      sourceArtifact.grant,
      contract
    ) ||
    !jsonEqual(usedCapabilityIds, contractCapabilityIds)
  ) {
    issues.push(
      issue(
        "sourceArtifact.grant",
        "source_capability_grant_mismatch",
        "Compiled source must retain the contract's exact least-authority capability grant and usage."
      )
    );
  }
  if (!configDslValueMatches(contract.config, extension.config, referenceCatalog)) {
    issues.push(
      issue(
        "extension.config",
        "invalid_mechanic_config",
        "Final Game Spec config does not match the accepted Mechanic Config DSL contract."
      )
    );
  }
  addBindingIssues(issues, contract, extension.bindings, referenceCatalog, mechanic);

  const connectionValidation = validateFinalGameSpecMechanicConnections({
    contracts: [
      {
        ownerKind: "mechanic",
        ownerId: extension.mechanicId,
        ports: contract.ports,
      },
      ...trustedPortContracts,
    ],
    connectionPlan: finalGameSpec.gameSpec.mechanicConnections ?? {
      schemaVersion: "mechanic_port_connections/v1",
      connections: [],
    },
  });
  if (!connectionValidation.success) {
    issues.push(
      ...connectionValidation.issues.map((connectionIssue) =>
        issue(
          `gameSpec.mechanicConnections.${connectionIssue.path}`,
          connectionIssue.code,
          connectionIssue.message
        )
      )
    );
  }
  for (const hostIssue of generatedMechanicProjectHostProfileIssues({
    contract,
    finalGameSpec,
    referenceCatalog,
  })) {
    issues.push(
      issue(
        hostIssue.path,
        hostIssue.code,
        hostIssue.message
      )
    );
  }

  return issues.length > 0
    ? { success: false, issues: snapshot(issues) }
    : { success: true, data: snapshot(finalGameSpec) };
}

function addBindingIssues(
  issues: GeneratedMechanicProjectHandoffIssue[],
  contract: GeneratedMechanicContract,
  bindings: GeneratedMechanicFinalGameSpec["extension"]["bindings"],
  referenceCatalog: GeneratedMechanicReferenceCatalog,
  mechanic: GeneratedMechanicFinalGameSpec["gameSpec"]["mechanics"][number] | undefined
) {
  const bindingsById = new Map(bindings.map((binding) => [binding.id, binding]));
  if (bindingsById.size !== bindings.length || bindings.length !== contract.bindings.length) {
    issues.push(
      issue(
        "extension.bindings",
        "binding_set_mismatch",
        "Final Game Spec must bind every accepted contract binding exactly once."
      )
    );
  }
  for (const contractBinding of contract.bindings) {
    const binding = bindingsById.get(contractBinding.id);
    if (
      !binding ||
      binding.referenceKind !== contractBinding.referenceKind ||
      binding.cardinality !== contractBinding.cardinality ||
      !jsonEqual(binding.objectIds, contractBinding.objectIds)
    ) {
      issues.push(
        issue(
          `extension.bindings.${contractBinding.id}`,
          "binding_contract_mismatch",
          `Final Game Spec binding "${contractBinding.id}" must match the accepted contract declaration.`
        )
      );
      continue;
    }
    const knownIds = ownCatalogIds(referenceCatalog, binding.referenceKind);
    if (
      !knownIds ||
      binding.objectIds.some((objectId) => !knownIds.includes(objectId))
    ) {
      issues.push(
        issue(
          `extension.bindings.${binding.id}.objectIds`,
          "unknown_binding_reference",
          `Final Game Spec binding "${binding.id}" must reference trusted "${binding.referenceKind}" IDs.`
        )
      );
    }
    const mechanicReferenceIds = mechanic
      ? mechanicReferenceIdsForKind(mechanic, binding.referenceKind)
      : undefined;
    if (
      mechanicReferenceIds &&
      binding.objectIds.some((objectId) => !mechanicReferenceIds.includes(objectId))
    ) {
      issues.push(
        issue(
          `gameSpec.mechanics.${mechanic?.id}.${binding.referenceKind}Ids`,
          "mechanic_binding_reference_mismatch",
          `Active mechanic references must include every object in binding "${binding.id}".`
        )
      );
    }
  }
}

function deterministicEvaluationIssues({
  contract,
  evaluation,
  sourceArtifact,
}: {
  contract: GeneratedMechanicContract;
  evaluation: GeneratedMechanicEvaluationResult;
  sourceArtifact: GeneratedMechanicSourceArtifact;
}): GeneratedMechanicProjectHandoffIssue[] {
  const issues: GeneratedMechanicProjectHandoffIssue[] = [];
  if (evaluation.outcome !== "passed") {
    issues.push(
      issue(
        "deterministicEvaluation.outcome",
        "deterministic_evaluation_failed",
        "Generated mechanic artifact must pass the shared deterministic evaluation pipeline."
      )
    );
  }
  if (
    evaluation.evidence.contractId !== contract.id ||
    evaluation.evidence.sourceArtifactId !== sourceArtifact.id
  ) {
    issues.push(
      issue(
        "deterministicEvaluation.evidence",
        "evaluation_artifact_mismatch",
        "Deterministic evaluation evidence must identify the exact contract and source artifact."
      )
    );
  }
  const replayScenarios = evaluation.evidence.replay?.replayScenarios;
  if (
    evaluation.evidence.replay?.matched !== true ||
    !Array.isArray(replayScenarios)
  ) {
    issues.push(
      issue(
        "deterministicEvaluation.evidence.replay",
        "deterministic_replay_missing",
        "Accepted generated mechanics require matching deterministic replay evidence."
      )
    );
  } else if (!jsonEqual(evaluation.evidence.scenarios, replayScenarios)) {
    issues.push(
      issue(
        "deterministicEvaluation.evidence.replay.replayScenarios",
        "deterministic_replay_mismatch",
        "Accepted generated mechanics require byte-identical observable evidence across deterministic replay."
      )
    );
  }
  const evaluatedScenarioIds = evaluation.evidence.scenarios.map(
    ({ scenarioId }) => scenarioId
  );
  const replayScenarioIds = replayScenarios?.map(
    ({ scenarioId }) => scenarioId
  );
  const contractScenarioIds = contract.scenarios.map(({ id }) => id);
  if (
    evaluation.evidence.scenarios.some(
      ({ outcome, issues: scenarioIssues }) =>
        outcome !== "passed" || scenarioIssues.length > 0
    ) ||
    !jsonEqual(evaluatedScenarioIds, contractScenarioIds) ||
    (replayScenarioIds !== undefined &&
      !jsonEqual(replayScenarioIds, contractScenarioIds))
  ) {
    issues.push(
      issue(
        "deterministicEvaluation.evidence.scenarios",
        "evaluation_scenario_coverage_mismatch",
        "Deterministic evaluation and replay must pass every accepted contract scenario exactly once."
      )
    );
  }
  const scenarioEvidenceMatchesContract =
    evaluation.evidence.scenarios.length === contract.scenarios.length &&
    evaluation.evidence.scenarios.every((scenarioEvidence, index) => {
      const scenario = contract.scenarios[index];
      return (
        scenario !== undefined &&
        scenarioEvidence.scenarioId === scenario.id &&
        scenarioEvidence.seed === scenario.seed &&
        scenarioEvidence.setup.every(
          ({ actual, assertion, kind, passed }) =>
            passed &&
            kind === assertion.kind &&
            setupEvidenceActualMatchesAssertion(actual, assertion)
        ) &&
        jsonEqual(
          scenarioEvidence.setup.map(({ assertion }) => assertion),
          scenario.setup
        ) &&
        scenarioEvidence.steps.every(
          ({ input, kind, status }) =>
            status === "completed" && kind === input.kind
        ) &&
        jsonEqual(
          scenarioEvidence.steps.map(({ input }) => input),
          scenario.steps
        ) &&
        scenarioEvidence.declaredObservations.every(
          ({ actual, assertion, kind, passed, source }) =>
            passed &&
            source === "model_declared" &&
            kind === assertion.kind &&
            observationEvidenceActualMatchesAssertion(actual, assertion)
        ) &&
        jsonEqual(
          scenarioEvidence.declaredObservations.map(
            ({ assertion }) => assertion
          ),
          scenario.observations
        ) &&
        scenarioEvidence.externalObservations.every(
          ({ actual, assertion, kind, passed, source }) =>
            passed &&
            source === "evaluator_authored" &&
            kind === assertion.kind &&
            observationEvidenceActualMatchesAssertion(actual, assertion)
        )
      );
    });
  if (!scenarioEvidenceMatchesContract) {
    issues.push(
      issue(
        "deterministicEvaluation.evidence.scenarios",
        "evaluation_scenario_evidence_mismatch",
        "Deterministic evaluation evidence must exactly cover every declared setup entry, step, and observation for the accepted contract."
      )
    );
  }
  if (
    issues.length === 0 &&
    !isGeneratedMechanicEvaluationResultAuthentic({
      contract,
      evaluation,
      sourceArtifact,
    })
  ) {
    issues.push(
      issue(
        "deterministicEvaluation",
        "untrusted_evaluation_receipt",
        "Generated mechanic handoff requires the exact in-memory receipt issued by the shared evaluator for this contract and source artifact snapshot."
      )
    );
  }
  return issues;
}

function setupEvidenceActualMatchesAssertion(
  actual: JsonValue,
  assertion: GeneratedMechanicContract["scenarios"][number]["setup"][number]
): boolean {
  return assertion.kind === "binding_present"
    ? actual === true
    : jsonEqual(actual, assertion.value);
}

function observationEvidenceActualMatchesAssertion(
  actual: JsonValue,
  assertion: GeneratedMechanicContract["scenarios"][number]["observations"][number]
): boolean {
  if (assertion.kind === "state_equals") {
    return jsonEqual(actual, assertion.value);
  }
  if (assertion.kind === "output_emitted") {
    return (
      Array.isArray(actual) &&
      actual.some((value) => jsonEqual(value, assertion.value))
    );
  }
  switch (assertion.operator) {
    case "equals":
      return jsonEqual(actual, assertion.value);
    case "not_equals":
      return !jsonEqual(actual, assertion.value);
    case "less_than":
      return numericEvaluationEvidenceComparison(
        actual,
        assertion.value,
        (left, right) => left < right
      );
    case "at_most":
      return numericEvaluationEvidenceComparison(
        actual,
        assertion.value,
        (left, right) => left <= right
      );
    case "greater_than":
      return numericEvaluationEvidenceComparison(
        actual,
        assertion.value,
        (left, right) => left > right
      );
    case "at_least":
      return numericEvaluationEvidenceComparison(
        actual,
        assertion.value,
        (left, right) => left >= right
      );
  }
}

function numericEvaluationEvidenceComparison(
  actual: JsonValue,
  expected: JsonValue,
  compare: (actual: number, expected: number) => boolean
): boolean {
  return (
    typeof actual === "number" &&
    typeof expected === "number" &&
    Number.isFinite(actual) &&
    Number.isFinite(expected) &&
    compare(actual, expected)
  );
}

function firstPlayableAttemptIssues(
  attempt: FirstPlayableValidationAttempt,
  expectedGamePackId: StableId
): GeneratedMechanicProjectHandoffIssue[] {
  const issues = attempt.evidence
    .filter(({ status }) => status === "failed")
    .flatMap((evidence) =>
      evidence.issues?.map((evidenceIssue) =>
        issue(
          evidenceIssue.path ?? evidence.checkId,
          evidenceIssue.code ?? "first_playable_check_failed",
          evidenceIssue.message
        )
      ) ?? [
        issue(
          evidence.checkId,
          "first_playable_check_failed",
          evidence.message ?? "First-playable evidence failed."
        ),
      ]
    );
  if (attempt.gamePackId !== expectedGamePackId) {
    issues.push(
      issue(
        "firstPlayable.gamePackId",
        "first_playable_game_pack_mismatch",
        "First-playable evidence must belong to the candidate Game Pack."
      )
    );
  }
  if (attempt.status !== "passed") {
    issues.push(
      issue(
        "firstPlayable.status",
        "first_playable_not_passed",
        "The exact generated mechanic artifact did not pass first-playable browser checks."
      )
    );
  }
  if (issues.length === 0) {
    issues.push(
      issue(
        "firstPlayable.evidence",
        "first_playable_evidence_incomplete",
        "The exact generated mechanic artifact is missing required runtime or browser evidence."
      )
    );
  }
  return issues;
}

function sourceGenerationRunIssues({
  contract,
  finalGameSpec,
  generationRun,
  sourceArtifact,
}: {
  contract: GeneratedMechanicContract;
  finalGameSpec: GeneratedMechanicFinalGameSpec;
  generationRun: GenerationRun;
  sourceArtifact: GeneratedMechanicSourceArtifact;
}): GeneratedMechanicProjectHandoffIssue[] {
  const issues: GeneratedMechanicProjectHandoffIssue[] = [];
  if (!generationRun.mechanicIds?.includes(finalGameSpec.extension.mechanicId)) {
    issues.push(
      issue(
        "generationRun.mechanicIds",
        "generation_run_mechanic_mismatch",
        "Source GenerationRun must identify the Final Game Spec mechanic receiving the accepted artifact."
      )
    );
  }
  if (
    !hasExactAcceptedArtifactScopedRepairLineage({
      contractArtifactId: contract.id,
      finalGameSpecArtifactId: finalGameSpec.id,
      generationRunId: generationRun.id,
      receipt: generationRun.artifactScopedRepair,
      sourceArtifactId: sourceArtifact.id,
    })
  ) {
    issues.push(
      issue(
        "generationRun.artifactScopedRepair.artifacts",
        "artifact_repair_receipt_mismatch",
        "Source GenerationRun must retain the exact accepted contract → source → Final Game Spec artifact and attempt lineage."
      )
    );
  }
  return issues;
}

function createExpectedRuntimeIdentity(
  dependency: GeneratedMechanicProjectDependency,
  finalGameSpec: GeneratedMechanicFinalGameSpec
): GeneratedMechanicProjectActivation {
  return {
    dependency,
    extensionId: finalGameSpec.extension.id,
    extensionVersionId: finalGameSpec.extension.versionId,
    mechanicId: finalGameSpec.extension.mechanicId,
    sourceArtifactId: dependency.sourceArtifact.id,
    capabilityVersion: dependency.sourceArtifact.capabilityVersion,
  };
}

function exactRuntimeIdentityIssues(
  path: string,
  identity:
    | LoadedGeneratedMechanicProjectDependency
    | GeneratedMechanicProjectActivation,
  expected: GeneratedMechanicProjectActivation
): GeneratedMechanicProjectHandoffIssue[] {
  const issues: GeneratedMechanicProjectHandoffIssue[] = [];
  if (!jsonEqual(identity.dependency, expected.dependency)) {
    issues.push(
      issue(
        `${path}.dependency`,
        "runtime_dependency_substitution",
        "Runtime must retain the exact contract, Final Game Spec, source callbacks, references, and trusted port contracts it loaded."
      )
    );
  }
  if (identity.extensionId !== expected.extensionId) {
    issues.push(
      issue(
        `${path}.extensionId`,
        "runtime_extension_mismatch",
        "Runtime must load and activate the exact generated extension."
      )
    );
  }
  if (identity.extensionVersionId !== expected.extensionVersionId) {
    issues.push(
      issue(
        `${path}.extensionVersionId`,
        "runtime_extension_version_mismatch",
        "Runtime must load and activate the exact generated extension version."
      )
    );
  }
  if (identity.mechanicId !== expected.mechanicId) {
    issues.push(
      issue(
        `${path}.mechanicId`,
        "runtime_mechanic_mismatch",
        "Runtime must install the generated extension for its exact Final Game Spec mechanic."
      )
    );
  }
  if (identity.sourceArtifactId !== expected.sourceArtifactId) {
    issues.push(
      issue(
        `${path}.sourceArtifactId`,
        "runtime_artifact_mismatch",
        "Runtime must load and activate the exact evaluated source artifact."
      )
    );
  }
  if (identity.capabilityVersion !== expected.capabilityVersion) {
    issues.push(
      issue(
        `${path}.capabilityVersion`,
        "runtime_capability_version_mismatch",
        "Runtime must load the source artifact under its exact capability version."
      )
    );
  }
  return issues;
}

function createActivationEvidence({
  acceptedAt,
  activation,
}: {
  acceptedAt: string;
  activation: GeneratedMechanicProjectActivation;
}): ValidationEvidence {
  return {
    id: "evidence_generated_mechanic_activation",
    checkId: GENERATED_MECHANIC_ACTIVATION_CHECK_ID,
    stage: "runtime-boot",
    status: "passed",
    durationMs: 0,
    message:
      "Trusted template activated the exact project-scoped generated mechanic dependency.",
    evidence: {
      acceptedAt,
      artifactId: activation.extensionVersionId,
      extensionId: activation.extensionId,
      extensionVersionId: activation.extensionVersionId,
      finalGameSpecArtifactId: activation.dependency.finalGameSpec.id,
      mechanicId: activation.mechanicId,
      sourceArtifactId: activation.sourceArtifactId,
      capabilityVersion: activation.capabilityVersion,
      runtimePolicy: activation.dependency.runtimePolicy,
    },
  };
}

function attachAcceptedLineage(
  generationRun: GenerationRun,
  gamePack: Pick<GamePack, "id">,
  artifact: Pick<
    AcceptedGeneratedMechanicArtifact,
    | "buildId"
    | "checkpointId"
    | "gameSpecId"
    | "id"
    | "validationEvidenceIds"
  >
): GenerationRun {
  if (generationRun.status !== "succeeded") {
    throw new Error(
      "Accepted generated mechanic lineage can attach only to a succeeded GenerationRun."
    );
  }
  const relationships = {
    ...generationRun.relationships,
    gamePackId: gamePack.id,
    gameSpecId: artifact.gameSpecId,
    acceptedGeneratedMechanicArtifactIds: [artifact.id],
    buildIds: [artifact.buildId],
    checkpointIds: [artifact.checkpointId],
    validationEvidenceIds: [...artifact.validationEvidenceIds],
  };
  delete relationships.failedAttemptIds;

  return {
    ...generationRun,
    relationships,
  };
}

function sourceArtifactIsCompiled(artifact: GeneratedMechanicSourceArtifact) {
  return (
    artifact.schemaVersion === "generated_mechanic_source_artifact/v1" &&
    artifact.build.language === "typescript" &&
    artifact.build.target === "es2020" &&
    artifact.build.parsed === true &&
    artifact.build.typechecked === true &&
    artifact.build.compiled === true &&
    artifact.build.staticValidationTarget === "normalized_javascript" &&
    artifact.build.staticValidationVersion ===
      "generated_mechanic_source_static_validation/v1"
  );
}

function mechanicReferenceIdsForKind(
  mechanic: GeneratedMechanicFinalGameSpec["gameSpec"]["mechanics"][number],
  referenceKind: string
): readonly StableId[] | undefined {
  switch (referenceKind) {
    case "asset":
      return mechanic.assetIds;
    case "entity":
      return mechanic.entityIds;
    case "objective":
      return mechanic.objectiveIds;
    case "region":
      return mechanic.regionIds;
    case "scene":
      return mechanic.sceneIds;
    default:
      return undefined;
  }
}

function ownCatalogIds(
  catalog: GeneratedMechanicReferenceCatalog,
  referenceKind: string
): readonly StableId[] | undefined {
  return Object.prototype.hasOwnProperty.call(catalog, referenceKind)
    ? catalog[referenceKind]
    : undefined;
}

async function rollbackAcceptedGamePack({
  gamePackId,
  gamePackRepository,
  previousGamePack,
  writtenGamePack,
}: {
  gamePackId: GamePack["id"];
  gamePackRepository: Pick<GamePackRepository, "compareAndSwap">;
  previousGamePack: GamePack | null;
  writtenGamePack: GamePack;
}): Promise<GeneratedMechanicProjectHandoffIssue[]> {
  try {
    const restored = await gamePackRepository.compareAndSwap(
      gamePackId,
      writtenGamePack,
      previousGamePack
    );
    if (!restored) {
      throw new Error(
        "Game Pack changed after generated mechanic acceptance and was not overwritten during rollback."
      );
    }
    return [];
  } catch (error) {
    return [
      issue(
        "persistence.gamePackRollback",
        "accepted_artifact_rollback_failed",
        errorMessage(
          error,
          "Accepted generated mechanic persistence could not restore the prior Game Pack state."
        )
      ),
    ];
  }
}

async function rollbackAcceptedGenerationRun({
  generationRun,
  generationRunRepository,
}: {
  generationRun: GenerationRun;
  generationRunRepository: Pick<GenerationRunRepository, "fetch" | "update">;
}): Promise<GeneratedMechanicProjectHandoffIssue[]> {
  let rollbackError: unknown;
  try {
    const currentGenerationRun = await generationRunRepository.fetch(
      generationRun.id
    );
    if (currentGenerationRun && jsonEqual(currentGenerationRun, generationRun)) {
      return [];
    }
    if (!currentGenerationRun) {
      throw new Error(
        `GenerationRun "${generationRun.id}" disappeared during acceptance rollback.`
      );
    }
    try {
      await generationRunRepository.update(
        generationRun.id,
        () => generationRun
      );
    } catch (error) {
      rollbackError = error;
    }
    const restoredGenerationRun = await generationRunRepository.fetch(
      generationRun.id
    );
    if (restoredGenerationRun && jsonEqual(restoredGenerationRun, generationRun)) {
      return [];
    }
    throw rollbackError ?? new Error("GenerationRun rollback verification failed.");
  } catch (error) {
    return [
      issue(
        "persistence.generationRunRollback",
        "generation_run_rollback_failed",
        errorMessage(
          error,
          "Accepted generated mechanic persistence could not restore the prior GenerationRun state."
        )
      ),
    ];
  }
}

async function runtimeCleanupIssues({
  runtime,
  loadedDependency,
  activation,
}: {
  runtime: GeneratedMechanicProjectRuntime;
  loadedDependency?: LoadedGeneratedMechanicProjectDependency;
  activation?: GeneratedMechanicProjectActivation;
}): Promise<GeneratedMechanicProjectHandoffIssue[]> {
  try {
    await runtime.disposeProjectDependency({ loadedDependency, activation });
    return [];
  } catch (error) {
    return [
      issue(
        "runtime.disposeProjectDependency",
        "runtime_dependency_cleanup_failed",
        errorMessage(error, "Generated mechanic runtime cleanup failed.")
      ),
    ];
  }
}

async function rejectAfterRuntimeCleanup({
  runtime,
  loadedDependency,
  activation,
  stage,
  issues,
  runtimeEvidence,
}: {
  runtime: GeneratedMechanicProjectRuntime;
  loadedDependency?: LoadedGeneratedMechanicProjectDependency;
  activation?: GeneratedMechanicProjectActivation;
  stage: Extract<
    GeneratedMechanicProjectHandoffResult,
    { outcome: "rejected" }
  >["evidence"]["stage"];
  issues: readonly GeneratedMechanicProjectHandoffIssue[];
  runtimeEvidence?: unknown;
}): Promise<
  Extract<GeneratedMechanicProjectHandoffResult, { outcome: "rejected" }>
> {
  const cleanupIssues = await runtimeCleanupIssues({
    runtime,
    loadedDependency,
    activation,
  });
  return reject(stage, [...issues, ...cleanupIssues], runtimeEvidence);
}

function reject(
  stage: Extract<
    GeneratedMechanicProjectHandoffResult,
    { outcome: "rejected" }
  >["evidence"]["stage"],
  issues: readonly GeneratedMechanicProjectHandoffIssue[],
  runtimeEvidence?: unknown
): Extract<GeneratedMechanicProjectHandoffResult, { outcome: "rejected" }> {
  return snapshot({
    outcome: "rejected" as const,
    evidence: {
      stage,
      issues,
      ...(runtimeEvidence === undefined ? {} : { runtimeEvidence }),
    },
  });
}

function issue(
  path: string,
  code: StableId,
  message: string
): GeneratedMechanicProjectHandoffIssue {
  return Object.freeze({ path, code, message });
}

function snapshot<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(JSON.stringify(value)) as Value);
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function jsonEqual(left: unknown, right: unknown) {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${stableJsonStringify(child)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
