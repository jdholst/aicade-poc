import { EditorShell } from "@/components/editor-shell/editor-shell";
import { getOpenAiConfigRequirements } from "@/service/starter-project";

type EditorPageProps = {
  searchParams: Promise<{
    idea?: string;
    openAiApiKey?: string;
    openAiKeyword?: string;
    openAiModel?: string;
  }>;
};

export default async function EditorPage({ searchParams }: EditorPageProps) {
  const { idea, openAiApiKey, openAiKeyword, openAiModel } = await searchParams;
  const enteredPrompt = typeof idea === "string" ? idea : "";
  const enteredOpenAiApiKey =
    typeof openAiApiKey === "string" ? openAiApiKey : "";
  const enteredOpenAiKeyword =
    typeof openAiKeyword === "string" ? openAiKeyword : "";
  const enteredOpenAiModel = typeof openAiModel === "string" ? openAiModel : "";
  const openAiConfigRequirements = getOpenAiConfigRequirements(process.env);

  return (
    <EditorShell
      key={`${enteredPrompt}-${enteredOpenAiApiKey ? "has-key" : "no-key"}-${enteredOpenAiKeyword}-${enteredOpenAiModel}`}
      enteredPrompt={enteredPrompt}
      enteredOpenAiApiKey={enteredOpenAiApiKey}
      enteredOpenAiKeyword={enteredOpenAiKeyword}
      enteredOpenAiModel={enteredOpenAiModel}
      needsOpenAiApiKey={openAiConfigRequirements.needsOpenAiApiKey}
      needsOpenAiModel={openAiConfigRequirements.needsOpenAiModel}
    />
  );
}
