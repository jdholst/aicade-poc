import {
  STABLE_ID_PATTERN,
  type StableId,
} from "@/game-spec/game-spec-schema";

export const BROWSER_GENERATION_CONTINUATION_PROTOCOL_VERSION =
  "browser_generation_continuation/v1" as const;

declare const browserGenerationContinuationReceiptBrand: unique symbol;

/**
 * An in-memory browser capability. Its authority is not represented by JSON or
 * by any enumerable property; only the issuing factory's WeakMap recognizes it.
 */
export type BrowserGenerationContinuationReceipt = Readonly<{
  [browserGenerationContinuationReceiptBrand]: true;
}>;

export type BrowserGenerationContinuationCorrelation = Readonly<{
  generationRunId: StableId;
  stage: StableId;
  attemptNumber: number;
  artifactIds: readonly StableId[];
  capabilityVersion: string;
  cancellationEpoch: number;
  signal: AbortSignal;
}>;

export type BrowserGenerationContinuationRunnerContext =
  BrowserGenerationContinuationCorrelation;

export type BrowserGenerationContinuationCompletion<Result> = Readonly<{
  kind: "browser_generation_continuation_completed";
  protocolVersion: typeof BROWSER_GENERATION_CONTINUATION_PROTOCOL_VERSION;
  generationRunId: StableId;
  stage: StableId;
  attemptNumber: number;
  artifactIds: readonly StableId[];
  capabilityVersion: string;
  cancellationEpoch: number;
  result: Result;
}>;

export type BrowserGenerationContinuationErrorCode =
  | "invalid_or_consumed_receipt"
  | "correlation_mismatch"
  | "continuation_aborted";

export class BrowserGenerationContinuationError extends Error {
  readonly code: BrowserGenerationContinuationErrorCode;

  constructor(code: BrowserGenerationContinuationErrorCode, message: string) {
    super(message);
    this.name = "BrowserGenerationContinuationError";
    this.code = code;
  }
}

type MaybePromise<Value> = Value | Promise<Value>;

export type ConsumeBrowserGenerationContinuationInput<Result> = Readonly<{
  receipt: BrowserGenerationContinuationReceipt;
  expected: BrowserGenerationContinuationCorrelation;
  acceptResultAfterAbort?(result: Result): boolean;
  run(
    context: BrowserGenerationContinuationRunnerContext
  ): MaybePromise<Result>;
}>;

export type BrowserGenerationContinuationAuthority = Readonly<{
  issue(
    correlation: BrowserGenerationContinuationCorrelation
  ): BrowserGenerationContinuationReceipt;
  consume<Result>(
    input: ConsumeBrowserGenerationContinuationInput<Result>
  ): Promise<BrowserGenerationContinuationCompletion<Result>>;
  isAuthenticCompletion<Result = unknown>(
    completion: unknown
  ): completion is BrowserGenerationContinuationCompletion<Result>;
}>;

type PendingContinuation = Readonly<{
  context: BrowserGenerationContinuationRunnerContext;
}>;

/**
 * Creates one browser-local authority. Receipts and completions cannot be moved
 * through JSON, reconstructed, or recognized by a different authority.
 */
export function createBrowserGenerationContinuationAuthority(): BrowserGenerationContinuationAuthority {
  const pendingContinuations = new WeakMap<object, PendingContinuation>();
  const issuedCompletions = new WeakSet<object>();

  return Object.freeze({
    issue(
      correlation: BrowserGenerationContinuationCorrelation
    ): BrowserGenerationContinuationReceipt {
      assertValidCorrelation(correlation);
      const context = snapshotCorrelation(correlation);
      const receipt = Object.freeze(
        {}
      ) as BrowserGenerationContinuationReceipt;
      pendingContinuations.set(receipt, Object.freeze({ context }));
      return receipt;
    },

    consume<Result>({
      acceptResultAfterAbort,
      expected,
      receipt,
      run,
    }: ConsumeBrowserGenerationContinuationInput<Result>): Promise<
      BrowserGenerationContinuationCompletion<Result>
    > {
      const pending = isObject(receipt)
        ? pendingContinuations.get(receipt)
        : undefined;
      if (!pending) {
        return Promise.reject(
          new BrowserGenerationContinuationError(
            "invalid_or_consumed_receipt",
            "Browser generation continuation requires a live factory-issued receipt."
          )
        );
      }

      // Spend the authority before correlation checks or user code can yield.
      pendingContinuations.delete(receipt);

      if (!correlationsMatch(pending.context, expected)) {
        return Promise.reject(
          new BrowserGenerationContinuationError(
            "correlation_mismatch",
            "Browser generation continuation did not match the expected generation operation."
          )
        );
      }
      if (pending.context.signal.aborted) {
        return Promise.reject(createContinuationAbortedError());
      }

      return runAbortableContinuation({
        acceptResultAfterAbort,
        context: pending.context,
        run,
        issueCompletion(result) {
          const completion = Object.freeze({
            kind: "browser_generation_continuation_completed" as const,
            protocolVersion:
              BROWSER_GENERATION_CONTINUATION_PROTOCOL_VERSION,
            generationRunId: pending.context.generationRunId,
            stage: pending.context.stage,
            attemptNumber: pending.context.attemptNumber,
            artifactIds: pending.context.artifactIds,
            capabilityVersion: pending.context.capabilityVersion,
            cancellationEpoch: pending.context.cancellationEpoch,
            result,
          });
          issuedCompletions.add(completion);
          return completion;
        },
      });
    },

    isAuthenticCompletion<Result = unknown>(
      completion: unknown
    ): completion is BrowserGenerationContinuationCompletion<Result> {
      return isObject(completion) && issuedCompletions.has(completion);
    },
  });
}

function runAbortableContinuation<Result>({
  acceptResultAfterAbort,
  context,
  issueCompletion,
  run,
}: Readonly<{
  acceptResultAfterAbort?(result: Result): boolean;
  context: BrowserGenerationContinuationRunnerContext;
  issueCompletion(
    result: Result
  ): BrowserGenerationContinuationCompletion<Result>;
  run(
    context: BrowserGenerationContinuationRunnerContext
  ): MaybePromise<Result>;
}>): Promise<BrowserGenerationContinuationCompletion<Result>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) {
        return;
      }
      if (acceptResultAfterAbort) {
        context.signal.removeEventListener("abort", onAbort);
        return;
      }
      settled = true;
      context.signal.removeEventListener("abort", onAbort);
      reject(createContinuationAbortedError());
    };

    context.signal.addEventListener("abort", onAbort, { once: true });
    if (context.signal.aborted) {
      onAbort();
      return;
    }

    let runnerResult: MaybePromise<Result>;
    try {
      runnerResult = run(context);
    } catch (error) {
      if (!settled) {
        settled = true;
        context.signal.removeEventListener("abort", onAbort);
        reject(error);
      }
      return;
    }

    void Promise.resolve(runnerResult).then(
      (result) => {
        if (settled) {
          return;
        }
        if (context.signal.aborted) {
          let acceptCommittedResult = false;
          try {
            acceptCommittedResult = acceptResultAfterAbort?.(result) ?? false;
          } catch (error) {
            settled = true;
            reject(error);
            return;
          }
          if (!acceptCommittedResult) {
            settled = true;
            reject(createContinuationAbortedError());
            return;
          }
        }
        settled = true;
        context.signal.removeEventListener("abort", onAbort);
        resolve(issueCompletion(result));
      },
      (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        context.signal.removeEventListener("abort", onAbort);
        reject(
          context.signal.aborted && acceptResultAfterAbort
            ? createContinuationAbortedError()
            : error
        );
      }
    );
  });
}

function snapshotCorrelation(
  correlation: BrowserGenerationContinuationCorrelation
): BrowserGenerationContinuationRunnerContext {
  return Object.freeze({
    generationRunId: correlation.generationRunId,
    stage: correlation.stage,
    attemptNumber: correlation.attemptNumber,
    artifactIds: Object.freeze([...correlation.artifactIds]),
    capabilityVersion: correlation.capabilityVersion,
    cancellationEpoch: correlation.cancellationEpoch,
    signal: correlation.signal,
  });
}

function correlationsMatch(
  issued: BrowserGenerationContinuationCorrelation,
  expected: BrowserGenerationContinuationCorrelation
): boolean {
  return (
    issued.generationRunId === expected.generationRunId &&
    issued.stage === expected.stage &&
    issued.attemptNumber === expected.attemptNumber &&
    issued.capabilityVersion === expected.capabilityVersion &&
    issued.cancellationEpoch === expected.cancellationEpoch &&
    issued.signal === expected.signal &&
    issued.artifactIds.length === expected.artifactIds.length &&
    issued.artifactIds.every(
      (artifactId, index) => artifactId === expected.artifactIds[index]
    )
  );
}

function assertValidCorrelation(
  correlation: BrowserGenerationContinuationCorrelation
): void {
  assertStableId(correlation.generationRunId, "generationRunId");
  assertStableId(correlation.stage, "stage");
  correlation.artifactIds.forEach((artifactId, index) =>
    assertStableId(artifactId, `artifactIds[${index}]`)
  );
  if (
    !Number.isInteger(correlation.attemptNumber) ||
    correlation.attemptNumber < 1
  ) {
    throw new TypeError("attemptNumber must be a positive integer.");
  }
  if (
    !Number.isInteger(correlation.cancellationEpoch) ||
    correlation.cancellationEpoch < 0
  ) {
    throw new TypeError("cancellationEpoch must be a non-negative integer.");
  }
  if (correlation.capabilityVersion.trim().length === 0) {
    throw new TypeError("capabilityVersion must be a non-empty string.");
  }
  if (!isAbortSignal(correlation.signal)) {
    throw new TypeError("signal must be an AbortSignal.");
  }
}

function assertStableId(value: StableId, field: string): void {
  if (!STABLE_ID_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a stable identifier.`);
  }
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    isObject(value) &&
    typeof Reflect.get(value, "aborted") === "boolean" &&
    typeof Reflect.get(value, "addEventListener") === "function" &&
    typeof Reflect.get(value, "removeEventListener") === "function"
  );
}

function isObject(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function createContinuationAbortedError(): BrowserGenerationContinuationError {
  return new BrowserGenerationContinuationError(
    "continuation_aborted",
    "Browser generation continuation was cancelled before it completed."
  );
}
