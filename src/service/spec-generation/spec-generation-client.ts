import {
  createInitialGamePack,
  validateTopDownGameSpec,
  type GamePack,
  type TopDownGameSpec,
} from "@/game-spec";
import type { OpenAIModelId } from "@/utils/openai-utils";
import type { StarterProjectRequest } from "@/service/starter-project/starter-project-client";
import type {
  SPEC_GENERATION_TASK_ROUTE,
  SpecGenerationFailureStage,
  SpecGenerationIssue,
} from "./spec-generation-service";

export type TopDownSpecGenerationClientResult = {
  gamePack: GamePack;
  metadata: {
    taskRoute: typeof SPEC_GENERATION_TASK_ROUTE;
    model: OpenAIModelId;
    attemptCount: number;
  };
  spec: TopDownGameSpec;
};

export type SpecGenerationValidationFailure = {
  attemptCount: number;
  issues: SpecGenerationIssue[];
  stage: SpecGenerationFailureStage;
  taskRoute: typeof SPEC_GENERATION_TASK_ROUTE;
};

export class SpecGenerationClientError extends Error {
  readonly validationFailure?: SpecGenerationValidationFailure;

  constructor(
    message: string,
    validationFailure?: SpecGenerationValidationFailure
  ) {
    super(message);
    this.name = "SpecGenerationClientError";
    this.validationFailure = validationFailure;
  }
}

type SpecGenerationPayload =
  | {
      ok: true;
      spec: unknown;
      metadata?: {
        taskRoute?: unknown;
        model?: unknown;
        attemptCount?: unknown;
      };
    }
  | {
      ok: false;
      attemptCount?: unknown;
      stage?: unknown;
      taskRoute?: unknown;
      userMessage?: unknown;
      validationIssues?: unknown;
    };

export async function requestTopDownSpecGeneration(
  request: StarterProjectRequest,
  signal?: AbortSignal
): Promise<TopDownSpecGenerationClientResult> {
  const response = await fetch("/api/spec-generation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      enteredPrompt: request.prompt || undefined,
      openAiApiKey: request.openAiApiKey,
      openAiKeyword: request.openAiKeyword,
      openAiModel: request.openAiModel,
    }),
  });

  const payload = (await response.json()) as SpecGenerationPayload;

  if (!response.ok || payload.ok === false) {
    throw new SpecGenerationClientError(
      getSpecGenerationErrorMessage(payload),
      getSpecGenerationValidationFailure(payload)
    );
  }

  if (payload.ok !== true) {
    throw new Error("Spec Generation returned an invalid response.");
  }

  const spec = validateTopDownGameSpec(payload.spec);
  const metadata = {
    taskRoute: "spec_generation.primary" as const,
    model: getMetadataString(payload.metadata?.model) as OpenAIModelId,
    attemptCount: getMetadataNumber(payload.metadata?.attemptCount),
  };

  return {
    gamePack: createInitialGamePack({
      gameSpec: spec,
      runtimeKind: "phaser",
      metadata: {
        generationSource: "spec-generation",
        generationTaskRoute: metadata.taskRoute,
        generationModel: metadata.model,
        generationAttemptCount: metadata.attemptCount,
      },
    }),
    metadata,
    spec,
  };
}

function getSpecGenerationErrorMessage(payload: SpecGenerationPayload) {
  if (
    payload.ok === false &&
    typeof payload.userMessage === "string" &&
    payload.userMessage.trim()
  ) {
    return payload.userMessage;
  }

  return "Spec Generation could not create a playable Phaser game plan.";
}

function getMetadataString(value: unknown) {
  return typeof value === "string" && value ? value : "gpt-5.4-mini";
}

function getMetadataNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 1;
}

function getSpecGenerationValidationFailure(
  payload: SpecGenerationPayload
): SpecGenerationValidationFailure | undefined {
  if (payload.ok !== false) {
    return undefined;
  }

  const issues = getValidationIssues(payload.validationIssues);

  if (issues.length === 0) {
    return undefined;
  }

  return {
    attemptCount: getMetadataNumber(payload.attemptCount),
    issues,
    stage: getValidationStage(payload.stage),
    taskRoute: "spec_generation.primary",
  };
}

function getValidationIssues(value: unknown): SpecGenerationIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((issue) => {
    if (!issue || typeof issue !== "object") {
      return [];
    }

    const path = "path" in issue ? issue.path : undefined;
    const message = "message" in issue ? issue.message : undefined;
    const code = "code" in issue ? issue.code : undefined;

    if (typeof path !== "string" || typeof message !== "string") {
      return [];
    }

    return [
      {
        path,
        message,
        ...(typeof code === "string" ? { code } : {}),
      },
    ];
  });
}

function getValidationStage(value: unknown): SpecGenerationFailureStage {
  if (
    value === "schema_validation" ||
    value === "semantic_validation" ||
    value === "mechanic_validation"
  ) {
    return value;
  }

  return "schema_validation";
}
