import { describe, expect, it } from "vitest";

import {
  PHASE_9_GENERATION_CONSTRAINT_SET,
  type GeneratedMechanicResolution,
  type MechanicIntent,
} from "@/game-spec";

import {
  generateMechanicContract,
  MechanicContractGenerationProviderError,
} from "./mechanic-contract-generation-service";

const intent: MechanicIntent = {
  id: "intent_runtime_rule",
  summary: "Toggle a private state value when the creator action is used.",
  triggers: ["logical_action"],
  actors: ["player"],
  targets: [],
  behaviors: ["toggle_private_state"],
  ownedObjects: [],
  stateChanges: ["enabled_changes"],
  temporalRules: [],
  spatialRules: [],
  constraints: [],
  configuration: [],
  connections: [],
  references: [],
  outcomes: ["enabled_state_observable"],
  requiredCapabilities: ["state_write"],
  ambiguities: [],
};

const resolution: GeneratedMechanicResolution = {
  kind: "generated_mechanic",
  intentId: intent.id,
  candidateBuiltInTypes: [],
  assumptions: [],
  coverage: {
    coveredRequirements: [],
    uncoveredRequirements: [
      {
        category: "behavior",
        value: "toggle_private_state",
        coveredBy: [],
      },
    ],
  },
};

const candidate = {
  schemaVersion: "generated-mechanic-contract/v1",
  id: "generated_runtime_rule",
  intentId: intent.id,
  capabilityVersion: "mechanic_capability/v1",
  behavior: {
    summary: "Toggle a bounded private state value from a logical action.",
    triggers: ["logical_action"],
    outcomes: ["enabled_state_observable"],
  },
  config: { kind: "boolean" },
  bindings: [],
  ownedObjects: [],
  privateState: [
    {
      id: "enabled",
      valueType: "boolean",
      initialValue: false,
    },
  ],
  lifecycle: {
    callbacks: ["install", "logical_action"],
    fixedStep: false,
    dispose: true,
  },
  ports: [],
  capabilities: ["state_write"],
  resourceExpectations: {
    maximumOwnedObjects: 0,
    maximumOperationsPerTick: 1,
    maximumScheduledCallbacks: 0,
    maximumSubscriptions: 0,
    maximumSignalsPerTick: 0,
    maximumStateBytes: 16,
    maximumCallbackMilliseconds: 2,
    maximumConsecutiveFailures: 1,
  },
  scenarios: [
    {
      id: "action_toggles_state",
      seed: 7,
      setup: [
        {
          kind: "state_equals",
          stateId: "enabled",
          value: false,
        },
      ],
      steps: [{ kind: "dispatch_action", actionId: "toggle" }],
      observations: [
        {
          kind: "state_equals",
          stateId: "enabled",
          value: true,
        },
      ],
    },
  ],
};

const validationContext = {
  referenceCatalog: {
    action: ["toggle"],
  },
  resourceBudget: {
    profileId: "phase_9_fixed_budget",
    maximumOwnedObjects: 8,
    maximumOperationsPerTick: 40,
    maximumScheduledCallbacks: 4,
    maximumSubscriptions: 4,
    maximumSignalsPerTick: 4,
    maximumStateBytes: 256,
    maximumCallbackMilliseconds: 8,
    maximumConsecutiveFailures: 2,
  },
};

describe("generateMechanicContract", () => {
  it("returns a contract and exact capability grant for an admitted intent", async () => {
    const providerCalls: unknown[] = [];

    const result = await generateMechanicContract({
      intent,
      admittedRequest: {
        resolution,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      },
      ...validationContext,
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async (input) => {
        providerCalls.push(input);
        return candidate;
      },
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        contract: candidate,
        grant: {
          capabilityVersion: "mechanic_capability/v1",
          capabilities: [
            {
              id: "state_write",
              justification: {
                kind: "contract_declaration",
                path: "capabilities.0",
              },
            },
          ],
        },
      },
    });
    expect(providerCalls).toEqual([
      {
        intent,
        resolution,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
        ...validationContext,
        model: "gpt-5.4-mini",
        providerCredential: "sk-test",
        taskRoute: "mechanic_contract_generation.primary",
      },
    ]);
  });

  it("returns exact contract-validation evidence for invalid provider output", async () => {
    const invalidCandidate = {
      ...candidate,
      source: "export function install() {}",
    };

    const result = await generateMechanicContract({
      intent,
      admittedRequest: {
        resolution,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      },
      ...validationContext,
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => invalidCandidate,
    });

    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "source",
            code: "unknown_field",
            message:
              'Generated mechanic contract field "source" is not supported.',
          },
        ],
      },
    });
  });

  it("rejects a valid contract artifact that targets a different intent", async () => {
    const result = await generateMechanicContract({
      intent,
      admittedRequest: {
        resolution,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      },
      ...validationContext,
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => ({
        ...candidate,
        intentId: "intent_other_rule",
      }),
    });

    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "intentId",
            code: "contradiction",
            message:
              'Generated mechanic contract intent "intent_other_rule" does not match accepted intent "intent_runtime_rule".',
          },
        ],
      },
    });
  });

  it("rejects mismatched admitted resolution evidence before calling the provider", async () => {
    let providerCallCount = 0;
    const mismatchedResolution = {
      ...resolution,
      intentId: "intent_other_rule",
    };

    const result = await generateMechanicContract({
      intent,
      admittedRequest: {
        resolution: mismatchedResolution,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      },
      ...validationContext,
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => {
        providerCallCount += 1;
        return candidate;
      },
    });

    expect(providerCallCount).toBe(0);
    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "contract_generation",
        code: "invalid_generation_request",
        issues: [
          {
            path: "resolution.intentId",
            code: "intent_mismatch",
            message:
              'Admitted resolution intent "intent_other_rule" does not match accepted intent "intent_runtime_rule".',
          },
        ],
      },
    });
  });

  it("returns the registry's exact capability-admission evidence", async () => {
    const result = await generateMechanicContract({
      intent,
      admittedRequest: {
        resolution,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      },
      ...validationContext,
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => ({
        ...candidate,
        capabilities: ["unsupported_capability"],
      }),
    });

    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "capability_admission",
        code: "invalid_mechanic_capability_grant",
        issues: [
          {
            path: "capabilities.0",
            code: "unknown_capability",
            message:
              'Capability "unsupported_capability" is not present in Mechanic Capability Version "mechanic_capability/v1".',
          },
        ],
      },
    });
  });

  it("returns provider cancellation evidence without repair fallback", async () => {
    const evidence = {
      stage: "contract_generation" as const,
      code: "provider_cancelled" as const,
      issues: [
        {
          path: "provider" as const,
          code: "provider_cancelled" as const,
          message: "Generated Mechanic Contract creation was cancelled.",
        },
      ],
    };

    const result = await generateMechanicContract({
      intent,
      admittedRequest: {
        resolution,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      },
      ...validationContext,
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => {
        throw new MechanicContractGenerationProviderError(evidence);
      },
    });

    expect(result).toEqual({ success: false, evidence });
  });
});
