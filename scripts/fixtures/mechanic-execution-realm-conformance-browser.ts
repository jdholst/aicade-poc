import {
  MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
  createMechanicExecutionRealmBrowserConformanceSession,
  createMechanicExecutionRealmConformanceSession,
  disposeMechanicExecutionRealmBrowserConformanceIframePreparation,
  prepareMechanicExecutionRealmBrowserConformanceIframe,
  runMechanicExecutionRealmConformanceSuite,
  type MechanicExecutionRealmConformanceProbe,
} from "../../src/game-spec/index";

type FixtureMode =
  | "pass"
  | "unattested_mix"
  | "candidate_wrong_source"
  | "candidate_wrong_endpoint"
  | "candidate_wrong_nonce"
  | "candidate_wrong_probe"
  | "candidate_wrong_session"
  | "candidate_replay"
  | "candidate_disconnected"
  | "candidate_replaced"
  | "candidate_timeout"
  | "candidate_terminate_without_execute"
  | "candidate_late_execute_before_terminate"
  | "candidate_late_execute_not_authoritative"
  | "candidate_retired_response_before_ack"
  | "candidate_send_failure"
  | "candidate_extra_sandbox_authority"
  | "candidate_sandbox_mutated"
  | "candidate_same_origin_retagged"
  | "candidate_popup_retagged"
  | "runtime_wrong_id"
  | "runtime_wrong_session"
  | "runtime_disconnected"
  | "runtime_missing_allow_scripts"
  | "runtime_sandbox_mutated"
  | "runtime_same_origin_retagged"
  | "runtime_popup_retagged"
  | "runtime_rejection_cleans_candidate_preparation";

type FixtureAudit = {
  source: "candidate" | "runtime";
  sessionId: string;
  endpointId: string;
  probeId: string;
  nonce: string;
  action?: string;
};

declare global {
  interface Window {
    __mechanicRealmConformanceFixture?: {
      mode: FixtureMode;
      report?: Awaited<
        ReturnType<typeof runMechanicExecutionRealmConformanceSuite>
      >;
      error?: string;
      audits: FixtureAudit[];
      activeMessageListeners: number;
      sandboxValues: string[];
      retainedPreCaptureAuthority?: boolean;
      runtimeRejectionReleasedCandidatePreparation?: boolean;
    };
  }
}

const mode = (new URLSearchParams(location.search).get("mode") ??
  "pass") as FixtureMode;
const audits: FixtureAudit[] = [];
const prepareSessionIframes = mode !== "unattested_mix";
const candidateIframe = createSandboxedIframe(
  candidateResponder,
  mode,
  mode === "candidate_same_origin_retagged"
    ? "allow-scripts allow-same-origin"
    : mode === "candidate_popup_retagged"
      ? "allow-scripts allow-popups"
      : undefined,
  prepareSessionIframes
);
const runtimeIframe = createSandboxedIframe(
  runtimeResponder,
  mode,
  mode === "runtime_same_origin_retagged"
    ? "allow-scripts allow-same-origin"
    : mode === "runtime_popup_retagged"
      ? "allow-scripts allow-popups"
      : undefined,
  prepareSessionIframes
);
const relayIframe = createSandboxedIframe(
  relayResponder,
  mode,
  undefined,
  false
);

window.addEventListener("message", (event) => {
  const data = event.data as Record<string, unknown> | null;
  if (!data || typeof data !== "object") {
    return;
  }

  if (data.kind === "fixture_audit") {
    audits.push(data.audit as FixtureAudit);
    if (
      mode === "candidate_disconnected" &&
      data.audit &&
      (data.audit as FixtureAudit).probeId === "admitted_capability_calls"
    ) {
      candidateIframe.remove();
    }
    if (
      mode === "candidate_replaced" &&
      data.audit &&
      (data.audit as FixtureAudit).probeId === "admitted_capability_calls"
    ) {
      candidateIframe.replaceWith(document.createElement("iframe"));
    }
    if (
      mode === "runtime_disconnected" &&
      data.audit &&
      (data.audit as FixtureAudit).probeId === "admitted_capability_calls"
    ) {
      runtimeIframe.remove();
    }
  }

  if (data.kind === "fixture_forward_candidate_response") {
    relayIframe.contentWindow?.postMessage(
      { kind: "fixture_relay", response: data.response },
      "*"
    );
  }
});

await Promise.all([
  waitForResponderReady(candidateIframe),
  waitForResponderReady(runtimeIframe),
  waitForResponderReady(relayIframe),
]).catch(throwAfterFixturePreparationCleanup);

if (mode === "candidate_extra_sandbox_authority") {
  candidateIframe.setAttribute("sandbox", "allow-scripts allow-popups");
}
if (mode === "runtime_missing_allow_scripts") {
  runtimeIframe.removeAttribute("sandbox");
}
if (mode === "runtime_rejection_cleans_candidate_preparation") {
  runtimeIframe.setAttribute("sandbox", "allow-scripts allow-popups");
}
if (mode === "candidate_same_origin_retagged") {
  candidateIframe.setAttribute("sandbox", "allow-scripts");
}
if (mode === "runtime_same_origin_retagged") {
  runtimeIframe.setAttribute("sandbox", "allow-scripts");
}
if (mode === "candidate_popup_retagged") {
  candidateIframe.setAttribute("sandbox", "allow-scripts");
}
if (mode === "runtime_popup_retagged") {
  runtimeIframe.setAttribute("sandbox", "allow-scripts");
}
let retainedPreCaptureAuthority: boolean | undefined;
if (mode === "candidate_same_origin_retagged") {
  retainedPreCaptureAuthority = canReadIframeDocument(candidateIframe);
} else if (mode === "runtime_same_origin_retagged") {
  retainedPreCaptureAuthority = canReadIframeDocument(runtimeIframe);
} else if (mode === "candidate_popup_retagged") {
  retainedPreCaptureAuthority = await probeRetainedPopupAccess(
    candidateIframe
  ).catch(throwAfterFixturePreparationCleanup);
} else if (mode === "runtime_popup_retagged") {
  retainedPreCaptureAuthority = await probeRetainedPopupAccess(
    runtimeIframe
  ).catch(throwAfterFixturePreparationCleanup);
}

const activeMessageListeners = new Set<EventListenerOrEventListenerObject>();
const nativeAddEventListener = window.addEventListener.bind(window);
const nativeRemoveEventListener = window.removeEventListener.bind(window);
window.addEventListener = ((
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
) => {
  if (type === "message") {
    activeMessageListeners.add(listener);
  }
  nativeAddEventListener(type, listener, options);
}) as typeof window.addEventListener;
window.removeEventListener = ((
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions
) => {
  if (type === "message") {
    activeMessageListeners.delete(listener);
  }
  nativeRemoveEventListener(type, listener, options);
}) as typeof window.removeEventListener;

try {
  if (mode === "runtime_rejection_cleans_candidate_preparation") {
    const runtimeRejectionReleasedCandidatePreparation =
      await verifyRuntimeRejectionReleasesCandidatePreparation(
        candidateIframe,
        runtimeIframe
      );
    window.__mechanicRealmConformanceFixture = {
      mode,
      audits,
      activeMessageListeners: activeMessageListeners.size,
      sandboxValues: [
        candidateIframe.getAttribute("sandbox") ?? "",
        runtimeIframe.getAttribute("sandbox") ?? "",
      ],
      runtimeRejectionReleasedCandidatePreparation,
    };
  } else {
    const session =
      mode === "unattested_mix"
        ? createUnattestedMixedSession(runtimeIframe)
        : createMechanicExecutionRealmBrowserConformanceSession({
            candidateId: "chromium_reference_candidate",
            candidateEndpoint: { kind: "iframe", iframe: candidateIframe },
            runtimeIframe,
          });
    if (mode === "candidate_sandbox_mutated") {
      candidateIframe.setAttribute("sandbox", "allow-scripts allow-popups");
    }
    if (mode === "runtime_sandbox_mutated") {
      runtimeIframe.removeAttribute("sandbox");
    }
    if (mode === "candidate_send_failure") {
      candidateIframe.remove();
    }
    const report = await runMechanicExecutionRealmConformanceSuite({ session });

    window.__mechanicRealmConformanceFixture = {
      mode,
      report,
      audits,
      activeMessageListeners: activeMessageListeners.size,
      sandboxValues: [
        candidateIframe.getAttribute("sandbox") ?? "",
        runtimeIframe.getAttribute("sandbox") ?? "",
      ],
      retainedPreCaptureAuthority,
    };
  }
} catch (error) {
  window.__mechanicRealmConformanceFixture = {
    mode,
    error: error instanceof Error ? error.message : String(error),
    audits,
    activeMessageListeners: activeMessageListeners.size,
    sandboxValues: [
      candidateIframe.getAttribute("sandbox") ?? "",
      runtimeIframe.getAttribute("sandbox") ?? "",
    ],
    retainedPreCaptureAuthority,
  };
} finally {
  window.addEventListener = nativeAddEventListener;
  window.removeEventListener = nativeRemoveEventListener;
  disposeFixturePreparations();
}

function createSandboxedIframe(
  responder: (mode: FixtureMode) => void,
  responderMode: FixtureMode,
  initialSandbox?: string,
  prepareForConformance = true
): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  if (initialSandbox) {
    iframe.setAttribute("sandbox", initialSandbox);
  }
  iframe.srcdoc = `<script>(${responder.toString()})(${JSON.stringify(
    responderMode
  )})<\/script>`;
  if (!initialSandbox) {
    if (prepareForConformance) {
      prepareMechanicExecutionRealmBrowserConformanceIframe(iframe);
    } else {
      iframe.setAttribute("sandbox", "allow-scripts");
    }
  }
  document.body.append(iframe);
  return iframe;
}

function disposeFixturePreparations(): void {
  disposeMechanicExecutionRealmBrowserConformanceIframePreparation(
    candidateIframe
  );
  disposeMechanicExecutionRealmBrowserConformanceIframePreparation(
    runtimeIframe
  );
  disposeMechanicExecutionRealmBrowserConformanceIframePreparation(relayIframe);
}

function throwAfterFixturePreparationCleanup(error: unknown): never {
  disposeFixturePreparations();
  throw error;
}

async function verifyRuntimeRejectionReleasesCandidatePreparation(
  candidate: HTMLIFrameElement,
  invalidRuntime: HTMLIFrameElement
): Promise<boolean> {
  let rejectedForRuntimeSandbox = false;
  let unexpectedFirstSession:
    | ReturnType<typeof createMechanicExecutionRealmBrowserConformanceSession>
    | undefined;
  try {
    unexpectedFirstSession =
      createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "runtime_first_cleanup_probe",
        candidateEndpoint: { kind: "iframe", iframe: candidate },
        runtimeIframe: invalidRuntime,
      });
  } catch (error) {
    rejectedForRuntimeSandbox =
      error instanceof Error &&
      error.message.includes('exactly sandbox="allow-scripts"');
  } finally {
    unexpectedFirstSession?.dispose();
  }
  if (!rejectedForRuntimeSandbox) {
    return false;
  }

  const freshRuntime = createSandboxedIframe(runtimeResponder, mode);
  try {
    await waitForResponderReady(freshRuntime);
    let unexpectedReuseSession:
      | ReturnType<
          typeof createMechanicExecutionRealmBrowserConformanceSession
        >
      | undefined;
    try {
      unexpectedReuseSession =
        createMechanicExecutionRealmBrowserConformanceSession({
          candidateId: "candidate_reuse_cleanup_probe",
          candidateEndpoint: { kind: "iframe", iframe: candidate },
          runtimeIframe: freshRuntime,
        });
      return false;
    } catch (error) {
      return (
        error instanceof Error &&
        error.message ===
          "Browser conformance iframes require trusted pre-load preparation."
      );
    } finally {
      unexpectedReuseSession?.dispose();
    }
  } finally {
    disposeMechanicExecutionRealmBrowserConformanceIframePreparation(
      freshRuntime
    );
    freshRuntime.remove();
  }
}

function canReadIframeDocument(iframe: HTMLIFrameElement): boolean {
  try {
    return iframe.contentWindow?.document !== undefined;
  } catch {
    return false;
  }
}

function waitForResponderReady(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) {
      reject(new Error("The browser fixture could not capture an iframe."));
      return;
    }
    const onMessage = (event: MessageEvent) => {
      if (
        event.isTrusted &&
        event.source === iframeWindow &&
        event.data?.kind === "fixture_ready"
      ) {
        cleanup();
        resolve();
      }
    };
    const ping = () => iframeWindow.postMessage({ kind: "fixture_ready_probe" }, "*");
    const intervalId = setInterval(ping, 5);
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("The browser fixture iframe did not become ready."));
    }, 2_000);
    const cleanup = () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
    };

    window.addEventListener("message", onMessage);
    ping();
  });
}

function probeRetainedPopupAccess(
  iframe: HTMLIFrameElement
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) {
      reject(new Error("The popup-retention probe could not capture an iframe."));
      return;
    }
    const cleanup = () => {
      clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.isTrusted &&
        event.source === iframeWindow &&
        event.data?.kind === "fixture_retained_popup_response"
      ) {
        cleanup();
        resolve(event.data.retainedPopupAccess === true);
      }
    };
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("The retained-popup probe timed out."));
    }, 2_000);

    window.addEventListener("message", onMessage);
    iframeWindow.postMessage({ kind: "fixture_retained_popup_probe" }, "*");
  });
}

function createUnattestedMixedSession(runtimeIframe: HTMLIFrameElement) {
  const runtimeWindow = runtimeIframe.contentWindow;
  if (!runtimeWindow) {
    throw new Error("The unattested fixture could not capture the runtime iframe.");
  }
  const sessionId = crypto.randomUUID();
  const runtimeId = crypto.randomUUID();
  runtimeWindow.postMessage(
    {
      kind: "sparkline_mechanic_conformance_runtime_initialize",
      protocolVersion:
        MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
      sessionId,
      runtimeId,
    },
    "*"
  );

  return createMechanicExecutionRealmConformanceSession({
    candidate: {
      id: "unrelated_self_declared_browser_candidate",
      environment: "browser",
      start(probe) {
        return {
          result: Promise.resolve(createUnattestedProbeResult(probe)),
          terminate: async () => createUnattestedProbeResult(probe),
        };
      },
    },
    host: {
      isResponsive(probeId) {
        const nonce = crypto.randomUUID();
        return new Promise((resolve) => {
          const onMessage = (event: MessageEvent) => {
            if (
              event.isTrusted &&
              event.source === runtimeWindow &&
              event.data?.kind ===
                "sparkline_mechanic_conformance_runtime_heartbeat_response" &&
              event.data.sessionId === sessionId &&
              event.data.runtimeId === runtimeId &&
              event.data.probeId === probeId &&
              event.data.nonce === nonce
            ) {
              window.removeEventListener("message", onMessage);
              resolve(true);
            }
          };
          window.addEventListener("message", onMessage);
          runtimeWindow.postMessage(
            {
              kind: "sparkline_mechanic_conformance_runtime_heartbeat_challenge",
              protocolVersion:
                MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
              probeId,
              nonce,
            },
            "*"
          );
        });
      },
    },
  });
}

function createUnattestedProbeResult(
  probe: MechanicExecutionRealmConformanceProbe
) {
  return {
    probeId: probe.id,
    outcome: "rejected" as const,
    durationMilliseconds: 1,
    evidence: {},
    diagnostic: {
      stage: "realm_execution" as const,
      code: "unattested_candidate",
      message: "The unrelated candidate is not browser attested.",
    },
  };
}

function candidateResponder(responderMode: FixtureMode) {
  let identity:
    | { sessionId: string; candidateEndpointId: string }
    | undefined;
  let previousAcknowledgement: Record<string, unknown> | undefined;
  let acknowledgementReplayProbeId: string | undefined;
  let previousResponse: Record<string, unknown> | undefined;
  let replayProbeId: string | undefined;
  let withheldCallbackExecution: Record<string, unknown> | undefined;

  window.addEventListener("message", (event) => {
    const request = event.data;
    if (request?.kind === "fixture_ready_probe") {
      parent.postMessage({ kind: "fixture_ready" }, "*");
      return;
    }
    if (request?.kind === "fixture_retained_popup_probe") {
      let retainedPopupAccess = false;
      try {
        const popup = window.open("about:blank", "_candidate_fixture_popup");
        retainedPopupAccess = popup !== null;
        popup?.close();
      } catch {
        retainedPopupAccess = false;
      }
      parent.postMessage(
        { kind: "fixture_retained_popup_response", retainedPopupAccess },
        "*"
      );
      return;
    }
    if (
      request?.kind === "sparkline_mechanic_conformance_candidate_initialize"
    ) {
      identity ??= {
        sessionId: request.sessionId,
        candidateEndpointId: request.candidateEndpointId,
      };
      return;
    }
    if (
      !request ||
      request.kind !== "sparkline_mechanic_conformance_candidate_request" ||
      !identity
    ) {
      return;
    }

    const audit = {
      source: "candidate",
      sessionId: identity.sessionId,
      endpointId: identity.candidateEndpointId,
      probeId: request.probeId,
      nonce: request.nonce,
      action: request.action,
    };
    parent.postMessage({ kind: "fixture_audit", audit }, "*");

    if (
      responderMode === "candidate_timeout" &&
      request.probeId === "admitted_capability_calls"
    ) {
      return;
    }

    if (
      responderMode === "candidate_terminate_without_execute" &&
      request.probeId === "admitted_capability_calls" &&
      request.action === "execute"
    ) {
      return;
    }

    const corruptFirstProbe = request.probeId === "admitted_capability_calls";
    const delaysCallbackAcknowledgement =
      responderMode === "candidate_retired_response_before_ack" &&
      request.probeId === "resource_callback_milliseconds";
    if (request.action === "execute") {
      let acknowledgement: Record<string, unknown> =
        createCandidateExecutionAcknowledgement(request);

      if (responderMode === "candidate_replay") {
        if (!previousAcknowledgement) {
          previousAcknowledgement = acknowledgement;
        } else if (!acknowledgementReplayProbeId) {
          acknowledgementReplayProbeId = request.probeId;
        }
        if (request.probeId === acknowledgementReplayProbeId) {
          acknowledgement = previousAcknowledgement;
        }
      } else if (corruptFirstProbe) {
        if (responderMode === "candidate_wrong_endpoint") {
          acknowledgement = {
            ...acknowledgement,
            candidateEndpointId: "wrong_endpoint",
          };
        } else if (responderMode === "candidate_wrong_nonce") {
          acknowledgement = { ...acknowledgement, nonce: "wrong_nonce" };
        } else if (responderMode === "candidate_wrong_probe") {
          acknowledgement = { ...acknowledgement, probeId: "wrong_probe" };
        } else if (responderMode === "candidate_wrong_session") {
          acknowledgement = { ...acknowledgement, sessionId: "wrong_session" };
        }
      }

      if (delaysCallbackAcknowledgement) {
        // The adversarial response is intentionally delivered first at termination.
      } else if (responderMode === "candidate_wrong_source" && corruptFirstProbe) {
        parent.postMessage(
          {
            kind: "fixture_forward_candidate_response",
            response: acknowledgement,
          },
          "*"
        );
      } else {
        parent.postMessage(acknowledgement, "*");
      }
    }

    const exercisesLateExecuteRouting = [
      "candidate_late_execute_before_terminate",
      "candidate_late_execute_not_authoritative",
      "candidate_retired_response_before_ack",
    ].includes(responderMode);
    if (
      exercisesLateExecuteRouting &&
      request.probeId === "resource_callback_milliseconds"
    ) {
      if (request.action === "execute") {
        withheldCallbackExecution = request;
        return;
      }
      if (
        !withheldCallbackExecution ||
        request.probeId !== withheldCallbackExecution.probeId ||
        request.targetExecutionNonce !== withheldCallbackExecution.nonce
      ) {
        return;
      }
      parent.postMessage(
        createCandidateResponse(withheldCallbackExecution),
        "*"
      );
      if (responderMode === "candidate_retired_response_before_ack") {
        parent.postMessage(
          createCandidateExecutionAcknowledgement(withheldCallbackExecution),
          "*"
        );
      }
      const terminationResponse = createCandidateResponse(request);
      if (
        responderMode === "candidate_late_execute_before_terminate" ||
        responderMode === "candidate_retired_response_before_ack"
      ) {
        terminationResponse.result = createProbeResult(
          request.probe as Record<string, unknown>
        );
      }
      parent.postMessage(terminationResponse, "*");
      return;
    }

    if (
      ["candidate_disconnected", "candidate_replaced"].includes(
        responderMode
      ) &&
      request.probeId === "admitted_capability_calls"
    ) {
      setTimeout(() => {
        parent.postMessage(createCandidateResponse(request), "*");
      }, 0);
      return;
    }

    let response: Record<string, unknown> = createCandidateResponse(request);

    if (responderMode === "candidate_replay") {
      if (!previousResponse) {
        previousResponse = response;
      } else if (!replayProbeId) {
        replayProbeId = request.probeId;
      }
      if (request.probeId === replayProbeId) {
        response = previousResponse;
      }
    } else if (corruptFirstProbe) {
      if (responderMode === "candidate_wrong_endpoint") {
        response = { ...response, candidateEndpointId: "wrong_endpoint" };
      } else if (responderMode === "candidate_wrong_nonce") {
        response = { ...response, nonce: "wrong_nonce" };
      } else if (responderMode === "candidate_wrong_probe") {
        response = { ...response, probeId: "wrong_probe" };
      } else if (responderMode === "candidate_wrong_session") {
        response = { ...response, sessionId: "wrong_session" };
      }
    }

    if (responderMode === "candidate_wrong_source" && corruptFirstProbe) {
      parent.postMessage(
        { kind: "fixture_forward_candidate_response", response },
        "*"
      );
      return;
    }

    parent.postMessage(response, "*");
  });

  function createCandidateResponse(request: Record<string, unknown>) {
    const probe = request.probe as Record<string, unknown>;
    return {
      kind: "sparkline_mechanic_conformance_candidate_response",
      protocolVersion: "mechanic_execution_realm_browser_session/v2",
      sessionId: identity?.sessionId,
      candidateEndpointId: identity?.candidateEndpointId,
      probeId: request.probeId,
      nonce: request.nonce,
      action: request.action,
      result:
        request.action === "terminate"
          ? createTerminationResult(probe)
          : createProbeResult(probe),
    };
  }

  function createCandidateExecutionAcknowledgement(
    request: Record<string, unknown>
  ) {
    return {
      kind: "sparkline_mechanic_conformance_candidate_execution_acknowledgement",
      protocolVersion: "mechanic_execution_realm_browser_session/v2",
      sessionId: identity?.sessionId,
      candidateEndpointId: identity?.candidateEndpointId,
      probeId: request.probeId,
      nonce: request.nonce,
      action: "execute",
    };
  }

  function createProbeResult(probe: Record<string, unknown>) {
    const noResources = {
      ownedObjects: 0,
      scheduledCallbacks: 0,
      subscriptions: 0,
      signals: 0,
      privateStateBytes: 0,
      pendingTasks: 0,
    };
    const evidence: Record<string, unknown> = {
      resourcesAfterCleanup: noResources,
    };
    let outcome = "rejected";
    let diagnostic: Record<string, unknown> | undefined = createDiagnostic(probe);

    if (probe.kind === "capability_use") {
      outcome = "completed";
      const grant = probe.capabilityGrant as {
        capabilities: Array<{ id: string }>;
      };
      evidence.capabilityCalls = grant.capabilities.map((capability) => capability.id);
      diagnostic = undefined;
    } else if (probe.kind === "runaway_work") {
      outcome = "terminated";
      diagnostic = createDiagnostic(probe, "realm_termination");
    } else if (probe.kind === "resource_exhaustion") {
      outcome = "resource_limit";
      const target = probe.resourceTarget as { dimension: string; limit: number };
      evidence.resourceUsage = {
        dimension: target.dimension,
        limit: target.limit,
        observed: target.limit + 1,
      };
    } else if (probe.kind === "deterministic_replay") {
      outcome = "completed";
      evidence.output = {
        random: 0.25,
        seed: probe.seed,
        simulationTime: 16,
      };
      diagnostic = undefined;
    } else if (probe.kind === "opaque_handle_use") {
      outcome = "completed";
      evidence.handleIsolation = {
        rawReferenceExposed: false,
        mutationVisible: false,
        serializedPropertyCount: 0,
        observationImmutable: true,
      };
      diagnostic = undefined;
    } else if (probe.kind === "cleanup_success") {
      outcome = "completed";
      diagnostic = undefined;
    } else if (probe.kind === "cleanup_failure") {
      outcome = "failed";
      diagnostic = createDiagnostic(probe, "cleanup");
    } else if (probe.kind === "recovery") {
      outcome = "completed";
      evidence.output = { state: "recovered" };
      diagnostic = undefined;
    }

    return {
      probeId: probe.id,
      outcome,
      durationMilliseconds: 1,
      evidence,
      diagnostic,
    };
  }

  function createTerminationResult(probe: Record<string, unknown>) {
    return {
      probeId: probe.id,
      outcome: "terminated",
      durationMilliseconds: 1,
      evidence: {
        resourcesAfterCleanup: {
          ownedObjects: 0,
          scheduledCallbacks: 0,
          subscriptions: 0,
          signals: 0,
          privateStateBytes: 0,
          pendingTasks: 0,
        },
      },
      diagnostic: createDiagnostic(probe, "realm_termination"),
    };
  }

  function createDiagnostic(
    probe: Record<string, unknown>,
    stage = "realm_execution"
  ) {
    return {
      stage,
      code: "candidate_probe_contained",
      message: `The candidate contained ${String(probe.id)}.`,
      repair: {
        artifact: "realm_candidate",
        issuePath: `conformance.${String(probe.id)}`,
        suggestedAction: "Inspect the candidate boundary and retry this exact probe.",
      },
    };
  }
}

function runtimeResponder(responderMode: FixtureMode) {
  let identity: { sessionId: string; runtimeId: string } | undefined;
  window.addEventListener("message", (event) => {
    const challenge = event.data;
    if (challenge?.kind === "fixture_ready_probe") {
      parent.postMessage({ kind: "fixture_ready" }, "*");
      return;
    }
    if (challenge?.kind === "fixture_retained_popup_probe") {
      let retainedPopupAccess = false;
      try {
        const popup = window.open("about:blank", "_runtime_fixture_popup");
        retainedPopupAccess = popup !== null;
        popup?.close();
      } catch {
        retainedPopupAccess = false;
      }
      parent.postMessage(
        { kind: "fixture_retained_popup_response", retainedPopupAccess },
        "*"
      );
      return;
    }
    if (
      challenge?.kind === "sparkline_mechanic_conformance_runtime_initialize"
    ) {
      identity ??= {
        sessionId: challenge.sessionId,
        runtimeId: challenge.runtimeId,
      };
      return;
    }
    if (
      !challenge ||
      challenge.kind !==
        "sparkline_mechanic_conformance_runtime_heartbeat_challenge" ||
      !identity
    ) {
      return;
    }

    parent.postMessage(
      {
        kind: "fixture_audit",
        audit: {
          source: "runtime",
          sessionId: identity.sessionId,
          endpointId: identity.runtimeId,
          probeId: challenge.probeId,
          nonce: challenge.nonce,
        },
      },
      "*"
    );
    let response = {
      kind: "sparkline_mechanic_conformance_runtime_heartbeat_response",
      protocolVersion: "mechanic_execution_realm_browser_session/v2",
      sessionId: identity.sessionId,
      runtimeId: identity.runtimeId,
      probeId: challenge.probeId,
      nonce: challenge.nonce,
    };

    if (challenge.probeId === "admitted_capability_calls") {
      if (responderMode === "runtime_wrong_id") {
        response = { ...response, runtimeId: "wrong_runtime" };
      } else if (responderMode === "runtime_wrong_session") {
        response = { ...response, sessionId: "wrong_session" };
      }
    }

    parent.postMessage(response, "*");
  });
}

function relayResponder() {
  window.addEventListener("message", (event) => {
    if (event.data?.kind === "fixture_ready_probe") {
      parent.postMessage({ kind: "fixture_ready" }, "*");
      return;
    }
    if (event.data?.kind === "fixture_relay") {
      parent.postMessage(event.data.response, "*");
    }
  });
}

if (
  MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION !==
  "mechanic_execution_realm_browser_session/v2"
) {
  throw new Error("Unexpected browser session protocol version.");
}
