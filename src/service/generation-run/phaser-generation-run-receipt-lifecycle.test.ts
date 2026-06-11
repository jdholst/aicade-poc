import { describe, expect, it } from "vitest";

import { SpecGenerationClientError } from "@/service/spec-generation";

import { createPhaserGenerationRunReceiptLifecycle } from "./phaser-generation-run-receipt-lifecycle";
import {
  createDeterministicClock,
  createGenerationRunTestRepository,
} from "./testing/generation-run-test-harness";

describe("createPhaserGenerationRunReceiptLifecycle", () => {
  it("creates and finalizes compact failed Phaser Spec Generation receipts", async () => {
    const repository = createGenerationRunTestRepository().repository;
    const validationFailure = {
      attemptCount: 1,
      issues: [
        {
          path: "mechanics.mechanic_pickup_collection.assetIds",
          message: "Expected asset role \"pickup\".",
        },
      ],
      stage: "mechanic_validation" as const,
      taskRoute: "spec_generation.primary" as const,
    };
    const lifecycle = createPhaserGenerationRunReceiptLifecycle({
      createGenerationRunId: () => "generation_run_lifecycle_failure",
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:02.000Z",
      ]),
      repository,
      request: {
        prompt: "make a top-down crystal chase",
      },
    });

    await lifecycle.createInitialReceipt();
    await lifecycle.recordSpecGenerationFailure(
      new SpecGenerationClientError(
        "I designed a game plan, but it needs a clearer pickup goal.",
        validationFailure
      )
    );

    await expect(
      repository.fetch("generation_run_lifecycle_failure")
    ).resolves.toMatchObject({
      failureClass: "invalid-model-output",
      id: "generation_run_lifecycle_failure",
      stage: "mechanic-validation",
      status: "failed",
      attempts: [
        expect.objectContaining({
          candidate: {
            kind: "invalid_candidate",
            issueCount: 1,
            summary:
              "Spec Generation failed mechanic validation with 1 issue.",
          },
          durationMs: 2000,
          kind: "initial",
          status: "failed",
          validation: {
            stage: "mechanic-validation",
            status: "failed",
            issues: validationFailure.issues,
          },
        }),
      ],
    });
  });
});
