import {
  createMechanicExecutionRealmBrowserConformanceSession,
  disposeMechanicExecutionRealmBrowserConformanceIframePreparation,
  prepareMechanicExecutionRealmBrowserConformanceIframe,
  runMechanicExecutionRealmConformanceSuite,
  type MechanicExecutionRealmConformanceReport,
  type MechanicExecutionRealmConformanceSession,
} from "@/game-spec";
import type { MechanicExecutionRealmAdapter } from "@/runtime/mechanics/mechanic-execution-realm";
import {
  createSesWorkerMechanicExecutionRealmAdapter,
  createSesWorkerMechanicExecutionRealmController,
} from "@/runtime/mechanics/ses-worker-mechanic-execution-realm";
import {
  runRuntimeAndContractFoundationGate,
  type RuntimeAndContractFoundationGateResult,
} from "@/service/runtime-and-contract-foundation-gate";

const FOUNDATION_RUNTIME_ROUTE = "/runtime/mechanic-conformance";
const FOUNDATION_IFRAME_LOAD_TIMEOUT_MS = 10_000;

type FoundationWorker = Pick<Worker, "postMessage" | "terminate"> &
  Partial<Pick<Worker, "addEventListener" | "removeEventListener">>;

type BrowserRuntimeFoundationDependencies = Readonly<{
  createRealmAdapter(): MechanicExecutionRealmAdapter;
  createWorker(): FoundationWorker;
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
  iframe.setAttribute("src", FOUNDATION_RUNTIME_ROUTE);

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
