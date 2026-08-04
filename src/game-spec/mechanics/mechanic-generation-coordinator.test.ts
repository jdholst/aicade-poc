import { describe, expect, it } from "vitest";

import {
  coordinateMechanicGeneration,
  PHASE_9_GENERATION_CONSTRAINT_SET,
  type BuiltInMechanicResolution,
  type GeneratedMechanicResolution,
} from "..";

const generatedResolution: GeneratedMechanicResolution = {
  kind: "generated_mechanic",
  intentId: "intent_seeded_hazards",
  candidateBuiltInTypes: [],
  assumptions: [],
  coverage: {
    coveredRequirements: [],
    uncoveredRequirements: [
      {
        category: "behavior",
        value: "spawn_owned_object",
        coveredBy: [],
      },
    ],
  },
};

describe("coordinateMechanicGeneration", () => {
  it("admits one custom mechanic with the internal Phase 9 constraint set", () => {
    expect(
      coordinateMechanicGeneration({
        generationRunId: "generation_run_seeded_hazards",
        resolutions: [generatedResolution],
      })
    ).toEqual({
      kind: "generation_admitted",
      generationRunId: "generation_run_seeded_hazards",
      requests: [
        {
          resolution: generatedResolution,
          constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
        },
      ],
    });

    expect(PHASE_9_GENERATION_CONSTRAINT_SET).toEqual({
      schemaVersion: "generation-constraint-set/v1",
      id: "phase_9_generation_constraints",
      maximumGeneratedMechanicsPerRun: 1,
      capabilityVersion: "mechanic_capability/v1",
      admittedCapabilities: [
        "object_read",
        "object_create",
        "object_motion_write",
        "object_destroy",
        "spatial_query",
        "state_read",
        "state_write",
        "time_read",
        "time_schedule",
        "random_next",
        "event_subscribe",
        "signal_emit",
      ],
      resourceBudgetProfile: "phase_9_fixed_budget",
      configDslComplexity: {
        maximumDepth: 4,
        maximumFields: 32,
        maximumCollectionItems: 32,
      },
      evidenceRequirements: {
        minimumBehaviorScenarios: 1,
        minimumExternalAcceptanceObservations: 1,
      },
      maximumRepairAttempts: {
        contract: 3,
        source: 3,
        finalGameSpec: 3,
      },
    });
  });

  it("rejects multiple custom mechanics with structured constraint evidence", () => {
    const secondResolution: GeneratedMechanicResolution = {
      ...generatedResolution,
      intentId: "intent_temporary_modifier",
    };

    expect(
      coordinateMechanicGeneration({
        generationRunId: "generation_run_multiple_custom",
        resolutions: [generatedResolution, secondResolution],
      })
    ).toEqual({
      kind: "constraint_conflict",
      generationRunId: "generation_run_multiple_custom",
      evidence: {
        stage: "coordination",
        code: "generated_mechanic_limit_exceeded",
        constraintSetId: "phase_9_generation_constraints",
        intentIds: ["intent_seeded_hazards", "intent_temporary_modifier"],
        actualGeneratedMechanicCount: 2,
        maximumGeneratedMechanicCount: 1,
        message:
          "Generation Constraint Set phase_9_generation_constraints allows 1 generated mechanic per GenerationRun, but received 2.",
      },
    });
  });

  it("leaves built-in-only generation outside generated-mechanic limits", () => {
    const builtInResolution: BuiltInMechanicResolution = {
      kind: "built_in",
      intentId: "intent_player_movement",
      mechanicType: "player_movement",
      assumptions: [],
      coverage: {
        coveredRequirements: [],
        uncoveredRequirements: [],
      },
    };

    expect(
      coordinateMechanicGeneration({
        generationRunId: "generation_run_built_in_only",
        resolutions: [builtInResolution],
      })
    ).toEqual({
      kind: "generation_not_required",
      generationRunId: "generation_run_built_in_only",
      resolutions: [builtInResolution],
    });
  });

  it("creates a request-scoped constraint snapshot for each coordination", () => {
    const first = coordinateMechanicGeneration({
      generationRunId: "generation_run_first_snapshot",
      resolutions: [generatedResolution],
    });
    const second = coordinateMechanicGeneration({
      generationRunId: "generation_run_second_snapshot",
      resolutions: [generatedResolution],
    });

    expect(first.kind).toBe("generation_admitted");
    expect(second.kind).toBe("generation_admitted");

    if (
      first.kind === "generation_admitted" &&
      second.kind === "generation_admitted"
    ) {
      expect(first.requests[0].constraintSet).not.toBe(
        PHASE_9_GENERATION_CONSTRAINT_SET
      );
      expect(first.requests[0].constraintSet).not.toBe(
        second.requests[0].constraintSet
      );
    }
  });
});
