import { describe, expect, it } from "vitest";

import type { GeneratedMechanicContract } from "@/game-spec";
import type {
  MechanicExecutionRealm,
  MechanicExecutionRealmAdapter,
  MechanicExecutionRealmExecutionInput,
  MechanicExecutionRealmResourceBudget,
} from "@/runtime/mechanics/mechanic-execution-realm";
import type { GeneratedMechanicSourceArtifact } from "@/service/mechanic-source-generation";

import { evaluateGeneratedMechanicArtifact } from "./mechanic-evaluation";
import { createGeneratedMechanicLifecycleEvaluationRuntimeFactory } from "./mechanic-evaluation-runtime";

describe("createGeneratedMechanicLifecycleEvaluationRuntimeFactory", () => {
  it("runs normalized artifact callbacks through the deterministic lifecycle for every replay", async () => {
    const realmAdapter = new RecordingRealmAdapter();
    let disposedFixtureCount = 0;
    const createRuntime =
      createGeneratedMechanicLifecycleEvaluationRuntimeFactory({
        realmAdapter,
        resourceBudget: RESOURCE_BUDGET,
        createFixture: async () => ({
          bindings: [],
          capabilityHost: {
            invoke: () => ({ kind: "json", value: null }),
          },
          fixedStepIntervalMilliseconds: 4,
          observations: {
            hasBinding: () => true,
            readDeclaredState: () => 1,
            readBindingProperty: () => "active",
            countOwnedObjects: () => 0,
            readEmittedOutputs: () => [],
          },
          dispose: async () => {
            disposedFixtureCount += 1;
          },
        }),
      });

    const result = await evaluateGeneratedMechanicArtifact({
      fixtureId: "compiled_artifact_fixture",
      contract: CONTRACT,
      artifact: ARTIFACT,
      config: {},
      externalObservations: [
        {
          id: "independent_status",
          scenarioId: "compiled_artifact_scenario",
          observation: {
            kind: "binding_property",
            bindingId: "actor",
            property: "status",
            operator: "equals",
            value: "active",
          },
        },
      ],
      createRuntime,
    });

    expect(result.outcome).toBe("passed");
    expect(realmAdapter.createdSeeds).toEqual([7, 7]);
    expect(disposedFixtureCount).toBe(2);
    expect(realmAdapter.executions.map((execution) => execution.callbackId)).toEqual([
      "install_compiled_artifact",
      "action_compiled_artifact",
      "fixed_compiled_artifact",
      "fixed_compiled_artifact",
      "dispose_compiled_artifact",
      "install_compiled_artifact",
      "action_compiled_artifact",
      "fixed_compiled_artifact",
      "fixed_compiled_artifact",
      "dispose_compiled_artifact",
    ]);
    expect(realmAdapter.executions[0]?.source).toContain(
      "const lifecycleInput = undefined;"
    );
    expect(realmAdapter.executions[0]?.source).toContain(
      ARTIFACT.callbacks[0]!.normalizedJavaScript
    );
    expect(realmAdapter.executions[1]?.source).toContain(
      'return freezeJson("activate");'
    );
    expect(realmAdapter.executions[2]?.source).toContain(
      'return freezeJson({"simulationTimeMilliseconds":4});'
    );
    expect(realmAdapter.executions[1]?.source).toContain("Object.freeze(input)");
  });
});

const RESOURCE_BUDGET: MechanicExecutionRealmResourceBudget = {
  profileId: "phase_9_fixed_budget",
  maximumOwnedObjects: 4,
  maximumOperationsPerTick: 16,
  maximumScheduledCallbacks: 4,
  maximumSubscriptions: 4,
  maximumSignalsPerTick: 4,
  maximumStateBytes: 1024,
  maximumCallbackMilliseconds: 8,
  maximumConsecutiveFailures: 2,
};

const CONTRACT: GeneratedMechanicContract = {
  schemaVersion: "generated-mechanic-contract/v1",
  id: "compiled_artifact_contract",
  intentId: "compiled_artifact_intent",
  capabilityVersion: "mechanic_capability/v1",
  behavior: {
    summary: "Run a compiled artifact through the shared evaluator.",
    triggers: ["action_dispatched", "time_advanced"],
    outcomes: ["counter_observed"],
  },
  config: { kind: "object", fields: [] },
  bindings: [],
  ownedObjects: [],
  privateState: [{ id: "counter", valueType: "integer", initialValue: 1 }],
  lifecycle: {
    callbacks: ["install", "logical_action"],
    fixedStep: true,
    dispose: true,
  },
  ports: [],
  capabilities: ["state_read"],
  resourceExpectations: {
    maximumOwnedObjects: 0,
    maximumOperationsPerTick: 4,
    maximumScheduledCallbacks: 0,
    maximumSubscriptions: 0,
    maximumSignalsPerTick: 0,
    maximumStateBytes: 128,
    maximumCallbackMilliseconds: 8,
    maximumConsecutiveFailures: 2,
  },
  scenarios: [
    {
      id: "compiled_artifact_scenario",
      seed: 7,
      setup: [],
      steps: [
        { kind: "dispatch_action", actionId: "activate" },
        { kind: "advance_time", milliseconds: 8 },
      ],
      observations: [
        { kind: "state_equals", stateId: "counter", value: 1 },
      ],
    },
  ],
};

const ARTIFACT: GeneratedMechanicSourceArtifact = {
  schemaVersion: "generated_mechanic_source_artifact/v1",
  id: "compiled_artifact_source",
  contractId: CONTRACT.id,
  intentId: CONTRACT.intentId,
  capabilityVersion: CONTRACT.capabilityVersion,
  grant: { capabilityVersion: CONTRACT.capabilityVersion, capabilities: [] },
  usedCapabilities: [],
  callbacks: [
    callback("install_compiled_artifact", "install"),
    callback("action_compiled_artifact", "logical_action"),
    callback("fixed_compiled_artifact", "fixed_step"),
    callback("dispose_compiled_artifact", "dispose"),
  ],
  build: {
    language: "typescript",
    target: "es2020",
    parsed: true,
    typechecked: true,
    compiled: true,
    staticValidationTarget: "normalized_javascript",
    staticValidationVersion: "generated_mechanic_source_static_validation/v1",
  },
};

function callback(
  id: string,
  kind: GeneratedMechanicSourceArtifact["callbacks"][number]["kind"]
): GeneratedMechanicSourceArtifact["callbacks"][number] {
  return {
    id,
    kind,
    sourceTypeScript: "return null;",
    normalizedJavaScript:
      "const __sparklineGeneratedMechanicCallback = async () => null;",
  };
}

class RecordingRealmAdapter implements MechanicExecutionRealmAdapter {
  readonly adapterVersion = "mechanic_execution_realm_adapter/v1";
  readonly id = "recording_evaluation_realm";
  readonly createdSeeds: number[] = [];
  readonly executions: { callbackId: string; source: string }[] = [];

  async create(
    input: Parameters<MechanicExecutionRealmAdapter["create"]>[0]
  ): Promise<MechanicExecutionRealm> {
    this.createdSeeds.push(input.seed);
    return {
      execute: (execution: MechanicExecutionRealmExecutionInput) => {
        const callbackId = execution.lifecycle?.invocations[0]?.callbackId;
        const source = execution.lifecycle?.callbacks.find(
          (callback) => callback.id === callbackId
        )?.source;
        if (!callbackId || source === undefined) {
          throw new Error("Expected one lifecycle callback invocation.");
        }
        this.executions.push({ callbackId, source });
        const result = Promise.resolve({
          executionId: execution.id,
          outcome: "completed" as const,
        });
        return {
          result,
          terminate: () => result,
        };
      },
      dispose: () => undefined,
    };
  }
}
