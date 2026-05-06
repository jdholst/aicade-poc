import { act, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GeneratedGameHost,
  type GeneratedGameHostHandle,
  type GeneratedGameStatus,
} from "./generated-game-host";
import type { RuntimeAdapter } from "@/runtime/runtime-adapter";
import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";

const pack: GeneratedGamePack = {
  project: {
    name: "Protocol Host Test",
    summary: "A generated game pack for host protocol tests.",
  },
  chatTranscript: [
    { role: "user", text: "make a runtime protocol test" },
    { role: "assistant", text: "planning the protocol test" },
    { role: "assistant", text: "built the protocol test" },
  ],
  manifest: {
    title: "Protocol Host Test",
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

const runtimeAdapter: RuntimeAdapter<GeneratedGamePack> = {
  kind: "canvas2d",
  createMountDescriptor() {
    return {
      title: "Protocol Host Test",
      sandbox: "allow-scripts",
      srcDoc: "<!doctype html><html><body></body></html>",
    };
  },
  parseEvent(data) {
    if (!data || typeof data !== "object") {
      return null;
    }

    const event = data as { type?: unknown };

    if (event.type === "debug") {
      return {
        type: "game-debug-event",
        message: "Runtime diagnostics are available.",
      };
    }

    if (event.type === "ready") {
      return { type: "game-ready" };
    }

    if (event.type === "error") {
      return { type: "game-error", message: "Runtime failed." };
    }

    return null;
  },
};

describe("GeneratedGameHost runtime protocol handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders the iframe from the runtime adapter mount descriptor", () => {
    render(<GeneratedGameHost pack={pack} runtimeAdapter={runtimeAdapter} />);

    const iframe = screen.getByTitle<HTMLIFrameElement>("Protocol Host Test");

    expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
    expect(iframe).toHaveAttribute(
      "srcdoc",
      "<!doctype html><html><body></body></html>"
    );
  });

  it("keeps debug events internal while preserving ready and error status updates", async () => {
    const statuses: GeneratedGameStatus[] = [];

    render(
      <GeneratedGameHost
        pack={pack}
        runtimeAdapter={runtimeAdapter}
        onStatusChange={(status) => {
          statuses.push(status);
        }}
      />
    );

    await waitFor(() => {
      expect(statuses.at(-1)).toEqual({
        state: "loading",
        message: "Booting generated canvas module...",
      });
    });

    const iframe = screen.getByTitle<HTMLIFrameElement>("Protocol Host Test");

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "debug" },
          source: iframe.contentWindow,
        })
      );
    });

    expect(statuses.at(-1)).toEqual({
      state: "loading",
      message: "Booting generated canvas module...",
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "ready" },
          source: iframe.contentWindow,
        })
      );
    });

    expect(statuses.at(-1)).toEqual({
      state: "ready",
      message: "Generated module is running in the sandbox.",
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "error" },
          source: iframe.contentWindow,
        })
      );
    });

    expect(statuses.at(-1)).toEqual({
      state: "error",
      message: "Runtime failed.",
    });
  });

  it("ignores messages from other windows and unrecognized runtime messages", async () => {
    const statuses: GeneratedGameStatus[] = [];

    render(
      <GeneratedGameHost
        pack={pack}
        runtimeAdapter={runtimeAdapter}
        onStatusChange={(status) => {
          statuses.push(status);
        }}
      />
    );

    await waitFor(() => {
      expect(statuses.at(-1)?.state).toBe("loading");
    });

    const iframe = screen.getByTitle<HTMLIFrameElement>("Protocol Host Test");

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "ready" },
          source: window,
        })
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "unknown" },
          source: iframe.contentWindow,
        })
      );
    });

    expect(statuses.at(-1)).toEqual({
      state: "loading",
      message: "Booting generated canvas module...",
    });
  });

  it("does not let debug events settle the runtime boot timeout", () => {
    vi.useFakeTimers();
    const statuses: GeneratedGameStatus[] = [];

    act(() => {
      render(
        <GeneratedGameHost
          pack={pack}
          runtimeAdapter={runtimeAdapter}
          onStatusChange={(status) => {
            statuses.push(status);
          }}
        />
      );
    });

    expect(statuses.at(-1)?.state).toBe("loading");

    const iframe = screen.getByTitle<HTMLIFrameElement>("Protocol Host Test");

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "debug" },
          source: iframe.contentWindow,
        })
      );
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(statuses.at(-1)).toEqual({
      state: "error",
      message:
        "The generated sandbox did not finish booting. Regenerate the game to request a fresh module.",
    });
  });

  it("clears the boot timeout after ready", () => {
    vi.useFakeTimers();
    const statuses: GeneratedGameStatus[] = [];

    act(() => {
      render(
        <GeneratedGameHost
          pack={pack}
          runtimeAdapter={runtimeAdapter}
          onStatusChange={(status) => {
            statuses.push(status);
          }}
        />
      );
    });

    const iframe = screen.getByTitle<HTMLIFrameElement>("Protocol Host Test");

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "ready" },
          source: iframe.contentWindow,
        })
      );
    });
    act(() => {
      vi.runAllTimers();
    });

    expect(statuses.at(-1)).toEqual({
      state: "ready",
      message: "Generated module is running in the sandbox.",
    });
  });

  it("posts pause commands when the host pause state changes", async () => {
    const { rerender } = render(
      <GeneratedGameHost
        pack={pack}
        runtimeAdapter={runtimeAdapter}
        isPaused={false}
      />
    );
    const iframe = screen.getByTitle<HTMLIFrameElement>("Protocol Host Test");
    const postMessage = vi
      .spyOn(iframe.contentWindow!, "postMessage")
      .mockImplementation(() => undefined);

    rerender(
      <GeneratedGameHost
        pack={pack}
        runtimeAdapter={runtimeAdapter}
        isPaused
      />
    );

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        { type: "game-pause", paused: true },
        "*"
      );
    });
  });

  it("exposes an imperative focus handle for the iframe sandbox", () => {
    const ref = createRef<GeneratedGameHostHandle>();

    render(
      <GeneratedGameHost
        ref={ref}
        pack={pack}
        runtimeAdapter={runtimeAdapter}
      />
    );

    const iframe = screen.getByTitle<HTMLIFrameElement>("Protocol Host Test");
    const iframeFocus = vi
      .spyOn(iframe, "focus")
      .mockImplementation(() => undefined);
    const windowFocus = vi
      .spyOn(iframe.contentWindow!, "focus")
      .mockImplementation(() => undefined);
    const postMessage = vi
      .spyOn(iframe.contentWindow!, "postMessage")
      .mockImplementation(() => undefined);

    act(() => {
      ref.current?.focusGame();
    });

    expect(iframeFocus).toHaveBeenCalled();
    expect(windowFocus).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: "game-focus" }, "*");
  });

  it("schedules sandbox focus when a ready event follows a focus request", () => {
    vi.useFakeTimers();

    render(
      <GeneratedGameHost
        pack={pack}
        runtimeAdapter={runtimeAdapter}
        focusOnReadyKey={1}
      />
    );

    const iframe = screen.getByTitle<HTMLIFrameElement>("Protocol Host Test");
    const iframeFocus = vi
      .spyOn(iframe, "focus")
      .mockImplementation(() => undefined);
    const windowFocus = vi
      .spyOn(iframe.contentWindow!, "focus")
      .mockImplementation(() => undefined);
    const postMessage = vi
      .spyOn(iframe.contentWindow!, "postMessage")
      .mockImplementation(() => undefined);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "ready" },
          source: iframe.contentWindow,
        })
      );
    });
    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(iframeFocus).toHaveBeenCalledTimes(2);
    expect(windowFocus).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenCalledWith({ type: "game-focus" }, "*");
  });
});
