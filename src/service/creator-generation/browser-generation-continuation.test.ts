import { describe, expect, it, vi } from "vitest";

import {
  createBrowserGenerationContinuationAuthority,
  type BrowserGenerationContinuationError,
  type BrowserGenerationContinuationCorrelation,
} from "./browser-generation-continuation";

function createCorrelation(
  overrides: Partial<BrowserGenerationContinuationCorrelation> = {}
): BrowserGenerationContinuationCorrelation {
  return {
    generationRunId: "generation_run_16_5",
    stage: "runtime_browser_validation",
    attemptNumber: 2,
    artifactIds: ["contract_1", "source_2", "evaluation_2"],
    capabilityVersion: "mechanic_capability/v1",
    cancellationEpoch: 4,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("createBrowserGenerationContinuationAuthority", () => {
  it("issues an opaque receipt and an authentic completion bound to the exact browser correlation", async () => {
    const authority = createBrowserGenerationContinuationAuthority();
    const correlation = createCorrelation();
    const receipt = authority.issue(correlation);
    const run = vi.fn().mockResolvedValue({ browserChecksPassed: true });

    expect(Object.keys(receipt)).toEqual([]);
    expect(JSON.stringify(receipt)).toBe("{}");

    const completion = await authority.consume({
      expected: correlation,
      receipt,
      run,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({
      generationRunId: "generation_run_16_5",
      stage: "runtime_browser_validation",
      attemptNumber: 2,
      artifactIds: ["contract_1", "source_2", "evaluation_2"],
      capabilityVersion: "mechanic_capability/v1",
      cancellationEpoch: 4,
      signal: correlation.signal,
    });
    expect(Object.isFrozen(run.mock.calls[0]?.[0])).toBe(true);
    expect(Object.isFrozen(run.mock.calls[0]?.[0].artifactIds)).toBe(true);
    expect(completion).toEqual({
      kind: "browser_generation_continuation_completed",
      protocolVersion: "browser_generation_continuation/v1",
      generationRunId: "generation_run_16_5",
      stage: "runtime_browser_validation",
      attemptNumber: 2,
      artifactIds: ["contract_1", "source_2", "evaluation_2"],
      capabilityVersion: "mechanic_capability/v1",
      cancellationEpoch: 4,
      result: { browserChecksPassed: true },
    });
    expect(authority.isAuthenticCompletion(completion)).toBe(true);
    expect(
      authority.isAuthenticCompletion({
        ...completion,
      })
    ).toBe(false);
    expect(
      authority.isAuthenticCompletion(JSON.parse(JSON.stringify(completion)))
    ).toBe(false);
  });

  it("rejects spread and JSON receipt copies without spending the original receipt", async () => {
    const authority = createBrowserGenerationContinuationAuthority();
    const correlation = createCorrelation();
    const receipt = authority.issue(correlation);
    const run = vi.fn().mockResolvedValue("accepted");

    await expect(
      authority.consume({
        expected: correlation,
        receipt: { ...receipt },
        run,
      })
    ).rejects.toMatchObject({
      code: "invalid_or_consumed_receipt",
    });
    await expect(
      authority.consume({
        expected: correlation,
        receipt: JSON.parse(JSON.stringify(receipt)),
        run,
      })
    ).rejects.toMatchObject({
      code: "invalid_or_consumed_receipt",
    });

    await expect(
      authority.consume({ expected: correlation, receipt, run })
    ).resolves.toMatchObject({ result: "accepted" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not transfer receipt or completion authority between factories", async () => {
    const issuingAuthority = createBrowserGenerationContinuationAuthority();
    const foreignAuthority = createBrowserGenerationContinuationAuthority();
    const correlation = createCorrelation();
    const receipt = issuingAuthority.issue(correlation);
    const run = vi.fn().mockResolvedValue("complete");

    await expect(
      foreignAuthority.consume({ expected: correlation, receipt, run })
    ).rejects.toMatchObject({
      code: "invalid_or_consumed_receipt",
    });

    const completion = await issuingAuthority.consume({
      expected: correlation,
      receipt,
      run,
    });
    expect(issuingAuthority.isAuthenticCompletion(completion)).toBe(true);
    expect(foreignAuthority.isAuthenticCompletion(completion)).toBe(false);
  });

  it("deletes a live receipt before awaiting so replay and parallel duplicate consumption fail", async () => {
    const authority = createBrowserGenerationContinuationAuthority();
    const correlation = createCorrelation();
    const receipt = authority.issue(correlation);
    const pending = deferred<string>();
    const run = vi.fn(() => pending.promise);

    const firstConsumption = authority.consume({
      expected: correlation,
      receipt,
      run,
    });
    const parallelConsumption = authority.consume({
      expected: correlation,
      receipt,
      run,
    });

    await expect(parallelConsumption).rejects.toMatchObject({
      code: "invalid_or_consumed_receipt",
    });
    pending.resolve("complete");
    await expect(firstConsumption).resolves.toMatchObject({
      result: "complete",
    });
    await expect(
      authority.consume({ expected: correlation, receipt, run })
    ).rejects.toMatchObject({
      code: "invalid_or_consumed_receipt",
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["generationRunId", { generationRunId: "generation_run_other" }],
    ["stage", { stage: "another_stage" }],
    ["attemptNumber", { attemptNumber: 3 }],
    ["artifactIds", { artifactIds: ["contract_1", "source_other"] }],
    ["capabilityVersion", { capabilityVersion: "mechanic_capability/v2" }],
    ["cancellationEpoch", { cancellationEpoch: 5 }],
    ["signal", { signal: new AbortController().signal }],
  ] satisfies readonly [
    string,
    Partial<BrowserGenerationContinuationCorrelation>,
  ][])(
    "rejects an exact-correlation mismatch in %s and burns that receipt",
    async (_field, mismatch) => {
      const authority = createBrowserGenerationContinuationAuthority();
      const issuedCorrelation = createCorrelation();
      const receipt = authority.issue(issuedCorrelation);
      const run = vi.fn().mockResolvedValue("must not run");

      await expect(
        authority.consume({
          expected: { ...issuedCorrelation, ...mismatch },
          receipt,
          run,
        })
      ).rejects.toMatchObject({
        code: "correlation_mismatch",
      });
      await expect(
        authority.consume({
          expected: issuedCorrelation,
          receipt,
          run,
        })
      ).rejects.toMatchObject({
        code: "invalid_or_consumed_receipt",
      });
      expect(run).not.toHaveBeenCalled();
    }
  );

  it("rejects an already-aborted continuation before invoking its runner", async () => {
    const authority = createBrowserGenerationContinuationAuthority();
    const controller = new AbortController();
    const correlation = createCorrelation({ signal: controller.signal });
    const receipt = authority.issue(correlation);
    const run = vi.fn().mockResolvedValue("must not run");
    controller.abort("creator request cancelled");

    await expect(
      authority.consume({ expected: correlation, receipt, run })
    ).rejects.toEqual(
      expect.objectContaining<Partial<BrowserGenerationContinuationError>>({
        code: "continuation_aborted",
        name: "BrowserGenerationContinuationError",
      })
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects on abort during the runner and ignores its late result", async () => {
    const authority = createBrowserGenerationContinuationAuthority();
    const controller = new AbortController();
    const correlation = createCorrelation({ signal: controller.signal });
    const receipt = authority.issue(correlation);
    const pending = deferred<{ browserChecksPassed: true }>();
    const run = vi.fn(() => pending.promise);

    const consumption = authority.consume({
      expected: correlation,
      receipt,
      run,
    });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    controller.abort("superseded generation operation");

    await expect(consumption).rejects.toMatchObject({
      code: "continuation_aborted",
    });
    const lateResult = { browserChecksPassed: true } as const;
    pending.resolve(lateResult);
    await Promise.resolve();
    await Promise.resolve();
    expect(authority.isAuthenticCompletion(lateResult)).toBe(false);
  });

  it("waits for and authenticates a committed result when abort arrives during its runner", async () => {
    const authority = createBrowserGenerationContinuationAuthority();
    const controller = new AbortController();
    const correlation = createCorrelation({ signal: controller.signal });
    const receipt = authority.issue(correlation);
    const pending = deferred<{ outcome: "accepted"; gamePackId: string }>();
    const run = vi.fn(() => pending.promise);

    const consumption = authority.consume({
      acceptResultAfterAbort: (result) => result.outcome === "accepted",
      expected: correlation,
      receipt,
      run,
    });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    controller.abort("acceptance committed while the timeout fired");

    const accepted = {
      outcome: "accepted" as const,
      gamePackId: "game_pack_committed_after_abort",
    };
    pending.resolve(accepted);
    const completion = await consumption;
    expect(completion.result).toEqual(accepted);
    expect(authority.isAuthenticCompletion(completion)).toBe(true);
  });

  it("handles a runner rejection after cancellation without an unhandled late completion", async () => {
    const authority = createBrowserGenerationContinuationAuthority();
    const controller = new AbortController();
    const correlation = createCorrelation({ signal: controller.signal });
    const receipt = authority.issue(correlation);
    const pending = deferred<never>();
    const run = vi.fn(() => pending.promise);

    const consumption = authority.consume({
      expected: correlation,
      receipt,
      run,
    });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(consumption).rejects.toMatchObject({
      code: "continuation_aborted",
    });

    pending.reject(new Error("late browser failure"));
    await Promise.resolve();
    await Promise.resolve();
  });
});
