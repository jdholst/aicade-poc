import {
  createMechanicExecutionRealmBrowserConformanceSession,
  disposeMechanicExecutionRealmBrowserConformanceIframePreparation,
  MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
  prepareMechanicExecutionRealmBrowserConformanceIframe,
  type MechanicExecutionRealmConformanceSession,
} from "../../src/game-spec/mechanics/mechanic-execution-realm-conformance-session";
import {
  runMechanicExecutionRealmConformanceSuite,
  MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY,
  type MechanicExecutionRealmConformanceReport,
} from "../../src/game-spec/mechanics/mechanic-execution-realm-conformance";
import {
  mechanicCapabilityRegistry,
  type MechanicCapabilityGrant,
} from "../../src/game-spec/mechanics/mechanic-capability-registry";
import { createMechanicObjectHost } from "../../src/runtime/mechanics/mechanic-object-host";
import {
  createSesWorkerMechanicExecutionRealmAdapter,
  SES_WORKER_MECHANIC_EXECUTION_REALM_CANDIDATE_ID,
} from "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm";
import { SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION } from "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm-protocol";

type ProductionIntegrationEvidence = {
  actualHandleReachedHost: boolean;
  onlyOpaqueTokenCrossedWorker: boolean;
  grantedObjectReadCompleted: boolean;
  grantedObservationMatched: boolean;
  ungrantedStateReadFailed: boolean;
  fireAndForgetUngrantedFailed: boolean;
  ungrantedCapabilityDidNotReachHost: boolean;
  runawayAutoTerminated: boolean;
  mutableExecutionSnapshotEnforced: boolean;
  recoveryCompleted: boolean;
  deterministicReplayMatched: boolean;
  operationsBudgetEnforced: boolean;
  fireAndForgetOperationsBudgetEnforced: boolean;
  stateBudgetTotalsDistinctEntries: boolean;
  disposalRejectedLateExecute: boolean;
  capabilityHostCalls: number;
  productionSharedKernelExecutions: number;
  controllerDisposalAcknowledged: boolean;
};

type CandidateEvaluation = {
  error?: string;
  report?: MechanicExecutionRealmConformanceReport;
  controllerAudit?: unknown[];
  integration?: ProductionIntegrationEvidence;
};

declare global {
  interface Window {
    __mechanicRealmCandidateEvaluation?: CandidateEvaluation;
  }
}

void runMechanicExecutionRealmCandidateEvaluation().catch((error) => {
  window.__mechanicRealmCandidateEvaluation = {
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  };
});

async function runMechanicExecutionRealmCandidateEvaluation(): Promise<void> {
  const candidate = new URLSearchParams(location.search).get("candidate");
  if (candidate !== "ses_worker") {
    throw new TypeError(`Unknown Mechanic Execution Realm candidate "${candidate}".`);
  }

  const controller = new Worker(
    new URL(
      "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm-controller.worker.ts",
      import.meta.url
    ),
    { type: "module" }
  );
  const controllerAudit: unknown[] = [];
  let runtimeIframe: HTMLIFrameElement | undefined;
  let session: MechanicExecutionRealmConformanceSession | undefined;
  let report: MechanicExecutionRealmConformanceReport | undefined;

  try {
    await waitForWorkerReady(controller, controllerAudit);

    runtimeIframe = document.createElement("iframe");
    runtimeIframe.srcdoc = createRuntimeResponderSource();
    prepareMechanicExecutionRealmBrowserConformanceIframe(runtimeIframe);
    const runtimeReady = waitForRuntimeReady(runtimeIframe);
    document.body.append(runtimeIframe);
    await runtimeReady;
    runtimeIframe.contentWindow?.postMessage(
      {
        kind: "sparkline_mechanic_conformance_runtime_initialize",
        protocolVersion: "mechanic_execution_realm_browser_session/invalid",
        sessionId: "wrong_protocol_session",
        runtimeId: "wrong_protocol_runtime",
      },
      "*"
    );

    controller.addEventListener("message", (event) => {
      if (event.data?.kind === "ses_probe_audit") {
        controllerAudit.push(event.data.audit);
      }
    });

    session = createMechanicExecutionRealmBrowserConformanceSession({
      candidateId: SES_WORKER_MECHANIC_EXECUTION_REALM_CANDIDATE_ID,
      candidateEndpoint: { kind: "worker", worker: controller },
      runtimeIframe,
    });
    report = await runMechanicExecutionRealmConformanceSuite({ session });
  } finally {
    session?.dispose();
    controller.terminate();
    if (runtimeIframe) {
      disposeMechanicExecutionRealmBrowserConformanceIframePreparation(
        runtimeIframe
      );
      runtimeIframe.remove();
    }
  }

  if (!report) {
    throw new Error("SES conformance report was not produced.");
  }

  const integration = await runProductionAdapterIntegration();
  window.__mechanicRealmCandidateEvaluation = {
    report,
    controllerAudit,
    integration,
  };
}

async function runProductionAdapterIntegration(): Promise<ProductionIntegrationEvidence> {
  const capabilityGrant = createIntegrationGrant();
  const objectHost = createMechanicObjectHost({
    mechanicId: "browser_integration_mechanic",
    grant: capabilityGrant,
    bindings: [
      {
        id: "binding_actor",
        cardinality: "one",
        getObjectIds: () => ["browser_actor"],
      },
    ],
    ownedObjectArchetypes: [],
    adapter: {
      hasObject: (objectId) => objectId === "browser_actor",
      observeObject: (objectId) => {
        if (objectId !== "browser_actor") {
          throw new Error(`Unexpected object observation for "${objectId}".`);
        }
        return {
          active: true,
          kind: "browser_actor",
          position: { x: 11, y: 17 },
          properties: { team: "player" },
          velocity: { x: 2, y: 3 },
        };
      },
    },
  });
  const handle = objectHost.resolveOne("binding_actor");
  let capabilityHostCalls = 0;
  let actualHandleReachedHost = false;
  const transportAudit = {
    initializationObserved: false,
    rawHandleCrossedWorker: false,
    opaqueTokenCrossedWorker: false,
    sharedKernelExecutions: 0,
    disposedAcknowledged: false,
    realmId: undefined as string | undefined,
  };
  const adapter = createSesWorkerMechanicExecutionRealmAdapter({
    createController: () => createAuditedProductionController(handle, transportAudit),
  });
  const realm = await adapter.create({
    mechanicId: "browser_integration_mechanic",
    capabilityGrant,
    bindings: [{ id: "binding_actor", cardinality: "one", handles: [handle] }],
    capabilityHost: {
      invoke: ({ capabilityId, arguments: capabilityArguments }) => {
        capabilityHostCalls += 1;
        if (capabilityId === "state_write") {
          if (
            capabilityArguments.length !== 2 ||
            typeof capabilityArguments[0] !== "string" ||
            typeof capabilityArguments[1] !== "string"
          ) {
            throw new Error("State write arguments were malformed.");
          }
          return { kind: "json", value: null };
        }
        if (capabilityId !== "object_read") {
          throw new Error(`Unexpected capability invocation "${capabilityId}".`);
        }
        if (capabilityArguments.length !== 1 || capabilityArguments[0] !== handle) {
          throw new Error("Capability host did not receive the original opaque handle.");
        }
        actualHandleReachedHost = true;
        const observation = objectHost.read(handle);
        return {
          kind: "json",
          value: {
            active: observation.active,
            kind: observation.kind,
            position: {
              x: observation.position.x,
              y: observation.position.y,
            },
            properties: { team: observation.properties.team ?? null },
            velocity: {
              x: observation.velocity.x,
              y: observation.velocity.y,
            },
          },
        };
      },
    },
    seed: 42,
    resourceBudget: MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
  });

  try {
    const granted = await realm.execute({
      id: "browser_granted_object_read",
      source:
        'return await realm.callCapability("object_read", realm.binding("binding_actor"));',
    }).result;
    const hostCallsAfterGranted = capabilityHostCalls;
    const ungranted = await realm.execute({
      id: "browser_ungranted_state_read",
      source: 'return await realm.callCapability("state_read", "score");',
    }).result;
    const fireAndForgetUngranted = await realm.execute({
      id: "browser_fire_and_forget_ungranted",
      source:
        'void realm.callCapability("state_read", "score"); return true;',
    }).result;
    const ungrantedCapabilityDidNotReachHost =
      capabilityHostCalls === hostCallsAfterGranted;
    const mutableRunawayExecution = {
      id: "browser_runaway",
      source: "for (;;) {}",
    };
    const runawayResult = realm.execute(mutableRunawayExecution).result;
    mutableRunawayExecution.id = "browser_runaway_mutated";
    mutableRunawayExecution.source = "return true;";
    const runaway = await runawayResult;
    const recovery = await realm.execute({
      id: "browser_recovery",
      source: "return { recovered: true };",
    }).result;
    const deterministicFirst = await realm.execute({
      id: "browser_deterministic_first",
      source:
        'return [await realm.callCapability("random_next"), await realm.callCapability("random_next")];',
    }).result;
    const deterministicSecond = await realm.execute({
      id: "browser_deterministic_second",
      source:
        'return [await realm.callCapability("random_next"), await realm.callCapability("random_next")];',
    }).result;
    const operationsLimit = await realm.execute({
      id: "browser_operations_limit",
      source:
        'for (let count = 0; count < 17; count += 1) await realm.callCapability("random_next");',
    }).result;
    const fireAndForgetOperationsLimit = await realm.execute({
      id: "browser_fire_and_forget_operations_limit",
      source:
        'for (let count = 0; count < 17; count += 1) void realm.callCapability("random_next"); return true;',
    }).result;
    const stateBudget = await realm.execute({
      id: "browser_distinct_state_budget",
      source:
        'await realm.callCapability("state_write", "first", "x".repeat(600)); await realm.callCapability("state_write", "second", "x".repeat(600));',
    }).result;

    realm.dispose();
    await waitForCondition(
      () => transportAudit.disposedAcknowledged,
      "Production controller disposal acknowledgement timeout."
    );
    let disposalRejectedLateExecute = false;
    try {
      realm.execute({
        id: "browser_late_execution",
        source: "return true;",
      });
    } catch {
      disposalRejectedLateExecute = true;
    }

    return {
      actualHandleReachedHost,
      onlyOpaqueTokenCrossedWorker:
        transportAudit.initializationObserved &&
        transportAudit.opaqueTokenCrossedWorker &&
        !transportAudit.rawHandleCrossedWorker,
      grantedObjectReadCompleted: granted.outcome === "completed",
      grantedObservationMatched:
        isRecord(granted.output) &&
        granted.output.kind === "browser_actor" &&
        isRecord(granted.output.position) &&
        granted.output.position.x === 11 &&
        granted.output.position.y === 17,
      ungrantedStateReadFailed: ungranted.outcome === "failed",
      fireAndForgetUngrantedFailed:
        fireAndForgetUngranted.outcome === "failed",
      ungrantedCapabilityDidNotReachHost,
      runawayAutoTerminated: runaway.outcome === "terminated",
      mutableExecutionSnapshotEnforced:
        runaway.executionId === "browser_runaway",
      recoveryCompleted:
        recovery.outcome === "completed" &&
        isRecord(recovery.output) &&
        recovery.output.recovered === true,
      deterministicReplayMatched:
        deterministicFirst.outcome === "completed" &&
        deterministicSecond.outcome === "completed" &&
        JSON.stringify(deterministicFirst.output) ===
          JSON.stringify(deterministicSecond.output),
      operationsBudgetEnforced: operationsLimit.outcome === "resource_limit",
      fireAndForgetOperationsBudgetEnforced:
        fireAndForgetOperationsLimit.outcome === "resource_limit",
      stateBudgetTotalsDistinctEntries:
        stateBudget.outcome === "resource_limit",
      disposalRejectedLateExecute,
      capabilityHostCalls,
      productionSharedKernelExecutions:
        transportAudit.sharedKernelExecutions,
      controllerDisposalAcknowledged:
        transportAudit.disposedAcknowledged,
    };
  } finally {
    realm.dispose();
    objectHost.dispose();
  }
}

function createIntegrationGrant(): MechanicCapabilityGrant {
  const objectRead = mechanicCapabilityRegistry.capabilities.find(
    (capability) => capability.id === "object_read"
  );
  if (!objectRead) {
    throw new Error("Mechanic capability registry lacks object_read.");
  }
  const randomNext = mechanicCapabilityRegistry.capabilities.find(
    (capability) => capability.id === "random_next"
  );
  if (!randomNext) {
    throw new Error("Mechanic capability registry lacks random_next.");
  }
  const stateWrite = mechanicCapabilityRegistry.capabilities.find(
    (capability) => capability.id === "state_write"
  );
  if (!stateWrite) {
    throw new Error("Mechanic capability registry lacks state_write.");
  }
  return {
    capabilityVersion: mechanicCapabilityRegistry.version,
    capabilities: [
      {
        ...objectRead,
        justification: {
          kind: "contract_declaration",
          path: "capabilities[0]",
        },
      },
      {
        ...randomNext,
        justification: {
          kind: "contract_declaration",
          path: "capabilities[1]",
        },
      },
      {
        ...stateWrite,
        justification: {
          kind: "contract_declaration",
          path: "capabilities[2]",
        },
      },
    ],
  };
}

function createAuditedProductionController(
  handle: object,
  audit: {
    initializationObserved: boolean;
    rawHandleCrossedWorker: boolean;
    opaqueTokenCrossedWorker: boolean;
    sharedKernelExecutions: number;
    disposedAcknowledged: boolean;
    realmId?: string;
  }
): Worker {
  const controller = new Worker(
    new URL(
      "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm-controller.worker.ts",
      import.meta.url
    ),
    { type: "module" }
  );
  const nativePostMessage = controller.postMessage.bind(controller) as (
    message: unknown,
    transfer?: Transferable[]
  ) => void;
  Object.defineProperty(controller, "postMessage", {
    configurable: true,
    value(message: unknown, transfer?: Transferable[]) {
      if (
        isRecord(message) &&
        message.kind === "sparkline_mechanic_realm_initialize"
      ) {
        audit.initializationObserved = true;
        audit.realmId =
          typeof message.realmId === "string" ? message.realmId : undefined;
        audit.rawHandleCrossedWorker = containsObjectIdentity(message, handle);
        const binding = Array.isArray(message.bindings)
          ? message.bindings.find(
              (value) => isRecord(value) && value.id === "binding_actor"
            )
          : undefined;
        audit.opaqueTokenCrossedWorker =
          isRecord(binding) &&
          Array.isArray(binding.tokens) &&
          binding.tokens.length === 1 &&
          typeof binding.tokens[0] === "string";
      }
      nativePostMessage(message, transfer);
    },
  });
  controller.addEventListener("message", (event) => {
    if (
      event.isTrusted &&
      isRecord(event.data) &&
      event.data.kind === "sparkline_mechanic_realm_disposed" &&
      event.data.protocolVersion ===
        SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION &&
      event.data.realmId === audit.realmId
    ) {
      audit.disposedAcknowledged = true;
      return;
    }
    if (
      event.isTrusted &&
      isRecord(event.data) &&
      event.data.kind === "ses_probe_audit" &&
      isRecord(event.data.audit) &&
      event.data.audit.action === "shared_kernel_entered" &&
      event.data.audit.mode === "runtime"
    ) {
      audit.sharedKernelExecutions += 1;
    }
  });
  return controller;
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMessage: string
): Promise<void> {
  const deadline = performance.now() + 1_000;
  while (!condition()) {
    if (performance.now() >= deadline) {
      throw new Error(timeoutMessage);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
}

function containsObjectIdentity(
  value: unknown,
  expected: object,
  seen = new WeakSet<object>()
): boolean {
  if (value === expected) {
    return true;
  }
  if (!isRecord(value) || seen.has(value)) {
    return false;
  }
  seen.add(value);
  return Object.values(value).some((entry) =>
    containsObjectIdentity(entry, expected, seen)
  );
}

function waitForWorkerReady(
  worker: Worker,
  audits: unknown[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error("SES controller ready timeout.")),
      10_000
    );
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!event.isTrusted || !isRecord(event.data)) {
        return;
      }
      if (event.data.kind === "ses_probe_audit") {
        audits.push(event.data.audit);
        return;
      }
      if (event.data.kind === "ses_controller_ready") {
        cleanup();
        resolve();
      }
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
  });
}

function waitForRuntimeReady(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Runtime iframe ready timeout."));
    }, 5_000);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        event.isTrusted &&
        event.source === iframe.contentWindow &&
        isRecord(event.data) &&
        event.data.kind === "ses_runtime_ready"
      ) {
        cleanup();
        resolve();
      }
    };
    window.addEventListener("message", onMessage);
  });
}

function createRuntimeResponderSource(): string {
  return `<!doctype html><meta charset="utf-8"><script>
    let identity;
    addEventListener("message", (event) => {
      const request = event.data;
      if (
        !event.isTrusted ||
        event.source !== parent ||
        request?.protocolVersion !== "${MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION}"
      ) return;
      if (request?.kind === "sparkline_mechanic_conformance_runtime_initialize") {
        identity ||= { sessionId: request.sessionId, runtimeId: request.runtimeId };
        return;
      }
      if (request?.kind !== "sparkline_mechanic_conformance_runtime_heartbeat_challenge" || !identity) return;
      parent.postMessage({
        kind: "sparkline_mechanic_conformance_runtime_heartbeat_response",
        protocolVersion: "${MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION}",
        sessionId: identity.sessionId,
        runtimeId: identity.runtimeId,
        probeId: request.probeId,
        nonce: request.nonce,
      }, "*");
    });
    dispatchEvent(new MessageEvent("message", {
      data: {
        kind: "sparkline_mechanic_conformance_runtime_initialize",
        protocolVersion: "${MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION}",
        sessionId: "synthetic_session",
        runtimeId: "synthetic_runtime",
      },
      source: parent,
    }));
    parent.postMessage({ kind: "ses_runtime_ready" }, "*");
  <\/script>`;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

export {};
