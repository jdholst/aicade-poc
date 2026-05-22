import type {
  FirstPlayableRuntimeCandidate,
  GameSpec,
  GameSpecValidationIssue,
} from "@/game-spec";
import type {
  EditorRuntimeMode,
} from "@/runtime/editor-runtime-mode";
import { getEditorRuntimeMode } from "@/runtime/editor-runtime-mode";
import {
  getTopDownPhaserTemplateState,
  type HandAuthoredPhaserTemplate,
  type TopDownPhaserTemplateState,
} from "@/runtime/phaser";
import type { RuntimeKind } from "@/runtime/runtime-adapter";
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

export type FirstPlayableValidationSource = {
  gameSpec: GameSpec;
  runtimeCandidate: FirstPlayableRuntimeCandidate;
  runtimeKind: Extract<RuntimeKind, "phaser">;
};

export type EditorRuntimeTemplatePlan =
  | {
      firstPlayableValidationSource: null;
      type: "canvas";
    }
  | {
      firstPlayableValidationSource: null;
      issues: GameSpecValidationIssue[];
      message: string;
      type: "phaser-invalid";
    }
  | {
      firstPlayableValidationSource: FirstPlayableValidationSource;
      template: HandAuthoredPhaserTemplate;
      type: "phaser-valid";
    };

type CreateEditorRuntimeTemplatePlanInput = {
  phaserTemplateState?: TopDownPhaserTemplateState;
  runtimeMode?: EditorRuntimeMode;
};

export function createEditorRuntimeTemplatePlan({
  phaserTemplateState = getTopDownPhaserTemplateState(),
  runtimeMode = getEditorRuntimeMode(),
}: CreateEditorRuntimeTemplatePlanInput = {}): EditorRuntimeTemplatePlan {
  if (runtimeMode === "canvas2d") {
    return {
      firstPlayableValidationSource: null,
      type: "canvas",
    };
  }

  if (phaserTemplateState.status === "invalid") {
    return {
      firstPlayableValidationSource: null,
      issues: phaserTemplateState.issues,
      message: phaserTemplateState.message,
      type: "phaser-invalid",
    };
  }

  return {
    firstPlayableValidationSource: {
      gameSpec: phaserTemplateState.template.gameSpec,
      runtimeCandidate: {
        runtimeDependencyScriptPaths:
          phaserTemplateState.template.runtimeDependencyScriptPaths,
        runtimeKind: "phaser",
        runtimeScriptPath: phaserTemplateState.template.runtimeScriptPath,
        templateId: phaserTemplateState.template.gameSpec.template.id,
      },
      runtimeKind: "phaser",
    },
    template: phaserTemplateState.template,
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
    key: `${runtimeTemplate.template.id}-${gameResetNonce}`,
    template: runtimeTemplate.template,
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
