import { connection } from "next/server";

import { PromptFacade } from "@/components/prompt-facade/prompt-facade";
import { createGamePromptSuggestion } from "@/utils/game-prompt-suggestion";

export default async function Home() {
  await connection();
  const promptSuggestion = createGamePromptSuggestion();

  return (
    <PromptFacade
      promptSuggestion={promptSuggestion}
      needsOpenAiApiKey={!process.env.OPENAI_API_KEY}
      needsOpenAiModel={!process.env.OPENAI_MODEL}
    />
  );
}
