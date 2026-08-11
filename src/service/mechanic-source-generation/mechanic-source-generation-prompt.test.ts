import { describe, expect, it } from "vitest";

import {
  MECHANIC_CAPABILITY_VERSION,
  PHASE_9_GENERATION_CONSTRAINT_SET,
  mechanicCapabilityRegistry,
  type GeneratedMechanicContract,
  type GeneratedMechanicResolution,
  type MechanicCapabilityGrant,
  type MechanicIntent,
} from "@/game-spec";

import {
  createMechanicSourceGenerationGrant,
  createMechanicSourceGenerationResolution,
  createMechanicSourceGenerationSystemPrompt,
} from "./mechanic-source-generation-prompt";

describe("createMechanicSourceGenerationSystemPrompt", () => {
  it("documents only the accepted generic source boundary and excludes evaluator scaffolding", () => {
    const intent = createIntent();
    const contract = createContract();
    const grant = createGrant("state_write");
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract,
      grant: createMechanicSourceGenerationGrant(grant),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      evaluatorTests: "EVALUATOR_ONLY_SENTINEL",
    } as Parameters<typeof createMechanicSourceGenerationSystemPrompt>[0] & {
      evaluatorTests: string;
    });

    expect(prompt).toContain(JSON.stringify(intent, null, 2));
    expect(prompt).toContain('"id": "generic_contract"');
    expect(prompt).toContain('"id": "state_write"');
    expect(prompt).toContain(
      '"expression": "capabilities.state.write"'
    );
    expect(prompt).not.toContain('"member": "state.write"');
    expect(prompt).toContain(
      '"asyncSignature": "(stateId: MechanicStateId, value: JsonValue) => Promise<void>"'
    );
    expect(prompt).toContain("generated_mechanic_source_candidate/v1");
    expect(prompt).toContain("config");
    expect(prompt).toContain("bindings");
    expect(prompt).toContain("lifecycleInput");
    expect(prompt).toContain('"logical_action": {');
    expect(prompt).toContain('"gameplay_event": {');
    expect(prompt).toContain('"inputPorts": [');
    expect(prompt).toContain('"portId": "accepted_input"');
    expect(prompt).toContain('"kind": "boolean"');
    expect(prompt).toContain("The trusted host owns lifecycle scheduling");
    expect(prompt).not.toContain('"fixedStep": {');
    expect(prompt).toContain("Return one candidate Generated Mechanic Source");
    expect(prompt).toContain(
      "Every granted capability must be called through its documented capabilities expression"
    );
    expect(prompt).not.toContain("EVALUATOR_ONLY_SENTINEL");
    expect(prompt).not.toContain('"scenarios"');
    expect(prompt).not.toContain("install_value");
    expect(prompt).not.toMatch(/projectile|hazard|proximity|navigation/i);
    expect(prompt).not.toContain("External Acceptance Observations");
    expect(prompt).not.toContain("evaluator tests");
  });
});

function createIntent(): MechanicIntent {
  return {
    id: "intent_generic_state",
    summary: "Initialize a private value during installation.",
    triggers: ["installation"],
    actors: [],
    targets: [],
    behaviors: ["initialize_private_value"],
    ownedObjects: [],
    stateChanges: ["private_value_initialized"],
    temporalRules: [],
    spatialRules: [],
    constraints: [],
    configuration: ["initial_value"],
    connections: [],
    references: [],
    outcomes: ["private_value_observable"],
    requiredCapabilities: ["state_write"],
    ambiguities: [],
  };
}

function createResolution(intent: MechanicIntent): GeneratedMechanicResolution {
  return {
    kind: "generated_mechanic",
    intentId: intent.id,
    candidateBuiltInTypes: [],
    assumptions: [],
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
}

function createContract(): GeneratedMechanicContract {
  return {
    schemaVersion: "generated-mechanic-contract/v1",
    id: "generic_contract",
    intentId: "intent_generic_state",
    capabilityVersion: MECHANIC_CAPABILITY_VERSION,
    behavior: {
      summary: "Initialize one private value.",
      triggers: ["installation"],
      outcomes: ["private_value_initialized"],
    },
    config: {
      kind: "object",
      fields: [
        {
          key: "initialValue",
          required: true,
          value: { kind: "integer", minimum: 0, maximum: 10 },
        },
      ],
    },
    bindings: [],
    ownedObjects: [],
    privateState: [
      { id: "private_value", valueType: "integer", initialValue: 0 },
    ],
    lifecycle: { callbacks: ["install"], fixedStep: false, dispose: true },
    ports: [
      {
        id: "accepted_input",
        direction: "input",
        payload: { kind: "boolean" },
      },
    ],
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
    scenarios: [
      {
        id: "install_value",
        seed: 1729,
        setup: [],
        steps: [{ kind: "advance_time", milliseconds: 1 }],
        observations: [
          { kind: "state_equals", stateId: "private_value", value: 1 },
        ],
      },
    ],
  };
}

function createGrant(...capabilityIds: string[]): MechanicCapabilityGrant {
  return {
    capabilityVersion: MECHANIC_CAPABILITY_VERSION,
    capabilities: capabilityIds.map((capabilityId, index) => ({
      ...mechanicCapabilityRegistry.capabilities.find(
        (capability) => capability.id === capabilityId
      )!,
      justification: {
        kind: "contract_declaration" as const,
        path: `capabilities.${index}`,
      },
    })),
  };
}
