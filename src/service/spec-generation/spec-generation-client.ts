import {
  validateTopDownGameSpec,
  type TopDownGameSpec,
} from "@/game-spec";
import type { RuntimeKind } from "@/runtime/runtime-adapter";
import type { StarterProjectRequest } from "@/service/starter-project/starter-project-client";
import {
  getSpecGenerationErrorMessage,
  getSpecGenerationSuccessMetadata,
  getSpecGenerationValidationFailure,
  type SpecGenerationSuccessMetadata,
  type SpecGenerationValidationFailure,
} from "./spec-generation-outcome";

export type TopDownSpecGenerationClientResult = {
  metadata: SpecGenerationSuccessMetadata;
  runtimeKind: Extract<RuntimeKind, "phaser">;
  spec: TopDownGameSpec;
};

export type TopDownSpecGenerationClientOptions = {
  generationRunId?: string;
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
      metadata?: unknown;
    }
  | {
      ok: false;
      attemptCount?: unknown;
      repairAttempts?: unknown;
      stage?: unknown;
      taskRoute?: unknown;
      userMessage?: unknown;
      validationIssues?: unknown;
    };

export async function requestTopDownSpecGeneration(
  request: StarterProjectRequest,
  signal?: AbortSignal,
  options: TopDownSpecGenerationClientOptions = {}
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
      ...(options.generationRunId ? { generationRunId: options.generationRunId } : {}),
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
  const metadata = getSpecGenerationSuccessMetadata(payload);

  return {
    metadata,
    runtimeKind: "phaser",
    spec,
  };
}
