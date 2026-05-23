import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { topDownPhaserTemplate } from "@/runtime/phaser";

import { useFirstPlayableValidationGate } from "./editor-first-playable-validation-gate";
import type { FirstPlayableValidationSource } from "./editor-runtime-template-plan";

type GateInput = Parameters<typeof useFirstPlayableValidationGate>[0];

const validationSource: FirstPlayableValidationSource = {
  gameSpec: topDownPhaserTemplate.gameSpec,
  runtimeCandidate: {
    runtimeDependencyScriptPaths:
      topDownPhaserTemplate.runtimeDependencyScriptPaths,
    runtimeKind: "phaser",
    runtimeScriptPath: topDownPhaserTemplate.runtimeScriptPath,
    templateId: topDownPhaserTemplate.gameSpec.template.id,
  },
  runtimeKind: "phaser",
};

function createInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    gameResetNonce: 0,
    loadStateStatus: "idle",
    onGameStatusChange: vi.fn(),
    validationSource,
    ...overrides,
  };
}

describe("useFirstPlayableValidationGate", () => {
  it("starts a first-playable attempt for a valid Phaser runtime", () => {
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(createInput())
    );

    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      gamePackId: `game_pack_${topDownPhaserTemplate.gameSpec.id.replace(
        /^game_/,
        ""
      )}`,
      shouldBlockPlayable: false,
      status: "running",
      evidence: expect.arrayContaining([
        expect.objectContaining({
          checkId: "basic_objective_presence",
          status: "passed",
        }),
        expect.objectContaining({
          checkId: "runtime_template_entrypoint",
          status: "passed",
        }),
      ]),
    });
    expect(result.current.firstPlayableGamePack).toMatchObject({
      builds: [],
      checkpoints: [],
      failedAttempts: [],
    });
  });

  it("stays inactive outside a mountable Phaser runtime", () => {
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(
        createInput({
          onGameStatusChange,
          validationSource: null,
        })
      )
    );

    expect(result.current.firstPlayableValidationAttempt).toBeNull();
    expect(result.current.firstPlayableGamePack).toBeNull();

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
    });

    expect(onGameStatusChange).toHaveBeenCalledWith({ state: "ready" });
  });

  it("records runtime boot success, forwards ready status, and waits for runtime evidence", () => {
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(createInput({ onGameStatusChange }))
    );

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
    });

    expect(onGameStatusChange).toHaveBeenCalledWith({ state: "ready" });
    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      shouldBlockPlayable: false,
      status: "running",
      evidence: expect.arrayContaining([
        expect.objectContaining({
          checkId: "runtime_boot",
          status: "passed",
        }),
      ]),
    });
    expect(result.current.firstPlayableGamePack).toMatchObject({
      builds: [],
      checkpoints: [],
      failedAttempts: [],
    });
  });

  it("passes after nonblank, player, and input runtime evidence all pass", () => {
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(createInput({ onGameStatusChange }))
    );

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

    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      shouldBlockPlayable: false,
      status: "passed",
      evidence: expect.arrayContaining([
        expect.objectContaining({
          checkId: "nonblank_render",
          status: "passed",
        }),
        expect.objectContaining({
          checkId: "player_visible",
          status: "passed",
        }),
        expect.objectContaining({
          checkId: "input_response",
          status: "passed",
        }),
      ]),
    });
    expect(result.current.firstPlayableGamePack).toMatchObject({
      builds: [
        expect.objectContaining({
          id: "build_initial_playable",
          checkpointId: "checkpoint_initial_playable",
          status: "validated",
        }),
      ],
      checkpoints: [
        expect.objectContaining({
          id: "checkpoint_initial_playable",
          buildId: "build_initial_playable",
        }),
      ],
      failedAttempts: [],
    });
  });

  it("blocks editor state when runtime validation evidence fails", () => {
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(createInput({ onGameStatusChange }))
    );

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
      result.current.handleRuntimeValidationEvidence({
        checkId: "input_response",
        status: "failed",
        message: "Runtime did not respond to movement input.",
        issues: [
          {
            code: "input_probe_no_velocity",
            path: "runtime.input",
            message: "Runtime did not respond to movement input.",
          },
        ],
      });
    });

    expect(onGameStatusChange).toHaveBeenLastCalledWith({
      state: "error",
      message: "Runtime did not respond to movement input.",
    });
    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      failureMessage: "Runtime did not respond to movement input.",
      shouldBlockPlayable: true,
      status: "failed",
    });
    expect(result.current.firstPlayableGamePack).toMatchObject({
      builds: [
        expect.objectContaining({
          id: "build_failed_first_playable",
          status: "failed",
        }),
      ],
      checkpoints: [],
      failedAttempts: [
        expect.objectContaining({
          id: "failed_attempt_first_playable_runtime",
          buildId: "build_failed_first_playable",
        }),
      ],
    });
  });

  it("records fatal runtime errors as blocking editor errors", () => {
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(createInput({ onGameStatusChange }))
    );

    act(() => {
      result.current.handleRuntimeStatusChange({
        state: "error",
        message: "Runtime crashed during boot.",
      });
    });

    expect(onGameStatusChange).toHaveBeenCalledWith({
      state: "error",
      message: "Runtime crashed during boot.",
    });
    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      failureMessage: "Runtime crashed during boot.",
      shouldBlockPlayable: true,
      status: "failed",
    });
    expect(result.current.firstPlayableGamePack).toMatchObject({
      builds: [
        expect.objectContaining({
          id: "build_failed_first_playable",
          status: "failed",
        }),
      ],
      failedAttempts: [
        expect.objectContaining({
          id: "failed_attempt_first_playable_runtime",
          buildId: "build_failed_first_playable",
        }),
      ],
    });
  });

  it("blocks before boot when the Game Spec has no primary objective", () => {
    const gameSpec = {
      ...topDownPhaserTemplate.gameSpec,
      objectives: topDownPhaserTemplate.gameSpec.objectives.map(
        (objective) => ({
          ...objective,
          primary: false,
        })
      ),
    };
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(
        createInput({
          validationSource: {
            gameSpec,
            runtimeCandidate: {
              ...validationSource.runtimeCandidate,
            },
            runtimeKind: "phaser",
          },
        })
      )
    );

    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      failureMessage: "Expected exactly one primary objective.",
      shouldBlockPlayable: true,
      status: "failed",
    });
    expect(result.current.firstPlayableGamePack).toMatchObject({
      builds: [],
      checkpoints: [],
      failedAttempts: [
        expect.objectContaining({
          id: "failed_attempt_first_playable_pre_runtime",
        }),
      ],
    });
  });

  it("starts a new attempt when the runtime reset key changes", () => {
    const initialInput = createInput();
    const { rerender, result } = renderHook(
      (input: GateInput) => useFirstPlayableValidationGate(input),
      {
        initialProps: initialInput,
      }
    );

    act(() => {
      result.current.handleRuntimeStatusChange({
        state: "error",
        message: "Runtime crashed during boot.",
      });
    });

    expect(result.current.firstPlayableValidationAttempt?.status).toBe(
      "failed"
    );

    rerender({
      ...initialInput,
      gameResetNonce: 1,
    });

    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      shouldBlockPlayable: false,
      status: "running",
    });
  });
});
