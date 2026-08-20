import { describe, expect, it } from "vitest";

import { createGenerationFailureReceiptSurface } from "./editor-failure-receipt";

describe("createGenerationFailureReceiptSurface", () => {
  it("turns provider or generic generation errors into display-ready receipts", () => {
    expect(
      createGenerationFailureReceiptSurface({
        message:
          "I couldn't design a game plan from that prompt. Please try again.",
      })
    ).toEqual({
      debugReceipts: [
        {
          checkId: "generation_request",
          evidenceJson: null,
          issueMessages: [],
          message:
            "I couldn't design a game plan from that prompt. Please try again.",
          stage: "model_generation",
          status: "failed",
        },
      ],
      summary:
        "I couldn't design a game plan from that prompt. Please try again.",
    });
  });

  it("includes automatic repair details for Spec Generation validation failures", () => {
    const surface = createGenerationFailureReceiptSurface({
      message:
        "I designed a game plan, but it did not pass validation. Please try a simpler prompt.",
      validationFailure: {
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
          {
            attempt: 2,
            outcome: "repair_failed",
            stage: "semantic_validation",
            issues: [
              {
                path: "objectives",
                message: "Expected exactly one primary objective.",
              },
            ],
          },
        ],
        stage: "semantic_validation",
        taskRoute: "spec_generation.primary",
      },
    });

    expect(surface.debugReceipts[0].issueMessages).toEqual([
      "Automatic repair was attempted once and stopped.",
      'Attempt 1 failed_validation: mechanics.mechanic_player_movement.entityIds: Unknown entity ID "entity_missing".',
      "Attempt 2 repair_failed: objectives: Expected exactly one primary objective.",
      "objectives: Expected exactly one primary objective.",
    ]);
    expect(JSON.parse(surface.debugReceipts[0].evidenceJson ?? "{}")).toEqual({
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
        {
          attempt: 2,
          outcome: "repair_failed",
          stage: "semantic_validation",
          issues: [
            {
              path: "objectives",
              message: "Expected exactly one primary objective.",
            },
          ],
        },
      ],
      taskRoute: "spec_generation.primary",
    });
    expect(surface.debugReceipts[0].evidenceJson).not.toContain(
      "invalidCandidate"
    );
  });

  it("renders exact generated-mechanic stage evidence for developer inspection", () => {
    const surface = createGenerationFailureReceiptSurface({
      message: "The generated mechanic browser proof failed.",
      generatedMechanicFailure: {
        stage: "first_playable",
        issues: [
          {
            path: "firstPlayable",
            code: "first_playable_not_passed",
            message: "The generated mechanic browser proof failed.",
          },
        ],
        runtimeEvidence: { checkId: "input_response", passed: false },
      },
    });

    expect(surface).toEqual({
      debugReceipts: [
        {
          checkId: "first_playable",
          evidenceJson: JSON.stringify(
            {
              stage: "first_playable",
              issues: [
                {
                  path: "firstPlayable",
                  code: "first_playable_not_passed",
                  message: "The generated mechanic browser proof failed.",
                },
              ],
              runtimeEvidence: {
                checkId: "input_response",
                passed: false,
              },
            },
            null,
            2
          ),
          issueMessages: [
            "firstPlayable: The generated mechanic browser proof failed.",
          ],
          message: "The generated mechanic browser proof failed.",
          stage: "first_playable",
          status: "failed",
        },
      ],
      summary: "The generated mechanic browser proof failed.",
    });
  });
});
