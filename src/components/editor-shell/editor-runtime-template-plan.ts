import type {
  FirstPlayableRuntimeCandidate,
  GamePack,
  GameSpec,
  GameSpecValidationIssue,
} from "@/game-spec";
import { parseTopDownGameSpec as parseSavedTopDownGameSpec } from "@/game-spec";
import type {
  EditorGenerationSource,
  EditorRuntimeMode,
} from "@/runtime/editor-runtime-mode";
import {
  getEditorGenerationSource,
  getEditorRuntimeMode,
} from "@/runtime/editor-runtime-mode";
import {
  createTopDownPhaserTemplate,
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
  gamePack?: GamePack;
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
      type: "phaser-pending-generation";
    }
  | {
      firstPlayableValidationSource: null;
      issues: GameSpecValidationIssue[];
      message: string;
      type: "phaser-invalid";
    }
  | {
      firstPlayableValidationSource: FirstPlayableValidationSource;
      sourceKey: string;
      template: HandAuthoredPhaserTemplate;
      type: "phaser-valid";
    };

type CreateEditorRuntimeTemplatePlanInput = {
  generationSource?: EditorGenerationSource;
  phaserTemplateState?: TopDownPhaserTemplateState;
  restoredGamePack?: GamePack | null;
  runtimeMode?: EditorRuntimeMode;
};

export function createEditorRuntimeTemplatePlan({
  generationSource,
  phaserTemplateState = getTopDownPhaserTemplateState(),
  restoredGamePack = null,
  runtimeMode = getEditorRuntimeMode(),
}: CreateEditorRuntimeTemplatePlanInput = {}): EditorRuntimeTemplatePlan {
  const resolvedGenerationSource =
    generationSource ?? getEditorGenerationSource(runtimeMode);

  if (runtimeMode === "canvas2d") {
    return {
      firstPlayableValidationSource: null,
      type: "canvas",
    };
  }

  if (restoredGamePack) {
    return createRestoredGamePackRuntimeTemplatePlan(restoredGamePack);
  }

  if (resolvedGenerationSource === "phaser-ai") {
    return {
      firstPlayableValidationSource: null,
      type: "phaser-pending-generation",
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
    firstPlayableValidationSource: createFirstPlayableValidationSource(
      phaserTemplateState.template
    ),
    sourceKey: phaserTemplateState.template.id,
    template: phaserTemplateState.template,
    type: "phaser-valid",
  };
}

function createRestoredGamePackRuntimeTemplatePlan(
  gamePack: GamePack
): EditorRuntimeTemplatePlan {
  if (gamePack.runtimeKind !== "phaser") {
    return createInvalidRestoredGamePackPlan(
      `Saved Game Pack runtime "${gamePack.runtimeKind}" cannot be mounted by the Phaser editor.`
    );
  }

  try {
    const gameSpec = parseSavedTopDownGameSpec(gamePack.gameSpec);
    const template = createTopDownPhaserTemplate(gameSpec);

    return {
      firstPlayableValidationSource: {
        ...createFirstPlayableValidationSource(template),
        gamePack,
      },
      sourceKey: [
        template.id,
        gamePack.updatedAt,
        gamePack.builds.length,
        gamePack.checkpoints.length,
      ].join("-"),
      template,
      type: "phaser-valid",
    };
  } catch {
    return createInvalidRestoredGamePackPlan(
      "Saved Game Pack cannot be restored because its Game Spec is not a valid top-down Phaser spec."
    );
  }
}

function createInvalidRestoredGamePackPlan(
  message: string
): Extract<EditorRuntimeTemplatePlan, { type: "phaser-invalid" }> {
  return {
    firstPlayableValidationSource: null,
    issues: [
      {
        path: "gamePack.gameSpec",
        message,
      },
    ],
    message,
    type: "phaser-invalid",
  };
}

function createFirstPlayableValidationSource(
  template: HandAuthoredPhaserTemplate
): FirstPlayableValidationSource {
  return {
    gameSpec: template.gameSpec,
    runtimeCandidate: {
      runtimeDependencyScriptPaths: template.runtimeDependencyScriptPaths,
      runtimeKind: "phaser",
      runtimeScriptPath: template.runtimeScriptPath,
      templateId: template.gameSpec.template.id,
    },
    runtimeKind: "phaser",
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
