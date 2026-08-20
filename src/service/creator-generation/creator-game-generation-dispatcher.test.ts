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
          generationRunId: "generation_run_rejected",
          plan,
          request: { prompt: "make an unsupported mechanic" },
          signal: new AbortController().signal,
        })
      ).resolves.toEqual({ kind: "rejected", evidence, routeKind: kind });
      expect(continueGeneratedMechanicGeneration).not.toHaveBeenCalled();
    }
  );
});
