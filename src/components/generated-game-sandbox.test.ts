import { afterEach, describe, expect, it, vi } from "vitest";

import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";
import {
  GENERATED_GAME_FACTORY_NAME,
  GENERATED_GAME_REQUIRED_METHODS,
} from "@/service/starter-project/generated-game-contract";

import {
  createGeneratedGameSandboxDocument,
  focusGeneratedGameSandbox,
  postGeneratedGameSandboxCommand,
  scheduleGeneratedGameSandboxFocus,
} from "./generated-game-sandbox";

const pack: GeneratedGamePack = {
  project: {
    name: "Sandbox Protocol Test",
    summary: "A generated game pack for sandbox protocol tests.",
  },
  chatTranscript: [
    { role: "user", text: "make a sandbox protocol test" },
    { role: "assistant", text: "planning the sandbox protocol test" },
    { role: "assistant", text: "built the sandbox protocol test" },
  ],
  manifest: {
    title: "Sandbox Protocol Test",
    genre: "arcade",
    runtime: "canvas2d",
    editableSpecVersion: "1",
    viewport: {
      width: 960,
      height: 540,
      scaling: "stretch_to_fill",
    },
    capabilities: ["start", "update", "render"],
    controls: [
      {
        action: "move_left",
        label: "Move left",
        keys: ["ArrowLeft"],
        kind: "button",
      },
    ],
  },
  editableSpec: {},
  editorMetadata: {
    panels: [
      {
        title: "Runtime",
        items: [{ label: "Engine", value: "Canvas 2D" }],
      },
    ],
  },
  moduleSourceTs:
    "globalThis.createGameModule = function createGameModule() {};",
  moduleSourceJs:
    "globalThis.createGameModule = function createGameModule() {};",
};

describe("generated game sandbox commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("posts host commands to the sandbox window", () => {
    const target = {
      postMessage: vi.fn(),
    } as unknown as Window;

    postGeneratedGameSandboxCommand(target, { type: "game-reload" });

    expect(target.postMessage).toHaveBeenCalledWith(
      { type: "game-reload" },
      "*"
    );
  });

  it("ignores missing sandbox windows when posting commands", () => {
    expect(() => {
      postGeneratedGameSandboxCommand(null, { type: "game-focus" });
      postGeneratedGameSandboxCommand(undefined, { type: "game-focus" });
    }).not.toThrow();
  });

  it("focuses the iframe, focuses the child window, and posts game-focus", () => {
    const contentWindow = {
      focus: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as Window;
    const iframe = {
      contentWindow,
      focus: vi.fn(),
    } as unknown as HTMLIFrameElement;

    focusGeneratedGameSandbox(iframe);

    expect(iframe.focus).toHaveBeenCalled();
    expect(contentWindow.focus).toHaveBeenCalled();
    expect(contentWindow.postMessage).toHaveBeenCalledWith(
      { type: "game-focus" },
      "*"
    );
  });

  it("schedules immediate and follow-up sandbox focus attempts", () => {
    vi.useFakeTimers();
    const contentWindow = {
      focus: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as Window;
    const iframe = {
      contentWindow,
      focus: vi.fn(),
    } as unknown as HTMLIFrameElement;

    scheduleGeneratedGameSandboxFocus(iframe);

    vi.advanceTimersByTime(0);
    expect(contentWindow.postMessage).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(120);
    expect(iframe.focus).toHaveBeenCalledTimes(2);
    expect(contentWindow.focus).toHaveBeenCalledTimes(2);
    expect(contentWindow.postMessage).toHaveBeenCalledTimes(2);
  });

  it("allows scheduled focus attempts to be cancelled", () => {
    vi.useFakeTimers();
    const contentWindow = {
      focus: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as Window;
    const iframe = {
      contentWindow,
      focus: vi.fn(),
    } as unknown as HTMLIFrameElement;

    const cancel = scheduleGeneratedGameSandboxFocus(iframe);
    cancel();
    vi.runAllTimers();

    expect(iframe.focus).not.toHaveBeenCalled();
    expect(contentWindow.postMessage).not.toHaveBeenCalled();
  });
});

describe("generated game sandbox document", () => {
  it("serializes the editable spec, manifest, and generated source safely", () => {
    const document = createGeneratedGameSandboxDocument({
      ...pack,
      editableSpec: {
        player: "ship",
      },
      manifest: {
        ...pack.manifest,
        title: "Escaped Sandbox",
      },
      moduleSourceJs:
        'globalThis.createGameModule = function () { return "</script>\u2028\u2029"; };',
    });

    expect(document).toContain(
      'globalThis.__AICADE_SPEC__ = {"player":"ship"};'
    );
    expect(document).toContain('"title":"Escaped Sandbox"');
    expect(document).toContain("<\\/script>");
    expect(document).toContain("\\u2028");
    expect(document).toContain("\\u2029");
  });

  it("boots the configured generated game factory and enforces the contract", () => {
    const document = createGeneratedGameSandboxDocument(pack);

    expect(document).toContain(`globalThis.${GENERATED_GAME_FACTORY_NAME}`);
    expect(document).toContain(JSON.stringify(GENERATED_GAME_REQUIRED_METHODS));
    expect(document).toContain(
      `Generated module did not register ${GENERATED_GAME_FACTORY_NAME}.`
    );
    expect(document).toContain("Generated module is missing ");
  });

  it("notifies the host about ready and error runtime events", () => {
    const document = createGeneratedGameSandboxDocument(pack);

    expect(document).toContain('type: "game-error"');
    expect(document).toContain('notify("game-error"');
    expect(document).toContain('notify("game-ready"');
    expect(document).toContain("window.addEventListener(\"error\"");
    expect(document).toContain("window.addEventListener(\"unhandledrejection\"");
  });

  it("listens for the host runtime command protocol", () => {
    const document = createGeneratedGameSandboxDocument(pack);

    expect(document).toContain('event.data.type === "game-reload"');
    expect(document).toContain('event.data.type === "game-resize"');
    expect(document).toContain('event.data.type === "game-pause"');
    expect(document).toContain('event.data.type === "game-focus"');
    expect(document).toContain("applyHostViewport");
    expect(document).toContain("location.reload()");
    expect(document).toContain("setPaused(Boolean(event.data.paused))");
    expect(document).toContain("canvas.focus()");
  });

  it("applies only valid host viewport resize commands", () => {
    const document = createGeneratedGameSandboxDocument(pack);

    expect(document).toContain("function applyHostViewport(nextViewport)");
    expect(document).toContain('typeof nextViewport.width !== "number"');
    expect(document).toContain('typeof nextViewport.height !== "number"');
    expect(document).toContain(
      'nextViewport.scaling !== "stretch_to_fill"'
    );
    expect(document).toContain(
      "viewport.width = Math.max(1, Math.round(nextViewport.width));"
    );
    expect(document).toContain(
      "viewport.height = Math.max(1, Math.round(nextViewport.height));"
    );
    expect(document).toContain("resize();");
  });
});
