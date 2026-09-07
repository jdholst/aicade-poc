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

  it("preserves actionable owned-object lifecycle deltas within the repair bound", () => {
    const message = createEvaluationObservationFailureMessage({
      label: "Evaluator-authored observation",
      index: 0,
      kind: "owned_object_lifecycle_after_action",
      assertion: {
        kind: "owned_object_lifecycle_after_action",
        archetypeIds: ["player_projectile"],
        actionId: "shoot_action",
        requireActorOrigin: true,
        requireTargetInteraction: true,
      },
      actual: {
        before: [
          {
            archetypeId: "player_projectile",
            active: 0,
            actorOriginCreations: 0,
            created: 0,
            destroyed: 0,
            simulatedDistanceTraveled: 0,
            targetInteractions: 0,
          },
        ],
        after: [
          {
            archetypeId: "player_projectile",
            active: 0,
            actorOriginCreations: 0,
            created: 1,
            destroyed: 1,
            simulatedDistanceTraveled: 120,
            targetInteractions: 0,
          },
        ],
      },
    });

    expect(message.length).toBeLessThanOrEqual(500);
    expect(message).toContain('"createdDelta":1');
    expect(message).toContain('"actorOriginCreationsDelta":0');
    expect(message).toContain('"destroyedDelta":1');
    expect(message).toContain('"simulatedDistanceTraveledDelta":120');
    expect(message).toContain('"targetInteractionsDelta":0');
    expect(message).toContain('"activeDelta":0');
  });

  it("preserves actionable deltas when an owned-object rejection changes lifecycle activity", () => {
    const message = createEvaluationObservationFailureMessage({
      label: "Evaluator-authored observation",
      index: 0,
      kind: "owned_object_lifecycle_unchanged_after_action",
      assertion: {
        kind: "owned_object_lifecycle_unchanged_after_action",
        archetypeIds: ["player_projectile"],
        actionId: "shoot_action",
      },
      actual: {
        before: [
          {
            archetypeId: "player_projectile",
            active: 0,
            created: 0,
            destroyed: 0,
            simulatedDistanceTraveled: 0,
            targetInteractions: 0,
          },
        ],
        after: [
          {
            archetypeId: "player_projectile",
            active: 1,
            created: 1,
            destroyed: 0,
            simulatedDistanceTraveled: 0,
            targetInteractions: 0,
          },
        ],
      },
    });

    expect(message).toContain('"createdDelta":1');
    expect(message).toContain('"activeDelta":1');
  });

  it("preserves actionable deltas when immediate owned-object creation proof fails", () => {
    const message = createEvaluationObservationFailureMessage({
      label: "Evaluator-authored observation",
      index: 0,
      kind: "owned_object_creation_after_action",
      assertion: {
        kind: "owned_object_creation_after_action",
        archetypeIds: ["player_projectile"],
        actionId: "shoot_action",
        requireActorOrigin: true,
      },
      actual: {
        before: [
          {
            archetypeId: "player_projectile",
            active: 0,
            actorOriginCreations: 0,
            created: 0,
            destroyed: 0,
            simulatedDistanceTraveled: 0,
            targetInteractions: 0,
          },
        ],
        after: [
          {
            archetypeId: "player_projectile",
            active: 1,
            actorOriginCreations: 0,
            created: 1,
            destroyed: 0,
            simulatedDistanceTraveled: 0,
            targetInteractions: 0,
          },
        ],
      },
    });

    expect(message).toContain('"createdDelta":1');
    expect(message).toContain('"activeDelta":1');
    expect(message).toContain('"actorOriginCreationsDelta":0');
  });

  it("preserves actionable deltas when active owned-object progress proof fails", () => {
    const message = createEvaluationObservationFailureMessage({
      label: "Evaluator-authored observation",
      index: 0,
      kind: "owned_object_lifecycle_progress_after_action",
      assertion: {
        kind: "owned_object_lifecycle_progress_after_action",
        archetypeIds: ["player_projectile"],
        actionId: "shoot_action",
        requireActorOrigin: true,
      },
      actual: {
        before: [
          {
            archetypeId: "player_projectile",
            active: 0,
            actorOriginCreations: 0,
            created: 0,
            destroyed: 0,
            simulatedDistanceTraveled: 0,
            targetInteractions: 0,
          },
        ],
        after: [
          {
            archetypeId: "player_projectile",
            active: 1,
            actorOriginCreations: 1,
            created: 1,
            destroyed: 0,
            simulatedDistanceTraveled: 0,
            targetInteractions: 0,
          },
        ],
      },
    });

    expect(message).toContain('"createdDelta":1');
    expect(message).toContain('"simulatedDistanceTraveledDelta":0');
    expect(message).toContain('"activeDelta":1');
  });
});
