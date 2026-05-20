import type { ReactNode } from "react";

import type { EditorGenerationStage } from "@/hooks/use-editor-session";
import type { StarterProjectLoadState } from "@/hooks/use-starter-project-generation";

function RuntimeScreenShell({
  children,
  statusLabel,
}: {
  children: ReactNode;
  statusLabel: string;
}) {
  return (
    <div className="flex h-full min-h-[440px] flex-col border border-[var(--line-strong)] bg-[linear-gradient(180deg,_#18242f_0%,_#10171e_100%)] p-6 text-white">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/55">
        <span>Generated canvas</span>
        <span>{statusLabel}</span>
      </div>
      <div className="mt-6 flex flex-1 items-center justify-center border border-dashed border-white/15 bg-[radial-gradient(circle_at_top,_rgba(255,197,92,0.14),_transparent_34%),linear-gradient(135deg,_rgba(15,127,104,0.12),_transparent_42%)]">
        {children}
      </div>
    </div>
  );
}

export function InitialRuntimeScreen() {
  return (
    <RuntimeScreenShell statusLabel="Ready">
      <div className="max-w-lg space-y-6 px-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <div className="h-12 w-12 rounded-full border border-white/15 bg-[radial-gradient(circle_at_center,_rgba(246,196,107,0.28),_transparent_62%)]" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            First magic moment
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
            The generated game module will boot here.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/65">
            Build a starter game to mount the canvas runtime in an isolated
            iframe.
          </p>
        </div>
      </div>
    </RuntimeScreenShell>
  );
}

export function LoadingRuntimeScreen({
  stage,
}: {
  stage: EditorGenerationStage;
}) {
  return (
    <RuntimeScreenShell statusLabel="Generating">
      <div className="w-full max-w-xl space-y-6 px-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <div className="h-12 w-12 rounded-full border-2 border-white/10 border-t-[#f6c46b] border-r-[#0f7f68] animate-spin" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            Generating your game
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
            <span>AI is building the starter</span>
            <span>{stage.progress}%</span>
          </div>
        </div>
      </div>
    </RuntimeScreenShell>
  );
}

export function RuntimeErrorScreen({
  message,
  onRegenerate,
}: {
  message: Extract<StarterProjectLoadState, { status: "error" }>["message"];
  onRegenerate: () => void;
}) {
  return (
    <RuntimeScreenShell statusLabel="Error">
      <div className="max-w-xl space-y-6 px-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#9d4b31]/30 bg-[#9d4b31]/10">
          <div className="h-12 w-12 rounded-full border-2 border-[#9d4b31]/35 border-t-[#f6c46b]" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f1b7a3]">
            Generation stopped
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
            The runtime could not be prepared.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/65">
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center justify-center border border-[#f1b7a3]/30 bg-[#9d4b31] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#81402b]"
        >
          Try again
        </button>
      </div>
    </RuntimeScreenShell>
  );
}

export function GameSpecValidationErrorScreen({
  message,
}: {
  message: string;
}) {
  return (
    <RuntimeScreenShell statusLabel="Validation stopped">
      <div className="max-w-2xl space-y-6 px-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#f1b7a3]/30 bg-[#9d4b31]/10">
          <div className="h-12 w-12 rounded-full border-2 border-[#9d4b31]/35 border-t-[#f6c46b]" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f1b7a3]">
            Game Spec validation failed
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
            The runtime was not started.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/65">
            {message}
          </p>
        </div>
      </div>
    </RuntimeScreenShell>
  );
}
