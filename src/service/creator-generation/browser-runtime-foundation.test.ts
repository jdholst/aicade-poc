import { describe, expect, it, vi } from "vitest";

import { MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION } from "@/game-spec";

import {
  createBrowserRuntimeFoundation,
  createMechanicConformanceRuntimeDocument,
  installMechanicConformanceRuntimeHeartbeat,
} from "./browser-runtime-foundation";

describe("createBrowserRuntimeFoundation", () => {
  it("uses a self-contained opaque runtime document with no Next.js chunk dependency", () => {
    const runtimeDocument = createMechanicConformanceRuntimeDocument();

    expect(runtimeDocument).toContain("<!doctype html>");
    expect(runtimeDocument).toContain(
      MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION
    );
    expect(runtimeDocument).not.toContain("/_next/");
    expect(runtimeDocument).not.toContain("src=");
    expect(runtimeDocument).not.toContain("/runtime/mechanic-conformance");
  });

  it("pins heartbeat replies to the trusted parent origin from initialization", () => {
    let messageListener: ((event: MessageEvent<unknown>) => void) | undefined;
    const expectedParent = { postMessage: vi.fn() };
    const runtimeWindow = {
      parent: expectedParent,
      addEventListener: vi.fn(
        (_type: string, listener: (event: MessageEvent<unknown>) => void) => {
          messageListener = listener;
        }
      ),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const dispose = installMechanicConformanceRuntimeHeartbeat(
      runtimeWindow,
      MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION
    );
    if (!messageListener) {
      throw new Error("Expected the heartbeat message listener to be installed.");
    }

    messageListener({
      data: {
        kind: "sparkline_mechanic_conformance_runtime_initialize",
        protocolVersion:
          MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
        sessionId: "session_1",
        runtimeId: "runtime_1",
      },
      origin: "https://trusted.example",
      source: expectedParent,
    } as unknown as MessageEvent<unknown>);
    messageListener({
      data: {
        kind: "sparkline_mechanic_conformance_runtime_heartbeat_challenge",
        protocolVersion:
          MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
        probeId: "deterministic_replay_a",
        nonce: "nonce_1",
      },
      origin: "https://trusted.example",
      source: expectedParent,
    } as unknown as MessageEvent<unknown>);

    expect(expectedParent.postMessage).toHaveBeenNthCalledWith(
      1,
      {
        kind: "sparkline_mechanic_conformance_runtime_initialized",
        protocolVersion:
          MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
        sessionId: "session_1",
        runtimeId: "runtime_1",
      },
      "https://trusted.example"
    );
    expect(expectedParent.postMessage).toHaveBeenNthCalledWith(
      2,
      {
        kind: "sparkline_mechanic_conformance_runtime_heartbeat_response",
        protocolVersion:
          MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
        sessionId: "session_1",
        runtimeId: "runtime_1",
        probeId: "deterministic_replay_a",
        nonce: "nonce_1",
      },
      "https://trusted.example"
    );

    dispose();
    expect(runtimeWindow.removeEventListener).toHaveBeenCalledWith(
      "message",
      messageListener
    );
  });

  it("runs browser conformance before the foundation gate and cleans probe resources", async () => {
    const events: string[] = [];
    const realmAdapter = { id: "realm_candidate" };
    const report = { schemaVersion: "realm_report" };
    const gateResult = { status: "passed", sourceGenerationAvailable: true };
    const session = { dispose: vi.fn(() => events.push("dispose_session")) };
    const worker = { terminate: vi.fn(() => events.push("terminate_worker")) };
    const iframe = document.createElement("iframe");
    const mount = document.createElement("div");
    document.body.append(mount);

    const result = await createBrowserRuntimeFoundation({
      ownerDocument: document,
      ownerWindow: window,
      dependencies: {
        createRealmAdapter: vi.fn(() => realmAdapter),
        createWorker: vi.fn(() => worker),
        waitForWorkerReady: vi.fn(async () => events.push("wait_worker")),
        prepareIframe: vi.fn((candidate) => candidate),
        disposeIframePreparation: vi.fn(() =>
          events.push("dispose_iframe_preparation")
        ),
        loadIframe: vi.fn(async () => {
          events.push("load_iframe");
          mount.append(iframe);
          return iframe;
        }),
        createBrowserSession: vi.fn(() => session),
        runConformance: vi.fn(async () => {
          events.push("run_conformance");
          return report;
        }),
        runFoundationGate: vi.fn(async (input) => {
          events.push("run_foundation_gate");
          expect(input).toEqual({
            realmAdapter,
            realmConformanceReport: report,
          });
          return gateResult;
        }),
      },
    });

    expect(result).toEqual({ gateResult, realmAdapter });
    expect(events).toEqual([
      "wait_worker",
      "load_iframe",
      "run_conformance",
      "run_foundation_gate",
      "dispose_session",
      "terminate_worker",
      "dispose_iframe_preparation",
    ]);
    expect(iframe.isConnected).toBe(false);
    mount.remove();
  });

  it("cleans every acquired browser resource when conformance rejects", async () => {
    const session = { dispose: vi.fn() };
    const worker = { terminate: vi.fn() };
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const disposeIframePreparation = vi.fn();

    await expect(
      createBrowserRuntimeFoundation({
        ownerDocument: document,
        ownerWindow: window,
        dependencies: {
          createRealmAdapter: vi.fn(() => ({ id: "realm_candidate" })),
          createWorker: vi.fn(() => worker),
          waitForWorkerReady: vi.fn(async () => undefined),
          prepareIframe: vi.fn((candidate) => candidate),
          disposeIframePreparation,
          loadIframe: vi.fn(async () => iframe),
          createBrowserSession: vi.fn(() => session),
          runConformance: vi.fn(async () => {
            throw new Error("conformance failed");
          }),
          runFoundationGate: vi.fn(),
        },
      })
    ).rejects.toThrow("conformance failed");

    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(disposeIframePreparation).toHaveBeenCalledWith(iframe);
    expect(iframe.isConnected).toBe(false);
  });
});
