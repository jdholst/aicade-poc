import {
  type GeneratedGamePack,
  generatedGamePackSchema,
} from "@/service/starter-project/starter-project-schema";

export type StarterProjectRequest = {
  prompt: string;
  openAiApiKey?: string;
  openAiKeyword?: string;
  openAiModel?: string;
};

/**
 * Client side request function to create a generated game pack from a user prompt.
 * This will call the Next.js API route which in turn calls the OpenAI API and processes the response.
 * @param request 
 * @param signal 
 * @returns 
 */
export async function requestStarterProject(
  request: StarterProjectRequest,
  signal?: AbortSignal
): Promise<GeneratedGamePack> {
  const response = await fetch("/api/starter-project", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      enteredPrompt: request.prompt || undefined,
      openAiApiKey: request.openAiApiKey,
      openAiKeyword: request.openAiKeyword,
      openAiModel: request.openAiModel,
    }),
  });

  const payload = (await response.json()) as
    | GeneratedGamePack
    | { error?: string };

  if (!response.ok || ("error" in payload && payload.error)) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Generated game creation failed."
    );
  }

  const parsed = generatedGamePackSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("The server returned an invalid generated game pack.");
  }

  return parsed.data;
}
