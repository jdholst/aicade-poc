import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GeneratedGameHost } from "@/components/generated-game-host";
import {
  RuntimeIframeHost,
  type RuntimeIframeStatus,
} from "@/components/runtime-iframe-host";
import { phaserRuntimeAdapter, topDownPhaserTemplate } from "@/runtime/phaser";
import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";

const canvasPack: GeneratedGamePack = {
  project: {
    name: "Canvas Smoke Test",
    summary: "A minimal generated game pack for runtime smoke validation.",
  },
  chatTranscript: [
    { role: "user", text: "make a smoke test game" },
    { role: "assistant", text: "planning the smoke test game" },
    { role: "assistant", text: "built the smoke test game" },
  ],
  manifest: {
    title: "Canvas Smoke Test",
    genre: "arcade",
    runtime: "canvas2d",
    editableSpecVersion: "1",
    viewport: {
      width: 960,
      height: 540,
      scaling: "stretch_to_fill",
    },
    capabilities: ["start", "update", "render"],
    controls: [
      {
        action: "move_left",
        label: "Move left",
        keys: ["ArrowLeft"],
        kind: "button",
      },
    ],
  },
  editableSpec: {},
  editorMetadata: {
    panels: [
      {
        title: "Runtime",
        items: [{ label: "Engine", value: "Canvas 2D" }],
      },
    ],
  },
  moduleSourceTs: "globalThis.createGameModule = function createGameModule() {};",
  moduleSourceJs: "globalThis.createGameModule = function createGameModule() {};",
};

function dispatchRuntimeMessage(iframe: HTMLIFrameElement, data: unknown) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        source: iframe.contentWindow,
      })
    );
  });
}

describe("runtime path smoke validation", () => {
  it("mounts the Canvas runtime path and reports ready", async () => {
    const statuses: RuntimeIframeStatus[] = [];

    render(
      <GeneratedGameHost
        pack={canvasPack}
        onStatusChange={(status) => {
          statuses.push(status);
        }}
      />
    );

    await waitFor(() => {
      expect(statuses.at(-1)).toEqual({ state: "loading" });
    });

    const iframe = screen.getByTitle<HTMLIFrameElement>("Canvas Smoke Test");

    expect(iframe).toBeVisible();

    dispatchRuntimeMessage(iframe, { type: "game-ready" });

    expect(statuses.at(-1)).toEqual({ state: "ready" });
  });

  it("mounts the Canvas runtime path and reports errors", async () => {
    const statuses: RuntimeIframeStatus[] = [];

    render(
      <GeneratedGameHost
        pack={canvasPack}
        onStatusChange={(status) => {
          statuses.push(status);
        }}
      />
    );

    await waitFor(() => {
      expect(statuses.at(-1)).toEqual({ state: "loading" });
    });

    const iframe = screen.getByTitle<HTMLIFrameElement>("Canvas Smoke Test");

    expect(iframe).toBeVisible();

    dispatchRuntimeMessage(iframe, {
      type: "game-error",
      message: "Canvas smoke failure.",
    });

    expect(statuses.at(-1)).toEqual({
      state: "error",
      message: "Canvas smoke failure.",
    });
  });

  it("mounts the Phaser runtime path and reports ready", async () => {
    const statuses: RuntimeIframeStatus[] = [];

    render(
      <RuntimeIframeHost
        artifact={topDownPhaserTemplate}
        runtimeAdapter={phaserRuntimeAdapter}
        onStatusChange={(status) => {
          statuses.push(status);
        }}
      />
    );

    await waitFor(() => {
      expect(statuses.at(-1)).toEqual({ state: "loading" });
    });

    const iframe = screen.getByTitle<HTMLIFrameElement>("Crystal Spec Chase");

    expect(iframe).toBeVisible();

    dispatchRuntimeMessage(iframe, { type: "game-ready" });

    expect(statuses.at(-1)).toEqual({ state: "ready" });
  });

  it("mounts the Phaser runtime path and reports errors", async () => {
    const statuses: RuntimeIframeStatus[] = [];

    render(
      <RuntimeIframeHost
        artifact={topDownPhaserTemplate}
        runtimeAdapter={phaserRuntimeAdapter}
        onStatusChange={(status) => {
          statuses.push(status);
        }}
      />
    );

    await waitFor(() => {
      expect(statuses.at(-1)).toEqual({ state: "loading" });
    });

    const iframe = screen.getByTitle<HTMLIFrameElement>("Crystal Spec Chase");

    expect(iframe).toBeVisible();

    dispatchRuntimeMessage(iframe, {
      type: "game-error",
      message: "Phaser smoke failure.",
    });

    expect(statuses.at(-1)).toEqual({
      state: "error",
      message: "Phaser smoke failure.",
    });
  });
});
