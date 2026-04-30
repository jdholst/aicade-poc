import { OPENAI_MODEL_OPTIONS } from "@/constants";
import { isOpenAIModelId, OpenAIModelId } from "@/utils/openai-utils";

type OpenAiConfigFormProps = {
  needsOpenAiApiKey: boolean;
  needsOpenAiModel: boolean;
  openAiApiKey: string;
  openAiKeyword: string;
  openAiModel: string;
  onOpenAiApiKeyChange: (value: string) => void;
  onOpenAiKeywordChange: (value: string) => void;
  onOpenAiModelChange: (value: OpenAIModelId) => void;
  variant?: "form" | "chat";
};

export function OpenAiConfigForm({
  needsOpenAiApiKey,
  needsOpenAiModel,
  openAiApiKey,
  openAiKeyword,
  openAiModel,
  onOpenAiApiKeyChange,
  onOpenAiKeywordChange,
  onOpenAiModelChange,
  variant = "form",
}: OpenAiConfigFormProps) {
  const needsOpenAiConfig = needsOpenAiApiKey || needsOpenAiModel;
  const selectedOpenAiModel = OPENAI_MODEL_OPTIONS.find(
    (model) => model.id === openAiModel
  );

  if (!needsOpenAiConfig) {
    return null;
  }

  const isChat = variant === "chat";
  const sectionClasses = isChat
    ? "mt-4 grid gap-3 border border-[var(--line)] bg-[rgba(240,247,243,0.72)] p-3"
    : "grid gap-4 border border-[var(--line)] bg-[rgba(255,255,255,0.58)] p-4 sm:grid-cols-2";

  const labelClasses = isChat
    ? "text-[11px]"
    : "text-xs";

  const inputClasses = isChat
    ? "bg-white/88 px-3 py-2 text-sm"
    : "bg-white/90 px-4 py-3 text-sm";

  return (
    <section className={sectionClasses}>
      {needsOpenAiApiKey ? (
        <div className="block">
          <label className="block">
            <span
              className={`font-semibold uppercase tracking-[0.18em] text-[var(--muted)] ${labelClasses}`}
            >
              OpenAI API key
            </span>
            <input
              type="password"
              value={openAiApiKey}
              onChange={(event) => onOpenAiApiKeyChange(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={`mt-2 w-full border border-[var(--line)] ${inputClasses} font-mono text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(14,124,102,0.18)]`}
              placeholder="sk-..."
            />
          </label>
          <div
            className={`py-3 text-center font-semibold uppercase tracking-[0.18em] text-[var(--muted)] ${labelClasses}`}
          >
            or
          </div>
          <label className="block">
            <span
              className={`font-semibold uppercase tracking-[0.18em] text-[var(--muted)] ${labelClasses}`}
            >
              Key word
            </span>
            <input
              type="text"
              value={openAiKeyword}
              onChange={(event) => onOpenAiKeywordChange(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={`mt-2 w-full border border-[var(--line)] ${inputClasses} text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(14,124,102,0.18)]`}
              placeholder="Secret Word"
            />
          </label>
        </div>
      ) : null}

      {needsOpenAiModel ? (
        <label className="block">
          <span
            className={`font-semibold uppercase tracking-[0.18em] text-[var(--muted)] ${labelClasses}`}
          >
            AI model
          </span>
          <select
            value={openAiModel}
            onChange={(event) => {
              if (isOpenAIModelId(event.target.value)) {
                onOpenAiModelChange(event.target.value);
              }
            }}
            className={`mt-2 w-full border border-[var(--line)] ${inputClasses} font-medium text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(14,124,102,0.18)]`}
          >
            {OPENAI_MODEL_OPTIONS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            {selectedOpenAiModel?.detail}
          </p>
        </label>
      ) : null}
    </section>
  );
}
