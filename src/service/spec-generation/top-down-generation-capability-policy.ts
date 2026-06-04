import {
  GAME_SPEC_SCHEMA_VERSION,
  type GameSpec,
  type StableId,
} from "@/game-spec/game-spec-schema";
import {
  TOP_DOWN_TEMPLATE_ID,
  type TopDownGameSpec,
} from "@/game-spec/top-down-spec-schema";
import { topDownSpecGenerationMechanicTypes } from "@/game-spec/mechanics/mechanic-registry";
import { JsonSchemaObject } from "./spec-generation-schema";
import type {
  SpecGenerationFailureStage,
  SpecGenerationIssue,
} from "./spec-generation-outcome";

export type TopDownGenerationCapabilityPolicy = {
  templateId: typeof TOP_DOWN_TEMPLATE_ID;
  schemaVersion: typeof GAME_SPEC_SCHEMA_VERSION;
  allowedMechanics: readonly StableId[];
  requiredMechanics: readonly StableId[];
  optionalMechanicLimit: number;
  entityRoles: readonly GameSpec["entities"][number]["role"][];
  assetRoles: readonly GameSpec["assets"][number]["role"][];
  maxEntities: number;
  maxAssets: number;
  maxObjectives: number;
  maxValidationGoals: number;
  minMechanics: number;
  maxMechanics: number;
  layoutRules: readonly string[];
  forbiddenOutputs: readonly string[];
};

const topDownGenerationEntityRoles = [
  "player",
  "enemy",
  "pickup",
  "obstacle",
  "hazard",
] as const satisfies readonly GameSpec["entities"][number]["role"][];

const openAiUnsupportedSchemaKeywords = [
  "default",
  "propertyNames",
  "patternProperties",
  "unevaluatedProperties",
  "dependentSchemas",
  "dependentRequired",
] as const;

export function createTopDownGenerationCapabilityPolicy(): TopDownGenerationCapabilityPolicy {
  return {
    templateId: TOP_DOWN_TEMPLATE_ID,
    schemaVersion: GAME_SPEC_SCHEMA_VERSION,
    allowedMechanics: [...topDownSpecGenerationMechanicTypes],
    requiredMechanics: ["player_movement", "pickup_collection"],
    optionalMechanicLimit: 1,
    entityRoles: topDownGenerationEntityRoles,
    assetRoles: topDownGenerationEntityRoles,
    maxEntities: 12,
    maxAssets: 12,
    maxObjectives: 4,
    maxValidationGoals: 4,
    minMechanics: 2,
    maxMechanics: 3,
    layoutRules: [
      "Use layout primitives only: arena, walls, rectangular/circular obstacles, spawn zones, pickup zones, and optional regions.",
      "Mechanic regionIds must reference layout.regions IDs only; never use pickup zone or spawn zone IDs as regionIds.",
      "Use an empty regionIds array when a mechanic does not target a named layout region.",
    ],
    forbiddenOutputs: [
      "Phaser source",
      "JavaScript",
      "TypeScript",
      "React",
      "HTML",
      "CSS",
      "Game Pack",
      "asset packs",
      "tilemaps",
      "tilemap JSON",
      "GDD",
      "GDD prose",
    ],
  };
}

export const TOP_DOWN_GENERATION_CAPABILITY_POLICY =
  createTopDownGenerationCapabilityPolicy();

export type TopDownGenerationPolicyFailure = {
  stage: Extract<
    SpecGenerationFailureStage,
    "schema_validation" | "semantic_validation" | "mechanic_validation"
  >;
  validationIssues: SpecGenerationIssue[];
};

export function renderTopDownSpecGenerationGuide(
  policy: TopDownGenerationCapabilityPolicy
) {
  return [
    "Return only a complete TopDownGameSpec for the Phaser top-down runtime.",
    `Use schemaVersion ${policy.schemaVersion} and template.id ${policy.templateId}.`,
    "Use exactly one scene and exactly one primary objective.",
    "Use stable IDs for every entity, asset, objective, validation goal, scene, zone, and mechanic.",
    ...policy.layoutRules,
    `Use only these mechanics: ${renderAllowedMechanicList(policy)}. Include ${renderRequiredMechanicList(
      policy
    )}, plus at most ${renderOptionalMechanicLimit(
      policy.optionalMechanicLimit
    )} early variation mechanic.`,
    "Use template placeholder assets only; do not generate asset packs, tilemaps, Phaser source, or GDD prose.",
    "Do not include unsupported fields, unsupported mechanics, unresolved references, or behavior outside the current mechanic registry.",
  ].join("\n");
}

export function renderTopDownSpecGenerationCapabilityIntegrityRules(
  policy: TopDownGenerationCapabilityPolicy
) {
  return [
    "Capability-integrity rules:",
    "- Do not generate Phaser source, JavaScript, TypeScript, React, HTML, CSS, a Game Pack, asset packs, tilemap JSON, or a GDD.",
    `- Do not invent mechanics outside: ${renderAllowedMechanicList(policy)}.`,
    "- Do not include custom mechanic manifests or runtime extension code.",
    "- Do not include unsupported fields or unresolved stable ID references.",
    "- Do not describe behavior that cannot be represented by the returned TopDownGameSpec.",
  ].join("\n");
}

export function getTopDownGenerationPolicyFailure(
  spec: TopDownGameSpec,
  policy: TopDownGenerationCapabilityPolicy
): TopDownGenerationPolicyFailure | undefined {
  const requiredMechanicIssues = getTopDownRequiredGenerationMechanicIssues(
    spec,
    policy
  );

  if (requiredMechanicIssues.length > 0) {
    return {
      stage: "mechanic_validation",
      validationIssues: requiredMechanicIssues,
    };
  }

  return undefined;
}

function getTopDownRequiredGenerationMechanicIssues(
  spec: TopDownGameSpec,
  policy: TopDownGenerationCapabilityPolicy
): SpecGenerationIssue[] {
  const mechanicTypes = new Set(spec.mechanics.map((mechanic) => mechanic.type));

  return policy.requiredMechanics
    .filter((mechanicType) => !mechanicTypes.has(mechanicType))
    .map((mechanicType) => ({
      path: "mechanics",
      code: "missing_required_generation_mechanic",
      message: `Missing required generation mechanic "${mechanicType}".`,
    }));
}

function applyTopDownSpecGenerationSchemaNarrowing(
  schema: JsonSchemaObject,
  policy: TopDownGenerationCapabilityPolicy
) {
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
  requireProperty(template, "id").enum = [policy.templateId];

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
  requireProperty(entity, "role").enum = [...policy.entityRoles];
  requireProperty(schema, "entities").maxItems = policy.maxEntities;

  const asset = requireArrayItem(requireProperty(schema, "assets"));
  requireProperty(asset, "role").enum = [...policy.assetRoles];
  requireProperty(asset, "source").enum = ["template"];
  requireProperty(schema, "assets").maxItems = policy.maxAssets;

  requireProperty(schema, "objectives").maxItems = policy.maxObjectives;
  requireProperty(schema, "validationGoals").minItems = 1;
  requireProperty(schema, "validationGoals").maxItems =
    policy.maxValidationGoals;

  const mechanics = requireProperty(schema, "mechanics");
  mechanics.minItems = policy.minMechanics;
  mechanics.maxItems = policy.maxMechanics;

  const mechanic = requireArrayItem(mechanics);
  requireFields(mechanic, [
    "id",
    "type",
    "entityIds",
    "objectiveIds",
    "sceneIds",
    "regionIds",
    "assetIds",
    "config",
  ]);
  requireProperty(mechanic, "type").enum = [...policy.allowedMechanics];

  const mechanicConfig = requireProperty(mechanic, "config");
  mechanicConfig.additionalProperties = false;
  mechanicConfig.required = [];
  mechanicConfig.properties = {};
}

function renderAllowedMechanicList(policy: TopDownGenerationCapabilityPolicy) {
  return policy.allowedMechanics.join(", ");
}

function renderRequiredMechanicList(policy: TopDownGenerationCapabilityPolicy) {
  return policy.requiredMechanics.join(" and ");
}

function renderOptionalMechanicLimit(limit: number) {
  return limit === 1 ? "one" : String(limit);
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

export function applyTopDownSpecGenerationPolicy(schema: JsonSchemaObject, policy: TopDownGenerationCapabilityPolicy) {
  normalizeForOpenAiStrictToolSchema(schema);
  applyTopDownSpecGenerationSchemaNarrowing(schema, policy);
  requireAllObjectPropertiesForOpenAi(schema);
}
