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

export type RuntimeEvent =
  | { type: "game-ready"; manifest?: unknown; viewport?: RuntimeViewport }
  | { type: "game-error"; message: string }
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

export function parseRuntimeEvent(data: unknown): RuntimeEvent | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const event = data as {
    data?: unknown;
    type?: unknown;
    manifest?: unknown;
    message?: unknown;
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
    return {
      type: "game-error",
      message:
        typeof event.message === "string"
          ? event.message
          : "Generated module crashed.",
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
