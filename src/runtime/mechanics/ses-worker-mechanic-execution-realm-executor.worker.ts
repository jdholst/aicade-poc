import "ses";

import type { JsonValue } from "@/game-spec/game-spec-schema";
import type { MechanicCapabilityGrant } from "@/game-spec/mechanics/mechanic-capability-registry";
import type {
  MechanicExecutionRealmConformanceProbe,
  MechanicExecutionRealmProbeDiagnostic,
  MechanicExecutionRealmProbeResult,
} from "@/game-spec/mechanics/mechanic-execution-realm-conformance";
import type {
  MechanicExecutionRealmDiagnostic,
  MechanicExecutionRealmExecutionInput,
  MechanicExecutionRealmExecutionResult,
  MechanicExecutionRealmResourceBudget,
  MechanicExecutionRealmResourceDimension,
} from "@/runtime/mechanics/mechanic-execution-realm";
import { isMechanicExecutionRealmResourceUsage } from "@/runtime/mechanics/mechanic-execution-realm";
import {
  compileAndRunMechanicRuntimeCallback,
  evaluateMeteredMechanicRuntimeCallback,
  runMechanicRuntimeCallbacks,
} from "@/runtime/mechanics/mechanic-runtime-callback-runner";
import {
  SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
  type SesWorkerRealmBindingDescriptor,
  type SesWorkerRealmCapabilityResponse,
  type SesWorkerRealmEncodedValue,
} from "@/runtime/mechanics/ses-worker-mechanic-execution-realm-protocol";
import { containedErrorMessage } from "@/runtime/mechanics/ses-worker-mechanic-execution-realm-diagnostic";

type WorkerScope = {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void;
  postMessage(message: unknown): void;
};

type ExecuteProbeMessage = {
  kind: "ses_execute_probe";
  jobId: string;
  probe: MechanicExecutionRealmConformanceProbe;
};

type ExecuteRuntimeMessage = {
  kind: "ses_execute_runtime";
  jobId: string;
  realmId: string;
  executionId: string;
  execution: MechanicExecutionRealmExecutionInput;
  capabilityGrant: MechanicCapabilityGrant;
  bindings: readonly SesWorkerRealmBindingDescriptor[];
  seed: number;
  resourceBudget: MechanicExecutionRealmResourceBudget;
};

type RuntimeCapabilityResponseMessage = {
  kind: "ses_runtime_capability_response";
  jobId: string;
  executionId: string;
  response: SesWorkerRealmCapabilityResponse;
};

type RuntimeCallbackYieldTask = {
  jobId: string;
  executionId: string;
  callId: string;
};

type RuntimeCapabilityYieldGate = {
  suspend(): number | undefined;
  resume(): number | undefined;
};

type ResourceCounters = Record<
  MechanicExecutionRealmResourceDimension,
  number
>;

type HandleMetadata = {
  target: object;
  id: string;
  token?: string;
};

type PendingCapabilityCall = {
  jobId: string;
  executionId: string;
  yieldGate: RuntimeCapabilityYieldGate;
  resolve(value: SesWorkerRealmEncodedValue): void;
  reject(error: Error): void;
};

type ObservedCapabilityTask = Promise<
  | { success: true; value: unknown }
  | { success: false; error: unknown }
>;

type MechanicExecutionKernelMode = "conformance" | "runtime";

type MechanicExecutionKernelContext = {
  counters: ResourceCounters;
  handleMetadata: WeakMap<object, HandleMetadata>;
  handlesByToken: Map<string, object>;
  makeOpaqueHandle(id: string, token?: string): object;
};

type MechanicExecutionKernelInput = {
  mode: MechanicExecutionKernelMode;
  jobId: string;
  source: string;
  lifecycle?: MechanicExecutionRealmExecutionInput["lifecycle"];
  capabilityGrant: MechanicCapabilityGrant;
  seed: number;
  resourceBudget: MechanicExecutionRealmResourceBudget;
  resourceTarget?: MechanicExecutionRealmConformanceProbe["resourceTarget"];
  invokeCapability(
    capabilityId: string,
    args: readonly unknown[],
    context: MechanicExecutionKernelContext,
    yieldGate: RuntimeCapabilityYieldGate
  ): unknown | Promise<unknown>;
  createRealmBindings(
    context: MechanicExecutionKernelContext
  ): Readonly<Record<string, unknown>>;
  onCallbackStarted?(): void;
  onCallbackFinished?(activeMilliseconds: number): void;
  inspectReturnedHandle?: boolean;
};

type MechanicExecutionKernelResult = {
  output: unknown;
  capabilityCalls: readonly string[];
  handleIsolation?: NonNullable<
    MechanicExecutionRealmProbeResult["evidence"]["handleIsolation"]
  >;
  resourcesAfterCleanup: typeof noResources;
};

type RuntimeCallbackActivityMeter = {
  start(): void;
  suspend():
    | {
        activeMilliseconds: number;
        resume(): void;
      }
    | undefined;
  finish(): number;
};

const workerScope = globalThis as unknown as WorkerScope;

lockdown({ evalTaming: "no-eval" });

class ResourceLimitError extends Error {
  constructor(
    readonly dimension: MechanicExecutionRealmResourceDimension,
    readonly limit: number,
    readonly observed: number
  ) {
    super(`Resource ${dimension} exceeded ${limit} with ${observed}.`);
  }
}

const noResources = Object.freeze({
  ownedObjects: 0,
  scheduledCallbacks: 0,
  subscriptions: 0,
  signals: 0,
  privateStateBytes: 0,
  pendingTasks: 0,
});
const pendingCapabilityCalls = new Map<string, PendingCapabilityCall>();
const runtimeCallbackYieldChannel = new MessageChannel();
const generatedMechanicCallbackCompartment = createMechanicCompartment(
  Object.freeze(Object.create(null))
);
const compiledGeneratedMechanicCallbacks = new Map<string, unknown>();
const MAXIMUM_CACHED_GENERATED_MECHANIC_CALLBACKS = 64;
let activeRuntimeJobId: string | undefined;
let nextCapabilityCallId = 0;

runtimeCallbackYieldChannel.port1.addEventListener("message", (event) => {
  if (
    !event.isTrusted ||
    event.currentTarget !== runtimeCallbackYieldChannel.port1 ||
    !isRuntimeCallbackYieldTask(event.data)
  ) {
    return;
  }
  acknowledgeRuntimeCallbackYield(event.data);
});
runtimeCallbackYieldChannel.port1.start();

workerScope.addEventListener("message", (event) => {
  if (!event.isTrusted) {
    return;
  }
  if (isExecuteProbeMessage(event.data)) {
    void executeMechanicProbeInSesCompartment(
      event.data.jobId,
      event.data.probe
    );
    return;
  }
  if (isExecuteRuntimeMessage(event.data) && !activeRuntimeJobId) {
    const input = event.data;
    activeRuntimeJobId = input.jobId;
    void executeMechanicRuntimeInSesCompartment(input).finally(() => {
      rejectPendingCallsForJob(
        input.jobId,
        new Error("Runtime execution ended before capability completion.")
      );
      if (activeRuntimeJobId === input.jobId) {
        activeRuntimeJobId = undefined;
      }
    });
    return;
  }
  if (isRuntimeCapabilityResponseMessage(event.data)) {
    settleRuntimeCapabilityResponse(event.data);
  }
});

const ambientCompartment = new Compartment();
const ambientAudit: unknown = ambientCompartment.evaluate(`(() => {
  const attempt = (operation) => {
    try { return { completed: true, value: operation() }; }
    catch (error) { return { completed: false, error: error.name }; }
  };
  return {
    self: typeof self,
    postMessage: typeof postMessage,
    Worker: typeof Worker,
    fetch: typeof fetch,
    WebSocket: typeof WebSocket,
    indexedDB: typeof indexedDB,
    caches: typeof caches,
    navigator: typeof navigator,
    location: typeof location,
    crypto: typeof crypto,
    performance: typeof performance,
    setTimeout: typeof setTimeout,
    importScripts: typeof importScripts,
    dateNow: attempt(() => Date.now()),
    mathRandom: attempt(() => Math.random()),
  };
})()`);
workerScope.postMessage({
  kind: "ses_executor_ready",
  ambientAudit: cloneJsonValue(ambientAudit),
});

async function executeMechanicProbeInSesCompartment(
  jobId: string,
  probe: MechanicExecutionRealmConformanceProbe
): Promise<void> {
  const startedAt = performance.now();
  try {
    const kernelResult = await runMechanicExecutionKernel({
      mode: "conformance",
      jobId,
      source: probe.source,
      lifecycle: probe.lifecycle,
      capabilityGrant: probe.capabilityGrant,
      seed: probe.seed,
      resourceBudget: probe.resourceBudget,
      resourceTarget: probe.resourceTarget,
      invokeCapability: (capabilityId, args, context) => {
        if (capabilityId === "time_read") {
          return 16;
        }
        if (capabilityId === "object_read") {
          const metadata =
            typeof args[0] === "object" && args[0] !== null
              ? context.handleMetadata.get(args[0])
              : undefined;
          return harden({
            id: metadata?.id ?? "admitted_fixture",
            x: 1,
            y: 2,
          });
        }
        if (capabilityId === "object_create") {
          return context.makeOpaqueHandle(
            `owned_${context.counters.owned_objects}`
          );
        }
        if (capabilityId === "spatial_query") {
          return harden([]);
        }
        return undefined;
      },
      createRealmBindings: (context) =>
        Object.freeze({
          fixtureHandle: makeProtectedCallable((id: string) =>
            context.makeOpaqueHandle(id)
          ),
        }),
      onCallbackStarted:
        probe.resourceTarget?.dimension === "callback_milliseconds"
          ? () => {
              workerScope.postMessage({
                kind: "ses_callback_started",
                jobId,
              });
            }
          : undefined,
      inspectReturnedHandle: probe.kind === "opaque_handle_use",
    });

    const evidence: MechanicExecutionRealmProbeResult["evidence"] = {
      resourcesAfterCleanup: kernelResult.resourcesAfterCleanup,
    };
    if (probe.kind === "capability_use") {
      evidence.capabilityCalls = kernelResult.capabilityCalls;
    }
    if (probe.kind === "deterministic_replay" || probe.kind === "recovery") {
      evidence.output = cloneJsonValue(kernelResult.output);
    }
    if (probe.kind === "opaque_handle_use") {
      if (!kernelResult.handleIsolation) {
        throw new TypeError("Opaque-handle probe returned malformed output.");
      }
      evidence.handleIsolation = kernelResult.handleIsolation;
    }
    returnConformanceResult(jobId, {
      probeId: probe.id,
      outcome: "completed",
      durationMilliseconds: performance.now() - startedAt,
      evidence,
    });
  } catch (error) {
    if (error instanceof ResourceLimitError) {
      returnConformanceResult(jobId, {
        probeId: probe.id,
        outcome: "resource_limit",
        durationMilliseconds: performance.now() - startedAt,
        evidence: {
          resourcesAfterCleanup: noResources,
          resourceUsage: {
            dimension: error.dimension,
            limit: error.limit,
            observed: error.observed,
          },
        },
        diagnostic: conformanceDiagnostic(
          probe,
          "realm_execution",
          "resource_budget_exceeded",
          error
        ),
      });
      return;
    }
    const rejected =
      probe.kind === "forbidden_authority" ||
      probe.kind === "escape_attempt" ||
      probe.kind === "opaque_handle_escape";
    returnConformanceResult(jobId, {
      probeId: probe.id,
      outcome: rejected ? "rejected" : "failed",
      durationMilliseconds: performance.now() - startedAt,
      evidence: { resourcesAfterCleanup: noResources },
      diagnostic: conformanceDiagnostic(
        probe,
        probe.kind === "cleanup_failure" ? "cleanup" : "realm_execution",
        rejected ? "forbidden_authority" : "candidate_execution_failed",
        error
      ),
    });
  }
}

async function executeMechanicRuntimeInSesCompartment(
  input: ExecuteRuntimeMessage
): Promise<void> {
  const startedAt = performance.now();
  try {
    returnRuntimeResult(
      input,
      await runMechanicRuntimeInSesCompartment(input, startedAt)
    );
  } catch (error) {
    if (error instanceof ResourceLimitError) {
      returnRuntimeResult(input, {
        executionId: input.executionId,
        outcome: "resource_limit",
        durationMilliseconds: performance.now() - startedAt,
        resourceUsage: {
          dimension: error.dimension,
          limit: error.limit,
          observed: error.observed,
        },
        diagnostic: runtimeDiagnostic(
          input.executionId,
          "realm_execution",
          "resource_budget_exceeded",
          error
        ),
      });
      return;
    }
    returnRuntimeResult(input, {
      executionId: input.executionId,
      outcome: "failed",
      durationMilliseconds: performance.now() - startedAt,
      diagnostic: runtimeDiagnostic(
        input.executionId,
        "realm_execution",
        "candidate_execution_failed",
        error
      ),
    });
  }
}

async function runMechanicRuntimeInSesCompartment(
  input: ExecuteRuntimeMessage,
  startedAt: number
): Promise<MechanicExecutionRealmExecutionResult> {
  const kernelResult = await runMechanicExecutionKernel({
    mode: "runtime",
    jobId: input.jobId,
    source: input.execution.source,
    lifecycle: input.execution.lifecycle,
    capabilityGrant: input.capabilityGrant,
    seed: input.seed,
    resourceBudget: input.resourceBudget,
    invokeCapability: (capabilityId, args, context, yieldGate) =>
      requestRuntimeCapability(
        input,
        capabilityId,
        args.map((argument) =>
          encodeRuntimeCapabilityArgument(argument, context.handleMetadata)
        ),
        yieldGate
      ).then((value) =>
        decodeRuntimeCapabilityValue(
          value,
          context.handlesByToken,
          context.handleMetadata
        )
      ),
    createRealmBindings: (context) => {
      const bindings = createRuntimeBindings(
        input.bindings,
        context.handlesByToken,
        context.handleMetadata
      );
      return Object.freeze({
        binding: makeProtectedCallable((bindingId: string): unknown => {
          if (!bindings.has(bindingId)) {
            throw new TypeError(`Binding ${bindingId} was not admitted.`);
          }
          return bindings.get(bindingId);
        }),
      });
    },
    onCallbackStarted: () => {
      workerScope.postMessage({
        kind: "ses_callback_started",
        jobId: input.jobId,
      });
    },
    onCallbackFinished: (activeMilliseconds) => {
      workerScope.postMessage({
        kind: "ses_runtime_callback_finished",
        jobId: input.jobId,
        activeMilliseconds,
      });
    },
  });
  const result: MechanicExecutionRealmExecutionResult = {
    executionId: input.executionId,
    outcome: "completed",
    durationMilliseconds: performance.now() - startedAt,
  };
  if (kernelResult.output !== undefined) {
    result.output = cloneJsonValue(kernelResult.output);
  }
  return result;
}

async function runMechanicExecutionKernel(
  input: MechanicExecutionKernelInput
): Promise<MechanicExecutionKernelResult> {
  workerScope.postMessage({
    kind: "ses_shared_kernel_entered",
    jobId: input.jobId,
    mode: input.mode,
  });

  const granted = new Map(
    input.capabilityGrant.capabilities.map((capability) => [
      capability.id,
      capability,
    ])
  );
  const counters = createResourceCounters();
  const handleMetadata = new WeakMap<object, HandleMetadata>();
  const handlesByToken = new Map<string, object>();
  const stateBytesById = new Map<unknown, number>();
  const capabilityCalls: string[] = [];
  const capabilityTasks: ObservedCapabilityTask[] = [];
  const callbackActivity = createRuntimeCallbackActivityMeter();
  let pendingTaskCount = 0;
  let randomState = input.seed >>> 0;
  const context: MechanicExecutionKernelContext = {
    counters,
    handleMetadata,
    handlesByToken,
    makeOpaqueHandle: (id, token) =>
      makeOpaqueHandle(id, handleMetadata, token),
  };

  const callCapability = makeProtectedCallable(
    (capabilityId: string, ...args: unknown[]): Promise<unknown> => {
      let resolveTask: (value: unknown) => void = () => undefined;
      let rejectTask: (error: unknown) => void = () => undefined;
      const task = new Promise<unknown>((resolve, reject) => {
        resolveTask = resolve;
        rejectTask = reject;
      });
      pendingTaskCount += 1;
      const observedTask: ObservedCapabilityTask = task.then(
        (value) => {
          pendingTaskCount -= 1;
          return { success: true, value };
        },
        (error: unknown) => {
          pendingTaskCount -= 1;
          return { success: false, error };
        }
      );
      capabilityTasks.push(observedTask);

      try {
        capabilityCalls.push(capabilityId);
        const capability = granted.get(capabilityId);
        if (!capability) {
          throw new TypeError(`Capability ${capabilityId} was not granted.`);
        }
        chargeRuntimeCapability(
          capability,
          args,
          counters,
          stateBytesById,
          input.resourceBudget
        );
        enforceTarget(input.resourceTarget, counters);

        if (capabilityId === "random_next") {
          randomState = (randomState + 0x6d2b79f5) | 0;
          let value = randomState;
          value = Math.imul(value ^ (value >>> 15), value | 1);
          value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
          resolveTask(((value ^ (value >>> 14)) >>> 0) / 4_294_967_296);
          return task;
        }
        let callbackSuspension:
          | ReturnType<RuntimeCallbackActivityMeter["suspend"]>
          | undefined;
        const yieldGate: RuntimeCapabilityYieldGate = {
          suspend() {
            if (input.mode !== "runtime" || callbackSuspension) {
              return undefined;
            }
            callbackSuspension = callbackActivity.suspend();
            return callbackSuspension?.activeMilliseconds;
          },
          resume() {
            const activeMilliseconds = callbackSuspension?.activeMilliseconds;
            callbackSuspension?.resume();
            callbackSuspension = undefined;
            return activeMilliseconds;
          },
        };
        let capabilityResult: unknown | Promise<unknown>;
        try {
          capabilityResult = input.invokeCapability(
            capabilityId,
            args,
            context,
            yieldGate
          );
        } catch (error) {
          yieldGate.resume();
          throw error;
        }
        Promise.resolve(capabilityResult).then(
          (value) => {
            resolveTask(value);
          },
          (error: unknown) => {
            rejectTask(error);
          }
        );
      } catch (error) {
        rejectTask(error);
      }
      return task;
    }
  );

  let output: unknown;
  let executionError: unknown;
  let executionFailed = false;
  try {
    const realmBindings = input.createRealmBindings(context);
    const realmProperties: PropertyDescriptorMap = {
      callCapability: { value: callCapability, enumerable: true },
    };
    for (const [name, value] of Object.entries(realmBindings)) {
      realmProperties[name] = { value, enumerable: true };
    }
    const realm = Object.freeze(Object.create(null, realmProperties));
    const compartment = createMechanicCompartment(realm);

    try {
      output = await compartment.evaluate(
        `(async () => { ${input.source}\n})()`
      );
    } catch (error) {
      executionFailed = true;
      executionError = error;
    }

    if (!executionFailed) {
      try {
        await runRuntimeLifecycle(
          input,
          compartment,
          counters,
          callbackActivity,
          output
        );
      } catch (error) {
        executionFailed = true;
        executionError = error;
      }
    }

    try {
      await drainRuntimeCapabilityTasks(capabilityTasks);
    } catch (error) {
      if (!executionFailed) {
        executionFailed = true;
        executionError = error;
      }
    }

    if (executionFailed) {
      throw executionError;
    }
    if (pendingTaskCount !== 0) {
      throw new Error("Mechanic capability drain left pending tasks.");
    }

    return {
      output: input.lifecycle ? undefined : output,
      capabilityCalls: Object.freeze([...capabilityCalls]),
      handleIsolation: input.inspectReturnedHandle
        ? inspectReturnedOpaqueHandle(output, handleMetadata)
        : undefined,
      resourcesAfterCleanup: noResources,
    };
  } finally {
    cleanupMechanicExecutionKernelState(
      granted,
      counters,
      handlesByToken,
      stateBytesById,
      capabilityCalls,
      capabilityTasks
    );
  }
}

async function runRuntimeLifecycle(
  input: MechanicExecutionKernelInput,
  compartment: Compartment,
  counters: ResourceCounters,
  callbackActivity: RuntimeCallbackActivityMeter,
  lifecycleContext: unknown
): Promise<void> {
  const lifecycle = input.lifecycle;
  if (!lifecycle) {
    return;
  }
  const callbacks = new Map(
    lifecycle.callbacks.map((callback) => [callback.id, callback.source])
  );
  await runMechanicRuntimeCallbacks({
    mode: input.mode,
    callbacks,
    invocations: lifecycle.invocations,
    evaluate: (callbackSource) => {
      const onStarted = () => {
        callbackActivity.start();
        input.onCallbackStarted?.();
      };
      const onFinished = () => {
        const elapsed = callbackActivity.finish();
        counters.callback_milliseconds = Math.max(
          counters.callback_milliseconds,
          elapsed
        );
        input.onCallbackFinished?.(elapsed);
      };
      return lifecycle.callbackExecutionMode === "generated_admitted"
        ? compileAndRunMechanicRuntimeCallback({
            source: callbackSource,
            lifecycleContext,
            compile: compileReusableGeneratedMechanicCallback,
            onStarted,
            onFinished,
          })
        : evaluateMeteredMechanicRuntimeCallback({
            source: callbackSource,
            evaluate: (source) => compartment.evaluate(source),
            onStarted,
            onFinished,
          });
    },
    onCallbackCompleted: () => {
      counters.consecutive_failures = 0;
    },
    onCallbackFailed: (error) => {
      if (error instanceof ResourceLimitError) {
        throw error;
      }
      counters.consecutive_failures += 1;
      enforceRuntimeDimension(
        "consecutive_failures",
        counters.consecutive_failures,
        input.resourceBudget
      );
      enforceTarget(input.resourceTarget, counters);
    },
    afterCallback: () => {
      enforceRuntimeDimension(
        "callback_milliseconds",
        counters.callback_milliseconds,
        input.resourceBudget
      );
      enforceTarget(input.resourceTarget, counters);
    },
  });
}

function compileReusableGeneratedMechanicCallback(source: string): unknown {
  if (compiledGeneratedMechanicCallbacks.has(source)) {
    return compiledGeneratedMechanicCallbacks.get(source);
  }
  if (
    compiledGeneratedMechanicCallbacks.size >=
    MAXIMUM_CACHED_GENERATED_MECHANIC_CALLBACKS
  ) {
    compiledGeneratedMechanicCallbacks.clear();
  }
  const compiled = generatedMechanicCallbackCompartment.evaluate(source);
  compiledGeneratedMechanicCallbacks.set(source, compiled);
  return compiled;
}

function createRuntimeCallbackActivityMeter(): RuntimeCallbackActivityMeter {
  let activeStartedAt: number | undefined;
  let accumulatedMilliseconds = 0;
  let running = false;

  return {
    start() {
      if (running) {
        throw new Error("Mechanic callback activity measurements cannot overlap.");
      }
      running = true;
      accumulatedMilliseconds = 0;
      activeStartedAt = performance.now();
    },
    suspend() {
      if (!running || activeStartedAt === undefined) {
        return undefined;
      }
      accumulatedMilliseconds += performance.now() - activeStartedAt;
      activeStartedAt = undefined;
      let resumed = false;
      return {
        activeMilliseconds: accumulatedMilliseconds,
        resume() {
          if (resumed || !running) {
            return;
          }
          resumed = true;
          activeStartedAt = performance.now();
        },
      };
    },
    finish() {
      if (!running) {
        throw new Error("Mechanic callback activity measurement was not started.");
      }
      if (activeStartedAt !== undefined) {
        accumulatedMilliseconds += performance.now() - activeStartedAt;
      }
      const elapsed = accumulatedMilliseconds;
      running = false;
      activeStartedAt = undefined;
      accumulatedMilliseconds = 0;
      return elapsed;
    },
  };
}

function inspectReturnedOpaqueHandle(
  output: unknown,
  handleMetadata: WeakMap<object, HandleMetadata>
): NonNullable<
  MechanicExecutionRealmProbeResult["evidence"]["handleIsolation"]
> {
  if (
    !isRecord(output) ||
    typeof output.handle !== "object" ||
    output.handle === null
  ) {
    throw new TypeError("Opaque-handle probe returned malformed output.");
  }
  const handle = output.handle as Record<PropertyKey, unknown>;
  const metadata = handleMetadata.get(handle);
  let rawReferenceExposed = false;
  let mutationVisible = false;
  try {
    void handle.engineObject;
    rawReferenceExposed = true;
  } catch {}
  try {
    handle.engineObject = 1;
    mutationVisible = handle.engineObject === 1;
  } catch {}
  return {
    rawReferenceExposed,
    mutationVisible,
    serializedPropertyCount: metadata
      ? Reflect.ownKeys(metadata.target).length
      : -1,
    observationImmutable:
      typeof output.observation === "object" &&
      output.observation !== null &&
      Object.isFrozen(output.observation),
  };
}

function cleanupMechanicExecutionKernelState(
  granted: Map<string, MechanicCapabilityGrant["capabilities"][number]>,
  counters: ResourceCounters,
  handlesByToken: Map<string, object>,
  stateBytesById: Map<unknown, number>,
  capabilityCalls: string[],
  capabilityTasks: ObservedCapabilityTask[]
): void {
  granted.clear();
  handlesByToken.clear();
  stateBytesById.clear();
  capabilityCalls.length = 0;
  capabilityTasks.length = 0;
  for (const dimension of Object.keys(counters) as Array<
    MechanicExecutionRealmResourceDimension
  >) {
    counters[dimension] = 0;
  }
}

function createRuntimeBindings(
  descriptors: readonly SesWorkerRealmBindingDescriptor[],
  handlesByToken: Map<string, object>,
  metadata: WeakMap<object, HandleMetadata>
): ReadonlyMap<string, unknown> {
  const bindings = new Map<string, unknown>();
  for (const descriptor of descriptors) {
    if (bindings.has(descriptor.id)) {
      throw new TypeError(`Binding ${descriptor.id} was supplied twice.`);
    }
    if (descriptor.cardinality === "one" && descriptor.tokens.length !== 1) {
      throw new TypeError(
        `Binding ${descriptor.id} requires exactly one opaque handle.`
      );
    }
    const handles = descriptor.tokens.map((token) =>
      getOrCreateRuntimeHandle(token, handlesByToken, metadata)
    );
    bindings.set(
      descriptor.id,
      descriptor.cardinality === "one" ? handles[0] : Object.freeze(handles)
    );
  }
  return bindings;
}

async function drainRuntimeCapabilityTasks(
  tasks: ObservedCapabilityTask[]
): Promise<void> {
  let firstError: unknown;
  let failed = false;
  for (let index = 0; index < tasks.length; index += 1) {
    const result = await tasks[index];
    if (!result.success && !failed) {
      failed = true;
      firstError = result.error;
    }
  }
  if (failed) {
    throw firstError;
  }
}

function chargeRuntimeCapability(
  capability: MechanicCapabilityGrant["capabilities"][number],
  args: readonly unknown[],
  counters: ResourceCounters,
  stateBytesById: Map<unknown, number>,
  budget: MechanicExecutionRealmResourceBudget
): void {
  counters.operations_per_tick += capability.resourceCosts.operationsPerTick;
  counters.owned_objects += capability.resourceCosts.ownedObjects ?? 0;
  counters.scheduled_callbacks +=
    capability.resourceCosts.scheduledCallbacks ?? 0;
  counters.subscriptions += capability.resourceCosts.subscriptions ?? 0;
  counters.signals_per_tick +=
    capability.resourceCosts.signalsPerTick ?? 0;
  if (capability.id === "state_write") {
    const previousBytes = stateBytesById.get(args[0]) ?? 0;
    const nextBytes = measureJsonBytes(args[1]);
    stateBytesById.set(args[0], nextBytes);
    counters.state_bytes += nextBytes - previousBytes;
  }

  enforceRuntimeDimension(
    "operations_per_tick",
    counters.operations_per_tick,
    budget
  );
  enforceRuntimeDimension("owned_objects", counters.owned_objects, budget);
  enforceRuntimeDimension(
    "scheduled_callbacks",
    counters.scheduled_callbacks,
    budget
  );
  enforceRuntimeDimension("subscriptions", counters.subscriptions, budget);
  enforceRuntimeDimension(
    "signals_per_tick",
    counters.signals_per_tick,
    budget
  );
  enforceRuntimeDimension("state_bytes", counters.state_bytes, budget);
}

function enforceRuntimeDimension(
  dimension: MechanicExecutionRealmResourceDimension,
  observed: number,
  budget: MechanicExecutionRealmResourceBudget
): void {
  const limit = getRuntimeResourceLimit(dimension, budget);
  if (observed > limit) {
    throw new ResourceLimitError(dimension, limit, observed);
  }
}

function getRuntimeResourceLimit(
  dimension: MechanicExecutionRealmResourceDimension,
  budget: MechanicExecutionRealmResourceBudget
): number {
  switch (dimension) {
    case "owned_objects":
      return budget.maximumOwnedObjects;
    case "operations_per_tick":
      return budget.maximumOperationsPerTick;
    case "scheduled_callbacks":
      return budget.maximumScheduledCallbacks;
    case "subscriptions":
      return budget.maximumSubscriptions;
    case "signals_per_tick":
      return budget.maximumSignalsPerTick;
    case "state_bytes":
      return budget.maximumStateBytes;
    case "callback_milliseconds":
      return budget.maximumCallbackMilliseconds;
    case "consecutive_failures":
      return budget.maximumConsecutiveFailures;
  }
}

function requestRuntimeCapability(
  input: ExecuteRuntimeMessage,
  capabilityId: string,
  args: readonly SesWorkerRealmEncodedValue[],
  yieldGate: RuntimeCapabilityYieldGate
): Promise<SesWorkerRealmEncodedValue> {
  nextCapabilityCallId += 1;
  const callId = `call_${nextCapabilityCallId}`;
  const key = capabilityCallKey(input.jobId, callId);
  return new Promise((resolve, reject) => {
    pendingCapabilityCalls.set(key, {
      jobId: input.jobId,
      executionId: input.executionId,
      yieldGate,
      resolve,
      reject,
    });
    try {
      workerScope.postMessage({
        kind: "ses_runtime_capability_request",
        jobId: input.jobId,
        executionId: input.executionId,
        callId,
        capabilityId,
        arguments: args,
      });
      runtimeCallbackYieldChannel.port2.postMessage({
        jobId: input.jobId,
        executionId: input.executionId,
        callId,
      } satisfies RuntimeCallbackYieldTask);
    } catch (error) {
      pendingCapabilityCalls.delete(key);
      reject(
        error instanceof Error
          ? error
          : new Error("Capability request dispatch failed.")
      );
    }
  });
}

function acknowledgeRuntimeCallbackYield(
  message: RuntimeCallbackYieldTask
): void {
  const pending = pendingCapabilityCalls.get(
    capabilityCallKey(message.jobId, message.callId)
  );
  if (
    !pending ||
    activeRuntimeJobId !== message.jobId ||
    pending.executionId !== message.executionId
  ) {
    return;
  }
  const activeMilliseconds = pending.yieldGate.suspend();
  if (activeMilliseconds === undefined) {
    return;
  }
  workerScope.postMessage({
    kind: "ses_runtime_callback_suspended",
    jobId: message.jobId,
    executionId: message.executionId,
    callId: message.callId,
    activeMilliseconds,
  });
}

function settleRuntimeCapabilityResponse(
  message: RuntimeCapabilityResponseMessage
): void {
  const response = message.response;
  const key = capabilityCallKey(message.jobId, response.callId);
  const pending = pendingCapabilityCalls.get(key);
  if (
    !pending ||
    pending.jobId !== message.jobId ||
    pending.executionId !== message.executionId ||
    response.executionId !== message.executionId
  ) {
    return;
  }
  pendingCapabilityCalls.delete(key);
  const activeMilliseconds = pending.yieldGate.resume();
  if (activeMilliseconds !== undefined) {
    workerScope.postMessage({
      kind: "ses_runtime_callback_resumed",
      jobId: message.jobId,
      executionId: message.executionId,
      callId: response.callId,
      activeMilliseconds,
    });
  }
  if (response.success && response.value) {
    pending.resolve(response.value);
    return;
  }
  const resourceUsage = response.error?.resourceUsage;
  if (isMechanicExecutionRealmResourceUsage(resourceUsage)) {
    pending.reject(
      new ResourceLimitError(
        resourceUsage.dimension,
        resourceUsage.limit,
        resourceUsage.observed
      )
    );
    return;
  }
  pending.reject(
    new Error(
      response.error?.message ?? "Capability invocation failed without detail."
    )
  );
}

function rejectPendingCallsForJob(jobId: string, error: Error): void {
  for (const [key, pending] of pendingCapabilityCalls) {
    if (pending.jobId === jobId) {
      pendingCapabilityCalls.delete(key);
      pending.yieldGate.resume();
      pending.reject(error);
    }
  }
}

function capabilityCallKey(jobId: string, callId: string): string {
  return `${jobId}:${callId}`;
}

function encodeRuntimeCapabilityArgument(
  value: unknown,
  metadata: WeakMap<object, HandleMetadata>
): SesWorkerRealmEncodedValue {
  if (typeof value === "object" && value !== null) {
    const handle = metadata.get(value);
    if (handle?.token) {
      return { kind: "opaque_handle", token: handle.token };
    }
  }
  return { kind: "json", value: cloneJsonValue(value) };
}

function decodeRuntimeCapabilityValue(
  value: SesWorkerRealmEncodedValue,
  handlesByToken: Map<string, object>,
  metadata: WeakMap<object, HandleMetadata>
): unknown {
  if (value.kind === "json") {
    return harden(cloneJsonValue(value.value));
  }
  if (value.kind === "opaque_handle") {
    return getOrCreateRuntimeHandle(value.token, handlesByToken, metadata);
  }
  return Object.freeze(
    value.tokens.map((token) =>
      getOrCreateRuntimeHandle(token, handlesByToken, metadata)
    )
  );
}

function getOrCreateRuntimeHandle(
  token: string,
  handlesByToken: Map<string, object>,
  metadata: WeakMap<object, HandleMetadata>
): object {
  const existing = handlesByToken.get(token);
  if (existing) {
    return existing;
  }
  const handle = makeOpaqueHandle(token, metadata, token);
  handlesByToken.set(token, handle);
  return handle;
}

function enforceTarget(
  target: MechanicExecutionRealmConformanceProbe["resourceTarget"],
  counters: ResourceCounters
): void {
  if (!target) {
    return;
  }
  const observed = counters[target.dimension];
  if (observed > target.limit) {
    throw new ResourceLimitError(target.dimension, target.limit, observed);
  }
}

function createResourceCounters(): ResourceCounters {
  return {
    owned_objects: 0,
    operations_per_tick: 0,
    scheduled_callbacks: 0,
    subscriptions: 0,
    signals_per_tick: 0,
    state_bytes: 0,
    callback_milliseconds: 0,
    consecutive_failures: 0,
  };
}

function createMechanicCompartment(realm: object): Compartment {
  const forbiddenEvaluator = Object.freeze((): never => {
    throw new TypeError(
      "Dynamic evaluation is forbidden in generated mechanics."
    );
  });
  const compartment = new Compartment({
    globals: {
      realm,
      eval: forbiddenEvaluator,
      Function: forbiddenEvaluator,
      Compartment: forbiddenEvaluator,
    } as unknown as Map<string, unknown>,
    __options__: true,
  });
  Object.defineProperty(compartment.globalThis, "Phaser", {
    get() {
      throw new TypeError("Raw engine authority is forbidden.");
    },
    enumerable: false,
    configurable: false,
  });
  Object.freeze(compartment.globalThis);
  return compartment;
}

function makeProtectedCallable<Arguments extends unknown[], Result>(
  implementation: (...args: Arguments) => Result
): (...args: Arguments) => Result {
  Object.freeze(implementation);
  const proxy = new Proxy(implementation, {
    getPrototypeOf() {
      throw new TypeError("Capability prototype access is forbidden.");
    },
  });
  Object.freeze(proxy);
  return proxy;
}

function makeOpaqueHandle(
  id: string,
  metadata: WeakMap<object, HandleMetadata>,
  token?: string
): object {
  const target = Object.preventExtensions(Object.create(null));
  const handle = new Proxy(target, {
    get(_target, property) {
      if (property === "then") {
        return undefined;
      }
      throw new TypeError("Opaque handle properties are inaccessible.");
    },
    set() {
      throw new TypeError("Opaque handles are immutable.");
    },
    ownKeys() {
      throw new TypeError("Opaque handle enumeration is forbidden.");
    },
    getOwnPropertyDescriptor() {
      throw new TypeError("Opaque handle descriptors are inaccessible.");
    },
    getPrototypeOf() {
      throw new TypeError("Opaque handle prototypes are inaccessible.");
    },
    setPrototypeOf() {
      throw new TypeError("Opaque handles are immutable.");
    },
    defineProperty() {
      throw new TypeError("Opaque handles are immutable.");
    },
    deleteProperty() {
      throw new TypeError("Opaque handles are immutable.");
    },
  });
  metadata.set(handle, { target, id, token });
  return handle;
}

function measureJsonBytes(value: unknown): number {
  if (typeof value === "string") {
    return new TextEncoder().encode(value).byteLength;
  }
  const serialized = JSON.stringify(value);
  return serialized === undefined
    ? 0
    : new TextEncoder().encode(serialized).byteLength;
}

function conformanceDiagnostic(
  probe: MechanicExecutionRealmConformanceProbe,
  stage: MechanicExecutionRealmProbeDiagnostic["stage"],
  code: string,
  error?: unknown
): MechanicExecutionRealmProbeDiagnostic {
  return {
    stage,
    code,
    message:
      error instanceof Error
        ? error.message
        : `SES Worker contained ${probe.id}.`,
    repair: {
      artifact: "realm_candidate",
      issuePath: `conformance.${probe.id}`,
      suggestedAction:
        "Inspect the SES Worker candidate boundary and retry this probe.",
    },
  };
}

function runtimeDiagnostic(
  executionId: string,
  stage: MechanicExecutionRealmDiagnostic["stage"],
  code: string,
  error?: unknown
): MechanicExecutionRealmDiagnostic {
  return {
    stage,
    code,
    message: containedErrorMessage(
      error,
      "SES Worker contained generated mechanic execution."
    ),
    repair: {
      artifact: "realm_candidate",
      issuePath: `execution.${executionId}`,
      suggestedAction:
        "Inspect the SES Worker execution boundary and retry the execution.",
    },
  };
}

function returnConformanceResult(
  jobId: string,
  result: MechanicExecutionRealmProbeResult
): void {
  workerScope.postMessage({ kind: "ses_executor_result", jobId, result });
}

function returnRuntimeResult(
  input: ExecuteRuntimeMessage,
  result: MechanicExecutionRealmExecutionResult
): void {
  workerScope.postMessage({
    kind: "ses_runtime_executor_result",
    jobId: input.jobId,
    executionId: input.executionId,
    result,
  });
}

function cloneJsonValue(value: unknown): JsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("Value is not JSON serializable.");
  }
  return JSON.parse(serialized) as JsonValue;
}

function isExecuteProbeMessage(value: unknown): value is ExecuteProbeMessage {
  return (
    isRecord(value) &&
    value.kind === "ses_execute_probe" &&
    typeof value.jobId === "string" &&
    isRecord(value.probe)
  );
}

function isExecuteRuntimeMessage(
  value: unknown
): value is ExecuteRuntimeMessage {
  return (
    isRecord(value) &&
    value.kind === "ses_execute_runtime" &&
    typeof value.jobId === "string" &&
    typeof value.realmId === "string" &&
    typeof value.executionId === "string" &&
    isRecord(value.execution) &&
    value.execution.id === value.executionId &&
    typeof value.execution.source === "string" &&
    hasValidCallbackExecutionMode(value.execution) &&
    isRecord(value.capabilityGrant) &&
    Array.isArray(value.capabilityGrant.capabilities) &&
    Array.isArray(value.bindings) &&
    typeof value.seed === "number" &&
    Number.isFinite(value.seed) &&
    isRecord(value.resourceBudget)
  );
}

function hasValidCallbackExecutionMode(execution: Record<string, unknown>): boolean {
  if (execution.lifecycle === undefined) {
    return true;
  }
  return (
    isRecord(execution.lifecycle) &&
    (execution.lifecycle.callbackExecutionMode === undefined ||
      execution.lifecycle.callbackExecutionMode === "generated_admitted")
  );
}

function isRuntimeCapabilityResponseMessage(
  value: unknown
): value is RuntimeCapabilityResponseMessage {
  return (
    isRecord(value) &&
    value.kind === "ses_runtime_capability_response" &&
    typeof value.jobId === "string" &&
    typeof value.executionId === "string" &&
    isRecord(value.response) &&
    value.response.kind === "sparkline_mechanic_realm_capability_response" &&
    value.response.protocolVersion ===
      SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION &&
    typeof value.response.callId === "string" &&
    typeof value.response.success === "boolean" &&
    (value.response.success
      ? isEncodedValue(value.response.value)
      : isRecord(value.response.error) &&
        typeof value.response.error.code === "string" &&
        typeof value.response.error.message === "string")
  );
}

function isRuntimeCallbackYieldTask(
  value: unknown
): value is RuntimeCallbackYieldTask {
  return (
    isRecord(value) &&
    typeof value.jobId === "string" &&
    typeof value.executionId === "string" &&
    typeof value.callId === "string"
  );
}

function isEncodedValue(value: unknown): value is SesWorkerRealmEncodedValue {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === "json") {
    return "value" in value;
  }
  if (value.kind === "opaque_handle") {
    return typeof value.token === "string";
  }
  return (
    value.kind === "opaque_handles" &&
    Array.isArray(value.tokens) &&
    value.tokens.every((token) => typeof token === "string")
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}
