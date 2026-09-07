import { z } from "zod";

import {
  stableIdSchema,
  type MechanicIntent,
  type StableId,
} from "@/game-spec";
import {
  topDownGameSpecJsonSchema,
  type JsonSchemaObject,
} from "@/service/spec-generation/spec-generation-schema";

export const CREATOR_GENERATION_PLAN_TOOL =
  "return_top_down_creator_generation_plan";

const boundedStableIdListSchema = z.array(stableIdSchema).max(64);
const boundedTextSchema = z.string().min(1).max(600);

const mechanicIntentConfigurationValueTransportSchema = z
  .object({
    key: stableIdSchema,
    value: z.union([
      z.boolean(),
      z.number().finite(),
      z.string().max(600),
    ]),
  })
  .strict();

const mechanicIntentAmbiguityTransportSchema = z
  .object({
    id: stableIdSchema,
    description: boundedTextSchema,
    inferredValue: z.string().min(1).max(600),
    rationale: boundedTextSchema,
    reversible: z.literal(true),
  })
  .strict();

export const mechanicIntentTransportSchema = z
  .object({
    id: stableIdSchema,
    summary: boundedTextSchema,
    triggers: boundedStableIdListSchema,
    actors: boundedStableIdListSchema,
    targets: boundedStableIdListSchema,
    behaviors: boundedStableIdListSchema,
    ownedObjects: boundedStableIdListSchema,
    stateChanges: boundedStableIdListSchema,
    temporalRules: boundedStableIdListSchema,
    spatialRules: boundedStableIdListSchema,
    constraints: boundedStableIdListSchema,
    configuration: z
      .array(mechanicIntentConfigurationValueTransportSchema)
      .max(64),
    connections: z
      .array(
        z
          .object({
            direction: z.enum(["input", "output"]),
            port: stableIdSchema,
          })
          .strict()
      )
      .max(64),
    references: z
      .array(
        z
          .object({
            kind: z.enum(["asset", "entity", "objective", "region", "scene"]),
            id: stableIdSchema,
          })
          .strict()
      )
      .max(128),
    outcomes: boundedStableIdListSchema,
    requiredCapabilities: boundedStableIdListSchema,
    ambiguities: z.array(mechanicIntentAmbiguityTransportSchema).max(32),
  })
  .strict();

const creatorGenerationPlanEnvelopeTransportSchema = z
  .object({
    // The existing Spec Generation service remains the sole owner of validating
    // and repairing this candidate. The provider tool schema below is strict,
    // while this transport boundary intentionally admits an invalid candidate
    // so the existing repair loop can inspect it.
    gameSpec: z.record(z.string(), z.unknown()),
    mechanicIntent: mechanicIntentTransportSchema,
  })
  .strict();

const creatorGenerationPlanEnvelopePartsTransportSchema = z
  .object({
    gameSpec: z.record(z.string(), z.unknown()),
    mechanicIntent: z.unknown(),
  })
  .strict();

export type MechanicIntentTransport = z.infer<
  typeof mechanicIntentTransportSchema
>;

export type CreatorGenerationPlanEnvelope = Readonly<{
  gameSpec: Record<string, unknown>;
  mechanicIntent: MechanicIntent;
}>;

export type CreatorGenerationPlanIntentTransportIssue = Readonly<{
  path: string;
  code: StableId;
  message: string;
}>;

export type CreatorGenerationPlanEnvelopeParts = Readonly<{
  gameSpec: Record<string, unknown>;
  mechanicIntent:
    | Readonly<{
        status: "valid";
        value: MechanicIntent;
      }>
    | Readonly<{
        status: "invalid";
        summary?: string;
        issues: readonly CreatorGenerationPlanIntentTransportIssue[];
      }>;
}>;

export function parseCreatorGenerationPlanEnvelope(
  input: unknown
): CreatorGenerationPlanEnvelope {
  const parsed = creatorGenerationPlanEnvelopeTransportSchema.parse(input);

  return {
    gameSpec: parsed.gameSpec,
    mechanicIntent: normalizeMechanicIntent(parsed.mechanicIntent),
  };
}

export function parseCreatorGenerationPlanEnvelopeParts(
  input: unknown
): CreatorGenerationPlanEnvelopeParts {
  const parsed = creatorGenerationPlanEnvelopePartsTransportSchema.parse(input);
  const intent = mechanicIntentTransportSchema.safeParse(parsed.mechanicIntent);

  if (!intent.success) {
    const summary = getBoundedIntentSummary(parsed.mechanicIntent);
    const boundedIssues = intent.error.issues.slice(0, 127).map((issue) => ({
      path: ["mechanicIntent", ...issue.path].join("."),
      code: "invalid_intent_transport" as const,
      message: "Mechanic Intent did not match the planning transport schema.",
    }));
    if (intent.error.issues.length > boundedIssues.length) {
      boundedIssues.push({
        path: "mechanicIntent",
        code: "invalid_intent_transport",
        message:
          "Additional Mechanic Intent transport issues were omitted from this bounded report.",
      });
    }
    return {
      gameSpec: parsed.gameSpec,
      mechanicIntent: {
        status: "invalid",
        ...(summary ? { summary } : {}),
        issues: boundedIssues,
      },
    };
  }

  return {
    gameSpec: parsed.gameSpec,
    mechanicIntent: {
      status: "valid",
      value: normalizeMechanicIntent(intent.data),
    },
  };
}

function getBoundedIntentSummary(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || !("summary" in input)) {
    return undefined;
  }

  const summary = boundedTextSchema.safeParse(input.summary);
  return summary.success ? summary.data : undefined;
}

export const creatorGenerationPlanJsonSchema: JsonSchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["gameSpec", "mechanicIntent"],
  properties: {
    gameSpec: structuredClone(topDownGameSpecJsonSchema),
    mechanicIntent: createMechanicIntentJsonSchema(),
  },
};

function normalizeMechanicIntent(
  transport: MechanicIntentTransport
): MechanicIntent {
  return {
    ...transport,
    ambiguities: transport.ambiguities.map((ambiguity) => ({ ...ambiguity })),
  };
}

function createMechanicIntentJsonSchema(): JsonSchemaObject {
  const schema = z.toJSONSchema(mechanicIntentTransportSchema, {
    target: "draft-7",
    unrepresentable: "any",
    reused: "inline",
  }) as JsonSchemaObject;

  delete schema.$schema;
  normalizeStrictToolSchema(schema);
  return schema;
}

function normalizeStrictToolSchema(schema: JsonSchemaObject) {
  visitSchema(schema, (node) => {
    delete node.default;
    delete node.propertyNames;

    if (Object.hasOwn(node, "const")) {
      node.enum = [node.const];
      delete node.const;
    }

    if (node.oneOf) {
      node.anyOf = node.oneOf;
      delete node.oneOf;
    }

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
