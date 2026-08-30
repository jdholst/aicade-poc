import { z } from "zod";
import { openAiProviderUsageReceiptSchema } from "@/service/openai-provider-usage-receipt";

import {
  artifactScopedRepairArtifactIdSchema,
  artifactScopedRepairAttemptIdSchema,
  generatedMechanicContractSchema,
  generationConstraintSetSchema,
  stableIdSchema,
  type MechanicIntent,
} from "@/game-spec";
import { jsonValueSchema } from "@/game-spec/game-spec-schema";
import {
  mechanicIntentTransportSchema,
  parseCreatorGenerationPlanEnvelope,
  type MechanicIntentTransport,
} from "@/service/creator-generation-planning/creator-generation-planning-schema";

export const GENERATED_MECHANIC_PROVIDER_REQUEST_VERSION =
  "generated_mechanic_provider_request/v1" as const;
export const GENERATED_MECHANIC_PROVIDER_RESPONSE_VERSION =
  "generated_mechanic_provider_response/v1" as const;

const positiveIntegerSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const nonnegativeIntegerSchema = z.number().int().nonnegative();
const boundedTextSchema = z.string().min(1).max(600);
const attemptKindSchema = z.enum(["initial", "repair"]);

const repairIssueSchema = z
  .object({
    path: z.string().min(1).max(240),
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(500),
  })
  .strict();

const repairPayloadSchema = z
  .object({
    trigger: z.enum(["stage_failure", "upstream_invalidation"]),
    failureAttemptId: artifactScopedRepairAttemptIdSchema,
    issues: z.array(repairIssueSchema).max(256),
    invalidatedArtifactIds: z
      .array(artifactScopedRepairArtifactIdSchema)
      .max(64),
  })
  .strict()
  .superRefine((repair, context) => {
    if (repair.trigger === "stage_failure" && repair.issues.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["issues"],
        message: "Stage-failure repair requires exact issue feedback.",
      });
    }

    if (
      repair.trigger === "upstream_invalidation" &&
      repair.issues.length > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["issues"],
        message:
          "Upstream invalidation must not copy upstream issues into the downstream attempt.",
      });
    }
  });

const providerConfigSchema = z
  .object({
    openAiApiKey: z.string().min(1).max(300).optional(),
    openAiKeyword: z.string().min(1).max(80).optional(),
    openAiModel: z.string().min(1).max(80).optional(),
  })
  .strict();

const resolutionAssumptionSchema = z
  .object({
    ambiguityId: stableIdSchema,
    description: boundedTextSchema,
    inferredValue: boundedTextSchema,
    rationale: boundedTextSchema,
    reversible: z.literal(true),
  })
  .strict();

const mechanicRequirementCategorySchema = z.enum([
  "actor",
  "behavior",
  "configuration",
  "connection",
  "constraint",
  "outcome",
  "owned_object",
  "reference",
  "spatial_rule",
  "state_change",
  "target",
  "temporal_rule",
  "trigger",
]);

const coverageRequirementSchema = z
  .object({
    category: mechanicRequirementCategorySchema,
    value: boundedTextSchema,
    coveredBy: z.array(stableIdSchema).max(64),
  })
  .strict();

const generatedMechanicResolutionSchema = z
  .object({
    kind: z.literal("generated_mechanic"),
    intentId: stableIdSchema,
    candidateBuiltInTypes: z.array(stableIdSchema).max(64),
    assumptions: z.array(resolutionAssumptionSchema).max(32),
    coverage: z
      .object({
        coveredRequirements: z.array(coverageRequirementSchema).max(256),
        uncoveredRequirements: z.array(coverageRequirementSchema).max(256),
      })
      .strict(),
  })
  .strict();

const sourceResolutionSchema = z
  .object({
    intentId: stableIdSchema,
    assumptions: z.array(resolutionAssumptionSchema).max(32),
    uncoveredRequirements: z
      .array(
        z
          .object({
            category: mechanicRequirementCategorySchema,
            value: boundedTextSchema,
          })
          .strict()
      )
      .max(256),
  })
  .strict();

const referenceCatalogSchema = z
  .record(stableIdSchema, z.array(stableIdSchema).max(512))
  .refine((catalog) => Object.keys(catalog).length <= 64, {
    message: "Reference catalogs may contain at most 64 reference kinds.",
  });

const resourceBudgetSchema = z
  .object({
    profileId: stableIdSchema,
    maximumOwnedObjects: nonnegativeIntegerSchema,
    maximumOperationsPerTick: nonnegativeIntegerSchema,
    maximumScheduledCallbacks: nonnegativeIntegerSchema,
    maximumSubscriptions: nonnegativeIntegerSchema,
    maximumSignalsPerTick: nonnegativeIntegerSchema,
    maximumStateBytes: nonnegativeIntegerSchema,
    maximumCallbackMilliseconds: nonnegativeIntegerSchema,
    maximumConsecutiveFailures: nonnegativeIntegerSchema,
  })
  .strict();

const sourceContractSchema = generatedMechanicContractSchema.omit({
  scenarios: true,
});

const sourceGrantSchema = z
  .object({
    capabilityVersion: z.string().min(1).max(80),
    capabilities: z
      .array(
        z
          .object({
            id: stableIdSchema,
            description: z.string().min(1).max(500),
            authoring: z
              .object({
                member: z.string().min(1).max(120),
                signature: z.string().min(1).max(500),
              })
              .strict(),
            resourceCosts: z
              .object({
                operationsPerTick: nonnegativeIntegerSchema,
                ownedObjects: nonnegativeIntegerSchema.optional(),
                scheduledCallbacks: nonnegativeIntegerSchema.optional(),
                subscriptions: nonnegativeIntegerSchema.optional(),
                signalsPerTick: nonnegativeIntegerSchema.optional(),
              })
              .strict(),
            requiresOpaqueHandle: z.boolean(),
          })
          .strict()
      )
      .max(64),
  })
  .strict();

const providerCandidateArtifactIdSchema = stableIdSchema.and(
  artifactScopedRepairArtifactIdSchema
);

export const generatedMechanicProviderGenerationRunIdSchema = stableIdSchema.max(
  206,
  "GenerationRun IDs sent to the provider may contain at most 206 characters."
);

const contractStageInputSchema = z
  .object({
    intent: mechanicIntentTransportSchema,
    resolution: generatedMechanicResolutionSchema,
    constraintSet: generationConstraintSetSchema,
    referenceCatalog: referenceCatalogSchema,
    resourceBudget: resourceBudgetSchema,
  })
  .strict();

const sourceStageInputSchema = z
  .object({
    intent: mechanicIntentTransportSchema,
    resolution: sourceResolutionSchema,
    constraintSet: generationConstraintSetSchema,
    contract: sourceContractSchema,
    grant: sourceGrantSchema,
    referenceCatalog: referenceCatalogSchema,
    resourceBudget: resourceBudgetSchema,
  })
  .strict();

export const generatedMechanicProviderRequestSchema = z
  .discriminatedUnion("stage", [
    z
      .object({
        schemaVersion: z.literal(GENERATED_MECHANIC_PROVIDER_REQUEST_VERSION),
        generationRunId: generatedMechanicProviderGenerationRunIdSchema,
        stage: z.literal("contract"),
        attempt: positiveIntegerSchema,
        attemptKind: attemptKindSchema,
        repair: repairPayloadSchema.optional(),
        providerConfig: providerConfigSchema,
        stageInput: contractStageInputSchema,
      })
      .strict(),
    z
      .object({
        schemaVersion: z.literal(GENERATED_MECHANIC_PROVIDER_REQUEST_VERSION),
        generationRunId: generatedMechanicProviderGenerationRunIdSchema,
        stage: z.literal("source"),
        attempt: positiveIntegerSchema,
        attemptKind: attemptKindSchema,
        repair: repairPayloadSchema.optional(),
        providerConfig: providerConfigSchema,
        stageInput: sourceStageInputSchema,
      })
      .strict(),
  ])
  .superRefine((request, context) => {
    if (request.attemptKind === "initial" && request.repair) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repair"],
        message: "Initial attempts cannot carry repair feedback.",
      });
    }

    if (request.attemptKind === "repair" && !request.repair) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repair"],
        message: "Repair attempts require exact repair feedback.",
      });
    }

    const candidateArtifactId = `${request.generationRunId}_${request.stage}_${request.attemptKind}_${request.attempt}`;
    if (
      !providerCandidateArtifactIdSchema.safeParse(candidateArtifactId).success
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generationRunId"],
        message:
          "GenerationRun correlation cannot produce a valid provider candidate artifact ID.",
      });
    }
  });

const providerErrorCodeSchema = z.enum([
  "configuration",
  "invalid_provider_output",
  "invalid_request",
  "provider_cancelled",
  "provider_failure",
  "provider_timeout",
]);

export const generatedMechanicProviderResponseSchema = z.discriminatedUnion(
  "ok",
  [
    z
      .object({
        schemaVersion: z.literal(GENERATED_MECHANIC_PROVIDER_RESPONSE_VERSION),
        ok: z.literal(true),
        generationRunId: generatedMechanicProviderGenerationRunIdSchema,
        stage: z.enum(["contract", "source"]),
        attempt: positiveIntegerSchema,
        attemptKind: attemptKindSchema,
        candidate: jsonValueSchema,
        providerUsage: openAiProviderUsageReceiptSchema.optional(),
      })
      .strict(),
    z
      .object({
        schemaVersion: z.literal(GENERATED_MECHANIC_PROVIDER_RESPONSE_VERSION),
        ok: z.literal(false),
        generationRunId:
          generatedMechanicProviderGenerationRunIdSchema.nullable(),
        stage: z.enum(["contract", "source"]).nullable(),
        attempt: positiveIntegerSchema.nullable(),
        attemptKind: attemptKindSchema.nullable(),
        error: z
          .object({
            code: providerErrorCodeSchema,
            message: z.string().min(1).max(1_000),
          })
          .strict(),
        providerUsage: openAiProviderUsageReceiptSchema.optional(),
      })
      .strict(),
  ]
);

export type GeneratedMechanicProviderRequest = z.infer<
  typeof generatedMechanicProviderRequestSchema
>;
export type GeneratedMechanicProviderResponse = z.infer<
  typeof generatedMechanicProviderResponseSchema
>;
export type GeneratedMechanicProviderStage =
  GeneratedMechanicProviderRequest["stage"];
export type GeneratedMechanicProviderAttemptKind =
  GeneratedMechanicProviderRequest["attemptKind"];
export type GeneratedMechanicProviderRepair = NonNullable<
  GeneratedMechanicProviderRequest["repair"]
>;
export type GeneratedMechanicProviderConfig = z.infer<
  typeof providerConfigSchema
>;

export function createGeneratedMechanicProviderCandidateArtifactId({
  generationRunId,
  stage,
  attempt,
  attemptKind,
}: Readonly<{
  generationRunId: string;
  stage: GeneratedMechanicProviderStage;
  attempt: number;
  attemptKind: GeneratedMechanicProviderAttemptKind;
}>): string {
  return providerCandidateArtifactIdSchema.parse(
    `${generationRunId}_${stage}_${attemptKind}_${attempt}`
  );
}

export function serializeMechanicIntentForProviderTransport(
  intent: MechanicIntent
): MechanicIntentTransport {
  return mechanicIntentTransportSchema.parse({
    ...intent,
    ambiguities: intent.ambiguities.map((ambiguity) => ({
      ...ambiguity,
      inferredValue: ambiguity.inferredValue ?? null,
      rationale: ambiguity.rationale ?? null,
      reversible: ambiguity.reversible ?? null,
    })),
  });
}

export function parseMechanicIntentFromProviderTransport(
  intent: MechanicIntentTransport
): MechanicIntent {
  return parseCreatorGenerationPlanEnvelope({
    gameSpec: {},
    mechanicIntent: intent,
  }).mechanicIntent;
}
