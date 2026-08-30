import { jsonValueSchema } from "@/game-spec/game-spec-schema";
import {
  MechanicContractGenerationProviderError,
  MECHANIC_CONTRACT_GENERATION_TASK_ROUTE,
  type MechanicContractGenerationProvider,
} from "@/service/mechanic-contract-generation/mechanic-contract-generation-service";
import {
  MechanicSourceGenerationProviderError,
  type MechanicSourceGenerationProvider,
} from "@/service/mechanic-source-generation/mechanic-source-generation-provider";
import { resolveOpenAiGenerationConfig } from "@/service/starter-project/openai-generation-config";
import type { OpenAiProviderUsageReceipt } from "@/service/openai-provider-usage-receipt";

import {
  GENERATED_MECHANIC_PROVIDER_RESPONSE_VERSION,
  createGeneratedMechanicProviderCandidateArtifactId,
  generatedMechanicProviderRequestSchema,
  generatedMechanicProviderResponseSchema,
  parseMechanicIntentFromProviderTransport,
  type GeneratedMechanicProviderResponse,
} from "./generated-mechanic-provider-schema";

const MECHANIC_SOURCE_PROVIDER_TASK_ROUTE =
  "mechanic_source_generation.primary" as const;

type GeneratedMechanicProviderEnvironment = Record<
  string,
  string | undefined
>;

export type CreateGeneratedMechanicProviderPostHandlerInput = Readonly<{
  contractProvider: MechanicContractGenerationProvider;
  env: GeneratedMechanicProviderEnvironment;
  sourceProvider: MechanicSourceGenerationProvider;
}>;

/**
 * Resolves server-side provider configuration and performs exactly one raw
 * provider call. Contract admission and source build/execution remain browser
 * service responsibilities.
 */
export function createGeneratedMechanicProviderPostHandler({
  contractProvider,
  env,
  sourceProvider,
}: CreateGeneratedMechanicProviderPostHandlerInput) {
  return async function POST(request: Request): Promise<Response> {
    const admissionFailure = getRequestAdmissionFailure(request);
    if (admissionFailure) {
      return failureResponse(
        {
          code: "invalid_request",
          message: admissionFailure.message,
        },
        admissionFailure.status
      );
    }

    let requestInput: unknown;
    try {
      requestInput = await request.json();
    } catch {
      return failureResponse({
        code: "invalid_request",
        message: "Generated mechanic provider request body must be valid JSON.",
      });
    }

    const requestResult = generatedMechanicProviderRequestSchema.safeParse(
      requestInput
    );
    if (!requestResult.success) {
      return failureResponse({
        code: "invalid_request",
        message:
          "Generated mechanic provider request did not match the strict transport schema.",
      });
    }

    const providerRequest = requestResult.data;
    const providerConfigResult = resolveOpenAiGenerationConfig(
      providerRequest.providerConfig,
      env
    );
    if (!providerConfigResult.ok) {
      return failureResponse(
        {
          code: "configuration",
          message: providerConfigResult.error,
        },
        providerConfigResult.status,
        providerRequest
      );
    }

    const intent = parseMechanicIntentFromProviderTransport(
      providerRequest.stageInput.intent
    );
    const candidateArtifactId =
      createGeneratedMechanicProviderCandidateArtifactId({
        generationRunId: providerRequest.generationRunId,
        stage: providerRequest.stage,
        attempt: providerRequest.attempt,
        attemptKind: providerRequest.attemptKind,
      });
    let candidate: unknown;
    let providerUsage: OpenAiProviderUsageReceipt | undefined;
    const onProviderUsage = (receipt: OpenAiProviderUsageReceipt) => {
      providerUsage = receipt;
    };
    try {
      if (providerRequest.stage === "contract") {
        candidate = await contractProvider({
          intent,
          resolution: providerRequest.stageInput.resolution,
          constraintSet: providerRequest.stageInput.constraintSet,
          referenceCatalog: providerRequest.stageInput.referenceCatalog,
          resourceBudget: providerRequest.stageInput.resourceBudget,
          model: providerConfigResult.config.model,
          providerCredential: providerConfigResult.config.apiKey,
          taskRoute: MECHANIC_CONTRACT_GENERATION_TASK_ROUTE,
          generationAttempt: {
            generationRunId: providerRequest.generationRunId,
            stage: "contract",
            attemptNumber: providerRequest.attempt,
            kind: providerRequest.attemptKind,
            candidateArtifactId,
            ...(providerRequest.repair
              ? { repair: providerRequest.repair }
              : {}),
          },
          signal: request.signal,
          onProviderUsage,
        });
      } else {
        candidate = await sourceProvider({
          intent,
          resolution: providerRequest.stageInput.resolution,
          constraintSet: providerRequest.stageInput.constraintSet,
          contract: providerRequest.stageInput.contract,
          grant: providerRequest.stageInput.grant,
          referenceCatalog: providerRequest.stageInput.referenceCatalog,
          resourceBudget: providerRequest.stageInput.resourceBudget,
          model: providerConfigResult.config.model,
          providerCredential: providerConfigResult.config.apiKey,
          taskRoute: MECHANIC_SOURCE_PROVIDER_TASK_ROUTE,
          generationAttempt: {
            generationRunId: providerRequest.generationRunId,
            stage: "source",
            attemptNumber: providerRequest.attempt,
            kind: providerRequest.attemptKind,
            candidateArtifactId,
            ...(providerRequest.repair
              ? { repair: providerRequest.repair }
              : {}),
          },
          signal: request.signal,
          onProviderUsage,
        });
      }
    } catch (error) {
      if (
        error instanceof MechanicContractGenerationProviderError ||
        error instanceof MechanicSourceGenerationProviderError
      ) {
        return failureResponse(
          {
            code: error.evidence.code,
            message: error.message,
          },
          providerFailureStatus(error.evidence.code),
          providerRequest,
          providerUsage
        );
      }

      return failureResponse(
        {
          code: "provider_failure",
          message:
            error instanceof Error
              ? error.message
              : "Generated mechanic provider request failed.",
        },
        502,
        providerRequest,
        providerUsage
      );
    }

    if (request.signal.aborted) {
      return failureResponse(
        {
          code: "provider_cancelled",
          message: `Generated mechanic ${providerRequest.stage} provider request was cancelled.`,
        },
        499,
        providerRequest,
        providerUsage
      );
    }

    const candidateResult = jsonValueSchema.safeParse(candidate);
    if (!candidateResult.success) {
      return failureResponse(
        {
          code: "invalid_provider_output",
          message:
            "Generated mechanic provider returned a non-JSON candidate.",
        },
        502,
        providerRequest,
        providerUsage
      );
    }

    return jsonNoStore(
      generatedMechanicProviderResponseSchema.parse({
        schemaVersion: GENERATED_MECHANIC_PROVIDER_RESPONSE_VERSION,
        ok: true,
        generationRunId: providerRequest.generationRunId,
        stage: providerRequest.stage,
        attempt: providerRequest.attempt,
        attemptKind: providerRequest.attemptKind,
        candidate: candidateResult.data,
        ...(providerUsage ? { providerUsage } : {}),
      }),
      200
    );
  };
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
      message: "Generated mechanic provider requests require application/json.",
      status: 415,
    };
  }

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite !== null && fetchSite !== "same-origin") {
    return {
      message:
        "Generated mechanic provider requests must come from the same origin.",
      status: 403,
    };
  }

  if (origin !== null) {
    try {
      if (new URL(origin).origin !== requestOrigin) {
        return {
          message:
            "Generated mechanic provider requests must come from the same origin.",
          status: 403,
        };
      }
    } catch {
      return {
        message:
          "Generated mechanic provider requests must come from the same origin.",
        status: 403,
      };
    }
  }

  if (origin === null && fetchSite !== "same-origin") {
    return {
      message:
        "Generated mechanic provider requests require same-origin metadata.",
      status: 403,
    };
  }
}

function failureResponse(
  error: Extract<GeneratedMechanicProviderResponse, { ok: false }>["error"],
  status = 400,
  correlation?: Readonly<{
    generationRunId: string;
    stage: "contract" | "source";
    attempt: number;
    attemptKind: "initial" | "repair";
  }>,
  providerUsage?: OpenAiProviderUsageReceipt
) {
  return jsonNoStore(
    generatedMechanicProviderResponseSchema.parse({
      schemaVersion: GENERATED_MECHANIC_PROVIDER_RESPONSE_VERSION,
      ok: false,
      generationRunId: correlation?.generationRunId ?? null,
      stage: correlation?.stage ?? null,
      attempt: correlation?.attempt ?? null,
      attemptKind: correlation?.attemptKind ?? null,
      error,
      ...(providerUsage ? { providerUsage } : {}),
    }),
    status
  );
}

function providerFailureStatus(
  code:
    | "invalid_provider_output"
    | "provider_cancelled"
    | "provider_failure"
    | "provider_timeout"
) {
  switch (code) {
    case "provider_cancelled":
      return 499;
    case "provider_timeout":
      return 504;
    case "invalid_provider_output":
    case "provider_failure":
      return 502;
  }
}

function jsonNoStore(payload: GeneratedMechanicProviderResponse, status: number) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
