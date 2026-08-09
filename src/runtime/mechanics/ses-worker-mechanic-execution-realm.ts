import {
  jsonValueSchema,
  STABLE_ID_PATTERN,
  type StableId,
} from "@/game-spec/game-spec-schema";
import { MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY } from "@/game-spec/mechanics/mechanic-execution-realm-conformance";
import {
  MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
  MechanicExecutionRealmResourceLimitError,
  isMechanicExecutionRealmResourceUsage,
  type CreateMechanicExecutionRealmInput,
  type MechanicExecutionRealm,
  type MechanicExecutionRealmAdapter,
  type MechanicExecutionRealmCapabilityArgument,
  type MechanicExecutionRealmExecutionInput,
  type MechanicExecutionRealmExecutionResult,
  type MechanicExecutionRealmRun,
} from "@/runtime/mechanics/mechanic-execution-realm";
import type { MechanicObjectHandle } from "@/runtime/mechanics/mechanic-object-host";
import {
  SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
  type SesWorkerRealmBindingDescriptor,
  type SesWorkerRealmCapabilityRequest,
  type SesWorkerRealmCapabilityResponse,
  type SesWorkerRealmEncodedValue,
  type SesWorkerRealmExecutionResponse,
  type SesWorkerRealmInitialize,
} from "@/runtime/mechanics/ses-worker-mechanic-execution-realm-protocol";

const REALM_DISPOSED_MESSAGE = "Mechanic Execution Realm has been disposed.";
const authenticSesWorkerAdapters = new WeakSet<MechanicExecutionRealmAdapter>();

export const SES_WORKER_MECHANIC_EXECUTION_REALM_CANDIDATE_ID =
  "ses_compartment_dedicated_worker_2_2_0";

export type SesWorkerMechanicExecutionRealmController = {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
};

export type CreateSesWorkerMechanicExecutionRealmAdapterInput = {
  createController?: () => SesWorkerMechanicExecutionRealmController;
  createMessageChannel?: () => MessageChannel;
};

export function createSesWorkerMechanicExecutionRealmAdapter({
  createController = createSesWorkerMechanicExecutionRealmController,
  createMessageChannel = () => new MessageChannel(),
}: CreateSesWorkerMechanicExecutionRealmAdapterInput = {}): MechanicExecutionRealmAdapter {
  const adapter: MechanicExecutionRealmAdapter = Object.freeze({
    adapterVersion: MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
    id: SES_WORKER_MECHANIC_EXECUTION_REALM_CANDIDATE_ID,
    async create(input) {
      const snapshot = snapshotRealmInput(input);
      const controller = createController();
      let channel: MessageChannel | undefined;
      try {
        channel = createMessageChannel();
        return await createSesWorkerRealm(controller, channel, snapshot);
      } catch (error) {
        channel?.port1.close();
        channel?.port2.close();
        controller.terminate();
        throw error;
      }
    },
  });
  authenticSesWorkerAdapters.add(adapter);
  return adapter;
}

export function isSesWorkerMechanicExecutionRealmAdapter(
  adapter: MechanicExecutionRealmAdapter
): boolean {
  return authenticSesWorkerAdapters.has(adapter);
}

export function createSesWorkerMechanicExecutionRealmController(): Worker {
  if (typeof Worker === "undefined") {
    throw new Error(
      "The SES Worker Mechanic Execution Realm requires a browser Worker."
    );
  }
  return new Worker(
    new URL(
      "./ses-worker-mechanic-execution-realm-controller.worker.ts",
      import.meta.url
    ),
    { name: "sparkline-mechanic-realm", type: "module" }
  );
}

function snapshotRealmInput(
  input: CreateMechanicExecutionRealmInput
): CreateMechanicExecutionRealmInput {
  const invoke = input.capabilityHost.invoke.bind(input.capabilityHost);
  return {
    mechanicId: input.mechanicId,
    capabilityGrant: {
      capabilityVersion: input.capabilityGrant.capabilityVersion,
      capabilities: input.capabilityGrant.capabilities.map((capability) => ({
        ...capability,
        authoring: { ...capability.authoring },
        evaluation: {
          actions: [...capability.evaluation.actions],
          observations: [...capability.evaluation.observations],
          ...(capability.evaluation.scenarioInputs
            ? { scenarioInputs: [...capability.evaluation.scenarioInputs] }
            : {}),
        },
        resourceCosts: { ...capability.resourceCosts },
        justification: { ...capability.justification },
      })),
    },
    bindings: input.bindings.map((binding) => ({
      id: binding.id,
      cardinality: binding.cardinality,
      handles: [...binding.handles],
    })),
    capabilityHost: { invoke },
    seed: input.seed,
    resourceBudget: { ...input.resourceBudget },
  };
}

async function createSesWorkerRealm(
  controller: SesWorkerMechanicExecutionRealmController,
  channel: MessageChannel,
  input: CreateMechanicExecutionRealmInput
): Promise<MechanicExecutionRealm> {
  const realmId = createPrivateId("realm");
  const grantedCapabilities = new Set(
    input.capabilityGrant.capabilities.map((capability) => capability.id)
  );
  const handlesByToken = new Map<StableId, MechanicObjectHandle>();
  const tokensByHandle = new WeakMap<object, StableId>();
  const bindings: SesWorkerRealmBindingDescriptor[] = input.bindings.map(
    (binding) => ({
      id: binding.id,
      cardinality: binding.cardinality,
      tokens: binding.handles.map((handle) =>
        getOrCreateHandleToken(
          handle,
          handlesByToken,
          tokensByHandle,
          binding.id
        )
      ),
    })
  );
  let disposed = false;
  let activeExecution = false;
  let activeExecutionId: StableId | undefined;
  const consumedExecutionIds = new Set<StableId>();
  const consumedCapabilityCallIds = new Map<StableId, Set<StableId>>();
  const pendingCancellations = new Set<(error: Error) => void>();

  const onCapabilityMessage = (event: MessageEvent<unknown>) => {
    const request = event.data;
    if (!isCapabilityRequest(request, realmId)) {
      return;
    }
    const requestIsFresh = consumeCapabilityCallId(
      consumedCapabilityCallIds,
      request.executionId,
      request.callId
    );
    void answerCapabilityRequest(
      request,
      channel.port1,
      input,
      grantedCapabilities,
      handlesByToken,
      tokensByHandle,
      requestIsFresh,
      () => activeExecutionId === request.executionId
    );
  };
  channel.port1.addEventListener("message", onCapabilityMessage);
  channel.port1.start();

  try {
    await waitForControllerReady(controller);
    const initialization: SesWorkerRealmInitialize = {
      kind: "sparkline_mechanic_realm_initialize",
      protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
      realmId,
      mechanicId: input.mechanicId,
      capabilityGrant: input.capabilityGrant,
      bindings,
      seed: input.seed,
      resourceBudget: input.resourceBudget,
      capabilityPort: channel.port2,
    };
    await waitForControllerMessage(
      controller,
      (value) =>
        isRecord(value) &&
        value.kind === "sparkline_mechanic_realm_initialized" &&
        value.protocolVersion ===
          SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION &&
        value.realmId === realmId,
      MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumExecutionMilliseconds,
      "SES Worker realm initialization timed out.",
      () => controller.postMessage(initialization, [channel.port2])
    );
  } catch (error) {
    channel.port1.removeEventListener("message", onCapabilityMessage);
    throw error;
  }

  const disposeRealm = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    activeExecutionId = undefined;
    for (const cancel of [...pendingCancellations]) {
      cancel(new Error(REALM_DISPOSED_MESSAGE));
    }
    pendingCancellations.clear();
    channel.port1.removeEventListener("message", onCapabilityMessage);
    channel.port1.close();
    let controllerTerminated = false;
    const terminateController = () => {
      if (controllerTerminated) {
        return;
      }
      controllerTerminated = true;
      clearTimeout(disposalDeadlineId);
      controller.removeEventListener("message", onDisposed);
      try {
        controller.terminate();
      } catch {
        // All locally owned listeners, ports, and handle tokens are still cleared.
      }
    };
    const onDisposed = (event: MessageEvent<unknown>) => {
      if (
        event.isTrusted &&
        event.currentTarget === (controller as unknown as EventTarget) &&
        isRecord(event.data) &&
        event.data.kind === "sparkline_mechanic_realm_disposed" &&
        event.data.protocolVersion ===
          SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION &&
        event.data.realmId === realmId
      ) {
        terminateController();
      }
    };
    const disposalDeadlineId = setTimeout(
      terminateController,
      MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumTerminationMilliseconds
    );
    controller.addEventListener("message", onDisposed);
    try {
      controller.postMessage({
        kind: "sparkline_mechanic_realm_dispose",
        protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
        realmId,
      });
    } catch {
      terminateController();
    }
    handlesByToken.clear();
    consumedExecutionIds.clear();
    consumedCapabilityCallIds.clear();
  };

  const realm: MechanicExecutionRealm = Object.freeze({
    execute(execution) {
      if (disposed) {
        throw new Error(REALM_DISPOSED_MESSAGE);
      }
      if (activeExecution) {
        throw new Error(
          "Mechanic Execution Realm accepts only one active execution."
        );
      }
      const executionSnapshot = snapshotExecution(execution);
      if (consumedExecutionIds.has(executionSnapshot.id)) {
        throw new Error(
          "Execution IDs are atomically single-use within a realm."
        );
      }
      consumedExecutionIds.add(executionSnapshot.id);
      activeExecution = true;
      activeExecutionId = executionSnapshot.id;
      return createExecutionRun(
        controller,
        realmId,
        executionSnapshot,
        pendingCancellations,
        () => {
          if (activeExecutionId === executionSnapshot.id) {
            activeExecutionId = undefined;
          }
        },
        () => {
          activeExecution = false;
          if (activeExecutionId === executionSnapshot.id) {
            activeExecutionId = undefined;
          }
        },
        disposeRealm
      );
    },
    dispose: disposeRealm,
  });

  return realm;
}

function snapshotExecution(
  execution: MechanicExecutionRealmExecutionInput
): MechanicExecutionRealmExecutionInput {
  const lifecycle = execution.lifecycle;
  return Object.freeze({
    id: execution.id,
    source: execution.source,
    ...(lifecycle
      ? {
          lifecycle: Object.freeze({
            callbacks: Object.freeze(
              lifecycle.callbacks.map((callback) =>
                Object.freeze({ id: callback.id, source: callback.source })
              )
            ),
            invocations: Object.freeze(
              lifecycle.invocations.map((invocation) =>
                Object.freeze({
                  callbackId: invocation.callbackId,
                  count: invocation.count,
                })
              )
            ),
          }),
        }
      : {}),
  });
}

function createExecutionRun(
  controller: SesWorkerMechanicExecutionRealmController,
  realmId: StableId,
  execution: MechanicExecutionRealmExecutionInput,
  pendingCancellations: Set<(error: Error) => void>,
  revokeCapabilities: () => void,
  finishExecution: () => void,
  invalidateRealm: () => void
): MechanicExecutionRealmRun {
  let settled = false;
  let terminationRequested = false;
  let resolveResult: (result: MechanicExecutionRealmExecutionResult) => void;
  let rejectResult: (error: Error) => void;
  let deadlineId: ReturnType<typeof setTimeout> | undefined;
  let terminationDeadlineId: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (deadlineId !== undefined) {
      clearTimeout(deadlineId);
    }
    if (terminationDeadlineId !== undefined) {
      clearTimeout(terminationDeadlineId);
    }
    controller.removeEventListener("message", onMessage);
    pendingCancellations.delete(cancel);
    finishExecution();
  };
  const settle = (result: MechanicExecutionRealmExecutionResult) => {
    if (settled) {
      return;
    }
    settled = true;
    cleanup();
    resolveResult(result);
  };
  const cancel = (error: Error) => {
    if (settled) {
      return;
    }
    settled = true;
    cleanup();
    rejectResult(error);
  };
  const onMessage = (event: MessageEvent<unknown>) => {
    const expectedAction = terminationRequested ? "terminate" : "execute";
    if (
      !event.isTrusted ||
      event.currentTarget !== (controller as unknown as EventTarget) ||
      !isExecutionResponse(
        event.data,
        realmId,
        execution.id,
        expectedAction
      )
    ) {
      return;
    }
    settle(event.data.result);
  };
  const requestTermination = () => {
    if (settled || terminationRequested) {
      return;
    }
    terminationRequested = true;
    revokeCapabilities();
    if (deadlineId !== undefined) {
      clearTimeout(deadlineId);
    }
    try {
      controller.postMessage({
        kind: "sparkline_mechanic_realm_execute",
        protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
        realmId,
        executionId: execution.id,
        action: "terminate",
        execution,
      });
      terminationDeadlineId = setTimeout(() => {
        cancel(
          new Error("SES Worker realm termination exceeded its deadline.")
        );
        invalidateRealm();
      }, MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumTerminationMilliseconds);
    } catch (error) {
      cancel(toError(error, "SES Worker realm termination send failed."));
      invalidateRealm();
    }
  };

  const result = new Promise<MechanicExecutionRealmExecutionResult>(
    (resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
      controller.addEventListener("message", onMessage);
      pendingCancellations.add(cancel);
      try {
        controller.postMessage({
          kind: "sparkline_mechanic_realm_execute",
          protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
          realmId,
          executionId: execution.id,
          action: "execute",
          execution,
        });
        deadlineId = setTimeout(
          requestTermination,
          MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumExecutionMilliseconds
        );
      } catch (error) {
        cancel(toError(error, "SES Worker realm execution send failed."));
        invalidateRealm();
      }
    }
  );

  return Object.freeze({
    result,
    async terminate() {
      requestTermination();
      return result;
    },
  });
}

async function answerCapabilityRequest(
  request: SesWorkerRealmCapabilityRequest,
  port: MessagePort,
  input: CreateMechanicExecutionRealmInput,
  grantedCapabilities: ReadonlySet<StableId>,
  handlesByToken: Map<StableId, MechanicObjectHandle>,
  tokensByHandle: WeakMap<object, StableId>,
  requestIsFresh: boolean,
  isExecutionActive: () => boolean
): Promise<void> {
  let response: SesWorkerRealmCapabilityResponse;

  try {
    if (!requestIsFresh) {
      throw new Error("Mechanic capability request was replayed.");
    }
    if (!isExecutionActive()) {
      throw new Error(
        "Mechanic capability request is not bound to the active execution."
      );
    }
    if (!grantedCapabilities.has(request.capabilityId)) {
      throw new Error(
        `Mechanic capability "${request.capabilityId}" was not granted.`
      );
    }
    const capabilityResult = await input.capabilityHost.invoke({
      capabilityId: request.capabilityId,
      arguments: request.arguments.map((argument) =>
        decodeCapabilityArgument(argument, handlesByToken)
      ),
    });
    if (!isExecutionActive()) {
      throw new Error(
        "Mechanic capability execution ended before the host call settled."
      );
    }
    const value = encodeCapabilityResult(
      capabilityResult,
      handlesByToken,
      tokensByHandle
    );
    response = {
      kind: "sparkline_mechanic_realm_capability_response",
      protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
      realmId: request.realmId,
      executionId: request.executionId,
      callId: request.callId,
      success: true,
      value,
    };
  } catch (error) {
    const resourceUsage =
      error instanceof MechanicExecutionRealmResourceLimitError
        ? {
            dimension: error.dimension,
            limit: error.limit,
            observed: error.observed,
          }
        : undefined;
    response = {
      kind: "sparkline_mechanic_realm_capability_response",
      protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
      realmId: request.realmId,
      executionId: request.executionId,
      callId: request.callId,
      success: false,
      error: {
        code: resourceUsage
          ? "resource_budget_exceeded"
          : "capability_invocation_failed",
        message:
          error instanceof Error
            ? error.message
            : "Mechanic capability invocation failed.",
        ...(resourceUsage ? { resourceUsage } : {}),
      },
    };
  }

  try {
    port.postMessage(response);
  } catch {
    // Realm disposal may close the private port while a host call is settling.
  }
}

function decodeCapabilityArgument(
  value: SesWorkerRealmEncodedValue,
  handlesByToken: ReadonlyMap<StableId, MechanicObjectHandle>
): MechanicExecutionRealmCapabilityArgument {
  if (isRecord(value) && value.kind === "json") {
    const parsed = jsonValueSchema.safeParse(value.value);
    if (!parsed.success) {
      throw new TypeError("Mechanic capability argument is not valid JSON.");
    }
    return parsed.data;
  }
  if (
    isRecord(value) &&
    value.kind === "opaque_handle" &&
    typeof value.token === "string"
  ) {
    const handle = handlesByToken.get(value.token);
    if (!handle) {
      throw new Error("Mechanic object handle token is unknown or stale.");
    }
    return handle;
  }
  if (
    isRecord(value) &&
    value.kind === "opaque_handles"
  ) {
    throw new TypeError(
      "Opaque handle collections are results, not capability arguments."
    );
  }
  throw new TypeError("Mechanic capability argument encoding is malformed.");
}

function encodeCapabilityResult(
  result: unknown,
  handlesByToken: Map<StableId, MechanicObjectHandle>,
  tokensByHandle: WeakMap<object, StableId>
): SesWorkerRealmEncodedValue {
  if (!isRecord(result)) {
    throw new TypeError("Mechanic capability result encoding is malformed.");
  }
  if (result.kind === "json") {
    const parsed = jsonValueSchema.safeParse(result.value);
    if (!parsed.success) {
      throw new TypeError("Mechanic capability result is not valid JSON.");
    }
    return { kind: "json", value: parsed.data };
  }
  if (result.kind === "opaque_handle") {
    if (typeof result.value !== "object" || result.value === null) {
      throw new TypeError("Mechanic capability handle result is malformed.");
    }
    return {
      kind: "opaque_handle",
      token: getOrCreateHandleToken(
        result.value as MechanicObjectHandle,
        handlesByToken,
        tokensByHandle,
        "created"
      ),
    };
  }
  if (
    result.kind === "opaque_handles" &&
    Array.isArray(result.value) &&
    result.value.every(
      (handle) => typeof handle === "object" && handle !== null
    )
  ) {
    return {
      kind: "opaque_handles",
      tokens: result.value.map((handle) =>
        getOrCreateHandleToken(
          handle as MechanicObjectHandle,
          handlesByToken,
          tokensByHandle,
          "collection"
        )
      ),
    };
  }
  throw new TypeError("Mechanic capability result encoding is malformed.");
}

function consumeCapabilityCallId(
  consumed: Map<StableId, Set<StableId>>,
  executionId: StableId,
  callId: StableId
): boolean {
  const callIds = consumed.get(executionId) ?? new Set<StableId>();
  if (callIds.has(callId)) {
    return false;
  }
  callIds.add(callId);
  consumed.set(executionId, callIds);
  return true;
}

function getOrCreateHandleToken(
  handle: MechanicObjectHandle,
  handlesByToken: Map<StableId, MechanicObjectHandle>,
  tokensByHandle: WeakMap<object, StableId>,
  scope: StableId
): StableId {
  const existing = tokensByHandle.get(handle);
  if (existing) {
    return existing;
  }
  const token = createPrivateId(`handle_${scope}`);
  tokensByHandle.set(handle, token);
  handlesByToken.set(token, handle);
  return token;
}

function waitForControllerReady(
  controller: SesWorkerMechanicExecutionRealmController
): Promise<void> {
  return waitForControllerMessage(
    controller,
    (value) =>
      isRecord(value) &&
      value.kind === "sparkline_mechanic_realm_controller_ready",
    10_000,
    "SES Worker controller ready timeout.",
    () =>
      controller.postMessage({
        kind: "sparkline_mechanic_realm_controller_ready_probe",
        protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
      })
  );
}

function waitForControllerMessage(
  controller: SesWorkerMechanicExecutionRealmController,
  matches: (value: unknown) => boolean,
  deadlineMilliseconds: number,
  timeoutMessage: string,
  send: () => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeoutId);
      controller.removeEventListener("message", onMessage);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        event.isTrusted &&
        event.currentTarget === (controller as unknown as EventTarget) &&
        matches(event.data)
      ) {
        cleanup();
        resolve();
      }
    };
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(timeoutMessage));
    }, deadlineMilliseconds);
    controller.addEventListener("message", onMessage);
    try {
      send();
    } catch (error) {
      cleanup();
      reject(toError(error, "SES Worker controller send failed."));
    }
  });
}

function isCapabilityRequest(
  value: unknown,
  realmId: StableId
): value is SesWorkerRealmCapabilityRequest {
  return (
    isRecord(value) &&
    value.kind === "sparkline_mechanic_realm_capability_request" &&
    value.protocolVersion ===
      SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION &&
    value.realmId === realmId &&
    typeof value.executionId === "string" &&
    typeof value.callId === "string" &&
    typeof value.capabilityId === "string" &&
    Array.isArray(value.arguments)
  );
}

function isExecutionResponse(
  value: unknown,
  realmId: StableId,
  executionId: StableId,
  expectedAction: "execute" | "terminate"
): value is SesWorkerRealmExecutionResponse {
  if (
    !isRecord(value) ||
    value.kind !== "sparkline_mechanic_realm_execution_response" ||
    value.protocolVersion !==
      SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION ||
    value.realmId !== realmId ||
    value.executionId !== executionId ||
    value.action !== expectedAction ||
    !isRecord(value.result) ||
    value.result.executionId !== executionId
  ) {
    return false;
  }
  const expectedOutcomes =
    expectedAction === "terminate"
      ? ["terminated"]
      : ["completed", "resource_limit", "failed"];
  if (!expectedOutcomes.includes(String(value.result.outcome))) {
    return false;
  }
  if (
    value.result.durationMilliseconds !== undefined &&
    (typeof value.result.durationMilliseconds !== "number" ||
      !Number.isFinite(value.result.durationMilliseconds) ||
      value.result.durationMilliseconds < 0)
  ) {
    return false;
  }
  if (
    value.result.output !== undefined &&
    (value.result.outcome !== "completed" ||
      !jsonValueSchema.safeParse(value.result.output).success)
  ) {
    return false;
  }
  if (
    value.result.outcome === "resource_limit"
      ? !isMechanicExecutionRealmResourceUsage(value.result.resourceUsage)
      : value.result.resourceUsage !== undefined
  ) {
    return false;
  }
  return (
    value.result.diagnostic === undefined ||
    isExecutionDiagnostic(value.result.diagnostic)
  );
}

function isExecutionDiagnostic(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !["realm_start", "realm_execution", "realm_termination", "cleanup"].includes(
      String(value.stage)
    ) ||
    typeof value.code !== "string" ||
    !STABLE_ID_PATTERN.test(value.code) ||
    typeof value.message !== "string"
  ) {
    return false;
  }
  if (value.repair === undefined) {
    return true;
  }
  return (
    isRecord(value.repair) &&
    value.repair.artifact === "realm_candidate" &&
    typeof value.repair.issuePath === "string" &&
    typeof value.repair.suggestedAction === "string"
  );
}

function createPrivateId(scope: string): StableId {
  const cryptography = globalThis.crypto;
  if (!cryptography) {
    throw new Error("Secure browser cryptography is unavailable.");
  }
  if (typeof cryptography.randomUUID === "function") {
    return `${scope}_${cryptography.randomUUID().replaceAll("-", "")}`;
  }
  const bytes = cryptography.getRandomValues(new Uint8Array(16));
  return `${scope}_${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

function toError(value: unknown, fallbackMessage: string): Error {
  return value instanceof Error ? value : new Error(fallbackMessage);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}
