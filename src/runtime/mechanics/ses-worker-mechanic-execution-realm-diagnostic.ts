export function containedErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  if (error === null || typeof error !== "object") {
    return fallback;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "message");
    return descriptor &&
      "value" in descriptor &&
      typeof descriptor.value === "string" &&
      descriptor.value.length > 0
      ? descriptor.value
      : fallback;
  } catch {
    return fallback;
  }
}
