import { describe, expect, it, vi } from "vitest";

import { runMechanicRuntimeCallbacks } from "./mechanic-runtime-callback-runner";

describe("Mechanic runtime callback runner", () => {
  it("stops runtime invocation sequences at the first callback exception", async () => {
    const marker = new Error("generated callback failed");
    const evaluate = vi.fn().mockRejectedValueOnce(marker).mockResolvedValue(undefined);

    await expect(
      runMechanicRuntimeCallbacks({
        mode: "runtime",
        callbacks: new Map([["action", "throw marker;"]]),
        invocations: [{ callbackId: "action", count: 3 }],
        evaluate,
        onCallbackCompleted: vi.fn(),
        onCallbackFailed: vi.fn(),
      })
    ).rejects.toBe(marker);
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it("preserves repeated invocation probes in conformance mode", async () => {
    const firstFailure = new Error("first probe failure");
    const evaluate = vi
      .fn()
      .mockRejectedValueOnce(firstFailure)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("second probe failure"));
    const onCallbackFailed = vi.fn();

    await expect(
      runMechanicRuntimeCallbacks({
        mode: "conformance",
        callbacks: new Map([["probe", "probe();"]]),
        invocations: [{ callbackId: "probe", count: 3 }],
        evaluate,
        onCallbackCompleted: vi.fn(),
        onCallbackFailed,
      })
    ).rejects.toBe(firstFailure);
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(onCallbackFailed).toHaveBeenCalledTimes(2);
  });
});
