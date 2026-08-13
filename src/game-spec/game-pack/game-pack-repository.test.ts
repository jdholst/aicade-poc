import { describe, expect, it } from "vitest";

import {
  createSuccessfulGenerationRunFixture,
  createRestoredForwardGamePackFixture,
  createValidatedGamePackFixture,
  GAME_PACK_FIXTURE_LATER_UPDATED_AT,
  GAME_PACK_FIXTURE_UPDATED_AT,
} from "./testing/game-pack-fixtures";

import {
  GamePackRepositoryError,
  createGamePackRepository,
  createIndexedDbGamePackRepository,
  type GamePackStorageDriver,
  type StoredGamePackRecord,
} from "./game-pack-repository";
import { parseGamePack } from "./game-pack-schema";

describe("Game Pack repository", () => {
  it("saves and loads a valid Game Pack through the repository boundary", async () => {
    const storage = new MemoryGamePackStorage();
    const repository = createGamePackRepository(storage);
    const gamePack = createValidatedGamePackFixture();

    await expect(repository.save(gamePack)).resolves.toEqual(gamePack);

    await expect(repository.load(gamePack.id)).resolves.toEqual(gamePack);
    expect(storage.records.get(gamePack.id)).toMatchObject({
      id: gamePack.id,
      gamePackSchemaVersion: "game-pack/v1",
      recordVersion: 1,
    });
  });

  it("lists saved Game Packs by updatedAt descending", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());
    const olderGamePack = createValidatedGamePackFixture({
      id: "game_pack_older",
      updatedAt: GAME_PACK_FIXTURE_UPDATED_AT,
    });
    const newerGamePack = createValidatedGamePackFixture({
      id: "game_pack_newer",
      updatedAt: GAME_PACK_FIXTURE_LATER_UPDATED_AT,
    });

    await repository.save(olderGamePack);
    await repository.save(newerGamePack);

    await expect(repository.list()).resolves.toEqual([
      newerGamePack,
      olderGamePack,
    ]);
  });

  it("updates an existing Game Pack and returns the saved value", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());
    const gamePack = createValidatedGamePackFixture();

    await repository.save(gamePack);

    const nextGamePack = await repository.update(gamePack.id, (current) =>
      parseGamePack({
        ...current,
        title: "Crystal Spec Chase Updated",
        updatedAt: GAME_PACK_FIXTURE_LATER_UPDATED_AT,
      })
    );

    expect(nextGamePack).toMatchObject({
      id: gamePack.id,
      title: "Crystal Spec Chase Updated",
      updatedAt: GAME_PACK_FIXTURE_LATER_UPDATED_AT,
    });
    await expect(repository.load(gamePack.id)).resolves.toEqual(nextGamePack);
  });

  it("atomically swaps only the exact expected Game Pack snapshot", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());
    const original = createValidatedGamePackFixture();
    const replacement = createValidatedGamePackFixture({
      title: "Accepted generated mechanic",
      updatedAt: GAME_PACK_FIXTURE_LATER_UPDATED_AT,
    });
    await repository.save(original);

    await expect(
      repository.compareAndSwap(original.id, original, replacement)
    ).resolves.toBe(true);
    await expect(repository.load(original.id)).resolves.toEqual(replacement);
    await expect(
      repository.compareAndSwap(original.id, original, null)
    ).resolves.toBe(false);
    await expect(repository.load(original.id)).resolves.toEqual(replacement);
  });

  it("deletes one persisted Game Pack through the repository boundary", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());
    const gamePack = createValidatedGamePackFixture();
    await repository.save(gamePack);

    await expect(repository.delete(gamePack.id)).resolves.toBeUndefined();
    await expect(repository.load(gamePack.id)).resolves.toBeNull();
  });

  it("preserves validation evidence, builds, checkpoints, failed attempts, and generation runs", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());
    const baseGamePack = createValidatedGamePackFixture();
    const gamePack = createValidatedGamePackFixture({
      generationRuns: [createSuccessfulGenerationRunFixture(baseGamePack)],
    });

    await repository.save(gamePack);

    const loadedGamePack = await repository.load(gamePack.id);

    expect(loadedGamePack).toMatchObject({
      validationEvidence: [
        expect.objectContaining({
          id: "evidence_runtime_boot",
          checkId: "runtime_boot",
          stage: "runtime-boot",
        }),
      ],
      builds: [
        expect.objectContaining({
          id: "build_initial_playable",
          checkpointId: "checkpoint_initial_playable",
          validationEvidenceIds: ["evidence_runtime_boot"],
        }),
      ],
      checkpoints: [
        expect.objectContaining({
          id: "checkpoint_initial_playable",
          buildId: "build_initial_playable",
          validationEvidenceIds: ["evidence_runtime_boot"],
        }),
      ],
      failedAttempts: [
        expect.objectContaining({
          id: "failed_attempt_preflight",
          validationEvidenceIds: ["evidence_runtime_boot"],
        }),
      ],
      generationRuns: [
        expect.objectContaining({
          id: "generation_run_initial_prompt",
          operationType: "generate",
          status: "succeeded",
          attempts: [
            expect.objectContaining({
              id: "generation_attempt_initial",
              status: "succeeded",
            }),
          ],
        }),
      ],
    });
  });

  it("reloads restored-forward checkpoint history without dropping later checkpoints", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());
    const restoredGamePack = createRestoredForwardGamePackFixture();

    await repository.save(restoredGamePack);

    await expect(repository.load(restoredGamePack.id)).resolves.toMatchObject({
      currentCheckpointId: "checkpoint_restored_initial_playable_1",
      checkpoints: [
        expect.objectContaining({ id: "checkpoint_initial_playable" }),
        expect.objectContaining({ id: "checkpoint_second_playable" }),
        expect.objectContaining({
          id: "checkpoint_restored_initial_playable_1",
          restoredFromCheckpointId: "checkpoint_initial_playable",
        }),
      ],
    });
  });

  it("throws a typed not_found error when updating a missing Game Pack", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());

    await expect(
      repository.update("game_pack_missing", (gamePack) => gamePack)
    ).rejects.toMatchObject({
      code: "not_found",
      gamePackId: "game_pack_missing",
      operation: "update",
    });
  });

  it("rejects update payloads that change the requested Game Pack ID", async () => {
    const storage = new MemoryGamePackStorage();
    const repository = createGamePackRepository(storage);
    const gamePack = createValidatedGamePackFixture();

    await repository.save(gamePack);

    await expect(
      repository.update(gamePack.id, (current) =>
        parseGamePack({
          ...current,
          id: "game_pack_other",
        })
      )
    ).rejects.toMatchObject({
      code: "update_id_mismatch",
      gamePackId: gamePack.id,
      operation: "update",
    });
    expect(storage.records.has(gamePack.id)).toBe(true);
    expect(storage.records.has("game_pack_other")).toBe(false);
  });

  it("wraps storage failures in typed repository errors", async () => {
    const repository = createGamePackRepository(
      new MemoryGamePackStorage({ failOn: "put" })
    );
    const gamePack = createValidatedGamePackFixture();

    await expect(repository.save(gamePack)).rejects.toMatchObject({
      code: "save_failed",
      gamePackId: gamePack.id,
      operation: "save",
    });
  });

  it("throws a typed error when IndexedDB is unavailable", async () => {
    const repository = createIndexedDbGamePackRepository({
      indexedDB: null,
    });

    await expect(repository.list()).rejects.toBeInstanceOf(
      GamePackRepositoryError
    );
    await expect(repository.list()).rejects.toMatchObject({
      code: "indexeddb_unavailable",
      operation: "open",
    });
  });
});

class MemoryGamePackStorage implements GamePackStorageDriver {
  readonly records = new Map<string, StoredGamePackRecord>();
  private readonly failOn?: "delete" | "get" | "getAll" | "put";

  constructor({
    failOn,
  }: {
    failOn?: "delete" | "get" | "getAll" | "put";
  } = {}) {
    this.failOn = failOn;
  }

  async put(record: StoredGamePackRecord) {
    if (this.failOn === "put") {
      throw new Error("Injected put failure.");
    }

    this.records.set(record.id, cloneRecord(record));
  }

  async get(gamePackId: string) {
    if (this.failOn === "get") {
      throw new Error("Injected get failure.");
    }

    const record = this.records.get(gamePackId);

    return record ? cloneRecord(record) : null;
  }

  async getAll() {
    if (this.failOn === "getAll") {
      throw new Error("Injected getAll failure.");
    }

    return Array.from(this.records.values()).map(cloneRecord);
  }

  async compareAndSwap(
    gamePackId: string,
    expected: StoredGamePackRecord | null,
    replacement: StoredGamePackRecord | null
  ) {
    const current = this.records.get(gamePackId) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      return false;
    }
    if (replacement) {
      this.records.set(gamePackId, cloneRecord(replacement));
    } else {
      this.records.delete(gamePackId);
    }
    return true;
  }

  async delete(gamePackId: string) {
    if (this.failOn === "delete") {
      throw new Error("Injected delete failure.");
    }
    this.records.delete(gamePackId);
  }
}

function cloneRecord(record: StoredGamePackRecord): StoredGamePackRecord {
  return JSON.parse(JSON.stringify(record)) as StoredGamePackRecord;
}
