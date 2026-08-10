import { GENERATED_MECHANIC_SOURCE_CANDIDATE_VERSION } from "./mechanic-source-generation-service";

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
  minimum?: number;
  maximum?: number;
  anyOf?: readonly MechanicSourceJsonSchema[];
};

const callbackSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1, maxLength: 80 },
    kind: {
      type: "string",
      enum: [
        "install",
        "logical_action",
        "gameplay_event",
        "scheduled",
        "fixed_step",
        "dispose",
      ],
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
    id: { type: "string", minLength: 1, maxLength: 80 },
    contractId: { type: "string", minLength: 1, maxLength: 80 },
    capabilityVersion: { type: "string", minLength: 1, maxLength: 80 },
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
