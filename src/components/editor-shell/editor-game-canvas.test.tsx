import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGamePackRepository,
  type GamePackStorageDriver,
  type StoredGamePackRecord,
} from "@/game-spec";
import { createValidatedGamePackFixture } from "@/game-spec/game-pack/testing/game-pack-fixtures";
import type {
  EditorGameCanvasActions,
  EditorGameCanvasSession,
} from "@/hooks/use-editor-session";
import { topDownPhaserTemplate } from "@/runtime/phaser";
import type { GeneratedGamePack } from "@/service/starter-project";

import { EditorGameCanvas } from "./editor-game-canvas";

const currentGenerationStage = {
  title: "Booting the sandbox",
  detail: "Finalizing the generated pack before mounting it.",
  progress: 72,
};

const pack: GeneratedGamePack = {
  project: {
    name: "Canvas Override Test",
    summary: "A generated canvas runtime for override tests.",
  },
  chatTranscript: [
    { role: "user", text: "make an override test" },
    { role: "assistant", text: "planning the override test" },
    { role: "assistant", text: "built the override test" },
  ],
  manifest: {
    title: "Canvas Override Test",
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

function createActions(
  overrides: Partial<EditorGameCanvasActions> = {}
): EditorGameCanvasActions {
  return {
    onGameStatusChange: vi.fn(),
    onRegenerate: vi.fn(),
    onReset: vi.fn(),
    onTogglePaused: vi.fn(),
    ...overrides,
  };
}

function createCanvasSession(
  overrides: Partial<EditorGameCanvasSession> = {}
): EditorGameCanvasSession {
  return {
    currentGenerationStage,
    gameResetNonce: 0,
    gameStatus: {
      state: "loading",
      message: "Ready to build starter game.",
    },
    isGamePaused: false,
    loadState: {
      status: "idle",
    },
    runtimeWarnings: [],
    ...overrides,
  };
}

describe("EditorGameCanvas", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/runtime/phaser");
    vi.restoreAllMocks();
  });

  it("mounts a valid hand-authored Phaser runtime before generation starts", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_TOP_DOWN_FIXTURE", "prism_relay_gauntlet");

    render(
      <EditorGameCanvas
        actions={createActions()}
        canvas={createCanvasSession()}
      />
    );

    expect(screen.getByTitle("Prism Relay Gauntlet")).toBeVisible();
    expect(screen.getByText("Phaser runtime")).toBeVisible();
    expect(
      screen.queryByText("The generated game module will boot here.")
    ).not.toBeInTheDocument();
  });

  it("shows a friendly blocked state when first-playable validation fails before boot", async () => {
    vi.resetModules();
    const onRegenerate = vi.fn();
    const onReset = vi.fn();
    vi.doMock("@/runtime/phaser", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/runtime/phaser")>();
      const gameSpec = {
        ...actual.topDownPhaserTemplate.gameSpec,
        objectives: actual.topDownPhaserTemplate.gameSpec.objectives.map(
          (objective) => ({
            ...objective,
            primary: false,
          })
        ),
      };

      return {
        ...actual,
        getTopDownPhaserTemplateState: () => ({
          status: "valid",
          template: {
            ...actual.topDownPhaserTemplate,
            gameSpec,
          },
        }),
      };
    });

    const { EditorGameCanvas: MockedEditorGameCanvas } = await import(
      "./editor-game-canvas"
    );

    render(
      <MockedEditorGameCanvas
        actions={createActions({ onRegenerate, onReset })}
        canvas={createCanvasSession()}
      />
    );

    expect(screen.getByText("Draft blocked")).toBeVisible();
    expect(screen.getByText("This draft is not playable yet.")).toBeVisible();
    expect(
      screen.getAllByText("Expected exactly one primary objective.")
    ).toHaveLength(2);
    expect(screen.queryByText("Phaser runtime")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Crystal Spec Chase")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Try again" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Start over from prompt" })
    );

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: /repair|fix automatically/i })
    ).not.toBeInTheDocument();
  });

  it("shows validation receipt details for a runtime first-playable failure", async () => {
    const onRegenerate = vi.fn();
    const onReset = vi.fn();

    render(
      <EditorGameCanvas
        actions={createActions({ onRegenerate, onReset })}
        canvas={createCanvasSession()}
      />
    );

    const iframe = screen.getByTitle<HTMLIFrameElement>("Crystal Spec Chase");

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "game-ready" },
          source: iframe.contentWindow,
        })
      );
      dispatchValidationEvidence(iframe, "nonblank_render", "failed");
    });

    await waitFor(() => {
      expect(screen.getByText("Draft blocked")).toBeVisible();
    });

    expect(screen.getByText("This draft is not playable yet.")).toBeVisible();
    expect(screen.queryByText("Phaser runtime")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Crystal Spec Chase")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Inspect validation details"));

    expect(screen.getByText("browser-check")).toBeVisible();
    expect(screen.getByText("nonblank_render")).toBeVisible();
    expect(
      screen.getByText("Runtime did not report nonblank render output.")
    ).toBeVisible();
    expect(
      screen.getAllByText(
        "Expected the runtime to report at least one visible render object."
      )
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Start over from prompt" })
    );

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("mounts the selected top-down Phaser fixture", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_TOP_DOWN_FIXTURE", "prism_relay_gauntlet");

    render(
      <EditorGameCanvas
        actions={createActions()}
        canvas={createCanvasSession()}
      />
    );

    expect(screen.getByTitle("Prism Relay Gauntlet")).toBeVisible();
    expect(screen.queryByTitle("Crystal Spec Chase")).not.toBeInTheDocument();
    expect(screen.getByText("Phaser runtime")).toBeVisible();
  });

  it("runs Phaser first-playable checks after the runtime reports ready", async () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_TOP_DOWN_FIXTURE", "prism_relay_gauntlet");

    render(
      <EditorGameCanvas
        actions={createActions()}
        canvas={createCanvasSession()}
      />
    );

    const iframe = screen.getByTitle<HTMLIFrameElement>("Prism Relay Gauntlet");
    const postMessage = vi
      .spyOn(iframe.contentWindow!, "postMessage")
      .mockImplementation(() => undefined);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "game-ready" },
          source: iframe.contentWindow,
        })
      );
    });

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        { type: "game-run-first-playable-checks" },
        "*"
      );
    });
  });

  it("saves a first validated Phaser Game Pack through the repository boundary", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());

    render(
      <EditorGameCanvas
        actions={createActions()}
        canvas={createCanvasSession()}
        gamePackRepository={repository}
      />
    );

    const iframe = screen.getByTitle<HTMLIFrameElement>("Crystal Spec Chase");

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "game-ready" },
          source: iframe.contentWindow,
        })
      );
      dispatchValidationEvidence(iframe, "nonblank_render");
      dispatchValidationEvidence(iframe, "player_visible");
      dispatchValidationEvidence(iframe, "input_response");
    });

    await waitFor(async () => {
      const savedGamePack = await repository.load(
        "game_pack_crystal_spec_chase"
      );

      expect(savedGamePack).toMatchObject({
        builds: [
          expect.objectContaining({
            id: "build_initial_playable",
            checkpointId: "checkpoint_initial_playable",
          }),
        ],
        checkpoints: [
          expect.objectContaining({
            id: "checkpoint_initial_playable",
            buildId: "build_initial_playable",
          }),
        ],
        validationEvidence: expect.arrayContaining([
          expect.objectContaining({
            id: "evidence_runtime_boot",
          }),
          expect.objectContaining({
            id: "evidence_nonblank_render",
          }),
        ]),
      });
    });
  });

  it("remounts the Phaser runtime from a saved Game Pack after repository load", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());
    const restoredGameSpec = {
      ...topDownPhaserTemplate.gameSpec,
      title: "Restored Crystal Checkpoint",
    };

    await repository.save(
      createValidatedGamePackFixture({
        id: "game_pack_crystal_spec_chase",
        gameSpec: restoredGameSpec,
        title: restoredGameSpec.title,
      })
    );

    render(
      <EditorGameCanvas
        actions={createActions()}
        canvas={createCanvasSession()}
        gamePackRepository={repository}
      />
    );

    await waitFor(() => {
      expect(screen.getByTitle("Restored Crystal Checkpoint")).toBeVisible();
    });
    expect(screen.getByText("Phaser runtime")).toBeVisible();
  });

  it("keeps the Phaser boot listener stable while the editor records loading state", async () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_TOP_DOWN_FIXTURE", "prism_relay_gauntlet");

    const actions = createActions();
    const canvas = createCanvasSession();
    const { rerender } = render(
      <EditorGameCanvas actions={actions} canvas={canvas} />
    );

    await waitFor(() => {
      expect(actions.onGameStatusChange).toHaveBeenCalledWith({
        state: "loading",
      });
    });

    expect(actions.onGameStatusChange).toHaveBeenCalledTimes(1);

    rerender(
      <EditorGameCanvas
        actions={actions}
        canvas={createCanvasSession({
          gameStatus: {
            state: "loading",
            message: "Booting Phaser runtime...",
          },
        })}
      />
    );

    expect(actions.onGameStatusChange).toHaveBeenCalledTimes(1);
  });

  it("shows the Canvas initial runtime screen when the runtime override is canvas2d", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_EDITOR_RUNTIME", "canvas2d");

    render(
      <EditorGameCanvas
        actions={createActions()}
        canvas={createCanvasSession()}
      />
    );

    expect(
      screen.getByText("The generated game module will boot here.")
    ).toBeVisible();
    expect(
      screen.getByText(
        "Build a starter game to mount the canvas runtime in an isolated iframe."
      )
    ).toBeVisible();
    expect(screen.getByText("Ready")).toBeVisible();
    expect(screen.getByText("Runtime controls")).toBeVisible();
    expect(screen.getByRole("button", { name: "Pause game" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset game" })).toBeDisabled();
  });

  it("mounts the generated Canvas host when the runtime override succeeds", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_EDITOR_RUNTIME", "canvas2d");

    render(
      <EditorGameCanvas
        actions={createActions()}
        canvas={createCanvasSession({
          loadState: {
            status: "success",
            pack,
          },
        })}
      />
    );

    expect(screen.getByTitle("Canvas Override Test")).toBeVisible();
    expect(screen.getByText("Generated canvas")).toBeVisible();
  });

  it("enables runtime controls when the runtime is ready", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_TOP_DOWN_FIXTURE", "prism_relay_gauntlet");

    const onReset = vi.fn();
    const onTogglePaused = vi.fn();

    render(
      <EditorGameCanvas
        actions={createActions({ onReset, onTogglePaused })}
        canvas={createCanvasSession({
          gameStatus: {
            state: "ready",
            message: "Phaser runtime is running in the sandbox.",
          },
        })}
      />
    );

    const pauseButton = screen.getByRole("button", { name: "Pause game" });
    const resetButton = screen.getByRole("button", { name: "Reset game" });

    expect(pauseButton).toBeEnabled();
    expect(resetButton).toBeEnabled();

    fireEvent.click(pauseButton);
    fireEvent.click(resetButton);

    expect(onTogglePaused).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("keeps reset available when a mounted runtime reports an error", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_TOP_DOWN_FIXTURE", "prism_relay_gauntlet");

    const onReset = vi.fn();
    const onTogglePaused = vi.fn();

    render(
      <EditorGameCanvas
        actions={createActions({ onReset, onTogglePaused })}
        canvas={createCanvasSession({
          gameStatus: {
            state: "error",
            message: "The runtime crashed.",
          },
        })}
      />
    );

    const pauseButton = screen.getByRole("button", { name: "Pause game" });
    const resetButton = screen.getByRole("button", { name: "Reset game" });

    expect(screen.getByText("Runtime error: The runtime crashed.")).toBeVisible();
    expect(pauseButton).toBeDisabled();
    expect(resetButton).toBeEnabled();

    fireEvent.click(pauseButton);
    fireEvent.click(resetButton);

    expect(onTogglePaused).not.toHaveBeenCalled();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("shows recoverable runtime warnings without blocking controls", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_TOP_DOWN_FIXTURE", "prism_relay_gauntlet");

    const onReset = vi.fn();
    const onTogglePaused = vi.fn();

    render(
      <EditorGameCanvas
        actions={createActions({ onReset, onTogglePaused })}
        canvas={createCanvasSession({
          gameStatus: {
            state: "ready",
            message: "Phaser runtime is running in the sandbox.",
          },
          runtimeWarnings: [
            {
              type: "mechanic-disabled",
              severity: "warning",
              recoverable: true,
              mechanicId: "mechanic_player_movement",
              mechanicType: "player_movement",
              phase: "install",
              message:
                "Mechanic mechanic_player_movement install failed: Keyboard setup failed",
            },
          ],
        })}
      />
    );

    const pauseButton = screen.getByRole("button", { name: "Pause game" });
    const resetButton = screen.getByRole("button", { name: "Reset game" });

    expect(screen.getByText("Mechanic warning")).toBeVisible();
    expect(screen.getByText("Warning 1 of 1")).toBeVisible();
    expect(screen.getByText("player_movement disabled")).toBeVisible();
    expect(screen.getByText("install")).toBeVisible();
    expect(
      screen.getByText(
        "Mechanic mechanic_player_movement install failed: Keyboard setup failed"
      )
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Previous warning" })
    ).not.toBeInTheDocument();
    expect(pauseButton).toBeEnabled();
    expect(resetButton).toBeEnabled();

    fireEvent.click(pauseButton);
    fireEvent.click(resetButton);

    expect(onTogglePaused).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("lets users cycle through multiple recoverable runtime warnings", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_TOP_DOWN_FIXTURE", "prism_relay_gauntlet");

    render(
      <EditorGameCanvas
        actions={createActions()}
        canvas={createCanvasSession({
          gameStatus: {
            state: "ready",
            message: "Phaser runtime is running in the sandbox.",
          },
          runtimeWarnings: [
            {
              type: "mechanic-disabled",
              severity: "warning",
              recoverable: true,
              mechanicId: "mechanic_player_movement",
              mechanicType: "player_movement",
              phase: "install",
              message: "Movement failed.",
            },
            {
              type: "mechanic-disabled",
              severity: "warning",
              recoverable: true,
              mechanicId: "mechanic_chaser_enemy",
              mechanicType: "enemy_chase",
              phase: "update",
              message: "Chase failed.",
            },
          ],
        })}
      />
    );

    expect(screen.getByText("Warning 1 of 2")).toBeVisible();
    expect(screen.getByText("player_movement disabled")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Next warning" }));

    expect(screen.getByText("Warning 2 of 2")).toBeVisible();
    expect(screen.getByText("enemy_chase disabled")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Previous warning" }));

    expect(screen.getByText("Warning 1 of 2")).toBeVisible();
    expect(screen.getByText("player_movement disabled")).toBeVisible();
  });

  it("shows the loading runtime screen while generation is running", () => {
    render(
      <EditorGameCanvas
        actions={createActions()}
        canvas={createCanvasSession({
          loadState: {
            status: "loading",
          },
        })}
      />
    );

    expect(screen.getByText("Generating your game")).toBeVisible();
    expect(screen.getByText("Booting the sandbox")).toBeVisible();
    expect(screen.getByText("72%")).toBeVisible();
    expect(screen.getByText("Runtime controls")).toBeVisible();
    expect(screen.getByRole("button", { name: "Pause game" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset game" })).toBeDisabled();
  });

  it("shows an error runtime screen and retry action when generation fails", () => {
    const onRegenerate = vi.fn();

    render(
      <EditorGameCanvas
        actions={createActions({ onRegenerate })}
        canvas={createCanvasSession({
          loadState: {
            status: "error",
            message: "Generated game creation failed.",
          },
        })}
      />
    );

    expect(
      screen.getByText("The runtime could not be prepared.")
    ).toBeVisible();
    expect(screen.getByText("Generated game creation failed.")).toBeVisible();
    expect(screen.getByText("Runtime controls")).toBeVisible();
    expect(screen.getByRole("button", { name: "Pause game" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset game" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("shows Phaser Game Spec validation errors without crashing the editor", async () => {
    vi.resetModules();
    vi.doMock("@/runtime/phaser", () => ({
      getTopDownPhaserTemplateState: () => ({
        status: "invalid",
        message:
          'mechanics.mechanic_player_movement.targetIds: Expected target role "player".',
        issues: [
          {
            path: "mechanics.mechanic_player_movement.targetIds",
            message: 'Expected target role "player".',
          },
        ],
      }),
      phaserRuntimeAdapter: {},
    }));

    const { EditorGameCanvas: MockedEditorGameCanvas } = await import(
      "./editor-game-canvas"
    );

    render(
      <MockedEditorGameCanvas
        actions={createActions()}
        canvas={createCanvasSession()}
      />
    );

    expect(screen.getByText("Game Spec validation failed")).toBeVisible();
    expect(screen.getByText("The runtime was not started.")).toBeVisible();
    expect(
      screen.getByText(
        'mechanics.mechanic_player_movement.targetIds: Expected target role "player".'
      )
    ).toBeVisible();
    expect(screen.queryByText("Phaser runtime")).not.toBeInTheDocument();
  });
});

function dispatchValidationEvidence(
  iframe: HTMLIFrameElement,
  checkId: "input_response" | "nonblank_render" | "player_visible",
  status: "failed" | "passed" = "passed"
) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        type: "game-validation-evidence",
        data: {
          checkId,
          status,
        },
      },
      source: iframe.contentWindow,
    })
  );
}

class MemoryGamePackStorage implements GamePackStorageDriver {
  readonly records = new Map<string, StoredGamePackRecord>();

  async put(record: StoredGamePackRecord) {
    this.records.set(record.id, cloneRecord(record));
  }

  async get(gamePackId: string) {
    const record = this.records.get(gamePackId);

    return record ? cloneRecord(record) : null;
  }

  async getAll() {
    return Array.from(this.records.values()).map(cloneRecord);
  }
}

function cloneRecord(record: StoredGamePackRecord): StoredGamePackRecord {
  return JSON.parse(JSON.stringify(record)) as StoredGamePackRecord;
}
