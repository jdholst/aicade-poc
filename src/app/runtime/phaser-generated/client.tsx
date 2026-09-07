"use client";

import { useEffect } from "react";

import { waitForGeneratedMechanicIframeSesWorkerController } from "@/runtime/mechanics/generated-mechanic-iframe-ses-worker-controller";
import { waitForGeneratedMechanicPhaserChildSession } from "@/runtime/phaser/generated-mechanic-phaser-host-protocol";

import { createTrustedGeneratedMechanicPhaserRoute } from "./runtime";

const earlyWaiters =
  typeof window === "undefined"
    ? null
    : Object.freeze({
        controller: observeWaiter(
          waitForGeneratedMechanicIframeSesWorkerController({
            ownerWindow: window,
            expectedParent: window.parent,
          })
        ),
        project: observeWaiter(
          waitForGeneratedMechanicPhaserChildSession({
            ownerWindow: window,
            expectedParent: window.parent,
          })
        ),
      });

type GeneratedMechanicPhaserClientLease = {
  disposed: boolean;
  route: ReturnType<typeof createTrustedGeneratedMechanicPhaserRoute>;
};

let activeLease: GeneratedMechanicPhaserClientLease | null = null;

export default function GeneratedMechanicPhaserClient() {
  useEffect(() => {
    if (!earlyWaiters) {
      return;
    }
    ensureClientRoute();
  }, []);

  return (
    <div
      id="game"
      data-testid="phaser-generated-game"
      tabIndex={0}
      style={{
        width: "100vw",
        height: "100dvh",
        margin: 0,
        overflow: "hidden",
        outline: "none",
        background: "#10171e",
      }}
    />
  );
}

function ensureClientRoute(): void {
  if (!earlyWaiters) {
    return;
  }
  activeLease ??= {
    disposed: false,
    route: createTrustedGeneratedMechanicPhaserRoute({
      waiters: earlyWaiters,
    }),
  };
  const lease = activeLease;
  void lease.route.ready.catch(() => undefined);
  window.addEventListener("pagehide", disposeOnPageExit);
}

function disposeOnPageExit(event: PageTransitionEvent): void {
  if (event.persisted || !activeLease || activeLease.disposed) {
    return;
  }
  activeLease.disposed = true;
  window.removeEventListener("pagehide", disposeOnPageExit);
  void activeLease.route.dispose().catch(() => undefined);
}

function observeWaiter<Value>(promise: Promise<Value>): Promise<Value> {
  void promise.catch(() => undefined);
  return promise;
}
