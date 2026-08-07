import {
  MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
  type MechanicExecutionRealmBrowserCandidateInitialization,
  type MechanicExecutionRealmBrowserCandidateRequest,
  type MechanicExecutionRealmBrowserCandidateResponse,
} from "@/game-spec/mechanics/mechanic-execution-realm-conformance-session";
import type {
  MechanicExecutionRealmConformanceProbe,
  MechanicExecutionRealmProbeDiagnostic,
  MechanicExecutionRealmProbeResult,
} from "@/game-spec/mechanics/mechanic-execution-realm-conformance";
import type {
  MechanicExecutionRealmDiagnostic,
  MechanicExecutionRealmExecutionResult,
} from "@/runtime/mechanics/mechanic-execution-realm";
import {
  SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
  type SesWorkerRealmBindingDescriptor,
  type SesWorkerRealmCapabilityRequest,
  type SesWorkerRealmCapabilityResponse,
  type SesWorkerRealmEncodedValue,
  type SesWorkerRealmExecute,
  type SesWorkerRealmExecutionResponse,
  type SesWorkerRealmInitialize,
} from "@/runtime/mechanics/ses-worker-mechanic-execution-realm-protocol";

type WorkerScope = {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void;
  postMessage(message: unknown): void;
};

type ExecutorSlot = {
  worker: Worker;
};

type CandidateIdentity = {
  sessionId: string;
  candidateEndpointId: string;
};

type RuntimeState = {
  realmId: string;
  mechanicId: string;
  capabilityGrant: SesWorkerRealmInitialize["capabilityGrant"];
  bindings: readonly SesWorkerRealmBindingDescriptor[];
  seed: number;
  resourceBudget: SesWorkerRealmInitialize["resourceBudget"];
  capabilityPort: MessagePort;
  onCapabilityMessage: (event: MessageEvent<unknown>) => void;
};

type SharedActiveJob = {
  slot: ExecutorSlot;
  jobId: string;
  startedAt: number;
  callbackTimer?: ReturnType<typeof setTimeout>;
  onMessage?: EventListener;
  pendingCapabilityCalls: Set<string>;
};

type ConformanceActiveJob = SharedActiveJob & {
  mode: "conformance";
  request: MechanicExecutionRealmBrowserCandidateRequest;
};

type RuntimeActiveJob = SharedActiveJob & {
  mode: "runtime";
  request: SesWorkerRealmExecute;
};

type ActiveJob = ConformanceActiveJob | RuntimeActiveJob;

type ExecutorMessage =
  | {
      kind: "ses_shared_kernel_entered";
      jobId: string;
      mode: "conformance" | "runtime";
    }
  | {
      kind: "ses_callback_started";
      jobId: string;
    }
  | {
      kind: "ses_runtime_callback_finished";
      jobId: string;
    }
  | {
      kind: "ses_executor_result";
      jobId: string;
      result: MechanicExecutionRealmProbeResult;
    }
  | {
      kind: "ses_runtime_executor_result";
      jobId: string;
      executionId: string;
      result: MechanicExecutionRealmExecutionResult;
    }
  | {
      kind: "ses_runtime_capability_request";
      jobId: string;
      executionId: string;
      callId: string;
      capabilityId: string;
      arguments: readonly SesWorkerRealmEncodedValue[];
    };

type RuntimeExecutorCapabilityResponse = {
  kind: "ses_runtime_capability_response";
  jobId: string;
  executionId: string;
  response: SesWorkerRealmCapabilityResponse;
};

const workerScope = globalThis as unknown as WorkerScope;
const noResources = Object.freeze({
  ownedObjects: 0,
  scheduledCallbacks: 0,
  subscriptions: 0,
  signals: 0,
  privateStateBytes: 0,
  pendingTasks: 0,
});

let mode: "conformance" | "runtime" | "disposed" | undefined;
let candidateIdentity: CandidateIdentity | undefined;
let runtimeState: RuntimeState | undefined;
let idleSlots: ExecutorSlot[] = [];
let activeJob: ActiveJob | undefined;
let replacementsInFlight = 0;
const pendingExecutorWorkers = new Set<Worker>();

const initialPoolReady = createInitialExecutorPool().then((slots) => {
  if (mode === "disposed") {
    for (const slot of slots) {
      slot.worker.terminate();
    }
    return;
  }
  idleSlots.push(...slots);
  workerScope.postMessage({ kind: "ses_controller_ready" });
  postRuntimeReady();
});

workerScope.addEventListener("message", (event) => {
  if (!event.isTrusted) {
    return;
  }
  const request = event.data;

  if (isRuntimeReadyProbe(request)) {
    void initialPoolReady.then(() => {
      if (mode !== "disposed") {
        postRuntimeReady();
      }
    });
    return;
  }

  if (isCandidateInitialization(request)) {
    initializeConformance(request);
    return;
  }

  if (isRuntimeInitialization(request)) {
    initializeRuntime(request);
    return;
  }

  if (isRuntimeDispose(request)) {
    if (mode === "runtime" && runtimeState?.realmId === request.realmId) {
      disposeController();
    }
    return;
  }

  if (mode === "conformance" && isCandidateRequest(request)) {
    if (request.action === "execute") {
      void executeConformance(request);
    } else {
      void terminateConformance(request);
    }
    return;
  }

  if (
    mode === "runtime" &&
    runtimeState &&
    isRuntimeExecute(request, runtimeState.realmId)
  ) {
    if (request.action === "execute") {
      void executeRuntime(request, runtimeState);
    } else {
      void terminateRuntime(request);
    }
  }
});

function initializeConformance(
  initialization: MechanicExecutionRealmBrowserCandidateInitialization
): void {
  if (mode !== undefined) {
    return;
  }
  mode = "conformance";
  candidateIdentity = {
    sessionId: initialization.sessionId,
    candidateEndpointId: initialization.candidateEndpointId,
  };
}

function initializeRuntime(initialization: SesWorkerRealmInitialize): void {
  if (mode !== undefined) {
    initialization.capabilityPort.close();
    return;
  }

  const capabilityPort = initialization.capabilityPort;
  const state: RuntimeState = {
    realmId: initialization.realmId,
    mechanicId: initialization.mechanicId,
    capabilityGrant: initialization.capabilityGrant,
    bindings: initialization.bindings,
    seed: initialization.seed,
    resourceBudget: initialization.resourceBudget,
    capabilityPort,
    onCapabilityMessage: () => undefined,
  };
  state.onCapabilityMessage = (event) => {
    if (!event.isTrusted || event.currentTarget !== capabilityPort) {
      return;
    }
    forwardRuntimeCapabilityResponse(event.data, state);
  };
  mode = "runtime";
  runtimeState = state;
  capabilityPort.addEventListener("message", state.onCapabilityMessage);
  capabilityPort.start();

  void initialPoolReady.then(() => {
    if (mode !== "runtime" || runtimeState !== state) {
      return;
    }
    workerScope.postMessage({
      kind: "sparkline_mechanic_realm_initialized",
      protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
      realmId: state.realmId,
    });
  });
}

async function executeConformance(
  request: MechanicExecutionRealmBrowserCandidateRequest
): Promise<void> {
  const identity = candidateIdentity;
  if (!identity || activeJob) {
    return;
  }

  const slot = await acquireExecutorSlot();
  if (mode !== "conformance" || activeJob) {
    releaseUnusedSlot(slot);
    return;
  }
  const job: ConformanceActiveJob = {
    mode: "conformance",
    request,
    slot,
    jobId: crypto.randomUUID(),
    startedAt: performance.now(),
    pendingCapabilityCalls: new Set(),
  };
  activeJob = job;
  listenForExecutorMessages(job);

  try {
    slot.worker.postMessage({
      kind: "ses_execute_probe",
      jobId: job.jobId,
      probe: request.probe,
    });
  } catch (error) {
    finishActiveJob(job, true);
    sendConformanceResponse(request, failedConformanceResult(request, error));
    return;
  }

  workerScope.postMessage({
    kind: "sparkline_mechanic_conformance_candidate_execution_acknowledgement",
    protocolVersion: MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
    sessionId: identity.sessionId,
    candidateEndpointId: identity.candidateEndpointId,
    probeId: request.probeId,
    nonce: request.nonce,
    action: "execute",
  });
  workerScope.postMessage({
    kind: "ses_probe_audit",
    audit: {
      action: "execute_dispatched",
      probeId: request.probeId,
      jobId: job.jobId,
    },
  });
}

async function terminateConformance(
  request: MechanicExecutionRealmBrowserCandidateRequest
): Promise<void> {
  const job = activeJob;
  if (
    job?.mode === "conformance" &&
    job.request.probeId === request.probeId
  ) {
    finishActiveJob(job, true);
  }
  await ensureWarmExecutor();
  sendConformanceResponse(request, {
    probeId: request.probeId,
    outcome: "terminated",
    durationMilliseconds: job ? performance.now() - job.startedAt : 0,
    evidence: { resourcesAfterCleanup: noResources },
    diagnostic: conformanceDiagnostic(
      request.probe,
      "realm_termination",
      "execution_deadline_exceeded"
    ),
  });
}

async function executeRuntime(
  request: SesWorkerRealmExecute,
  state: RuntimeState
): Promise<void> {
  if (activeJob) {
    sendRuntimeResponse(request, failedRuntimeResult(request, new Error(
      "SES controller received overlapping executions."
    )));
    return;
  }

  const slot = await acquireExecutorSlot();
  if (mode !== "runtime" || runtimeState !== state || activeJob) {
    releaseUnusedSlot(slot);
    return;
  }
  const job: RuntimeActiveJob = {
    mode: "runtime",
    request,
    slot,
    jobId: crypto.randomUUID(),
    startedAt: performance.now(),
    pendingCapabilityCalls: new Set(),
  };
  activeJob = job;
  listenForExecutorMessages(job);

  try {
    slot.worker.postMessage({
      kind: "ses_execute_runtime",
      jobId: job.jobId,
      realmId: state.realmId,
      executionId: request.executionId,
      execution: request.execution,
      capabilityGrant: state.capabilityGrant,
      bindings: state.bindings,
      seed: state.seed,
      resourceBudget: state.resourceBudget,
    });
  } catch (error) {
    finishActiveJob(job, true);
    sendRuntimeResponse(request, failedRuntimeResult(request, error));
  }
}

async function terminateRuntime(request: SesWorkerRealmExecute): Promise<void> {
  const job = activeJob;
  const matchingJob =
    job?.mode === "runtime" &&
    job.request.executionId === request.executionId
      ? job
      : undefined;
  if (matchingJob) {
    finishActiveJob(matchingJob, true);
  }
  await ensureWarmExecutor();
  sendRuntimeResponse(request, {
    executionId: request.executionId,
    outcome: "terminated",
    durationMilliseconds: matchingJob
      ? performance.now() - matchingJob.startedAt
      : 0,
    diagnostic: runtimeDiagnostic(
      request.executionId,
      "realm_termination",
      "execution_deadline_exceeded"
    ),
  });
}

function listenForExecutorMessages(job: ActiveJob): void {
  const onMessage = (event: MessageEvent<ExecutorMessage>) => {
    if (
      !event.isTrusted ||
      event.currentTarget !== job.slot.worker ||
      activeJob !== job ||
      !isExecutorMessage(event.data, job.jobId)
    ) {
      return;
    }
    const message = event.data;
    if (message.kind === "ses_shared_kernel_entered") {
      if (message.mode !== job.mode) {
        return;
      }
      workerScope.postMessage({
        kind: "ses_probe_audit",
        audit: {
          action: "shared_kernel_entered",
          mode: message.mode,
          jobId: job.jobId,
          executionId:
            job.mode === "runtime" ? job.request.executionId : undefined,
          probeId:
            job.mode === "conformance" ? job.request.probeId : undefined,
        },
      });
      return;
    }
    if (message.kind === "ses_callback_started") {
      startCallbackDeadline(job);
      return;
    }
    if (message.kind === "ses_runtime_callback_finished") {
      if (job.callbackTimer !== undefined) {
        clearTimeout(job.callbackTimer);
        job.callbackTimer = undefined;
      }
      return;
    }
    if (message.kind === "ses_runtime_capability_request") {
      if (job.mode === "runtime") {
        forwardRuntimeCapabilityRequest(job, message);
      }
      return;
    }
    if (message.kind === "ses_executor_result") {
      if (job.mode !== "conformance") {
        return;
      }
      finishActiveJob(job, false);
      sendConformanceResponse(job.request, message.result);
      return;
    }
    if (
      job.mode === "runtime" &&
      message.executionId === job.request.executionId &&
      message.result.executionId === job.request.executionId
    ) {
      finishActiveJob(job, false);
      sendRuntimeResponse(job.request, message.result);
    }
  };
  job.onMessage = onMessage as EventListener;
  job.slot.worker.addEventListener("message", onMessage);
}

function startCallbackDeadline(job: ActiveJob): void {
  if (job.callbackTimer !== undefined) {
    clearTimeout(job.callbackTimer);
  }
  if (job.mode === "conformance") {
    const target = job.request.probe.resourceTarget;
    if (target?.dimension !== "callback_milliseconds") {
      return;
    }
    const callbackTarget = {
      dimension: "callback_milliseconds" as const,
      limit: target.limit,
    };
    job.callbackTimer = setTimeout(
      () => containSlowConformanceCallback(job, callbackTarget),
      target.limit + 1
    );
    return;
  }

  const limit = runtimeState?.resourceBudget.maximumCallbackMilliseconds;
  if (limit === undefined) {
    return;
  }
  job.callbackTimer = setTimeout(
    () => containSlowRuntimeCallback(job, limit),
    limit + 1
  );
}

function containSlowConformanceCallback(
  job: ConformanceActiveJob,
  target: { dimension: "callback_milliseconds"; limit: number }
): void {
  if (activeJob !== job) {
    return;
  }
  finishActiveJob(job, true);
  sendConformanceResponse(job.request, {
    probeId: job.request.probeId,
    outcome: "resource_limit",
    durationMilliseconds: performance.now() - job.startedAt,
    evidence: {
      resourcesAfterCleanup: noResources,
      resourceUsage: {
        dimension: target.dimension,
        limit: target.limit,
        observed: target.limit + 1,
      },
    },
    diagnostic: conformanceDiagnostic(
      job.request.probe,
      "realm_execution",
      "resource_budget_exceeded"
    ),
  });
}

function containSlowRuntimeCallback(
  job: RuntimeActiveJob,
  limit: number
): void {
  if (activeJob !== job) {
    return;
  }
  finishActiveJob(job, true);
  sendRuntimeResponse(job.request, {
    executionId: job.request.executionId,
    outcome: "resource_limit",
    durationMilliseconds: performance.now() - job.startedAt,
    diagnostic: runtimeDiagnostic(
      job.request.executionId,
      "realm_execution",
      "resource_budget_exceeded",
      `Resource callback_milliseconds exceeded ${limit} with ${limit + 1}.`
    ),
  });
}

function forwardRuntimeCapabilityRequest(
  job: RuntimeActiveJob,
  message: Extract<ExecutorMessage, { kind: "ses_runtime_capability_request" }>
): void {
  const state = runtimeState;
  if (
    !state ||
    message.executionId !== job.request.executionId ||
    job.pendingCapabilityCalls.has(message.callId)
  ) {
    return;
  }
  const granted = state.capabilityGrant.capabilities.some(
    (capability) => capability.id === message.capabilityId
  );
  if (!granted) {
    sendCapabilityErrorToExecutor(
      job,
      message.callId,
      message.capabilityId,
      "capability_not_granted"
    );
    return;
  }

  const request: SesWorkerRealmCapabilityRequest = {
    kind: "sparkline_mechanic_realm_capability_request",
    protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
    realmId: state.realmId,
    executionId: job.request.executionId,
    callId: message.callId,
    capabilityId: message.capabilityId,
    arguments: message.arguments,
  };
  job.pendingCapabilityCalls.add(message.callId);
  try {
    state.capabilityPort.postMessage(request);
  } catch {
    job.pendingCapabilityCalls.delete(message.callId);
    sendCapabilityErrorToExecutor(
      job,
      message.callId,
      message.capabilityId,
      "capability_port_send_failed"
    );
  }
}

function forwardRuntimeCapabilityResponse(
  value: unknown,
  state: RuntimeState
): void {
  const job = activeJob;
  if (
    job?.mode !== "runtime" ||
    runtimeState !== state ||
    !isRuntimeCapabilityResponse(
      value,
      state.realmId,
      job.request.executionId
    ) ||
    !job.pendingCapabilityCalls.delete(value.callId)
  ) {
    return;
  }
  const message: RuntimeExecutorCapabilityResponse = {
    kind: "ses_runtime_capability_response",
    jobId: job.jobId,
    executionId: job.request.executionId,
    response: value,
  };
  try {
    job.slot.worker.postMessage(message);
  } catch (error) {
    finishActiveJob(job, true);
    sendRuntimeResponse(job.request, failedRuntimeResult(job.request, error));
  }
}

function sendCapabilityErrorToExecutor(
  job: RuntimeActiveJob,
  callId: string,
  capabilityId: string,
  code: string
): void {
  const state = runtimeState;
  if (!state || activeJob !== job) {
    return;
  }
  const response: SesWorkerRealmCapabilityResponse = {
    kind: "sparkline_mechanic_realm_capability_response",
    protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
    realmId: state.realmId,
    executionId: job.request.executionId,
    callId,
    success: false,
    error: {
      code,
      message: `Capability ${capabilityId} could not be invoked.`,
    },
  };
  const message: RuntimeExecutorCapabilityResponse = {
    kind: "ses_runtime_capability_response",
    jobId: job.jobId,
    executionId: job.request.executionId,
    response,
  };
  job.slot.worker.postMessage(message);
}

function finishActiveJob(job: ActiveJob, kill: boolean): void {
  if (activeJob !== job) {
    return;
  }
  activeJob = undefined;
  if (job.callbackTimer !== undefined) {
    clearTimeout(job.callbackTimer);
  }
  if (job.onMessage) {
    job.slot.worker.removeEventListener("message", job.onMessage);
  }
  job.pendingCapabilityCalls.clear();
  if (kill) {
    job.slot.worker.terminate();
    replenishExecutorPool();
  } else if (mode !== "disposed") {
    idleSlots.push(job.slot);
  } else {
    job.slot.worker.terminate();
  }
}

function replenishExecutorPool(): void {
  while (
    mode !== "disposed" &&
    idleSlots.length + replacementsInFlight < 2
  ) {
    replacementsInFlight += 1;
    void createExecutorSlot().then(
      (slot) => {
        replacementsInFlight = Math.max(0, replacementsInFlight - 1);
        if (mode === "disposed") {
          slot.worker.terminate();
        } else {
          idleSlots.push(slot);
        }
      },
      () => {
        replacementsInFlight = Math.max(0, replacementsInFlight - 1);
      }
    );
  }
}

async function acquireExecutorSlot(): Promise<ExecutorSlot> {
  await initialPoolReady;
  return idleSlots.shift() ?? createExecutorSlot();
}

async function ensureWarmExecutor(): Promise<void> {
  if (mode === "disposed" || idleSlots.length > 0) {
    return;
  }
  const slot = await createExecutorSlot();
  if (isControllerDisposed()) {
    slot.worker.terminate();
  } else {
    idleSlots.push(slot);
  }
}

function releaseUnusedSlot(slot: ExecutorSlot): void {
  if (mode === "disposed") {
    slot.worker.terminate();
  } else {
    idleSlots.push(slot);
  }
}

function disposeController(): void {
  if (mode === "disposed") {
    return;
  }
  const state = runtimeState;
  mode = "disposed";
  runtimeState = undefined;
  if (activeJob) {
    const job = activeJob;
    activeJob = undefined;
    if (job.callbackTimer !== undefined) {
      clearTimeout(job.callbackTimer);
    }
    if (job.onMessage) {
      job.slot.worker.removeEventListener("message", job.onMessage);
    }
    job.pendingCapabilityCalls.clear();
    job.slot.worker.terminate();
  }
  for (const slot of idleSlots) {
    slot.worker.terminate();
  }
  idleSlots = [];
  for (const worker of pendingExecutorWorkers) {
    worker.terminate();
  }
  pendingExecutorWorkers.clear();
  replacementsInFlight = 0;
  if (state) {
    state.capabilityPort.removeEventListener(
      "message",
      state.onCapabilityMessage
    );
    state.capabilityPort.close();
    workerScope.postMessage({
      kind: "sparkline_mechanic_realm_disposed",
      protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
      realmId: state.realmId,
    });
  }
}

function sendConformanceResponse(
  request: MechanicExecutionRealmBrowserCandidateRequest,
  result: MechanicExecutionRealmProbeResult
): void {
  const response: MechanicExecutionRealmBrowserCandidateResponse = {
    kind: "sparkline_mechanic_conformance_candidate_response",
    protocolVersion: MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
    sessionId: candidateIdentity?.sessionId ?? "disposed_session",
    candidateEndpointId:
      candidateIdentity?.candidateEndpointId ?? "disposed_candidate_endpoint",
    probeId: request.probeId,
    nonce: request.nonce,
    action: request.action,
    result,
  };
  workerScope.postMessage(response);
}

function sendRuntimeResponse(
  request: SesWorkerRealmExecute,
  result: MechanicExecutionRealmExecutionResult
): void {
  const state = runtimeState;
  if (!state) {
    return;
  }
  const response: SesWorkerRealmExecutionResponse = {
    kind: "sparkline_mechanic_realm_execution_response",
    protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
    realmId: state.realmId,
    executionId: request.executionId,
    action: request.action,
    result,
  };
  workerScope.postMessage(response);
}

function failedConformanceResult(
  request: MechanicExecutionRealmBrowserCandidateRequest,
  error: unknown
): MechanicExecutionRealmProbeResult {
  return {
    probeId: request.probeId,
    outcome: "failed",
    durationMilliseconds: 0,
    evidence: { resourcesAfterCleanup: noResources },
    diagnostic: conformanceDiagnostic(
      request.probe,
      "realm_start",
      "candidate_dispatch_failed",
      error instanceof Error ? error.message : "Candidate dispatch failed."
    ),
  };
}

function failedRuntimeResult(
  request: SesWorkerRealmExecute,
  error: unknown
): MechanicExecutionRealmExecutionResult {
  return {
    executionId: request.executionId,
    outcome: "failed",
    diagnostic: runtimeDiagnostic(
      request.executionId,
      "realm_execution",
      "candidate_execution_failed",
      error instanceof Error ? error.message : "Candidate execution failed."
    ),
  };
}

function conformanceDiagnostic(
  probe: MechanicExecutionRealmConformanceProbe,
  stage: MechanicExecutionRealmProbeDiagnostic["stage"],
  code: string,
  message?: string
): MechanicExecutionRealmProbeDiagnostic {
  return {
    stage,
    code,
    message: message ?? `SES Worker contained ${probe.id}.`,
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
  message?: string
): MechanicExecutionRealmDiagnostic {
  return {
    stage,
    code,
    message: message ?? `SES Worker contained ${executionId}.`,
    repair: {
      artifact: "realm_candidate",
      issuePath: `execution.${executionId}`,
      suggestedAction:
        "Inspect the SES Worker execution boundary and retry the execution.",
    },
  };
}

async function createExecutorSlot(): Promise<ExecutorSlot> {
  const worker = new Worker(
    new URL(
      "./ses-worker-mechanic-execution-realm-executor.worker.ts",
      import.meta.url
    ),
    { type: "module" }
  );
  pendingExecutorWorkers.add(worker);
  try {
    await new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent<unknown>) => {
        if (
          event.isTrusted &&
          event.currentTarget === worker &&
          isRecord(event.data) &&
          event.data.kind === "ses_executor_ready"
        ) {
          workerScope.postMessage({
            kind: "ses_probe_audit",
            audit: {
              action: "executor_ambient_audit",
              ambientAudit: event.data.ambientAudit,
            },
          });
          cleanup();
          resolve();
        }
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(event.message));
      };
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
    });
  } catch (error) {
    pendingExecutorWorkers.delete(worker);
    worker.terminate();
    throw error;
  }
  pendingExecutorWorkers.delete(worker);
  return { worker };
}

async function createInitialExecutorPool(): Promise<ExecutorSlot[]> {
  const results = await Promise.allSettled([
    createExecutorSlot(),
    createExecutorSlot(),
  ]);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failure) {
    for (const result of results) {
      if (result.status === "fulfilled") {
        result.value.worker.terminate();
      }
    }
    throw failure.reason;
  }
  const slots: ExecutorSlot[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      slots.push(result.value);
    }
  }
  return slots;
}

function postRuntimeReady(): void {
  workerScope.postMessage({
    kind: "sparkline_mechanic_realm_controller_ready",
    protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
  });
}

function isCandidateInitialization(
  value: unknown
): value is MechanicExecutionRealmBrowserCandidateInitialization {
  return (
    isRecord(value) &&
    value.kind === "sparkline_mechanic_conformance_candidate_initialize" &&
    value.protocolVersion ===
      MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION &&
    typeof value.sessionId === "string" &&
    typeof value.candidateEndpointId === "string"
  );
}

function isCandidateRequest(
  value: unknown
): value is MechanicExecutionRealmBrowserCandidateRequest {
  return (
    isRecord(value) &&
    value.kind === "sparkline_mechanic_conformance_candidate_request" &&
    value.protocolVersion ===
      MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION &&
    typeof value.probeId === "string" &&
    typeof value.nonce === "string" &&
    (value.action === "execute" || value.action === "terminate") &&
    isRecord(value.probe)
  );
}

function isRuntimeReadyProbe(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.kind === "sparkline_mechanic_realm_controller_ready_probe" &&
    value.protocolVersion ===
      SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION
  );
}

function isRuntimeInitialization(
  value: unknown
): value is SesWorkerRealmInitialize {
  return (
    isRecord(value) &&
    value.kind === "sparkline_mechanic_realm_initialize" &&
    value.protocolVersion ===
      SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION &&
    typeof value.realmId === "string" &&
    typeof value.mechanicId === "string" &&
    isRecord(value.capabilityGrant) &&
    Array.isArray(value.capabilityGrant.capabilities) &&
    Array.isArray(value.bindings) &&
    typeof value.seed === "number" &&
    Number.isFinite(value.seed) &&
    isRecord(value.resourceBudget) &&
    isMessagePort(value.capabilityPort)
  );
}

function isRuntimeExecute(
  value: unknown,
  realmId: string
): value is SesWorkerRealmExecute {
  return (
    isRecord(value) &&
    value.kind === "sparkline_mechanic_realm_execute" &&
    value.protocolVersion ===
      SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION &&
    value.realmId === realmId &&
    typeof value.executionId === "string" &&
    (value.action === "execute" || value.action === "terminate") &&
    isRecord(value.execution) &&
    value.execution.id === value.executionId &&
    typeof value.execution.source === "string"
  );
}

function isRuntimeDispose(
  value: unknown
): value is { realmId: string } {
  return (
    isRecord(value) &&
    value.kind === "sparkline_mechanic_realm_dispose" &&
    value.protocolVersion ===
      SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION &&
    typeof value.realmId === "string"
  );
}

function isRuntimeCapabilityResponse(
  value: unknown,
  realmId: string,
  executionId: string
): value is SesWorkerRealmCapabilityResponse {
  return (
    isRecord(value) &&
    value.kind === "sparkline_mechanic_realm_capability_response" &&
    value.protocolVersion ===
      SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION &&
    value.realmId === realmId &&
    value.executionId === executionId &&
    typeof value.callId === "string" &&
    typeof value.success === "boolean" &&
    (value.success
      ? isEncodedValue(value.value)
      : isRecord(value.error) &&
        typeof value.error.code === "string" &&
        typeof value.error.message === "string")
  );
}

function isExecutorMessage(
  value: unknown,
  jobId: string
): value is ExecutorMessage {
  if (!isRecord(value) || value.jobId !== jobId) {
    return false;
  }
  if (value.kind === "ses_shared_kernel_entered") {
    return value.mode === "conformance" || value.mode === "runtime";
  }
  if (
    value.kind === "ses_callback_started" ||
    value.kind === "ses_runtime_callback_finished"
  ) {
    return true;
  }
  if (value.kind === "ses_executor_result") {
    return isRecord(value.result);
  }
  if (value.kind === "ses_runtime_executor_result") {
    return (
      typeof value.executionId === "string" && isRecord(value.result)
    );
  }
  return (
    value.kind === "ses_runtime_capability_request" &&
    typeof value.executionId === "string" &&
    typeof value.callId === "string" &&
    typeof value.capabilityId === "string" &&
    Array.isArray(value.arguments) &&
    value.arguments.every(isEncodedValue)
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

function isMessagePort(value: unknown): value is MessagePort {
  return (
    isRecord(value) &&
    typeof value.postMessage === "function" &&
    typeof value.addEventListener === "function" &&
    typeof value.removeEventListener === "function" &&
    typeof value.start === "function" &&
    typeof value.close === "function"
  );
}

function isControllerDisposed(): boolean {
  return mode === "disposed";
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}
