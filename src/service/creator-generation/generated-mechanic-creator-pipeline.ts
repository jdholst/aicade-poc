import type {
  ArtifactScopedRepairIssue,
  ArtifactScopedRepairStage,
  GenerationConstraintSet,
  GenerationRun,
  StableId,
} from "@/game-spec";
import {
  artifactScopedRepairArtifactIdSchema,
  readGeneratedMechanicHandoffReceipt,
  withGeneratedMechanicAcceptanceLock,
  writeGeneratedMechanicHandoffPendingReceipt,
  type GeneratedMechanicAcceptanceLockReceipt,
  type GeneratedMechanicHandoffReceipt,
} from "@/game-spec";
import {
  runArtifactScopedMechanicRepair,
  type ArtifactScopedMechanicRepairResult,
  type ArtifactScopedRepairArtifact,
  type ArtifactScopedRepairStageInput,
} from "@/service/mechanic-repair";

import {
  createBrowserGenerationContinuationAuthority,
} from "./browser-generation-continuation";
import type { GenerationOperationContext } from "./generation-operation-context";

export type GeneratedMechanicPipelineStageFailure = Readonly<{
  responsibleStage: ArtifactScopedRepairStage;
  issues: readonly ArtifactScopedRepairIssue[];
  artifact?: ArtifactScopedRepairArtifact;
}>;

export type GeneratedMechanicPipelineStageResult<Value> =
  | Readonly<{
      success: true;
      data: Readonly<{ id: StableId; value: Value }>;
    }>
  | Readonly<{
      success: false;
      evidence: GeneratedMechanicPipelineStageFailure;
    }>;

export type GeneratedMechanicPipelineSourceResult<Source, Evaluation> =
  | Readonly<{
      success: true;
      data: Readonly<{
        id: StableId;
        source: Source;
        evaluation: Evaluation;
      }>;
    }>
  | Readonly<{
      success: false;
      evidence: GeneratedMechanicPipelineStageFailure;
    }>;

export type GeneratedMechanicPipelineFoundationResult<Foundation> =
  | Readonly<{ success: true; data: Foundation }>
  | Readonly<{
      success: false;
      evidence: Readonly<{
        stage: "foundation";
        issues: readonly ArtifactScopedRepairIssue[];
      }>;
    }>;

type PipelineStageAttempt = Pick<
  ArtifactScopedRepairStageInput,
  "attemptNumber" | "kind" | "repair"
>;

export type GeneratedMechanicPipelineRejectionEvidence<
  Stage extends StableId = StableId,
> = Readonly<{
  stage: Stage;
  issues: readonly ArtifactScopedRepairIssue[];
  runtimeEvidence?: unknown;
}>;

export type GeneratedMechanicCreatorPipelineDependencies<
  Foundation,
  Contract,
  Source,
  Evaluation,
  FinalGameSpec,
  Accepted,
  HandoffRejectionStage extends StableId = StableId,
> = Readonly<{
  loadGenerationRun(generationRunId: StableId): Promise<GenerationRun | null>;
  persistGenerationRun(generationRun: GenerationRun): Promise<GenerationRun>;
  runFoundation(): Promise<
    GeneratedMechanicPipelineFoundationResult<Foundation>
  >;
  runContract(
    input: PipelineStageAttempt & Readonly<{ foundation: Foundation }>
  ): Promise<GeneratedMechanicPipelineStageResult<Contract>>;
  runSourceAndEvaluation(
    input: PipelineStageAttempt &
      Readonly<{ foundation: Foundation; contract: Contract }>
  ): Promise<GeneratedMechanicPipelineSourceResult<Source, Evaluation>>;
  runFinalGameSpec(
    input: PipelineStageAttempt &
      Readonly<{
        foundation: Foundation;
        contract: Contract;
        source: Source;
        evaluation: Evaluation;
      }>
  ): Promise<GeneratedMechanicPipelineStageResult<FinalGameSpec>>;
  runHandoff(input: Readonly<{
    acceptanceLockReceipt?: GeneratedMechanicAcceptanceLockReceipt;
    foundation: Foundation;
    contract: Contract;
    source: Source;
    evaluation: Evaluation;
    finalGameSpec: FinalGameSpec;
    generationRun: GenerationRun;
    repair: Extract<ArtifactScopedMechanicRepairResult, { status: "succeeded" }>;
  }>): Promise<
    | Readonly<{ outcome: "accepted"; value: Accepted }>
    | Readonly<{
        outcome: "rejected";
        evidence: GeneratedMechanicPipelineRejectionEvidence<HandoffRejectionStage>;
      }>
  >;
}>;

export type RunGeneratedMechanicCreatorPipelineInput<
  Foundation,
  Contract,
  Source,
  Evaluation,
  FinalGameSpec,
  Accepted,
  HandoffRejectionStage extends StableId = StableId,
> = Readonly<{
  constraintSet: GenerationConstraintSet;
  context: GenerationOperationContext;
  dependencies: GeneratedMechanicCreatorPipelineDependencies<
    Foundation,
    Contract,
    Source,
    Evaluation,
    FinalGameSpec,
    Accepted,
    HandoffRejectionStage
  >;
  intentArtifactId: StableId;
  now?: () => string;
}>;

export type GeneratedMechanicCreatorPipelineResult<
  Accepted,
  HandoffRejectionStage extends StableId = StableId,
> =
  | Readonly<{ outcome: "accepted"; value: Accepted }>
  | Readonly<{
      outcome: "rejected";
      evidence: GeneratedMechanicPipelineRejectionEvidence<
        | "foundation"
        | "generation_run"
        | "repair_exhausted"
        | HandoffRejectionStage
      >;
    }>;

/**
 * Owns the live browser transaction from the foundation gate through Ticket 16
 * handoff. Ticket 15 snapshots its serializable artifacts; authenticity-bearing
 * foundation and evaluation values stay in closure-local maps.
 */
export async function runGeneratedMechanicCreatorPipeline<
  Foundation,
  Contract,
  Source,
  Evaluation,
  FinalGameSpec,
  Accepted,
  HandoffRejectionStage extends StableId = StableId,
>({
  constraintSet,
  context,
  dependencies,
  intentArtifactId,
  now,
}: RunGeneratedMechanicCreatorPipelineInput<
  Foundation,
  Contract,
  Source,
  Evaluation,
  FinalGameSpec,
  Accepted,
  HandoffRejectionStage
>): Promise<
  GeneratedMechanicCreatorPipelineResult<Accepted, HandoffRejectionStage>
> {
  if (
    context.routeKind !== "generated_mechanic" ||
    context.trustMode !== "browser_authenticated"
  ) {
    throw new TypeError(
      "Generated mechanic pipeline requires an admitted browser-authenticated operation context."
    );
  }

  const authority = createBrowserGenerationContinuationAuthority();
  const correlation = Object.freeze({
    generationRunId: context.generationRunId,
    stage: "generated_mechanic_pipeline" as const,
    attemptNumber: 1,
    artifactIds: Object.freeze([intentArtifactId]),
    capabilityVersion: constraintSet.capabilityVersion,
    cancellationEpoch: context.cancellationEpoch,
    signal: context.signal,
  });
  const receipt = authority.issue(correlation);
  const completion = await authority.consume({
    acceptResultAfterAbort: (result) => result.outcome === "accepted",
    receipt,
    expected: correlation,
    run: () =>
      executePipeline({
        constraintSet,
        context,
        dependencies,
        intentArtifactId,
        now,
      }),
  });
  if (!authority.isAuthenticCompletion(completion)) {
    throw new Error(
      "Generated mechanic pipeline did not retain its browser continuation authority."
    );
  }
  return completion.result;
}

async function executePipeline<
  Foundation,
  Contract,
  Source,
  Evaluation,
  FinalGameSpec,
  Accepted,
  HandoffRejectionStage extends StableId = StableId,
>({
  constraintSet,
  context,
  dependencies,
  intentArtifactId,
  now,
}: RunGeneratedMechanicCreatorPipelineInput<
  Foundation,
  Contract,
  Source,
  Evaluation,
  FinalGameSpec,
  Accepted,
  HandoffRejectionStage
>): Promise<
  GeneratedMechanicCreatorPipelineResult<Accepted, HandoffRejectionStage>
> {
  let generationRun: GenerationRun | null;
  try {
    generationRun = await dependencies.loadGenerationRun(
      context.generationRunId
    );
  } catch {
    return {
      outcome: "rejected",
      evidence: {
        stage: "generation_run",
        issues: [
          {
            path: "generationRun",
            code: "generation_run_receipt_load_failed",
            message:
              "Generated mechanic creation could not load its GenerationRun receipt.",
          },
        ],
      },
    };
  }
  if (
    !generationRun ||
    generationRun.id !== context.generationRunId ||
    generationRun.status !== "running"
  ) {
    return {
      outcome: "rejected",
      evidence: {
        stage: "generation_run",
        issues: [
          {
            path: "generationRun",
            code: "generation_run_receipt_unavailable",
            message:
              "Generated mechanic creation requires its exact running GenerationRun receipt before browser work can begin.",
          },
        ],
      },
    };
  }

  const foundationResult = await dependencies.runFoundation();
  if (!foundationResult.success) {
    return {
      outcome: "rejected",
      evidence: foundationResult.evidence,
    };
  }
  const foundation = foundationResult.data;
  const contracts = new Map<StableId, Contract>();
  const sources = new Map<
    StableId,
    Readonly<{ source: Source; evaluation: Evaluation }>
  >();
  const finalGameSpecs = new Map<StableId, FinalGameSpec>();

  const repair = await runArtifactScopedMechanicRepair({
    generationRun,
    constraintSet,
    ...(now
      ? {
          completedAt: now,
          now: () => Date.parse(now()),
        }
      : {}),
    stageRunners: {
      contract: async (stageInput) => {
        const result = await dependencies.runContract({
          foundation,
          ...stageAttempt(stageInput),
        });
        if (!result.success) {
          return result;
        }
        contracts.set(result.data.id, result.data.value);
        return {
          success: true,
          data: {
            artifact: {
              ...result.data,
              id: artifactScopedRepairArtifactIdSchema.parse(result.data.id),
            },
          },
        };
      },
      source: async (stageInput) => {
        const contractArtifact = stageInput.upstreamArtifacts.contract;
        const contract = contractArtifact
          ? contracts.get(contractArtifact.id)
          : undefined;
        if (!contract) {
          throw new Error(
            "Generated source stage lost its exact accepted contract authority."
          );
        }
        const result = await dependencies.runSourceAndEvaluation({
          foundation,
          contract,
          ...stageAttempt(stageInput),
        });
        if (!result.success) {
          return result;
        }
        sources.set(result.data.id, {
          source: result.data.source,
          evaluation: result.data.evaluation,
        });
        return {
          success: true,
          data: {
            artifact: {
              id: artifactScopedRepairArtifactIdSchema.parse(result.data.id),
              value: result.data.source,
            },
          },
        };
      },
      finalGameSpec: async (stageInput) => {
        const contractArtifact = stageInput.upstreamArtifacts.contract;
        const sourceArtifact = stageInput.upstreamArtifacts.source;
        const contract = contractArtifact
          ? contracts.get(contractArtifact.id)
          : undefined;
        const sourceAndEvaluation = sourceArtifact
          ? sources.get(sourceArtifact.id)
          : undefined;
        if (!contract || !sourceAndEvaluation) {
          throw new Error(
            "Final Game Spec stage lost its exact accepted upstream authority."
          );
        }
        const result = await dependencies.runFinalGameSpec({
          foundation,
          contract,
          source: sourceAndEvaluation.source,
          evaluation: sourceAndEvaluation.evaluation,
          ...stageAttempt(stageInput),
        });
        if (!result.success) {
          return result;
        }
        finalGameSpecs.set(result.data.id, result.data.value);
        return {
          success: true,
          data: {
            artifact: {
              ...result.data,
              id: artifactScopedRepairArtifactIdSchema.parse(result.data.id),
            },
          },
        };
      },
    },
  });

  if (repair.status === "repair_exhausted") {
    const persistedGenerationRun = await persistExactRepairRun({
      context,
      dependencies,
      expectedHandoffReceipt: undefined,
      generationRunToPersist: repair.generationRun,
      repair,
    });
    if (!persistedGenerationRun) {
      return repairReceiptPersistenceFailure();
    }
    return {
      outcome: "rejected",
      evidence: {
        stage: "repair_exhausted",
        issues: repair.receipt.exhausted?.issues ?? [
          {
            path: "artifactScopedRepair",
            code: "repair_exhausted",
            message:
              "Generated mechanic repair exhausted its bounded attempts.",
          },
        ],
      },
    };
  }

  const contract = contracts.get(repair.artifacts.contract.id);
  const sourceAndEvaluation = sources.get(repair.artifacts.source.id);
  const finalGameSpec = finalGameSpecs.get(
    repair.artifacts.finalGameSpec.id
  );
  if (!contract || !sourceAndEvaluation || !finalGameSpec) {
    throw new Error(
      "Generated mechanic repair success lost its live accepted artifact lineage."
    );
  }

  try {
    return await withGeneratedMechanicAcceptanceLock({
      signal: context.signal,
      operation: async (acceptanceLockReceipt) => {
        const generationRunToPersist =
          writeGeneratedMechanicHandoffPendingReceipt(repair.generationRun, {
            intentArtifactId,
            contractArtifactId: repair.artifacts.contract.id,
            sourceArtifactId: repair.artifacts.source.id,
            finalGameSpecArtifactId: repair.artifacts.finalGameSpec.id,
          });
        const expectedHandoffReceipt =
          readGeneratedMechanicHandoffReceipt(generationRunToPersist);
        if (
          expectedHandoffReceipt === undefined ||
          expectedHandoffReceipt === "invalid"
        ) {
          throw new Error(
            "Generated mechanic handoff receipt was not canonical."
          );
        }
        const persistedGenerationRun = await persistExactRepairRun({
          context,
          dependencies,
          expectedHandoffReceipt,
          generationRunToPersist,
          repair,
        });
        if (!persistedGenerationRun) {
          return repairReceiptPersistenceFailure();
        }
        return dependencies.runHandoff({
          acceptanceLockReceipt,
          foundation,
          contract,
          source: sourceAndEvaluation.source,
          evaluation: sourceAndEvaluation.evaluation,
          finalGameSpec,
          generationRun: persistedGenerationRun,
          repair,
        });
      },
    });
  } catch {
    return {
      outcome: "rejected",
      evidence: {
        stage: "generation_run",
        issues: [
          context.signal.aborted
            ? {
                path: "context.signal",
                code: "generation_cancelled",
                message:
                  "Generated mechanic creation was cancelled before its acceptance transaction began.",
              }
            : {
                path: "generationRun.metadata.generatedMechanicHandoff",
                code: "acceptance_lock_failed",
                message:
                  "Generated mechanic creation could not acquire its cross-realm acceptance transaction lock.",
              },
        ],
      },
    };
  }
}

async function persistExactRepairRun<
  Foundation,
  Contract,
  Source,
  Evaluation,
  FinalGameSpec,
  Accepted,
  HandoffRejectionStage extends StableId,
>({
  context,
  dependencies,
  expectedHandoffReceipt,
  generationRunToPersist,
  repair,
}: Readonly<{
  context: GenerationOperationContext;
  dependencies: GeneratedMechanicCreatorPipelineDependencies<
    Foundation,
    Contract,
    Source,
    Evaluation,
    FinalGameSpec,
    Accepted,
    HandoffRejectionStage
  >;
  expectedHandoffReceipt: GeneratedMechanicHandoffReceipt | undefined;
  generationRunToPersist: GenerationRun;
  repair: ArtifactScopedMechanicRepairResult;
}>): Promise<GenerationRun | null> {
  try {
    const persistedGenerationRun = await dependencies.persistGenerationRun(
      generationRunToPersist
    );
    requireExactPersistedRepairRun(
      persistedGenerationRun,
      repair,
      expectedHandoffReceipt
    );
    return persistedGenerationRun;
  } catch {
    try {
      const confirmedGenerationRun =
        await dependencies.loadGenerationRun(context.generationRunId);
      if (!confirmedGenerationRun) {
        throw new Error("The durable repair receipt is absent.");
      }
      requireExactPersistedRepairRun(
        confirmedGenerationRun,
        repair,
        expectedHandoffReceipt
      );
      return confirmedGenerationRun;
    } catch {
      return null;
    }
  }
}

function repairReceiptPersistenceFailure(): GeneratedMechanicCreatorPipelineResult<
  never,
  never
> {
  return {
    outcome: "rejected",
    evidence: {
      stage: "generation_run",
      issues: [
        {
          path: "generationRun.artifactScopedRepair",
          code: "generation_run_receipt_persistence_failed",
          message:
            "Generated mechanic creation could not persist its exact repair receipt.",
        },
      ],
    },
  };
}

function stageAttempt(
  input: ArtifactScopedRepairStageInput
): PipelineStageAttempt {
  return {
    attemptNumber: input.attemptNumber,
    kind: input.kind,
    ...(input.repair ? { repair: input.repair } : {}),
  };
}

function requireExactPersistedRepairRun(
  generationRun: GenerationRun,
  repair: ArtifactScopedMechanicRepairResult,
  expectedHandoffReceipt: GeneratedMechanicHandoffReceipt | undefined
): void {
  if (
    generationRun.id !== repair.generationRun.id ||
    generationRun.status !== repair.generationRun.status ||
    stableJsonStringify(generationRun.artifactScopedRepair) !==
      stableJsonStringify(repair.receipt) ||
    stableJsonStringify(readGeneratedMechanicHandoffReceipt(generationRun)) !==
      stableJsonStringify(expectedHandoffReceipt)
  ) {
    throw new Error(
      "Generated mechanic pipeline could not durably restore its exact repair lineage."
    );
  }
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${stableJsonStringify(child)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
