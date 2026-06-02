import { describe, expect, it } from "vitest";

import {
  createDebugSpecGenerationProvider,
  type DebugGenerationFailureMode,
} from "./debug-generation-provider";
import {
  generateTopDownGameSpec,
} from "./spec-generation-service";
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
