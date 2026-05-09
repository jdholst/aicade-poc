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

import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";
import { SANDBOX_BOOT_TIMEOUT_MS } from "@/constants";
import { canvasRuntimeAdapter } from "@/runtime/canvas-runtime-adapter";
import type { RuntimeAdapter } from "@/runtime/runtime-adapter";
import {
  focusGeneratedGameSandbox,
  postGeneratedGameSandboxCommand,
  scheduleGeneratedGameSandboxFocus,
} from "@/components/generated-game-sandbox";

export type RuntimeStatus =
  | { state: "loading" }
  | { state: "ready" }
  | { state: "error"; message: string };

type GeneratedGameHostProps = {
  pack: GeneratedGamePack;
  runtimeAdapter?: RuntimeAdapter<GeneratedGamePack>;
  isPaused?: boolean;
  focusOnReadyKey?: number;
  onStatusChange?: (status: RuntimeStatus) => void;
};

export type GeneratedGameHostHandle = {
  focusGame: () => void;
};

type RuntimeIframeHostProps<TArtifact> = {
  artifact: TArtifact;
  runtimeAdapter: RuntimeAdapter<TArtifact>;
  isPaused?: boolean;
  focusOnReadyKey?: number;
  frameLabel?: string;
  frameDetail?: string;
  onStatusChange?: (status: RuntimeStatus) => void;
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
  }: RuntimeIframeHostProps<TArtifact>,
  ref: ForwardedRef<GeneratedGameHostHandle>
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const mountDescriptor = useMemo(
    () => runtimeAdapter.createMountDescriptor(artifact),
    [artifact, runtimeAdapter]
  );

  useImperativeHandle(
    ref,
    () => ({
      focusGame() {
        focusGeneratedGameSandbox(iframeRef.current);
      },
    }),
    []
  );

  useEffect(() => {
    let hasSettled = false;
    let clearScheduledFocus: (() => void) | undefined;

    onStatusChange?.({
      state: "loading",
    });

    const timeoutId = window.setTimeout(() => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      onStatusChange?.({
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

      hasSettled = true;
      window.clearTimeout(timeoutId);

      if (sandboxEvent.type === "game-ready") {
        onStatusChange?.({
          state: "ready",
        });

        if (focusOnReadyKey > 0) {
          clearScheduledFocus?.();
          clearScheduledFocus = scheduleGeneratedGameSandboxFocus(
            iframeRef.current
          );
        }

        return;
      }

      onStatusChange?.({
        state: "error",
        message: sandboxEvent.message,
      });
    }

    window.addEventListener("message", handleMessage);
    return () => {
      hasSettled = true;
      clearScheduledFocus?.();
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
    };
  }, [
    artifact,
    focusOnReadyKey,
    onStatusChange,
    runtimeAdapter,
  ]);

  useEffect(() => {
    postGeneratedGameSandboxCommand(iframeRef.current?.contentWindow, {
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
        srcDoc={mountDescriptor.srcDoc}
        className="h-full min-h-[360px] w-full flex-1 border-0"
      />
    </div>
  );
}

export const RuntimeIframeHost = forwardRef(RuntimeIframeHostInner) as <
  TArtifact,
>(
  props: RuntimeIframeHostProps<TArtifact> &
    RefAttributes<GeneratedGameHostHandle>
) => ReactElement;

export const GeneratedGameHost = forwardRef<
  GeneratedGameHostHandle,
  GeneratedGameHostProps
>(function GeneratedGameHost(
  {
    pack,
    runtimeAdapter = canvasRuntimeAdapter,
    isPaused = false,
    focusOnReadyKey = 0,
    onStatusChange,
  },
  ref
) {
  return (
    <RuntimeIframeHost
      ref={ref}
      artifact={pack}
      runtimeAdapter={runtimeAdapter}
      isPaused={isPaused}
      focusOnReadyKey={focusOnReadyKey}
      frameLabel="Generated canvas"
      frameDetail="Sandboxed iframe"
      onStatusChange={onStatusChange}
    />
  );
});
