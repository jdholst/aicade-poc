import {
  OPENAI_REQUEST_TIMEOUT_MS,
  OPENAI_RESPONSES_URL,
} from "@/constants";

import {
  TOP_DOWN_GAME_SPEC_TOOL,
  topDownGameSpecJsonSchema,
} from "./spec-generation-schema";
import { createTopDownSpecGenerationSystemPrompt } from "./spec-generation-guide";
import type { SpecGenerationProvider } from "./spec-generation-service";

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
    message?: string;
  };
  output?: ResponseOutputItem[];
};

export const requestTopDownGameSpecFromProvider: SpecGenerationProvider =
  async ({ prompt, model, providerCredential, taskRoute }) => {
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

    const payload = (await response.json()) as OpenAIResponsePayload;

    if (!response.ok) {
      throw new Error(
        payload.error?.message ??
          `OpenAI request failed with status ${response.status}.`
      );
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
