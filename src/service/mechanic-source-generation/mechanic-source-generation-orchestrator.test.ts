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
import { PHASE_9_MECHANIC_RESOURCE_BUDGET } from "@/runtime/mechanics/phase-9-mechanic-resource-policy";

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
});
