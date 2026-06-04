import { describe, expect, it } from "vitest";
import { z } from "zod";

import { GameSpecValidationError } from "@/game-spec";
import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import {
  createSpecGenerationFailureResult,
  createSpecGenerationPreflightFailure,
  createSpecGenerationRepairAttemptSummary,
  createSpecGenerationSuccessResult,
  createSpecGenerationValidationAttemptFailure,
  getSpecGenerationErrorMessage,
  getSpecGenerationResultStatus,
  getSpecGenerationSuccessMetadata,
  getSpecGenerationValidationFailure,
} from "./spec-generation-outcome";

describe("Spec Generation outcome module", () => {
  it("creates provider-neutral success, preflight failure, and HTTP status outcomes", () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const success = createSpecGenerationSuccessResult({
      spec,
      model: "gpt-5.4-mini",
      attemptCount: 2,
      repairStatus: "repaired",
      repairAttempts: [
        createSpecGenerationRepairAttemptSummary({
          attempt: 1,
          outcome: "failed_validation",
          stage: "semantic_validation",
          issues: [
            {
              path: "mechanics.mechanic_player_movement.entityIds",
              message: 'Unknown entity ID "entity_missing".',
            },
          ],
        }),
      ],
    });
    const modelFailure = createSpecGenerationFailureResult({
      stage: "model_generation",
      userMessage:
        "I couldn't design a game plan from that prompt. Please try again.",
      validationIssues: [],
      attemptCount: 1,
    });
    const preflightFailure = createSpecGenerationPreflightFailure({
      stage: "configuration",
      userMessage: "Missing OpenAI API key.",
    });

    expect(success.metadata).toEqual({
      taskRoute: "spec_generation.primary",
      model: "gpt-5.4-mini",
      attemptCount: 2,
      repairStatus: "repaired",
      repairAttempts: [
        {
          attempt: 1,
          outcome: "failed_validation",
          stage: "semantic_validation",
          issues: [
            {
              path: "mechanics.mechanic_player_movement.entityIds",
              message: 'Unknown entity ID "entity_missing".',
            },
          ],
        },
      ],
    });
    expect(preflightFailure).toEqual({
      ok: false,
      userMessage: "Missing OpenAI API key.",
      stage: "configuration",
      validationIssues: [],
      taskRoute: "spec_generation.primary",
      attemptCount: 0,
    });
    expect(getSpecGenerationResultStatus(success)).toBe(200);
    expect(getSpecGenerationResultStatus(modelFailure)).toBe(502);
    expect(
      getSpecGenerationResultStatus(
        createSpecGenerationFailureResult({
          stage: "semantic_validation",
          userMessage:
            "I designed a game plan, but it did not pass validation.",
          validationIssues: [
            {
              path: "objectives",
              message: "Expected exactly one primary objective.",
            },
          ],
          attemptCount: 2,
        })
      )
    ).toBe(422);
  });

  it("classifies schema and mechanic validation errors into display-safe issues", () => {
    const schemaFailure = createSpecGenerationValidationAttemptFailure(
      z.object({ id: z.string() }).safeParse({ id: 123 }).error
    );
    const mechanicFailure = createSpecGenerationValidationAttemptFailure(
      new GameSpecValidationError([
        {
          path: "mechanics.mechanic_pickup_collection.assetIds",
          message:
            "Expected a referenced pickup asset to be placed in a pickup zone.",
        },
      ])
    );

    expect(schemaFailure).toEqual({
      stage: "schema_validation",
      validationIssues: [
        expect.objectContaining({
          path: "id",
          message: expect.stringContaining("Invalid input"),
          code: "invalid_type",
        }),
      ],
    });
    expect(mechanicFailure).toEqual({
      stage: "mechanic_validation",
      validationIssues: [
        {
          path: "mechanics.mechanic_pickup_collection.assetIds",
          message:
            "Expected a referenced pickup asset to be placed in a pickup zone.",
        },
      ],
    });
  });

  it("normalizes wire payloads into client metadata and display-safe validation failures", () => {
    const failurePayload = {
      ok: false,
      attemptCount: 2,
      debugCandidate: {
        secret: "invalid raw model output",
      },
      repairAttempts: [
        {
          attempt: 1,
          outcome: "failed_validation",
          stage: "semantic_validation",
          issues: [
            {
              path: "mechanics.mechanic_player_movement.entityIds",
              message: 'Unknown entity ID "entity_missing".',
              ignoredRawCandidate: "not display-safe",
            },
          ],
        },
        {
          attempt: "bad",
          outcome: "repair_failed",
          stage: "semantic_validation",
          issues: [],
        },
      ],
      stage: "semantic_validation",
      taskRoute: "spec_generation.primary",
      userMessage:
        "I designed a game plan, but it did not pass validation. Please try a simpler prompt.",
      validationIssues: [
        {
          path: "objectives",
          message: "Expected exactly one primary objective.",
          code: 123,
        },
      ],
    };
    const successPayload = {
      ok: true,
      metadata: {
        taskRoute: "wrong-route",
        model: "gpt-5.4-mini",
        attemptCount: 2,
        repairStatus: "repaired",
        repairAttempts: failurePayload.repairAttempts,
      },
    };

    expect(getSpecGenerationErrorMessage(failurePayload)).toBe(
      "I designed a game plan, but it did not pass validation. Please try a simpler prompt."
    );
    expect(getSpecGenerationValidationFailure(failurePayload)).toEqual({
      attemptCount: 2,
      issues: [
        {
          path: "objectives",
          message: "Expected exactly one primary objective.",
        },
      ],
      repairAttempts: [
        {
          attempt: 1,
          outcome: "failed_validation",
          stage: "semantic_validation",
          issues: [
            {
              path: "mechanics.mechanic_player_movement.entityIds",
              message: 'Unknown entity ID "entity_missing".',
            },
          ],
        },
      ],
      stage: "semantic_validation",
      taskRoute: "spec_generation.primary",
    });
    expect(getSpecGenerationValidationFailure({ ok: false })).toBeUndefined();
    expect(getSpecGenerationSuccessMetadata(successPayload)).toEqual({
      taskRoute: "spec_generation.primary",
      model: "gpt-5.4-mini",
      attemptCount: 2,
      repairStatus: "repaired",
      repairAttempts: [
        {
          attempt: 1,
          outcome: "failed_validation",
          stage: "semantic_validation",
          issues: [
            {
              path: "mechanics.mechanic_player_movement.entityIds",
              message: 'Unknown entity ID "entity_missing".',
            },
          ],
        },
      ],
    });
  });
});
