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

import type { PreparedGeneratedMechanicRuntimeProject } from "@/game-spec";
import {
  createGeneratedMechanicPhaserRuntimeController,
  type GeneratedMechanicPhaserRuntimeController,
  type GeneratedMechanicPhaserRuntimeControllerOptions,
} from "@/runtime/phaser/generated-mechanic-phaser-runtime-controller";
import type { HandAuthoredPhaserTemplate } from "@/runtime/phaser/top-down-template";
import type { RuntimeValidationEvidence } from "@/runtime/runtime-adapter";

import type {
  RuntimeIframeHostHandle,
  RuntimeIframeStatus,
} from "./runtime-iframe-host";

export type GeneratedMechanicPhaserRuntimeHostProps = {
  template: HandAuthoredPhaserTemplate;
  generatedMechanicProject: PreparedGeneratedMechanicRuntimeProject;
  isPaused?: boolean;
  focusOnReadyKey?: number;
  frameLabel?: string;
  frameDetail?: string;
  onStatusChange?: (status: RuntimeIframeStatus) => void;
  onValidationEvidence?: (evidence: RuntimeValidationEvidence) => void;
  runFirstPlayableChecksOnReady?: boolean;
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
  const controllerRef =
    useRef<GeneratedMechanicPhaserRuntimeController | null>(null);
  const latestOptionsRef =
    useRef<GeneratedMechanicPhaserRuntimeControllerOptions>({
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
    controllerRef.current?.updateOptions({
      focusOnReadyKey,
      onStatusChange,
      onValidationEvidence,
      runFirstPlayableChecksOnReady,
    });
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
        controllerRef.current?.focusGame();
      },
    }),
    []
  );

  useEffect(() => {
    const mount = iframeMountRef.current;
    if (!mount) {
      return;
    }
    const controller = createGeneratedMechanicPhaserRuntimeController({
      mount,
      template,
      generatedMechanicProject,
      options: latestOptionsRef.current,
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [generatedMechanicProject, template]);

  useEffect(() => {
    controllerRef.current?.setPaused(isPaused);
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

export const GeneratedMechanicPhaserRuntimeHost = forwardRef(
  GeneratedMechanicPhaserRuntimeHostInner
) as (
  props: GeneratedMechanicPhaserRuntimeHostProps &
    RefAttributes<RuntimeIframeHostHandle>
) => ReactElement;
