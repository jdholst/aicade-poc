import { describe, expect, it } from "vitest";

import {
  GAME_SPEC_SCHEMA_VERSION,
  TOP_DOWN_TEMPLATE_ID,
  topDownSpecGenerationMechanicTypes,
} from "@/game-spec";

import {
  TOP_DOWN_GENERATION_CAPABILITY_POLICY,
  createTopDownGameSpecJsonSchema,
  createTopDownGenerationCapabilityPolicy,
  renderTopDownSpecGenerationCapabilityIntegrityRules,
  renderTopDownSpecGenerationGuide,
} from "./top-down-generation-capability-policy";

describe("Top-Down Generation Capability Policy", () => {
  it("drives the guide and strict schema narrowing from one policy", () => {
    const policy = createTopDownGenerationCapabilityPolicy();
    const guide = renderTopDownSpecGenerationGuide(policy);
    const promptPolicySurface = `${guide}\n${renderTopDownSpecGenerationCapabilityIntegrityRules(
      policy
    )}`;
    const schema = createTopDownGameSpecJsonSchema(policy);

    expect(policy).toEqual(TOP_DOWN_GENERATION_CAPABILITY_POLICY);
    expect(policy.schemaVersion).toBe(GAME_SPEC_SCHEMA_VERSION);
    expect(policy.templateId).toBe(TOP_DOWN_TEMPLATE_ID);
    expect(policy.allowedMechanics).toEqual(topDownSpecGenerationMechanicTypes);
    expect(policy.requiredMechanics).toEqual([
      "player_movement",
      "pickup_collection",
    ]);
    expect(policy.optionalMechanicLimit).toBe(1);
    expect(policy.entityRoles).toEqual([
      "player",
      "enemy",
      "pickup",
      "obstacle",
      "hazard",
    ]);
    expect(policy.assetRoles).toEqual(policy.entityRoles);
    expect(policy.maxEntities).toBe(12);
    expect(policy.maxAssets).toBe(12);
    expect(policy.maxObjectives).toBe(4);
    expect(policy.maxValidationGoals).toBe(4);
    expect(policy.minMechanics).toBe(2);
    expect(policy.maxMechanics).toBe(3);

    expect(guide).toContain(GAME_SPEC_SCHEMA_VERSION);
    expect(guide).toContain(TOP_DOWN_TEMPLATE_ID);
    expect(guide).toContain(
      "Include player_movement and pickup_collection, plus at most one early variation mechanic."
    );
    expect(guide).toContain(
      "Use layout primitives only: arena, walls, rectangular/circular obstacles, spawn zones, pickup zones, and optional regions."
    );
    expect(guide).toContain(
      "Use template placeholder assets only; do not generate asset packs, tilemaps, Phaser source, or GDD prose."
    );
    for (const forbiddenOutput of policy.forbiddenOutputs) {
      expect(promptPolicySurface).toContain(forbiddenOutput);
    }
    for (const mechanicType of policy.allowedMechanics) {
      expect(guide).toContain(mechanicType);
    }

    expect(schema.properties.template.properties.id.enum).toEqual([
      policy.templateId,
    ]);
    expect(schema.properties.entities.maxItems).toBe(policy.maxEntities);
    expect(schema.properties.assets.maxItems).toBe(policy.maxAssets);
    expect(schema.properties.objectives.maxItems).toBe(policy.maxObjectives);
    expect(schema.properties.validationGoals.minItems).toBe(1);
    expect(schema.properties.validationGoals.maxItems).toBe(
      policy.maxValidationGoals
    );
    expect(schema.properties.entities.items.properties.role.enum).toEqual(
      policy.entityRoles
    );
    expect(schema.properties.assets.items.properties.role.enum).toEqual(
      policy.assetRoles
    );
    expect(schema.properties.assets.items.properties.source.enum).toEqual([
      "template",
    ]);
    expect(schema.properties.mechanics.minItems).toBe(policy.minMechanics);
    expect(schema.properties.mechanics.maxItems).toBe(policy.maxMechanics);
    expect(schema.properties.mechanics.items.properties.type.enum).toEqual(
      policy.allowedMechanics
    );
    expect(schema.properties.mechanics.items.properties.config).toEqual({
      additionalProperties: false,
      properties: {},
      required: [],
      type: "object",
    });
  });
});
