import type { GeneratedGameStatus } from "@/components/generated-game-host";

type EditorHeaderProps = {
  projectName: string;
  gameStatus: GeneratedGameStatus;
};

export function EditorHeader({ projectName, gameStatus }: EditorHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border border-[var(--line-strong)] bg-[rgba(255,249,242,0.82)] px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
          AI-cade editor
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.05em] sm:text-3xl">
          {projectName}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
        <span className="inline-flex items-center gap-2 border border-[var(--line)] px-3 py-2">
          <span
            className={`h-2 w-2 rounded-full ${
              gameStatus.state === "ready"
                ? "bg-[var(--accent)]"
                : gameStatus.state === "paused"
                  ? "bg-[#c79236]"
                  : gameStatus.state === "error"
                    ? "bg-[#9d4b31]"
                    : "bg-[#c79236]"
            }`}
          />
          {gameStatus.message}
        </span>
        <span className="border border-[var(--line)] px-3 py-2">
          Generated module POC
        </span>
      </div>
    </header>
  );
}