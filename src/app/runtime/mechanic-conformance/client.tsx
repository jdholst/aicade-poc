"use client";

import {
  MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
  type MechanicExecutionRealmBrowserRuntimeInitializationAcknowledgement,
  type MechanicExecutionRealmBrowserRuntimeHeartbeatChallenge,
  type MechanicExecutionRealmBrowserRuntimeHeartbeatResponse,
  type MechanicExecutionRealmBrowserRuntimeInitialization,
} from "@/game-spec";

type RuntimeIdentity = Readonly<{
  sessionId: string;
  runtimeId: string;
}>;

export type MechanicConformanceRuntimeHeartbeat = Readonly<{
  dispose(): void;
}>;

export type CreateMechanicConformanceRuntimeHeartbeatInput = Readonly<{
  expectedParent: Window;
  ownerWindow: Window;
  parentOrigin: string;
}>;

export function createMechanicConformanceRuntimeHeartbeat({
  expectedParent,
  ownerWindow,
  parentOrigin,
}: CreateMechanicConformanceRuntimeHeartbeatInput): MechanicConformanceRuntimeHeartbeat {
  let identity: RuntimeIdentity | undefined;
  let disposed = false;

  const onMessage = (event: MessageEvent<unknown>) => {
    if (
      disposed ||
      event.source !== expectedParent ||
      event.origin !== parentOrigin
    ) {
      return;
    }

    if (!identity && isRuntimeInitialization(event.data)) {
      identity = Object.freeze({
        sessionId: event.data.sessionId,
        runtimeId: event.data.runtimeId,
      });
      const acknowledgement: MechanicExecutionRealmBrowserRuntimeInitializationAcknowledgement = {
        kind: "sparkline_mechanic_conformance_runtime_initialized",
        protocolVersion:
          MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
        sessionId: identity.sessionId,
        runtimeId: identity.runtimeId,
      };
      expectedParent.postMessage(acknowledgement, parentOrigin);
      return;
    }

    if (!identity || !isHeartbeatChallenge(event.data)) {
      return;
    }

    const response: MechanicExecutionRealmBrowserRuntimeHeartbeatResponse = {
      kind: "sparkline_mechanic_conformance_runtime_heartbeat_response",
      protocolVersion:
        MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
      sessionId: identity.sessionId,
      runtimeId: identity.runtimeId,
      probeId: event.data.probeId,
      nonce: event.data.nonce,
    };
    expectedParent.postMessage(response, parentOrigin);
  };

  ownerWindow.addEventListener("message", onMessage);
  return Object.freeze({
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      identity = undefined;
      ownerWindow.removeEventListener("message", onMessage);
    },
  });
}

const earlyHeartbeat =
  typeof window === "undefined"
    ? null
    : createMechanicConformanceRuntimeHeartbeat({
        expectedParent: window.parent,
        ownerWindow: window,
        parentOrigin: window.location.origin,
      });

export default function MechanicConformanceRuntimeClient() {
  return (
    <div
      aria-hidden="true"
      data-testid="mechanic-conformance-runtime"
      style={{ display: "none" }}
    />
  );
}

void earlyHeartbeat;

function isRuntimeInitialization(
  value: unknown
): value is MechanicExecutionRealmBrowserRuntimeInitialization {
  return (
    isExactRecord(value, [
      "kind",
      "protocolVersion",
      "sessionId",
      "runtimeId",
    ]) &&
    value.kind ===
      "sparkline_mechanic_conformance_runtime_initialize" &&
    value.protocolVersion ===
      MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION &&
    isNonemptyString(value.sessionId) &&
    isNonemptyString(value.runtimeId)
  );
}

function isHeartbeatChallenge(
  value: unknown
): value is MechanicExecutionRealmBrowserRuntimeHeartbeatChallenge {
  return (
    isExactRecord(value, [
      "kind",
      "protocolVersion",
      "probeId",
      "nonce",
    ]) &&
    value.kind ===
      "sparkline_mechanic_conformance_runtime_heartbeat_challenge" &&
    value.protocolVersion ===
      MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION &&
    isNonemptyString(value.probeId) &&
    isNonemptyString(value.nonce)
  );
}

function isExactRecord(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const ownKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return (
    ownKeys.length === expectedKeys.length &&
    ownKeys.every((key, index) => key === expectedKeys[index])
  );
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
