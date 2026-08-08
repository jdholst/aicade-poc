import { describe, expect, it, vi } from "vitest";

import type {
  MechanicExecutionRealmExecutionResult,
  MechanicExecutionRealmResourceBudget,
  MechanicExecutionRealmResourceDimension,
} from "./mechanic-execution-realm";
import type { MechanicLifecycleServices } from "./mechanic-lifecycle";
import { createContainedMechanicRuntime } from "./contained-mechanic-runtime";

describe("Contained generated mechanic runtime", () => {
  it("accepts any coherent budget admitted by an outer composition policy", () => {
    const admittedBudget = {
      ...createResourceBudget(),
      profileId: "evaluation_budget",
      maximumOwnedObjects: 5,
    } satisfies MechanicExecutionRealmResourceBudget;
    const lifecycle = createLifecycleStub({
      executionId: "mechanic_install",
      outcome: "completed",
    }, undefined, true, admittedBudget);

    expect(() =>
      createContainedMechanicRuntime({
        extensionId: "extension_evaluation",
        buildId: "build_evaluation",
        capabilityVersion: "mechanic_capability/v1",
        seed: 1729,
        resourceBudget: admittedBudget,
        lifecycle,
        ownedObjects: createOwnedObjectCleanupStub(0),
        privateState: createPrivateStateCleanupStub(0, admittedBudget),
      })
    ).not.toThrow();
  });

  it("contains a resource violation and retains repair-quality failure evidence", async () => {
    const lifecycle = createLifecycleStub({
      executionId: "mechanic_install",
      outcome: "resource_limit",
      callback: { id: "install_seeded_hazard", kind: "install" },
      resourceUsage: {
        dimension: "owned_objects",
        limit: 4,
        observed: 5,
      },
      diagnostic: {
        stage: "realm_execution",
        code: "resource_budget_exceeded",
        message: "Resource owned_objects exceeded 4 with 5.",
      },
    });
    const ownedObjects = createOwnedObjectCleanupStub(2);
    const privateState = createPrivateStateCleanupStub(12);
    const runtime = createContainedMechanicRuntime({
      extensionId: "extension_seeded_hazard",
      buildId: "build_seeded_hazard",
      capabilityVersion: "mechanic_capability/v1",
      seed: 1729,
      resourceBudget: createResourceBudget(),
      lifecycle,
      ownedObjects,
      privateState,
    });

    await expect(runtime.install()).resolves.toEqual({
      outcome: "contained_failure",
      results: [expect.objectContaining({ executionId: "mechanic_install" })],
      evidence: expect.objectContaining({
        schemaVersion: "mechanic_runtime_failure_evidence/v1",
        extensionId: "extension_seeded_hazard",
        capabilityVersion: "mechanic_capability/v1",
        buildId: "build_seeded_hazard",
        callback: { id: "install_seeded_hazard", kind: "install" },
        failure: {
          kind: "resource_budget",
          dimension: "owned_objects",
          limit: 4,
          observed: 5,
        },
        reproduction: {
          seed: 1729,
          simulationTimeMilliseconds: 0,
          input: null,
          resourceBudget: createResourceBudget(),
        },
        cleanup: {
          lifecycleDisposed: true,
          registrationsRemoved: true,
          ownedObjectsRemoved: true,
          privateStateRemoved: true,
          issues: [],
        },
        playableResult: "invalidated",
        repair: {
          artifact: "generated_mechanic_source",
          issuePath: "callbacks.install_seeded_hazard",
          suggestedAction:
            "Repair the generated mechanic source at callback \"install_seeded_hazard\" and validate a new extension version.",
        },
      }),
    });
    expect(lifecycle.dispose).toHaveBeenCalledOnce();
    expect(ownedObjects.dispose).toHaveBeenCalledOnce();
    expect(privateState.dispose).toHaveBeenCalledOnce();
    expect(runtime.state).toBe("failed");
    expect(Object.isFrozen(runtime.failureEvidence)).toBe(true);
    expect(structuredClone(runtime.failureEvidence)).toEqual(
      runtime.failureEvidence
    );
  });

  it.each([
    "owned_objects",
    "operations_per_tick",
    "scheduled_callbacks",
    "subscriptions",
    "signals_per_tick",
    "state_bytes",
    "callback_milliseconds",
    "consecutive_failures",
  ] satisfies MechanicExecutionRealmResourceDimension[])(
    "contains an over-limit %s result and removes every owned resource",
    async (dimension) => {
      const lifecycle = createLifecycleStub({
        executionId: `mechanic_${dimension}_failure`,
        outcome: "resource_limit",
        resourceUsage: { dimension, limit: 1, observed: 2 },
        diagnostic: {
          stage: "realm_execution",
          code: "resource_budget_exceeded",
          message: `Resource ${dimension} exceeded 1 with 2.`,
        },
      });
      const ownedObjects = createOwnedObjectCleanupStub(1);
      const runtime = createRuntime(lifecycle, ownedObjects);

      const result = await runtime.install();

      expect(result).toMatchObject({
        outcome: "contained_failure",
        evidence: {
          failure: { kind: "resource_budget", dimension, limit: 1, observed: 2 },
          cleanup: {
            lifecycleDisposed: true,
            registrationsRemoved: true,
            ownedObjectsRemoved: true,
            issues: [],
          },
        },
      });
    }
  );

  it("contains an exception once without affecting another admitted mechanic", async () => {
    const failingLifecycle = createLifecycleStub({
      executionId: "mechanic_action_1",
      outcome: "failed",
      diagnostic: {
        stage: "realm_execution",
        code: "candidate_execution_failed",
        message: "generated callback threw",
      },
    });
    const healthyLifecycle = createLifecycleStub({
      executionId: "mechanic_install",
      outcome: "completed",
    });
    const failingRuntime = createRuntime(
      failingLifecycle,
      createOwnedObjectCleanupStub(1)
    );
    const healthyRuntime = createRuntime(
      healthyLifecycle,
      createOwnedObjectCleanupStub(0),
      "extension_healthy"
    );

    const firstFailure = await failingRuntime.install();
    const repeatedDispatch = await failingRuntime.dispatchLogicalAction("jump");

    expect(firstFailure).toMatchObject({
      outcome: "contained_failure",
      evidence: {
        extensionId: "extension_seeded_hazard",
        failure: {
          kind: "exception",
          code: "candidate_execution_failed",
          message: "generated callback threw",
        },
      },
    });
    expect(repeatedDispatch).toMatchObject({
      outcome: "contained_failure",
      evidence: { extensionId: "extension_seeded_hazard" },
    });
    expect(failingLifecycle.install).toHaveBeenCalledOnce();
    expect(failingLifecycle.dispatchLogicalAction).not.toHaveBeenCalled();
    await expect(healthyRuntime.install()).resolves.toMatchObject({
      outcome: "completed",
    });
    await expect(
      healthyRuntime.dispatchLogicalAction("jump")
    ).resolves.toMatchObject({ outcome: "completed" });
    expect(healthyRuntime.state).toBe("active");
  });

  it("snapshots mutable callback input before retaining reproducible evidence", async () => {
    const lifecycle = createLifecycleStub({
      executionId: "mechanic_install",
      outcome: "completed",
    });
    vi.mocked(lifecycle.dispatchLogicalAction).mockResolvedValue([
      {
        executionId: "mechanic_action_1",
        outcome: "failed",
        diagnostic: {
          stage: "realm_execution",
          code: "candidate_execution_failed",
          message: "generated callback threw",
        },
      },
    ]);
    const runtime = createRuntime(lifecycle, createOwnedObjectCleanupStub(0));
    const payload = { intensity: 1 };
    await runtime.install();

    const result = await runtime.dispatchLogicalAction("jump", payload);
    payload.intensity = 99;

    expect(result).toMatchObject({
      outcome: "contained_failure",
      evidence: {
        reproduction: {
          input: { actionId: "jump", payload: { intensity: 1 } },
        },
      },
    });
    if (result.outcome !== "contained_failure") {
      throw new Error("Expected contained failure evidence.");
    }
    expect(Object.isFrozen(result.evidence.reproduction.input)).toBe(true);
    expect(
      Object.isFrozen(
        (result.evidence.reproduction.input as { payload: object }).payload
      )
    ).toBe(true);
  });

  it("contains a dispose callback exception while completing host cleanup", async () => {
    const lifecycle = createLifecycleStub(
      { executionId: "mechanic_install", outcome: "completed" },
      {
        executionId: "mechanic_dispose",
        outcome: "failed",
        diagnostic: {
          stage: "realm_execution",
          code: "candidate_execution_failed",
          message: "dispose callback threw",
        },
      }
    );
    const ownedObjects = createOwnedObjectCleanupStub(1);
    const runtime = createRuntime(lifecycle, ownedObjects);
    await runtime.install();

    const result = await runtime.dispose();

    expect(result).toMatchObject({
      outcome: "contained_failure",
      evidence: {
        callback: { id: "dispose_declared", kind: "dispose" },
        failure: {
          kind: "exception",
          code: "candidate_execution_failed",
          message: "dispose callback threw",
        },
        cleanup: {
          lifecycleDisposed: true,
          registrationsRemoved: true,
          ownedObjectsRemoved: true,
          issues: [],
        },
      },
    });
    expect(runtime.state).toBe("failed");
    expect(ownedObjects.dispose).toHaveBeenCalledOnce();
  });

  it("uses the declared callback ID when a lifecycle failure lacks callback metadata", async () => {
    const lifecycle = createLifecycleStub({
      executionId: "mechanic_install",
      outcome: "failed",
      diagnostic: {
        stage: "realm_execution",
        code: "lifecycle_boundary_failure",
        message: "lifecycle failed before returning callback metadata",
      },
    });
    const runtime = createRuntime(lifecycle, createOwnedObjectCleanupStub(0));

    const result = await runtime.install();

    expect(result).toMatchObject({
      outcome: "contained_failure",
      evidence: {
        callback: { id: "install_declared", kind: "install" },
        repair: { issuePath: "callbacks.install_declared" },
      },
    });
  });

  it("contains trusted cleanup failure without inventing a generated callback", async () => {
    const lifecycle = createLifecycleStub(
      { executionId: "mechanic_install", outcome: "completed" },
      undefined,
      false
    );
    vi.mocked(lifecycle.dispose).mockRejectedValue(
      new Error("realm worker stayed alive")
    );
    const runtime = createRuntime(lifecycle, createOwnedObjectCleanupStub(1));
    await runtime.install();

    const result = await runtime.dispose();

    expect(result).toMatchObject({
      outcome: "contained_failure",
      evidence: {
        callback: { id: "host_cleanup", kind: "host_cleanup" },
        failure: {
          kind: "exception",
          code: "mechanic_dispose_failed",
          message: "realm worker stayed alive",
        },
        cleanup: {
          lifecycleDisposed: false,
          registrationsRemoved: false,
          ownedObjectsRemoved: true,
          privateStateRemoved: true,
          issues: ["realm worker stayed alive"],
        },
        repair: {
          artifact: "runtime_host",
          issuePath: "cleanup",
        },
      },
    });
    expect(runtime.state).toBe("failed");
  });
});

function createRuntime(
  lifecycle: MechanicLifecycleServices,
  ownedObjects: ReturnType<typeof createOwnedObjectCleanupStub>,
  extensionId = "extension_seeded_hazard"
) {
  return createContainedMechanicRuntime({
    extensionId,
    buildId: "build_seeded_hazard",
    capabilityVersion: "mechanic_capability/v1",
    seed: 1729,
    resourceBudget: createResourceBudget(),
    lifecycle,
    ownedObjects,
    privateState: createPrivateStateCleanupStub(0),
  });
}

function createLifecycleStub(
  installResult: MechanicExecutionRealmExecutionResult,
  disposeResult?: MechanicExecutionRealmExecutionResult,
  includeDisposeCallback = true,
  resourceBudget: MechanicExecutionRealmResourceBudget = createResourceBudget()
): MechanicLifecycleServices {
  let state: MechanicLifecycleServices["state"] = "created";
  let scheduledCallbacks = 1;
  let subscriptions = 1;
  return {
    servicesVersion: "mechanic_lifecycle_services/v1",
    resourceBudget: Object.freeze({ ...resourceBudget }),
    callbackReferences: Object.freeze([
      { id: "install_declared", kind: "install" as const },
      { id: "logical_action_declared", kind: "logical_action" as const },
      { id: "gameplay_event_declared", kind: "gameplay_event" as const },
      { id: "scheduled_declared", kind: "scheduled" as const },
      { id: "fixed_step_declared", kind: "fixed_step" as const },
      ...(includeDisposeCallback
        ? [{ id: "dispose_declared", kind: "dispose" as const }]
        : []),
    ]),
    get state() {
      return state;
    },
    simulationTimeMilliseconds: 0,
    get pendingScheduledCallbackCount() {
      return scheduledCallbacks;
    },
    get activeSubscriptionCount() {
      return subscriptions;
    },
    lastDiagnostic: undefined,
    capabilityHost: {
      invoke: vi.fn(() => ({ kind: "json", value: null })),
    },
    install: vi.fn(async () => {
      state = installResult.outcome === "completed" ? "active" : "failed";
      return installResult;
    }),
    dispatchLogicalAction: vi.fn(async () => []),
    dispatchGameplayEvent: vi.fn(async () => []),
    advanceSimulation: vi.fn(async () => []),
    dispose: vi.fn(async () => {
      state = "disposed";
      scheduledCallbacks = 0;
      subscriptions = 0;
      return disposeResult;
    }),
    createCapabilityHost: vi.fn((delegate) => delegate),
  };
}

function createOwnedObjectCleanupStub(initialCount: number) {
  let ownedObjectCount = initialCount;
  return {
    dispose: vi.fn(() => {
      ownedObjectCount = 0;
    }),
    getOwnedObjectCount: vi.fn(() => ownedObjectCount),
  };
}

function createPrivateStateCleanupStub(
  initialBytes: number,
  resourceBudget: MechanicExecutionRealmResourceBudget = createResourceBudget()
) {
  let usedBytes = initialBytes;
  return {
    resourceBudget: Object.freeze({ ...resourceBudget }),
    dispose: vi.fn(() => {
      usedBytes = 0;
    }),
    get usedBytes() {
      return usedBytes;
    },
  };
}

function createResourceBudget(): MechanicExecutionRealmResourceBudget {
  return {
    profileId: "phase_9_fixed_budget",
    maximumOwnedObjects: 4,
    maximumOperationsPerTick: 16,
    maximumScheduledCallbacks: 4,
    maximumSubscriptions: 4,
    maximumSignalsPerTick: 8,
    maximumStateBytes: 1024,
    maximumCallbackMilliseconds: 8,
    maximumConsecutiveFailures: 3,
  };
}
