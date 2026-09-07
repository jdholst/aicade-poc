import { describe, expect, it, vi } from "vitest";

import type { MechanicExecutionRealmResourceBudget } from "./mechanic-execution-realm";
import type { MechanicLifecycleServices } from "./mechanic-lifecycle";
import {
  PHASE_9_MECHANIC_RESOURCE_BUDGET,
  createPhase9ContainedMechanicRuntime,
} from "./phase-9-contained-mechanic-runtime";

describe("Phase 9 contained mechanic runtime composition", () => {
  it("owns one immutable fixed budget and supplies it to the general runtime", () => {
    expect(PHASE_9_MECHANIC_RESOURCE_BUDGET).toEqual({
      profileId: "phase_9_fixed_budget",
      maximumOwnedObjects: 4,
      maximumOperationsPerTick: 16,
      maximumScheduledCallbacks: 4,
      maximumSubscriptions: 4,
      maximumSignalsPerTick: 8,
      maximumStateBytes: 1024,
      maximumCallbackMilliseconds: 8,
      maximumConsecutiveFailures: 3,
    });
    expect(Object.isFrozen(PHASE_9_MECHANIC_RESOURCE_BUDGET)).toBe(true);

    const runtime = createPhase9ContainedMechanicRuntime({
      extensionId: "extension_phase_9",
      buildId: "build_phase_9",
      capabilityVersion: "mechanic_capability/v1",
      seed: 1729,
      lifecycle: createLifecycleStub(PHASE_9_MECHANIC_RESOURCE_BUDGET),
      ownedObjects: createOwnedObjectCleanupStub(),
      privateState: createPrivateStateCleanupStub(
        PHASE_9_MECHANIC_RESOURCE_BUDGET
      ),
    });

    expect(runtime.state).toBe("created");
  });

  it("rejects components prepared under a different budget profile", () => {
    const otherBudget = {
      ...PHASE_9_MECHANIC_RESOURCE_BUDGET,
      profileId: "evaluation_budget",
    } satisfies MechanicExecutionRealmResourceBudget;

    expect(() =>
      createPhase9ContainedMechanicRuntime({
        extensionId: "extension_budget_override",
        buildId: "build_budget_override",
        capabilityVersion: "mechanic_capability/v1",
        seed: 1729,
        lifecycle: createLifecycleStub(otherBudget),
        ownedObjects: createOwnedObjectCleanupStub(),
        privateState: createPrivateStateCleanupStub(otherBudget),
      })
    ).toThrow(
      'Contained mechanic lifecycle resource budget does not match "profileId".'
    );
  });
});

function createLifecycleStub(
  resourceBudget: MechanicExecutionRealmResourceBudget
): MechanicLifecycleServices {
  return {
    servicesVersion: "mechanic_lifecycle_services/v1",
    resourceBudget: Object.freeze({ ...resourceBudget }),
    callbackReferences: Object.freeze([]),
    state: "created",
    simulationTimeMilliseconds: 0,
    pendingScheduledCallbackCount: 0,
    activeSubscriptionCount: 0,
    lastDiagnostic: undefined,
    capabilityHost: {
      invoke: vi.fn(() => ({ kind: "json", value: null })),
    },
    install: vi.fn(async () => ({
      executionId: "mechanic_install",
      outcome: "completed" as const,
    })),
    dispatchLogicalAction: vi.fn(async () => []),
    dispatchGameplayEvent: vi.fn(async () => []),
    advanceSimulation: vi.fn(async () => []),
    dispose: vi.fn(async () => undefined),
    createCapabilityHost: vi.fn((delegate) => delegate),
  };
}

function createOwnedObjectCleanupStub() {
  return {
    dispose: vi.fn(),
    getOwnedObjectCount: vi.fn(() => 0),
  };
}

function createPrivateStateCleanupStub(
  resourceBudget: MechanicExecutionRealmResourceBudget
) {
  return {
    resourceBudget: Object.freeze({ ...resourceBudget }),
    usedBytes: 0,
    dispose: vi.fn(),
  };
}
