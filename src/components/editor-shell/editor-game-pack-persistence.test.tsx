import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createGamePackRepository,
  type GamePackStorageDriver,
  type StoredGamePackRecord,
} from "@/game-spec";
import {
  createFailedPreRuntimeGamePackFixture,
  createValidatedGamePackFixture,
} from "@/game-spec/game-pack/testing/game-pack-fixtures";

import { useEditorGamePackPersistence } from "./editor-game-pack-persistence";

describe("useEditorGamePackPersistence", () => {
  it("loads the latest saved Game Pack with a creator-facing checkpoint", async () => {
    const storage = new MemoryGamePackStorage();
    const repository = createGamePackRepository(storage);
    const gamePack = createValidatedGamePackFixture();

    await repository.save(gamePack);

    const { result } = renderHook(() =>
      useEditorGamePackPersistence({ repository })
    );

    await waitFor(() => {
      expect(result.current.loadStatus).toBe("loaded");
    });

    expect(result.current.restoredGamePack).toEqual(gamePack);
  });

  it("saves a validated Game Pack without remounting the active restored state", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());
    const gamePack = createValidatedGamePackFixture();
    const { result } = renderHook(() =>
      useEditorGamePackPersistence({ repository })
    );

    await waitFor(() => {
      expect(result.current.loadStatus).toBe("loaded");
    });

    await expect(
      result.current.persistValidatedGamePack(gamePack)
    ).resolves.toEqual(gamePack);

    expect(result.current.restoredGamePack).toBeNull();
    await expect(repository.load(gamePack.id)).resolves.toEqual(gamePack);
  });

  it("does not persist failed attempts as creator-facing checkpoints", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());
    const failedOnlyGamePack = createFailedPreRuntimeGamePackFixture();
    const { result } = renderHook(() =>
      useEditorGamePackPersistence({ repository })
    );

    await waitFor(() => {
      expect(result.current.loadStatus).toBe("loaded");
    });

    await expect(
      result.current.persistValidatedGamePack(failedOnlyGamePack)
    ).resolves.toBeNull();
    await expect(repository.load(failedOnlyGamePack.id)).resolves.toBeNull();
  });

  it("keeps the editor restorable path available when saved data cannot load", async () => {
    const repository = createGamePackRepository(
      new MemoryGamePackStorage({ failOn: "getAll" })
    );

    const { result } = renderHook(() =>
      useEditorGamePackPersistence({ repository })
    );

    await waitFor(() => {
      expect(result.current.loadStatus).toBe("error");
    });

    expect(result.current.restoredGamePack).toBeNull();
    expect(result.current.storageError).toMatchObject({
      message: expect.stringContaining("Failed to list Game Packs"),
    });
  });
});

class MemoryGamePackStorage implements GamePackStorageDriver {
  readonly records = new Map<string, StoredGamePackRecord>();
  private readonly failOn?: "getAll" | "put";

  constructor({ failOn }: { failOn?: "getAll" | "put" } = {}) {
    this.failOn = failOn;
  }

  async put(record: StoredGamePackRecord) {
    if (this.failOn === "put") {
      throw new Error("Injected put failure.");
    }

    this.records.set(record.id, cloneRecord(record));
  }

  async get(gamePackId: string) {
    return this.records.get(gamePackId) ?? null;
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
    this.records.delete(gamePackId);
  }
}

function cloneRecord(record: StoredGamePackRecord): StoredGamePackRecord {
  return JSON.parse(JSON.stringify(record)) as StoredGamePackRecord;
}
