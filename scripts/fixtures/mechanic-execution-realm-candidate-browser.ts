import {
  createMechanicExecutionRealmBrowserConformanceSession,
  disposeMechanicExecutionRealmBrowserConformanceIframePreparation,
  MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
  prepareMechanicExecutionRealmBrowserConformanceIframe,
  type MechanicExecutionRealmBrowserCandidateExecutionAcknowledgement,
  type MechanicExecutionRealmBrowserCandidateRequest,
  type MechanicExecutionRealmBrowserCandidateResponse,
  type MechanicExecutionRealmConformanceSession,
} from "../../src/game-spec/mechanics/mechanic-execution-realm-conformance-session";
import {
  runMechanicExecutionRealmConformanceSuite,
  MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY,
  type MechanicExecutionRealmConformanceProbe,
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
import {
  runExactPlayerDriftRetainedSessionBrowserIntegration,
  type ExactPlayerDriftFixedStepEvidence,
} from "./exact-player-drift-retained-session-browser";

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
  trustedHostWaitExcludedFromCallbackBudget: boolean;
  trustedHostWaitOutcome: string;
  trustedHostWaitCapabilityHostCalls: number;
  trustedHostWaitCallbackBudgetMilliseconds: number;
  trustedHostWaitResourceDimension?: string;
  postAwaitCallbackCpuBudgetEnforced: boolean;
  fireAndForgetCallbackCpuBudgetEnforced: boolean;
  fireAndForgetCallbackOutcome: string;
  fireAndForgetCallbackDiagnostic?: string;
  exactPlayerDriftFixedStepCompleted: boolean;
  exactPlayerDriftFixedStepOutcome: string;
  exactPlayerDriftFixedStepResourceDimension?: string;
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
  exactPlayerDrift?: ExactPlayerDriftFixedStepEvidence;
  terminationCorrelation?: TerminationCorrelationEvidence;
  executorReplacement?: ExecutorReplacementEvidence;
  runtimeInitialization?: RuntimeInitializationEvidence;
};

type TerminationCorrelationScenarioEvidence = {
  executeAcknowledged: boolean;
  executeSettled: boolean;
  wrongTargetResponseCount: number;
  exactTerminationOutcome: string;
};

type TerminationCorrelationEvidence = {
  prewarmPending: TerminationCorrelationScenarioEvidence;
  active: TerminationCorrelationScenarioEvidence;
  settled: TerminationCorrelationScenarioEvidence;
};

type ExecutorReplacementEvidence = {
  initialPoolReadyCount: number;
  activeExecutionAcknowledgementCount: number;
  exactTerminationOutcomes: string[];
  thirdTerminationRespondedBeforeGateRelease: boolean;
  thirdTerminationPrecededReplacementStart: boolean;
  replacementStartsBeforeGateRelease: number;
  replacementStartReasonsBeforeGateRelease: string[];
  freshExecutionRespondedBeforeGateRelease: boolean;
  freshExecutionOutcome: string;
  replacementStartsAfterRecovery: number;
};

type RuntimeInitializationEvidence = {
  probeDispatchedBeforeAcknowledgement: boolean;
  firstProbeHeartbeatAttested: boolean;
  verdict: string;
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
  const searchParams = new URLSearchParams(location.search);
  const runtimeInitializationOnly =
    searchParams.get("runtimeInitializationOnly") === "1";
  const candidate = searchParams.get("candidate");
  if (candidate !== "ses_worker") {
    throw new TypeError(`Unknown Mechanic Execution Realm candidate "${candidate}".`);
  }

  if (searchParams.get("executorReplacementOnly") === "1") {
    const executorReplacement =
      await runExecutorReplacementReadinessIntegration();
    window.__mechanicRealmCandidateEvaluation = { executorReplacement };
    return;
  }
  if (searchParams.get("terminationCorrelationOnly") === "1") {
    const terminationCorrelation =
      await runTerminationCorrelationIntegration();
    window.__mechanicRealmCandidateEvaluation = { terminationCorrelation };
    return;
  }
  if (searchParams.get("exactPlayerDriftOnly") === "1") {
    const exactPlayerDrift = await runExactPlayerDriftFixedStepIntegration(
      Number(searchParams.get("requestedIterations") ?? 800),
      Number(searchParams.get("elapsedMilliseconds") ?? 16),
      Number(searchParams.get("mainThreadStressMilliseconds") ?? 0)
    );
    window.__mechanicRealmCandidateEvaluation = { exactPlayerDrift };
    return;
  }
  if (searchParams.get("integrationOnly") === "1") {
    const integration = await runProductionAdapterIntegration();
    window.__mechanicRealmCandidateEvaluation = { integration };
    return;
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
    runtimeIframe.srcdoc = createRuntimeResponderSource(
      runtimeInitializationOnly
    );
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
    const reportPromise = runMechanicExecutionRealmConformanceSuite({ session });
    if (runtimeInitializationOnly) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      const probeDispatchedBeforeAcknowledgement = controllerAudit.some(
        (value) =>
          isRecord(value) && value.action === "execute_dispatched"
      );
      runtimeIframe.contentWindow?.postMessage(
        {
          kind: "fixture_release_runtime_initialization",
          protocolVersion:
            MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
        },
        "*"
      );
      report = await reportPromise;
      window.__mechanicRealmCandidateEvaluation = {
        runtimeInitialization: {
          probeDispatchedBeforeAcknowledgement,
          firstProbeHeartbeatAttested:
            report.probeResults[0]?.runtimeHeartbeatBrowserEvidence === true,
          verdict: report.verdict,
        },
      };
      return;
    }
    report = await reportPromise;
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

async function runTerminationCorrelationIntegration(): Promise<TerminationCorrelationEvidence> {
  return {
    prewarmPending: await runTerminationCorrelationScenario({
      scenarioId: "prewarm_pending",
      waitForReadyBeforeExecute: false,
      waitForSettlementBeforeTerminate: false,
      source: "for (;;) {}",
    }),
    active: await runTerminationCorrelationScenario({
      scenarioId: "active",
      waitForReadyBeforeExecute: true,
      waitForSettlementBeforeTerminate: false,
      source: "for (;;) {}",
    }),
    settled: await runTerminationCorrelationScenario({
      scenarioId: "settled",
      waitForReadyBeforeExecute: true,
      waitForSettlementBeforeTerminate: true,
      source: "return true;",
    }),
  };
}

async function runExecutorReplacementReadinessIntegration(): Promise<ExecutorReplacementEvidence> {
  const controllerUrl = new URL(
    "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm-controller.worker.ts",
    import.meta.url
  );
  controllerUrl.searchParams.set("qaExecutorReplacementGate", "1");
  const controller = new Worker(controllerUrl, { type: "module" });
  const messages: unknown[] = [];
  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.isTrusted) {
      messages.push(event.data);
    }
  };
  controller.addEventListener("message", onMessage);

  const sessionId = "executor_replacement_session";
  const candidateEndpointId = "executor_replacement_candidate";
  const exactTerminationOutcomes: string[] = [];
  let activeExecutionAcknowledgementCount = 0;

  try {
    await waitForWorkerReady(controller, []);
    const initialPoolReadyCount = countControllerAudits(
      messages,
      "executor_ambient_audit"
    );
    controller.postMessage({
      kind: "sparkline_mechanic_conformance_candidate_initialize",
      protocolVersion: MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
      sessionId,
      candidateEndpointId,
    });

    let thirdTermination:
      | MechanicExecutionRealmBrowserCandidateResponse
      | undefined;
    for (let index = 1; index <= 3; index += 1) {
      const probeId = `executor_replacement_probe_${index}`;
      const executeNonce = `executor_replacement_execute_${index}`;
      const terminateNonce = `executor_replacement_terminate_${index}`;
      const executeRequest = createExecutorReplacementExecuteRequest({
        probeId,
        executeNonce,
        source: "for (;;) {}",
      });
      controller.postMessage(executeRequest);
      await waitForControllerMessage(
        messages,
        (value): value is MechanicExecutionRealmBrowserCandidateExecutionAcknowledgement =>
          isRecord(value) &&
          value.kind ===
            "sparkline_mechanic_conformance_candidate_execution_acknowledgement" &&
          value.probeId === probeId &&
          value.nonce === executeNonce,
        `${probeId}: active execution acknowledgement timeout.`
      );
      activeExecutionAcknowledgementCount += 1;

      controller.postMessage(
        createTerminationCorrelationRequest({
          executeRequest,
          nonce: terminateNonce,
          targetExecutionNonce: executeNonce,
        })
      );
      if (index < 3) {
        const exactTermination = await waitForControllerMessage(
          messages,
          (value): value is MechanicExecutionRealmBrowserCandidateResponse =>
            isExactTerminationResponse(value, probeId, terminateNonce),
          `${probeId}: exact termination timeout.`
        );
        exactTerminationOutcomes.push(exactTermination.result.outcome);
      } else {
        thirdTermination = await findControllerMessageWithin(
          messages,
          (value): value is MechanicExecutionRealmBrowserCandidateResponse =>
            isExactTerminationResponse(value, probeId, terminateNonce),
          MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumTerminationMilliseconds
        );
      }
    }

    const thirdTerminationRespondedBeforeGateRelease =
      thirdTermination !== undefined;
    const firstReplacementStartMessage = await waitForControllerMessage(
      messages,
      (value): value is Record<string, unknown> =>
        isRecord(value) &&
        value.kind === "ses_probe_audit" &&
        isRecord(value.audit) &&
        value.audit.action === "executor_replacement_start" &&
        value.audit.ordinal === 1,
      "The first executor replacement did not start while readiness was gated."
    );
    const thirdTerminationPrecededReplacementStart =
      thirdTermination !== undefined &&
      messages.indexOf(thirdTermination) <
        messages.indexOf(firstReplacementStartMessage);
    const freshExecute = createExecutorReplacementExecuteRequest({
      probeId: "executor_replacement_fresh_probe",
      executeNonce: "executor_replacement_fresh_execute",
      source: "return { recovered: true };",
    });
    controller.postMessage(freshExecute);
    const freshResponseBeforeGateRelease = await findControllerMessageWithin(
      messages,
      (value): value is MechanicExecutionRealmBrowserCandidateResponse =>
        isRecord(value) &&
        value.kind === "sparkline_mechanic_conformance_candidate_response" &&
        value.action === "execute" &&
        value.probeId === freshExecute.probeId &&
        value.nonce === freshExecute.nonce,
      MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumExecutionMilliseconds
    );
    const replacementStartAudits = readControllerAudits(
      messages,
      "executor_replacement_start"
    );
    controller.postMessage({
      kind: "ses_qa_release_executor_replacement",
      protocolVersion: MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
    });
    thirdTermination ??= await waitForControllerMessage(
      messages,
      (value): value is MechanicExecutionRealmBrowserCandidateResponse =>
        isExactTerminationResponse(
          value,
          "executor_replacement_probe_3",
          "executor_replacement_terminate_3"
        ),
      "executor_replacement_probe_3: exact termination timeout after gate release."
    );
    exactTerminationOutcomes.push(thirdTermination.result.outcome);

    const freshResponse = await waitForControllerMessage(
      messages,
      (value): value is MechanicExecutionRealmBrowserCandidateResponse =>
        isRecord(value) &&
        value.kind === "sparkline_mechanic_conformance_candidate_response" &&
        value.action === "execute" &&
        value.probeId === freshExecute.probeId &&
        value.nonce === freshExecute.nonce,
      "Fresh execution did not complete after replacement release."
    );

    return {
      initialPoolReadyCount,
      activeExecutionAcknowledgementCount,
      exactTerminationOutcomes,
      thirdTerminationRespondedBeforeGateRelease,
      thirdTerminationPrecededReplacementStart,
      replacementStartsBeforeGateRelease: replacementStartAudits.length,
      replacementStartReasonsBeforeGateRelease: replacementStartAudits.flatMap(
        (audit) => typeof audit.reason === "string" ? [audit.reason] : []
      ),
      freshExecutionRespondedBeforeGateRelease:
        freshResponseBeforeGateRelease !== undefined,
      freshExecutionOutcome: freshResponse.result.outcome,
      replacementStartsAfterRecovery: readControllerAudits(
        messages,
        "executor_replacement_start"
      ).length,
    };
  } finally {
    controller.removeEventListener("message", onMessage);
    controller.terminate();
  }
}

function createExecutorReplacementExecuteRequest(input: {
  probeId: string;
  executeNonce: string;
  source: string;
}): Extract<
  MechanicExecutionRealmBrowserCandidateRequest,
  { action: "execute" }
> {
  return {
    kind: "sparkline_mechanic_conformance_candidate_request",
    protocolVersion: MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
    probeId: input.probeId,
    nonce: input.executeNonce,
    action: "execute",
    probe: {
      id: input.probeId,
      kind: "runaway_work",
      source: input.source,
      capabilityGrant: {
        capabilityVersion: mechanicCapabilityRegistry.version,
        capabilities: [],
      },
      seed: 41,
      resourceBudget: MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
    },
  };
}

function isExactTerminationResponse(
  value: unknown,
  probeId: string,
  terminateNonce: string
): value is MechanicExecutionRealmBrowserCandidateResponse {
  return (
    isRecord(value) &&
    value.kind === "sparkline_mechanic_conformance_candidate_response" &&
    value.action === "terminate" &&
    value.probeId === probeId &&
    value.nonce === terminateNonce
  );
}

function readControllerAudits(
  messages: readonly unknown[],
  action: string
): Record<string, unknown>[] {
  return messages.flatMap((value) =>
    isRecord(value) &&
    value.kind === "ses_probe_audit" &&
    isRecord(value.audit) &&
    value.audit.action === action
      ? [value.audit]
      : []
  );
}

function countControllerAudits(
  messages: readonly unknown[],
  action: string
): number {
  return readControllerAudits(messages, action).length;
}

async function runTerminationCorrelationScenario(input: {
  scenarioId: string;
  waitForReadyBeforeExecute: boolean;
  waitForSettlementBeforeTerminate: boolean;
  source: string;
}): Promise<TerminationCorrelationScenarioEvidence> {
  const controllerUrl = new URL(
    "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm-controller.worker.ts",
    import.meta.url
  );
  if (!input.waitForReadyBeforeExecute) {
    controllerUrl.searchParams.set("qaConformancePrewarmGate", "1");
  }
  const controller = new Worker(
    controllerUrl,
    { type: "module" }
  );
  const messages: unknown[] = [];
  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.isTrusted) {
      messages.push(event.data);
    }
  };
  controller.addEventListener("message", onMessage);

  const sessionId = `termination_correlation_${input.scenarioId}_session`;
  const candidateEndpointId =
    `termination_correlation_${input.scenarioId}_candidate`;
  const probeId = `termination_correlation_${input.scenarioId}_probe`;
  const executeNonce = `termination_correlation_${input.scenarioId}_execute`;
  const wrongTerminateNonce =
    `termination_correlation_${input.scenarioId}_wrong_terminate`;
  const exactTerminateNonce =
    `termination_correlation_${input.scenarioId}_exact_terminate`;
  const probe: MechanicExecutionRealmConformanceProbe = {
    id: probeId,
    kind: "runaway_work",
    source: input.source,
    capabilityGrant: {
      capabilityVersion: mechanicCapabilityRegistry.version,
      capabilities: [],
    },
    seed: 41,
    resourceBudget: MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
  };
  const executeRequest: MechanicExecutionRealmBrowserCandidateRequest = {
    kind: "sparkline_mechanic_conformance_candidate_request",
    protocolVersion: MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
    probeId,
    nonce: executeNonce,
    action: "execute",
    probe,
  };

  try {
    if (input.waitForReadyBeforeExecute) {
      await waitForWorkerReady(controller, []);
    }
    controller.postMessage({
      kind: "sparkline_mechanic_conformance_candidate_initialize",
      protocolVersion: MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
      sessionId,
      candidateEndpointId,
    });
    controller.postMessage(executeRequest);

    if (!input.waitForReadyBeforeExecute) {
      controller.postMessage(
        createTerminationCorrelationRequest({
          executeRequest,
          nonce: wrongTerminateNonce,
          targetExecutionNonce: `${executeNonce}_wrong`,
        })
      );
      controller.postMessage({
        kind: "ses_qa_release_conformance_prewarm",
        protocolVersion:
          MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
      });
    }

    const acknowledgement = await waitForControllerMessage(
      messages,
      (value): value is MechanicExecutionRealmBrowserCandidateExecutionAcknowledgement =>
        isRecord(value) &&
        value.kind ===
          "sparkline_mechanic_conformance_candidate_execution_acknowledgement" &&
        value.nonce === executeNonce,
      `${input.scenarioId}: execute acknowledgement timeout.`
    );

    let settlement: MechanicExecutionRealmBrowserCandidateResponse | undefined;
    if (input.waitForSettlementBeforeTerminate) {
      settlement = await waitForControllerMessage(
        messages,
        (value): value is MechanicExecutionRealmBrowserCandidateResponse =>
          isRecord(value) &&
          value.kind ===
            "sparkline_mechanic_conformance_candidate_response" &&
          value.action === "execute" &&
          value.nonce === executeNonce,
        `${input.scenarioId}: execute settlement timeout.`
      );
    }

    if (input.waitForReadyBeforeExecute) {
      controller.postMessage(
        createTerminationCorrelationRequest({
          executeRequest,
          nonce: wrongTerminateNonce,
          targetExecutionNonce: `${executeNonce}_wrong`,
        })
      );
    }
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    controller.postMessage(
      createTerminationCorrelationRequest({
        executeRequest,
        nonce: exactTerminateNonce,
        targetExecutionNonce: executeNonce,
      })
    );
    const exactTermination = await waitForControllerMessage(
      messages,
      (value): value is MechanicExecutionRealmBrowserCandidateResponse =>
        isRecord(value) &&
        value.kind === "sparkline_mechanic_conformance_candidate_response" &&
        value.action === "terminate" &&
        value.nonce === exactTerminateNonce,
      `${input.scenarioId}: exact termination timeout.`
    );
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    return {
      executeAcknowledged:
        acknowledgement.action === "execute" &&
        acknowledgement.probeId === probeId,
      executeSettled:
        !input.waitForSettlementBeforeTerminate ||
        (settlement?.result.probeId === probeId &&
          settlement.result.outcome === "completed"),
      wrongTargetResponseCount: messages.filter(
        (value) =>
          isRecord(value) &&
          value.kind === "sparkline_mechanic_conformance_candidate_response" &&
          value.nonce === wrongTerminateNonce
      ).length,
      exactTerminationOutcome: exactTermination.result.outcome,
    };
  } finally {
    controller.removeEventListener("message", onMessage);
    controller.terminate();
  }
}

function createTerminationCorrelationRequest(input: {
  executeRequest: Extract<
    MechanicExecutionRealmBrowserCandidateRequest,
    { action: "execute" }
  >;
  nonce: string;
  targetExecutionNonce: string;
}): MechanicExecutionRealmBrowserCandidateRequest {
  return {
    ...input.executeRequest,
    nonce: input.nonce,
    action: "terminate",
    targetExecutionNonce: input.targetExecutionNonce,
  };
}

async function waitForControllerMessage<T>(
  messages: readonly unknown[],
  predicate: (value: unknown) => value is T,
  timeoutMessage: string
): Promise<T> {
  const deadline = performance.now() + 60_000;
  while (performance.now() < deadline) {
    const message = messages.find(predicate);
    if (message !== undefined) {
      return message;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  throw new Error(timeoutMessage);
}

async function findControllerMessageWithin<T>(
  messages: readonly unknown[],
  predicate: (value: unknown) => value is T,
  timeoutMilliseconds: number
): Promise<T | undefined> {
  const deadline = performance.now() + timeoutMilliseconds;
  while (performance.now() < deadline) {
    const message = messages.find(predicate);
    if (message !== undefined) {
      return message;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  return messages.find(predicate);
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
  let trustedHostWaitCapabilityHostCalls = 0;
  let actualHandleReachedHost = false;
  const transportAudit = {
    initializationObserved: false,
    rawHandleCrossedWorker: false,
    opaqueTokenCrossedWorker: false,
    sharedKernelExecutions: 0,
    executorReadyCount: 0,
    disposedAcknowledged: false,
    realmId: undefined as string | undefined,
  };
  const productionController = createAuditedProductionController(
    handle,
    transportAudit
  );
  await waitForProductionControllerReady(productionController);
  const adapter = createSesWorkerMechanicExecutionRealmAdapter({
    createController: () => productionController,
  });
  const realm = await adapter.create({
    mechanicId: "browser_integration_mechanic",
    capabilityGrant,
    bindings: [{ id: "binding_actor", cardinality: "one", handles: [handle] }],
    capabilityHost: {
      invoke: async ({ capabilityId, arguments: capabilityArguments }) => {
        capabilityHostCalls += 1;
        if (capabilityId === "state_write") {
          if (
            capabilityArguments.length !== 2 ||
            typeof capabilityArguments[0] !== "string" ||
            typeof capabilityArguments[1] !== "string"
          ) {
            throw new Error("State write arguments were malformed.");
          }
          if (
            capabilityArguments[0].startsWith(
              "delayed_callback_trusted_"
            )
          ) {
            trustedHostWaitCapabilityHostCalls += 1;
          }
          if (capabilityArguments[0].startsWith("delayed_callback_")) {
            await new Promise((resolve) => window.setTimeout(resolve, 5));
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
    const execute = async (
      label: string,
      execution: Parameters<typeof realm.execute>[0]
    ) => {
      try {
        return await realm.execute(execution).result;
      } catch (error) {
        throw new Error(
          `${label}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    };
    const granted = await execute("granted object read", {
      id: "browser_granted_object_read",
      source:
        'return await realm.callCapability("object_read", realm.binding("binding_actor"));',
    });
    const hostCallsAfterGranted = capabilityHostCalls;
    const ungranted = await execute("ungranted state read", {
      id: "browser_ungranted_state_read",
      source: 'return await realm.callCapability("state_read", "score");',
    });
    const fireAndForgetUngranted = await execute("fire-and-forget ungranted", {
      id: "browser_fire_and_forget_ungranted",
      source:
        'void realm.callCapability("state_read", "score"); return true;',
    });
    const ungrantedCapabilityDidNotReachHost =
      capabilityHostCalls === hostCallsAfterGranted;
    const mutableRunawayExecution = {
      id: "browser_runaway",
      source: "for (;;) {}",
    };
    const runawayResult = execute("runaway", mutableRunawayExecution);
    mutableRunawayExecution.id = "browser_runaway_mutated";
    mutableRunawayExecution.source = "return true;";
    const runaway = await runawayResult;
    const recovery = await execute("recovery", {
      id: "browser_recovery",
      source: "return { recovered: true };",
    });
    const deterministicFirst = await execute("deterministic first", {
      id: "browser_deterministic_first",
      source:
        'return [await realm.callCapability("random_next"), await realm.callCapability("random_next")];',
    });
    const deterministicSecond = await execute("deterministic second", {
      id: "browser_deterministic_second",
      source:
        'return [await realm.callCapability("random_next"), await realm.callCapability("random_next")];',
    });
    const operationsLimit = await execute("operations limit", {
      id: "browser_operations_limit",
      source:
        'for (let count = 0; count < 17; count += 1) await realm.callCapability("random_next");',
    });
    const fireAndForgetOperationsLimit = await execute(
      "fire-and-forget operations limit",
      {
      id: "browser_fire_and_forget_operations_limit",
      source:
        'for (let count = 0; count < 17; count += 1) void realm.callCapability("random_next"); return true;',
      }
    );
    const stateBudget = await execute("state budget", {
      id: "browser_distinct_state_budget",
      source:
        'await realm.callCapability("state_write", "first", "x".repeat(600)); await realm.callCapability("state_write", "second", "x".repeat(600));',
    });
    const executorReadyCountBeforeFireAndForget =
      transportAudit.executorReadyCount;
    const fireAndForgetCpu = await execute("fire-and-forget cpu", {
      id: "browser_fire_and_forget_cpu",
      source: "",
      lifecycle: {
        callbacks: [
          {
            id: "browser_fire_and_forget_cpu_callback",
            source:
              'void realm.callCapability("state_write", "delayed_callback_fire_and_forget", "ready"); for (let work = 0; work < 100_000_000; work += 1) { Math.imul(work, work); }',
          },
        ],
        invocations: [
          { callbackId: "browser_fire_and_forget_cpu_callback", count: 1 },
        ],
      },
    });
    await waitForExecutorReplenishment(
      transportAudit,
      executorReadyCountBeforeFireAndForget
    );
    const trustedHostWait = await execute("trusted host wait", {
      id: "browser_trusted_host_wait",
      source: "",
      lifecycle: {
        callbacks: [
          {
            id: "browser_trusted_host_wait_callback",
            source: [
              'await realm.callCapability("state_write", "delayed_callback_trusted_one", "one");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_two", "two");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_three", "three");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_four", "four");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_five", "five");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_six", "six");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_seven", "seven");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_eight", "eight");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_nine", "nine");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_ten", "ten");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_eleven", "eleven");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_twelve", "twelve");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_thirteen", "thirteen");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_fourteen", "fourteen");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_fifteen", "fifteen");',
              'await realm.callCapability("state_write", "delayed_callback_trusted_sixteen", "sixteen");',
            ].join(" "),
          },
        ],
        invocations: [
          { callbackId: "browser_trusted_host_wait_callback", count: 1 },
        ],
      },
    });
    const postAwaitCpu = await execute("post-await cpu", {
      id: "browser_post_await_cpu",
      source: "",
      lifecycle: {
        callbacks: [
          {
            id: "browser_post_await_cpu_callback",
            source:
              'await realm.callCapability("state_write", "delayed_callback_cpu", "ready"); for (let work = 0; work < 100_000_000; work += 1) { Math.imul(work, work); }',
          },
        ],
        invocations: [
          { callbackId: "browser_post_await_cpu_callback", count: 1 },
        ],
      },
    });
    const exactPlayerDriftFixedStep =
      await runExactPlayerDriftFixedStepIntegration();
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
      trustedHostWaitExcludedFromCallbackBudget:
        trustedHostWait.outcome === "completed",
      trustedHostWaitOutcome: trustedHostWait.outcome,
      trustedHostWaitCapabilityHostCalls,
      trustedHostWaitCallbackBudgetMilliseconds:
        MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget
          .maximumCallbackMilliseconds,
      trustedHostWaitResourceDimension:
        trustedHostWait.resourceUsage?.dimension,
      postAwaitCallbackCpuBudgetEnforced:
        postAwaitCpu.outcome === "resource_limit" &&
        postAwaitCpu.resourceUsage?.dimension === "callback_milliseconds",
      fireAndForgetCallbackCpuBudgetEnforced:
        fireAndForgetCpu.outcome === "resource_limit" &&
        fireAndForgetCpu.resourceUsage?.dimension === "callback_milliseconds",
      fireAndForgetCallbackOutcome: fireAndForgetCpu.outcome,
      fireAndForgetCallbackDiagnostic: fireAndForgetCpu.diagnostic?.code,
      exactPlayerDriftFixedStepCompleted:
        exactPlayerDriftFixedStep.outcome === "completed" &&
        exactPlayerDriftFixedStep.velocityX === 24 &&
        exactPlayerDriftFixedStep.velocityY === 0,
      exactPlayerDriftFixedStepOutcome: exactPlayerDriftFixedStep.outcome,
      exactPlayerDriftFixedStepResourceDimension:
        exactPlayerDriftFixedStep.resourceDimension,
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

async function runExactPlayerDriftFixedStepIntegration(
  requestedIterations = 1,
  elapsedMilliseconds = 16,
  mainThreadStressMilliseconds = 0
): Promise<ExactPlayerDriftFixedStepEvidence> {
  const controller = new Worker(
    new URL(
      "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm-controller.worker.ts",
      import.meta.url
    ),
    { type: "module" }
  );
  await waitForProductionControllerReady(controller);
  return await runExactPlayerDriftRetainedSessionBrowserIntegration({
    controller,
    requestedIterations,
    elapsedMilliseconds,
    mainThreadStressMilliseconds,
  });
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
    executorReadyCount: number;
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
      isRecord(event.data.audit)
    ) {
      if (
        event.data.audit.action === "shared_kernel_entered" &&
        event.data.audit.mode === "runtime"
      ) {
        audit.sharedKernelExecutions += 1;
      }
      if (event.data.audit.action === "executor_ambient_audit") {
        audit.executorReadyCount += 1;
      }
    }
  });
  return controller;
}

async function waitForExecutorReplenishment(
  audit: { executorReadyCount: number },
  previousReadyCount: number
): Promise<void> {
  const deadline = performance.now() + 60_000;
  while (audit.executorReadyCount <= previousReadyCount) {
    if (performance.now() >= deadline) {
      throw new Error("Production SES executor replenishment timeout.");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
}

function waitForProductionControllerReady(controller: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Production SES controller prewarm timeout."));
    }, 60_000);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      controller.removeEventListener("message", onMessage);
      controller.removeEventListener("error", onError);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        event.isTrusted &&
        isRecord(event.data) &&
        event.data.kind === "sparkline_mechanic_realm_controller_ready" &&
        event.data.protocolVersion ===
          SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION
      ) {
        cleanup();
        resolve();
      }
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message));
    };
    controller.addEventListener("message", onMessage);
    controller.addEventListener("error", onError);
    controller.postMessage({
      kind: "sparkline_mechanic_realm_controller_ready_probe",
      protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
    });
  });
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
      60_000
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

function createRuntimeResponderSource(
  gateInitialization = false
): string {
  return `<!doctype html><meta charset="utf-8"><script>
    let identity;
    let pendingIdentity;
    let initializationReleased = ${JSON.stringify(!gateInitialization)};
    const acknowledgeInitialization = () => {
      if (!initializationReleased || !pendingIdentity || identity) return;
      identity = pendingIdentity;
      parent.postMessage({
        kind: "sparkline_mechanic_conformance_runtime_initialized",
        protocolVersion: "${MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION}",
        sessionId: identity.sessionId,
        runtimeId: identity.runtimeId,
      }, "*");
    };
    addEventListener("message", (event) => {
      const request = event.data;
      if (
        !event.isTrusted ||
        event.source !== parent ||
        request?.protocolVersion !== "${MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION}"
      ) return;
      if (request?.kind === "fixture_release_runtime_initialization") {
        initializationReleased = true;
        acknowledgeInitialization();
        return;
      }
      if (request?.kind === "sparkline_mechanic_conformance_runtime_initialize") {
        pendingIdentity ||= {
          sessionId: request.sessionId,
          runtimeId: request.runtimeId,
        };
        acknowledgeInitialization();
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
