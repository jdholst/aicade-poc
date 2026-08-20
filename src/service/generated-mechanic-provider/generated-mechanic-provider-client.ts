import { z } from "zod";

import {
  createMechanicContractProviderError,
  type MechanicContractGenerationProvider,
} from "@/service/mechanic-contract-generation/mechanic-contract-generation-service";
import {
  createMechanicSourceProviderError,
  type MechanicSourceGenerationProvider,
} from "@/service/mechanic-source-generation/mechanic-source-generation-provider";
import type { StarterProjectRequest } from "@/service/starter-project/starter-project-client";

import {
  GENERATED_MECHANIC_PROVIDER_REQUEST_VERSION,
  generatedMechanicProviderGenerationRunIdSchema,
  generatedMechanicProviderRequestSchema,
  generatedMechanicProviderResponseSchema,
  serializeMechanicIntentForProviderTransport,
  type GeneratedMechanicProviderConfig,
  type GeneratedMechanicProviderAttemptKind,
  type GeneratedMechanicProviderRepair,
  type GeneratedMechanicProviderStage,
} from "./generated-mechanic-provider-schema";

const positiveIntegerSchema = z.number().int().positive();

export type GeneratedMechanicProviderUserConfig = Pick<
  StarterProjectRequest,
  "openAiApiKey" | "openAiKeyword" | "openAiModel"
>;

export type CreateGeneratedMechanicHttpProviderInput = Readonly<{
  attempt: number;
  fetchImpl?: typeof fetch;
  generationRunId: string;
  kind: GeneratedMechanicProviderAttemptKind;
  providerRequest: GeneratedMechanicProviderUserConfig;
  repair?: GeneratedMechanicProviderRepair;
}>;

/**
 * Creates a browser-side contract provider for the existing contract service.
 * Its returned JSON is candidate data only; it is not authenticated admission,
 * grant, execution-realm, or continuation evidence.
 */
export function createGeneratedMechanicContractHttpProvider(
  options: CreateGeneratedMechanicHttpProviderInput
): MechanicContractGenerationProvider {
  const client = createStageClient("contract", options);

  return async (input) =>
    client(
      {
        intent: serializeMechanicIntentForProviderTransport(input.intent),
        resolution: input.resolution,
        constraintSet: input.constraintSet,
        referenceCatalog: input.referenceCatalog,
        resourceBudget: input.resourceBudget,
      },
      input.signal,
      createMechanicContractProviderError
    );
}

/**
 * Creates a browser-side source provider for the existing source orchestrator.
 * Its returned JSON is candidate data only; all foundation, build, SES, and
 * evaluation evidence must still be produced by their live browser owners.
 */
export function createGeneratedMechanicSourceHttpProvider(
  options: CreateGeneratedMechanicHttpProviderInput
): MechanicSourceGenerationProvider {
  const client = createStageClient("source", options);

  return async (input) =>
    client(
      {
        intent: serializeMechanicIntentForProviderTransport(input.intent),
        resolution: input.resolution,
        constraintSet: input.constraintSet,
        contract: input.contract,
        grant: input.grant,
        referenceCatalog: input.referenceCatalog,
        resourceBudget: input.resourceBudget,
      },
      input.signal,
      createMechanicSourceProviderError
    );
}

type ProviderFailureCode =
  | "invalid_provider_output"
  | "provider_cancelled"
  | "provider_failure"
  | "provider_timeout";

type CreateProviderError = (
  code: ProviderFailureCode,
  message: string
) => Error;

function createStageClient(
  stage: GeneratedMechanicProviderStage,
  {
    attempt: attemptInput,
    fetchImpl = fetch,
    generationRunId: generationRunIdInput,
    kind,
    providerRequest,
    repair,
  }: CreateGeneratedMechanicHttpProviderInput
) {
  const generationRunId = generatedMechanicProviderGenerationRunIdSchema.parse(
    generationRunIdInput
  );
  const attempt = positiveIntegerSchema.parse(attemptInput);
  const providerConfig: GeneratedMechanicProviderConfig = {
    openAiApiKey: providerRequest.openAiApiKey,
    openAiKeyword: providerRequest.openAiKeyword,
    openAiModel: providerRequest.openAiModel,
  };

  return async function requestStageCandidate(
    stageInput: unknown,
    signal: AbortSignal | undefined,
    createProviderError: CreateProviderError
  ): Promise<unknown> {
    throwProviderCancellationIfAborted(signal, stage, createProviderError);

    const bodyResult = generatedMechanicProviderRequestSchema.safeParse({
      schemaVersion: GENERATED_MECHANIC_PROVIDER_REQUEST_VERSION,
      generationRunId,
      stage,
      attempt,
      attemptKind: kind,
      ...(repair ? { repair } : {}),
      providerConfig,
      stageInput,
    });
    if (!bodyResult.success) {
      throw createProviderError(
        "provider_failure",
        "Generated mechanic stage input did not match the HTTP transport schema."
      );
    }

    let response: Response;
    try {
      response = await fetchImpl("/api/generated-mechanic-provider", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal,
        body: JSON.stringify(bodyResult.data),
      });
    } catch (error) {
      throw createProviderError(
        signal?.aborted ? "provider_cancelled" : "provider_failure",
        signal?.aborted
          ? `Generated mechanic ${stage} provider request was cancelled.`
          : error instanceof Error
            ? error.message
            : `Generated mechanic ${stage} provider request failed.`
      );
    }
    throwProviderCancellationIfAborted(signal, stage, createProviderError);

    let payloadInput: unknown;
    try {
      payloadInput = await response.json();
    } catch {
      throwProviderCancellationIfAborted(signal, stage, createProviderError);
      throw createProviderError(
        "invalid_provider_output",
        `Generated mechanic ${stage} provider returned invalid JSON.`
      );
    }
    throwProviderCancellationIfAborted(signal, stage, createProviderError);

    const payloadResult =
      generatedMechanicProviderResponseSchema.safeParse(payloadInput);
    if (!payloadResult.success) {
      throw createProviderError(
        "invalid_provider_output",
        `Generated mechanic ${stage} provider returned an invalid response.`
      );
    }

    const payload = payloadResult.data;
    if (
      payload.generationRunId !== generationRunId ||
      payload.stage !== stage ||
      payload.attempt !== attempt ||
      payload.attemptKind !== kind
    ) {
      throw createProviderError(
        "invalid_provider_output",
        `Generated mechanic ${stage} provider returned mismatched request correlation.`
      );
    }

    if (!response.ok || !payload.ok) {
      if (payload.ok) {
        throw createProviderError(
          "invalid_provider_output",
          `Generated mechanic ${stage} provider returned inconsistent HTTP status.`
        );
      }

      throw createProviderError(
        normalizeProviderFailureCode(payload.error.code),
        payload.error.message
      );
    }

    return payload.candidate;
  };
}

function throwProviderCancellationIfAborted(
  signal: AbortSignal | undefined,
  stage: GeneratedMechanicProviderStage,
  createProviderError: CreateProviderError
): void {
  if (signal?.aborted) {
    throw createProviderError(
      "provider_cancelled",
      `Generated mechanic ${stage} provider request was cancelled.`
    );
  }
}

function normalizeProviderFailureCode(
  code:
    | ProviderFailureCode
    | "configuration"
    | "invalid_request"
): ProviderFailureCode {
  return code === "configuration" || code === "invalid_request"
    ? "provider_failure"
    : code;
}
