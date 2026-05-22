import type { FirstPlayableValidationAttempt } from "@/game-spec";
import type { EditorGameCanvasSession } from "@/hooks/use-editor-session";
import type { EditorRuntimeMode } from "@/runtime/editor-runtime-mode";
import type {
  HandAuthoredPhaserTemplate,
  TopDownPhaserTemplateState,
} from "@/runtime/phaser";
import type { GeneratedGamePack } from "@/service/starter-project";

export type EditorRuntimeHostViewModel =
  | {
      key: string;
      template: HandAuthoredPhaserTemplate;
      type: "phaser";
    }
  | {
      key: string;
      pack: GeneratedGamePack;
      type: "canvas";
    };

export type EditorRuntimePanelViewModel = {
  canPauseRuntime: boolean;
  canResetRuntime: boolean;
  primarySurface: EditorRuntimePrimarySurface;
  secondarySurfaces: EditorRuntimeSecondarySurface[];
};

export type EditorRuntimePrimarySurface =
  | {
      stage: EditorGameCanvasSession["currentGenerationStage"];
      type: "loading";
    }
  | {
      type: "canvas-initial";
    }
  | {
      message: string;
      type: "generation-error";
    }
  | {
      message: string;
      type: "phaser-validation-error";
    }
  | {
      message: string;
      type: "first-playable-validation-error";
    }
  | {
      host: EditorRuntimeHostViewModel;
      type: "runtime-host";
    };

export type EditorRuntimeSecondarySurface =
  | {
      message: string;
      type: "runtime-error-banner";
    }
  | {
      type: "runtime-warning-panel";
      warnings: EditorGameCanvasSession["runtimeWarnings"];
    };

type CreateEditorRuntimePanelViewModelInput = {
  canvas: EditorGameCanvasSession;
  firstPlayableValidationAttempt?: FirstPlayableValidationAttempt | null;
  phaserTemplateState: TopDownPhaserTemplateState;
  runtimeMode: EditorRuntimeMode;
};

export function createEditorRuntimePanelViewModel({
  canvas,
  firstPlayableValidationAttempt = null,
  phaserTemplateState,
  runtimeMode,
}: CreateEditorRuntimePanelViewModelInput): EditorRuntimePanelViewModel {
  const primarySurface = createEditorRuntimePrimarySurface({
    canvas,
    firstPlayableValidationAttempt,
    phaserTemplateState,
    runtimeMode,
  });
  const hasMountedRuntime = primarySurface.type === "runtime-host";

  return {
    canPauseRuntime:
      hasMountedRuntime &&
      (canvas.gameStatus.state === "ready" ||
        canvas.gameStatus.state === "paused"),
    canResetRuntime:
      hasMountedRuntime &&
      (canvas.gameStatus.state === "ready" ||
        canvas.gameStatus.state === "paused" ||
        canvas.gameStatus.state === "error"),
    primarySurface,
    secondarySurfaces: createEditorRuntimeSecondarySurfaces({
      canvas,
      primarySurface,
    }),
  };
}

function createEditorRuntimePrimarySurface({
  canvas,
  firstPlayableValidationAttempt = null,
  phaserTemplateState,
  runtimeMode,
}: CreateEditorRuntimePanelViewModelInput): EditorRuntimePrimarySurface {
  const { currentGenerationStage, gameResetNonce, loadState } = canvas;
  const firstPlayableValidationErrorMessage =
    getFirstPlayableValidationErrorMessage(firstPlayableValidationAttempt);

  if (loadState.status === "loading") {
    return {
      stage: currentGenerationStage,
      type: "loading",
    };
  }

  if (loadState.status === "error") {
    return {
      message: loadState.message,
      type: "generation-error",
    };
  }

  if (runtimeMode === "canvas2d") {
    if (loadState.status === "success") {
      return {
        host: createCanvasRuntimeHostViewModel({
          gameResetNonce,
          loadState,
        }),
        type: "runtime-host",
      };
    }

    return {
      type: "canvas-initial",
    };
  }

  if (phaserTemplateState.status === "invalid") {
    return {
      message: phaserTemplateState.message,
      type: "phaser-validation-error",
    };
  }

  if (firstPlayableValidationErrorMessage) {
    return {
      message: firstPlayableValidationErrorMessage,
      type: "first-playable-validation-error",
    };
  }

  return {
    host: createPhaserRuntimeHostViewModel({
      gameResetNonce,
      phaserTemplateState,
    }),
    type: "runtime-host",
  };
}

function createEditorRuntimeSecondarySurfaces({
  canvas,
  primarySurface,
}: {
  canvas: EditorGameCanvasSession;
  primarySurface: EditorRuntimePrimarySurface;
}): EditorRuntimeSecondarySurface[] {
  if (primarySurface.type !== "runtime-host") {
    return [];
  }

  const secondarySurfaces: EditorRuntimeSecondarySurface[] = [];

  if (canvas.gameStatus.state === "error") {
    secondarySurfaces.push({
      message: canvas.gameStatus.message,
      type: "runtime-error-banner",
    });
  }

  if (canvas.runtimeWarnings.length > 0) {
    secondarySurfaces.push({
      type: "runtime-warning-panel",
      warnings: canvas.runtimeWarnings,
    });
  }

  return secondarySurfaces;
}

function getFirstPlayableValidationErrorMessage(
  attempt: FirstPlayableValidationAttempt | null
) {
  if (!attempt?.shouldBlockPlayable) {
    return null;
  }

  return (
    attempt.failureMessage ??
    "First-playable validation failed before the runtime could be marked playable."
  );
}

function createPhaserRuntimeHostViewModel({
  gameResetNonce,
  phaserTemplateState,
}: {
  gameResetNonce: number;
  phaserTemplateState: Extract<TopDownPhaserTemplateState, { status: "valid" }>;
}): EditorRuntimeHostViewModel {
  return {
    type: "phaser",
    key: `${phaserTemplateState.template.id}-${gameResetNonce}`,
    template: phaserTemplateState.template,
  };
}

function createCanvasRuntimeHostViewModel({
  gameResetNonce,
  loadState,
}: {
  gameResetNonce: number;
  loadState: Extract<
    EditorGameCanvasSession["loadState"],
    { status: "success" }
  >;
}): EditorRuntimeHostViewModel {
  return {
    type: "canvas",
    key: `${loadState.pack.manifest.title}-${gameResetNonce}`,
    pack: loadState.pack,
  };
}
