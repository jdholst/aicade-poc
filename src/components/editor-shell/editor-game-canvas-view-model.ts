import type { FirstPlayableValidationAttempt } from "@/game-spec";
import type { EditorGameCanvasSession } from "@/hooks/use-editor-session";

import {
  createFirstPlayableValidationFailureSurface,
  createGameSpecValidationFailureSurface,
  createSpecGenerationValidationFailureSurface,
  type ValidationFailureSurfaceViewModel,
} from "./editor-validation-failure-surface";
import {
  createCanvasRuntimeHostViewModel,
  createPhaserRuntimeHostViewModel,
  type EditorRuntimeHostViewModel,
  type EditorRuntimeTemplatePlan,
} from "./editor-runtime-template-plan";

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
      description: string;
      eyebrow: string;
      surfaceLabel: string;
      title: string;
      type: "initial";
    }
  | {
      message: string;
      type: "generation-error";
    }
  | {
      canRegenerate?: boolean;
      failure: ValidationFailureSurfaceViewModel;
      type: "phaser-validation-error";
    }
  | {
      failure: ValidationFailureSurfaceViewModel;
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
  runtimeTemplate: EditorRuntimeTemplatePlan;
};

const initialRuntimeSurface: Extract<
  EditorRuntimePrimarySurface,
  { type: "initial" }
> = {
  description:
    "Build from the prompt to create and mount the game runtime in an isolated sandbox.",
  eyebrow: "First magic moment",
  surfaceLabel: "Generated runtime",
  title: "The generated game will boot here.",
  type: "initial",
};

export function createEditorRuntimePanelViewModel({
  canvas,
  firstPlayableValidationAttempt = null,
  runtimeTemplate,
}: CreateEditorRuntimePanelViewModelInput): EditorRuntimePanelViewModel {
  const primarySurface = createEditorRuntimePrimarySurface({
    canvas,
    firstPlayableValidationAttempt,
    runtimeTemplate,
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
  runtimeTemplate,
}: CreateEditorRuntimePanelViewModelInput): EditorRuntimePrimarySurface {
  const { currentGenerationStage, gameResetNonce, loadState } = canvas;
  const firstPlayableValidationFailure =
    createFirstPlayableValidationFailureSurface(firstPlayableValidationAttempt);

  if (loadState.status === "loading") {
    return {
      stage: currentGenerationStage,
      type: "loading",
    };
  }

  if (loadState.status === "error") {
    if (loadState.validationFailure) {
      return {
        canRegenerate: true,
        failure: createSpecGenerationValidationFailureSurface({
          message: loadState.message,
          validationFailure: loadState.validationFailure,
        }),
        type: "phaser-validation-error",
      };
    }

    return {
      message: loadState.message,
      type: "generation-error",
    };
  }

  if (runtimeTemplate.type === "canvas") {
    if (loadState.status === "success" && loadState.source === "canvas-starter") {
      return {
        host: createCanvasRuntimeHostViewModel({
          gameResetNonce,
          pack: loadState.pack,
        }),
        type: "runtime-host",
      };
    }

    return {
      ...initialRuntimeSurface,
    };
  }

  if (runtimeTemplate.type === "phaser-pending-generation") {
    return {
      ...initialRuntimeSurface,
    };
  }

  if (runtimeTemplate.type === "phaser-invalid") {
    return {
      failure: createGameSpecValidationFailureSurface({
        issues: runtimeTemplate.issues,
        message: runtimeTemplate.message,
      }),
      type: "phaser-validation-error",
    };
  }

  if (firstPlayableValidationFailure) {
    return {
      failure: firstPlayableValidationFailure,
      type: "first-playable-validation-error",
    };
  }

  return {
    host: createPhaserRuntimeHostViewModel({
      gameResetNonce,
      runtimeTemplate,
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
