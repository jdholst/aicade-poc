import { getMechanicCapabilityVersion } from "@/game-spec";

import type { MechanicContractGenerationProviderInput } from "./mechanic-contract-generation-service";

type MechanicContractGenerationPromptInput = Omit<
  MechanicContractGenerationProviderInput,
  "model" | "providerCredential" | "signal"
>;

const mechanicConfigDslDocumentation = [
  { kind: "boolean", fields: ["default?"] },
  { kind: "number", fields: ["minimum", "maximum", "default?"] },
  { kind: "integer", fields: ["minimum", "maximum", "default?"] },
  {
    kind: "string",
    fields: ["minimumLength", "maximumLength", "default?"],
  },
  { kind: "enum", fields: ["values", "default?"] },
  { kind: "stable_id", fields: ["referenceKind", "default?"] },
  { kind: "object", fields: ["fields[]: { key, required, value }"] },
  {
    kind: "collection",
    fields: ["minimumItems", "maximumItems", "item"],
  },
] as const;

export function createMechanicContractGenerationSystemPrompt({
  intent,
  resolution,
  constraintSet,
  referenceCatalog,
  resourceBudget,
  taskRoute,
}: MechanicContractGenerationPromptInput) {
  const capabilityVersion = getMechanicCapabilityVersion(
    constraintSet.capabilityVersion
  );
  const admittedCapabilityIds = new Set(constraintSet.admittedCapabilities);
  const capabilityDocumentation =
    capabilityVersion?.capabilities
      .filter((capability) => admittedCapabilityIds.has(capability.id))
      .map((capability) => ({
        id: capability.id,
        description: capability.description,
        authoring: capability.authoring,
        evaluation: capability.evaluation,
        resourceCosts: capability.resourceCosts,
        requiresOpaqueHandle: capability.requiresOpaqueHandle,
      })) ?? [];

  return `
You are producing the validated pre-implementation contract for one generated game mechanic.

Task route: ${taskRoute}

Accepted Mechanic Intent JSON:
${JSON.stringify(intent, null, 2)}

Accepted generated-mechanic resolution JSON:
${JSON.stringify(resolution, null, 2)}

Active Generation Constraint Set JSON:
${JSON.stringify(constraintSet, null, 2)}

Selected Mechanic Resource Budget JSON:
${JSON.stringify(resourceBudget, null, 2)}

Trusted stable-reference catalog JSON:
${JSON.stringify(referenceCatalog, null, 2)}

Admitted primitive capability documentation JSON:
${JSON.stringify(capabilityDocumentation, null, 2)}

Restricted Mechanic Config DSL documentation JSON:
${JSON.stringify(mechanicConfigDslDocumentation, null, 2)}

Contract rules:
- Preserve every meaningful requirement, recorded assumption, and uncovered behavior in the accepted intent and resolution.
- Declare only capabilities needed to express the contract, chosen from the admitted primitive capability documentation.
- Use only the restricted config declarations above for configuration and port payloads.
- Use only trusted stable references from the supplied catalog.
- Keep resource expectations within the selected budget and active constraints.
- Declare deterministic Behavior Scenario DSL setup, actions, time or events, and observable outcomes; scenarios are evidence proposals, not executable self-tests.
- Do not use named-mechanic profiles, mechanic-specific algorithms, hidden helpers, implementation fragments, or external test code.
- Do not return implementation code or any game specification.

Return one candidate Generated Mechanic Contract through the provided tool.
`.trim();
}
