import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITY_IDS,
  createGamePackRepository,
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  type GamePack,
  type GamePackStorageDriver,
  type GeneratedMechanicContract,
  type MechanicIntent,
  type StoredGamePackRecord,
} from "@/game-spec";
import { createGeneratedMechanicProjectRuntime } from "@/runtime/mechanics/generated-mechanic-project-runtime";
import {
  MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
  type MechanicExecutionRealmAdapter,
} from "@/runtime/mechanics/mechanic-execution-realm";
import { createPlayableDraftSource } from "@/runtime/playable-draft-source";
import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";
import {
  createContinueGeneratedMechanicGeneration,
} from "@/service/creator-generation/continue-generated-mechanic-generation";
import { createCreatorGenerationRouting } from "@/service/creator-generation/creator-generation-routing";
import type { BrowserRuntimeFoundation } from "@/service/creator-generation/browser-runtime-foundation";
import { buildAndExecuteGeneratedMechanicSource } from "@/service/mechanic-source-generation/mechanic-source-generation-service";
import type { generateBuildAndExecuteMechanicSource } from "@/service/mechanic-source-generation";

import { startEditorGenerationRun } from "./editor-generation-run";
import { createGenerationRunTestRepository } from "./testing/generation-run-test-harness";

const GENERATION_RUN_ID = "generation_run_editor_generated_integration";
const NOW = "2026-08-14T16:00:00.000Z";

describe("editor generated-mechanic production integration", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: new MemoryBrowserLockManager(),
    });
  });

  it("routes, evaluates, accepts, restores, and mounts one generated mechanic through the normal creator entry", async () => {
    const baseGameSpec = getFirstValidTopDownGameSpecFixture();
    const entityId = baseGameSpec.entities[0]!.id;
    const actionId = baseGameSpec.controls[0]!.action;
    const intent = createIntent(entityId, actionId);
    const routing = createCreatorGenerationRouting({
      availableCapabilities:
        TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITY_IDS,
      baseGameSpec,
      generationRunId: GENERATION_RUN_ID,
      intent,
    });
    if (routing.kind !== "generated_mechanic") {
      throw new Error(`Expected generated routing, received ${routing.kind}.`);
    }

    const contract = createContract({ actionId, entityId, intentId: intent.id });
    const sourceCandidate = createSourceCandidate(contract.id);
    const realmAdapter = createMotionRealmAdapter();
    const { repository: generationRunRepository } =
      createGenerationRunTestRepository();
    const gamePackRepository = createGamePackRepository(
      new MemoryGamePackStorage()
    );
    const runtimeEvents: string[] = [];
    const createContractProvider = vi.fn(() => async () => contract);
    const createSourceProvider = vi.fn(() => async () => sourceCandidate);
    const generateSource: typeof generateBuildAndExecuteMechanicSource = async (
      input
    ) =>
      buildAndExecuteGeneratedMechanicSource({
        candidate: sourceCandidate,
        contract: input.contract,
        grant: input.grant,
        referenceCatalog: input.referenceCatalog,
        realmAdapter: input.realmAdapter,
        execution: {
          ...input.execution,
          resourceBudget: input.resourceBudget,
        },
      });
    const continueGeneratedMechanicGeneration =
      createContinueGeneratedMechanicGeneration({
        services: {
          generationRunRepository,
          gamePackRepository,
          createFoundation: async () =>
            createPassingFoundation(realmAdapter),
          createContractProvider,
          createSourceProvider,
          generateSource,
          createRuntime: () =>
            createPassingProjectRuntime(runtimeEvents),
          now: () => NOW,
        },
      });
    const requestPhaserSpecGeneration = vi.fn().mockResolvedValue({
      metadata: {
        attemptCount: 1,
        generationRunId: GENERATION_RUN_ID,
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      routing,
      runtimeKind: "phaser",
      spec: baseGameSpec,
    });

    const run = startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => GENERATION_RUN_ID,
      generationRunRepository,
      generationSource: "phaser-ai",
      now: () => NOW,
      request: {
        openAiModel: "gpt-5.4-mini",
        prompt: "Add a deterministic action dash to the player",
      },
      requestPhaserSpecGeneration,
    });

    const completion = await run.done;
    if (completion.status === "error") {
      throw new Error(completion.message);
    }
    expect(completion).toMatchObject({
      generationRunId: GENERATION_RUN_ID,
      status: "success",
      source: "phaser-game-pack",
    });
    if (completion.status !== "success" || completion.source !== "phaser-game-pack") {
      throw new Error("Expected the accepted generated Game Pack completion.");
    }
    expect(createContractProvider).toHaveBeenCalledTimes(1);
    expect(createSourceProvider).toHaveBeenCalledTimes(1);
    expect(runtimeEvents).toEqual(["load", "install", "browser", "dispose"]);

    const restored = await gamePackRepository.load(completion.gamePack.id);
    expect(restored).toEqual(completion.gamePack);
    expect(restored?.acceptedGeneratedMechanicArtifacts).toEqual([
      expect.objectContaining({
        contract: expect.objectContaining({ id: contract.id }),
        sourceArtifact: expect.objectContaining({ id: sourceCandidate.id }),
        sourceGenerationRunId: GENERATION_RUN_ID,
      }),
    ]);
    const acceptedGenerationRun = await generationRunRepository.fetch(
      GENERATION_RUN_ID
    );
    expect(acceptedGenerationRun).toMatchObject({
      status: "succeeded",
      artifactScopedRepair: {
        status: "succeeded",
        attemptCounts: { contract: 1, source: 1, finalGameSpec: 1 },
      },
      relationships: {
        gamePackId: completion.gamePack.id,
        acceptedGeneratedMechanicArtifactIds: [
          expect.stringMatching(/^extension_/),
        ],
      },
    });
    expect(acceptedGenerationRun?.metadata).not.toHaveProperty(
      "generatedMechanicHandoff"
    );

    const activeDraft = createPlayableDraftSource({
      activeGamePack: completion.gamePack,
      generationSource: "phaser-ai",
      runtimeMode: "phaser",
    });
    expect(activeDraft).toMatchObject({
      type: "phaser",
      source: "accepted-game-pack",
      persistencePolicy: "do-not-persist",
      generatedMechanicProject: {
        artifact: expect.objectContaining({
          sourceGenerationRunId: GENERATION_RUN_ID,
        }),
      },
    });
  });

  it("returns structured evidence when the initial GenerationRun receipt cannot be persisted", async () => {
    const generationRunId = "generation_run_editor_receipt_failed";
    const baseGameSpec = getFirstValidTopDownGameSpecFixture();
    const intent = createIntent(
      baseGameSpec.entities[0]!.id,
      baseGameSpec.controls[0]!.action
    );
    const routing = createCreatorGenerationRouting({
      availableCapabilities:
        TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITY_IDS,
      baseGameSpec,
      generationRunId,
      intent,
    });
    if (routing.kind !== "generated_mechanic") {
      throw new Error(`Expected generated routing, received ${routing.kind}.`);
    }
    const create = vi.fn(async () => {
      throw new Error("GenerationRun storage is unavailable.");
    });
    const fetch = vi.fn(async () => null);
    const update = vi.fn(async () => {
      throw new Error("Missing GenerationRun must not be updated.");
    });
    const createFoundation = vi.fn(async () => {
      throw new Error("Foundation must not run without its durable receipt.");
    });
    const storage = new MemoryGamePackStorage();
    const gamePackRepository = createGamePackRepository(storage);
    const generationRunRepository = { create, fetch, update };
    const continueGeneratedMechanicGeneration =
      createContinueGeneratedMechanicGeneration({
        services: {
          createFoundation,
          gamePackRepository,
          generationRunRepository,
          now: () => NOW,
        },
      });

    const completion = await startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => generationRunId,
      generationRunRepository,
      generationSource: "phaser-ai",
      now: () => NOW,
      request: {
        openAiModel: "gpt-5.4-mini",
        prompt: "Add a deterministic action dash to the player",
      },
      requestPhaserSpecGeneration: vi.fn().mockResolvedValue({
        metadata: {
          attemptCount: 1,
          generationRunId,
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
        routing,
        runtimeKind: "phaser",
        spec: baseGameSpec,
      }),
    }).done;

    expect(completion).toEqual({
      generationRunId,
      status: "error",
      reason: "request-failed",
      message:
        "Generated mechanic creation requires its exact running GenerationRun receipt before browser work can begin. Generated mechanic rejection evidence could not be persisted to its GenerationRun receipt.",
      generatedMechanicFailure: {
        stage: "generation_run",
        issues: [
          {
            path: "generationRun",
            code: "generation_run_receipt_unavailable",
            message:
              "Generated mechanic creation requires its exact running GenerationRun receipt before browser work can begin.",
          },
          {
            path: "generationRun",
            code: "generation_run_receipt_persistence_failed",
            message:
              "Generated mechanic rejection evidence could not be persisted to its GenerationRun receipt.",
          },
        ],
      },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(generationRunId);
    expect(update).toHaveBeenCalledTimes(1);
    expect(createFoundation).not.toHaveBeenCalled();
    expect([...storage.records.values()]).toEqual([]);
  });

  it("returns structured foundation setup evidence from the normal creator entry", async () => {
    const generationRunId = "generation_run_editor_foundation_throw";
    const baseGameSpec = getFirstValidTopDownGameSpecFixture();
    const intent = createIntent(
      baseGameSpec.entities[0]!.id,
      baseGameSpec.controls[0]!.action
    );
    const routing = createCreatorGenerationRouting({
      availableCapabilities:
        TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITY_IDS,
      baseGameSpec,
      generationRunId,
      intent,
    });
    if (routing.kind !== "generated_mechanic") {
      throw new Error(`Expected generated routing, received ${routing.kind}.`);
    }
    const { repository: generationRunRepository } =
      createGenerationRunTestRepository();
    const storage = new MemoryGamePackStorage();
    const createContractProvider = vi.fn();
    const continueGeneratedMechanicGeneration =
      createContinueGeneratedMechanicGeneration({
        services: {
          generationRunRepository,
          gamePackRepository: createGamePackRepository(storage),
          createFoundation: async () => {
            throw new Error("The browser foundation iframe failed to load.");
          },
          createContractProvider,
          now: () => NOW,
        },
      });

    const completion = await startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => generationRunId,
      generationRunRepository,
      generationSource: "phaser-ai",
      now: () => NOW,
      request: {
        openAiModel: "gpt-5.4-mini",
        prompt: "Add a deterministic action dash to the player",
      },
      requestPhaserSpecGeneration: vi.fn().mockResolvedValue({
        metadata: {
          attemptCount: 1,
          generationRunId,
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
        routing,
        runtimeKind: "phaser",
        spec: baseGameSpec,
      }),
    }).done;

    expect(completion).toMatchObject({
      generationRunId,
      status: "error",
      reason: "request-failed",
      generatedMechanicFailure: {
        stage: "foundation",
        issues: [
          {
            path: "foundation",
            code: "foundation_initialization_failed",
            message:
              "Generated mechanic creation could not initialize its browser runtime foundation.",
          },
        ],
      },
    });
    expect(createContractProvider).not.toHaveBeenCalled();
    expect([...storage.records.values()]).toEqual([]);
  });

  it("returns structured receipt-load evidence from the normal creator entry", async () => {
    const generationRunId = "generation_run_editor_receipt_read_failed";
    const baseGameSpec = getFirstValidTopDownGameSpecFixture();
    const intent = createIntent(
      baseGameSpec.entities[0]!.id,
      baseGameSpec.controls[0]!.action
    );
    const routing = createCreatorGenerationRouting({
      availableCapabilities:
        TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITY_IDS,
      baseGameSpec,
      generationRunId,
      intent,
    });
    if (routing.kind !== "generated_mechanic") {
      throw new Error(`Expected generated routing, received ${routing.kind}.`);
    }
    const { repository: backingRepository } =
      createGenerationRunTestRepository();
    const generationRunRepository = {
      create: (generationRun: Parameters<typeof backingRepository.create>[0]) =>
        backingRepository.create(generationRun),
      update: (
        id: Parameters<typeof backingRepository.update>[0],
        updater: Parameters<typeof backingRepository.update>[1]
      ) => backingRepository.update(id, updater),
      fetch: vi.fn(async () => {
        throw new Error("IndexedDB receipt read failed.");
      }),
    };
    const storage = new MemoryGamePackStorage();
    const createFoundation = vi.fn();
    const continueGeneratedMechanicGeneration =
      createContinueGeneratedMechanicGeneration({
        services: {
          generationRunRepository,
          gamePackRepository: createGamePackRepository(storage),
          createFoundation,
          now: () => NOW,
        },
      });

    const completion = await startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => generationRunId,
      generationRunRepository,
      generationSource: "phaser-ai",
      now: () => NOW,
      request: {
        openAiModel: "gpt-5.4-mini",
        prompt: "Add a deterministic action dash to the player",
      },
      requestPhaserSpecGeneration: vi.fn().mockResolvedValue({
        metadata: {
          attemptCount: 1,
          generationRunId,
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
        routing,
        runtimeKind: "phaser",
        spec: baseGameSpec,
      }),
    }).done;

    expect(completion).toMatchObject({
      generationRunId,
      status: "error",
      reason: "request-failed",
      generatedMechanicFailure: {
        stage: "generation_run",
        issues: [
          {
            path: "generationRun",
            code: "generation_run_receipt_load_failed",
            message:
              "Generated mechanic creation could not load its GenerationRun receipt.",
          },
        ],
      },
    });
    expect(createFoundation).not.toHaveBeenCalled();
    expect([...storage.records.values()]).toEqual([]);
  });

  it("returns structured repair-receipt persistence evidence from the normal creator entry", async () => {
    const harness = createFailureMatrixHarness({
      failRepairReceiptPersistence: true,
      generationRunId: "generation_run_editor_repair_receipt_failed",
      sourceModeForAttempt: () => "motion",
    });

    const completion = await harness.run.done;

    expect(completion).toMatchObject({
      generationRunId: "generation_run_editor_repair_receipt_failed",
      status: "error",
      reason: "request-failed",
      generatedMechanicFailure: {
        stage: "generation_run",
        issues: [
          {
            path: "generationRun.artifactScopedRepair",
            code: "generation_run_receipt_persistence_failed",
            message:
              "Generated mechanic creation could not persist its exact repair receipt.",
          },
        ],
      },
    });
    expect(harness.createContractProvider).toHaveBeenCalledTimes(1);
    expect(harness.createSourceProvider).toHaveBeenCalledTimes(1);
    expect(harness.runtimeEvents).toEqual([]);
    expectNoAcceptedGamePackPersistence(harness);
  });

  it("retains exact source-rejection evidence without persisting an accepted Game Pack", async () => {
    const harness = createFailureMatrixHarness({
      generationRunId: "generation_run_editor_source_rejected",
      sourceModeForAttempt: (attempt) =>
        attempt === 1 ? "invalid" : "motion",
    });

    const completion = await harness.run.done;

    expect(completion).toMatchObject({
      generationRunId: "generation_run_editor_source_rejected",
      status: "error",
      reason: "request-failed",
      generatedMechanicFailure: {
        stage: "first_playable",
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: "firstPlayable.status",
            code: "first_playable_not_passed",
          }),
        ]),
      },
    });
    expect(harness.createContractProvider).toHaveBeenCalledTimes(1);
    expect(harness.createSourceProvider).toHaveBeenCalledTimes(2);
    expect(harness.runtimeEvents).toEqual([
      "load",
      "install",
      "browser:failed",
      "dispose",
    ]);

    const generationRun = await harness.generationRunRepository.fetch(
      "generation_run_editor_source_rejected"
    );
    expect(generationRun).toMatchObject({
      status: "failed",
      stage: "browser-check",
      failureClass: "first-playable-failure",
      artifactScopedRepair: {
        status: "succeeded",
        repairStatus: "repaired",
        attemptCounts: { contract: 1, source: 2, finalGameSpec: 1 },
      },
      metadata: {
        generatedMechanicOutcome: {
          status: "rejected",
          stage: "first_playable",
          issues: expect.arrayContaining([
            expect.objectContaining({ code: "first_playable_not_passed" }),
          ]),
        },
      },
    });
    expect(
      generationRun?.artifactScopedRepair?.attempts.filter(
        ({ stage }) => stage === "source"
      )
    ).toEqual([
      expect.objectContaining({
        id: "generation_run_editor_source_rejected_source_1",
        attemptNumber: 1,
        kind: "initial",
        status: "rejected",
        issues: [
          {
            path: "callbacks",
            code: "callback_coverage_mismatch",
            message:
              'Accepted lifecycle callback kind "logical_action" is missing from the source candidate.',
          },
        ],
      }),
      expect.objectContaining({
        id: "generation_run_editor_source_rejected_source_2",
        attemptNumber: 2,
        kind: "repair",
        status: "accepted",
        artifactId: "source_editor_failure_motion_2",
      }),
    ]);
    expectNoAcceptedGamePackPersistence(harness);
  });

  it("retains exact deterministic-evaluation failure evidence without persisting an accepted Game Pack", async () => {
    const harness = createFailureMatrixHarness({
      generationRunId: "generation_run_editor_evaluation_failed",
      sourceModeForAttempt: (attempt) =>
        attempt === 1 ? "inert" : "motion",
    });

    const completion = await harness.run.done;

    expect(completion).toMatchObject({
      generationRunId: "generation_run_editor_evaluation_failed",
      status: "error",
      reason: "request-failed",
      generatedMechanicFailure: {
        stage: "first_playable",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "first_playable_not_passed" }),
        ]),
      },
    });
    expect(harness.createContractProvider).toHaveBeenCalledTimes(1);
    expect(harness.createSourceProvider).toHaveBeenCalledTimes(2);

    const generationRun = await harness.generationRunRepository.fetch(
      "generation_run_editor_evaluation_failed"
    );
    expect(generationRun).toMatchObject({
      status: "failed",
      artifactScopedRepair: {
        status: "succeeded",
        repairStatus: "repaired",
        attemptCounts: { contract: 1, source: 2, finalGameSpec: 1 },
      },
    });
    expect(
      generationRun?.artifactScopedRepair?.attempts.filter(
        ({ stage }) => stage === "source"
      )
    ).toEqual([
      expect.objectContaining({
        id: "generation_run_editor_evaluation_failed_source_1",
        attemptNumber: 1,
        kind: "initial",
        status: "rejected",
        artifactId: "source_editor_failure_inert_1",
        issues: [
          {
            path: "evaluation.scenarios.scenario_editor_action_dash",
            code: "deterministic_evaluation_failed",
            message:
              'Scenario "scenario_editor_action_dash" failed independent observable evaluation.',
          },
        ],
      }),
      expect.objectContaining({
        id: "generation_run_editor_evaluation_failed_source_2",
        attemptNumber: 2,
        kind: "repair",
        status: "accepted",
        artifactId: "source_editor_failure_motion_2",
      }),
    ]);
    expectNoAcceptedGamePackPersistence(harness);
  });

  it("returns exact repair-exhaustion evidence without reaching handoff or persistence", async () => {
    const harness = createFailureMatrixHarness({
      generationRunId: "generation_run_editor_repair_exhausted",
      sourceModeForAttempt: () => "invalid",
    });

    const completion = await harness.run.done;

    expect(completion).toEqual({
      generationRunId: "generation_run_editor_repair_exhausted",
      status: "error",
      reason: "request-failed",
      message:
        'Accepted lifecycle callback kind "logical_action" is missing from the source candidate.',
      generatedMechanicFailure: {
        stage: "repair_exhausted",
        issues: [
          {
            path: "callbacks",
            code: "callback_coverage_mismatch",
            message:
              'Accepted lifecycle callback kind "logical_action" is missing from the source candidate.',
          },
        ],
      },
    });
    expect(harness.createContractProvider).toHaveBeenCalledTimes(1);
    expect(harness.createSourceProvider).toHaveBeenCalledTimes(4);
    expect(harness.runtimeEvents).toEqual([]);

    const generationRun = await harness.generationRunRepository.fetch(
      "generation_run_editor_repair_exhausted"
    );
    expect(generationRun).toMatchObject({
      status: "failed",
      stage: "repair",
      failureClass: "repair-exhausted",
      repairStatus: "repair-exhausted",
      artifactScopedRepair: {
        status: "repair_exhausted",
        repairStatus: "repair_exhausted",
        attemptCounts: { contract: 1, source: 4, finalGameSpec: 0 },
        exhausted: {
          stage: "source",
          maximumAttempts: 4,
          failureAttemptId:
            "generation_run_editor_repair_exhausted_source_4",
          issues: [
            {
              path: "callbacks",
              code: "callback_coverage_mismatch",
              message:
                'Accepted lifecycle callback kind "logical_action" is missing from the source candidate.',
            },
          ],
        },
      },
    });
    expect(generationRun?.relationships).toBeUndefined();
    expectNoAcceptedGamePackPersistence(harness);
  });
});

type FailureSourceMode = "inert" | "invalid" | "motion";

function createFailureMatrixHarness({
  failRepairReceiptPersistence = false,
  generationRunId,
  sourceModeForAttempt,
}: Readonly<{
  failRepairReceiptPersistence?: boolean;
  generationRunId: string;
  sourceModeForAttempt(attempt: number): FailureSourceMode;
}>) {
  const baseGameSpec = getFirstValidTopDownGameSpecFixture();
  const entityId = baseGameSpec.entities[0]!.id;
  const actionId = baseGameSpec.controls[0]!.action;
  const intent = createIntent(entityId, actionId);
  const routing = createCreatorGenerationRouting({
    availableCapabilities:
      TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITY_IDS,
    baseGameSpec,
    generationRunId,
    intent,
  });
  if (routing.kind !== "generated_mechanic") {
    throw new Error(`Expected generated routing, received ${routing.kind}.`);
  }

  const contract = createContract({ actionId, entityId, intentId: intent.id });
  const realmAdapter = createFailureMatrixRealmAdapter();
  const { repository: backingGenerationRunRepository } =
    createGenerationRunTestRepository();
  const generationRunRepository = failRepairReceiptPersistence
    ? {
        create: (
          generationRun: Parameters<
            typeof backingGenerationRunRepository.create
          >[0]
        ) => backingGenerationRunRepository.create(generationRun),
        fetch: (id: Parameters<typeof backingGenerationRunRepository.fetch>[0]) =>
          backingGenerationRunRepository.fetch(id),
        update: (
          id: Parameters<typeof backingGenerationRunRepository.update>[0],
          updater: Parameters<
            typeof backingGenerationRunRepository.update
          >[1]
        ) =>
          backingGenerationRunRepository.update(id, (current) => {
            const next = updater(current);
            if (next.artifactScopedRepair) {
              throw new Error("Repair receipt persistence failed.");
            }
            return next;
          }),
      }
    : backingGenerationRunRepository;
  const storage = new MemoryGamePackStorage();
  const gamePackRepository = createGamePackRepository(storage);
  const compareAndSwap = vi.spyOn(gamePackRepository, "compareAndSwap");
  const runtimeEvents: string[] = [];
  const createContractProvider = vi.fn(() => async () => contract);
  const createSourceProvider = vi.fn(() => async () => ({}));
  let sourceAttempt = 0;
  const generateSource: typeof generateBuildAndExecuteMechanicSource = async (
    input
  ) => {
    sourceAttempt += 1;
    return buildAndExecuteGeneratedMechanicSource({
      candidate: createFailureSourceCandidate({
        attempt: sourceAttempt,
        contractId: contract.id,
        mode: sourceModeForAttempt(sourceAttempt),
      }),
      contract: input.contract,
      grant: input.grant,
      referenceCatalog: input.referenceCatalog,
      realmAdapter: input.realmAdapter,
      execution: {
        ...input.execution,
        resourceBudget: input.resourceBudget,
      },
    });
  };
  const continueGeneratedMechanicGeneration =
    createContinueGeneratedMechanicGeneration({
      services: {
        generationRunRepository,
        gamePackRepository,
        createFoundation: async () => createPassingFoundation(realmAdapter),
        createContractProvider,
        createSourceProvider,
        generateSource,
        createRuntime: () =>
          createFailingProjectRuntime(runtimeEvents),
        now: () => NOW,
      },
    });
  const requestPhaserSpecGeneration = vi.fn().mockResolvedValue({
    metadata: {
      attemptCount: 1,
      generationRunId,
      model: "gpt-5.4-mini",
      taskRoute: "spec_generation.primary",
    },
    routing,
    runtimeKind: "phaser",
    spec: baseGameSpec,
  });

  return {
    compareAndSwap,
    createContractProvider,
    createSourceProvider,
    generationRunRepository,
    runtimeEvents,
    storage,
    run: startEditorGenerationRun({
      continueGeneratedMechanicGeneration,
      createGenerationRunId: () => generationRunId,
      generationRunRepository,
      generationSource: "phaser-ai",
      now: () => NOW,
      request: {
        openAiModel: "gpt-5.4-mini",
        prompt: "Add a deterministic action dash to the player",
      },
      requestPhaserSpecGeneration,
    }),
  };
}

function expectNoAcceptedGamePackPersistence(
  harness: ReturnType<typeof createFailureMatrixHarness>
) {
  expect(harness.compareAndSwap).not.toHaveBeenCalled();
  expect([...harness.storage.records.values()]).toEqual([]);
}

function createIntent(entityId: string, actionId: string): MechanicIntent {
  return {
    id: "intent_editor_action_dash",
    summary: "Dash the routed player after the logical action.",
    triggers: ["logical_action"],
    actors: ["player"],
    targets: [],
    behaviors: ["action_dash"],
    ownedObjects: [],
    stateChanges: ["player_velocity_changed"],
    temporalRules: [],
    spatialRules: [],
    constraints: [],
    configuration: [],
    connections: [{ direction: "input", port: actionId }],
    references: [{ kind: "entity", id: entityId }],
    outcomes: ["player_velocity_changed"],
    requiredCapabilities: ["object_motion_write"],
    ambiguities: [],
  };
}

function createContract({
  actionId,
  entityId,
  intentId,
}: Readonly<{
  actionId: string;
  entityId: string;
  intentId: string;
}>): GeneratedMechanicContract {
  return {
    schemaVersion: "generated-mechanic-contract/v1",
    id: "contract_editor_action_dash",
    intentId,
    capabilityVersion: "mechanic_capability/v1",
    behavior: {
      summary: "Apply visible deterministic velocity to the routed player.",
      triggers: ["logical_action"],
      outcomes: ["player_velocity_changed"],
    },
    config: { kind: "object", fields: [] },
    bindings: [
      {
        id: "actor",
        referenceKind: "entity",
        cardinality: "one",
        objectIds: [entityId],
      },
    ],
    ownedObjects: [],
    privateState: [],
    lifecycle: {
      callbacks: ["install", "logical_action"],
      fixedStep: false,
      dispose: true,
    },
    ports: [],
    capabilities: ["object_motion_write"],
    resourceExpectations: {
      maximumOwnedObjects: 0,
      maximumOperationsPerTick: 4,
      maximumScheduledCallbacks: 0,
      maximumSubscriptions: 0,
      maximumSignalsPerTick: 0,
      maximumStateBytes: 0,
      maximumCallbackMilliseconds: 4,
      maximumConsecutiveFailures: 1,
    },
    scenarios: [
      {
        id: "scenario_editor_action_dash",
        seed: 17,
        setup: [{ kind: "binding_present", bindingId: "actor" }],
        steps: [{ kind: "dispatch_action", actionId }],
        observations: [
          {
            kind: "binding_property",
            bindingId: "actor",
            property: "velocity",
            operator: "not_equals",
            value: { x: 0, y: 0 },
          },
        ],
      },
    ],
  };
}

function createSourceCandidate(contractId: string) {
  return {
    schemaVersion: "generated_mechanic_source_candidate/v1" as const,
    id: "source_editor_action_dash_v1",
    contractId,
    capabilityVersion: "mechanic_capability/v1" as const,
    callbacks: [
      { id: "install_editor_action_dash", kind: "install" as const, source: "return null;" },
      {
        id: "action_editor_action_dash",
        kind: "logical_action" as const,
        source:
          "await capabilities.objects.writeMotion(bindings.actor, { velocity: { x: 24, y: 0 } });",
      },
      { id: "dispose_editor_action_dash", kind: "dispose" as const, source: "return null;" },
    ],
  };
}

function createFailureSourceCandidate({
  attempt,
  contractId,
  mode,
}: Readonly<{
  attempt: number;
  contractId: string;
  mode: FailureSourceMode;
}>) {
  const lifecycleCallbacks = [
    {
      id: `install_editor_failure_${attempt}`,
      kind: "install" as const,
      source: "return null;",
    },
    ...(mode === "invalid"
      ? []
      : [
          {
            id: `action_editor_failure_${mode}_${attempt}`,
            kind: "logical_action" as const,
            source:
              "await capabilities.objects.writeMotion(bindings.actor, { velocity: { x: 24, y: 0 } });",
          },
        ]),
    {
      id: `dispose_editor_failure_${attempt}`,
      kind: "dispose" as const,
      source: "return null;",
    },
  ];
  return {
    schemaVersion: "generated_mechanic_source_candidate/v1" as const,
    id: `source_editor_failure_${mode}_${attempt}`,
    contractId,
    capabilityVersion: "mechanic_capability/v1" as const,
    callbacks: lifecycleCallbacks,
  };
}

function createMotionRealmAdapter(): MechanicExecutionRealmAdapter {
  return {
    adapterVersion: MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
    id: "integration_motion_realm",
    async create({ bindings, capabilityHost }) {
      return {
        execute(input) {
          const callbackId = input.lifecycle?.invocations[0]?.callbackId;
          const result = (async () => {
            if (callbackId === "action_editor_action_dash") {
              const actor = bindings[0]?.handles[0];
              if (!actor) {
                throw new Error("Expected the routed actor handle.");
              }
              await capabilityHost.invoke({
                capabilityId: "object_motion_write",
                arguments: [actor, { velocity: { x: 24, y: 0 } }],
              });
            }
            return { executionId: input.id, outcome: "completed" as const };
          })();
          return { result, terminate: () => result };
        },
        dispose() {},
      };
    },
  };
}

function createFailureMatrixRealmAdapter(): MechanicExecutionRealmAdapter {
  return {
    adapterVersion: MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
    id: "integration_failure_matrix_realm",
    async create({ bindings, capabilityHost }) {
      return {
        execute(input) {
          const callbackId = input.lifecycle?.invocations[0]?.callbackId;
          const result = (async () => {
            if (callbackId?.includes("_motion_")) {
              const actor = bindings[0]?.handles[0];
              if (!actor) {
                throw new Error("Expected the routed actor handle.");
              }
              await capabilityHost.invoke({
                capabilityId: "object_motion_write",
                arguments: [actor, { velocity: { x: 24, y: 0 } }],
              });
            }
            return { executionId: input.id, outcome: "completed" as const };
          })();
          return { result, terminate: () => result };
        },
        dispose() {},
      };
    },
  };
}

function createPassingFoundation(
  realmAdapter: MechanicExecutionRealmAdapter
): BrowserRuntimeFoundation {
  return {
    gateResult: {
      schemaVersion: "runtime_contract_foundation_gate/v1",
      status: "passed",
      sourceGenerationAvailable: true,
      checks: [],
      evidence: Object.freeze({}) as Extract<
        BrowserRuntimeFoundation["gateResult"],
        { status: "passed" }
      >["evidence"],
      terminalResult: { code: "runtime_contract_foundation_gate_passed" },
    },
    realmAdapter,
  };
}

function createPassingProjectRuntime(events: string[]) {
  return createGeneratedMechanicProjectRuntime({
    async loadProjectDependency(project) {
      events.push("load");
      return project;
    },
    async installTrustedTemplate() {
      events.push("install");
      return { mounted: true };
    },
    async runFirstPlayableBrowserChecks({ gamePack }) {
      events.push("browser");
      return createPassedFirstPlayableAttempt(gamePack);
    },
    async disposeProjectDependency() {
      events.push("dispose");
    },
  });
}

function createFailingProjectRuntime(events: string[]) {
  return createGeneratedMechanicProjectRuntime({
    async loadProjectDependency(project) {
      events.push("load");
      return project;
    },
    async installTrustedTemplate() {
      events.push("install");
      return { mounted: true };
    },
    async runFirstPlayableBrowserChecks({ gamePack }) {
      events.push("browser:failed");
      const attempt = startFirstPlayableValidation({
        gamePack,
        runtimeCandidate: {
          runtimeKind: "phaser",
          runtimeScriptPath: "/runtime/phaser/top-down-template.js",
          templateId: gamePack.templateId,
        },
        startedAt: "2026-08-14T15:59:58.000Z",
      });
      return recordFirstPlayableRuntimeStatus({
        attempt,
        observedAt: "2026-08-14T15:59:59.000Z",
        status: {
          state: "error",
          message: "Deliberate failure-matrix browser rejection.",
        },
      });
    },
    async disposeProjectDependency() {
      events.push("dispose");
    },
  });
}

function createPassedFirstPlayableAttempt(gamePack: GamePack) {
  let attempt = startFirstPlayableValidation({
    gamePack,
    runtimeCandidate: {
      runtimeKind: "phaser",
      runtimeScriptPath: "/runtime/phaser/top-down-template.js",
      templateId: gamePack.templateId,
    },
    startedAt: "2026-08-14T15:59:58.000Z",
  });
  attempt = recordFirstPlayableRuntimeStatus({
    attempt,
    observedAt: "2026-08-14T15:59:59.000Z",
    status: { state: "ready" },
  });
  for (const checkId of [
    "nonblank_render",
    "player_visible",
    "input_response",
  ] as const) {
    attempt = recordFirstPlayableRuntimeEvidence({
      attempt,
      observedAt: "2026-08-14T15:59:59.500Z",
      evidence: { checkId, status: "passed" },
    });
  }
  return attempt;
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

class MemoryGamePackStorage implements GamePackStorageDriver {
  readonly records = new Map<string, StoredGamePackRecord>();

  async put(record: StoredGamePackRecord) {
    this.records.set(record.id, structuredClone(record));
  }

  async get(id: string) {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  async getAll() {
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  async compareAndSwap(
    id: string,
    expected: StoredGamePackRecord | null,
    replacement: StoredGamePackRecord | null
  ) {
    const current = this.records.get(id) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      return false;
    }
    if (replacement) {
      this.records.set(id, structuredClone(replacement));
    } else {
      this.records.delete(id);
    }
    return true;
  }

  async delete(id: string) {
    this.records.delete(id);
  }
}
