import { describe, expect, it } from "vitest";

import { hasCallbacks } from "./probe-helpers.mjs";

describe("hasCallbacks", () => {
  it("reads scheduled callbacks from callbacks and cleanup from the dispose flag", () => {
    const artifact = {
      contract: {
        lifecycle: {
          callbacks: ["install", "scheduled"],
          dispose: true,
        },
      },
    };

    expect(hasCallbacks(artifact, ["scheduled", "dispose"])).toBe(true);
  });

  it("does not infer cleanup from an absent dispose flag", () => {
    const artifact = {
      contract: {
        lifecycle: {
          callbacks: ["install", "scheduled"],
          dispose: false,
        },
      },
    };

    expect(hasCallbacks(artifact, ["scheduled", "dispose"])).toBe(false);
  });
});
