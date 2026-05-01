"use client";

import { FormEvent, useState } from "react";

import { DEFAULT_OPENAI_MODEL } from "@/constants";
import { OpenAiConfigForm } from "@/components/openai-config-form";
import { type OpenAIModelId } from "@/utils/openai-utils";

type PromptFormValues = {
  idea: string;
  openAiApiKey: string;
  openAiKeyword: string;
  openAiModel: OpenAIModelId;
};

type PromptFormProps = {
  promptSuggestion: string;
  needsOpenAiApiKey: boolean;
  needsOpenAiModel: boolean;
  isPending: boolean;
  onSubmit: (formValues: PromptFormValues) => void;
};

export function PromptForm({
  promptSuggestion,
  needsOpenAiApiKey,
  needsOpenAiModel,
  isPending,
  onSubmit,
}: PromptFormProps) {
  const [prompt, setPrompt] = useState("");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [openAiKeyword, setOpenAiKeyword] = useState("");
  const [openAiModel, setOpenAiModel] =
    useState<OpenAIModelId>(DEFAULT_OPENAI_MODEL);
  const canSubmit =
    !isPending &&
    (!needsOpenAiApiKey ||
      Boolean(openAiApiKey.trim() || openAiKeyword.trim()));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onSubmit({
      idea: prompt.trim(),
      openAiApiKey: openAiApiKey.trim(),
      openAiKeyword: openAiKeyword.trim(),
      openAiModel,
    });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <label className="block">
        <span className="sr-only">Describe your game idea</span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="min-h-56 w-full resize-none border border-[var(--line)] bg-white/90 px-5 py-4 text-lg leading-8 text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(14,124,102,0.18)]"
          placeholder={promptSuggestion}
        />
      </label>

      <OpenAiConfigForm
        needsOpenAiApiKey={needsOpenAiApiKey}
        needsOpenAiModel={needsOpenAiModel}
        openAiApiKey={openAiApiKey}
        openAiKeyword={openAiKeyword}
        openAiModel={openAiModel}
        onOpenAiApiKeyChange={setOpenAiApiKey}
        onOpenAiKeywordChange={setOpenAiKeyword}
        onOpenAiModelChange={setOpenAiModel}
        variant="form"
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm leading-7 text-[var(--muted)]">
          Your prompt is sent to the generation route. If you leave this
          blank, the editor falls back to a simple jumping platformer
          prompt so the flow still works.
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-w-48 items-center justify-center gap-3 border border-transparent bg-[var(--ink)] px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-65"
        >
          {isPending ? "Opening editor..." : "Create starter world"}
        </button>
      </div>
    </form>
  );
}

export type { PromptFormValues };
