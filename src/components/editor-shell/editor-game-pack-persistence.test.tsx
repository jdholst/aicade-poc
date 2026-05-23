import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createGamePackRepository,
  parseGamePack,
  type GamePack,
  type GamePackStorageDriver,
  type StoredGamePackRecord,
} from "@/game-spec";
import { getDefaultTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { useEditorGamePackPersistence } from "./editor-game-pack-persistence";

const createdAt = "2026-05-23T14:00:00.000Z";
const updatedAt = "2026-05-23T14:05:00.000Z";

describe("useEditorGamePackPersistence", () => {
  it("loads the latest saved Game Pack with a creator-facing checkpoint", async () => {
    const storage = new MemoryGamePackStorage();
    const repository = createGamePackRepository(storage);
    const gamePack = createValidatedGamePack();

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
    const gamePack = createValidatedGamePack();
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
    const failedOnlyGamePack = createFailedOnlyGamePack();
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

function createValidatedGamePack(): GamePack {
  const gameSpec = getDefaultTopDownGameSpecFixture();

  return parseGamePack({
    schemaVersion: "game-pack/v1",
    id: "game_pack_crystal_chase",
    title: "Crystal Spec Chase",
    createdAt,
    updatedAt,
    runtimeKind: "phaser",
    templateId: gameSpec.template.id,
    gameSpec,
    validationEvidence: [
      {
        id: "evidence_runtime_boot",
        checkId: "runtime_boot",
        stage: "runtime-boot",
        status: "passed",
        durationMs: 42,
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
    ],
    failedAttempts: [
      {
        id: "failed_attempt_preflight",
        createdAt,
        stage: "spec-validation",
        summary: "A failed draft stayed out of creator-facing checkpoints.",
        gameSpecId: gameSpec.id,
        validationEvidenceIds: ["evidence_runtime_boot"],
      },
    ],
    generationRuns: [
      {
        id: "generation_run_reserved",
        createdAt,
        status: "reserved",
      },
    ],
  });
}

function createFailedOnlyGamePack(): GamePack {
  const gameSpec = getDefaultTopDownGameSpecFixture();

  return parseGamePack({
    ...createValidatedGamePack(),
    id: "game_pack_failed_only",
    gameSpec,
    builds: [],
    checkpoints: [],
    failedAttempts: [
      {
        id: "failed_attempt_preflight",
        createdAt,
        stage: "spec-validation",
        summary: "A failed draft stayed out of creator-facing checkpoints.",
        gameSpecId: gameSpec.id,
        validationEvidenceIds: ["evidence_runtime_boot"],
      },
    ],
  });
}

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
}

function cloneRecord(record: StoredGamePackRecord): StoredGamePackRecord {
  return JSON.parse(JSON.stringify(record)) as StoredGamePackRecord;
}
