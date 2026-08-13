import type { JsonValue, StableId } from "@/game-spec/game-spec-schema";
import type {
  MechanicCapabilityGrant,
  MechanicCapabilityResourceCosts,
} from "@/game-spec/mechanics/mechanic-capability-registry";
import {
  MechanicExecutionRealmResourceLimitError,
  type MechanicExecutionRealm,
  type MechanicExecutionRealmCapabilityArgument,
  type MechanicExecutionRealmCapabilityHost,
  type MechanicExecutionRealmCapabilityResult,
  type MechanicExecutionRealmCallbackReference,
  type MechanicExecutionRealmDiagnostic,
  type MechanicExecutionRealmExecutionResult,
  type MechanicExecutionRealmResourceBudget,
  type MechanicExecutionRealmRun,
} from "./mechanic-execution-realm";
import { isAuthenticGeneratedMechanicLifecycleProgram } from "./generated-mechanic-lifecycle-program";

export const MECHANIC_LIFECYCLE_SERVICES_VERSION =
  "mechanic_lifecycle_services/v1";

export type MechanicLifecycleCallbackKind =
  | "install"
  | "logical_action"
  | "gameplay_event"
  | "scheduled"
  | "fixed_step"
  | "dispose";

export type MechanicLifecycleCallback = {
  id: StableId;
  kind: MechanicLifecycleCallbackKind;
  source: string;
};

export type MechanicLifecycleProgram = {
  source: string;
  callbacks: readonly MechanicLifecycleCallback[];
  fixedStep?: {
    callbackId: StableId;
    intervalMilliseconds: number;
  };
};

export type MechanicLifecycleState =
  | "created"
  | "active"
  | "failed"
  | "disposing"
  | "disposed";

export type CreateMechanicLifecycleServicesInput = {
  createRealm: (input: {
    capabilityHost: MechanicExecutionRealmCapabilityHost;
    capabilityGrant: MechanicCapabilityGrant;
    resourceBudget: MechanicExecutionRealmResourceBudget;
    seed: number;
  }) => Promise<MechanicExecutionRealm>;
  delegateCapabilityHost: MechanicExecutionRealmCapabilityHost;
  capabilityGrant: MechanicCapabilityGrant;
  program: MechanicLifecycleProgram;
  seed: number;
  resourceBudget: MechanicExecutionRealmResourceBudget;
};

export type MechanicLifecycleServices = {
  readonly servicesVersion: typeof MECHANIC_LIFECYCLE_SERVICES_VERSION;
  readonly state: MechanicLifecycleState;
  readonly simulationTimeMilliseconds: number;
  readonly pendingScheduledCallbackCount: number;
  readonly activeSubscriptionCount: number;
  readonly lastDiagnostic: MechanicExecutionRealmDiagnostic | undefined;
  readonly resourceBudget: Readonly<MechanicExecutionRealmResourceBudget>;
  readonly callbackReferences: readonly MechanicExecutionRealmCallbackReference[];
  readonly capabilityHost: MechanicExecutionRealmCapabilityHost;
  install(): Promise<MechanicExecutionRealmExecutionResult>;
  dispatchLogicalAction(
    actionId: StableId,
    payload?: JsonValue
  ): Promise<readonly MechanicExecutionRealmExecutionResult[]>;
  dispatchGameplayEvent(
    eventId: StableId,
    payload?: JsonValue
  ): Promise<readonly MechanicExecutionRealmExecutionResult[]>;
  advanceSimulation(
    elapsedMilliseconds: number
  ): Promise<readonly MechanicExecutionRealmExecutionResult[]>;
  dispose(): Promise<MechanicExecutionRealmExecutionResult | undefined>;
  createCapabilityHost(
    delegate: MechanicExecutionRealmCapabilityHost
  ): MechanicExecutionRealmCapabilityHost;
};

type ScheduledCallback = {
  id: StableId;
  callbackId: StableId;
  dueAtMilliseconds: number;
  sequence: number;
};

type MechanicSubscription = {
  id: StableId;
  eventId: StableId;
  callbackId: StableId;
  sequence: number;
};

export async function createMechanicLifecycleServices({
  createRealm,
  delegateCapabilityHost,
  capabilityGrant,
  program,
  seed,
  resourceBudget,
}: CreateMechanicLifecycleServicesInput): Promise<MechanicLifecycleServices> {
  validateLifecycleProgram(program);
  validateNonnegativeLimit(
    resourceBudget.maximumScheduledCallbacks,
    "maximumScheduledCallbacks"
  );
  validateNonnegativeLimit(
    resourceBudget.maximumSubscriptions,
    "maximumSubscriptions"
  );
  validateNonnegativeLimit(
    resourceBudget.maximumOperationsPerTick,
    "maximumOperationsPerTick"
  );
  validateNonnegativeLimit(
    resourceBudget.maximumSignalsPerTick,
    "maximumSignalsPerTick"
  );

  const admittedResourceBudget = Object.freeze({ ...resourceBudget });

  const callbacksById = new Map(
    program.callbacks.map((callback) => [callback.id, callback])
  );
  const callbacksByKind = new Map(
    program.callbacks.map((callback) => [callback.kind, callback])
  );
  const grantedCapabilities = new Map(
    capabilityGrant.capabilities.map((capability) => [capability.id, capability])
  );
  const callbackReferences = Object.freeze(
    program.callbacks.map(({ id, kind }) => Object.freeze({ id, kind }))
  );
  const callbackDefinitions = program.callbacks.map(({ id, source }) => ({
    id,
    source,
  }));
  const callbackExecutionMode = isAuthenticGeneratedMechanicLifecycleProgram(
    program
  )
    ? ("generated_admitted" as const)
    : undefined;
  const scheduledCallbacks = new Map<StableId, ScheduledCallback>();
  const subscriptions = new Map<StableId, MechanicSubscription>();
  let lifecycleState: MechanicLifecycleState = "created";
  let simulationTimeMilliseconds = 0;
  let randomState = seed >>> 0;
  let nextSequence = 0;
  let nextScheduleSequence = 0;
  let nextSubscriptionSequence = 0;
  let operationQueue = Promise.resolve();
  let realmDisposed = false;
  let activeRun: MechanicExecutionRealmRun | undefined;
  let lastDiagnostic: MechanicExecutionRealmDiagnostic | undefined;
  let disposePromise:
    | Promise<MechanicExecutionRealmExecutionResult | undefined>
    | undefined;
  let activeCapabilityResourceStep:
    | { operationsPerTick: number; signalsPerTick: number }
    | undefined;

  const enqueue = <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const next = operationQueue.then(operation);
    operationQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  const withCapabilityResourceStep = async <Result>(
    operation: () => Promise<Result>
  ): Promise<Result> => {
    if (activeCapabilityResourceStep) {
      throw new Error("Mechanic capability resource steps cannot overlap.");
    }
    activeCapabilityResourceStep = { operationsPerTick: 0, signalsPerTick: 0 };
    try {
      return await operation();
    } finally {
      activeCapabilityResourceStep = undefined;
    }
  };

  const chargeCapabilityUse = (costs: MechanicCapabilityResourceCosts): void => {
    const step = activeCapabilityResourceStep;
    if (!step) {
      return;
    }
    const nextOperations = step.operationsPerTick + costs.operationsPerTick;
    if (nextOperations > admittedResourceBudget.maximumOperationsPerTick) {
      throw new MechanicExecutionRealmResourceLimitError(
        "operations_per_tick",
        admittedResourceBudget.maximumOperationsPerTick,
        nextOperations
      );
    }
    const nextSignals = step.signalsPerTick + (costs.signalsPerTick ?? 0);
    if (nextSignals > admittedResourceBudget.maximumSignalsPerTick) {
      throw new MechanicExecutionRealmResourceLimitError(
        "signals_per_tick",
        admittedResourceBudget.maximumSignalsPerTick,
        nextSignals
      );
    }
    step.operationsPerTick = nextOperations;
    step.signalsPerTick = nextSignals;
  };

  const disposeRealm = () => {
    if (realmDisposed) {
      return;
    }
    try {
      realm.dispose();
      realmDisposed = true;
    } catch (error) {
      lastDiagnostic = {
        stage: "cleanup",
        code: "lifecycle_realm_disposal_failed",
        message:
          error instanceof Error
            ? error.message
            : "Mechanic lifecycle realm disposal failed.",
      };
      throw error;
    }
  };

  const clearRegistrations = () => {
    scheduledCallbacks.clear();
    subscriptions.clear();
  };

  const failLifecycle = () => {
    if (lifecycleState === "active") {
      lifecycleState = "failed";
      clearRegistrations();
      try {
        disposeRealm();
      } catch {
        // The primary callback failure remains authoritative. A later explicit
        // disposal retries the realm and exposes cleanup failure to its caller.
      }
    }
  };

  const nextExecutionId = (prefix: string): StableId => {
    nextSequence += 1;
    return `mechanic_${prefix}_${nextSequence}`;
  };

  const executeCallback = async (
    callbackId: StableId,
    executionId: StableId,
    payload?: JsonValue,
    failOnError = true
  ): Promise<MechanicExecutionRealmExecutionResult> => {
    const callback = callbacksById.get(callbackId);
    if (!callback) {
      throw new Error(`Lifecycle callback "${callbackId}" is not declared.`);
    }

    const callbackSource = `const lifecycleInput = ${immutableJsonSource(
      payload
    )};\n${callback.source}`;

    let run: MechanicExecutionRealmRun | undefined;
    try {
      run = realm.execute({
        id: executionId,
        source: program.source,
        lifecycle: {
          ...(callbackExecutionMode ? { callbackExecutionMode } : {}),
          callbacks: callbackDefinitions.map((definition) =>
            definition.id === callbackId
              ? { ...definition, source: callbackSource }
              : definition
          ),
          invocations: [{ callbackId, count: 1 }],
        },
      });
      activeRun = run;
      const realmResult = await run.result;
      const result: MechanicExecutionRealmExecutionResult = Object.freeze({
        ...realmResult,
        callback: Object.freeze({ id: callback.id, kind: callback.kind }),
      });
      if (result.diagnostic) {
        lastDiagnostic = result.diagnostic;
      }
      if (result.outcome !== "completed" && failOnError) {
        failLifecycle();
      }
      return result;
    } catch (error) {
      const result: MechanicExecutionRealmExecutionResult = {
        executionId,
        outcome: "failed",
        callback: Object.freeze({ id: callback.id, kind: callback.kind }),
        diagnostic: {
          stage: "realm_execution",
          code: "lifecycle_callback_failed",
          message:
            error instanceof Error
              ? error.message
              : "Mechanic lifecycle callback failed.",
        },
      };
      lastDiagnostic = result.diagnostic;
      if (failOnError) {
        failLifecycle();
      }
      return result;
    } finally {
      if (activeRun === run) {
        activeRun = undefined;
      }
    }
  };

  const requireActive = () => {
    if (lifecycleState === "failed") {
      return false;
    }
    if (lifecycleState !== "active") {
      throw new Error(
        `Mechanic lifecycle is not active; current state is "${lifecycleState}".`
      );
    }
    return true;
  };

  const schedule = (delayMilliseconds: number, callbackId: StableId): StableId => {
    requireCallbackKind(callbacksById, callbackId, "scheduled");
    if (lifecycleState !== "active") {
      throw new Error("Mechanic lifecycle scheduling is unavailable.");
    }
    if (
      scheduledCallbacks.size >=
      admittedResourceBudget.maximumScheduledCallbacks
    ) {
      throw new MechanicExecutionRealmResourceLimitError(
        "scheduled_callbacks",
        admittedResourceBudget.maximumScheduledCallbacks,
        scheduledCallbacks.size + 1
      );
    }
    if (
      typeof delayMilliseconds !== "number" ||
      !Number.isFinite(delayMilliseconds) ||
      delayMilliseconds < 0
    ) {
      throw new TypeError(
        "Mechanic lifecycle schedule delay must be a finite nonnegative number."
      );
    }

    nextScheduleSequence += 1;
    const scheduleId = `mechanic_schedule_${nextScheduleSequence}`;
    scheduledCallbacks.set(scheduleId, {
      id: scheduleId,
      callbackId,
      dueAtMilliseconds: simulationTimeMilliseconds + delayMilliseconds,
      sequence: nextScheduleSequence,
    });
    return scheduleId;
  };

  const subscribe = (eventId: StableId, callbackId: StableId): StableId => {
    requireCallbackKind(callbacksById, callbackId, "gameplay_event");
    if (lifecycleState !== "active") {
      throw new Error("Mechanic lifecycle subscriptions are unavailable.");
    }
    if (subscriptions.size >= admittedResourceBudget.maximumSubscriptions) {
      throw new MechanicExecutionRealmResourceLimitError(
        "subscriptions",
        admittedResourceBudget.maximumSubscriptions,
        subscriptions.size + 1
      );
    }

    nextSubscriptionSequence += 1;
    const subscriptionId = `mechanic_subscription_${nextSubscriptionSequence}`;
    subscriptions.set(subscriptionId, {
      id: subscriptionId,
      eventId,
      callbackId,
      sequence: nextSubscriptionSequence,
    });
    return subscriptionId;
  };

  const nextRandom = (): number => {
    if (
      lifecycleState === "failed" ||
      lifecycleState === "disposed"
    ) {
      throw new Error("Mechanic lifecycle randomness is unavailable.");
    }
    randomState = (randomState + 0x6d2b79f5) | 0;
    let value = randomState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const drainScheduledCallbacks = async (
    callbackBudget: { dispatched: number }
  ): Promise<
    MechanicExecutionRealmExecutionResult[]
  > => {
    const results: MechanicExecutionRealmExecutionResult[] = [];
    while (lifecycleState === "active") {
      const due = [...scheduledCallbacks.values()]
        .filter((scheduled) => scheduled.dueAtMilliseconds <= simulationTimeMilliseconds)
        .sort(
          (left, right) =>
            left.dueAtMilliseconds - right.dueAtMilliseconds ||
            left.sequence - right.sequence
        )[0];
      if (!due) {
        break;
      }
      scheduledCallbacks.delete(due.id);
      if (
        callbackBudget.dispatched >=
        admittedResourceBudget.maximumOperationsPerTick
      ) {
        failLifecycle();
        results.push(
          createResourceLimitResult(
            "scheduled_callback_budget_exceeded",
            admittedResourceBudget.maximumOperationsPerTick,
            { id: due.callbackId, kind: "scheduled" }
          )
        );
        break;
      }
      callbackBudget.dispatched += 1;
      results.push(
        await executeCallback(
          due.callbackId,
          nextExecutionId("scheduled"),
          { simulationTimeMilliseconds }
        )
      );
    }
    return results;
  };

  const install = () =>
    enqueue(() => withCapabilityResourceStep(async () => {
      if (lifecycleState !== "created") {
        throw new Error(
          `Mechanic lifecycle cannot install from state "${lifecycleState}".`
        );
      }
      lifecycleState = "active";
      const callback = callbacksByKind.get("install");
      if (!callback) {
        throw new Error('Lifecycle callback kind "install" is not declared.');
      }
      return executeCallback(callback.id, "mechanic_install");
    }));

  const dispatchLogicalAction = (actionId: StableId, payload?: JsonValue) =>
    enqueue(() => withCapabilityResourceStep(async () => {
      if (!requireActive()) {
        return [];
      }
      const callback = callbacksByKind.get("logical_action");
      if (!callback) {
        return [];
      }
      return [
        await executeCallback(
          callback.id,
          nextExecutionId("action"),
          payload === undefined ? actionId : { actionId, payload }
        ),
      ];
    }));

  const dispatchGameplayEvent = (eventId: StableId, payload?: JsonValue) =>
    enqueue(() => withCapabilityResourceStep(async () => {
      if (!requireActive()) {
        return [];
      }
      const matchingSubscriptions = [...subscriptions.values()]
        .filter((subscription) => subscription.eventId === eventId)
        .sort((left, right) => left.sequence - right.sequence);
      const results: MechanicExecutionRealmExecutionResult[] = [];
      const callbackBudget = { dispatched: 0 };
      for (const subscription of matchingSubscriptions) {
        if (
          callbackBudget.dispatched >=
          admittedResourceBudget.maximumOperationsPerTick
        ) {
          failLifecycle();
          results.push(
            createResourceLimitResult(
              "event_callback_budget_exceeded",
              admittedResourceBudget.maximumOperationsPerTick,
              { id: subscription.callbackId, kind: "gameplay_event" }
            )
          );
          break;
        }
        callbackBudget.dispatched += 1;
        results.push(
          await executeCallback(
            subscription.callbackId,
            nextExecutionId("event"),
            payload === undefined ? eventId : { eventId, payload }
          )
        );
        if (lifecycleState !== "active") {
          break;
        }
      }
      return results;
    }));

  const advanceSimulation = (elapsedMilliseconds: number) =>
    enqueue(() => withCapabilityResourceStep(async () => {
      if (!requireActive()) {
        return [];
      }
      if (
        typeof elapsedMilliseconds !== "number" ||
        !Number.isFinite(elapsedMilliseconds) ||
        elapsedMilliseconds < 0
      ) {
        throw new TypeError(
          "Simulation advancement must be a finite nonnegative number."
        );
      }

      const results: MechanicExecutionRealmExecutionResult[] = [];
      const callbackBudget = { dispatched: 0 };
      const fixedStep = program.fixedStep;
      if (fixedStep) {
        const firstStep =
          Math.floor(simulationTimeMilliseconds / fixedStep.intervalMilliseconds) +
          1;
        const targetTime = simulationTimeMilliseconds + elapsedMilliseconds;
        let stepTime = firstStep * fixedStep.intervalMilliseconds;
        while (stepTime <= targetTime && lifecycleState === "active") {
          simulationTimeMilliseconds = stepTime;
          results.push(...(await drainScheduledCallbacks(callbackBudget)));
          if (lifecycleState !== "active") {
            break;
          }
          if (
            callbackBudget.dispatched >=
            admittedResourceBudget.maximumOperationsPerTick
          ) {
            failLifecycle();
            results.push(
              createResourceLimitResult(
                "fixed_step_budget_exceeded",
                admittedResourceBudget.maximumOperationsPerTick,
                { id: fixedStep.callbackId, kind: "fixed_step" }
              )
            );
            break;
          }
          callbackBudget.dispatched += 1;
          results.push(
            await executeCallback(
              fixedStep.callbackId,
              nextExecutionId("fixed_step"),
              { simulationTimeMilliseconds }
            )
          );
          stepTime += fixedStep.intervalMilliseconds;
        }
        if (lifecycleState === "active") {
          simulationTimeMilliseconds = targetTime;
          results.push(...(await drainScheduledCallbacks(callbackBudget)));
        }
        return results;
      }

      simulationTimeMilliseconds += elapsedMilliseconds;
      results.push(...(await drainScheduledCallbacks(callbackBudget)));
      return results;
    }));

  const dispose = () => {
    if (disposePromise) {
      return disposePromise;
    }
    if (lifecycleState === "disposed") {
      return Promise.resolve(undefined);
    }
    clearRegistrations();
    void activeRun?.terminate().catch(() => undefined);
    const shouldInvokeDispose = lifecycleState === "active";
    lifecycleState = "disposing";
    disposePromise = enqueue(() => withCapabilityResourceStep(async () => {
      let disposeResult: MechanicExecutionRealmExecutionResult | undefined;
      if (shouldInvokeDispose) {
        const callback = callbacksByKind.get("dispose");
        if (callback) {
          disposeResult = await executeCallback(
            callback.id,
            "mechanic_dispose",
            undefined,
            false
          );
        }
      }
      clearRegistrations();
      try {
        disposeRealm();
        lifecycleState = "disposed";
      } catch (error) {
        lifecycleState = "failed";
        throw error;
      }
      return disposeResult;
    }));
    return disposePromise;
  };

  const createCapabilityHost = (
    delegate: MechanicExecutionRealmCapabilityHost
  ): MechanicExecutionRealmCapabilityHost => ({
    invoke: async ({ capabilityId, arguments: capabilityArguments }) => {
      const capability = grantedCapabilities.get(capabilityId);
      if (!capability) {
        throw new Error(`Mechanic capability "${capabilityId}" was not granted.`);
      }
      chargeCapabilityUse(capability.resourceCosts);
      switch (capabilityId) {
        case "time_read":
          if (
            lifecycleState === "failed" ||
            lifecycleState === "disposed"
          ) {
            throw new Error("Mechanic lifecycle time is unavailable.");
          }
          return jsonResult(simulationTimeMilliseconds);
        case "random_next":
          return jsonResult(nextRandom());
        case "time_schedule":
          return jsonResult(
            schedule(
              requireNumberArgument(capabilityArguments, 0, "delayMilliseconds"),
              requireStringArgument(capabilityArguments, 1, "callbackId")
            )
          );
        case "event_subscribe":
          return jsonResult(
            subscribe(
              requireStringArgument(capabilityArguments, 0, "eventId"),
              requireStringArgument(capabilityArguments, 1, "callbackId")
            )
          );
        default:
          return delegate.invoke({ capabilityId, arguments: capabilityArguments });
      }
    },
  });

  const capabilityHost = createCapabilityHost(delegateCapabilityHost);
  const realm = await createRealm({
    capabilityGrant,
    capabilityHost,
    resourceBudget: admittedResourceBudget,
    seed,
  });

  return Object.freeze({
    servicesVersion: MECHANIC_LIFECYCLE_SERVICES_VERSION,
    get state() {
      return lifecycleState;
    },
    get simulationTimeMilliseconds() {
      return simulationTimeMilliseconds;
    },
    get pendingScheduledCallbackCount() {
      return scheduledCallbacks.size;
    },
    get activeSubscriptionCount() {
      return subscriptions.size;
    },
    get lastDiagnostic() {
      return lastDiagnostic;
    },
    resourceBudget: admittedResourceBudget,
    callbackReferences,
    capabilityHost,
    install,
    dispatchLogicalAction,
    dispatchGameplayEvent,
    advanceSimulation,
    dispose,
    createCapabilityHost,
  });
}

function validateLifecycleProgram(program: MechanicLifecycleProgram): void {
  if (typeof program.source !== "string") {
    throw new TypeError("Mechanic lifecycle source must be a string.");
  }
  const callbackIds = new Set<StableId>();
  const callbackKinds = new Set<MechanicLifecycleCallbackKind>();
  for (const callback of program.callbacks) {
    if (callbackIds.has(callback.id)) {
      throw new Error(`Lifecycle callback "${callback.id}" was declared twice.`);
    }
    if (callbackKinds.has(callback.kind)) {
      throw new Error(
        `Lifecycle callback kind "${callback.kind}" was declared twice.`
      );
    }
    callbackIds.add(callback.id);
    callbackKinds.add(callback.kind);
    if (typeof callback.source !== "string") {
      throw new TypeError(`Lifecycle callback "${callback.id}" source is invalid.`);
    }
  }
  if (!callbackKinds.has("install")) {
    throw new Error('Lifecycle callback kind "install" is required.');
  }
  if (program.fixedStep) {
    validatePositiveFiniteNumber(
      program.fixedStep.intervalMilliseconds,
      "fixed-step interval"
    );
    const fixedStepCallback = program.callbacks.find(
      (callback) => callback.id === program.fixedStep?.callbackId
    );
    if (
      !fixedStepCallback ||
      !["fixed_step", "scheduled"].includes(fixedStepCallback.kind)
    ) {
      throw new Error(
        `Lifecycle callback "${program.fixedStep.callbackId}" must be a fixed-step or scheduled callback.`
      );
    }
  }
}

function requireCallbackKind(
  callbacks: ReadonlyMap<StableId, MechanicLifecycleCallback>,
  callbackId: StableId,
  kind: MechanicLifecycleCallbackKind
): void {
  const callback = callbacks.get(callbackId);
  if (!callback) {
    throw new Error(`Lifecycle callback "${callbackId}" is not declared.`);
  }
  if (callback.kind !== kind) {
    throw new Error(
      `Lifecycle callback "${callbackId}" must have kind "${kind}".`
    );
  }
}

function validatePositiveFiniteNumber(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a finite positive number.`);
  }
}

function validateNonnegativeLimit(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative integer.`);
  }
}

function requireNumberArgument(
  argumentsList: readonly MechanicExecutionRealmCapabilityArgument[],
  index: number,
  label: string
): number {
  const value = argumentsList[index];
  if (typeof value !== "number") {
    throw new TypeError(`Mechanic lifecycle ${label} must be a number.`);
  }
  return value;
}

function requireStringArgument(
  argumentsList: readonly MechanicExecutionRealmCapabilityArgument[],
  index: number,
  label: string
): StableId {
  const value = argumentsList[index];
  if (typeof value !== "string") {
    throw new TypeError(`Mechanic lifecycle ${label} must be a string.`);
  }
  return value;
}

function serializeJson(value: JsonValue): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("Lifecycle input must be JSON serializable.");
  }
  return serialized;
}

function immutableJsonSource(value: JsonValue | undefined): string {
  if (value === undefined) {
    return "undefined";
  }
  return `(() => {
  const freezeJson = (input) => {
    if (input !== null && typeof input === "object") {
      for (const child of Object.values(input)) freezeJson(child);
      Object.freeze(input);
    }
    return input;
  };
  return freezeJson(${serializeJson(value)});
})()`;
}

function jsonResult(value: JsonValue): MechanicExecutionRealmCapabilityResult {
  return { kind: "json", value };
}

function createResourceLimitResult(
  code: StableId,
  limit: number,
  callback: Readonly<{
    id: StableId;
    kind: "scheduled" | "gameplay_event" | "fixed_step";
  }>
): MechanicExecutionRealmExecutionResult {
  return {
    executionId: `mechanic_${code}`,
    outcome: "resource_limit",
    callback: Object.freeze({ ...callback }),
    resourceUsage: {
      dimension: "operations_per_tick",
      limit,
      observed: limit + 1,
    },
    diagnostic: {
      stage: "realm_execution",
      code,
      message: "Mechanic lifecycle callback budget was exceeded.",
    },
  };
}
