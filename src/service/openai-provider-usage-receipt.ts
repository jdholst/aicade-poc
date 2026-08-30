import { z } from "zod";

export const OPENAI_PROVIDER_USAGE_RECEIPT_VERSION =
  "openai_provider_usage_receipt/v1" as const;

const tokenCountSchema = z.number().int().nonnegative();

export const openAiProviderUsageReceiptSchema = z
  .object({
    schemaVersion: z.literal(OPENAI_PROVIDER_USAGE_RECEIPT_VERSION),
    responseId: z.string().min(1).max(240),
    model: z.string().min(1).max(160),
    serviceTier: z.string().min(1).max(80),
    createdAt: z.string().datetime().optional(),
    completedAt: z.string().datetime(),
    usage: z
      .object({
        inputTokens: tokenCountSchema,
        cachedInputTokens: tokenCountSchema,
        cacheWriteInputTokens: tokenCountSchema,
        outputTokens: tokenCountSchema,
        totalTokens: tokenCountSchema,
      })
      .strict(),
  })
  .strict();

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
  const result = openAiProviderUsageReceiptSchema.safeParse(candidate);
  return result.success ? result.data : undefined;
}

export function reportOpenAiProviderUsage(
  reporter: OpenAiProviderUsageReporter | undefined,
  payload: unknown
) {
  const receipt = parseOpenAiProviderUsageReceipt(payload);
  if (!reporter || !receipt) {
    return;
  }

  reporter(receipt);
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
