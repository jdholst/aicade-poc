import { describe, expect, it, vi } from "vitest";

import {
  compileAndRunMechanicRuntimeCallback,
  evaluateMeteredMechanicRuntimeCallback,
  runMechanicRuntimeCallbacks,
} from "./mechanic-runtime-callback-runner";

describe("Mechanic runtime callback runner", () => {
  it("keeps generic callback compilation inside generated-work measurement", async () => {
    const order: string[] = [];

    await evaluateMeteredMechanicRuntimeCallback({
      source: "return true;",
      evaluate: async (source) => {
        order.push("compile-and-run");
        expect(source).toBe("(async () => { return true;\n})()");
      },
      onStarted: () => order.push("meter-start"),
      onFinished: () => order.push("meter-finish"),
    });

    expect(order).toEqual([
      "meter-start",
      "compile-and-run",
      "meter-finish",
    ]);
  });

  it("compiles callback source before starting the generated-work meter", async () => {
    const order: string[] = [];

    await compileAndRunMechanicRuntimeCallback({
      source: "return true;",
      compile: (source) => {
        order.push("compile");
        expect(source).toBe(
          "(async (__sparklineLifecycleContext) => { return true;\n})"
        );
        return async () => {
          order.push("generated-work");
        };
      },
      onStarted: () => order.push("meter-start"),
      onFinished: () => order.push("meter-finish"),
    });

    expect(order).toEqual([
      "compile",
      "meter-start",
      "generated-work",
      "meter-finish",
    ]);
  });

  it("passes trusted lifecycle context only when invoking metered generated work", async () => {
    const lifecycleContext = Object.freeze({ marker: "trusted" });
    const order: string[] = [];

    await compileAndRunMechanicRuntimeCallback({
      source: "return context.marker;",
      lifecycleContext,
      compile: (source) => {
        order.push("compile");
        expect(source).toBe(
          "(async (__sparklineLifecycleContext) => { return context.marker;\n})"
        );
        return async (receivedContext: unknown) => {
          order.push("generated-work");
          expect(receivedContext).toBe(lifecycleContext);
        };
      },
      onStarted: () => order.push("meter-start"),
      onFinished: () => order.push("meter-finish"),
    });

    expect(order).toEqual([
      "compile",
      "meter-start",
      "generated-work",
      "meter-finish",
    ]);
  });

  it("finishes generated-work measurement when a compiled callback throws", async () => {
    const marker = new Error("generated callback failed");
    const onStarted = vi.fn();
    const onFinished = vi.fn();

    await expect(
      compileAndRunMechanicRuntimeCallback({
        source: "throw marker;",
        compile: () => async () => {
          throw marker;
        },
        onStarted,
        onFinished,
      })
    ).rejects.toBe(marker);
    expect(onStarted).toHaveBeenCalledOnce();
    expect(onFinished).toHaveBeenCalledOnce();
  });

  it("rejects a compiler result that is not callable before measurement starts", async () => {
    const onStarted = vi.fn();

    await expect(
      compileAndRunMechanicRuntimeCallback({
        source: "return true;",
        compile: () => 42,
        onStarted,
        onFinished: vi.fn(),
      })
    ).rejects.toThrow("did not compile to a callable");
    expect(onStarted).not.toHaveBeenCalled();
  });

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
