"use client";

import {
  type ForwardedRef,
  forwardRef,
  type ReactElement,
  type RefAttributes,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import { SANDBOX_BOOT_TIMEOUT_MS } from "@/constants";
import type {
  RuntimeAdapter,
  RuntimeHostStatus,
  RuntimeValidationEvidence,
} from "@/runtime/runtime-adapter";
import { createRuntimeHostStatusFromEvent } from "@/runtime/runtime-adapter";
import {
  focusRuntimeIframe,
  postRuntimeIframeCommand,
  scheduleRuntimeIframeFocus,
} from "@/runtime/runtime-iframe-commands";

export type RuntimeIframeStatus = RuntimeHostStatus;

export type RuntimeIframeHostHandle = {
  focusGame: () => void;
};

export type RuntimeIframeHostProps<TArtifact> = {
  artifact: TArtifact;
  runtimeAdapter: RuntimeAdapter<TArtifact>;
  isPaused?: boolean;
  focusOnReadyKey?: number;
  frameLabel?: string;
  frameDetail?: string;
  onStatusChange?: (status: RuntimeIframeStatus) => void;
  onValidationEvidence?: (evidence: RuntimeValidationEvidence) => void;
  runFirstPlayableChecksOnReady?: boolean;
};

function RuntimeIframeHostInner<TArtifact>(
  {
    artifact,
    runtimeAdapter,
    isPaused = false,
    focusOnReadyKey = 0,
    frameLabel = "Runtime",
    frameDetail = "Sandboxed iframe",
    onStatusChange,
    onValidationEvidence,
    runFirstPlayableChecksOnReady = false,
  }: RuntimeIframeHostProps<TArtifact>,
  ref: ForwardedRef<RuntimeIframeHostHandle>
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const latestHostOptionsRef = useRef({
    focusOnReadyKey,
    onStatusChange,
    onValidationEvidence,
    runFirstPlayableChecksOnReady,
  });
  const mountedSrcDocRef = useRef<string | null>(null);
  const mountDescriptor = useMemo(
    () => runtimeAdapter.createMountDescriptor(artifact),
    [artifact, runtimeAdapter]
  );

  useImperativeHandle(
    ref,
    () => ({
      focusGame() {
        focusRuntimeIframe(iframeRef.current);
      },
    }),
    []
  );

  useEffect(() => {
    latestHostOptionsRef.current = {
      focusOnReadyKey,
      onStatusChange,
      onValidationEvidence,
      runFirstPlayableChecksOnReady,
    };
  }, [
    focusOnReadyKey,
    onStatusChange,
    onValidationEvidence,
    runFirstPlayableChecksOnReady,
  ]);

  useEffect(() => {
    let hasSettled = false;
    let clearScheduledFocus: (() => void) | undefined;

    latestHostOptionsRef.current.onStatusChange?.({
      state: "loading",
    });

    const timeoutId = window.setTimeout(() => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      latestHostOptionsRef.current.onStatusChange?.({
        state: "error",
        message:
          "The generated sandbox did not finish booting. Regenerate the game to request a fresh module.",
      });
    }, SANDBOX_BOOT_TIMEOUT_MS);

    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const sandboxEvent = runtimeAdapter.parseEvent(event.data);
      if (!sandboxEvent) {
        return;
      }

      if (sandboxEvent.type === "game-debug-event") {
        return;
      }

      if (sandboxEvent.type === "game-validation-evidence") {
        latestHostOptionsRef.current.onValidationEvidence?.(
          sandboxEvent.evidence
        );
        return;
      }

      const runtimeStatus = createRuntimeHostStatusFromEvent(sandboxEvent);
      if (!runtimeStatus) {
        return;
      }

      if (runtimeStatus.state === "ready") {
        hasSettled = true;
        window.clearTimeout(timeoutId);

        latestHostOptionsRef.current.onStatusChange?.(runtimeStatus);

        if (latestHostOptionsRef.current.runFirstPlayableChecksOnReady) {
          postRuntimeIframeCommand(iframeRef.current?.contentWindow, {
            type: "game-run-first-playable-checks",
          });
        }

        if (latestHostOptionsRef.current.focusOnReadyKey > 0) {
          clearScheduledFocus?.();
          clearScheduledFocus = scheduleRuntimeIframeFocus(iframeRef.current);
        }

        return;
      }

      if (runtimeStatus.state === "warning") {
        latestHostOptionsRef.current.onStatusChange?.(runtimeStatus);
        return;
      }

      hasSettled = true;
      window.clearTimeout(timeoutId);

      latestHostOptionsRef.current.onStatusChange?.(runtimeStatus);
    }

    window.addEventListener("message", handleMessage);

    if (mountedSrcDocRef.current !== mountDescriptor.srcDoc) {
      iframeRef.current?.setAttribute("srcdoc", mountDescriptor.srcDoc);
      mountedSrcDocRef.current = mountDescriptor.srcDoc;
    }

    return () => {
      hasSettled = true;
      clearScheduledFocus?.();
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
    };
  }, [
    mountDescriptor.srcDoc,
    runtimeAdapter,
  ]);

  useEffect(() => {
    postRuntimeIframeCommand(iframeRef.current?.contentWindow, {
      type: "game-pause",
      paused: isPaused,
    });
  }, [artifact, isPaused]);

  return (
    <div className="relative flex h-full min-h-[360px] w-full flex-col overflow-hidden border border-[var(--line-strong)] bg-[#0d1721]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0b1118] px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/60">
        <span>{frameLabel}</span>
        <span>{frameDetail}</span>
      </div>
      <iframe
        ref={iframeRef}
        title={mountDescriptor.title}
        sandbox={mountDescriptor.sandbox}
        className="h-full min-h-[360px] w-full flex-1 border-0"
      />
    </div>
  );
}

export const RuntimeIframeHost = forwardRef(RuntimeIframeHostInner) as <
  TArtifact,
>(
  props: RuntimeIframeHostProps<TArtifact> &
    RefAttributes<RuntimeIframeHostHandle>
) => ReactElement;
