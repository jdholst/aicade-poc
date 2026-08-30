import {
  OPENAI_REQUEST_TIMEOUT_MS,
  OPENAI_RESPONSES_URL,
} from "@/constants";
import type { StableId } from "@/game-spec";
import {
  SpecGenerationProviderError,
} from "@/service/spec-generation/spec-generation-outcome";
import type { SpecGenerationProviderInput } from "@/service/spec-generation/spec-generation-service";
import {
  reportOpenAiProviderUsage,
  type OpenAiProviderUsageReporter,
} from "@/service/openai-provider-usage-receipt";

import { createCreatorGenerationPlanningSystemPrompt } from "./creator-generation-planning-prompt";
import {
  CREATOR_GENERATION_PLAN_TOOL,
  creatorGenerationPlanJsonSchema,
} from "./creator-generation-planning-schema";

type ResponsesFunctionCall = {
  type: "function_call";
  name: string;
  arguments: string;
};

type OpenAiResponsePayload = {
  id?: string;
  model?: string;
  service_tier?: string;
  created_at?: number;
  usage?: unknown;
  error?: {
    code?: string;
    message?: string;
    param?: string;
    type?: string;
  };
  output?: Array<{
    type: string;
    name?: string;
    arguments?: string;
  }>;
};

export type CreatorGenerationPlanProviderInput = SpecGenerationProviderInput &
  Readonly<{
    availableCapabilities: readonly StableId[];
    onProviderUsage?: OpenAiProviderUsageReporter;
    signal?: AbortSignal;
  }>;

export type CreatorGenerationPlanProvider = (
  input: CreatorGenerationPlanProviderInput
) => Promise<unknown>;

export type CreateOpenAiCreatorGenerationPlanProviderInput = Readonly<{
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}>;

export function createOpenAiCreatorGenerationPlanProvider({
  fetchImpl = fetch,
  timeoutMs = OPENAI_REQUEST_TIMEOUT_MS,
}: CreateOpenAiCreatorGenerationPlanProviderInput = {}): CreatorGenerationPlanProvider {
  return async (input) => {
    if (input.signal?.aborted) {
      throw new Error("Creator-generation planning was cancelled.");
    }
    const controller = new AbortController();
    let cancelled = false;
    let timedOut = false;
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
    let payload: OpenAiResponsePayload;
    const requestPayload = {
      model: input.model,
      service_tier: "default",
      reasoning: {
        effort: "medium",
      },
      parallel_tool_calls: false,
      tool_choice: {
        type: "function",
        name: CREATOR_GENERATION_PLAN_TOOL,
      },
      tools: [
        {
          type: "function",
          name: CREATOR_GENERATION_PLAN_TOOL,
          description:
            "Return one complete top-down Game Spec and its material Mechanic Intent. Do not return source code or choose a mechanic route.",
          parameters: creatorGenerationPlanJsonSchema,
          strict: true,
        },
      ],
      instructions: createCreatorGenerationPlanningSystemPrompt(input),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: input.prompt,
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
      payload = await readOpenAiResponsePayload(response);
      reportOpenAiProviderUsage(input.onProviderUsage, payload, requestPayload);
      if (cancelled || timedOut) {
        throw new DOMException("Aborted", "AbortError");
      }
    } catch (error) {
      if (cancelled) {
        throw new Error("Creator-generation planning was cancelled.");
      }
      if (timedOut) {
        throw new Error(
          "OpenAI generation timed out while creating the creator-generation plan."
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
      input.signal?.removeEventListener("abort", cancelFromCaller);
    }

    if (!response.ok) {
      throw createOpenAiProviderError(response, payload);
    }

    const functionCall = payload.output?.find(
      (item): item is ResponsesFunctionCall =>
        item.type === "function_call" &&
        item.name === CREATOR_GENERATION_PLAN_TOOL &&
        typeof item.arguments === "string"
    );
    if (!functionCall) {
      throw new Error(
        "OpenAI did not return a creator-generation planning envelope."
      );
    }

    try {
      return JSON.parse(functionCall.arguments) as unknown;
    } catch {
      throw new Error(
        "OpenAI returned invalid JSON for the creator-generation plan."
      );
    }
  };
}

export const requestCreatorGenerationPlanFromProvider =
  createOpenAiCreatorGenerationPlanProvider();

async function readOpenAiResponsePayload(response: Response) {
  try {
    return (await response.json()) as OpenAiResponsePayload;
  } catch {
    return {} satisfies OpenAiResponsePayload;
  }
}

function createOpenAiProviderError(
  response: Response,
  payload: OpenAiResponsePayload
) {
  const message =
    payload.error?.message ??
    `OpenAI request failed with status ${response.status}.`;
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
