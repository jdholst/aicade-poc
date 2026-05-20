export type RuntimeKind = "canvas2d" | "phaser";

export type RuntimeCommand =
  | { type: "game-focus" }
  | { type: "game-reload" }
  | { type: "game-resize"; viewport: RuntimeViewport }
  | { type: "game-pause"; paused: boolean };

export type RuntimeViewport = {
  width: number;
  height: number;
  scaling: "stretch_to_fill";
};

export type RuntimeIssue =
  | {
      type: "mechanic-disabled";
      severity: "warning";
      recoverable: true;
      mechanicId: string;
      mechanicType: string;
      phase: "install" | "update" | "dispose";
      message: string;
    }
  | {
      type: "runtime-error";
      severity: "error";
      recoverable: false;
      message: string;
    };

export type RuntimeEvent =
  | { type: "game-ready"; manifest?: unknown; viewport?: RuntimeViewport }
  | { type: "game-error"; issue: RuntimeIssue; message: string }
  | { type: "game-debug-event"; message: string; data?: unknown };

export type RuntimeMountDescriptor = {
  title: string;
  sandbox: "allow-scripts";
  srcDoc: string;
};

export type RuntimeAdapter<TArtifact> = {
  kind: RuntimeKind;
  createMountDescriptor: (artifact: TArtifact) => RuntimeMountDescriptor;
  parseEvent: (data: unknown) => RuntimeEvent | null;
};

type RuntimeCommandTarget = {
  postMessage: (command: RuntimeCommand, targetOrigin: string) => void;
};

type RuntimeIssueCandidate = Record<string, unknown>;
type RuntimeIssueParser = (issue: RuntimeIssueCandidate) => RuntimeIssue | null;

const runtimeIssueParsers = {
  "mechanic-disabled": parseMechanicDisabledIssue,
  "runtime-error": parseRuntimeErrorIssue,
} satisfies Record<RuntimeIssue["type"], RuntimeIssueParser>;

export function parseRuntimeEvent(data: unknown): RuntimeEvent | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const event = data as {
    data?: unknown;
    type?: unknown;
    manifest?: unknown;
    message?: unknown;
    issue?: unknown;
    viewport?: unknown;
  };

  if (event.type === "game-ready") {
    const runtimeEvent: RuntimeEvent = { type: "game-ready" };
    const viewport = parseRuntimeViewport(event.viewport);

    if (typeof event.manifest !== "undefined") {
      runtimeEvent.manifest = event.manifest;
    }

    if (viewport) {
      runtimeEvent.viewport = viewport;
    }

    return runtimeEvent;
  }

  if (event.type === "game-error") {
    const issue = parseRuntimeIssue(event.issue, event.message);

    return {
      type: "game-error",
      issue,
      message: issue.message,
    };
  }

  if (
    event.type === "game-debug-event" &&
    typeof event.message === "string"
  ) {
    const runtimeEvent: RuntimeEvent = {
      type: "game-debug-event",
      message: event.message,
    };

    if (typeof event.data !== "undefined") {
      runtimeEvent.data = event.data;
    }

    return runtimeEvent;
  }

  return null;
}

function parseRuntimeIssue(
  issue: unknown,
  fallbackMessage: unknown
): RuntimeIssue {
  if (!isRecord(issue) || typeof issue.type !== "string") {
    return createRuntimeErrorIssue(fallbackMessage);
  }

  const parser = isRuntimeIssueType(issue.type)
    ? runtimeIssueParsers[issue.type]
    : undefined;

  return parser?.(issue) ?? createRuntimeErrorIssue(fallbackMessage);
}

function parseMechanicDisabledIssue(
  issue: RuntimeIssueCandidate
): RuntimeIssue | null {
  const mechanicId = readString(issue, "mechanicId");
  const mechanicType = readString(issue, "mechanicType");
  const message = readString(issue, "message");
  const phase = issue.phase;

  if (
    issue.severity !== "warning" ||
    issue.recoverable !== true ||
    !mechanicId ||
    !mechanicType ||
    !message ||
    !isMechanicFailurePhase(phase)
  ) {
    return null;
  }

  return {
    type: "mechanic-disabled",
    severity: "warning",
    recoverable: true,
    mechanicId,
    mechanicType,
    phase,
    message,
  };
}

function parseRuntimeErrorIssue(
  issue: RuntimeIssueCandidate
): RuntimeIssue | null {
  const message = readString(issue, "message");

  if (
    issue.severity !== "error" ||
    issue.recoverable !== false ||
    !message
  ) {
    return null;
  }

  return createRuntimeErrorIssue(message);
}

function createRuntimeErrorIssue(message: unknown): RuntimeIssue {
  return {
    type: "runtime-error",
    severity: "error",
    recoverable: false,
    message: typeof message === "string" ? message : "Generated module crashed.",
  };
}

function isRuntimeIssueType(
  type: string
): type is keyof typeof runtimeIssueParsers {
  return type in runtimeIssueParsers;
}

function readString(
  record: RuntimeIssueCandidate,
  key: string
): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined;
}

function isRecord(value: unknown): value is RuntimeIssueCandidate {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMechanicFailurePhase(
  phase: unknown
): phase is Extract<RuntimeIssue, { type: "mechanic-disabled" }>["phase"] {
  return phase === "install" || phase === "update" || phase === "dispose";
}

export function postRuntimeCommand(
  target: RuntimeCommandTarget | null | undefined,
  command: RuntimeCommand
) {
  target?.postMessage(command, "*");
}

function parseRuntimeViewport(viewport: unknown): RuntimeViewport | undefined {
  if (!viewport || typeof viewport !== "object") {
    return undefined;
  }

  const candidate = viewport as {
    height?: unknown;
    scaling?: unknown;
    width?: unknown;
  };

  if (
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    candidate.scaling === "stretch_to_fill"
  ) {
    return {
      width: candidate.width,
      height: candidate.height,
      scaling: candidate.scaling,
    };
  }

  return undefined;
}
