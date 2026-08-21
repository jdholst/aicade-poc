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

  it("summarizes and groups a Mechanic Execution Realm conformance failure", () => {
    const surface = createGenerationFailureReceiptSurface({
      message: [
        "The candidate did not return measured structured evidence for every fixed resource dimension.",
        "The candidate did not produce identical observable output.",
        "The browser host responsiveness check failed after deterministic_replay_a.",
      ].join(" "),
      generatedMechanicFailure: {
        stage: "foundation",
        issues: [
          {
            path: "foundation.realm_conformance.resource_enforcement",
            code: "resource_limit_not_enforced",
            message:
              "The candidate did not return measured structured evidence for every fixed resource dimension.",
          },
          {
            path: "foundation.realm_conformance.determinism",
            code: "non_deterministic_replay",
            message: "The candidate did not produce identical observable output.",
          },
          {
            path: "foundation.realm_conformance.browser_integration",
            code: "host_unresponsive_after_probe",
            message:
              'The browser host responsiveness check failed after probe "deterministic_replay_a".',
          },
        ],
      },
    });

    expect(surface.summary).toBe(
      "The secure mechanic runtime could not be verified. Review 3 failed conformance checks below."
    );
    expect(surface.summary).not.toContain("The candidate");
    expect(surface.debugReceipts[0]).toMatchObject({
      message:
        "Mechanic execution conformance stopped before source generation began.",
      issueMessages: [],
      issueGroups: [
        {
          id: "resource_enforcement",
          label: "Resource limits",
          issueMessages: [
            "The candidate did not return measured structured evidence for every fixed resource dimension.",
          ],
        },
        {
          id: "determinism",
          label: "Deterministic replay",
          issueMessages: [
            "The candidate did not produce identical observable output.",
          ],
        },
        {
          id: "browser_integration",
          label: "Browser runtime",
          issueMessages: [
            'The browser host responsiveness check failed after probe "deterministic_replay_a".',
          ],
        },
      ],
    });
  });
});
