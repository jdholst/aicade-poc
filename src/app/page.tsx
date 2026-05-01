import { connection } from "next/server";

import { PromptFacade } from "@/components/prompt-facade/prompt-facade";
import { getOpenAiConfigRequirements } from "@/service/starter-project";
import { createGamePromptSuggestion } from "@/utils/game-prompt-suggestion";

export default async function Home() {
  await connection();
  const promptSuggestion = createGamePromptSuggestion();
  const openAiConfigRequirements = getOpenAiConfigRequirements(process.env);

  return (
    <PromptFacade
      promptSuggestion={promptSuggestion}
      needsOpenAiApiKey={openAiConfigRequirements.needsOpenAiApiKey}
      needsOpenAiModel={openAiConfigRequirements.needsOpenAiModel}
    />
  );
}
