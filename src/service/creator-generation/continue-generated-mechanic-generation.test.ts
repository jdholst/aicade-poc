import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PHASE_9_GENERATION_CONSTRAINT_SET,
  generationRunSchema,
  topDownGameSpecSchema,
  writeGeneratedMechanicHandoffPendingReceipt,
  type GeneratedMechanicResolution,
  type MechanicIntent,
} from "@/game-spec";
import { createGeneratedMechanicProjectFixture } from "@/game-spec/game-pack/testing/generated-mechanic-project-fixtures";
import { createSesWorkerMechanicExecutionRealmAdapter } from "@/runtime/mechanics/ses-worker-mechanic-execution-realm";
import type { BrowserRuntimeFoundation } from "@/service/creator-generation/browser-runtime-foundation";
import type { CreatorGenerationRouting } from "@/service/creator-generation/creator-generation-routing";
import { createGenerationOperationContext } from "@/service/creator-generation/generation-operation-context";
import type { GeneratedMechanicEvaluationResult } from "@/service/mechanic-evaluation";
import {
  completeGeneratedMechanicProjectHandoff,
  type GeneratedMechanicProjectHandoffResult,
} from "@/game-spec/game-pack/generated-mechanic-project-handoff";
import { createGenerationRunTestRepository } from "@/service/generation-run/testing/generation-run-test-harness";
import type { generateMechanicContract } from "@/service/mechanic-contract-generation";
import type { generateBuildAndExecuteMechanicSource } from "@/service/mechanic-source-generation";

import { createContinueGeneratedMechanicGeneration } from "./continue-generated-mechanic-generation";

const CREATED_AT = "2026-08-13T12:00:00.000Z";
const CANDIDATE_AT = "2026-08-13T12:00:08.000Z";
const ACCEPTED_AT = "2026-08-13T12:00:10.000Z";
const GENERATION_RUN_ID = "generation_run_production_composition";

describe("createContinueGeneratedMechanicGeneration", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: {
        request: async (
          _name: string,
          _options: unknown,
          operation: () => Promise<unknown>
        ) => operation(),
      },
    });
  });

  it("stops before providers and durable writes when the live foundation rejects", async () => {
    const fixture = createInputFixture();
    const { repository: generationRunRepository } =
      createGenerationRunTestRepository();
    await generationRunRepository.create(
      generationRunSchema.parse({
        id: GENERATION_RUN_ID,
        operationType: "generate",
        status: "running",
        createdAt: CREATED_AT,
        startedAt: CREATED_AT,
        request: { summary: fixture.input.context.requestSummary },
        runtimeKind: "phaser",
        attempts: [],
      })
    );
    const gamePackRepository = {
      compareAndSwap: vi.fn(),
      load: vi.fn(),
    };
    const createContractProvider = vi.fn();
    const createSourceProvider = vi.fn();
    const completeHandoff = vi.fn();
    const continueGeneration = createContinueGeneratedMechanicGeneration({
      services: {
        generationRunRepository,
        gamePackRepository,
        createFoundation: async () => createFailedFoundation(),
        createContractProvider,
        createSourceProvider,
        completeHandoff,
        now: () => CANDIDATE_AT,
        runPipeline: async ({ dependencies }) => {
          const foundation = await dependencies.runFoundation();
          if (foundation.success) {
            throw new Error("Expected the deliberate foundation rejection.");
          }
          return {
            outcome: "rejected",
            evidence: foundation.evidence,
          };
        },
      },
    });

    await expect(continueGeneration(fixture.input)).resolves.toEqual({
      outcome: "rejected",
      evidence: {
        stage: "foundation",
        issues: [
          {
            path: "foundation.containment",
            code: "foundation_containment_failed",
            message: "The deliberate containment probe failed.",
          },
        ],
      },
    });
    expect(createContractProvider).not.toHaveBeenCalled();
    expect(createSourceProvider).not.toHaveBeenCalled();
    expect(completeHandoff).not.toHaveBeenCalled();
    await expect(
      generationRunRepository.fetch(GENERATION_RUN_ID)
    ).resolves.toMatchObject({
      status: "failed",
      stage: "artifact-build",
      failureClass: "build-failure",
      metadata: {
        generatedMechanicOutcome: {
          status: "rejected",
          stage: "foundation",
          issues: [
            expect.objectContaining({ code: "foundation_containment_failed" }),
          ],
        },
      },
    });
    expect(gamePackRepository.compareAndSwap).not.toHaveBeenCalled();
  });

  it("returns structured foundation evidence when browser foundation setup throws", async () => {
    const fixture = createInputFixture();
    const { repository: generationRunRepository } =
      createGenerationRunTestRepository();
    await generationRunRepository.create(
      generationRunSchema.parse({
        id: GENERATION_RUN_ID,
        operationType: "generate",
        status: "running",
        createdAt: CREATED_AT,
        startedAt: CREATED_AT,
        request: { summary: fixture.input.context.requestSummary },
        runtimeKind: "phaser",
        attempts: [],
      })
    );
    const createContractProvider = vi.fn();
    const completeHandoff = vi.fn();
    const continueGeneration = createContinueGeneratedMechanicGeneration({
      services: {
        generationRunRepository,
        gamePackRepository: {
          compareAndSwap: vi.fn(),
          load: vi.fn(),
        },
        createFoundation: async () => {
          throw new Error("The browser iframe could not initialize.");
        },
        createContractProvider,
        completeHandoff,
        now: () => CANDIDATE_AT,
      },
    });

    await expect(continueGeneration(fixture.input)).resolves.toEqual({
      outcome: "rejected",
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
    });
    expect(createContractProvider).not.toHaveBeenCalled();
    expect(completeHandoff).not.toHaveBeenCalled();
    await expect(
      generationRunRepository.fetch(GENERATION_RUN_ID)
    ).resolves.toMatchObject({
      status: "failed",
      metadata: {
        generatedMechanicOutcome: {
          stage: "foundation",
          issues: [
            expect.objectContaining({ code: "foundation_initialization_failed" }),
          ],
        },
      },
    });
  });

  it("preserves primary rejection evidence when its receipt update throws", async () => {
    const fixture = createInputFixture();
    const runningRun = generationRunSchema.parse({
      id: GENERATION_RUN_ID,
      operationType: "generate",
      status: "running",
      createdAt: CREATED_AT,
      startedAt: CREATED_AT,
      request: { summary: fixture.input.context.requestSummary },
      runtimeKind: "phaser",
      attempts: [],
    });
    const update = vi.fn(async () => {
      throw new Error("IndexedDB update failed");
    });
    const continueGeneration = createContinueGeneratedMechanicGeneration({
      services: {
        generationRunRepository: {
          fetch: async () => runningRun,
          update,
        },
        gamePackRepository: {
          compareAndSwap: vi.fn(),
          load: vi.fn(),
        },
        createFoundation: async () => createFailedFoundation(),
        now: () => CANDIDATE_AT,
      },
    });

    await expect(continueGeneration(fixture.input)).resolves.toEqual({
      outcome: "rejected",
      evidence: {
        stage: "foundation",
        issues: [
          {
            path: "foundation.containment",
            code: "foundation_containment_failed",
            message: "The deliberate containment probe failed.",
          },
          {
            path: "generationRun",
            code: "generation_run_receipt_persistence_failed",
            message:
              "Generated mechanic rejection evidence could not be persisted to its GenerationRun receipt.",
          },
        ],
      },
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("retains exact stage correlation and does not persist an accepted project when handoff rejects", async () => {
    const fixture = createInputFixture();
    const { repository: generationRunRepository } =
      createGenerationRunTestRepository();
    await generationRunRepository.create(
      generationRunSchema.parse({
        id: GENERATION_RUN_ID,
        operationType: "generate",
        status: "running",
        createdAt: CREATED_AT,
        startedAt: CREATED_AT,
        request: { summary: fixture.input.context.requestSummary },
        runtimeKind: "phaser",
        templateId: fixture.baseGameSpec.template.id,
        attempts: [],
      })
    );
    const gamePackRepository = {
      compareAndSwap: vi.fn(),
      load: vi.fn(),
    };
    const contractProvider = vi.fn();
    const sourceProvider = vi.fn();
    const createContractProvider = vi.fn(() => contractProvider);
    const createSourceProvider = vi.fn(() => sourceProvider);
    const generateContract: typeof generateMechanicContract = vi.fn(
      async (input) => {
        expect(input.intent).toBe(fixture.routing.intent);
        expect(input.admittedRequest).toBe(fixture.routing.admittedRequest);
        expect(input.model).toBe("gpt-5.4-mini");
        expect(input.signal).toBe(fixture.input.context.signal);
        return {
          success: true,
          data: {
            contract: fixture.project.dependency.contract,
            grant: fixture.project.dependency.sourceArtifact.grant,
          },
        };
      }
    );
    const generateSource: typeof generateBuildAndExecuteMechanicSource = vi.fn(
      async (input) => {
        expect(input.execution.id).toBe(
          `source_execution_${GENERATION_RUN_ID}_1`
        );
        expect(input.execution.callbackKind).toBe("install");
        expect(input.execution.config).toEqual({
          drift_velocity_x: -200,
          initial_count: 0,
        });
        expect(input.provider).toBe(sourceProvider);
        return {
          success: true,
          data: {
            artifact: fixture.project.dependency.sourceArtifact,
            execution: {
              callbackId:
                fixture.project.dependency.sourceArtifact.callbacks[0]!.id,
              result: {
                executionId: input.execution.id,
                outcome: "completed",
              },
            },
          },
        };
      }
    );
    const evaluation = createPassingEvaluation(fixture);
    const evaluateArtifact = vi.fn(async () => evaluation);
    const now = vi
      .fn<() => string>()
      .mockReturnValueOnce(CANDIDATE_AT)
      .mockReturnValue(ACCEPTED_AT);
    const completeHandoff: typeof completeGeneratedMechanicProjectHandoff =
      vi.fn(async (input) => {
        expect(input.generationRunId).toBe(GENERATION_RUN_ID);
        expect(input.contract).toBe(fixture.project.dependency.contract);
        expect(input.sourceArtifact).toBe(
          fixture.project.dependency.sourceArtifact
        );
        expect(input.deterministicEvaluation).toBe(evaluation);
        expect(input.gamePack.acceptedGeneratedMechanicArtifacts).toBeUndefined();
        expect(input.gamePack.generationRuns).toEqual([
          expect.objectContaining({
            id: GENERATION_RUN_ID,
            status: "running",
            mechanicIds: [`mechanic_${GENERATION_RUN_ID}`],
          }),
        ]);
        expect("createAcceptedAt" in input).toBe(true);
        if (!("createAcceptedAt" in input)) {
          throw new Error("Expected post-first-playable acceptance time factory.");
        }
        expect(input.createAcceptedAt()).toBe(ACCEPTED_AT);
        return rejectedHandoff();
      });
    const continueGeneration = createContinueGeneratedMechanicGeneration({
      services: {
        generationRunRepository,
        gamePackRepository,
        createFoundation: async () => createPassedFoundation(),
        createContractProvider,
        createSourceProvider,
        generateContract,
        generateSource,
        evaluateArtifact,
        completeHandoff,
        now,
      },
    });

    await expect(continueGeneration(fixture.input)).resolves.toEqual(
      rejectedHandoff()
    );
    expect(createContractProvider).toHaveBeenCalledWith({
      attempt: 1,
      generationRunId: GENERATION_RUN_ID,
      kind: "initial",
      providerRequest: {
        openAiApiKey: "browser-key",
        openAiModel: "gpt-5.4-mini",
        prompt: "Add deterministic drift to the probe",
      },
    });
    expect(createSourceProvider).toHaveBeenCalledWith({
      attempt: 1,
      generationRunId: GENERATION_RUN_ID,
      kind: "initial",
      providerRequest: {
        openAiApiKey: "browser-key",
        openAiModel: "gpt-5.4-mini",
        prompt: "Add deterministic drift to the probe",
      },
    });
    expect(evaluateArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        fixtureId: `evaluation_${GENERATION_RUN_ID}_1`,
        contract: fixture.project.dependency.contract,
        artifact: fixture.project.dependency.sourceArtifact,
      })
    );
    const persistedRun = await generationRunRepository.fetch(GENERATION_RUN_ID);
    expect(persistedRun).toMatchObject({
      id: GENERATION_RUN_ID,
      status: "failed",
      stage: "browser-check",
      failureClass: "first-playable-failure",
      mechanicIds: [`mechanic_${GENERATION_RUN_ID}`],
      artifactScopedRepair: {
        status: "succeeded",
        attemptCounts: { contract: 1, source: 1, finalGameSpec: 1 },
      },
      metadata: {
        generatedMechanicOutcome: {
          status: "rejected",
          stage: "first_playable",
          issues: [
            expect.objectContaining({ code: "first_playable_not_passed" }),
          ],
          runtimeEvidence: { status: "failed" },
        },
      },
    });
    expect(gamePackRepository.compareAndSwap).not.toHaveBeenCalled();
  });

  it("cannot overwrite a terminal cancellation with a late repair result", async () => {
    const fixture = createInputFixture();
    const { repository: generationRunRepository } =
      createGenerationRunTestRepository();
    const runningRun = generationRunSchema.parse({
      id: GENERATION_RUN_ID,
      operationType: "generate",
      status: "running",
      createdAt: CREATED_AT,
      startedAt: CREATED_AT,
      request: { summary: fixture.input.context.requestSummary },
      runtimeKind: "phaser",
      attempts: [],
    });
    await generationRunRepository.create(runningRun);
    const runPipeline = vi.fn(async ({ dependencies }) => {
      await generationRunRepository.update(GENERATION_RUN_ID, (current) => ({
        ...current,
        status: "cancelled",
        completedAt: CANDIDATE_AT,
        durationMs: 8_000,
        stage: "cancellation",
        failureClass: "cancellation",
      }));
      const persisted = await dependencies.persistGenerationRun({
        ...runningRun,
        status: "succeeded",
        completedAt: ACCEPTED_AT,
        durationMs: 10_000,
      });
      expect(persisted).toMatchObject({
        status: "cancelled",
        stage: "cancellation",
        failureClass: "cancellation",
      });
      return {
        outcome: "rejected" as const,
        evidence: {
          stage: "cancellation",
          issues: [
            {
              path: "context.signal",
              code: "generation_cancelled",
              message: "The creator cancelled this generation.",
            },
          ],
        },
      };
    });
    const continueGeneration = createContinueGeneratedMechanicGeneration({
      services: {
        generationRunRepository,
        gamePackRepository: {
          compareAndSwap: vi.fn(),
          load: vi.fn(),
        },
        runPipeline,
      },
    });

    await expect(continueGeneration(fixture.input)).resolves.toMatchObject({
      outcome: "rejected",
      evidence: { stage: "cancellation" },
    });
    await expect(
      generationRunRepository.fetch(GENERATION_RUN_ID)
    ).resolves.toMatchObject({
      status: "cancelled",
      stage: "cancellation",
      failureClass: "cancellation",
    });
  });

  it("refuses a non-cancellation repair write after the continuation signal aborts", async () => {
    const fixture = createInputFixture();
    const { repository: generationRunRepository } =
      createGenerationRunTestRepository();
    const runningRun = generationRunSchema.parse({
      id: GENERATION_RUN_ID,
      operationType: "generate",
      status: "running",
      createdAt: CREATED_AT,
      startedAt: CREATED_AT,
      request: { summary: fixture.input.context.requestSummary },
      runtimeKind: "phaser",
      attempts: [],
    });
    await generationRunRepository.create(runningRun);
    const runPipeline = vi.fn(async ({ dependencies }) => {
      fixture.controller.abort("cancelled");
      const persisted = await dependencies.persistGenerationRun({
        ...runningRun,
        status: "succeeded",
        completedAt: ACCEPTED_AT,
        durationMs: 10_000,
      });
      expect(persisted).toEqual(runningRun);
      return {
        outcome: "rejected" as const,
        evidence: {
          stage: "cancellation",
          issues: [
            {
              path: "context.signal",
              code: "generation_cancelled",
              message: "The creator cancelled this generation.",
            },
          ],
        },
      };
    });
    const continueGeneration = createContinueGeneratedMechanicGeneration({
      services: {
        generationRunRepository,
        gamePackRepository: {
          compareAndSwap: vi.fn(),
          load: vi.fn(),
        },
        runPipeline,
      },
    });

    await expect(continueGeneration(fixture.input)).resolves.toMatchObject({
      outcome: "rejected",
      evidence: { stage: "cancellation" },
    });
    await expect(
      generationRunRepository.fetch(GENERATION_RUN_ID)
    ).resolves.toEqual(runningRun);
  });

  it("cannot overwrite a terminal cancellation with a late handoff rejection", async () => {
    const fixture = createInputFixture();
    const { repository: generationRunRepository } =
      createGenerationRunTestRepository();
    const runningRun = generationRunSchema.parse({
      id: GENERATION_RUN_ID,
      operationType: "generate",
      status: "running",
      createdAt: CREATED_AT,
      startedAt: CREATED_AT,
      request: { summary: fixture.input.context.requestSummary },
      runtimeKind: "phaser",
      attempts: [],
    });
    await generationRunRepository.create(runningRun);
    const evaluation = createPassingEvaluation(fixture);
    const completeHandoff: typeof completeGeneratedMechanicProjectHandoff =
      vi.fn(async () => {
        await generationRunRepository.update(GENERATION_RUN_ID, (current) => ({
          ...current,
          status: "cancelled",
          completedAt: CANDIDATE_AT,
          durationMs: 8_000,
          stage: "cancellation",
          failureClass: "cancellation",
        }));
        return rejectedHandoff();
      });
    const runPipeline = vi.fn(async ({ dependencies }) => {
      const foundation = createPassedFoundation();
      const finalGameSpec = await dependencies.runFinalGameSpec({
        attemptNumber: 1,
        kind: "initial",
        foundation,
        contract: {
          contract: fixture.project.dependency.contract,
          grant: fixture.project.dependency.sourceArtifact.grant,
          config: fixture.project.artifact.config,
        },
        source: fixture.project.dependency.sourceArtifact,
        evaluation,
      });
      if (!finalGameSpec.success) {
        throw new Error("Expected the deterministic Final Game Spec fixture.");
      }
      return dependencies.runHandoff({
        foundation,
        contract: {
          contract: fixture.project.dependency.contract,
          grant: fixture.project.dependency.sourceArtifact.grant,
          config: fixture.project.artifact.config,
        },
        source: fixture.project.dependency.sourceArtifact,
        evaluation,
        finalGameSpec: finalGameSpec.data.value,
        generationRun: runningRun,
        repair: {
          status: "succeeded",
          generationRun: runningRun,
          receipt: fixture.project.gamePack.generationRuns[0]!
            .artifactScopedRepair!,
          artifacts: {
            contract: {
              id: fixture.project.dependency.contract.id,
              value: fixture.project.dependency.contract,
            },
            source: {
              id: fixture.project.dependency.sourceArtifact.id,
              value: fixture.project.dependency.sourceArtifact,
            },
            finalGameSpec: {
              id: finalGameSpec.data.id,
              value: finalGameSpec.data.value,
            },
          },
        },
      });
    });
    const continueGeneration = createContinueGeneratedMechanicGeneration({
      services: {
        generationRunRepository,
        gamePackRepository: {
          compareAndSwap: vi.fn(),
          load: vi.fn(),
        },
        completeHandoff,
        runPipeline,
      },
    });

    await expect(continueGeneration(fixture.input)).resolves.toMatchObject({
      outcome: "rejected",
      evidence: { stage: "first_playable" },
    });
    await expect(
      generationRunRepository.fetch(GENERATION_RUN_ID)
    ).resolves.toMatchObject({
      status: "cancelled",
      stage: "cancellation",
      failureClass: "cancellation",
    });
  });

  it("terminalizes an unexpected handoff exception after repair succeeds", async () => {
    const fixture = createInputFixture();
    const { repository: generationRunRepository } =
      createGenerationRunTestRepository();
    const fixtureGenerationRun =
      fixture.project.gamePack.generationRuns[0]!;
    const succeededRun = writeGeneratedMechanicHandoffPendingReceipt(
      generationRunSchema.parse({
      ...fixtureGenerationRun,
      id: GENERATION_RUN_ID,
      request: { summary: fixture.input.context.requestSummary },
      mechanicIds: [`mechanic_${GENERATION_RUN_ID}`],
      artifactScopedRepair: {
        ...fixtureGenerationRun.artifactScopedRepair!,
        generationRunId: GENERATION_RUN_ID,
      },
      relationships: undefined,
      }),
      {
        intentArtifactId: fixture.input.routing.intent.id,
        contractArtifactId: fixture.project.dependency.contract.id,
        sourceArtifactId: fixture.project.dependency.sourceArtifact.id,
        finalGameSpecArtifactId: fixture.project.artifact.finalGameSpec.id,
      }
    );
    await generationRunRepository.create(succeededRun);
    const evaluation = createPassingEvaluation(fixture);
    const completeHandoff = vi.fn(async () => {
      throw new Error("The handoff repository became unavailable.");
    });
    const runPipeline = vi.fn(async ({ dependencies }) => {
      const foundation = createPassedFoundation();
      const finalGameSpec = await dependencies.runFinalGameSpec({
        attemptNumber: 1,
        kind: "initial",
        foundation,
        contract: {
          contract: fixture.project.dependency.contract,
          grant: fixture.project.dependency.sourceArtifact.grant,
          config: fixture.project.artifact.config,
        },
        source: fixture.project.dependency.sourceArtifact,
        evaluation,
      });
      if (!finalGameSpec.success) {
        throw new Error("Expected the deterministic Final Game Spec fixture.");
      }
      return dependencies.runHandoff({
        foundation,
        contract: {
          contract: fixture.project.dependency.contract,
          grant: fixture.project.dependency.sourceArtifact.grant,
          config: fixture.project.artifact.config,
        },
        source: fixture.project.dependency.sourceArtifact,
        evaluation,
        finalGameSpec: finalGameSpec.data.value,
        generationRun: succeededRun,
        repair: {
          status: "succeeded",
          generationRun: succeededRun,
          receipt: succeededRun.artifactScopedRepair!,
          artifacts: {
            contract: {
              id: fixture.project.dependency.contract.id,
              value: fixture.project.dependency.contract,
            },
            source: {
              id: fixture.project.dependency.sourceArtifact.id,
              value: fixture.project.dependency.sourceArtifact,
            },
            finalGameSpec: {
              id: finalGameSpec.data.id,
              value: finalGameSpec.data.value,
            },
          },
        },
      });
    });
    const continueGeneration = createContinueGeneratedMechanicGeneration({
      services: {
        generationRunRepository,
        gamePackRepository: {
          compareAndSwap: vi.fn(),
          load: vi.fn(),
        },
        completeHandoff,
        runPipeline,
        now: () => ACCEPTED_AT,
      },
    });

    await expect(continueGeneration(fixture.input)).resolves.toEqual({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [
          {
            path: "handoff",
            code: "generated_mechanic_handoff_failed",
            message:
              "Generated mechanic creation could not complete its accepted-project handoff.",
          },
        ],
      },
    });
    expect(completeHandoff).toHaveBeenCalledTimes(1);
    await expect(
      generationRunRepository.fetch(GENERATION_RUN_ID)
    ).resolves.toMatchObject({
      status: "failed",
      stage: "artifact-build",
      failureClass: "build-failure",
      metadata: {
        generatedMechanicOutcome: {
          status: "rejected",
          stage: "persistence",
          issues: [
            expect.objectContaining({
              code: "generated_mechanic_handoff_failed",
            }),
          ],
        },
      },
    });
    const rejectedGenerationRun = await generationRunRepository.fetch(
      GENERATION_RUN_ID
    );
    expect(rejectedGenerationRun?.metadata).not.toHaveProperty(
      "generatedMechanicHandoff"
    );
  });

  it("does not downgrade a succeeded run whose acceptance recovery remains pending", async () => {
    const fixture = createInputFixture();
    const { repository: generationRunRepository } =
      createGenerationRunTestRepository();
    const succeededRun = generationRunSchema.parse({
      id: GENERATION_RUN_ID,
      operationType: "generate",
      status: "succeeded",
      createdAt: CREATED_AT,
      startedAt: CREATED_AT,
      completedAt: ACCEPTED_AT,
      durationMs: 10_000,
      request: { summary: fixture.input.context.requestSummary },
      runtimeKind: "phaser",
      attempts: [],
      metadata: {
        generatedMechanicAcceptanceTransaction: {
          schemaVersion: "generated_mechanic_acceptance_transaction/v1",
          status: "pending",
          transactionId: "acceptance_recovery_pending",
          generationRunId: GENERATION_RUN_ID,
          artifactId: fixture.project.artifact.id,
          buildId: fixture.project.artifact.buildId,
          checkpointId: fixture.project.artifact.checkpointId,
        },
      },
    });
    await generationRunRepository.create(succeededRun);
    const evaluation = createPassingEvaluation(fixture);
    const completeHandoff: typeof completeGeneratedMechanicProjectHandoff =
      vi.fn(async () => recoveryPendingHandoff());
    const runPipeline = vi.fn(async ({ dependencies }) => {
      const foundation = createPassedFoundation();
      const finalGameSpec = await dependencies.runFinalGameSpec({
        attemptNumber: 1,
        kind: "initial",
        foundation,
        contract: {
          contract: fixture.project.dependency.contract,
          grant: fixture.project.dependency.sourceArtifact.grant,
          config: fixture.project.artifact.config,
        },
        source: fixture.project.dependency.sourceArtifact,
        evaluation,
      });
      if (!finalGameSpec.success) {
        throw new Error("Expected the deterministic Final Game Spec fixture.");
      }
      return dependencies.runHandoff({
        foundation,
        contract: {
          contract: fixture.project.dependency.contract,
          grant: fixture.project.dependency.sourceArtifact.grant,
          config: fixture.project.artifact.config,
        },
        source: fixture.project.dependency.sourceArtifact,
        evaluation,
        finalGameSpec: finalGameSpec.data.value,
        generationRun: succeededRun,
        repair: {
          status: "succeeded",
          generationRun: succeededRun,
          receipt: fixture.project.gamePack.generationRuns[0]!
            .artifactScopedRepair!,
          artifacts: {
            contract: {
              id: fixture.project.dependency.contract.id,
              value: fixture.project.dependency.contract,
            },
            source: {
              id: fixture.project.dependency.sourceArtifact.id,
              value: fixture.project.dependency.sourceArtifact,
            },
            finalGameSpec: {
              id: finalGameSpec.data.id,
              value: finalGameSpec.data.value,
            },
          },
        },
      });
    });
    const continueGeneration = createContinueGeneratedMechanicGeneration({
      services: {
        generationRunRepository,
        gamePackRepository: {
          compareAndSwap: vi.fn(),
          load: vi.fn(),
        },
        completeHandoff,
        runPipeline,
      },
    });

    await expect(continueGeneration(fixture.input)).resolves.toEqual(
      recoveryPendingHandoff()
    );
    await expect(
      generationRunRepository.fetch(GENERATION_RUN_ID)
    ).resolves.toEqual(succeededRun);
  });
});

function createInputFixture() {
  const projectFixture = createGeneratedMechanicProjectFixture();
  const baseGameSpec = topDownGameSpecSchema.parse({
    ...projectFixture.gamePack.gameSpec,
    id: "game_production_composition_base",
    mechanics: projectFixture.gamePack.gameSpec.mechanics.filter(
      ({ id }) => id !== projectFixture.artifact.mechanicId
    ),
    mechanicConnections: {
      schemaVersion: "mechanic_port_connections/v1",
      connections: [],
    },
  });
  const routedEntityId =
    projectFixture.dependency.contract.bindings[0]!.objectIds[0]!;
  const routedActorRole = baseGameSpec.entities.find(
    ({ id }) => id === routedEntityId
  )!.role;
  const intent: MechanicIntent = {
    id: projectFixture.dependency.contract.intentId,
    summary: "Add deterministic drift to the bound probe.",
    triggers: ["install", "logical_action"],
    actors: [routedActorRole],
    targets: [],
    behaviors: ["drift"],
    ownedObjects: [],
    stateChanges: ["drift_initialized"],
    temporalRules: [],
    spatialRules: [],
    constraints: [],
    configuration: [],
    connections: [{ direction: "input", port: "move" }],
    references: [
      {
        kind: "entity",
        id: routedEntityId,
      },
    ],
    outcomes: ["probe_moves"],
    requiredCapabilities: [
      ...projectFixture.dependency.contract.capabilities,
    ],
    ambiguities: [],
  };
  const contract = {
    ...projectFixture.dependency.contract,
    intentLineage: {
      actors: [...intent.actors],
      targets: [...intent.targets],
      behaviors: [...intent.behaviors],
      stateChanges: [...intent.stateChanges],
      temporalRules: [...intent.temporalRules],
      spatialRules: [...intent.spatialRules],
      constraints: [...intent.constraints],
      connections: [...intent.connections],
      references: [...intent.references],
    },
  };
  const project = {
    ...projectFixture,
    dependency: {
      ...projectFixture.dependency,
      contract,
    },
  };
  const resolution: GeneratedMechanicResolution = {
    kind: "generated_mechanic",
    intentId: intent.id,
    candidateBuiltInTypes: [],
    assumptions: [],
    coverage: {
      coveredRequirements: [],
      uncoveredRequirements: [
        { category: "behavior", value: "drift", coveredBy: [] },
      ],
    },
  };
  const routing: Extract<
    CreatorGenerationRouting,
    { kind: "generated_mechanic" }
  > = {
    kind: "generated_mechanic",
    generationRunId: GENERATION_RUN_ID,
    intent,
    admittedRequest: {
      resolution,
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    },
  };
  const controller = new AbortController();
  const signal = controller.signal;
  const context = createGenerationOperationContext({
    acceptedLineage: [],
    cancellationEpoch: 0,
    generationRunId: GENERATION_RUN_ID,
    requestSummary: "Add deterministic drift to the probe",
    routeKind: "generated_mechanic",
    runtimeKind: "phaser",
    signal,
    trustMode: "browser_authenticated",
  });
  const plan = {
    metadata: {
      attemptCount: 1,
      model: "gpt-5.4-mini" as const,
      taskRoute: "creator_generation_planning.primary" as const,
      generationRunId: GENERATION_RUN_ID,
    },
    routing,
    runtimeKind: "phaser" as const,
    spec: baseGameSpec,
  };
  return {
    baseGameSpec,
    controller,
    project,
    routing,
    input: {
      context,
      plan,
      request: {
        openAiApiKey: "browser-key",
        openAiModel: "gpt-5.4-mini",
        prompt: "Add deterministic drift to the probe",
      },
      routing,
    },
  };
}

function createFailedFoundation(): BrowserRuntimeFoundation {
  return {
    gateResult: {
      schemaVersion: "runtime_contract_foundation_gate/v1",
      status: "failed",
      sourceGenerationAvailable: false,
      checks: [
        {
          boundary: "containment",
          status: "failed",
          code: "foundation_containment_failed",
          message: "The deliberate containment probe failed.",
        },
      ],
      terminalResult: {
        code: "runtime_contract_foundation_gate_failed",
        failedBoundary: "containment",
      },
    },
    realmAdapter: createSesWorkerMechanicExecutionRealmAdapter(),
  };
}

function createPassedFoundation(): BrowserRuntimeFoundation {
  return {
    gateResult: {
      schemaVersion: "runtime_contract_foundation_gate/v1",
      status: "passed",
      sourceGenerationAvailable: true,
      checks: [],
      evidence: Object.freeze({}) as BrowserRuntimeFoundation["gateResult"] extends {
        status: "passed";
        evidence: infer Evidence;
      }
        ? Evidence
        : never,
      terminalResult: { code: "runtime_contract_foundation_gate_passed" },
    },
    realmAdapter: createSesWorkerMechanicExecutionRealmAdapter(),
  };
}

function createPassingEvaluation(
  fixture: ReturnType<typeof createInputFixture>
): GeneratedMechanicEvaluationResult {
  return {
    outcome: "passed",
    evidence: {
      schemaVersion: "generated_mechanic_evaluation/v1",
      fixtureId: `evaluation_${GENERATION_RUN_ID}_1`,
      contractId: fixture.project.dependency.contract.id,
      sourceArtifactId: fixture.project.dependency.sourceArtifact.id,
      scenarios: [],
      issues: [],
      replay: { matched: true, replayScenarios: [] },
    },
  };
}

function rejectedHandoff(): Extract<
  GeneratedMechanicProjectHandoffResult,
  { outcome: "rejected" }
> {
  return {
    outcome: "rejected",
    evidence: {
      stage: "first_playable",
      issues: [
        {
          path: "firstPlayable",
          code: "first_playable_not_passed",
          message: "The real browser check rejected the candidate.",
        },
      ],
      runtimeEvidence: { status: "failed" },
    },
  };
}

function recoveryPendingHandoff(): Extract<
  GeneratedMechanicProjectHandoffResult,
  { outcome: "rejected" }
> {
  return {
    outcome: "rejected",
    evidence: {
      stage: "persistence",
      issues: [
        {
          path: "persistence",
          code: "accepted_artifact_recovery_pending",
          message:
            "The finalized canonical acceptance is waiting for external lineage recovery.",
        },
      ],
    },
  };
}
