import {
  STABLE_ID_PATTERN,
  type StableId,
} from "@/game-spec";
import { resolveOpenAiGenerationConfig } from "@/service/starter-project/openai-generation-config";
import { DEFAULT_SPEC_GENERATION_PROMPT } from "@/service/spec-generation/spec-generation-guide";
import {
  createSpecGenerationPreflightFailure,
  getSpecGenerationResultStatus,
} from "@/service/spec-generation/spec-generation-outcome";

import type { CreatorGenerationPlanProvider } from "./creator-generation-planning-provider";
import type { OpenAiProviderUsageReceipt } from "@/service/openai-provider-usage-receipt";
import {
  generateTopDownCreatorPlan,
  type TopDownCreatorPlanResult,
} from "./creator-generation-planning-service";

type CreatorGenerationPlanningEnvironment = Record<
  string,
  string | undefined
>;

// Leaves room for the longest provider candidate suffix at MAX_SAFE_INTEGER.
const MAX_GENERATION_RUN_ID_LENGTH = 206;

type CreatorGenerationPlanningRequestBody = {
  enteredPrompt?: unknown;
  prompt?: unknown;
  generationRunId?: unknown;
  openAiApiKey?: unknown;
  openAiKeyword?: unknown;
  openAiModel?: unknown;
};

export type CreateCreatorGenerationPlanningPostHandlerInput = Readonly<{
  availableCapabilities: readonly StableId[];
  env: CreatorGenerationPlanningEnvironment;
  includeDebugCandidate?: boolean;
  provider: CreatorGenerationPlanProvider;
}>;

export function createCreatorGenerationPlanningPostHandler({
  availableCapabilities,
  env,
  includeDebugCandidate = env.NODE_ENV !== "production",
  provider,
}: CreateCreatorGenerationPlanningPostHandlerInput) {
  return async function POST(request: Request) {
    const admissionFailure = getRequestAdmissionFailure(request);
    if (admissionFailure) {
      return jsonNoStore(
        createSpecGenerationPreflightFailure({
          userMessage: admissionFailure.message,
          stage: "bad_request",
        }),
        admissionFailure.status
      );
    }

    const requestBody = await parseRequestBody(request);
    if (!requestBody.ok) {
      return jsonNoStore(
        createSpecGenerationPreflightFailure({
          userMessage:
            "I couldn't read that creator-generation request. Please try again.",
          stage: "bad_request",
        }),
        400
      );
    }

    const generationRunId = normalizeGenerationRunId(
      requestBody.body.generationRunId
    );
    if (!generationRunId) {
      return jsonNoStore(
        createSpecGenerationPreflightFailure({
          userMessage:
            "Creator Generation requires a valid GenerationRun correlation ID.",
          stage: "bad_request",
        }),
        400
      );
    }

    const openAiConfigResult = resolveOpenAiGenerationConfig(
      {
        openAiApiKey: requestBody.body.openAiApiKey,
        openAiKeyword: requestBody.body.openAiKeyword,
        openAiModel: requestBody.body.openAiModel,
      },
      env
    );
    if (!openAiConfigResult.ok) {
      return jsonNoStore(
        withGenerationRunCorrelation(
          createSpecGenerationPreflightFailure({
            userMessage: openAiConfigResult.error,
            stage: "configuration",
          }),
          generationRunId
        ),
        openAiConfigResult.status
      );
    }

    let providerUsage: OpenAiProviderUsageReceipt | undefined;
    const result = withGenerationRunCorrelation(
      await generateTopDownCreatorPlan({
        availableCapabilities,
        generationRunId,
        includeDebugCandidate,
        model: openAiConfigResult.config.model,
        prompt: normalizeUserPrompt(
          requestBody.body.enteredPrompt ?? requestBody.body.prompt
        ),
        provider,
        onProviderUsage: (receipt) => {
          providerUsage = receipt;
        },
        providerCredential: openAiConfigResult.config.apiKey,
        signal: request.signal,
      }),
      generationRunId
    );

    return jsonNoStore(
      providerUsage ? { ...result, providerUsage } : result,
      getSpecGenerationResultStatus(result)
    );
  };
}

async function parseRequestBody(
  request: Request
): Promise<
  | { ok: true; body: CreatorGenerationPlanningRequestBody }
  | { ok: false; body: undefined }
> {
  try {
    const body = (await request.json()) as unknown;
    return body !== null && typeof body === "object" && !Array.isArray(body)
      ? {
          ok: true,
          body: body as CreatorGenerationPlanningRequestBody,
        }
      : { ok: true, body: {} };
  } catch {
    return { ok: false, body: undefined };
  }
}

function normalizeUserPrompt(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_SPEC_GENERATION_PROMPT;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized
    ? normalized.slice(0, 320)
    : DEFAULT_SPEC_GENERATION_PROMPT;
}

function normalizeGenerationRunId(value: unknown): StableId | undefined {
  return typeof value === "string" &&
    value.length <= MAX_GENERATION_RUN_ID_LENGTH &&
    STABLE_ID_PATTERN.test(value)
    ? value
    : undefined;
}

function getRequestAdmissionFailure(
  request: Request
): Readonly<{ message: string; status: number }> | undefined {
  const mediaType = request.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    return {
      message: "Creator Generation requests require application/json.",
      status: 415,
    };
  }

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite !== null && fetchSite !== "same-origin") {
    return {
      message: "Creator Generation requests must come from the same origin.",
      status: 403,
    };
  }

  if (origin !== null) {
    try {
      if (new URL(origin).origin !== requestOrigin) {
        return {
          message: "Creator Generation requests must come from the same origin.",
          status: 403,
        };
      }
    } catch {
      return {
        message: "Creator Generation requests must come from the same origin.",
        status: 403,
      };
    }
  }

  if (origin === null && fetchSite !== "same-origin") {
    return {
      message: "Creator Generation requests require same-origin metadata.",
      status: 403,
    };
  }
}

function withGenerationRunCorrelation(
  result: TopDownCreatorPlanResult,
  generationRunId: StableId
): TopDownCreatorPlanResult {
  if (result.ok) {
    return {
      ...result,
      metadata: {
        ...result.metadata,
        generationRunId,
      },
    };
  }

  return {
    ...result,
    generationRunId,
  };
}

function jsonNoStore(payload: unknown, status: number) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
