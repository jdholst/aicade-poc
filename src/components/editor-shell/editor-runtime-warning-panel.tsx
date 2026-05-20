import { useState } from "react";

import type { EditorGameCanvasSession } from "@/hooks/use-editor-session";

type RuntimeWarningPanelProps = {
  warnings: EditorGameCanvasSession["runtimeWarnings"];
};

export function RuntimeWarningPanel({ warnings }: RuntimeWarningPanelProps) {
  const [selectedWarningIndex, setSelectedWarningIndex] = useState(0);
  const visibleWarningIndex =
    warnings.length === 0
      ? 0
      : Math.min(selectedWarningIndex, warnings.length - 1);
  const warning = warnings[visibleWarningIndex];

  if (!warning) {
    return null;
  }

  const hasMultipleWarnings = warnings.length > 1;

  return (
    <div className="flex flex-col gap-3 border border-[#b7791f]/30 bg-[#fff7df] px-4 py-3 text-sm text-[#5a3a09] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a5b12]">
          <span>Mechanic warning</span>
          <span>
            Warning {visibleWarningIndex + 1} of {warnings.length}
          </span>
          <span>{warning.phase}</span>
        </div>
        <div className="mt-1 font-semibold text-[#3d2b08]">
          {warning.mechanicType} disabled
        </div>
        <p className="mt-1 text-sm leading-6 text-[#6b4810]">
          {warning.message}
        </p>
      </div>
      {hasMultipleWarnings ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous warning"
            onClick={() => {
              setSelectedWarningIndex((index) =>
                index <= 0 ? warnings.length - 1 : index - 1
              );
            }}
            className="inline-flex h-9 w-9 items-center justify-center border border-[#b7791f]/35 bg-white/45 text-sm font-semibold text-[#5a3a09] transition hover:bg-white"
          >
            {"<"}
          </button>
          <button
            type="button"
            aria-label="Next warning"
            onClick={() => {
              setSelectedWarningIndex((index) =>
                index >= warnings.length - 1 ? 0 : index + 1
              );
            }}
            className="inline-flex h-9 w-9 items-center justify-center border border-[#b7791f]/35 bg-white/45 text-sm font-semibold text-[#5a3a09] transition hover:bg-white"
          >
            {">"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
