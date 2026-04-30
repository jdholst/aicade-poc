"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { PromptForm, type PromptFormValues } from "@/components/prompt-facade/prompt-form";

type PromptFacadeProps = {
  promptSuggestion: string;
  needsOpenAiApiKey: boolean;
  needsOpenAiModel: boolean;
};

export function PromptFacade({
  promptSuggestion,
  needsOpenAiApiKey,
  needsOpenAiModel,
}: PromptFacadeProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit({
    idea,
    openAiApiKey,
    openAiKeyword,
    openAiModel,
  }: PromptFormValues) {
    const params = new URLSearchParams();

    if (idea) {
      params.set("idea", idea);
    }

    if (needsOpenAiApiKey && openAiApiKey) {
      params.set("openAiApiKey", openAiApiKey);
    }

    if (needsOpenAiApiKey && openAiKeyword) {
      params.set("openAiKeyword", openAiKeyword);
    }

    if (needsOpenAiModel) {
      params.set("openAiModel", openAiModel);
    }

    startTransition(() => {
      router.push(params.size ? `/editor?${params.toString()}` : "/editor");
    });
  }

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,210,126,0.55),_transparent_35%),linear-gradient(135deg,_#f4ede1_0%,_#efe5d4_40%,_#dce7df_100%)] px-6 py-8 text-[var(--ink)] sm:px-10 lg:px-14">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(24,20,15,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(24,20,15,0.05)_1px,transparent_1px)] bg-[size:96px_96px] opacity-30" />
      <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-12 lg:flex-row lg:items-stretch lg:gap-16">
        <section className="flex flex-1 flex-col justify-between gap-8 py-4">
          <div className="space-y-6">
            <div className="inline-flex w-fit items-center gap-3 rounded-full border border-[var(--line)] bg-[rgba(255,248,238,0.74)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)] backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
              AI-cade v0
            </div>
            <div className="max-w-3xl space-y-5">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.06em] text-balance sm:text-6xl lg:text-7xl">
                Prompt a game into existence, then drop straight into the editor.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
                This proof of concept focuses on the first magic moment: an AI
                generated starter appearing in seconds with chat on the left
                and a live canvas on the right.
              </p>
              <p className="max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
                To begin enter your prompt at the right. Provide your own OpenAI API key,
                or obtain a secret key word (email me at <a href="mailto:jakedavidholst@hotmail.com" className="underline">jakedavidholst@hotmail.com</a> for requests).
              </p>
            </div>
          </div>

          <div className="grid gap-4 text-sm text-[var(--muted)] sm:grid-cols-3">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink)]">
                1. Prompt
              </div>
              <p>Type any idea. The ritual starts here, even in this narrow v0.</p>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink)]">
                2. Generate
              </div>
              <p>A real OpenAI response generates the starter code and spec.</p>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink)]">
                3. Play
              </div>
              <p>The generated module boots in a sandboxed canvas editor view.</p>
            </div>
          </div>
        </section>

        <section className="flex w-full max-w-2xl flex-col justify-center">
          <div className="border border-[var(--line-strong)] bg-[rgba(255,249,242,0.86)] p-6 shadow-[0_40px_120px_rgba(54,43,25,0.14)] backdrop-blur-xl sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Start a project
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  Describe your game
                </div>
              </div>
              <div className="hidden rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--muted)] sm:block">
                v0 starter flow
              </div>
            </div>

            <PromptForm
              promptSuggestion={promptSuggestion}
              needsOpenAiApiKey={needsOpenAiApiKey}
              needsOpenAiModel={needsOpenAiModel}
              isPending={isPending}
              onSubmit={handleSubmit}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
