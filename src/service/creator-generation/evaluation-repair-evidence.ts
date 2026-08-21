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
  const message = `${input.label} ${input.index} "${input.kind}" failed. Assertion: ${boundedJson(input.assertion)}. Actual: ${boundedJson(input.actual)}.`;
  return truncate(message, ARTIFACT_SCOPED_REPAIR_MESSAGE_MAXIMUM);
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
