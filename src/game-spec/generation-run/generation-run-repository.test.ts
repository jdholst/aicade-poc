import { describe, expect, it } from "vitest";

import {
  createFailedGenerationRunFixture,
  createSuccessfulGenerationRunFixture,
  createValidatedGamePackFixture,
  GAME_PACK_FIXTURE_LATER_UPDATED_AT,
  GAME_PACK_FIXTURE_UPDATED_AT,
} from "../game-pack/testing/game-pack-fixtures";
import {
  GenerationRunRepositoryError,
  createIndexedDbGenerationRunRepository,
  createGenerationRunRepository,
  type GenerationRunStorageDriver,
  type StoredGenerationRunRecord,
} from "./generation-run-repository";

describe("GenerationRun repository", () => {
  it("creates, fetches, and lists GenerationRun receipts through the repository boundary", async () => {
    const storage = new MemoryGenerationRunStorage();
    const firstRepository = createGenerationRunRepository(storage);
    const gamePack = createValidatedGamePackFixture();
    const generationRun = createSuccessfulGenerationRunFixture(gamePack);

    await expect(firstRepository.create(generationRun)).resolves.toEqual(
      generationRun
    );

    const reloadedRepository = createGenerationRunRepository(storage);

    await expect(reloadedRepository.fetch(generationRun.id)).resolves.toEqual(
      generationRun
    );
    await expect(reloadedRepository.list()).resolves.toEqual([generationRun]);
    expect(storage.records.get(generationRun.id)).toMatchObject({
      id: generationRun.id,
      recordVersion: 1,
      status: "succeeded",
    });
  });

  it("updates an existing GenerationRun and keeps partial running receipts durable across repository instances", async () => {
    const storage = new MemoryGenerationRunStorage();
    const repository = createGenerationRunRepository(storage);
    const gamePack = createValidatedGamePackFixture();
    const initialAttempt =
      createSuccessfulGenerationRunFixture(gamePack).attempts[0];
    const runningRun = createSuccessfulGenerationRunFixture(gamePack, {
      id: "generation_run_running_prompt",
      status: "running",
      repairStatus: undefined,
      completedAt: undefined,
      durationMs: undefined,
      attempts: [
        {
          ...initialAttempt,
          id: "generation_attempt_running",
          status: "running",
          completedAt: undefined,
          durationMs: undefined,
          validation: undefined,
          candidate: undefined,
        },
      ],
    });

    await repository.create(runningRun);

    await expect(
      createGenerationRunRepository(storage).fetch(runningRun.id)
    ).resolves.toEqual(runningRun);

    const completedRun = await repository.update(runningRun.id, (current) => ({
      ...current,
      status: "succeeded",
      repairStatus: "not-needed",
      completedAt: GAME_PACK_FIXTURE_LATER_UPDATED_AT,
      durationMs: 10_000,
      attempts: [
        {
          ...current.attempts[0],
          status: "succeeded",
          completedAt: GAME_PACK_FIXTURE_LATER_UPDATED_AT,
          durationMs: 10_000,
          validation: {
            stage: "mechanic-validation",
            status: "passed",
            issues: [],
          },
        },
      ],
    }));

    expect(completedRun).toMatchObject({
      id: runningRun.id,
      status: "succeeded",
      completedAt: GAME_PACK_FIXTURE_LATER_UPDATED_AT,
    });
    await expect(repository.fetch(runningRun.id)).resolves.toEqual(completedRun);
  });

  it("persists failed pre-project runs without Game Pack relationships", async () => {
    const repository = createGenerationRunRepository(
      new MemoryGenerationRunStorage()
    );
    const gamePack = createValidatedGamePackFixture();
    const preProjectFailure = createFailedGenerationRunFixture(gamePack, {
      id: "generation_run_pre_project_failure",
      relationships: undefined,
    });

    await expect(repository.create(preProjectFailure)).resolves.toEqual(
      preProjectFailure
    );
    await expect(repository.fetch(preProjectFailure.id)).resolves.toEqual(
      preProjectFailure
    );
    expect(preProjectFailure.relationships).toBeUndefined();
  });

  it("persists project-backed relationship links without requiring optional cost data", async () => {
    const repository = createGenerationRunRepository(
      new MemoryGenerationRunStorage()
    );
    const gamePack = createValidatedGamePackFixture();
    const successfulRun = createSuccessfulGenerationRunFixture(gamePack);
    const runWithoutCost = createSuccessfulGenerationRunFixture(gamePack, {
      id: "generation_run_project_backed_without_cost",
      cost: undefined,
      attempts: [
        {
          ...successfulRun.attempts[0],
          usage: undefined,
          cost: undefined,
        },
      ],
    });

    await repository.create(runWithoutCost);

    const fetchedRun = await repository.fetch(runWithoutCost.id);

    expect(fetchedRun).toMatchObject({
      id: runWithoutCost.id,
      relationships: {
        gamePackId: gamePack.id,
        gameSpecId: gamePack.gameSpec.id,
        buildIds: ["build_initial_playable"],
        checkpointIds: ["checkpoint_initial_playable"],
        validationEvidenceIds: ["evidence_runtime_boot"],
      },
    });
    expect(fetchedRun).not.toHaveProperty("cost");
    expect(fetchedRun?.attempts[0]).not.toHaveProperty("cost");
    expect(fetchedRun?.attempts[0]).not.toHaveProperty("usage");
  });

  it("lists GenerationRuns by latest receipt time and deletes or clears stored receipts", async () => {
    const repository = createGenerationRunRepository(
      new MemoryGenerationRunStorage()
    );
    const gamePack = createValidatedGamePackFixture();
    const olderRun = createSuccessfulGenerationRunFixture(gamePack, {
      id: "generation_run_older",
      completedAt: GAME_PACK_FIXTURE_UPDATED_AT,
    });
    const newerRun = createSuccessfulGenerationRunFixture(gamePack, {
      id: "generation_run_newer",
      completedAt: GAME_PACK_FIXTURE_LATER_UPDATED_AT,
    });

    await repository.create(olderRun);
    await repository.create(newerRun);

    await expect(repository.list()).resolves.toEqual([newerRun, olderRun]);

    await repository.delete(olderRun.id);

    await expect(repository.fetch(olderRun.id)).resolves.toBeNull();
    await expect(repository.list()).resolves.toEqual([newerRun]);

    await repository.clear();

    await expect(repository.list()).resolves.toEqual([]);
  });

  it("throws a typed error when IndexedDB is unavailable", async () => {
    const repository = createIndexedDbGenerationRunRepository({
      indexedDB: null,
    });

    await expect(repository.list()).rejects.toBeInstanceOf(
      GenerationRunRepositoryError
    );
    await expect(repository.list()).rejects.toMatchObject({
      code: "indexeddb_unavailable",
      operation: "open",
    });
  });
});

class MemoryGenerationRunStorage implements GenerationRunStorageDriver {
  readonly records = new Map<string, StoredGenerationRunRecord>();

  async put(record: StoredGenerationRunRecord) {
    this.records.set(record.id, cloneRecord(record));
  }

  async get(generationRunId: string) {
    const record = this.records.get(generationRunId);

    return record ? cloneRecord(record) : null;
  }

  async getAll() {
    return Array.from(this.records.values()).map(cloneRecord);
  }

  async delete(generationRunId: string) {
    this.records.delete(generationRunId);
  }

  async clear() {
    this.records.clear();
  }
}

function cloneRecord(
  record: StoredGenerationRunRecord
): StoredGenerationRunRecord {
  return JSON.parse(JSON.stringify(record)) as StoredGenerationRunRecord;
}
