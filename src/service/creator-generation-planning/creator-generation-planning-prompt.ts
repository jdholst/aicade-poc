import {
  mechanicCapabilityRegistry,
  topDownBuiltInMechanicContracts,
} from "@/game-spec";
import { createTopDownSpecGenerationSystemPrompt } from "@/service/spec-generation/spec-generation-guide";
import type { SpecGenerationProviderInput } from "@/service/spec-generation/spec-generation-service";

import { TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY } from "./creator-generation-perceptibility-policy";

export type CreateCreatorGenerationPlanningPromptInput = Pick<
  SpecGenerationProviderInput,
  "prompt" | "repairContext" | "taskRoute"
> & {
  availableCapabilities: readonly string[];
};

export function createCreatorGenerationPlanningSystemPrompt({
  availableCapabilities,
  ...specGenerationInput
}: CreateCreatorGenerationPlanningPromptInput) {
  const availableCapabilityIds = new Set(availableCapabilities);
  const capabilityDocumentation = mechanicCapabilityRegistry.capabilities.map(
    ({ id, description, authoring, evaluation, resourceCosts }) => ({
      id,
      description,
      authoring,
      evaluation,
      resourceCosts,
      availableOnSelectedHost: availableCapabilityIds.has(id),
    })
  );
  const generatedHostIntentProfile = {
    supportedGeneratedTriggerIds: ["logical_action"],
    optionalLifecycleTriggerIds: ["install"],
    requiredIndependentEffectCapability: "object_motion_write",
    requiredReferenceKind: "entity",
    requiredActorReference:
      "every actor must equal the role of an exact referenced gameSpec entity",
    requiredInputConnection:
      "exactly one input connection whose port is an exact active gameSpec control action ID",
    independentAcceptanceEvidence:
      "causal motion change of the exact intent-referenced entity after the exact active logical action",
    privateStateIsIndependentAcceptanceEvidence: false,
    visibleDashPerceptibility:
      TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY,
  };
  const builtInCoverageVocabulary = topDownBuiltInMechanicContracts.map(
    ({ mechanicType, coverage }) => ({ mechanicType, coverage })
  );

  return `
${createTopDownSpecGenerationSystemPrompt(specGenerationInput)}

Creator-generation planning envelope:
- The final output instruction above is extended: return one combined creator-generation planning envelope through the provided tool, not a bare TopDownGameSpec.
- Put the complete TopDownGameSpec in gameSpec.
- Put one complete Mechanic Intent for the creator's material requested behavior in mechanicIntent.
- Describe requirements only; do not choose whether the mechanic is built-in, generated, a clarification failure, or a capability gap.
- Preserve every meaningful trigger, actor, target, behavior, state change, timing rule, spatial rule, constraint, connection, stable reference, and outcome needed by that behavior.
- Every mechanicIntent array field is required. Use [] when a category is empty.
- Infer ordinary missing gameplay details instead of requesting clarification. Choose reasonable, bounded defaults consistent with the creator prompt, Game Spec scale, controls, and genre.
- Every ambiguity must include a non-empty inferredValue, a concrete rationale, and reversible: true so Sparkline can preserve the model's assumption as explicit evidence.
- For directional movement effects, default to the actor's current movement or facing direction unless the creator prompt contradicts that choice.
- Choose bounded speed, duration, distance, count, and cooldown values that make an effect clearly perceptible without dominating play. Put chosen values in the appropriate configuration or timing fields and record the choices as reversible assumptions.
- For a visibly faster dash, follow the exact retained-host perceptibility profile below. Choose values at or above its speed, extra-travel, and duration floors relative to the player_movement speed in the same Game Spec.
- Do not return null ambiguity fields. Preserve contradictory or unsafe requirements so deterministic validation can fail closed, but resolve routine omissions yourself.
- Mechanic Intent references must use exact stable IDs from the gameSpec in this same envelope.
- When the requested behavior matches values in the built-in coverage vocabulary below, use those exact IDs instead of paraphrases. Preserve every extra requirement that is not in the catalog; never add, remove, or rewrite requirements to force a particular route.
- This catalog supplies exact requirement vocabulary only; deterministic routing remains Sparkline-owned.
- Use a built-in trigger ID only when the complete material behavior is fully covered by that built-in contract. An existing movement action that triggers a new dash is only partially covered: use logical_action for that generated lifecycle and bind the exact active movement action through the input connection.
- For behavior that is not fully covered by a built-in, requiredCapabilities must name every primitive it needs. Do not hide an unavailable primitive to avoid a capability-gap result.
- Use the canonical generated-host trigger vocabulary below only when it truthfully describes the requested behavior. A creator-controlled generated behavior uses exactly logical_action. Do not invent variants such as logical_custom_action, logical_dash_action, or logical_move_action. Preserve a materially different requested trigger unchanged so deterministic routing can return an honest capability gap.
- A generated-host intent must name object_motion_write only when the requested outcome truly includes independently visible motion of an exact entity reference. Do not invent motion or an entity reference merely to pass admission.
- Every generated-host actor must equal the role of an exact entity reference from gameSpec; do not invent actor labels or unrelated references.
- A generated-host intent must use exactly one input connection whose port is the exact active gameSpec control action ID that triggers the requested behavior. Do not invent an action ID or add output connections merely to pass admission.
- Do not return source code, a Generated Mechanic Contract, routing policy, evaluation evidence, or a Game Pack.

Current generated-host Mechanic Intent profile JSON:
${JSON.stringify(generatedHostIntentProfile, null, 2)}

Current top-down built-in coverage vocabulary JSON:
${JSON.stringify(builtInCoverageVocabulary, null, 2)}

Mechanic capability documentation JSON:
${JSON.stringify(capabilityDocumentation, null, 2)}

Return the combined creator-generation planning envelope through the provided tool.
`.trim();
}
