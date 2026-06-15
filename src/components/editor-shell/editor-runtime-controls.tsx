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
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] sm:tracking-[0.18em]">
          Runtime controls
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Reset restarts the runtime without regenerating.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <button
          type="button"
          disabled={!canPauseRuntime}
          onClick={onTogglePaused}
          className="inline-flex w-full items-center justify-center border border-[var(--line)] bg-[rgba(21,18,14,0.08)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--muted)] disabled:opacity-55 sm:w-auto sm:tracking-[0.18em]"
        >
          {isGamePaused ? "Resume game" : "Pause game"}
        </button>
        <button
          type="button"
          disabled={!canResetRuntime}
          onClick={onReset}
          className="inline-flex w-full items-center justify-center border border-[var(--line)] bg-[var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[rgba(21,18,14,0.08)] disabled:text-[var(--muted)] disabled:opacity-55 sm:w-auto sm:tracking-[0.18em]"
        >
          Reset game
        </button>
      </div>
    </div>
  );
}
