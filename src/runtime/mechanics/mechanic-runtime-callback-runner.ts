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

export type CompileAndRunMechanicRuntimeCallbackInput = {
  source: string;
  lifecycleContext?: unknown;
  compile(source: string): unknown;
  onStarted(): void;
  onFinished(): void;
};

export type EvaluateMeteredMechanicRuntimeCallbackInput = {
  source: string;
  evaluate(source: string): Promise<unknown> | unknown;
  onStarted(): void;
  onFinished(): void;
};

/** Keeps generic callback parsing, compilation, and invocation inside the meter. */
export async function evaluateMeteredMechanicRuntimeCallback({
  source,
  evaluate,
  onStarted,
  onFinished,
}: EvaluateMeteredMechanicRuntimeCallbackInput): Promise<void> {
  onStarted();
  try {
    await evaluate(`(async () => { ${source}\n})()`);
  } finally {
    onFinished();
  }
}

/**
 * Compiles trusted-admitted callback source before generated-work measurement
 * begins. The caller's outer execution deadline still contains compilation;
 * only invocation of the compiled generated callback is charged to the narrow
 * callback budget.
 */
export async function compileAndRunMechanicRuntimeCallback({
  source,
  lifecycleContext,
  compile,
  onStarted,
  onFinished,
}: CompileAndRunMechanicRuntimeCallbackInput): Promise<void> {
  const compiled = compile(
    `(async (__sparklineLifecycleContext) => { ${source}\n})`
  );
  if (typeof compiled !== "function") {
    throw new TypeError(
      "Mechanic runtime callback source did not compile to a callable."
    );
  }

  onStarted();
  try {
    await Reflect.apply(compiled, undefined, [lifecycleContext]);
  } finally {
    onFinished();
  }
}

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
