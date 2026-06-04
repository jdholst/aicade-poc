import type { ReactNode } from "react";

import type { EditorGenerationStage } from "@/hooks/use-editor-session";

import type { FailureReceiptViewModel } from "./editor-failure-receipt";

function RuntimeScreenShell({
  children,
  surfaceLabel = "Generated runtime",
  statusLabel,
}: {
  children: ReactNode;
  surfaceLabel?: string;
  statusLabel: string;
}) {
  return (
    <div className="flex h-full min-h-[440px] flex-col border border-[var(--line-strong)] bg-[linear-gradient(180deg,_#18242f_0%,_#10171e_100%)] p-6 text-white">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/55">
        <span>{surfaceLabel}</span>
        <span>{statusLabel}</span>
      </div>
      <div className="mt-6 flex min-h-0 flex-1 items-center justify-center border border-dashed border-white/15 bg-[radial-gradient(circle_at_top,_rgba(255,197,92,0.14),_transparent_34%),linear-gradient(135deg,_rgba(15,127,104,0.12),_transparent_42%)] p-4">
        {children}
      </div>
    </div>
  );
}

export function InitialRuntimeScreen({
  description,
  eyebrow,
  surfaceLabel,
  title,
}: {
  description: string;
  eyebrow: string;
  surfaceLabel: string;
  title: string;
}) {
  return (
    <RuntimeScreenShell surfaceLabel={surfaceLabel} statusLabel="Ready">
      <div className="max-w-lg space-y-6 px-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <div className="h-12 w-12 rounded-full border border-white/15 bg-[radial-gradient(circle_at_center,_rgba(246,196,107,0.28),_transparent_62%)]" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            {eyebrow}
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
            {title}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/65">
            {description}
          </p>
        </div>
      </div>
    </RuntimeScreenShell>
  );
}

export function LoadingRuntimeScreen({
  progressLabel = "AI is building the project",
  stage,
  statusLabel = "Generating",
  title = "Generating your game",
}: {
  progressLabel?: string;
  stage: EditorGenerationStage;
  statusLabel?: string;
  title?: string;
}) {
  return (
    <RuntimeScreenShell statusLabel={statusLabel}>
      <div className="w-full max-w-xl space-y-6 px-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <div className="h-12 w-12 rounded-full border-2 border-white/10 border-t-[#f6c46b] border-r-[#0f7f68] animate-spin" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            {title}
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
            {stage.title}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/65">
            {stage.detail}
          </p>
        </div>
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,_#f6c46b,_#0f7f68)] transition-[width] duration-700 ease-out"
              style={{
                width: `${stage.progress}%`,
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            <span>{progressLabel}</span>
            <span>{stage.progress}%</span>
          </div>
        </div>
      </div>
    </RuntimeScreenShell>
  );
}

export function GameSpecValidationErrorScreen({
  debugReceipts = [],
  eyebrow = "Game Spec validation failed",
  message,
  onRegenerate,
  regenerateLabel = "Try again",
  statusLabel = "Validation stopped",
  title = "The runtime was not started.",
}: {
  debugReceipts?: FailureReceiptViewModel[];
  eyebrow?: string;
  message: string;
  onRegenerate?: () => void;
  regenerateLabel?: string;
  statusLabel?: string;
  title?: string;
}) {
  return (
    <RuntimeScreenShell statusLabel={statusLabel}>
      <div className="flex max-h-full min-h-0 w-full max-w-2xl flex-col">
        <div className="shrink-0 space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#f1b7a3]/30 bg-[#9d4b31]/10">
            <div className="h-10 w-10 rounded-full border-2 border-[#9d4b31]/35 border-t-[#f6c46b]" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f1b7a3]">
              {eyebrow}
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-balance">
              {title}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/65">
              {message}
            </p>
          </div>
        </div>
        {debugReceipts.length > 0 ? (
          <div
            aria-label="Validation details"
            className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-2"
          >
            {debugReceipts.map((receipt) => (
              <ValidationReceiptDetail
                key={`${receipt.stage}-${receipt.checkId}`}
                receipt={receipt}
              />
            ))}
          </div>
        ) : null}
        {onRegenerate ? (
          <div
            aria-label="Validation actions"
            className="flex shrink-0 justify-center pt-4"
          >
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex items-center justify-center border border-[#f1b7a3]/30 bg-[#9d4b31] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#81402b]"
            >
              {regenerateLabel}
            </button>
          </div>
        ) : null}
      </div>
    </RuntimeScreenShell>
  );
}

export function FirstPlayableValidationBlockedScreen({
  debugReceipts,
  eyebrow = "Draft blocked",
  onRegenerate,
  onReset,
  regenerateLabel = "Start over from prompt",
  resetLabel = "Try again",
  statusLabel = "Blocked",
  summary,
  title = "This draft is not playable yet.",
}: {
  debugReceipts: FailureReceiptViewModel[];
  eyebrow?: string;
  onRegenerate: () => void;
  onReset: () => void;
  regenerateLabel?: string;
  resetLabel?: string;
  statusLabel?: string;
  summary: string;
  title?: string;
}) {
  return (
    <RuntimeScreenShell statusLabel={statusLabel}>
      <div className="w-full max-w-2xl space-y-6 px-4">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#f1b7a3]/30 bg-[#9d4b31]/10">
          <div className="h-12 w-12 rounded-full border-2 border-[#9d4b31]/35 border-t-[#f6c46b]" />
        </div>
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f1b7a3]">
            {eyebrow}
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
            {title}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/65">
            {summary}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center justify-center border border-[#f6c46b]/35 bg-[#f6c46b] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#10171e] transition hover:bg-[#dba84d]"
          >
            {resetLabel}
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center justify-center border border-white/15 bg-white/5 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/10"
          >
            {regenerateLabel}
          </button>
        </div>
        <details className="border border-white/10 bg-black/20 p-4 text-sm text-white/70">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
            Inspect validation details
          </summary>
          <div className="mt-4 space-y-4">
            {debugReceipts.length > 0 ? (
              debugReceipts.map((receipt) => (
                <ValidationReceiptDetail
                  key={`${receipt.stage}-${receipt.checkId}`}
                  receipt={receipt}
                />
              ))
            ) : (
              <p>No validation receipts were recorded for this failure.</p>
            )}
          </div>
        </details>
      </div>
    </RuntimeScreenShell>
  );
}

function ValidationReceiptDetail({
  receipt,
}: {
  receipt: FailureReceiptViewModel;
}) {
  return (
    <section className="space-y-3 border border-white/10 bg-white/[0.03] p-4">
      <div className="grid gap-2 text-xs uppercase tracking-[0.16em] text-white/50 sm:grid-cols-3">
        <div>
          <span className="block text-white/35">Stage</span>
          <span className="normal-case tracking-normal text-white/80">
            {receipt.stage}
          </span>
        </div>
        <div>
          <span className="block text-white/35">Check ID</span>
          <span className="normal-case tracking-normal text-white/80">
            {receipt.checkId}
          </span>
        </div>
        <div>
          <span className="block text-white/35">Status</span>
          <span className="normal-case tracking-normal text-white/80">
            {receipt.status}
          </span>
        </div>
      </div>
      <p className="text-sm leading-6 text-white/75">{receipt.message}</p>
      {receipt.issueMessages.length > 0 ? (
        <ul className="space-y-2 text-sm leading-6 text-white/70">
          {receipt.issueMessages.map((issueMessage) => (
            <li key={issueMessage}>{issueMessage}</li>
          ))}
        </ul>
      ) : null}
      {receipt.evidenceJson ? (
        <pre className="max-h-48 overflow-auto border border-white/10 bg-black/25 p-3 text-xs leading-5 text-white/60">
          {receipt.evidenceJson}
        </pre>
      ) : null}
    </section>
  );
}
