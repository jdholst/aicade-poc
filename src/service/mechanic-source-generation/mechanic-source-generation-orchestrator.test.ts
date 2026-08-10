import { beforeEach, describe, expect, it, vi } from "vitest";

const foundationTrust = vi.hoisted(() => ({ available: false }));
const adapterTrust = vi.hoisted(() => ({ authentic: false }));

vi.mock(
  "@/service/runtime-and-contract-foundation-gate",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("@/service/runtime-and-contract-foundation-gate")
    >();
    return {
      ...actual,
      isMechanicSourceGenerationAvailable: (
        result: RuntimeAndContractFoundationGateResult | undefined
      ) =>
        foundationTrust.available ||
        actual.isMechanicSourceGenerationAvailable(result),
    };
  }
);

vi.mock(
  "@/runtime/mechanics/mechanic-execution-realm-adapter-authenticity",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("@/runtime/mechanics/mechanic-execution-realm-adapter-authenticity")
    >();
    return {
      ...actual,
      isMechanicExecutionRealmAdapterAuthentic: (adapter: unknown) =>
        adapterTrust.authentic ||
        actual.isMechanicExecutionRealmAdapterAuthentic(
          adapter as Parameters<
            typeof actual.isMechanicExecutionRealmAdapterAuthentic
          >[0]
        ),
    };
  }
);

import type { RuntimeAndContractFoundationGateResult } from "@/service/runtime-and-contract-foundation-gate";
import {
  MECHANIC_CAPABILITY_VERSION,
  PHASE_9_GENERATION_CONSTRAINT_SET,
  mechanicCapabilityRegistry,
} from "@/game-spec";
import { PHASE_9_MECHANIC_RESOURCE_BUDGET } from "@/runtime/mechanics/phase-9-mechanic-resource-policy";
import type {
  MechanicExecutionRealm,
  MechanicExecutionRealmAdapter,
  MechanicExecutionRealmResourceBudget,
} from "@/runtime/mechanics/mechanic-execution-realm";
import type { MechanicSourceGenerationProvider } from "./mechanic-source-generation-provider";

import {
  generateBuildAndExecuteMechanicSource,
  type GenerateBuildAndExecuteMechanicSourceInput,
} from "./mechanic-source-generation-orchestrator";

describe("mechanic source generation admission", () => {
  beforeEach(() => {
    foundationTrust.available = false;
    adapterTrust.authentic = false;
  });

  it("rejects a forged passing foundation gate before invoking the provider", async () => {
    const provider = vi.fn();
    const forgedGateResult = {
      schemaVersion: "runtime_contract_foundation_gate/v1",
      status: "passed",
      sourceGenerationAvailable: true,
      checks: [],
      evidence: {},
      terminalResult: {
        code: "runtime_contract_foundation_gate_passed",
      },
    } as unknown as RuntimeAndContractFoundationGateResult;

    const result = await generateBuildAndExecuteMechanicSource({
      foundationGateResult: forgedGateResult,
      provider,
    } as unknown as GenerateBuildAndExecuteMechanicSourceInput);

    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "source_admission",
        code: "foundation_gate_required",
        issues: [
          {
            path: "foundationGateResult",
            code: "foundation_gate_required",
            message:
              "Generated mechanic source requires the live authenticated passing Runtime and Contract Foundation Gate result.",
          },
        ],
      },
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects a same-profile widened resource budget before invoking the provider", async () => {
    foundationTrust.available = true;
    adapterTrust.authentic = true;
    const provider = vi.fn();
    const realmAdapter = {
      adapterVersion: "mechanic_execution_realm_adapter/v1",
      id: "selected_realm",
      create: vi.fn(),
    };
    const gateResult = {
      status: "passed",
      evidence: {
        realmConformance: { candidateId: realmAdapter.id },
      },
    } as unknown as RuntimeAndContractFoundationGateResult;

    const result = await generateBuildAndExecuteMechanicSource({
      foundationGateResult: gateResult,
      provider,
      realmAdapter,
      intent: { id: "intent" },
      admittedRequest: {
        resolution: { intentId: "intent" },
        constraintSet: {
          capabilityVersion: "mechanic_capability/v1",
          resourceBudgetProfile: "phase_9_fixed_budget",
        },
      },
      contract: {
        intentId: "intent",
        capabilityVersion: "mechanic_capability/v1",
      },
      grant: { capabilityVersion: "mechanic_capability/v1" },
      resourceBudget: {
        ...PHASE_9_MECHANIC_RESOURCE_BUDGET,
        maximumOperationsPerTick:
          PHASE_9_MECHANIC_RESOURCE_BUDGET.maximumOperationsPerTick + 1,
      },
    } as unknown as GenerateBuildAndExecuteMechanicSourceInput);

    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "source_admission",
        code: "invalid_upstream_artifacts",
        issues: [
          {
            path: "resourceBudget",
            code: "invalid_upstream_artifacts",
            message:
              "Mechanic source execution requires the exact immutable Phase 9 resource budget.",
          },
        ],
      },
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it("keeps evaluator scenarios outside the provider boundary", async () => {
    foundationTrust.available = true;
    adapterTrust.authentic = true;
    let providerInput:
      | Parameters<MechanicSourceGenerationProvider>[0]
      | undefined;
    const provider = vi.fn<MechanicSourceGenerationProvider>(async (input) => {
      providerInput = input;
      return createValidCandidate();
    });
    const { input } = createValidOrchestratorInput(provider);

    const result = await generateBuildAndExecuteMechanicSource(input);

    expect(result).toMatchObject({ success: true });
    expect(provider).toHaveBeenCalledOnce();
    expect(providerInput?.contract).not.toHaveProperty("scenarios");
    expect(providerInput?.resolution).not.toHaveProperty(
      "candidateBuiltInTypes"
    );
    expect(providerInput?.grant.capabilities[0]).not.toHaveProperty(
      "evaluation"
    );
    expect(Object.isFrozen(providerInput?.contract)).toBe(true);
  });

  it("revalidates the accepted contract before invoking the provider", async () => {
    foundationTrust.available = true;
    adapterTrust.authentic = true;
    const provider = vi.fn<MechanicSourceGenerationProvider>();
    const { input } = createValidOrchestratorInput(provider);
    input.contract.lifecycle.callbacks = ["install"];

    const result = await generateBuildAndExecuteMechanicSource(input);

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            code: "contradiction",
            message: expect.stringContaining("logical_action"),
          },
        ],
      },
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it("uses immutable admitted snapshots across the provider await boundary", async () => {
    foundationTrust.available = true;
    adapterTrust.authentic = true;
    const providerState: {
      input?: GenerateBuildAndExecuteMechanicSourceInput;
    } = {};
    const provider = vi.fn<MechanicSourceGenerationProvider>(async () => {
      const input = providerState.input;
      if (!input) {
        throw new Error("Orchestrator test input was not prepared.");
      }
      input.resourceBudget.maximumOperationsPerTick = 999;
      input.contract.capabilities[0] = "object_read";
      input.grant.capabilities[0]!.id = "object_read";
      return createValidCandidate();
    });
    const prepared = createValidOrchestratorInput(provider);
    providerState.input = prepared.input;

    const result = await generateBuildAndExecuteMechanicSource(prepared.input);

    expect(result).toMatchObject({ success: true });
    expect(prepared.realmAdapter.createdResourceBudget).toEqual(
      PHASE_9_MECHANIC_RESOURCE_BUDGET
    );
  });
});

function createValidOrchestratorInput(
  provider: MechanicSourceGenerationProvider
): {
  input: GenerateBuildAndExecuteMechanicSourceInput;
  realmAdapter: RecordingOrchestratorRealmAdapter;
} {
  const realmAdapter = new RecordingOrchestratorRealmAdapter();
  const stateWrite = mechanicCapabilityRegistry.capabilities.find(
    (capability) => capability.id === "state_write"
  )!;
  const input: GenerateBuildAndExecuteMechanicSourceInput = {
    foundationGateResult: {
      status: "passed",
      evidence: {
        realmConformance: { candidateId: realmAdapter.id },
      },
    } as unknown as RuntimeAndContractFoundationGateResult,
    intent: {
      id: "generic_intent",
      summary: "Update one private counter from an admitted action.",
      triggers: ["activate"],
      actors: [],
      targets: [],
      behaviors: ["update_counter"],
      ownedObjects: [],
      stateChanges: ["counter_updated"],
      temporalRules: [],
      spatialRules: [],
      constraints: [],
      configuration: [{ key: "initial_count", value: 1 }],
      connections: [],
      references: [],
      outcomes: ["counter_updated"],
      requiredCapabilities: ["state_write"],
      ambiguities: [],
    },
    admittedRequest: {
      resolution: {
        kind: "generated_mechanic",
        intentId: "generic_intent",
        candidateBuiltInTypes: [],
        assumptions: [],
        coverage: {
          coveredRequirements: [],
          uncoveredRequirements: [
            {
              category: "behavior",
              value: "update_counter",
              coveredBy: [],
            },
          ],
        },
      },
      constraintSet: structuredClone(PHASE_9_GENERATION_CONSTRAINT_SET),
    },
    contract: {
      schemaVersion: "generated-mechanic-contract/v1",
      id: "generic_contract",
      intentId: "generic_intent",
      capabilityVersion: MECHANIC_CAPABILITY_VERSION,
      behavior: {
        summary: "Update one private counter from an admitted action.",
        triggers: ["activate"],
        outcomes: ["counter_updated"],
      },
      config: {
        kind: "object",
        fields: [
          {
            key: "initial_count",
            required: true,
            value: { kind: "integer", minimum: 0, maximum: 10 },
          },
        ],
      },
      bindings: [],
      ownedObjects: [],
      privateState: [
        { id: "counter", valueType: "integer", initialValue: 0 },
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
        maximumStateBytes: 128,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      scenarios: [
        {
          id: "activate_counter",
          seed: 1729,
          setup: [],
          steps: [{ kind: "dispatch_action", actionId: "activate" }],
          observations: [
            { kind: "state_equals", stateId: "counter", value: 1 },
          ],
        },
      ],
    },
    grant: {
      capabilityVersion: MECHANIC_CAPABILITY_VERSION,
      capabilities: [
        {
          ...stateWrite,
          justification: {
            kind: "contract_declaration",
            path: "capabilities.0",
          },
        },
      ],
    },
    referenceCatalog: { action: ["activate"] },
    resourceBudget: structuredClone(PHASE_9_MECHANIC_RESOURCE_BUDGET),
    realmAdapter,
    execution: {
      id: "execute_generic_source",
      callbackId: "install_generic_source",
      config: { initial_count: 1 },
      bindings: [],
      capabilityHost: {
        invoke: () => ({ kind: "json", value: null }),
      },
      seed: 1729,
    },
    model: "gpt-5.4-mini",
    providerCredential: "qa_credential",
    provider,
  };
  return { input, realmAdapter };
}

function createValidCandidate() {
  return {
    schemaVersion: "generated_mechanic_source_candidate/v1",
    id: "generic_source_v1",
    contractId: "generic_contract",
    capabilityVersion: MECHANIC_CAPABILITY_VERSION,
    callbacks: [
      {
        id: "install_generic_source",
        kind: "install",
        source:
          'await capabilities.state.write("counter", config.initial_count);',
      },
      {
        id: "logical_action_generic_source",
        kind: "logical_action",
        source: "return null;",
      },
      {
        id: "dispose_generic_source",
        kind: "dispose",
        source: "return null;",
      },
    ],
  };
}

class RecordingOrchestratorRealmAdapter implements MechanicExecutionRealmAdapter {
  readonly adapterVersion = "mechanic_execution_realm_adapter/v1";
  readonly id = "selected_realm";
  createdResourceBudget: MechanicExecutionRealmResourceBudget | undefined;

  async create(
    input: Parameters<MechanicExecutionRealmAdapter["create"]>[0]
  ): Promise<MechanicExecutionRealm> {
    this.createdResourceBudget = structuredClone(input.resourceBudget);
    return {
      execute: (execution) => ({
        result: Promise.resolve({
          executionId: execution.id,
          outcome: "completed" as const,
        }),
        terminate: async () => ({
          executionId: execution.id,
          outcome: "terminated" as const,
        }),
      }),
      dispose: () => undefined,
    };
  }
}
