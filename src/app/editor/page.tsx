import { EditorShell } from "@/components/editor-shell";

type EditorPageProps = {
  searchParams: Promise<{
    idea?: string;
  }>;
};

export default async function EditorPage({ searchParams }: EditorPageProps) {
  const { idea } = await searchParams;

  return <EditorShell enteredPrompt={typeof idea === "string" ? idea : ""} />;
}
