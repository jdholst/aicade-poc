import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

export function loadCampaignWorktreeEnvironment(repoRoot) {
  const previousNodeEnvironment = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const { combinedEnv } = loadEnvConfig(
      repoRoot,
      false,
      undefined,
      true
    );
    return { ...combinedEnv, NODE_ENV: "production" };
  } finally {
    if (previousNodeEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnvironment;
    }
  }
}

export function keywordCredentialEnvironmentName(keyword) {
  if (typeof keyword !== "string") return undefined;
  const normalized = keyword
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase();
  return normalized && normalized.length <= 80
    ? `KEYWORD_${normalized}`
    : undefined;
}
