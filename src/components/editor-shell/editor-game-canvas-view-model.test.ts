import { describe, expect, it } from "vitest";

import type { FirstPlayableValidationAttempt } from "@/game-spec";
import type { EditorGameCanvasSession } from "@/hooks/use-editor-session";
import { topDownPhaserTemplate } from "@/runtime/phaser";
import type { GeneratedGamePack } from "@/service/starter-project";

import { createEditorRuntimePanelViewModel } from "./editor-game-canvas-view-model";
import type { EditorRuntimeTemplatePlan } from "./editor-runtime-template-plan";

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

const validRuntimeTemplate: EditorRuntimeTemplatePlan = {
  firstPlayableValidationSource: {
    gameSpec: topDownPhaserTemplate.gameSpec,
    runtimeCandidate: {
      runtimeDependencyScriptPaths:
        topDownPhaserTemplate.runtimeDependencyScriptPaths,
      runtimeKind: "phaser",
      runtimeScriptPath: topDownPhaserTemplate.runtimeScriptPath,
      templateId: topDownPhaserTemplate.gameSpec.template.id,
    },
    runtimeKind: "phaser",
  },
  sourceKey: topDownPhaserTemplate.id,
  template: topDownPhaserTemplate,
  type: "phaser-valid",
};

const invalidRuntimeTemplate: EditorRuntimeTemplatePlan = {
  firstPlayableValidationSource: null,
  issues: [
    {
      path: "mechanics.mechanic_player_movement.entityIds",
      message: 'Expected target role "player".',
    },
  ],
  message:
    'mechanics.mechanic_player_movement.entityIds: Expected target role "player".',
  type: "phaser-invalid",
};

const canvasRuntimeTemplate: EditorRuntimeTemplatePlan = {
  firstPlayableValidationSource: null,
  type: "canvas",
};

function createCanvasSession(
  overrides: Partial<EditorGameCanvasSession> = {}
): EditorGameCanvasSession {
  return {
    currentGenerationStage,
    gameResetNonce: 0,
    gameStatus: {
      state: "loading",
      message: "Ready to build project.",
    },
    generationSource: "phaser-fixture",
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
          message: "Runtime is running in the sandbox.",
        },
      }),
      firstPlayableValidationAttempt: createFirstPlayableValidationAttempt(),
      runtimeTemplate: validRuntimeTemplate,
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
        evidence: [
          {
            id: "evidence_basic_objective_presence",
            checkId: "basic_objective_presence",
            stage: "spec-validation",
            status: "failed",
            durationMs: 0,
            message:
              "Game Spec must include exactly one primary objective before runtime boot can be treated as playable.",
            issues: [
              {
                code: "missing_primary_objective",
                path: "gameSpec.objectives",
                message: "Expected exactly one primary objective.",
              },
            ],
            evidence: {
              primaryObjectiveCount: 0,
            },
          },
        ],
        failureMessage:
          "The Game Spec needs one primary objective before the runtime can be presented as playable.",
        shouldBlockPlayable: true,
        status: "failed",
      }),
      runtimeTemplate: validRuntimeTemplate,
    });

    expect(viewModel.primarySurface).toMatchObject({
      failure: {
        summary:
          "The Game Spec needs one primary objective before the runtime can be presented as playable.",
        debugReceipts: [
          {
            checkId: "basic_objective_presence",
            evidenceJson: '{\n  "primaryObjectiveCount": 0\n}',
            issueMessages: ["Expected exactly one primary objective."],
            message:
              "Game Spec must include exactly one primary objective before runtime boot can be treated as playable.",
            stage: "spec-validation",
            status: "failed",
          },
        ],
      },
      type: "first-playable-validation-error",
    });
    expect(viewModel.secondarySurfaces).toEqual([]);
    expect(viewModel.canResetRuntime).toBe(false);
  });

  it("routes runtime validation failures away from the playable host with receipt details", () => {
    const viewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "error",
          message: "Runtime did not report nonblank render output.",
        },
      }),
      firstPlayableValidationAttempt: createFirstPlayableValidationAttempt({
        evidence: [
          {
            id: "evidence_runtime_boot",
            checkId: "runtime_boot",
            stage: "runtime-boot",
            status: "passed",
            durationMs: 400,
            message: "Runtime booted and reported ready.",
          },
          {
            id: "evidence_nonblank_render",
            checkId: "nonblank_render",
            stage: "browser-check",
            status: "failed",
            durationMs: 700,
            message: "Runtime did not report nonblank render output.",
            issues: [
              {
                code: "blank_runtime_render",
                path: "runtime.render",
                message:
                  "Expected the runtime to report at least one visible render object.",
              },
            ],
          },
        ],
        failureMessage: "Runtime did not report nonblank render output.",
        shouldBlockPlayable: true,
        status: "failed",
      }),
      runtimeTemplate: validRuntimeTemplate,
    });

    expect(viewModel.primarySurface).toEqual({
      failure: {
        summary: "Runtime did not report nonblank render output.",
        debugReceipts: [
          {
            checkId: "nonblank_render",
            evidenceJson: null,
            issueMessages: [
              "Expected the runtime to report at least one visible render object.",
            ],
            message: "Runtime did not report nonblank render output.",
            stage: "browser-check",
            status: "failed",
          },
        ],
      },
      type: "first-playable-validation-error",
    });
    expect(viewModel.canPauseRuntime).toBe(false);
    expect(viewModel.canResetRuntime).toBe(false);
  });

  it("derives Canvas idle, success, and error surfaces", () => {
    const idleViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession(),
      runtimeTemplate: canvasRuntimeTemplate,
    });
    const successViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "ready",
          message: "Canvas runtime is ready.",
        },
        loadState: {
          status: "success",
          source: "canvas-starter",
          pack,
        },
      }),
      runtimeTemplate: canvasRuntimeTemplate,
    });
    const errorViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        loadState: {
          status: "error",
          message: "Generated game creation failed.",
        },
      }),
      runtimeTemplate: canvasRuntimeTemplate,
    });

    expect(idleViewModel.primarySurface).toEqual({
      description:
        "Build from the prompt to create and mount the game runtime in an isolated sandbox.",
      eyebrow: "First magic moment",
      surfaceLabel: "Generated runtime",
      title: "The generated game will boot here.",
      type: "initial",
    });
    expect(successViewModel.primarySurface).toMatchObject({
      host: {
        type: "canvas",
        key: "Canvas Override Test-0",
      },
      type: "runtime-host",
    });
    expect(errorViewModel.primarySurface).toEqual({
      failure: {
        debugReceipts: [
          {
            checkId: "generation_request",
            evidenceJson: null,
            issueMessages: [],
            message: "Generated game creation failed.",
            stage: "model_generation",
            status: "failed",
          },
        ],
        summary: "Generated game creation failed.",
      },
      type: "generation-error",
    });
    expect(successViewModel.canPauseRuntime).toBe(true);
    expect(errorViewModel.canResetRuntime).toBe(false);
  });

  it("uses the same initial runtime surface for Phaser prompt generation", () => {
    const viewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession(),
      runtimeTemplate: {
        firstPlayableValidationSource: null,
        type: "phaser-pending-generation",
      },
    });

    expect(viewModel.primarySurface).toEqual({
      description:
        "Build from the prompt to create and mount the game runtime in an isolated sandbox.",
      eyebrow: "First magic moment",
      surfaceLabel: "Generated runtime",
      title: "The generated game will boot here.",
      type: "initial",
    });
    expect(viewModel.canPauseRuntime).toBe(false);
    expect(viewModel.canResetRuntime).toBe(false);
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
      runtimeTemplate: validRuntimeTemplate,
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
      runtimeTemplate: invalidRuntimeTemplate,
    });

    expect(viewModel.primarySurface).toMatchObject({
      failure: {
        summary: invalidRuntimeTemplate.message,
        debugReceipts: [
          {
            checkId: "game_spec_validation",
            issueMessages: ['Expected target role "player".'],
            stage: "spec-validation",
            status: "failed",
          },
        ],
      },
      type: "phaser-validation-error",
    });
    expect(viewModel.secondarySurfaces).toEqual([]);
  });

  it("derives pause and reset affordances from mount and runtime status", () => {
    const readyViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "ready",
          message: "Runtime is running in the sandbox.",
        },
      }),
      runtimeTemplate: validRuntimeTemplate,
    });
    const pausedViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "paused",
          message: "Runtime is paused in the sandbox.",
        },
      }),
      runtimeTemplate: validRuntimeTemplate,
    });
    const errorViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "error",
          message: "The runtime crashed.",
        },
      }),
      runtimeTemplate: validRuntimeTemplate,
    });
    const unmountedViewModel = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession(),
      runtimeTemplate: invalidRuntimeTemplate,
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
          message: "Runtime is running in the sandbox.",
        },
        runtimeWarnings: [warning],
      }),
      runtimeTemplate: validRuntimeTemplate,
    });
    const hostWithError = createEditorRuntimePanelViewModel({
      canvas: createCanvasSession({
        gameStatus: {
          state: "error",
          message: "The runtime crashed.",
        },
      }),
      runtimeTemplate: validRuntimeTemplate,
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
      runtimeTemplate: validRuntimeTemplate,
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
