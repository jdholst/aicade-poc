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
  generatedMechanicRuntimeCandidateSchema,
  type AcceptedGeneratedMechanicArtifact,
  type GeneratedMechanicFinalGameSpec,
  type GeneratedMechanicRuntimeCandidate,
  type GeneratedMechanicRuntimePolicy,
} from "@/game-spec/mechanics/generated-mechanic-project-artifact";
import {
  validateFinalGameSpecMechanicConnections,
  type MechanicPortContract,
} from "@/runtime/mechanics/mechanic-port-runtime";
import { isGeneratedMechanicProjectRuntimeAuthentic } from "@/runtime/mechanics/generated-mechanic-project-runtime";
import {
  isGeneratedMechanicEvaluationResultAuthentic,
  type ExternalAcceptanceObservationAssertion,
  type GeneratedMechanicEvaluationResult,
} from "@/service/mechanic-evaluation/mechanic-evaluation";
import type { GeneratedMechanicSourceArtifact } from "@/service/mechanic-source-generation";

import type { GenerationRunRepository } from "../generation-run/generation-run-repository";
import {
  generationRunSchema,
  type GenerationRun,
} from "../generation-run/generation-run-schema";
import { isCreatorGenerationPersistenceRestorable } from "./creator-generation-persistence-transaction";
import {
  clearGeneratedMechanicHandoffReceipt,
  readGeneratedMechanicHandoffReceipt,
} from "../generation-run/generated-mechanic-handoff-receipt";
import { hasExactAcceptedArtifactScopedRepairLineage } from "../generation-run/artifact-scoped-mechanic-repair-receipt";
import type { FirstPlayableValidationAttempt } from "./first-playable-validation";
import { writeFirstPlayableValidationResult } from "./first-playable-validation";
import { hasFirstPlayableEvidencePassed } from "./first-playable-validation-bar";
import type { GamePackRepository } from "./game-pack-repository";
import {
  createPlayableBuildRecord,
  hasCreatorFacingCheckpoint,
} from "./game-pack-lineage";
import {
  gamePackSchema,
  parseGamePack,
  type GamePack,
  type ValidationEvidence,
} from "./game-pack-schema";

export const GENERATED_MECHANIC_ACTIVATION_CHECK_ID =
  "generated_mechanic_activation" as const;

const GENERATED_MECHANIC_ACCEPTANCE_TRANSACTION_METADATA_KEY =
  "generatedMechanicAcceptanceTransaction" as const;
const GENERATED_MECHANIC_ACCEPTANCE_TRANSACTION_VERSION =
  "generated_mechanic_acceptance_transaction/v1" as const;
const GENERATED_MECHANIC_ACCEPTANCE_PREFLIGHT_RUN_METADATA_KEY =
  "generatedMechanicAcceptancePreflightGenerationRun" as const;
const GENERATED_MECHANIC_ACCEPTANCE_PREVIOUS_GAME_PACK_METADATA_KEY =
  "generatedMechanicAcceptancePreviousGamePack" as const;
const GENERATED_MECHANIC_ACCEPTANCE_CANONICAL_GAME_PACK_ID_METADATA_KEY =
  "generatedMechanicAcceptanceCanonicalGamePackId" as const;
const GENERATED_MECHANIC_ACCEPTANCE_LOCK_NAME =
  "sparkline:generated-mechanic-acceptance:global" as const;
const GENERATED_MECHANIC_ACCEPTANCE_LOCK_RECEIPT_VERSION =
  "generated_mechanic_acceptance_lock_receipt/v1" as const;
const authenticAcceptanceLockReceipts = new WeakSet<object>();

export type GeneratedMechanicAcceptanceLockReceipt = Readonly<{
  schemaVersion: typeof GENERATED_MECHANIC_ACCEPTANCE_LOCK_RECEIPT_VERSION;
}>;

type GeneratedMechanicAcceptanceCrossRealmLockManager = Readonly<{
  request<T>(
    name: string,
    options: Readonly<{ mode: "exclusive"; signal?: AbortSignal }>,
    callback: () => Promise<T>
  ): Promise<T>;
}>;

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
  project: PreparedGeneratedMechanicRuntimeProject;
  dependency: GeneratedMechanicProjectDependency;
  extensionId: StableId;
  extensionVersionId: StableId;
  mechanicId: StableId;
  sourceArtifactId: StableId;
  capabilityVersion: string;
}>;

export type GeneratedMechanicProjectActivation = Readonly<{
  project: PreparedGeneratedMechanicRuntimeProject;
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
    project: PreparedGeneratedMechanicRuntimeProject
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

type GeneratedMechanicAcceptanceTimeInput =
  | Readonly<{
      acceptedAt: string;
      createAcceptedAt?: never;
    }>
  | Readonly<{
      acceptedAt?: never;
      createAcceptedAt: () => string;
    }>;

export type CompleteGeneratedMechanicProjectHandoffInput = Readonly<{
  acceptanceLockReceipt?: GeneratedMechanicAcceptanceLockReceipt;
  contract: GeneratedMechanicContract;
  deterministicEvaluation: GeneratedMechanicEvaluationResult;
  finalGameSpec: GeneratedMechanicFinalGameSpec;
  gamePack: GamePack;
  gamePackRepository: Pick<GamePackRepository, "compareAndSwap" | "load">;
  generationRunId: GenerationRun["id"];
  generationRunRepository: Pick<GenerationRunRepository, "fetch" | "update">;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  runtime: GeneratedMechanicProjectRuntime;
  signal?: AbortSignal;
  sourceArtifact: GeneratedMechanicSourceArtifact;
  trustedPortContracts: readonly MechanicPortContract[];
}> &
  GeneratedMechanicAcceptanceTimeInput;

export type RestoreGeneratedMechanicProjectHandoffInput = Readonly<{
  gamePackId: GamePack["id"];
  gamePackRepository: Pick<GamePackRepository, "load">;
  runtime: GeneratedMechanicProjectRuntime;
  trustedPortContracts: readonly MechanicPortContract[];
}>;

export type ReconcileGeneratedMechanicAcceptanceTransactionsInput = Readonly<{
  gamePackRepository: Pick<
    GamePackRepository,
    "compareAndSwap" | "list" | "load"
  >;
  generationRunRepository: Pick<
    GenerationRunRepository,
    "fetch" | "list" | "update"
  >;
  signal?: AbortSignal;
}>;

export type ReconcileGeneratedMechanicAcceptanceTransactionsResult =
  Readonly<{
    blockedCanonicalGamePackIds: readonly GamePack["id"][];
    issues: readonly GeneratedMechanicProjectHandoffIssue[];
    reconciledPendingGamePackIds: readonly GamePack["id"][];
    restorableGamePack: GamePack | null;
  }>;

export type PrepareRestoredGeneratedMechanicProjectInput = Readonly<{
  gamePack: GamePack;
  trustedPortContracts: readonly MechanicPortContract[];
}>;

export type PreparedRestoredGeneratedMechanicProject = Readonly<{
  artifact: AcceptedGeneratedMechanicArtifact;
  dependency: GeneratedMechanicProjectDependency;
}>;

export type PreparedGeneratedMechanicRuntimeCandidateProject = Readonly<{
  runtimeCandidate: GeneratedMechanicRuntimeCandidate;
  dependency: GeneratedMechanicProjectDependency;
}>;

export type PreparedGeneratedMechanicRuntimeProject =
  | PreparedGeneratedMechanicRuntimeCandidateProject
  | PreparedRestoredGeneratedMechanicProject;

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

class GeneratedMechanicAcceptanceLockUnavailableError extends Error {
  constructor() {
    super(
      "The browser cross-realm lock manager is unavailable for generated mechanic acceptance."
    );
    this.name = "GeneratedMechanicAcceptanceLockUnavailableError";
  }
}

export async function withGeneratedMechanicAcceptanceLock<T>({
  operation,
  signal,
}: Readonly<{
  operation: (
    receipt: GeneratedMechanicAcceptanceLockReceipt
  ) => Promise<T>;
  signal?: AbortSignal;
}>): Promise<T> {
  const lockManager = getGeneratedMechanicAcceptanceLockManager();
  if (!lockManager) {
    throw new GeneratedMechanicAcceptanceLockUnavailableError();
  }
  return lockManager.request(
    GENERATED_MECHANIC_ACCEPTANCE_LOCK_NAME,
    { mode: "exclusive", ...(signal ? { signal } : {}) },
    async () => {
      const receipt = Object.freeze({
        schemaVersion: GENERATED_MECHANIC_ACCEPTANCE_LOCK_RECEIPT_VERSION,
      });
      authenticAcceptanceLockReceipts.add(receipt);
      try {
        return await operation(receipt);
      } finally {
        authenticAcceptanceLockReceipts.delete(receipt);
      }
    }
  );
}

function getGeneratedMechanicAcceptanceLockManager():
  | GeneratedMechanicAcceptanceCrossRealmLockManager
  | undefined {
  if (typeof globalThis.navigator === "undefined") {
    return undefined;
  }
  const lockManager = globalThis.navigator.locks;
  return lockManager && typeof lockManager.request === "function"
    ? (lockManager as GeneratedMechanicAcceptanceCrossRealmLockManager)
    : undefined;
}

export async function completeGeneratedMechanicProjectHandoff({
  acceptanceLockReceipt,
  acceptedAt,
  createAcceptedAt,
  contract,
  deterministicEvaluation,
  finalGameSpec: finalGameSpecInput,
  gamePack,
  gamePackRepository,
  generationRunId,
  generationRunRepository,
  referenceCatalog,
  runtime,
  signal,
  sourceArtifact,
  trustedPortContracts,
}: CompleteGeneratedMechanicProjectHandoffInput): Promise<GeneratedMechanicProjectHandoffResult> {
  const staticAcceptedAtResult =
    acceptedAt === undefined ? undefined : acceptedAtSchema.safeParse(acceptedAt);
  if (
    (acceptedAt === undefined && !createAcceptedAt) ||
    (acceptedAt !== undefined && createAcceptedAt) ||
    staticAcceptedAtResult?.success === false
  ) {
    return reject("preflight", [
      issue(
        "acceptedAt",
        "invalid_accepted_at",
        "Generated mechanic acceptance requires an ISO 8601 timestamp with an explicit offset."
      ),
    ]);
  }
  if (signal?.aborted) {
    return reject("preflight", [generationCancelledIssue()]);
  }

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

  let fetchedGenerationRun: GenerationRun | null;
  try {
    fetchedGenerationRun =
      await generationRunRepository.fetch(generationRunId);
  } catch (error) {
    return reject("persistence", [
      issue(
        "generationRunId",
        "generation_run_fetch_failed",
        errorMessage(
          error,
          "Could not load the GenerationRun required for generated mechanic acceptance."
        )
      ),
    ]);
  }
  if (!fetchedGenerationRun || fetchedGenerationRun.status !== "succeeded") {
    return reject("preflight", [
      issue(
        "generationRunId",
        "generation_run_not_succeeded",
        "Generated mechanic project handoff requires the terminal succeeded GenerationRun that produced the artifact."
      ),
    ]);
  }
  let generationRun = fetchedGenerationRun;
  const pendingHandoffReceipt =
    readGeneratedMechanicHandoffReceipt(generationRun);
  if (
    pendingHandoffReceipt === "invalid" ||
    (pendingHandoffReceipt !== undefined &&
      (!acceptanceLockReceipt ||
        !authenticAcceptanceLockReceipts.has(acceptanceLockReceipt)))
  ) {
    return reject("preflight", [
      issue(
        "generationRun.metadata.generatedMechanicHandoff",
        "generated_mechanic_handoff_receipt_invalid",
        "Generated mechanic handoff requires its exact pending lineage receipt under the live cross-realm acceptance lock."
      ),
    ]);
  }
  if (
    pendingHandoffReceipt !== undefined &&
    (pendingHandoffReceipt.generationRunId !== generationRun.id ||
      pendingHandoffReceipt.intentArtifactId !== contract.intentId ||
      pendingHandoffReceipt.contractArtifactId !== contract.id ||
      pendingHandoffReceipt.sourceArtifactId !== sourceArtifact.id ||
      pendingHandoffReceipt.finalGameSpecArtifactId !== finalGameSpec.id)
  ) {
    return reject("preflight", [
      issue(
        "generationRun.metadata.generatedMechanicHandoff",
        "generated_mechanic_handoff_lineage_mismatch",
        "Generated mechanic handoff receipt lineage must exactly match the accepted intent, contract, source, and Final Game Spec artifacts."
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
    staticAcceptedAtResult?.success === true &&
    projectStateTimestamps.some(
      (timestamp) =>
        Date.parse(timestamp) > Date.parse(staticAcceptedAtResult.data)
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
    finalGameSpec,
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
  const runtimeCandidateResult = generatedMechanicRuntimeCandidateSchema.safeParse({
    schemaVersion: "generated_mechanic_runtime_candidate/v1",
    runtimeExecutionId: `runtime_execution_${generationRunId}`,
    executableArtifact: {
      schemaVersion: "generated_mechanic_executable_artifact/v1",
      id: finalGameSpec.extension.versionId,
      extensionId: finalGameSpec.extension.id,
      versionId: finalGameSpec.extension.versionId,
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
    },
  });
  if (!runtimeCandidateResult.success) {
    return reject("preflight", [
      issue(
        "runtimeCandidate",
        "invalid_runtime_candidate",
        runtimeCandidateResult.error.issues[0]?.message ??
          "Generated mechanic runtime candidate validation failed."
      ),
    ]);
  }
  const preparedRuntimeProject: PreparedGeneratedMechanicRuntimeCandidateProject =
    snapshot({
      runtimeCandidate: runtimeCandidateResult.data,
      dependency,
    });
  const expectedRuntimeIdentity = createExpectedRuntimeIdentity(
    preparedRuntimeProject,
    dependency,
    finalGameSpec
  );
  let loadedDependency: LoadedGeneratedMechanicProjectDependency;
  let activation: GeneratedMechanicProjectActivation;
  try {
    loadedDependency = await runtime.loadProjectDependency(preparedRuntimeProject);
  } catch (error) {
    return rejectAfterRuntimeCleanup({
      runtime,
      stage: "runtime_activation",
      issues: signal?.aborted
        ? [generationCancelledIssue()]
        : [
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
      issues: signal?.aborted
        ? [generationCancelledIssue()]
        : [
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
      issues: signal?.aborted
        ? [generationCancelledIssue()]
        : [
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
  if (signal?.aborted) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      activation,
      stage: "first_playable",
      issues: [generationCancelledIssue()],
      runtimeEvidence: firstPlayableAttempt,
    });
  }
  const firstPlayableStartedAtMilliseconds = Date.parse(
    firstPlayableAttempt.startedAt
  );
  const resolvedAcceptedAtResult = staticAcceptedAtResult ??
    safelyCreateAcceptedAt(createAcceptedAt);
  if (!resolvedAcceptedAtResult.success) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      activation,
      stage: "first_playable",
      issues: [
        issue(
          "acceptedAt",
          "invalid_accepted_at",
          "Generated mechanic acceptance requires an ISO 8601 timestamp with an explicit offset."
        ),
      ],
      runtimeEvidence: firstPlayableAttempt,
    });
  }
  if (
    !Number.isFinite(firstPlayableStartedAtMilliseconds) ||
    Date.parse(resolvedAcceptedAtResult.data) < firstPlayableStartedAtMilliseconds
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
  const resolvedAcceptedAt = resolvedAcceptedAtResult.data;
  const resolvedAcceptedAtMilliseconds = Date.parse(resolvedAcceptedAt);
  if (
    projectStateTimestamps.some(
      (timestamp) => Date.parse(timestamp) > resolvedAcceptedAtMilliseconds
    )
  ) {
    return rejectAfterRuntimeCleanup({
      runtime,
      loadedDependency,
      activation,
      stage: "first_playable",
      issues: [
        issue(
          "acceptedAt",
          "accepted_at_before_project_state",
          "Generated mechanic acceptance cannot predate the retained Game Pack or completed GenerationRun state."
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
  if (signal?.aborted) {
    return reject("first_playable", [generationCancelledIssue()]);
  }

  const artifactId = finalGameSpec.extension.versionId;
  const activationEvidence = createActivationEvidence({
    acceptedAt: resolvedAcceptedAt,
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
          completedAt: resolvedAcceptedAt,
          gamePack,
        })
      : {
          attempt: acceptedAttemptInput,
          gamePack: writeFirstPlayableValidationResult({
            attempt: acceptedAttemptInput,
            completedAt: resolvedAcceptedAt,
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
    acceptedAt: resolvedAcceptedAt,
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
  const pendingGamePackId =
    createPendingGeneratedMechanicAcceptanceGamePackId({
      artifactId: acceptedArtifact.id,
      gamePackId: firstPlayableGamePack.id,
    });
  const persistAcceptance = async (): Promise<GeneratedMechanicProjectHandoffResult> => {
  let previousGamePack: GamePack | null;
  try {
    previousGamePack = await gamePackRepository.load(firstPlayableGamePack.id);
  } catch (error) {
    return reject("persistence", [
      ...(signal?.aborted
        ? [generationCancelledIssue()]
        : [
            issue(
              "persistence.gamePack",
              "game_pack_commit_preflight_failed",
              errorMessage(
                error,
                "Could not capture the durable Game Pack state before acceptance."
              )
            ),
          ]),
    ]);
  }
  if (signal?.aborted) {
    return reject("persistence", [generationCancelledIssue()]);
  }
  let existingPendingGamePack: GamePack | null;
  try {
    existingPendingGamePack = await gamePackRepository.load(
      pendingGamePackId
    );
  } catch (error) {
    return reject("persistence", [
      issue(
        "persistence.pendingGamePack",
        "pending_game_pack_preflight_failed",
        errorMessage(
          error,
          "Could not inspect the isolated pending generated mechanic acceptance record."
        )
      ),
    ]);
  }
  if (existingPendingGamePack) {
    const reconciliation =
      await reconcilePendingGeneratedMechanicAcceptance({
        canonicalGamePack: previousGamePack,
        expectedArtifact: acceptedArtifact,
        gamePackRepository,
        generationRun,
        generationRunRepository,
        pendingGamePack: existingPendingGamePack,
        signal,
      });
    if (reconciliation.outcome === "accepted") {
      return snapshot(reconciliation.result);
    }
    if (reconciliation.outcome === "rejected") {
      return reject("persistence", reconciliation.issues);
    }
    generationRun = reconciliation.generationRun;
    previousGamePack = reconciliation.previousGamePack;
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

  const acceptanceTransactionId =
    createGeneratedMechanicAcceptanceTransactionId();
  const pendingGenerationRunSnapshot =
    writeGeneratedMechanicAcceptanceGenerationRun({
      artifact: acceptedArtifact,
      gamePack: acceptedGamePackLineage,
      generationRun,
      status: "pending",
      transactionId: acceptanceTransactionId,
    });
  const linkedGenerationRunSnapshot =
    writeGeneratedMechanicAcceptanceGenerationRun({
      artifact: acceptedArtifact,
      gamePack: acceptedGamePackLineage,
      generationRun,
      status: "finalized",
      transactionId: acceptanceTransactionId,
    });
  const acceptedGamePackWithoutTransaction = parseGamePack({
    ...acceptedGamePackLineage,
    generationRuns: [
      ...firstPlayableGamePack.generationRuns.filter(
        ({ id }) => id !== generationRunId
      ),
      linkedGenerationRunSnapshot,
    ],
  });
  const pendingGamePack = createPendingGeneratedMechanicAcceptanceGamePack({
    artifact: acceptedArtifact,
    acceptedGamePack: acceptedGamePackWithoutTransaction,
    pendingGenerationRun: pendingGenerationRunSnapshot,
    preflightGenerationRun: generationRun,
    previousGamePack,
    transactionId: acceptanceTransactionId,
  });
  const acceptedGamePack = writeGeneratedMechanicAcceptanceTransaction({
    artifact: acceptedArtifact,
    gamePack: acceptedGamePackWithoutTransaction,
    generationRunId,
    status: "finalized",
    transactionId: acceptanceTransactionId,
  });

  let pendingGamePackWriteAttempted = false;
  let canonicalGamePackWriteMayHaveCommitted = false;
  let generationRunRollbackSnapshots: readonly GenerationRun[] = [];
  let generationRunSnapshotStale = false;
  const rollbackWrittenCanonicalGamePack = async () => {
    const rollbackIssues: GeneratedMechanicProjectHandoffIssue[] = [];
    let canonicalRollbackVerified = !canonicalGamePackWriteMayHaveCommitted;
    if (canonicalGamePackWriteMayHaveCommitted) {
      const canonicalRollbackIssues = await rollbackAcceptedGamePack({
        gamePackId: acceptedGamePack.id,
        gamePackRepository,
        previousGamePack,
        writtenGamePack: acceptedGamePack,
      });
      canonicalRollbackVerified = canonicalRollbackIssues.length === 0;
      if (canonicalRollbackVerified) {
        canonicalGamePackWriteMayHaveCommitted = false;
      }
      rollbackIssues.push(...canonicalRollbackIssues);
    }
    return { canonicalRollbackVerified, rollbackIssues };
  };
  const rollbackWrittenPendingGamePack = async () => {
    if (!pendingGamePackWriteAttempted) {
      return [];
    }
    const rollbackIssues = await rollbackAcceptedGamePack({
      gamePackId: pendingGamePack.id,
      gamePackRepository,
      previousGamePack: null,
      writtenGamePack: pendingGamePack,
    });
    if (rollbackIssues.length === 0) {
      pendingGamePackWriteAttempted = false;
    }
    return rollbackIssues;
  };
  const rollbackWrittenGamePacks = async () => {
    const { canonicalRollbackVerified, rollbackIssues } =
      await rollbackWrittenCanonicalGamePack();
    const pendingRollbackIssues = canonicalRollbackVerified
      ? await rollbackWrittenPendingGamePack()
      : [];
    return {
      canonicalRollbackVerified,
      rollbackIssues: [...rollbackIssues, ...pendingRollbackIssues],
    };
  };
  const rollbackWrittenGenerationRun = async () => {
    if (generationRunRollbackSnapshots.length === 0) {
      return { issues: [], verified: true };
    }
    if (generationRunSnapshotStale) {
      return { issues: [], verified: false };
    }
    const issues = await rollbackAcceptedGenerationRun({
      generationRun,
      generationRunRepository,
      writtenGenerationRuns: generationRunRollbackSnapshots,
    });
    return { issues, verified: issues.length === 0 };
  };
  const compensateWrittenAcceptance = async () => {
    const { canonicalRollbackVerified, rollbackIssues } =
      await rollbackWrittenCanonicalGamePack();
    if (!canonicalRollbackVerified) {
      const durableAcceptance =
        await recoverDurableFinalizedGeneratedMechanicAcceptance({
          acceptedArtifact,
          acceptedGamePack,
          gamePackRepository,
          generationRunRepository,
          linkedGenerationRunSnapshot,
          pendingGamePack,
          pendingGenerationRunSnapshot,
        });
      if (durableAcceptance) {
        return {
          acceptanceRecoveryPending: false,
          durableAcceptance,
          generationRunRollbackIssues: [],
          rollbackIssues,
        };
      }
      const canonicalAcceptanceState =
        await inspectDurableCanonicalAcceptanceState({
          acceptedGamePack,
          gamePackRepository,
          pendingGamePack,
        });
      if (canonicalAcceptanceState !== "unrelated") {
        return {
          acceptanceRecoveryPending: true,
          durableAcceptance: undefined,
          generationRunRollbackIssues: [],
          rollbackIssues,
        };
      }
    }
    const {
      issues: generationRunRollbackIssues,
      verified: generationRunRollbackVerified,
    } = await rollbackWrittenGenerationRun();
    const pendingRollbackIssues = generationRunRollbackVerified
      ? await rollbackWrittenPendingGamePack()
      : [];
    return {
      acceptanceRecoveryPending: false,
      durableAcceptance: undefined,
      generationRunRollbackIssues,
      rollbackIssues: [...rollbackIssues, ...pendingRollbackIssues],
    };
  };
  try {
    if (signal?.aborted) {
      return reject("persistence", [generationCancelledIssue()]);
    }
    pendingGamePackWriteAttempted = true;
    const committed = await gamePackRepository.compareAndSwap(
      pendingGamePack.id,
      null,
      pendingGamePack
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
    if (signal?.aborted) {
      const { rollbackIssues } = await rollbackWrittenGamePacks();
      return reject("persistence", [
        generationCancelledIssue(),
        ...rollbackIssues,
      ]);
    }
    const restoredGamePack = await gamePackRepository.load(pendingGamePack.id);
    if (signal?.aborted) {
      const { rollbackIssues } = await rollbackWrittenGamePacks();
      return reject("persistence", [
        generationCancelledIssue(),
        ...rollbackIssues,
      ]);
    }
    const preparedRestoredGamePack =
      restoredGamePack && jsonEqual(restoredGamePack, pendingGamePack)
        ? prepareRestoredGeneratedMechanicProject({
            gamePack: acceptedGamePack,
            trustedPortContracts,
          })
        : undefined;
    const restoredArtifact =
      preparedRestoredGamePack?.success === true
        ? preparedRestoredGamePack.data.artifact
        : undefined;
    if (
      !restoredGamePack ||
      !jsonEqual(restoredGamePack, pendingGamePack) ||
      !restoredArtifact ||
      !jsonEqual(restoredArtifact, acceptedArtifact)
    ) {
      const { rollbackIssues } = await rollbackWrittenGamePacks();
      return reject("persistence", [
        issue(
          "gamePack.acceptedGeneratedMechanicArtifacts",
          "accepted_artifact_restore_mismatch",
          "Durable restore did not return the exact accepted Game Pack checkpoint, build, evidence, and generated mechanic artifact lineage."
        ),
        ...rollbackIssues,
      ]);
    }
    generationRunRollbackSnapshots = [pendingGenerationRunSnapshot];
    await generationRunRepository.update(
      generationRunId,
      (currentRun) => {
        if (!jsonEqual(currentRun, generationRun)) {
          generationRunSnapshotStale = true;
          throw new Error(
            "External GenerationRun changed after generated mechanic handoff preflight."
          );
        }
        return pendingGenerationRunSnapshot;
      }
    );
    if (signal?.aborted) {
      const {
        acceptanceRecoveryPending,
        durableAcceptance,
        generationRunRollbackIssues,
        rollbackIssues,
      } = await compensateWrittenAcceptance();
      if (durableAcceptance) {
        return snapshot(durableAcceptance);
      }
      return reject("persistence", [
        generationCancelledIssue(),
        ...(acceptanceRecoveryPending
          ? [durableAcceptanceRecoveryPendingIssue()]
          : []),
        ...rollbackIssues,
        ...generationRunRollbackIssues,
      ]);
    }
    let finalized: boolean;
    canonicalGamePackWriteMayHaveCommitted = true;
    try {
      finalized = await gamePackRepository.compareAndSwap(
        acceptedGamePack.id,
        previousGamePack,
        acceptedGamePack
      );
      if (!finalized) {
        canonicalGamePackWriteMayHaveCommitted = false;
      }
    } catch (error) {
      const currentGamePack = await gamePackRepository.load(
        acceptedGamePack.id
      );
      if (currentGamePack && jsonEqual(currentGamePack, acceptedGamePack)) {
        finalized = true;
      } else {
        throw error;
      }
    }
    if (!finalized) {
      throw new Error(
        "Durable Game Pack changed before generated mechanic acceptance could be finalized."
      );
    }
    if (signal?.aborted) {
      const {
        acceptanceRecoveryPending,
        durableAcceptance,
        generationRunRollbackIssues,
        rollbackIssues,
      } = await compensateWrittenAcceptance();
      if (durableAcceptance) {
        return snapshot(durableAcceptance);
      }
      return reject("persistence", [
        generationCancelledIssue(),
        ...(acceptanceRecoveryPending
          ? [durableAcceptanceRecoveryPendingIssue()]
          : []),
        ...rollbackIssues,
        ...generationRunRollbackIssues,
      ]);
    }
    generationRunRollbackSnapshots = [
      pendingGenerationRunSnapshot,
      linkedGenerationRunSnapshot,
    ];
    const linkedGenerationRun = await generationRunRepository.update(
      generationRunId,
      (currentRun) => {
        if (jsonEqual(currentRun, linkedGenerationRunSnapshot)) {
          return currentRun;
        }
        if (!jsonEqual(currentRun, pendingGenerationRunSnapshot)) {
          generationRunSnapshotStale = true;
          throw new Error(
            "External GenerationRun changed while generated mechanic acceptance was finalizing."
          );
        }
        return linkedGenerationRunSnapshot;
      }
    );
    generationRunRollbackSnapshots = [linkedGenerationRunSnapshot];
    if (signal?.aborted) {
      const {
        acceptanceRecoveryPending,
        durableAcceptance,
        generationRunRollbackIssues,
        rollbackIssues,
      } = await compensateWrittenAcceptance();
      if (durableAcceptance) {
        return snapshot(durableAcceptance);
      }
      return reject("persistence", [
        generationCancelledIssue(),
        ...(acceptanceRecoveryPending
          ? [durableAcceptanceRecoveryPendingIssue()]
          : []),
        ...rollbackIssues,
        ...generationRunRollbackIssues,
      ]);
    }
    const pendingRemoved =
      await removePendingGamePackAfterGenerationRunRecheck({
        canonicalGamePackId: acceptedGamePack.id,
        expectedCanonicalGamePack: acceptedGamePack,
        expectedGenerationRun: linkedGenerationRunSnapshot,
        gamePackRepository,
        generationRunRepository,
        pendingGamePack,
        signal,
      });
    if (!pendingRemoved) {
      if (signal?.aborted) {
        let currentPendingGamePack: GamePack | null | undefined;
        try {
          currentPendingGamePack = await gamePackRepository.load(
            pendingGamePack.id
          );
        } catch {
          currentPendingGamePack = undefined;
        }
        if (currentPendingGamePack === null) {
          pendingGamePackWriteAttempted = false;
          return snapshot({
            outcome: "accepted" as const,
            gamePack: acceptedGamePack,
            generationRun: linkedGenerationRun,
            artifact: restoredArtifact,
          });
        }
        if (jsonEqual(currentPendingGamePack, pendingGamePack)) {
          const {
            acceptanceRecoveryPending,
            durableAcceptance,
            generationRunRollbackIssues,
            rollbackIssues,
          } = await compensateWrittenAcceptance();
          if (durableAcceptance) {
            return snapshot(durableAcceptance);
          }
          return reject("persistence", [
            generationCancelledIssue(),
            ...(acceptanceRecoveryPending
              ? [durableAcceptanceRecoveryPendingIssue()]
              : []),
            ...rollbackIssues,
            ...generationRunRollbackIssues,
          ]);
        }
        return reject("persistence", [
          generationCancelledIssue(),
          durableAcceptanceRecoveryPendingIssue(),
        ]);
      }
      return reject("persistence", [durableAcceptanceRecoveryPendingIssue()]);
    }
    pendingGamePackWriteAttempted = false;
    return snapshot({
      outcome: "accepted" as const,
      gamePack: acceptedGamePack,
      generationRun: linkedGenerationRun,
      artifact: restoredArtifact,
    });
  } catch (error) {
    const {
      acceptanceRecoveryPending,
      durableAcceptance,
      generationRunRollbackIssues,
      rollbackIssues,
    } = await compensateWrittenAcceptance();
    if (durableAcceptance) {
      return snapshot(durableAcceptance);
    }
    return reject("persistence", [
      ...(signal?.aborted
        ? [
            generationCancelledIssue(),
            ...(acceptanceRecoveryPending
              ? [durableAcceptanceRecoveryPendingIssue()]
              : []),
          ]
        : generationRunSnapshotStale
          ? [
              issue(
                "persistence.generationRun",
                "stale_generation_run_snapshot",
                "Generated mechanic acceptance requires the external GenerationRun to match the exact succeeded preflight snapshot before lineage linkage."
              ),
            ]
        : [
            ...(acceptanceRecoveryPending
              ? [durableAcceptanceRecoveryPendingIssue()]
              : []),
            issue(
              "persistence",
              "accepted_artifact_persistence_failed",
              errorMessage(
                error,
                "Accepted generated mechanic persistence failed."
              )
            ),
          ]),
      ...rollbackIssues,
      ...generationRunRollbackIssues,
    ]);
  }
  };
  try {
    if (acceptanceLockReceipt !== undefined) {
      if (!authenticAcceptanceLockReceipts.has(acceptanceLockReceipt)) {
        return reject("persistence", [
          issue(
            "acceptanceLockReceipt",
            "acceptance_lock_receipt_invalid",
            "Generated mechanic acceptance requires the exact live cross-realm lock receipt issued for this transaction."
          ),
        ]);
      }
      return await persistAcceptance();
    }
    return await withGeneratedMechanicAcceptanceLock({
      operation: persistAcceptance,
      signal,
    });
  } catch (error) {
    return reject("persistence", [
      ...(signal?.aborted
        ? [generationCancelledIssue()]
        : [generatedMechanicAcceptanceLockIssue(error)]),
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

type GeneratedMechanicAcceptanceTransaction = Readonly<{
  schemaVersion: typeof GENERATED_MECHANIC_ACCEPTANCE_TRANSACTION_VERSION;
  status: "pending" | "finalized";
  transactionId?: StableId;
  generationRunId: StableId;
  artifactId: StableId;
  buildId: StableId;
  checkpointId: StableId;
}>;

function createGeneratedMechanicAcceptanceTransaction({
  artifact,
  generationRunId,
  status,
  transactionId,
}: Readonly<{
  artifact: AcceptedGeneratedMechanicArtifact;
  generationRunId: StableId;
  status: GeneratedMechanicAcceptanceTransaction["status"];
  transactionId: StableId;
}>): GeneratedMechanicAcceptanceTransaction {
  return {
    schemaVersion: GENERATED_MECHANIC_ACCEPTANCE_TRANSACTION_VERSION,
    status,
    transactionId,
    generationRunId,
    artifactId: artifact.id,
    buildId: artifact.buildId,
    checkpointId: artifact.checkpointId,
  };
}

function writeGeneratedMechanicAcceptanceTransaction({
  artifact,
  gamePack,
  generationRunId,
  status,
  transactionId,
}: Readonly<{
  artifact: AcceptedGeneratedMechanicArtifact;
  gamePack: GamePack;
  generationRunId: StableId;
  status: GeneratedMechanicAcceptanceTransaction["status"];
  transactionId: StableId;
}>): GamePack {
  return parseGamePack({
    ...gamePack,
    metadata: {
      ...(gamePack.metadata ?? {}),
      [GENERATED_MECHANIC_ACCEPTANCE_TRANSACTION_METADATA_KEY]:
        createGeneratedMechanicAcceptanceTransaction({
          artifact,
          generationRunId,
          status,
          transactionId,
        }),
    },
  });
}

function writeGeneratedMechanicAcceptanceGenerationRun({
  artifact,
  gamePack,
  generationRun,
  status,
  transactionId,
}: Readonly<{
  artifact: AcceptedGeneratedMechanicArtifact;
  gamePack: Pick<GamePack, "id">;
  generationRun: GenerationRun;
  status: GeneratedMechanicAcceptanceTransaction["status"];
  transactionId: StableId;
}>): GenerationRun {
  const generationRunWithoutPendingHandoff =
    clearGeneratedMechanicHandoffReceipt(generationRun);
  const generationRunWithTransaction = {
    ...generationRunWithoutPendingHandoff,
    metadata: {
      ...(generationRunWithoutPendingHandoff.metadata ?? {}),
      [GENERATED_MECHANIC_ACCEPTANCE_TRANSACTION_METADATA_KEY]:
        createGeneratedMechanicAcceptanceTransaction({
          artifact,
          generationRunId: generationRun.id,
          status,
          transactionId,
        }),
    },
  };
  return status === "finalized"
    ? attachAcceptedLineage(generationRunWithTransaction, gamePack, artifact)
    : generationRunWithTransaction;
}

function createGeneratedMechanicAcceptanceTransactionId(): StableId {
  return `acceptance_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
}

function createPendingGeneratedMechanicAcceptanceGamePackId({
  artifactId,
  gamePackId,
}: Readonly<{
  artifactId: StableId;
  gamePackId: StableId;
}>): StableId {
  return `pending_${gamePackId}_${artifactId}`;
}

function createPendingGeneratedMechanicAcceptanceGamePack({
  acceptedGamePack,
  artifact,
  pendingGenerationRun,
  preflightGenerationRun,
  previousGamePack,
  transactionId,
}: Readonly<{
  acceptedGamePack: GamePack;
  artifact: AcceptedGeneratedMechanicArtifact;
  pendingGenerationRun: GenerationRun;
  preflightGenerationRun: GenerationRun;
  previousGamePack: GamePack | null;
  transactionId: StableId;
}>): GamePack {
  const pendingGamePackId =
    createPendingGeneratedMechanicAcceptanceGamePackId({
      artifactId: artifact.id,
      gamePackId: acceptedGamePack.id,
    });
  const isolatedPendingGamePack = parseGamePack({
    ...acceptedGamePack,
    id: pendingGamePackId,
    metadata: {
      ...(acceptedGamePack.metadata ?? {}),
      [GENERATED_MECHANIC_ACCEPTANCE_CANONICAL_GAME_PACK_ID_METADATA_KEY]:
        acceptedGamePack.id,
      [GENERATED_MECHANIC_ACCEPTANCE_PREFLIGHT_RUN_METADATA_KEY]:
        preflightGenerationRun,
      [GENERATED_MECHANIC_ACCEPTANCE_PREVIOUS_GAME_PACK_METADATA_KEY]:
        previousGamePack,
    },
    generationRuns: acceptedGamePack.generationRuns.map((generationRun) =>
      generationRun.id === pendingGenerationRun.id
        ? attachAcceptedLineage(
            pendingGenerationRun,
            { id: pendingGamePackId },
            artifact
          )
        : generationRun.relationships
          ? {
              ...generationRun,
              relationships: {
                ...generationRun.relationships,
                gamePackId: pendingGamePackId,
              },
            }
        : generationRun
    ),
  });
  return writeGeneratedMechanicAcceptanceTransaction({
    artifact,
    gamePack: isolatedPendingGamePack,
    generationRunId: pendingGenerationRun.id,
    status: "pending",
    transactionId,
  });
}

function readGeneratedMechanicAcceptanceTransactionValue(
  value: JsonValue | undefined
): GeneratedMechanicAcceptanceTransaction | "invalid" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "invalid";
  }
  const record = value as Readonly<Record<string, JsonValue>>;
  const expectedKeys = [
    "artifactId",
    "buildId",
    "checkpointId",
    "generationRunId",
    "schemaVersion",
    "status",
  ];
  const currentExpectedKeys = [...expectedKeys, "transactionId"].sort();
  const recordKeys = Object.keys(record).sort();
  if (
    (!jsonEqual(recordKeys, expectedKeys) &&
      !jsonEqual(recordKeys, currentExpectedKeys)) ||
    record.schemaVersion !==
      GENERATED_MECHANIC_ACCEPTANCE_TRANSACTION_VERSION ||
    (record.status !== "pending" && record.status !== "finalized") ||
    typeof record.generationRunId !== "string" ||
    typeof record.artifactId !== "string" ||
    typeof record.buildId !== "string" ||
    typeof record.checkpointId !== "string" ||
    (record.transactionId !== undefined &&
      typeof record.transactionId !== "string")
  ) {
    return "invalid";
  }
  return record as GeneratedMechanicAcceptanceTransaction;
}

function readGeneratedMechanicAcceptanceTransaction(
  gamePack: GamePack
): GeneratedMechanicAcceptanceTransaction | "invalid" | undefined {
  return readGeneratedMechanicAcceptanceTransactionValue(
    gamePack.metadata?.[
      GENERATED_MECHANIC_ACCEPTANCE_TRANSACTION_METADATA_KEY
    ]
  );
}

function readGeneratedMechanicAcceptanceGenerationRunTransaction(
  generationRun: GenerationRun
): GeneratedMechanicAcceptanceTransaction | "invalid" | undefined {
  return readGeneratedMechanicAcceptanceTransactionValue(
    generationRun.metadata?.[
      GENERATED_MECHANIC_ACCEPTANCE_TRANSACTION_METADATA_KEY
    ]
  );
}

function hasGeneratedMechanicAcceptanceJournalResidue(
  gamePack: GamePack
): boolean {
  const metadata = gamePack.metadata;
  if (!metadata) {
    return false;
  }
  const journalKeys = [
    GENERATED_MECHANIC_ACCEPTANCE_CANONICAL_GAME_PACK_ID_METADATA_KEY,
    GENERATED_MECHANIC_ACCEPTANCE_PREFLIGHT_RUN_METADATA_KEY,
    GENERATED_MECHANIC_ACCEPTANCE_PREVIOUS_GAME_PACK_METADATA_KEY,
  ];
  if (
    journalKeys.some((key) => Object.prototype.hasOwnProperty.call(metadata, key))
  ) {
    return true;
  }
  const canonicalGamePackId =
    metadata[
      GENERATED_MECHANIC_ACCEPTANCE_CANONICAL_GAME_PACK_ID_METADATA_KEY
    ];
  return (
    typeof canonicalGamePackId === "string" &&
    (gamePack.acceptedGeneratedMechanicArtifacts?.some(
      ({ id: artifactId }) =>
        gamePack.id ===
        createPendingGeneratedMechanicAcceptanceGamePackId({
          artifactId,
          gamePackId: canonicalGamePackId,
        })
    ) ?? false)
  );
}

export function isGamePackAcceptanceRestorable(gamePack: GamePack): boolean {
  const transaction = readGeneratedMechanicAcceptanceTransaction(gamePack);
  if (
    hasGeneratedMechanicAcceptanceJournalResidue(gamePack) ||
    !isCreatorGenerationPersistenceRestorable(gamePack)
  ) {
    return false;
  }
  return (
    transaction === undefined ||
    (transaction !== undefined &&
      transaction !== "invalid" &&
      transaction.status === "finalized")
  );
}

type PendingGeneratedMechanicAcceptanceJournal = Readonly<{
  canonicalGamePackId: GamePack["id"];
  preflightGenerationRun: GenerationRun;
  previousGamePack: GamePack | null;
  transaction: GeneratedMechanicAcceptanceTransaction &
    Readonly<{ transactionId: StableId }>;
}>;

type ReconcilePendingGeneratedMechanicAcceptanceResult =
  | Readonly<{
      outcome: "accepted";
      result: Extract<
        GeneratedMechanicProjectHandoffResult,
        { outcome: "accepted" }
      >;
    }>
  | Readonly<{
      outcome: "cleared";
      generationRun: GenerationRun;
      previousGamePack: GamePack | null;
    }>
  | Readonly<{
      outcome: "rejected";
      issues: readonly GeneratedMechanicProjectHandoffIssue[];
    }>;

export async function reconcileGeneratedMechanicAcceptanceTransactions(
  input: ReconcileGeneratedMechanicAcceptanceTransactionsInput
): Promise<ReconcileGeneratedMechanicAcceptanceTransactionsResult> {
  try {
    return await withGeneratedMechanicAcceptanceLock({
      operation: () =>
        reconcileGeneratedMechanicAcceptanceTransactionsWhileLocked(input),
      signal: input.signal,
    });
  } catch (error) {
    return {
      blockedCanonicalGamePackIds: [],
      issues: [
        input.signal?.aborted
          ? generationCancelledIssue()
          : generatedMechanicAcceptanceLockIssue(error),
      ],
      reconciledPendingGamePackIds: [],
      restorableGamePack: null,
    };
  }
}

async function reconcileGeneratedMechanicAcceptanceTransactionsWhileLocked({
  gamePackRepository,
  generationRunRepository,
  signal,
}: ReconcileGeneratedMechanicAcceptanceTransactionsInput): Promise<ReconcileGeneratedMechanicAcceptanceTransactionsResult> {
  let gamePacks: readonly GamePack[];
  try {
    gamePacks = await gamePackRepository.list();
  } catch (error) {
    return {
      blockedCanonicalGamePackIds: [],
      issues: [
        issue(
          "persistence.pendingGamePacks",
          "pending_acceptance_reconciliation_failed",
          errorMessage(
            error,
            "Could not inspect pending generated mechanic acceptance transactions during restore."
          )
        ),
      ],
      reconciledPendingGamePackIds: [],
      restorableGamePack: null,
    };
  }

  const issues: GeneratedMechanicProjectHandoffIssue[] = [];
  const blockedCanonicalGamePackIds: GamePack["id"][] = [];
  const reconciledPendingGamePackIds: GamePack["id"][] = [];
  for (const pendingGamePack of gamePacks) {
    const transaction =
      readGeneratedMechanicAcceptanceTransaction(pendingGamePack);
    const hasJournalResidue =
      hasGeneratedMechanicAcceptanceJournalResidue(pendingGamePack);
    if (transaction === undefined) {
      if (hasJournalResidue) {
        issues.push(pendingAcceptanceRecoveryIssue(pendingGamePack.id));
      }
      continue;
    }
    if (transaction === "invalid") {
      issues.push(pendingAcceptanceRecoveryIssue(pendingGamePack.id));
      continue;
    }
    if (transaction.status !== "pending") {
      if (hasJournalResidue) {
        issues.push(pendingAcceptanceRecoveryIssue(pendingGamePack.id));
      }
      continue;
    }
    if (signal?.aborted) {
      issues.push(generationCancelledIssue());
      break;
    }
    const journal = readPendingGeneratedMechanicAcceptanceJournal(
      pendingGamePack
    );
    if (journal === "invalid") {
      issues.push(pendingAcceptanceRecoveryIssue(pendingGamePack.id));
      continue;
    }
    try {
      const currentPendingGamePack = await gamePackRepository.load(
        pendingGamePack.id
      );
      if (currentPendingGamePack === null) {
        reconciledPendingGamePackIds.push(pendingGamePack.id);
        continue;
      }
      if (!jsonEqual(currentPendingGamePack, pendingGamePack)) {
        issues.push(pendingAcceptanceRecoveryIssue(pendingGamePack.id));
        continue;
      }
      const [canonicalGamePack, generationRun] = await Promise.all([
        gamePackRepository.load(journal.canonicalGamePackId),
        generationRunRepository.fetch(journal.transaction.generationRunId),
      ]);
      if (!generationRun) {
        issues.push(pendingAcceptanceRecoveryIssue(pendingGamePack.id));
        continue;
      }
      const reconciliation =
        await reconcilePendingGeneratedMechanicAcceptance({
          canonicalGamePack,
          gamePackRepository,
          generationRun,
          generationRunRepository,
          pendingGamePack,
          signal,
        });
      if (reconciliation.outcome === "rejected") {
        issues.push(...reconciliation.issues);
        if (
          canonicalGamePackRetainsAcceptanceTransaction(
            canonicalGamePack,
            journal
          )
        ) {
          blockedCanonicalGamePackIds.push(journal.canonicalGamePackId);
        }
      } else {
        reconciledPendingGamePackIds.push(pendingGamePack.id);
      }
    } catch (error) {
      issues.push(
        signal?.aborted
          ? generationCancelledIssue()
          : issue(
              `persistence.pendingGamePacks.${pendingGamePack.id}`,
              "pending_acceptance_reconciliation_failed",
              errorMessage(
                error,
                "Pending generated mechanic acceptance could not be reconciled during restore."
              )
            )
      );
    }
  }

  issues.push(
    ...(await reconcileInterruptedGeneratedMechanicHandoffs({
      gamePackRepository,
      generationRunRepository,
      signal,
    }))
  );

  let restorableGamePack: GamePack | null = null;
  if (issues.length === 0 && !signal?.aborted) {
    try {
      const restoreSnapshot = await gamePackRepository.list();
      restorableGamePack =
        restoreSnapshot.find(
          (gamePack) =>
            !blockedCanonicalGamePackIds.includes(gamePack.id) &&
            isGamePackAcceptanceRestorable(gamePack) &&
            hasCreatorFacingCheckpoint(gamePack)
        ) ?? null;
    } catch (error) {
      issues.push(
        issue(
          "persistence.gamePacks",
          "pending_acceptance_reconciliation_failed",
          errorMessage(
            error,
            "Could not capture the exact restorable Game Pack snapshot after pending acceptance reconciliation."
          )
        )
      );
    }
  }

  return {
    blockedCanonicalGamePackIds,
    issues,
    reconciledPendingGamePackIds,
    restorableGamePack,
  };
}

async function reconcileInterruptedGeneratedMechanicHandoffs({
  gamePackRepository,
  generationRunRepository,
  signal,
}: Pick<
  ReconcileGeneratedMechanicAcceptanceTransactionsInput,
  "gamePackRepository" | "generationRunRepository" | "signal"
>): Promise<readonly GeneratedMechanicProjectHandoffIssue[]> {
  try {
    const [gamePacks, generationRuns] = await Promise.all([
      gamePackRepository.list(),
      generationRunRepository.list(),
    ]);
    const journalOwnedGenerationRunIds = new Set<GenerationRun["id"]>();
    for (const gamePack of gamePacks) {
      const journal = readPendingGeneratedMechanicAcceptanceJournal(gamePack);
      if (journal !== "invalid") {
        journalOwnedGenerationRunIds.add(journal.transaction.generationRunId);
      }
    }

    const issues: GeneratedMechanicProjectHandoffIssue[] = [];
    for (const generationRun of generationRuns) {
      if (signal?.aborted) {
        issues.push(generationCancelledIssue());
        break;
      }
      const receipt = readGeneratedMechanicHandoffReceipt(generationRun);
      if (receipt === undefined) {
        continue;
      }
      if (
        receipt === "invalid" ||
        receipt.generationRunId !== generationRun.id
      ) {
        issues.push(interruptedHandoffRecoveryIssue(generationRun.id));
        continue;
      }
      if (journalOwnedGenerationRunIds.has(generationRun.id)) {
        continue;
      }
      if (
        generationRun.status !== "succeeded" ||
        readGeneratedMechanicAcceptanceGenerationRunTransaction(
          generationRun
        ) !== undefined ||
        (generationRun.relationships?.acceptedGeneratedMechanicArtifactIds
          ?.length ?? 0) > 0
      ) {
        issues.push(interruptedHandoffRecoveryIssue(generationRun.id));
        continue;
      }
      const reconciled = await generationRunRepository.update(
        generationRun.id,
        (currentRun) => {
          if (
            !jsonEqual(currentRun, generationRun) ||
            !jsonEqual(
              readGeneratedMechanicHandoffReceipt(currentRun),
              receipt
            )
          ) {
            throw new Error(
              "Interrupted generated mechanic handoff receipt changed during reconciliation."
            );
          }
          const clearedRun = clearGeneratedMechanicHandoffReceipt(currentRun);
          return generationRunSchema.parse({
            ...clearedRun,
            status: "failed",
            stage: "artifact-build",
            failureClass: "build-failure",
            metadata: {
              ...(clearedRun.metadata ?? {}),
              generatedMechanicOutcome: {
                status: "rejected",
                stage: "persistence",
                issues: [
                  {
                    path: "generationRun.metadata.generatedMechanicHandoff",
                    code: "generated_mechanic_handoff_interrupted",
                    message:
                      "Generated mechanic creation stopped after repair succeeded but before an acceptance journal was created.",
                  },
                ],
              },
            },
          });
        }
      );
      if (
        reconciled.status !== "failed" ||
        readGeneratedMechanicHandoffReceipt(reconciled) !== undefined
      ) {
        throw new Error(
          "Interrupted generated mechanic handoff receipt was not terminalized exactly."
        );
      }
    }
    return issues;
  } catch (error) {
    return [
      issue(
        "persistence.generationRuns",
        "generated_mechanic_handoff_reconciliation_failed",
        errorMessage(
          error,
          "Interrupted generated mechanic handoff receipts could not be reconciled during restore."
        )
      ),
    ];
  }
}

async function reconcilePendingGeneratedMechanicAcceptance({
  canonicalGamePack,
  expectedArtifact,
  gamePackRepository,
  generationRun,
  generationRunRepository,
  pendingGamePack,
  signal,
}: Readonly<{
  canonicalGamePack: GamePack | null;
  expectedArtifact?: AcceptedGeneratedMechanicArtifact;
  gamePackRepository: Pick<GamePackRepository, "compareAndSwap" | "load">;
  generationRun: GenerationRun;
  generationRunRepository: Pick<GenerationRunRepository, "fetch" | "update">;
  pendingGamePack: GamePack;
  signal?: AbortSignal;
}>): Promise<ReconcilePendingGeneratedMechanicAcceptanceResult> {
  const journal = readPendingGeneratedMechanicAcceptanceJournal(
    pendingGamePack
  );
  if (journal === "invalid" || signal?.aborted) {
    return {
      outcome: "rejected",
      issues: signal?.aborted
        ? [generationCancelledIssue()]
        : [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
    };
  }
  const artifact = pendingGamePack.acceptedGeneratedMechanicArtifacts?.find(
    ({ id }) => id === journal.transaction.artifactId
  );
  if (
    !artifact ||
    artifact.sourceGenerationRunId !== journal.transaction.generationRunId ||
    artifact.buildId !== journal.transaction.buildId ||
    artifact.checkpointId !== journal.transaction.checkpointId ||
    (expectedArtifact &&
      !acceptedArtifactProjectIdentityMatches(artifact, expectedArtifact))
  ) {
    return {
      outcome: "rejected",
      issues: [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
    };
  }
  const expectedPendingGenerationRun =
    writeGeneratedMechanicAcceptanceGenerationRun({
      artifact,
      gamePack: { id: journal.canonicalGamePackId },
      generationRun: journal.preflightGenerationRun,
      status: "pending",
      transactionId: journal.transaction.transactionId,
    });
  const expectedLinkedGenerationRun =
    writeGeneratedMechanicAcceptanceGenerationRun({
      artifact,
      gamePack: { id: journal.canonicalGamePackId },
      generationRun: journal.preflightGenerationRun,
      status: "finalized",
      transactionId: journal.transaction.transactionId,
    });
  const embeddedPendingGenerationRun = pendingGamePack.generationRuns.find(
    ({ id }) => id === journal.transaction.generationRunId
  );
  if (
    !embeddedPendingGenerationRun ||
    !jsonEqual(
      embeddedPendingGenerationRun,
      attachAcceptedLineage(
        expectedPendingGenerationRun,
        { id: pendingGamePack.id },
        artifact
      )
    )
  ) {
    return {
      outcome: "rejected",
      issues: [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
    };
  }

  const canonicalMatchesPrevious = nullableGamePacksEqual(
    canonicalGamePack,
    journal.previousGamePack
  );
  const canonicalRetainsTransaction =
    canonicalGamePackRetainsAcceptanceTransaction(canonicalGamePack, journal);
  const canonicalDefinitelyUnrelated =
    canonicalMatchesPrevious || !canonicalRetainsTransaction;
  const finalizedCanonical = exactFinalizedGeneratedMechanicAcceptance({
    artifact,
    canonicalGamePack,
    expectedLinkedGenerationRun,
    journal,
  });
  if (jsonEqual(generationRun, expectedLinkedGenerationRun)) {
    if (finalizedCanonical) {
      const removed =
        await removePendingGamePackAfterGenerationRunRecheck({
          canonicalGamePackId: journal.canonicalGamePackId,
          expectedCanonicalGamePack: canonicalGamePack,
          expectedGenerationRun: expectedLinkedGenerationRun,
          gamePackRepository,
          generationRunRepository,
          pendingGamePack,
        });
      return removed
        ? {
            outcome: "accepted",
            result: {
              outcome: "accepted",
              gamePack: finalizedCanonical,
              generationRun: expectedLinkedGenerationRun,
              artifact,
            },
          }
        : {
            outcome: "rejected",
            issues: [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
          };
    }
    if (!canonicalDefinitelyUnrelated) {
      return {
        outcome: "rejected",
        issues: [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
      };
    }
    const restored = await replaceGenerationRunExact({
      expectedGenerationRun: expectedLinkedGenerationRun,
      generationRunRepository,
      replacementGenerationRun: journal.preflightGenerationRun,
    });
    const removed =
      restored &&
      (await removePendingGamePackAfterGenerationRunRecheck({
        canonicalGamePackId: journal.canonicalGamePackId,
        expectedCanonicalGamePack: canonicalGamePack,
        expectedGenerationRun: journal.preflightGenerationRun,
        gamePackRepository,
        generationRunRepository,
        pendingGamePack,
      }));
    return removed
      ? {
          outcome: "cleared",
          generationRun: journal.preflightGenerationRun,
          previousGamePack: journal.previousGamePack,
        }
      : {
          outcome: "rejected",
          issues: [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
        };
  }
  if (jsonEqual(generationRun, journal.preflightGenerationRun)) {
    if (!canonicalDefinitelyUnrelated) {
      return {
        outcome: "rejected",
        issues: [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
      };
    }
    const removed = await removePendingGamePackAfterGenerationRunRecheck({
      canonicalGamePackId: journal.canonicalGamePackId,
      expectedCanonicalGamePack: canonicalGamePack,
      expectedGenerationRun: journal.preflightGenerationRun,
      gamePackRepository,
      generationRunRepository,
      pendingGamePack,
    });
    return removed
      ? {
          outcome: "cleared",
          generationRun: journal.preflightGenerationRun,
          previousGamePack: journal.previousGamePack,
        }
      : {
          outcome: "rejected",
          issues: [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
        };
  }
  if (jsonEqual(generationRun, expectedPendingGenerationRun)) {
    if (finalizedCanonical) {
      const linked = await replaceGenerationRunExact({
        expectedGenerationRun: expectedPendingGenerationRun,
        generationRunRepository,
        replacementGenerationRun: expectedLinkedGenerationRun,
      });
      const removed =
        linked &&
        (await removePendingGamePackAfterGenerationRunRecheck({
          canonicalGamePackId: journal.canonicalGamePackId,
          expectedCanonicalGamePack: canonicalGamePack,
          expectedGenerationRun: expectedLinkedGenerationRun,
          gamePackRepository,
          generationRunRepository,
          pendingGamePack,
        }));
      return removed
        ? {
            outcome: "accepted",
            result: {
              outcome: "accepted",
              gamePack: finalizedCanonical,
              generationRun: expectedLinkedGenerationRun,
              artifact,
            },
          }
        : {
            outcome: "rejected",
            issues: [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
          };
    }
    if (canonicalDefinitelyUnrelated) {
      const restored = await replaceGenerationRunExact({
        expectedGenerationRun: expectedPendingGenerationRun,
        generationRunRepository,
        replacementGenerationRun: journal.preflightGenerationRun,
      });
      const removed =
        restored &&
        (await removePendingGamePackAfterGenerationRunRecheck({
          canonicalGamePackId: journal.canonicalGamePackId,
          expectedCanonicalGamePack: canonicalGamePack,
          expectedGenerationRun: journal.preflightGenerationRun,
          gamePackRepository,
          generationRunRepository,
          pendingGamePack,
        }));
      return removed
        ? {
            outcome: "cleared",
            generationRun: journal.preflightGenerationRun,
            previousGamePack: journal.previousGamePack,
          }
        : {
            outcome: "rejected",
          issues: [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
        };
    }
    return {
      outcome: "rejected",
      issues: [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
    };
  }
  if (canonicalDefinitelyUnrelated) {
    const removed = await removePendingGamePackAfterGenerationRunRecheck({
      canonicalGamePackId: journal.canonicalGamePackId,
      expectedCanonicalGamePack: canonicalGamePack,
      expectedGenerationRun: generationRun,
      gamePackRepository,
      generationRunRepository,
      pendingGamePack,
    });
    return removed
      ? {
          outcome: "cleared",
          generationRun,
          previousGamePack: journal.previousGamePack,
        }
      : {
          outcome: "rejected",
          issues: [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
        };
  }
  return {
    outcome: "rejected",
    issues: [pendingAcceptanceRecoveryIssue(pendingGamePack.id)],
  };
}

function readPendingGeneratedMechanicAcceptanceJournal(
  pendingGamePack: GamePack
): PendingGeneratedMechanicAcceptanceJournal | "invalid" {
  const transaction =
    readGeneratedMechanicAcceptanceTransaction(pendingGamePack);
  if (
    transaction === undefined ||
    transaction === "invalid" ||
    transaction.status !== "pending" ||
    !transaction.transactionId
  ) {
    return "invalid";
  }
  const canonicalGamePackId = pendingGamePack.metadata?.[
    GENERATED_MECHANIC_ACCEPTANCE_CANONICAL_GAME_PACK_ID_METADATA_KEY
  ];
  const preflightGenerationRunResult = generationRunSchema.safeParse(
    pendingGamePack.metadata?.[
      GENERATED_MECHANIC_ACCEPTANCE_PREFLIGHT_RUN_METADATA_KEY
    ]
  );
  const previousGamePackValue = pendingGamePack.metadata?.[
    GENERATED_MECHANIC_ACCEPTANCE_PREVIOUS_GAME_PACK_METADATA_KEY
  ];
  const previousGamePackResult =
    previousGamePackValue === null
      ? { success: true as const, data: null }
      : gamePackSchema.safeParse(previousGamePackValue);
  if (
    typeof canonicalGamePackId !== "string" ||
    !preflightGenerationRunResult.success ||
    !previousGamePackResult.success ||
    preflightGenerationRunResult.data.id !== transaction.generationRunId ||
    (previousGamePackResult.data !== null &&
      previousGamePackResult.data.id !== canonicalGamePackId) ||
    pendingGamePack.id !==
      createPendingGeneratedMechanicAcceptanceGamePackId({
        artifactId: transaction.artifactId,
        gamePackId: canonicalGamePackId,
      })
  ) {
    return "invalid";
  }
  return {
    canonicalGamePackId,
    preflightGenerationRun: preflightGenerationRunResult.data,
    previousGamePack: previousGamePackResult.data,
    transaction: {
      ...transaction,
      transactionId: transaction.transactionId,
    },
  };
}

function exactFinalizedGeneratedMechanicAcceptance({
  artifact,
  canonicalGamePack,
  expectedLinkedGenerationRun,
  journal,
}: Readonly<{
  artifact: AcceptedGeneratedMechanicArtifact;
  canonicalGamePack: GamePack | null;
  expectedLinkedGenerationRun: GenerationRun;
  journal: PendingGeneratedMechanicAcceptanceJournal;
}>): GamePack | undefined {
  if (!canonicalGamePack || canonicalGamePack.id !== journal.canonicalGamePackId) {
    return undefined;
  }
  const canonicalTransaction =
    readGeneratedMechanicAcceptanceTransaction(canonicalGamePack);
  const embeddedGenerationRun = canonicalGamePack.generationRuns.find(
    ({ id }) => id === journal.transaction.generationRunId
  );
  const embeddedTransaction = embeddedGenerationRun
    ? readGeneratedMechanicAcceptanceGenerationRunTransaction(
        embeddedGenerationRun
      )
    : undefined;
  const canonicalArtifact =
    canonicalGamePack.acceptedGeneratedMechanicArtifacts?.find(
      ({ id }) => id === artifact.id
    );
  if (
    canonicalTransaction === "invalid" ||
    (canonicalTransaction !== undefined &&
      acceptanceTransactionLineageMatches(
        canonicalTransaction,
        journal.transaction
      ) &&
      canonicalTransaction.status !== "finalized") ||
    !canonicalArtifact ||
    !jsonEqual(canonicalArtifact, artifact) ||
    !embeddedGenerationRun ||
    embeddedTransaction === undefined ||
    embeddedTransaction === "invalid" ||
    embeddedTransaction.status !== "finalized" ||
    !acceptanceTransactionLineageMatches(
      embeddedTransaction,
      journal.transaction
    ) ||
    !jsonEqual(embeddedGenerationRun, expectedLinkedGenerationRun)
  ) {
    return undefined;
  }
  return canonicalGamePack;
}

function canonicalGamePackRetainsAcceptanceTransaction(
  canonicalGamePack: GamePack | null,
  journal: PendingGeneratedMechanicAcceptanceJournal
): boolean {
  if (!canonicalGamePack || canonicalGamePack.id !== journal.canonicalGamePackId) {
    return false;
  }
  const canonicalTransaction =
    readGeneratedMechanicAcceptanceTransaction(canonicalGamePack);
  if (
    canonicalTransaction !== undefined &&
    canonicalTransaction !== "invalid" &&
    acceptanceTransactionLineageMatches(
      canonicalTransaction,
      journal.transaction
    )
  ) {
    return true;
  }
  return canonicalGamePack.generationRuns.some((generationRun) => {
    const transaction =
      readGeneratedMechanicAcceptanceGenerationRunTransaction(generationRun);
    return (
      transaction !== undefined &&
      transaction !== "invalid" &&
      acceptanceTransactionLineageMatches(transaction, journal.transaction)
    );
  });
}

async function removePendingGamePackAfterGenerationRunRecheck({
  canonicalGamePackId,
  expectedCanonicalGamePack,
  expectedGenerationRun,
  gamePackRepository,
  generationRunRepository,
  pendingGamePack,
  signal,
}: Readonly<{
  canonicalGamePackId: GamePack["id"];
  expectedCanonicalGamePack: GamePack | null;
  expectedGenerationRun: GenerationRun;
  gamePackRepository: Pick<GamePackRepository, "compareAndSwap" | "load">;
  generationRunRepository: Pick<GenerationRunRepository, "fetch">;
  pendingGamePack: GamePack;
  signal?: AbortSignal;
}>): Promise<boolean> {
  let currentCanonicalGamePack: GamePack | null;
  let currentGenerationRun: GenerationRun | null;
  try {
    [currentCanonicalGamePack, currentGenerationRun] = await Promise.all([
      gamePackRepository.load(canonicalGamePackId),
      generationRunRepository.fetch(expectedGenerationRun.id),
    ]);
  } catch {
    return false;
  }
  if (signal?.aborted) {
    return false;
  }
  return (
    nullableGamePacksEqual(
      currentCanonicalGamePack,
      expectedCanonicalGamePack
    ) &&
    currentGenerationRun !== null &&
    jsonEqual(currentGenerationRun, expectedGenerationRun) &&
    (await removePendingGamePackExact({
      gamePackRepository,
      pendingGamePack,
    }))
  );
}

function acceptanceTransactionLineageMatches(
  left: GeneratedMechanicAcceptanceTransaction,
  right: GeneratedMechanicAcceptanceTransaction
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.transactionId === right.transactionId &&
    left.generationRunId === right.generationRunId &&
    left.artifactId === right.artifactId &&
    left.buildId === right.buildId &&
    left.checkpointId === right.checkpointId
  );
}

function acceptedArtifactProjectIdentityMatches(
  left: AcceptedGeneratedMechanicArtifact,
  right: AcceptedGeneratedMechanicArtifact
): boolean {
  const {
    acceptedAt: ignoredLeftAcceptedAt,
    buildId: ignoredLeftBuildId,
    checkpointId: ignoredLeftCheckpointId,
    validationEvidenceIds: ignoredLeftEvidenceIds,
    ...leftProjectIdentity
  } = left;
  const {
    acceptedAt: ignoredRightAcceptedAt,
    buildId: ignoredRightBuildId,
    checkpointId: ignoredRightCheckpointId,
    validationEvidenceIds: ignoredRightEvidenceIds,
    ...rightProjectIdentity
  } = right;
  void ignoredLeftAcceptedAt;
  void ignoredLeftBuildId;
  void ignoredLeftCheckpointId;
  void ignoredLeftEvidenceIds;
  void ignoredRightAcceptedAt;
  void ignoredRightBuildId;
  void ignoredRightCheckpointId;
  void ignoredRightEvidenceIds;
  return jsonEqual(leftProjectIdentity, rightProjectIdentity);
}

function nullableGamePacksEqual(
  left: GamePack | null,
  right: GamePack | null
): boolean {
  return (
    (left === null && right === null) ||
    (left !== null && right !== null && jsonEqual(left, right))
  );
}

async function replaceGenerationRunExact({
  expectedGenerationRun,
  generationRunRepository,
  replacementGenerationRun,
}: Readonly<{
  expectedGenerationRun: GenerationRun;
  generationRunRepository: Pick<GenerationRunRepository, "fetch" | "update">;
  replacementGenerationRun: GenerationRun;
}>): Promise<boolean> {
  try {
    await generationRunRepository.update(
      expectedGenerationRun.id,
      (currentGenerationRun) => {
        if (!jsonEqual(currentGenerationRun, expectedGenerationRun)) {
          throw new Error(
            "GenerationRun changed while pending acceptance was reconciling."
          );
        }
        return replacementGenerationRun;
      }
    );
  } catch {
    // A repository driver may throw after a durable write. The exact fetch
    // below distinguishes that case from a foreign concurrent mutation.
  }
  try {
    const currentGenerationRun = await generationRunRepository.fetch(
      expectedGenerationRun.id
    );
    return (
      currentGenerationRun !== null &&
      jsonEqual(currentGenerationRun, replacementGenerationRun)
    );
  } catch {
    return false;
  }
}

async function removePendingGamePackExact({
  gamePackRepository,
  pendingGamePack,
}: Readonly<{
  gamePackRepository: Pick<GamePackRepository, "compareAndSwap" | "load">;
  pendingGamePack: GamePack;
}>): Promise<boolean> {
  try {
    const removed = await gamePackRepository.compareAndSwap(
      pendingGamePack.id,
      pendingGamePack,
      null
    );
    if (removed) {
      return true;
    }
  } catch {
    // A repository driver may throw after a durable removal. Confirm below.
  }
  try {
    return (await gamePackRepository.load(pendingGamePack.id)) === null;
  } catch {
    return false;
  }
}

async function recoverDurableFinalizedGeneratedMechanicAcceptance({
  acceptedArtifact,
  acceptedGamePack,
  gamePackRepository,
  generationRunRepository,
  linkedGenerationRunSnapshot,
  pendingGamePack,
  pendingGenerationRunSnapshot,
}: Readonly<{
  acceptedArtifact: AcceptedGeneratedMechanicArtifact;
  acceptedGamePack: GamePack;
  gamePackRepository: Pick<GamePackRepository, "compareAndSwap" | "load">;
  generationRunRepository: Pick<GenerationRunRepository, "fetch" | "update">;
  linkedGenerationRunSnapshot: GenerationRun;
  pendingGamePack: GamePack;
  pendingGenerationRunSnapshot: GenerationRun;
}>): Promise<
  | Extract<GeneratedMechanicProjectHandoffResult, { outcome: "accepted" }>
  | undefined
> {
  const journal = readPendingGeneratedMechanicAcceptanceJournal(
    pendingGamePack
  );
  if (journal === "invalid") {
    return undefined;
  }
  try {
    const [canonicalGamePack, currentGenerationRun] = await Promise.all([
      gamePackRepository.load(acceptedGamePack.id),
      generationRunRepository.fetch(linkedGenerationRunSnapshot.id),
    ]);
    const finalizedCanonical = exactFinalizedGeneratedMechanicAcceptance({
      artifact: acceptedArtifact,
      canonicalGamePack,
      expectedLinkedGenerationRun: linkedGenerationRunSnapshot,
      journal,
    });
    if (!finalizedCanonical || !currentGenerationRun) {
      return undefined;
    }
    if (jsonEqual(currentGenerationRun, pendingGenerationRunSnapshot)) {
      const finalized = await replaceGenerationRunExact({
        expectedGenerationRun: pendingGenerationRunSnapshot,
        generationRunRepository,
        replacementGenerationRun: linkedGenerationRunSnapshot,
      });
      if (!finalized) {
        return undefined;
      }
    } else if (!jsonEqual(currentGenerationRun, linkedGenerationRunSnapshot)) {
      return undefined;
    }
    const pendingRemoved =
      await removePendingGamePackAfterGenerationRunRecheck({
        canonicalGamePackId: acceptedGamePack.id,
        expectedCanonicalGamePack: finalizedCanonical,
        expectedGenerationRun: linkedGenerationRunSnapshot,
        gamePackRepository,
        generationRunRepository,
        pendingGamePack,
      });
    if (!pendingRemoved) {
      return undefined;
    }
    return {
      outcome: "accepted",
      gamePack: finalizedCanonical,
      generationRun: linkedGenerationRunSnapshot,
      artifact: acceptedArtifact,
    };
  } catch {
    return undefined;
  }
}

async function inspectDurableCanonicalAcceptanceState({
  acceptedGamePack,
  gamePackRepository,
  pendingGamePack,
}: Readonly<{
  acceptedGamePack: GamePack;
  gamePackRepository: Pick<GamePackRepository, "load">;
  pendingGamePack: GamePack;
}>): Promise<"retained" | "unrelated" | "unknown"> {
  const journal = readPendingGeneratedMechanicAcceptanceJournal(
    pendingGamePack
  );
  if (journal === "invalid") {
    return "unknown";
  }
  try {
    const canonicalGamePack = await gamePackRepository.load(
      acceptedGamePack.id
    );
    return canonicalGamePackRetainsAcceptanceTransaction(
      canonicalGamePack,
      journal
    )
      ? "retained"
      : "unrelated";
  } catch {
    return "unknown";
  }
}

function durableAcceptanceRecoveryPendingIssue(): GeneratedMechanicProjectHandoffIssue {
  return issue(
    "persistence",
    "accepted_artifact_recovery_pending",
    "Generated mechanic acceptance retained a finalized canonical transaction while exact external lineage recovery remains pending."
  );
}

function generatedMechanicAcceptanceLockIssue(
  error: unknown
): GeneratedMechanicProjectHandoffIssue {
  const unavailable =
    error instanceof GeneratedMechanicAcceptanceLockUnavailableError;
  return issue(
    "persistence.acceptanceLock",
    unavailable ? "acceptance_lock_unavailable" : "acceptance_lock_failed",
    errorMessage(
      error,
      unavailable
        ? "The browser cross-realm lock manager is unavailable for generated mechanic acceptance."
        : "Generated mechanic acceptance could not acquire its browser cross-realm lock."
    )
  );
}

function pendingAcceptanceRecoveryIssue(
  pendingGamePackId: GamePack["id"]
): GeneratedMechanicProjectHandoffIssue {
  return issue(
    `persistence.pendingGamePacks.${pendingGamePackId}`,
    "pending_acceptance_reconciliation_failed",
    "Pending generated mechanic acceptance did not match an exact recoverable staging or finalized transaction state."
  );
}

function interruptedHandoffRecoveryIssue(
  generationRunId: GenerationRun["id"]
): GeneratedMechanicProjectHandoffIssue {
  return issue(
    `persistence.generationRuns.${generationRunId}`,
    "generated_mechanic_handoff_reconciliation_failed",
    "Interrupted generated mechanic handoff evidence could not be reconciled safely."
  );
}

export function prepareRestoredGeneratedMechanicProject({
  gamePack,
  trustedPortContracts,
}: PrepareRestoredGeneratedMechanicProjectInput): PrepareRestoredGeneratedMechanicProjectResult {
  const acceptanceTransaction =
    readGeneratedMechanicAcceptanceTransaction(gamePack);
  if (
    acceptanceTransaction === "invalid" ||
    hasGeneratedMechanicAcceptanceJournalResidue(gamePack)
  ) {
    return {
      success: false,
      issues: [
        issue(
          "gamePack.metadata.generatedMechanicAcceptanceTransaction",
          "invalid_acceptance_transaction",
          "Generated mechanic restore requires a well-formed finalized acceptance transaction marker when one is present."
        ),
      ],
    };
  }
  if (acceptanceTransaction?.status === "pending") {
    return {
      success: false,
      issues: [
        issue(
          "gamePack.metadata.generatedMechanicAcceptanceTransaction",
          "acceptance_transaction_pending",
          "Generated mechanic restore cannot consume a Game Pack whose cross-store acceptance transaction is still pending."
        ),
      ],
    };
  }
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
  if (
    acceptanceTransaction &&
    (acceptanceTransaction.generationRunId !== artifact.sourceGenerationRunId ||
      acceptanceTransaction.artifactId !== artifact.id ||
      acceptanceTransaction.buildId !== artifact.buildId ||
      acceptanceTransaction.checkpointId !== artifact.checkpointId)
  ) {
    return {
      success: false,
      issues: [
        issue(
          "gamePack.metadata.generatedMechanicAcceptanceTransaction",
          "accepted_artifact_lineage_mismatch",
          "The finalized acceptance transaction must identify the exact current accepted artifact lineage."
        ),
      ],
    };
  }
  if (!acceptedArtifactLineageIsExact(gamePack, checkpoint, artifact)) {
    return {
      success: false,
      issues: [
        issue(
          "gamePack.currentCheckpointId",
          "accepted_artifact_lineage_mismatch",
          "The current checkpoint, accepted-origin checkpoint, build, and validation evidence must retain one exact generated mechanic artifact lineage."
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

function acceptedArtifactLineageIsExact(
  gamePack: GamePack,
  currentCheckpoint: GamePack["checkpoints"][number],
  artifact: AcceptedGeneratedMechanicArtifact
): boolean {
  const acceptedOriginCheckpoint = gamePack.checkpoints.find(
    ({ id }) => id === artifact.checkpointId
  );
  const build = gamePack.builds.find(({ id }) => id === artifact.buildId);
  const artifactIds = [artifact.id];
  const evidenceIds = [...artifact.validationEvidenceIds];
  const lineageEvidence = gamePack.validationEvidence.filter(({ id }) =>
    evidenceIds.includes(id)
  );
  const checkpointMatches = (
    checkpoint: GamePack["checkpoints"][number] | undefined
  ) =>
    checkpoint !== undefined &&
    checkpoint.gameSpecId === artifact.gameSpecId &&
    checkpoint.buildId === artifact.buildId &&
    jsonEqual(checkpoint.generatedMechanicArtifactIds ?? [], artifactIds) &&
    jsonEqual(checkpoint.validationEvidenceIds, evidenceIds);

  return (
    checkpointMatches(currentCheckpoint) &&
    checkpointMatches(acceptedOriginCheckpoint) &&
    build !== undefined &&
    build.gameSpecId === artifact.gameSpecId &&
    build.checkpointId === artifact.checkpointId &&
    jsonEqual(build.generatedMechanicArtifactIds ?? [], artifactIds) &&
    jsonEqual(build.validationEvidenceIds, evidenceIds) &&
    lineageEvidence.length === evidenceIds.length &&
    lineageEvidence.every((evidence) =>
      jsonEqual(evidence.generatedMechanicArtifactIds ?? [], artifactIds)
    )
  );
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
  const preparedRuntimeProject = prepared.data;
  const finalGameSpec = dependency.finalGameSpec;
  const expectedRuntimeIdentity = createExpectedRuntimeIdentity(
    preparedRuntimeProject,
    dependency,
    finalGameSpec
  );
  let loadedDependency: LoadedGeneratedMechanicProjectDependency;
  let activation: GeneratedMechanicProjectActivation;
  try {
    loadedDependency = await runtime.loadProjectDependency(preparedRuntimeProject);
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
  finalGameSpec,
  sourceArtifact,
}: {
  contract: GeneratedMechanicContract;
  evaluation: GeneratedMechanicEvaluationResult;
  finalGameSpec: GeneratedMechanicFinalGameSpec;
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
  const expectedExternalBindingIds = trustedActorBindingIdsForHandoff(
    contract,
    finalGameSpec.gameSpec
  );
  const expectedExternalActionId = trustedInputActionIdForHandoff(
    contract,
    finalGameSpec.gameSpec
  );
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
        scenarioEvidence.externalObservations.length === 1 &&
        scenarioEvidence.externalObservations.every(
          ({ actual, assertion, kind, passed, source }) =>
            passed &&
            source === "evaluator_authored" &&
            kind === assertion.kind &&
            externalObservationEvidenceActualMatchesAssertion(
              actual,
              assertion,
              expectedExternalBindingIds,
              expectedExternalActionId
            )
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
      config: finalGameSpec.extension.config,
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

function externalObservationEvidenceActualMatchesAssertion(
  actual: JsonValue,
  assertion: ExternalAcceptanceObservationAssertion,
  expectedBindingIds: readonly StableId[],
  expectedActionId: StableId | undefined
): boolean {
  if (assertion.kind !== "referenced_entity_motion_changed") {
    return false;
  }
  if (
    expectedBindingIds.length === 0 ||
    expectedActionId === undefined ||
    assertion.actionId !== expectedActionId ||
    !jsonEqual(assertion.bindingIds, expectedBindingIds) ||
    actual === null ||
    typeof actual !== "object" ||
    Array.isArray(actual) ||
    !Object.prototype.hasOwnProperty.call(actual, "before") ||
    !Object.prototype.hasOwnProperty.call(actual, "after")
  ) {
    return false;
  }
  const before = (actual as { before?: unknown }).before;
  const after = (actual as { after?: unknown }).after;
  return (
    exactMotionEvidenceEntries(before, expectedBindingIds) &&
    exactMotionEvidenceEntries(after, expectedBindingIds) &&
    (before as unknown[]).every(
      (entry, index) => !jsonEqual(entry, (after as unknown[])[index])
    )
  );
}

function trustedActorBindingIdsForHandoff(
  contract: GeneratedMechanicContract,
  gameSpec: GeneratedMechanicFinalGameSpec["gameSpec"]
): readonly StableId[] {
  const lineage = contract.intentLineage;
  if (!lineage) {
    return [];
  }
  const actorRoles = new Set(lineage.actors);
  const entitiesById = new Map(
    gameSpec.entities.map((entity) => [entity.id, entity] as const)
  );
  const actorEntityIds = lineage.references.flatMap((reference) => {
    if (reference.kind !== "entity") {
      return [];
    }
    const entity = entitiesById.get(reference.id);
    return entity && actorRoles.has(entity.role) ? [entity.id] : [];
  });
  const representedActorRoles = new Set(
    actorEntityIds.map((entityId) => entitiesById.get(entityId)!.role)
  );
  const actorBindings = actorEntityIds.map((entityId) =>
    contract.bindings.filter(
      (binding) =>
        binding.referenceKind === "entity" &&
        binding.cardinality === "one" &&
        binding.objectIds.length === 1 &&
        binding.objectIds[0] === entityId
    )
  );
  if (
    actorRoles.size === 0 ||
    representedActorRoles.size !== actorRoles.size ||
    actorEntityIds.length === 0 ||
    new Set(actorEntityIds).size !== actorEntityIds.length ||
    actorBindings.some((bindings) => bindings.length !== 1)
  ) {
    return [];
  }
  return actorBindings.map(([binding]) => binding!.id);
}

function trustedInputActionIdForHandoff(
  contract: GeneratedMechanicContract,
  gameSpec: GeneratedMechanicFinalGameSpec["gameSpec"]
): StableId | undefined {
  const inputActionIds = contract.intentLineage?.connections.flatMap(
    (connection) =>
      connection.direction === "input" ? [connection.port] : []
  );
  const actionId = inputActionIds?.[0];
  return inputActionIds?.length === 1 &&
    actionId !== undefined &&
    gameSpec.controls.some((control) => control.action === actionId)
    ? actionId
    : undefined;
}

function exactMotionEvidenceEntries(
  value: unknown,
  expectedBindingIds: readonly StableId[]
): boolean {
  return (
    Array.isArray(value) &&
    value.length === expectedBindingIds.length &&
    value.every((entry, index) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        return false;
      }
      const record = entry as Record<string, unknown>;
      return (
        Object.keys(record).length === 3 &&
        record.bindingId === expectedBindingIds[index] &&
        isFiniteVector(record.position) &&
        isFiniteVector(record.velocity)
      );
    })
  );
}

function isFiniteVector(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    typeof record.x === "number" &&
    Number.isFinite(record.x) &&
    typeof record.y === "number" &&
    Number.isFinite(record.y)
  );
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
  project: PreparedGeneratedMechanicRuntimeProject,
  dependency: GeneratedMechanicProjectDependency,
  finalGameSpec: GeneratedMechanicFinalGameSpec
): GeneratedMechanicProjectActivation {
  return {
    project,
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
  if (!jsonEqual(identity.project, expected.project)) {
    issues.push(
      issue(
        `${path}.project`,
        "runtime_project_substitution",
        "Runtime must retain the exact candidate or accepted project identity it loaded."
      )
    );
  }
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
  gamePackRepository: Pick<GamePackRepository, "compareAndSwap" | "load">;
  previousGamePack: GamePack | null;
  writtenGamePack: GamePack;
}): Promise<GeneratedMechanicProjectHandoffIssue[]> {
  let rollbackError: unknown;
  try {
    const restored = await gamePackRepository.compareAndSwap(
      gamePackId,
      writtenGamePack,
      previousGamePack
    );
    if (restored) {
      return [];
    }
  } catch (error) {
    rollbackError = error;
  }
  try {
    const currentGamePack = await gamePackRepository.load(gamePackId);
    if (
      (previousGamePack === null && currentGamePack === null) ||
      (previousGamePack !== null &&
        currentGamePack !== null &&
        jsonEqual(currentGamePack, previousGamePack))
    ) {
      return [];
    }
    throw (
      rollbackError ??
      new Error(
        "Game Pack changed after generated mechanic acceptance and was not overwritten during rollback."
      )
    );
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
  writtenGenerationRuns,
}: {
  generationRun: GenerationRun;
  generationRunRepository: Pick<GenerationRunRepository, "fetch" | "update">;
  writtenGenerationRuns: readonly GenerationRun[];
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
    if (isGenerationRunInterruption(currentGenerationRun)) {
      return [];
    }
    if (
      !writtenGenerationRuns.some((writtenGenerationRun) =>
        jsonEqual(currentGenerationRun, writtenGenerationRun)
      )
    ) {
      throw new Error(
        "GenerationRun changed after generated mechanic acceptance and was not overwritten during rollback."
      );
    }
    try {
      await generationRunRepository.update(
        generationRun.id,
        (current) =>
          writtenGenerationRuns.some((writtenGenerationRun) =>
            jsonEqual(current, writtenGenerationRun)
          )
            ? generationRun
            : current
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
    if (
      restoredGenerationRun &&
      isGenerationRunInterruption(restoredGenerationRun)
    ) {
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

function isGenerationRunInterruption(generationRun: GenerationRun): boolean {
  return (
    generationRun.status === "cancelled" ||
    generationRun.status === "timed-out"
  );
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

function generationCancelledIssue(): GeneratedMechanicProjectHandoffIssue {
  return issue(
    "signal",
    "generation_cancelled",
    "Generated mechanic acceptance was cancelled before durable persistence."
  );
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

function safelyCreateAcceptedAt(
  createAcceptedAt: (() => string) | undefined
): ReturnType<typeof acceptedAtSchema.safeParse> {
  try {
    return acceptedAtSchema.safeParse(createAcceptedAt?.());
  } catch {
    return acceptedAtSchema.safeParse(undefined);
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
