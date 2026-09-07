import {
  createMechanicExecutionRealmBrowserConformanceSession,
  disposeMechanicExecutionRealmBrowserConformanceIframePreparation,
  MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
  prepareMechanicExecutionRealmBrowserConformanceIframe,
  runMechanicExecutionRealmConformanceSuite,
  type MechanicExecutionRealmConformanceReport,
  type MechanicExecutionRealmConformanceSession,
} from "@/game-spec";
import type { MechanicExecutionRealmAdapter } from "@/runtime/mechanics/mechanic-execution-realm";
import {
  createSesWorkerMechanicExecutionRealmAdapter,
  createSesWorkerMechanicExecutionRealmController,
  waitForSesWorkerMechanicExecutionRealmControllerReady,
  type SesWorkerMechanicExecutionRealmController,
} from "@/runtime/mechanics/ses-worker-mechanic-execution-realm";
import {
  runRuntimeAndContractFoundationGate,
  type RuntimeAndContractFoundationGateResult,
} from "@/service/runtime-and-contract-foundation-gate";

const FOUNDATION_IFRAME_LOAD_TIMEOUT_MS = 10_000;

type FoundationWorker = Pick<Worker, "postMessage" | "terminate"> &
  Partial<Pick<Worker, "addEventListener" | "removeEventListener">>;

type BrowserRuntimeFoundationDependencies = Readonly<{
  createRealmAdapter(): MechanicExecutionRealmAdapter;
  createWorker(): FoundationWorker;
  waitForWorkerReady(worker: FoundationWorker): Promise<void>;
  prepareIframe(iframe: HTMLIFrameElement): HTMLIFrameElement;
  disposeIframePreparation(iframe: HTMLIFrameElement): void;
  loadIframe(input: Readonly<{
    iframe: HTMLIFrameElement;
    ownerDocument: Document;
    ownerWindow: Window;
  }>): Promise<HTMLIFrameElement>;
  createBrowserSession(input: Readonly<{
    candidateId: MechanicExecutionRealmAdapter["id"];
    candidateEndpoint: Readonly<{ kind: "worker"; worker: Worker }>;
    runtimeIframe: HTMLIFrameElement;
  }>): MechanicExecutionRealmConformanceSession;
  runConformance(input: Readonly<{
    session: MechanicExecutionRealmConformanceSession;
  }>): Promise<MechanicExecutionRealmConformanceReport>;
  runFoundationGate(input: Readonly<{
    realmAdapter: MechanicExecutionRealmAdapter;
    realmConformanceReport: MechanicExecutionRealmConformanceReport;
  }>): Promise<RuntimeAndContractFoundationGateResult>;
}>;

export type BrowserRuntimeFoundation = Readonly<{
  gateResult: RuntimeAndContractFoundationGateResult;
  realmAdapter: MechanicExecutionRealmAdapter;
}>;

export type CreateBrowserRuntimeFoundationInput = Readonly<{
  ownerDocument?: Document;
  ownerWindow?: Window;
  dependencies?: BrowserRuntimeFoundationDependencies;
}>;

const defaultDependencies: BrowserRuntimeFoundationDependencies =
  Object.freeze({
    createRealmAdapter: createSesWorkerMechanicExecutionRealmAdapter,
    createWorker: createSesWorkerMechanicExecutionRealmController,
    waitForWorkerReady: (worker) =>
      waitForSesWorkerMechanicExecutionRealmControllerReady(
        worker as SesWorkerMechanicExecutionRealmController
      ),
    prepareIframe:
      prepareMechanicExecutionRealmBrowserConformanceIframe,
    disposeIframePreparation:
      disposeMechanicExecutionRealmBrowserConformanceIframePreparation,
    loadIframe: loadTrustedFoundationIframe,
    createBrowserSession: ({
      candidateEndpoint,
      ...input
    }) =>
      createMechanicExecutionRealmBrowserConformanceSession({
        ...input,
        candidateEndpoint,
      }),
    runConformance: runMechanicExecutionRealmConformanceSuite,
    runFoundationGate: runRuntimeAndContractFoundationGate,
  });

/**
 * Produces the live browser-only authority needed by source generation. The
 * conformance Worker and heartbeat iframe are probes and are always disposed;
 * the returned adapter creates fresh isolated Workers for admitted artifacts.
 */
export async function createBrowserRuntimeFoundation({
  ownerDocument = requireDocument(),
  ownerWindow = requireWindow(),
  dependencies = defaultDependencies,
}: CreateBrowserRuntimeFoundationInput = {}): Promise<BrowserRuntimeFoundation> {
  const realmAdapter = dependencies.createRealmAdapter();
  const worker = dependencies.createWorker();
  const iframe = dependencies.prepareIframe(
    ownerDocument.createElement("iframe")
  );
  let loadedIframe: HTMLIFrameElement | undefined;
  let session: MechanicExecutionRealmConformanceSession | undefined;

  try {
    await dependencies.waitForWorkerReady(worker);
    loadedIframe = await dependencies.loadIframe({
      iframe,
      ownerDocument,
      ownerWindow,
    });
    session = dependencies.createBrowserSession({
      candidateId: realmAdapter.id,
      candidateEndpoint: {
        kind: "worker",
        worker: worker as Worker,
      },
      runtimeIframe: loadedIframe,
    });
    const realmConformanceReport = await dependencies.runConformance({
      session,
    });
    const gateResult = await dependencies.runFoundationGate({
      realmAdapter,
      realmConformanceReport,
    });

    return Object.freeze({ gateResult, realmAdapter });
  } finally {
    session?.dispose();
    worker.terminate();
    loadedIframe?.remove();
    iframe.remove();
    dependencies.disposeIframePreparation(iframe);
  }
}

async function loadTrustedFoundationIframe({
  iframe,
  ownerDocument,
  ownerWindow,
}: Readonly<{
  iframe: HTMLIFrameElement;
  ownerDocument: Document;
  ownerWindow: Window;
}>): Promise<HTMLIFrameElement> {
  const mount = ownerDocument.body;
  if (!mount) {
    throw new Error(
      "The browser Runtime and Contract Foundation Gate requires a document body."
    );
  }

  iframe.title = "Generated mechanic runtime conformance";
  iframe.hidden = true;
  iframe.setAttribute("aria-hidden", "true");
  iframe.srcdoc = createMechanicConformanceRuntimeDocument();

  return new Promise((resolve, reject) => {
    const clear = () => {
      ownerWindow.clearTimeout(timeoutId);
      iframe.removeEventListener("load", onLoad);
      iframe.removeEventListener("error", onError);
    };
    const onLoad = () => {
      clear();
      resolve(iframe);
    };
    const onError = () => {
      clear();
      reject(
        new Error(
          "The trusted generated-mechanic conformance runtime failed to load."
        )
      );
    };
    const timeoutId = ownerWindow.setTimeout(() => {
      clear();
      reject(
        new Error(
          "The trusted generated-mechanic conformance runtime timed out while loading."
        )
      );
    }, FOUNDATION_IFRAME_LOAD_TIMEOUT_MS);

    iframe.addEventListener("load", onLoad, { once: true });
    iframe.addEventListener("error", onError, { once: true });
    mount.append(iframe);
  });
}

/**
 * Installs the runtime half of the browser-attested heartbeat protocol without
 * importing application code. Keeping every helper inside this function makes
 * its source safe to embed in the isolated srcdoc below.
 */
export function installMechanicConformanceRuntimeHeartbeat(
  ownerWindow: Window,
  protocolVersion: string
): () => void {
  const expectedParent = ownerWindow.parent;
  let disposed = false;
  let identity:
    | Readonly<{ parentOrigin: string; runtimeId: string; sessionId: string }>
    | undefined;

  const isNonemptyString = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0;
  const isExactRecord = (
    value: unknown,
    keys: readonly string[]
  ): value is Record<string, unknown> => {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const ownKeys = Object.keys(value).sort();
    const expectedKeys = [...keys].sort();
    return (
      ownKeys.length === expectedKeys.length &&
      ownKeys.every((key, index) => key === expectedKeys[index])
    );
  };
  const isInitialization = (
    value: unknown
  ): value is Record<string, unknown> & {
    runtimeId: string;
    sessionId: string;
  } =>
    isExactRecord(value, [
      "kind",
      "protocolVersion",
      "sessionId",
      "runtimeId",
    ]) &&
    value.kind === "sparkline_mechanic_conformance_runtime_initialize" &&
    value.protocolVersion === protocolVersion &&
    isNonemptyString(value.sessionId) &&
    isNonemptyString(value.runtimeId);
  const isChallenge = (
    value: unknown
  ): value is Record<string, unknown> & { nonce: string; probeId: string } =>
    isExactRecord(value, ["kind", "protocolVersion", "probeId", "nonce"]) &&
    value.kind ===
      "sparkline_mechanic_conformance_runtime_heartbeat_challenge" &&
    value.protocolVersion === protocolVersion &&
    isNonemptyString(value.probeId) &&
    isNonemptyString(value.nonce);
  const onMessage = (event: MessageEvent<unknown>) => {
    if (disposed || event.source !== expectedParent) {
      return;
    }

    if (!identity && isInitialization(event.data)) {
      identity = Object.freeze({
        parentOrigin: event.origin,
        runtimeId: event.data.runtimeId,
        sessionId: event.data.sessionId,
      });
      expectedParent.postMessage(
        {
          kind: "sparkline_mechanic_conformance_runtime_initialized",
          protocolVersion,
          sessionId: identity.sessionId,
          runtimeId: identity.runtimeId,
        },
        identity.parentOrigin
      );
      return;
    }

    if (
      !identity ||
      event.origin !== identity.parentOrigin ||
      !isChallenge(event.data)
    ) {
      return;
    }

    expectedParent.postMessage(
      {
        kind: "sparkline_mechanic_conformance_runtime_heartbeat_response",
        protocolVersion,
        sessionId: identity.sessionId,
        runtimeId: identity.runtimeId,
        probeId: event.data.probeId,
        nonce: event.data.nonce,
      },
      identity.parentOrigin
    );
  };

  ownerWindow.addEventListener("message", onMessage);
  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    identity = undefined;
    ownerWindow.removeEventListener("message", onMessage);
  };
}

export function createMechanicConformanceRuntimeDocument(): string {
  const installerSource = installMechanicConformanceRuntimeHeartbeat.toString();
  const protocolVersion = JSON.stringify(
    MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION
  );

  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'"><title>Mechanic conformance heartbeat</title></head><body><script>(${installerSource})(window,${protocolVersion});</script></body></html>`;
}

function requireDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("Generated mechanic continuation requires a browser document.");
  }
  return document;
}

function requireWindow(): Window {
  if (typeof window === "undefined") {
    throw new Error("Generated mechanic continuation requires a browser window.");
  }
  return window;
}
