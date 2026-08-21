import {
  getTopDownMechanicDefinition,
  validateTopDownGameSpec,
  type StableId,
  type TopDownGameSpec,
} from "@/game-spec";

import type {
  CreatorGenerationRouting,
  CreatorGenerationRoutingIssue,
} from "./creator-generation-routing";

export const DEGRADED_CREATOR_GENERATION_SCHEMA_VERSION =
  "degraded_creator_generation/v1";
export const DEGRADED_GENERATION_FALLBACK_POLICY = Object.freeze({
  enabled: true,
  eligibleRouteKinds: Object.freeze([
    "intent_validation_failure",
    "capability_gap",
  ] as const),
});

export type GeneratedMechanicWorkState =
  | "not_started"
  | "started"
  | "persisted"
  | "ambiguous";

export type CreatorGenerationRoutingFailure = Extract<
  CreatorGenerationRouting,
  {
    kind:
      | "intent_validation_failure"
      | "clarification_failure"
      | "capability_gap"
      | "constraint_conflict";
  }
>;

export type OmittedMechanicWarning = Readonly<{
  schemaVersion: typeof DEGRADED_CREATOR_GENERATION_SCHEMA_VERSION;
  stage: "mechanic_validation";
  code: "generated_mechanic_omitted";
  intentId?: StableId;
  summary: "Game generated with limited functionality.";
  omittedBehavior: string;
  issues: readonly CreatorGenerationRoutingIssue[];
  retryable: true;
  generatedWorkState: "not_started";
  routingFailure: Readonly<{
    kind: CreatorGenerationRoutingFailure["kind"];
    evidence: CreatorGenerationRoutingFailure["evidence"];
  }>;
  policyDecision: Readonly<{
    status: "eligible";
    code: "trusted_base_game_independent";
  }>;
  fallbackValidation: Readonly<{
    status: "passed";
    gameSpecId: StableId;
    mechanicTypes: readonly StableId[];
    primaryObjectiveId: StableId;
  }>;
}>;

export type DegradedGenerationFallbackIssue = Readonly<{
  path: string;
  code: StableId;
  message: string;
}>;

export type DegradedGenerationFallbackEligibility =
  | Readonly<{
      kind: "eligible";
      baseGameSpec: TopDownGameSpec;
      warning: OmittedMechanicWarning;
    }>
  | Readonly<{
      kind: "fatal";
      issues: readonly DegradedGenerationFallbackIssue[];
    }>;

export type EvaluateDegradedGenerationFallbackInput = Readonly<{
  baseGameSpec: TopDownGameSpec;
  generatedWorkState: GeneratedMechanicWorkState;
  routingFailure: CreatorGenerationRoutingFailure;
}>;

/**
 * Temporary pre-compiler policy. It is deliberately conservative: the first
 * admitted class is a pre-generation capability gap, and the exact base game
 * must remain a trusted built-in collection game with no extension lineage.
 */
export function evaluateDegradedGenerationFallback({
  baseGameSpec,
  generatedWorkState,
  routingFailure,
}: EvaluateDegradedGenerationFallbackInput): DegradedGenerationFallbackEligibility {
  if (generatedWorkState !== "not_started") {
    return fatal(
      "generatedWorkState",
      "generated_work_already_started",
      "Degraded fallback is available only before generated-mechanic work starts."
    );
  }

  if (
    routingFailure.kind !== "capability_gap" &&
    routingFailure.kind !== "intent_validation_failure"
  ) {
    return fatal(
      "routingFailure.kind",
      "routing_failure_not_eligible",
      `Routing failure "${routingFailure.kind}" is not eligible for the current degraded-generation policy.`
    );
  }

  let validatedSpec: TopDownGameSpec;
  try {
    validatedSpec = validateTopDownGameSpec(baseGameSpec);
  } catch {
    return fatal(
      "baseGameSpec",
      "base_game_spec_invalid",
      "The base Game Spec did not pass independent trusted validation."
    );
  }

  if (
    hasValues(validatedSpec.extensions) ||
    hasValues(validatedSpec.template.config.extensions)
  ) {
    return fatal(
      "baseGameSpec.extensions",
      "generated_extension_dependency_present",
      "The base Game Spec retains extension data and cannot be treated as an independent fallback artifact."
    );
  }

  const mechanicDefinitions = validatedSpec.mechanics.map((mechanic) => ({
    mechanic,
    definition: getTopDownMechanicDefinition(mechanic.type),
  }));
  if (mechanicDefinitions.some(({ definition }) => !definition)) {
    return fatal(
      "baseGameSpec.mechanics",
      "untrusted_mechanic_dependency_present",
      "The base Game Spec contains a mechanic outside the trusted built-in registry."
    );
  }

  const primaryObjective = validatedSpec.objectives.find(
    (objective) => objective.primary
  );
  if (!primaryObjective) {
    return fatal(
      "baseGameSpec.objectives",
      "missing_primary_objective",
      "The base Game Spec does not retain a primary objective."
    );
  }

  const hasPlayerMovement = mechanicDefinitions.some(
    ({ mechanic }) => mechanic.type === "player_movement"
  );
  const hasTrustedObjectiveProgress = mechanicDefinitions.some(
    ({ mechanic }) =>
      mechanic.type === "pickup_collection" &&
      mechanic.objectiveIds?.includes(primaryObjective.id)
  );
  if (!hasPlayerMovement || !hasTrustedObjectiveProgress) {
    return fatal(
      "baseGameSpec.mechanics",
      "independent_playability_not_proven",
      "The current fallback policy requires trusted player movement and collection-driven primary-objective progress."
    );
  }

  return Object.freeze({
    kind: "eligible" as const,
    baseGameSpec: withoutMechanicConnections(validatedSpec),
    warning: Object.freeze({
      schemaVersion: DEGRADED_CREATOR_GENERATION_SCHEMA_VERSION,
      stage: "mechanic_validation" as const,
      code: "generated_mechanic_omitted" as const,
      ...(routingFailure.kind === "intent_validation_failure"
        ? {}
        : { intentId: routingFailure.intentId }),
      summary: "Game generated with limited functionality." as const,
      omittedBehavior:
        routingFailure.intentSummary
          ? `The requested behavior “${routingFailure.intentSummary}” could not be safely added. The playable base game was generated without it.`
          : "The requested mechanic could not be safely added. The playable base game was generated without it.",
      issues: routingFailure.evidence.issues,
      retryable: true as const,
      generatedWorkState: "not_started" as const,
      routingFailure: Object.freeze({
        kind: routingFailure.kind,
        evidence: routingFailure.evidence,
      }),
      policyDecision: Object.freeze({
        status: "eligible" as const,
        code: "trusted_base_game_independent" as const,
      }),
      fallbackValidation: Object.freeze({
        status: "passed" as const,
        gameSpecId: validatedSpec.id,
        mechanicTypes: Object.freeze(
          validatedSpec.mechanics.map((mechanic) => mechanic.type)
        ),
        primaryObjectiveId: primaryObjective.id,
      }),
    }),
  });
}

function withoutMechanicConnections(
  baseGameSpec: TopDownGameSpec
): TopDownGameSpec {
  if ((baseGameSpec.mechanicConnections?.connections.length ?? 0) === 0) {
    return baseGameSpec;
  }

  return Object.freeze({
    ...baseGameSpec,
    mechanicConnections: {
      schemaVersion: baseGameSpec.mechanicConnections!.schemaVersion,
      connections: [],
    },
  });
}

function hasValues(value: Record<string, unknown> | undefined): boolean {
  return value !== undefined && Object.keys(value).length > 0;
}

function fatal(
  path: string,
  code: StableId,
  message: string
): DegradedGenerationFallbackEligibility {
  return Object.freeze({
    kind: "fatal" as const,
    issues: Object.freeze([
      Object.freeze({
        path,
        code,
        message,
      }),
    ]),
  });
}
