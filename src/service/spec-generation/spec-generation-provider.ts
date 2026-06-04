import {
  OPENAI_REQUEST_TIMEOUT_MS,
  OPENAI_RESPONSES_URL,
} from "@/constants";

import {
  TOP_DOWN_GAME_SPEC_TOOL,
  topDownGameSpecJsonSchema,
} from "./spec-generation-schema";
import { createTopDownSpecGenerationSystemPrompt } from "./spec-generation-guide";
import {
  type SpecGenerationProvider,
} from "./spec-generation-service";
import { SpecGenerationProviderError } from "./spec-generation-outcome";

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

export const requestTopDownGameSpecFromProvider: SpecGenerationProvider =
  async ({ prompt, model, providerCredential, repairContext, taskRoute }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      OPENAI_REQUEST_TIMEOUT_MS
    );

    let response: Response;
    try {
      response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${providerCredential}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          reasoning: {
            effort: "medium",
          },
          parallel_tool_calls: false,
          tool_choice: {
            type: "function",
            name: TOP_DOWN_GAME_SPEC_TOOL,
          },
          tools: [
            {
              type: "function",
              name: TOP_DOWN_GAME_SPEC_TOOL,
              description:
                "Return one complete, narrow TopDownGameSpec for the Phaser top-down template. Do not return source code or a Game Pack.",
              parameters: topDownGameSpecJsonSchema,
              strict: true,
            },
          ],
          instructions: createTopDownSpecGenerationSystemPrompt({
            prompt,
            repairContext,
            taskRoute,
          }),
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: prompt,
                },
              ],
            },
          ],
        }),
        cache: "no-store",
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          "OpenAI generation timed out while creating the top-down Game Spec."
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    const payload = await readOpenAIResponsePayload(response);

    if (!response.ok) {
      throw createOpenAIProviderError(response, payload);
    }

    const functionCall = payload.output?.find(
      (item): item is ResponsesFunctionCall =>
        item.type === "function_call" &&
        typeof item.name === "string" &&
        item.name === TOP_DOWN_GAME_SPEC_TOOL &&
        typeof item.arguments === "string"
    );

    if (!functionCall) {
      throw new Error("OpenAI did not return a top-down Game Spec.");
    }

    try {
      return JSON.parse(functionCall.arguments) as unknown;
    } catch {
      throw new Error("OpenAI returned invalid JSON for the top-down Game Spec.");
    }
  };

async function readOpenAIResponsePayload(response: Response) {
  try {
    return (await response.json()) as OpenAIResponsePayload;
  } catch {
    return {} satisfies OpenAIResponsePayload;
  }
}

function createOpenAIProviderError(
  response: Response,
  payload: OpenAIResponsePayload
) {
  const fallbackMessage = `OpenAI request failed with status ${response.status}.`;
  const message = payload.error?.message ?? fallbackMessage;
  const requestId = response.headers.get("x-request-id") ?? undefined;

  return new SpecGenerationProviderError(message, {
    provider: "openai",
    message,
    status: response.status,
    ...(payload.error?.code ? { code: payload.error.code } : {}),
    ...(payload.error?.param ? { param: payload.error.param } : {}),
    ...(payload.error?.type ? { type: payload.error.type } : {}),
    ...(requestId ? { requestId } : {}),
  });
}
