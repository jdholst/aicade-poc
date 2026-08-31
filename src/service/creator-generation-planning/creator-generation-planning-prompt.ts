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
    supportedGeneratedTriggerIds: ["install", "logical_action"],
    triggerProfiles: {
      creatorControlled: "exactly logical_action with one exact active action input",
      autonomous: "exactly install with no connections",
    },
    requiredIndependentEffectCapability: "object_motion_write",
    requiredReferenceKind: "entity",
    requiredActorReference:
      "every actor must equal the role of an exact referenced gameSpec entity",
    requiredTargetReference:
      "every target must equal the role of an exact referenced gameSpec entity",
    requiredInputConnection:
      "creator-controlled only: exactly one input connection whose port is an exact active gameSpec control action ID; autonomous install behavior has no connections",
    preferredDistinctActionControlKey: "Space",
    independentAcceptanceEvidence:
      "causal visible change after the exact active logical action, or install-origin owned-object lifecycle evidence for autonomous behavior",
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
- Do not include or rewrite mechanicConnections in gameSpec for generated-mechanic planning. Return the trusted base-game content without a mechanicConnections field so trusted base-game mechanic connections remain outside the generated assembly. Put the requested generated behavior's input routing only in mechanicIntent.connections.
- Describe requirements only; do not choose whether the mechanic is built-in, generated, a clarification failure, or a capability gap.
- Preserve every meaningful trigger, actor, target, behavior, state change, timing rule, spatial rule, constraint, connection, stable reference, and outcome needed by that behavior.
- Every mechanicIntent array field is required. Use [] when a category is empty.
- Infer ordinary missing gameplay details instead of requesting clarification. Choose reasonable, bounded defaults consistent with the creator prompt, Game Spec scale, controls, and genre.
- Every ambiguity must include a non-empty inferredValue, a concrete rationale, and reversible: true so Sparkline can preserve the model's assumption as explicit evidence.
- For directional movement effects, default to the actor's current movement or facing direction unless the creator prompt contradicts that choice.
- Choose bounded speed, duration, distance, count, and cooldown values that make an effect clearly perceptible without dominating play. Put chosen values in the appropriate configuration or timing fields and record the choices as reversible assumptions.
- When a finite-lifetime moving owned object must interact with a referenced target, keep the returned gameSpec spawn geometry and mechanicIntent travel budget mutually reachable. Using the centers of the selected actor and target spawn zones, choose speed and lifetime values whose product in pixels is strictly greater than the center-to-center distance between the selected actor and target spawn zones and keep at least 64 pixels of interaction headroom. If that bounded travel budget would dominate play, move the compatible target spawn zone nearer instead. Record the chosen reachability tradeoff as a reversible assumption. Do not rely on target movement, a deterministic evaluation placement, or source behavior outside the declared speed and lifetime.
- For a visibly faster dash, follow the exact retained-host perceptibility profile below. Choose values at or above its speed, extra-travel, and duration floors relative to the player_movement speed in the same Game Spec.
- Do not return null ambiguity fields. Preserve contradictory or unsafe requirements so deterministic validation can fail closed, but resolve routine omissions yourself.
- Mechanic Intent references must use exact stable IDs from the gameSpec in this same envelope.
- When the requested behavior matches values in the built-in coverage vocabulary below, use those exact IDs instead of paraphrases. Preserve every extra requirement that is not in the catalog; never add, remove, or rewrite requirements to force a particular route.
- This catalog supplies exact requirement vocabulary only; deterministic routing remains Sparkline-owned.
- Use a built-in trigger ID only when the complete material behavior is fully covered by that built-in contract. An existing movement action that triggers a new dash is only partially covered: use logical_action for that generated lifecycle and bind the exact active movement action through the input connection.
- For behavior that is not fully covered by a built-in, requiredCapabilities must name every primitive it needs. Do not hide an unavailable primitive to avoid a capability-gap result.
- Use the canonical generated-host trigger vocabulary below only when it truthfully describes the requested behavior. A creator-controlled generated behavior uses exactly logical_action. An autonomous behavior that starts with the game uses exactly install and no connections. Do not invent trigger variants. Preserve a materially different requested trigger unchanged so deterministic routing can return an honest capability gap.
- A generated-host intent must name object_motion_write only when the requested outcome truly includes independently visible motion of an exact entity reference. Do not invent motion or an entity reference merely to pass admission.
- Every generated-host actor must equal the role of an exact entity reference from gameSpec; do not invent actor labels or unrelated references.
- Every generated-host target must equal the role of an exact entity reference from gameSpec; do not invent generic target labels such as visible_target when the referenced entity's role is enemy, pickup, hazard, or another exact gameSpec role.
- A creator-controlled generated-host intent must use exactly one input connection whose port is the exact active gameSpec control action ID that triggers the requested behavior. An autonomous install intent must use no connections. Materialize a creator-requested action as a concrete control before referencing it; do not invent unrelated action IDs or add output connections merely to pass admission.
- Before returning, run the matching generated-host alignment checklist for every material behavior that is not fully covered by a built-in. For autonomous behavior, set triggers to exactly ["install"], set connections to [], and do not add a player control. For creator-controlled behavior:
  1. If the creator requests a new player action such as shooting, add one active control to gameSpec first, using one admitted individual physical key. Prefer Space for a distinct button action and preserve the existing movement controls. This implements the creator request; it is not unrelated admission metadata.
  2. Set mechanicIntent.triggers to exactly ["logical_action"].
  3. Set mechanicIntent.connections to exactly one input connection using that same action ID from gameSpec.controls, with no output connection.
  4. Copy every actor and target token from the exact role of an entity referenced by stable ID in mechanicIntent.references. If mechanicIntent.targets is non-empty, every target token must equal the role of one referenced gameSpec entity.
  5. When a transient owned-object interaction needs an implicit observable target, infer a simple non-player target entity in gameSpec, then use its exact role and ID in mechanicIntent.targets and mechanicIntent.references. Never emit a generic target token without the matching entity reference.
  6. If the behavior creates a transient object, put its stable archetype token in mechanicIntent.ownedObjects and include object_create, object_motion_write, and object_destroy in mechanicIntent.requiredCapabilities. Also include object_read when the owned object's initial position or motion depends on a bound actor's live transform. Add spatial_query only when target interaction or owned-object rediscovery requires it. Also include every timing, spatial, cleanup, and observable-outcome requirement needed by the requested behavior.
- Do not leave the requested action only in summary, behaviors, assumptions, or configuration. The active gameSpec control, canonical trigger, exact input connection, and exact stable references must agree in the same returned envelope.
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
