import type {
  GenerationRun,
  GenerationRunRelationships,
} from "../generation-run/generation-run-schema";
import type { GenerationRunRepository } from "../generation-run/generation-run-repository";
import type { GamePack } from "./game-pack-schema";
import {
  type FirstPlayableValidationAttempt,
  writeFirstPlayableValidationResult,
} from "./first-playable-validation";

export type FirstPlayableTerminalValidationState = {
  attempt: FirstPlayableValidationAttempt;
  generationRunId?: GenerationRun["id"];
  gamePack: GamePack;
  resultWritten: boolean;
};

export type WriteFirstPlayableTerminalResultInput<
  TState extends FirstPlayableTerminalValidationState,
> = {
  attempt: FirstPlayableValidationAttempt;
  completedAt?: string;
  currentValidationState: TState;
  generationRunRepository: Pick<GenerationRunRepository, "update"> | null;
};

export type WriteFirstPlayableTerminalResultOutput<
  TState extends FirstPlayableTerminalValidationState,
> = {
  generationRunFinalization?: Promise<void>;
  state: TState;
};

export function writeFirstPlayableTerminalResult<
  TState extends FirstPlayableTerminalValidationState,
>({
  attempt,
  completedAt = new Date().toISOString(),
  currentValidationState,
  generationRunRepository,
}: WriteFirstPlayableTerminalResultInput<TState>): WriteFirstPlayableTerminalResultOutput<TState> {
  if (attempt.status === "running" || currentValidationState.resultWritten) {
    return {
      state: {
        ...currentValidationState,
        attempt,
      },
    };
  }

  const nextGamePack = writeFirstPlayableValidationResult({
    gamePack: currentValidationState.gamePack,
    attempt,
    completedAt,
  });
  const generationRunFinalization =
    currentValidationState.generationRunId && generationRunRepository
      ? finalizeGenerationRunFromFirstPlayable({
          attempt,
          completedAt,
          gamePack: nextGamePack,
          generationRunId: currentValidationState.generationRunId,
          repository: generationRunRepository,
        })
      : undefined;

  return {
    ...(generationRunFinalization ? { generationRunFinalization } : {}),
    state: {
      ...currentValidationState,
      attempt,
      gamePack: nextGamePack,
      resultWritten: true,
    },
  };
}

export async function finalizeGenerationRunFromFirstPlayable({
  attempt,
  completedAt,
  gamePack,
  generationRunId,
  repository,
}: {
  attempt: FirstPlayableValidationAttempt;
  completedAt: string;
  gamePack: GamePack;
  generationRunId: GenerationRun["id"];
  repository: Pick<GenerationRunRepository, "update">;
}) {
  await repository.update(generationRunId, (generationRun) => {
    if (generationRun.status !== "running") {
      return generationRun;
    }

    const relationships = createGenerationRunRelationships(gamePack);
    const durationMs = Math.max(
      0,
      Date.parse(completedAt) - Date.parse(generationRun.startedAt)
    );

    if (attempt.status === "passed") {
      return {
        ...generationRun,
        status: "succeeded",
        repairStatus: hasSuccessfulRepairAttempt(generationRun)
          ? "repaired"
          : "not-needed",
        completedAt,
        durationMs,
        relationships,
      };
    }

    return {
      ...generationRun,
      status: "failed",
      completedAt,
      durationMs,
      stage: getFirstPlayableFailureStage(attempt),
      failureClass: "first-playable-failure",
      relationships,
    };
  });
}

function createGenerationRunRelationships(
  gamePack: GamePack
): GenerationRunRelationships {
  return {
    gamePackId: gamePack.id,
    gameSpecId: gamePack.gameSpec.id,
    buildIds: gamePack.builds.map((build) => build.id),
    checkpointIds: gamePack.checkpoints.map((checkpoint) => checkpoint.id),
    validationEvidenceIds: gamePack.validationEvidence.map(
      (evidence) => evidence.id
    ),
    failedAttemptIds: gamePack.failedAttempts.map(
      (failedAttempt) => failedAttempt.id
    ),
  };
}

function hasSuccessfulRepairAttempt(generationRun: GenerationRun) {
  return generationRun.attempts.some(
    (attempt) => attempt.kind === "repair" && attempt.status === "succeeded"
  );
}

function getFirstPlayableFailureStage(
  attempt: FirstPlayableValidationAttempt
): NonNullable<GenerationRun["stage"]> {
  const failedEvidence = attempt.evidence.find(
    (evidence) => evidence.status === "failed"
  );

  if (failedEvidence?.checkId === "runtime_boot") {
    return "runtime-boot";
  }

  if (
    failedEvidence?.checkId === "nonblank_render" ||
    failedEvidence?.checkId === "player_visible" ||
    failedEvidence?.checkId === "input_response"
  ) {
    return "browser-check";
  }

  return "artifact-build";
}
