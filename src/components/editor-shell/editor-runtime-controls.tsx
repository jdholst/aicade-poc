type RuntimeControlsProps = {
  canPauseRuntime: boolean;
  canResetRuntime: boolean;
  isGamePaused: boolean;
  onReset: () => void;
  onTogglePaused: () => void;
};

export function RuntimeControls({
  canPauseRuntime,
  canResetRuntime,
  isGamePaused,
  onReset,
  onTogglePaused,
}: RuntimeControlsProps) {
  return (
    <div className="flex flex-col gap-3 border border-[var(--line-strong)] bg-[rgba(255,249,242,0.82)] px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Runtime controls
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Reset restarts the runtime without regenerating.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <button
          type="button"
          disabled={!canPauseRuntime}
          onClick={onTogglePaused}
          className="inline-flex items-center justify-center border border-[var(--line)] bg-[rgba(21,18,14,0.08)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--muted)] disabled:opacity-55"
        >
          {isGamePaused ? "Resume game" : "Pause game"}
        </button>
        <button
          type="button"
          disabled={!canResetRuntime}
          onClick={onReset}
          className="inline-flex items-center justify-center border border-[var(--line)] bg-[var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[rgba(21,18,14,0.08)] disabled:text-[var(--muted)] disabled:opacity-55"
        >
          Reset game
        </button>
      </div>
    </div>
  );
}
