import { describe, expect, it } from "vitest";

import { artifactScopedMechanicRepairReceiptSchema } from "./artifact-scoped-mechanic-repair-receipt";

describe("artifactScopedMechanicRepairReceiptSchema", () => {
  it("accepts one coherent artifact-scoped repair history", () => {
    expect(
      artifactScopedMechanicRepairReceiptSchema.safeParse(
        createValidRepairReceipt()
      ).success
    ).toBe(true);
  });

  it("rejects attempt counts that do not equal the retained attempts", () => {
    const receipt = createValidRepairReceipt();

    expect(
      artifactScopedMechanicRepairReceiptSchema.safeParse({
        ...receipt,
        attemptCounts: { ...receipt.attemptCounts, source: 1 },
      }).success
    ).toBe(false);
  });

  it("rejects duplicate attempt IDs and non-contiguous attempt numbers", () => {
    const receipt = createValidRepairReceipt();
    const attempts = receipt.attempts.map((attempt, index) =>
      index === 2
        ? {
            ...attempt,
            id: receipt.attempts[1].id,
            attemptNumber: 3,
          }
        : attempt
    );

    expect(
      artifactScopedMechanicRepairReceiptSchema.safeParse({
        ...receipt,
        attempts,
      }).success
    ).toBe(false);
  });

  it("rejects repairs whose failure attempt is missing from the history", () => {
    const receipt = createValidRepairReceipt();
    const attempts = receipt.attempts.map((attempt) =>
      attempt.id === "attempt_source_2"
        ? {
            ...attempt,
            repair: {
              ...attempt.repair,
              failureAttemptId: "attempt_foreign",
            },
          }
        : attempt
    );

    expect(
      artifactScopedMechanicRepairReceiptSchema.safeParse({
        ...receipt,
        attempts,
      }).success
    ).toBe(false);
  });

  it("rejects artifacts whose attempt or invalidation references are foreign", () => {
    const receipt = createValidRepairReceipt();
    const artifacts = receipt.artifacts.map((artifact) =>
      artifact.artifactId === "source_rejected"
        ? { ...artifact, attemptId: "attempt_foreign" }
        : artifact.artifactId === "contract_v1"
          ? {
              ...artifact,
              status: "invalidated" as const,
              invalidatedByAttemptId: "attempt_foreign",
            }
          : artifact
    );

    expect(
      artifactScopedMechanicRepairReceiptSchema.safeParse({
        ...receipt,
        artifacts,
      }).success
    ).toBe(false);
  });

  it("rejects a repair status that disagrees with the retained repair attempts", () => {
    const receipt = createValidRepairReceipt();

    expect(
      artifactScopedMechanicRepairReceiptSchema.safeParse({
        ...receipt,
        repairStatus: "not_needed",
      }).success
    ).toBe(false);
  });

  it("rejects retained repair issues without earlier same-stage provenance", () => {
    const receipt = createValidRepairReceipt();
    const attempts = receipt.attempts.map((attempt) =>
      attempt.id === "attempt_source_2"
        ? {
            ...attempt,
            repair: {
              ...attempt.repair,
              retainedIssues: [
                {
                  path: "callbacks.scheduled",
                  code: "type_failure",
                  message: "An unrelated issue from no retained attempt.",
                },
              ],
            },
          }
        : attempt
    );

    expect(
      artifactScopedMechanicRepairReceiptSchema.safeParse({
        ...receipt,
        attempts,
      }).success
    ).toBe(false);
  });
});

function createValidRepairReceipt() {
  const issue = {
    path: "callbacks.install",
    code: "type_failure",
    message: "Initial source did not compile.",
  };
  return {
    schemaVersion: "artifact_scoped_mechanic_repair/v1" as const,
    generationRunId: "generation_run_receipt",
    status: "succeeded" as const,
    repairStatus: "repaired" as const,
    durationMs: 4,
    maximumAttempts: { contract: 4, source: 4, finalGameSpec: 4 },
    attemptCounts: { contract: 1, source: 2, finalGameSpec: 1 },
    attempts: [
      {
        id: "attempt_contract_1",
        stage: "contract" as const,
        attemptNumber: 1,
        kind: "initial" as const,
        status: "accepted" as const,
        durationMs: 1,
        inputArtifactIds: [],
        artifactId: "contract_v1",
      },
      {
        id: "attempt_source_1",
        stage: "source" as const,
        attemptNumber: 1,
        kind: "initial" as const,
        status: "rejected" as const,
        durationMs: 1,
        inputArtifactIds: ["contract_v1"],
        artifactId: "source_rejected",
        issues: [issue],
        responsibleStage: "source" as const,
      },
      {
        id: "attempt_source_2",
        stage: "source" as const,
        attemptNumber: 2,
        kind: "repair" as const,
        status: "accepted" as const,
        durationMs: 1,
        inputArtifactIds: ["contract_v1"],
        artifactId: "source_v2",
        repair: {
          trigger: "stage_failure" as const,
          failureAttemptId: "attempt_source_1",
          issues: [issue],
          invalidatedArtifactIds: [],
        },
      },
      {
        id: "attempt_final_1",
        stage: "finalGameSpec" as const,
        attemptNumber: 1,
        kind: "initial" as const,
        status: "accepted" as const,
        durationMs: 1,
        inputArtifactIds: ["contract_v1", "source_v2"],
        artifactId: "final_v1",
      },
    ],
    artifacts: [
      {
        artifactId: "contract_v1",
        stage: "contract" as const,
        attemptId: "attempt_contract_1",
        status: "accepted" as const,
        dependsOnArtifactIds: [],
      },
      {
        artifactId: "source_rejected",
        stage: "source" as const,
        attemptId: "attempt_source_1",
        status: "rejected" as const,
        dependsOnArtifactIds: ["contract_v1"],
      },
      {
        artifactId: "source_v2",
        stage: "source" as const,
        attemptId: "attempt_source_2",
        status: "accepted" as const,
        dependsOnArtifactIds: ["contract_v1"],
      },
      {
        artifactId: "final_v1",
        stage: "finalGameSpec" as const,
        attemptId: "attempt_final_1",
        status: "accepted" as const,
        dependsOnArtifactIds: ["source_v2"],
      },
    ],
  };
}
