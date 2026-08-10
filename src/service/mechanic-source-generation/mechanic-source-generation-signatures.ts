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

function asAsyncSignature(signature: string): string {
  const markerIndex = signature.lastIndexOf("=>");
  if (markerIndex < 0) {
    return signature;
  }
  const parameters = signature.slice(0, markerIndex).trim();
  const result = signature.slice(markerIndex + 2).trim();
  return `${parameters} => Promise<${result}>`;
}
