import { DEFAULT_OPENAI_MODEL } from "@/constants";
import { isOpenAIModelId, type OpenAIModelId } from "@/utils/openai-utils";

type OpenAiConfigEnvironment = Record<string, string | undefined>;

type OpenAiGenerationConfigRequest = {
  openAiApiKey?: unknown;
  openAiKeyword?: unknown;
  openAiModel?: unknown;
};

export type OpenAiGenerationConfig = {
  apiKey: string;
  model: OpenAIModelId;
  apiKeySource: "environment" | "client-key" | "keyword";
  modelSource: "environment" | "client" | "default";
};

type OpenAiGenerationConfigResult =
  | { ok: true; config: OpenAiGenerationConfig }
  | { ok: false; status: 400 | 500; error: string };

export function getOpenAiConfigRequirements(env: OpenAiConfigEnvironment) {
  return {
    needsOpenAiApiKey: !normalizeClientOpenAiApiKey(env.OPENAI_API_KEY),
    needsOpenAiModel: !normalizePresentString(env.OPENAI_MODEL),
  };
}

export function resolveOpenAiGenerationConfig(
  request: OpenAiGenerationConfigRequest,
  env: OpenAiConfigEnvironment
): OpenAiGenerationConfigResult {
  const envOpenAiApiKey = normalizeClientOpenAiApiKey(env.OPENAI_API_KEY);
  const envOpenAiModelValue = normalizePresentString(env.OPENAI_MODEL);
  const envOpenAiModel = normalizeOpenAiModel(env.OPENAI_MODEL);

  if (envOpenAiModelValue && !envOpenAiModel) {
    return {
      ok: false,
      status: 500,
      error: "Configured OPENAI_MODEL is not supported.",
    };
  }

  const clientOpenAiModel = normalizeOpenAiModel(request.openAiModel);
  const clientOpenAiApiKey = normalizeClientOpenAiApiKey(request.openAiApiKey);
  const clientOpenAiKeyword = normalizeClientOpenAiKeyword(
    request.openAiKeyword
  );
  const keywordOpenAiApiKey = clientOpenAiKeyword
    ? normalizeClientOpenAiApiKey(env[`KEYWORD_${clientOpenAiKeyword}`])
    : undefined;
  const apiKey = envOpenAiApiKey ?? clientOpenAiApiKey ?? keywordOpenAiApiKey;

  if (!apiKey) {
    const rawKeyword =
      typeof request.openAiKeyword === "string"
        ? request.openAiKeyword.trim()
        : "";

    return {
      ok: false,
      status: 400,
      error: clientOpenAiKeyword
        ? `No OpenAI API key is configured for keyword "${rawKeyword}".`
        : "Missing OpenAI API key. Enter a key, enter a configured keyword, or add OPENAI_API_KEY to .env.local.",
    };
  }

  if (
    !envOpenAiModel &&
    typeof request.openAiModel === "string" &&
    request.openAiModel.trim() &&
    !clientOpenAiModel
  ) {
    return {
      ok: false,
      status: 400,
      error: "Select a supported OpenAI model before building the starter game.",
    };
  }

  return {
    ok: true,
    config: {
      apiKey,
      model: envOpenAiModel ?? clientOpenAiModel ?? DEFAULT_OPENAI_MODEL,
      apiKeySource: envOpenAiApiKey
        ? "environment"
        : clientOpenAiApiKey
          ? "client-key"
          : "keyword",
      modelSource: envOpenAiModel
        ? "environment"
        : clientOpenAiModel
          ? "client"
          : "default",
    },
  };
}

function normalizePresentString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeClientOpenAiApiKey(apiKey: unknown) {
  const normalized = normalizePresentString(apiKey);

  if (!normalized || normalized.length > 300) {
    return undefined;
  }

  return normalized;
}

function normalizeClientOpenAiKeyword(keyword: unknown) {
  const normalized = normalizePresentString(keyword);

  if (!normalized) {
    return undefined;
  }

  const envKey = normalized
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase();

  if (!envKey || envKey.length > 80) {
    return undefined;
  }

  return envKey;
}

function normalizeOpenAiModel(model: unknown): OpenAIModelId | undefined {
  const normalized = normalizePresentString(model);

  if (!normalized || !isOpenAIModelId(normalized)) {
    return undefined;
  }

  return normalized;
}
