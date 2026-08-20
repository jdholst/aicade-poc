import { describe, expect, it, vi } from "vitest";

import {
  MECHANIC_CAPABILITY_VERSION,
  PHASE_9_GENERATION_CONSTRAINT_SET,
  mechanicCapabilityRegistry,
} from "@/game-spec";

import {
  GENERATED_MECHANIC_SOURCE_TOOL,
  generatedMechanicSourceJsonSchema,
} from "./mechanic-source-generation-schema";
import { createOpenAiMechanicSourceProvider } from "./mechanic-source-generation-provider";

describe("OpenAI mechanic source provider", () => {
  it("requests and returns one strict Generated Mechanic Source candidate", async () => {
    const candidate = {
      schemaVersion: "generated_mechanic_source_candidate/v1",
      id: "generation_run_source_source_initial_1",
      contractId: "generic_contract",
      capabilityVersion: MECHANIC_CAPABILITY_VERSION,
      callbacks: [
        {
          id: "install_generic_source",
          kind: "install",
          source:
            'await capabilities.state.write("private_value", config.initialValue);',
        },
        {
          id: "dispose_generic_source",
          kind: "dispose",
          source: "return null;",
        },
      ],
    };
    const fetchImpl = vi.fn(async () =>
      Response.json({
        output: [
          {
            type: "function_call",
            name: GENERATED_MECHANIC_SOURCE_TOOL,
            arguments: JSON.stringify(candidate),
          },
        ],
      })
    );
    const provider = createOpenAiMechanicSourceProvider({ fetchImpl });

    const result = await provider({
      ...createProviderInput(),
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 1,
        kind: "initial",
        candidateArtifactId: "generation_run_source_source_initial_1",
      },
    });

    expect(result).toEqual(candidate);
    expect(generatedMechanicSourceJsonSchema.properties).not.toHaveProperty(
      "fixedStep"
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, request] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(request?.body));
    expect(body).toMatchObject({
      model: "gpt-5.4-mini",
      parallel_tool_calls: false,
      tool_choice: {
        type: "function",
        name: GENERATED_MECHANIC_SOURCE_TOOL,
      },
      tools: [
        {
          type: "function",
          name: GENERATED_MECHANIC_SOURCE_TOOL,
          strict: true,
          parameters: generatedMechanicSourceJsonSchema,
        },
      ],
    });
    expect(body.instructions).toContain(
      "Required top-level candidate artifact ID: generation_run_source_source_initial_1"
    );
  });

  it("rejects a structured source candidate with a mismatched attempt candidate ID", async () => {
    const provider = createOpenAiMechanicSourceProvider({
      fetchImpl: async () =>
        Response.json({
          output: [
            {
              type: "function_call",
              name: GENERATED_MECHANIC_SOURCE_TOOL,
              arguments: JSON.stringify({
                schemaVersion: "generated_mechanic_source_candidate/v1",
                id: "reused_source_candidate",
              }),
            },
          ],
        }),
    });

    await expect(
      provider({
        ...createProviderInput(),
        generationAttempt: {
          generationRunId: "generation_run_source",
          stage: "source",
          attemptNumber: 2,
          kind: "repair",
          candidateArtifactId: "generation_run_source_source_repair_2",
          repair: {
            trigger: "upstream_invalidation",
            failureAttemptId: "generation_run_source_contract_2",
            issues: [],
            invalidatedArtifactIds: [
              "generation_run_source_source_initial_1",
            ],
          },
        },
      })
    ).rejects.toMatchObject({
      name: "MechanicSourceGenerationProviderError",
      evidence: {
        code: "invalid_provider_output",
        issues: [
          expect.objectContaining({
            message: expect.stringContaining(
              "did not use the required attempt candidate ID"
            ),
          }),
        ],
      },
    });
  });
});

function createProviderInput() {
  const capability = mechanicCapabilityRegistry.capabilities.find(
    (entry) => entry.id === "state_write"
  )!;
  return {
    intent: {
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
      configuration: ["initial_value"],
      connections: [],
      references: [],
      outcomes: ["private_value_observable"],
      requiredCapabilities: ["state_write"],
      ambiguities: [],
    },
    resolution: {
      kind: "generated_mechanic" as const,
      intentId: "intent_generic_state",
      candidateBuiltInTypes: [],
      assumptions: [],
      coverage: {
        coveredRequirements: [],
        uncoveredRequirements: [
          {
            category: "behavior" as const,
            value: "initialize_private_value",
            coveredBy: [],
          },
        ],
      },
    },
    constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    contract: {
      schemaVersion: "generated-mechanic-contract/v1" as const,
      id: "generic_contract",
      intentId: "intent_generic_state",
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
            key: "initialValue",
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
      scenarios: [
        {
          id: "install_value",
          seed: 1729,
          setup: [],
          steps: [{ kind: "advance_time" as const, milliseconds: 1 }],
          observations: [
            {
              kind: "state_equals" as const,
              stateId: "private_value",
              value: 1,
            },
          ],
        },
      ],
    },
    grant: {
      capabilityVersion: MECHANIC_CAPABILITY_VERSION,
      capabilities: [
        {
          ...capability,
          justification: {
            kind: "contract_declaration" as const,
            path: "capabilities.0",
          },
        },
      ],
    },
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
    model: "gpt-5.4-mini" as const,
    providerCredential: "test-credential",
    taskRoute: "mechanic_source_generation.primary" as const,
  };
}
