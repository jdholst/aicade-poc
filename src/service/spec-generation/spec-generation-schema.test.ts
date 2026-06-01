import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  GAME_SPEC_SCHEMA_VERSION,
  STABLE_ID_PATTERN_SOURCE,
  TOP_DOWN_TEMPLATE_ID,
  topDownGameSpecSchema,
  topDownSpecGenerationMechanicTypes,
  validateTopDownGameSpec,
} from "@/game-spec";
import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { TOP_DOWN_SPEC_GENERATION_GUIDE } from "./spec-generation-guide";
import {
  TOP_DOWN_GAME_SPEC_TOOL,
  allowedTopDownSpecGenerationMechanics,
  createTopDownGameSpecJsonSchema,
  topDownGameSpecJsonSchema,
} from "./spec-generation-schema";

describe("Spec Generation schema drift guards", () => {
  it("derives the provider schema from the authoritative top-down Zod schema", () => {
    const zodJsonSchema = z.toJSONSchema(topDownGameSpecSchema, {
      target: "draft-07",
      unrepresentable: "any",
      reused: "inline",
    }) as JsonSchemaObject;

    expect(createTopDownGameSpecJsonSchema()).toEqual(topDownGameSpecJsonSchema);
    expect(topDownGameSpecJsonSchema.properties.title).toEqual(
      zodJsonSchema.properties.title
    );
    expect(topDownGameSpecJsonSchema.properties.currentIntentSummary).toEqual(
      zodJsonSchema.properties.currentIntentSummary
    );
    expect(topDownGameSpecJsonSchema.properties.controls.maxItems).toBe(
      zodJsonSchema.properties.controls.maxItems
    );
  });

  it("shares core Game Spec constants with the authoritative Zod schemas", () => {
    expect(topDownGameSpecJsonSchema.properties.schemaVersion.enum).toEqual([
      GAME_SPEC_SCHEMA_VERSION,
    ]);
    expect(topDownGameSpecJsonSchema.properties.id.pattern).toBe(
      STABLE_ID_PATTERN_SOURCE
    );
    expect(topDownGameSpecJsonSchema.properties.template.properties.id.enum).toEqual(
      [TOP_DOWN_TEMPLATE_ID]
    );
    expect(TOP_DOWN_SPEC_GENERATION_GUIDE).toContain(GAME_SPEC_SCHEMA_VERSION);
    expect(TOP_DOWN_SPEC_GENERATION_GUIDE).toContain(TOP_DOWN_TEMPLATE_ID);
  });

  it("derives allowed generation mechanics from the top-down registry", () => {
    expect(allowedTopDownSpecGenerationMechanics).toEqual(
      topDownSpecGenerationMechanicTypes
    );

    for (const mechanicType of topDownSpecGenerationMechanicTypes) {
      expect(TOP_DOWN_SPEC_GENERATION_GUIDE).toContain(mechanicType);
      expect(
        JSON.stringify(topDownGameSpecJsonSchema.properties.mechanics)
      ).toContain(mechanicType);
    }
  });

  it("tells generation to keep pickup and spawn zone IDs out of mechanic regionIds", () => {
    expect(TOP_DOWN_SPEC_GENERATION_GUIDE).toContain(
      "Mechanic regionIds must reference layout.regions IDs only"
    );
    expect(TOP_DOWN_SPEC_GENERATION_GUIDE).toContain(
      "never use pickup zone or spawn zone IDs as regionIds"
    );
    expect(TOP_DOWN_SPEC_GENERATION_GUIDE).toContain(
      "Use an empty regionIds array when a mechanic does not target a named layout region"
    );
  });

  it("documents intentional provider-schema narrowing while Zod remains authoritative", () => {
    const fixture = getFirstValidTopDownGameSpecFixture();
    const mechanicProperties =
      topDownGameSpecJsonSchema.properties.mechanics.items.properties;

    expect(validateTopDownGameSpec(fixture)).toEqual(fixture);
    expect(topDownGameSpecJsonSchema.required).toContain("originalPrompt");
    expect(
      topDownGameSpecJsonSchema.properties.assets.items.properties.source.enum
    ).toEqual(["template"]);
    expect(topDownGameSpecJsonSchema.properties.mechanics.minItems).toBe(2);
    expect(topDownGameSpecJsonSchema.properties.mechanics.maxItems).toBe(3);
    expect(
      topDownGameSpecJsonSchema.properties.template.properties.config.properties
        .scenes.maxItems
    ).toBe(1);
    expect(mechanicProperties.entityIds).toBeDefined();
    expect(mechanicProperties.targetIds).toBeUndefined();
  });

  it("keeps the provider schema as a spec-only tool, not a source or Game Pack contract", () => {
    const serializedSchema = JSON.stringify(topDownGameSpecJsonSchema);

    expect(TOP_DOWN_GAME_SPEC_TOOL).toBe("return_top_down_game_spec");
    expect(serializedSchema).not.toContain("moduleSourceTs");
    expect(serializedSchema).not.toContain("moduleSourceJs");
    expect(serializedSchema).not.toContain("manifest");
    expect(serializedSchema).not.toContain("chatTranscript");
    expect(serializedSchema).not.toContain("project");
  });

  it("requires every object property for OpenAI strict tool compatibility", () => {
    const objectsWithProperties = collectObjectsWithProperties(
      topDownGameSpecJsonSchema
    );

    expect(objectsWithProperties.length).toBeGreaterThan(0);

    for (const { path, schema } of objectsWithProperties) {
      const propertyKeys = Object.keys(schema.properties);

      expect(schema.additionalProperties, path).toBe(false);
      expect(schema.required?.sort(), path).toEqual(propertyKeys.sort());
    }
  });

  it("omits JSON Schema keywords that OpenAI strict tools do not permit", () => {
    const serializedSchema = JSON.stringify(topDownGameSpecJsonSchema);

    expect(serializedSchema).not.toContain('"propertyNames"');
    expect(serializedSchema).not.toContain('"patternProperties"');
    expect(serializedSchema).not.toContain('"unevaluatedProperties"');
    expect(serializedSchema).not.toContain('"dependentSchemas"');
    expect(serializedSchema).not.toContain('"dependentRequired"');
    expect(serializedSchema).not.toContain('"default"');
  });
});

type JsonSchemaObject = {
  properties: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  anyOf?: JsonSchemaObject[];
  additionalProperties?: boolean;
  required?: string[];
  enum?: unknown[];
  maxItems?: number;
};

function collectObjectsWithProperties(
  schema: JsonSchemaObject,
  path = "root"
): { path: string; schema: JsonSchemaObject }[] {
  const matches = schema.properties ? [{ path, schema }] : [];

  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    matches.push(...collectObjectsWithProperties(child, `${path}.${key}`));
  }

  if (schema.items) {
    matches.push(...collectObjectsWithProperties(schema.items, `${path}[]`));
  }

  for (const [index, child] of (schema.anyOf ?? []).entries()) {
    matches.push(...collectObjectsWithProperties(child, `${path}.anyOf${index}`));
  }

  return matches;
}
