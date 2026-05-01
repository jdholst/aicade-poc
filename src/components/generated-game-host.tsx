"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";
import { SANDBOX_BOOT_TIMEOUT_MS } from "@/constants";
import {
  createGeneratedGameSandboxDocument,
  focusGeneratedGameSandbox,
  parseGeneratedGameSandboxEvent,
  postGeneratedGameSandboxCommand,
  scheduleGeneratedGameSandboxFocus,
} from "@/components/generated-game-sandbox";

export type GeneratedGameStatus =
  | { state: "loading"; message: string }
  | { state: "ready"; message: string }
  | { state: "paused"; message: string }
  | { state: "error"; message: string };

type GeneratedGameHostProps = {
  pack: GeneratedGamePack;
  isPaused?: boolean;
  focusOnReadyKey?: number;
  onStatusChange?: (status: GeneratedGameStatus) => void;
};

export type GeneratedGameHostHandle = {
  focusGame: () => void;
};

export const GeneratedGameHost = forwardRef<
  GeneratedGameHostHandle,
  GeneratedGameHostProps
>(function GeneratedGameHost(
  { pack, isPaused = false, focusOnReadyKey = 0, onStatusChange },
  ref
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const srcDoc = useMemo(() => createGeneratedGameSandboxDocument(pack), [pack]);

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
      message: "Booting generated canvas module...",
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

      const sandboxEvent = parseGeneratedGameSandboxEvent(event.data);
      if (!sandboxEvent) {
        return;
      }

      hasSettled = true;
      window.clearTimeout(timeoutId);

      if (sandboxEvent.type === "game-ready") {
        onStatusChange?.({
          state: "ready",
          message: "Generated module is running in the sandbox.",
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
  }, [focusOnReadyKey, onStatusChange, pack]);

  useEffect(() => {
    postGeneratedGameSandboxCommand(iframeRef.current?.contentWindow, {
      type: "game-pause",
      paused: isPaused,
    });
  }, [isPaused, pack]);

  return (
    <div className="relative flex h-full min-h-[360px] w-full flex-col overflow-hidden border border-[var(--line-strong)] bg-[#0d1721]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0b1118] px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/60">
        <span>Generated canvas</span>
        <span>Sandboxed iframe</span>
      </div>
      <iframe
        ref={iframeRef}
        title={pack.manifest.title}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        className="h-full min-h-[360px] w-full flex-1 border-0"
      />
    </div>
  );
});
