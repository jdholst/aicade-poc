import type {
  GeneratedMechanicContract,
  GeneratedMechanicReferenceCatalog,
  GeneratedMechanicResolution,
  GeneratedMechanicResourceBudget,
  GenerationConstraintSet,
  MechanicCapabilityGrant,
  MechanicIntent,
} from "@/game-spec";

import { GENERATED_MECHANIC_SOURCE_CANDIDATE_VERSION } from "./mechanic-source-generation-service";

export type MechanicSourceGenerationGuidanceInput = {
  intent: MechanicIntent;
  resolution: GeneratedMechanicResolution;
  constraintSet: GenerationConstraintSet;
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  resourceBudget: GeneratedMechanicResourceBudget;
  taskRoute: "mechanic_source_generation.primary";
};

const sourceCandidateSchemaDocumentation = {
  schemaVersion: GENERATED_MECHANIC_SOURCE_CANDIDATE_VERSION,
  fields: {
    id: "stable artifact ID",
    contractId: "exact accepted contract ID",
    capabilityVersion: "exact accepted capability version",
    callbacks: [
      {
        id: "stable callback ID",
        kind: [
          "install",
          "logical_action",
          "gameplay_event",
          "scheduled",
          "fixed_step",
          "dispose",
        ],
        source: "TypeScript callback body",
      },
    ],
  },
} as const;

export function createMechanicSourceGenerationSystemPrompt({
  intent,
  resolution,
  constraintSet,
  contract,
  grant,
  referenceCatalog,
  resourceBudget,
  taskRoute,
}: MechanicSourceGenerationGuidanceInput): string {
  const acceptedGenerationEvidence = {
    intentId: resolution.intentId,
    assumptions: resolution.assumptions,
    uncoveredRequirements: resolution.coverage.uncoveredRequirements.map(
      ({ category, value }) => ({ category, value })
    ),
  };
  const capabilityDocumentation = grant.capabilities.map((capability) => ({
    id: capability.id,
    description: capability.description,
    member: capability.authoring.member,
    asyncSignature: asAsyncSignature(capability.authoring.signature),
    resourceCosts: capability.resourceCosts,
    requiresOpaqueHandle: capability.requiresOpaqueHandle,
  }));
  const sourceContextDocumentation = {
    config: contract.config,
    bindings: contract.bindings.map(
      ({ id, referenceKind, cardinality }) => ({
        id,
        referenceKind,
        cardinality,
      })
    ),
    ports: contract.ports,
    privateStateIds: contract.privateState.map(({ id, valueType }) => ({
      id,
      valueType,
    })),
    ownedObjectArchetypeIds: contract.ownedObjects.map(({ id, objectKind }) => ({
      id,
      objectKind,
    })),
    lifecycleInput: {
      install: "undefined",
      logical_action: contract.ports
        .filter((port) => port.direction === "input")
        .map((port) => ({
          portId: port.id,
          payload: port.payload,
          runtimeShape: {
            actionId: port.id,
            payload: "value matching this port payload schema",
          },
        })),
      gameplay_event: {
        admittedEventIds: contract.behavior.triggers,
        runtimeShape:
          "event ID or { readonly eventId: admitted event ID; readonly payload: JsonValue }",
      },
      scheduled:
        "{ readonly simulationTimeMilliseconds: number }",
      fixed_step:
        "{ readonly simulationTimeMilliseconds: number }",
      dispose: "undefined",
    },
  };

  return `
You are producing TypeScript callback bodies for one accepted generated game mechanic.

Task route: ${taskRoute}

Accepted Mechanic Intent JSON:
${JSON.stringify(intent, null, 2)}

Accepted generic generation evidence JSON:
${JSON.stringify(acceptedGenerationEvidence, null, 2)}

Accepted Generated Mechanic Contract JSON:
${JSON.stringify(contract, null, 2)}

Active Generation Constraint Set JSON:
${JSON.stringify(constraintSet, null, 2)}

Selected Mechanic Resource Budget JSON:
${JSON.stringify(resourceBudget, null, 2)}

Trusted stable-reference catalog JSON:
${JSON.stringify(referenceCatalog, null, 2)}

Exact granted async capability documentation JSON:
${JSON.stringify(capabilityDocumentation, null, 2)}

Contract-derived source context JSON:
${JSON.stringify(sourceContextDocumentation, null, 2)}

Generated Mechanic Source candidate schema JSON:
${JSON.stringify(sourceCandidateSchemaDocumentation, null, 2)}

Source rules:
- Return callback bodies only in the strict candidate schema; do not return a persistent module, imports, exports, a game specification, or prose.
- Declare exactly one callback for every lifecycle kind accepted by the contract, plus dispose. Include fixed_step only when the contract enables it. The trusted host owns lifecycle scheduling and fixed-step cadence; source candidates never choose timing metadata.
- Callback bodies may reference only config, bindings, lifecycleInput, and the exact granted capability members documented above.
- Input lifecycle payloads and emitted output payloads must match their contract-declared port schemas exactly.
- Every granted capability must be used directly through its documented member, every capability call is asynchronous, and every call must be awaited.
- Do not reference raw realm primitives, engine objects, ambient globals, dynamic evaluation, DOM, network, storage, workers, raw timers, ambient time, or ambient randomness.
- Compose behavior from the supplied primitive capability surface. Do not rely on named profiles, source skeletons, algorithms, prompt branches, hidden helpers, handwritten fragments, or any material not supplied above.
- Preserve the accepted contract, capability version, bindings, configuration, ports, lifecycle, exact grant, and resource limits without widening authority.

Return one candidate Generated Mechanic Source for Sparkline to parse, typecheck, compile, statically inspect, and evaluate inside the selected Mechanic Execution Realm.
`.trim();
}

function asAsyncSignature(signature: string): string {
  const markerIndex = signature.lastIndexOf("=>");
  if (markerIndex < 0) {
    return signature;
  }
  const parameters = signature.slice(0, markerIndex).trim();
  const result = signature.slice(markerIndex + 2).trim();
  return `${parameters} => Promise<${result}>`;
}
