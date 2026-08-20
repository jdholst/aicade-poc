import type { StableId } from "@/game-spec";
import type { StarterProjectRequest } from "@/service/starter-project/starter-project-client";
import type { TopDownSpecGenerationClientResult } from "@/service/spec-generation";
import {
  SpecGenerationClientError,
  type SpecGenerationValidationFailure,
} from "@/service/spec-generation";

import type { CreatorGenerationRouting } from "./creator-generation-routing";
import { createGenerationOperationContext } from "./generation-operation-context";

export type CreatorGenerationPlanClientResult =
  TopDownSpecGenerationClientResult &
    Readonly<{
      routing?: CreatorGenerationRouting;
    }>;

export type ContinueGeneratedMechanicGenerationInput = Readonly<{
  context: ReturnType<typeof createGenerationOperationContext>;
  plan: CreatorGenerationPlanClientResult &
    Readonly<{
      routing: Extract<CreatorGenerationRouting, { kind: "generated_mechanic" }>;
    }>;
  request: StarterProjectRequest;
  routing: Extract<CreatorGenerationRouting, { kind: "generated_mechanic" }>;
}>;

export type ContinueGeneratedMechanicGeneration<Result> = (
  input: ContinueGeneratedMechanicGenerationInput
) => Promise<Result>;

export type DispatchCreatorGenerationPlanInput<Result> = Readonly<{
  continueGeneratedMechanicGeneration: ContinueGeneratedMechanicGeneration<Result>;
  generationRunId?: StableId;
  plan: CreatorGenerationPlanClientResult;
  request: StarterProjectRequest;
  signal: AbortSignal;
}>;

export type CreatorGenerationDispatchResult<Result> =
  | Readonly<{
      kind: "built_in";
      result: TopDownSpecGenerationClientResult;
    }>
  | Readonly<{
      kind: "generated_mechanic";
      result: Result;
    }>
  | Readonly<{
      kind: "rejected";
      routeKind: Exclude<
        CreatorGenerationRouting["kind"],
        "built_in" | "generated_mechanic"
      >;
      evidence: Extract<
        CreatorGenerationRouting,
        {
          kind:
            | "clarification_failure"
            | "capability_gap"
            | "constraint_conflict";
        }
      >["evidence"];
    }>;

export class CreatorGenerationRoutingError extends SpecGenerationClientError {
  readonly routeKind: Exclude<
    CreatorGenerationRouting["kind"],
    "built_in" | "generated_mechanic"
  >;

  constructor(input: Readonly<{
    message: string;
    routeKind: CreatorGenerationRoutingError["routeKind"];
    validationFailure: SpecGenerationValidationFailure;
  }>) {
    super(input.message, input.validationFailure);
    this.name = "CreatorGenerationRoutingError";
    this.routeKind = input.routeKind;
  }
}

/**
 * Converts the server's data-only route into one browser-owned operation. The
 * legacy/no-routing shape remains the built-in fast path, while generated work
 * can only start from the admitted generated-mechanic variant.
 */
export async function dispatchCreatorGenerationPlan<Result>({
  continueGeneratedMechanicGeneration,
  generationRunId,
  plan,
  request,
  signal,
}: DispatchCreatorGenerationPlanInput<Result>): Promise<
  CreatorGenerationDispatchResult<Result>
> {
  const { routing } = plan;
  if (!routing || routing.kind === "built_in") {
    return Object.freeze({
      kind: "built_in" as const,
      result: withoutRouting(plan),
    });
  }

  if (!generationRunId || routing.generationRunId !== generationRunId) {
    throw new TypeError(
      "Creator generation routing must retain the exact browser GenerationRun identity."
    );
  }

  if (routing.kind !== "generated_mechanic") {
    return Object.freeze({
      kind: "rejected" as const,
      routeKind: routing.kind,
      evidence: routing.evidence,
    });
  }

  const generatedPlan = Object.freeze({
    ...plan,
    routing,
  });
  const context = createGenerationOperationContext({
    acceptedLineage: [],
    cancellationEpoch: 0,
    generationRunId,
    requestSummary: normalizeRequestSummary(request.prompt),
    routeKind: "generated_mechanic",
    runtimeKind: plan.runtimeKind,
    signal,
    trustMode: "browser_authenticated",
  });
  const result = await continueGeneratedMechanicGeneration({
    context,
    plan: generatedPlan,
    request,
    routing,
  });

  return Object.freeze({
    kind: "generated_mechanic" as const,
    result,
  });
}

function withoutRouting(
  plan: CreatorGenerationPlanClientResult
): TopDownSpecGenerationClientResult {
  if (!plan.routing) {
    return plan;
  }

  const { routing: _routing, ...legacyResult } = plan;
  void _routing;
  return legacyResult;
}

function normalizeRequestSummary(prompt: string): string {
  const summary = prompt.replace(/\s+/g, " ").trim();
  return summary ? summary.slice(0, 500) : "Generate a Phaser game.";
}
