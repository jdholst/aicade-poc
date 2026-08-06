import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
  createMechanicExecutionRealmBrowserConformanceSession,
  runMechanicExecutionRealmConformanceSuite,
  type MechanicExecutionRealmBrowserCandidateRequest,
  type MechanicExecutionRealmBrowserCandidateInitialization,
  type MechanicExecutionRealmBrowserRuntimeHeartbeatChallenge,
  type MechanicExecutionRealmBrowserRuntimeInitialization,
  type MechanicExecutionRealmConformanceSession,
} from "..";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("Execution Realm browser-conformance session", () => {
  it("rejects structural sessions even when they carry arbitrary candidate and host callbacks", async () => {
    const structuralSession = {
      candidateId: "structural_session",
      candidate: { environment: "browser", start() {} },
      host: { isResponsive: async () => true },
      dispose() {},
    } as unknown as MechanicExecutionRealmConformanceSession;

    await expect(
      runMechanicExecutionRealmConformanceSuite({ session: structuralSession })
    ).rejects.toThrow("opaque session");
  });

  it("rejects correct-looking synthetic MessageEvents from matching iframe sources", async () => {
    vi.useFakeTimers();
    const candidateIframe = createSandboxedIframe();
    const runtimeIframe = createSandboxedIframe();
    const candidateWindow = candidateIframe.contentWindow;
    const runtimeWindow = runtimeIframe.contentWindow;

    if (!candidateWindow || !runtimeWindow) {
      throw new Error("JSDOM did not create iframe windows.");
    }

    let syntheticCandidateResponses = 0;
    let syntheticRuntimeResponses = 0;
    let candidateInitialization:
      | MechanicExecutionRealmBrowserCandidateInitialization
      | undefined;
    let runtimeInitialization:
      | MechanicExecutionRealmBrowserRuntimeInitialization
      | undefined;
    vi.spyOn(candidateWindow, "postMessage").mockImplementation((message) => {
      if (
        (message as { kind?: string }).kind ===
        "sparkline_mechanic_conformance_candidate_initialize"
      ) {
        candidateInitialization =
          message as MechanicExecutionRealmBrowserCandidateInitialization;
        return;
      }
      const request = message as MechanicExecutionRealmBrowserCandidateRequest;
      syntheticCandidateResponses += 1;
      window.dispatchEvent(
        new MessageEvent("message", {
          source: candidateWindow,
          data: {
            kind: "sparkline_mechanic_conformance_candidate_response",
            protocolVersion:
              MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
            sessionId: candidateInitialization?.sessionId,
            candidateEndpointId: candidateInitialization?.candidateEndpointId,
            probeId: request.probeId,
            nonce: request.nonce,
            action: request.action,
            result: {
              probeId: request.probeId,
              outcome: "rejected",
              durationMilliseconds: 1,
              evidence: {},
            },
          },
        })
      );
    });
    vi.spyOn(runtimeWindow, "postMessage").mockImplementation((message) => {
      if (
        (message as { kind?: string }).kind ===
        "sparkline_mechanic_conformance_runtime_initialize"
      ) {
        runtimeInitialization =
          message as MechanicExecutionRealmBrowserRuntimeInitialization;
        return;
      }
      const challenge =
        message as MechanicExecutionRealmBrowserRuntimeHeartbeatChallenge;
      syntheticRuntimeResponses += 1;
      window.dispatchEvent(
        new MessageEvent("message", {
          source: runtimeWindow,
          data: {
            kind: "sparkline_mechanic_conformance_runtime_heartbeat_response",
            protocolVersion:
              MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
            sessionId: runtimeInitialization?.sessionId,
            runtimeId: runtimeInitialization?.runtimeId,
            probeId: challenge.probeId,
            nonce: challenge.nonce,
          },
        })
      );
    });

    const session = createMechanicExecutionRealmBrowserConformanceSession({
      candidateId: "jsdom_synthetic_candidate",
      candidateEndpoint: { kind: "iframe", iframe: candidateIframe },
      runtimeIframe,
    });
    const reportPromise = runMechanicExecutionRealmConformanceSuite({ session });

    await vi.runAllTimersAsync();
    const report = await reportPromise;

    expect(syntheticCandidateResponses).toBeGreaterThan(0);
    expect(syntheticRuntimeResponses).toBeGreaterThan(0);
    expect(report.gates).toContainEqual(
      expect.objectContaining({ id: "browser_integration", status: "failed" })
    );
    expect(
      report.probeResults.every(
        (probe) =>
          !probe.candidateExecutionBrowserEvidence &&
          !probe.runtimeHeartbeatBrowserEvidence
      )
    ).toBe(true);
  });

  it("removes listeners and invalidates pending state after a candidate send failure", async () => {
    vi.useFakeTimers();
    const candidateIframe = createSandboxedIframe();
    const runtimeIframe = createSandboxedIframe();
    const candidateWindow = candidateIframe.contentWindow;

    if (!candidateWindow) {
      throw new Error("JSDOM did not create a candidate iframe window.");
    }

    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");
    vi.spyOn(candidateWindow, "postMessage").mockImplementation((message) => {
      if (
        (message as { kind?: string }).kind ===
        "sparkline_mechanic_conformance_candidate_initialize"
      ) {
        return;
      }
      throw new Error("candidate send failed");
    });
    const session = createMechanicExecutionRealmBrowserConformanceSession({
      candidateId: "send_failure_candidate",
      candidateEndpoint: { kind: "iframe", iframe: candidateIframe },
      runtimeIframe,
    });
    const reportPromise = runMechanicExecutionRealmConformanceSuite({ session });

    await vi.runAllTimersAsync();
    const report = await reportPromise;
    const addedMessageListeners = addListener.mock.calls.filter(
      ([type]) => type === "message"
    ).length;
    const removedMessageListeners = removeListener.mock.calls.filter(
      ([type]) => type === "message"
    ).length;

    expect(report.gates).toContainEqual(
      expect.objectContaining({ id: "browser_integration", status: "failed" })
    );
    expect(addedMessageListeners).toBeGreaterThan(0);
    expect(removedMessageListeners).toBeGreaterThanOrEqual(
      addedMessageListeners
    );

    const listenersBeforeDisposedReuse = addListener.mock.calls.length;
    await expect(
      runMechanicExecutionRealmConformanceSuite({ session })
    ).rejects.toThrow("already been consumed");
    expect(addListener.mock.calls).toHaveLength(listenersBeforeDisposedReuse);
  });

  it("requires distinct sandboxed candidate and runtime iframes", () => {
    const runtimeIframe = createSandboxedIframe();
    const sameOriginCandidate = createSandboxedIframe();
    sameOriginCandidate.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin"
    );

    expect(() =>
      createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "same_iframe_candidate",
        candidateEndpoint: { kind: "iframe", iframe: runtimeIframe },
        runtimeIframe,
      })
    ).toThrow("whole-game runtime iframe");
    expect(() =>
      createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "same_origin_candidate",
        candidateEndpoint: { kind: "iframe", iframe: sameOriginCandidate },
        runtimeIframe,
      })
    ).toThrow('without "allow-same-origin"');
  });

  it("keeps the exact captured Worker when the caller mutates its endpoint object", async () => {
    vi.useFakeTimers();
    class FakeWorker extends EventTarget {
      postMessage = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorker);
    const originalWorker = new FakeWorker();
    const replacementWorker = new FakeWorker();
    const candidateEndpoint = {
      kind: "worker" as const,
      worker: originalWorker as unknown as Worker,
    };
    const session = createMechanicExecutionRealmBrowserConformanceSession({
      candidateId: "captured_worker_candidate",
      candidateEndpoint,
      runtimeIframe: createSandboxedIframe(),
    });

    candidateEndpoint.worker = replacementWorker as unknown as Worker;
    const reportPromise = runMechanicExecutionRealmConformanceSuite({ session });
    await vi.runAllTimersAsync();
    await reportPromise;

    expect(originalWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "sparkline_mechanic_conformance_candidate_request",
      })
    );
    expect(replacementWorker.postMessage).not.toHaveBeenCalled();
  });
});

function createSandboxedIframe(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  document.body.append(iframe);
  return iframe;
}
