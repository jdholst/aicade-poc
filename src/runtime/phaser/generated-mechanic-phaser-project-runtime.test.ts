import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createInitialGamePack,
  type PreparedGeneratedMechanicRuntimeProject,
} from "@/game-spec";
import { createGeneratedMechanicProjectFixture } from "@/game-spec/game-pack/testing/generated-mechanic-project-fixtures";
import {
  generatedMechanicRuntimeCandidateSchema,
  projectAcceptedGeneratedMechanicRuntimeCandidate,
} from "@/game-spec/mechanics/generated-mechanic-project-artifact";
import type { RuntimeValidationEvidence } from "@/runtime/runtime-adapter";
import { isGeneratedMechanicProjectRuntimeAuthentic } from "@/runtime/mechanics/generated-mechanic-project-runtime";

import type {
  CreateGeneratedMechanicPhaserRuntimeControllerInput,
  GeneratedMechanicPhaserRuntimeController,
} from "./generated-mechanic-phaser-runtime-controller";
import { createGeneratedMechanicPhaserProjectRuntime } from "./generated-mechanic-phaser-project-runtime";
import { createTopDownPhaserTemplate } from "./top-down-template";

const fixture = createGeneratedMechanicProjectFixture();
const startedAt = "2026-08-13T14:00:00.000Z";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("createGeneratedMechanicPhaserProjectRuntime", () => {
  it("runs a candidate through the real first-playable services without inventing accepted lineage", async () => {
    const evidence = createPassingRuntimeEvidence();
    let controllerInput:
      | CreateGeneratedMechanicPhaserRuntimeControllerInput
      | undefined;
    const dispose = vi.fn();
    const runFirstPlayableChecks = vi.fn(async () => {
      controllerInput?.options?.onStatusChange?.({ state: "ready" });
      for (const item of evidence) {
        controllerInput?.options?.onValidationEvidence?.(item);
      }
      return { status: "passed" as const, evidence };
    });
    const createController = vi.fn((
      input: CreateGeneratedMechanicPhaserRuntimeControllerInput
    ) => {
      controllerInput = input;
      return createControllerDouble({
        dispose,
        runFirstPlayableChecks,
      });
    });
    const project = createCandidateProject();
    const gamePack = createUnacceptedGamePack();
    const runtime = createGeneratedMechanicPhaserProjectRuntime({
      createController,
      now: createClock([
        startedAt,
        "2026-08-13T14:00:00.100Z",
        "2026-08-13T14:00:00.200Z",
        "2026-08-13T14:00:00.300Z",
        "2026-08-13T14:00:00.400Z",
      ]),
      ownerDocument: document,
    });

    const loadedDependency = await runtime.loadProjectDependency(project);
    const activation = await runtime.installTrustedTemplate({
      finalGameSpec: fixture.dependency.finalGameSpec,
      loadedDependency,
    });
    const result = await runtime.runFirstPlayableBrowserChecks({
      activation,
      finalGameSpec: fixture.dependency.finalGameSpec,
      gamePack,
    });

    expect(isGeneratedMechanicProjectRuntimeAuthentic(runtime)).toBe(true);
    expect(createController).toHaveBeenCalledTimes(1);
    expect(controllerInput?.generatedMechanicProject).toBe(
      loadedDependency.project
    );
    expect(controllerInput?.template).toEqual(
      createTopDownPhaserTemplate(fixture.dependency.finalGameSpec.gameSpec)
    );
    expect(controllerInput?.mount).toBeInstanceOf(HTMLDivElement);
    expect(controllerInput?.mount.isConnected).toBe(true);
    expect(controllerInput?.mount.getAttribute("aria-hidden")).toBe("true");
    expect(controllerInput?.mount.style.position).toBe("fixed");
    expect(controllerInput?.mount.style.left).toBe("-10000px");
    expect(runFirstPlayableChecks).toHaveBeenCalledOnce();
    expect(result.attempt).toMatchObject({
      gamePackId: gamePack.id,
      shouldBlockPlayable: false,
      startedAt,
      status: "passed",
    });
    expect(result.attempt.evidence.map(({ checkId }) => checkId)).toEqual([
      "basic_objective_presence",
      "player_entity_presence",
      "first_playable_reference_consistency",
      "runtime_template_entrypoint",
      "render_placeholder_asset_refs",
      "runtime_boot",
      "nonblank_render",
      "player_visible",
      "input_response",
    ]);
    expect(result.attempt.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: "runtime_boot",
          durationMs: 100,
          status: "passed",
        }),
        expect.objectContaining({
          checkId: "nonblank_render",
          durationMs: 200,
          evidence: {
            source: "runtime-self-report",
            renderedObjectCount: 3,
          },
          status: "passed",
        }),
      ])
    );
    expect(gamePack.builds).toEqual([]);
    expect(gamePack.checkpoints).toEqual([]);
    expect(gamePack.acceptedGeneratedMechanicArtifacts).toBeUndefined();
    expect(
      "runtimeCandidate" in result.activation.project
        ? result.activation.project.runtimeCandidate.runtimeExecutionId
        : null
    ).toBe("runtime_execution_generation_run_ticket_16_5");
  });

  it("returns failed browser evidence as a terminal attempt without creating lineage", async () => {
    const failedEvidence = {
      checkId: "nonblank_render",
      status: "failed",
      message: "The canvas remained blank.",
      issues: [
        {
          code: "blank_runtime_render",
          path: "runtime.render",
          message: "Expected a rendered object.",
        },
      ],
    } satisfies RuntimeValidationEvidence;
    let controllerInput:
      | CreateGeneratedMechanicPhaserRuntimeControllerInput
      | undefined;
    const createController = vi.fn((
      input: CreateGeneratedMechanicPhaserRuntimeControllerInput
    ) => {
      controllerInput = input;
      return createControllerDouble({
        runFirstPlayableChecks: vi.fn(async () => {
          input.options?.onStatusChange?.({ state: "ready" });
          input.options?.onValidationEvidence?.(failedEvidence);
          return {
            status: "failed" as const,
            evidence: [failedEvidence],
          };
        }),
      });
    });
    const project = createCandidateProject();
    const gamePack = createUnacceptedGamePack();
    const runtime = createGeneratedMechanicPhaserProjectRuntime({
      createController,
      now: createClock([
        startedAt,
        "2026-08-13T14:00:00.100Z",
        "2026-08-13T14:00:00.200Z",
      ]),
      ownerDocument: document,
    });

    const loadedDependency = await runtime.loadProjectDependency(project);
    const activation = await runtime.installTrustedTemplate({
      finalGameSpec: fixture.dependency.finalGameSpec,
      loadedDependency,
    });
    const result = await runtime.runFirstPlayableBrowserChecks({
      activation,
      finalGameSpec: fixture.dependency.finalGameSpec,
      gamePack,
    });

    expect(controllerInput).toBeDefined();
    expect(result.attempt).toMatchObject({
      gamePackId: gamePack.id,
      shouldBlockPlayable: true,
      status: "failed",
      failureMessage: "Expected a rendered object.",
    });
    expect(result.attempt.evidence).toContainEqual(
      expect.objectContaining({
        checkId: "nonblank_render",
        durationMs: 200,
        status: "failed",
        issues: [
          {
            code: "blank_runtime_render",
            path: "runtime.render",
            message: "Expected a rendered object.",
          },
        ],
      })
    );
    expect(gamePack.builds).toEqual([]);
    expect(gamePack.checkpoints).toEqual([]);
  });

  it("rejects a controller result that was not delivered through its authenticated evidence callback", async () => {
    const evidence = createPassingRuntimeEvidence();
    const runtime = createGeneratedMechanicPhaserProjectRuntime({
      createController: () =>
        createControllerDouble({
          runFirstPlayableChecks: vi.fn(async () => ({
            status: "passed" as const,
            evidence,
          })),
        }),
      now: () => startedAt,
      ownerDocument: document,
    });
    const project = createCandidateProject();
    const loadedDependency = await runtime.loadProjectDependency(project);
    const activation = await runtime.installTrustedTemplate({
      finalGameSpec: fixture.dependency.finalGameSpec,
      loadedDependency,
    });

    await expect(
      runtime.runFirstPlayableBrowserChecks({
        activation,
        finalGameSpec: fixture.dependency.finalGameSpec,
        gamePack: createUnacceptedGamePack(),
      })
    ).rejects.toThrow(/authenticated runtime callback/i);
  });

  it("disposes one accepted-project controller and its hidden mount exactly once", async () => {
    const dispose = vi.fn();
    let mount: HTMLElement | undefined;
    const runtime = createGeneratedMechanicPhaserProjectRuntime({
      createController: (input) => {
        mount = input.mount;
        return createControllerDouble({ dispose });
      },
      ownerDocument: document,
    });
    const acceptedProject = {
      artifact: fixture.artifact,
      dependency: fixture.dependency,
    } satisfies PreparedGeneratedMechanicRuntimeProject;
    const loadedDependency = await runtime.loadProjectDependency(
      acceptedProject
    );
    const activation = await runtime.installTrustedTemplate({
      finalGameSpec: fixture.dependency.finalGameSpec,
      loadedDependency,
    });

    expect(mount?.isConnected).toBe(true);
    expect(loadedDependency.project).toHaveProperty(
      "artifact.id",
      fixture.artifact.id
    );
    await runtime.disposeProjectDependency({ activation, loadedDependency });
    await runtime.disposeProjectDependency({ activation, loadedDependency });

    expect(dispose).toHaveBeenCalledOnce();
    expect(mount?.isConnected).toBe(false);
  });
});

function createCandidateProject(): PreparedGeneratedMechanicRuntimeProject {
  const projected = projectAcceptedGeneratedMechanicRuntimeCandidate(
    fixture.artifact
  );
  return Object.freeze({
    runtimeCandidate: generatedMechanicRuntimeCandidateSchema.parse({
      ...projected,
      runtimeExecutionId: "runtime_execution_generation_run_ticket_16_5",
    }),
    dependency: fixture.dependency,
  });
}

function createUnacceptedGamePack() {
  return createInitialGamePack({
    id: "game_pack_ticket_16_5_candidate",
    gameSpec: fixture.dependency.finalGameSpec.gameSpec,
    runtimeKind: "phaser",
    createdAt: startedAt,
  });
}

function createPassingRuntimeEvidence(): readonly RuntimeValidationEvidence[] {
  return [
    {
      checkId: "nonblank_render",
      status: "passed",
      evidence: { renderedObjectCount: 3 },
    },
    {
      checkId: "player_visible",
      status: "passed",
      evidence: { playerVisible: true },
    },
    {
      checkId: "input_response",
      status: "passed",
      evidence: { inputObserved: true },
    },
  ];
}

function createControllerDouble(
  overrides: Partial<GeneratedMechanicPhaserRuntimeController> = {}
): GeneratedMechanicPhaserRuntimeController {
  return {
    focusGame: vi.fn(),
    setPaused: vi.fn(),
    updateOptions: vi.fn(),
    runFirstPlayableChecks: vi.fn(
      async () => new Promise<never>(() => undefined)
    ),
    dispose: vi.fn(),
    ...overrides,
  };
}

function createClock(values: readonly string[]) {
  let index = 0;
  return () => {
    const value = values[index];
    if (!value) {
      throw new Error("Deterministic browser runtime clock was exhausted.");
    }
    index += 1;
    return value;
  };
}
