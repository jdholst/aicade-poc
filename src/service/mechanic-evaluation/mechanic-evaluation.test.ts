import { describe, expect, it } from "vitest";

import type { GeneratedMechanicContract } from "@/game-spec";
import type { GeneratedMechanicSourceArtifact } from "@/service/mechanic-source-generation";

import { evaluateGeneratedMechanicArtifact } from "./mechanic-evaluation";

describe("evaluateGeneratedMechanicArtifact", () => {
  it("executes declared setup, actions, input events, time, and observations before independent grading", async () => {
    const contract = createContract();
    const artifact = createArtifact();
    const createdArtifactIds: string[] = [];

    const result = await evaluateGeneratedMechanicArtifact({
      fixtureId: "shared_evaluation_fixture",
      contract,
      artifact,
      config: { initialCount: 3 },
      externalObservations: [
        {
          id: "external_energy_observation",
          scenarioId: "shared_pipeline_scenario",
          observation: {
            kind: "binding_property",
            bindingId: "actor",
            property: "energy",
            operator: "at_least",
            value: 10,
          },
        },
      ],
      createRuntime: async ({ artifact: runtimeArtifact }) => {
        createdArtifactIds.push(runtimeArtifact.id);
        let counter = 3;
        let status = "idle";
        const outputs: unknown[] = [];

        return {
          sourceArtifactId: runtimeArtifact.id,
          hasBinding: (bindingId) => bindingId === "actor",
          readDeclaredState: () => counter,
          readBindingProperty: (_bindingId, property) =>
            property === "status" ? status : counter,
          countOwnedObjects: () => 1,
          readEmittedOutputs: () => outputs,
          install: async () => undefined,
          receiveInput: async (_portId, value) => {
            counter += Number((value as { delta: number }).delta);
            outputs.push({ count: counter });
          },
          dispatchAction: async () => {
            status = "active";
          },
          advanceTime: async (milliseconds) => {
            counter += milliseconds;
          },
          dispose: async () => undefined,
        };
      },
    });

    expect(result).toMatchObject({
      outcome: "passed",
      evidence: {
        schemaVersion: "generated_mechanic_evaluation/v1",
        fixtureId: "shared_evaluation_fixture",
        contractId: contract.id,
        sourceArtifactId: artifact.id,
        replay: { matched: true },
        scenarios: [
          {
            scenarioId: "shared_pipeline_scenario",
            outcome: "passed",
            setup: [
              {
                kind: "binding_present",
                passed: true,
                assertion: { bindingId: "actor" },
              },
              {
                kind: "state_equals",
                passed: true,
                assertion: { stateId: "counter", value: 3 },
              },
            ],
            steps: [
              {
                kind: "receive_input",
                status: "completed",
                input: { portId: "counter_input", value: { delta: 2 } },
              },
              {
                kind: "dispatch_action",
                status: "completed",
                input: { actionId: "activate" },
              },
              {
                kind: "advance_time",
                status: "completed",
                input: { milliseconds: 10 },
              },
            ],
            declaredObservations: [
              {
                kind: "state_equals",
                passed: true,
                actual: 15,
                assertion: { stateId: "counter", value: 15 },
              },
              {
                kind: "binding_property",
                passed: true,
                actual: "active",
                assertion: { operator: "equals", value: "active" },
              },
              {
                kind: "owned_object_count",
                passed: true,
                actual: 1,
                assertion: { operator: "equals", value: 1 },
              },
              {
                kind: "output_emitted",
                passed: true,
                actual: [{ count: 5 }],
                assertion: { portId: "counter_output", value: { count: 5 } },
              },
            ],
            externalObservations: [
              {
                id: "external_energy_observation",
                kind: "binding_property",
                passed: true,
                actual: 15,
                assertion: { operator: "at_least", value: 10 },
              },
            ],
          },
        ],
      },
    });
    expect(createdArtifactIds).toEqual([artifact.id, artifact.id]);
  });

  it("keeps a generated self-grading claim separate from an independent failing observation", async () => {
    const contract = createContract({
      scenarios: [
        {
          id: "self_grading_scenario",
          seed: 1729,
          setup: [],
          steps: [{ kind: "advance_time", milliseconds: 1 }],
          observations: [
            {
              kind: "output_emitted",
              portId: "counter_output",
              value: { evaluationPassed: true },
            },
          ],
        },
      ],
    });

    const result = await evaluateGeneratedMechanicArtifact({
      fixtureId: "self_grading_fixture",
      contract,
      artifact: createArtifact(),
      config: { initialCount: 3 },
      externalObservations: [
        {
          id: "independent_status",
          scenarioId: "self_grading_scenario",
          observation: {
            kind: "binding_property",
            bindingId: "actor",
            property: "status",
            operator: "equals",
            value: "safe",
          },
        },
      ],
      createRuntime: async ({ artifact }) => ({
        sourceArtifactId: artifact.id,
        hasBinding: () => true,
        readDeclaredState: () => 3,
        readBindingProperty: () => "unsafe",
        countOwnedObjects: () => 0,
        readEmittedOutputs: () => [{ evaluationPassed: true }],
        install: async () => undefined,
        receiveInput: async () => undefined,
        dispatchAction: async () => undefined,
        advanceTime: async () => undefined,
        dispose: async () => undefined,
      }),
    });

    expect(result).toMatchObject({
      outcome: "failed",
      evidence: {
        scenarios: [
          {
            outcome: "failed",
            declaredObservations: [
              {
                source: "model_declared",
                kind: "output_emitted",
                passed: true,
              },
            ],
            externalObservations: [
              {
                source: "evaluator_authored",
                id: "independent_status",
                kind: "binding_property",
                passed: false,
              },
            ],
          },
        ],
      },
    });
  });

  it("fails closed when the same fixture, seed, actions, and clock produce different evidence", async () => {
    const contract = createContract({
      scenarios: [
        {
          id: "nondeterministic_scenario",
          seed: 99,
          setup: [],
          steps: [{ kind: "advance_time", milliseconds: 8 }],
          observations: [
            { kind: "state_equals", stateId: "counter", value: 1 },
          ],
        },
      ],
    });
    let runtimeNumber = 0;

    const result = await evaluateGeneratedMechanicArtifact({
      fixtureId: "nondeterministic_fixture",
      contract,
      artifact: createArtifact(),
      config: { initialCount: 3 },
      externalObservations: [],
      createRuntime: async ({ artifact }) => {
        runtimeNumber += 1;
        const observedValue = runtimeNumber;
        return {
          sourceArtifactId: artifact.id,
          hasBinding: () => true,
          readDeclaredState: () => observedValue,
          readBindingProperty: () => null,
          countOwnedObjects: () => 0,
          readEmittedOutputs: () => [],
          install: async () => undefined,
          receiveInput: async () => undefined,
          dispatchAction: async () => undefined,
          advanceTime: async () => undefined,
          dispose: async () => undefined,
        };
      },
    });

    expect(result).toMatchObject({
      outcome: "failed",
      evidence: {
        replay: {
          matched: false,
          issue: {
            code: "nondeterministic_replay",
            message:
              "Identical mechanic evaluation inputs produced different observable evidence.",
          },
        },
      },
    });
  });

  it("rejects an evaluator-authored observation that cannot be assigned to a declared scenario", async () => {
    let runtimeCreated = false;

    const result = await evaluateGeneratedMechanicArtifact({
      fixtureId: "unknown_external_scenario_fixture",
      contract: createContract(),
      artifact: createArtifact(),
      config: { initialCount: 3 },
      externalObservations: [
        {
          id: "orphaned_external_observation",
          scenarioId: "missing_scenario",
          observation: {
            kind: "owned_object_count",
            archetypeId: "marker",
            operator: "equals",
            value: 0,
          },
        },
      ],
      createRuntime: async () => {
        runtimeCreated = true;
        throw new Error("An invalid evaluation plan must not create a runtime.");
      },
    });

    expect(result).toMatchObject({
      outcome: "failed",
      evidence: {
        scenarios: [],
        issues: [
          {
            path: "externalObservations.0.scenarioId",
            code: "unknown_external_scenario",
            message:
              'External observation "orphaned_external_observation" targets unknown scenario "missing_scenario".',
          },
        ],
      },
    });
    expect(runtimeCreated).toBe(false);
  });

  it("returns byte-stable observable failure evidence for deterministic inputs", async () => {
    const input = {
      fixtureId: "stable_failure_fixture",
      contract: createContract({
        scenarios: [
          {
            id: "stable_failure_scenario",
            seed: 5,
            setup: [],
            steps: [{ kind: "advance_time", milliseconds: 4 }],
            observations: [
              { kind: "state_equals", stateId: "counter", value: 3 },
            ],
          },
        ],
      }),
      artifact: createArtifact(),
      config: { initialCount: 3 },
      externalObservations: [],
      createRuntime: async ({ artifact }: { artifact: GeneratedMechanicSourceArtifact }) => ({
        sourceArtifactId: artifact.id,
        hasBinding: () => true,
        readDeclaredState: () => 2,
        readBindingProperty: () => null,
        countOwnedObjects: () => 0,
        readEmittedOutputs: () => [],
        install: async () => undefined,
        receiveInput: async () => undefined,
        dispatchAction: async () => undefined,
        advanceTime: async () => undefined,
        dispose: async () => undefined,
      }),
    };

    const first = await evaluateGeneratedMechanicArtifact(input);
    const second = await evaluateGeneratedMechanicArtifact(input);

    expect(first).toMatchObject({
      outcome: "failed",
      evidence: {
        replay: { matched: true },
        scenarios: [
          {
            declaredObservations: [
              { kind: "state_equals", passed: false, actual: 2 },
            ],
          },
        ],
      },
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.evidence.scenarios[0])).toBe(true);
  });

  it("does not execute a compiled artifact when declared setup is not satisfied", async () => {
    let installCount = 0;
    const contract = createContract({
      scenarios: [
        {
          id: "failed_setup_scenario",
          seed: 8,
          setup: [{ kind: "binding_present", bindingId: "actor" }],
          steps: [{ kind: "advance_time", milliseconds: 1 }],
          observations: [
            { kind: "state_equals", stateId: "counter", value: 3 },
          ],
        },
      ],
    });

    const result = await evaluateGeneratedMechanicArtifact({
      fixtureId: "failed_setup_fixture",
      contract,
      artifact: createArtifact(),
      config: { initialCount: 3 },
      externalObservations: [],
      createRuntime: async ({ artifact }) => ({
        sourceArtifactId: artifact.id,
        hasBinding: () => false,
        readDeclaredState: () => 3,
        readBindingProperty: () => null,
        countOwnedObjects: () => 0,
        readEmittedOutputs: () => [],
        install: async () => {
          installCount += 1;
        },
        receiveInput: async () => undefined,
        dispatchAction: async () => undefined,
        advanceTime: async () => undefined,
        dispose: async () => undefined,
      }),
    });

    expect(result).toMatchObject({
      outcome: "failed",
      evidence: {
        replay: { matched: true },
        scenarios: [
          {
            outcome: "failed",
            setup: [{ kind: "binding_present", passed: false }],
            steps: [],
            declaredObservations: [],
          },
        ],
      },
    });
    expect(installCount).toBe(0);
  });
});

function createContract(
  overrides: Partial<GeneratedMechanicContract> = {}
): GeneratedMechanicContract {
  return {
    schemaVersion: "generated-mechanic-contract/v1",
    id: "shared_pipeline_contract",
    intentId: "shared_pipeline_intent",
    capabilityVersion: "mechanic_capability/v1",
    behavior: {
      summary: "Exercise the shared deterministic evaluation pipeline.",
      triggers: ["input_received", "action_dispatched", "time_advanced"],
      outcomes: ["state_changed", "output_emitted"],
    },
    config: {
      kind: "object",
      fields: [
        {
          key: "initialCount",
          required: true,
          value: { kind: "integer", minimum: 0, maximum: 20 },
        },
      ],
    },
    bindings: [
      {
        id: "actor",
        referenceKind: "entity",
        cardinality: "one",
        objectIds: ["actor_entity"],
      },
    ],
    ownedObjects: [
      { id: "marker", objectKind: "marker", maximumInstances: 2 },
    ],
    privateState: [
      { id: "counter", valueType: "integer", initialValue: 3 },
    ],
    lifecycle: {
      callbacks: ["install", "logical_action", "gameplay_event"],
      fixedStep: false,
      dispose: true,
    },
    ports: [
      {
        id: "counter_input",
        direction: "input",
        payload: {
          kind: "object",
          fields: [
            {
              key: "delta",
              required: true,
              value: { kind: "integer", minimum: 0, maximum: 10 },
            },
          ],
        },
      },
      {
        id: "counter_output",
        direction: "output",
        payload: {
          kind: "object",
          fields: [
            {
              key: "count",
              required: true,
              value: { kind: "integer", minimum: 0, maximum: 40 },
            },
          ],
        },
      },
    ],
    capabilities: ["state_read", "state_write"],
    resourceExpectations: {
      maximumOwnedObjects: 2,
      maximumOperationsPerTick: 16,
      maximumScheduledCallbacks: 2,
      maximumSubscriptions: 2,
      maximumSignalsPerTick: 4,
      maximumStateBytes: 128,
      maximumCallbackMilliseconds: 8,
      maximumConsecutiveFailures: 2,
    },
    scenarios: [
      {
        id: "shared_pipeline_scenario",
        seed: 1729,
        setup: [
          { kind: "binding_present", bindingId: "actor" },
          { kind: "state_equals", stateId: "counter", value: 3 },
        ],
        steps: [
          {
            kind: "receive_input",
            portId: "counter_input",
            value: { delta: 2 },
          },
          { kind: "dispatch_action", actionId: "activate" },
          { kind: "advance_time", milliseconds: 10 },
        ],
        observations: [
          { kind: "state_equals", stateId: "counter", value: 15 },
          {
            kind: "binding_property",
            bindingId: "actor",
            property: "status",
            operator: "equals",
            value: "active",
          },
          {
            kind: "owned_object_count",
            archetypeId: "marker",
            operator: "equals",
            value: 1,
          },
          {
            kind: "output_emitted",
            portId: "counter_output",
            value: { count: 5 },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function createArtifact(): GeneratedMechanicSourceArtifact {
  return {
    schemaVersion: "generated_mechanic_source_artifact/v1",
    id: "shared_pipeline_source",
    contractId: "shared_pipeline_contract",
    intentId: "shared_pipeline_intent",
    capabilityVersion: "mechanic_capability/v1",
    grant: {
      capabilityVersion: "mechanic_capability/v1",
      capabilities: [],
    },
    usedCapabilities: [],
    callbacks: [
      {
        id: "install_shared_pipeline",
        kind: "install",
        sourceTypeScript: "return null;",
        normalizedJavaScript:
          "const __sparklineGeneratedMechanicCallback = async () => null;",
      },
      {
        id: "dispose_shared_pipeline",
        kind: "dispose",
        sourceTypeScript: "return null;",
        normalizedJavaScript:
          "const __sparklineGeneratedMechanicCallback = async () => null;",
      },
    ],
    build: {
      language: "typescript",
      target: "es2020",
      parsed: true,
      typechecked: true,
      compiled: true,
      staticValidationTarget: "normalized_javascript",
      staticValidationVersion:
        "generated_mechanic_source_static_validation/v1",
    },
  };
}
