import type {
  GamePack,
  GameSpecValidationIssue,
  PreparedRestoredGeneratedMechanicProject,
} from "@/game-spec";
import type {
  EditorGenerationSource,
  EditorRuntimeMode,
} from "@/runtime/editor-runtime-mode";
import type { ActiveGeneratedSpecState } from "@/hooks/use-editor-session";
import { getEditorRuntimeMode } from "@/runtime/editor-runtime-mode";
import {
  getTopDownPhaserTemplateState,
  type HandAuthoredPhaserTemplate,
  type TopDownPhaserTemplateState,
} from "@/runtime/phaser";
import {
  createPlayableDraftSource,
  type PlayableDraftPersistencePolicy,
  type PlayableDraftReadyPolicy,
  type PlayableDraftValidationSource,
} from "@/runtime/playable-draft-source";
import type { GeneratedGamePack } from "@/service/starter-project";

export type EditorRuntimeHostViewModel =
  | {
      key: string;
      template: HandAuthoredPhaserTemplate;
      generatedMechanicProject?: PreparedRestoredGeneratedMechanicProject;
      type: "phaser";
    }
  | {
      key: string;
      pack: GeneratedGamePack;
      type: "canvas";
    };

export type FirstPlayableValidationSource = PlayableDraftValidationSource;

export type EditorRuntimeTemplatePlan =
  | {
      firstPlayableValidationSource: null;
      type: "canvas";
    }
  | {
      firstPlayableValidationSource: null;
      type: "phaser-pending-generation";
    }
  | {
      blockedPresentation: "draft-blocked" | "game-spec-validation";
      firstPlayableValidationSource: null;
      issues: GameSpecValidationIssue[];
      message: string;
      type: "phaser-invalid";
    }
  | {
      firstPlayableValidationSource: FirstPlayableValidationSource;
      persistencePolicy: PlayableDraftPersistencePolicy;
      readyPolicy: PlayableDraftReadyPolicy;
      runFirstPlayableChecksOnReady: true;
      sourceKey: string;
      template: HandAuthoredPhaserTemplate;
      generatedMechanicProject?: PreparedRestoredGeneratedMechanicProject;
      type: "phaser-valid";
    };

type CreateEditorRuntimeTemplatePlanInput = {
  activeGeneratedSpec?: ActiveGeneratedSpecState | null;
  generationSource?: EditorGenerationSource;
  phaserTemplateState?: TopDownPhaserTemplateState;
  restoredGamePack?: GamePack | null;
  runtimeMode?: EditorRuntimeMode;
};

export function createEditorRuntimeTemplatePlan({
  activeGeneratedSpec = null,
  generationSource,
  phaserTemplateState = getTopDownPhaserTemplateState(),
  restoredGamePack = null,
  runtimeMode = getEditorRuntimeMode(),
}: CreateEditorRuntimeTemplatePlanInput = {}): EditorRuntimeTemplatePlan {
  const playableDraftSource = createPlayableDraftSource({
    generatedSpecDraft: activeGeneratedSpec,
    generationSource,
    phaserTemplateState,
    restoredGamePack,
    runtimeMode,
  });

  if (playableDraftSource.type === "canvas") {
    return {
      firstPlayableValidationSource: null,
      type: "canvas",
    };
  }

  if (playableDraftSource.type === "pending-generation") {
    return {
      firstPlayableValidationSource: null,
      type: "phaser-pending-generation",
    };
  }

  if (playableDraftSource.type === "blocked") {
    return {
      blockedPresentation: activeGeneratedSpec
        ? "draft-blocked"
        : "game-spec-validation",
      firstPlayableValidationSource: null,
      issues: playableDraftSource.issues,
      message: playableDraftSource.message,
      type: "phaser-invalid",
    };
  }

  return {
    firstPlayableValidationSource: playableDraftSource.validationSource,
    persistencePolicy: playableDraftSource.persistencePolicy,
    readyPolicy: playableDraftSource.readyPolicy,
    runFirstPlayableChecksOnReady:
      playableDraftSource.runFirstPlayableChecksOnReady,
    sourceKey: playableDraftSource.sourceKey,
    template: playableDraftSource.template,
    ...(playableDraftSource.generatedMechanicProject
      ? { generatedMechanicProject: playableDraftSource.generatedMechanicProject }
      : {}),
    type: "phaser-valid",
  };
}

export function createPhaserRuntimeHostViewModel({
  gameResetNonce,
  runtimeTemplate,
}: {
  gameResetNonce: number;
  runtimeTemplate: Extract<EditorRuntimeTemplatePlan, { type: "phaser-valid" }>;
}): EditorRuntimeHostViewModel {
  return {
    type: "phaser",
    key: `${runtimeTemplate.sourceKey}-${gameResetNonce}`,
    template: runtimeTemplate.template,
    ...(runtimeTemplate.generatedMechanicProject
      ? { generatedMechanicProject: runtimeTemplate.generatedMechanicProject }
      : {}),
  };
}

export function createCanvasRuntimeHostViewModel({
  gameResetNonce,
  pack,
}: {
  gameResetNonce: number;
  pack: GeneratedGamePack;
}): EditorRuntimeHostViewModel {
  return {
    type: "canvas",
    key: `${pack.manifest.title}-${gameResetNonce}`,
    pack,
  };
}
