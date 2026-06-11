import { DEFAULT_SPEC_GENERATION_PROMPT } from "./spec-generation-guide";
import { STABLE_ID_PATTERN } from "@/game-spec";
import { resolveDebugSpecGenerationAdapter } from "./debug-generation-provider";
import {
  createSpecGenerationPreflightFailure,
  getSpecGenerationResultStatus,
  type SpecGenerationResult,
} from "./spec-generation-outcome";
import {
  generateTopDownGameSpec,
  type SpecGenerationProvider,
} from "./spec-generation-service";
import { resolveOpenAiGenerationConfig } from "@/service/starter-project/openai-generation-config";

type SpecGenerationEnvironment = Record<string, string | undefined>;

type SpecGenerationRequestBody = {
  enteredPrompt?: unknown;
  prompt?: unknown;
  openAiApiKey?: unknown;
  openAiKeyword?: unknown;
  openAiModel?: unknown;
  generationRunId?: unknown;
};

export type CreateSpecGenerationPostHandlerInput = {
  env: SpecGenerationEnvironment;
  provider: SpecGenerationProvider;
  includeDebugCandidate?: boolean;
};

export function createSpecGenerationPostHandler({
  env,
  provider,
  includeDebugCandidate = process.env.NODE_ENV !== "production",
}: CreateSpecGenerationPostHandlerInput) {
  return async function POST(request: Request) {
    const requestBody = await parseRequestBody(request);

    if (!requestBody.ok) {
      return jsonNoStore(
        createSpecGenerationPreflightFailure({
          userMessage:
            "I couldn't read that generation request. Please try again.",
          stage: "bad_request",
        }),
        400
      );
    }

    const prompt = normalizeUserPrompt(
      requestBody.body.enteredPrompt ?? requestBody.body.prompt
    );
    const generationRunId = normalizeGenerationRunId(
      requestBody.body.generationRunId
    );
    const debugAdapter = resolveDebugSpecGenerationAdapter(env);

    if (debugAdapter.type === "blocked") {
      return jsonNoStore(
        createSpecGenerationPreflightFailure({
          userMessage: debugAdapter.userMessage,
          stage: "configuration",
        }),
        400
      );
    }

    if (debugAdapter.type === "active") {
      const result = withGenerationRunCorrelation(
        await generateTopDownGameSpec({
          prompt,
          model: debugAdapter.model,
          providerCredential: debugAdapter.providerCredential,
          provider: debugAdapter.provider,
          includeDebugCandidate,
        }),
        generationRunId
      );

      return jsonNoStore(result, getSpecGenerationResultStatus(result));
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

    const result = withGenerationRunCorrelation(
      await generateTopDownGameSpec({
        prompt,
        model: openAiConfigResult.config.model,
        providerCredential: openAiConfigResult.config.apiKey,
        provider,
        includeDebugCandidate,
      }),
      generationRunId
    );

    return jsonNoStore(result, getSpecGenerationResultStatus(result));
  };
}

async function parseRequestBody(
  request: Request
): Promise<
  | { ok: true; body: SpecGenerationRequestBody }
  | { ok: false; body: undefined }
> {
  try {
    const body = (await request.json()) as SpecGenerationRequestBody;

    return {
      ok: true,
      body: body && typeof body === "object" ? body : {},
    };
  } catch {
    return {
      ok: false,
      body: undefined,
    };
  }
}

function normalizeUserPrompt(prompt: unknown) {
  if (typeof prompt !== "string") {
    return DEFAULT_SPEC_GENERATION_PROMPT;
  }

  const normalized = prompt.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return DEFAULT_SPEC_GENERATION_PROMPT;
  }

  return normalized.slice(0, 320);
}

function normalizeGenerationRunId(value: unknown) {
  return typeof value === "string" && STABLE_ID_PATTERN.test(value)
    ? value
    : undefined;
}

function withGenerationRunCorrelation(
  result: SpecGenerationResult,
  generationRunId: string | undefined
): SpecGenerationResult {
  if (!generationRunId) {
    return result;
  }

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
