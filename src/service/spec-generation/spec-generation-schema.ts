import { z } from "zod";

import {
  topDownGameSpecSchema,
  TOP_DOWN_TEMPLATE_ID,
} from "@/game-spec/top-down-spec-schema";
import { topDownSpecGenerationMechanicTypes } from "@/game-spec/mechanics/mechanic-registry";

export const TOP_DOWN_GAME_SPEC_TOOL = "return_top_down_game_spec";

type JsonSchemaObject = {
  [key: string]: unknown;
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  anyOf?: JsonSchemaObject[];
  oneOf?: JsonSchemaObject[];
  required?: string[];
  enum?: unknown[];
  const?: unknown;
};

export const allowedTopDownSpecGenerationMechanics = [
  ...topDownSpecGenerationMechanicTypes,
] as const;

const openAiUnsupportedSchemaKeywords = [
  "default",
  "propertyNames",
  "patternProperties",
  "unevaluatedProperties",
  "dependentSchemas",
  "dependentRequired",
] as const;

export function createTopDownGameSpecJsonSchema(): JsonSchemaObject {
  const schema = z.toJSONSchema(topDownGameSpecSchema, {
    target: "draft-07",
    unrepresentable: "any",
    reused: "inline",
  }) as JsonSchemaObject;

  delete schema.$schema;
  normalizeForOpenAiStrictToolSchema(schema);
  applySpecGenerationNarrowing(schema);
  requireAllObjectPropertiesForOpenAi(schema);

  return schema;
}

export const topDownGameSpecJsonSchema = createTopDownGameSpecJsonSchema();

function normalizeForOpenAiStrictToolSchema(schema: JsonSchemaObject) {
  visitSchema(schema, (node) => {
    for (const keyword of openAiUnsupportedSchemaKeywords) {
      delete node[keyword];
    }

    if (Object.hasOwn(node, "const")) {
      node.enum = [node.const];
      delete node.const;
    }

    if (node.oneOf) {
      node.anyOf = node.oneOf;
      delete node.oneOf;
    }
  });
}

function applySpecGenerationNarrowing(schema: JsonSchemaObject) {
  const rootProperties = requireProperties(schema);
  delete rootProperties.extensions;
  requireFields(schema, [
    "schemaVersion",
    "id",
    "title",
    "currentIntentSummary",
    "originalPrompt",
    "template",
    "controls",
    "entities",
    "assets",
    "objectives",
    "validationGoals",
    "mechanics",
  ]);

  const template = requireProperty(schema, "template");
  requireProperty(template, "id").enum = [TOP_DOWN_TEMPLATE_ID];

  const config = requireProperty(template, "config");
  delete requireProperties(config).extensions;

  const scene = requireArrayItem(requireProperty(config, "scenes"));
  requireFields(scene, [
    "id",
    "name",
    "objectiveIds",
    "validationGoalIds",
    "arena",
    "layout",
  ]);

  const layout = requireProperty(scene, "layout");
  const spawnZone = requireArrayItem(requireProperty(layout, "spawnZones"));
  requireFields(spawnZone, ["id", "x", "y", "width", "height", "entityIds"]);
  requireProperty(layout, "spawnZones").minItems = 1;

  const pickupZone = requireArrayItem(requireProperty(layout, "pickupZones"));
  requireFields(pickupZone, ["id", "x", "y", "width", "height", "assetIds"]);
  requireProperty(layout, "pickupZones").minItems = 1;

  const entity = requireArrayItem(requireProperty(schema, "entities"));
  requireProperty(entity, "role").enum = [
    "player",
    "enemy",
    "pickup",
    "obstacle",
    "hazard",
  ];
  requireProperty(schema, "entities").maxItems = 12;

  const asset = requireArrayItem(requireProperty(schema, "assets"));
  requireProperty(asset, "role").enum = [
    "player",
    "enemy",
    "pickup",
    "obstacle",
    "hazard",
  ];
  requireProperty(asset, "source").enum = ["template"];
  requireProperty(schema, "assets").maxItems = 12;

  requireProperty(schema, "objectives").maxItems = 4;
  requireProperty(schema, "validationGoals").minItems = 1;
  requireProperty(schema, "validationGoals").maxItems = 4;

  const mechanics = requireProperty(schema, "mechanics");
  mechanics.minItems = 2;
  mechanics.maxItems = 3;

  const mechanic = requireArrayItem(mechanics);
  requireFields(mechanic, [
    "id",
    "type",
    "targetIds",
    "objectiveIds",
    "sceneIds",
    "regionIds",
    "assetIds",
    "config",
  ]);
  requireProperty(mechanic, "type").enum = [
    ...allowedTopDownSpecGenerationMechanics,
  ];

  const mechanicConfig = requireProperty(mechanic, "config");
  mechanicConfig.additionalProperties = false;
  mechanicConfig.required = [];
  mechanicConfig.properties = {};
}

function requireAllObjectPropertiesForOpenAi(schema: JsonSchemaObject) {
  visitSchema(schema, (node) => {
    if (node.properties) {
      node.additionalProperties = false;
      node.required = Object.keys(node.properties);
    }
  });
}

function visitSchema(
  schema: JsonSchemaObject,
  visitor: (schema: JsonSchemaObject) => void
) {
  visitor(schema);

  for (const child of Object.values(schema.properties ?? {})) {
    visitSchema(child, visitor);
  }

  if (schema.items) {
    visitSchema(schema.items, visitor);
  }

  for (const child of schema.anyOf ?? []) {
    visitSchema(child, visitor);
  }

  for (const child of schema.oneOf ?? []) {
    visitSchema(child, visitor);
  }
}

function requireProperties(schema: JsonSchemaObject) {
  if (!schema.properties) {
    schema.properties = {};
  }

  return schema.properties;
}

function requireProperty(schema: JsonSchemaObject, key: string) {
  const property = requireProperties(schema)[key];

  if (!property) {
    throw new Error(`Expected JSON Schema property "${key}".`);
  }

  return property;
}

function requireArrayItem(schema: JsonSchemaObject) {
  if (!schema.items) {
    throw new Error("Expected JSON Schema array item.");
  }

  return schema.items;
}

function requireFields(schema: JsonSchemaObject, fields: string[]) {
  schema.required = fields;
}
