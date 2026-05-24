import { describe, expect, it } from "vitest";

import { getDefaultTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { restoreGamePackCheckpoint } from "./checkpoint-restore";
import { parseGamePack, type GamePack } from "./game-pack-schema";

const createdAt = "2026-05-21T00:00:00.000Z";
const laterAt = "2026-05-21T00:10:00.000Z";
const restoredAt = "2026-05-21T00:20:00.000Z";

describe("append-only checkpoint restore", () => {
  it("restores an older checkpoint by appending a restored-forward checkpoint", () => {
    const gamePack = createGamePackWithLaterCheckpoint();
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
    const gamePack = createGamePackWithLaterCheckpoint();

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
    const gamePack = createGamePackWithLaterCheckpoint();

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
      gamePack: createGamePackWithLaterCheckpoint(),
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
        gamePack: createGamePackWithLaterCheckpoint(),
        restoredAt,
        sourceCheckpointId: "checkpoint_missing",
      })
    ).toThrow('Cannot restore missing checkpoint "checkpoint_missing".');
  });
});

function createGamePackWithLaterCheckpoint(): GamePack {
  const gameSpec = getDefaultTopDownGameSpecFixture();

  return parseGamePack({
    schemaVersion: "game-pack/v1",
    id: "game_pack_crystal_chase",
    title: "Crystal Spec Chase",
    createdAt,
    updatedAt: laterAt,
    runtimeKind: "phaser",
    templateId: gameSpec.template.id,
    currentCheckpointId: "checkpoint_second_playable",
    gameSpec,
    validationEvidence: [
      {
        id: "evidence_runtime_boot",
        checkId: "runtime_boot",
        stage: "runtime-boot",
        status: "passed",
        durationMs: 42,
      },
      {
        id: "evidence_second_validation",
        checkId: "second_validation",
        stage: "browser-check",
        status: "passed",
        durationMs: 18,
      },
    ],
    builds: [
      {
        id: "build_initial_playable",
        createdAt,
        runtimeKind: "phaser",
        templateId: gameSpec.template.id,
        gameSpecId: gameSpec.id,
        checkpointId: "checkpoint_initial_playable",
        validationEvidenceIds: ["evidence_runtime_boot"],
        status: "validated",
      },
      {
        id: "build_second_playable",
        createdAt: laterAt,
        runtimeKind: "phaser",
        templateId: gameSpec.template.id,
        gameSpecId: gameSpec.id,
        checkpointId: "checkpoint_second_playable",
        validationEvidenceIds: ["evidence_second_validation"],
        status: "validated",
      },
    ],
    checkpoints: [
      {
        id: "checkpoint_initial_playable",
        createdAt,
        label: "Initial playable",
        summary: "First validated top-down playable state.",
        gameSpecId: gameSpec.id,
        buildId: "build_initial_playable",
        validationEvidenceIds: ["evidence_runtime_boot"],
      },
      {
        id: "checkpoint_second_playable",
        createdAt: laterAt,
        label: "Second playable",
        summary: "Later validated top-down playable state.",
        gameSpecId: gameSpec.id,
        buildId: "build_second_playable",
        validationEvidenceIds: ["evidence_second_validation"],
      },
    ],
    failedAttempts: [],
    generationRuns: [],
  });
}
