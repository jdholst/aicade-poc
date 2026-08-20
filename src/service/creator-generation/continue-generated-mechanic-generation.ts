import { DEFAULT_OPENAI_MODEL } from "@/constants";
import {
  PHASE_9_GENERATION_CONSTRAINT_SET,
  artifactScopedRepairArtifactIdSchema,
  completeGeneratedMechanicProjectHandoff,
  clearGeneratedMechanicHandoffReceipt,
  createIndexedDbGamePackRepository,
  createIndexedDbGenerationRunRepository,
  type ArtifactScopedRepairIssue,
  type GamePackRepository,
  type GeneratedMechanicContract,
  type GeneratedMechanicFinalGameSpec,
  type GeneratedMechanicProjectHandoffResult,
  type GenerationRun,
  type GenerationRunRepository,
  type MechanicCapabilityGrant,
  type StableId,
} from "@/game-spec";
import {
  jsonValueSchema,
  type JsonValue,
} from "@/game-spec/game-spec-schema";
import { PHASE_9_MECHANIC_RESOURCE_BUDGET } from "@/runtime/mechanics/phase-9-mechanic-resource-policy";
import { createGeneratedMechanicPhaserProjectRuntime } from "@/runtime/phaser/generated-mechanic-phaser-project-runtime";
import {
  evaluateGeneratedMechanicArtifact,
  type GeneratedMechanicEvaluationResult,
} from "@/service/mechanic-evaluation";
import {
  generateMechanicContract,
  type MechanicContractGenerationProvider,
  type MechanicContractGenerationResult,
} from "@/service/mechanic-contract-generation";
import {
  generateBuildAndExecuteMechanicSource,
  type GenerateBuildAndExecuteMechanicSourceResult,
  type GeneratedMechanicSourceArtifact,
  type MechanicSourceGenerationProvider,
} from "@/service/mechanic-source-generation";
import {
  createGeneratedMechanicContractHttpProvider,
  createGeneratedMechanicSourceHttpProvider,
  type CreateGeneratedMechanicHttpProviderInput,
} from "@/service/generated-mechanic-provider/generated-mechanic-provider-client";
import { isOpenAIModelId, type OpenAIModelId } from "@/utils/openai-utils";

import type { ContinueGeneratedMechanicGenerationInput } from "./creator-game-generation-dispatcher";
import {
  createBrowserRuntimeFoundation,
  type BrowserRuntimeFoundation,
} from "./browser-runtime-foundation";
import {
  createGeneratedMechanicBrowserEvaluationRuntimeFactory,
  createGeneratedMechanicBrowserExecutionFixture,
  createGeneratedMechanicExternalObservations,
} from "./generated-mechanic-browser-evaluation-fixture";
import {
  runGeneratedMechanicCreatorPipeline,
  type GeneratedMechanicCreatorPipelineDependencies,
  type GeneratedMechanicCreatorPipelineResult,
  type RunGeneratedMechanicCreatorPipelineInput,
} from "./generated-mechanic-creator-pipeline";
import { assembleGeneratedMechanicFinalGameSpec } from "./generated-mechanic-final-game-spec-assembler";
import {
  createGeneratedMechanicAssemblyPlan,
  createGeneratedMechanicCandidateGamePack,
  createGeneratedMechanicReferenceCatalog,
  materializeGeneratedMechanicConfig,
  validateGeneratedMechanicTopDownHostAdmission,
} from "./generated-mechanic-project-planning";

const HTTP_SERVER_RESOLVED_PROVIDER_CREDENTIAL =
  "http_server_resolved_provider_credential";
const TRUSTED_PORT_CONTRACTS = Object.freeze([]);

type ContractStageValue = Readonly<{
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
  config: JsonValue;
}>;

export type AcceptedGeneratedMechanicProject = Extract<
  GeneratedMechanicProjectHandoffResult,
  { outcome: "accepted" }
>;

type ProductionPipelineDependencies =
  GeneratedMechanicCreatorPipelineDependencies<
    BrowserRuntimeFoundation,
    ContractStageValue,
    GeneratedMechanicSourceArtifact,
    GeneratedMechanicEvaluationResult,
    GeneratedMechanicFinalGameSpec,
    AcceptedGeneratedMechanicProject,
    GeneratedMechanicTerminalRejectionEvidence["stage"]
  >;

type ProductionPipelineInput = RunGeneratedMechanicCreatorPipelineInput<
  BrowserRuntimeFoundation,
  ContractStageValue,
  GeneratedMechanicSourceArtifact,
    GeneratedMechanicEvaluationResult,
    GeneratedMechanicFinalGameSpec,
    AcceptedGeneratedMechanicProject,
    GeneratedMechanicTerminalRejectionEvidence["stage"]
>;

export type ContinueGeneratedMechanicGenerationResult =
  GeneratedMechanicCreatorPipelineResult<
    AcceptedGeneratedMechanicProject,
    GeneratedMechanicTerminalRejectionEvidence["stage"]
  >;

type GeneratedMechanicTerminalRejectionEvidence = Readonly<{
  stage:
    | "foundation"
    | "generation_run"
    | "repair_exhausted"
    | Extract<
        GeneratedMechanicProjectHandoffResult,
        { outcome: "rejected" }
      >["evidence"]["stage"];
  issues: readonly ArtifactScopedRepairIssue[];
  runtimeEvidence?: unknown;
}>;

type ContinueGeneratedMechanicGenerationServices = Readonly<{
  generationRunRepository: Pick<
    GenerationRunRepository,
    "fetch" | "update"
  >;
  gamePackRepository: Pick<GamePackRepository, "compareAndSwap" | "load">;
  createFoundation(): Promise<BrowserRuntimeFoundation>;
  createContractProvider(
    input: CreateGeneratedMechanicHttpProviderInput
  ): MechanicContractGenerationProvider;
  createSourceProvider(
    input: CreateGeneratedMechanicHttpProviderInput
  ): MechanicSourceGenerationProvider;
  generateContract: typeof generateMechanicContract;
  generateSource: typeof generateBuildAndExecuteMechanicSource;
  evaluateArtifact: typeof evaluateGeneratedMechanicArtifact;
  completeHandoff: typeof completeGeneratedMechanicProjectHandoff;
  createRuntime: typeof createGeneratedMechanicPhaserProjectRuntime;
  runPipeline(
    input: ProductionPipelineInput
  ): Promise<ContinueGeneratedMechanicGenerationResult>;
  now(): string;
}>;

export type CreateContinueGeneratedMechanicGenerationInput = Readonly<{
  services?: Partial<ContinueGeneratedMechanicGenerationServices>;
}>;

/**
 * Composes the normal creator's admitted generated-mechanic route from the
 * live browser foundation through accepted Game Pack persistence. Provider
 * HTTP responses remain candidates; every authority-bearing check is produced
 * by its existing browser/runtime owner before Ticket 16 can persist anything.
 */
export function createContinueGeneratedMechanicGeneration({
  services: overrides = {},
}: CreateContinueGeneratedMechanicGenerationInput = {}) {
  return async function continueGeneratedMechanicGeneration(
    input: ContinueGeneratedMechanicGenerationInput
  ): Promise<ContinueGeneratedMechanicGenerationResult> {
    const services = createServices(overrides);
    const { context, plan, request, routing } = input;
    const referenceCatalog = createGeneratedMechanicReferenceCatalog(plan.spec);
    const model = selectModel(request.openAiModel);
    const providerRequest = Object.freeze({
      ...request,
      openAiModel: model,
    });
    let retainedMechanicId: StableId | undefined;

    const dependencies: ProductionPipelineDependencies = {
      loadGenerationRun: (generationRunId) =>
        services.generationRunRepository.fetch(generationRunId),

      persistGenerationRun: (generationRun) =>
        services.generationRunRepository.update(
          generationRun.id,
          (currentGenerationRun) => {
            if (
              context.signal.aborted ||
              currentGenerationRun.status !== "running"
            ) {
              return currentGenerationRun;
            }
            requireSameGenerationRunIdentity(
              currentGenerationRun,
              generationRun
            );
            return retainGeneratedMechanicIdentity(
              generationRun,
              retainedMechanicId
            );
          }
        ),

      runFoundation: async () => {
        let foundation: BrowserRuntimeFoundation;
        try {
          foundation = await services.createFoundation();
        } catch {
          return {
            success: false,
            evidence: {
              stage: "foundation",
              issues: [
                {
                  path: "foundation",
                  code: "foundation_initialization_failed",
                  message:
                    "Generated mechanic creation could not initialize its browser runtime foundation.",
                },
              ],
            },
          };
        }
        if (foundation.gateResult.status === "passed") {
          return { success: true, data: foundation };
        }
        return {
          success: false,
          evidence: {
            stage: "foundation",
            issues: foundationIssues(foundation),
          },
        };
      },

      runContract: async ({ attemptNumber, kind, repair }) => {
        const provider = services.createContractProvider({
          attempt: attemptNumber,
          generationRunId: context.generationRunId,
          kind,
          providerRequest,
          ...(repair ? { repair } : {}),
        });
        const generated = await services.generateContract({
          intent: routing.intent,
          admittedRequest: routing.admittedRequest,
          referenceCatalog,
          resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
          model,
          providerCredential: HTTP_SERVER_RESOLVED_PROVIDER_CREDENTIAL,
          provider,
          signal: context.signal,
        });
        if (!generated.success) {
          return contractFailure(generated);
        }
        const admission = validateGeneratedMechanicTopDownHostAdmission({
          contract: generated.data.contract,
          catalog: referenceCatalog,
          intent: routing.intent,
        });
        if (!admission.success) {
          return admission;
        }
        const materializedConfig = materializeGeneratedMechanicConfig({
          config: generated.data.contract.config,
          catalog: referenceCatalog,
        });
        if (!materializedConfig.success) {
          return {
            success: false,
            evidence: {
              responsibleStage: "contract",
              issues: materializedConfig.evidence.issues,
            },
          };
        }
        return {
          success: true,
          data: {
            id: generated.data.contract.id,
            value: Object.freeze({
              contract: generated.data.contract,
              grant: generated.data.grant,
              config: materializedConfig.data,
            }),
          },
        };
      },

      runSourceAndEvaluation: async ({
        attemptNumber,
        foundation,
        contract: contractStage,
        kind,
        repair,
      }) => {
        const fixture = createGeneratedMechanicBrowserExecutionFixture({
          contract: contractStage.contract,
          gameSpec: plan.spec,
          grant: contractStage.grant,
          resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
          seed: attemptNumber,
        });
        let generated: GenerateBuildAndExecuteMechanicSourceResult;
        try {
          generated = await services.generateSource({
            foundationGateResult: foundation.gateResult,
            intent: routing.intent,
            admittedRequest: routing.admittedRequest,
            contract: contractStage.contract,
            grant: contractStage.grant,
            referenceCatalog,
            resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
            realmAdapter: foundation.realmAdapter,
            execution: {
              id: `source_execution_${context.generationRunId}_${attemptNumber}`,
              callbackKind: "install",
              config: contractStage.config,
              bindings: fixture.bindings,
              bindingAuthority: fixture.bindingAuthority,
              capabilityHost: fixture.capabilityHost,
              seed: attemptNumber,
            },
            model,
            providerCredential: HTTP_SERVER_RESOLVED_PROVIDER_CREDENTIAL,
            provider: services.createSourceProvider({
              attempt: attemptNumber,
              generationRunId: context.generationRunId,
              kind,
              providerRequest,
              ...(repair ? { repair } : {}),
            }),
            signal: context.signal,
          });
        } finally {
          await fixture.dispose();
        }
        if (!generated.success) {
          return sourceFailure(generated);
        }

        const sourceArtifact = generated.data.artifact;
        const evaluation = await services.evaluateArtifact({
          fixtureId: `evaluation_${context.generationRunId}_${attemptNumber}`,
          contract: contractStage.contract,
          artifact: sourceArtifact,
          config: contractStage.config,
          externalObservations: createGeneratedMechanicExternalObservations(
            routing.intent,
            contractStage.contract,
            plan.spec
          ),
          createRuntime:
            createGeneratedMechanicBrowserEvaluationRuntimeFactory({
              gameSpec: plan.spec,
              realmAdapter: foundation.realmAdapter,
              resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
            }),
        });
        if (evaluation.outcome !== "passed") {
          return {
            success: false,
            evidence: {
              responsibleStage: "source",
              issues: evaluationIssues(evaluation),
              artifact: {
                id: artifactScopedRepairArtifactIdSchema.parse(
                  sourceArtifact.id
                ),
                value: sourceArtifact,
              },
            },
          };
        }
        return {
          success: true,
          data: {
            id: sourceArtifact.id,
            source: sourceArtifact,
            evaluation,
          },
        };
      },

      runFinalGameSpec: async ({
        attemptNumber,
        contract: contractStage,
        source,
      }) => {
        const planResult = createGeneratedMechanicAssemblyPlan({
          attemptNumber,
          catalog: referenceCatalog,
          contract: contractStage.contract,
          generationRunId: context.generationRunId,
          intent: routing.intent,
        });
        if (!planResult.success) {
          return planResult;
        }
        const assembled = assembleGeneratedMechanicFinalGameSpec({
          baseGameSpec: plan.spec,
          intent: routing.intent,
          contract: contractStage.contract,
          sourceArtifact: source,
          referenceCatalog,
          trustedPortContracts: TRUSTED_PORT_CONTRACTS,
          assemblyPlan: planResult.data,
        });
        if (!assembled.success) {
          return assembled;
        }
        retainedMechanicId = planResult.data.mechanicId;
        return {
          success: true,
          data: {
            id: assembled.data.id,
            value: assembled.data,
          },
        };
      },

      runHandoff: async ({
        acceptanceLockReceipt,
        contract: contractStage,
        evaluation,
        finalGameSpec,
        generationRun,
        source,
      }) => {
        const rejectHandoff = async (
          evidence: GeneratedMechanicTerminalRejectionEvidence
        ): Promise<Extract<ContinueGeneratedMechanicGenerationResult, { outcome: "rejected" }>> => {
          const persistenceIssue = await persistGeneratedMechanicRejection({
            completedAt: services.now(),
            evidence,
            generationRunId: generationRun.id,
            repository: services.generationRunRepository,
            signal: context.signal,
          });
          return {
            outcome: "rejected",
            evidence: persistenceIssue
              ? {
                  ...evidence,
                  issues: [...evidence.issues, persistenceIssue],
                }
              : evidence,
          };
        };

        let gamePack;
        let runtime;
        try {
          requireRetainedMechanicIdentity(finalGameSpec, retainedMechanicId);
          gamePack = createGeneratedMechanicCandidateGamePack({
            createdAt: services.now(),
            finalGameSpec: finalGameSpec.gameSpec,
            gamePackId: `game_pack_${context.generationRunId}`,
            generationRunId: context.generationRunId,
            mechanicId: finalGameSpec.extension.mechanicId,
            requestSummary: context.requestSummary,
          });
          runtime = services.createRuntime({
            now: services.now,
            signal: context.signal,
          });
        } catch {
          return rejectHandoff({
            stage: "runtime_activation",
            issues: [
              {
                path: "runtime",
                code: "runtime_initialization_failed",
                message:
                  "Generated mechanic creation could not initialize its browser proof runtime.",
              },
            ],
          });
        }

        let handoff: GeneratedMechanicProjectHandoffResult;
        try {
          handoff = await services.completeHandoff({
            ...(acceptanceLockReceipt ? { acceptanceLockReceipt } : {}),
            createAcceptedAt: services.now,
            contract: contractStage.contract,
            deterministicEvaluation: evaluation,
            finalGameSpec,
            gamePack,
            gamePackRepository: services.gamePackRepository,
            generationRunId: generationRun.id,
            generationRunRepository: services.generationRunRepository,
            referenceCatalog,
            runtime,
            signal: context.signal,
            sourceArtifact: source,
            trustedPortContracts: TRUSTED_PORT_CONTRACTS,
          });
        } catch {
          return rejectHandoff({
            stage: "persistence",
            issues: [
              {
                path: "handoff",
                code: "generated_mechanic_handoff_failed",
                message:
                  "Generated mechanic creation could not complete its accepted-project handoff.",
              },
            ],
          });
        }
        if (handoff.outcome === "rejected") {
          return rejectHandoff(handoff.evidence);
        }
        return { outcome: "accepted", value: handoff };
      },
    };

    const result = await services.runPipeline({
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      context,
      dependencies,
      intentArtifactId: routing.intent.id,
      now: services.now,
    });
    if (
      result.outcome === "rejected" &&
      (result.evidence.stage === "foundation" ||
        result.evidence.stage === "generation_run")
    ) {
      const persistenceIssue = await persistGeneratedMechanicRejection({
        completedAt: services.now(),
        evidence: result.evidence,
        generationRunId: context.generationRunId,
        repository: services.generationRunRepository,
        signal: context.signal,
      });
      if (persistenceIssue) {
        return {
          outcome: "rejected",
          evidence: {
            ...result.evidence,
            issues: [...result.evidence.issues, persistenceIssue],
          },
        };
      }
    }
    return result;
  };
}

export const continueGeneratedMechanicGeneration =
  createContinueGeneratedMechanicGeneration();

function createServices(
  overrides: Partial<ContinueGeneratedMechanicGenerationServices>
): ContinueGeneratedMechanicGenerationServices {
  return {
    generationRunRepository:
      overrides.generationRunRepository ??
      createIndexedDbGenerationRunRepository(),
    gamePackRepository:
      overrides.gamePackRepository ?? createIndexedDbGamePackRepository(),
    createFoundation:
      overrides.createFoundation ?? createBrowserRuntimeFoundation,
    createContractProvider:
      overrides.createContractProvider ??
      createGeneratedMechanicContractHttpProvider,
    createSourceProvider:
      overrides.createSourceProvider ?? createGeneratedMechanicSourceHttpProvider,
    generateContract: overrides.generateContract ?? generateMechanicContract,
    generateSource:
      overrides.generateSource ?? generateBuildAndExecuteMechanicSource,
    evaluateArtifact:
      overrides.evaluateArtifact ?? evaluateGeneratedMechanicArtifact,
    completeHandoff:
      overrides.completeHandoff ?? completeGeneratedMechanicProjectHandoff,
    createRuntime:
      overrides.createRuntime ?? createGeneratedMechanicPhaserProjectRuntime,
    runPipeline: overrides.runPipeline ?? runGeneratedMechanicCreatorPipeline,
    now: overrides.now ?? (() => new Date().toISOString()),
  };
}

function selectModel(model: string | undefined): OpenAIModelId {
  return model && isOpenAIModelId(model) ? model : DEFAULT_OPENAI_MODEL;
}

function contractFailure(
  generated: Extract<MechanicContractGenerationResult, { success: false }>
) {
  return {
    success: false as const,
    evidence: {
      responsibleStage: "contract" as const,
      issues: generated.evidence.issues,
    },
  };
}

function sourceFailure(
  generated: Extract<
    GenerateBuildAndExecuteMechanicSourceResult,
    { success: false }
  >
) {
  return {
    success: false as const,
    evidence: {
      responsibleStage: "source" as const,
      issues: generated.evidence.issues,
    },
  };
}

function foundationIssues(
  foundation: BrowserRuntimeFoundation
): readonly ArtifactScopedRepairIssue[] {
  const failedChecks = foundation.gateResult.checks.filter(
    ({ status }) => status === "failed"
  );
  if (failedChecks.length === 0) {
    return Object.freeze([
      Object.freeze({
        path: "foundationGateResult",
        code: "foundation_gate_failed",
        message:
          "The Runtime and Contract Foundation Gate rejected generated source generation.",
      }),
    ]);
  }
  return Object.freeze(
    failedChecks.map((check) =>
      Object.freeze({
        path: `foundation.${check.boundary}`,
        code: check.code,
        message: check.message,
      })
    )
  );
}

function evaluationIssues(
  evaluation: GeneratedMechanicEvaluationResult
): readonly ArtifactScopedRepairIssue[] {
  const issues: ArtifactScopedRepairIssue[] = [
    ...evaluation.evidence.issues,
  ];
  for (const scenario of evaluation.evidence.scenarios) {
    issues.push(...scenario.issues);
    if (
      scenario.outcome === "failed" &&
      scenario.issues.length === 0
    ) {
      issues.push({
        path: `evaluation.scenarios.${scenario.scenarioId}`,
        code: "deterministic_evaluation_failed",
        message: `Scenario "${scenario.scenarioId}" failed independent observable evaluation.`,
      });
    }
  }
  if (evaluation.evidence.replay?.issue) {
    issues.push({
      path: "evaluation.replay",
      code: evaluation.evidence.replay.issue.code,
      message: evaluation.evidence.replay.issue.message,
    });
  }
  if (issues.length === 0) {
    issues.push({
      path: "evaluation",
      code: "deterministic_evaluation_failed",
      message:
        "The generated mechanic failed independent deterministic evaluation.",
    });
  }
  return Object.freeze(issues.map((issue) => Object.freeze(issue)));
}

function requireSameGenerationRunIdentity(
  current: GenerationRun,
  replacement: GenerationRun
): void {
  if (current.id !== replacement.id) {
    throw new Error(
      "Generated mechanic persistence lost its exact GenerationRun identity."
    );
  }
}

function retainGeneratedMechanicIdentity(
  generationRun: GenerationRun,
  mechanicId: StableId | undefined
): GenerationRun {
  if (!mechanicId) {
    return generationRun;
  }
  return {
    ...generationRun,
    mechanicIds: Array.from(
      new Set([...(generationRun.mechanicIds ?? []), mechanicId])
    ),
  };
}

function requireRetainedMechanicIdentity(
  finalGameSpec: GeneratedMechanicFinalGameSpec,
  mechanicId: StableId | undefined
): void {
  if (!mechanicId || mechanicId !== finalGameSpec.extension.mechanicId) {
    throw new Error(
      "Generated mechanic handoff lost its exact Final Game Spec mechanic identity."
    );
  }
}

async function persistGeneratedMechanicRejection({
  completedAt,
  evidence,
  generationRunId,
  repository,
  signal,
}: Readonly<{
  completedAt: string;
  evidence: GeneratedMechanicTerminalRejectionEvidence;
  generationRunId: StableId;
  repository: Pick<GenerationRunRepository, "update">;
  signal: AbortSignal;
}>): Promise<ArtifactScopedRepairIssue | undefined> {
  if (
    evidence.issues.some(
      ({ code }) => code === "accepted_artifact_recovery_pending"
    )
  ) {
    return;
  }
  const terminalOutcome = generationRunOutcomeForGeneratedRejection(
    evidence,
    signal
  );
  const generatedMechanicOutcome = jsonValueSchema.parse({
    status: "rejected",
    stage: evidence.stage,
    issues: evidence.issues,
    ...(evidence.runtimeEvidence === undefined
      ? {}
      : { runtimeEvidence: evidence.runtimeEvidence }),
  });
  try {
    await repository.update(generationRunId, (currentGenerationRun) => {
      if (
        hasGeneratedMechanicAcceptanceTransaction(currentGenerationRun) ||
        (currentGenerationRun.status !== "running" &&
          currentGenerationRun.status !== "succeeded")
      ) {
        return currentGenerationRun;
      }
      const generationRunWithoutPendingHandoff =
        clearGeneratedMechanicHandoffReceipt(currentGenerationRun);
      return {
        ...generationRunWithoutPendingHandoff,
        ...terminalOutcome,
        completedAt,
        durationMs: Math.max(
          0,
          Date.parse(completedAt) - Date.parse(currentGenerationRun.startedAt)
        ),
        metadata: {
          ...(generationRunWithoutPendingHandoff.metadata ?? {}),
          generatedMechanicOutcome,
        },
      };
    });
    return undefined;
  } catch {
    return {
      path: "generationRun",
      code: "generation_run_receipt_persistence_failed",
      message:
        "Generated mechanic rejection evidence could not be persisted to its GenerationRun receipt.",
    };
  }
}

function hasGeneratedMechanicAcceptanceTransaction(
  generationRun: GenerationRun
): boolean {
  const transaction =
    generationRun.metadata?.generatedMechanicAcceptanceTransaction;
  return (
    transaction !== null &&
    typeof transaction === "object" &&
    !Array.isArray(transaction) &&
    (transaction.status === "pending" || transaction.status === "finalized")
  );
}

function generationRunOutcomeForGeneratedRejection(
  evidence: GeneratedMechanicTerminalRejectionEvidence,
  signal: AbortSignal
): Pick<GenerationRun, "status" | "stage" | "failureClass"> {
  if (
    signal.aborted &&
    evidence.issues.some(({ code }) => code === "generation_cancelled")
  ) {
    return signal.reason === "timed-out"
      ? { status: "timed-out", stage: "timeout", failureClass: "timeout" }
      : {
          status: "cancelled",
          stage: "cancellation",
          failureClass: "cancellation",
        };
  }

  return {
    status: "failed",
    ...generationRunFailureForGeneratedStage(evidence.stage),
  };
}

function generationRunFailureForGeneratedStage(
  stage: GeneratedMechanicTerminalRejectionEvidence["stage"]
): Pick<GenerationRun, "stage" | "failureClass"> {
  switch (stage) {
    case "runtime_activation":
      return { stage: "runtime-boot", failureClass: "build-failure" };
    case "first_playable":
      return {
        stage: "browser-check",
        failureClass: "first-playable-failure",
      };
    case "foundation":
    case "generation_run":
    case "repair_exhausted":
    case "preflight":
    case "deterministic_evaluation":
    case "persistence":
      return { stage: "artifact-build", failureClass: "build-failure" };
  }
}
