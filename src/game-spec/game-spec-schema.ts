import { z } from "zod";

export const GAME_SPEC_SCHEMA_VERSION = "game-spec/v1";
export const MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION =
  "mechanic_port_connections/v1";
export const STABLE_ID_PATTERN_SOURCE =
  "^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$";
export const STABLE_ID_PATTERN = new RegExp(STABLE_ID_PATTERN_SOURCE);

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).every(([key, item]) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return false;
    }

    return isJsonValue(item);
  });
}

export const jsonValueSchema = z.custom<JsonValue>(isJsonValue, {
  message: "Game Spec JSON fields must contain only JSON-compatible values.",
});

export const stableIdSchema = z
  .string()
  .regex(
    STABLE_ID_PATTERN,
    "Use lowercase stable IDs with underscore-separated segments."
  );

const controlBindingSchema = z
  .object({
    id: stableIdSchema,
    action: stableIdSchema,
    label: z.string().min(1).max(64),
    kind: z.enum(["axis", "button", "toggle"]),
    keys: z.array(z.string().min(2).max(24)).min(1).max(8),
  })
  .strict();

const gameSpecEntitySchema = z
  .object({
    id: stableIdSchema,
    role: z.enum([
      "player",
      "enemy",
      "pickup",
      "projectile",
      "obstacle",
      "boss",
      "hazard",
      "ui_marker",
    ]),
    name: z.string().min(1).max(80),
  })
  .strict();

const gameSpecAssetSchema = z
  .object({
    id: stableIdSchema,
    role: z.string().min(1).max(48),
    name: z.string().min(1).max(80),
    source: z.enum([
      "template",
      "ai_generated",
      "uploaded",
      "remix_inherited",
      "external_import",
    ]),
  })
  .strict();

const gameSpecObjectiveSchema = z
  .object({
    id: stableIdSchema,
    label: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
    primary: z.boolean().default(false),
  })
  .strict();

const gameSpecValidationGoalSchema = z
  .object({
    id: stableIdSchema,
    label: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
    objectiveId: stableIdSchema.optional(),
  })
  .strict();

const gameSpecMechanicEntrySchema = z
  .object({
    id: stableIdSchema,
    type: stableIdSchema,
    entityIds: z.array(stableIdSchema).optional(),
    objectiveIds: z.array(stableIdSchema).optional(),
    sceneIds: z.array(stableIdSchema).optional(),
    regionIds: z.array(stableIdSchema).optional(),
    assetIds: z.array(stableIdSchema).optional(),
    config: z.record(z.string(), jsonValueSchema),
  })
  .strict();

const mechanicPortEndpointSchema = z
  .object({
    ownerKind: z.enum(["mechanic", "game_system"]),
    ownerId: stableIdSchema,
    portId: stableIdSchema,
  })
  .strict();

export const finalGameSpecMechanicConnectionPlanSchema = z
  .object({
    schemaVersion: z.literal(MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION),
    connections: z.array(
      z
        .object({
          id: stableIdSchema,
          output: mechanicPortEndpointSchema,
          input: mechanicPortEndpointSchema,
        })
        .strict()
    ),
  })
  .strict();

export const gameSpecSchema = z
  .object({
    schemaVersion: z.literal(GAME_SPEC_SCHEMA_VERSION),
    id: stableIdSchema,
    title: z.string().min(1).max(80),
    currentIntentSummary: z.string().min(1).max(240),
    originalPrompt: z.string().min(1).max(1000).optional(),
    template: z
      .object({
        id: stableIdSchema,
        version: z.string().min(1).max(40),
        config: z.record(z.string(), jsonValueSchema),
      })
      .strict(),
    controls: z.array(controlBindingSchema).min(1).max(12),
    entities: z.array(gameSpecEntitySchema).min(1).max(200),
    assets: z.array(gameSpecAssetSchema),
    objectives: z.array(gameSpecObjectiveSchema).min(1).max(20),
    validationGoals: z.array(gameSpecValidationGoalSchema),
    mechanics: z.array(gameSpecMechanicEntrySchema),
    mechanicConnections: finalGameSpecMechanicConnectionPlanSchema.optional(),
    extensions: z.record(z.string(), jsonValueSchema).optional(),
  })
  .strict();

export function parseGameSpec(input: unknown): GameSpec {
  return gameSpecSchema.parse(input);
}

export type StableId = z.infer<typeof stableIdSchema>;
export type GameSpec = z.infer<typeof gameSpecSchema>;
export type GameSpecObjective = z.infer<typeof gameSpecObjectiveSchema>;
export type GameSpecValidationGoal = z.infer<
  typeof gameSpecValidationGoalSchema
>;
export type GameSpecMechanicEntry = z.infer<
  typeof gameSpecMechanicEntrySchema
>;
export type FinalGameSpecMechanicConnectionPlan = z.infer<
  typeof finalGameSpecMechanicConnectionPlanSchema
>;
export type MechanicPortConnection =
  FinalGameSpecMechanicConnectionPlan["connections"][number];
export type MechanicPortEndpoint = MechanicPortConnection["output"];
