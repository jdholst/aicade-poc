import {
  stableIdSchema,
  type StableId,
} from "@/game-spec";
import {
  createCreatorGenerationRouting,
  type CreatorGenerationRouting,
} from "@/service/creator-generation/creator-generation-routing";
import type {
  SpecGenerationFailureResult,
  SpecGenerationSuccessResult,
} from "@/service/spec-generation/spec-generation-outcome";
import {
  generateTopDownGameSpec,
  type GenerateTopDownGameSpecInput,
} from "@/service/spec-generation/spec-generation-service";

import type { CreatorGenerationPlanProvider } from "./creator-generation-planning-provider";
import { applyTopDownCreatorOwnedObjectRediscoveryPolicy } from "./creator-generation-owned-object-policy";
import { applyTopDownCreatorPerceptibilityFloor } from "./creator-generation-perceptibility-policy";
import {
  parseCreatorGenerationPlanEnvelopeParts,
  type CreatorGenerationPlanEnvelopeParts,
} from "./creator-generation-planning-schema";

export type GenerateTopDownCreatorPlanInput = Omit<
  GenerateTopDownGameSpecInput,
  "provider"
> &
  Readonly<{
    availableCapabilities: readonly StableId[];
    generationRunId: StableId;
    provider: CreatorGenerationPlanProvider;
    signal?: AbortSignal;
  }>;

export type TopDownCreatorPlanSuccessResult = SpecGenerationSuccessResult &
  Readonly<{
    routing: CreatorGenerationRouting;
  }>;

export type TopDownCreatorPlanResult =
  | TopDownCreatorPlanSuccessResult
  | SpecGenerationFailureResult;

export async function generateTopDownCreatorPlan({
  availableCapabilities: availableCapabilitiesInput,
  generationRunId: generationRunIdInput,
  provider,
  signal,
  ...specGenerationInput
}: GenerateTopDownCreatorPlanInput): Promise<TopDownCreatorPlanResult> {
  const generationRunId = stableIdSchema.parse(generationRunIdInput);
  const availableCapabilities = stableIdSchema
    .array()
    .parse(availableCapabilitiesInput);
  let latestEnvelope: CreatorGenerationPlanEnvelopeParts | undefined;

  const result = await generateTopDownGameSpec({
    ...specGenerationInput,
    provider: async (providerInput) => {
      const envelope = parseCreatorGenerationPlanEnvelopeParts(
        await provider({
          ...providerInput,
          availableCapabilities,
          ...(signal ? { signal } : {}),
        })
      );
      latestEnvelope = envelope;

      return envelope.gameSpec;
    },
  });

  if (!result.ok) {
    return result;
  }

  if (!latestEnvelope) {
    throw new Error(
      "Creator-generation planning succeeded without retaining its provider envelope."
    );
  }

  if (latestEnvelope.mechanicIntent.status === "invalid") {
    return {
      ...result,
      routing: {
        kind: "intent_validation_failure",
        generationRunId,
        ...(latestEnvelope.mechanicIntent.summary
          ? { intentSummary: latestEnvelope.mechanicIntent.summary }
          : {}),
        evidence: {
          stage: "routing",
          code: "invalid_intent_transport",
          issues: latestEnvelope.mechanicIntent.issues,
        },
      },
    };
  }

  const intent = applyTopDownCreatorOwnedObjectRediscoveryPolicy(
    applyTopDownCreatorPerceptibilityFloor(
      latestEnvelope.mechanicIntent.value,
      result.spec
    )
  );

  return {
    ...result,
    routing: createCreatorGenerationRouting({
      availableCapabilities,
      baseGameSpec: result.spec,
      generationRunId,
      intent,
    }),
  };
}
