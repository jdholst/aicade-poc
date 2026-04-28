"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import {
  DEFAULT_OPENAI_MODEL,
  OPENAI_MODEL_OPTIONS,
  isOpenAIModelId,
} from "@/lib/starter-project";

type PromptFacadeProps = {
  needsOpenAiApiKey: boolean;
  needsOpenAiModel: boolean;
};

export function PromptFacade({
  needsOpenAiApiKey,
  needsOpenAiModel,
}: PromptFacadeProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [openAiKeyword, setOpenAiKeyword] = useState("");
  const [openAiModel, setOpenAiModel] = useState(DEFAULT_OPENAI_MODEL);
  const [isPending, startTransition] = useTransition();
  const needsOpenAiConfig = needsOpenAiApiKey || needsOpenAiModel;
  const canSubmit =
    !isPending &&
    (!needsOpenAiApiKey ||
      Boolean(openAiApiKey.trim() || openAiKeyword.trim()));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();
    const trimmed = prompt.trim();

    if (trimmed) {
      params.set("idea", trimmed);
    }

    if (needsOpenAiApiKey && openAiApiKey.trim()) {
      params.set("openAiApiKey", openAiApiKey.trim());
    }

    if (needsOpenAiApiKey && openAiKeyword.trim()) {
      params.set("openAiKeyword", openAiKeyword.trim());
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

            <form className="space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="sr-only">Describe your game idea</span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-56 w-full resize-none border border-[var(--line)] bg-white/90 px-5 py-4 text-lg leading-8 text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(14,124,102,0.18)]"
                  placeholder="A neon cave runner with floating platforms, coins, and a little robot hero..."
                />
              </label>

              {needsOpenAiConfig ? (
                <section className="grid gap-4 border border-[var(--line)] bg-[rgba(255,255,255,0.58)] p-4 sm:grid-cols-2">
                  {needsOpenAiApiKey ? (
                    <div className="block">
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          OpenAI API key
                        </span>
                        <input
                          type="password"
                          value={openAiApiKey}
                          onChange={(event) =>
                            setOpenAiApiKey(event.target.value)
                          }
                          autoComplete="off"
                          spellCheck={false}
                          className="mt-2 w-full border border-[var(--line)] bg-white/90 px-4 py-3 font-mono text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(14,124,102,0.18)]"
                          placeholder="sk-..."
                        />
                      </label>
                      <div className="py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                        or
                      </div>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          Key word
                        </span>
                        <input
                          type="text"
                          value={openAiKeyword}
                          onChange={(event) =>
                            setOpenAiKeyword(event.target.value)
                          }
                          autoComplete="off"
                          spellCheck={false}
                          className="mt-2 w-full border border-[var(--line)] bg-white/90 px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(14,124,102,0.18)]"
                          placeholder="Secret Word"
                        />
                      </label>
                    </div>
                  ) : null}

                  {needsOpenAiModel ? (
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                        AI model
                      </span>
                      <select
                        value={openAiModel}
                        onChange={(event) => {
                          if (isOpenAIModelId(event.target.value)) {
                            setOpenAiModel(event.target.value);
                          }
                        }}
                        className="mt-2 w-full border border-[var(--line)] bg-white/90 px-4 py-3 text-sm font-medium text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(14,124,102,0.18)]"
                      >
                        {OPENAI_MODEL_OPTIONS.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                        {
                          OPENAI_MODEL_OPTIONS.find(
                            (model) => model.id === openAiModel
                          )?.detail
                        }
                      </p>
                    </label>
                  ) : null}
                </section>
              ) : null}

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
          </div>
        </section>
      </div>
    </main>
  );
}
