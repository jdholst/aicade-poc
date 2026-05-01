import { type OpenAIModelId } from "@/utils/openai-utils";
import {
  generatedGamePackFromOpenAiSchema,
  type GeneratedGamePack,
} from "@/service/starter-project/starter-project-schema";
import { completeGeneratedGamePack } from "@/service/starter-project/generated-game-pack-contract";
import { requestGeneratedGamePackFromOpenAI } from "@/service/starter-project/starter-project-server";

type GenerateStarterGameInput = {
  prompt: string;
  openAiApiKey: string;
  openAiModel: OpenAIModelId;
};

export async function generateStarterGame({
  prompt,
  openAiApiKey,
  openAiModel,
}: GenerateStarterGameInput): Promise<GeneratedGamePack> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const rawPack = await requestGeneratedGamePackFromOpenAI(
        prompt,
        openAiApiKey,
        openAiModel
      );
      const parsed = generatedGamePackFromOpenAiSchema.safeParse(rawPack);

      if (!parsed.success) {
        lastError = parsed.error;
        continue;
      }

      return completeGeneratedGamePack(parsed.data, prompt);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : "OpenAI returned a generated game pack that failed validation twice."
  );
}

