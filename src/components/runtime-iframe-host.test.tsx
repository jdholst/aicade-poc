import { act, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeAdapter } from "@/runtime/runtime-adapter";

import {
  RuntimeIframeHost,
  type RuntimeIframeHostHandle,
  type RuntimeIframeStatus,
} from "./runtime-iframe-host";

type TestRuntimeArtifact = {
  id: string;
  title: string;
};

const artifact: TestRuntimeArtifact = {
  id: "test-runtime",
  title: "Test Runtime",
};

const runtimeAdapter: RuntimeAdapter<TestRuntimeArtifact> = {
  kind: "phaser",
  createMountDescriptor(runtimeArtifact) {
    return {
      title: runtimeArtifact.title,
      sandbox: "allow-scripts",
      srcDoc:
        '<!doctype html><html><body><div id="test-runtime"></div></body></html>',
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
      return {
        type: "game-error",
        issue: {
          message: "Runtime failed.",
          recoverable: false,
          severity: "error",
          type: "runtime-error",
        },
        message: "Runtime failed.",
      };
    }

    if (event.type === "mechanic-warning") {
      return {
        type: "game-error",
        issue: {
          type: "mechanic-disabled",
          severity: "warning",
          recoverable: true,
          mechanicId: "mechanic_player_movement",
          mechanicType: "player_movement",
          phase: "install",
          message:
            "Mechanic mechanic_player_movement install failed: Keyboard setup failed",
        },
        message:
          "Mechanic mechanic_player_movement install failed: Keyboard setup failed",
      };
    }

    return null;
  },
};

function dispatchRuntimeMessage(
  iframe: HTMLIFrameElement,
  data: unknown,
  source: MessageEventSource | null = iframe.contentWindow
) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        source,
      })
    );
  });
}

describe("RuntimeIframeHost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("mounts an artifact using the runtime adapter descriptor", () => {
    render(
      <RuntimeIframeHost artifact={artifact} runtimeAdapter={runtimeAdapter} />
    );

    const iframe = screen.getByTitle<HTMLIFrameElement>("Test Runtime");

    expect(screen.getByText("Runtime")).toBeVisible();
    expect(screen.getByText("Sandboxed iframe")).toBeVisible();
    expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
    expect(iframe).toHaveAttribute(
      "srcdoc",
      '<!doctype html><html><body><div id="test-runtime"></div></body></html>'
    );
  });

  it("reports loading, ready, and error states from parsed runtime events", async () => {
    const statuses: RuntimeIframeStatus[] = [];

    render(
      <RuntimeIframeHost
        artifact={artifact}
        runtimeAdapter={runtimeAdapter}
        onStatusChange={(status) => {
          statuses.push(status);
        }}
      />
    );

    await waitFor(() => {
      expect(statuses.at(-1)).toEqual({ state: "loading" });
    });

    const iframe = screen.getByTitle<HTMLIFrameElement>("Test Runtime");

    dispatchRuntimeMessage(iframe, { type: "ready" });

    expect(statuses.at(-1)).toEqual({ state: "ready" });

    dispatchRuntimeMessage(iframe, { type: "error" });

    expect(statuses.at(-1)).toEqual({
      state: "error",
      message: "Runtime failed.",
    });
  });

  it("keeps debug, unrecognized, and foreign-window messages from changing status", async () => {
    const statuses: RuntimeIframeStatus[] = [];

    render(
      <RuntimeIframeHost
        artifact={artifact}
        runtimeAdapter={runtimeAdapter}
        onStatusChange={(status) => {
          statuses.push(status);
        }}
      />
    );

    await waitFor(() => {
      expect(statuses.at(-1)).toEqual({ state: "loading" });
    });

    const iframe = screen.getByTitle<HTMLIFrameElement>("Test Runtime");

    dispatchRuntimeMessage(iframe, { type: "debug" });
    dispatchRuntimeMessage(iframe, { type: "unknown" });
    dispatchRuntimeMessage(iframe, { type: "ready" }, window);

    expect(statuses).toEqual([{ state: "loading" }]);
  });

  it("reports recoverable warnings without settling the runtime", async () => {
    vi.useFakeTimers();
    const statuses: RuntimeIframeStatus[] = [];

    act(() => {
      render(
        <RuntimeIframeHost
          artifact={artifact}
          runtimeAdapter={runtimeAdapter}
          onStatusChange={(status) => {
            statuses.push(status);
          }}
        />
      );
    });

    const iframe = screen.getByTitle<HTMLIFrameElement>("Test Runtime");

    dispatchRuntimeMessage(iframe, { type: "mechanic-warning" });

    expect(statuses.at(-1)).toEqual({
      state: "warning",
      issue: {
        type: "mechanic-disabled",
        severity: "warning",
        recoverable: true,
        mechanicId: "mechanic_player_movement",
        mechanicType: "player_movement",
        phase: "install",
        message:
          "Mechanic mechanic_player_movement install failed: Keyboard setup failed",
      },
    });

    dispatchRuntimeMessage(iframe, { type: "ready" });

    expect(statuses.at(-1)).toEqual({ state: "ready" });

    act(() => {
      vi.runAllTimers();
    });

    expect(statuses.at(-1)).toEqual({ state: "ready" });
  });

  it("times out when the runtime never sends a settling event", () => {
    vi.useFakeTimers();
    const statuses: RuntimeIframeStatus[] = [];

    act(() => {
      render(
        <RuntimeIframeHost
          artifact={artifact}
          runtimeAdapter={runtimeAdapter}
          onStatusChange={(status) => {
            statuses.push(status);
          }}
        />
      );
    });

    expect(statuses.at(-1)).toEqual({ state: "loading" });

    act(() => {
      vi.runAllTimers();
    });

    expect(statuses.at(-1)).toEqual({
      state: "error",
      message:
        "The generated sandbox did not finish booting. Regenerate the game to request a fresh module.",
    });
  });

  it("clears the boot timeout after the runtime becomes ready", () => {
    vi.useFakeTimers();
    const statuses: RuntimeIframeStatus[] = [];

    act(() => {
      render(
        <RuntimeIframeHost
          artifact={artifact}
          runtimeAdapter={runtimeAdapter}
          onStatusChange={(status) => {
            statuses.push(status);
          }}
        />
      );
    });

    const iframe = screen.getByTitle<HTMLIFrameElement>("Test Runtime");

    dispatchRuntimeMessage(iframe, { type: "ready" });

    act(() => {
      vi.runAllTimers();
    });

    expect(statuses.at(-1)).toEqual({ state: "ready" });
  });

  it("schedules focus commands when the runtime becomes ready after a focus request", () => {
    vi.useFakeTimers();

    render(
      <RuntimeIframeHost
        artifact={artifact}
        runtimeAdapter={runtimeAdapter}
        focusOnReadyKey={1}
      />
    );

    const iframe = screen.getByTitle<HTMLIFrameElement>("Test Runtime");
    const iframeFocus = vi
      .spyOn(iframe, "focus")
      .mockImplementation(() => undefined);
    const windowFocus = vi
      .spyOn(iframe.contentWindow!, "focus")
      .mockImplementation(() => undefined);
    const postMessage = vi
      .spyOn(iframe.contentWindow!, "postMessage")
      .mockImplementation(() => undefined);

    dispatchRuntimeMessage(iframe, { type: "ready" });

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(iframeFocus).toHaveBeenCalledTimes(2);
    expect(windowFocus).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenCalledWith({ type: "game-focus" }, "*");
  });

  it("posts pause commands when the host pause state changes", async () => {
    const { rerender } = render(
      <RuntimeIframeHost
        artifact={artifact}
        runtimeAdapter={runtimeAdapter}
        isPaused={false}
      />
    );
    const iframe = screen.getByTitle<HTMLIFrameElement>("Test Runtime");
    const postMessage = vi
      .spyOn(iframe.contentWindow!, "postMessage")
      .mockImplementation(() => undefined);

    rerender(
      <RuntimeIframeHost
        artifact={artifact}
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

  it("exposes a focus handle for the hosted runtime iframe", () => {
    const ref = createRef<RuntimeIframeHostHandle>();

    render(
      <RuntimeIframeHost
        ref={ref}
        artifact={artifact}
        runtimeAdapter={runtimeAdapter}
      />
    );

    const iframe = screen.getByTitle<HTMLIFrameElement>("Test Runtime");
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
});
