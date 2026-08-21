import { describe, expect, it } from "vitest";

import { createEvaluationObservationFailureMessage } from "./evaluation-repair-evidence";

describe("createEvaluationObservationFailureMessage", () => {
  it("preserves compact exact evidence and bounds large assertion/actual values", () => {
    expect(
      createEvaluationObservationFailureMessage({
        label: "Model-declared observation",
        index: 0,
        kind: "binding_property",
        assertion: { operator: "equals", value: 3 },
        actual: 2,
      })
    ).toBe(
      'Model-declared observation 0 "binding_property" failed. Assertion: {"operator":"equals","value":3}. Actual: 2.'
    );

    const bounded = createEvaluationObservationFailureMessage({
      label: "Evaluator-authored observation",
      index: 2,
      kind: "owned_object_lifecycle_after_action",
      assertion: { archetypeIds: Array.from({ length: 80 }, (_, index) => `projectile_${index}`) },
      actual: {
        samples: Array.from({ length: 80 }, (_, index) => ({
          id: `projectile_${index}`,
          simulatedDistanceTraveled: index,
        })),
      },
    });

    expect(bounded.length).toBeLessThanOrEqual(500);
    expect(bounded).toContain("Assertion:");
    expect(bounded).toContain("Actual:");
    expect(bounded).toContain("...");
  });
});
