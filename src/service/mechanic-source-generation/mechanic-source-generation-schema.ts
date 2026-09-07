import {
  MECHANIC_CAPABILITY_VERSION,
  STABLE_ID_PATTERN_SOURCE,
} from "@/game-spec";

import {
  GENERATED_MECHANIC_SOURCE_CALLBACK_KINDS,
  GENERATED_MECHANIC_SOURCE_CANDIDATE_VERSION,
} from "./mechanic-source-generation-service";

export const GENERATED_MECHANIC_SOURCE_TOOL = "emit_generated_mechanic_source";

export type MechanicSourceJsonSchema = {
  type?: "object" | "array" | "string" | "number" | "null";
  const?: string;
  enum?: readonly string[];
  properties?: Record<string, MechanicSourceJsonSchema>;
  required?: readonly string[];
  additionalProperties?: false;
  items?: MechanicSourceJsonSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  anyOf?: readonly MechanicSourceJsonSchema[];
};

const callbackSchema = {
  type: "object",
  properties: {
    id: { type: "string", pattern: STABLE_ID_PATTERN_SOURCE },
    kind: {
      type: "string",
      enum: GENERATED_MECHANIC_SOURCE_CALLBACK_KINDS,
    },
    source: { type: "string", minLength: 1, maxLength: 40_000 },
  },
  required: ["id", "kind", "source"],
  additionalProperties: false,
} as const satisfies MechanicSourceJsonSchema;

export const generatedMechanicSourceJsonSchema = {
  type: "object",
  properties: {
    schemaVersion: {
      type: "string",
      const: GENERATED_MECHANIC_SOURCE_CANDIDATE_VERSION,
    },
    id: { type: "string", pattern: STABLE_ID_PATTERN_SOURCE },
    contractId: { type: "string", pattern: STABLE_ID_PATTERN_SOURCE },
    capabilityVersion: {
      type: "string",
      const: MECHANIC_CAPABILITY_VERSION,
    },
    callbacks: {
      type: "array",
      items: callbackSchema,
      minItems: 1,
      maxItems: 32,
    },
  },
  required: [
    "schemaVersion",
    "id",
    "contractId",
    "capabilityVersion",
    "callbacks",
  ],
  additionalProperties: false,
} as const satisfies MechanicSourceJsonSchema;
