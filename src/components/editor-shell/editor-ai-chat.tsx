import { OpenAiConfigForm } from "@/components/openai-config-form";
import type {
  EditorAIChatActions,
  EditorAIChatSession,
} from "@/hooks/use-editor-session";
import { parseTopDownGameSpec, type TopDownGameSpec } from "@/game-spec";
import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";

import { createGenerationFailureReceiptSurface } from "./editor-failure-receipt";

type EditorAIChatProps = {
  actions: EditorAIChatActions;
  chat: EditorAIChatSession;
};

type GeneratedProjectTranscriptMessage = {
  role: "assistant" | "user";
  text: string;
};

type GeneratedProjectDetailItem = {
  label: string;
  value: string;
};

type GeneratedProjectDetailPanel = {
  items: GeneratedProjectDetailItem[];
  title: string;
};

type GeneratedProjectControl = {
  action: string;
  keys: string[];
  label: string;
};

type GeneratedProjectSummary = {
  capabilities: string[];
  controls: GeneratedProjectControl[];
  detailPanels: GeneratedProjectDetailPanel[];
  overviewMetrics: string[];
  overviewSummary: string;
  statusMessage: string;
  summaryItems: string[];
  transcript: GeneratedProjectTranscriptMessage[];
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

function getTopDownSpecSummary(spec: TopDownGameSpec) {
  return [
    "phaser runtime",
    `${spec.template.config.scenes.length} scene`,
    `${spec.entities.length} entities`,
    `${spec.assets.length} assets`,
    `${spec.mechanics.length} mechanics`,
    spec.schemaVersion,
  ];
}

function createTopDownSpecGenerationTranscriptMessage(
  metadata: Extract<
    EditorAIChatSession["loadState"],
    { status: "success"; source: "phaser-spec" }
  >["metadata"]
): GeneratedProjectTranscriptMessage {
  const repairCount =
    metadata.repairAttempts && metadata.repairAttempts.length > 0
      ? Math.max(metadata.attemptCount - 1, metadata.repairAttempts.length)
      : 0;
  const repairSuffix =
    repairCount > 0
      ? ` after ${repairCount} automatic repair${
          repairCount === 1 ? "" : "s"
        }`
      : "";

  return {
    role: "assistant",
    text: `Generated a playable project plan from the prompt${repairSuffix}.`,
  };
}

function createGeneratedProjectSummary(
  loadState: EditorAIChatSession["loadState"],
  submittedPrompt: string
): GeneratedProjectSummary | null {
  if (loadState.status !== "success") {
    return null;
  }

  const statusMessage =
    "The generated project was validated and mounted in the sandbox.";

  if (loadState.source === "canvas-starter") {
    return {
      capabilities: loadState.pack.manifest.capabilities,
      controls: loadState.pack.manifest.controls,
      detailPanels: loadState.pack.editorMetadata.panels,
      overviewMetrics: [
        loadState.pack.manifest.runtime,
        loadState.pack.manifest.editableSpecVersion,
        loadState.pack.manifest.genre,
        loadState.pack.manifest.viewport.scaling,
        `${loadState.pack.manifest.controls.length} controls`,
      ],
      overviewSummary: loadState.pack.project.summary,
      statusMessage,
      summaryItems: getSpecSummary(loadState.pack),
      transcript: loadState.pack.chatTranscript,
    };
  }

  if (loadState.source === "phaser-game-pack") {
    const gameSpec = parseTopDownGameSpec(loadState.gamePack.gameSpec);
    const capabilities = Array.from(
      new Set(
        (loadState.gamePack.acceptedGeneratedMechanicArtifacts ?? []).flatMap(
          ({ sourceArtifact }) =>
            sourceArtifact.grant.capabilities.map(({ id }) => id)
        )
      )
    );

    return {
      capabilities,
      controls: gameSpec.controls,
      detailPanels: [],
      overviewMetrics: [
        loadState.gamePack.runtimeKind,
        gameSpec.schemaVersion,
        gameSpec.template.id,
        `${loadState.gamePack.acceptedGeneratedMechanicArtifacts?.length ?? 0} generated mechanic`,
      ],
      overviewSummary: gameSpec.currentIntentSummary,
      statusMessage,
      summaryItems: getTopDownSpecSummary(gameSpec),
      transcript: [
        { role: "user", text: submittedPrompt },
        {
          role: "assistant",
          text: "Generated, evaluated, and accepted a playable mechanic project.",
        },
      ],
    };
  }

  return {
    capabilities: [],
    controls: loadState.spec.controls,
    detailPanels: [],
    overviewMetrics: [
      loadState.runtimeKind,
      loadState.spec.schemaVersion,
      loadState.spec.template.id,
      loadState.metadata.model,
    ],
    overviewSummary: loadState.spec.currentIntentSummary,
    statusMessage,
    summaryItems: getTopDownSpecSummary(loadState.spec),
    transcript: [
      {
        role: "user",
        text: submittedPrompt,
      },
      createTopDownSpecGenerationTranscriptMessage(loadState.metadata),
    ],
  };
}

export function EditorAIChat({ actions, chat }: EditorAIChatProps) {
  const {
    canRegeneratePrompt,
    canStartGeneration,
    canSubmitPrompt,
    generationStages,
    generationStepIndex,
    hasSubmittedPrompt,
    isEditingPrompt,
    isGenerating,
    loadState,
    needsOpenAiApiKey,
    needsOpenAiModel,
    openAiApiKey,
    openAiKeyword,
    openAiModel,
    promptDraft,
    submittedPrompt,
  } = chat;
  const {
    onOpenAiApiKeyChange,
    onOpenAiKeywordChange,
    onOpenAiModelChange,
    onPromptDraftChange,
    onPromptEdit,
    onPromptRegenerate,
    onPromptSubmit,
    onRegenerateGame,
    onStartGeneration,
  } = actions;
  const generatedProjectSummary = createGeneratedProjectSummary(
    loadState,
    submittedPrompt
  );
  const degradedGeneration =
    loadState.status === "success" &&
    loadState.source === "phaser-spec" &&
    loadState.degradedWarning
      ? {
          generationRunId: loadState.generationRunId,
          warning: loadState.degradedWarning,
        }
      : null;
  const generationErrorSummary =
    loadState.status === "error"
      ? createGenerationFailureReceiptSurface({
          generatedMechanicFailure: loadState.generatedMechanicFailure,
          message: loadState.message,
          validationFailure: loadState.validationFailure,
        }).summary
      : null;
  const isPromptEditingForRegeneration =
    isEditingPrompt && loadState.status === "error";
  const isPromptFormVisible =
    (loadState.status === "idle" &&
      (!hasSubmittedPrompt || isEditingPrompt)) ||
    isPromptEditingForRegeneration;
  const canEditSubmittedPrompt =
    hasSubmittedPrompt &&
    !isEditingPrompt &&
    (loadState.status === "idle" || loadState.status === "error");
  const promptEditButtonLabel =
    loadState.status === "idle" ? "Edit Prompt" : "Change Prompt";
  const promptSubmitButtonLabel =
    loadState.status === "idle" ? "Send prompt" : "Regenerate";
  const canSubmitVisiblePrompt =
    loadState.status === "idle" ? canSubmitPrompt : canRegeneratePrompt;

  return (
    <aside className="flex min-w-0 flex-col border border-[var(--line-strong)] bg-[rgba(255,249,242,0.78)] backdrop-blur lg:min-h-0">
      <div className="shrink-0 border-b border-[var(--line)] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)] sm:tracking-[0.2em]">
              Chat
            </div>
            <div className="mt-2 text-base font-semibold sm:text-lg">
              Generated project log
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted)] sm:tracking-[0.2em]">
              Read only
            </div>
            <button
              type="button"
              disabled={!canStartGeneration}
              onClick={onRegenerateGame}
              className="inline-flex w-full items-center justify-center border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[rgba(21,18,14,0.12)] disabled:text-[var(--muted)] sm:w-auto sm:tracking-[0.16em]"
            >
              {isGenerating
                ? "Generating..."
                : loadState.status === "idle"
                  ? "Build"
                  : "Regenerate"}
            </button>
          </div>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)] sm:leading-7">
          This run uses your submitted prompt to generate the playable project,
          controls, and editor metadata below.
        </p>
      </div>

      <div className="chat-history-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
        {loadState.status !== "success" ? (
          <article className="ml-auto w-full border border-[var(--line)] bg-[rgba(21,18,14,0.93)] px-4 py-3 text-white sm:max-w-[92%]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60 sm:tracking-[0.18em]">
              Prompt
            </div>
            {isPromptFormVisible ? (
              <form
                className="mt-3 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (loadState.status === "idle") {
                    onPromptSubmit();
                    return;
                  }

                  onPromptRegenerate();
                }}
              >
                <label className="block">
                  <span className="sr-only">Game prompt</span>
                  <textarea
                    value={promptDraft}
                    onChange={(event) => {
                      onPromptDraftChange(event.target.value);
                    }}
                    onInput={(event) => {
                      onPromptDraftChange(event.currentTarget.value);
                    }}
                    className="min-h-32 w-full resize-none border border-white/16 bg-white/8 px-3 py-3 text-sm leading-7 text-white placeholder:text-white/42 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(14,124,102,0.28)]"
                    placeholder="Describe the starter game you want to build."
                  />
                </label>
                <button
                  type="submit"
                  disabled={!canSubmitVisiblePrompt}
                  className="inline-flex w-full items-center justify-center border border-white/16 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/44 sm:w-auto sm:tracking-[0.18em]"
                >
                  {promptSubmitButtonLabel}
                </button>
              </form>
            ) : (
              <>
                <p className="mt-2 text-sm leading-7">{submittedPrompt}</p>
                {canEditSubmittedPrompt ? (
                  <button
                    type="button"
                    onClick={onPromptEdit}
                    className="mt-3 inline-flex w-full items-center justify-center border border-white/24 bg-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:border-white/60 hover:bg-white hover:text-[var(--ink)] sm:w-auto sm:tracking-[0.16em]"
                  >
                    {promptEditButtonLabel}
                  </button>
                ) : null}
              </>
            )}
          </article>
        ) : null}

        {loadState.status === "idle" ? (
          <article className="w-full border border-[var(--line)] bg-white/88 px-4 py-3 text-[var(--ink)] sm:max-w-[92%]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] sm:tracking-[0.18em]">
              AI
            </div>
            <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
              I have your prompt ready. Start generation when you want the
              playable project, controls, and editor metadata created.
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
              className="mt-4 inline-flex w-full items-center justify-center border border-[var(--line)] bg-[var(--ink)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[rgba(21,18,14,0.12)] disabled:text-[var(--muted)] sm:w-auto sm:tracking-[0.18em]"
            >
              Build the project
            </button>
          </article>
        ) : null}

        {loadState.status === "loading" ? (
          <>
            <div className="border border-[var(--line)] bg-white/76 px-4 py-3 text-sm text-[var(--muted)]">
              Building the project. The live generation indicator is on the
              runtime surface while this log tracks each phase.
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
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9d4b31] sm:tracking-[0.18em]">
                Generation error
              </div>
              <p className="mt-3 text-sm leading-7 text-[#613128]">
                {generationErrorSummary}
              </p>
            </div>
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
              onClick={onRegenerateGame}
              className="inline-flex w-full items-center justify-center border border-[#9d4b31]/30 bg-[#9d4b31] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#81402b] disabled:cursor-not-allowed disabled:bg-[rgba(21,18,14,0.12)] disabled:text-[var(--muted)] sm:w-auto sm:tracking-[0.18em]"
            >
              Retry generation
            </button>
          </div>
        ) : null}

        {generatedProjectSummary ? (
          <>
            <div className="border border-[var(--line)] bg-white/76 px-4 py-3 text-sm text-[var(--muted)]">
              {generatedProjectSummary.statusMessage}
            </div>

            {degradedGeneration ? (
              <section
                aria-label="Degraded generation warning"
                className="border border-[#b36b2c]/45 bg-[#fff3df] p-4 text-[var(--ink)]"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b4e1f]">
                  Limited functionality
                </div>
                <h2 className="mt-2 text-base font-semibold">
                  {degradedGeneration.warning.summary.replace(/\.$/, "")}
                </h2>
                <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                  {degradedGeneration.warning.omittedBehavior}
                </p>
                <details className="mt-3 border-t border-[#b36b2c]/25 pt-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-[#7a431b]">
                    View omission details
                  </summary>
                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-[auto_1fr]">
                    <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Stage
                    </dt>
                    <dd>{degradedGeneration.warning.stage}</dd>
                    <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Outcome
                    </dt>
                    <dd>{degradedGeneration.warning.code}</dd>
                    {degradedGeneration.generationRunId ? (
                      <>
                        <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                          Generation run
                        </dt>
                        <dd className="break-all">
                          {degradedGeneration.generationRunId}
                        </dd>
                      </>
                    ) : null}
                    {degradedGeneration.warning.intentId ? (
                      <>
                        <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                          Omitted intent
                        </dt>
                        <dd className="break-all">
                          {degradedGeneration.warning.intentId}
                        </dd>
                      </>
                    ) : null}
                    <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Generated stages
                    </dt>
                    <dd>Not started (0 provider, realm, browser, or handoff calls)</dd>
                    <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Routing result
                    </dt>
                    <dd>{degradedGeneration.warning.routingFailure.kind}</dd>
                    <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Routing evidence
                    </dt>
                    <dd>
                      {degradedGeneration.warning.routingFailure.evidence.code}
                    </dd>
                    <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Fallback decision
                    </dt>
                    <dd>{degradedGeneration.warning.policyDecision.code}</dd>
                    <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Fallback validation
                    </dt>
                    <dd>
                      {degradedGeneration.warning.fallbackValidation.status} —{" "}
                      {degradedGeneration.warning.fallbackValidation.gameSpecId}
                    </dd>
                    {"missingCapabilities" in
                      degradedGeneration.warning.routingFailure.evidence &&
                    degradedGeneration.warning.routingFailure.evidence
                      .missingCapabilities.length > 0 ? (
                      <>
                        <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                          Missing capabilities
                        </dt>
                        <dd>
                          {degradedGeneration.warning.routingFailure.evidence.missingCapabilities.join(
                            ", "
                          )}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  <ul className="mt-4 space-y-2">
                    {degradedGeneration.warning.issues.map((issue) => (
                      <li
                        key={`${issue.path}:${issue.code}`}
                        className="border border-[#b36b2c]/20 bg-white/55 p-3"
                      >
                        <div className="font-mono text-xs font-semibold">
                          {issue.code}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                          {issue.path}
                        </div>
                        <p className="mt-2 leading-6">{issue.message}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              </section>
            ) : null}

            {generatedProjectSummary.transcript.map((message, index) => (
              <article
                key={`${message.role}-${index}-${message.text}`}
                className={`w-full border px-4 py-3 sm:max-w-[92%] ${
                  message.role === "user"
                    ? "ml-auto border-[var(--line)] bg-[rgba(21,18,14,0.93)] text-white"
                    : "border-[var(--line)] bg-white/88 text-[var(--ink)]"
                }`}
              >
                <div
                  className={`text-[11px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.18em] ${
                    message.role === "user"
                      ? "text-white/60"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {message.role === "user" ? "Prompt" : "AI"}
                </div>
                {message.role === "user" && isEditingPrompt ? (
                  <form
                    className="mt-3 space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onPromptRegenerate();
                    }}
                  >
                    <label className="block">
                      <span className="sr-only">Game prompt</span>
                      <textarea
                        value={promptDraft}
                        onChange={(event) => {
                          onPromptDraftChange(event.target.value);
                        }}
                        onInput={(event) => {
                          onPromptDraftChange(event.currentTarget.value);
                        }}
                        className="min-h-32 w-full resize-none border border-white/16 bg-white/8 px-3 py-3 text-sm leading-7 text-white placeholder:text-white/42 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(14,124,102,0.28)]"
                        placeholder="Describe the starter game you want to build."
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={!canRegeneratePrompt}
                      className="inline-flex w-full items-center justify-center border border-white/16 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/44 sm:w-auto sm:tracking-[0.18em]"
                    >
                      Regenerate
                    </button>
                  </form>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-7">{message.text}</p>
                    {message.role === "user" ? (
                      <button
                        type="button"
                        onClick={onPromptEdit}
                        className="mt-3 inline-flex w-full items-center justify-center border border-white/24 bg-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:border-white/60 hover:bg-white hover:text-[var(--ink)] sm:w-auto sm:tracking-[0.16em]"
                      >
                        Change Prompt
                      </button>
                    ) : null}
                  </>
                )}
              </article>
            ))}

            <section className="border border-[var(--line)] bg-[rgba(240,247,243,0.9)] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Generated project
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                {generatedProjectSummary.overviewSummary}
              </p>
              <div className="mt-4 grid gap-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)] sm:grid-cols-2">
                {generatedProjectSummary.overviewMetrics.map((metric) => (
                  <div
                    key={metric}
                    className="border border-[var(--line)] bg-white/70 px-3 py-3"
                  >
                    {metric}
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              {generatedProjectSummary.summaryItems.map((item) => (
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
                {generatedProjectSummary.controls.map((control) => (
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

            {generatedProjectSummary.detailPanels.length > 0 ? (
              <section className="space-y-3">
                {generatedProjectSummary.detailPanels.map((panel) => (
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
            ) : null}

            {generatedProjectSummary.capabilities.length > 0 ? (
              <section className="border border-[var(--line)] bg-[rgba(17,24,31,0.92)] p-4 text-white">
                <div
                  className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50"
                >
                  Capabilities
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {generatedProjectSummary.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="border border-white/12 bg-white/8 px-2.5 py-1 text-xs text-white/78"
                    >
                      {capability}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-[var(--line)] bg-[rgba(255,252,248,0.92)] px-4 py-4 sm:px-5">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] sm:tracking-[0.18em]">
          Follow-up prompts
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <textarea
            disabled
            className="min-h-28 w-full resize-none border border-[var(--line)] bg-white/75 px-4 py-3 text-sm leading-6 text-[var(--muted)] outline-none sm:min-h-24 sm:flex-1"
            placeholder="Follow-up prompts will use this generated module manifest and editable spec in v1."
          />
          <button
            type="button"
            disabled
            className="min-h-12 w-full border border-[var(--line)] bg-[rgba(21,18,14,0.08)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] sm:min-h-24 sm:w-auto sm:min-w-28 sm:tracking-[0.18em]"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}
