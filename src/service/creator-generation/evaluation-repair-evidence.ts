const ARTIFACT_SCOPED_REPAIR_MESSAGE_MAXIMUM = 500;
const EVALUATION_VALUE_MAXIMUM = 180;

export function boundEvaluationRepairIssueMessage(message: string): string {
  const nonemptyMessage =
    message.trim().length > 0
      ? message
      : "Evaluation failure did not include a message.";
  return truncate(nonemptyMessage, ARTIFACT_SCOPED_REPAIR_MESSAGE_MAXIMUM);
}

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
    input.kind.startsWith("owned_object_") &&
    (input.kind.endsWith("_after_action") ||
      input.kind.endsWith("_after_install"))
      ? summarizeOwnedObjectLifecycleActual(input.actual) ?? input.actual
      : input.actual;
  const message = `${input.label} ${input.index} "${input.kind}" failed. Assertion: ${boundedJson(input.assertion)}. Actual: ${boundedJson(actual)}.`;
  return boundEvaluationRepairIssueMessage(message);
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
