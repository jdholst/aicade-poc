const SENSITIVE_KEYS = new Set([
  "openAiApiKey",
  "openAiKeyword",
  "apiKey",
  "authorization",
]);

export function redactSensitive(value) {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SENSITIVE_KEYS.has(key) ? "[REDACTED]" : redactSensitive(child),
      ])
    );
  }

  if (typeof value === "string") {
    return redactUrl(value);
  }

  return value;
}

function redactUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return value;
  }

  for (const key of ["openAiApiKey", "openAiKeyword"]) {
    if (url.searchParams.has(key)) {
      url.searchParams.set(key, "[REDACTED]");
    }
  }
  return url.toString();
}

