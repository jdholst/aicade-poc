import type { JsonValue, StableId } from "../game-spec-schema";
import {
  parseGamePack,
  type FailedAttempt,
  type GamePack,
  type PlayableBuild,
  type ValidationEvidence,
  type ValidationEvidenceStage,
  type VersionCheckpoint,
} from "./game-pack-schema";

export type RestoreGamePackCheckpointInput = {
  gamePack: GamePack;
  restoredAt?: string;
  sourceCheckpointId: VersionCheckpoint["id"];
};

export type CreatePlayableBuildRecordInput = {
  checkpointId?: StableId;
  completedAt: string;
  gamePack: GamePack;
  id: PlayableBuild["id"];
  startedAt: string;
  status: PlayableBuild["status"];
  validationEvidence: ValidationEvidence[];
};

export type CreateInitialVersionCheckpointRecordInput = {
  build: PlayableBuild;
  completedAt: string;
  gamePack: GamePack;
  startedAt: string;
  validationEvidence: ValidationEvidence[];
};

export type CreateFailedAttemptRecordInput = {
  buildId?: StableId;
  completedAt: string;
  gamePack: GamePack;
  id: FailedAttempt["id"];
  startedAt: string;
  summary: string;
  validationEvidence: ValidationEvidence[];
};

export function upsertGamePackRecordsById<TRecord extends { id: StableId }>(
  existingRecords: TRecord[],
  nextRecords: TRecord[]
): TRecord[] {
  const nextRecordsById = new Map(
    nextRecords.map((record) => [record.id, record])
  );
  const updatedRecords = existingRecords.map((record) =>
    nextRecordsById.get(record.id) ?? record
  );
  const existingIds = new Set(existingRecords.map((record) => record.id));
  const newRecords = nextRecords.filter((record) => !existingIds.has(record.id));

  return [...updatedRecords, ...newRecords];
}

export function getValidationEvidenceIds(
  evidence: readonly ValidationEvidence[]
): StableId[] {
  return evidence.map((receipt) => receipt.id);
}

export function groupValidationEvidenceReceipts(
  evidence: readonly ValidationEvidence[]
): Record<string, JsonValue> {
  const grouped: Record<
    string,
    Array<{
      checkId: StableId;
      id: StableId;
      status: ValidationEvidence["status"];
    }>
  > = {};

  for (const item of evidence) {
    grouped[item.stage] = grouped[item.stage] ?? [];
    grouped[item.stage].push({
      id: item.id,
      checkId: item.checkId,
      status: item.status,
    });
  }

  return grouped;
}

export function getFirstFailedValidationStage(
  evidence: readonly ValidationEvidence[]
): ValidationEvidenceStage {
  return evidence.find((item) => item.status === "failed")?.stage ?? "schema";
}

export function hasMountedRuntimeValidationArtifact(
  evidence: readonly ValidationEvidence[]
) {
  return evidence.some(
    (item) => item.stage === "runtime-boot" || item.stage === "browser-check"
  );
}

export function getInitialCheckpointId(gamePack: GamePack): StableId {
  return gamePack.checkpoints[0]?.id ?? "checkpoint_initial_playable";
}

export function getCurrentCheckpoint(gamePack: GamePack) {
  return gamePack.checkpoints.find(
    (checkpoint) => checkpoint.id === gamePack.currentCheckpointId
  );
}

export function getCheckpointIdForValidationWrite(gamePack: GamePack): StableId {
  return getCurrentCheckpoint(gamePack)?.id ?? getInitialCheckpointId(gamePack);
}

export function createPlayableBuildRecord({
  checkpointId,
  completedAt,
  gamePack,
  id,
  startedAt,
  status,
  validationEvidence,
}: CreatePlayableBuildRecordInput): PlayableBuild {
  return {
    id,
    createdAt: completedAt,
    runtimeKind: gamePack.runtimeKind,
    templateId: gamePack.templateId,
    gameSpecId: gamePack.gameSpec.id,
    ...(checkpointId ? { checkpointId } : {}),
    validationEvidenceIds: getValidationEvidenceIds(validationEvidence),
    status,
    artifactMetadata: {
      validationAttemptStartedAt: startedAt,
      validationCompletedAt: completedAt,
      validationEvidenceByStage: groupValidationEvidenceReceipts(
        validationEvidence
      ),
    },
  };
}

export function createInitialVersionCheckpointRecord({
  build,
  completedAt,
  gamePack,
  startedAt,
  validationEvidence,
}: CreateInitialVersionCheckpointRecordInput): VersionCheckpoint {
  return {
    id: getInitialCheckpointId(gamePack),
    createdAt: completedAt,
    label: "Initial playable",
    summary: "First validated playable build for this Game Pack.",
    gameSpecId: gamePack.gameSpec.id,
    buildId: build.id,
    validationEvidenceIds: getValidationEvidenceIds(validationEvidence),
    metadata: {
      validationAttemptStartedAt: startedAt,
      validationCompletedAt: completedAt,
    },
  };
}

export function createFailedAttemptRecord({
  buildId,
  completedAt,
  gamePack,
  id,
  startedAt,
  summary,
  validationEvidence,
}: CreateFailedAttemptRecordInput): FailedAttempt {
  return {
    id,
    createdAt: completedAt,
    stage: getFirstFailedValidationStage(validationEvidence),
    summary,
    gameSpecId: gamePack.gameSpec.id,
    ...(buildId ? { buildId } : {}),
    validationEvidenceIds: getValidationEvidenceIds(validationEvidence),
    metadata: {
      validationAttemptStartedAt: startedAt,
      validationCompletedAt: completedAt,
      validationEvidenceByStage: groupValidationEvidenceReceipts(
        validationEvidence
      ),
    },
  };
}

export function hasCreatorFacingCheckpoint(gamePack: GamePack) {
  return gamePack.checkpoints.some((checkpoint) =>
    gamePack.builds.some(
      (build) =>
        build.id === checkpoint.buildId &&
        build.status === "validated" &&
        build.validationEvidenceIds.length > 0
    )
  );
}

export function createGamePackPersistenceKey(gamePack: GamePack) {
  return [
    gamePack.id,
    gamePack.updatedAt,
    gamePack.builds.length,
    gamePack.checkpoints.length,
    gamePack.validationEvidence.length,
  ].join(":");
}

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
