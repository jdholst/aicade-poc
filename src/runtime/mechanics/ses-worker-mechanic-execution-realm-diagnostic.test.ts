import { describe, expect, it, vi } from "vitest";

import { containedErrorMessage } from "./ses-worker-mechanic-execution-realm-diagnostic";

describe("containedErrorMessage", () => {
  it("preserves safe cross-realm-shaped Error messages without invoking accessors", () => {
    const crossRealmError = Object.freeze({
      name: "Error",
      message: "Owned-object query returned no handle.",
    });
    const accessor = vi.fn(() => "untrusted getter result");
    const accessorThrown = Object.defineProperty({}, "message", {
      get: accessor,
    });

    expect(crossRealmError).not.toBeInstanceOf(Error);
    expect(
      containedErrorMessage(
        crossRealmError,
        "Generated mechanic execution was contained."
      )
    ).toBe("Owned-object query returned no handle.");
    expect(
      containedErrorMessage(
        accessorThrown,
        "Generated mechanic execution was contained."
      )
    ).toBe("Generated mechanic execution was contained.");
    expect(accessor).not.toHaveBeenCalled();
  });

  it("uses a caller-supplied stable fallback for primitive or empty throws", () => {
    const fallback = "Generated mechanic execution was contained.";

    expect(containedErrorMessage("failure", fallback)).toBe(fallback);
    expect(containedErrorMessage({ message: "" }, fallback)).toBe(fallback);
  });
});
