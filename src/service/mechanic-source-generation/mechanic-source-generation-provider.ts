import {
  OPENAI_REQUEST_TIMEOUT_MS,
  OPENAI_RESPONSES_URL,
} from "@/constants";
import type { OpenAIModelId } from "@/utils/openai-utils";
import {
  reportOpenAiProviderUsage,
  type OpenAiProviderUsageReporter,
} from "@/service/openai-provider-usage-receipt";

import { createMechanicSourceGenerationSystemPrompt } from "./mechanic-source-generation-prompt";
import type { MechanicSourceGenerationGuidanceInput } from "./mechanic-source-generation-prompt";
import {
  GENERATED_MECHANIC_SOURCE_TOOL,
  generatedMechanicSourceJsonSchema,
} from "./mechanic-source-generation-schema";

type ResponsesFunctionCall = {
  type: "function_call";
  name: string;
  arguments: string;
};

type ResponseOutputItem = {
  type: string;
  name?: string;
  arguments?: string;
};

type OpenAIResponsePayload = {
  id?: string;
  model?: string;
  service_tier?: string;
  created_at?: number;
  usage?: unknown;
  error?: {
    message?: string;
  };
  output?: ResponseOutputItem[];
};

export type MechanicSourceGenerationProviderInput =
  MechanicSourceGenerationGuidanceInput & {
    model: OpenAIModelId;
    providerCredential: string;
    onProviderUsage?: OpenAiProviderUsageReporter;
    signal?: AbortSignal;
  };

export type MechanicSourceGenerationProvider = (
  input: MechanicSourceGenerationProviderInput
) => Promise<unknown>;

export type MechanicSourceGenerationProviderFailureCode =
  | "invalid_provider_output"
  | "provider_cancelled"
  | "provider_failure"
  | "provider_timeout";

export type MechanicSourceGenerationProviderEvidence = Readonly<{
  stage: "source_generation";
  code: MechanicSourceGenerationProviderFailureCode;
  issues: readonly Readonly<{
    path: "provider";
    code: MechanicSourceGenerationProviderFailureCode;
    message: string;
  }>[];
}>;

export class MechanicSourceGenerationProviderError extends Error {
  readonly evidence: MechanicSourceGenerationProviderEvidence;

  constructor(evidence: MechanicSourceGenerationProviderEvidence) {
    super(evidence.issues[0]?.message ?? "Mechanic source generation failed.");
    this.name = "MechanicSourceGenerationProviderError";
    this.evidence = evidence;
  }
}

export function createMechanicSourceProviderError(
  code: MechanicSourceGenerationProviderFailureCode,
  message: string
): MechanicSourceGenerationProviderError {
  return new MechanicSourceGenerationProviderError({
    stage: "source_generation",
    code,
    issues: Object.freeze([
      Object.freeze({ path: "provider", code, message }),
    ]),
  });
}

export type CreateOpenAiMechanicSourceProviderInput = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function createOpenAiMechanicSourceProvider({
  fetchImpl = fetch,
  timeoutMs = OPENAI_REQUEST_TIMEOUT_MS,
}: CreateOpenAiMechanicSourceProviderInput = {}): MechanicSourceGenerationProvider {
  return async (input) => {
    if (input.signal?.aborted) {
      throw createMechanicSourceProviderError(
        "provider_cancelled",
        "Generated Mechanic Source creation was cancelled."
      );
    }

    const controller = new AbortController();
    let timedOut = false;
    let cancelled = false;
    const cancelFromCaller = () => {
      cancelled = true;
      controller.abort();
    };
    input.signal?.addEventListener("abort", cancelFromCaller, { once: true });
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    let response: Response;
    let payload: OpenAIResponsePayload;
    const requestPayload = {
      model: input.model,
      service_tier: "default",
      reasoning: { effort: "medium" },
      parallel_tool_calls: false,
      tool_choice: {
        type: "function",
        name: GENERATED_MECHANIC_SOURCE_TOOL,
      },
      tools: [
        {
          type: "function",
          name: GENERATED_MECHANIC_SOURCE_TOOL,
          description:
            "Return one generic Generated Mechanic Source candidate containing TypeScript lifecycle callback bodies only.",
          parameters: generatedMechanicSourceJsonSchema,
          strict: true,
        },
      ],
      instructions: createMechanicSourceGenerationSystemPrompt(input),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Generate the accepted mechanic source candidate.",
            },
          ],
        },
      ],
    };

    try {
      response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.providerCredential}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify(requestPayload),
        cache: "no-store",
      });
      payload = await readOpenAIResponsePayload(response, controller.signal);
      reportOpenAiProviderUsage(input.onProviderUsage, payload, requestPayload);
    } catch (error) {
      if (cancelled) {
        throw createMechanicSourceProviderError(
          "provider_cancelled",
          "Generated Mechanic Source creation was cancelled."
        );
      }
      if (timedOut) {
        throw createMechanicSourceProviderError(
          "provider_timeout",
          "OpenAI generation timed out while creating Generated Mechanic Source."
        );
      }
      throw createMechanicSourceProviderError(
        "provider_failure",
        error instanceof Error
          ? error.message
          : "OpenAI request failed while creating Generated Mechanic Source."
      );
    } finally {
      clearTimeout(timeoutId);
      input.signal?.removeEventListener("abort", cancelFromCaller);
    }

    if (!response.ok) {
      throw createMechanicSourceProviderError(
        "provider_failure",
        payload.error?.message ??
          `OpenAI request failed with status ${response.status}.`
      );
    }

    const functionCall = payload.output?.find(
      (item): item is ResponsesFunctionCall =>
        item.type === "function_call" &&
        item.name === GENERATED_MECHANIC_SOURCE_TOOL &&
        typeof item.arguments === "string"
    );
    if (!functionCall) {
      throw createMechanicSourceProviderError(
        "invalid_provider_output",
        "OpenAI did not return a Generated Mechanic Source candidate."
      );
    }

    let candidate: unknown;
    try {
      candidate = JSON.parse(functionCall.arguments) as unknown;
    } catch {
      throw createMechanicSourceProviderError(
        "invalid_provider_output",
        "OpenAI returned invalid JSON for Generated Mechanic Source."
      );
    }

    if (
      input.generationAttempt &&
      (!isRecord(candidate) ||
        candidate.id !== input.generationAttempt.candidateArtifactId)
    ) {
      throw createMechanicSourceProviderError(
        "invalid_provider_output",
        `OpenAI Generated Mechanic Source did not use the required attempt candidate ID "${input.generationAttempt.candidateArtifactId}".`
      );
    }

    return candidate;
  };
}

export const requestGeneratedMechanicSourceFromProvider =
  createOpenAiMechanicSourceProvider();

async function readOpenAIResponsePayload(
  response: Response,
  signal: AbortSignal
): Promise<OpenAIResponsePayload> {
  try {
    return (await response.json()) as OpenAIResponsePayload;
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
