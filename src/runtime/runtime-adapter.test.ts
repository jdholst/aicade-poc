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

  it("ignores unrelated messages and normalizes malformed runtime errors", () => {
    expect(parseRuntimeEvent(null)).toBeNull();
    expect(parseRuntimeEvent({ type: "analytics-ping" })).toBeNull();

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

    expect(posted).toEqual([
      {
        command: { type: "game-pause", paused: true },
        origin: "*",
      },
    ]);
  });
});
