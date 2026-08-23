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

  it("rejects a same-ID contract that drops required intent semantics", async () => {
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
        behavior: {
          summary: "Perform an unrelated motion effect.",
          triggers: ["install"],
          outcomes: ["unrelated_motion"],
        },
        capabilities: ["object_motion_write"],
      }),
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: "contradiction",
            message: expect.stringContaining("state_write"),
          }),
          expect.objectContaining({
            code: "contradiction",
            message: expect.stringContaining("logical_action"),
          }),
          expect.objectContaining({
            code: "contradiction",
            message: expect.stringContaining("enabled_state_observable"),
          }),
        ]),
      },
    });
  });

  it("rejects a same-ID contract that drops routed entity and config lineage", async () => {
    const routedIntent: MechanicIntent = {
      ...intent,
      references: [{ kind: "entity", id: "entity_player" }],
      configuration: [{ key: "strength", value: 2 }],
    };
    const result = await generateMechanicContract({
      intent: routedIntent,
      admittedRequest: {
        resolution: { ...resolution, intentId: routedIntent.id },
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      },
      ...validationContext,
      referenceCatalog: {
        ...validationContext.referenceCatalog,
        entity: ["entity_player"],
      },
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => candidate,
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: "contradiction",
            message: expect.stringContaining("entity_player"),
          }),
          expect.objectContaining({
            code: "contradiction",
            message: expect.stringContaining("strength"),
          }),
        ]),
      },
    });
  });

  it("rejects a same-key contract that substitutes the creator's configuration value", async () => {
    const configuredIntent: MechanicIntent = {
      ...intent,
      configuration: [{ key: "strength", value: 2 }],
    };
    const result = await generateMechanicContract({
      intent: configuredIntent,
      admittedRequest: {
        resolution: { ...resolution, intentId: configuredIntent.id },
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      },
      ...validationContext,
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => ({
        ...candidate,
        config: {
          kind: "object",
          fields: [
            {
              key: "strength",
              required: true,
              value: {
                kind: "number",
                minimum: 0,
                maximum: 100,
                default: 99,
              },
            },
          ],
        },
      }),
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          expect.objectContaining({
            path: "config.fields.strength.value.default",
            code: "contradiction",
            message: expect.stringContaining("accepted value 2"),
          }),
        ],
      },
    });
  });

  it("rejects a positive final owned-object count after the accepted transient lifetime", async () => {
    const transientIntent: MechanicIntent = {
      ...intent,
      ownedObjects: ["projectile"],
      temporalRules: ["projectile_expires"],
      configuration: [{ key: "projectile_lifetime_ms", value: 1200 }],
      requiredCapabilities: [
        "state_write",
        "object_create",
        "object_motion_write",
        "object_destroy",
        "time_schedule",
      ],
    };
    const result = await generateMechanicContract({
      intent: transientIntent,
      admittedRequest: {
        resolution: { ...resolution, intentId: transientIntent.id },
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      },
      ...validationContext,
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => ({
        ...candidate,
        config: {
          kind: "object",
          fields: [
            {
              key: "projectile_lifetime_ms",
              required: true,
              value: {
                kind: "number",
                minimum: 1,
                maximum: 10000,
                default: 1200,
              },
            },
          ],
        },
        ownedObjects: [
          {
            id: "projectile",
            objectKind: "projectile",
            maximumInstances: 1,
          },
        ],
        capabilities: transientIntent.requiredCapabilities,
        lifecycle: {
          ...candidate.lifecycle,
          callbacks: ["install", "logical_action", "scheduled"],
        },
        resourceExpectations: {
          ...candidate.resourceExpectations,
          maximumOwnedObjects: 1,
          maximumOperationsPerTick: 8,
          maximumScheduledCallbacks: 1,
        },
        scenarios: [
          {
            id: "projectile_expires",
            seed: 7,
            setup: [
              {
                kind: "state_equals",
                stateId: "enabled",
                value: false,
              },
            ],
            steps: [
              { kind: "dispatch_action", actionId: "toggle" },
              { kind: "advance_time", milliseconds: 1200 },
            ],
            observations: [
              {
                kind: "owned_object_count",
                archetypeId: "projectile",
                operator: "at_least",
                value: 1,
              },
            ],
          },
        ],
      }),
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          expect.objectContaining({
            path: "scenarios.0.observations.0",
            code: "contradiction",
            message: expect.stringContaining(
              "accepted transient lifetime 1200ms"
            ),
          }),
        ],
      },
    });
  });

  it("stamps exact trusted semantic lineage and ignores provider-authored substitutions", async () => {
    const semanticIntent: MechanicIntent = {
      ...intent,
      actors: ["player"],
      targets: ["enemy"],
      behaviors: ["toggle_private_state", "apply_pressure"],
      stateChanges: ["enabled_changes", "pressure_changes"],
      temporalRules: ["once_per_action"],
      spatialRules: ["inside_arena"],
      constraints: ["bounded_pressure"],
      connections: [{ direction: "input", port: "toggle" }],
      references: [{ kind: "scene", id: "scene_arena" }],
    };

    const result = await generateMechanicContract({
      intent: semanticIntent,
      admittedRequest: {
        resolution,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      },
      ...validationContext,
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => ({
        ...candidate,
        intentLineage: {
          actors: ["substituted_actor"],
          targets: [],
          behaviors: ["unrelated_behavior"],
          stateChanges: [],
          temporalRules: [],
          spatialRules: [],
          constraints: [],
          connections: [{ direction: "input", port: "substituted_action" }],
          references: [{ kind: "entity", id: "substituted_entity" }],
        },
      }),
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        contract: {
          intentLineage: {
            actors: ["player"],
            targets: ["enemy"],
            behaviors: ["toggle_private_state", "apply_pressure"],
            stateChanges: ["enabled_changes", "pressure_changes"],
            temporalRules: ["once_per_action"],
            spatialRules: ["inside_arena"],
            constraints: ["bounded_pressure"],
            connections: [{ direction: "input", port: "toggle" }],
            references: [{ kind: "scene", id: "scene_arena" }],
          },
        },
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
