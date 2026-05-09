import { afterEach, describe, expect, it, vi } from "vitest";

import {
  focusRuntimeIframe,
  postRuntimeIframeCommand,
  scheduleRuntimeIframeFocus,
} from "./runtime-iframe-commands";

describe("runtime iframe commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("posts host commands to the runtime window", () => {
    const target = {
      postMessage: vi.fn(),
    } as unknown as Window;

    postRuntimeIframeCommand(target, { type: "game-reload" });

    expect(target.postMessage).toHaveBeenCalledWith(
      { type: "game-reload" },
      "*"
    );
  });

  it("ignores missing runtime windows when posting commands", () => {
    expect(() => {
      postRuntimeIframeCommand(null, { type: "game-focus" });
      postRuntimeIframeCommand(undefined, { type: "game-focus" });
    }).not.toThrow();
  });

  it("focuses the iframe, focuses the child window, and posts game-focus", () => {
    const contentWindow = {
      focus: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as Window;
    const iframe = {
      contentWindow,
      focus: vi.fn(),
    } as unknown as HTMLIFrameElement;

    focusRuntimeIframe(iframe);

    expect(iframe.focus).toHaveBeenCalled();
    expect(contentWindow.focus).toHaveBeenCalled();
    expect(contentWindow.postMessage).toHaveBeenCalledWith(
      { type: "game-focus" },
      "*"
    );
  });

  it("schedules immediate and follow-up runtime focus attempts", () => {
    vi.useFakeTimers();
    const contentWindow = {
      focus: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as Window;
    const iframe = {
      contentWindow,
      focus: vi.fn(),
    } as unknown as HTMLIFrameElement;

    scheduleRuntimeIframeFocus(iframe);

    vi.advanceTimersByTime(0);
    expect(contentWindow.postMessage).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(120);
    expect(iframe.focus).toHaveBeenCalledTimes(2);
    expect(contentWindow.focus).toHaveBeenCalledTimes(2);
    expect(contentWindow.postMessage).toHaveBeenCalledTimes(2);
  });

  it("allows scheduled focus attempts to be cancelled", () => {
    vi.useFakeTimers();
    const contentWindow = {
      focus: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as Window;
    const iframe = {
      contentWindow,
      focus: vi.fn(),
    } as unknown as HTMLIFrameElement;

    const cancel = scheduleRuntimeIframeFocus(iframe);
    cancel();
    vi.runAllTimers();

    expect(iframe.focus).not.toHaveBeenCalled();
    expect(contentWindow.postMessage).not.toHaveBeenCalled();
  });
});
