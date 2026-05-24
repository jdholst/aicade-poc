import type { StableId } from "../game-spec-schema";
import {
  parseGamePack,
  type GamePack,
  type VersionCheckpoint,
} from "./game-pack-schema";

export type RestoreGamePackCheckpointInput = {
  gamePack: GamePack;
  restoredAt?: string;
  sourceCheckpointId: VersionCheckpoint["id"];
};

export function restoreGamePackCheckpoint({
  gamePack,
  restoredAt = new Date().toISOString(),
  sourceCheckpointId,
}: RestoreGamePackCheckpointInput): GamePack {
  const sourceCheckpoint = gamePack.checkpoints.find(
    (checkpoint) => checkpoint.id === sourceCheckpointId
  );

  if (!sourceCheckpoint) {
    throw new Error(`Cannot restore missing checkpoint "${sourceCheckpointId}".`);
  }

  const restoredCheckpoint = createRestoredForwardCheckpoint({
    gamePack,
    restoredAt,
    sourceCheckpoint,
  });

  return parseGamePack({
    ...gamePack,
    updatedAt: restoredAt,
    currentCheckpointId: restoredCheckpoint.id,
    checkpoints: [...gamePack.checkpoints, restoredCheckpoint],
  });
}

function createRestoredForwardCheckpoint({
  gamePack,
  restoredAt,
  sourceCheckpoint,
}: {
  gamePack: GamePack;
  restoredAt: string;
  sourceCheckpoint: VersionCheckpoint;
}): VersionCheckpoint {
  return {
    id: createRestoredCheckpointId(gamePack, sourceCheckpoint.id),
    createdAt: restoredAt,
    label: truncateText(`Restored ${sourceCheckpoint.label}`, 100),
    summary: truncateText(
      `Restored from "${sourceCheckpoint.label}" without deleting later checkpoints.`,
      500
    ),
    gameSpecId: sourceCheckpoint.gameSpecId,
    ...(sourceCheckpoint.buildId ? { buildId: sourceCheckpoint.buildId } : {}),
    validationEvidenceIds: [...sourceCheckpoint.validationEvidenceIds],
    restoredFromCheckpointId: sourceCheckpoint.id,
    metadata: {
      action: "checkpoint_restore",
      sourceCheckpointCreatedAt: sourceCheckpoint.createdAt,
      sourceCheckpointId: sourceCheckpoint.id,
      sourceCheckpointLabel: sourceCheckpoint.label,
    },
  };
}

function createRestoredCheckpointId(
  gamePack: GamePack,
  sourceCheckpointId: StableId
): StableId {
  const existingCheckpointIds = new Set(
    gamePack.checkpoints.map((checkpoint) => checkpoint.id)
  );
  const sourceSuffix = sourceCheckpointId.replace(/^checkpoint_/, "");
  let restoreIndex = 1;
  let checkpointId = `checkpoint_restored_${sourceSuffix}_${restoreIndex}`;

  while (existingCheckpointIds.has(checkpointId)) {
    restoreIndex += 1;
    checkpointId = `checkpoint_restored_${sourceSuffix}_${restoreIndex}`;
  }

  return checkpointId;
}

function truncateText(text: string, maxLength: number) {
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}
