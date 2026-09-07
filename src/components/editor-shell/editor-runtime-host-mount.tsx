import { type RefObject } from "react";

import { GeneratedGameHost } from "@/components/generated-game-host";
import { GeneratedMechanicPhaserRuntimeHost } from "@/components/generated-mechanic-phaser-runtime-host";
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
    if (host.generatedMechanicProject) {
      return (
        <GeneratedMechanicPhaserRuntimeHost
          ref={hostRef}
          key={host.key}
          template={host.template}
          generatedMechanicProject={host.generatedMechanicProject}
          isPaused={isPaused}
          focusOnReadyKey={focusOnReadyKey}
          frameLabel="Phaser runtime"
          frameDetail="Sandboxed generated mechanic"
          onStatusChange={onStatusChange}
          onValidationEvidence={onValidationEvidence}
          runFirstPlayableChecksOnReady={runFirstPlayableChecksOnReady}
        />
      );
    }

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
