import { describe, expect, it } from "vitest";

import {
  getCheckpointIdForValidationWrite,
  restoreGamePackCheckpoint,
} from "./game-pack-lineage";
import { parseGamePack } from "./game-pack-schema";
import {
  createEmptyGamePackFixture,
  createGamePackWithSecondCheckpointFixture,
  GAME_PACK_FIXTURE_RESTORED_AT,
} from "./testing/game-pack-fixtures";

const restoredAt = GAME_PACK_FIXTURE_RESTORED_AT;

describe("append-only checkpoint restore", () => {
  it("preserves an existing valid current checkpoint for validation writes", () => {
    const gamePack = createGamePackWithSecondCheckpointFixture();

    expect(getCheckpointIdForValidationWrite(gamePack)).toBe(
      "checkpoint_second_playable"
    );
  });

  it("falls back to the initial checkpoint for validation writes when no current checkpoint is set", () => {
    const gamePack = createGamePackWithSecondCheckpointFixture({
      currentCheckpointId: undefined,
    });

    expect(getCheckpointIdForValidationWrite(gamePack)).toBe(
      "checkpoint_initial_playable"
    );
  });

  it("falls back deterministically for validation writes when the current checkpoint is stale", () => {
    const gamePack = {
      ...createGamePackWithSecondCheckpointFixture(),
      currentCheckpointId: "checkpoint_missing",
    };

    expect(getCheckpointIdForValidationWrite(gamePack)).toBe(
      "checkpoint_initial_playable"
    );
  });

  it("uses the initial checkpoint ID for validation writes before checkpoints exist", () => {
    const gamePack = createEmptyGamePackFixture();

    expect(getCheckpointIdForValidationWrite(gamePack)).toBe(
      "checkpoint_initial_playable"
    );
  });

  it("restores an older checkpoint by appending a restored-forward checkpoint", () => {
    const gamePack = createGamePackWithSecondCheckpointFixture();
    const originalCheckpoints = gamePack.checkpoints.map((checkpoint) => ({
      ...checkpoint,
    }));

    const restoredGamePack = restoreGamePackCheckpoint({
      gamePack,
      restoredAt,
      sourceCheckpointId: "checkpoint_initial_playable",
    });

    expect(parseGamePack(restoredGamePack)).toEqual(restoredGamePack);
    expect(restoredGamePack.checkpoints).toHaveLength(3);
    expect(restoredGamePack.checkpoints.slice(0, 2)).toEqual(
      originalCheckpoints
    );
    expect(restoredGamePack.checkpoints.map((checkpoint) => checkpoint.id)).toEqual([
      "checkpoint_initial_playable",
      "checkpoint_second_playable",
      "checkpoint_restored_initial_playable_1",
    ]);
    expect(restoredGamePack.currentCheckpointId).toBe(
      "checkpoint_restored_initial_playable_1"
    );
    expect(restoredGamePack.updatedAt).toBe(restoredAt);
  });

  it("records restore metadata and preserves source build/evidence references", () => {
    const gamePack = createGamePackWithSecondCheckpointFixture();

    const restoredGamePack = restoreGamePackCheckpoint({
      gamePack,
      restoredAt,
      sourceCheckpointId: "checkpoint_initial_playable",
    });
    const sourceCheckpoint = gamePack.checkpoints[0];
    const restoredCheckpoint = restoredGamePack.checkpoints[2];

    expect(restoredCheckpoint).toMatchObject({
      id: "checkpoint_restored_initial_playable_1",
      createdAt: restoredAt,
      gameSpecId: sourceCheckpoint.gameSpecId,
      buildId: sourceCheckpoint.buildId,
      validationEvidenceIds: sourceCheckpoint.validationEvidenceIds,
      restoredFromCheckpointId: sourceCheckpoint.id,
      metadata: {
        action: "checkpoint_restore",
        sourceCheckpointCreatedAt: sourceCheckpoint.createdAt,
        sourceCheckpointId: sourceCheckpoint.id,
        sourceCheckpointLabel: sourceCheckpoint.label,
      },
    });
    expect(restoredGamePack.builds.map((build) => build.id)).toEqual([
      "build_initial_playable",
      "build_second_playable",
    ]);
    expect(
      restoredGamePack.validationEvidence.map((evidence) => evidence.id)
    ).toEqual(["evidence_runtime_boot", "evidence_second_validation"]);
  });

  it("keeps later checkpoints present when restoring an older checkpoint", () => {
    const gamePack = createGamePackWithSecondCheckpointFixture();

    const restoredGamePack = restoreGamePackCheckpoint({
      gamePack,
      restoredAt,
      sourceCheckpointId: "checkpoint_initial_playable",
    });

    expect(restoredGamePack.checkpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "checkpoint_second_playable",
          buildId: "build_second_playable",
        }),
      ])
    );
  });

  it("creates unique restored checkpoint IDs for repeated restores", () => {
    const firstRestore = restoreGamePackCheckpoint({
      gamePack: createGamePackWithSecondCheckpointFixture(),
      restoredAt,
      sourceCheckpointId: "checkpoint_initial_playable",
    });

    const secondRestore = restoreGamePackCheckpoint({
      gamePack: firstRestore,
      restoredAt: "2026-05-21T00:30:00.000Z",
      sourceCheckpointId: "checkpoint_initial_playable",
    });

    expect(secondRestore.checkpoints.map((checkpoint) => checkpoint.id)).toEqual([
      "checkpoint_initial_playable",
      "checkpoint_second_playable",
      "checkpoint_restored_initial_playable_1",
      "checkpoint_restored_initial_playable_2",
    ]);
    expect(secondRestore.currentCheckpointId).toBe(
      "checkpoint_restored_initial_playable_2"
    );
  });

  it("fails when the source checkpoint does not exist", () => {
    expect(() =>
      restoreGamePackCheckpoint({
        gamePack: createGamePackWithSecondCheckpointFixture(),
        restoredAt,
        sourceCheckpointId: "checkpoint_missing",
      })
    ).toThrow('Cannot restore missing checkpoint "checkpoint_missing".');
  });
});
