import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  createGamePackRepository,
  type GamePackStorageDriver,
  type StoredGamePackRecord,
} from "@/game-spec";
import { topDownPhaserTemplate } from "@/runtime/phaser";
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
});

function createGeneratedPhaserCanvas(): EditorGameCanvasSession {
  const activeGeneratedSpec = {
    generationRunId: "generation_run_saved_draft",
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
  getAllCalls = 0;
  readonly records: StoredGamePackRecord[] = [];

  async put(record: StoredGamePackRecord) {
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
