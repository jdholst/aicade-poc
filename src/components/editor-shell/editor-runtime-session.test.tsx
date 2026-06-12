import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  createGamePackRepository,
  gamePackSchema,
  type GenerationRun,
  type GamePackStorageDriver,
  type StoredGamePackRecord,
} from "@/game-spec";
import {
  createEmptyGamePackFixture,
  createRepairedGenerationRunFixture,
  createSuccessfulGenerationRunFixture,
} from "@/game-spec/game-pack/testing/game-pack-fixtures";
import { topDownPhaserTemplate } from "@/runtime/phaser";
import { createGenerationRunTestRepository } from "@/service/generation-run/testing/generation-run-test-harness";
import type { EditorGameCanvasSession } from "@/hooks/use-editor-session";

import { useEditorRuntimeSession } from "./editor-runtime-session";

describe("useEditorRuntimeSession", () => {
  it("persists and restores a generated Phaser draft only after first-playable validation passes", async () => {
    const storage = new MemoryGamePackStorage();
    const repository = createGamePackRepository(storage);
    const canvas = createGeneratedPhaserCanvas();

    const { result, unmount } = renderHook(() =>
      useEditorRuntimeSession({
        canvas,
        gamePackRepository: repository,
        onGameStatusChange: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(storage.getAllCalls).toBe(1);
    });

    expect(storage.records).toHaveLength(0);

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
      result.current.handleRuntimeValidationEvidence({
        checkId: "nonblank_render",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "player_visible",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "input_response",
        status: "passed",
      });
    });

    await waitFor(() => {
      expect(storage.records).toHaveLength(1);
    });

    const savedGamePack = storage.records[0].gamePack;

    expect(savedGamePack).toMatchObject({
      checkpoints: [
        expect.objectContaining({
          id: "checkpoint_initial_playable",
        }),
      ],
      metadata: {
        generatedSpec: {
          attemptCount: 2,
          generationRunId: "generation_run_saved_draft",
          model: "gpt-5.4-mini",
          source: "phaser-spec",
          taskRoute: "spec_generation.primary",
        },
      },
    });

    unmount();

    const restored = renderHook(() =>
      useEditorRuntimeSession({
        canvas: createIdlePhaserAiCanvas(),
        gamePackRepository: repository,
        onGameStatusChange: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(restored.result.current.runtimeTemplate).toMatchObject({
        firstPlayableValidationSource: {
          gamePack: savedGamePack,
          source: "restored-game-pack",
        },
        type: "phaser-valid",
      });
    });
  });

  it("does not persist a generated Phaser draft when first-playable validation fails", async () => {
    const storage = new MemoryGamePackStorage();
    const repository = createGamePackRepository(storage);
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useEditorRuntimeSession({
        canvas: createGeneratedPhaserCanvas(),
        gamePackRepository: repository,
        onGameStatusChange,
      })
    );

    await waitFor(() => {
      expect(storage.getAllCalls).toBe(1);
    });

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
      result.current.handleRuntimeValidationEvidence({
        checkId: "input_response",
        status: "failed",
        message: "Runtime did not respond to movement input.",
      });
    });

    expect(onGameStatusChange).toHaveBeenLastCalledWith({
      state: "error",
      message: "Expected the runtime to report a response to movement input.",
    });
    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      status: "failed",
    });
    expect(storage.records).toHaveLength(0);
  });

  it("links a successful GenerationRun to persisted Game Pack outcome records", async () => {
    const storage = new MemoryGamePackStorage();
    const gamePackRepository = createGamePackRepository(storage);
    const generationRunTestRepository = createGenerationRunTestRepository();
    const generationRunId = "generation_run_durable_success";

    await generationRunTestRepository.repository.create(
      createRunningGenerationRun(generationRunId)
    );

    const { result } = renderHook(() =>
      useEditorRuntimeSession({
        canvas: createGeneratedPhaserCanvas({ generationRunId }),
        gamePackRepository,
        generationRunRepository: generationRunTestRepository.repository,
        onGameStatusChange: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(storage.getAllCalls).toBe(1);
    });

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
      result.current.handleRuntimeValidationEvidence({
        checkId: "nonblank_render",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "player_visible",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "input_response",
        status: "passed",
      });
    });

    await waitFor(() => {
      expect(storage.records).toHaveLength(1);
    });

    const savedGamePack = storage.records[0].gamePack;

    await waitFor(async () => {
      await expect(
        generationRunTestRepository.repository.fetch(generationRunId)
      ).resolves.toMatchObject({
        repairStatus: "not-needed",
        status: "succeeded",
        relationships: {
          gamePackId: savedGamePack.id,
          gameSpecId: savedGamePack.gameSpec.id,
          buildIds: savedGamePack.builds.map((build) => build.id),
          checkpointIds: savedGamePack.checkpoints.map(
            (checkpoint) => checkpoint.id
          ),
          validationEvidenceIds: savedGamePack.validationEvidence.map(
            (evidence) => evidence.id
          ),
        },
      });
    });

    const finalizedRun =
      await generationRunTestRepository.repository.fetch(generationRunId);

    expect(
      gamePackSchema.safeParse({
        ...savedGamePack,
        generationRuns: finalizedRun ? [finalizedRun] : [],
      }).success
    ).toBe(true);
  });

  it("links a repaired GenerationRun once to the persisted final outcome records", async () => {
    const storage = new MemoryGamePackStorage();
    const gamePackRepository = createGamePackRepository(storage);
    const generationRunTestRepository = createGenerationRunTestRepository();
    const generationRunId = "generation_run_repaired_durable_success";

    await generationRunTestRepository.repository.create(
      createRunningRepairedGenerationRun(generationRunId)
    );

    const { result } = renderHook(() =>
      useEditorRuntimeSession({
        canvas: createGeneratedPhaserCanvas({ generationRunId }),
        gamePackRepository,
        generationRunRepository: generationRunTestRepository.repository,
        onGameStatusChange: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(storage.getAllCalls).toBe(1);
    });

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
      result.current.handleRuntimeValidationEvidence({
        checkId: "nonblank_render",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "player_visible",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "input_response",
        status: "passed",
      });
    });

    await waitFor(() => {
      expect(storage.records).toHaveLength(1);
    });

    const savedGamePack = storage.records[0].gamePack;

    await waitFor(async () => {
      await expect(
        generationRunTestRepository.repository.fetch(generationRunId)
      ).resolves.toMatchObject({
        id: generationRunId,
        repairStatus: "repaired",
        status: "succeeded",
        relationships: {
          gamePackId: savedGamePack.id,
          gameSpecId: savedGamePack.gameSpec.id,
          buildIds: savedGamePack.builds.map((build) => build.id),
          checkpointIds: savedGamePack.checkpoints.map(
            (checkpoint) => checkpoint.id
          ),
          validationEvidenceIds: savedGamePack.validationEvidence.map(
            (evidence) => evidence.id
          ),
        },
      });
    });

    const generationRuns = await generationRunTestRepository.repository.list();

    expect(generationRuns).toHaveLength(1);
    expect(generationRuns).toMatchObject([
      {
        id: generationRunId,
        attempts: expect.arrayContaining([
          expect.objectContaining({
            kind: "initial",
            status: "failed",
          }),
          expect.objectContaining({
            kind: "repair",
            status: "succeeded",
          }),
        ]),
      },
    ]);
  });

  it("does not link a successful GenerationRun when the durable Game Pack save fails", async () => {
    const storage = new MemoryGamePackStorage({ failOnPut: true });
    const gamePackRepository = createGamePackRepository(storage);
    const generationRunTestRepository = createGenerationRunTestRepository();
    const generationRunId = "generation_run_save_failed";

    await generationRunTestRepository.repository.create(
      createRunningGenerationRun(generationRunId)
    );

    const { result } = renderHook(() =>
      useEditorRuntimeSession({
        canvas: createGeneratedPhaserCanvas({ generationRunId }),
        gamePackRepository,
        generationRunRepository: generationRunTestRepository.repository,
        onGameStatusChange: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(storage.getAllCalls).toBe(1);
    });

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
      result.current.handleRuntimeValidationEvidence({
        checkId: "nonblank_render",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "player_visible",
        status: "passed",
      });
      result.current.handleRuntimeValidationEvidence({
        checkId: "input_response",
        status: "passed",
      });
    });

    await waitFor(() => {
      expect(storage.putCalls).toBe(1);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const generationRun =
      await generationRunTestRepository.repository.fetch(generationRunId);

    expect(generationRun).toMatchObject({
      status: "running",
    });
    expect(generationRun?.relationships).toBeUndefined();
  });
});

function createGeneratedPhaserCanvas({
  generationRunId = "generation_run_saved_draft",
}: {
  generationRunId?: GenerationRun["id"];
} = {}): EditorGameCanvasSession {
  const activeGeneratedSpec = {
    generationRunId,
    metadata: {
      attemptCount: 2,
      model: "gpt-5.4-mini" as const,
      taskRoute: "spec_generation.primary",
    },
    runtimeKind: "phaser" as const,
    source: "phaser-spec" as const,
    spec: topDownPhaserTemplate.gameSpec,
  };

  return {
    activeGeneratedSpec,
    currentGenerationStage: {
      detail: "Checking generated draft.",
      progress: 72,
      title: "Checking the project",
    },
    gameResetNonce: 0,
    gameStatus: {
      state: "loading",
      message: "Booting runtime...",
    },
    generationSource: "phaser-ai",
    isGamePaused: false,
    loadState: {
      ...activeGeneratedSpec,
      status: "success",
    },
    runtimeWarnings: [],
  };
}

function createIdlePhaserAiCanvas(): EditorGameCanvasSession {
  return {
    activeGeneratedSpec: null,
    currentGenerationStage: {
      detail: "Waiting for a prompt.",
      progress: 0,
      title: "Ready",
    },
    gameResetNonce: 0,
    gameStatus: {
      state: "loading",
      message: "Waiting for generated project...",
    },
    generationSource: "phaser-ai",
    isGamePaused: false,
    loadState: {
      status: "idle",
    },
    runtimeWarnings: [],
  };
}

class MemoryGamePackStorage implements GamePackStorageDriver {
  constructor(
    private readonly options: { failOnPut?: boolean } = {}
  ) {}

  getAllCalls = 0;
  putCalls = 0;
  readonly records: StoredGamePackRecord[] = [];

  async put(record: StoredGamePackRecord) {
    this.putCalls += 1;

    if (this.options.failOnPut) {
      throw new Error("Failed to save Game Pack.");
    }

    const existingIndex = this.records.findIndex(
      (item) => item.id === record.id
    );
    const nextRecord = cloneRecord(record);

    if (existingIndex === -1) {
      this.records.push(nextRecord);
      return;
    }

    this.records[existingIndex] = nextRecord;
  }

  async get(gamePackId: string) {
    return this.records.find((record) => record.id === gamePackId) ?? null;
  }

  async getAll() {
    this.getAllCalls += 1;

    return this.records.map(cloneRecord);
  }
}

function cloneRecord(record: StoredGamePackRecord): StoredGamePackRecord {
  return JSON.parse(JSON.stringify(record)) as StoredGamePackRecord;
}

function createRunningGenerationRun(id: GenerationRun["id"]): GenerationRun {
  const gamePack = createEmptyGamePackFixture({
    gameSpec: topDownPhaserTemplate.gameSpec,
    runtimeKind: "phaser",
    templateId: topDownPhaserTemplate.gameSpec.template.id,
  });
  const successfulRun = createSuccessfulGenerationRunFixture(gamePack, { id });

  return {
    id: successfulRun.id,
    operationType: successfulRun.operationType,
    status: "running",
    createdAt: successfulRun.createdAt,
    startedAt: successfulRun.startedAt,
    request: successfulRun.request,
    runtimeKind: successfulRun.runtimeKind,
    templateId: successfulRun.templateId,
    mechanicIds: successfulRun.mechanicIds,
    attempts: successfulRun.attempts,
  };
}

function createRunningRepairedGenerationRun(
  id: GenerationRun["id"]
): GenerationRun {
  const gamePack = createEmptyGamePackFixture({
    gameSpec: topDownPhaserTemplate.gameSpec,
    runtimeKind: "phaser",
    templateId: topDownPhaserTemplate.gameSpec.template.id,
  });
  const repairedRun = createRepairedGenerationRunFixture(gamePack, { id });

  return {
    id: repairedRun.id,
    operationType: repairedRun.operationType,
    status: "running",
    createdAt: repairedRun.createdAt,
    startedAt: repairedRun.startedAt,
    request: repairedRun.request,
    runtimeKind: repairedRun.runtimeKind,
    templateId: repairedRun.templateId,
    mechanicIds: repairedRun.mechanicIds,
    attempts: repairedRun.attempts,
  };
}
