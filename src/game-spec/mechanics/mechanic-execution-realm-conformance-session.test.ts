import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
  createMechanicExecutionRealmBrowserConformanceSession,
  disposeMechanicExecutionRealmBrowserConformanceIframePreparation,
  prepareMechanicExecutionRealmBrowserConformanceIframe,
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
    const rejection = expect(reportPromise).rejects.toThrow(
      "did not acknowledge the exact browser session identity"
    );

    await vi.runAllTimersAsync();
    await rejection;

    expect(syntheticCandidateResponses).toBe(0);
    expect(syntheticRuntimeResponses).toBe(0);
  });

  it("removes listeners and invalidates pending state after initialization times out", async () => {
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
    const rejection = expect(reportPromise).rejects.toThrow(
      "did not acknowledge the exact browser session identity"
    );

    await vi.runAllTimersAsync();
    await rejection;
    const addedMessageListeners = addListener.mock.calls.filter(
      ([type]) => type === "message"
    ).length;
    const removedMessageListeners = removeListener.mock.calls.filter(
      ([type]) => type === "message"
    ).length;

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

  it("requires distinct candidate and runtime iframes", () => {
    const runtimeIframe = createSandboxedIframe();

    expect(() =>
      createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "same_iframe_candidate",
        candidateEndpoint: { kind: "iframe", iframe: runtimeIframe },
        runtimeIframe,
      })
    ).toThrow("whole-game runtime iframe");
  });

  it("rejects an unprepared iframe even when its current sandbox looks exact", () => {
    const candidateIframe = document.createElement("iframe");
    candidateIframe.setAttribute("sandbox", "allow-scripts");
    document.body.append(candidateIframe);

    expect(() =>
      createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "unprepared_candidate",
        candidateEndpoint: { kind: "iframe", iframe: candidateIframe },
        runtimeIframe: createSandboxedIframe(),
      })
    ).toThrow("trusted pre-load preparation");
  });

  it("rejects sandbox authority that was added and removed before capture", () => {
    const candidateIframe = document.createElement("iframe");
    prepareMechanicExecutionRealmBrowserConformanceIframe(candidateIframe);
    candidateIframe.setAttribute("sandbox", "allow-scripts allow-popups");
    candidateIframe.setAttribute("sandbox", "allow-scripts");
    document.body.append(candidateIframe);

    expect(() =>
      createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "retagged_candidate",
        candidateEndpoint: { kind: "iframe", iframe: candidateIframe },
        runtimeIframe: createSandboxedIframe(),
      })
    ).toThrow("changed after trusted pre-load preparation");
  });

  it("releases an abandoned preparation before the iframe is loaded", () => {
    const candidateIframe = document.createElement("iframe");
    prepareMechanicExecutionRealmBrowserConformanceIframe(candidateIframe);
    disposeMechanicExecutionRealmBrowserConformanceIframePreparation(
      candidateIframe
    );
    prepareMechanicExecutionRealmBrowserConformanceIframe(candidateIframe);
    document.body.append(candidateIframe);

    const session = createMechanicExecutionRealmBrowserConformanceSession({
      candidateId: "reprepared_candidate",
      candidateEndpoint: { kind: "iframe", iframe: candidateIframe },
      runtimeIframe: createSandboxedIframe(),
    });

    session.dispose();
  });

  it("releases candidate preparation after a disconnected capture failure", () => {
    const candidateIframe = document.createElement("iframe");
    prepareMechanicExecutionRealmBrowserConformanceIframe(candidateIframe);

    expect(() =>
      createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "disconnected_prepared_candidate",
        candidateEndpoint: { kind: "iframe", iframe: candidateIframe },
        runtimeIframe: createSandboxedIframe(),
      })
    ).toThrow("connected, captured iframe");

    expect(() =>
      prepareMechanicExecutionRealmBrowserConformanceIframe(candidateIframe)
    ).not.toThrow();
    disposeMechanicExecutionRealmBrowserConformanceIframePreparation(
      candidateIframe
    );
  });

  it("releases runtime preparation after a disconnected capture failure", () => {
    const runtimeIframe = document.createElement("iframe");
    prepareMechanicExecutionRealmBrowserConformanceIframe(runtimeIframe);

    expect(() =>
      createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "disconnected_prepared_runtime",
        candidateEndpoint: {
          kind: "iframe",
          iframe: document.createElement("iframe"),
        },
        runtimeIframe,
      })
    ).toThrow("connected, captured iframe");

    expect(() =>
      prepareMechanicExecutionRealmBrowserConformanceIframe(runtimeIframe)
    ).not.toThrow();
    disposeMechanicExecutionRealmBrowserConformanceIframePreparation(
      runtimeIframe
    );
  });

  it("atomically releases candidate preparation when runtime capture fails first", () => {
    const disconnectObserver = vi.spyOn(
      MutationObserver.prototype,
      "disconnect"
    );
    const candidateIframe = createSandboxedIframe();
    const invalidRuntimeIframe = createSandboxedIframe();
    invalidRuntimeIframe.setAttribute(
      "sandbox",
      "allow-scripts allow-popups"
    );

    expect(() =>
      createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "runtime_first_rejection",
        candidateEndpoint: { kind: "iframe", iframe: candidateIframe },
        runtimeIframe: invalidRuntimeIframe,
      })
    ).toThrow('exactly sandbox="allow-scripts"');
    expect(disconnectObserver).toHaveBeenCalledTimes(2);

    const freshRuntimeIframe = createSandboxedIframe();
    let reusedSession: MechanicExecutionRealmConformanceSession | undefined;
    let reuseError: unknown;
    try {
      reusedSession = createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "reused_candidate_after_runtime_rejection",
        candidateEndpoint: { kind: "iframe", iframe: candidateIframe },
        runtimeIframe: freshRuntimeIframe,
      });
    } catch (error) {
      reuseError = error;
    } finally {
      reusedSession?.dispose();
    }

    expect(reuseError).toBeInstanceOf(TypeError);
    expect((reuseError as TypeError).message).toContain(
      "trusted pre-load preparation"
    );
  });

  it("allows a disconnected candidate to be prepared again after runtime-first rejection", () => {
    const disconnectedCandidate = document.createElement("iframe");
    prepareMechanicExecutionRealmBrowserConformanceIframe(
      disconnectedCandidate
    );
    const invalidRuntimeIframe = createSandboxedIframe();
    invalidRuntimeIframe.setAttribute(
      "sandbox",
      "allow-scripts allow-popups"
    );

    expect(() =>
      createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "disconnected_candidate_cleanup",
        candidateEndpoint: {
          kind: "iframe",
          iframe: disconnectedCandidate,
        },
        runtimeIframe: invalidRuntimeIframe,
      })
    ).toThrow('exactly sandbox="allow-scripts"');

    expect(() =>
      prepareMechanicExecutionRealmBrowserConformanceIframe(
        disconnectedCandidate
      )
    ).not.toThrow();
    disposeMechanicExecutionRealmBrowserConformanceIframePreparation(
      disconnectedCandidate
    );
  });

  it.each([
    ["no sandbox attribute", null],
    ["an empty sandbox", ""],
    ["no allow-scripts token", "allow-forms"],
    ["additional authority", "allow-scripts allow-popups"],
    ["same-origin authority", "allow-scripts allow-same-origin"],
    ["non-ASCII whitespace", "allow-scripts\u00a0"],
  ])("rejects a candidate iframe with %s", (_description, sandbox) => {
    const candidateIframe = createSandboxedIframe();
    if (sandbox === null) {
      candidateIframe.removeAttribute("sandbox");
    } else {
      candidateIframe.setAttribute("sandbox", sandbox);
    }

    expect(() =>
      createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "invalid_sandbox_candidate",
        candidateEndpoint: { kind: "iframe", iframe: candidateIframe },
        runtimeIframe: createSandboxedIframe(),
      })
    ).toThrow('exactly sandbox="allow-scripts"');
  });

  it("applies the exact sandbox contract to the runtime iframe", () => {
    const runtimeIframe = createSandboxedIframe();
    runtimeIframe.setAttribute("sandbox", "allow-scripts allow-forms");

    expect(() =>
      createMechanicExecutionRealmBrowserConformanceSession({
        candidateId: "invalid_runtime_sandbox_candidate",
        candidateEndpoint: { kind: "iframe", iframe: createSandboxedIframe() },
        runtimeIframe,
      })
    ).toThrow('exactly sandbox="allow-scripts"');
  });

  it("canonicalizes the sandbox before either iframe is loaded", () => {
    const candidateIframe = document.createElement("iframe");
    const runtimeIframe = document.createElement("iframe");
    candidateIframe.setAttribute(
      "sandbox",
      "  ALLOW-SCRIPTS\tallow-scripts  "
    );
    runtimeIframe.setAttribute("sandbox", "allow-scripts allow-popups");
    prepareMechanicExecutionRealmBrowserConformanceIframe(candidateIframe);
    prepareMechanicExecutionRealmBrowserConformanceIframe(runtimeIframe);
    document.body.append(candidateIframe, runtimeIframe);

    expect(candidateIframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(runtimeIframe.getAttribute("sandbox")).toBe("allow-scripts");

    const session = createMechanicExecutionRealmBrowserConformanceSession({
      candidateId: "normalized_sandbox_candidate",
      candidateEndpoint: { kind: "iframe", iframe: candidateIframe },
      runtimeIframe,
    });

    session.dispose();
  });

  it("invalidates the session if the candidate iframe sandbox changes after capture", async () => {
    vi.useFakeTimers();
    const candidateIframe = createSandboxedIframe();
    const candidateWindow = candidateIframe.contentWindow;
    if (!candidateWindow) {
      throw new Error("JSDOM did not create a candidate iframe window.");
    }
    const candidatePostMessage = vi.spyOn(candidateWindow, "postMessage");
    const session = createMechanicExecutionRealmBrowserConformanceSession({
      candidateId: "mutated_candidate_sandbox",
      candidateEndpoint: { kind: "iframe", iframe: candidateIframe },
      runtimeIframe: createSandboxedIframe(),
    });

    candidateIframe.setAttribute("sandbox", "allow-scripts allow-popups");
    const reportPromise = runMechanicExecutionRealmConformanceSuite({ session });
    const rejection = expect(reportPromise).rejects.toThrow(
      "did not acknowledge the exact browser session identity"
    );
    await vi.runAllTimersAsync();
    await rejection;

    expect(candidatePostMessage).toHaveBeenCalledTimes(1);
  });

  it("invalidates the session if the runtime iframe sandbox changes after capture", async () => {
    vi.useFakeTimers();
    const runtimeIframe = createSandboxedIframe();
    const runtimeWindow = runtimeIframe.contentWindow;
    if (!runtimeWindow) {
      throw new Error("JSDOM did not create a runtime iframe window.");
    }
    const runtimePostMessage = vi.spyOn(runtimeWindow, "postMessage");
    const session = createMechanicExecutionRealmBrowserConformanceSession({
      candidateId: "mutated_runtime_sandbox",
      candidateEndpoint: { kind: "iframe", iframe: createSandboxedIframe() },
      runtimeIframe,
    });

    runtimeIframe.removeAttribute("sandbox");
    const reportPromise = runMechanicExecutionRealmConformanceSuite({ session });
    const rejection = expect(reportPromise).rejects.toThrow(
      "did not acknowledge the exact browser session identity"
    );
    await vi.runAllTimersAsync();
    await rejection;

    expect(runtimePostMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps the exact captured Worker when the caller mutates its endpoint object", () => {
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

    expect(originalWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "sparkline_mechanic_conformance_candidate_initialize",
      })
    );
    expect(replacementWorker.postMessage).not.toHaveBeenCalled();
    session.dispose();
  });
});

function createSandboxedIframe(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  prepareMechanicExecutionRealmBrowserConformanceIframe(iframe);
  document.body.append(iframe);
  return iframe;
}
