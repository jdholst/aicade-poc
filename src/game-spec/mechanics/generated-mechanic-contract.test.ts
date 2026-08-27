import { describe, expect, it } from "vitest";

import {
  PHASE_9_GENERATION_CONSTRAINT_SET,
  validateGeneratedMechanicContract,
} from "..";

const validGeneratedMechanicContract = {
  schemaVersion: "generated-mechanic-contract/v1",
  id: "extension_runtime_rule",
  intentId: "intent_runtime_rule",
  capabilityVersion: "mechanic_capability/v1",
  behavior: {
    summary: "Apply a bounded runtime rule to a bound group of actors.",
    triggers: ["logical_action", "round_started"],
    outcomes: ["runtime_state_changes", "completion_signal_emitted"],
  },
  config: {
    kind: "object",
    fields: [
      {
        key: "enabled",
        required: true,
        value: { kind: "boolean", default: true },
      },
      {
        key: "intensity",
        required: true,
        value: {
          kind: "number",
          minimum: 0.25,
          maximum: 4,
          default: 1,
        },
      },
      {
        key: "label",
        required: false,
        value: {
          kind: "string",
          minimumLength: 1,
          maximumLength: 40,
          default: "active",
        },
      },
      {
        key: "mode",
        required: true,
        value: {
          kind: "enum",
          values: ["steady", "pulse"],
          default: "steady",
        },
      },
      {
        key: "focus_entity",
        required: false,
        value: { kind: "stable_id", referenceKind: "entity" },
      },
      {
        key: "timing",
        required: true,
        value: {
          kind: "object",
          fields: [
            {
              key: "duration_ms",
              required: true,
              value: {
                kind: "integer",
                minimum: 1,
                maximum: 5_000,
                default: 250,
              },
            },
          ],
        },
      },
      {
        key: "tags",
        required: false,
        value: {
          kind: "collection",
          minimumItems: 0,
          maximumItems: 4,
          item: {
            kind: "string",
            minimumLength: 1,
            maximumLength: 24,
          },
        },
      },
    ],
  },
  bindings: [
    {
      id: "actors",
      referenceKind: "entity",
      cardinality: "many",
      objectIds: ["actor_alpha"],
    },
  ],
  ownedObjects: [
    {
      id: "runtime_marker",
      objectKind: "effect",
      maximumInstances: 4,
    },
  ],
  privateState: [
    {
      id: "remaining_cycles",
      valueType: "integer",
      initialValue: 0,
    },
  ],
  lifecycle: {
    callbacks: ["install", "logical_action", "gameplay_event", "scheduled"],
    fixedStep: false,
    dispose: true,
  },
  ports: [
    {
      id: "round_started",
      direction: "input",
      payload: {
        kind: "object",
        fields: [
          {
            key: "round",
            required: true,
            value: { kind: "integer", minimum: 1, maximum: 100 },
          },
        ],
      },
    },
    {
      id: "completed",
      direction: "output",
      payload: { kind: "boolean" },
    },
  ],
  capabilities: [
    "object_read",
    "object_create",
    "state_write",
    "time_schedule",
    "signal_emit",
  ],
  resourceExpectations: {
    maximumOwnedObjects: 4,
    maximumOperationsPerTick: 20,
    maximumScheduledCallbacks: 1,
    maximumSubscriptions: 1,
    maximumSignalsPerTick: 1,
    maximumStateBytes: 64,
    maximumCallbackMilliseconds: 4,
    maximumConsecutiveFailures: 1,
  },
  scenarios: [
    {
      id: "activation_changes_state",
      seed: 42,
      setup: [
        { kind: "binding_present", bindingId: "actors" },
        {
          kind: "state_equals",
          stateId: "remaining_cycles",
          value: 0,
        },
      ],
      steps: [
        {
          kind: "receive_input",
          portId: "round_started",
          value: { round: 1 },
        },
        { kind: "dispatch_action", actionId: "activate" },
        { kind: "advance_time", milliseconds: 250 },
      ],
      observations: [
        {
          kind: "state_equals",
          stateId: "remaining_cycles",
          value: 1,
        },
        {
          kind: "binding_property",
          bindingId: "actors",
          property: "active",
          operator: "equals",
          value: true,
        },
        {
          kind: "owned_object_count",
          archetypeId: "runtime_marker",
          operator: "at_most",
          value: 4,
        },
        {
          kind: "output_emitted",
          portId: "completed",
          value: true,
        },
      ],
    },
  ],
};

const validationContext = {
  referenceCatalog: {
    entity: ["actor_alpha", "actor_beta", "actor_gamma"],
    action: ["activate"],
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

describe("validateGeneratedMechanicContract", () => {
  it("accepts a generic contract containing every restricted contract section", () => {
    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: validGeneratedMechanicContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: true,
      data: validGeneratedMechanicContract,
    });
  });

  it("rejects a deadline reset to its initial sentinel after the same action establishes a write", () => {
    const invalidContract = {
      ...validGeneratedMechanicContract,
      privateState: [
        {
          id: "cooldown_until",
          valueType: "integer",
          initialValue: -1,
        },
      ],
      scenarios: [
        {
          id: "action_sets_deadline",
          seed: 42,
          setup: [
            { kind: "binding_present", bindingId: "actors" },
            {
              kind: "state_equals",
              stateId: "cooldown_until",
              value: -1,
            },
          ],
          steps: [{ kind: "dispatch_action", actionId: "activate" }],
          observations: [
            {
              kind: "state_equals",
              stateId: "cooldown_until",
              value: 250,
            },
            {
              kind: "binding_property",
              bindingId: "actors",
              property: "active",
              operator: "equals",
              value: true,
            },
          ],
        },
        {
          id: "elapsed_deadline_keeps_initial_sentinel",
          seed: 43,
          setup: [
            { kind: "binding_present", bindingId: "actors" },
            {
              kind: "state_equals",
              stateId: "cooldown_until",
              value: -1,
            },
          ],
          steps: [
            { kind: "dispatch_action", actionId: "activate" },
            { kind: "advance_time", milliseconds: 250 },
          ],
          observations: [
            {
              kind: "state_equals",
              stateId: "cooldown_until",
              value: -1,
            },
            {
              kind: "binding_property",
              bindingId: "actors",
              property: "active",
              operator: "equals",
              value: true,
            },
          ],
        },
      ],
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "scenarios.1.observations.0",
            code: "contradiction",
            message:
              'Scenario "elapsed_deadline_keeps_initial_sentinel" requires deadline state "cooldown_until" to return to its initial sentinel after action "activate" and time advancement, but another dispatch-only scenario establishes that the same action writes a different deadline. Elapsing a *_until deadline does not reset its stored value; require the deterministic written deadline or omit the final state observation.',
          },
        ],
      },
    });

    const unwitnessedContract = {
      ...invalidContract,
      scenarios: [invalidContract.scenarios[1]],
    };
    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: unwitnessedContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: true,
      data: unwitnessedContract,
    });
  });

  it("rejects Config DSL nesting beyond the active constraint set", () => {
    const invalidContract = {
      ...validGeneratedMechanicContract,
      config: {
        kind: "object",
        fields: [
          {
            key: "level_two",
            required: true,
            value: {
              kind: "object",
              fields: [
                {
                  key: "level_three",
                  required: true,
                  value: {
                    kind: "object",
                    fields: [
                      {
                        key: "level_four",
                        required: true,
                        value: {
                          kind: "object",
                          fields: [
                            {
                              key: "level_five",
                              required: true,
                              value: { kind: "object", fields: [] },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "config.fields.0.value.fields.0.value.fields.0.value.fields.0.value",
            code: "complexity_limit",
            message:
              "Config DSL nesting depth 5 exceeds the active limit of 4.",
          },
        ],
      },
    });
  });

  it("rejects Config DSL field counts beyond the active constraint set", () => {
    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: validGeneratedMechanicContract,
        constraintSet: {
          ...PHASE_9_GENERATION_CONSTRAINT_SET,
          configDslComplexity: {
            ...PHASE_9_GENERATION_CONSTRAINT_SET.configDslComplexity,
            maximumFields: 7,
          },
        },
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "config",
            code: "complexity_limit",
            message: "Config DSL uses 8 fields, exceeding the active limit of 7.",
          },
        ],
      },
    });
  });

  it("rejects Config DSL collection bounds beyond the active constraint set", () => {
    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: validGeneratedMechanicContract,
        constraintSet: {
          ...PHASE_9_GENERATION_CONSTRAINT_SET,
          configDslComplexity: {
            ...PHASE_9_GENERATION_CONSTRAINT_SET.configDslComplexity,
            maximumCollectionItems: 3,
          },
        },
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "config.fields.6.value.maximumItems",
            code: "complexity_limit",
            message:
              "Config DSL collection maximum 4 exceeds the active limit of 3.",
          },
        ],
      },
    });
  });

  it("reports Config DSL contradictions at the smallest responsible fields", () => {
    const invalidContract = {
      ...validGeneratedMechanicContract,
      config: {
        kind: "object",
        fields: [
          {
            key: "threshold",
            required: true,
            value: {
              kind: "number",
              minimum: 10,
              maximum: 5,
              default: 12,
            },
          },
          {
            key: "threshold",
            required: false,
            value: {
              kind: "enum",
              values: ["first", "first"],
              default: "missing",
            },
          },
          {
            key: "items",
            required: false,
            value: {
              kind: "collection",
              minimumItems: 3,
              maximumItems: 2,
              item: { kind: "boolean" },
            },
          },
        ],
      },
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "config.fields.0.value.default",
            code: "above_maximum",
            message: "Config DSL default 12 is above the declared maximum 5.",
          },
          {
            path: "config.fields.0.value.maximum",
            code: "contradiction",
            message: "Config DSL maximum 5 is below its minimum 10.",
          },
          {
            path: "config.fields.1.key",
            code: "duplicate_id",
            message: 'Config DSL field key "threshold" is duplicated.',
          },
          {
            path: "config.fields.1.value.default",
            code: "invalid_value",
            message:
              'Config DSL enum default "missing" is not one of its declared values.',
          },
          {
            path: "config.fields.1.value.values.1",
            code: "duplicate_id",
            message: 'Config DSL enum value "first" is duplicated.',
          },
          {
            path: "config.fields.2.value.maximumItems",
            code: "contradiction",
            message: "Config DSL collection maximum 2 is below its minimum 3.",
          },
        ],
      },
    });
  });

  it.each([
    {
      label: "boolean",
      config: { kind: "boolean", default: "yes" },
      code: "invalid_type",
      message:
        'Generated mechanic contract field "config.default" has the wrong type.',
    },
    {
      label: "integer",
      config: { kind: "integer", minimum: 0, maximum: 2, default: 1.5 },
      code: "invalid_type",
      message:
        'Generated mechanic contract field "config.default" has the wrong type.',
    },
    {
      label: "string",
      config: {
        kind: "string",
        minimumLength: 1,
        maximumLength: 3,
        default: "long",
      },
      code: "above_maximum",
      message:
        "Config DSL default length 4 is above the declared maximum 3.",
    },
  ])("rejects an invalid $label Config DSL primitive", ({ config, code, message }) => {
    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: { ...validGeneratedMechanicContract, config },
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [{ path: "config.default", code, message }],
      },
    });
  });

  it("reports invalid Behavior Scenario DSL references at their use sites", () => {
    const invalidContract = {
      ...validGeneratedMechanicContract,
      scenarios: [
        {
          ...validGeneratedMechanicContract.scenarios[0],
          setup: [
            { kind: "binding_present", bindingId: "missing_binding" },
            {
              kind: "state_equals",
              stateId: "missing_state",
              value: 0,
            },
          ],
          steps: [
            {
              kind: "receive_input",
              portId: "missing_input",
              value: true,
            },
          ],
          observations: [
            {
              kind: "binding_property",
              bindingId: "missing_binding",
              property: "active",
              operator: "equals",
              value: true,
            },
            {
              kind: "owned_object_count",
              archetypeId: "missing_archetype",
              operator: "equals",
              value: 0,
            },
            {
              kind: "output_emitted",
              portId: "missing_output",
              value: true,
            },
          ],
        },
      ],
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "scenarios.0.observations.0.bindingId",
            code: "unknown_reference",
            message:
              'Scenario binding reference "missing_binding" does not match a declared binding.',
          },
          {
            path: "scenarios.0.observations.1.archetypeId",
            code: "unknown_reference",
            message:
              'Scenario archetype reference "missing_archetype" does not match a declared owned object.',
          },
          {
            path: "scenarios.0.observations.2.portId",
            code: "unknown_reference",
            message:
              'Scenario output reference "missing_output" does not match a declared output port.',
          },
          {
            path: "scenarios.0.setup.0.bindingId",
            code: "unknown_reference",
            message:
              'Scenario binding reference "missing_binding" does not match a declared binding.',
          },
          {
            path: "scenarios.0.setup.1.stateId",
            code: "unknown_reference",
            message:
              'Scenario state reference "missing_state" does not match a declared private state field.',
          },
          {
            path: "scenarios.0.steps.0.portId",
            code: "unknown_reference",
            message:
              'Scenario input reference "missing_input" does not match a declared input port.',
          },
        ],
      },
    });
  });

  it("rejects duplicate contract identifiers and contradictory declarations", () => {
    const invalidContract = {
      ...validGeneratedMechanicContract,
      capabilityVersion: "mechanic_capability/v2",
      bindings: [
        ...validGeneratedMechanicContract.bindings,
        {
          ...validGeneratedMechanicContract.bindings[0],
          cardinality: "one",
          objectIds: ["actor_beta", "actor_gamma"],
        },
      ],
      ownedObjects: [
        ...validGeneratedMechanicContract.ownedObjects,
        { ...validGeneratedMechanicContract.ownedObjects[0] },
      ],
      privateState: [
        ...validGeneratedMechanicContract.privateState,
        { ...validGeneratedMechanicContract.privateState[0] },
      ],
      ports: [
        ...validGeneratedMechanicContract.ports,
        { ...validGeneratedMechanicContract.ports[1] },
      ],
      capabilities: [
        ...validGeneratedMechanicContract.capabilities,
        "object_read",
      ],
      scenarios: [
        ...validGeneratedMechanicContract.scenarios,
        { ...validGeneratedMechanicContract.scenarios[0] },
      ],
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "bindings.1.id",
            code: "duplicate_id",
            message: 'Contract binding ID "actors" is duplicated.',
          },
          {
            path: "bindings.1.objectIds",
            code: "contradiction",
            message:
              'Binding "actors" declares cardinality "one" but references 2 objects.',
          },
          {
            path: "capabilities.5",
            code: "duplicate_id",
            message: 'Contract capability "object_read" is duplicated.',
          },
          {
            path: "capabilityVersion",
            code: "contradiction",
            message:
              'Contract capability version "mechanic_capability/v2" does not match the active version "mechanic_capability/v1".',
          },
          {
            path: "ownedObjects.1.id",
            code: "duplicate_id",
            message: 'Contract owned object ID "runtime_marker" is duplicated.',
          },
          {
            path: "ports.2.id",
            code: "duplicate_id",
            message: 'Contract port ID "completed" is duplicated.',
          },
          {
            path: "privateState.1.id",
            code: "duplicate_id",
            message: 'Contract private state ID "remaining_cycles" is duplicated.',
          },
          {
            path: "resourceExpectations.maximumOwnedObjects",
            code: "contradiction",
            message:
              "Owned object declarations allow 8 instances, exceeding the contract expectation of 4.",
          },
          {
            path: "scenarios.1.id",
            code: "duplicate_id",
            message: 'Contract scenario ID "activation_changes_state" is duplicated.',
          },
        ],
      },
    });
  });

  it("rejects lifecycle, state, and resource declarations that contradict scenarios", () => {
    const invalidContract = {
      ...validGeneratedMechanicContract,
      privateState: [
        {
          ...validGeneratedMechanicContract.privateState[0],
          initialValue: true,
        },
      ],
      lifecycle: {
        ...validGeneratedMechanicContract.lifecycle,
        callbacks: ["install"],
      },
      resourceExpectations: {
        ...validGeneratedMechanicContract.resourceExpectations,
        maximumStateBytes: 0,
      },
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "privateState.0.initialValue",
            code: "invalid_value",
            message:
              'Private state "remaining_cycles" initial value does not match declared type "integer".',
          },
          {
            path: "resourceExpectations.maximumStateBytes",
            code: "contradiction",
            message:
              "Private state is declared but the contract expects zero state bytes.",
          },
          {
            path: "scenarios.0.steps.0.kind",
            code: "contradiction",
            message:
              'Scenario input delivery requires lifecycle callback "gameplay_event".',
          },
          {
            path: "scenarios.0.steps.1.kind",
            code: "contradiction",
            message:
              'Scenario action dispatch requires lifecycle callback "logical_action".',
          },
          {
            path: "scenarios.0.steps.2.kind",
            code: "contradiction",
            message:
              'Scenario time advancement requires lifecycle callback "scheduled" or fixed-step updates.',
          },
        ],
      },
    });
  });

  it("enforces the active minimum Behavior Scenario DSL evidence", () => {
    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: validGeneratedMechanicContract,
        constraintSet: {
          ...PHASE_9_GENERATION_CONSTRAINT_SET,
          evidenceRequirements: {
            ...PHASE_9_GENERATION_CONSTRAINT_SET.evidenceRequirements,
            minimumBehaviorScenarios: 2,
          },
        },
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "scenarios",
            code: "below_minimum",
            message:
              "Contract provides 1 behavior scenario, below the active minimum of 2.",
          },
        ],
      },
    });
  });

  it("rejects invalid shapes and executable-validator fields with stable paths", () => {
    const invalidContract = {
      ...validGeneratedMechanicContract,
      config: {
        ...validGeneratedMechanicContract.config,
        validate: "return true;",
      },
      resourceExpectations: {
        ...validGeneratedMechanicContract.resourceExpectations,
        maximumOwnedObjects: "four",
      },
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "config.validate",
            code: "unknown_field",
            message:
              'Generated mechanic contract field "config.validate" is not supported.',
          },
          {
            path: "resourceExpectations.maximumOwnedObjects",
            code: "invalid_type",
            message:
              'Generated mechanic contract field "resourceExpectations.maximumOwnedObjects" has the wrong type.',
          },
        ],
      },
    });
  });

  it("round-trips accepted contracts and rejects non-JSON scenario values", () => {
    const roundTrippedContract = JSON.parse(
      JSON.stringify(validGeneratedMechanicContract)
    );

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: roundTrippedContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: true,
      data: validGeneratedMechanicContract,
    });

    const invalidContract = {
      ...validGeneratedMechanicContract,
      scenarios: [
        {
          ...validGeneratedMechanicContract.scenarios[0],
          observations: [
            {
              ...validGeneratedMechanicContract.scenarios[0].observations[0],
              value: () => true,
            },
          ],
        },
      ],
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "scenarios.0.observations.0.value",
            code: "non_json_value",
            message:
              'Generated mechanic contract field "scenarios.0.observations.0.value" must contain only JSON-safe values.',
          },
        ],
      },
    });
  });

  it("applies the active collection limit to Config DSL enum values", () => {
    const invalidContract = {
      ...validGeneratedMechanicContract,
      config: {
        kind: "object",
        fields: [
          {
            key: "mode",
            required: true,
            value: {
              kind: "enum",
              values: ["first", "second"],
              default: "first",
            },
          },
        ],
      },
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: {
          ...PHASE_9_GENERATION_CONSTRAINT_SET,
          configDslComplexity: {
            ...PHASE_9_GENERATION_CONSTRAINT_SET.configDslComplexity,
            maximumCollectionItems: 1,
          },
        },
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "config.fields.0.value.values",
            code: "complexity_limit",
            message:
              "Config DSL enum declares 2 values, exceeding the active limit of 1.",
          },
        ],
      },
    });
  });

  it("rejects references that are absent from the trusted Game Spec catalog", () => {
    const invalidContract = {
      ...validGeneratedMechanicContract,
      config: {
        kind: "stable_id",
        referenceKind: "entity",
        default: "missing_actor",
      },
      bindings: [
        {
          ...validGeneratedMechanicContract.bindings[0],
          objectIds: ["missing_actor"],
        },
      ],
      scenarios: [
        {
          ...validGeneratedMechanicContract.scenarios[0],
          steps: [
            {
              kind: "dispatch_action",
              actionId: "missing_action",
            },
          ],
        },
      ],
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "bindings.0.objectIds.0",
            code: "unknown_reference",
            message:
              'Binding object reference "missing_actor" is absent from the trusted "entity" catalog.',
          },
          {
            path: "config.default",
            code: "unknown_reference",
            message:
              'Config DSL stable ID "missing_actor" is absent from the trusted "entity" catalog.',
          },
          {
            path: "scenarios.0.steps.0.actionId",
            code: "unknown_reference",
            message:
              'Scenario action reference "missing_action" is absent from the trusted "action" catalog.',
          },
        ],
      },
    });
  });

  it("rejects a stable ID DSL reference kind absent from the trusted catalog", () => {
    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: {
          ...validGeneratedMechanicContract,
          config: { kind: "stable_id", referenceKind: "missing_kind" },
        },
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "config.referenceKind",
            code: "unknown_reference",
            message:
              'Config DSL reference kind "missing_kind" is absent from the trusted reference catalog.',
          },
        ],
      },
    });
  });

  it("treats inherited object properties as absent reference kinds", () => {
    expect(() =>
      validateGeneratedMechanicContract({
        ...validationContext,
        input: {
          ...validGeneratedMechanicContract,
          config: {
            kind: "stable_id",
            referenceKind: "constructor",
            default: "actor_alpha",
          },
          bindings: [
            {
              ...validGeneratedMechanicContract.bindings[0],
              referenceKind: "constructor",
            },
          ],
        },
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).not.toThrow();

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: {
          ...validGeneratedMechanicContract,
          config: {
            kind: "stable_id",
            referenceKind: "constructor",
            default: "actor_alpha",
          },
          bindings: [
            {
              ...validGeneratedMechanicContract.bindings[0],
              referenceKind: "constructor",
            },
          ],
        },
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "bindings.0.referenceKind",
            code: "unknown_reference",
            message:
              'Binding reference kind "constructor" is absent from the trusted reference catalog.',
          },
          {
            path: "config.referenceKind",
            code: "unknown_reference",
            message:
              'Config DSL reference kind "constructor" is absent from the trusted reference catalog.',
          },
        ],
      },
    });
  });

  it("checks Behavior Scenario values against declared state and port DSL types", () => {
    const invalidContract = {
      ...validGeneratedMechanicContract,
      scenarios: [
        {
          ...validGeneratedMechanicContract.scenarios[0],
          setup: [
            {
              kind: "state_equals",
              stateId: "remaining_cycles",
              value: "zero",
            },
          ],
          steps: [
            {
              kind: "receive_input",
              portId: "round_started",
              value: true,
            },
          ],
          observations: [
            {
              kind: "output_emitted",
              portId: "completed",
              value: { completed: true },
            },
          ],
        },
      ],
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "scenarios.0.observations.0.value",
            code: "invalid_value",
            message:
              'Scenario output value does not match the declared payload for port "completed".',
          },
          {
            path: "scenarios.0.setup.0.value",
            code: "invalid_value",
            message:
              'Scenario state value does not match the declared type for "remaining_cycles".',
          },
          {
            path: "scenarios.0.steps.0.value",
            code: "invalid_value",
            message:
              'Scenario input value does not match the declared payload for port "round_started".',
          },
        ],
      },
    });
  });

  it("applies active Config DSL complexity limits to port payloads", () => {
    const invalidContract = {
      ...validGeneratedMechanicContract,
      config: { kind: "boolean" },
      ports: [
        {
          id: "round_started",
          direction: "input",
          payload: {
            kind: "object",
            fields: [
              {
                key: "nested",
                required: true,
                value: {
                  kind: "object",
                  fields: [],
                },
              },
            ],
          },
        },
        validGeneratedMechanicContract.ports[1],
      ],
      scenarios: [
        {
          ...validGeneratedMechanicContract.scenarios[0],
          steps: [
            {
              kind: "receive_input",
              portId: "round_started",
              value: { nested: {} },
            },
          ],
        },
      ],
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: {
          ...PHASE_9_GENERATION_CONSTRAINT_SET,
          configDslComplexity: {
            ...PHASE_9_GENERATION_CONSTRAINT_SET.configDslComplexity,
            maximumDepth: 1,
          },
        },
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "ports.0.payload.fields.0.value",
            code: "complexity_limit",
            message:
              'Config DSL nesting depth 2 at "ports.0.payload.fields.0.value" exceeds the active limit of 1.',
          },
        ],
      },
    });
  });

  it("requires installation and rejects resource expectations above the selected budget", () => {
    const invalidContract = {
      ...validGeneratedMechanicContract,
      lifecycle: {
        ...validGeneratedMechanicContract.lifecycle,
        callbacks: ["logical_action", "gameplay_event", "scheduled"],
      },
      resourceExpectations: {
        maximumOwnedObjects: 9,
        maximumOperationsPerTick: 41,
        maximumScheduledCallbacks: 5,
        maximumSubscriptions: 5,
        maximumSignalsPerTick: 5,
        maximumStateBytes: 257,
        maximumCallbackMilliseconds: 9,
        maximumConsecutiveFailures: 3,
      },
    };

    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        input: invalidContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "lifecycle.callbacks",
            code: "contradiction",
            message: 'Generated mechanics must declare the "install" lifecycle callback.',
          },
          ...Object.entries(validationContext.resourceBudget)
            .filter(([field]) => field !== "profileId")
            .map(([field, maximum]) => ({
              path: `resourceExpectations.${field}`,
              code: "above_maximum",
              message: `Contract resource expectation ${field} exceeds the selected budget maximum of ${maximum}.`,
            }))
            .sort((left, right) => left.path.localeCompare(right.path)),
        ],
      },
    });
  });

  it("rejects a trusted resource budget from a different active profile", () => {
    expect(
      validateGeneratedMechanicContract({
        ...validationContext,
        resourceBudget: {
          ...validationContext.resourceBudget,
          profileId: "different_budget",
        },
        input: validGeneratedMechanicContract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "resourceExpectations",
            code: "contradiction",
            message:
              'Selected resource budget "different_budget" does not match the active profile "phase_9_fixed_budget".',
          },
        ],
      },
    });
  });
});
