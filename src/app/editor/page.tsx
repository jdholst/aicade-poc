import { EditorShell } from "@/components/editor-shell";

type EditorPageProps = {
  searchParams: Promise<{
    idea?: string;
    openAiApiKey?: string;
    openAiModel?: string;
  }>;
};

export default async function EditorPage({ searchParams }: EditorPageProps) {
  const { idea, openAiApiKey, openAiModel } = await searchParams;
  const enteredPrompt = typeof idea === "string" ? idea : "";
  const enteredOpenAiApiKey =
    typeof openAiApiKey === "string" ? openAiApiKey : "";
  const enteredOpenAiModel = typeof openAiModel === "string" ? openAiModel : "";
  const needsOpenAiApiKey = !process.env.OPENAI_API_KEY;
  const needsOpenAiModel = !process.env.OPENAI_MODEL;

  return (
    <EditorShell
      key={`${enteredPrompt}-${enteredOpenAiApiKey ? "has-key" : "no-key"}-${enteredOpenAiModel}`}
      enteredPrompt={enteredPrompt}
      enteredOpenAiApiKey={enteredOpenAiApiKey}
      enteredOpenAiModel={enteredOpenAiModel}
      needsOpenAiApiKey={needsOpenAiApiKey}
      needsOpenAiModel={needsOpenAiModel}
    />
  );
}
