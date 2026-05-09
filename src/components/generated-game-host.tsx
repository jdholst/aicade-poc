"use client";

import { forwardRef } from "react";

import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";
import { canvasRuntimeAdapter } from "@/runtime/canvas";
import type { RuntimeAdapter } from "@/runtime/runtime-adapter";
import {
  RuntimeIframeHost,
  type RuntimeIframeHostHandle,
  type RuntimeIframeStatus,
} from "@/components/runtime-iframe-host";

export type RuntimeStatus = RuntimeIframeStatus;
export type GeneratedGameHostHandle = RuntimeIframeHostHandle;

export type GeneratedGameHostProps = {
  pack: GeneratedGamePack;
  runtimeAdapter?: RuntimeAdapter<GeneratedGamePack>;
  isPaused?: boolean;
  focusOnReadyKey?: number;
  onStatusChange?: (status: RuntimeStatus) => void;
};

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
