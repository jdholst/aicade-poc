const ARTIFACT_SCOPED_REPAIR_MESSAGE_MAXIMUM = 500;
const EVALUATION_VALUE_MAXIMUM = 180;

export function createEvaluationObservationFailureMessage(input: {
  label:
    | "Scenario setup"
    | "Model-declared observation"
    | "Evaluator-authored observation";
  index: number;
  kind: string;
  assertion: unknown;
  actual: unknown;
}): string {
  const actual =
    input.kind === "owned_object_lifecycle_after_action" ||
    input.kind === "owned_object_creation_after_action" ||
    input.kind === "owned_object_lifecycle_progress_after_action" ||
    input.kind === "owned_object_lifecycle_unchanged_after_action"
      ? summarizeOwnedObjectLifecycleActual(input.actual) ?? input.actual
      : input.actual;
  const message = `${input.label} ${input.index} "${input.kind}" failed. Assertion: ${boundedJson(input.assertion)}. Actual: ${boundedJson(actual)}.`;
  return truncate(message, ARTIFACT_SCOPED_REPAIR_MESSAGE_MAXIMUM);
}

function summarizeOwnedObjectLifecycleActual(
  value: unknown
): Readonly<{ deltas: readonly Record<string, unknown>[] }> | undefined {
  const actual = record(value);
  if (!actual || !Array.isArray(actual.before) || !Array.isArray(actual.after)) {
    return undefined;
  }
  const beforeEntries = actual.before;
  const afterEntries = actual.after;
  const beforeByArchetype = new Map(
    beforeEntries.flatMap((entry) => {
      const candidate = record(entry);
      return candidate && typeof candidate.archetypeId === "string"
        ? [[candidate.archetypeId, candidate] as const]
        : [];
    })
  );
  const deltas = afterEntries.flatMap((entry) => {
    const after = record(entry);
    if (!after || typeof after.archetypeId !== "string") {
      return [];
    }
    const before = beforeByArchetype.get(after.archetypeId);
    if (!before) {
      return [];
    }
    return [
      {
        ...(afterEntries.length > 1 ? { archetypeId: after.archetypeId } : {}),
        activeDelta: metric(after.active) - metric(before.active),
        actorOriginCreationsDelta:
          metric(after.actorOriginCreations) -
          metric(before.actorOriginCreations),
        createdDelta: metric(after.created) - metric(before.created),
        destroyedDelta: metric(after.destroyed) - metric(before.destroyed),
        simulatedDistanceTraveledDelta:
          metric(after.simulatedDistanceTraveled) -
          metric(before.simulatedDistanceTraveled),
        targetInteractionsDelta:
          metric(after.targetInteractions) - metric(before.targetInteractions),
      },
    ];
  });
  return deltas.length > 0 ? { deltas } : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function metric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function boundedJson(value: unknown): string {
  try {
    return truncate(
      JSON.stringify(value) ?? "undefined",
      EVALUATION_VALUE_MAXIMUM
    );
  } catch {
    return "unserializable";
  }
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum
    ? value
    : `${value.slice(0, maximum - 3)}...`;
}
