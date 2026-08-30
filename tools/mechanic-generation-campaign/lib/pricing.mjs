import { z } from "zod";

export const OPENAI_PRICING_SNAPSHOT_SCHEMA_VERSION =
  "openai-pricing-snapshot/v1";

const nonnegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
const multiplierSchema = z
  .object({ numerator: positiveInteger, denominator: positiveInteger })
  .strict();
const ratesSchema = z
  .object({
    inputNanoUsdPerMillionTokens: nonnegativeInteger,
    cachedInputNanoUsdPerMillionTokens: nonnegativeInteger,
    cacheWriteInputNanoUsdPerMillionTokens: nonnegativeInteger,
    outputNanoUsdPerMillionTokens: nonnegativeInteger,
  })
  .strict();

export const openAiPricingSnapshotSchema = z
  .object({
    schemaVersion: z.literal(OPENAI_PRICING_SNAPSHOT_SCHEMA_VERSION),
    id: z.string().regex(/^openai-[0-9]{4}-[0-9]{2}-[0-9]{2}(?:-[a-z0-9-]+)?$/),
    effectiveAt: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
    retrievedAt: z.string().datetime(),
    sources: z
      .array(
        z
          .object({
            url: z.string().url().startsWith("https://developers.openai.com/"),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict()
      )
      .min(1),
    models: z
      .array(
        z
          .object({
            id: z.string().min(1),
            aliases: z.array(z.string().min(1)),
            contextWindowTokens: positiveInteger,
            maxOutputTokens: positiveInteger,
            serviceTiers: z.record(z.string().min(1), ratesSchema),
            longContext: z
              .object({
                thresholdInputTokens: positiveInteger,
                inputMultiplier: multiplierSchema,
                outputMultiplier: multiplierSchema,
              })
              .strict()
              .optional(),
          })
          .strict()
      )
      .min(1),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const identities = new Map();
    for (const [index, model] of snapshot.models.entries()) {
      for (const identity of [model.id, ...model.aliases]) {
        if (identities.has(identity)) {
          context.addIssue({
            code: "custom",
            path: ["models", index, "aliases"],
            message: `Pricing model identity ${identity} is ambiguous.`,
          });
        }
        identities.set(identity, model.id);
      }
    }
  });

export function parseOpenAiPricingSnapshot(input) {
  return openAiPricingSnapshotSchema.parse(input);
}

export function calculateProviderCallCost({ receipt, snapshot: snapshotInput }) {
  const snapshot = parseOpenAiPricingSnapshot(snapshotInput);
  const model = resolvePricingModel(snapshot, receipt.model);
  const rates = model.serviceTiers[receipt.serviceTier];
  if (!rates) {
    throw new Error(
      `Pricing snapshot ${snapshot.id} does not define service tier ${receipt.serviceTier} for ${model.id}.`
    );
  }
  const usage = validateUsage(receipt.usage);
  const uncachedInputTokens =
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteInputTokens;
  if (uncachedInputTokens < 0) {
    throw new Error("Provider usage cache token counts exceed total input tokens.");
  }
  const longContextApplied = Boolean(
    model.longContext && usage.inputTokens > model.longContext.thresholdInputTokens
  );
  const inputMultiplier = longContextApplied
    ? model.longContext.inputMultiplier
    : { numerator: 1, denominator: 1 };
  const outputMultiplier = longContextApplied
    ? model.longContext.outputMultiplier
    : { numerator: 1, denominator: 1 };
  const components = {
    uncachedInputNanoUsd: tokenCost(
      uncachedInputTokens,
      rates.inputNanoUsdPerMillionTokens,
      inputMultiplier
    ),
    cachedInputNanoUsd: tokenCost(
      usage.cachedInputTokens,
      rates.cachedInputNanoUsdPerMillionTokens,
      inputMultiplier
    ),
    cacheWriteInputNanoUsd: tokenCost(
      usage.cacheWriteInputTokens,
      rates.cacheWriteInputNanoUsdPerMillionTokens,
      inputMultiplier
    ),
    outputNanoUsd: tokenCost(
      usage.outputTokens,
      rates.outputNanoUsdPerMillionTokens,
      outputMultiplier
    ),
  };
  return {
    quality: "exact",
    totalNanoUsd: Object.values(components).reduce((sum, value) => sum + value, 0),
    components,
    modelId: model.id,
    resolvedModel: receipt.model,
    serviceTier: receipt.serviceTier,
    snapshotId: snapshot.id,
    longContextApplied,
  };
}

export function calculateConservativeReservation({
  model: modelIdentity,
  serviceTier,
  snapshot: snapshotInput,
}) {
  const snapshot = parseOpenAiPricingSnapshot(snapshotInput);
  const model = resolvePricingModel(snapshot, modelIdentity);
  const rates = model.serviceTiers[serviceTier];
  if (!rates) {
    throw new Error(
      `Pricing snapshot ${snapshot.id} does not define service tier ${serviceTier} for ${model.id}.`
    );
  }
  const inputMultiplier = model.longContext?.inputMultiplier ?? {
    numerator: 1,
    denominator: 1,
  };
  const outputMultiplier = model.longContext?.outputMultiplier ?? {
    numerator: 1,
    denominator: 1,
  };
  const inputRate = Math.max(
    rates.inputNanoUsdPerMillionTokens,
    rates.cachedInputNanoUsdPerMillionTokens,
    rates.cacheWriteInputNanoUsdPerMillionTokens
  );
  const totalNanoUsd =
    tokenCost(model.contextWindowTokens, inputRate, inputMultiplier) +
    tokenCost(
      model.maxOutputTokens,
      rates.outputNanoUsdPerMillionTokens,
      outputMultiplier
    );
  return {
    quality: "conservative_estimate",
    totalNanoUsd,
    modelId: model.id,
    serviceTier,
    snapshotId: snapshot.id,
    assumptions: ["maximum_context_and_output", "highest_input_rate"],
  };
}

export function aggregateProviderCallCosts(calls) {
  return calls.reduce(
    (aggregate, call) => {
      if (call.cost?.quality === "exact") {
        aggregate.exactNanoUsd += call.cost.totalNanoUsd;
        aggregate.totalNanoUsd += call.cost.totalNanoUsd;
        aggregate.pricedCalls += 1;
      } else if (call.cost?.quality === "conservative_estimate") {
        aggregate.estimatedNanoUsd += call.cost.totalNanoUsd;
        aggregate.totalNanoUsd += call.cost.totalNanoUsd;
        aggregate.pricedCalls += 1;
      } else {
        aggregate.unknownCalls += 1;
      }
      return aggregate;
    },
    {
      exactNanoUsd: 0,
      estimatedNanoUsd: 0,
      totalNanoUsd: 0,
      pricedCalls: 0,
      unknownCalls: 0,
    }
  );
}

export function createProviderCallReceipts({
  networkCaptures,
  snapshot,
  requestedModel,
  serviceTier = "default",
}) {
  return networkCaptures
    .filter((capture) => capture.source === "actual")
    .map((capture, index) => {
      const receipt = capture.response?.providerUsage;
      let cost = { quality: "unknown" };
      if (snapshot) {
        if (receipt) {
          try {
            cost = calculateProviderCallCost({ receipt, snapshot });
          } catch {
            cost = calculateConservativeReservation({
              model: requestedModel,
              serviceTier,
              snapshot,
            });
          }
        } else {
          cost = calculateConservativeReservation({
            model: requestedModel,
            serviceTier,
            snapshot,
          });
        }
      }
      return {
        schemaVersion: "campaign-provider-call-receipt/v1",
        callId:
          capture.callId ??
          `legacy-capture:${capture.stage ?? "unknown"}:${index + 1}`,
        stage: capture.stage,
        source: "actual",
        requestedAt: capture.requestedAt,
        completedAt:
          receipt?.completedAt ?? capture.completedAt ?? capture.requestedAt,
        responseStatus: capture.responseStatus,
        ...(receipt ? { receipt } : {}),
        cost,
      };
    });
}

export function resolvePricingModel(snapshotInput, identity) {
  const snapshot = parseOpenAiPricingSnapshot(snapshotInput);
  const model = snapshot.models.find(
    (candidate) => candidate.id === identity || candidate.aliases.includes(identity)
  );
  if (!model) {
    throw new Error(
      `Pricing snapshot ${snapshot.id} does not define model ${identity}.`
    );
  }
  return model;
}

function validateUsage(usage) {
  const parsed = z
    .object({
      inputTokens: nonnegativeInteger,
      cachedInputTokens: nonnegativeInteger,
      cacheWriteInputTokens: nonnegativeInteger,
      outputTokens: nonnegativeInteger,
      totalTokens: nonnegativeInteger,
    })
    .strict()
    .parse(usage);
  if (parsed.totalTokens < parsed.inputTokens + parsed.outputTokens) {
    throw new Error("Provider total token count is below input plus output tokens.");
  }
  return parsed;
}

function tokenCost(tokens, nanoUsdPerMillionTokens, multiplier) {
  const numerator =
    BigInt(tokens) *
    BigInt(nanoUsdPerMillionTokens) *
    BigInt(multiplier.numerator);
  const denominator = 1_000_000n * BigInt(multiplier.denominator);
  const roundedUp = (numerator + denominator - 1n) / denominator;
  const value = Number(roundedUp);
  if (!Number.isSafeInteger(value)) {
    throw new Error("Calculated provider cost exceeds safe integer precision.");
  }
  return value;
}
