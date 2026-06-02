import { type RefObject } from "react";

import { GeneratedGameHost } from "@/components/generated-game-host";
import {
  RuntimeIframeHost,
  type RuntimeIframeHostHandle,
  type RuntimeIframeStatus,
} from "@/components/runtime-iframe-host";
import type { RuntimeValidationEvidence } from "@/runtime/runtime-adapter";
import { phaserRuntimeAdapter } from "@/runtime/phaser";

import type { EditorRuntimeHostViewModel } from "./editor-runtime-template-plan";

type EditorRuntimeHostMountProps = {
  focusOnReadyKey: number;
  host: EditorRuntimeHostViewModel | null;
  hostRef: RefObject<RuntimeIframeHostHandle | null>;
  isPaused: boolean;
  onStatusChange: (status: RuntimeIframeStatus) => void;
  onValidationEvidence?: (evidence: RuntimeValidationEvidence) => void;
  runFirstPlayableChecksOnReady: boolean;
};

export function EditorRuntimeHostMount({
  focusOnReadyKey,
  host,
  hostRef,
  isPaused,
  onStatusChange,
  onValidationEvidence,
  runFirstPlayableChecksOnReady,
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
        onValidationEvidence={onValidationEvidence}
        runFirstPlayableChecksOnReady={runFirstPlayableChecksOnReady}
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
