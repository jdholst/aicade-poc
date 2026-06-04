import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { useEditorSession } from "./use-editor-session";

const generationStages = [
  {
    title: "Booting the sandbox",
    detail: "Mounting the runtime iframe.",
    progress: 72,
  },
];

describe("useEditorSession", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("starts in Phaser AI mode without mounting the fixture runtime by default", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    expect(result.current.session.canvas.gameStatus).toEqual({
      state: "loading",
      message: "Ready to build project.",
    });
    expect(result.current.session.canvas.generationSource).toBe("phaser-ai");
  });

  it("starts with the hand-authored Phaser runtime in explicit fixture mode", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_PHASER_GENERATION_SOURCE", "fixture");

    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    expect(result.current.session.canvas.gameStatus).toEqual({
      state: "ready",
      message: "Phaser runtime is running in the sandbox.",
    });
    expect(result.current.session.canvas.generationSource).toBe("phaser-fixture");
    expect(result.current.session.canvas.activeGeneratedSpec).toBeNull();
  });

  it("asks for a prompt before generation when the editor opened without a query prompt", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    expect(result.current.session.chat.hasSubmittedPrompt).toBe(false);
    expect(result.current.session.chat.submittedPrompt).toBe("");
    expect(result.current.session.chat.canStartGeneration).toBe(false);

    act(() => {
      result.current.actions.chat.onPromptDraftChange("  build a moon maze  ");
    });

    expect(result.current.session.chat.canSubmitPrompt).toBe(true);

    act(() => {
      result.current.actions.chat.onPromptSubmit();
    });

    expect(result.current.session.chat.hasSubmittedPrompt).toBe(true);
    expect(result.current.session.chat.submittedPrompt).toBe(
      "build a moon maze"
    );
    expect(result.current.session.chat.canStartGeneration).toBe(true);
  });

  it("treats a query prompt as already submitted", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "a tiny arena survival game",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    expect(result.current.session.chat.hasSubmittedPrompt).toBe(true);
    expect(result.current.session.chat.promptDraft).toBe(
      "a tiny arena survival game"
    );
    expect(result.current.session.chat.submittedPrompt).toBe(
      "a tiny arena survival game"
    );
    expect(result.current.session.chat.canStartGeneration).toBe(true);
  });

  it("lets a submitted prompt reopen for editing before generation starts", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "a tiny arena survival game",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    act(() => {
      result.current.actions.chat.onPromptEdit();
    });

    expect(result.current.session.chat.isEditingPrompt).toBe(true);
    expect(result.current.session.chat.hasSubmittedPrompt).toBe(true);
    expect(result.current.session.chat.canStartGeneration).toBe(false);

    act(() => {
      result.current.actions.chat.onPromptDraftChange(
        "  a tiny arena puzzle game  "
      );
    });
    act(() => {
      result.current.actions.chat.onPromptSubmit();
    });

    expect(result.current.session.chat.isEditingPrompt).toBe(false);
    expect(result.current.session.chat.submittedPrompt).toBe(
      "a tiny arena puzzle game"
    );
    expect(result.current.session.chat.canStartGeneration).toBe(true);
  });

  it("starts in the generated Canvas initial state when the runtime override is canvas2d", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_EDITOR_RUNTIME", "canvas2d");

    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    expect(result.current.session.canvas.gameStatus).toEqual({
      state: "loading",
      message: "Ready to build project.",
    });
    expect(result.current.session.canvas.activeGeneratedSpec).toBeNull();
  });

  it("keeps the runtime status callback stable across status updates", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    const onGameStatusChange = result.current.actions.canvas.onGameStatusChange;

    act(() => {
      onGameStatusChange({ state: "loading" });
    });

    expect(result.current.actions.canvas.onGameStatusChange).toBe(
      onGameStatusChange
    );
  });

  it("persists recoverable runtime warnings separately from game status", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_PHASER_GENERATION_SOURCE", "fixture");

    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    const warning = {
      type: "mechanic-disabled" as const,
      severity: "warning" as const,
      recoverable: true as const,
      mechanicId: "mechanic_player_movement",
      mechanicType: "player_movement",
      phase: "install" as const,
      message:
        "Mechanic mechanic_player_movement install failed: Keyboard setup failed",
    };

    act(() => {
      result.current.actions.canvas.onGameStatusChange({
        state: "warning",
        issue: warning,
      });
      result.current.actions.canvas.onGameStatusChange({
        state: "warning",
        issue: warning,
      });
    });

    expect(result.current.session.canvas.gameStatus).toEqual({
      state: "ready",
      message: "Phaser runtime is running in the sandbox.",
    });
    expect(result.current.session.canvas.runtimeWarnings).toEqual([warning]);
  });

  it("clears runtime warnings when the runtime starts loading again", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    act(() => {
      result.current.actions.canvas.onGameStatusChange({
        state: "warning",
        issue: {
          type: "mechanic-disabled",
          severity: "warning",
          recoverable: true,
          mechanicId: "mechanic_player_movement",
          mechanicType: "player_movement",
          phase: "install",
          message:
            "Mechanic mechanic_player_movement install failed: Keyboard setup failed",
        },
      });
      result.current.actions.canvas.onGameStatusChange({ state: "loading" });
    });

    expect(result.current.session.canvas.runtimeWarnings).toEqual([]);
    expect(result.current.session.canvas.gameStatus).toEqual({
      state: "loading",
      message: "Booting runtime...",
    });
  });

  it("preserves fatal runtime errors in the editor game status", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "",
        enteredOpenAiApiKey: "",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "",
        generationStages,
        needsOpenAiApiKey: false,
        needsOpenAiModel: false,
      })
    );

    act(() => {
      result.current.actions.canvas.onGameStatusChange({
        state: "error",
        message: "Runtime crashed during boot.",
      });
    });

    expect(result.current.session.canvas.gameStatus).toEqual({
      state: "error",
      message: "Runtime crashed during boot.",
    });
  });

  it("routes Canvas generation through the starter-project API", async () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_EDITOR_RUNTIME", "canvas2d");
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        project: {
          name: "Canvas Test",
          summary: "A generated canvas project.",
        },
        manifest: {
          title: "Canvas Test",
          runtime: "canvas2d",
          editableSpecVersion: "game-spec/v1",
          genre: "arcade",
          viewport: { width: 800, height: 600, scaling: "fit" },
          controls: [],
          capabilities: [],
        },
        editableSpec: {},
        editorMetadata: { panels: [] },
        chatTranscript: [],
        moduleSourceTs: "export {};",
        moduleSourceJs: "",
      })
    );
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "make a paddle game",
        enteredOpenAiApiKey: "sk-test",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "gpt-5.4-mini",
        generationStages,
        needsOpenAiApiKey: true,
        needsOpenAiModel: true,
      })
    );

    act(() => {
      result.current.actions.chat.onStartGeneration();
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/starter-project",
        expect.objectContaining({
          method: "POST",
        })
      );
    });
  });

  it("stores successful Phaser Spec Generation as active generated spec state", async () => {
    const generatedSpec = getFirstValidTopDownGameSpecFixture();
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        spec: generatedSpec,
        metadata: {
          taskRoute: "spec_generation.primary",
          model: "gpt-5.4-mini",
          attemptCount: 1,
        },
      })
    );
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "make a top-down coin chase",
        enteredOpenAiApiKey: "sk-test",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "gpt-5.4-mini",
        generationStages,
        needsOpenAiApiKey: true,
        needsOpenAiModel: true,
      })
    );

    act(() => {
      result.current.actions.chat.onStartGeneration();
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/spec-generation",
        expect.objectContaining({
          method: "POST",
        })
      );
    });
    await waitFor(() => {
      expect(result.current.session.canvas.loadState).toMatchObject({
        status: "success",
        runtimeKind: "phaser",
        source: "phaser-spec",
        spec: generatedSpec,
      });
    });
    expect(result.current.session.canvas.loadState).not.toHaveProperty(
      "gamePack"
    );
    expect(result.current.session.canvas.activeGeneratedSpec).toEqual({
      metadata: {
        attemptCount: 1,
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      runtimeKind: "phaser",
      source: "phaser-spec",
      spec: generatedSpec,
    });

    act(() => {
      result.current.actions.canvas.onReset();
    });

    expect(result.current.session.canvas.activeGeneratedSpec?.spec).toEqual(
      generatedSpec
    );
    expect(result.current.session.canvas.gameResetNonce).toBe(1);
  });

  it("regenerates from an edited prompt after a successful generation", async () => {
    const generatedSpec = getFirstValidTopDownGameSpecFixture();
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        spec: generatedSpec,
        metadata: {
          taskRoute: "spec_generation.primary",
          model: "gpt-5.4-mini",
          attemptCount: 1,
        },
      })
    );
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "make a top-down coin chase",
        enteredOpenAiApiKey: "sk-test",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "gpt-5.4-mini",
        generationStages,
        needsOpenAiApiKey: true,
        needsOpenAiModel: true,
      })
    );

    act(() => {
      result.current.actions.chat.onStartGeneration();
    });

    await waitFor(() => {
      expect(result.current.session.canvas.loadState.status).toBe("success");
    });

    act(() => {
      result.current.actions.chat.onPromptEdit();
    });

    expect(result.current.session.chat.isEditingPrompt).toBe(true);

    act(() => {
      result.current.actions.chat.onPromptDraftChange(
        "  make a top-down stealth chase  "
      );
    });
    act(() => {
      result.current.actions.chat.onPromptRegenerate();
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    const secondRequestBody = JSON.parse(
      String(fetch.mock.calls[1]?.[1]?.body)
    );
    expect(secondRequestBody.enteredPrompt).toBe(
      "make a top-down stealth chase"
    );
    expect(result.current.session.chat.submittedPrompt).toBe(
      "make a top-down stealth chase"
    );
    expect(result.current.session.chat.isEditingPrompt).toBe(false);
  });

  it("preserves repaired Spec Generation metadata as active generated spec state", async () => {
    const generatedSpec = getFirstValidTopDownGameSpecFixture();
    const repairAttempts = [
      {
        attempt: 1,
        outcome: "failed_validation" as const,
        stage: "semantic_validation" as const,
        issues: [
          {
            path: "mechanics.mechanic_player_movement.entityIds",
            message: 'Unknown entity ID "entity_missing".',
          },
        ],
      },
    ];
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        spec: generatedSpec,
        metadata: {
          taskRoute: "spec_generation.primary",
          model: "gpt-5.4-mini",
          attemptCount: 2,
          repairStatus: "repaired",
          repairAttempts,
        },
      })
    );
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "make a top-down coin chase",
        enteredOpenAiApiKey: "sk-test",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "gpt-5.4-mini",
        generationStages,
        needsOpenAiApiKey: true,
        needsOpenAiModel: true,
      })
    );

    act(() => {
      result.current.actions.chat.onStartGeneration();
    });

    await waitFor(() => {
      expect(result.current.session.canvas.activeGeneratedSpec).toEqual({
        metadata: {
          attemptCount: 2,
          model: "gpt-5.4-mini",
          repairAttempts,
          repairStatus: "repaired",
          taskRoute: "spec_generation.primary",
        },
        runtimeKind: "phaser",
        source: "phaser-spec",
        spec: generatedSpec,
      });
    });
  });

  it("clears active generated spec state when regeneration fails", async () => {
    const generatedSpec = getFirstValidTopDownGameSpecFixture();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          spec: generatedSpec,
          metadata: {
            taskRoute: "spec_generation.primary",
            model: "gpt-5.4-mini",
            attemptCount: 1,
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: false,
            userMessage:
              "I designed a game plan, but it needs a clearer pickup goal.",
            stage: "mechanic_validation",
            validationIssues: [
              {
                path: "mechanics.mechanic_pickup_collection.assetIds",
                message: "Expected asset role \"pickup\".",
              },
            ],
            taskRoute: "spec_generation.primary",
            attemptCount: 1,
          },
          422
        )
      );
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "make a top-down coin chase",
        enteredOpenAiApiKey: "sk-test",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "gpt-5.4-mini",
        generationStages,
        needsOpenAiApiKey: true,
        needsOpenAiModel: true,
      })
    );

    act(() => {
      result.current.actions.chat.onStartGeneration();
    });

    await waitFor(() => {
      expect(result.current.session.canvas.activeGeneratedSpec?.spec).toEqual(
        generatedSpec
      );
    });

    act(() => {
      result.current.actions.chat.onRegenerateGame();
    });

    await waitFor(() => {
      expect(result.current.session.canvas.loadState).toMatchObject({
        status: "error",
        message: "I designed a game plan, but it needs a clearer pickup goal.",
      });
    });
    expect(result.current.session.canvas.activeGeneratedSpec).toBeNull();
  });

  it("does not call generation in explicit Phaser fixture mode", () => {
    vi.stubEnv("NEXT_PUBLIC_AICADE_PHASER_GENERATION_SOURCE", "fixture");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "make a top-down coin chase",
        enteredOpenAiApiKey: "sk-test",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "gpt-5.4-mini",
        generationStages,
        needsOpenAiApiKey: true,
        needsOpenAiModel: true,
      })
    );

    act(() => {
      result.current.actions.chat.onStartGeneration();
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.session.chat.canStartGeneration).toBe(false);
  });

  it("surfaces Spec Generation failures without mounting a fixture fallback", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          ok: false,
          userMessage:
            "I designed a game plan, but it needs a clearer pickup goal.",
          stage: "mechanic_validation",
          validationIssues: [
            {
              path: "mechanics.mechanic_pickup_collection.assetIds",
              message: "Expected asset role \"pickup\".",
            },
          ],
          taskRoute: "spec_generation.primary",
          attemptCount: 1,
          repairAttempts: [
            {
              attempt: 1,
              outcome: "failed_validation",
              stage: "mechanic_validation",
              issues: [
                {
                  path: "mechanics.mechanic_pickup_collection.assetIds",
                  message: "Expected asset role \"pickup\".",
                },
              ],
            },
            {
              attempt: 2,
              outcome: "repair_failed",
              stage: "mechanic_validation",
              issues: [
                {
                  path: "mechanics.mechanic_pickup_collection.assetIds",
                  message:
                    "Expected a referenced pickup asset to be placed in a pickup zone.",
                },
              ],
            },
          ],
        },
        422
      )
    );
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() =>
      useEditorSession({
        enteredPrompt: "make a top-down coin chase",
        enteredOpenAiApiKey: "sk-test",
        enteredOpenAiKeyword: "",
        enteredOpenAiModel: "gpt-5.4-mini",
        generationStages,
        needsOpenAiApiKey: true,
        needsOpenAiModel: true,
      })
    );

    act(() => {
      result.current.actions.chat.onStartGeneration();
    });

    await waitFor(() => {
      expect(result.current.session.canvas.loadState).toEqual({
        status: "error",
        message: "I designed a game plan, but it needs a clearer pickup goal.",
        validationFailure: {
          attemptCount: 1,
          issues: [
            {
              path: "mechanics.mechanic_pickup_collection.assetIds",
              message: "Expected asset role \"pickup\".",
            },
          ],
          repairAttempts: [
            {
              attempt: 1,
              outcome: "failed_validation",
              stage: "mechanic_validation",
              issues: [
                {
                  path: "mechanics.mechanic_pickup_collection.assetIds",
                  message: "Expected asset role \"pickup\".",
                },
              ],
            },
            {
              attempt: 2,
              outcome: "repair_failed",
              stage: "mechanic_validation",
              issues: [
                {
                  path: "mechanics.mechanic_pickup_collection.assetIds",
                  message:
                    "Expected a referenced pickup asset to be placed in a pickup zone.",
                },
              ],
            },
          ],
          stage: "mechanic_validation",
          taskRoute: "spec_generation.primary",
        },
      });
    });
    expect(result.current.session.canvas.gameStatus).toEqual({
      state: "error",
      message: "Generation could not produce a playable project.",
    });
  });
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
