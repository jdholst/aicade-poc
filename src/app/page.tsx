import { connection } from "next/server";

import { PromptFacade } from "@/components/prompt-facade";

export default async function Home() {
  await connection();

  return (
    <PromptFacade
      needsOpenAiApiKey={!process.env.OPENAI_API_KEY}
      needsOpenAiModel={!process.env.OPENAI_MODEL}
    />
  );
}
