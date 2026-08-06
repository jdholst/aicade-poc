import type { StableId } from "../game-spec-schema";
import type {
  MechanicExecutionRealmCandidateAdapter,
  MechanicExecutionRealmConformanceProbe,
  MechanicExecutionRealmProbeResult,
} from "./mechanic-execution-realm-conformance";

const CONFORMANCE_SESSION = Symbol("mechanic_execution_realm_conformance_session");
const CANDIDATE_EXECUTION_BROWSER_EVIDENCE = Symbol(
  "candidate_execution_browser_evidence"
);
const RUNTIME_HEARTBEAT_BROWSER_EVIDENCE = Symbol(
  "runtime_heartbeat_browser_evidence"
);
const DEADLINE_EXCEEDED = Symbol("conformance_session_deadline_exceeded");

export const MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION =
  "mechanic_execution_realm_browser_session/v1";

export type MechanicExecutionRealmBrowserCandidateInitialization = {
  kind: "sparkline_mechanic_conformance_candidate_initialize";
  protocolVersion: typeof MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION;
  sessionId: StableId;
  candidateEndpointId: StableId;
};

export type MechanicExecutionRealmBrowserRuntimeInitialization = {
  kind: "sparkline_mechanic_conformance_runtime_initialize";
  protocolVersion: typeof MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION;
  sessionId: StableId;
  runtimeId: StableId;
};

export type MechanicExecutionRealmBrowserCandidateRequest = {
  kind: "sparkline_mechanic_conformance_candidate_request";
  protocolVersion: typeof MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION;
  probeId: StableId;
  nonce: StableId;
  action: "execute" | "terminate";
  probe: MechanicExecutionRealmConformanceProbe;
};

export type MechanicExecutionRealmBrowserCandidateExecutionAcknowledgement = {
  kind: "sparkline_mechanic_conformance_candidate_execution_acknowledgement";
  protocolVersion: typeof MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION;
  sessionId: StableId;
  candidateEndpointId: StableId;
  probeId: StableId;
  nonce: StableId;
  action: "execute";
};

export type MechanicExecutionRealmBrowserCandidateResponse = {
  kind: "sparkline_mechanic_conformance_candidate_response";
  protocolVersion: typeof MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION;
  sessionId: StableId;
  candidateEndpointId: StableId;
  probeId: StableId;
  nonce: StableId;
  action: "execute" | "terminate";
  result: MechanicExecutionRealmProbeResult;
};

export type MechanicExecutionRealmBrowserRuntimeHeartbeatChallenge = {
  kind: "sparkline_mechanic_conformance_runtime_heartbeat_challenge";
  protocolVersion: typeof MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION;
  probeId: StableId;
  nonce: StableId;
};

export type MechanicExecutionRealmBrowserRuntimeHeartbeatResponse = {
  kind: "sparkline_mechanic_conformance_runtime_heartbeat_response";
  protocolVersion: typeof MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION;
  sessionId: StableId;
  runtimeId: StableId;
  probeId: StableId;
  nonce: StableId;
};

export type MechanicExecutionRealmBrowserCandidateEndpoint =
  | { kind: "iframe"; iframe: HTMLIFrameElement }
  | { kind: "worker"; worker: Worker };

export type CreateMechanicExecutionRealmBrowserConformanceSessionInput = {
  candidateId: StableId;
  candidateEndpoint: MechanicExecutionRealmBrowserCandidateEndpoint;
  runtimeIframe: HTMLIFrameElement;
};

export type MechanicExecutionRealmConformanceHost = {
  isResponsive(probeId: StableId): Promise<boolean>;
};

export type MechanicExecutionRealmConformanceSession = {
  readonly candidateId: StableId;
  readonly [CONFORMANCE_SESSION]: true;
  dispose(): void;
};

export type CreateMechanicExecutionRealmConformanceSessionInput = {
  candidate: MechanicExecutionRealmCandidateAdapter;
  host: MechanicExecutionRealmConformanceHost;
};

export type MechanicExecutionRealmConformanceSessionProbeEvidence = {
  responsive: boolean;
  candidateExecutionBrowserAttested: boolean;
  runtimeHeartbeatBrowserAttested: boolean;
};

export type MechanicExecutionRealmConformanceSessionState = {
  candidate: MechanicExecutionRealmCandidateAdapter;
  consumeCandidateExecutionEvidence(
    probe: MechanicExecutionRealmConformanceProbe,
    result: MechanicExecutionRealmProbeResult
  ): boolean;
  checkHostResponsiveness(
    probeId: StableId,
    deadlineMilliseconds: number
  ): Promise<MechanicExecutionRealmConformanceSessionProbeEvidence>;
  dispose(): void;
};

type BrowserSessionIdentity = object;

type CandidateExecutionBrowserEvidence = {
  [CANDIDATE_EXECUTION_BROWSER_EVIDENCE]: true;
  sessionIdentity: BrowserSessionIdentity;
  probeId: StableId;
  nonce: StableId;
};

type RuntimeHeartbeatBrowserEvidence = {
  [RUNTIME_HEARTBEAT_BROWSER_EVIDENCE]: true;
  sessionIdentity: BrowserSessionIdentity;
  probeId: StableId;
  nonce: StableId;
};

type CancellableCandidateRequest = {
  promise: Promise<MechanicExecutionRealmProbeResult>;
  cancel(): void;
};

type PreparedIframeState = {
  iframe: HTMLIFrameElement;
  ownerWindow: Window;
  observer: MutationObserver;
  valid: boolean;
  claimed: boolean;
};

type CapturedSandboxedIframe = {
  iframe: HTMLIFrameElement;
  capturedWindow: Window;
  preparation: PreparedIframeState;
};

type CapturedCandidateEndpoint =
  | ({ kind: "iframe" } & CapturedSandboxedIframe)
  | { kind: "worker"; worker: Worker };

type BrowserCandidateRequestContext = {
  endpoint: CapturedCandidateEndpoint;
  ownerWindow: Window;
  sessionIdentity: BrowserSessionIdentity;
  sessionId: StableId;
  candidateEndpointId: StableId;
  issuedNonces: Set<StableId>;
  pendingCancellations: Set<() => void>;
  candidateAcknowledgements: Map<StableId, CandidateExecutionBrowserEvidence>;
  candidateEvidence: WeakMap<
    MechanicExecutionRealmProbeResult,
    CandidateExecutionBrowserEvidence
  >;
  isDisposed(): boolean;
  disposeBrowserState(): void;
};

const sessionStates = new WeakMap<
  MechanicExecutionRealmConformanceSession,
  MechanicExecutionRealmConformanceSessionState
>();
const preparedBrowserIframes = new WeakMap<
  HTMLIFrameElement,
  PreparedIframeState
>();

export function prepareMechanicExecutionRealmBrowserConformanceIframe(
  iframe: HTMLIFrameElement
): HTMLIFrameElement {
  const ownerWindow = requireOwnerWindow(iframe);
  const browserWindow = ownerWindow as Window & typeof globalThis;
  const IframeConstructor = browserWindow.HTMLIFrameElement;

  if (!(iframe instanceof IframeConstructor)) {
    throw new TypeError(
      "Browser conformance requires an iframe from the current browser document."
    );
  }
  if (iframe.isConnected || iframe.contentWindow !== null) {
    throw new TypeError(
      "Browser conformance iframes must be prepared before they are connected or loaded."
    );
  }
  if (preparedBrowserIframes.has(iframe)) {
    throw new TypeError("The browser conformance iframe is already prepared.");
  }

  iframe.setAttribute("sandbox", "allow-scripts");
  const preparation = {} as PreparedIframeState;
  const observer = new browserWindow.MutationObserver(() => {
    preparation.valid = false;
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
  preparedBrowserIframes.set(iframe, preparation);

  return iframe;
}

export function disposeMechanicExecutionRealmBrowserConformanceIframePreparation(
  iframe: HTMLIFrameElement
): void {
  const preparation = preparedBrowserIframes.get(iframe);
  if (preparation) {
    discardPreparedIframe(preparation);
  }
}

export function createMechanicExecutionRealmConformanceSession({
  candidate,
  host,
}: CreateMechanicExecutionRealmConformanceSessionInput): MechanicExecutionRealmConformanceSession {
  let disposed = false;
  const session = Object.freeze({
    candidateId: candidate.id,
    [CONFORMANCE_SESSION]: true as const,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      sessionStates.delete(session);
    },
  });

  sessionStates.set(session, Object.freeze({
    candidate,
    consumeCandidateExecutionEvidence() {
      return false;
    },
    async checkHostResponsiveness(probeId, deadlineMilliseconds) {
      if (disposed) {
        return noBrowserEvidence(false);
      }

      try {
        const responsiveness = await raceAgainstDeadline(
          host.isResponsive(probeId),
          deadlineMilliseconds
        );

        return noBrowserEvidence(
          responsiveness !== DEADLINE_EXCEEDED && responsiveness === true
        );
      } catch {
        return noBrowserEvidence(false);
      }
    },
    dispose() {
      session.dispose();
    },
  }));

  return session;
}

export function createMechanicExecutionRealmBrowserConformanceSession({
  candidateId,
  candidateEndpoint,
  runtimeIframe,
}: CreateMechanicExecutionRealmBrowserConformanceSessionInput): MechanicExecutionRealmConformanceSession {
  const ownerWindow = requireOwnerWindow(runtimeIframe);
  const capturedRuntime = requireSandboxedIframe(runtimeIframe, ownerWindow);
  const runtimeWindow = capturedRuntime.capturedWindow;
  let capturedCandidate: CapturedCandidateEndpoint;
  try {
    capturedCandidate = captureCandidateEndpoint(
      candidateEndpoint,
      runtimeIframe,
      runtimeWindow,
      ownerWindow
    );
  } catch (error) {
    discardPreparedIframe(capturedRuntime.preparation);
    throw error;
  }
  const discardCapturedIframes = () => {
    discardPreparedIframe(capturedRuntime.preparation);
    if (capturedCandidate.kind === "iframe") {
      discardPreparedIframe(capturedCandidate.preparation);
    }
  };
  const sessionIdentity = Object.freeze({});
  const issuedNonces = new Set<StableId>();
  let sessionId: StableId;
  let candidateEndpointId: StableId;
  let runtimeId: StableId;
  try {
    sessionId = createCryptographicNonce(ownerWindow.crypto, issuedNonces);
    candidateEndpointId = createCryptographicNonce(
      ownerWindow.crypto,
      issuedNonces
    );
    runtimeId = createCryptographicNonce(ownerWindow.crypto, issuedNonces);
  } catch (error) {
    discardCapturedIframes();
    throw error;
  }
  const candidateEvidence = new WeakMap<
    MechanicExecutionRealmProbeResult,
    CandidateExecutionBrowserEvidence
  >();
  const candidateAcknowledgements = new Map<
    StableId,
    CandidateExecutionBrowserEvidence
  >();
  const pendingCancellations = new Set<() => void>();
  let disposed = false;

  const disposeBrowserState = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    for (const cancel of [...pendingCancellations]) {
      cancel();
    }
    pendingCancellations.clear();
    candidateAcknowledgements.clear();
    issuedNonces.clear();
    discardCapturedIframes();
    sessionStates.delete(session);
  };
  const candidateRequestContext: BrowserCandidateRequestContext = Object.freeze({
    endpoint: capturedCandidate,
    ownerWindow,
    sessionIdentity,
    sessionId,
    candidateEndpointId,
    issuedNonces,
    pendingCancellations,
    candidateAcknowledgements,
    candidateEvidence,
    isDisposed: () => disposed,
    disposeBrowserState,
  });

  const candidate: MechanicExecutionRealmCandidateAdapter = Object.freeze({
    id: candidateId,
    environment: "browser",
    start(probe) {
      const executionRequest = requestCandidate(
        "execute",
        probe,
        candidateRequestContext
      );
      let terminationRequest: CancellableCandidateRequest | undefined;

      return {
        result: executionRequest.promise,
        terminate() {
          executionRequest.cancel();
          terminationRequest = requestCandidate(
            "terminate",
            probe,
            candidateRequestContext
          );
          return terminationRequest.promise;
        },
        dispose() {
          executionRequest.cancel();
          terminationRequest?.cancel();
        },
      };
    },
  });
  const candidateInitialization: MechanicExecutionRealmBrowserCandidateInitialization = {
    kind: "sparkline_mechanic_conformance_candidate_initialize",
    protocolVersion: MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
    sessionId,
    candidateEndpointId,
  };
  const runtimeInitialization: MechanicExecutionRealmBrowserRuntimeInitialization = {
    kind: "sparkline_mechanic_conformance_runtime_initialize",
    protocolVersion: MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
    sessionId,
    runtimeId,
  };
  const session: MechanicExecutionRealmConformanceSession = Object.freeze({
    candidateId,
    [CONFORMANCE_SESSION]: true as const,
    dispose: disposeBrowserState,
  });

  try {
    postToCandidate(capturedCandidate, candidateInitialization);
    if (
      !isCurrentSandboxedIframe(
        capturedRuntime.iframe,
        capturedRuntime.capturedWindow,
        capturedRuntime.preparation
      )
    ) {
      throw new Error(
        "The captured runtime iframe changed after trusted pre-load preparation."
      );
    }
    runtimeWindow.postMessage(runtimeInitialization, "*");
  } catch (error) {
    disposeBrowserState();
    throw error;
  }

  sessionStates.set(session, Object.freeze({
    candidate,
    consumeCandidateExecutionEvidence(probe, result) {
      const evidence = candidateEvidence.get(result);
      candidateEvidence.delete(result);

      return (
        evidence?.[CANDIDATE_EXECUTION_BROWSER_EVIDENCE] === true &&
        evidence.sessionIdentity === sessionIdentity &&
        evidence.probeId === probe.id &&
        evidence.nonce.length > 0
      );
    },
    checkHostResponsiveness(probeId, deadlineMilliseconds) {
      return requestRuntimeHeartbeat({
        probeId,
        deadlineMilliseconds,
        runtimeIframe,
        runtimeWindow,
        runtimePreparation: capturedRuntime.preparation,
        ownerWindow,
        sessionIdentity,
        sessionId,
        runtimeId,
        issuedNonces,
        pendingCancellations,
        isDisposed: () => disposed,
        disposeBrowserState,
      });
    },
    dispose: disposeBrowserState,
  }));

  return session;
}

export function consumeMechanicExecutionRealmConformanceSessionState(
  session: MechanicExecutionRealmConformanceSession
): MechanicExecutionRealmConformanceSessionState | undefined {
  const state = sessionStates.get(session);
  if (state) {
    sessionStates.delete(session);
  }
  return state;
}

function noBrowserEvidence(
  responsive: boolean
): MechanicExecutionRealmConformanceSessionProbeEvidence {
  return {
    responsive,
    candidateExecutionBrowserAttested: false,
    runtimeHeartbeatBrowserAttested: false,
  };
}

async function raceAgainstDeadline<T>(
  value: Promise<T>,
  milliseconds: number
): Promise<T | typeof DEADLINE_EXCEEDED> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      value,
      new Promise<typeof DEADLINE_EXCEEDED>((resolve) => {
        timeoutId = setTimeout(() => resolve(DEADLINE_EXCEEDED), milliseconds);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function requireOwnerWindow(iframe: HTMLIFrameElement): Window {
  const ownerWindow = iframe.ownerDocument?.defaultView;

  if (!ownerWindow) {
    discardUnclaimedPreparedIframe(iframe);
    throw new TypeError(
      "Browser conformance requires an iframe attached to a live browser document."
    );
  }

  return ownerWindow;
}

function requireSandboxedIframe(
  iframe: HTMLIFrameElement,
  ownerWindow: Window
): CapturedSandboxedIframe {
  const browserWindow = ownerWindow as Window & typeof globalThis;
  const IframeConstructor = browserWindow.HTMLIFrameElement;

  if (!(iframe instanceof IframeConstructor) || !iframe.isConnected) {
    discardUnclaimedPreparedIframe(iframe);
    throw new TypeError(
      "Browser conformance requires a connected, captured iframe element."
    );
  }

  if (!hasExactAllowScriptsSandbox(iframe)) {
    const invalidPreparation = preparedBrowserIframes.get(iframe);
    if (invalidPreparation) {
      discardPreparedIframe(invalidPreparation);
    }
    throw new TypeError(
      'Browser conformance iframes must use exactly sandbox="allow-scripts".'
    );
  }

  const preparation = preparedBrowserIframes.get(iframe);
  if (
    !preparation ||
    preparation.ownerWindow !== ownerWindow ||
    preparation.claimed
  ) {
    if (preparation && !preparation.claimed) {
      discardPreparedIframe(preparation);
    }
    throw new TypeError(
      "Browser conformance iframes require trusted pre-load preparation."
    );
  }
  refreshPreparedIframe(preparation);
  if (!preparation.valid) {
    discardPreparedIframe(preparation);
    throw new TypeError(
      "Browser conformance iframe sandbox changed after trusted pre-load preparation."
    );
  }

  const iframeWindow = iframe.contentWindow;
  if (!iframeWindow) {
    discardPreparedIframe(preparation);
    throw new TypeError("Browser conformance could not capture the iframe window.");
  }

  preparation.claimed = true;
  return { iframe, capturedWindow: iframeWindow, preparation };
}

function hasExactAllowScriptsSandbox(iframe: HTMLIFrameElement): boolean {
  const sandbox = iframe.getAttribute("sandbox");
  if (sandbox === null) {
    return false;
  }

  const sandboxTokens = new Set(
    sandbox
      .split(/[\t\n\f\r ]+/u)
      .filter((token) => token.length > 0)
      .map(toAsciiLowercase)
  );
  return sandboxTokens.size === 1 && sandboxTokens.has("allow-scripts");
}

function toAsciiLowercase(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

function refreshPreparedIframe(preparation: PreparedIframeState): void {
  if (preparation.observer.takeRecords().length > 0) {
    preparation.valid = false;
  }
}

function discardPreparedIframe(preparation: PreparedIframeState): void {
  preparation.valid = false;
  preparation.observer.disconnect();
  if (preparedBrowserIframes.get(preparation.iframe) === preparation) {
    preparedBrowserIframes.delete(preparation.iframe);
  }
}

function discardUnclaimedPreparedIframe(iframe: HTMLIFrameElement): void {
  const preparation = preparedBrowserIframes.get(iframe);
  if (preparation && !preparation.claimed) {
    discardPreparedIframe(preparation);
  }
}

function isCurrentSandboxedIframe(
  iframe: HTMLIFrameElement,
  capturedWindow: Window,
  preparation: PreparedIframeState
): boolean {
  refreshPreparedIframe(preparation);
  return (
    preparation.valid &&
    preparation.claimed &&
    preparation.iframe === iframe &&
    preparedBrowserIframes.get(iframe) === preparation &&
    iframe.isConnected &&
    iframe.contentWindow === capturedWindow &&
    hasExactAllowScriptsSandbox(iframe)
  );
}

function captureCandidateEndpoint(
  endpoint: MechanicExecutionRealmBrowserCandidateEndpoint,
  runtimeIframe: HTMLIFrameElement,
  runtimeWindow: Window,
  ownerWindow: Window
): CapturedCandidateEndpoint {
  if (endpoint.kind === "iframe") {
    if (endpoint.iframe === runtimeIframe) {
      throw new TypeError(
        "The whole-game runtime iframe cannot also be the Mechanic Execution Realm candidate endpoint."
      );
    }
    const capturedCandidate = requireSandboxedIframe(
      endpoint.iframe,
      ownerWindow
    );

    if (capturedCandidate.capturedWindow === runtimeWindow) {
      discardPreparedIframe(capturedCandidate.preparation);
      throw new TypeError(
        "The whole-game runtime iframe cannot also be the Mechanic Execution Realm candidate endpoint."
      );
    }

    return Object.freeze({
      kind: "iframe" as const,
      ...capturedCandidate,
    });
  }

  const browserWindow = ownerWindow as Window & typeof globalThis;
  const WorkerConstructor = browserWindow.Worker;
  if (
    typeof WorkerConstructor !== "function" ||
    !(endpoint.worker instanceof WorkerConstructor)
  ) {
    throw new TypeError(
      "Browser conformance requires a native Worker captured from the current browser session."
    );
  }

  return Object.freeze({ kind: "worker" as const, worker: endpoint.worker });
}

function createCryptographicNonce(
  cryptoSource: Crypto,
  issuedNonces: Set<StableId>
): StableId {
  if (typeof cryptoSource?.getRandomValues !== "function") {
    throw new TypeError(
      "Browser conformance requires cryptographically secure randomness."
    );
  }

  let nonce: StableId;
  do {
    const bytes = cryptoSource.getRandomValues(new Uint8Array(32));
    nonce = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  } while (issuedNonces.has(nonce));

  issuedNonces.add(nonce);
  return nonce;
}

function requestCandidate(
  action: MechanicExecutionRealmBrowserCandidateRequest["action"],
  probe: MechanicExecutionRealmConformanceProbe,
  context: BrowserCandidateRequestContext
): CancellableCandidateRequest {
  if (context.isDisposed()) {
    return {
      promise: Promise.reject(new Error("Browser conformance session is disposed.")),
      cancel() {},
    };
  }

  const nonce = createCryptographicNonce(
    context.ownerWindow.crypto,
    context.issuedNonces
  );
  const request: MechanicExecutionRealmBrowserCandidateRequest = {
    kind: "sparkline_mechanic_conformance_candidate_request",
    protocolVersion: MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
    probeId: probe.id,
    nonce,
    action,
    probe,
  };
  let cancel: () => void = () => undefined;
  const promise = new Promise<MechanicExecutionRealmProbeResult>(
    (resolve, reject) => {
      const eventTarget =
        context.endpoint.kind === "iframe"
          ? context.ownerWindow
          : context.endpoint.worker;
      const cleanup = () => {
        eventTarget.removeEventListener("message", onMessage as EventListener);
        context.pendingCancellations.delete(cancel);
      };
      cancel = cleanup;
      const onMessage = (event: MessageEvent<unknown>) => {
        if (
          event.isTrusted &&
          context.endpoint.kind === "iframe" &&
          event.source === context.endpoint.capturedWindow &&
          (event.origin !== "null" ||
            !isCurrentSandboxedIframe(
              context.endpoint.iframe,
              context.endpoint.capturedWindow,
              context.endpoint.preparation
            ))
        ) {
          cleanup();
          context.disposeBrowserState();
          reject(
            new Error(
              "The captured candidate iframe endpoint was replaced, its sandbox policy changed, or its document is not opaque-origin sandboxed."
            )
          );
          return;
        }

        if (
          !event.isTrusted ||
          !isCurrentCandidateEvent(
            event,
            context.endpoint,
            context.ownerWindow
          )
        ) {
          return;
        }

        if (isCandidateExecutionAcknowledgement(event.data)) {
          if (
            action !== "execute" ||
            !isMatchingCandidateExecutionAcknowledgement(
              event.data,
              request,
              context.sessionId,
              context.candidateEndpointId
            )
          ) {
            cleanup();
            context.disposeBrowserState();
            reject(new Error("Candidate execution acknowledgement did not match the active probe."));
            return;
          }

          context.candidateAcknowledgements.set(probe.id, {
            [CANDIDATE_EXECUTION_BROWSER_EVIDENCE]: true,
            sessionIdentity: context.sessionIdentity,
            probeId: probe.id,
            nonce,
          });
          return;
        }

        if (isCandidateResponse(event.data)) {
          if (
            !isMatchingCandidateResponse(
              event.data,
              request,
              context.sessionId,
              context.candidateEndpointId
            )
          ) {
            cleanup();
            context.disposeBrowserState();
            reject(new Error("Candidate response did not match the active probe."));
            return;
          }
        } else {
          return;
        }

        const response = event.data;
        if (!isProbeResult(response.result, probe.id)) {
          return;
        }

        cleanup();
        const evidence = context.candidateAcknowledgements.get(probe.id);
        context.candidateAcknowledgements.delete(probe.id);
        if (
          evidence?.[CANDIDATE_EXECUTION_BROWSER_EVIDENCE] === true &&
          evidence.sessionIdentity === context.sessionIdentity &&
          evidence.probeId === probe.id &&
          (action === "terminate" || evidence.nonce === nonce)
        ) {
          context.candidateEvidence.set(response.result, evidence);
        }
        resolve(response.result);
      };

      eventTarget.addEventListener("message", onMessage as EventListener);
      context.pendingCancellations.add(cancel);

      try {
        postToCandidate(context.endpoint, request);
      } catch (error) {
        cleanup();
        context.disposeBrowserState();
        reject(error);
      }
    }
  );

  return { promise, cancel: () => cancel() };
}

type RuntimeHeartbeatRequestInput = {
  probeId: StableId;
  deadlineMilliseconds: number;
  runtimeIframe: HTMLIFrameElement;
  runtimeWindow: Window;
  runtimePreparation: PreparedIframeState;
  ownerWindow: Window;
  sessionIdentity: BrowserSessionIdentity;
  sessionId: StableId;
  runtimeId: StableId;
  issuedNonces: Set<StableId>;
  pendingCancellations: Set<() => void>;
  isDisposed(): boolean;
  disposeBrowserState(): void;
};

function requestRuntimeHeartbeat({
  probeId,
  deadlineMilliseconds,
  runtimeIframe,
  runtimeWindow,
  runtimePreparation,
  ownerWindow,
  sessionIdentity,
  sessionId,
  runtimeId,
  issuedNonces,
  pendingCancellations,
  isDisposed,
  disposeBrowserState,
}: RuntimeHeartbeatRequestInput): Promise<MechanicExecutionRealmConformanceSessionProbeEvidence> {
  if (isDisposed()) {
    return Promise.resolve(noBrowserEvidence(false));
  }

  const nonce = createCryptographicNonce(ownerWindow.crypto, issuedNonces);
  const challenge: MechanicExecutionRealmBrowserRuntimeHeartbeatChallenge = {
    kind: "sparkline_mechanic_conformance_runtime_heartbeat_challenge",
    protocolVersion: MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
    probeId,
    nonce,
  };

  return new Promise((resolve) => {
    const cleanup = () => {
      ownerWindow.removeEventListener("message", onMessage);
      clearTimeout(timeoutId);
      pendingCancellations.delete(cancel);
    };
    const finish = (
      evidence: MechanicExecutionRealmConformanceSessionProbeEvidence
    ) => {
      cleanup();
      resolve(evidence);
    };
    const cancel = () => finish(noBrowserEvidence(false));
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        event.isTrusted &&
        event.source === runtimeWindow &&
        (event.origin !== "null" ||
          !isCurrentSandboxedIframe(
            runtimeIframe,
            runtimeWindow,
            runtimePreparation
          ))
      ) {
        cleanup();
        disposeBrowserState();
        resolve(noBrowserEvidence(false));
        return;
      }

      if (
        !event.isTrusted ||
        event.source !== runtimeWindow ||
        event.origin !== "null" ||
        !isCurrentSandboxedIframe(
          runtimeIframe,
          runtimeWindow,
          runtimePreparation
        ) ||
        !isMatchingRuntimeHeartbeatResponse(
          event.data,
          challenge,
          sessionId,
          runtimeId
        )
      ) {
        return;
      }

      const evidence: RuntimeHeartbeatBrowserEvidence = {
        [RUNTIME_HEARTBEAT_BROWSER_EVIDENCE]: true,
        sessionIdentity,
        probeId,
        nonce,
      };
      finish({
        responsive: true,
        candidateExecutionBrowserAttested: false,
        runtimeHeartbeatBrowserAttested:
          evidence[RUNTIME_HEARTBEAT_BROWSER_EVIDENCE] === true &&
          evidence.sessionIdentity === sessionIdentity &&
          evidence.probeId === probeId &&
          evidence.nonce === nonce,
      });
    };

    ownerWindow.addEventListener("message", onMessage);
    pendingCancellations.add(cancel);
    const timeoutId = setTimeout(
      () => finish(noBrowserEvidence(false)),
      deadlineMilliseconds
    );

    try {
      if (
        !isCurrentSandboxedIframe(
          runtimeIframe,
          runtimeWindow,
          runtimePreparation
        )
      ) {
        disposeBrowserState();
        finish(noBrowserEvidence(false));
        return;
      }
      runtimeWindow.postMessage(challenge, "*");
    } catch {
      cleanup();
      disposeBrowserState();
      resolve(noBrowserEvidence(false));
    }
  });
}

function postToCandidate(
  endpoint: CapturedCandidateEndpoint,
  request:
    | MechanicExecutionRealmBrowserCandidateInitialization
    | MechanicExecutionRealmBrowserCandidateRequest
) {
  if (endpoint.kind === "iframe") {
    if (
      !isCurrentSandboxedIframe(
        endpoint.iframe,
        endpoint.capturedWindow,
        endpoint.preparation
      )
    ) {
      throw new Error(
        "The captured candidate iframe endpoint was replaced or its sandbox policy changed."
      );
    }
    endpoint.capturedWindow.postMessage(request, "*");
    return;
  }

  endpoint.worker.postMessage(request);
}

function isCurrentCandidateEvent(
  event: MessageEvent<unknown>,
  endpoint: CapturedCandidateEndpoint,
  ownerWindow: Window
): boolean {
  if (endpoint.kind === "iframe") {
    return (
      event.currentTarget === ownerWindow &&
      event.source === endpoint.capturedWindow &&
      event.origin === "null" &&
      isCurrentSandboxedIframe(
        endpoint.iframe,
        endpoint.capturedWindow,
        endpoint.preparation
      )
    );
  }

  return event.currentTarget === endpoint.worker;
}

function isCandidateExecutionAcknowledgement(
  value: unknown
): value is MechanicExecutionRealmBrowserCandidateExecutionAcknowledgement {
  return (
    isRecord(value) &&
    value.kind ===
      "sparkline_mechanic_conformance_candidate_execution_acknowledgement" &&
    value.protocolVersion ===
      MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION
  );
}

function isMatchingCandidateExecutionAcknowledgement(
  value: MechanicExecutionRealmBrowserCandidateExecutionAcknowledgement,
  request: MechanicExecutionRealmBrowserCandidateRequest,
  sessionId: StableId,
  candidateEndpointId: StableId
): boolean {
  return (
    request.action === "execute" &&
    value.sessionId === sessionId &&
    value.candidateEndpointId === candidateEndpointId &&
    value.probeId === request.probeId &&
    value.nonce === request.nonce &&
    value.action === "execute"
  );
}

function isCandidateResponse(
  value: unknown
): value is MechanicExecutionRealmBrowserCandidateResponse {
  return (
    isRecord(value) &&
    value.kind === "sparkline_mechanic_conformance_candidate_response" &&
    value.protocolVersion ===
      MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION
  );
}

function isMatchingCandidateResponse(
  value: unknown,
  request: MechanicExecutionRealmBrowserCandidateRequest,
  sessionId: StableId,
  candidateEndpointId: StableId
): value is MechanicExecutionRealmBrowserCandidateResponse {
  return (
    isRecord(value) &&
    value.kind === "sparkline_mechanic_conformance_candidate_response" &&
    value.protocolVersion ===
      MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION &&
    value.sessionId === sessionId &&
    value.candidateEndpointId === candidateEndpointId &&
    value.probeId === request.probeId &&
    value.nonce === request.nonce &&
    value.action === request.action
  );
}

function isMatchingRuntimeHeartbeatResponse(
  value: unknown,
  challenge: MechanicExecutionRealmBrowserRuntimeHeartbeatChallenge,
  sessionId: StableId,
  runtimeId: StableId
): value is MechanicExecutionRealmBrowserRuntimeHeartbeatResponse {
  return (
    isRecord(value) &&
    value.kind ===
      "sparkline_mechanic_conformance_runtime_heartbeat_response" &&
    value.protocolVersion ===
      MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION &&
    value.sessionId === sessionId &&
    value.runtimeId === runtimeId &&
    value.probeId === challenge.probeId &&
    value.nonce === challenge.nonce
  );
}

function isProbeResult(
  value: unknown,
  probeId: StableId
): value is MechanicExecutionRealmProbeResult {
  return (
    isRecord(value) &&
    value.probeId === probeId &&
    ["completed", "rejected", "terminated", "resource_limit", "failed"].includes(
      String(value.outcome)
    ) &&
    typeof value.durationMilliseconds === "number" &&
    Number.isFinite(value.durationMilliseconds) &&
    value.durationMilliseconds >= 0 &&
    isRecord(value.evidence)
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}
