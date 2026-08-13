"use client";

import {
  type ForwardedRef,
  forwardRef,
  type ReactElement,
  type RefAttributes,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

import { SANDBOX_BOOT_TIMEOUT_MS } from "@/constants";
import type { PreparedRestoredGeneratedMechanicProject } from "@/game-spec";
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
  type RuntimeValidationEvidence,
} from "@/runtime/runtime-adapter";
import {
  createGeneratedMechanicPhaserParentSession,
  type GeneratedMechanicPhaserParentSession,
} from "@/runtime/phaser/generated-mechanic-phaser-host-protocol";
import type { HandAuthoredPhaserTemplate } from "@/runtime/phaser/top-down-template";

import type {
  RuntimeIframeHostHandle,
  RuntimeIframeStatus,
} from "./runtime-iframe-host";

const GENERATED_MECHANIC_PHASER_RUNTIME_ROUTE = "/runtime/phaser-generated";

export type GeneratedMechanicPhaserRuntimeHostProps = {
  template: HandAuthoredPhaserTemplate;
  generatedMechanicProject: PreparedRestoredGeneratedMechanicProject;
  isPaused?: boolean;
  focusOnReadyKey?: number;
  frameLabel?: string;
  frameDetail?: string;
  onStatusChange?: (status: RuntimeIframeStatus) => void;
  onValidationEvidence?: (evidence: RuntimeValidationEvidence) => void;
  runFirstPlayableChecksOnReady?: boolean;
};

type ActiveRuntimeControl = {
  focusGame(): void;
  postPause(paused: boolean): void;
};

function GeneratedMechanicPhaserRuntimeHostInner(
  {
    template,
    generatedMechanicProject,
    isPaused = false,
    focusOnReadyKey = 0,
    frameLabel = "Phaser runtime",
    frameDetail = "Sandboxed generated mechanic",
    onStatusChange,
    onValidationEvidence,
    runFirstPlayableChecksOnReady = false,
  }: GeneratedMechanicPhaserRuntimeHostProps,
  ref: ForwardedRef<RuntimeIframeHostHandle>
) {
  const iframeMountRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const activeControlRef = useRef<ActiveRuntimeControl | null>(null);
  const latestOptionsRef = useRef({
    focusOnReadyKey,
    isPaused,
    onStatusChange,
    onValidationEvidence,
    runFirstPlayableChecksOnReady,
  });

  useEffect(() => {
    latestOptionsRef.current = {
      focusOnReadyKey,
      isPaused,
      onStatusChange,
      onValidationEvidence,
      runFirstPlayableChecksOnReady,
    };
  }, [
    focusOnReadyKey,
    isPaused,
    onStatusChange,
    onValidationEvidence,
    runFirstPlayableChecksOnReady,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      focusGame() {
        activeControlRef.current?.focusGame();
      },
    }),
    []
  );

  useEffect(() => {
    const mount = iframeMountRef.current;
    if (!mount) {
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.title = template.title;
    iframe.className = "h-full min-h-[360px] w-full flex-1 border-0";
    iframe.setAttribute("src", GENERATED_MECHANIC_PHASER_RUNTIME_ROUTE);
    prepareGeneratedMechanicIframeSesWorkerBrokerIframe(iframe);

    let capturedIframeWindow: Window | null = null;
    let broker: GeneratedMechanicIframeSesWorkerBroker | undefined;
    let projectSession: GeneratedMechanicPhaserParentSession | undefined;
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
    const queuedRuntimeCandidates: unknown[] = [];
    const scheduledFocusIds = new Set<number>();

    const clearScheduledFocus = () => {
      for (const timeoutId of scheduledFocusIds) {
        window.clearTimeout(timeoutId);
      }
      scheduledFocusIds.clear();
    };
    const clearBootDeadline = () => {
      bootDeadlineGeneration += 1;
      if (bootDeadlineTimeoutId !== undefined) {
        window.clearTimeout(bootDeadlineTimeoutId);
        bootDeadlineTimeoutId = undefined;
      }
    };
    const isCurrentFrame = () =>
      iframeRef.current === iframe &&
      iframe.isConnected &&
      iframe.parentElement === mount &&
      iframe.contentWindow === capturedIframeWindow &&
      iframe.getAttribute("src") ===
        GENERATED_MECHANIC_PHASER_RUNTIME_ROUTE &&
      iframe.getAttribute("sandbox") === "allow-scripts" &&
      !iframe.hasAttribute("srcdoc");
    const teardown = () => {
      if (teardownStarted) {
        return;
      }
      teardownStarted = true;
      clearScheduledFocus();
      clearBootDeadline();
      window.removeEventListener("message", handleWindowMessage);
      iframe.removeEventListener("load", handleIframeLoad);
      integrityObserver.disconnect();
      projectSession?.dispose();
      broker?.dispose();
      disposeGeneratedMechanicIframeSesWorkerBrokerPreparation(iframe);
      iframe.remove();
      if (iframeRef.current === iframe) {
        iframeRef.current = null;
      }
      if (activeControlRef.current === activeControl) {
        activeControlRef.current = null;
      }
    };
    const failClosed = (message: string) => {
      if (teardownStarted) {
        return;
      }
      settled = true;
      try {
        latestOptionsRef.current.onStatusChange?.({
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
      bootDeadlineTimeoutId = window.setTimeout(() => {
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
        const timeoutId = window.setTimeout(() => {
          scheduledFocusIds.delete(timeoutId);
          focusGame();
        }, delay);
        scheduledFocusIds.add(timeoutId);
      }
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
        latestOptionsRef.current.onValidationEvidence?.(
          runtimeEvent.evidence
        );
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
        if (
          !postCommand({
            type: "game-pause",
            paused: latestOptionsRef.current.isPaused,
          })
        ) {
          return;
        }
        latestOptionsRef.current.onStatusChange?.(runtimeStatus);
        if (latestOptionsRef.current.runFirstPlayableChecksOnReady) {
          postCommand({ type: "game-run-first-playable-checks" });
        }
        if (pendingFocus) {
          pendingFocus = false;
          focusGame();
        }
        if (latestOptionsRef.current.focusOnReadyKey > 0) {
          scheduleFocus();
        }
        return;
      }
      if (runtimeStatus.state === "warning") {
        latestOptionsRef.current.onStatusChange?.(runtimeStatus);
        return;
      }
      settled = true;
      clearBootDeadline();
      latestOptionsRef.current.onStatusChange?.(runtimeStatus);
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
        const sessionId = createPrivateBrowserNonce();
        const nonce = createPrivateBrowserNonce();
        if (sessionId === nonce) {
          throw new Error("The generated mechanic runtime nonce was reused.");
        }
        window.addEventListener("message", handleWindowMessage);
        broker = createGeneratedMechanicIframeSesWorkerBroker({ iframe });
        projectSession = createGeneratedMechanicPhaserParentSession({
          ownerWindow: window,
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
        if (!teardownStarted && broker === activeBroker) {
          failClosed(result.message);
        }
      });
    }

    const activeControl: ActiveRuntimeControl = {
      focusGame,
      postPause(paused) {
        postCommand({ type: "game-pause", paused });
      },
    };
    activeControlRef.current = activeControl;
    iframeRef.current = iframe;
    const integrityObserver = new MutationObserver((records) => {
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
      latestOptionsRef.current.onStatusChange?.({ state: "loading" });
    } catch {
      teardown();
      return teardown;
    }
    mount.append(iframe);

    return teardown;
  }, [generatedMechanicProject, template]);

  useEffect(() => {
    activeControlRef.current?.postPause(isPaused);
  }, [isPaused]);

  return (
    <div className="relative flex h-full min-h-[360px] w-full flex-col overflow-hidden border border-[var(--line-strong)] bg-[#0d1721]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0b1118] px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/60">
        <span>{frameLabel}</span>
        <span>{frameDetail}</span>
      </div>
      <div ref={iframeMountRef} className="flex min-h-[360px] flex-1" />
    </div>
  );
}

function createPrivateBrowserNonce(): string {
  if (typeof window.crypto.randomUUID !== "function") {
    throw new Error(
      "The generated mechanic runtime requires crypto.randomUUID()."
    );
  }
  return window.crypto.randomUUID();
}

export const GeneratedMechanicPhaserRuntimeHost = forwardRef(
  GeneratedMechanicPhaserRuntimeHostInner
) as (
  props: GeneratedMechanicPhaserRuntimeHostProps &
    RefAttributes<RuntimeIframeHostHandle>
) => ReactElement;
