import type { FirstPlayableValidationAttempt } from "@/game-spec";
import type { EditorGameCanvasSession } from "@/hooks/use-editor-session";

import {
  createFirstPlayableFailureReceiptSurface,
  createGameSpecFailureReceiptSurface,
  createGenerationFailureReceiptSurface,
  type FailureReceiptSurfaceViewModel,
} from "./editor-failure-receipt";
import {
  createCanvasRuntimeHostViewModel,
  createPhaserRuntimeHostViewModel,
  type EditorRuntimeHostViewModel,
  type EditorRuntimeTemplatePlan,
} from "./editor-runtime-template-plan";

export type RuntimePresentationPlan = {
  controls: RuntimePresentationControls;
  primarySurface: RuntimePrimarySurface;
  secondarySurfaces: RuntimeSecondarySurface[];
};

export type RuntimePresentationControls = {
  canPauseRuntime: boolean;
  canResetRuntime: boolean;
};

export type RuntimePresentationAction = {
  label: string;
};

export type RuntimePresentationScreenCopy = {
  eyebrow: string;
  statusLabel: string;
  title: string;
};

export type RuntimeLoadingScreenCopy = {
  eyebrow: string;
  progressLabel: string;
  statusLabel: string;
};

export type RuntimePrimarySurface =
  | {
      screen: RuntimeLoadingScreenCopy;
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
      failure: FailureReceiptSurfaceViewModel;
      regenerateAction: RuntimePresentationAction;
      screen: RuntimePresentationScreenCopy;
      type: "generation-error";
    }
  | {
      failure: FailureReceiptSurfaceViewModel;
      regenerateAction?: RuntimePresentationAction;
      screen: RuntimePresentationScreenCopy;
      type: "phaser-validation-error";
    }
  | {
      failure: FailureReceiptSurfaceViewModel;
      regenerateAction: RuntimePresentationAction;
      resetAction: RuntimePresentationAction;
      screen: RuntimePresentationScreenCopy;
      type: "first-playable-validation-error";
    }
  | {
      host: EditorRuntimeHostViewModel;
      runFirstPlayableChecksOnReady: boolean;
      type: "runtime-host";
    };

export type RuntimeSecondarySurface =
  | {
      message: string;
      type: "runtime-error-banner";
    }
  | {
      type: "runtime-warning-panel";
      warnings: EditorGameCanvasSession["runtimeWarnings"];
    };

type CreateRuntimePresentationPlanInput = {
  canvas: EditorGameCanvasSession;
  firstPlayableValidationAttempt?: FirstPlayableValidationAttempt | null;
  runtimeTemplate: EditorRuntimeTemplatePlan;
};

const initialRuntimeSurface: Extract<RuntimePrimarySurface, { type: "initial" }> =
  {
    description:
      "Build from the prompt to create and mount the game runtime in an isolated sandbox.",
    eyebrow: "First magic moment",
    surfaceLabel: "Generated runtime",
    title: "The generated game will boot here.",
    type: "initial",
  };

const loadingScreen: RuntimeLoadingScreenCopy = {
  eyebrow: "Generating your game",
  progressLabel: "AI is building the project",
  statusLabel: "Generating",
};

const generationErrorScreen: RuntimePresentationScreenCopy = {
  eyebrow: "Generation stopped",
  statusLabel: "Generation stopped",
  title: "The runtime could not be prepared.",
};

const validationErrorScreen: RuntimePresentationScreenCopy = {
  eyebrow: "Game Spec validation failed",
  statusLabel: "Validation stopped",
  title: "The runtime was not started.",
};

const firstPlayableBlockedScreen: RuntimePresentationScreenCopy = {
  eyebrow: "Draft blocked",
  statusLabel: "Blocked",
  title: "This draft is not playable yet.",
};

const tryAgainAction: RuntimePresentationAction = {
  label: "Try again",
};

const startOverFromPromptAction: RuntimePresentationAction = {
  label: "Start over from prompt",
};

export function createRuntimePresentationPlan({
  canvas,
  firstPlayableValidationAttempt = null,
  runtimeTemplate,
}: CreateRuntimePresentationPlanInput): RuntimePresentationPlan {
  const primarySurface = createRuntimePrimarySurface({
    canvas,
    firstPlayableValidationAttempt,
    runtimeTemplate,
  });
  const hasMountedRuntime = primarySurface.type === "runtime-host";

  return {
    controls: {
      canPauseRuntime:
        hasMountedRuntime &&
        (canvas.gameStatus.state === "ready" ||
          canvas.gameStatus.state === "paused"),
      canResetRuntime:
        hasMountedRuntime &&
        (canvas.gameStatus.state === "ready" ||
          canvas.gameStatus.state === "paused" ||
          canvas.gameStatus.state === "error"),
    },
    primarySurface,
    secondarySurfaces: createRuntimeSecondarySurfaces({
      canvas,
      primarySurface,
    }),
  };
}

function createRuntimePrimarySurface({
  canvas,
  firstPlayableValidationAttempt = null,
  runtimeTemplate,
}: CreateRuntimePresentationPlanInput): RuntimePrimarySurface {
  const { currentGenerationStage, gameResetNonce, loadState } = canvas;
  const firstPlayableValidationFailure =
    createFirstPlayableFailureReceiptSurface(firstPlayableValidationAttempt);

  if (loadState.status === "loading") {
    return {
      screen: loadingScreen,
      stage: currentGenerationStage,
      type: "loading",
    };
  }

  if (loadState.status === "error") {
    const failure = createGenerationFailureReceiptSurface({
      generatedMechanicFailure: loadState.generatedMechanicFailure,
      message: loadState.message,
      validationFailure: loadState.validationFailure,
    });

    if (loadState.validationFailure) {
      return {
        failure,
        regenerateAction: tryAgainAction,
        screen: validationErrorScreen,
        type: "phaser-validation-error",
      };
    }

    return {
      failure,
      regenerateAction: tryAgainAction,
      screen: generationErrorScreen,
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
        runFirstPlayableChecksOnReady: false,
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
    const failure = createGameSpecFailureReceiptSurface({
      issues: runtimeTemplate.issues,
      message: runtimeTemplate.message,
    });

    if (runtimeTemplate.blockedPresentation === "draft-blocked") {
      return {
        failure: {
          debugReceipts: [
            {
              checkId: "game_spec_validation",
              evidenceJson:
                runtimeTemplate.issues.length > 0
                  ? JSON.stringify({ issues: runtimeTemplate.issues }, null, 2)
                  : null,
              issueMessages: runtimeTemplate.issues.map(
                (issue) => issue.message
              ),
              message:
                "Game Spec validation failed before first-playable validation could mount the runtime.",
              stage: "spec-validation",
              status: "failed",
            },
          ],
          summary: runtimeTemplate.message,
        },
        regenerateAction: startOverFromPromptAction,
        resetAction: tryAgainAction,
        screen: firstPlayableBlockedScreen,
        type: "first-playable-validation-error",
      };
    }

    return {
      failure,
      screen: validationErrorScreen,
      type: "phaser-validation-error",
    };
  }

  if (firstPlayableValidationFailure) {
    return {
      failure: firstPlayableValidationFailure,
      regenerateAction: startOverFromPromptAction,
      resetAction: tryAgainAction,
      screen: firstPlayableBlockedScreen,
      type: "first-playable-validation-error",
    };
  }

  return {
    host: createPhaserRuntimeHostViewModel({
      gameResetNonce,
      runtimeTemplate,
    }),
    runFirstPlayableChecksOnReady: runtimeTemplate.runFirstPlayableChecksOnReady,
    type: "runtime-host",
  };
}

function createRuntimeSecondarySurfaces({
  canvas,
  primarySurface,
}: {
  canvas: EditorGameCanvasSession;
  primarySurface: RuntimePrimarySurface;
}): RuntimeSecondarySurface[] {
  if (primarySurface.type !== "runtime-host") {
    return [];
  }

  const secondarySurfaces: RuntimeSecondarySurface[] = [];

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
