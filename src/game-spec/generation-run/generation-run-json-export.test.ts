import { describe, expect, it } from "vitest";

import {
  createFailedGenerationRunFixture,
  createRepairedGenerationRunFixture,
  createSuccessfulGenerationRunFixture,
  createValidatedGamePackFixture,
} from "../game-pack/testing/game-pack-fixtures";
import {
  createGenerationRunJsonExport,
  createGenerationRunJsonExportText,
  createGenerationRunRepositoryJsonExport,
} from "./generation-run-json-export";
import type { GenerationRunRepository } from "./generation-run-repository";

describe("GenerationRun JSON export", () => {
  it("serializes success, failure, repaired success, and unknown-cost receipts for developer review", () => {
    const gamePack = createValidatedGamePackFixture();
    const successfulRun = createSuccessfulGenerationRunFixture(gamePack);
    const failedRun = createFailedGenerationRunFixture(gamePack);
    const repairedRun = createRepairedGenerationRunFixture(gamePack);
    const unknownCostRun = createSuccessfulGenerationRunFixture(gamePack, {
      id: "generation_run_unknown_cost",
      cost: undefined,
      attempts: [
        {
          ...successfulRun.attempts[0],
          id: "generation_attempt_unknown_cost",
          usage: undefined,
          cost: undefined,
        },
      ],
    });

    const exportPayload = createGenerationRunJsonExport(
      [successfulRun, failedRun, repairedRun, unknownCostRun],
      {
        exportedAt: "2026-06-08T12:00:00.000Z",
      }
    );

    expect(exportPayload).toMatchObject({
      schemaVersion: "generation-run-export/v1",
      exportedAt: "2026-06-08T12:00:00.000Z",
      runCount: 4,
      failureClassCounts: {
        "invalid-model-output": 1,
        none: 3,
      },
      runs: [
        {
          id: "generation_run_repaired_success",
          status: "succeeded",
          operationType: "generate",
          repairStatus: "repaired",
          prompt: {
            summary: "Generate and repair a top-down collector from the prompt.",
            promptText: "Make a top-down collector about crystals.",
          },
          taskRoutes: ["phaser_spec_generation"],
          providerModels: [
            {
              provider: "test_provider",
              model: "test_model",
            },
          ],
          attemptCount: 2,
          attempts: [
            {
              id: "generation_attempt_initial_invalid",
              status: "failed",
              validation: {
                stage: "schema-validation",
                status: "failed",
                issueCount: 1,
              },
              candidate: {
                kind: "invalid_candidate",
                summary: "Candidate had invalid objective cardinality.",
                issueCount: 1,
                referencedMechanicIds: ["collect_items"],
              },
            },
            {
              id: "generation_attempt_repair",
              kind: "repair",
              repair: {
                sourceAttemptId: "generation_attempt_initial_invalid",
                validationIssueCount: 1,
              },
              candidate: {
                kind: "validated_spec",
                gameSpecId: gamePack.gameSpec.id,
              },
            },
          ],
          linkedOutcomeIds: {
            gamePackId: gamePack.id,
            gameSpecId: gamePack.gameSpec.id,
            buildIds: ["build_initial_playable"],
            checkpointIds: ["checkpoint_initial_playable"],
            validationEvidenceIds: ["evidence_runtime_boot"],
            failedAttemptIds: ["failed_attempt_preflight"],
          },
        },
        {
          id: "generation_run_initial_prompt",
          status: "succeeded",
          cost: {
            amountUsd: 0.0042,
            currency: "USD",
            source: "provider_usage",
            quality: "estimated",
          },
        },
        {
          id: "generation_run_failed_schema_validation",
          status: "failed",
          stage: "schema-validation",
          failureClass: "invalid-model-output",
        },
        {
          id: "generation_run_unknown_cost",
          status: "succeeded",
          cost: {
            quality: "unknown",
          },
        },
      ],
    });
  });

  it("filters and groups receipts so failure classes are easy to compare", () => {
    const gamePack = createValidatedGamePackFixture();
    const successfulRun = createSuccessfulGenerationRunFixture(gamePack);
    const schemaFailure = createFailedGenerationRunFixture(gamePack);
    const runtimeFailure = createFailedGenerationRunFixture(gamePack, {
      id: "generation_run_runtime_failure",
      stage: "runtime-boot",
      failureClass: "first-playable-failure",
      completedAt: "2026-05-23T12:20:00.000Z",
      attempts: [
        {
          ...schemaFailure.attempts[0],
          id: "generation_attempt_runtime_failure",
          validation: {
            stage: "runtime-boot",
            status: "failed",
            issues: [
              {
                path: "runtime",
                message: "Runtime boot failed.",
              },
            ],
          },
          candidate: {
            kind: "invalid_candidate",
            summary: "Validated spec failed first-playable checks.",
            issueCount: 1,
          },
        },
      ],
    });

    const exportPayload = createGenerationRunJsonExport(
      [successfulRun, schemaFailure, runtimeFailure],
      {
        exportedAt: "2026-06-08T12:00:00.000Z",
        failureClass: "invalid-model-output",
      }
    );

    expect(exportPayload.filters).toEqual({
      failureClass: "invalid-model-output",
    });
    expect(exportPayload.runCount).toBe(1);
    expect(exportPayload.failureClassCounts).toEqual({
      "invalid-model-output": 1,
    });
    expect(exportPayload.runs.map((run) => run.id)).toEqual([
      "generation_run_failed_schema_validation",
    ]);
  });

  it("keeps invalid candidate raw debug data out of the default export", () => {
    const gamePack = createValidatedGamePackFixture();
    const failedRun = createFailedGenerationRunFixture(gamePack, {
      attempts: [
        {
          ...createFailedGenerationRunFixture(gamePack).attempts[0],
          candidate: {
            kind: "invalid_candidate",
            summary: "Candidate included debug metadata.",
            issueCount: 1,
            referencedMechanicIds: ["collect_items"],
            metadata: {
              rawInvalidCandidateJson: {
                objectives: [{ id: "too_many_objectives" }],
              },
              rawText: "{\"objectives\":[{\"id\":\"too_many_objectives\"}]}",
            },
          },
        },
      ],
    });

    const exportText = createGenerationRunJsonExportText([failedRun], {
      exportedAt: "2026-06-08T12:00:00.000Z",
    });

    expect(exportText).toContain("Candidate included debug metadata.");
    expect(exportText).not.toContain("rawInvalidCandidateJson");
    expect(exportText).not.toContain("too_many_objectives");
    expect(JSON.parse(exportText)).toMatchObject({
      runs: [
        {
          attempts: [
            {
              candidate: {
                kind: "invalid_candidate",
                summary: "Candidate included debug metadata.",
                issueCount: 1,
                referencedMechanicIds: ["collect_items"],
              },
            },
          ],
        },
      ],
    });
  });

  it("exports recent repository receipts without mutating stored runs", async () => {
    const gamePack = createValidatedGamePackFixture();
    const olderRun = createSuccessfulGenerationRunFixture(gamePack, {
      id: "generation_run_older",
      completedAt: "2026-05-23T12:05:00.000Z",
    });
    const newerRun = createSuccessfulGenerationRunFixture(gamePack, {
      id: "generation_run_newer",
      completedAt: "2026-05-23T12:10:00.000Z",
    });
    const listedRuns = [olderRun, newerRun];
    const repository: Pick<GenerationRunRepository, "list"> = {
      list: async () => listedRuns,
    };

    const exportPayload = await createGenerationRunRepositoryJsonExport(
      repository,
      {
        exportedAt: "2026-06-08T12:00:00.000Z",
        maxRuns: 1,
      }
    );

    expect(exportPayload.filters).toEqual({
      maxRuns: 1,
    });
    expect(exportPayload.runs.map((run) => run.id)).toEqual([
      "generation_run_newer",
    ]);
    expect(listedRuns).toEqual([olderRun, newerRun]);
  });
});
