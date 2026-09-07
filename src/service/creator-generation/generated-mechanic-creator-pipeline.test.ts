import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PHASE_9_GENERATION_CONSTRAINT_SET,
  type GenerationRun,
} from "@/game-spec";

import {
  runGeneratedMechanicCreatorPipeline,
} from "./generated-mechanic-creator-pipeline";
import { createGenerationOperationContext } from "./generation-operation-context";

describe("runGeneratedMechanicCreatorPipeline", () => {
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

  it("runs foundation, contract, source/evaluation, final spec, persistence, and handoff in order", async () => {
    const events: string[] = [];
    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: {
        request: async (
          _name: string,
          _options: unknown,
          operation: () => Promise<unknown>
        ) => {
          events.push("acceptance_lock:enter");
          try {
            return await operation();
          } finally {
            events.push("acceptance_lock:exit");
          }
        },
      },
    });
    const generationRun = createRunningGenerationRun();
    const accepted = { gamePackId: "game_pack_pipeline" };
    const dependencies = {
      loadGenerationRun: vi.fn(async () => generationRun),
      persistGenerationRun: vi.fn(async (run: GenerationRun) => {
        events.push("persist_repair_lineage");
        return run;
      }),
      runFoundation: vi.fn(async () => {
        events.push("foundation");
        return { success: true as const, data: { id: "foundation_live" } };
      }),
      runContract: vi.fn(async ({ attemptNumber }) => {
        events.push(`contract:${attemptNumber}`);
        return {
          success: true as const,
          data: { id: "contract_pipeline", value: { id: "contract_live" } },
        };
      }),
      runSourceAndEvaluation: vi.fn(async ({ contract, attemptNumber }) => {
        events.push(`source:${attemptNumber}`);
        expect(contract).toEqual({ id: "contract_live" });
        events.push(`evaluation:${attemptNumber}`);
        return {
          success: true as const,
          data: {
            id: "source_pipeline",
            source: { id: "source_live" },
            evaluation: { id: "evaluation_live" },
          },
        };
      }),
      runFinalGameSpec: vi.fn(
        async ({ contract, source, evaluation, attemptNumber }) => {
          events.push(`final_game_spec:${attemptNumber}`);
          expect({ contract, source, evaluation }).toEqual({
            contract: { id: "contract_live" },
            source: { id: "source_live" },
            evaluation: { id: "evaluation_live" },
          });
          return {
            success: true as const,
            data: {
              id: "final_game_spec_pipeline",
              value: { id: "final_game_spec_live" },
            },
          };
        }
      ),
      runHandoff: vi.fn(async (input) => {
        events.push("handoff");
        expect(input).toMatchObject({
          acceptanceLockReceipt: {
            schemaVersion:
              "generated_mechanic_acceptance_lock_receipt/v1",
          },
          foundation: { id: "foundation_live" },
          contract: { id: "contract_live" },
          source: { id: "source_live" },
          evaluation: { id: "evaluation_live" },
          finalGameSpec: { id: "final_game_spec_live" },
          generationRun: {
            status: "succeeded",
            metadata: {
              generatedMechanicHandoff: {
                schemaVersion: "generated_mechanic_handoff/v1",
                status: "pending",
                generationRunId: "generation_run_pipeline",
                intentArtifactId: "intent_pipeline",
                contractArtifactId: "contract_pipeline",
                sourceArtifactId: "source_pipeline",
                finalGameSpecArtifactId: "final_game_spec_pipeline",
              },
            },
          },
        });
        return { outcome: "accepted" as const, value: accepted };
      }),
    };

    await expect(
      runGeneratedMechanicCreatorPipeline({
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
        context: createContext(),
        dependencies,
        intentArtifactId: "intent_pipeline",
      })
    ).resolves.toEqual({ outcome: "accepted", value: accepted });
    expect(events).toEqual([
      "foundation",
      "contract:1",
      "source:1",
      "evaluation:1",
      "final_game_spec:1",
      "acceptance_lock:enter",
      "persist_repair_lineage",
      "handoff",
      "acceptance_lock:exit",
    ]);
  });

  it("repairs only the rejected source and then runs its dependent stages", async () => {
    const events: string[] = [];
    const generationRun = createRunningGenerationRun();
    let sourceAttempt = 0;

    const result = await runGeneratedMechanicCreatorPipeline({
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      context: createContext(),
      dependencies: {
        loadGenerationRun: async () => generationRun,
        persistGenerationRun: async (run) => run,
        runFoundation: async () => ({
          success: true,
          data: { id: "foundation_live" },
        }),
        runContract: async () => {
          events.push("contract");
          return {
            success: true,
            data: { id: "contract_pipeline", value: { id: "contract_live" } },
          };
        },
        runSourceAndEvaluation: async ({ attemptNumber, kind, repair }) => {
          events.push(`source:${attemptNumber}`);
          sourceAttempt += 1;
          if (sourceAttempt === 1) {
            expect({ kind, repair }).toEqual({
              kind: "initial",
              repair: undefined,
            });
          } else {
            expect({ kind, repair }).toEqual({
              kind: "repair",
              repair: {
                trigger: "stage_failure",
                failureAttemptId: "generation_run_pipeline_source_1",
                invalidatedArtifactIds: [],
                issues: [
                  {
                    path: "evaluation.scenarios.scenario_one",
                    code: "deterministic_evaluation_failed",
                    message:
                      "The first source failed observable evaluation.",
                  },
                ],
              },
            });
          }
          return sourceAttempt === 1
            ? {
                success: false,
                evidence: {
                  responsibleStage: "source" as const,
                  issues: [
                    {
                      path: "evaluation.scenarios.scenario_one",
                      code: "deterministic_evaluation_failed",
                      message: "The first source failed observable evaluation.",
                    },
                  ],
                  artifact: {
                    id: "source_rejected",
                    value: { id: "source_rejected" },
                  },
                },
              }
            : {
                success: true,
                data: {
                  id: "source_repaired",
                  source: { id: "source_live" },
                  evaluation: { id: "evaluation_live" },
                },
              };
        },
        runFinalGameSpec: async () => {
          events.push("final");
          return {
            success: true,
            data: {
              id: "final_pipeline",
              value: { id: "final_live" },
            },
          };
        },
        runHandoff: async ({ repair }) => {
          events.push("handoff");
          expect(repair.receipt.attemptCounts.source).toBe(2);
          expect(repair.receipt.artifacts).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                artifactId: "source_rejected",
                status: "rejected",
              }),
              expect.objectContaining({
                artifactId: "source_repaired",
                status: "accepted",
              }),
            ])
          );
          return { outcome: "accepted", value: { id: "accepted" } };
        },
      },
      intentArtifactId: "intent_pipeline",
    });

    expect(result).toEqual({ outcome: "accepted", value: { id: "accepted" } });
    expect(events).toEqual([
      "contract",
      "source:1",
      "source:2",
      "final",
      "handoff",
    ]);
  });

  it("stops before artifacts and handoff when the browser foundation fails", async () => {
    const persistGenerationRun = vi.fn();
    const runContract = vi.fn();
    const runHandoff = vi.fn();

    await expect(
      runGeneratedMechanicCreatorPipeline({
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
        context: createContext(),
        dependencies: {
          loadGenerationRun: async () => createRunningGenerationRun(),
          persistGenerationRun,
          runFoundation: async () => ({
            success: false,
            evidence: {
              stage: "foundation" as const,
              issues: [
                {
                  path: "realmConformance",
                  code: "foundation_gate_failed",
                  message: "The browser realm did not pass conformance.",
                },
              ],
            },
          }),
          runContract,
          runSourceAndEvaluation: vi.fn(),
          runFinalGameSpec: vi.fn(),
          runHandoff,
        },
        intentArtifactId: "intent_pipeline",
      })
    ).resolves.toEqual({
      outcome: "rejected",
      evidence: {
        stage: "foundation",
        issues: [
          {
            path: "realmConformance",
            code: "foundation_gate_failed",
            message: "The browser realm did not pass conformance.",
          },
        ],
      },
    });
    expect(runContract).not.toHaveBeenCalled();
    expect(persistGenerationRun).not.toHaveBeenCalled();
    expect(runHandoff).not.toHaveBeenCalled();
  });

  it("returns structured receipt evidence when the exact running GenerationRun is unavailable", async () => {
    const runFoundation = vi.fn();
    const persistGenerationRun = vi.fn();
    const runHandoff = vi.fn();

    await expect(
      runGeneratedMechanicCreatorPipeline({
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
        context: createContext(),
        dependencies: {
          loadGenerationRun: async () => null,
          persistGenerationRun,
          runFoundation,
          runContract: vi.fn(),
          runSourceAndEvaluation: vi.fn(),
          runFinalGameSpec: vi.fn(),
          runHandoff,
        },
        intentArtifactId: "intent_pipeline",
      })
    ).resolves.toEqual({
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
    });
    expect(runFoundation).not.toHaveBeenCalled();
    expect(persistGenerationRun).not.toHaveBeenCalled();
    expect(runHandoff).not.toHaveBeenCalled();
  });

  it("returns structured receipt evidence when loading the GenerationRun throws", async () => {
    const runFoundation = vi.fn();
    const runHandoff = vi.fn();

    await expect(
      runGeneratedMechanicCreatorPipeline({
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
        context: createContext(),
        dependencies: {
          loadGenerationRun: async () => {
            throw new Error("IndexedDB read failed");
          },
          persistGenerationRun: vi.fn(),
          runFoundation,
          runContract: vi.fn(),
          runSourceAndEvaluation: vi.fn(),
          runFinalGameSpec: vi.fn(),
          runHandoff,
        },
        intentArtifactId: "intent_pipeline",
      })
    ).resolves.toEqual({
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
    });
    expect(runFoundation).not.toHaveBeenCalled();
    expect(runHandoff).not.toHaveBeenCalled();
  });

  it("returns structured receipt evidence when repair lineage persistence throws", async () => {
    const runHandoff = vi.fn();

    await expect(
      runGeneratedMechanicCreatorPipeline({
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
        context: createContext(),
        dependencies: {
          loadGenerationRun: async () => createRunningGenerationRun(),
          persistGenerationRun: async () => {
            throw new Error("IndexedDB write failed");
          },
          runFoundation: async () => ({
            success: true,
            data: { id: "foundation_live" },
          }),
          runContract: async () => ({
            success: true,
            data: { id: "contract_pipeline", value: { id: "contract_live" } },
          }),
          runSourceAndEvaluation: async () => ({
            success: true,
            data: {
              id: "source_pipeline",
              source: { id: "source_live" },
              evaluation: { id: "evaluation_live" },
            },
          }),
          runFinalGameSpec: async () => ({
            success: true,
            data: {
              id: "final_game_spec_pipeline",
              value: { id: "final_game_spec_live" },
            },
          }),
          runHandoff,
        },
        intentArtifactId: "intent_pipeline",
      })
    ).resolves.toEqual({
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
    });
    expect(runHandoff).not.toHaveBeenCalled();
  });

  it("continues after a write-then-throw when the exact repair receipt is durable", async () => {
    let durableGenerationRun = createRunningGenerationRun();
    const accepted = { gamePackId: "game_pack_confirmed_after_throw" };
    const runHandoff = vi.fn(async () => ({
      outcome: "accepted" as const,
      value: accepted,
    }));

    await expect(
      runGeneratedMechanicCreatorPipeline({
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
        context: createContext(),
        dependencies: {
          loadGenerationRun: async () => durableGenerationRun,
          persistGenerationRun: async (generationRun) => {
            durableGenerationRun = generationRun;
            throw new Error("IndexedDB committed before the driver failed");
          },
          runFoundation: async () => ({
            success: true,
            data: { id: "foundation_live" },
          }),
          runContract: async () => ({
            success: true,
            data: { id: "contract_pipeline", value: { id: "contract_live" } },
          }),
          runSourceAndEvaluation: async () => ({
            success: true,
            data: {
              id: "source_pipeline",
              source: { id: "source_live" },
              evaluation: { id: "evaluation_live" },
            },
          }),
          runFinalGameSpec: async () => ({
            success: true,
            data: {
              id: "final_game_spec_pipeline",
              value: { id: "final_game_spec_live" },
            },
          }),
          runHandoff,
        },
        intentArtifactId: "intent_pipeline",
      })
    ).resolves.toEqual({ outcome: "accepted", value: accepted });
    expect(runHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        generationRun: expect.objectContaining({ status: "succeeded" }),
      })
    );
  });
});

function createContext() {
  return createGenerationOperationContext({
    acceptedLineage: [],
    cancellationEpoch: 0,
    generationRunId: "generation_run_pipeline",
    requestSummary: "Generate a new mechanic",
    routeKind: "generated_mechanic",
    runtimeKind: "phaser",
    signal: new AbortController().signal,
    trustMode: "browser_authenticated",
  });
}

function createRunningGenerationRun(): GenerationRun {
  return {
    id: "generation_run_pipeline",
    operationType: "generate",
    status: "running",
    createdAt: "2026-08-13T12:00:00.000Z",
    startedAt: "2026-08-13T12:00:00.000Z",
    request: { summary: "Generate a new mechanic" },
    runtimeKind: "phaser",
    attempts: [],
  };
}
