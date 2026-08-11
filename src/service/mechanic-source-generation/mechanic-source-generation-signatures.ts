export type SourceFacingCapabilityReference = Readonly<{
  group: string;
  member: string;
  expression: string;
}>;

export function sourceFacingCapabilityReference(
  authoringMember: string
): SourceFacingCapabilityReference {
  const parts = authoringMember.split(".");
  const [group, member] = parts;
  if (
    parts.length !== 2 ||
    !group ||
    !member ||
    !sourceIdentifierPattern.test(group) ||
    !sourceIdentifierPattern.test(member)
  ) {
    throw new TypeError(
      `Mechanic capability authoring member "${authoringMember}" must contain exactly two source-safe identifiers.`
    );
  }
  return Object.freeze({
    group,
    member,
    expression: `capabilities.${group}.${member}`,
  });
}

export function sourceFacingCapabilitySignature(
  capabilityId: string,
  signature: string
): string {
  const callbackType =
    capabilityId === "time_schedule"
      ? "MechanicScheduledCallbackId"
      : capabilityId === "event_subscribe"
        ? "MechanicGameplayEventCallbackId"
        : undefined;
  const sourceSignature = callbackType
    ? signature.replace("MechanicCallbackId", callbackType)
    : signature;
  return asAsyncSignature(sourceSignature);
}

const sourceIdentifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function asAsyncSignature(signature: string): string {
  const markerIndex = signature.lastIndexOf("=>");
  if (markerIndex < 0) {
    return signature;
  }
  const parameters = signature.slice(0, markerIndex).trim();
  const result = signature.slice(markerIndex + 2).trim();
  return `${parameters} => Promise<${result}>`;
}
