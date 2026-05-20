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
  hasMountedRuntime: boolean;
  host: EditorRuntimeHostViewModel | null;
  isLoading: boolean;
  phaserValidationErrorMessage: string | null;
  showCanvasInitial: boolean;
  showGenerationError: boolean;
  showPhaserValidationError: boolean;
  showRuntimeErrorBanner: boolean;
  showWarningPanel: boolean;
};

type CreateEditorRuntimePanelViewModelInput = {
  canvas: EditorGameCanvasSession;
  phaserTemplateState: TopDownPhaserTemplateState;
  runtimeMode: EditorRuntimeMode;
};

export function createEditorRuntimePanelViewModel({
  canvas,
  phaserTemplateState,
  runtimeMode,
}: CreateEditorRuntimePanelViewModelInput): EditorRuntimePanelViewModel {
  const { gameResetNonce, gameStatus, loadState, runtimeWarnings } = canvas;
  const isLoading = loadState.status === "loading";
  const shouldShowPhaserRuntime =
    !isLoading &&
    runtimeMode === "phaser" &&
    phaserTemplateState.status === "valid" &&
    (loadState.status === "idle" || loadState.status === "success");
  const shouldShowCanvasRuntime =
    !isLoading && runtimeMode === "canvas2d" && loadState.status === "success";
  const host = createRuntimeHostViewModel({
    gameResetNonce,
    loadState,
    phaserTemplateState,
    shouldShowCanvasRuntime,
    shouldShowPhaserRuntime,
  });
  const hasMountedRuntime = host !== null;

  return {
    canPauseRuntime:
      hasMountedRuntime &&
      (gameStatus.state === "ready" || gameStatus.state === "paused"),
    canResetRuntime:
      hasMountedRuntime &&
      (gameStatus.state === "ready" ||
        gameStatus.state === "paused" ||
        gameStatus.state === "error"),
    hasMountedRuntime,
    host,
    isLoading,
    phaserValidationErrorMessage:
      !isLoading &&
      runtimeMode === "phaser" &&
      phaserTemplateState.status === "invalid"
        ? phaserTemplateState.message
        : null,
    showCanvasInitial:
      !isLoading && runtimeMode === "canvas2d" && loadState.status === "idle",
    showGenerationError: !isLoading && loadState.status === "error",
    showPhaserValidationError:
      !isLoading &&
      runtimeMode === "phaser" &&
      phaserTemplateState.status === "invalid",
    showRuntimeErrorBanner: !isLoading && gameStatus.state === "error",
    showWarningPanel: !isLoading && runtimeWarnings.length > 0,
  };
}

function createRuntimeHostViewModel({
  gameResetNonce,
  loadState,
  phaserTemplateState,
  shouldShowCanvasRuntime,
  shouldShowPhaserRuntime,
}: {
  gameResetNonce: number;
  loadState: EditorGameCanvasSession["loadState"];
  phaserTemplateState: TopDownPhaserTemplateState;
  shouldShowCanvasRuntime: boolean;
  shouldShowPhaserRuntime: boolean;
}): EditorRuntimeHostViewModel | null {
  if (shouldShowPhaserRuntime && phaserTemplateState.status === "valid") {
    return {
      type: "phaser",
      key: `${phaserTemplateState.template.id}-${gameResetNonce}`,
      template: phaserTemplateState.template,
    };
  }

  if (shouldShowCanvasRuntime && loadState.status === "success") {
    return {
      type: "canvas",
      key: `${loadState.pack.manifest.title}-${gameResetNonce}`,
      pack: loadState.pack,
    };
  }

  return null;
}
