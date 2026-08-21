import { beforeEach, describe, expect, it, vi } from "vitest";

const conformanceTrust = vi.hoisted(() => ({ trustSynthetic: false }));
const adapterTrust = vi.hoisted(() => ({ trustSynthetic: false }));

vi.mock(
  "@/game-spec/mechanics/mechanic-execution-realm-conformance",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("@/game-spec/mechanics/mechanic-execution-realm-conformance")
    >();
    return {
      ...actual,
      consumeMechanicExecutionRealmConformanceReport: (
        report: MechanicExecutionRealmConformanceReport | undefined
      ) =>
        conformanceTrust.trustSynthetic
          ? report
          : actual.consumeMechanicExecutionRealmConformanceReport(report),
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
      isMechanicExecutionRealmAdapterAuthentic: (
        adapter: MechanicExecutionRealmAdapter
      ) =>
        adapterTrust.trustSynthetic ||
        actual.isMechanicExecutionRealmAdapterAuthentic(adapter),
    };
  }
);

import {
  MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION,
  type MechanicExecutionRealmConformanceReport,
} from "@/game-spec/mechanics/mechanic-execution-realm-conformance";
import {
  MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
  MechanicExecutionRealmResourceLimitError,
  type CreateMechanicExecutionRealmInput,
  type MechanicExecutionRealm,
  type MechanicExecutionRealmAdapter,
  type MechanicExecutionRealmExecutionInput,
  type MechanicExecutionRealmExecutionResult,
} from "@/runtime/mechanics/mechanic-execution-realm";

import {
  isMechanicSourceGenerationAvailable,
  runRuntimeAndContractFoundationGate,
  type RuntimeAndContractFoundationGateResult,
} from ".";
import { runRuntimeAndContractFoundationGateWithDeliberateFailure } from "./runtime-and-contract-foundation-gate.testing";

describe("Runtime and Contract Foundation Gate", () => {
  beforeEach(() => {
    conformanceTrust.trustSynthetic = false;
    adapterTrust.trustSynthetic = false;
  });

  it("keeps mechanic source generation unavailable without a passing gate result", () => {
    const failedResult = {
      schemaVersion: "runtime_contract_foundation_gate/v1",
      status: "failed",
      sourceGenerationAvailable: false,
      checks: [],
      terminalResult: {
        code: "runtime_contract_foundation_gate_failed",
        failedBoundary: "realm_conformance",
      },
    } satisfies RuntimeAndContractFoundationGateResult;

    expect(isMechanicSourceGenerationAvailable(undefined)).toBe(false);
    expect(isMechanicSourceGenerationAvailable(failedResult)).toBe(false);
    expect(
      isMechanicSourceGenerationAvailable({
        schemaVersion: "runtime_contract_foundation_gate/v1",
        status: "passed",
        sourceGenerationAvailable: true,
        checks: [],
        evidence: {},
        terminalResult: {
          code: "runtime_contract_foundation_gate_passed",
        },
      } as unknown as RuntimeAndContractFoundationGateResult)
    ).toBe(false);
  });

  it("rejects a structurally passing report that the trusted runner did not emit", async () => {
    const result = await runRuntimeAndContractFoundationGate({
      realmAdapter: {
        adapterVersion: MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
        id: "foundation_realm",
        create: async () => {
          throw new Error("An untrusted report must not create a realm.");
        },
      },
      realmConformanceReport: createPassingConformanceReport(),
    });

    expect(result).toMatchObject({
      status: "failed",
      sourceGenerationAvailable: false,
      terminalResult: {
        failedBoundary: "realm_conformance",
      },
    });
    expect(result.checks.at(-1)).toEqual({
      boundary: "realm_conformance",
      status: "failed",
      code: "realm_conformance_evidence_untrusted",
      message:
        "Mechanic Execution Realm conformance evidence must come directly from the trusted single-run suite.",
    });
  });

  it("rejects realm evidence when any conformance gate failed", async () => {
    trustSyntheticFoundationBoundary();
    const result = await runRuntimeAndContractFoundationGate({
      realmAdapter: {
        adapterVersion: MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
        id: "foundation_realm",
        create: async () => {
          throw new Error("A rejected realm must not be created.");
        },
      },
      realmConformanceReport: {
        suiteVersion: MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION,
        capabilityVersion: "mechanic_capability/v1",
        candidateId: "foundation_realm",
        verdict: "rejected",
        gates: [
          {
            id: "escape_resistance",
            status: "failed",
            probeIds: ["escape_probe"],
            failures: [
              {
                code: "escape_observed",
                message: "The candidate exposed forbidden authority.",
              },
            ],
          },
        ],
        probeResults: [],
      },
    });

    expect(result, JSON.stringify(result, null, 2)).toMatchObject({
      status: "failed",
      sourceGenerationAvailable: false,
      terminalResult: {
        code: "runtime_contract_foundation_gate_failed",
        failedBoundary: "realm_conformance",
      },
    });
    expect(result.checks).toContainEqual({
      boundary: "realm_conformance",
      status: "failed",
      code: "realm_conformance_rejected",
      message: "Mechanic Execution Realm conformance did not pass every hard gate.",
      details: {
        schemaVersion: "mechanic_execution_realm_failure_report/v1",
        suiteVersion: MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION,
        capabilityVersion: "mechanic_capability/v1",
        candidateId: "foundation_realm",
        verdict: "rejected",
        failedGates: [
          {
            id: "escape_resistance",
            probeIds: ["escape_probe"],
            failures: [
              {
                code: "escape_observed",
                message: "The candidate exposed forbidden authority.",
              },
            ],
            probeResults: [],
          },
        ],
      },
    });
  });

  it("passes one generic fixture through the complete foundation and opens source generation", async () => {
    trustSyntheticFoundationBoundary();
    const result = await runRuntimeAndContractFoundationGate({
      realmAdapter: createFoundationRealmAdapter(),
      realmConformanceReport: createPassingConformanceReport(),
    });

    expect(result, JSON.stringify(result, null, 2)).toMatchObject({
      schemaVersion: "runtime_contract_foundation_gate/v1",
      status: "passed",
      sourceGenerationAvailable: true,
      terminalResult: {
        code: "runtime_contract_foundation_gate_passed",
      },
    });
    expect(result.checks.map((check) => check.boundary)).toEqual([
      "intent_resolution",
      "constraint_admission",
      "contract_validation",
      "config_dsl",
      "capability_registry",
      "capability_grant",
      "realm_conformance",
      "binding_admission",
      "lifecycle",
      "ports",
      "deterministic_services",
      "resource_budget",
      "containment",
      "cleanup",
    ]);
    expect(result.checks.every((check) => check.status === "passed")).toBe(
      true
    );
    expect(isMechanicSourceGenerationAvailable(result)).toBe(true);

    if (result.status !== "passed") {
      throw new Error("Expected the foundation gate to pass.");
    }
    expect(result.evidence.contract).toMatchObject({
      id: "foundation_fixture_extension",
      intentId: "foundation_fixture_intent",
      capabilityVersion: "mechanic_capability/v1",
    });
    expect(
      result.evidence.grant.capabilities.map((capability) => capability.id)
    ).toEqual(result.evidence.usedCapabilities);
    expect(result.evidence.deterministicTrace.first).toEqual(
      result.evidence.deterministicTrace.replay
    );
    expect(result.evidence.containment).toMatchObject({
      extensionId: "foundation_fixture_extension",
      failure: {
        kind: "resource_budget",
        dimension: "state_bytes",
        limit: 1024,
        observed: 1025,
      },
      cleanup: {
        lifecycleDisposed: true,
        registrationsRemoved: true,
        ownedObjectsRemoved: true,
        privateStateRemoved: true,
        issues: [],
      },
      playableResult: "invalidated",
    });
    expect(result.evidence.cleanup).toEqual({
      nominal: {
        lifecycleDisposed: true,
        registrationsRemoved: true,
        ownedObjectsRemoved: true,
        privateStateRemoved: true,
      },
      replay: {
        lifecycleDisposed: true,
        registrationsRemoved: true,
        ownedObjectsRemoved: true,
        privateStateRemoved: true,
      },
      containedFailure: {
        lifecycleDisposed: true,
        registrationsRemoved: true,
        ownedObjectsRemoved: true,
        privateStateRemoved: true,
      },
    });
    expect(JSON.stringify(result.evidence)).not.toMatch(
      /projectile|hazard|proximity|modifier|holdout|navigation/i
    );
  });

  it("returns stable boundary evidence when integrated realm startup fails", async () => {
    trustSyntheticFoundationBoundary();
    const result = await runRuntimeAndContractFoundationGate({
      realmAdapter: {
        adapterVersion: MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
        id: "foundation_realm",
        create: async () => {
          throw new Error("foundation worker startup failed");
        },
      },
      realmConformanceReport: createPassingConformanceReport(),
    });

    expect(result).toMatchObject({
      status: "failed",
      sourceGenerationAvailable: false,
      terminalResult: {
        code: "runtime_contract_foundation_gate_failed",
        failedBoundary: "lifecycle",
      },
    });
    expect(result.checks.at(-1)).toEqual({
      boundary: "lifecycle",
      status: "failed",
      code: "foundation_runtime_cycle_failed",
      message: "foundation worker startup failed",
    });
    expect(isMechanicSourceGenerationAvailable(result)).toBe(false);
  });

  it("rejects a realm that does not exercise its admitted opaque binding", async () => {
    trustSyntheticFoundationBoundary();
    const result = await runRuntimeAndContractFoundationGate({
      realmAdapter: createFoundationRealmAdapter({ skipBindingRead: true }),
      realmConformanceReport: createPassingConformanceReport(),
    });

    expect(result).toMatchObject({
      status: "failed",
      sourceGenerationAvailable: false,
      terminalResult: { failedBoundary: "binding_admission" },
    });
    expect(result.checks.at(-1)).toEqual({
      boundary: "binding_admission",
      status: "failed",
      code: "foundation_binding_observation_invalid",
      message: "The foundation binding did not produce the admitted observation.",
    });
  });

  it("disposes the integrated realm when the containment probe fails open", async () => {
    trustSyntheticFoundationBoundary();
    let disposedRealmCount = 0;
    const result = await runRuntimeAndContractFoundationGate({
      realmAdapter: createFoundationRealmAdapter({
        skipContainmentFailure: true,
        onDispose: () => {
          disposedRealmCount += 1;
        },
      }),
      realmConformanceReport: createPassingConformanceReport(),
    });

    expect(result).toMatchObject({
      status: "failed",
      sourceGenerationAvailable: false,
      terminalResult: {
        code: "runtime_contract_foundation_gate_failed",
        failedBoundary: "containment",
      },
    });
    expect(result.checks.at(-1)).toEqual({
      boundary: "containment",
      status: "failed",
      code: "foundation_containment_probe_completed",
      message: "The deliberate containment probe completed unexpectedly.",
    });
    expect(disposedRealmCount).toBe(2);
  });

  it("classifies realm disposal failures at the cleanup boundary", async () => {
    trustSyntheticFoundationBoundary();
    const result = await runRuntimeAndContractFoundationGate({
      realmAdapter: createFoundationRealmAdapter({ failDispose: true }),
      realmConformanceReport: createPassingConformanceReport(),
    });

    expect(result).toMatchObject({
      status: "failed",
      sourceGenerationAvailable: false,
      terminalResult: { failedBoundary: "cleanup" },
    });
    expect(result.checks.at(-1)).toMatchObject({
      boundary: "cleanup",
      status: "failed",
      code: "foundation_disposal_failed",
      details: {
        fallbackFailures: expect.arrayContaining([
          expect.objectContaining({ source: "lifecycle" }),
        ]),
      },
    });
  });

  it("surfaces fallback cleanup failures instead of swallowing them", async () => {
    trustSyntheticFoundationBoundary();
    const result = await runRuntimeAndContractFoundationGate({
      realmAdapter: createFoundationRealmAdapter({
        skipContainmentFailure: true,
        failDisposeOnRealm: 2,
      }),
      realmConformanceReport: createPassingConformanceReport(),
    });

    expect(result).toMatchObject({
      status: "failed",
      sourceGenerationAvailable: false,
      terminalResult: { failedBoundary: "cleanup" },
    });
    expect(result.checks.at(-1)).toMatchObject({
      boundary: "cleanup",
      status: "failed",
      code: "foundation_fallback_cleanup_failed",
    });
  });

  it.each([
    "intent_resolution",
    "constraint_admission",
    "contract_validation",
    "config_dsl",
    "capability_registry",
    "capability_grant",
    "realm_conformance",
    "binding_admission",
    "lifecycle",
    "ports",
    "deterministic_services",
    "resource_budget",
    "containment",
    "cleanup",
  ] as const)(
    "returns stable structured evidence for a deliberate %s failure",
    async (failBoundary) => {
      trustSyntheticFoundationBoundary();
      const result =
        await runRuntimeAndContractFoundationGateWithDeliberateFailure({
          input: {
            realmAdapter: createFoundationRealmAdapter(),
            realmConformanceReport: createPassingConformanceReport(),
          },
          failBoundary,
        });

      expect(result).toMatchObject({
        status: "failed",
        sourceGenerationAvailable: false,
        terminalResult: {
          code: "runtime_contract_foundation_gate_failed",
          failedBoundary: failBoundary,
        },
      });
      expect(result.checks.at(-1)).toEqual({
        boundary: failBoundary,
        status: "failed",
        code: `foundation_${failBoundary}_deliberate_failure`,
        message: `The foundation gate deliberately failed boundary "${failBoundary}".`,
        details: { deliberate: true },
      });
      expect(isMechanicSourceGenerationAvailable(result)).toBe(false);
    }
  );

  it("rejects a same-ID adapter that the selected factory did not mint", async () => {
    conformanceTrust.trustSynthetic = true;
    const result = await runRuntimeAndContractFoundationGate({
      realmAdapter: createFoundationRealmAdapter(),
      realmConformanceReport: createPassingConformanceReport(),
    });

    expect(result).toMatchObject({
      status: "failed",
      sourceGenerationAvailable: false,
      terminalResult: { failedBoundary: "realm_conformance" },
    });
    expect(result.checks.at(-1)).toEqual({
      boundary: "realm_conformance",
      status: "failed",
      code: "realm_conformance_adapter_untrusted",
      message:
        "The Mechanic Execution Realm adapter was not minted by an admitted implementation factory.",
    });
  });
});

function trustSyntheticFoundationBoundary(): void {
  conformanceTrust.trustSynthetic = true;
  adapterTrust.trustSynthetic = true;
}

const PASSED_REALM_GATES = [
  "usable_capability_execution",
  "forbidden_authority_isolation",
  "escape_resistance",
  "runaway_termination",
  "resource_enforcement",
  "determinism",
  "opaque_handle_isolation",
  "cleanup_and_recovery",
  "browser_integration",
  "diagnostic_quality",
] as const;

function createPassingConformanceReport(): MechanicExecutionRealmConformanceReport {
  const probeResults = Array.from({ length: 32 }, (_, index) => ({
    probeId: `foundation_probe_${index}`,
    kind: "capability_use" as const,
    hostResponsive: true,
    candidateExecutionBrowserEvidence: true,
    runtimeHeartbeatBrowserEvidence: true,
    realBrowserEvidence: true,
    result: {
      probeId: `foundation_probe_${index}`,
      outcome: "completed" as const,
      durationMilliseconds: 0,
      evidence: {},
    },
  }));
  return {
    suiteVersion: MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION,
    capabilityVersion: "mechanic_capability/v1",
    candidateId: "foundation_realm",
    verdict: "passed",
    gates: PASSED_REALM_GATES.map((id, index) => ({
      id,
      status: "passed",
      probeIds: [probeResults[index]?.probeId ?? "foundation_probe_0"],
      failures: [],
    })),
    probeResults,
  };
}

type FoundationRealmOptions = Readonly<{
  failDispose?: boolean;
  failDisposeOnRealm?: number;
  skipBindingRead?: boolean;
  skipContainmentFailure?: boolean;
  onDispose?: () => void;
}>;

function createFoundationRealmAdapter(
  options: FoundationRealmOptions = {}
): MechanicExecutionRealmAdapter {
  let createdRealmCount = 0;
  return {
    adapterVersion: MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
    id: "foundation_realm",
    create: async (input) => {
      createdRealmCount += 1;
      return new FoundationRealm(input, {
        ...options,
        failDispose:
          options.failDispose ||
          options.failDisposeOnRealm === createdRealmCount,
      });
    },
  };
}

class FoundationRealm implements MechanicExecutionRealm {
  private disposed = false;

  constructor(
    private readonly input: CreateMechanicExecutionRealmInput,
    private readonly options: FoundationRealmOptions
  ) {}

  execute(execution: MechanicExecutionRealmExecutionInput) {
    if (this.disposed) {
      throw new Error("The foundation realm was disposed.");
    }
    const result = this.executeCallback(execution);
    return {
      result,
      terminate: async () => ({
        executionId: execution.id,
        outcome: "terminated" as const,
      }),
    };
  }

  dispose() {
    this.disposed = true;
    this.options.onDispose?.();
    if (this.options.failDispose) {
      throw new Error("foundation realm disposal failed");
    }
  }

  private async executeCallback(
    execution: MechanicExecutionRealmExecutionInput
  ): Promise<MechanicExecutionRealmExecutionResult> {
    const callbackId = execution.lifecycle?.invocations[0]?.callbackId;
    try {
      if (callbackId === "foundation_install") {
        const subject = this.input.bindings[0]?.handles[0];
        if (!subject) {
          throw new Error("The foundation subject binding was absent.");
        }
        const observation = this.options.skipBindingRead
          ? { kind: "json" as const, value: null }
          : await this.input.capabilityHost.invoke({
              capabilityId: "object_read",
              arguments: [subject],
            });
        await this.input.capabilityHost.invoke({
          capabilityId: "object_create",
          arguments: ["foundation_owned", { active: true }],
        });
        await this.input.capabilityHost.invoke({
          capabilityId: "state_write",
          arguments: ["foundation_count", 0],
        });
        const time = await this.input.capabilityHost.invoke({
          capabilityId: "time_read",
          arguments: [],
        });
        const random = await this.input.capabilityHost.invoke({
          capabilityId: "random_next",
          arguments: [],
        });
        await this.input.capabilityHost.invoke({
          capabilityId: "time_schedule",
          arguments: [8, "foundation_scheduled"],
        });
        return {
          executionId: execution.id,
          outcome: "completed",
          output: {
            observation:
              observation.kind === "json" ? observation.value : null,
            time: time.kind === "json" ? time.value : null,
            random: random.kind === "json" ? random.value : null,
          },
        };
      }

      if (callbackId === "foundation_action") {
        const callbackSource = execution.lifecycle?.callbacks.find(
          (callback) => callback.id === callbackId
        )?.source;
        if (
          callbackSource?.includes("foundation_buffer") &&
          !this.options.skipContainmentFailure
        ) {
          await this.input.capabilityHost.invoke({
            capabilityId: "state_write",
            arguments: ["foundation_buffer", "x".repeat(1024)],
          });
        }
        return { executionId: execution.id, outcome: "completed" };
      }

      if (callbackId === "foundation_scheduled") {
        const current = await this.input.capabilityHost.invoke({
          capabilityId: "state_read",
          arguments: ["foundation_count"],
        });
        const next = current.kind === "json" && typeof current.value === "number"
          ? current.value + 1
          : 1;
        await this.input.capabilityHost.invoke({
          capabilityId: "state_write",
          arguments: ["foundation_count", next],
        });
        await this.input.capabilityHost.invoke({
          capabilityId: "signal_emit",
          arguments: ["foundation_output", next],
        });
        return {
          executionId: execution.id,
          outcome: "completed",
          output: next,
        };
      }

      return { executionId: execution.id, outcome: "completed" };
    } catch (error) {
      if (error instanceof MechanicExecutionRealmResourceLimitError) {
        return {
          executionId: execution.id,
          outcome: "resource_limit",
          resourceUsage: {
            dimension: error.dimension,
            limit: error.limit,
            observed: error.observed,
          },
          diagnostic: {
            stage: "realm_execution",
            code: "foundation_resource_budget_exceeded",
            message: error.message,
          },
        };
      }
      return {
        executionId: execution.id,
        outcome: "failed",
        diagnostic: {
          stage: "realm_execution",
          code: "foundation_execution_failed",
          message:
            error instanceof Error ? error.message : "Foundation execution failed.",
        },
      };
    }
  }
}
