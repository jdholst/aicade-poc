import {
  type GeneratedGamePack,
} from "@/service/starter-project";
import { type OpenAIModelId } from "@/utils/openai-utils";
import { OpenAiConfigForm } from "@/components/openai-config-form";
import type { StarterProjectLoadState } from "@/hooks/use-starter-project-generation";

export type GenerationStage = {
  title: string;
  detail: string;
  progress: number;
};

type EditorAIChatProps = {
  canStartGeneration: boolean;
  generationStages: GenerationStage[];
  generationStepIndex: number;
  isGenerating: boolean;
  loadState: StarterProjectLoadState;
  needsOpenAiApiKey: boolean;
  needsOpenAiModel: boolean;
  onOpenAiApiKeyChange: (value: string) => void;
  onOpenAiKeywordChange: (value: string) => void;
  onOpenAiModelChange: (value: OpenAIModelId) => void;
  onRegenerateGame: () => void;
  onStartGeneration: () => void;
  openAiApiKey: string;
  openAiKeyword: string;
  openAiModel: OpenAIModelId;
  submittedPrompt: string;
};

function getSpecSummary(pack: GeneratedGamePack) {
  const specSize = JSON.stringify(pack.editableSpec).length;
  return [
    `${pack.manifest.genre} genre`,
    `${pack.manifest.viewport.width} x ${pack.manifest.viewport.height} viewport`,
    `${pack.manifest.controls.length} controls`,
    `${pack.manifest.capabilities.length} capabilities`,
    `${specSize.toLocaleString()} chars spec`,
    `${pack.moduleSourceTs.split("\n").length} lines TS`,
  ];
}

export function EditorAIChat({
  canStartGeneration,
  generationStages,
  generationStepIndex,
  isGenerating,
  loadState,
  needsOpenAiApiKey,
  needsOpenAiModel,
  onOpenAiApiKeyChange,
  onOpenAiKeywordChange,
  onOpenAiModelChange,
  onRegenerateGame,
  onStartGeneration,
  openAiApiKey,
  openAiKeyword,
  openAiModel,
  submittedPrompt,
}: EditorAIChatProps) {

  return (
    <aside className="flex min-h-0 flex-col border border-[var(--line-strong)] bg-[rgba(255,249,242,0.78)] backdrop-blur">
      <div className="shrink-0 border-b border-[var(--line)] px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Chat
            </div>
            <div className="mt-2 text-lg font-semibold">
              Generated project log
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Read only
            </div>
            <button
              type="button"
              disabled={!canStartGeneration}
              onClick={onRegenerateGame}
              className="inline-flex items-center justify-center border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[rgba(21,18,14,0.12)] disabled:text-[var(--muted)]"
            >
              {isGenerating
                ? "Generating..."
                : loadState.status === "idle"
                  ? "Build"
                  : "Regenerate"}
            </button>
          </div>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--muted)]">
          This run uses your submitted prompt to generate the canvas runtime
          code, the editable JSON spec, controls, and editor metadata below.
        </p>
      </div>

      <div className="chat-history-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5">
        {loadState.status !== "success" ? (
          <article className="ml-auto max-w-[92%] border border-[var(--line)] bg-[rgba(21,18,14,0.93)] px-4 py-3 text-white">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Prompt
            </div>
            <p className="mt-2 text-sm leading-7">{submittedPrompt}</p>
          </article>
        ) : null}

        {loadState.status === "idle" ? (
          <article className="max-w-[92%] border border-[var(--line)] bg-white/88 px-4 py-3 text-[var(--ink)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              AI
            </div>
            <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
              I have your prompt ready. Start generation when you want the
              starter game code, editable spec, controls, and editor metadata
              created.
            </p>
            <OpenAiConfigForm
              needsOpenAiApiKey={needsOpenAiApiKey}
              needsOpenAiModel={needsOpenAiModel}
              openAiApiKey={openAiApiKey}
              openAiKeyword={openAiKeyword}
              openAiModel={openAiModel}
              onOpenAiApiKeyChange={onOpenAiApiKeyChange}
              onOpenAiKeywordChange={onOpenAiKeywordChange}
              onOpenAiModelChange={onOpenAiModelChange}
              variant="chat"
            />
            <button
              type="button"
              disabled={!canStartGeneration}
              onClick={onStartGeneration}
              className="mt-4 inline-flex items-center justify-center border border-[var(--line)] bg-[var(--ink)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[rgba(21,18,14,0.12)] disabled:text-[var(--muted)]"
            >
              Build the starter game
            </button>
          </article>
        ) : null}

        {loadState.status === "loading" ? (
          <>
            <div className="border border-[var(--line)] bg-white/76 px-4 py-3 text-sm text-[var(--muted)]">
              Building the starter game. The live generation indicator is on the
              canvas while this log tracks each phase.
            </div>
            {generationStages.map((stage, index) => {
              const isComplete = index < generationStepIndex;
              const isActive = index === generationStepIndex;

              return (
                <div
                  key={stage.title}
                  className={`flex items-start gap-3 border-l pl-4 ${
                    isActive
                      ? "border-[var(--accent)]"
                      : "border-[var(--line)]"
                  }`}
                >
                  <div
                    className={`mt-1 flex h-3 w-3 items-center justify-center rounded-full ${
                      isComplete
                        ? "bg-[var(--accent)]"
                        : isActive
                          ? "bg-[#f6c46b] shadow-[0_0_0_6px_rgba(246,196,107,0.16)]"
                          : "bg-[var(--line-strong)]"
                    }`}
                  />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      Step {index + 1}
                    </div>
                    <div className="mt-2 text-sm leading-7 text-[var(--ink)]">
                      {stage.title}
                    </div>
                    {isActive ? (
                      <p className="mt-1 text-xs leading-6 text-[var(--muted)]">
                        {stage.detail}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </>
        ) : null}

        {loadState.status === "error" ? (
          <div className="space-y-4 border border-[rgba(169,72,42,0.24)] bg-[rgba(255,243,236,0.92)] p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9d4b31]">
                Generation error
              </div>
              <p className="mt-3 text-sm leading-7 text-[#613128]">
                {loadState.message}
              </p>
            </div>
            <button
              type="button"
              disabled={!canStartGeneration}
              onClick={onRegenerateGame}
              className="inline-flex items-center justify-center border border-[#9d4b31]/30 bg-[#9d4b31] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#81402b] disabled:cursor-not-allowed disabled:bg-[rgba(21,18,14,0.12)] disabled:text-[var(--muted)]"
            >
              Retry generation
            </button>
          </div>
        ) : null}

        {loadState.status === "success" ? (
          <>
            <div className="border border-[var(--line)] bg-white/76 px-4 py-3 text-sm text-[var(--muted)]">
              Generated TypeScript was validated, transpiled on the server, and
              mounted in a sandboxed iframe.
            </div>

            {loadState.pack.chatTranscript.map((message, index) => (
              <article
                key={`${message.role}-${index}-${message.text}`}
                className={`max-w-[92%] border px-4 py-3 ${
                  message.role === "user"
                    ? "ml-auto border-[var(--line)] bg-[rgba(21,18,14,0.93)] text-white"
                    : "border-[var(--line)] bg-white/88 text-[var(--ink)]"
                }`}
              >
                <div
                  className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
                    message.role === "user"
                      ? "text-white/60"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {message.role === "user" ? "Prompt" : "AI"}
                </div>
                <p className="mt-2 text-sm leading-7">{message.text}</p>
              </article>
            ))}

            <section className="border border-[var(--line)] bg-[rgba(240,247,243,0.9)] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Manifest
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                {loadState.pack.project.summary}
              </p>
              <div className="mt-4 grid gap-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)] sm:grid-cols-2">
                <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                  {loadState.pack.manifest.runtime}
                </div>
                <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                  {loadState.pack.manifest.editableSpecVersion}
                </div>
                <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                  {loadState.pack.manifest.genre}
                </div>
                <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                  {loadState.pack.manifest.viewport.scaling}
                </div>
                <div className="border border-[var(--line)] bg-white/70 px-3 py-3">
                  {loadState.pack.manifest.controls.length} controls
                </div>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              {getSpecSummary(loadState.pack).map((item) => (
                <div
                  key={item}
                  className="border border-[var(--line)] bg-white/74 px-3 py-3 text-xs uppercase tracking-[0.16em] text-[var(--muted)]"
                >
                  {item}
                </div>
              ))}
            </section>

            <section className="border border-[var(--line)] bg-white/78 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Controls
              </div>
              <div className="mt-3 space-y-2">
                {loadState.pack.manifest.controls.map((control) => (
                  <div
                    key={control.action}
                    className="flex items-start justify-between gap-4 text-sm"
                  >
                    <span className="text-[var(--muted)]">
                      {control.label}
                    </span>
                    <span className="max-w-[58%] text-right font-medium text-[var(--ink)]">
                      {control.keys.join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              {loadState.pack.editorMetadata.panels.map((panel) => (
                <div
                  key={panel.title}
                  className="border border-[var(--line)] bg-white/78 p-4"
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    {panel.title}
                  </div>
                  <div className="mt-3 space-y-2">
                    {panel.items.map((item) => (
                      <div
                        key={`${panel.title}-${item.label}`}
                        className="flex items-start justify-between gap-4 text-sm"
                      >
                        <span className="text-[var(--muted)]">
                          {item.label}
                        </span>
                        <span className="max-w-[58%] text-right font-medium text-[var(--ink)]">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="border border-[var(--line)] bg-[rgba(17,24,31,0.92)] p-4 text-white">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                Capabilities
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {loadState.pack.manifest.capabilities.map((capability) => (
                  <span
                    key={capability}
                    className="border border-white/12 bg-white/8 px-2.5 py-1 text-xs text-white/78"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-[var(--line)] bg-[rgba(255,252,248,0.92)] px-5 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Follow-up prompts
        </div>
        <div className="mt-3 flex gap-3">
          <textarea
            disabled
            className="min-h-24 flex-1 resize-none border border-[var(--line)] bg-white/75 px-4 py-3 text-sm text-[var(--muted)] outline-none"
            placeholder="Follow-up prompts will use this generated module manifest and editable spec in v1."
          />
          <button
            type="button"
            disabled
            className="min-w-28 border border-[var(--line)] bg-[rgba(21,18,14,0.08)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}
