import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

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
  let browserLockManager: MemoryBrowserLockManager;

  beforeEach(() => {
    browserLockManager = new MemoryBrowserLockManager();
    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: browserLockManager,
    });
  });

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

  it("skips a newer pending acceptance and restores the last finalized Game Pack", async () => {
    const storage = new MemoryGamePackStorage();
    const repository = createGamePackRepository(storage);
    const finalizedGamePack = createValidatedGamePackFixture();
    const pendingGamePack = createValidatedGamePackFixture({
      id: "pending_game_pack_crystal_chase_extension_v2",
      updatedAt: "2026-08-13T15:00:00.000Z",
      metadata: {
        generatedMechanicAcceptanceTransaction: {
          schemaVersion: "generated_mechanic_acceptance_transaction/v1",
          status: "pending",
          generationRunId: "generation_run_v2",
          artifactId: "extension_v2",
          buildId: "build_v2",
          checkpointId: "checkpoint_v2",
        },
      },
    });
    await repository.save(finalizedGamePack);
    await repository.save(pendingGamePack);

    const { result } = renderHook(() =>
      useEditorGamePackPersistence({ repository })
    );

    await waitFor(() => {
      expect(result.current.loadStatus).toBe("loaded");
    });
    expect(result.current.restoredGamePack).toEqual(finalizedGamePack);
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

  it("serializes validated saves with generated mechanic acceptance persistence", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());
    const gamePack = createValidatedGamePackFixture();
    const { result } = renderHook(() =>
      useEditorGamePackPersistence({ repository })
    );
    await waitFor(() => {
      expect(result.current.loadStatus).toBe("loaded");
    });

    let releaseAcceptance!: () => void;
    const acceptanceReleased = new Promise<void>((resolve) => {
      releaseAcceptance = resolve;
    });
    let reportAcceptanceEntered!: () => void;
    const acceptanceEntered = new Promise<void>((resolve) => {
      reportAcceptanceEntered = resolve;
    });
    const acceptance = browserLockManager.request(
      "sparkline:generated-mechanic-acceptance:global",
      { mode: "exclusive" },
      async () => {
        reportAcceptanceEntered();
        await acceptanceReleased;
      }
    );
    await acceptanceEntered;

    let persistence!: Promise<unknown>;
    act(() => {
      persistence = result.current.persistValidatedGamePack(gamePack);
    });
    const persistedWhileAcceptanceHeld = await Promise.race([
      persistence.then(() => true),
      new Promise<false>((resolve) => {
        setTimeout(() => resolve(false), 20);
      }),
    ]);

    expect(persistedWhileAcceptanceHeld).toBe(false);
    await expect(repository.load(gamePack.id)).resolves.toBeNull();
    releaseAcceptance();
    await act(async () => {
      await persistence;
      await acceptance;
    });
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

class MemoryBrowserLockManager {
  private readonly tails = new Map<string, Promise<void>>();

  async request<T>(
    name: string,
    _options: Readonly<{ mode: "exclusive"; signal?: AbortSignal }>,
    callback: () => Promise<T>
  ): Promise<T> {
    const previous = this.tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(name, tail);
    await previous;
    try {
      return await callback();
    } finally {
      release();
      if (this.tails.get(name) === tail) {
        this.tails.delete(name);
      }
    }
  }
}
