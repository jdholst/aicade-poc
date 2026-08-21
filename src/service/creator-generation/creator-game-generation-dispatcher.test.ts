import { describe, expect, it, vi } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { dispatchCreatorGenerationPlan } from "./creator-game-generation-dispatcher";

const metadata = {
  attemptCount: 1,
  model: "gpt-5.4-mini" as const,
  taskRoute: "spec_generation.primary" as const,
};

describe("dispatchCreatorGenerationPlan", () => {
  it("returns the exact legacy Phaser result without invoking generated stages", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const continueGeneratedMechanicGeneration = vi.fn();
    const plan = { metadata, runtimeKind: "phaser" as const, spec };

    await expect(
      dispatchCreatorGenerationPlan({
        continueGeneratedMechanicGeneration,
        generationRunId: "generation_run_builtin",
        plan,
        request: { prompt: "make a crystal chase" },
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({ kind: "built_in", result: plan });
    expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
  });

  it("spends generated work only for an admitted generated mechanic", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const signal = new AbortController().signal;
    const routing = {
      kind: "generated_mechanic" as const,
      generationRunId: "generation_run_generated",
      intent: {
        id: "intent_dash",
        summary: "Dash through hazards",
        triggers: ["input_dash"],
        actors: ["player"],
        targets: [],
        behaviors: ["dash"],
        ownedObjects: [],
        stateChanges: ["dash_active"],
        temporalRules: [],
        spatialRules: [],
        constraints: [],
        configuration: [],
        connections: [],
        references: [{ kind: "entity" as const, id: spec.entities[0].id }],
        outcomes: ["player_moves_quickly"],
        requiredCapabilities: ["object_motion_write"],
        ambiguities: [],
      },
      admittedRequest: {
        kind: "generated_mechanic_request" as const,
        generationRunId: "generation_run_generated",
        resolution: {
          kind: "generated" as const,
          intentId: "intent_dash",
          requiredCapabilities: ["object_motion_write"],
        },
        constraintSet: {
          schemaVersion: "generation_constraint_set/v1" as const,
          capabilityVersion: "mechanic_capability/v1",
          availableCapabilities: ["object_motion_write"],
          maxGeneratedMechanics: 1,
          maxContractRepairAttempts: 1,
          maxSourceRepairAttempts: 1,
          maxFinalGameSpecRepairAttempts: 1,
          resourceBudgetProfile: "generated_mechanic_default",
        },
      },
    };
    const plan = { metadata, routing, runtimeKind: "phaser" as const, spec };
    const accepted = {
      outcome: "accepted" as const,
      gamePack: { id: "game_pack_generated" },
    };
    const continueGeneratedMechanicGeneration = vi
      .fn()
      .mockResolvedValue(accepted);

    await expect(
      dispatchCreatorGenerationPlan({
        continueGeneratedMechanicGeneration,
        generationRunId: "generation_run_generated",
        plan,
        request: {
          openAiApiKey: "test-key",
          prompt: "   ",
        },
        signal,
      })
    ).resolves.toEqual({ kind: "generated_mechanic", result: accepted });
    expect(continueGeneratedMechanicGeneration).toHaveBeenCalledWith({
      context: expect.objectContaining({
        cancellationEpoch: 0,
        generationRunId: "generation_run_generated",
        requestSummary: "Generate a Phaser game.",
        routeKind: "generated_mechanic",
        runtimeKind: "phaser",
        signal,
        trustMode: "browser_authenticated",
      }),
      plan,
      request: {
        openAiApiKey: "test-key",
        prompt: "   ",
      },
      routing,
    });
  });

  it.each(["clarification_failure", "capability_gap", "constraint_conflict"] as const)(
    "terminates %s routing before generated work",
    async (kind) => {
      const spec = getFirstValidTopDownGameSpecFixture();
      const continueGeneratedMechanicGeneration = vi.fn();
      const evidence = {
        stage: "routing" as const,
        code:
          kind === "capability_gap"
            ? ("capability_gap" as const)
            : kind === "constraint_conflict"
              ? ("generated_mechanic_limit_exceeded" as const)
              : ("clarification_required" as const),
        ...(kind === "capability_gap"
          ? { missingCapabilities: ["object_create"] }
          : {}),
        issues: [
          {
            path: "intent",
            code: "routing_rejected",
            message: "The request cannot enter generated execution.",
          },
        ],
      };
      const plan = {
        metadata,
        routing: {
          kind,
          generationRunId: "generation_run_rejected",
          intentId: "intent_rejected",
          evidence,
        },
        runtimeKind: "phaser" as const,
        spec,
      };

      await expect(
        dispatchCreatorGenerationPlan({
          continueGeneratedMechanicGeneration,
          degradedGenerationFallbackEnabled: false,
          generationRunId: "generation_run_rejected",
          plan,
          request: { prompt: "make an unsupported mechanic" },
          signal: new AbortController().signal,
        })
      ).resolves.toEqual({ kind: "rejected", evidence, routeKind: kind });
      expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
    }
  );

  it("returns the exact playable base game as degraded when a generated-host capability gap is safely omittable", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const continueGeneratedMechanicGeneration = vi.fn();
    const evidence = {
      stage: "routing" as const,
      code: "capability_gap" as const,
      missingCapabilities: ["object_motion_write"],
      issues: [
        {
          path: "intent.requiredCapabilities",
          code: "independent_visible_effect_unavailable",
          message:
            "The generated host cannot independently prove the requested behavior.",
        },
      ],
    };
    const plan = {
      metadata,
      routing: {
        kind: "capability_gap" as const,
        generationRunId: "generation_run_degraded",
        intentId: "intent_optional_dash",
        evidence,
      },
      runtimeKind: "phaser" as const,
      spec,
    };

    await expect(
      dispatchCreatorGenerationPlan({
        continueGeneratedMechanicGeneration,
        generationRunId: "generation_run_degraded",
        plan,
        request: {
          prompt:
            "Create a collection game and add a dash when movement is pressed.",
        },
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({
      kind: "degraded",
      generationRunId: "generation_run_degraded",
      result: {
        metadata,
        runtimeKind: "phaser",
        spec,
      },
      warning: {
        schemaVersion: "degraded_creator_generation/v1",
        stage: "mechanic_validation",
        code: "generated_mechanic_omitted",
        intentId: "intent_optional_dash",
        summary: "Game generated with limited functionality.",
        omittedBehavior:
          "The requested mechanic could not be safely added. The playable base game was generated without it.",
        issues: evidence.issues,
        retryable: true,
        generatedWorkState: "not_started",
        routingFailure: {
          kind: "capability_gap",
          evidence,
        },
        policyDecision: {
          status: "eligible",
          code: "trusted_base_game_independent",
        },
        fallbackValidation: {
          status: "passed",
          gameSpecId: spec.id,
          mechanicTypes: spec.mechanics.map((mechanic) => mechanic.type),
          primaryObjectiveId: spec.objectives.find(
            (objective) => objective.primary
          )?.id,
        },
      },
    });
    expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
  });

  it("returns degraded when the optional Mechanic Intent transport fails but the exact base game remains independently playable", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const continueGeneratedMechanicGeneration = vi.fn();
    const issue = {
      path: "mechanicIntent.references.0.id",
      code: "invalid_intent_transport" as const,
      message: "Mechanic Intent did not match the planning transport schema.",
    };

    await expect(
      dispatchCreatorGenerationPlan({
        continueGeneratedMechanicGeneration,
        generationRunId: "generation_run_invalid_intent_fallback",
        plan: {
          metadata,
          routing: {
            kind: "intent_validation_failure",
            generationRunId: "generation_run_invalid_intent_fallback",
            evidence: {
              stage: "routing",
              code: "invalid_intent_transport",
              issues: [issue],
            },
          },
          runtimeKind: "phaser",
          spec,
        },
        request: { prompt: "Make a collection game with an optional flourish." },
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({
      kind: "degraded",
      generationRunId: "generation_run_invalid_intent_fallback",
      result: { spec },
      warning: {
        code: "generated_mechanic_omitted",
        issues: [issue],
      },
    });
    expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
  });

  it("degrades a safe built-in base game after stripping provider-authored mechanic connections", async () => {
    const fixture = getFirstValidTopDownGameSpecFixture();
    const pickupMechanic = fixture.mechanics.find(
      ({ type }) => type === "pickup_collection"
    );
    expect(pickupMechanic).toBeDefined();
    const spec = {
      ...fixture,
      mechanicConnections: {
        schemaVersion: "mechanic_port_connections/v1" as const,
        connections: [
          {
            id: "collection_objective_progress",
            output: {
              ownerKind: "mechanic" as const,
              ownerId: pickupMechanic!.id,
              portId: "objective_progress",
            },
            input: {
              ownerKind: "game_system" as const,
              ownerId: "objective_tracker",
              portId: "objective_progress",
            },
          },
        ],
      },
    };
    const evidence = {
      stage: "routing" as const,
      code: "capability_gap" as const,
      missingCapabilities: ["object_motion_write"],
      issues: [
        {
          path: "intent.requiredCapabilities",
          code: "missing_capability",
          message: "The selected host cannot provide motion.",
        },
      ],
    };
    const continueGeneratedMechanicGeneration = vi.fn();

    await expect(
      dispatchCreatorGenerationPlan({
        continueGeneratedMechanicGeneration,
        generationRunId: "generation_run_fallback_fatal",
        plan: {
          metadata,
          routing: {
            kind: "capability_gap",
            generationRunId: "generation_run_fallback_fatal",
            intentId: "intent_optional_dash",
            evidence,
          },
          runtimeKind: "phaser",
          spec,
        },
        request: { prompt: "Make a collection game with a dash." },
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({
      kind: "degraded",
      generationRunId: "generation_run_fallback_fatal",
      result: {
        spec: {
          id: fixture.id,
          mechanicConnections: {
            schemaVersion: "mechanic_port_connections/v1",
            connections: [],
          },
        },
      },
      warning: {
        code: "generated_mechanic_omitted",
        policyDecision: {
          code: "trusted_base_game_independent",
        },
      },
    });
    expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
    expect(spec.mechanicConnections.connections).toHaveLength(1);
  });

  it("does not rewrite cancellation as degraded success", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const continueGeneratedMechanicGeneration = vi.fn();
    const controller = new AbortController();
    controller.abort("cancelled");

    await expect(
      dispatchCreatorGenerationPlan({
        continueGeneratedMechanicGeneration,
        generationRunId: "generation_run_degraded_cancelled",
        plan: {
          metadata,
          routing: {
            kind: "capability_gap",
            generationRunId: "generation_run_degraded_cancelled",
            intentId: "intent_cancelled_dash",
            evidence: {
              stage: "routing",
              code: "capability_gap",
              missingCapabilities: ["object_motion_write"],
              issues: [
                {
                  path: "intent.requiredCapabilities",
                  code: "missing_capability",
                  message: "The selected host cannot provide motion.",
                },
              ],
            },
          },
          runtimeKind: "phaser",
          spec,
        },
        request: { prompt: "Make a collection game with a dash." },
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
  });
});
