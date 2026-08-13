import {
  createSesWorkerMechanicExecutionRealmController,
  type SesWorkerMechanicExecutionRealmController,
} from "./ses-worker-mechanic-execution-realm";
import {
  GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
  type GeneratedMechanicIframeBrokerTerminated,
  type GeneratedMechanicIframeControllerBootstrap,
  type GeneratedMechanicIframeControllerRequest,
  type GeneratedMechanicIframeControllerResponse,
  type GeneratedMechanicIframeControllerTerminate,
} from "./generated-mechanic-iframe-controller-protocol";

export type GeneratedMechanicIframeSesWorkerBrokerClosed = Readonly<{
  reason:
    | "disposed"
    | "remote_terminate"
    | "protocol_error"
    | "setup_error";
  message: string;
}>;

export type GeneratedMechanicIframeSesWorkerBroker = Readonly<{
  ready: Promise<void>;
  closed: Promise<GeneratedMechanicIframeSesWorkerBrokerClosed>;
  dispose(): void;
}>;

export type CreateGeneratedMechanicIframeSesWorkerBrokerInput = {
  iframe: HTMLIFrameElement;
  createController?: () => SesWorkerMechanicExecutionRealmController;
  createMessageChannel?: () => MessageChannel;
  createNonce?: () => string;
  acknowledgementDeadlineMilliseconds?: number;
};

type PreparedIframe = {
  iframe: HTMLIFrameElement;
  ownerWindow: Window;
  observer: MutationObserver;
  valid: boolean;
  claimed: boolean;
  onInvalidated?: () => void;
};

const preparedIframes = new WeakMap<HTMLIFrameElement, PreparedIframe>();

export function prepareGeneratedMechanicIframeSesWorkerBrokerIframe(
  iframe: HTMLIFrameElement
): HTMLIFrameElement {
  const ownerWindow = requireOwnerWindow(iframe);
  const browserWindow = ownerWindow as Window & typeof globalThis;
  if (!(iframe instanceof browserWindow.HTMLIFrameElement)) {
    throw new TypeError(
      "The generated mechanic broker requires an iframe from the current document."
    );
  }
  if (iframe.isConnected || iframe.contentWindow !== null) {
    throw new TypeError(
      "The generated mechanic broker iframe must be prepared before it is connected or loaded."
    );
  }
  if (preparedIframes.has(iframe)) {
    throw new TypeError(
      "The generated mechanic broker iframe is already prepared."
    );
  }

  iframe.setAttribute("sandbox", "allow-scripts");
  const preparation = {} as PreparedIframe;
  const observer = new browserWindow.MutationObserver(() => {
    preparation.valid = false;
    preparation.onInvalidated?.();
  });
  Object.assign(preparation, {
    iframe,
    ownerWindow,
    observer,
    valid: true,
    claimed: false,
  });
  observer.observe(iframe, {
    attributes: true,
    attributeFilter: ["sandbox"],
  });
  preparedIframes.set(iframe, preparation);
  return iframe;
}

export function disposeGeneratedMechanicIframeSesWorkerBrokerPreparation(
  iframe: HTMLIFrameElement
): void {
  const preparation = preparedIframes.get(iframe);
  if (preparation && !preparation.claimed) {
    discardPreparation(preparation);
  }
}

export function createGeneratedMechanicIframeSesWorkerBroker({
  iframe,
  createController = createSesWorkerMechanicExecutionRealmController,
  createMessageChannel = () => new MessageChannel(),
  createNonce = createCryptographicNonce,
  acknowledgementDeadlineMilliseconds = 5_000,
}: CreateGeneratedMechanicIframeSesWorkerBrokerInput): GeneratedMechanicIframeSesWorkerBroker {
  if (
    !Number.isFinite(acknowledgementDeadlineMilliseconds) ||
    acknowledgementDeadlineMilliseconds <= 0
  ) {
    throw new TypeError(
      "The generated mechanic broker acknowledgement deadline must be positive."
    );
  }
  const preparation = claimPreparedIframe(iframe);
  const capturedWindow = iframe.contentWindow;
  if (!capturedWindow) {
    discardPreparation(preparation);
    throw new TypeError(
      "The generated mechanic broker requires a connected iframe window."
    );
  }
  let sessionId: string;
  let nonce: string;
  let controlChannel: MessageChannel;
  try {
    sessionId = createNonce();
    nonce = createNonce();
    if (
      !isNonemptyString(sessionId) ||
      !isNonemptyString(nonce) ||
      sessionId === nonce
    ) {
      throw new TypeError(
        "The generated mechanic broker requires two distinct non-empty nonces."
      );
    }
    controlChannel = createMessageChannel();
    if (
      !controlChannel ||
      !isMessagePort(controlChannel.port1) ||
      !isMessagePort(controlChannel.port2) ||
      controlChannel.port1 === controlChannel.port2
    ) {
      throw new TypeError(
        "The generated mechanic broker requires one valid MessageChannel."
      );
    }
  } catch (error) {
    discardPreparation(preparation);
    throw error;
  }
  const parentControlPort = controlChannel.port1;
  const iframeControlPort = controlChannel.port2;
  let controller: SesWorkerMechanicExecutionRealmController | undefined;
  let acknowledged = false;
  let settled = false;
  let parentPortClosed = false;
  let iframePortTransferred = false;
  let iframePortClosed = false;
  let controllerTerminated = false;
  let expectedIframeSequence = 1;
  let nextParentSequence = 1;
  let nestedCapabilityPortForwarded = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  let resolveClosed!: (
    result: GeneratedMechanicIframeSesWorkerBrokerClosed
  ) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const closed = new Promise<GeneratedMechanicIframeSesWorkerBrokerClosed>(
    (resolve) => {
      resolveClosed = resolve;
    }
  );

  const closeParentPort = () => {
    if (parentPortClosed) {
      return;
    }
    parentPortClosed = true;
    parentControlPort.removeEventListener("message", onControlMessage);
    closePort(parentControlPort);
  };
  const closeUntransferredIframePort = () => {
    if (iframePortTransferred || iframePortClosed) {
      return;
    }
    iframePortClosed = true;
    closePort(iframeControlPort);
  };
  const terminateController = () => {
    if (!controller || controllerTerminated) {
      return;
    }
    controllerTerminated = true;
    controller.removeEventListener("message", onControllerMessage);
    try {
      controller.terminate();
    } catch {
      // The owned controller is still invalidated and cannot be reused.
    }
  };
  const finish = (
    reason: GeneratedMechanicIframeSesWorkerBrokerClosed["reason"],
    message: string,
    notifyIframe = true
  ) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(acknowledgementDeadlineId);
    preparation.onInvalidated = undefined;
    if (notifyIframe && acknowledged && !parentPortClosed) {
      const terminated: GeneratedMechanicIframeBrokerTerminated = {
        kind: "sparkline_generated_mechanic_broker_terminated",
        protocolVersion:
          GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
        sessionId,
        nonce,
        sequence: nextParentSequence,
      };
      nextParentSequence += 1;
      try {
        parentControlPort.postMessage(terminated);
      } catch {
        // Local teardown still owns the port and Worker.
      }
    }
    closeParentPort();
    closeUntransferredIframePort();
    terminateController();
    discardPreparation(preparation);
    if (!acknowledged) {
      rejectReady(new Error(message));
    }
    resolveClosed({ reason, message });
  };
  const failProtocol = (message: string, ports: readonly MessagePort[] = []) => {
    for (const port of ports) {
      closePort(port);
    }
    finish("protocol_error", message);
  };
  const onControllerMessage = (event: MessageEvent<unknown>) => {
    if (
      settled ||
      !controller ||
      !event.isTrusted ||
      event.currentTarget !== (controller as unknown as EventTarget) ||
      event.ports.length !== 0 ||
      !isPreparedIframeCurrent(preparation, capturedWindow)
    ) {
      failProtocol(
        "The parent SES Worker emitted an invalid controller event.",
        event.ports
      );
      return;
    }
    const response: GeneratedMechanicIframeControllerResponse = {
      kind: "sparkline_generated_mechanic_controller_response",
      protocolVersion:
        GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
      sessionId,
      nonce,
      sequence: nextParentSequence,
      message: event.data,
    };
    try {
      parentControlPort.postMessage(response);
      nextParentSequence += 1;
    } catch {
      finish(
        "protocol_error",
        "The parent broker could not forward the SES Worker response."
      );
    }
  };
  const onControlMessage = (event: MessageEvent<unknown>) => {
    if (
      settled ||
      !event.isTrusted ||
      event.currentTarget !== parentControlPort ||
      !isPreparedIframeCurrent(preparation, capturedWindow)
    ) {
      failProtocol(
        "The iframe controller emitted an invalid broker event.",
        event.ports
      );
      return;
    }

    if (!acknowledged) {
      if (
        event.ports.length !== 0 ||
        !isAcknowledgement(event.data, sessionId, nonce)
      ) {
        failProtocol(
          "The iframe controller acknowledgement was invalid.",
          event.ports
        );
        return;
      }
      try {
        controller = createController();
        controller.addEventListener("message", onControllerMessage);
      } catch (error) {
        finish(
          "setup_error",
          error instanceof Error
            ? `The parent SES Worker could not be created: ${error.message}`
            : "The parent SES Worker could not be created."
        );
        return;
      }
      acknowledged = true;
      clearTimeout(acknowledgementDeadlineId);
      resolveReady();
      return;
    }

    if (
      !isSequencedIframeMessage(
        event.data,
        sessionId,
        nonce,
        expectedIframeSequence
      )
    ) {
      failProtocol(
        "The iframe controller version, nonce, or sequence was invalid.",
        event.ports
      );
      return;
    }
    expectedIframeSequence += 1;

    if (
      event.data.kind === "sparkline_generated_mechanic_controller_terminate"
    ) {
      if (event.ports.length !== 0) {
        failProtocol(
          "The iframe controller termination must not transfer ports.",
          event.ports
        );
        return;
      }
      finish(
        "remote_terminate",
        "The iframe controller terminated the parent SES Worker.",
        false
      );
      return;
    }

    const message = event.data.message;
    const initialization = isSesWorkerInitialization(message);
    if (initialization) {
      const transferredPort = event.ports[0];
      if (
        nestedCapabilityPortForwarded ||
        event.ports.length !== 1 ||
        !isMessagePort(transferredPort) ||
        message.capabilityPort !== transferredPort
      ) {
        failProtocol(
          "SES Worker initialization must transfer its one embedded capability port exactly once.",
          event.ports
        );
        return;
      }
      nestedCapabilityPortForwarded = true;
      try {
        controller?.postMessage(message, [transferredPort]);
      } catch {
        closePort(transferredPort);
        finish(
          "protocol_error",
          "The parent broker could not forward the nested capability port."
        );
      }
      return;
    }

    if (event.ports.length !== 0) {
      failProtocol(
        "Only SES Worker initialization may transfer a nested capability port.",
        event.ports
      );
      return;
    }
    try {
      controller?.postMessage(message);
    } catch {
      finish(
        "protocol_error",
        "The parent broker could not forward the iframe controller request."
      );
    }
  };

  preparation.onInvalidated = () => {
    failProtocol(
      'The generated mechanic iframe changed after its trusted sandbox="allow-scripts" preparation.'
    );
  };
  parentControlPort.addEventListener("message", onControlMessage);
  parentControlPort.start();
  const acknowledgementDeadlineId = setTimeout(() => {
    finish(
      "setup_error",
      "The generated mechanic iframe controller acknowledgement timed out."
    );
  }, acknowledgementDeadlineMilliseconds);
  const bootstrap: GeneratedMechanicIframeControllerBootstrap = {
    kind: "sparkline_generated_mechanic_controller_bootstrap",
    protocolVersion:
      GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
    sessionId,
    nonce,
    sequence: 0,
  };

  try {
    capturedWindow.postMessage(bootstrap, "*", [iframeControlPort]);
    iframePortTransferred = true;
  } catch (error) {
    finish(
      "setup_error",
      error instanceof Error
        ? `The generated mechanic iframe bootstrap failed: ${error.message}`
        : "The generated mechanic iframe bootstrap failed."
    );
  }

  return Object.freeze({
    ready,
    closed,
    dispose() {
      finish("disposed", "The generated mechanic iframe broker was disposed.");
    },
  });
}

function claimPreparedIframe(iframe: HTMLIFrameElement): PreparedIframe {
  const preparation = preparedIframes.get(iframe);
  if (!preparation || preparation.claimed) {
    throw new TypeError(
      "The generated mechanic broker requires a fresh trusted pre-load iframe preparation."
    );
  }
  if (
    !preparation.valid ||
    !iframe.isConnected ||
    !hasExactAllowScriptsSandbox(iframe)
  ) {
    discardPreparation(preparation);
    throw new TypeError(
      'The generated mechanic broker requires a connected iframe with exactly sandbox="allow-scripts" that has not changed after preparation.'
    );
  }
  preparation.claimed = true;
  return preparation;
}

function isPreparedIframeCurrent(
  preparation: PreparedIframe,
  capturedWindow: Window
): boolean {
  return (
    preparation.valid &&
    preparation.iframe.isConnected &&
    preparation.iframe.contentWindow === capturedWindow &&
    hasExactAllowScriptsSandbox(preparation.iframe)
  );
}

function discardPreparation(preparation: PreparedIframe): void {
  preparation.observer.disconnect();
  preparation.onInvalidated = undefined;
  preparedIframes.delete(preparation.iframe);
}

function isAcknowledgement(
  value: unknown,
  sessionId: string,
  nonce: string
): boolean {
  return (
    hasKind(
      value,
      "sparkline_generated_mechanic_controller_acknowledgement"
    ) &&
    value.protocolVersion ===
      GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION &&
    value.sessionId === sessionId &&
    value.nonce === nonce &&
    value.sequence === 0
  );
}

function isSequencedIframeMessage(
  value: unknown,
  sessionId: string,
  nonce: string,
  sequence: number
): value is
  | GeneratedMechanicIframeControllerRequest
  | GeneratedMechanicIframeControllerTerminate {
  return (
    (hasKind(value, "sparkline_generated_mechanic_controller_request") ||
      hasKind(value, "sparkline_generated_mechanic_controller_terminate")) &&
    value.protocolVersion ===
      GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION &&
    value.sessionId === sessionId &&
    value.nonce === nonce &&
    value.sequence === sequence &&
    Number.isSafeInteger(value.sequence) &&
    value.sequence >= 1
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
    // A transferred endpoint may already be detached; local ownership still ends.
  }
}

function requireOwnerWindow(iframe: HTMLIFrameElement): Window {
  const ownerWindow = iframe.ownerDocument.defaultView;
  if (!ownerWindow) {
    throw new TypeError(
      "The generated mechanic broker iframe requires an owner Window."
    );
  }
  return ownerWindow;
}

function hasExactAllowScriptsSandbox(iframe: HTMLIFrameElement): boolean {
  const tokens = new Set(
    (iframe.getAttribute("sandbox") ?? "")
      .split(/[\t\n\f\r ]+/u)
      .filter(Boolean)
      .map(toAsciiLowercase)
  );
  return tokens.size === 1 && tokens.has("allow-scripts");
}

function toAsciiLowercase(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

function createCryptographicNonce(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error(
      "The generated mechanic broker requires crypto.randomUUID()."
    );
  }
  return crypto.randomUUID();
}
