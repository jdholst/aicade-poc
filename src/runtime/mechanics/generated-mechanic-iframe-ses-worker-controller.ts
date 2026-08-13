import type { SesWorkerMechanicExecutionRealmController } from "./ses-worker-mechanic-execution-realm";
import {
  GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
  type GeneratedMechanicBrokerToIframeMessage,
  type GeneratedMechanicIframeControllerAcknowledgement,
  type GeneratedMechanicIframeControllerBootstrap,
  type GeneratedMechanicIframeControllerRequest,
  type GeneratedMechanicIframeControllerTerminate,
} from "./generated-mechanic-iframe-controller-protocol";

export type GeneratedMechanicIframeControllerWindow = {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void;
};

export type WaitForGeneratedMechanicIframeSesWorkerControllerInput = {
  ownerWindow?: GeneratedMechanicIframeControllerWindow;
  expectedParent?: MessageEventSource;
  deadlineMilliseconds?: number;
};

const consumedControllerPorts = new WeakSet<object>();

export function waitForGeneratedMechanicIframeSesWorkerController({
  ownerWindow = requireBrowserWindow(),
  expectedParent = requireParentWindow(),
  deadlineMilliseconds = 5_000,
}: WaitForGeneratedMechanicIframeSesWorkerControllerInput = {}): Promise<SesWorkerMechanicExecutionRealmController> {
  if (
    !Number.isFinite(deadlineMilliseconds) ||
    deadlineMilliseconds <= 0
  ) {
    throw new TypeError(
      "The generated mechanic iframe controller deadline must be positive."
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeoutId);
      ownerWindow.removeEventListener("message", onMessage);
    };
    const fail = (message: string, ports: readonly MessagePort[] = []) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      for (const port of ports) {
        closePort(port);
      }
      reject(new Error(message));
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!hasKind(event.data, "sparkline_generated_mechanic_controller_bootstrap")) {
        return;
      }
      if (
        !event.isTrusted ||
        event.currentTarget !== ownerWindow ||
        event.source !== expectedParent ||
        !isControllerBootstrap(event.data) ||
        event.ports.length !== 1 ||
        !isMessagePort(event.ports[0]) ||
        consumedControllerPorts.has(event.ports[0])
      ) {
        fail(
          "The generated mechanic iframe controller bootstrap was invalid.",
          event.ports
        );
        return;
      }

      const controlPort = event.ports[0];
      try {
        const controller = createControllerProxy(event.data, controlPort);
        consumedControllerPorts.add(controlPort);
        settled = true;
        cleanup();
        resolve(controller);
      } catch (error) {
        fail(
          error instanceof Error
            ? `The generated mechanic iframe controller bootstrap failed: ${error.message}`
            : "The generated mechanic iframe controller bootstrap failed.",
          [controlPort]
        );
      }
    };
    const timeoutId = setTimeout(() => {
      fail("The generated mechanic iframe controller bootstrap timed out.");
    }, deadlineMilliseconds);
    ownerWindow.addEventListener("message", onMessage);
  });
}

function createControllerProxy(
  bootstrap: GeneratedMechanicIframeControllerBootstrap,
  controlPort: MessagePort
): SesWorkerMechanicExecutionRealmController {
  const listeners = new Set<(event: MessageEvent<unknown>) => void>();
  let expectedInboundSequence = 1;
  let nextOutboundSequence = 1;
  let capabilityPortTransferred = false;
  let disposed = false;

  const closeController = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    controlPort.removeEventListener("message", onControlMessage);
    listeners.clear();
    closePort(controlPort);
  };
  const sendTerminate = () => {
    if (disposed) {
      return;
    }
    const terminate: GeneratedMechanicIframeControllerTerminate = {
      kind: "sparkline_generated_mechanic_controller_terminate",
      protocolVersion:
        GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
      sessionId: bootstrap.sessionId,
      nonce: bootstrap.nonce,
      sequence: nextOutboundSequence,
    };
    nextOutboundSequence += 1;
    try {
      controlPort.postMessage(terminate);
    } finally {
      closeController();
    }
  };
  const onControlMessage = (event: MessageEvent<unknown>) => {
    if (
      disposed ||
      !event.isTrusted ||
      event.currentTarget !== controlPort ||
      event.ports.length !== 0 ||
      !isBrokerMessage(
        event.data,
        bootstrap.sessionId,
        bootstrap.nonce,
        expectedInboundSequence
      )
    ) {
      for (const port of event.ports) {
        closePort(port);
      }
      sendTerminate();
      return;
    }

    expectedInboundSequence += 1;
    if (event.data.kind === "sparkline_generated_mechanic_broker_terminated") {
      closeController();
      return;
    }

    const projectedEvent = Object.freeze({
      data: event.data.message,
      isTrusted: true,
      currentTarget: controller,
      target: controller,
      ports: Object.freeze([]),
      type: "message",
    }) as unknown as MessageEvent<unknown>;
    for (const listener of [...listeners]) {
      listener(projectedEvent);
    }
  };

  const controller: SesWorkerMechanicExecutionRealmController = Object.freeze({
    addEventListener(
      type: "message",
      listener: (event: MessageEvent<unknown>) => void
    ) {
      if (type === "message" && !disposed) {
        listeners.add(listener);
      }
    },
    removeEventListener(
      type: "message",
      listener: (event: MessageEvent<unknown>) => void
    ) {
      if (type === "message") {
        listeners.delete(listener);
      }
    },
    postMessage(message: unknown, transfer: Transferable[] = []) {
      if (disposed) {
        throw new Error(
          "The generated mechanic iframe controller has been terminated."
        );
      }
      const initialization = isSesWorkerInitialization(message);
      if (initialization) {
        if (capabilityPortTransferred) {
          throw new Error(
            "The nested capability port has already been transferred."
          );
        }
        if (transfer.length !== 1 || !isMessagePort(transfer[0])) {
          throw new Error(
            "SES Worker initialization requires exactly one capability port."
          );
        }
        if (message.capabilityPort !== transfer[0]) {
          throw new Error(
            "The transferred port must be the initialization embedded capabilityPort."
          );
        }
      } else if (transfer.length !== 0) {
        throw new Error(
          "Only SES Worker initialization may transfer a capability port."
        );
      }

      const request: GeneratedMechanicIframeControllerRequest = {
        kind: "sparkline_generated_mechanic_controller_request",
        protocolVersion:
          GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
        sessionId: bootstrap.sessionId,
        nonce: bootstrap.nonce,
        sequence: nextOutboundSequence,
        message,
      };
      controlPort.postMessage(request, transfer);
      nextOutboundSequence += 1;
      if (initialization) {
        capabilityPortTransferred = true;
      }
    },
    terminate() {
      sendTerminate();
    },
  });

  controlPort.addEventListener("message", onControlMessage);
  controlPort.start();
  const acknowledgement: GeneratedMechanicIframeControllerAcknowledgement = {
    kind: "sparkline_generated_mechanic_controller_acknowledgement",
    protocolVersion:
      GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
    sessionId: bootstrap.sessionId,
    nonce: bootstrap.nonce,
    sequence: 0,
  };
  controlPort.postMessage(acknowledgement);
  return controller;
}

function isControllerBootstrap(
  value: unknown
): value is GeneratedMechanicIframeControllerBootstrap {
  return (
    hasKind(value, "sparkline_generated_mechanic_controller_bootstrap") &&
    value.protocolVersion ===
      GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION &&
    isNonemptyString(value.sessionId) &&
    isNonemptyString(value.nonce) &&
    value.sequence === 0
  );
}

function isBrokerMessage(
  value: unknown,
  sessionId: string,
  nonce: string,
  sequence: number
): value is GeneratedMechanicBrokerToIframeMessage {
  return (
    (hasKind(value, "sparkline_generated_mechanic_controller_response") ||
      hasKind(value, "sparkline_generated_mechanic_broker_terminated")) &&
    value.protocolVersion ===
      GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION &&
    value.sessionId === sessionId &&
    value.nonce === nonce &&
    value.sequence === sequence
  );
}

function isSesWorkerInitialization(
  value: unknown
): value is Record<PropertyKey, unknown> & {
  kind: "sparkline_mechanic_realm_initialize";
  capabilityPort: MessagePort;
} {
  return (
    hasKind(value, "sparkline_mechanic_realm_initialize") &&
    "capabilityPort" in value
  );
}

function hasKind(
  value: unknown,
  kind: string
): value is Record<PropertyKey, unknown> & { kind: string } {
  return isRecord(value) && value.kind === kind;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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

function closePort(port: MessagePort): void {
  try {
    port.close();
  } catch {
    // The remote endpoint may already have closed or transferred this port.
  }
}

function requireBrowserWindow(): Window {
  if (typeof window === "undefined") {
    throw new Error(
      "The generated mechanic iframe controller requires a browser Window."
    );
  }
  return window;
}

function requireParentWindow(): WindowProxy {
  if (typeof parent === "undefined") {
    throw new Error(
      "The generated mechanic iframe controller requires a parent Window."
    );
  }
  return parent;
}
