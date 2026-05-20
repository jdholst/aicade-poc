import { type RefObject } from "react";

import { GeneratedGameHost } from "@/components/generated-game-host";
import {
  RuntimeIframeHost,
  type RuntimeIframeHostHandle,
  type RuntimeIframeStatus,
} from "@/components/runtime-iframe-host";
import { phaserRuntimeAdapter } from "@/runtime/phaser";

import type { EditorRuntimeHostViewModel } from "./editor-game-canvas-view-model";

type EditorRuntimeHostMountProps = {
  focusOnReadyKey: number;
  host: EditorRuntimeHostViewModel | null;
  hostRef: RefObject<RuntimeIframeHostHandle | null>;
  isPaused: boolean;
  onStatusChange: (status: RuntimeIframeStatus) => void;
};

export function EditorRuntimeHostMount({
  focusOnReadyKey,
  host,
  hostRef,
  isPaused,
  onStatusChange,
}: EditorRuntimeHostMountProps) {
  if (!host) {
    return null;
  }

  if (host.type === "phaser") {
    return (
      <RuntimeIframeHost
        ref={hostRef}
        key={host.key}
        artifact={host.template}
        runtimeAdapter={phaserRuntimeAdapter}
        isPaused={isPaused}
        focusOnReadyKey={focusOnReadyKey}
        frameLabel="Phaser runtime"
        frameDetail="Sandboxed iframe"
        onStatusChange={onStatusChange}
      />
    );
  }

  return (
    <GeneratedGameHost
      ref={hostRef}
      key={host.key}
      pack={host.pack}
      isPaused={isPaused}
      focusOnReadyKey={focusOnReadyKey}
      onStatusChange={onStatusChange}
    />
  );
}
