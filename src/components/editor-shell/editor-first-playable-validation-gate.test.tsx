import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  topDownPhaserTemplate,
  type TopDownPhaserTemplateState,
} from "@/runtime/phaser";

import { useFirstPlayableValidationGate } from "./editor-first-playable-validation-gate";

type GateInput = Parameters<typeof useFirstPlayableValidationGate>[0];

const validPhaserState: TopDownPhaserTemplateState = {
  status: "valid",
  template: topDownPhaserTemplate,
};

const invalidPhaserState: TopDownPhaserTemplateState = {
  status: "invalid",
  issues: [
    {
      path: "mechanics.mechanic_player_movement.targetIds",
      message: 'Expected target role "player".',
    },
  ],
  message:
    'mechanics.mechanic_player_movement.targetIds: Expected target role "player".',
};

function createInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    gameResetNonce: 0,
    loadStateStatus: "idle",
    onGameStatusChange: vi.fn(),
    phaserTemplateState: validPhaserState,
    runtimeMode: "phaser",
    ...overrides,
  };
}

describe("useFirstPlayableValidationGate", () => {
  it("starts a first-playable attempt for a valid Phaser runtime", () => {
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(createInput())
    );

    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      gamePackId: "game_pack_crystal_spec_chase",
      shouldBlockPlayable: false,
      status: "running",
      evidence: [
        expect.objectContaining({
          checkId: "basic_objective_presence",
          status: "passed",
        }),
      ],
    });
  });

  it("stays inactive outside a mountable Phaser runtime", () => {
    const onGameStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useFirstPlayableValidationGate(
        createInput({
          onGameStatusChange,
          phaserTemplateState: invalidPhaserState,
        })
      )
    );

    expect(result.current.firstPlayableValidationAttempt).toBeNull();

    act(() => {
      result.current.handleRuntimeStatusChange({ state: "ready" });
    });

    expect(onGameStatusChange).toHaveBeenCalledWith({ state: "ready" });
  });

  it("records runtime boot success and forwards ready status", () => {
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
      status: "passed",
      evidence: expect.arrayContaining([
        expect.objectContaining({
          checkId: "runtime_boot",
          status: "passed",
        }),
      ]),
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
          phaserTemplateState: {
            status: "valid",
            template: {
              ...topDownPhaserTemplate,
              gameSpec,
            },
          },
        })
      )
    );

    expect(result.current.firstPlayableValidationAttempt).toMatchObject({
      failureMessage:
        "The Game Spec needs one primary objective before the runtime can be presented as playable.",
      shouldBlockPlayable: true,
      status: "failed",
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
