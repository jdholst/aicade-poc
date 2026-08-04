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
  MechanicContractGenerationProviderError,
  type MechanicContractGenerationProvider,
  type MechanicContractGenerationProviderFailureCode,
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
      throw createProviderError(
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
    } catch (error) {
      if (cancelled) {
        throw createProviderError(
          "provider_cancelled",
          "Generated Mechanic Contract creation was cancelled."
        );
      }

      if (timedOut) {
        throw createProviderError(
          "provider_timeout",
          "OpenAI generation timed out while creating the Generated Mechanic Contract."
        );
      }

      throw createProviderError(
        "provider_failure",
        error instanceof Error
          ? error.message
          : "OpenAI request failed while creating the Generated Mechanic Contract."
      );
    } finally {
      clearTimeout(timeoutId);
      input.signal?.removeEventListener("abort", cancelFromCaller);
    }

    const payload = await readOpenAIResponsePayload(response);

    if (!response.ok) {
      throw createProviderError(
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
      throw createProviderError(
        "invalid_provider_output",
        "OpenAI did not return a Generated Mechanic Contract."
      );
    }

    try {
      return JSON.parse(functionCall.arguments) as unknown;
    } catch {
      throw createProviderError(
        "invalid_provider_output",
        "OpenAI returned invalid JSON for the Generated Mechanic Contract."
      );
    }
  };
}

export const requestGeneratedMechanicContractFromProvider =
  createOpenAiMechanicContractProvider();

async function readOpenAIResponsePayload(response: Response) {
  try {
    return (await response.json()) as OpenAIResponsePayload;
  } catch {
    return {} satisfies OpenAIResponsePayload;
  }
}

function createProviderError(
  code: MechanicContractGenerationProviderFailureCode,
  message: string
) {
  return new MechanicContractGenerationProviderError({
    stage: "contract_generation",
    code,
    issues: [
      {
        path: "provider",
        code,
        message,
      },
    ],
  });
}
