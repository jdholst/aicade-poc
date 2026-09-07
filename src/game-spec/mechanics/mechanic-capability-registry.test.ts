import { describe, expect, it } from "vitest";

import {
  behaviorScenarioSchema,
  createMechanicCapabilityGrant,
  getMechanicCapabilityVersion,
  MECHANIC_CAPABILITY_VERSION,
  PHASE_9_GENERATION_CONSTRAINT_SET,
  validateMechanicCapabilityUsage,
} from "..";

describe("Mechanic Capability Registry", () => {
  it("publishes the first version as reusable primitive operations", () => {
    const version = getMechanicCapabilityVersion(MECHANIC_CAPABILITY_VERSION);

    expect(version).toBeDefined();
    expect(version?.version).toBe("mechanic_capability/v1");
    expect(version?.capabilities.map((capability) => capability.id)).toEqual([
      "object_read",
      "object_create",
      "object_motion_write",
      "object_destroy",
      "spatial_query",
      "state_read",
      "state_write",
      "time_read",
      "time_schedule",
      "random_next",
      "event_subscribe",
      "signal_emit",
    ]);
    expect(
      version?.capabilities.every(
        (capability) =>
          capability.description.length > 0 &&
          !/projectile|hazard|proximity|modifier/i.test(
            `${capability.id} ${capability.description}`
          )
      )
    ).toBe(true);
  });

  it("drives every named consumer from the same capability definitions", () => {
    const version = getMechanicCapabilityVersion(MECHANIC_CAPABILITY_VERSION);

    expect(version?.conformanceRequirements).toEqual([
      "exact_grant",
      "realm_only",
      "deterministic",
      "observable",
      "resource_accounted",
    ]);
    expect(
      version?.capabilities.map(
        ({
          id,
          authoring,
          runtimeOperation,
          evaluation,
          resourceCosts,
          requiresOpaqueHandle,
        }) => ({
          id,
          authoring,
          runtimeOperation,
          evaluation,
          resourceCosts,
          requiresOpaqueHandle,
        })
      )
    ).toEqual([
      {
        id: "object_read",
        authoring: {
          member: "objects.read",
          signature:
            "(handle: MechanicObjectHandle) => Readonly<MechanicObjectObservation>",
        },
        runtimeOperation: "object_read",
        evaluation: { actions: [], observations: ["binding_property"] },
        resourceCosts: { operationsPerTick: 1 },
        requiresOpaqueHandle: true,
      },
      {
        id: "object_create",
        authoring: {
          member: "objects.create",
          signature:
            "(archetypeId: MechanicOwnedObjectArchetypeId, initial: JsonValue) => MechanicObjectHandle",
        },
        runtimeOperation: "object_create",
        evaluation: { actions: [], observations: ["owned_object_count"] },
        resourceCosts: { operationsPerTick: 1, ownedObjects: 1 },
        requiresOpaqueHandle: false,
      },
      {
        id: "object_motion_write",
        authoring: {
          member: "objects.writeMotion",
          signature:
            "(handle: MechanicObjectHandle, motion: MechanicMotionMutation) => void",
        },
        runtimeOperation: "object_motion_write",
        evaluation: { actions: [], observations: ["binding_property"] },
        resourceCosts: { operationsPerTick: 1 },
        requiresOpaqueHandle: true,
      },
      {
        id: "object_destroy",
        authoring: {
          member: "objects.destroy",
          signature: "(handle: MechanicObjectHandle) => void",
        },
        runtimeOperation: "object_destroy",
        evaluation: { actions: [], observations: ["owned_object_count"] },
        resourceCosts: { operationsPerTick: 1 },
        requiresOpaqueHandle: true,
      },
      {
        id: "spatial_query",
        authoring: {
          member: "objects.querySpatial",
          signature:
            "(query: MechanicSpatialQuery) => readonly MechanicObjectHandle[]",
        },
        runtimeOperation: "spatial_query",
        evaluation: { actions: [], observations: ["binding_property"] },
        resourceCosts: { operationsPerTick: 1 },
        requiresOpaqueHandle: false,
      },
      {
        id: "state_read",
        authoring: {
          member: "state.read",
          signature: "(stateId: MechanicStateId) => JsonValue",
        },
        runtimeOperation: "state_read",
        evaluation: { actions: [], observations: ["state_equals"] },
        resourceCosts: { operationsPerTick: 1 },
        requiresOpaqueHandle: false,
      },
      {
        id: "state_write",
        authoring: {
          member: "state.write",
          signature: "(stateId: MechanicStateId, value: JsonValue) => void",
        },
        runtimeOperation: "state_write",
        evaluation: { actions: [], observations: ["state_equals"] },
        resourceCosts: { operationsPerTick: 1 },
        requiresOpaqueHandle: false,
      },
      {
        id: "time_read",
        authoring: {
          member: "time.now",
          signature: "() => MechanicSimulationMilliseconds",
        },
        runtimeOperation: "time_read",
        evaluation: { actions: ["advance_time"], observations: [] },
        resourceCosts: { operationsPerTick: 1 },
        requiresOpaqueHandle: false,
      },
      {
        id: "time_schedule",
        authoring: {
          member: "time.schedule",
          signature:
            "(delayMilliseconds: number, callbackId: MechanicCallbackId) => MechanicScheduleId",
        },
        runtimeOperation: "time_schedule",
        evaluation: { actions: ["advance_time"], observations: [] },
        resourceCosts: { operationsPerTick: 1, scheduledCallbacks: 1 },
        requiresOpaqueHandle: false,
      },
      {
        id: "random_next",
        authoring: {
          member: "random.next",
          signature: "() => number",
        },
        runtimeOperation: "random_next",
        evaluation: {
          actions: [],
          observations: [],
          scenarioInputs: ["seed"],
        },
        resourceCosts: { operationsPerTick: 1 },
        requiresOpaqueHandle: false,
      },
      {
        id: "event_subscribe",
        authoring: {
          member: "events.subscribe",
          signature:
            "(eventId: MechanicEventId, callbackId: MechanicCallbackId) => MechanicSubscriptionId",
        },
        runtimeOperation: "event_subscribe",
        evaluation: { actions: ["receive_input"], observations: [] },
        resourceCosts: { operationsPerTick: 1, subscriptions: 1 },
        requiresOpaqueHandle: false,
      },
      {
        id: "signal_emit",
        authoring: {
          member: "signals.emit",
          signature: "(portId: MechanicPortId, value: JsonValue) => void",
        },
        runtimeOperation: "signal_emit",
        evaluation: { actions: [], observations: ["output_emitted"] },
        resourceCosts: { operationsPerTick: 1, signalsPerTick: 1 },
        requiresOpaqueHandle: false,
      },
    ]);
  });

  it("keeps registry evaluation vocabulary accepted by the scenario DSL", () => {
    const version = getMechanicCapabilityVersion(MECHANIC_CAPABILITY_VERSION);

    expect(version).toBeDefined();
    if (!version) {
      throw new Error("Expected the first capability version to exist.");
    }

    const actionFixtures: Record<string, unknown> = {
      advance_time: { kind: "advance_time", milliseconds: 16 },
      receive_input: {
        kind: "receive_input",
        portId: "input_port",
        value: true,
      },
    };
    const observationFixtures: Record<string, unknown> = {
      binding_property: {
        kind: "binding_property",
        bindingId: "actor_binding",
        property: "active",
        operator: "equals",
        value: true,
      },
      owned_object_count: {
        kind: "owned_object_count",
        archetypeId: "owned_object",
        operator: "equals",
        value: 1,
      },
      output_emitted: {
        kind: "output_emitted",
        portId: "output_port",
        value: true,
      },
      state_equals: {
        kind: "state_equals",
        stateId: "private_state",
        value: true,
      },
    };
    const baseScenario = {
      id: "registry_vocabulary",
      seed: 42,
      setup: [],
      steps: [actionFixtures.advance_time],
      observations: [observationFixtures.state_equals],
    };
    const actions = new Set(
      version.capabilities.flatMap(
        (capability) => capability.evaluation.actions
      )
    );
    const observations = new Set(
      version.capabilities.flatMap(
        (capability) => capability.evaluation.observations
      )
    );
    const scenarioInputs = new Set(
      version.capabilities.flatMap((capability) =>
        "scenarioInputs" in capability.evaluation
          ? capability.evaluation.scenarioInputs
          : []
      )
    );

    for (const action of actions) {
      expect(actionFixtures[action]).toBeDefined();
      expect(
        behaviorScenarioSchema.safeParse({
          ...baseScenario,
          steps: [actionFixtures[action]],
        }).success
      ).toBe(true);
    }

    for (const observation of observations) {
      expect(observationFixtures[observation]).toBeDefined();
      expect(
        behaviorScenarioSchema.safeParse({
          ...baseScenario,
          observations: [observationFixtures[observation]],
        }).success
      ).toBe(true);
    }

    for (const scenarioInput of scenarioInputs) {
      expect(Object.hasOwn(baseScenario, scenarioInput)).toBe(true);
    }
  });

  it("keeps the active constraints pinned to registry membership", () => {
    const version = getMechanicCapabilityVersion(MECHANIC_CAPABILITY_VERSION);

    expect(PHASE_9_GENERATION_CONSTRAINT_SET.capabilityVersion).toBe(
      version?.version
    );
    expect(PHASE_9_GENERATION_CONSTRAINT_SET.admittedCapabilities).toEqual(
      version?.capabilities.map((capability) => capability.id)
    );
  });

  it("derives an exact grant from registered admitted contract declarations", () => {
    const result = createMechanicCapabilityGrant({
      contract: {
        capabilityVersion: MECHANIC_CAPABILITY_VERSION,
        capabilities: ["object_read", "state_write", "signal_emit"],
      },
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capabilityVersion).toBe(MECHANIC_CAPABILITY_VERSION);
      expect(
        result.data.capabilities.map(({ id, justification }) => ({
          id,
          justification,
        }))
      ).toEqual([
        {
          id: "object_read",
          justification: {
            kind: "contract_declaration",
            path: "capabilities.0",
          },
        },
        {
          id: "state_write",
          justification: {
            kind: "contract_declaration",
            path: "capabilities.1",
          },
        },
        {
          id: "signal_emit",
          justification: {
            kind: "contract_declaration",
            path: "capabilities.2",
          },
        },
      ]);
    }
  });

  it("rejects unknown and constraint-forbidden contract capabilities", () => {
    expect(
      createMechanicCapabilityGrant({
        contract: {
          capabilityVersion: MECHANIC_CAPABILITY_VERSION,
          capabilities: ["missing_operation", "object_create"],
        },
        constraintSet: {
          ...PHASE_9_GENERATION_CONSTRAINT_SET,
          admittedCapabilities: ["object_read"],
        },
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "capability_admission",
        code: "invalid_mechanic_capability_grant",
        issues: [
          {
            path: "capabilities.0",
            code: "unknown_capability",
            message:
              'Capability "missing_operation" is not present in Mechanic Capability Version "mechanic_capability/v1".',
          },
          {
            path: "capabilities.1",
            code: "forbidden_capability",
            message:
              'Capability "object_create" is not admitted by Generation Constraint Set "phase_9_generation_constraints".',
          },
        ],
      },
    });
  });

  it("rejects a contract pinned to a different active capability version", () => {
    expect(
      createMechanicCapabilityGrant({
        contract: {
          capabilityVersion: MECHANIC_CAPABILITY_VERSION,
          capabilities: ["object_read"],
        },
        constraintSet: {
          ...PHASE_9_GENERATION_CONSTRAINT_SET,
          capabilityVersion: "mechanic_capability/v2",
        },
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "capability_admission",
        code: "invalid_mechanic_capability_grant",
        issues: [
          {
            path: "capabilityVersion",
            code: "version_mismatch",
            message:
              'Contract capability version "mechanic_capability/v1" does not match active version "mechanic_capability/v2".',
          },
        ],
      },
    });
  });

  it("rejects undeclared source use and unjustified unused grant authority", () => {
    const grant = createMechanicCapabilityGrant({
      contract: {
        capabilityVersion: MECHANIC_CAPABILITY_VERSION,
        capabilities: ["object_read", "state_write"],
      },
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    });

    expect(grant.success).toBe(true);
    if (!grant.success) {
      throw new Error("Expected the capability grant fixture to be admitted.");
    }

    expect(
      validateMechanicCapabilityUsage({
        grant: grant.data,
        usedCapabilities: ["object_read", "object_create"],
      })
    ).toEqual({
      success: false,
      evidence: {
        stage: "capability_usage_validation",
        code: "invalid_mechanic_capability_usage",
        issues: [
          {
            path: "usedCapabilities.1",
            code: "undeclared_capability_use",
            message:
              'Capability "object_create" is used by source but is absent from the exact grant.',
          },
          {
            path: "grant.capabilities.1",
            code: "unused_capability",
            message:
              'Granted capability "state_write" has no verified source use and would provide unjustified authority.',
          },
        ],
      },
    });
  });
});
