import type { JsonValue, StableId } from "@/game-spec/game-spec-schema";
import {
  assertPhase9MechanicResourceBudget,
  type MechanicExecutionRealmDiagnostic,
  type MechanicExecutionRealmExecutionResult,
  type MechanicExecutionRealmResourceBudget,
  type MechanicExecutionRealmResourceDimension,
} from "./mechanic-execution-realm";
/*
 * The contained runtime consumes lifecycle metadata instead of inferring
 * callback identities from execution labels. Failure evidence must always
 * point at source that actually exists in the admitted program.
 */
import type {
  MechanicLifecycleCallbackKind,
  MechanicLifecycleServices,
} from "./mechanic-lifecycle";

export const MECHANIC_RUNTIME_FAILURE_EVIDENCE_VERSION =
  "mechanic_runtime_failure_evidence/v1";

export type MechanicRuntimeFailureContextKind =
  | MechanicLifecycleCallbackKind
  | "host_cleanup";

export type MechanicRuntimeFailureEvidence = Readonly<{
  schemaVersion: typeof MECHANIC_RUNTIME_FAILURE_EVIDENCE_VERSION;
  extensionId: StableId;
  capabilityVersion: string;
  buildId: StableId;
  executionId: StableId;
  callback: Readonly<{
    id: StableId;
    kind: MechanicRuntimeFailureContextKind;
  }>;
  failure:
    | Readonly<{
        kind: "resource_budget";
        dimension: MechanicExecutionRealmResourceDimension;
        limit: number;
        observed: number;
      }>
    | Readonly<{
        kind: "exception";
        code: StableId;
        message: string;
      }>;
  reproduction: Readonly<{
    seed: number;
    simulationTimeMilliseconds: number;
    input: JsonValue;
    resourceBudget: Readonly<MechanicExecutionRealmResourceBudget>;
  }>;
  diagnostic?: Readonly<MechanicExecutionRealmDiagnostic>;
  cleanup: Readonly<{
    lifecycleDisposed: boolean;
    registrationsRemoved: boolean;
    ownedObjectsRemoved: boolean;
    privateStateRemoved: boolean;
    issues: readonly string[];
  }>;
  playableResult: "invalidated";
  repair: Readonly<
    | {
        artifact: "generated_mechanic_source";
        issuePath: string;
        suggestedAction: string;
      }
    | {
        artifact: "runtime_host";
        issuePath: "cleanup";
        suggestedAction: string;
      }
  >;
}>;

export type ContainedMechanicRuntimeState =
  | "created"
  | "active"
  | "failed"
  | "disposed";

export type ContainedMechanicRuntimeStep =
  | Readonly<{
      outcome: "completed";
      results: readonly MechanicExecutionRealmExecutionResult[];
    }>
  | Readonly<{
      outcome: "contained_failure";
      results: readonly MechanicExecutionRealmExecutionResult[];
      evidence: MechanicRuntimeFailureEvidence;
    }>;

export type MechanicOwnedObjectCleanup = {
  dispose(): void;
  getOwnedObjectCount(): number;
};

export type MechanicPrivateStateCleanup = {
  readonly usedBytes: number;
  readonly resourceBudget: Readonly<MechanicExecutionRealmResourceBudget>;
  dispose(): void;
};

export type CreateContainedMechanicRuntimeInput = {
  extensionId: StableId;
  buildId: StableId;
  capabilityVersion: string;
  seed: number;
  resourceBudget: MechanicExecutionRealmResourceBudget;
  lifecycle: MechanicLifecycleServices;
  ownedObjects: MechanicOwnedObjectCleanup;
  privateState: MechanicPrivateStateCleanup;
};

export type ContainedMechanicRuntime = {
  readonly state: ContainedMechanicRuntimeState;
  readonly failureEvidence: MechanicRuntimeFailureEvidence | undefined;
  install(): Promise<ContainedMechanicRuntimeStep>;
  dispatchLogicalAction(
    actionId: StableId,
    payload?: JsonValue
  ): Promise<ContainedMechanicRuntimeStep>;
  dispatchGameplayEvent(
    eventId: StableId,
    payload?: JsonValue
  ): Promise<ContainedMechanicRuntimeStep>;
  advanceSimulation(elapsedMilliseconds: number): Promise<ContainedMechanicRuntimeStep>;
  dispose(): Promise<ContainedMechanicRuntimeStep>;
};

type CallbackContext = {
  id: StableId;
  kind: MechanicRuntimeFailureContextKind;
};

const HOST_CLEANUP_CONTEXT = Object.freeze({
  id: "host_cleanup",
  kind: "host_cleanup",
} as const satisfies CallbackContext);

export function createContainedMechanicRuntime({
  extensionId,
  buildId,
  capabilityVersion,
  seed,
  resourceBudget,
  lifecycle,
  ownedObjects,
  privateState,
}: CreateContainedMechanicRuntimeInput): ContainedMechanicRuntime {
  assertPhase9MechanicResourceBudget(resourceBudget);
  assertMatchingResourceBudget("lifecycle", resourceBudget, lifecycle.resourceBudget);
  assertMatchingResourceBudget(
    "private-state host",
    resourceBudget,
    privateState.resourceBudget
  );
  const admittedResourceBudget = snapshotResourceBudget(resourceBudget);
  let runtimeState: ContainedMechanicRuntimeState = "created";
  let retainedFailureEvidence: MechanicRuntimeFailureEvidence | undefined;
  let operationQueue = Promise.resolve();

  const declaredCallback = (
    kind: MechanicLifecycleCallbackKind
  ): CallbackContext | undefined => {
    const callback = lifecycle.callbackReferences.find(
      (reference) => reference.kind === kind
    );
    return callback ? { ...callback } : undefined;
  };

  const requireDeclaredCallback = (
    kind: MechanicLifecycleCallbackKind
  ): CallbackContext => {
    const callback = declaredCallback(kind);
    if (!callback) {
      throw new Error(`Lifecycle callback kind "${kind}" is not declared.`);
    }
    return callback;
  };

  const enqueue = <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const next = operationQueue.then(operation);
    operationQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  const containFailure = async (
    result: MechanicExecutionRealmExecutionResult,
    callback: CallbackContext,
    input: JsonValue
  ): Promise<MechanicRuntimeFailureEvidence> => {
    if (retainedFailureEvidence) {
      return retainedFailureEvidence;
    }
    runtimeState = "failed";
    const cleanupIssues: string[] = [];
    try {
      await lifecycle.dispose();
    } catch (error) {
      cleanupIssues.push(errorMessage(error, "Mechanic lifecycle cleanup failed."));
    }
    try {
      ownedObjects.dispose();
    } catch (error) {
      cleanupIssues.push(errorMessage(error, "Mechanic-owned object cleanup failed."));
    }
    try {
      privateState.dispose();
    } catch (error) {
      cleanupIssues.push(errorMessage(error, "Mechanic private-state cleanup failed."));
    }

    retainedFailureEvidence = freezeFailureEvidence({
      schemaVersion: MECHANIC_RUNTIME_FAILURE_EVIDENCE_VERSION,
      extensionId,
      capabilityVersion,
      buildId,
      executionId: result.executionId,
      callback,
      failure: result.resourceUsage
        ? {
            kind: "resource_budget",
            ...result.resourceUsage,
          }
        : {
            kind: "exception",
            code: result.diagnostic?.code ?? "mechanic_callback_failed",
            message:
              result.diagnostic?.message ??
              `Controlled callback \"${callback.id}\" failed.`,
          },
      reproduction: {
        seed,
        simulationTimeMilliseconds: lifecycle.simulationTimeMilliseconds,
        input,
        resourceBudget: admittedResourceBudget,
      },
      ...(result.diagnostic
        ? { diagnostic: snapshotDiagnostic(result.diagnostic) }
        : {}),
      cleanup: {
        lifecycleDisposed: lifecycle.state === "disposed",
        registrationsRemoved:
          lifecycle.pendingScheduledCallbackCount === 0 &&
          lifecycle.activeSubscriptionCount === 0,
        ownedObjectsRemoved: ownedObjects.getOwnedObjectCount() === 0,
        privateStateRemoved: privateState.usedBytes === 0,
        issues: cleanupIssues,
      },
      playableResult: "invalidated",
      repair: createRepairDirective(callback),
    });
    return retainedFailureEvidence;
  };

  const runControlled = (
    callback: CallbackContext | undefined,
    input: JsonValue,
    execute: () => Promise<readonly MechanicExecutionRealmExecutionResult[]>
  ) =>
    enqueue(async (): Promise<ContainedMechanicRuntimeStep> => {
      if (retainedFailureEvidence) {
        return Object.freeze({
          outcome: "contained_failure",
          results: Object.freeze([]),
          evidence: retainedFailureEvidence,
        });
      }
      if (runtimeState === "disposed") {
        throw new Error("Contained mechanic runtime has been disposed.");
      }

      const reproducibleInput = snapshotJsonValue(input);
      const results = Object.freeze([...(await execute())]);

      const failedResult = results.find((result) => result.outcome !== "completed");
      if (failedResult) {
        const evidence = await containFailure(
          failedResult,
          callbackForResult(failedResult, callback),
          reproducibleInput
        );
        return Object.freeze({
          outcome: "contained_failure",
          results,
          evidence,
        });
      }
      if (callback?.kind === "install") {
        runtimeState = "active";
      }
      return Object.freeze({ outcome: "completed", results });
    });

  return Object.freeze({
    get state() {
      return runtimeState;
    },
    get failureEvidence() {
      return retainedFailureEvidence;
    },
    install: () =>
      runControlled(requireDeclaredCallback("install"), null, async () => [
        await lifecycle.install(),
      ]),
    dispatchLogicalAction: (actionId, payload) =>
      runControlled(
        declaredCallback("logical_action"),
        payload === undefined ? { actionId } : { actionId, payload },
        () => lifecycle.dispatchLogicalAction(actionId, payload)
      ),
    dispatchGameplayEvent: (eventId, payload) =>
      runControlled(
        declaredCallback("gameplay_event"),
        payload === undefined ? { eventId } : { eventId, payload },
        () => lifecycle.dispatchGameplayEvent(eventId, payload)
      ),
    advanceSimulation: (elapsedMilliseconds) =>
      runControlled(
        declaredCallback("fixed_step") ?? declaredCallback("scheduled"),
        { elapsedMilliseconds },
        () => lifecycle.advanceSimulation(elapsedMilliseconds)
      ),
    dispose: () =>
      enqueue(async (): Promise<ContainedMechanicRuntimeStep> => {
        if (retainedFailureEvidence) {
          return Object.freeze({
            outcome: "contained_failure",
            results: Object.freeze([]),
            evidence: retainedFailureEvidence,
          });
        }
        if (runtimeState === "disposed") {
          return Object.freeze({
            outcome: "completed",
            results: Object.freeze([]),
          });
        }
        let results: readonly MechanicExecutionRealmExecutionResult[];
        let lifecycleCleanupFailed = false;
        try {
          const disposeResult = await lifecycle.dispose();
          results = Object.freeze(disposeResult ? [disposeResult] : []);
        } catch (error) {
          lifecycleCleanupFailed = true;
          results = Object.freeze([
            {
              executionId: "mechanic_dispose_failure",
              outcome: "failed",
              diagnostic: {
                stage: "cleanup",
                code: "mechanic_dispose_failed",
                message: errorMessage(error, "Mechanic disposal failed."),
              },
            },
          ]);
        }
        const failedResult = results.find(
          (result) => result.outcome !== "completed"
        );
        if (failedResult) {
          const evidence = await containFailure(
            failedResult,
            lifecycleCleanupFailed
              ? HOST_CLEANUP_CONTEXT
              : callbackForResult(failedResult, declaredCallback("dispose")),
            null
          );
          return Object.freeze({
            outcome: "contained_failure",
            results,
            evidence,
          });
        }
        const resourceCleanupErrors: unknown[] = [];
        try {
          ownedObjects.dispose();
        } catch (error) {
          resourceCleanupErrors.push(error);
        }
        try {
          privateState.dispose();
        } catch (error) {
          resourceCleanupErrors.push(error);
        }
        if (resourceCleanupErrors.length > 0) {
          const cleanupFailure: MechanicExecutionRealmExecutionResult = {
            executionId: "mechanic_owned_object_cleanup_failure",
            outcome: "failed",
            diagnostic: {
              stage: "cleanup",
              code: "mechanic_resource_cleanup_failed",
              message: resourceCleanupErrors
                .map((error) =>
                  errorMessage(error, "Mechanic resource cleanup failed.")
                )
                .join(" "),
            },
          };
          const evidence = await containFailure(
            cleanupFailure,
            HOST_CLEANUP_CONTEXT,
            null
          );
          return Object.freeze({
            outcome: "contained_failure",
            results: Object.freeze([...results, cleanupFailure]),
            evidence,
          });
        }
        runtimeState = "disposed";
        return Object.freeze({ outcome: "completed", results });
      }),
  });
}

function callbackForResult(
  result: MechanicExecutionRealmExecutionResult,
  fallback: CallbackContext | undefined
): CallbackContext {
  if (result.callback) {
    return { ...result.callback };
  }
  if (fallback) {
    return fallback;
  }
  throw new Error(
    "A failed lifecycle result did not identify a declared callback."
  );
}

function createRepairDirective(
  callback: CallbackContext
): MechanicRuntimeFailureEvidence["repair"] {
  if (callback.kind === "host_cleanup") {
    return {
      artifact: "runtime_host",
      issuePath: "cleanup",
      suggestedAction:
        "Inspect the trusted runtime cleanup boundary and retry only after the host defect is repaired.",
    };
  }
  return {
    artifact: "generated_mechanic_source",
    issuePath: `callbacks.${callback.id}`,
    suggestedAction: `Repair the generated mechanic source at callback \"${callback.id}\" and validate a new extension version.`,
  };
}

function snapshotResourceBudget(
  budget: MechanicExecutionRealmResourceBudget
): Readonly<MechanicExecutionRealmResourceBudget> {
  return Object.freeze({ ...budget });
}

function assertMatchingResourceBudget(
  component: string,
  expected: MechanicExecutionRealmResourceBudget,
  actual: Readonly<MechanicExecutionRealmResourceBudget>
): void {
  for (const key of Object.keys(expected) as Array<
    keyof MechanicExecutionRealmResourceBudget
  >) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `Contained mechanic ${component} resource budget does not match "${key}".`
      );
    }
  }
}

function snapshotDiagnostic(
  diagnostic: MechanicExecutionRealmDiagnostic
): Readonly<MechanicExecutionRealmDiagnostic> {
  return Object.freeze({
    ...diagnostic,
    ...(diagnostic.repair
      ? { repair: Object.freeze({ ...diagnostic.repair }) }
      : {}),
  });
}

function freezeFailureEvidence(
  evidence: MechanicRuntimeFailureEvidence
): MechanicRuntimeFailureEvidence {
  return Object.freeze({
    ...evidence,
    callback: Object.freeze({ ...evidence.callback }),
    failure: Object.freeze({ ...evidence.failure }),
    reproduction: Object.freeze({
      ...evidence.reproduction,
      resourceBudget: Object.freeze({ ...evidence.reproduction.resourceBudget }),
    }),
    ...(evidence.diagnostic
      ? { diagnostic: snapshotDiagnostic(evidence.diagnostic) }
      : {}),
    cleanup: Object.freeze({
      ...evidence.cleanup,
      issues: Object.freeze([...evidence.cleanup.issues]),
    }),
    repair: Object.freeze({ ...evidence.repair }),
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function snapshotJsonValue(
  value: JsonValue,
  ancestors = new WeakSet<object>()
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (ancestors.has(value)) {
    throw new TypeError("Mechanic callback evidence input must be acyclic JSON data.");
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    const snapshot = Object.freeze(
      value.map((entry) => snapshotJsonValue(entry, ancestors))
    ) as JsonValue;
    ancestors.delete(value);
    return snapshot;
  }
  const snapshot = Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        snapshotJsonValue(entry, ancestors),
      ])
    )
  );
  ancestors.delete(value);
  return snapshot;
}
