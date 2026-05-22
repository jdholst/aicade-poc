import { describe, expect, it } from "vitest";

import type { FirstPlayableValidationAttempt } from "@/game-spec";
import type { EditorGameCanvasSession } from "@/hooks/use-editor-session";
import {
  topDownPhaserTemplate,
  type TopDownPhaserTemplateState,
} from "@/runtime/phaser";
import type { GeneratedGamePack } from "@/service/starter-project";

import { createEditorRuntimePanelViewModel } from "./editor-game-canvas-view-model";

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

const validPhaserState: TopDownPhaserTemplateState = {
  status: "valid",
  template: topDownPhaserTemplate,
};

const invalidPhaserState: TopDownPhaserTemplateState = {
  status: "invalid",
  issues: [
    {
      path: "mechanics.mechanic_player_movement.targetIds",
      message: 'Expected target role "player".',
    },
  ],
  message:
    'mechanics.mechanic_player_movement.targetIds: Expected target role "player".',
};

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

function createFirstPlayableValidationAttempt(
  overrides: Partial<FirstPlayableValidationAttempt> = {}
): FirstPlayableValidationAttempt {
  return {
    evidence: [],
    gamePackId: "game_pack_crystal_spec_chase",
    shouldBlockPlayable: false,
    startedAt: "2026-05-21T13:00:00.000Z",
    status: "running",
    ...overrides,
  };
}

describe("createEditorRuntimePanelViewModel", () => {
  it("mounts the valid Phaser fixture before generation starts", () => {
    const viewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "ready",
          message: "Phaser runtime is running in the sandbox.",
        },
      }),
      firstPlayableValidationAttempt: createFirstPlayableValidationAttempt(),
      phaserTemplateState: validPhaserState,
      runtimeMode: "phaser",
    });

    expect(viewModel.primarySurface).toMatchObject({
      host: {
        type: "phaser",
        key: `${topDownPhaserTemplate.id}-0`,
      },
      type: "runtime-host",
    });
    expect(viewModel.secondarySurfaces).toEqual([]);
    expect(viewModel.canPauseRuntime).toBe(true);
    expect(viewModel.canResetRuntime).toBe(true);
  });

  it("blocks the Phaser host when first-playable validation fails", () => {
    const viewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "error",
          message:
            "The Game Spec needs one primary objective before the runtime can be presented as playable.",
        },
      }),
      firstPlayableValidationAttempt: createFirstPlayableValidationAttempt({
        failureMessage:
          "The Game Spec needs one primary objective before the runtime can be presented as playable.",
        shouldBlockPlayable: true,
        status: "failed",
      }),
      phaserTemplateState: validPhaserState,
      runtimeMode: "phaser",
    });

    expect(viewModel.primarySurface).toEqual({
      message:
        "The Game Spec needs one primary objective before the runtime can be presented as playable.",
      type: "first-playable-validation-error",
    });
    expect(viewModel.secondarySurfaces).toEqual([]);
    expect(viewModel.canResetRuntime).toBe(false);
  });

  it("derives Canvas idle, success, and error surfaces", () => {
    const idleViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession(),
      phaserTemplateState: validPhaserState,
      runtimeMode: "canvas2d",
    });
    const successViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "ready",
          message: "Canvas runtime is ready.",
        },
        loadState: {
          status: "success",
          pack,
        },
      }),
      phaserTemplateState: validPhaserState,
      runtimeMode: "canvas2d",
    });
    const errorViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        loadState: {
          status: "error",
          message: "Generated game creation failed.",
        },
      }),
      phaserTemplateState: validPhaserState,
      runtimeMode: "canvas2d",
    });

    expect(idleViewModel.primarySurface).toEqual({
      type: "canvas-initial",
    });
    expect(successViewModel.primarySurface).toMatchObject({
      host: {
        type: "canvas",
        key: "Canvas Override Test-0",
      },
      type: "runtime-host",
    });
    expect(errorViewModel.primarySurface).toEqual({
      message: "Generated game creation failed.",
      type: "generation-error",
    });
    expect(successViewModel.canPauseRuntime).toBe(true);
    expect(errorViewModel.canResetRuntime).toBe(false);
  });

  it("masks runtime surfaces while generation is loading", () => {
    const viewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "error",
          message: "The runtime crashed.",
        },
        loadState: {
          status: "loading",
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
        ],
      }),
      phaserTemplateState: validPhaserState,
      runtimeMode: "phaser",
    });

    expect(viewModel.primarySurface).toEqual({
      stage: currentGenerationStage,
      type: "loading",
    });
    expect(viewModel.secondarySurfaces).toEqual([]);
  });

  it("derives Phaser validation error state", () => {
    const viewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession(),
      phaserTemplateState: invalidPhaserState,
      runtimeMode: "phaser",
    });

    expect(viewModel.primarySurface).toEqual({
      message: invalidPhaserState.message,
      type: "phaser-validation-error",
    });
    expect(viewModel.secondarySurfaces).toEqual([]);
  });

  it("derives pause and reset affordances from mount and runtime status", () => {
    const readyViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "ready",
          message: "Phaser runtime is running in the sandbox.",
        },
      }),
      phaserTemplateState: validPhaserState,
      runtimeMode: "phaser",
    });
    const pausedViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "paused",
          message: "Phaser runtime is paused in the sandbox.",
        },
      }),
      phaserTemplateState: validPhaserState,
      runtimeMode: "phaser",
    });
    const errorViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "error",
          message: "The runtime crashed.",
        },
      }),
      phaserTemplateState: validPhaserState,
      runtimeMode: "phaser",
    });
    const unmountedViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession(),
      phaserTemplateState: invalidPhaserState,
      runtimeMode: "phaser",
    });

    expect(readyViewModel.canPauseRuntime).toBe(true);
    expect(readyViewModel.canResetRuntime).toBe(true);
    expect(pausedViewModel.canPauseRuntime).toBe(true);
    expect(pausedViewModel.canResetRuntime).toBe(true);
    expect(errorViewModel.canPauseRuntime).toBe(false);
    expect(errorViewModel.canResetRuntime).toBe(true);
    expect(unmountedViewModel.canPauseRuntime).toBe(false);
    expect(unmountedViewModel.canResetRuntime).toBe(false);
  });

  it("keeps secondary runtime panels attached only to a mounted host surface", () => {
    const warning = {
      type: "mechanic-disabled" as const,
      severity: "warning" as const,
      recoverable: true as const,
      mechanicId: "mechanic_player_movement",
      mechanicType: "player_movement",
      phase: "install" as const,
      message: "Movement failed.",
    };
    const hostWithWarnings = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "ready",
          message: "Phaser runtime is running in the sandbox.",
        },
        runtimeWarnings: [warning],
      }),
      phaserTemplateState: validPhaserState,
      runtimeMode: "phaser",
    });
    const hostWithError = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "error",
          message: "The runtime crashed.",
        },
      }),
      phaserTemplateState: validPhaserState,
      runtimeMode: "phaser",
    });
    const validationFailure = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "error",
          message:
            "The Game Spec needs one primary objective before the runtime can be presented as playable.",
        },
        runtimeWarnings: [warning],
      }),
      firstPlayableValidationAttempt: createFirstPlayableValidationAttempt({
        failureMessage:
          "The Game Spec needs one primary objective before the runtime can be presented as playable.",
        shouldBlockPlayable: true,
        status: "failed",
      }),
      phaserTemplateState: validPhaserState,
      runtimeMode: "phaser",
    });

    expect(hostWithWarnings.secondarySurfaces).toEqual([
      {
        type: "runtime-warning-panel",
        warnings: [warning],
      },
    ]);
    expect(hostWithError.secondarySurfaces).toEqual([
      {
        message: "The runtime crashed.",
        type: "runtime-error-banner",
      },
    ]);
    expect(validationFailure.primarySurface.type).toBe(
      "first-playable-validation-error"
    );
    expect(validationFailure.secondarySurfaces).toEqual([]);
  });
});
