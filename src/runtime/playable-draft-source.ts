import type {
  FirstPlayableRuntimeCandidate,
  GamePack,
  GameSpec,
  GameSpecValidationIssue,
} from "@/game-spec";
import {
  GameSpecValidationError,
  parseTopDownGameSpec as parseSavedTopDownGameSpec,
  validateTopDownGameSpec,
} from "@/game-spec";
import {
  getEditorGenerationSource,
  getEditorRuntimeMode,
  type EditorGenerationSource,
  type EditorRuntimeMode,
} from "@/runtime/editor-runtime-mode";
import {
  createTopDownPhaserTemplate,
  getTopDownPhaserTemplateState,
  type HandAuthoredPhaserTemplate,
  type TopDownPhaserTemplateState,
} from "@/runtime/phaser";
import type { RuntimeKind } from "@/runtime/runtime-adapter";
import type { OpenAIModelId } from "@/utils/openai-utils";

export type PlayableDraftReadyPolicy =
  | "ready-on-runtime-ready"
  | "ready-after-first-playable";

export type PlayableDraftPersistencePolicy =
  | "persist-after-first-playable"
  | "do-not-persist"
  | "reuse-restored-game-pack";

export type PlayableDraftValidationSource = {
  gamePack?: GamePack;
  gameSpec: GameSpec;
  runtimeCandidate: FirstPlayableRuntimeCandidate;
  source: "fixture" | "generated-spec" | "restored-game-pack";
  runtimeKind: Extract<RuntimeKind, "phaser">;
};

export type GeneratedPlayableDraftSpec = {
  metadata: {
    taskRoute: string;
    model: OpenAIModelId;
    attemptCount: number;
  };
  runtimeKind: Extract<RuntimeKind, "phaser">;
  spec: Parameters<typeof createTopDownPhaserTemplate>[0];
};

export type PlayableDraftSource =
  | {
      type: "canvas";
    }
  | {
      type: "pending-generation";
    }
  | {
      type: "blocked";
      issues: GameSpecValidationIssue[];
      message: string;
    }
  | {
      type: "phaser";
      source: PlayableDraftValidationSource["source"];
      sourceKey: string;
      template: HandAuthoredPhaserTemplate;
      validationSource: PlayableDraftValidationSource;
      readyPolicy: PlayableDraftReadyPolicy;
      persistencePolicy: PlayableDraftPersistencePolicy;
      runFirstPlayableChecksOnReady: true;
    };

export type CreatePlayableDraftSourceInput = {
  generatedSpecDraft?: GeneratedPlayableDraftSpec | null;
  generationSource?: EditorGenerationSource;
  phaserTemplateState?: TopDownPhaserTemplateState;
  restoredGamePack?: GamePack | null;
  runtimeMode?: EditorRuntimeMode;
};

export function createPlayableDraftSource({
  generatedSpecDraft = null,
  generationSource,
  phaserTemplateState = getTopDownPhaserTemplateState(),
  restoredGamePack = null,
  runtimeMode = getEditorRuntimeMode(),
}: CreatePlayableDraftSourceInput = {}): PlayableDraftSource {
  const resolvedGenerationSource =
    generationSource ?? getEditorGenerationSource(runtimeMode);

  if (runtimeMode === "canvas2d") {
    return {
      type: "canvas",
    };
  }

  if (generatedSpecDraft) {
    return createGeneratedSpecDraftSource(generatedSpecDraft);
  }

  if (restoredGamePack) {
    return createRestoredGamePackDraftSource(restoredGamePack);
  }

  if (resolvedGenerationSource === "phaser-ai") {
    return {
      type: "pending-generation",
    };
  }

  if (phaserTemplateState.status === "invalid") {
    return {
      type: "blocked",
      issues: phaserTemplateState.issues,
      message: phaserTemplateState.message,
    };
  }

  return {
    type: "phaser",
    source: "fixture",
    sourceKey: phaserTemplateState.template.id,
    template: phaserTemplateState.template,
    validationSource: createValidationSource(
      phaserTemplateState.template,
      "fixture"
    ),
    readyPolicy: "ready-on-runtime-ready",
    persistencePolicy: "persist-after-first-playable",
    runFirstPlayableChecksOnReady: true,
  };
}

function createGeneratedSpecDraftSource(
  generatedSpecDraft: GeneratedPlayableDraftSpec
): PlayableDraftSource {
  try {
    const gameSpec = validateTopDownGameSpec(generatedSpecDraft.spec);
    const template = createTopDownPhaserTemplate(gameSpec);

    return {
      type: "phaser",
      source: "generated-spec",
      sourceKey: [
        template.id,
        createGeneratedSpecContentKey(gameSpec),
        generatedSpecDraft.metadata.taskRoute,
        generatedSpecDraft.metadata.model,
        generatedSpecDraft.metadata.attemptCount,
      ].join("-"),
      template,
      validationSource: createValidationSource(template, "generated-spec"),
      readyPolicy: "ready-after-first-playable",
      persistencePolicy: "do-not-persist",
      runFirstPlayableChecksOnReady: true,
    };
  } catch (error) {
    return createBlockedGameSpecSource(
      error,
      "Generated Game Spec cannot be mounted because it is not a valid top-down Phaser spec."
    );
  }
}

function createGeneratedSpecContentKey(gameSpec: GameSpec): string {
  return `spec-${createStableContentHash(gameSpec)}`;
}

function createStableContentHash(value: unknown): string {
  const stableJson = stringifyStableValue(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < stableJson.length; index += 1) {
    hash ^= stableJson.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

function stringifyStableValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyStableValue(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) =>
        `${JSON.stringify(key)}:${stringifyStableValue(
          (value as Record<string, unknown>)[key]
        )}`
      )
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "undefined";
}

function createRestoredGamePackDraftSource(
  gamePack: GamePack
): PlayableDraftSource {
  if (gamePack.runtimeKind !== "phaser") {
    return createBlockedGameSpecSource(
      undefined,
      `Saved Game Pack runtime "${gamePack.runtimeKind}" cannot be mounted by the Phaser editor.`
    );
  }

  try {
    const gameSpec = validateTopDownGameSpec(
      parseSavedTopDownGameSpec(gamePack.gameSpec)
    );
    const template = createTopDownPhaserTemplate(gameSpec);

    return {
      type: "phaser",
      source: "restored-game-pack",
      sourceKey: [
        template.id,
        gamePack.updatedAt,
        gamePack.builds.length,
        gamePack.checkpoints.length,
      ].join("-"),
      template,
      validationSource: {
        ...createValidationSource(template, "restored-game-pack"),
        gamePack,
      },
      readyPolicy: "ready-on-runtime-ready",
      persistencePolicy: "reuse-restored-game-pack",
      runFirstPlayableChecksOnReady: true,
    };
  } catch (error) {
    return createBlockedGameSpecSource(
      error,
      "Saved Game Pack cannot be restored because its Game Spec is not a valid top-down Phaser spec."
    );
  }
}

function createValidationSource(
  template: HandAuthoredPhaserTemplate,
  source: PlayableDraftValidationSource["source"]
): PlayableDraftValidationSource {
  return {
    gameSpec: template.gameSpec,
    runtimeCandidate: {
      runtimeDependencyScriptPaths: template.runtimeDependencyScriptPaths,
      runtimeKind: "phaser",
      runtimeScriptPath: template.runtimeScriptPath,
      templateId: template.gameSpec.template.id,
    },
    source,
    runtimeKind: "phaser",
  };
}

function createBlockedGameSpecSource(
  error: unknown,
  fallbackMessage: string
): PlayableDraftSource {
  if (error instanceof GameSpecValidationError && error.issues.length > 0) {
    return {
      type: "blocked",
      issues: error.issues,
      message: error.issues.map((issue) => issue.message).join(" "),
    };
  }

  return {
    type: "blocked",
    issues: [
      {
        path: "gamePack.gameSpec",
        message: fallbackMessage,
      },
    ],
    message: fallbackMessage,
  };
}
