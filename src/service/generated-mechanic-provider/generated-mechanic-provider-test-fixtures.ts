import {
  MECHANIC_CAPABILITY_VERSION,
  PHASE_9_GENERATION_CONSTRAINT_SET,
  mechanicCapabilityRegistry,
  type GeneratedMechanicResolution,
  type MechanicIntent,
} from "@/game-spec";
import type { MechanicContractGenerationProviderInput } from "@/service/mechanic-contract-generation/mechanic-contract-generation-service";
import {
  createMechanicSourceGenerationGrant,
  createMechanicSourceGenerationResolution,
} from "@/service/mechanic-source-generation/mechanic-source-generation-prompt";
import type { MechanicSourceGenerationProviderInput } from "@/service/mechanic-source-generation/mechanic-source-generation-provider";

export const providerBoundaryIntent: MechanicIntent = {
  id: "intent_generic_state",
  summary: "Initialize one private value during installation.",
  triggers: ["installation"],
  actors: [],
  targets: [],
  behaviors: ["initialize_private_value"],
  ownedObjects: [],
  stateChanges: ["private_value_initialized"],
  temporalRules: [],
  spatialRules: [],
  constraints: [],
  configuration: [{ key: "initial_value", value: 1 }],
  connections: [],
  references: [],
  outcomes: ["private_value_observable"],
  requiredCapabilities: ["state_write"],
  ambiguities: [
    {
      id: "ambiguity_initial_value",
      description: "Choose the initial value.",
      inferredValue: "1",
      rationale: "One is the smallest visible non-zero value.",
      reversible: true,
    },
  ],
};

export const providerBoundaryResolution: GeneratedMechanicResolution = {
  kind: "generated_mechanic",
  intentId: providerBoundaryIntent.id,
  candidateBuiltInTypes: [],
  assumptions: [
    {
      ambiguityId: "ambiguity_initial_value",
      description: "Choose the initial value.",
      inferredValue: "1",
      rationale: "One is the smallest visible non-zero value.",
      reversible: true,
    },
  ],
  coverage: {
    coveredRequirements: [],
    uncoveredRequirements: [
      {
        category: "behavior",
        value: "initialize_private_value",
        coveredBy: [],
      },
    ],
  },
};

export const providerBoundaryResourceBudget = {
  profileId: "phase_9_fixed_budget",
  maximumOwnedObjects: 4,
  maximumOperationsPerTick: 16,
  maximumScheduledCallbacks: 4,
  maximumSubscriptions: 4,
  maximumSignalsPerTick: 4,
  maximumStateBytes: 1024,
  maximumCallbackMilliseconds: 8,
  maximumConsecutiveFailures: 2,
} as const;

export const providerBoundarySourceContract = {
  schemaVersion: "generated-mechanic-contract/v1" as const,
  id: "generic_contract",
  intentId: providerBoundaryIntent.id,
  capabilityVersion: MECHANIC_CAPABILITY_VERSION,
  behavior: {
    summary: "Initialize one private value.",
    triggers: ["installation"],
    outcomes: ["private_value_initialized"],
  },
  config: {
    kind: "object" as const,
    fields: [
      {
        key: "initial_value",
        required: true,
        value: {
          kind: "integer" as const,
          minimum: 0,
          maximum: 10,
        },
      },
    ],
  },
  bindings: [],
  ownedObjects: [],
  privateState: [
    { id: "private_value", valueType: "integer" as const, initialValue: 0 },
  ],
  lifecycle: {
    callbacks: ["install" as const],
    fixedStep: false,
    dispose: true as const,
  },
  ports: [],
  capabilities: ["state_write"],
  resourceExpectations: {
    maximumOwnedObjects: 0,
    maximumOperationsPerTick: 1,
    maximumScheduledCallbacks: 0,
    maximumSubscriptions: 0,
    maximumSignalsPerTick: 0,
    maximumStateBytes: 128,
    maximumCallbackMilliseconds: 8,
    maximumConsecutiveFailures: 2,
  },
  requiredPrivateStateTransitions: [
    {
      setupState: [
        { kind: "state_equals" as const, stateId: "private_value", value: 0 },
      ],
      lifecycleSteps: [{ kind: "advance_time" as const, milliseconds: 1 }],
      requiredFinalState: [
        { kind: "state_equals" as const, stateId: "private_value", value: 1 },
      ],
    },
  ],
};

export function createContractProviderInput(
  signal?: AbortSignal
): MechanicContractGenerationProviderInput {
  return {
    intent: providerBoundaryIntent,
    resolution: providerBoundaryResolution,
    constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    referenceCatalog: { action: ["toggle"] },
    resourceBudget: providerBoundaryResourceBudget,
    model: "gpt-5.4-mini",
    providerCredential: "browser-placeholder-credential",
    taskRoute: "mechanic_contract_generation.primary",
    ...(signal ? { signal } : {}),
  };
}

export function createSourceProviderInput(
  signal?: AbortSignal
): MechanicSourceGenerationProviderInput {
  const capability = mechanicCapabilityRegistry.capabilities.find(
    (entry) => entry.id === "state_write"
  );
  if (!capability) {
    throw new Error("The state_write capability fixture is unavailable.");
  }

  return {
    intent: providerBoundaryIntent,
    resolution: createMechanicSourceGenerationResolution(
      providerBoundaryResolution
    ),
    constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    contract: providerBoundarySourceContract,
    grant: createMechanicSourceGenerationGrant({
      capabilityVersion: MECHANIC_CAPABILITY_VERSION,
      capabilities: [
        {
          ...capability,
          justification: {
            kind: "contract_declaration",
            path: "capabilities.0",
          },
        },
      ],
    }),
    referenceCatalog: {},
    resourceBudget: providerBoundaryResourceBudget,
    model: "gpt-5.4-mini",
    providerCredential: "browser-placeholder-credential",
    taskRoute: "mechanic_source_generation.primary",
    ...(signal ? { signal } : {}),
  };
}
