import {
  coordinateMechanicGeneration,
  resolveTopDownMechanicIntent,
  type AdmittedGeneratedMechanicRequest,
  type MechanicCapabilityGapResolution,
  type MechanicClarificationFailureResolution,
  type MechanicIntent,
  type StableId,
  type TopDownGameSpec,
} from "@/game-spec";

export type CreatorGenerationRoutingIssue = Readonly<{
  path: string;
  code: StableId;
  message: string;
}>;

export type CreatorGenerationRouting =
  | Readonly<{
      kind: "built_in";
      generationRunId: StableId;
      intentId: StableId;
      resolutionKind: "built_in" | "built_in_composition";
    }>
  | Readonly<{
      kind: "generated_mechanic";
      generationRunId: StableId;
      intent: MechanicIntent;
      admittedRequest: AdmittedGeneratedMechanicRequest;
    }>
  | Readonly<{
      kind: "intent_validation_failure";
      generationRunId: StableId;
      intentSummary?: string;
      evidence: Readonly<{
        stage: "routing";
        code: "invalid_intent_transport";
        issues: readonly CreatorGenerationRoutingIssue[];
      }>;
    }>
  | Readonly<{
      kind: "clarification_failure";
      generationRunId: StableId;
      intentId: StableId;
      intentSummary?: string;
      evidence: Readonly<{
        stage: "routing";
        code: "clarification_required" | "invalid_intent_references";
        issues: readonly CreatorGenerationRoutingIssue[];
      }>;
    }>
  | Readonly<{
      kind: "capability_gap";
      generationRunId: StableId;
      intentId: StableId;
      intentSummary?: string;
      evidence: Readonly<{
        stage: "routing";
        code: "capability_gap";
        missingCapabilities: readonly StableId[];
        issues: readonly CreatorGenerationRoutingIssue[];
      }>;
    }>
  | Readonly<{
      kind: "constraint_conflict";
      generationRunId: StableId;
      intentId: StableId;
      intentSummary?: string;
      evidence: Readonly<{
        stage: "routing";
        code: "generated_mechanic_limit_exceeded";
        issues: readonly CreatorGenerationRoutingIssue[];
      }>;
    }>;

export type CreateCreatorGenerationRoutingInput = Readonly<{
  availableCapabilities: readonly StableId[];
  baseGameSpec: TopDownGameSpec;
  generationRunId: StableId;
  intent: MechanicIntent;
}>;

export function createCreatorGenerationRouting({
  availableCapabilities,
  baseGameSpec,
  generationRunId,
  intent,
}: CreateCreatorGenerationRoutingInput): CreatorGenerationRouting {
  const referenceIssues = getIntentReferenceIssues(intent, baseGameSpec);
  if (referenceIssues.length > 0) {
    return freeze({
      kind: "clarification_failure",
      generationRunId,
      intentId: intent.id,
      intentSummary: intent.summary,
      evidence: {
        stage: "routing",
        code: "invalid_intent_references",
        issues: referenceIssues,
      },
    });
  }

  const resolution = resolveTopDownMechanicIntent({
    intent,
    availableCapabilities,
  });

  if (
    resolution.kind === "built_in" ||
    resolution.kind === "built_in_composition"
  ) {
    return freeze({
      kind: "built_in",
      generationRunId,
      intentId: intent.id,
      resolutionKind: resolution.kind,
    });
  }

  if (resolution.kind === "clarification_failure") {
    return createClarificationFailure(
      generationRunId,
      intent.summary,
      resolution
    );
  }

  if (resolution.kind === "capability_gap") {
    return createCapabilityGap(generationRunId, intent.summary, resolution);
  }

  const generatedHostIntent = normalizeGeneratedHostLifecycleIntent(intent);
  const generatedHostIssues = getGeneratedHostIntentIssues(
    generatedHostIntent,
    baseGameSpec
  );
  if (generatedHostIssues.length > 0) {
    return freeze({
      kind: "capability_gap" as const,
      generationRunId,
      intentId: intent.id,
      intentSummary: intent.summary,
      evidence: {
        stage: "routing" as const,
        code: "capability_gap" as const,
        missingCapabilities: generatedHostIntent.requiredCapabilities.includes(
          "object_motion_write"
        )
          ? []
          : ["object_motion_write"],
        issues: generatedHostIssues,
      },
    });
  }

  const coordination = coordinateMechanicGeneration({
    generationRunId,
    resolutions: [resolution],
  });
  if (coordination.kind === "constraint_conflict") {
    return freeze({
      kind: "constraint_conflict",
      generationRunId,
      intentId: intent.id,
      intentSummary: intent.summary,
      evidence: {
        stage: "routing",
        code: "generated_mechanic_limit_exceeded",
        issues: [
          {
            path: "intent",
            code: coordination.evidence.code,
            message: coordination.evidence.message,
          },
        ],
      },
    });
  }
  if (coordination.kind !== "generation_admitted" || !coordination.requests[0]) {
    throw new Error("Generated mechanic routing did not retain its admitted request.");
  }

  return freeze({
    kind: "generated_mechanic",
    generationRunId,
    intent: generatedHostIntent,
    admittedRequest: coordination.requests[0],
  });
}

function normalizeGeneratedHostLifecycleIntent(
  intent: MechanicIntent
): MechanicIntent {
  const supportedMovementAliasTriggers = new Set([
    "install",
    "logical_move_action",
  ]);
  if (
    !intent.triggers.includes("logical_move_action") ||
    intent.triggers.some(
      (trigger) => !supportedMovementAliasTriggers.has(trigger)
    )
  ) {
    return intent;
  }

  return freeze({
    ...intent,
    triggers: intent.triggers.map((trigger) =>
      trigger === "logical_move_action" ? "logical_action" : trigger
    ),
  });
}

function getGeneratedHostIntentIssues(
  intent: MechanicIntent,
  baseGameSpec: TopDownGameSpec
): readonly CreatorGenerationRoutingIssue[] {
  const issues: CreatorGenerationRoutingIssue[] = [];
  if (!intent.requiredCapabilities.includes("object_motion_write")) {
    issues.push({
      path: "intent.requiredCapabilities",
      code: "independent_visible_effect_unavailable",
      message:
        "The current top-down generated-mechanic host accepts only intents whose requested behavior has an independently visible bound-entity motion effect.",
    });
  }
  if (!intent.references.some(({ kind }) => kind === "entity")) {
    issues.push({
      path: "intent.references",
      code: "observable_entity_reference_required",
      message:
        "The current top-down generated-mechanic host requires an exact routed entity reference for independent browser evidence.",
    });
  }
  const entityRolesById = new Map(
    baseGameSpec.entities.map(({ id, role }) => [id, role] as const)
  );
  const referencedEntityRoles = new Set<string>(
    intent.references.flatMap((reference) =>
      reference.kind === "entity" && entityRolesById.has(reference.id)
        ? [entityRolesById.get(reference.id)!]
        : []
    )
  );
  if (
    intent.actors.length === 0 ||
    intent.actors.some((actor) => !referencedEntityRoles.has(actor))
  ) {
    issues.push({
      path: "intent.actors",
      code: "observable_actor_reference_required",
      message:
        "The current top-down generated-mechanic host requires every requested actor role to be represented by an exact routed Game Spec entity reference.",
    });
  }
  const supportedTriggers = new Set(["install", "logical_action"]);
  if (
    !intent.triggers.includes("logical_action") ||
    intent.triggers.some((trigger) => !supportedTriggers.has(trigger))
  ) {
    issues.push({
      path: "intent.triggers",
      code: "unsupported_generated_host_trigger",
      message:
        'The current top-down generated-mechanic host requires the canonical "logical_action" trigger and supports only optional "install" alongside it.',
    });
  }
  const activeActionIds = new Set(
    baseGameSpec.controls.map(({ action }) => action)
  );
  const inputConnections = intent.connections.filter(
    ({ direction }) => direction === "input"
  );
  if (
    intent.connections.length !== 1 ||
    inputConnections.length !== 1 ||
    !activeActionIds.has(inputConnections[0]?.port ?? "")
  ) {
    issues.push({
      path: "intent.connections",
      code: "trusted_action_connection_required",
      message:
        "The current top-down generated-mechanic host requires exactly one input connection whose port is an exact active Game Spec action ID, so browser evidence can bind the requested trigger to its observable effect.",
    });
  }
  return freeze(issues);
}

function createClarificationFailure(
  generationRunId: StableId,
  intentSummary: string,
  resolution: MechanicClarificationFailureResolution
): CreatorGenerationRouting {
  return freeze({
    kind: "clarification_failure",
    generationRunId,
    intentId: resolution.intentId,
    intentSummary,
    evidence: {
      stage: "routing",
      code: "clarification_required",
      issues: resolution.unresolvedAmbiguities.map((ambiguity, index) => ({
        path: `intent.ambiguities.${index}`,
        code: "unresolved_ambiguity",
        message: ambiguity.description,
      })),
    },
  });
}

function createCapabilityGap(
  generationRunId: StableId,
  intentSummary: string,
  resolution: MechanicCapabilityGapResolution
): CreatorGenerationRouting {
  return freeze({
    kind: "capability_gap",
    generationRunId,
    intentId: resolution.intentId,
    intentSummary,
    evidence: {
      stage: "routing",
      code: "capability_gap",
      missingCapabilities: resolution.missingCapabilities,
      issues: resolution.missingCapabilities.map((capabilityId, index) => ({
        path: `intent.requiredCapabilities.${index}`,
        code: "missing_capability",
        message: `The selected generated-mechanic host does not provide capability "${capabilityId}".`,
      })),
    },
  });
}

function getIntentReferenceIssues(
  intent: MechanicIntent,
  baseGameSpec: TopDownGameSpec
): CreatorGenerationRoutingIssue[] {
  const catalogs: Record<MechanicIntent["references"][number]["kind"], Set<string>> = {
    asset: new Set(baseGameSpec.assets.map(({ id }) => id)),
    entity: new Set(baseGameSpec.entities.map(({ id }) => id)),
    objective: new Set(baseGameSpec.objectives.map(({ id }) => id)),
    region: new Set(
      baseGameSpec.template.config.scenes.flatMap(({ layout }) =>
        layout.regions.map(({ id }) => id)
      )
    ),
    scene: new Set(baseGameSpec.template.config.scenes.map(({ id }) => id)),
  };

  const seenReferences = new Set<string>();
  const issues: CreatorGenerationRoutingIssue[] = [];
  intent.references.forEach((reference, index) => {
    const identity = `${reference.kind}:${reference.id}`;
    if (seenReferences.has(identity)) {
      issues.push({
        path: `intent.references.${index}`,
        code: "duplicate_reference",
        message: `Mechanic Intent reference "${identity}" is duplicated.`,
      });
      return;
    }
    seenReferences.add(identity);
    if (!catalogs[reference.kind].has(reference.id)) {
      issues.push({
        path: `intent.references.${index}.id`,
        code: "unknown_reference",
        message: `Mechanic Intent reference "${reference.id}" is not present in the exact base Game Spec ${reference.kind} catalog.`,
      });
    }
  });
  return issues;
}

function freeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
