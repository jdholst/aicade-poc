import type { GenerationRun } from "../generation-run/generation-run-schema";
import type { GamePack } from "./game-pack-schema";

export const CREATOR_GENERATION_PERSISTENCE_TRANSACTION_VERSION =
  "creator_generation_persistence_transaction/v1" as const;

const CREATOR_GENERATION_PERSISTENCE_TRANSACTION_METADATA_KEY =
  "creatorGenerationPersistenceTransaction";

export type CreatorGenerationPersistenceTransaction = Readonly<{
  schemaVersion: typeof CREATOR_GENERATION_PERSISTENCE_TRANSACTION_VERSION;
  status: "pending" | "finalized";
  generationRunId: GenerationRun["id"];
}>;

export function writeCreatorGenerationPersistenceTransaction({
  gamePack,
  generationRunId,
  status,
}: Readonly<{
  gamePack: GamePack;
  generationRunId: GenerationRun["id"];
  status: CreatorGenerationPersistenceTransaction["status"];
}>): GamePack {
  return {
    ...gamePack,
    metadata: {
      ...(gamePack.metadata ?? {}),
      [CREATOR_GENERATION_PERSISTENCE_TRANSACTION_METADATA_KEY]: {
        schemaVersion: CREATOR_GENERATION_PERSISTENCE_TRANSACTION_VERSION,
        status,
        generationRunId,
      },
    },
  };
}

export function readCreatorGenerationPersistenceTransaction(
  gamePack: GamePack
): CreatorGenerationPersistenceTransaction | "invalid" | undefined {
  const value =
    gamePack.metadata?.[
      CREATOR_GENERATION_PERSISTENCE_TRANSACTION_METADATA_KEY
    ];

  if (value === undefined) {
    return undefined;
  }

  if (
    !isRecord(value) ||
    value.schemaVersion !==
      CREATOR_GENERATION_PERSISTENCE_TRANSACTION_VERSION ||
    (value.status !== "pending" && value.status !== "finalized") ||
    typeof value.generationRunId !== "string" ||
    value.generationRunId.length === 0
  ) {
    return "invalid";
  }

  return {
    schemaVersion: CREATOR_GENERATION_PERSISTENCE_TRANSACTION_VERSION,
    status: value.status,
    generationRunId: value.generationRunId,
  };
}

export function isCreatorGenerationPersistenceRestorable(
  gamePack: GamePack
): boolean {
  const transaction = readCreatorGenerationPersistenceTransaction(gamePack);

  if (transaction === undefined) {
    return true;
  }
  if (transaction === "invalid" || transaction.status !== "finalized") {
    return false;
  }

  const finalizedGenerationRun = gamePack.generationRuns.find(
    ({ id }) => id === transaction.generationRunId
  );

  return Boolean(
    finalizedGenerationRun &&
      finalizedGenerationRun.status === "succeeded" &&
      hasExactGamePackRelationships(gamePack, finalizedGenerationRun)
  );
}

export function attachFinalizedGenerationRunToGamePack({
  gamePack,
  generationRun,
}: Readonly<{
  gamePack: GamePack;
  generationRun: GenerationRun;
}>): GamePack | null {
  if (
    generationRun.status !== "succeeded" ||
    !hasExactGamePackRelationships(gamePack, generationRun)
  ) {
    return null;
  }

  return writeCreatorGenerationPersistenceTransaction({
    gamePack: {
      ...gamePack,
      generationRuns: [
        ...gamePack.generationRuns.filter(({ id }) => id !== generationRun.id),
        generationRun,
      ],
    },
    generationRunId: generationRun.id,
    status: "finalized",
  });
}

function hasExactGamePackRelationships(
  gamePack: GamePack,
  generationRun: GenerationRun
): boolean {
  const relationships = generationRun.relationships;

  return (
    relationships?.gamePackId === gamePack.id &&
    relationships.gameSpecId === gamePack.gameSpec.id &&
    sameIds(
      relationships.buildIds ?? [],
      gamePack.builds.map(({ id }) => id)
    ) &&
    sameIds(
      relationships.checkpointIds ?? [],
      gamePack.checkpoints.map(({ id }) => id)
    ) &&
    sameIds(
      relationships.validationEvidenceIds ?? [],
      gamePack.validationEvidence.map(({ id }) => id)
    ) &&
    sameIds(
      relationships.failedAttemptIds ?? [],
      gamePack.failedAttempts.map(({ id }) => id)
    )
  );
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
