import { z } from "zod";

export const OPENAI_PROVIDER_USAGE_RECEIPT_VERSION =
  "openai_provider_usage_receipt/v1" as const;
export const OPENAI_PROVIDER_USAGE_ESTIMATE_VERSION =
  "openai_provider_usage_estimate/v1" as const;

const tokenCountSchema = z.number().int().nonnegative();

const providerUsageSchema = z
  .object({
    inputTokens: tokenCountSchema,
    cachedInputTokens: tokenCountSchema,
    cacheWriteInputTokens: tokenCountSchema,
    outputTokens: tokenCountSchema,
    totalTokens: tokenCountSchema,
  })
  .strict();

const exactOpenAiProviderUsageReceiptSchema = z
  .object({
    schemaVersion: z.literal(OPENAI_PROVIDER_USAGE_RECEIPT_VERSION),
    responseId: z.string().min(1).max(240),
    model: z.string().min(1).max(160),
    serviceTier: z.string().min(1).max(80),
    createdAt: z.string().datetime().optional(),
    completedAt: z.string().datetime(),
    usage: providerUsageSchema,
  })
  .strict();

const estimatedOpenAiProviderUsageReceiptSchema = z
  .object({
    schemaVersion: z.literal(OPENAI_PROVIDER_USAGE_ESTIMATE_VERSION),
    responseId: z.string().min(1).max(240).optional(),
    model: z.string().min(1).max(160),
    serviceTier: z.string().min(1).max(80),
    completedAt: z.string().datetime(),
    usage: providerUsageSchema,
    estimation: z
      .object({
        method: z.literal("utf8_bytes_divided_by_4"),
        source: z.literal("actual_api_request_and_response"),
        inputUtf8Bytes: tokenCountSchema,
        outputUtf8Bytes: tokenCountSchema,
      })
      .strict(),
  })
  .strict();

export const openAiProviderUsageReceiptSchema = z.discriminatedUnion(
  "schemaVersion",
  [
    exactOpenAiProviderUsageReceiptSchema,
    estimatedOpenAiProviderUsageReceiptSchema,
  ]
);

export type OpenAiProviderUsageReceipt = z.infer<
  typeof openAiProviderUsageReceiptSchema
>;

export type OpenAiProviderUsageReporter = (
  receipt: OpenAiProviderUsageReceipt
) => void;

export function parseOpenAiProviderUsageReceipt(
  payload: unknown,
  completedAt = new Date()
): OpenAiProviderUsageReceipt | undefined {
  if (!isRecord(payload) || !isRecord(payload.usage)) {
    return undefined;
  }

  const inputDetails = isRecord(payload.usage.input_tokens_details)
    ? payload.usage.input_tokens_details
    : {};
  const candidate = {
    schemaVersion: OPENAI_PROVIDER_USAGE_RECEIPT_VERSION,
    responseId: payload.id,
    model: payload.model,
    serviceTier: payload.service_tier,
    ...(toIsoTimestamp(payload.created_at)
      ? { createdAt: toIsoTimestamp(payload.created_at) }
      : {}),
    completedAt: completedAt.toISOString(),
    usage: {
      inputTokens: payload.usage.input_tokens,
      cachedInputTokens: inputDetails.cached_tokens ?? 0,
      cacheWriteInputTokens: inputDetails.cache_write_tokens ?? 0,
      outputTokens: payload.usage.output_tokens,
      totalTokens: payload.usage.total_tokens,
    },
  };
  const result = exactOpenAiProviderUsageReceiptSchema.safeParse(candidate);
  return result.success ? result.data : undefined;
}

export function reportOpenAiProviderUsage(
  reporter: OpenAiProviderUsageReporter | undefined,
  payload: unknown,
  requestPayload?: unknown
) {
  if (!reporter) {
    return;
  }

  const receipt =
    parseOpenAiProviderUsageReceipt(payload) ??
    estimateOpenAiProviderUsage(payload, requestPayload);
  if (!receipt) return;

  reporter(receipt);
}

function estimateOpenAiProviderUsage(
  payload: unknown,
  requestPayload: unknown,
  completedAt = new Date()
): OpenAiProviderUsageReceipt | undefined {
  if (!isRecord(payload) || !isRecord(requestPayload)) return undefined;
  const model = stringValue(payload.model) ?? stringValue(requestPayload.model);
  const serviceTier =
    stringValue(payload.service_tier) ??
    stringValue(requestPayload.service_tier);
  if (!model || !serviceTier) return undefined;

  const inputJson = safeJson(requestPayload);
  const outputJson = safeJson(payload.output ?? payload.error ?? payload);
  if (inputJson === undefined || outputJson === undefined) return undefined;
  const inputUtf8Bytes = new TextEncoder().encode(inputJson).byteLength;
  const outputUtf8Bytes = new TextEncoder().encode(outputJson).byteLength;
  const inputTokens = Math.ceil(inputUtf8Bytes / 4);
  const outputTokens = Math.ceil(outputUtf8Bytes / 4);
  const candidate = {
    schemaVersion: OPENAI_PROVIDER_USAGE_ESTIMATE_VERSION,
    ...(stringValue(payload.id) ? { responseId: stringValue(payload.id) } : {}),
    model,
    serviceTier,
    completedAt: completedAt.toISOString(),
    usage: {
      inputTokens,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
    estimation: {
      method: "utf8_bytes_divided_by_4",
      source: "actual_api_request_and_response",
      inputUtf8Bytes,
      outputUtf8Bytes,
    },
  };
  const result = estimatedOpenAiProviderUsageReceiptSchema.safeParse(candidate);
  return result.success ? result.data : undefined;
}

function toIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return new Date(value * 1_000).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
