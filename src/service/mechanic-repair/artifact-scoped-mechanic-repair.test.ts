import { describe, expect, it, vi } from "vitest";

import {
  artifactScopedRepairArtifactIdSchema,
  createGenerationRunRepository,
  createGenerationRunJsonExport,
  generationRunSchema,
  PHASE_9_GENERATION_CONSTRAINT_SET,
  type GenerationRun,
  type StoredGenerationRunRecord,
} from "@/game-spec";

import {
  runArtifactScopedMechanicRepair,
  type ArtifactScopedRepairIssue,
  type ArtifactScopedRepairStageInput,
} from "./artifact-scoped-mechanic-repair";

const sourceIssue: ArtifactScopedRepairIssue = {
  path: "callbacks.install",
  code: "type_failure",
  message: "The install callback returned the wrong value.",
};

describe("runArtifactScopedMechanicRepair", () => {
  it("retains a no-repair success in the same GenerationRun", async () => {
    const result = await runArtifactScopedMechanicRepair({
      generationRun: createRunningGenerationRun(
        "generation_run_no_repair_needed"
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      completedAt: () => "2026-08-11T15:00:05.000Z",
      stageRunners: {
        contract: async () => acceptedArtifact("contract_v1"),
        source: async () => acceptedArtifact("source_v1"),
        finalGameSpec: async () => acceptedArtifact("final_game_spec_v1"),
      },
    });

    expect(result).toMatchObject({
      status: "succeeded",
      receipt: {
        status: "succeeded",
        repairStatus: "not_needed",
      },
      generationRun: {
        id: "generation_run_no_repair_needed",
        status: "succeeded",
        repairStatus: "not-needed",
        artifactScopedRepair: {
          repairStatus: "not_needed",
        },
      },
    });
  });

  it("repairs only the responsible source artifact while keeping the accepted contract locked", async () => {
    const contractInputs: ArtifactScopedRepairStageInput[] = [];
    const sourceInputs: ArtifactScopedRepairStageInput[] = [];
    const finalGameSpecInputs: ArtifactScopedRepairStageInput[] = [];
    const contract = vi.fn(async (input: ArtifactScopedRepairStageInput) => {
      contractInputs.push(input);
      return acceptedArtifact("contract_v1");
    });
    const source = vi.fn(async (input: ArtifactScopedRepairStageInput) => {
      sourceInputs.push(input);
      return input.attemptNumber === 1
        ? {
            success: false as const,
            evidence: {
              responsibleStage: "source" as const,
              issues: [sourceIssue],
            },
          }
        : acceptedArtifact("source_v2");
    });
    const finalGameSpec = vi.fn(
      async (input: ArtifactScopedRepairStageInput) => {
        finalGameSpecInputs.push(input);
        return acceptedArtifact("final_game_spec_v1");
      }
    );

    const result = await runArtifactScopedMechanicRepair({
      generationRun: createRunningGenerationRun(
        "generation_run_source_repair"
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      completedAt: () => "2026-08-11T15:01:00.000Z",
      stageRunners: { contract, source, finalGameSpec },
    });

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") {
      throw new Error("Expected the source repair to succeed.");
    }

    expect(contractInputs).toHaveLength(1);
    expect(sourceInputs).toHaveLength(2);
    expect(finalGameSpecInputs).toHaveLength(1);
    expect(sourceInputs[1]).toMatchObject({
      stage: "source",
      attemptNumber: 2,
      kind: "repair",
      upstreamArtifacts: {
        contract: { id: "contract_v1" },
      },
      repair: {
        trigger: "stage_failure",
        failureAttemptId: "generation_run_source_repair_source_1",
        issues: [sourceIssue],
        invalidatedArtifactIds: [],
      },
    });
    expect(finalGameSpecInputs[0]).toMatchObject({
      upstreamArtifacts: {
        contract: { id: "contract_v1" },
        source: { id: "source_v2" },
      },
    });
    expect(result.artifacts).toMatchObject({
      contract: { id: "contract_v1" },
      source: { id: "source_v2" },
      finalGameSpec: { id: "final_game_spec_v1" },
    });
    expect(result.receipt).toMatchObject({
      schemaVersion: "artifact_scoped_mechanic_repair/v1",
      generationRunId: "generation_run_source_repair",
      status: "succeeded",
      repairStatus: "repaired",
      attemptCounts: {
        contract: 1,
        source: 2,
        finalGameSpec: 1,
      },
    });
    expect(generationRunSchema.parse(result.generationRun)).toEqual(
      result.generationRun
    );
    expect(result.generationRun).toMatchObject({
      id: "generation_run_source_repair",
      status: "succeeded",
      repairStatus: "repaired",
      completedAt: "2026-08-11T15:01:00.000Z",
      artifactScopedRepair: result.receipt,
    });
    expect(
      createGenerationRunJsonExport([result.generationRun], {
        exportedAt: "2026-08-11T15:02:00.000Z",
      }).runs[0]
    ).toMatchObject({
      id: "generation_run_source_repair",
      artifactScopedRepair: result.receipt,
    });
    let storedRecord: StoredGenerationRunRecord | undefined;
    const repository = createGenerationRunRepository({
      put: async (record) => {
        storedRecord = structuredClone(record);
      },
      get: async (generationRunId) =>
        storedRecord?.id === generationRunId
          ? structuredClone(storedRecord)
          : null,
      getAll: async () => (storedRecord ? [structuredClone(storedRecord)] : []),
      delete: async () => {
        storedRecord = undefined;
      },
      clear: async () => {
        storedRecord = undefined;
      },
    });
    await repository.create(result.generationRun);
    expect(
      (await repository.fetch(result.generationRun.id))?.artifactScopedRepair
    ).toEqual(result.receipt);
    expect(
      result.receipt.attempts.find(
        (attempt) =>
          attempt.stage === "source" && attempt.attemptNumber === 2
      )
    ).toMatchObject({
      repair: {
        trigger: "stage_failure",
        failureAttemptId: "generation_run_source_repair_source_1",
        issues: [sourceIssue],
        invalidatedArtifactIds: [],
      },
    });
  });

  it("invalidates every downstream artifact when later evidence repairs the contract", async () => {
    const contractInputs: ArtifactScopedRepairStageInput[] = [];
    const sourceInputs: ArtifactScopedRepairStageInput[] = [];
    const finalGameSpecInputs: ArtifactScopedRepairStageInput[] = [];
    const contract = vi.fn(async (input: ArtifactScopedRepairStageInput) => {
      contractInputs.push(input);
      return acceptedArtifact(`contract_v${input.attemptNumber}`);
    });
    const source = vi.fn(async (input: ArtifactScopedRepairStageInput) => {
      sourceInputs.push(input);
      return acceptedArtifact(`source_v${input.attemptNumber}`);
    });
    const contractIssue: ArtifactScopedRepairIssue = {
      path: "behavior.outcomes.0",
      code: "missing_observable_outcome",
      message: "Evaluation proved that the accepted contract omitted an outcome.",
    };
    const finalGameSpec = vi.fn(
      async (input: ArtifactScopedRepairStageInput) => {
        finalGameSpecInputs.push(input);
        return input.attemptNumber === 1
          ? {
              success: false as const,
              evidence: {
                responsibleStage: "contract" as const,
                issues: [contractIssue],
                artifact: {
                  id: artifactScopedRepairArtifactIdSchema.parse(
                    "final_game_spec_rejected"
                  ),
                  value: { id: "final_game_spec_rejected" },
                },
              },
            }
          : acceptedArtifact("final_game_spec_v2");
      }
    );

    const result = await runArtifactScopedMechanicRepair({
      generationRun: createRunningGenerationRun(
        "generation_run_contract_repair"
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      stageRunners: { contract, source, finalGameSpec },
    });

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") {
      throw new Error("Expected the upstream contract repair to succeed.");
    }

    expect(contractInputs[1]).toMatchObject({
      attemptNumber: 2,
      repair: {
        trigger: "stage_failure",
        failureAttemptId: "generation_run_contract_repair_finalGameSpec_1",
        issues: [contractIssue],
        invalidatedArtifactIds: ["contract_v1", "source_v1"],
      },
    });
    expect(sourceInputs[1]).toMatchObject({
      attemptNumber: 2,
      repair: {
        trigger: "upstream_invalidation",
        failureAttemptId: "generation_run_contract_repair_finalGameSpec_1",
        issues: [],
        invalidatedArtifactIds: ["contract_v1", "source_v1"],
      },
      upstreamArtifacts: {
        contract: { id: "contract_v2" },
      },
    });
    expect(finalGameSpecInputs[1]).toMatchObject({
      attemptNumber: 2,
      repair: {
        trigger: "upstream_invalidation",
        issues: [],
      },
      upstreamArtifacts: {
        contract: { id: "contract_v2" },
        source: { id: "source_v2" },
      },
    });
    expect(result.receipt.artifacts).toEqual([
      {
        artifactId: "contract_v1",
        stage: "contract",
        attemptId: "generation_run_contract_repair_contract_1",
        status: "invalidated",
        dependsOnArtifactIds: [],
        invalidatedByAttemptId:
          "generation_run_contract_repair_finalGameSpec_1",
      },
      {
        artifactId: "source_v1",
        stage: "source",
        attemptId: "generation_run_contract_repair_source_1",
        status: "invalidated",
        dependsOnArtifactIds: ["contract_v1"],
        invalidatedByAttemptId:
          "generation_run_contract_repair_finalGameSpec_1",
      },
      {
        artifactId: "final_game_spec_rejected",
        stage: "finalGameSpec",
        attemptId: "generation_run_contract_repair_finalGameSpec_1",
        status: "rejected",
        dependsOnArtifactIds: ["source_v1"],
      },
      {
        artifactId: "contract_v2",
        stage: "contract",
        attemptId: "generation_run_contract_repair_contract_2",
        status: "accepted",
        dependsOnArtifactIds: [],
      },
      {
        artifactId: "source_v2",
        stage: "source",
        attemptId: "generation_run_contract_repair_source_2",
        status: "accepted",
        dependsOnArtifactIds: ["contract_v2"],
      },
      {
        artifactId: "final_game_spec_v2",
        stage: "finalGameSpec",
        attemptId: "generation_run_contract_repair_finalGameSpec_2",
        status: "accepted",
        dependsOnArtifactIds: ["source_v2"],
      },
    ]);
  });

  it("exhausts after one initial source attempt plus three repairs and retains every issue and duration", async () => {
    let elapsedMs = 0;
    const source = vi.fn(async (input: ArtifactScopedRepairStageInput) => {
      elapsedMs += input.attemptNumber * 5;
      return {
        success: false as const,
        evidence: {
          responsibleStage: "source" as const,
          issues: [
            {
              path: "callbacks.install",
              code: `type_failure_${input.attemptNumber}`,
              message: `Source attempt ${input.attemptNumber} failed typechecking.`,
            },
          ],
        },
      };
    });
    const finalGameSpec = vi.fn();

    const result = await runArtifactScopedMechanicRepair({
      generationRun: createRunningGenerationRun(
        "generation_run_source_exhausted"
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      now: () => elapsedMs,
      completedAt: () => "2026-08-11T15:05:00.000Z",
      stageRunners: {
        contract: async () => acceptedArtifact("contract_v1"),
        source,
        finalGameSpec,
      },
    });

    expect(result.status).toBe("repair_exhausted");
    expect(source).toHaveBeenCalledTimes(4);
    expect(finalGameSpec).not.toHaveBeenCalled();
    expect(result.receipt).toMatchObject({
      generationRunId: "generation_run_source_exhausted",
      status: "repair_exhausted",
      repairStatus: "repair_exhausted",
      durationMs: 50,
      maximumAttempts: {
        contract: 4,
        source: 4,
        finalGameSpec: 4,
      },
      attemptCounts: {
        contract: 1,
        source: 4,
        finalGameSpec: 0,
      },
      exhausted: {
        stage: "source",
        maximumAttempts: 4,
        failureAttemptId: "generation_run_source_exhausted_source_4",
        issues: [
          {
            path: "callbacks.install",
            code: "type_failure_4",
            message: "Source attempt 4 failed typechecking.",
          },
        ],
      },
    });
    expect(
      result.receipt.attempts
        .filter((attempt) => attempt.stage === "source")
        .map((attempt) => ({
          attemptNumber: attempt.attemptNumber,
          durationMs: attempt.durationMs,
          issueCode: attempt.issues?.[0]?.code,
        }))
    ).toEqual([
      { attemptNumber: 1, durationMs: 5, issueCode: "type_failure_1" },
      { attemptNumber: 2, durationMs: 10, issueCode: "type_failure_2" },
      { attemptNumber: 3, durationMs: 15, issueCode: "type_failure_3" },
      { attemptNumber: 4, durationMs: 20, issueCode: "type_failure_4" },
    ]);
    expect(result.receipt.artifacts).toContainEqual({
      artifactId: "contract_v1",
      stage: "contract",
      attemptId: "generation_run_source_exhausted_contract_1",
      status: "accepted",
      dependsOnArtifactIds: [],
    });
    expect(result.generationRun).toMatchObject({
      id: "generation_run_source_exhausted",
      status: "failed",
      repairStatus: "repair-exhausted",
      stage: "repair",
      failureClass: "repair-exhausted",
      completedAt: "2026-08-11T15:05:00.000Z",
      artifactScopedRepair: result.receipt,
    });
    expect(generationRunSchema.parse(result.generationRun)).toEqual(
      result.generationRun
    );
  });

  it("retains upstream failure evidence when an invalidated stage has no attempts left", async () => {
    const upstreamIssue: ArtifactScopedRepairIssue = {
      path: "contract.callbacks.onAction",
      code: "contract_source_mismatch",
      message: "The final Game Spec exposed a contract mismatch.",
    };
    const source = vi.fn(async (input: ArtifactScopedRepairStageInput) =>
      input.attemptNumber < 4
        ? {
            success: false as const,
            evidence: {
              responsibleStage: "source" as const,
              issues: [sourceIssue],
            },
          }
        : acceptedArtifact("source_v4")
    );
    const finalGameSpec = vi.fn(
      async () => ({
        success: false as const,
        evidence: {
          responsibleStage: "contract" as const,
          issues: [upstreamIssue],
        },
      })
    );

    const result = await runArtifactScopedMechanicRepair({
      generationRun: createRunningGenerationRun(
        "generation_run_upstream_invalidation_exhausted"
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      completedAt: () => "2026-08-21T19:25:00.000Z",
      stageRunners: {
        contract: async (input) =>
          acceptedArtifact(`contract_v${input.attemptNumber}`),
        source,
        finalGameSpec,
      },
    });

    expect(source).toHaveBeenCalledTimes(4);
    expect(finalGameSpec).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "repair_exhausted",
      receipt: {
        exhausted: {
          trigger: "upstream_invalidation",
          stage: "source",
          maximumAttempts: 4,
          failureAttemptId:
            "generation_run_upstream_invalidation_exhausted_finalGameSpec_1",
          issues: [upstreamIssue],
        },
      },
      generationRun: {
        status: "failed",
        failureClass: "repair-exhausted",
      },
    });
    expect(generationRunSchema.parse(result.generationRun)).toEqual(
      result.generationRun
    );
  });

  it("snapshots and freezes artifacts, repair evidence, and the completed receipt", async () => {
    const mutableIssue = {
      path: "callbacks.install",
      code: "type_failure",
      message: "Original exact issue.",
    };
    let repairInput: ArtifactScopedRepairStageInput | undefined;
    const source = vi.fn(async (input: ArtifactScopedRepairStageInput) => {
      expect(Object.isFrozen(input)).toBe(true);
      expect(Object.isFrozen(input.upstreamArtifacts)).toBe(true);
      expect(Object.isFrozen(input.upstreamArtifacts.contract)).toBe(true);
      if (input.attemptNumber === 1) {
        return {
          success: false as const,
          evidence: {
            responsibleStage: "source" as const,
            issues: [mutableIssue],
          },
        };
      }
      repairInput = input;
      return acceptedArtifact("source_v2");
    });

    const result = await runArtifactScopedMechanicRepair({
      generationRun: createRunningGenerationRun(
        "generation_run_immutable_receipt"
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      stageRunners: {
        contract: async () => acceptedArtifact("contract_v1"),
        source,
        finalGameSpec: async () => acceptedArtifact("final_game_spec_v1"),
      },
    });
    mutableIssue.message = "Mutated after the run.";

    expect(repairInput?.repair?.issues[0]?.message).toBe(
      "Original exact issue."
    );
    expect(Object.isFrozen(repairInput?.repair)).toBe(true);
    expect(Object.isFrozen(repairInput?.repair?.issues)).toBe(true);
    expect(Object.isFrozen(repairInput?.repair?.issues[0])).toBe(true);
    expect(result.receipt.attempts[1]?.issues?.[0]?.message).toBe(
      "Original exact issue."
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.receipt)).toBe(true);
    expect(Object.isFrozen(result.receipt.attempts)).toBe(true);
    expect(Object.isFrozen(result.receipt.artifacts)).toBe(true);
  });

  it("rejects a failure classification that blames an artifact not created yet", async () => {
    const source = vi.fn();

    await expect(
      runArtifactScopedMechanicRepair({
        generationRun: createRunningGenerationRun(
          "generation_run_invalid_classification"
        ),
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
        stageRunners: {
          contract: async () => ({
            success: false,
            evidence: {
              responsibleStage: "source",
              issues: [
                {
                  path: "contract",
                  code: "invalid_classification",
                  message: "A contract failure cannot blame future source.",
                },
              ],
            },
          }),
          source,
          finalGameSpec: vi.fn(),
        },
      })
    ).rejects.toThrow(
      'The "contract" stage cannot classify a failure as downstream "source".'
    );
    expect(source).not.toHaveBeenCalled();
  });

  it("keeps repair budgets independent across source and Final Game Spec stages", async () => {
    const constraintSet = {
      ...structuredClone(PHASE_9_GENERATION_CONSTRAINT_SET),
      maximumRepairAttempts: {
        contract: 0,
        source: 1,
        finalGameSpec: 1,
      },
    };
    const contract = vi.fn(async () => acceptedArtifact("contract_v1"));
    const source = vi.fn(async (input: ArtifactScopedRepairStageInput) =>
      input.attemptNumber === 1
        ? {
            success: false as const,
            evidence: {
              responsibleStage: "source" as const,
              issues: [sourceIssue],
            },
          }
        : acceptedArtifact("source_v2")
    );
    const finalIssue: ArtifactScopedRepairIssue = {
      path: "mechanics.0.artifactId",
      code: "artifact_mismatch",
      message: "The Final Game Spec references the wrong source artifact.",
    };
    const finalGameSpec = vi.fn(
      async (input: ArtifactScopedRepairStageInput) =>
        input.attemptNumber === 1
          ? {
              success: false as const,
              evidence: {
                responsibleStage: "finalGameSpec" as const,
                issues: [finalIssue],
              },
            }
          : acceptedArtifact("final_game_spec_v2")
    );

    const result = await runArtifactScopedMechanicRepair({
      generationRun: createRunningGenerationRun(
        "generation_run_independent_budgets"
      ),
      constraintSet,
      stageRunners: { contract, source, finalGameSpec },
    });

    expect(result.status).toBe("succeeded");
    expect(contract).toHaveBeenCalledOnce();
    expect(source).toHaveBeenCalledTimes(2);
    expect(finalGameSpec).toHaveBeenCalledTimes(2);
    expect(finalGameSpec.mock.calls[1]?.[0]).toMatchObject({
      upstreamArtifacts: {
        contract: { id: "contract_v1" },
        source: { id: "source_v2" },
      },
      repair: {
        trigger: "stage_failure",
        issues: [finalIssue],
      },
    });
    expect(result.receipt).toMatchObject({
      maximumAttempts: {
        contract: 1,
        source: 2,
        finalGameSpec: 2,
      },
      attemptCounts: {
        contract: 1,
        source: 2,
        finalGameSpec: 2,
      },
    });
  });

  it("rejects duplicate artifact identities before recording ambiguous relationships", async () => {
    const finalGameSpec = vi.fn();

    await expect(
      runArtifactScopedMechanicRepair({
        generationRun: createRunningGenerationRun(
          "generation_run_duplicate_artifact"
        ),
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
        stageRunners: {
          contract: async () => acceptedArtifact("artifact_shared"),
          source: async () => acceptedArtifact("artifact_shared"),
          finalGameSpec,
        },
      })
    ).rejects.toThrow(
      'Artifact ID "artifact_shared" was already used in this GenerationRun.'
    );
    expect(finalGameSpec).not.toHaveBeenCalled();
  });

  it("does not overwrite an already timed-out GenerationRun", async () => {
    const stageRunner = vi.fn();
    const runningGenerationRun = createRunningGenerationRun(
      "generation_run_already_timed_out"
    );
    const timedOutGenerationRun = generationRunSchema.parse({
      ...runningGenerationRun,
      status: "timed-out",
      completedAt: "2026-08-11T15:01:00.000Z",
      durationMs: 60_000,
      stage: "timeout",
      failureClass: "timeout",
    });

    await expect(
      runArtifactScopedMechanicRepair({
        generationRun: timedOutGenerationRun,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
        stageRunners: {
          contract: stageRunner,
          source: stageRunner,
          finalGameSpec: stageRunner,
        },
      })
    ).rejects.toThrow(
      'Artifact-scoped repair requires a running GenerationRun; received "timed-out".'
    );
    expect(stageRunner).not.toHaveBeenCalled();
  });
});

function acceptedArtifact(id: string) {
  return {
    success: true as const,
    data: {
      artifact: {
        id: artifactScopedRepairArtifactIdSchema.parse(id),
        value: { id },
      },
    },
  };
}

function createRunningGenerationRun(id: string): GenerationRun {
  return generationRunSchema.parse({
    id,
    operationType: "repair",
    status: "running",
    createdAt: "2026-08-11T15:00:00.000Z",
    startedAt: "2026-08-11T15:00:00.000Z",
    request: {
      summary: "Repair generated mechanic artifacts.",
    },
    attempts: [],
  });
}
