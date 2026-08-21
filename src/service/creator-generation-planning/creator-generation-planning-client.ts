import { z } from "zod";

import {
  generationConstraintSetSchema,
  stableIdSchema,
  validateTopDownGameSpec,
  type GeneratedMechanicResolution,
  type MechanicIntent,
} from "@/game-spec";
import type { RuntimeKind } from "@/runtime/runtime-adapter";
import type { CreatorGenerationRouting } from "@/service/creator-generation/creator-generation-routing";
import type { StarterProjectRequest } from "@/service/starter-project/starter-project-client";
import { SpecGenerationClientError } from "@/service/spec-generation/spec-generation-client";
import {
  getSpecGenerationErrorMessage,
  getSpecGenerationSuccessMetadata,
  getSpecGenerationValidationFailure,
  type SpecGenerationSuccessMetadata,
  type SpecGenerationValidationFailure,
} from "@/service/spec-generation/spec-generation-outcome";

import { parseCreatorGenerationPlanEnvelope } from "./creator-generation-planning-schema";

const generationRunCorrelationIdSchema = stableIdSchema.max(206);

export type CreatorGenerationPlanningClientOptions = Readonly<{
  generationRunId: string;
}>;

/**
 * Validated serialized planning data. In particular, `routing` is not a live
 * foundation-gate result, realm authority, or browser-continuation token.
 */
export type TopDownCreatorGenerationPlanningClientResult = Readonly<{
  metadata: SpecGenerationSuccessMetadata;
  routing: CreatorGenerationRouting;
  runtimeKind: Extract<RuntimeKind, "phaser">;
  spec: ReturnType<typeof validateTopDownGameSpec>;
}>;

export class CreatorGenerationPlanningClientError extends SpecGenerationClientError {
  constructor(message: string, validationFailure?: SpecGenerationValidationFailure) {
    super(message, validationFailure);
    this.name = "CreatorGenerationPlanningClientError";
  }
}

type CreatorGenerationPlanningPayload =
  | {
      ok: true;
      metadata?: unknown;
      routing?: unknown;
      spec?: unknown;
    }
  | {
      ok: false;
      attemptCount?: unknown;
      generationRunId?: unknown;
      repairAttempts?: unknown;
      stage?: unknown;
      taskRoute?: unknown;
      userMessage?: unknown;
      validationIssues?: unknown;
    };

export async function requestTopDownCreatorGenerationPlanning(
  request: StarterProjectRequest,
  signal: AbortSignal | undefined,
  options: CreatorGenerationPlanningClientOptions
): Promise<TopDownCreatorGenerationPlanningClientResult> {
  const generationRunId = generationRunCorrelationIdSchema.parse(
    options.generationRunId
  );
  let response: Response;
  try {
    response = await fetch("/api/creator-generation-planning", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal,
      body: JSON.stringify({
        enteredPrompt: request.prompt || undefined,
        generationRunId,
        openAiApiKey: request.openAiApiKey,
        openAiKeyword: request.openAiKeyword,
        openAiModel: request.openAiModel,
      }),
    });
  } catch (error) {
    throwCreatorPlanningCancellationIfAborted(signal);
    throw error;
  }
  throwCreatorPlanningCancellationIfAborted(signal);

  let payload: CreatorGenerationPlanningPayload;
  try {
    payload = (await response.json()) as CreatorGenerationPlanningPayload;
  } catch (error) {
    throwCreatorPlanningCancellationIfAborted(signal);
    throw error;
  }
  throwCreatorPlanningCancellationIfAborted(signal);

  if (!response.ok || payload.ok === false) {
    throw new CreatorGenerationPlanningClientError(
      getSpecGenerationErrorMessage(payload),
      getSpecGenerationValidationFailure(payload)
    );
  }
  if (payload.ok !== true) {
    throw new Error("Creator Generation Planning returned an invalid response.");
  }

  const spec = validateTopDownGameSpec(payload.spec);
  const metadata = getSpecGenerationSuccessMetadata(payload);
  const routing = parseCreatorGenerationRoutingData(payload.routing);
  if (
    metadata.generationRunId !== generationRunId ||
    routing.generationRunId !== generationRunId
  ) {
    throw new Error(
      "Creator Generation Planning returned mismatched GenerationRun correlation."
    );
  }

  return {
    metadata,
    routing,
    runtimeKind: "phaser",
    spec,
  };
}

function throwCreatorPlanningCancellationIfAborted(
  signal: AbortSignal | undefined
): void {
  if (signal?.aborted) {
    throw new DOMException(
      "Creator Generation Planning was cancelled.",
      "AbortError"
    );
  }
}

const routingIssueSchema = z
  .object({
    path: z.string().min(1).max(240),
    code: stableIdSchema,
    message: z.string().min(1).max(600),
  })
  .strict();

const resolutionAssumptionSchema = z
  .object({
    ambiguityId: stableIdSchema,
    description: z.string().min(1).max(600),
    inferredValue: z.string().min(1).max(600),
    rationale: z.string().min(1).max(600),
    reversible: z.literal(true),
  })
  .strict();

const coverageRequirementSchema = z
  .object({
    category: z.enum([
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
    ]),
    value: z.string().min(1).max(600),
    coveredBy: z.array(stableIdSchema).max(64),
  })
  .strict();

const generatedMechanicResolutionSchema: z.ZodType<GeneratedMechanicResolution> =
  z
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

const builtInRoutingSchema = z
  .object({
    kind: z.literal("built_in"),
    generationRunId: stableIdSchema,
    intentId: stableIdSchema,
    resolutionKind: z.enum(["built_in", "built_in_composition"]),
  })
  .strict();

const generatedRoutingSchema = z
  .object({
    kind: z.literal("generated_mechanic"),
    generationRunId: stableIdSchema,
    intent: z.unknown(),
    admittedRequest: z
      .object({
        resolution: generatedMechanicResolutionSchema,
        constraintSet: generationConstraintSetSchema,
      })
      .strict(),
  })
  .strict();

const clarificationRoutingSchema = z
  .object({
    kind: z.literal("clarification_failure"),
    generationRunId: stableIdSchema,
    intentId: stableIdSchema,
    intentSummary: z.string().min(1).max(600).optional(),
    evidence: z
      .object({
        stage: z.literal("routing"),
        code: z.enum(["clarification_required", "invalid_intent_references"]),
        issues: z.array(routingIssueSchema).min(1).max(128),
      })
      .strict(),
  })
  .strict();

const intentValidationFailureRoutingSchema = z
  .object({
    kind: z.literal("intent_validation_failure"),
    generationRunId: stableIdSchema,
    intentSummary: z.string().min(1).max(600).optional(),
    evidence: z
      .object({
        stage: z.literal("routing"),
        code: z.literal("invalid_intent_transport"),
        issues: z.array(routingIssueSchema).min(1).max(128),
      })
      .strict(),
  })
  .strict();

const capabilityGapRoutingSchema = z
  .object({
    kind: z.literal("capability_gap"),
    generationRunId: stableIdSchema,
    intentId: stableIdSchema,
    intentSummary: z.string().min(1).max(600).optional(),
    evidence: z
      .object({
        stage: z.literal("routing"),
        code: z.literal("capability_gap"),
        missingCapabilities: z.array(stableIdSchema).max(64),
        issues: z.array(routingIssueSchema).min(1).max(128),
      })
      .strict(),
  })
  .strict();

const constraintConflictRoutingSchema = z
  .object({
    kind: z.literal("constraint_conflict"),
    generationRunId: stableIdSchema,
    intentId: stableIdSchema,
    intentSummary: z.string().min(1).max(600).optional(),
    evidence: z
      .object({
        stage: z.literal("routing"),
        code: z.literal("generated_mechanic_limit_exceeded"),
        issues: z.array(routingIssueSchema).min(1).max(128),
      })
      .strict(),
  })
  .strict();

const nonGeneratedRoutingSchema = z.discriminatedUnion("kind", [
  builtInRoutingSchema,
  intentValidationFailureRoutingSchema,
  clarificationRoutingSchema,
  capabilityGapRoutingSchema,
  constraintConflictRoutingSchema,
]);

function parseCreatorGenerationRoutingData(
  input: unknown
): CreatorGenerationRouting {
  if (
    !input ||
    typeof input !== "object" ||
    !("kind" in input) ||
    input.kind !== "generated_mechanic"
  ) {
    return nonGeneratedRoutingSchema.parse(input);
  }

  const parsed = generatedRoutingSchema.parse(input);
  const intent: MechanicIntent = parseCreatorGenerationPlanEnvelope({
    gameSpec: {},
    mechanicIntent: parsed.intent,
  }).mechanicIntent;
  if (parsed.admittedRequest.resolution.intentId !== intent.id) {
    throw new Error(
      "Creator Generation Planning returned mismatched generated-mechanic intent data."
    );
  }

  return {
    ...parsed,
    intent,
  };
}
