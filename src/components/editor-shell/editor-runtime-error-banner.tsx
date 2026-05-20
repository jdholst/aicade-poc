type RuntimeErrorBannerProps = {
  message: string;
  onRegenerate: () => void;
};

export function RuntimeErrorBanner({
  message,
  onRegenerate,
}: RuntimeErrorBannerProps) {
  return (
    <div className="flex flex-col gap-3 border border-[rgba(169,72,42,0.24)] bg-[rgba(255,243,236,0.92)] px-4 py-3 text-sm text-[#613128] sm:flex-row sm:items-center sm:justify-between">
      <div>Runtime error: {message}</div>
      <button
        type="button"
        onClick={onRegenerate}
        className="inline-flex items-center justify-center border border-[#9d4b31]/30 bg-[#9d4b31] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#81402b]"
      >
        Regenerate game
      </button>
    </div>
  );
}
