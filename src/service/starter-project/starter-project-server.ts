import { GENERATED_GAME_TOOL, OPENAI_REQUEST_TIMEOUT_MS, OPENAI_RESPONSES_URL } from "@/constants";
import { createGeneratedGameSystemPrompt, generatedGamePackJsonSchema } from ".";


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

export async function requestGeneratedGamePackFromOpenAI(
  userPrompt: string,
  openAiApiKey: string,
  openAiModel: string
) {
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
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: openAiModel,
        reasoning: {
          effort: "medium",
        },
        parallel_tool_calls: false,
        tool_choice: {
          type: "function",
          name: GENERATED_GAME_TOOL,
        },
        tools: [
          {
            type: "function",
            name: GENERATED_GAME_TOOL,
            description:
              "Return a generated Canvas 2D game pack with TypeScript module source, manifest, editable spec, metadata, and chat transcript.",
            parameters: generatedGamePackJsonSchema,
            strict: true,
          },
        ],
        instructions: createGeneratedGameSystemPrompt(userPrompt),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: userPrompt,
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
        "OpenAI generation timed out while creating the game module."
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
      item.name === GENERATED_GAME_TOOL &&
      typeof item.arguments === "string"
  );

  if (!functionCall) {
    throw new Error("OpenAI did not return a generated game pack.");
  }

  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(functionCall.arguments);
  } catch {
    throw new Error("OpenAI returned invalid JSON for the generated game pack.");
  }

  return parsedArguments;
}