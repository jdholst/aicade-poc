import { describe, expect, it } from "vitest";

import { DEFAULT_OPENAI_MODEL } from "@/constants";

import {
  createDebugSpecGenerationProvider,
  resolveDebugSpecGenerationAdapter,
  type DebugGenerationFailureMode,
} from "./debug-generation-provider";
import { generateTopDownGameSpec } from "./spec-generation-service";
import type { SpecGenerationFailureStage } from "./spec-generation-outcome";

describe("Debug Spec Generation provider", () => {
  it.each([
    {
      mode: "missing_primary_objective",
      stage: "semantic_validation",
      expectedPath: "objectives",
    },
    {
      mode: "missing_entity_reference",
      stage: "semantic_validation",
      expectedPath: "mechanics.mechanic_player_movement.entityIds",
    },
    {
      mode: "invalid_validation_goal_target",
      stage: "semantic_validation",
      expectedPath: "validationGoals.validation_collectible_reachable.objectiveId",
    },
    {
      mode: "player_spawn_outside_arena",
      stage: "semantic_validation",
      expectedPath: "scenes.scene_arena.layout.spawnZones.spawn_player",
    },
    {
      mode: "duplicate_primary_objectives",
      stage: "semantic_validation",
      expectedPath: "objectives",
    },
    {
      mode: "unsupported_mechanic_target",
      stage: "mechanic_validation",
      expectedPath: "mechanics.mechanic_player_movement.entityIds",
    },
  ] satisfies {
    mode: DebugGenerationFailureMode;
    stage: SpecGenerationFailureStage;
    expectedPath: string;
  }[])(
    "returns a schema-valid candidate that fails $stage for $mode",
    async ({ mode, stage, expectedPath }) => {
      const prompt = `Debug ${mode}`;
      const result = await generateTopDownGameSpec({
        prompt,
        model: "gpt-5.4-mini",
        providerCredential: "debug-generation",
        provider: createDebugSpecGenerationProvider({ mode }),
        includeDebugCandidate: true,
      });

      expect(result).toMatchObject({
        ok: false,
        stage,
        taskRoute: "spec_generation.primary",
        attemptCount: 2,
        debugCandidate: expect.objectContaining({
          originalPrompt: prompt,
        }),
      });
      expect(result.validationIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expectedPath,
          }),
        ])
      );
    }
  );
});

describe("resolveDebugSpecGenerationAdapter", () => {
  it("stays inactive when no valid debug trigger is configured", () => {
    expect(resolveDebugSpecGenerationAdapter({})).toEqual({
      type: "inactive",
    });
    expect(
      resolveDebugSpecGenerationAdapter({
        AICADE_DEBUG_SPEC_GENERATION_FAILURE: "unknown_failure",
        NODE_ENV: "development",
      })
    ).toEqual({
      type: "inactive",
    });
  });

  it("selects the local debug success adapter in development", async () => {
    const adapter = resolveDebugSpecGenerationAdapter({
      AICADE_DEBUG_SPEC_GENERATION_SUCCESS: "1",
      NODE_ENV: "development",
    });

    expect(adapter).toMatchObject({
      type: "active",
      mode: "success",
      model: DEFAULT_OPENAI_MODEL,
      providerCredential: "debug-generation",
    });

    if (adapter.type !== "active") {
      throw new Error("Expected an active debug adapter.");
    }

    const candidate = await adapter.provider({
      prompt: "Make a tiny top-down collection game.",
      model: adapter.model,
      providerCredential: adapter.providerCredential,
      taskRoute: "spec_generation.primary",
    });

    expect(candidate).toMatchObject({
      originalPrompt: "Make a tiny top-down collection game.",
    });
  });

  it("selects an allowlisted local debug failure adapter in development", async () => {
    const adapter = resolveDebugSpecGenerationAdapter({
      AICADE_DEBUG_SPEC_GENERATION_FAILURE: "missing_entity_reference",
      NODE_ENV: "development",
    });

    expect(adapter).toMatchObject({
      type: "active",
      failureMode: "missing_entity_reference",
      mode: "failure",
      providerCredential: "debug-generation",
    });

    if (adapter.type !== "active") {
      throw new Error("Expected an active debug adapter.");
    }

    const candidate = await adapter.provider({
      prompt: "Make a tiny top-down collection game.",
      model: adapter.model,
      providerCredential: adapter.providerCredential,
      taskRoute: "spec_generation.primary",
    });

    expect(candidate).toMatchObject({
      originalPrompt: "Make a tiny top-down collection game.",
    });
    expect(candidate.mechanics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "mechanic_player_movement",
          entityIds: ["entity_missing"],
        }),
      ])
    );
  });

  it("lets the debug success adapter win when success and failure triggers are both configured", () => {
    expect(
      resolveDebugSpecGenerationAdapter({
        AICADE_DEBUG_SPEC_GENERATION_FAILURE: "missing_entity_reference",
        AICADE_DEBUG_SPEC_GENERATION_SUCCESS: "1",
        NODE_ENV: "development",
      })
    ).toMatchObject({
      type: "active",
      mode: "success",
    });
  });

  it.each([
    {
      env: {
        AICADE_DEBUG_SPEC_GENERATION_FAILURE: "missing_entity_reference",
        NODE_ENV: "production",
      },
    },
    {
      env: {
        AICADE_DEBUG_SPEC_GENERATION_SUCCESS: "1",
        NODE_ENV: "production",
      },
    },
  ])("blocks valid debug triggers in production", ({ env }) => {
    expect(resolveDebugSpecGenerationAdapter(env)).toEqual({
      type: "blocked",
      userMessage: "Debug Spec Generation is disabled in production.",
    });
  });
});
