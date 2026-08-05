import {
  OPENAI_REQUEST_TIMEOUT_MS,
  OPENAI_RESPONSES_URL,
} from "@/constants";

import { createMechanicContractGenerationSystemPrompt } from "./mechanic-contract-generation-prompt";
import {
  GENERATED_MECHANIC_CONTRACT_TOOL,
  generatedMechanicContractJsonSchema,
} from "./mechanic-contract-generation-schema";
import {
  createMechanicContractProviderError,
  type MechanicContractGenerationProvider,
} from "./mechanic-contract-generation-service";

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
  error?: {
    code?: string;
    message?: string;
    param?: string;
    type?: string;
  };
  output?: ResponseOutputItem[];
};

export type CreateOpenAiMechanicContractProviderInput = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function createOpenAiMechanicContractProvider({
  fetchImpl = fetch,
  timeoutMs = OPENAI_REQUEST_TIMEOUT_MS,
}: CreateOpenAiMechanicContractProviderInput = {}): MechanicContractGenerationProvider {
  return async (input) => {
    if (input.signal?.aborted) {
      throw createMechanicContractProviderError(
        "provider_cancelled",
        "Generated Mechanic Contract creation was cancelled."
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

    try {
      response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.providerCredential}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: input.model,
          reasoning: {
            effort: "medium",
          },
          parallel_tool_calls: false,
          tool_choice: {
            type: "function",
            name: GENERATED_MECHANIC_CONTRACT_TOOL,
          },
          tools: [
            {
              type: "function",
              name: GENERATED_MECHANIC_CONTRACT_TOOL,
              description:
                "Return one validated pre-implementation Generated Mechanic Contract. Do not return implementation code or a game specification.",
              parameters: generatedMechanicContractJsonSchema,
              strict: true,
            },
          ],
          instructions: createMechanicContractGenerationSystemPrompt(input),
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "Generate the admitted mechanic's contract.",
                },
              ],
            },
          ],
        }),
        cache: "no-store",
      });
      payload = await readOpenAIResponsePayload(response, controller.signal);
    } catch (error) {
      if (cancelled) {
        throw createMechanicContractProviderError(
          "provider_cancelled",
          "Generated Mechanic Contract creation was cancelled."
        );
      }

      if (timedOut) {
        throw createMechanicContractProviderError(
          "provider_timeout",
          "OpenAI generation timed out while creating the Generated Mechanic Contract."
        );
      }

      throw createMechanicContractProviderError(
        "provider_failure",
        error instanceof Error
          ? error.message
          : "OpenAI request failed while creating the Generated Mechanic Contract."
      );
    } finally {
      clearTimeout(timeoutId);
      input.signal?.removeEventListener("abort", cancelFromCaller);
    }

    if (!response.ok) {
      throw createMechanicContractProviderError(
        "provider_failure",
        payload.error?.message ??
          `OpenAI request failed with status ${response.status}.`
      );
    }

    const functionCall = payload.output?.find(
      (item): item is ResponsesFunctionCall =>
        item.type === "function_call" &&
        item.name === GENERATED_MECHANIC_CONTRACT_TOOL &&
        typeof item.arguments === "string"
    );

    if (!functionCall) {
      throw createMechanicContractProviderError(
        "invalid_provider_output",
        "OpenAI did not return a Generated Mechanic Contract."
      );
    }

    try {
      return JSON.parse(functionCall.arguments) as unknown;
    } catch {
      throw createMechanicContractProviderError(
        "invalid_provider_output",
        "OpenAI returned invalid JSON for the Generated Mechanic Contract."
      );
    }
  };
}

export const requestGeneratedMechanicContractFromProvider =
  createOpenAiMechanicContractProvider();

async function readOpenAIResponsePayload(
  response: Response,
  signal: AbortSignal
) {
  try {
    return (await response.json()) as OpenAIResponsePayload;
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    return {} satisfies OpenAIResponsePayload;
  }
}
