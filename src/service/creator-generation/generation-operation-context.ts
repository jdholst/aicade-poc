import type { StableId } from "@/game-spec";
import type { RuntimeKind } from "@/runtime/runtime-adapter";

export type CreatorGenerationRouteKind =
  | "built_in"
  | "generated_mechanic"
  | "clarification_failure"
  | "capability_gap"
  | "constraint_conflict";

export type GenerationOperationTrustMode =
  | "trusted_builtin"
  | "browser_authenticated";

export type GenerationOperationContext = Readonly<{
  acceptedLineage: readonly StableId[];
  cancellationEpoch: number;
  generationRunId: StableId;
  requestSummary: string;
  routeKind: CreatorGenerationRouteKind;
  runtimeKind: RuntimeKind;
  signal: AbortSignal;
  trustMode: GenerationOperationTrustMode;
}>;

export type GenerationOperationServerProjection = Readonly<
  Omit<GenerationOperationContext, "acceptedLineage" | "signal">
>;

export function createGenerationOperationContext(
  input: GenerationOperationContext
): GenerationOperationContext {
  if (!Number.isSafeInteger(input.cancellationEpoch) || input.cancellationEpoch < 0) {
    throw new TypeError("Generation cancellation epoch must be a nonnegative integer.");
  }

  return Object.freeze({
    acceptedLineage: Object.freeze([...input.acceptedLineage]),
    cancellationEpoch: input.cancellationEpoch,
    generationRunId: input.generationRunId,
    requestSummary: input.requestSummary,
    routeKind: input.routeKind,
    runtimeKind: input.runtimeKind,
    signal: input.signal,
    trustMode: input.trustMode,
  });
}

export function projectGenerationOperationContextForServer(
  context: GenerationOperationContext
): GenerationOperationServerProjection {
  return Object.freeze({
    cancellationEpoch: context.cancellationEpoch,
    generationRunId: context.generationRunId,
    requestSummary: context.requestSummary,
    routeKind: context.routeKind,
    runtimeKind: context.runtimeKind,
    trustMode: context.trustMode,
  });
}
