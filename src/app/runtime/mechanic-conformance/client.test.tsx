import { describe, expect, it, vi } from "vitest";

import {
  createMechanicConformanceRuntimeHeartbeat,
} from "./client";

describe("createMechanicConformanceRuntimeHeartbeat", () => {
  it("answers only the exact parent-bound initialized heartbeat challenge", () => {
    const postMessage = vi.fn();
    const expectedParent = { postMessage } as unknown as Window;
    const heartbeat = createMechanicConformanceRuntimeHeartbeat({
      expectedParent,
      ownerWindow: window,
      parentOrigin: "http://localhost:3000",
    });

    dispatchParentMessage(expectedParent, {
      kind: "sparkline_mechanic_conformance_runtime_initialize",
      protocolVersion: "mechanic_execution_realm_browser_session/v3",
      sessionId: "session_one",
      runtimeId: "runtime_one",
    });
    dispatchParentMessage(expectedParent, {
      kind: "sparkline_mechanic_conformance_runtime_heartbeat_challenge",
      protocolVersion: "mechanic_execution_realm_browser_session/v3",
      probeId: "probe_one",
      nonce: "nonce_one",
    });

    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      {
        kind: "sparkline_mechanic_conformance_runtime_initialized",
        protocolVersion: "mechanic_execution_realm_browser_session/v3",
        sessionId: "session_one",
        runtimeId: "runtime_one",
      },
      "http://localhost:3000"
    );
    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      {
        kind: "sparkline_mechanic_conformance_runtime_heartbeat_response",
        protocolVersion: "mechanic_execution_realm_browser_session/v3",
        sessionId: "session_one",
        runtimeId: "runtime_one",
        probeId: "probe_one",
        nonce: "nonce_one",
      },
      "http://localhost:3000"
    );
    heartbeat.dispose();
  });

  it("ignores foreign, malformed, pre-initialization, and post-disposal messages", () => {
    const postMessage = vi.fn();
    const expectedParent = { postMessage } as unknown as Window;
    const foreignParent = {} as Window;
    const heartbeat = createMechanicConformanceRuntimeHeartbeat({
      expectedParent,
      ownerWindow: window,
      parentOrigin: "http://localhost:3000",
    });
    const challenge = {
      kind: "sparkline_mechanic_conformance_runtime_heartbeat_challenge",
      protocolVersion: "mechanic_execution_realm_browser_session/v3",
      probeId: "probe_one",
      nonce: "nonce_one",
    };

    dispatchParentMessage(expectedParent, challenge);
    dispatchParentMessage(foreignParent, {
      kind: "sparkline_mechanic_conformance_runtime_initialize",
      protocolVersion: "mechanic_execution_realm_browser_session/v3",
      sessionId: "session_one",
      runtimeId: "runtime_one",
    });
    dispatchParentMessage(expectedParent, {
      kind: "sparkline_mechanic_conformance_runtime_initialize",
      protocolVersion: "mechanic_execution_realm_browser_session/v3",
      sessionId: "session_one",
      runtimeId: "runtime_one",
      extra: true,
    });
    heartbeat.dispose();
    dispatchParentMessage(expectedParent, challenge);

    expect(postMessage).not.toHaveBeenCalled();
  });
});

function dispatchParentMessage(source: Window, data: unknown) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data,
      origin: "http://localhost:3000",
      source,
    })
  );
}
