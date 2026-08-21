import { describe, expect, it } from "vitest";

import type { GeneratedMechanicContract } from "@/game-spec/mechanics/generated-mechanic-contract";

import {
  createGeneratedMechanicLifecycleProgram,
  isAuthenticGeneratedMechanicLifecycleProgram,
  type GeneratedMechanicLifecycleSourceArtifact,
} from "./generated-mechanic-lifecycle-program";

describe("createGeneratedMechanicLifecycleProgram", () => {
  it("compiles persisted callbacks into an identity-preserving lifecycle program", () => {
    const program = createGeneratedMechanicLifecycleProgram({
      contract: CONTRACT,
      sourceArtifact: SOURCE_ARTIFACT,
      config: { increment: 2 },
      fixedStepIntervalMilliseconds: 16,
    });

    expect(program.identity).toEqual({
      schemaVersion: "generated_mechanic_lifecycle_program/v1",
      sourceArtifactId: "generic_counter_source_v1",
      contractId: "generic_counter_contract",
      intentId: "generic_counter_intent",
      capabilityVersion: "mechanic_capability/v1",
      callbacks: [
        { id: "install_generic_counter", kind: "install" },
        { id: "act_generic_counter", kind: "logical_action" },
        { id: "tick_generic_counter", kind: "fixed_step" },
        { id: "dispose_generic_counter", kind: "dispose" },
      ],
    });
    expect(program.source).toContain(
      'const config = __sparklineFreezeJson({"increment":2});'
    );
    expect(program.source).toContain(
      '"actor": realm.binding("actor")'
    );
    expect(program.source).not.toContain(
      SOURCE_ARTIFACT.callbacks[0]!.normalizedJavaScript
    );
    expect(program.callbacks.map(({ id, kind }) => ({ id, kind }))).toEqual(
      program.identity.callbacks
    );
    expect(program.fixedStep).toEqual({
      callbackId: "tick_generic_counter",
      intervalMilliseconds: 16,
    });
    expect(program.callbacks[0]?.source).toBe(
      [
        '"use sparkline generated mechanic callback/v1";',
        "const { capabilities, bindings, config } = __sparklineLifecycleContext;",
        "const input = lifecycleInput;",
        SOURCE_ARTIFACT.callbacks[0]!.normalizedJavaScript,
        "return await __sparklineGeneratedMechanicCallback();",
      ].join("\n")
    );
    expect(program.callbacks[0]?.source).toContain(
      SOURCE_ARTIFACT.callbacks[0]!.normalizedJavaScript
    );
    expect(Object.isFrozen(program)).toBe(true);
    expect(Object.isFrozen(program.callbacks)).toBe(true);
    expect(Object.isFrozen(program.identity.callbacks)).toBe(true);
    expect(isAuthenticGeneratedMechanicLifecycleProgram(program)).toBe(true);
    expect(
      isAuthenticGeneratedMechanicLifecycleProgram({ ...program })
    ).toBe(false);
  });

  it.each([
    {
      label: "a different contract ID",
      sourceArtifact: artifact({ contractId: "other_contract" }),
      message:
        'Generated source artifact contract "other_contract" does not match "generic_counter_contract".',
    },
    {
      label: "a different intent ID",
      sourceArtifact: artifact({ intentId: "other_intent" }),
      message:
        'Generated source artifact intent "other_intent" does not match "generic_counter_intent".',
    },
    {
      label: "a different capability version",
      sourceArtifact: artifact({ capabilityVersion: "future_capability/v2" }),
      message:
        'Generated source artifact capability version "future_capability/v2" does not match "mechanic_capability/v1".',
    },
    {
      label: "a retargeted capability grant version",
      sourceArtifact: artifact({
        grant: {
          capabilityVersion: "future_capability/v2",
          capabilities: [],
        },
      }),
      message:
        'Generated source artifact grant capability version "future_capability/v2" does not match "mechanic_capability/v1".',
    },
  ])("rejects $label instead of retargeting persisted source", ({
    sourceArtifact,
    message,
  }) => {
    expect(() =>
      createGeneratedMechanicLifecycleProgram({
        contract: CONTRACT,
        sourceArtifact,
        config: {},
        fixedStepIntervalMilliseconds: 16,
      })
    ).toThrow(message);
  });

  it("fails closed when required lifecycle coverage is missing", () => {
    const sourceArtifact = artifact({
      callbacks: SOURCE_ARTIFACT.callbacks.filter(
        (callback) => callback.kind !== "logical_action"
      ),
    });

    expect(() =>
      createGeneratedMechanicLifecycleProgram({
        contract: CONTRACT,
        sourceArtifact,
        config: {},
        fixedStepIntervalMilliseconds: 16,
      })
    ).toThrow(
      'Generated lifecycle callback kind "logical_action" is missing from source artifact "generic_counter_source_v1".'
    );
  });

  it("fails closed on duplicate callback IDs or lifecycle kinds", () => {
    expect(() =>
      createGeneratedMechanicLifecycleProgram({
        contract: CONTRACT,
        sourceArtifact: artifact({
          callbacks: [
            ...SOURCE_ARTIFACT.callbacks,
            callback("install_generic_counter", "gameplay_event"),
          ],
        }),
        config: {},
        fixedStepIntervalMilliseconds: 16,
      })
    ).toThrow(
      'Generated lifecycle callback ID "install_generic_counter" is duplicated.'
    );

    expect(() =>
      createGeneratedMechanicLifecycleProgram({
        contract: CONTRACT,
        sourceArtifact: artifact({
          callbacks: [
            ...SOURCE_ARTIFACT.callbacks,
            callback("second_install", "install"),
          ],
        }),
        config: {},
        fixedStepIntervalMilliseconds: 16,
      })
    ).toThrow(
      'Generated lifecycle callback kind "install" must occur exactly once.'
    );
  });

  it("rejects lifecycle kinds outside the exact contract coverage", () => {
    expect(() =>
      createGeneratedMechanicLifecycleProgram({
        contract: CONTRACT,
        sourceArtifact: artifact({
          callbacks: [
            ...SOURCE_ARTIFACT.callbacks,
            callback("event_generic_counter", "gameplay_event"),
          ],
        }),
        config: {},
        fixedStepIntervalMilliseconds: 16,
      })
    ).toThrow(
      'Generated lifecycle callback kind "gameplay_event" is not declared by contract "generic_counter_contract".'
    );
  });

  it("requires fixed-step timing when the accepted contract enables it", () => {
    expect(() =>
      createGeneratedMechanicLifecycleProgram({
        contract: CONTRACT,
        sourceArtifact: SOURCE_ARTIFACT,
        config: {},
      })
    ).toThrow(
      "A generated fixed-step callback requires a positive integer host interval."
    );

  });
});

const CONTRACT: GeneratedMechanicContract = {
  schemaVersion: "generated-mechanic-contract/v1",
  id: "generic_counter_contract",
  intentId: "generic_counter_intent",
  capabilityVersion: "mechanic_capability/v1",
  behavior: {
    summary: "Increment generic state on an accepted logical action.",
    triggers: ["action_dispatched"],
    outcomes: ["counter_incremented"],
  },
  config: {
    kind: "object",
    fields: [
      {
        key: "increment",
        required: true,
        value: { kind: "integer", minimum: 1, maximum: 10 },
      },
    ],
  },
  bindings: [
    {
      id: "actor",
      referenceKind: "entity",
      cardinality: "one",
      objectIds: ["actor"],
    },
  ],
  ownedObjects: [],
  privateState: [
    { id: "counter", valueType: "integer", initialValue: 0 },
  ],
  lifecycle: {
    callbacks: ["install", "logical_action"],
    fixedStep: true,
    dispose: true,
  },
  ports: [],
  capabilities: ["state_read"],
  resourceExpectations: {
    maximumOwnedObjects: 0,
    maximumOperationsPerTick: 8,
    maximumScheduledCallbacks: 0,
    maximumSubscriptions: 0,
    maximumSignalsPerTick: 0,
    maximumStateBytes: 128,
    maximumCallbackMilliseconds: 8,
    maximumConsecutiveFailures: 2,
  },
  scenarios: [
    {
      id: "generic_counter_scenario",
      seed: 1,
      setup: [],
      steps: [{ kind: "dispatch_action", actionId: "increment" }],
      observations: [
        { kind: "state_equals", stateId: "counter", value: 1 },
      ],
    },
  ],
};

const SOURCE_ARTIFACT: GeneratedMechanicLifecycleSourceArtifact = artifact({});

function artifact(
  overrides: Partial<GeneratedMechanicLifecycleSourceArtifact>
): GeneratedMechanicLifecycleSourceArtifact {
  return {
    id: "generic_counter_source_v1",
    contractId: CONTRACT.id,
    intentId: CONTRACT.intentId,
    capabilityVersion: CONTRACT.capabilityVersion,
    grant: {
      capabilityVersion: CONTRACT.capabilityVersion,
      capabilities: [],
    },
    callbacks: [
      callback("install_generic_counter", "install"),
      callback("act_generic_counter", "logical_action"),
      callback("tick_generic_counter", "fixed_step"),
      callback("dispose_generic_counter", "dispose"),
    ],
    ...overrides,
  };
}

function callback(
  id: string,
  kind: GeneratedMechanicLifecycleSourceArtifact["callbacks"][number]["kind"]
): GeneratedMechanicLifecycleSourceArtifact["callbacks"][number] {
  return {
    id,
    kind,
    normalizedJavaScript:
      "const __sparklineGeneratedMechanicCallback = async () => null;",
  };
}
