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
      issue: {
        message: "Boot failed",
        recoverable: false,
        severity: "error",
        type: "runtime-error",
      },
      message: "Boot failed",
    });
  });

  it("parses structured recoverable runtime issues from game-error events", () => {
    expect(
      parseRuntimeEvent({
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
      })
    ).toEqual({
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
      issue: {
        message: "Generated module crashed.",
        recoverable: false,
        severity: "error",
        type: "runtime-error",
      },
      message: "Generated module crashed.",
    });

    expect(
      parseRuntimeEvent({
        type: "game-error",
        issue: {
          type: "future-runtime-warning",
          severity: "warning",
          recoverable: true,
          message: "A future issue type was emitted.",
        },
        message: "Fallback message.",
      })
    ).toEqual({
      type: "game-error",
      issue: {
        message: "Fallback message.",
        recoverable: false,
        severity: "error",
        type: "runtime-error",
      },
      message: "Fallback message.",
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
