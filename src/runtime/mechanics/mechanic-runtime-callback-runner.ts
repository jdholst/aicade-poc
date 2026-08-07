export type MechanicRuntimeCallbackRunnerMode = "conformance" | "runtime";

export type RunMechanicRuntimeCallbacksInput = {
  mode: MechanicRuntimeCallbackRunnerMode;
  callbacks: ReadonlyMap<string, string>;
  invocations: ReadonlyArray<{ callbackId: string; count: number }>;
  evaluate(source: string): Promise<void>;
  onCallbackCompleted(): void;
  onCallbackFailed(error: unknown): void;
  afterCallback?(): void;
};

export async function runMechanicRuntimeCallbacks({
  mode,
  callbacks,
  invocations,
  evaluate,
  onCallbackCompleted,
  onCallbackFailed,
  afterCallback,
}: RunMechanicRuntimeCallbacksInput): Promise<void> {
  let firstConformanceCallbackFailure: unknown;
  let conformanceCallbackFailed = false;
  for (const invocation of invocations) {
    const callbackSource = callbacks.get(invocation.callbackId);
    if (typeof callbackSource !== "string") {
      throw new Error("Missing callback source.");
    }
    for (let count = 0; count < invocation.count; count += 1) {
      try {
        await evaluate(callbackSource);
        onCallbackCompleted();
      } catch (error) {
        onCallbackFailed(error);
        if (mode === "runtime") {
          throw error;
        }
        if (!conformanceCallbackFailed) {
          conformanceCallbackFailed = true;
          firstConformanceCallbackFailure = error;
        }
      }
      afterCallback?.();
    }
  }
  if (conformanceCallbackFailed) {
    throw firstConformanceCallbackFailure;
  }
}
