import { describe, expect, it } from "vitest";

import {
  createFailedGenerationRunFixture,
  createRepairedGenerationRunFixture,
  createSuccessfulGenerationRunFixture,
  createValidatedGamePackFixture,
} from "../game-pack/testing/game-pack-fixtures";
import { generationRunSchema } from "./generation-run-schema";

describe("GenerationRun schema", () => {
  it("parses one AI-backed creator-intent operation with nested attempt evidence", () => {
    const gamePack = createValidatedGamePackFixture();
    const successfulRun = createSuccessfulGenerationRunFixture(gamePack);

    expect(generationRunSchema.parse(successfulRun)).toEqual(successfulRun);
  });

  it("requires failureClass for terminal non-success outcomes only", () => {
    const gamePack = createValidatedGamePackFixture();
    const failedRun = createFailedGenerationRunFixture(gamePack, {
      id: "generation_run_failed_build",
      stage: "artifact-build",
      failureClass: "build-failure",
      attempts: [
        {
          ...createSuccessfulGenerationRunFixture(gamePack).attempts[0],
          id: "generation_attempt_failed_build",
          status: "failed",
          validation: {
            stage: "artifact-build",
            status: "failed",
            issues: [
              {
                path: "template",
                message: "Template artifact failed to build.",
              },
            ],
          },
          candidate: {
            kind: "invalid_candidate",
            summary: "Candidate could not produce a buildable artifact.",
            issueCount: 1,
          },
        },
      ],
    });

    expect(generationRunSchema.safeParse(failedRun).success).toBe(true);

    for (const terminalRun of [
      {
        id: "generation_run_cancelled",
        status: "cancelled",
        stage: "cancellation",
        failureClass: "cancellation",
      },
      {
        id: "generation_run_timed_out",
        status: "timed-out",
        stage: "timeout",
        failureClass: "timeout",
      },
    ] as const) {
      expect(
        generationRunSchema.safeParse(
          createSuccessfulGenerationRunFixture(gamePack, terminalRun)
        ).success
      ).toBe(true);
    }

    for (const status of ["failed", "cancelled", "timed-out"] as const) {
      expect(
        generationRunSchema.safeParse({
          ...createSuccessfulGenerationRunFixture(gamePack),
          id: `generation_run_${status.replace("-", "_")}`,
          status,
          stage: status === "cancelled" ? "cancellation" : "timeout",
        }).success
      ).toBe(false);
    }

    expect(
      generationRunSchema.safeParse({
        ...createSuccessfulGenerationRunFixture(gamePack),
        failureClass: "invalid-model-output",
      }).success
    ).toBe(false);

    expect(
      generationRunSchema.safeParse(
        createSuccessfulGenerationRunFixture(gamePack, {
          status: "running",
          completedAt: undefined,
          durationMs: undefined,
        })
      ).success
    ).toBe(true);
  });

  it("represents a repaired success as one successful run with nested attempts", () => {
    const gamePack = createValidatedGamePackFixture();
    const repairedRun = createRepairedGenerationRunFixture(gamePack);

    expect(generationRunSchema.parse(repairedRun)).toEqual(repairedRun);

    expect(
      generationRunSchema.safeParse({
        ...createSuccessfulGenerationRunFixture(gamePack),
        id: "generation_run_repaired_without_repair_attempt",
        repairStatus: "repaired",
      }).success
    ).toBe(false);
  });

  it("rejects duplicate nested attempt receipt IDs", () => {
    const gamePack = createValidatedGamePackFixture();
    const run = createSuccessfulGenerationRunFixture(gamePack);

    expect(
      generationRunSchema.safeParse({
        ...run,
        attempts: [
          run.attempts[0],
          {
            ...run.attempts[0],
            attemptNumber: 2,
          },
        ],
      }).success
    ).toBe(false);
  });

  it("keeps invalid candidate receipts compact instead of storing raw JSON", () => {
    const gamePack = createValidatedGamePackFixture();
    const run = createSuccessfulGenerationRunFixture(gamePack);

    expect(
      generationRunSchema.safeParse({
        ...run,
        attempts: [
          {
            ...run.attempts[0],
            status: "failed",
            validation: {
              stage: "schema-validation",
              status: "failed",
              issues: [
                {
                  path: "mechanics.0",
                  message: "Unknown mechanic reference.",
                },
              ],
            },
            candidate: {
              kind: "invalid_candidate",
              summary: "Candidate referenced an unknown mechanic.",
              issueCount: 1,
              referencedMechanicIds: ["unknown_mechanic"],
            },
          },
        ],
      }).success
    ).toBe(true);

    expect(
      generationRunSchema.safeParse({
        ...run,
        attempts: [
          {
            ...run.attempts[0],
            candidate: {
              kind: "invalid_candidate",
              summary: "Candidate included raw invalid JSON.",
              issueCount: 1,
              rawInvalidCandidateJson: {
                mechanics: [{ id: "unknown_mechanic" }],
              },
            },
          },
        ],
      }).success
    ).toBe(false);
  });
});
