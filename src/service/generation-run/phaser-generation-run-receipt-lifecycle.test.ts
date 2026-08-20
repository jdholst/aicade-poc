import { describe, expect, it } from "vitest";

import { SpecGenerationClientError } from "@/service/spec-generation";
import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";
import { writeGeneratedMechanicHandoffPendingReceipt } from "@/game-spec";

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

  it("preserves successful planning evidence when generated continuation is cancelled", async () => {
    const repository = createGenerationRunTestRepository().repository;
    const spec = getFirstValidTopDownGameSpecFixture();
    const lifecycle = createPhaserGenerationRunReceiptLifecycle({
      createGenerationRunId: () => "generation_run_continuation_cancelled",
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:02.000Z",
        "2026-06-10T12:00:05.000Z",
      ]),
      repository,
      request: {
        openAiModel: "gpt-5.4-mini",
        prompt: "add a generated mechanic",
      },
    });

    await lifecycle.createInitialReceipt();
    await lifecycle.recordSpecGenerationSuccess({
      metadata: {
        attemptCount: 1,
        model: "gpt-5.4-mini",
        taskRoute: "creator_generation_planning.primary",
      },
      runtimeKind: "phaser",
      spec,
    });
    await expect(
      lifecycle.recordSpecGenerationInterruption(
        "cancelled",
        "generated_mechanic_continuation"
      )
    ).resolves.toBe("recorded");

    await expect(
      repository.fetch("generation_run_continuation_cancelled")
    ).resolves.toMatchObject({
      status: "cancelled",
      attempts: [
        expect.objectContaining({
          attemptNumber: 1,
          status: "succeeded",
          candidate: expect.objectContaining({
            kind: "validated_spec",
            gameSpecId: spec.id,
          }),
        }),
        expect.objectContaining({
          attemptNumber: 2,
          status: "cancelled",
          taskRoute: "generated_mechanic.continuation",
          candidate: {
            kind: "no_candidate",
            summary:
              "Generated mechanic continuation was cancelled before acceptance.",
          },
        }),
      ],
      metadata: {
        generatedMechanicOutcome: {
          status: "rejected",
          stage: "continuation",
          issues: [expect.objectContaining({ code: "generation_cancelled" })],
        },
      },
    });
  });

  it("preserves a succeeded run once generated-mechanic acceptance is pending", async () => {
    const repository = createGenerationRunTestRepository().repository;
    const spec = getFirstValidTopDownGameSpecFixture();
    const generationRunId = "generation_run_acceptance_pending";
    const lifecycle = createPhaserGenerationRunReceiptLifecycle({
      createGenerationRunId: () => generationRunId,
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:02.000Z",
        "2026-06-10T12:00:05.000Z",
      ]),
      repository,
      request: {
        openAiModel: "gpt-5.4-mini",
        prompt: "add a generated mechanic",
      },
    });

    await lifecycle.createInitialReceipt();
    await lifecycle.recordSpecGenerationSuccess({
      metadata: {
        attemptCount: 1,
        model: "gpt-5.4-mini",
        taskRoute: "creator_generation_planning.primary",
      },
      runtimeKind: "phaser",
      spec,
    });
    const pendingAcceptance = await repository.update(
      generationRunId,
      (generationRun) => ({
        ...generationRun,
        metadata: {
          ...(generationRun.metadata ?? {}),
          generatedMechanicAcceptanceTransaction: {
            schemaVersion: "generated_mechanic_acceptance_transaction/v1",
            status: "pending",
            transactionId: "acceptance_pending_lifecycle",
            generationRunId,
            artifactId: "artifact_pending_lifecycle",
            buildId: "build_pending_lifecycle",
            checkpointId: "checkpoint_pending_lifecycle",
          },
        },
      })
    );

    await expect(
      lifecycle.recordSpecGenerationInterruption(
        "cancelled",
        "generated_mechanic_continuation"
      )
    ).resolves.toBe("preserved_acceptance");

    await expect(repository.fetch(generationRunId)).resolves.toEqual(
      pendingAcceptance
    );
  });

  it("clears a pre-journal handoff receipt when continuation cancellation wins", async () => {
    const repository = createGenerationRunTestRepository().repository;
    const spec = getFirstValidTopDownGameSpecFixture();
    const generationRunId = "generation_run_handoff_pending_cancelled";
    const lifecycle = createPhaserGenerationRunReceiptLifecycle({
      createGenerationRunId: () => generationRunId,
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:02.000Z",
        "2026-06-10T12:00:05.000Z",
      ]),
      repository,
      request: {
        openAiModel: "gpt-5.4-mini",
        prompt: "add a generated mechanic",
      },
    });

    await lifecycle.createInitialReceipt();
    await lifecycle.recordSpecGenerationSuccess({
      metadata: {
        attemptCount: 1,
        model: "gpt-5.4-mini",
        taskRoute: "creator_generation_planning.primary",
      },
      runtimeKind: "phaser",
      spec,
    });
    await repository.update(generationRunId, (generationRun) =>
      writeGeneratedMechanicHandoffPendingReceipt(generationRun, {
        intentArtifactId: "intent_cancelled_handoff",
        contractArtifactId: "contract_cancelled_handoff",
        sourceArtifactId: "source_cancelled_handoff",
        finalGameSpecArtifactId: "final_spec_cancelled_handoff",
      })
    );

    await expect(
      lifecycle.recordSpecGenerationInterruption(
        "cancelled",
        "generated_mechanic_continuation"
      )
    ).resolves.toBe("recorded");

    const interrupted = await repository.fetch(generationRunId);
    expect(interrupted).toMatchObject({ status: "cancelled" });
    expect(interrupted?.metadata).not.toHaveProperty(
      "generatedMechanicHandoff"
    );
  });
});
