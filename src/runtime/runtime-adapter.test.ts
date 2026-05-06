import { describe, expect, it } from "vitest";

import { parseRuntimeEvent, postRuntimeCommand } from "./runtime-adapter";

describe("runtime adapter protocol", () => {
  it("parses ready and error events from the runtime iframe", () => {
    expect(parseRuntimeEvent({ type: "game-ready" })).toEqual({
      type: "game-ready",
    });

    expect(
      parseRuntimeEvent({ type: "game-error", message: "Boot failed" })
    ).toEqual({
      type: "game-error",
      message: "Boot failed",
    });
  });

  it("parses debug events from the runtime iframe", () => {
    expect(
      parseRuntimeEvent({
        type: "game-debug-event",
        message: "Spawn table initialized.",
        data: { enemyCount: 3 },
      })
    ).toEqual({
      type: "game-debug-event",
      message: "Spawn table initialized.",
      data: { enemyCount: 3 },
    });
  });

  it("ignores unrelated messages and normalizes malformed runtime errors", () => {
    expect(parseRuntimeEvent(null)).toBeNull();
    expect(parseRuntimeEvent({ type: "analytics-ping" })).toBeNull();
    expect(parseRuntimeEvent({ type: "game-debug-event" })).toBeNull();

    expect(parseRuntimeEvent({ type: "game-error" })).toEqual({
      type: "game-error",
      message: "Generated module crashed.",
    });
  });

  it("posts runtime commands to the iframe window", () => {
    const posted: Array<{ command: unknown; origin: string }> = [];
    const target = {
      postMessage(command: unknown, origin: string) {
        posted.push({ command, origin });
      },
    };

    postRuntimeCommand(target, { type: "game-pause", paused: true });
    postRuntimeCommand(target, { type: "game-reload" });
    postRuntimeCommand(target, {
      type: "game-resize",
      viewport: {
        width: 1280,
        height: 720,
        scaling: "stretch_to_fill",
      },
    });

    expect(posted).toEqual([
      {
        command: { type: "game-pause", paused: true },
        origin: "*",
      },
      {
        command: { type: "game-reload" },
        origin: "*",
      },
      {
        command: {
          type: "game-resize",
          viewport: {
            width: 1280,
            height: 720,
            scaling: "stretch_to_fill",
          },
        },
        origin: "*",
      },
    ]);
  });
});
