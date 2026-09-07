import { SANDBOX_BOOT_TIMEOUT_MS } from "@/constants";
import type { PreparedGeneratedMechanicRuntimeProject } from "@/game-spec";
import {
  createGeneratedMechanicIframeSesWorkerBroker,
  disposeGeneratedMechanicIframeSesWorkerBrokerPreparation,
  prepareGeneratedMechanicIframeSesWorkerBrokerIframe,
  type GeneratedMechanicIframeSesWorkerBroker,
} from "@/runtime/mechanics/generated-mechanic-iframe-ses-worker-broker";
import {
  createRuntimeHostStatusFromEvent,
  parseRuntimeEvent,
  type RuntimeCommand,
  type RuntimeHostStatus,
  type RuntimeValidationEvidence,
  type RuntimeValidationEvidenceCheckId,
} from "@/runtime/runtime-adapter";

import {
  createGeneratedMechanicPhaserParentSession,
  type GeneratedMechanicPhaserParentSession,
} from "./generated-mechanic-phaser-host-protocol";
import type { HandAuthoredPhaserTemplate } from "./top-down-template";

const GENERATED_MECHANIC_PHASER_RUNTIME_ROUTE = "/runtime/phaser-generated";
const BROKER_CLOSE_CAUSAL_EVENT_GRACE_MS = 100;
const FIRST_PLAYABLE_CHECK_IDS = [
  "nonblank_render",
  "player_visible",
  "input_response",
] as const satisfies readonly RuntimeValidationEvidenceCheckId[];

function findExactGeneratedActionId(
  project: PreparedGeneratedMechanicRuntimeProject
): string | undefined {
  const scenarioActionIds = project.dependency.contract.scenarios.map(
    (scenario) =>
      scenario.steps.flatMap((step) =>
        step.kind === "dispatch_action" ? [step.actionId] : []
      )
  );
  const firstActionId = scenarioActionIds[0]?.[0];
  return firstActionId &&
    scenarioActionIds.length > 0 &&
    scenarioActionIds.every(
      (actionIds) => actionIds.length === 1 && actionIds[0] === firstActionId
    )
    ? firstActionId
    : undefined;
}

function hasExactAutonomousInstallContract(
  project: PreparedGeneratedMechanicRuntimeProject
): boolean {
  const { contract } = project.dependency;
  return (
    contract.behavior.triggers.length === 1 &&
    contract.behavior.triggers[0] === "install" &&
    contract.lifecycle.callbacks.includes("install") &&
    !contract.lifecycle.callbacks.includes("logical_action") &&
    contract.scenarios.every((scenario) =>
      scenario.steps.every((step) => step.kind !== "dispatch_action")
    )
  );
}

function authenticateGeneratedInputEvidence(
  evidence: RuntimeValidationEvidence,
  expectedActionId: string | undefined
): RuntimeValidationEvidence {
  if (
    evidence.checkId !== "input_response" ||
    evidence.status !== "passed" ||
    expectedActionId === undefined
  ) {
    return evidence;
  }
  if (
    evidence.evidence?.generatedActionId === expectedActionId &&
    evidence.evidence.generatedActionDispatched === true
  ) {
    return evidence;
  }
  return {
    checkId: "input_response",
    status: "failed",
    message:
      "First-playable input evidence did not authenticate the exact generated action.",
    issues: [
      {
        code: "generated_action_probe_not_authenticated",
        path: "runtime.generatedMechanic.action",
        message:
          "The runtime must dispatch the exact accepted generated action before input-response evidence can pass.",
      },
    ],
    evidence: {
      ...evidence.evidence,
      expectedGeneratedActionId: expectedActionId,
      generatedActionDispatched: false,
    },
  };
}

export type GeneratedMechanicPhaserRuntimeControllerOptions = Readonly<{
  isPaused: boolean;
  focusOnReadyKey: number;
  onStatusChange?: (status: RuntimeHostStatus) => void;
  onValidationEvidence?: (evidence: RuntimeValidationEvidence) => void;
  runFirstPlayableChecksOnReady: boolean;
}>;

export type GeneratedMechanicPhaserFirstPlayableResult = Readonly<{
  status: "passed" | "failed";
  evidence: readonly RuntimeValidationEvidence[];
}>;

export type GeneratedMechanicPhaserRuntimeController = Readonly<{
  focusGame(): void;
  setPaused(paused: boolean): void;
  updateOptions(
    options: Partial<GeneratedMechanicPhaserRuntimeControllerOptions>
  ): void;
  runFirstPlayableChecks(): Promise<GeneratedMechanicPhaserFirstPlayableResult>;
  dispose(): void;
}>;

export type CreateGeneratedMechanicPhaserRuntimeControllerInput = Readonly<{
  mount: HTMLElement;
  template: HandAuthoredPhaserTemplate;
  generatedMechanicProject: PreparedGeneratedMechanicRuntimeProject;
  options?: Partial<GeneratedMechanicPhaserRuntimeControllerOptions>;
}>;

type PendingFirstPlayableRequest = {
  commandSent: boolean;
  evidence: Map<RuntimeValidationEvidenceCheckId, RuntimeValidationEvidence>;
  promise: Promise<GeneratedMechanicPhaserFirstPlayableResult>;
  reject(error: Error): void;
  resolve(result: GeneratedMechanicPhaserFirstPlayableResult): void;
};

/**
 * Owns the trusted generated-mechanic iframe lifecycle independently of React.
 * The caller supplies only an admitted transient candidate or restored
 * accepted project plus a browser mount; this controller never grants
 * persistence authority.
 */
export function createGeneratedMechanicPhaserRuntimeController({
  mount,
  template,
  generatedMechanicProject,
  options: initialOptions,
}: CreateGeneratedMechanicPhaserRuntimeControllerInput): GeneratedMechanicPhaserRuntimeController {
  const ownerDocument = mount.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) {
    throw new TypeError(
      "The generated mechanic runtime requires a browser-owned mount."
    );
  }
  const browserWindow: Window & typeof globalThis = ownerWindow;
  const firstPlayableActionId = findExactGeneratedActionId(
    generatedMechanicProject
  );
  const hasAutonomousFirstPlayableContract = hasExactAutonomousInstallContract(
    generatedMechanicProject
  );

  let options: GeneratedMechanicPhaserRuntimeControllerOptions = {
    isPaused: false,
    focusOnReadyKey: 0,
    runFirstPlayableChecksOnReady: false,
    ...initialOptions,
  };
  const iframe = ownerDocument.createElement("iframe");
  iframe.title = template.title;
  iframe.className = "h-full min-h-[360px] w-full flex-1 border-0";
  iframe.setAttribute("src", GENERATED_MECHANIC_PHASER_RUNTIME_ROUTE);
  prepareGeneratedMechanicIframeSesWorkerBrokerIframe(iframe);

  let activeIframe: HTMLIFrameElement | null = iframe;
  let capturedIframeWindow: Window | null = null;
  let broker: GeneratedMechanicIframeSesWorkerBroker | undefined;
  let projectSession: GeneratedMechanicPhaserParentSession | undefined;
  let pendingFirstPlayableRequest: PendingFirstPlayableRequest | undefined;
  let loadCount = 0;
  let brokerReady = false;
  let projectAcknowledged = false;
  let runtimeEventsReady = false;
  let commandsReady = false;
  let runtimeReady = false;
  let pendingFocus = false;
  let settled = false;
  let teardownStarted = false;
  let bootDeadlineGeneration = 0;
  let bootDeadlineTimeoutId: number | undefined;
  let firstPlayableDeadlineTimeoutId: number | undefined;
  const queuedRuntimeCandidates: unknown[] = [];
  const scheduledFocusIds = new Set<number>();

  const clearScheduledFocus = () => {
    for (const timeoutId of scheduledFocusIds) {
      browserWindow.clearTimeout(timeoutId);
    }
    scheduledFocusIds.clear();
  };
  const clearBootDeadline = () => {
    bootDeadlineGeneration += 1;
    if (bootDeadlineTimeoutId !== undefined) {
      browserWindow.clearTimeout(bootDeadlineTimeoutId);
      bootDeadlineTimeoutId = undefined;
    }
  };
  const clearFirstPlayableDeadline = () => {
    if (firstPlayableDeadlineTimeoutId !== undefined) {
      browserWindow.clearTimeout(firstPlayableDeadlineTimeoutId);
      firstPlayableDeadlineTimeoutId = undefined;
    }
  };
  const isCurrentFrame = () =>
    activeIframe === iframe &&
    iframe.isConnected &&
    iframe.parentElement === mount &&
    iframe.contentWindow === capturedIframeWindow &&
    iframe.getAttribute("src") === GENERATED_MECHANIC_PHASER_RUNTIME_ROUTE &&
    iframe.getAttribute("sandbox") === "allow-scripts" &&
    !iframe.hasAttribute("srcdoc");
  const rejectFirstPlayable = (message: string) => {
    const request = pendingFirstPlayableRequest;
    if (!request) {
      return;
    }
    pendingFirstPlayableRequest = undefined;
    clearFirstPlayableDeadline();
    request.reject(new Error(message));
  };
  const teardown = () => {
    if (teardownStarted) {
      return;
    }
    teardownStarted = true;
    rejectFirstPlayable(
      "The generated mechanic runtime was disposed before first-playable checks completed."
    );
    clearScheduledFocus();
    clearBootDeadline();
    clearFirstPlayableDeadline();
    browserWindow.removeEventListener("message", handleWindowMessage);
    iframe.removeEventListener("load", handleIframeLoad);
    integrityObserver.disconnect();
    projectSession?.dispose();
    broker?.dispose();
    disposeGeneratedMechanicIframeSesWorkerBrokerPreparation(iframe);
    iframe.remove();
    activeIframe = null;
  };
  const failClosed = (message: string) => {
    if (teardownStarted) {
      return;
    }
    settled = true;
    rejectFirstPlayable(message);
    try {
      options.onStatusChange?.({
        state: "error",
        message,
      });
    } catch {
      // Host observers cannot be allowed to interrupt fail-closed teardown.
    } finally {
      teardown();
    }
  };
  const armBootDeadline = (
    phase: "navigation" | "handshake" | "runtime-ready"
  ) => {
    clearBootDeadline();
    const generation = bootDeadlineGeneration;
    bootDeadlineTimeoutId = browserWindow.setTimeout(() => {
      if (
        settled ||
        teardownStarted ||
        generation !== bootDeadlineGeneration
      ) {
        return;
      }
      bootDeadlineTimeoutId = undefined;
      if (phase === "navigation") {
        failClosed(
          "The generated mechanic runtime did not load its trusted route before its navigation deadline."
        );
        return;
      }
      if (phase === "handshake") {
        if (!projectAcknowledged && !brokerReady) {
          failClosed(
            "The generated mechanic runtime did not finish its project and Worker broker handshake."
          );
          return;
        }
        failClosed(
          projectAcknowledged
            ? "The generated mechanic runtime Worker broker did not initialize."
            : "The generated mechanic runtime did not acknowledge its project bootstrap."
        );
        return;
      }
      failClosed(
        "The generated sandbox did not finish booting. Regenerate the game to request a fresh module."
      );
    }, SANDBOX_BOOT_TIMEOUT_MS);
  };
  const postCommand = (command: RuntimeCommand): boolean => {
    if (
      teardownStarted ||
      !commandsReady ||
      !projectSession ||
      !isCurrentFrame()
    ) {
      return false;
    }
    try {
      projectSession.postRuntimeCommand(command);
      return true;
    } catch {
      failClosed(
        "The generated mechanic runtime command channel became invalid."
      );
      return false;
    }
  };
  const focusGame = () => {
    if (teardownStarted) {
      return;
    }
    if (!capturedIframeWindow) {
      pendingFocus = true;
      return;
    }
    if (!isCurrentFrame()) {
      failClosed("The generated mechanic runtime iframe became stale.");
      return;
    }
    iframe.focus();
    capturedIframeWindow.focus();
    if (!postCommand({ type: "game-focus" })) {
      pendingFocus = true;
    }
  };
  const scheduleFocus = () => {
    clearScheduledFocus();
    for (const delay of [0, 120]) {
      const timeoutId = browserWindow.setTimeout(() => {
        scheduledFocusIds.delete(timeoutId);
        focusGame();
      }, delay);
      scheduledFocusIds.add(timeoutId);
    }
  };
  const settleFirstPlayableEvidence = (
    evidence: RuntimeValidationEvidence
  ) => {
    const request = pendingFirstPlayableRequest;
    if (!request || !request.commandSent) {
      return;
    }
    request.evidence.set(evidence.checkId, evidence);
    const hasFailed = [...request.evidence.values()].some(
      (item) => item.status === "failed"
    );
    const hasAllChecks = FIRST_PLAYABLE_CHECK_IDS.every((checkId) =>
      request.evidence.has(checkId)
    );
    if (!hasFailed && !hasAllChecks) {
      return;
    }
    pendingFirstPlayableRequest = undefined;
    clearFirstPlayableDeadline();
    request.resolve(
      Object.freeze({
        status: hasFailed ? "failed" : "passed",
        evidence: Object.freeze(
          FIRST_PLAYABLE_CHECK_IDS.flatMap((checkId) => {
            const item = request.evidence.get(checkId);
            return item ? [item] : [];
          })
        ),
      })
    );
  };
  const processRuntimeCandidate = (candidate: unknown) => {
    if (teardownStarted || !runtimeEventsReady) {
      return;
    }
    const runtimeEvent = parseRuntimeEvent(candidate);
    if (!runtimeEvent || runtimeEvent.type === "game-debug-event") {
      return;
    }
    if (runtimeEvent.type === "game-validation-evidence") {
      const authenticatedEvidence = authenticateGeneratedInputEvidence(
        runtimeEvent.evidence,
        firstPlayableActionId
      );
      options.onValidationEvidence?.(authenticatedEvidence);
      settleFirstPlayableEvidence(authenticatedEvidence);
      return;
    }
    const runtimeStatus = createRuntimeHostStatusFromEvent(runtimeEvent);
    if (!runtimeStatus) {
      return;
    }
    if (runtimeStatus.state === "ready") {
      if (runtimeReady) {
        return;
      }
      runtimeReady = true;
      commandsReady = true;
      settled = true;
      clearBootDeadline();
      if (!postCommand({ type: "game-pause", paused: options.isPaused })) {
        return;
      }
      options.onStatusChange?.(runtimeStatus);
      if (options.runFirstPlayableChecksOnReady) {
        void runFirstPlayableChecks().catch(() => undefined);
      } else {
        sendPendingFirstPlayableCommand();
      }
      if (pendingFocus) {
        pendingFocus = false;
        focusGame();
      }
      if (options.focusOnReadyKey > 0) {
        scheduleFocus();
      }
      return;
    }
    if (runtimeStatus.state === "warning") {
      options.onStatusChange?.(runtimeStatus);
      return;
    }
    if (runtimeStatus.state === "loading") {
      return;
    }
    failClosed(runtimeStatus.message);
  };
  const enableRuntimeEventsIfReady = () => {
    if (
      teardownStarted ||
      runtimeEventsReady ||
      !brokerReady ||
      !projectAcknowledged ||
      !projectSession
    ) {
      return;
    }
    runtimeEventsReady = true;
    armBootDeadline("runtime-ready");
    for (const candidate of queuedRuntimeCandidates.splice(0)) {
      processRuntimeCandidate(candidate);
    }
    if (commandsReady && pendingFocus) {
      pendingFocus = false;
      focusGame();
    }
  };
  function handleWindowMessage(event: MessageEvent<unknown>) {
    if (teardownStarted || !projectSession) {
      return;
    }
    if (!isCurrentFrame()) {
      failClosed("The generated mechanic runtime iframe became stale.");
      return;
    }
    const wasAcknowledged = projectSession.isAcknowledged();
    let candidate: unknown | null;
    try {
      candidate = projectSession.consumeIframeMessage(event);
    } catch {
      failClosed(
        "The generated mechanic runtime protocol rejected its iframe session."
      );
      return;
    }
    if (!wasAcknowledged && projectSession.isAcknowledged()) {
      projectAcknowledged = true;
      enableRuntimeEventsIfReady();
    }
    if (candidate === null) {
      return;
    }
    if (!runtimeEventsReady) {
      queuedRuntimeCandidates.push(candidate);
      return;
    }
    processRuntimeCandidate(candidate);
  }
  function handleIframeLoad() {
    if (teardownStarted) {
      return;
    }
    loadCount += 1;
    if (loadCount !== 1) {
      failClosed(
        "The generated mechanic runtime attempted a second navigation."
      );
      return;
    }
    capturedIframeWindow = iframe.contentWindow;
    if (!capturedIframeWindow || !isCurrentFrame()) {
      failClosed(
        "The generated mechanic runtime did not load its trusted route."
      );
      return;
    }
    armBootDeadline("handshake");
    try {
      const sessionId = createPrivateBrowserNonce(browserWindow);
      const nonce = createPrivateBrowserNonce(browserWindow);
      if (sessionId === nonce) {
        throw new Error("The generated mechanic runtime nonce was reused.");
      }
      browserWindow.addEventListener("message", handleWindowMessage);
      broker = createGeneratedMechanicIframeSesWorkerBroker({ iframe });
      projectSession = createGeneratedMechanicPhaserParentSession({
        ownerWindow: browserWindow,
        iframeWindow: capturedIframeWindow,
        template,
        project: generatedMechanicProject,
        sessionId,
        nonce,
      });
      projectSession.sendBootstrap();
    } catch {
      failClosed(
        "The generated mechanic runtime could not establish its trusted session."
      );
      return;
    }
    const activeBroker = broker;
    void activeBroker.ready.then(
      () => {
        if (teardownStarted || broker !== activeBroker) {
          return;
        }
        brokerReady = true;
        enableRuntimeEventsIfReady();
      },
      () => {
        failClosed(
          "The generated mechanic runtime Worker broker did not initialize."
        );
      }
    );
    void activeBroker.closed.then((result) => {
      browserWindow.setTimeout(() => {
        if (!teardownStarted && broker === activeBroker) {
          failClosed(result.message);
        }
      }, BROKER_CLOSE_CAUSAL_EVENT_GRACE_MS);
    });
  }
  function createPendingFirstPlayableRequest(): PendingFirstPlayableRequest {
    let resolve!: (
      result: GeneratedMechanicPhaserFirstPlayableResult
    ) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<GeneratedMechanicPhaserFirstPlayableResult>(
      (resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      }
    );
    return {
      commandSent: false,
      evidence: new Map(),
      promise,
      reject,
      resolve,
    };
  }
  function sendPendingFirstPlayableCommand() {
    const request = pendingFirstPlayableRequest;
    if (!request || request.commandSent || !commandsReady) {
      return;
    }
    if (!firstPlayableActionId && !hasAutonomousFirstPlayableContract) {
      failClosed(
        "The generated mechanic runtime project did not retain one exact logical action for first-playable validation."
      );
      return;
    }
    if (
      postCommand(
        firstPlayableActionId
          ? {
              type: "game-run-first-playable-checks",
              actionId: firstPlayableActionId,
            }
          : { type: "game-run-first-playable-checks" }
      )
    ) {
      request.commandSent = true;
      clearFirstPlayableDeadline();
      firstPlayableDeadlineTimeoutId = browserWindow.setTimeout(() => {
        firstPlayableDeadlineTimeoutId = undefined;
        failClosed(
          "The generated mechanic runtime did not return first-playable evidence before its deadline."
        );
      }, SANDBOX_BOOT_TIMEOUT_MS);
    }
  }
  function runFirstPlayableChecks(): Promise<GeneratedMechanicPhaserFirstPlayableResult> {
    if (teardownStarted) {
      return Promise.reject(
        new Error(
          "The generated mechanic runtime is unavailable for first-playable checks."
        )
      );
    }
    if (!pendingFirstPlayableRequest) {
      pendingFirstPlayableRequest = createPendingFirstPlayableRequest();
    }
    sendPendingFirstPlayableCommand();
    return pendingFirstPlayableRequest.promise;
  }

  const integrityObserver = new browserWindow.MutationObserver((records) => {
    if (records.length > 0) {
      failClosed(
        "The generated mechanic runtime iframe security attributes changed."
      );
    }
  });
  integrityObserver.observe(iframe, {
    attributes: true,
    attributeFilter: ["sandbox", "src", "srcdoc"],
  });
  iframe.addEventListener("load", handleIframeLoad);
  armBootDeadline("navigation");
  try {
    options.onStatusChange?.({ state: "loading" });
  } catch {
    teardown();
    return createDisposedController();
  }
  mount.append(iframe);

  return Object.freeze({
    focusGame,
    setPaused(paused: boolean) {
      options = { ...options, isPaused: paused };
      postCommand({ type: "game-pause", paused });
    },
    updateOptions(
      nextOptions: Partial<GeneratedMechanicPhaserRuntimeControllerOptions>
    ) {
      if (teardownStarted) {
        return;
      }
      const previousPaused = options.isPaused;
      options = { ...options, ...nextOptions };
      if (
        typeof nextOptions.isPaused === "boolean" &&
        nextOptions.isPaused !== previousPaused
      ) {
        postCommand({ type: "game-pause", paused: nextOptions.isPaused });
      }
    },
    runFirstPlayableChecks,
    dispose: teardown,
  });
}

function createPrivateBrowserNonce(ownerWindow: Window): string {
  if (typeof ownerWindow.crypto.randomUUID !== "function") {
    throw new Error(
      "The generated mechanic runtime requires crypto.randomUUID()."
    );
  }
  return ownerWindow.crypto.randomUUID();
}

function createDisposedController(): GeneratedMechanicPhaserRuntimeController {
  const unavailable = () => undefined;
  return Object.freeze({
    focusGame: unavailable,
    setPaused: unavailable,
    updateOptions: unavailable,
    runFirstPlayableChecks: () =>
      Promise.reject(
        new Error(
          "The generated mechanic runtime is unavailable for first-playable checks."
        )
      ),
    dispose: unavailable,
  });
}
