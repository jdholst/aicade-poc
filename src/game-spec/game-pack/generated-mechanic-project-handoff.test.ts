import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GeneratedMechanicContract } from "@/game-spec";
import {
  createMechanicCapabilityGrant,
  createGamePackRepository,
  createGenerationRunRepository,
  createInitialGamePack,
  gamePackSchema,
  parseGamePack,
  generationRunSchema,
  PHASE_9_GENERATION_CONSTRAINT_SET,
  prepareRestoredGeneratedMechanicProject,
  reconcileGeneratedMechanicAcceptanceTransactions,
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  restoreGamePackCheckpoint,
  type FirstPlayableValidationAttempt,
  type GamePackStorageDriver,
  type GenerationRunStorageDriver,
  type PreparedGeneratedMechanicRuntimeProject,
  type StoredGamePackRecord,
  type StoredGenerationRunRecord,
  withGeneratedMechanicAcceptanceLock,
  writeGeneratedMechanicHandoffPendingReceipt,
} from "@/game-spec";
import { crystalSpecChaseGameSpecFixtureInput } from "@/runtime/phaser/fixtures/crystal-spec-chase";
import { createGeneratedMechanicProjectRuntime } from "@/runtime/mechanics/generated-mechanic-project-runtime";
import { evaluateGeneratedMechanicArtifact } from "@/service/mechanic-evaluation/mechanic-evaluation";
import type { GeneratedMechanicSourceArtifact } from "@/service/mechanic-source-generation";
import { useEditorGamePackPersistence } from "@/components/editor-shell/editor-game-pack-persistence";

import {
  completeGeneratedMechanicProjectHandoff,
  restoreGeneratedMechanicProjectHandoff,
  validateGeneratedMechanicFinalGameSpec,
} from "./generated-mechanic-project-handoff";

describe("generated mechanic project handoff", () => {
  let browserLockManager: MemoryBrowserLockManager;

  beforeEach(() => {
    browserLockManager = new MemoryBrowserLockManager();
    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: browserLockManager,
    });
  });

  it("persists one accepted artifact after exact runtime and first-playable proof", async () => {
    const contract = createContract();
    const sourceArtifact = createSourceArtifact();
    const gameSpec = createFinalGameSpecInput();
    const gamePack = createInitialGamePack({
      createdAt: "2026-08-11T12:00:00.000Z",
      gameSpec,
      id: "game_pack_generated_counter",
      runtimeKind: "phaser",
    });
    const gamePackRepository = createGamePackRepository(
      new MemoryGamePackStorage()
    );
    const generationRunRepository = createGenerationRunRepository(
      new MemoryGenerationRunStorage()
    );
    const generationRun = generationRunSchema.parse({
      id: "generation_run_generated_counter",
      operationType: "generate",
      status: "succeeded",
      repairStatus: "repaired",
      createdAt: "2026-08-11T11:59:50.000Z",
      startedAt: "2026-08-11T11:59:51.000Z",
      completedAt: "2026-08-11T12:00:00.000Z",
      durationMs: 9000,
      request: { summary: "Generate a generic counter mechanic." },
      runtimeKind: "phaser",
      templateId: "template_top_down",
      mechanicIds: ["mechanic_generated_counter"],
      attempts: [
        {
          id: "generation_attempt_counter_initial",
          attemptNumber: 1,
          kind: "initial",
          status: "failed",
          provider: "test_provider",
          model: "test_model",
          taskRoute: "generated_mechanic_pipeline",
          requestSummary: "Generate a generic counter mechanic.",
          startedAt: "2026-08-11T11:59:51.000Z",
          completedAt: "2026-08-11T11:59:55.000Z",
          durationMs: 4000,
          validation: {
            stage: "artifact-build",
            status: "failed",
            issues: [{ message: "Initial source did not compile." }],
          },
          candidate: {
            kind: "invalid_candidate",
            summary: "Initial source did not compile.",
            issueCount: 1,
          },
        },
        {
          id: "generation_attempt_counter_repair",
          attemptNumber: 2,
          kind: "repair",
          status: "succeeded",
          provider: "test_provider",
          model: "test_model",
          taskRoute: "generated_mechanic_pipeline",
          requestSummary: "Repair the generic counter source.",
          startedAt: "2026-08-11T11:59:55.000Z",
          completedAt: "2026-08-11T12:00:00.000Z",
          durationMs: 5000,
          validation: { stage: "artifact-build", status: "passed" },
          repair: {
            sourceAttemptId: "generation_attempt_counter_initial",
            reason: "Initial source did not compile.",
            validationIssueCount: 1,
          },
          candidate: {
            kind: "validated_spec",
            gameSpecId: gameSpec.id,
            summary: "Compiled generated mechanic accepted by repair.",
          },
        },
      ],
      artifactScopedRepair: createArtifactRepairReceipt({
        generationRunId: "generation_run_generated_counter",
        repairStatus: "repaired",
      }),
    });
    await generationRunRepository.create(generationRun);
    const deterministicEvaluation = await createIssuedPassedEvaluation({
      contract,
      sourceArtifact,
    });

    const events: string[] = [];
    const result = await completeGeneratedMechanicProjectHandoff({
      acceptedAt: "2026-08-11T12:00:10.000Z",
      contract,
      deterministicEvaluation,
      finalGameSpec: {
        schemaVersion: "generated_mechanic_final_game_spec/v1",
        id: "final_game_spec_generated_counter_v1",
        gameSpec,
        extension: {
          id: "extension_generated_counter",
          versionId: "extension_generated_counter_v1",
          mechanicId: "mechanic_generated_counter",
          mechanicType: "generated_counter",
          contractId: contract.id,
          sourceArtifactId: sourceArtifact.id,
          capabilityVersion: contract.capabilityVersion,
          config: { initial_count: 3 },
          bindings: [
            {
              id: "actor",
              referenceKind: "entity",
              cardinality: "one",
              objectIds: ["entity_player"],
            },
          ],
        },
      },
      gamePack,
      gamePackRepository,
      generationRunId: generationRun.id,
      generationRunRepository,
      referenceCatalog: {
        action: gameSpec.controls.map(({ action }) => action),
        asset: gameSpec.assets.map(({ id }) => id),
        entity: gameSpec.entities.map(({ id }) => id),
        objective: gameSpec.objectives.map(({ id }) => id),
        region: ["region_safe_start"],
        scene: ["scene_arena"],
      },
      runtime: createPassingRuntime(events),
      sourceArtifact,
      trustedPortContracts: [],
    });

    if (result.outcome !== "accepted") {
      throw new Error(JSON.stringify(result.evidence));
    }
    expect(result).toMatchObject({ outcome: "accepted" });
    expect(events).toEqual([
      `load:${sourceArtifact.id}`,
      `install:${sourceArtifact.id}`,
      `browser:${sourceArtifact.id}`,
      `dispose:${sourceArtifact.id}`,
    ]);

    const restored = await gamePackRepository.load(gamePack.id);
    expect(restored).not.toBeNull();
    expect(restored?.acceptedGeneratedMechanicArtifacts).toEqual([
      expect.objectContaining({
        id: "extension_generated_counter_v1",
        extensionId: "extension_generated_counter",
        versionId: "extension_generated_counter_v1",
        finalGameSpecArtifactId: "final_game_spec_generated_counter_v1",
        sourceGenerationRunId: generationRun.id,
        runtimePolicy: {
          schemaVersion: "generated_mechanic_runtime_policy/v1",
          hostProfileId: "top_down_phaser_generated_mechanic_host/v1",
          executionRealmCandidateId:
            "ses_compartment_dedicated_worker_2_2_0",
          resourceBudgetProfileId: "phase_9_fixed_budget",
          seed: 1694247801,
          fixedStepIntervalMilliseconds: null,
        },
        contract: expect.objectContaining({ id: contract.id }),
        sourceArtifact: expect.objectContaining({ id: sourceArtifact.id }),
      }),
    ]);
    expect(restored?.builds[0]?.generatedMechanicArtifactIds).toEqual([
      "extension_generated_counter_v1",
    ]);
    expect(restored?.checkpoints[0]?.generatedMechanicArtifactIds).toEqual([
      "extension_generated_counter_v1",
    ]);
    expect(restored?.generationRuns).toEqual([
      expect.objectContaining({
        id: generationRun.id,
        status: generationRun.status,
        repairStatus: generationRun.repairStatus,
        artifactScopedRepair: generationRun.artifactScopedRepair,
        relationships: expect.objectContaining({
          gamePackId: gamePack.id,
          acceptedGeneratedMechanicArtifactIds: [
            "extension_generated_counter_v1",
          ],
        }),
      }),
    ]);
    expect(
      restored?.validationEvidence.find(
        ({ checkId }) => checkId === "generated_mechanic_activation"
      )
    ).toMatchObject({
      status: "passed",
      generatedMechanicArtifactIds: ["extension_generated_counter_v1"],
      evidence: {
        sourceArtifactId: sourceArtifact.id,
        capabilityVersion: sourceArtifact.capabilityVersion,
      },
    });

    const linkedGenerationRun = await generationRunRepository.fetch(
      generationRun.id
    );
    expect(linkedGenerationRun).toMatchObject({
      status: generationRun.status,
      repairStatus: generationRun.repairStatus,
      completedAt: generationRun.completedAt,
      durationMs: generationRun.durationMs,
    });
    expect(linkedGenerationRun?.relationships).toEqual({
      gamePackId: gamePack.id,
      gameSpecId: gameSpec.id,
      acceptedGeneratedMechanicArtifactIds: [
        "extension_generated_counter_v1",
      ],
      buildIds: [restored?.acceptedGeneratedMechanicArtifacts?.[0]?.buildId],
      checkpointIds: [
        restored?.acceptedGeneratedMechanicArtifacts?.[0]?.checkpointId,
      ],
      validationEvidenceIds:
        restored?.acceptedGeneratedMechanicArtifacts?.[0]
          ?.validationEvidenceIds,
    });
  });

  it("accepts authentic full, active-progress, immediate-creation, and unchanged owned-object lifecycle evidence", async () => {
    const context = await createHandoffTestContext();
    const contract: GeneratedMechanicContract = {
      ...context.contract,
      intentLineage: {
        ...context.contract.intentLineage!,
        spatialRules: ["spawn_owned_object_at_actor_position"],
      },
      ownedObjects: [
        { id: "projectile", objectKind: "projectile", maximumInstances: 1 },
      ],
      capabilities: [
        ...context.contract.capabilities,
        "object_read",
        "object_create",
        "object_destroy",
      ],
      resourceExpectations: {
        ...context.contract.resourceExpectations,
        maximumOwnedObjects: 1,
      },
      scenarios: [
        {
          id: "projectile_lifecycle",
          seed: 7,
          setup: [{ kind: "binding_present", bindingId: "actor" }],
          steps: [
            { kind: "dispatch_action", actionId: "move" },
            { kind: "advance_time", milliseconds: 16 },
          ],
          observations: [
            {
              kind: "owned_object_count",
              archetypeId: "projectile",
              operator: "equals",
              value: 0,
            },
          ],
        },
        {
          id: "projectile_progress",
          seed: 10,
          setup: [{ kind: "binding_present", bindingId: "actor" }],
          steps: [
            { kind: "dispatch_action", actionId: "move" },
            { kind: "advance_time", milliseconds: 16 },
          ],
          observations: [
            {
              kind: "owned_object_count",
              archetypeId: "projectile",
              operator: "at_least",
              value: 1,
            },
          ],
        },
        {
          id: "projectile_created",
          seed: 9,
          setup: [{ kind: "binding_present", bindingId: "actor" }],
          steps: [{ kind: "dispatch_action", actionId: "move" }],
          observations: [
            {
              kind: "owned_object_count",
              archetypeId: "projectile",
              operator: "at_least",
              value: 1,
            },
          ],
        },
        {
          id: "projectile_rejected",
          seed: 8,
          setup: [{ kind: "binding_present", bindingId: "actor" }],
          steps: [{ kind: "dispatch_action", actionId: "move" }],
          observations: [
            {
              kind: "owned_object_count",
              archetypeId: "projectile",
              operator: "equals",
              value: 0,
            },
          ],
        },
      ],
    };
    const grant = createMechanicCapabilityGrant({
      contract,
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    });
    if (!grant.success) {
      throw new Error("Expected the transient lifecycle grant to pass.");
    }
    const sourceArtifact: GeneratedMechanicSourceArtifact = {
      ...context.sourceArtifact,
      grant: grant.data,
      usedCapabilities: contract.capabilities,
    };
    const deterministicEvaluation = await evaluateGeneratedMechanicArtifact({
      fixtureId: "fixture_projectile_lifecycle",
      contract,
      artifact: sourceArtifact,
      config: { initial_count: 3 },
      externalObservations: [
        {
          id: "external_projectile_lifecycle",
          scenarioId: "projectile_lifecycle",
          observation: {
            kind: "owned_object_lifecycle_after_action",
            archetypeIds: ["projectile"],
            actionId: "move",
            requireActorOrigin: true,
          },
        },
        {
          id: "external_projectile_progress",
          scenarioId: "projectile_progress",
          observation: {
            kind: "owned_object_lifecycle_progress_after_action",
            archetypeIds: ["projectile"],
            actionId: "move",
            requireActorOrigin: true,
          },
        },
        {
          id: "external_projectile_created",
          scenarioId: "projectile_created",
          observation: {
            kind: "owned_object_creation_after_action",
            archetypeIds: ["projectile"],
            actionId: "move",
            requireActorOrigin: true,
          },
        },
        {
          id: "external_projectile_rejected",
          scenarioId: "projectile_rejected",
          observation: {
            kind: "owned_object_lifecycle_unchanged_after_action",
            archetypeIds: ["projectile"],
            actionId: "move",
          },
        },
      ],
      createRuntime: async ({ artifact, scenarioId }) => {
        const activity = {
          active: 0,
          actorOriginCreations: 0,
          created: 0,
          destroyed: 0,
          simulatedDistanceTraveled: 0,
          targetInteractions: 0,
        };
        return {
          sourceArtifactId: artifact.id,
          hasBinding: (bindingId) => bindingId === "actor",
          readDeclaredState: () => 3,
          readBindingProperty: () => ({ x: 0, y: 0 }),
          countOwnedObjects: () => activity.active,
          readOwnedObjectActivity: () => ({ ...activity }),
          readEmittedOutputs: () => [],
          install: async () => undefined,
          receiveInput: async () => undefined,
          dispatchAction: async () => {
            if (
              scenarioId === "projectile_lifecycle" ||
              scenarioId === "projectile_progress" ||
              scenarioId === "projectile_created"
            ) {
              activity.active = 1;
              activity.actorOriginCreations = 1;
              activity.created = 1;
            }
          },
          advanceTime: async () => {
            if (scenarioId === "projectile_lifecycle") {
              activity.active = 0;
              activity.destroyed = 1;
              activity.simulatedDistanceTraveled = 12;
            } else if (scenarioId === "projectile_progress") {
              activity.simulatedDistanceTraveled = 12;
            }
          },
          dispose: async () => undefined,
        };
      },
    });
    expect(deterministicEvaluation.outcome).toBe("passed");

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      contract,
      deterministicEvaluation,
      sourceArtifact,
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({ outcome: "accepted" });
  });

  it("loads an honest transient candidate and creates accepted identity only after browser proof", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    let loadedProject:
      | Parameters<
          Parameters<typeof createGeneratedMechanicProjectRuntime>[0]["loadProjectDependency"]
        >[0]
      | undefined;
    const runtime = createGeneratedMechanicProjectRuntime({
      async loadProjectDependency(project) {
        events.push("load_candidate");
        loadedProject = project;
        expect(project).toHaveProperty("runtimeCandidate");
        expect(project).not.toHaveProperty("artifact");
        if (!("runtimeCandidate" in project)) {
          throw new Error("Expected a transient runtime candidate project.");
        }
        expect(project.runtimeCandidate.executableArtifact).not.toHaveProperty(
          "acceptedAt"
        );
        expect(project.runtimeCandidate.executableArtifact).not.toHaveProperty(
          "checkpointId"
        );
        return { sourceArtifactId: project.dependency.sourceArtifact.id };
      },
      async installTrustedTemplate({ loadedResource }) {
        events.push("install_candidate");
        return loadedResource;
      },
      async runFirstPlayableBrowserChecks({ gamePack }) {
        events.push("browser_candidate");
        expect(context.gamePackStorage.records.size).toBe(0);
        return createPassedFirstPlayableAttempt(gamePack);
      },
      async disposeProjectDependency() {
        events.push("dispose_candidate");
      },
    });

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime,
    });

    if (result.outcome !== "accepted") {
      throw new Error(JSON.stringify(result.evidence));
    }
    expect(result).toMatchObject({ outcome: "accepted" });
    expect(loadedProject).toBeDefined();
    expect(events).toEqual([
      "load_candidate",
      "install_candidate",
      "browser_candidate",
      "dispose_candidate",
    ]);
  });

  it("commits pending, links the external GenerationRun, then returns only finalized lineage", async () => {
    const context = await createHandoffTestContext();
    const persistenceEvents: string[] = [];
    const compareAndSwap = vi.fn(
      async (
        ...input: Parameters<
          typeof context.gamePackRepository.compareAndSwap
        >
      ) => {
        const transaction = input[2]?.metadata?.
          generatedMechanicAcceptanceTransaction;
        if (
          transaction &&
          typeof transaction === "object" &&
          !Array.isArray(transaction) &&
          typeof transaction.status === "string"
        ) {
          persistenceEvents.push(`game-pack:${transaction.status}`);
        }
        return context.gamePackRepository.compareAndSwap(...input);
      }
    );
    const update = vi.fn(
      async (
        ...input: Parameters<typeof context.generationRunRepository.update>
      ) => {
        const updated = await context.generationRunRepository.update(...input);
        const transaction = updated.metadata?.
          generatedMechanicAcceptanceTransaction;
        if (
          transaction &&
          typeof transaction === "object" &&
          !Array.isArray(transaction) &&
          typeof transaction.status === "string"
        ) {
          persistenceEvents.push(`generation-run:${transaction.status}`);
        }
        return updated;
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        update,
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "accepted",
      gamePack: {
        metadata: {
          generatedMechanicAcceptanceTransaction: {
            status: "finalized",
          },
        },
      },
    });
    expect(persistenceEvents).toEqual([
      "game-pack:pending",
      "generation-run:pending",
      "game-pack:finalized",
      "generation-run:finalized",
    ]);
    if (result.outcome === "accepted") {
      expect(result.generationRun).toEqual(
        result.gamePack.generationRuns.find(
          ({ id }) => id === result.generationRun.id
        )
      );
      expect(result.generationRun).toMatchObject({
        metadata: {
          generatedMechanicAcceptanceTransaction: { status: "finalized" },
        },
      });
    }
    await expect(
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toEqual(
      result.outcome === "accepted" ? result.gamePack : undefined
    );
  });

  it("fails persistence closed when the browser cross-realm lock is unavailable", async () => {
    const context = await createHandoffTestContext();
    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: undefined,
    });

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [
          expect.objectContaining({ code: "acceptance_lock_unavailable" }),
        ],
      },
    });
    expect(context.gamePackStorage.records.size).toBe(0);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(context.generationRun);
  });

  it("rejects a cloned cross-realm lock receipt before accepted persistence", async () => {
    const context = await createHandoffTestContext();

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      acceptanceLockReceipt: {
        schemaVersion: "generated_mechanic_acceptance_lock_receipt/v1",
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [
          expect.objectContaining({ code: "acceptance_lock_receipt_invalid" }),
        ],
      },
    });
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("does not return accepted when cancellation wins during finalization", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    const rollbackEvents: string[] = [];
    const compareAndSwap = vi.fn(
      async (
        ...input: Parameters<
          typeof context.gamePackRepository.compareAndSwap
        >
      ) => {
        const committed = await context.gamePackRepository.compareAndSwap(
          ...input
        );
        const transaction = input[2]?.metadata?.
          generatedMechanicAcceptanceTransaction;
        if (
          transaction &&
          typeof transaction === "object" &&
          !Array.isArray(transaction) &&
          transaction.status === "finalized"
        ) {
          controller.abort("cancelled");
          throw new Error("Finalizing compare-and-swap threw after its write.");
        }
        if (input[2] === null && input[1]?.metadata) {
          rollbackEvents.push("game-pack:rollback");
        }
        return committed;
      }
    );
    const update = vi.fn(
      async (
        ...input: Parameters<typeof context.generationRunRepository.update>
      ) => {
        if (update.mock.calls.length > 1) {
          rollbackEvents.push("generation-run:rollback");
        }
        return context.generationRunRepository.update(...input);
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        update,
      },
      signal: controller.signal,
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [expect.objectContaining({ code: "generation_cancelled" })],
      },
    });
    expect(compareAndSwap).toHaveBeenCalledTimes(4);
    expect(rollbackEvents).toEqual([
      "game-pack:rollback",
      "generation-run:rollback",
      "game-pack:rollback",
    ]);
    expect(context.gamePackStorage.records.size).toBe(0);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(context.generationRun);
  });

  it("treats confirmed recovery-journal deletion as the acceptance commit point", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    const pendingGamePackId =
      `pending_${context.gamePack.id}_${context.finalGameSpec.extension.versionId}`;
    const compareAndSwap = vi.fn(
      async (
        ...input: Parameters<
          typeof context.gamePackRepository.compareAndSwap
        >
      ) => {
        const committed = await context.gamePackRepository.compareAndSwap(
          ...input
        );
        if (
          committed &&
          input[0] === pendingGamePackId &&
          input[1] !== null &&
          input[2] === null
        ) {
          controller.abort("late cancellation after acceptance commit");
        }
        return committed;
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      signal: controller.signal,
      runtime: createPassingRuntime([]),
    });

    expect(controller.signal.aborted).toBe(true);
    expect(result.outcome).toBe("accepted");
    expect(compareAndSwap).toHaveBeenCalledTimes(3);
    await expect(
      context.gamePackRepository.load(pendingGamePackId)
    ).resolves.toBeNull();
    await expect(
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toEqual(result.outcome === "accepted" ? result.gamePack : null);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(
      result.outcome === "accepted" ? result.generationRun : null
    );
  });

  it("compensates cancellation during a failed journal deletion when the journal remains", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    const pendingGamePackId =
      `pending_${context.gamePack.id}_${context.finalGameSpec.extension.versionId}`;
    const compareAndSwap = vi.fn(
      async (
        ...input: Parameters<
          typeof context.gamePackRepository.compareAndSwap
        >
      ) => {
        if (
          input[0] === pendingGamePackId &&
          input[1] !== null &&
          input[2] === null &&
          !controller.signal.aborted
        ) {
          controller.abort("cancelled during journal deletion");
          return false;
        }
        return context.gamePackRepository.compareAndSwap(...input);
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      signal: controller.signal,
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [expect.objectContaining({ code: "generation_cancelled" })],
      },
    });
    expect(context.gamePackStorage.records.size).toBe(0);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(context.generationRun);
  });

  it("lets cancellation win when it arrives during the final durable-state recheck", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    const fetch = vi.fn(async (generationRunId: string) => {
      const generationRun = await context.generationRunRepository.fetch(
        generationRunId
      );
      if (fetch.mock.calls.length === 2) {
        controller.abort("cancelled during the final durable-state recheck");
      }
      return generationRun;
    });

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      generationRunRepository: {
        fetch,
        update: context.generationRunRepository.update.bind(
          context.generationRunRepository
        ),
      },
      signal: controller.signal,
      runtime: createPassingRuntime([]),
    });

    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [expect.objectContaining({ code: "generation_cancelled" })],
      },
    });
    expect(context.gamePackStorage.records.size).toBe(0);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(context.generationRun);
  });

  it("reports durable acceptance when abort compensation loses to an accepted canonical edit", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    let concurrentCanonicalGamePack:
      | NonNullable<
          Awaited<ReturnType<typeof context.gamePackRepository.load>>
        >
      | undefined;
    const compareAndSwap = vi.fn(
      async (
        ...input: Parameters<
          typeof context.gamePackRepository.compareAndSwap
        >
      ) => {
        const committed = await context.gamePackRepository.compareAndSwap(
          ...input
        );
        const transaction = input[2]?.metadata?.
          generatedMechanicAcceptanceTransaction;
        if (
          transaction &&
          typeof transaction === "object" &&
          !Array.isArray(transaction) &&
          transaction.status === "finalized"
        ) {
          const canonical = await context.gamePackRepository.load(
            context.gamePack.id
          );
          if (!canonical) {
            throw new Error("Expected the durable accepted canonical Game Pack.");
          }
          concurrentCanonicalGamePack = parseGamePack({
            ...canonical,
            title: "Accepted concurrent canonical edit",
          });
          await context.gamePackRepository.save(concurrentCanonicalGamePack);
          controller.abort("cancelled");
          throw new Error("Canonical driver threw after accepted edit.");
        }
        return committed;
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      signal: controller.signal,
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "accepted",
      gamePack: { title: "Accepted concurrent canonical edit" },
      generationRun: {
        metadata: {
          generatedMechanicAcceptanceTransaction: { status: "finalized" },
        },
      },
    });
    await expect(
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toEqual(concurrentCanonicalGamePack);
  });

  it("does not perform accepted persistence when the transient candidate fails browser proof", async () => {
    const context = await createHandoffTestContext();
    const compareAndSwap = vi.spyOn(
      context.input.gamePackRepository,
      "compareAndSwap"
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([], {
        firstPlayableAttempt: createFailedFirstPlayableAttempt(context.gamePack),
      }),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: { stage: "first_playable" },
    });
    expect(compareAndSwap).not.toHaveBeenCalled();
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("stops at Final Game Spec preflight without loading or persisting a mismatched artifact", async () => {
    const context = await createHandoffTestContext();
    const loadProjectDependency = vi.fn();
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      finalGameSpec: {
        ...context.input.finalGameSpec,
        extension: {
          ...context.input.finalGameSpec.extension,
          sourceArtifactId: "source_wrong_artifact",
        },
      },
      runtime: {
        loadProjectDependency,
        installTrustedTemplate: vi.fn(),
        runFirstPlayableBrowserChecks: vi.fn(),
        disposeProjectDependency: vi.fn(),
      },
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "preflight",
        issues: [
          expect.objectContaining({ code: "source_artifact_identity_mismatch" }),
        ],
      },
    });
    expect(loadProjectDependency).not.toHaveBeenCalled();
    expect(context.gamePackStorage.records.size).toBe(0);
    const unchangedRun = await context.generationRunRepository.fetch(
      context.generationRun.id
    );
    expect(unchangedRun).not.toHaveProperty("relationships");
  });

  it("returns structured persistence evidence when GenerationRun preflight fetch throws", async () => {
    const context = await createHandoffTestContext();
    const runtimeEvents: string[] = [];

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      generationRunRepository: {
        async fetch() {
          throw new Error("GenerationRun storage is unavailable.");
        },
        update: context.generationRunRepository.update.bind(
          context.generationRunRepository
        ),
      },
      runtime: createPassingRuntime(runtimeEvents),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [
          expect.objectContaining({
            path: "generationRunId",
            code: "generation_run_fetch_failed",
            message: "GenerationRun storage is unavailable.",
          }),
        ],
      },
    });
    expect(runtimeEvents).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(context.generationRun);
  });

  it("rejects a same-ID Game Pack whose Game Spec diverges from the Final Game Spec", async () => {
    const context = await createHandoffTestContext();
    const loadProjectDependency = vi.fn();
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePack: gamePackSchema.parse({
        ...context.gamePack,
        gameSpec: {
          ...context.gamePack.gameSpec,
          title: "Stale generated-counter snapshot",
        },
      }),
      runtime: {
        loadProjectDependency,
        installTrustedTemplate: vi.fn(),
        runFirstPlayableBrowserChecks: vi.fn(),
        disposeProjectDependency: vi.fn(),
      },
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "preflight",
        issues: [expect.objectContaining({ code: "game_spec_mismatch" })],
      },
    });
    expect(loadProjectDependency).not.toHaveBeenCalled();
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects a capability grant whose canonical operation metadata was substituted", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const sourceArtifact = {
      ...context.sourceArtifact,
      grant: {
        ...context.sourceArtifact.grant,
        capabilities: context.sourceArtifact.grant.capabilities.map(
          (capability, index) =>
            index === 0
              ? { ...capability, runtimeOperation: "state_write" }
              : capability
        ),
      },
    } as GeneratedMechanicSourceArtifact;

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime(events),
      sourceArtifact,
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "preflight",
        issues: [
          expect.objectContaining({ code: "source_capability_grant_mismatch" }),
        ],
      },
    });
    expect(events).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects a source run that omits the accepted contract artifact receipt", async () => {
    const context = await createHandoffTestContext();
    const repairReceipt = context.generationRun.artifactScopedRepair;
    if (!repairReceipt) {
      throw new Error("Test GenerationRun requires artifact repair evidence.");
    }
    const generationRunWithoutContractArtifact = {
      ...context.generationRun,
      artifactScopedRepair: {
        ...repairReceipt,
        artifacts: repairReceipt.artifacts.filter(
          ({ stage }) => stage !== "contract"
        ),
      },
    } as never;
    const events: string[] = [];

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      generationRunRepository: {
        fetch: async () => generationRunWithoutContractArtifact,
        update: context.generationRunRepository.update.bind(
          context.generationRunRepository
        ),
      },
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "preflight",
        issues: [
          expect.objectContaining({ code: "artifact_repair_receipt_mismatch" }),
        ],
      },
    });
    expect(events).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects invalid config, bindings, references, ports, capability version, and compiled source", async () => {
    const context = await createHandoffTestContext();
    const validate = (
      overrides: Partial<
        Parameters<typeof validateGeneratedMechanicFinalGameSpec>[0]
      > = {}
    ) =>
      validateGeneratedMechanicFinalGameSpec({
        contract: context.contract,
        finalGameSpec: context.finalGameSpec,
        referenceCatalog: context.input.referenceCatalog,
        sourceArtifact: context.sourceArtifact,
        trustedPortContracts: [],
        ...overrides,
      });
    const codes = (result: ReturnType<typeof validate>) =>
      result.success ? [] : result.issues.map(({ code }) => code);

    const invalidConfig = validate({
      finalGameSpec: {
        ...context.finalGameSpec,
        gameSpec: {
          ...context.finalGameSpec.gameSpec,
          mechanics: context.finalGameSpec.gameSpec.mechanics.map((mechanic) =>
            mechanic.id === context.finalGameSpec.extension.mechanicId
              ? { ...mechanic, config: { initial_count: 99 } }
              : mechanic
          ),
        },
        extension: {
          ...context.finalGameSpec.extension,
          config: { initial_count: 99 },
        },
      },
    });
    const invalidBinding = validate({
      finalGameSpec: {
        ...context.finalGameSpec,
        extension: {
          ...context.finalGameSpec.extension,
          bindings: [
            {
              ...context.finalGameSpec.extension.bindings[0],
              cardinality: "many",
            },
          ],
        },
      },
    });
    const unknownReferenceContract: GeneratedMechanicContract = {
      ...context.contract,
      bindings: [
        {
          ...context.contract.bindings[0],
          objectIds: ["entity_unknown"],
        },
      ],
    };
    const unknownReference = validate({
      contract: unknownReferenceContract,
      finalGameSpec: {
        ...context.finalGameSpec,
        extension: {
          ...context.finalGameSpec.extension,
          bindings: [
            {
              ...context.finalGameSpec.extension.bindings[0],
              objectIds: ["entity_unknown"],
            },
          ],
        },
      },
    });
    const portContract: GeneratedMechanicContract = {
      ...context.contract,
      ports: [
        {
          id: "count_changed",
          direction: "output",
          payload: { kind: "integer", minimum: 0, maximum: 20 },
        },
      ],
    };
    const invalidPort = validate({
      contract: portContract,
      finalGameSpec: {
        ...context.finalGameSpec,
        gameSpec: {
          ...context.finalGameSpec.gameSpec,
          mechanicConnections: {
            schemaVersion: "mechanic_port_connections/v1",
            connections: [
              {
                id: "counter_score",
                output: {
                  ownerKind: "mechanic",
                  ownerId: context.finalGameSpec.extension.mechanicId,
                  portId: "count_changed",
                },
                input: {
                  ownerKind: "game_system",
                  ownerId: "score",
                  portId: "set_value",
                },
              },
            ],
          },
        },
      },
      trustedPortContracts: [
        {
          ownerKind: "game_system",
          ownerId: "score",
          ports: [
            {
              id: "set_value",
              direction: "input",
              payload: { kind: "boolean" },
            },
          ],
        },
      ],
    });
    const invalidCapabilityVersion = validate({
      finalGameSpec: {
        ...context.finalGameSpec,
        extension: {
          ...context.finalGameSpec.extension,
          capabilityVersion: "mechanic_capability/v2",
        },
      },
    });
    const uncompiledSource = validate({
      sourceArtifact: {
        ...context.sourceArtifact,
        build: { ...context.sourceArtifact.build, compiled: false },
      } as never,
    });

    expect(codes(invalidConfig)).toContain("invalid_mechanic_config");
    expect(codes(invalidBinding)).toContain("binding_contract_mismatch");
    expect(codes(unknownReference)).toContain("unknown_binding_reference");
    expect(codes(invalidPort)).toContain("incompatible_payload");
    expect(codes(invalidCapabilityVersion)).toContain(
      "capability_version_mismatch"
    );
    expect(codes(uncompiledSource)).toContain("source_artifact_not_compiled");
  });

  it("rejects semantically valid mechanic ports before runtime or persistence for the portless host profile", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const contract: GeneratedMechanicContract = {
      ...context.contract,
      ports: [
        {
          id: "count_changed",
          direction: "output",
          payload: { kind: "integer", minimum: 0, maximum: 20 },
        },
      ],
    };
    const gameSpec = {
      ...context.finalGameSpec.gameSpec,
      mechanicConnections: {
        schemaVersion: "mechanic_port_connections/v1" as const,
        connections: [
          {
            id: "counter_score",
            output: {
              ownerKind: "mechanic" as const,
              ownerId: context.finalGameSpec.extension.mechanicId,
              portId: "count_changed",
            },
            input: {
              ownerKind: "game_system" as const,
              ownerId: "score",
              portId: "set_value",
            },
          },
        ],
      },
    };
    const finalGameSpec = {
      ...context.finalGameSpec,
      gameSpec,
    };
    const trustedPortContracts = [
      {
        ownerKind: "game_system" as const,
        ownerId: "score",
        ports: [
          {
            id: "set_value",
            direction: "input" as const,
            payload: { kind: "integer" as const, minimum: 0, maximum: 20 },
          },
        ],
      },
    ];

    const validation = validateGeneratedMechanicFinalGameSpec({
      contract,
      finalGameSpec,
      referenceCatalog: context.input.referenceCatalog,
      sourceArtifact: context.sourceArtifact,
      trustedPortContracts,
    });
    expect(validation).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ code: "unsupported_runtime_ports" })],
    });

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      contract,
      finalGameSpec,
      gamePack: { ...context.gamePack, gameSpec },
      runtime: createPassingRuntime(events),
      trustedPortContracts,
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "preflight",
        issues: [expect.objectContaining({ code: "unsupported_runtime_ports" })],
      },
    });
    expect(events).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it.each([
    {
      name: "gameplay events without a trusted event source",
      code: "unsupported_runtime_gameplay_events",
      mutate: (contract: GeneratedMechanicContract) => ({
        ...contract,
        lifecycle: {
          ...contract.lifecycle,
          callbacks: [...contract.lifecycle.callbacks, "gameplay_event" as const],
        },
      }),
    },
  ])("rejects $name before runtime or persistence", async ({ code, mutate }) => {
    const context = await createHandoffTestContext();
    const events: string[] = [];

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      contract: mutate(context.contract),
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "preflight",
      },
    });
    expect(result.evidence.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })])
    );
    expect(events).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("keeps failed deterministic evaluation out of runtime and durable project lineage", async () => {
    const context = await createHandoffTestContext();
    const loadProjectDependency = vi.fn();
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      deterministicEvaluation: {
        ...context.input.deterministicEvaluation,
        outcome: "failed",
      },
      runtime: {
        loadProjectDependency,
        installTrustedTemplate: vi.fn(),
        runFirstPlayableBrowserChecks: vi.fn(),
        disposeProjectDependency: vi.fn(),
      },
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "deterministic_evaluation",
        issues: [
          expect.objectContaining({ code: "deterministic_evaluation_failed" }),
        ],
      },
    });
    expect(loadProjectDependency).not.toHaveBeenCalled();
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects passed evaluation evidence that omits declared scenario work", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const emptyScenarios = context.input.deterministicEvaluation.evidence.scenarios.map(
      (scenario) => ({
        ...scenario,
        setup: [],
        steps: [],
        declaredObservations: [],
        externalObservations: [],
      })
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      deterministicEvaluation: {
        ...context.input.deterministicEvaluation,
        evidence: {
          ...context.input.deterministicEvaluation.evidence,
          scenarios: emptyScenarios,
          replay: { matched: true, replayScenarios: emptyScenarios },
        },
      },
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "deterministic_evaluation",
        issues: [
          expect.objectContaining({
            code: "evaluation_scenario_evidence_mismatch",
          }),
        ],
      },
    });
    expect(events).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects passed evidence whose reported actual value contradicts its assertion", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const divergentScenarios =
      context.input.deterministicEvaluation.evidence.scenarios.map(
        (scenario) => ({
          ...scenario,
          declaredObservations: scenario.declaredObservations.map(
            (observation) => ({ ...observation, actual: 3 })
          ),
        })
      );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      deterministicEvaluation: {
        ...context.input.deterministicEvaluation,
        evidence: {
          ...context.input.deterministicEvaluation.evidence,
          scenarios: divergentScenarios,
          replay: { matched: true, replayScenarios: divergentScenarios },
        },
      },
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "deterministic_evaluation",
        issues: [
          expect.objectContaining({
            code: "evaluation_scenario_evidence_mismatch",
          }),
        ],
      },
    });
    expect(events).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects a byte-identical clone of a genuinely issued passed evaluation", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const issuedEvaluation = await createIssuedPassedEvaluation({
      contract: context.contract,
      sourceArtifact: context.sourceArtifact,
    });

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      deterministicEvaluation: structuredClone(issuedEvaluation),
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "deterministic_evaluation",
        issues: [
          expect.objectContaining({ code: "untrusted_evaluation_receipt" }),
        ],
      },
    });
    expect(events).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects an issued receipt paired with a same-ID no-op source snapshot", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const divergentSourceArtifact = {
      ...context.sourceArtifact,
      callbacks: context.sourceArtifact.callbacks.map((callback) =>
        callback.kind === "logical_action"
          ? {
              ...callback,
              sourceTypeScript: "return null;",
              normalizedJavaScript:
                "const __sparklineGeneratedMechanicCallback = async () => null;",
            }
          : callback
      ),
    };

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      sourceArtifact: divergentSourceArtifact,
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "deterministic_evaluation",
        issues: [
          expect.objectContaining({ code: "untrusted_evaluation_receipt" }),
        ],
      },
    });
    expect(events).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects an issued receipt when the accepted Final Game Spec substitutes evaluated config", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const substitutedGameSpec = {
      ...context.input.finalGameSpec.gameSpec,
      mechanics: context.input.finalGameSpec.gameSpec.mechanics.map(
        (mechanic) =>
          mechanic.id === context.input.finalGameSpec.extension.mechanicId
            ? { ...mechanic, config: { initial_count: 4 } }
            : mechanic
      ),
    };
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePack: {
        ...context.input.gamePack,
        gameSpec: substitutedGameSpec,
      },
      finalGameSpec: {
        ...context.input.finalGameSpec,
        extension: {
          ...context.input.finalGameSpec.extension,
          config: { initial_count: 4 },
        },
        gameSpec: substitutedGameSpec,
      },
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "deterministic_evaluation",
        issues: [
          expect.objectContaining({ code: "untrusted_evaluation_receipt" }),
        ],
      },
    });
    expect(events).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects deterministic evaluation that does not retain its replay scenarios", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      deterministicEvaluation: {
        ...context.input.deterministicEvaluation,
        evidence: {
          ...context.input.deterministicEvaluation.evidence,
          replay: { matched: true },
        },
      } as never,
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "deterministic_evaluation",
        issues: [
          expect.objectContaining({
            code: "deterministic_replay_missing",
          }),
        ],
      },
    });
    expect(events).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects replay evidence that diverges despite retaining the same scenario IDs", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const replayScenarios = context.input.deterministicEvaluation.evidence.scenarios.map(
      (scenario) => ({ ...scenario, seed: scenario.seed + 1 })
    );
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      deterministicEvaluation: {
        ...context.input.deterministicEvaluation,
        evidence: {
          ...context.input.deterministicEvaluation.evidence,
          replay: { matched: true, replayScenarios },
        },
      },
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "deterministic_evaluation",
        issues: [
          expect.objectContaining({ code: "deterministic_replay_mismatch" }),
        ],
      },
    });
    expect(events).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("retains runtime activation failure as internal evidence without accepted lineage", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime(events, {
        installError: new Error("Contained install failed."),
      }),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "runtime_activation",
        issues: [
          expect.objectContaining({
            code: "runtime_activation_failed",
            message: "Contained install failed.",
          }),
        ],
      },
    });
    expect(events).toEqual([
      `load:${context.sourceArtifact.id}`,
      `install:${context.sourceArtifact.id}`,
      `dispose:${context.sourceArtifact.id}`,
    ]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects a structurally compatible runtime that was not issued by the trusted factory", async () => {
    const context = await createHandoffTestContext();
    const loadProjectDependency = vi.fn();
    const installTrustedTemplate = vi.fn();
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: {
        loadProjectDependency,
        installTrustedTemplate,
        runFirstPlayableBrowserChecks: vi.fn(),
        disposeProjectDependency: vi.fn(),
      },
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "preflight",
        issues: [
          expect.objectContaining({ code: "untrusted_project_runtime" }),
        ],
      },
    });
    expect(loadProjectDependency).not.toHaveBeenCalled();
    expect(installTrustedTemplate).not.toHaveBeenCalled();
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("keeps failed first-playable browser evidence out of durable lineage", async () => {
    const context = await createHandoffTestContext();
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([], {
        firstPlayableAttempt: createFailedFirstPlayableAttempt(context.gamePack),
      }),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "first_playable",
        issues: [
          expect.objectContaining({ code: "fatal_runtime_error" }),
          expect.objectContaining({ code: "first_playable_not_passed" }),
        ],
      },
    });
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects an invalid acceptance timestamp before runtime work", async () => {
    const context = await createHandoffTestContext();
    const loadProjectDependency = vi.fn();
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      acceptedAt: "not-a-timestamp",
      runtime: {
        loadProjectDependency,
        installTrustedTemplate: vi.fn(),
        runFirstPlayableBrowserChecks: vi.fn(),
        disposeProjectDependency: vi.fn(),
      },
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "preflight",
        issues: [
          expect.objectContaining({
            code: "invalid_accepted_at",
          }),
        ],
      },
    });
    expect(loadProjectDependency).not.toHaveBeenCalled();
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects an acceptance timestamp before retained project state", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      acceptedAt: "2026-08-11T11:59:59.000Z",
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "preflight",
        issues: [
          expect.objectContaining({
            code: "accepted_at_before_project_state",
          }),
        ],
      },
    });
    expect(events).toEqual([]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects acceptance before the retained first-playable attempt began", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      acceptedAt: "2026-08-11T12:00:00.000Z",
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "first_playable",
        issues: [
          expect.objectContaining({
            code: "accepted_at_before_first_playable",
          }),
        ],
      },
    });
    expect(events).toEqual([
      `load:${context.sourceArtifact.id}`,
      `install:${context.sourceArtifact.id}`,
      `browser:${context.sourceArtifact.id}`,
      `dispose:${context.sourceArtifact.id}`,
    ]);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("mints live acceptance time only after first-playable browser proof", async () => {
    const context = await createHandoffTestContext();
    const events: string[] = [];
    const { acceptedAt: _acceptedAt, ...inputWithoutAcceptedAt } = context.input;
    void _acceptedAt;

    const result = await completeGeneratedMechanicProjectHandoff({
      ...inputWithoutAcceptedAt,
      createAcceptedAt: () => {
        events.push("mint-accepted-at");
        return "2026-08-11T12:00:10.000Z";
      },
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "accepted",
      artifact: { acceptedAt: "2026-08-11T12:00:10.000Z" },
    });
    expect(events).toEqual([
      `load:${context.sourceArtifact.id}`,
      `install:${context.sourceArtifact.id}`,
      `browser:${context.sourceArtifact.id}`,
      "mint-accepted-at",
      `dispose:${context.sourceArtifact.id}`,
    ]);
  });

  it("rejects cancellation before runtime activation without durable writes", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    controller.abort();
    const loadProjectDependency = vi.fn();

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      signal: controller.signal,
      runtime: {
        loadProjectDependency,
        installTrustedTemplate: vi.fn(),
        runFirstPlayableBrowserChecks: vi.fn(),
        disposeProjectDependency: vi.fn(),
      },
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "preflight",
        issues: [expect.objectContaining({ code: "generation_cancelled" })],
      },
    });
    expect(loadProjectDependency).not.toHaveBeenCalled();
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects cancellation observed during browser proof before persistence", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    const events: string[] = [];

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      signal: controller.signal,
      runtime: createPassingRuntime(events, {
        onBrowserCheck: () => controller.abort(),
      }),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "first_playable",
        issues: [expect.objectContaining({ code: "generation_cancelled" })],
      },
    });
    expect(events.at(-1)).toBe(`dispose:${context.sourceArtifact.id}`);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it.each([
    {
      name: "runtime dependency loading",
      stage: "runtime_activation" as const,
      runtimeOptions: (controller: AbortController) => ({
        loadError: new Error("load aborted"),
        onLoadProject: () => controller.abort(),
      }),
    },
    {
      name: "trusted template installation",
      stage: "runtime_activation" as const,
      runtimeOptions: (controller: AbortController) => ({
        installError: new Error("install aborted"),
        onInstall: () => controller.abort(),
      }),
    },
    {
      name: "first-playable browser proof",
      stage: "first_playable" as const,
      runtimeOptions: (controller: AbortController) => ({
        browserError: new Error("browser proof aborted"),
        onBrowserCheck: () => controller.abort(),
      }),
    },
  ])(
    "classifies an abort-driven $name exception as generation cancellation",
    async ({ runtimeOptions, stage }) => {
      const context = await createHandoffTestContext();
      const controller = new AbortController();
      const events: string[] = [];

      const result = await completeGeneratedMechanicProjectHandoff({
        ...context.input,
        signal: controller.signal,
        runtime: createPassingRuntime(events, runtimeOptions(controller)),
      });

      expect(result).toMatchObject({
        outcome: "rejected",
        evidence: {
          stage,
          issues: [expect.objectContaining({ code: "generation_cancelled" })],
        },
      });
      expect(result).not.toMatchObject({
        evidence: {
          issues: [
            expect.objectContaining({
              code: expect.stringMatching(
                /runtime_dependency_load_failed|runtime_activation_failed|first_playable_checks_failed/
              ),
            }),
          ],
        },
      });
      expect(events.at(-1)).toMatch(/^dispose:/);
      expect(context.gamePackStorage.records.size).toBe(0);
    }
  );

  it("rejects cancellation during the durable preflight read before compare-and-swap", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    const compareAndSwap = vi.fn(
      context.gamePackRepository.compareAndSwap.bind(
        context.gamePackRepository
      )
    );
    const load = vi.fn(async (gamePackId: string) => {
      const restored = await context.gamePackRepository.load(gamePackId);
      controller.abort();
      return restored;
    });

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: { compareAndSwap, load },
      signal: controller.signal,
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [expect.objectContaining({ code: "generation_cancelled" })],
      },
    });
    expect(compareAndSwap).not.toHaveBeenCalled();
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("classifies an abort-driven durable preflight exception as cancellation", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    const compareAndSwap = vi.fn();
    const load = vi.fn(async () => {
      controller.abort("cancelled");
      throw new Error("durable read aborted");
    });

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: { compareAndSwap, load },
      signal: controller.signal,
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [expect.objectContaining({ code: "generation_cancelled" })],
      },
    });
    expect(result).not.toMatchObject({
      evidence: {
        issues: [
          expect.objectContaining({ code: "game_pack_commit_preflight_failed" }),
        ],
      },
    });
    expect(compareAndSwap).not.toHaveBeenCalled();
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rolls back acceptance when cancellation arrives during compare-and-swap", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    const compareAndSwap = vi.fn(
      async (...input: Parameters<typeof context.gamePackRepository.compareAndSwap>) => {
        const committed = await context.gamePackRepository.compareAndSwap(...input);
        if (compareAndSwap.mock.calls.length === 1) {
          controller.abort();
        }
        return committed;
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      signal: controller.signal,
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [expect.objectContaining({ code: "generation_cancelled" })],
      },
    });
    expect(compareAndSwap).toHaveBeenCalledTimes(2);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rolls back acceptance when cancellation arrives during durable restore", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    const compareAndSwap = vi.fn(
      context.gamePackRepository.compareAndSwap.bind(
        context.gamePackRepository
      )
    );
    const load = vi.fn(async (gamePackId: string) => {
      const restored = await context.gamePackRepository.load(gamePackId);
      if (load.mock.calls.length === 3) {
        controller.abort();
      }
      return restored;
    });

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: { compareAndSwap, load },
      signal: controller.signal,
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [expect.objectContaining({ code: "generation_cancelled" })],
      },
    });
    expect(compareAndSwap).toHaveBeenCalledTimes(2);
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rejects a post-CAS restore whose current checkpoint no longer carries the accepted lineage", async () => {
    const context = await createHandoffTestContext();
    let concurrentGamePack:
      | Awaited<ReturnType<typeof context.gamePackRepository.load>>
      | undefined;
    const load = vi.fn(async (gamePackId: string) => {
      const restored = await context.gamePackRepository.load(gamePackId);
      if (load.mock.calls.length !== 3 || !restored) {
        return restored;
      }
      const advanced = restoreGamePackCheckpoint({
        gamePack: restored,
        restoredAt: "2026-08-11T12:00:11.000Z",
        sourceCheckpointId: restored.currentCheckpointId!,
      });
      concurrentGamePack = parseGamePack({
        ...advanced,
        checkpoints: advanced.checkpoints.map((checkpoint) => {
          if (checkpoint.id !== advanced.currentCheckpointId) {
            return checkpoint;
          }
          const {
            generatedMechanicArtifactIds: ignoredArtifactIds,
            ...checkpointWithoutArtifact
          } = checkpoint;
          void ignoredArtifactIds;
          return checkpointWithoutArtifact;
        }),
      });
      await context.gamePackRepository.save(concurrentGamePack);
      return concurrentGamePack;
    });
    const update = vi.fn(
      context.generationRunRepository.update.bind(
        context.generationRunRepository
      )
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap: context.gamePackRepository.compareAndSwap.bind(
          context.gamePackRepository
        ),
        load,
      },
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        update,
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: "accepted_artifact_restore_mismatch",
          }),
        ]),
      },
    });
    expect(update).not.toHaveBeenCalled();
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.not.toHaveProperty("relationships");
    await expect(
      context.gamePackRepository.load(concurrentGamePack?.id ?? "missing")
    ).resolves.toEqual(concurrentGamePack);
  });

  it("rolls back both durable records when cancellation arrives during GenerationRun linkage", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    const compareAndSwap = vi.fn(
      context.gamePackRepository.compareAndSwap.bind(
        context.gamePackRepository
      )
    );
    const update = vi.fn(
      async (...input: Parameters<typeof context.generationRunRepository.update>) => {
        const updated = await context.generationRunRepository.update(...input);
        if (update.mock.calls.length === 1) {
          controller.abort();
        }
        return updated;
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        update,
      },
      signal: controller.signal,
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [expect.objectContaining({ code: "generation_cancelled" })],
      },
    });
    expect(compareAndSwap).toHaveBeenCalledTimes(2);
    expect(context.gamePackStorage.records.size).toBe(0);
    expect(
      await context.generationRunRepository.fetch(context.generationRun.id)
    ).toEqual(context.generationRun);
  });

  it("lets cancellation win when abort arrives during final linkage before journal deletion", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    const compareAndSwap = vi.fn(
      context.gamePackRepository.compareAndSwap.bind(
        context.gamePackRepository
      )
    );
    const update = vi.fn(
      async (...input: Parameters<typeof context.generationRunRepository.update>) => {
        const updated = await context.generationRunRepository.update(...input);
        if (update.mock.calls.length === 2) {
          controller.abort();
        }
        return updated;
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        update,
      },
      signal: controller.signal,
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [expect.objectContaining({ code: "generation_cancelled" })],
      },
    });
    expect(update).toHaveBeenCalledTimes(3);
    expect(context.gamePackStorage.records.size).toBe(0);
    await expect(
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toBeNull();
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(context.generationRun);
  });

  it("does not erase a cancellation that wins before GenerationRun lineage linkage", async () => {
    const context = await createHandoffTestContext();
    const controller = new AbortController();
    const compareAndSwap = vi.fn(
      context.gamePackRepository.compareAndSwap.bind(
        context.gamePackRepository
      )
    );
    const update = vi.fn(
      async (...input: Parameters<typeof context.generationRunRepository.update>) => {
        if (update.mock.calls.length === 1) {
          await context.generationRunRepository.update(
            context.generationRun.id,
            (current) => ({
              ...current,
              status: "cancelled",
              completedAt: "2026-08-11T12:00:11.000Z",
              durationMs: 20_000,
              stage: "cancellation",
              failureClass: "cancellation",
              metadata: {
                ...(current.metadata ?? {}),
                generatedMechanicOutcome: {
                  status: "rejected",
                  stage: "continuation",
                  issues: [
                    {
                      path: "context.signal",
                      code: "generation_cancelled",
                      message: "The creator cancelled generated continuation.",
                    },
                  ],
                },
              },
            })
          );
          controller.abort("cancelled");
          throw new Error("GenerationRun linkage lost cancellation ownership.");
        }
        return context.generationRunRepository.update(...input);
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        update,
      },
      signal: controller.signal,
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [expect.objectContaining({ code: "generation_cancelled" })],
      },
    });
    expect(compareAndSwap).toHaveBeenCalledTimes(2);
    expect(context.gamePackStorage.records.size).toBe(0);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toMatchObject({
      status: "cancelled",
      stage: "cancellation",
      failureClass: "cancellation",
      metadata: {
        generatedMechanicOutcome: {
          stage: "continuation",
          issues: [expect.objectContaining({ code: "generation_cancelled" })],
        },
      },
    });
  });

  it("rejects reuse of an immutable accepted extension version before runtime work", async () => {
    const context = await createHandoffTestContext();
    const accepted = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([]),
    });
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") {
      return;
    }
    const durableBeforeReuse = await context.gamePackRepository.load(
      context.gamePack.id
    );
    const events: string[] = [];

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      acceptedAt: "2026-08-11T12:00:11.000Z",
      gamePack: accepted.gamePack,
      runtime: createPassingRuntime(events),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "preflight",
        issues: [
          expect.objectContaining({ code: "immutable_version_id_reuse" }),
        ],
      },
    });
    expect(events).toEqual([]);
    await expect(
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toEqual(durableBeforeReuse);
  });

  it("accepts a later extension version without rewriting the first accepted version lineage", async () => {
    const context = await createHandoffTestContext();
    const firstAcceptance = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([]),
    });
    expect(firstAcceptance.outcome).toBe("accepted");
    if (firstAcceptance.outcome !== "accepted") {
      return;
    }

    const firstArtifact = firstAcceptance.artifact;
    const firstBuild = firstAcceptance.gamePack.builds.find(
      ({ id }) => id === firstArtifact.buildId
    );
    const firstCheckpoint = firstAcceptance.gamePack.checkpoints.find(
      ({ id }) => id === firstArtifact.checkpointId
    );
    const firstEvidence = firstArtifact.validationEvidenceIds.map(
      (evidenceId) =>
        firstAcceptance.gamePack.validationEvidence.find(
          ({ id }) => id === evidenceId
        )
    );
    expect(firstBuild).toBeDefined();
    expect(firstCheckpoint).toBeDefined();
    expect(firstEvidence.every(Boolean)).toBe(true);

    const sourceArtifactV2: GeneratedMechanicSourceArtifact = {
      ...context.sourceArtifact,
      id: "source_generated_counter_v2",
    };
    const finalGameSpecV2 = {
      ...context.finalGameSpec,
      id: "final_game_spec_generated_counter_v2",
      extension: {
        ...context.finalGameSpec.extension,
        versionId: "extension_generated_counter_v2",
        sourceArtifactId: sourceArtifactV2.id,
      },
    };
    const generationRunV2 = generationRunSchema.parse({
      ...context.generationRun,
      id: "generation_run_generated_counter_v2",
      createdAt: "2026-08-11T12:00:11.000Z",
      startedAt: "2026-08-11T12:00:12.000Z",
      completedAt: "2026-08-11T12:00:20.000Z",
      artifactScopedRepair: createVersionedArtifactRepairReceipt({
        finalGameSpecArtifactId: finalGameSpecV2.id,
        generationRunId: "generation_run_generated_counter_v2",
        sourceArtifactId: sourceArtifactV2.id,
      }),
    });
    await context.generationRunRepository.create(generationRunV2);
    const deterministicEvaluationV2 = await createIssuedPassedEvaluation({
      contract: context.contract,
      sourceArtifact: sourceArtifactV2,
    });

    const secondAcceptance = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      acceptedAt: "2026-08-11T12:00:30.000Z",
      deterministicEvaluation: deterministicEvaluationV2,
      finalGameSpec: finalGameSpecV2,
      gamePack: firstAcceptance.gamePack,
      generationRunId: generationRunV2.id,
      runtime: createPassingRuntime([]),
      sourceArtifact: sourceArtifactV2,
    });

    expect(secondAcceptance.outcome).toBe("accepted");
    if (secondAcceptance.outcome !== "accepted") {
      return;
    }

    expect(secondAcceptance.gamePack.acceptedGeneratedMechanicArtifacts).toHaveLength(
      2
    );
    expect(secondAcceptance.gamePack.acceptedGeneratedMechanicArtifacts?.[0]).toEqual(
      firstArtifact
    );
    expect(
      secondAcceptance.gamePack.builds.find(({ id }) => id === firstArtifact.buildId)
    ).toEqual(firstBuild);
    expect(
      secondAcceptance.gamePack.checkpoints.find(
        ({ id }) => id === firstArtifact.checkpointId
      )
    ).toEqual(firstCheckpoint);
    expect(
      firstArtifact.validationEvidenceIds.map((evidenceId) =>
        secondAcceptance.gamePack.validationEvidence.find(
          ({ id }) => id === evidenceId
        )
      )
    ).toEqual(firstEvidence);

    const secondArtifact = secondAcceptance.artifact;
    expect(secondArtifact.id).toBe("extension_generated_counter_v2");
    expect(secondArtifact.buildId).not.toBe(firstArtifact.buildId);
    expect(secondArtifact.checkpointId).not.toBe(firstArtifact.checkpointId);
    expect(
      secondArtifact.validationEvidenceIds.filter((id) =>
        firstArtifact.validationEvidenceIds.includes(id)
      )
    ).toEqual([]);
    expect(
      secondAcceptance.gamePack.builds.find(
        ({ id }) => id === secondArtifact.buildId
      )?.generatedMechanicArtifactIds
    ).toEqual([secondArtifact.id]);
    expect(
      secondAcceptance.gamePack.checkpoints.find(
        ({ id }) => id === secondArtifact.checkpointId
      )?.generatedMechanicArtifactIds
    ).toEqual([secondArtifact.id]);
    expect(secondAcceptance.gamePack.currentCheckpointId).toBe(
      secondArtifact.checkpointId
    );
    expect(gamePackSchema.safeParse(secondAcceptance.gamePack).success).toBe(true);
    await expect(
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toEqual(secondAcceptance.gamePack);
  });

  it("keeps the last finalized Game Pack available and retryable if a later pending write driver throws", async () => {
    const context = await createHandoffTestContext();
    const firstAcceptance = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([]),
    });
    expect(firstAcceptance.outcome).toBe("accepted");
    if (firstAcceptance.outcome !== "accepted") {
      return;
    }
    const versionTwo = await createVersionTwoHandoffInput(context);
    let pendingGamePackId: string | undefined;
    let canonicalDuringPendingWrite: GamePack | null | undefined;
    const compareAndSwap = vi.fn(
      async (
        ...input: Parameters<
          typeof context.gamePackRepository.compareAndSwap
        >
      ) => {
        const committed = await context.gamePackRepository.compareAndSwap(
          ...input
        );
        const transaction = input[2]?.metadata?.
          generatedMechanicAcceptanceTransaction;
        if (
          transaction &&
          typeof transaction === "object" &&
          !Array.isArray(transaction) &&
          transaction.status === "pending"
        ) {
          pendingGamePackId = input[0];
          canonicalDuringPendingWrite = await context.gamePackRepository.load(
            firstAcceptance.gamePack.id
          );
          throw new Error("Simulated process crash after the pending write.");
        }
        return committed;
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      ...versionTwo,
      gamePack: firstAcceptance.gamePack,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: { stage: "persistence" },
    });
    expect(pendingGamePackId).not.toBe(firstAcceptance.gamePack.id);
    expect(canonicalDuringPendingWrite).toEqual(firstAcceptance.gamePack);
    await expect(
      context.gamePackRepository.load(firstAcceptance.gamePack.id)
    ).resolves.toEqual(firstAcceptance.gamePack);
    await expect(
      context.gamePackRepository.load(pendingGamePackId ?? "missing")
    ).resolves.toBeNull();

    const retry = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      ...versionTwo,
      gamePack: firstAcceptance.gamePack,
      runtime: createPassingRuntime([]),
    });
    expect(retry.outcome).toBe("accepted");
  });

  it("resumes an exact staging-only crash record on the next handoff retry", async () => {
    const context = await createHandoffTestContext();
    const captured = await completeAndCaptureAcceptanceTransaction(context);

    await context.gamePackRepository.delete(captured.accepted.gamePack.id);
    await context.generationRunRepository.update(
      context.generationRun.id,
      () => context.generationRun
    );
    await context.gamePackRepository.save(captured.pendingGamePack);

    const retry = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([]),
    });

    expect(retry.outcome).toBe("accepted");
    await expect(
      context.gamePackRepository.load(captured.pendingGamePack.id)
    ).resolves.toBeNull();
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(
      retry.outcome === "accepted" ? retry.generationRun : undefined
    );
  });

  it("serializes reconciliation against a live cross-realm acceptance advance", async () => {
    const context = await createHandoffTestContext();
    const captured = await withGeneratedMechanicAcceptanceLock({
      operation: (acceptanceLockReceipt) =>
        completeAndCaptureAcceptanceTransaction(
          context,
          acceptanceLockReceipt
        ),
    });
    await context.gamePackRepository.delete(captured.accepted.gamePack.id);
    await context.generationRunRepository.update(
      context.generationRun.id,
      () => context.generationRun
    );
    await context.gamePackRepository.save(captured.pendingGamePack);

    let releaseJournalDelete!: () => void;
    const journalDeleteReleased = new Promise<void>((resolve) => {
      releaseJournalDelete = resolve;
    });
    let reportJournalDelete!: () => void;
    const journalDeleteStarted = new Promise<void>((resolve) => {
      reportJournalDelete = resolve;
    });
    let interceptedJournalDelete = false;
    const reconciliation = reconcileGeneratedMechanicAcceptanceTransactions({
      gamePackRepository: {
        async compareAndSwap(...input) {
          if (
            !interceptedJournalDelete &&
            input[0] === captured.pendingGamePack.id &&
            input[1] !== null &&
            input[2] === null
          ) {
            interceptedJournalDelete = true;
            reportJournalDelete();
            await journalDeleteReleased;
          }
          return context.gamePackRepository.compareAndSwap(...input);
        },
        list: context.gamePackRepository.list.bind(
          context.gamePackRepository
        ),
        load: context.gamePackRepository.load.bind(
          context.gamePackRepository
        ),
      },
      generationRunRepository: context.generationRunRepository,
    });
    await journalDeleteStarted;

    let reportLiveEntry!: () => void;
    const liveEntry = new Promise<void>((resolve) => {
      reportLiveEntry = resolve;
    });
    const liveAdvance = browserLockManager.request(
      "sparkline:generated-mechanic-acceptance:global",
      { mode: "exclusive" },
      async () => {
        reportLiveEntry();
        const currentJournal = await context.gamePackRepository.load(
          captured.pendingGamePack.id
        );
        if (!currentJournal) {
          expect(
            await context.gamePackRepository.compareAndSwap(
              captured.pendingGamePack.id,
              null,
              captured.pendingGamePack
            )
          ).toBe(true);
        }
        await context.generationRunRepository.update(
          context.generationRun.id,
          (current) => {
            expect(current).toEqual(context.generationRun);
            return captured.pendingGenerationRun;
          }
        );
      }
    );
    const liveEnteredBeforeDelete = await Promise.race([
      liveEntry.then(() => true),
      new Promise<false>((resolve) => {
        setTimeout(() => resolve(false), 20);
      }),
    ]);
    releaseJournalDelete();

    const [reconciliationResult] = await Promise.all([
      reconciliation,
      liveAdvance,
    ]);
    expect(liveEnteredBeforeDelete).toBe(false);
    expect(reconciliationResult.issues).toEqual([]);
    await expect(
      context.gamePackRepository.load(captured.pendingGamePack.id)
    ).resolves.toEqual(captured.pendingGamePack);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(captured.pendingGenerationRun);
  });

  it("holds startup discovery and restore selection against a newly staged live acceptance", async () => {
    const context = await createHandoffTestContext();
    const initialGamePacks = await context.gamePackRepository.list();
    let releaseInitialScan!: () => void;
    const initialScanReleased = new Promise<void>((resolve) => {
      releaseInitialScan = resolve;
    });
    let reportInitialScan!: () => void;
    const initialScanStarted = new Promise<void>((resolve) => {
      reportInitialScan = resolve;
    });
    let listCallCount = 0;
    const startupGamePackRepository = {
      ...context.gamePackRepository,
      async list() {
        listCallCount += 1;
        if (listCallCount === 1) {
          reportInitialScan();
          await initialScanReleased;
          return initialGamePacks;
        }
        return context.gamePackRepository.list();
      },
    };

    const { result } = renderHook(() =>
      useEditorGamePackPersistence({
        generationRunRepository: context.generationRunRepository,
        repository: startupGamePackRepository,
      })
    );
    await initialScanStarted;

    let releaseFinalGenerationRunLink!: () => void;
    const finalGenerationRunLinkReleased = new Promise<void>((resolve) => {
      releaseFinalGenerationRunLink = resolve;
    });
    let reportCanonicalFinalizedExternalPending!: () => void;
    const canonicalFinalizedExternalPending = new Promise<void>((resolve) => {
      reportCanonicalFinalizedExternalPending = resolve;
    });
    let generationRunUpdateCount = 0;
    const liveAcceptance = completeGeneratedMechanicProjectHandoff({
      ...context.input,
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        async update(generationRunId, updater) {
          generationRunUpdateCount += 1;
          if (generationRunUpdateCount === 2) {
            reportCanonicalFinalizedExternalPending();
            await finalGenerationRunLinkReleased;
          }
          return context.generationRunRepository.update(
            generationRunId,
            updater
          );
        },
      },
      runtime: createPassingRuntime([]),
    });
    const liveAdvancedBeforeInitialScanReleased = await Promise.race([
      canonicalFinalizedExternalPending.then(() => true),
      new Promise<false>((resolve) => {
        setTimeout(() => resolve(false), 20);
      }),
    ]);

    releaseInitialScan();
    await waitFor(() => {
      expect(result.current.loadStatus).toBe("loaded");
    });
    if (!liveAdvancedBeforeInitialScanReleased) {
      await canonicalFinalizedExternalPending;
    }

    expect(result.current.restoredGamePack).toBeNull();
    releaseFinalGenerationRunLink();
    await expect(liveAcceptance).resolves.toMatchObject({
      outcome: "accepted",
    });
  });

  it("keeps the recovery journal when startup cannot acquire a cross-realm lock", async () => {
    const context = await createHandoffTestContext();
    const captured = await completeAndCaptureAcceptanceTransaction(context);
    await context.gamePackRepository.delete(captured.accepted.gamePack.id);
    await context.generationRunRepository.update(
      context.generationRun.id,
      () => context.generationRun
    );
    await context.gamePackRepository.save(captured.pendingGamePack);
    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: undefined,
    });

    const reconciliation =
      await reconcileGeneratedMechanicAcceptanceTransactions({
        gamePackRepository: context.gamePackRepository,
        generationRunRepository: context.generationRunRepository,
      });

    expect(reconciliation.issues).toEqual([
      expect.objectContaining({ code: "acceptance_lock_unavailable" }),
    ]);
    await expect(
      context.gamePackRepository.load(captured.pendingGamePack.id)
    ).resolves.toEqual(captured.pendingGamePack);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(context.generationRun);
  });

  it("fails closed an interrupted handoff receipt that has no acceptance journal", async () => {
    const context = await createHandoffTestContext();
    const interruptedGenerationRun = writeGeneratedMechanicHandoffPendingReceipt(
      context.generationRun,
      {
        intentArtifactId: "intent_generated_counter",
        contractArtifactId: context.contract.id,
        sourceArtifactId: context.sourceArtifact.id,
        finalGameSpecArtifactId: context.finalGameSpec.id,
      }
    );
    await context.generationRunRepository.update(
      context.generationRun.id,
      () => interruptedGenerationRun
    );

    const reconciliation =
      await reconcileGeneratedMechanicAcceptanceTransactions({
        gamePackRepository: context.gamePackRepository,
        generationRunRepository: context.generationRunRepository,
      });

    expect(reconciliation.issues).toEqual([]);
    expect(reconciliation.restorableGamePack).toBeNull();
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toMatchObject({
      status: "failed",
      stage: "artifact-build",
      failureClass: "build-failure",
      metadata: {
        generatedMechanicOutcome: {
          status: "rejected",
          stage: "persistence",
          issues: [
            {
              path: "generationRun.metadata.generatedMechanicHandoff",
              code: "generated_mechanic_handoff_interrupted",
            },
          ],
        },
      },
    });
    const persisted = await context.generationRunRepository.fetch(
      context.generationRun.id
    );
    expect(persisted?.metadata).not.toHaveProperty(
      "generatedMechanicHandoff"
    );
  });

  it("terminalizes a pending handoff receipt after its staging-only journal is cleared", async () => {
    const context = await createHandoffTestContext();
    const interruptedGenerationRun = writeGeneratedMechanicHandoffPendingReceipt(
      context.generationRun,
      {
        intentArtifactId: "intent_generated_counter",
        contractArtifactId: context.contract.id,
        sourceArtifactId: context.sourceArtifact.id,
        finalGameSpecArtifactId: context.finalGameSpec.id,
      }
    );
    await context.generationRunRepository.update(
      context.generationRun.id,
      () => interruptedGenerationRun
    );
    const captured = await withGeneratedMechanicAcceptanceLock({
      operation: (acceptanceLockReceipt) =>
        completeAndCaptureAcceptanceTransaction(
          context,
          acceptanceLockReceipt
        ),
    });
    await context.gamePackRepository.delete(captured.accepted.gamePack.id);
    await context.generationRunRepository.update(
      context.generationRun.id,
      () => interruptedGenerationRun
    );
    await context.gamePackRepository.save(captured.pendingGamePack);

    const reconciliation =
      await reconcileGeneratedMechanicAcceptanceTransactions({
        gamePackRepository: context.gamePackRepository,
        generationRunRepository: context.generationRunRepository,
      });

    expect(reconciliation.issues).toEqual([]);
    expect(reconciliation.reconciledPendingGamePackIds).toContain(
      captured.pendingGamePack.id
    );
    await expect(
      context.gamePackRepository.load(captured.pendingGamePack.id)
    ).resolves.toBeNull();
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toMatchObject({
      status: "failed",
      metadata: {
        generatedMechanicOutcome: {
          stage: "persistence",
          issues: [
            expect.objectContaining({
              code: "generated_mechanic_handoff_interrupted",
            }),
          ],
        },
      },
    });
  });

  it("reconciles canonical-finalized external-pending lineage during normal editor refresh", async () => {
    const context = await createHandoffTestContext();
    const captured = await completeAndCaptureAcceptanceTransaction(context);

    await context.generationRunRepository.update(
      context.generationRun.id,
      () => captured.pendingGenerationRun
    );
    await context.gamePackRepository.save(captured.pendingGamePack);

    const { result } = renderHook(() =>
      useEditorGamePackPersistence({
        generationRunRepository: context.generationRunRepository,
        repository: context.gamePackRepository,
      })
    );
    await waitFor(() => {
      expect(result.current.loadStatus).toBe("loaded");
    });

    expect(result.current.restoredGamePack).toEqual(captured.accepted.gamePack);
    await expect(
      context.gamePackRepository.load(captured.pendingGamePack.id)
    ).resolves.toBeNull();
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(captured.accepted.generationRun);
  });

  it("fails editor refresh closed when finalized canonical lineage cannot reconcile externally", async () => {
    const context = await createHandoffTestContext();
    const captured = await completeAndCaptureAcceptanceTransaction(context);

    await context.generationRunRepository.update(
      context.generationRun.id,
      () => captured.pendingGenerationRun
    );
    await context.gamePackRepository.save(captured.pendingGamePack);

    const { result } = renderHook(() =>
      useEditorGamePackPersistence({
        generationRunRepository: {
          fetch: context.generationRunRepository.fetch.bind(
            context.generationRunRepository
          ),
          list: context.generationRunRepository.list.bind(
            context.generationRunRepository
          ),
          async update() {
            throw new Error("External GenerationRun storage is unavailable.");
          },
        },
        repository: context.gamePackRepository,
      })
    );
    await waitFor(() => {
      expect(result.current.loadStatus).toBe("error");
    });

    expect(result.current.restoredGamePack).toBeNull();
    expect(result.current.storageError).toMatchObject({
      name: "EditorGamePackAcceptanceRecoveryError",
      issues: [
        expect.objectContaining({
          code: "pending_acceptance_reconciliation_failed",
        }),
      ],
    });
    await expect(
      context.gamePackRepository.load(captured.accepted.gamePack.id)
    ).resolves.toEqual(captured.accepted.gamePack);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(captured.pendingGenerationRun);
  });

  it("does not report acceptance until the isolated recovery journal is durably removed", async () => {
    const context = await createHandoffTestContext();
    const pendingGamePackId =
      `pending_${context.gamePack.id}_${context.finalGameSpec.extension.versionId}`;
    const compareAndSwap = vi.fn(
      async (
        ...input: Parameters<
          typeof context.gamePackRepository.compareAndSwap
        >
      ) => {
        if (
          input[0] === pendingGamePackId &&
          input[1] !== null &&
          input[2] === null
        ) {
          return false;
        }
        return context.gamePackRepository.compareAndSwap(...input);
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [
          expect.objectContaining({
            code: "accepted_artifact_recovery_pending",
          }),
        ],
      },
    });
    await expect(
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toMatchObject({
      metadata: {
        generatedMechanicAcceptanceTransaction: { status: "finalized" },
      },
    });
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toMatchObject({
      metadata: {
        generatedMechanicAcceptanceTransaction: { status: "finalized" },
      },
    });
    await expect(
      context.gamePackRepository.load(pendingGamePackId)
    ).resolves.not.toBeNull();
  });

  it("keeps the recovery journal when the canonical Game Pack is overwritten before final cleanup", async () => {
    const context = await createHandoffTestContext();
    const previousGamePack = gamePackSchema.parse(
      JSON.parse(JSON.stringify(context.gamePack))
    );
    await context.gamePackRepository.save(previousGamePack);
    const pendingGamePackId =
      `pending_${context.gamePack.id}_${context.finalGameSpec.extension.versionId}`;
    let generationRunUpdateCount = 0;

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePack: previousGamePack,
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        async update(generationRunId, updater) {
          generationRunUpdateCount += 1;
          const updated = await context.generationRunRepository.update(
            generationRunId,
            updater
          );
          if (generationRunUpdateCount === 2) {
            await context.gamePackRepository.save(previousGamePack);
          }
          return updated;
        },
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [
          expect.objectContaining({
            code: "accepted_artifact_recovery_pending",
          }),
        ],
      },
    });
    await expect(
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toEqual(previousGamePack);
    await expect(
      context.gamePackRepository.load(pendingGamePackId)
    ).resolves.not.toBeNull();
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toMatchObject({
      metadata: {
        generatedMechanicAcceptanceTransaction: { status: "finalized" },
      },
    });
  });

  it("cleans an exact historical acceptance journal after a newer acceptance replaces the canonical marker", async () => {
    const context = await createHandoffTestContext();
    const captured = await completeAndCaptureAcceptanceTransaction(context);
    await context.gamePackRepository.save(captured.pendingGamePack);

    const versionTwo = await createVersionTwoHandoffInput(context);
    const secondAcceptance = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      ...versionTwo,
      gamePack: captured.accepted.gamePack,
      runtime: createPassingRuntime([]),
    });
    expect(secondAcceptance.outcome).toBe("accepted");
    if (secondAcceptance.outcome !== "accepted") {
      return;
    }

    const { result } = renderHook(() =>
      useEditorGamePackPersistence({
        generationRunRepository: context.generationRunRepository,
        repository: context.gamePackRepository,
      })
    );
    await waitFor(() => {
      expect(result.current.loadStatus).toBe("loaded");
    });

    expect(result.current.restoredGamePack).toEqual(secondAcceptance.gamePack);
    await expect(
      context.gamePackRepository.load(captured.pendingGamePack.id)
    ).resolves.toBeNull();
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(captured.accepted.generationRun);
  });

  it("rolls back a losing same-artifact transaction under a foreign canonical winner", async () => {
    const winningContext = await createHandoffTestContext();
    const losingContext = await createHandoffTestContext();
    const winner = await completeAndCaptureAcceptanceTransaction(
      winningContext
    );
    const loser = await completeAndCaptureAcceptanceTransaction(losingContext);

    await losingContext.generationRunRepository.update(
      losingContext.generationRun.id,
      () => loser.pendingGenerationRun
    );
    await winningContext.gamePackRepository.save(loser.pendingGamePack);

    const { result } = renderHook(() =>
      useEditorGamePackPersistence({
        generationRunRepository: losingContext.generationRunRepository,
        repository: winningContext.gamePackRepository,
      })
    );
    await waitFor(() => {
      expect(result.current.loadStatus).toBe("loaded");
    });

    expect(result.current.restoredGamePack).toEqual(winner.accepted.gamePack);
    await expect(
      winningContext.gamePackRepository.load(loser.pendingGamePack.id)
    ).resolves.toBeNull();
    await expect(
      losingContext.generationRunRepository.fetch(losingContext.generationRun.id)
    ).resolves.toEqual(losingContext.generationRun);
    await expect(
      winningContext.gamePackRepository.load(winner.accepted.gamePack.id)
    ).resolves.toEqual(winner.accepted.gamePack);
  });

  it("accepts an exact final GenerationRun when refresh reconciliation wins the final linkage race", async () => {
    const context = await createHandoffTestContext();
    let updateCount = 0;
    const update = vi.fn(
      async (
        generationRunId: string,
        updater: Parameters<typeof context.generationRunRepository.update>[1]
      ) => {
        updateCount += 1;
        if (updateCount === 2) {
          await context.generationRunRepository.update(
            generationRunId,
            updater
          );
        }
        return context.generationRunRepository.update(
          generationRunId,
          updater
        );
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        update,
      },
      runtime: createPassingRuntime([]),
    });

    expect(result.outcome).toBe("accepted");
    expect(updateCount).toBe(2);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toMatchObject({
      metadata: {
        generatedMechanicAcceptanceTransaction: { status: "finalized" },
      },
      relationships: {
        gamePackId: context.gamePack.id,
      },
    });
  });

  it("keeps a recovery journal when external lineage changes during final cleanup", async () => {
    const context = await createHandoffTestContext();
    const captured = await completeAndCaptureAcceptanceTransaction(context);
    await context.gamePackRepository.save(captured.pendingGamePack);
    let fetchCount = 0;

    const { result } = renderHook(() =>
      useEditorGamePackPersistence({
        generationRunRepository: {
          async fetch(generationRunId) {
            fetchCount += 1;
            if (fetchCount === 2) {
              await context.generationRunRepository.update(
                generationRunId,
                (current) => ({
                  ...current,
                  metadata: {
                    ...(current.metadata ?? {}),
                    concurrentCleanupMutation: true,
                  },
                })
              );
            }
            return context.generationRunRepository.fetch(generationRunId);
          },
          update: context.generationRunRepository.update.bind(
            context.generationRunRepository
          ),
        },
        repository: context.gamePackRepository,
      })
    );
    await waitFor(() => {
      expect(result.current.loadStatus).toBe("error");
    });

    expect(fetchCount).toBeGreaterThanOrEqual(2);
    await expect(
      context.gamePackRepository.load(captured.pendingGamePack.id)
    ).resolves.toEqual(captured.pendingGamePack);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toMatchObject({
      metadata: { concurrentCleanupMutation: true },
    });
  });

  it("rejects linkage when the external GenerationRun changed after preflight", async () => {
    const context = await createHandoffTestContext();
    const update = vi.fn(
      async (
        generationRunId: string,
        updater: Parameters<typeof context.generationRunRepository.update>[1]
      ) => {
        await context.generationRunRepository.update(
          generationRunId,
          (current) => ({
            ...current,
            metadata: {
              ...(current.metadata ?? {}),
              concurrentSucceededMutation: true,
            },
          })
        );
        return context.generationRunRepository.update(
          generationRunId,
          updater
        );
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        update,
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "stale_generation_run_snapshot" }),
        ]),
      },
    });
    await expect(
      context.gamePackRepository.load(
        `pending_${context.gamePack.id}_${context.finalGameSpec.extension.versionId}`
      )
    ).resolves.not.toBeNull();
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toMatchObject({
      metadata: { concurrentSucceededMutation: true },
    });
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.not.toHaveProperty("relationships");
  });

  it("rolls back the canonical Game Pack but retains the recovery journal when external rollback cannot be verified", async () => {
    const context = await createHandoffTestContext();
    let handoffUpdateCount = 0;
    const update = vi.fn(
      async (
        generationRunId: string,
        updater: Parameters<typeof context.generationRunRepository.update>[1]
      ) => {
        handoffUpdateCount += 1;
        if (handoffUpdateCount === 2) {
          await context.generationRunRepository.update(
            generationRunId,
            (current) => ({
              ...current,
              metadata: {
                ...(current.metadata ?? {}),
                concurrentSucceededMutation: true,
              },
            })
          );
        }
        return context.generationRunRepository.update(
          generationRunId,
          updater
        );
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        update,
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "stale_generation_run_snapshot" }),
        ]),
      },
    });
    expect(update).toHaveBeenCalledTimes(2);
    await expect(
      context.gamePackRepository.load(
        `pending_${context.gamePack.id}_${context.finalGameSpec.extension.versionId}`
      )
    ).resolves.not.toBeNull();
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toMatchObject({
      metadata: {
        concurrentSucceededMutation: true,
        generatedMechanicAcceptanceTransaction: { status: "pending" },
      },
    });
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.not.toHaveProperty("relationships");
  });

  it("keeps external lineage pending until the canonical Game Pack finalizes", async () => {
    const context = await createHandoffTestContext();
    let generationRunDuringFinalize:
      | Awaited<ReturnType<typeof context.generationRunRepository.fetch>>
      | undefined;
    const compareAndSwap = vi.fn(
      async (
        ...input: Parameters<
          typeof context.gamePackRepository.compareAndSwap
        >
      ) => {
        const transaction = input[2]?.metadata?.
          generatedMechanicAcceptanceTransaction;
        if (
          transaction &&
          typeof transaction === "object" &&
          !Array.isArray(transaction) &&
          transaction.status === "finalized"
        ) {
          generationRunDuringFinalize =
            await context.generationRunRepository.fetch(
              context.generationRun.id
            );
          throw new Error(
            "Simulated process crash before canonical finalization."
          );
        }
        return context.gamePackRepository.compareAndSwap(...input);
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: { stage: "persistence" },
    });
    expect(generationRunDuringFinalize).toMatchObject({
      metadata: {
        generatedMechanicAcceptanceTransaction: { status: "pending" },
      },
    });
    expect(generationRunDuringFinalize).not.toHaveProperty("relationships");
  });

  it("rejects a stale Game Pack snapshot instead of erasing a concurrently accepted version", async () => {
    const context = await createHandoffTestContext();
    const firstAcceptance = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([]),
    });
    expect(firstAcceptance.outcome).toBe("accepted");
    if (firstAcceptance.outcome !== "accepted") {
      return;
    }
    const durableAfterFirstAcceptance = await context.gamePackRepository.load(
      context.gamePack.id
    );

    const sourceArtifactV2: GeneratedMechanicSourceArtifact = {
      ...context.sourceArtifact,
      id: "source_generated_counter_v2",
    };
    const finalGameSpecV2 = {
      ...context.finalGameSpec,
      id: "final_game_spec_generated_counter_v2",
      extension: {
        ...context.finalGameSpec.extension,
        versionId: "extension_generated_counter_v2",
        sourceArtifactId: sourceArtifactV2.id,
      },
    };
    const generationRunV2 = generationRunSchema.parse({
      ...context.generationRun,
      id: "generation_run_generated_counter_v2",
      createdAt: "2026-08-11T12:00:11.000Z",
      startedAt: "2026-08-11T12:00:12.000Z",
      completedAt: "2026-08-11T12:00:20.000Z",
      artifactScopedRepair: createVersionedArtifactRepairReceipt({
        finalGameSpecArtifactId: finalGameSpecV2.id,
        generationRunId: "generation_run_generated_counter_v2",
        sourceArtifactId: sourceArtifactV2.id,
      }),
    });
    await context.generationRunRepository.create(generationRunV2);
    const runtimeEvents: string[] = [];

    const staleAcceptance = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      acceptedAt: "2026-08-11T12:00:30.000Z",
      deterministicEvaluation: await createIssuedPassedEvaluation({
        contract: context.contract,
        sourceArtifact: sourceArtifactV2,
      }),
      finalGameSpec: finalGameSpecV2,
      gamePack: context.gamePack,
      generationRunId: generationRunV2.id,
      runtime: createPassingRuntime(runtimeEvents),
      sourceArtifact: sourceArtifactV2,
    });

    expect(staleAcceptance).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [expect.objectContaining({ code: "stale_game_pack_snapshot" })],
      },
    });
    expect(runtimeEvents.at(-1)).toBe("dispose:source_generated_counter_v2");
    await expect(
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toEqual(durableAfterFirstAcceptance);
  });

  it("rolls back the pending GenerationRun when canonical CAS definitively loses", async () => {
    const context = await createHandoffTestContext();
    const concurrentCanonicalGamePack = parseGamePack({
      ...context.gamePack,
      title: "Concurrent canonical winner",
    });
    const compareAndSwap = vi.fn(
      async (
        ...input: Parameters<
          typeof context.gamePackRepository.compareAndSwap
        >
      ) => {
        const transaction = input[2]?.metadata?.
          generatedMechanicAcceptanceTransaction;
        if (
          transaction &&
          typeof transaction === "object" &&
          !Array.isArray(transaction) &&
          transaction.status === "finalized"
        ) {
          await context.gamePackRepository.save(concurrentCanonicalGamePack);
          return false;
        }
        return context.gamePackRepository.compareAndSwap(...input);
      }
    );

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: {
        compareAndSwap,
        load: context.gamePackRepository.load.bind(context.gamePackRepository),
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: { stage: "persistence" },
    });
    await expect(
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toEqual(concurrentCanonicalGamePack);
    await expect(
      context.gamePackRepository.load(
        `pending_${context.gamePack.id}_${context.finalGameSpec.extension.versionId}`
      )
    ).resolves.toBeNull();
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(context.generationRun);
  });

  it("rejects browser success when the project runtime cannot clean up", async () => {
    const context = await createHandoffTestContext();
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([], {
        cleanupError: new Error("Contained runtime cleanup failed."),
      }),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "runtime_activation",
        issues: [
          expect.objectContaining({
            code: "runtime_dependency_cleanup_failed",
            message: "Contained runtime cleanup failed.",
          }),
        ],
      },
    });
    expect(context.gamePackStorage.records.size).toBe(0);
  });

  it("rolls back durable Game Pack acceptance when the external GenerationRun linkage fails", async () => {
    const context = await createHandoffTestContext();
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        async update() {
          throw new Error("Injected GenerationRun update failure.");
        },
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [
          expect.objectContaining({
            code: "accepted_artifact_persistence_failed",
            message: "Injected GenerationRun update failure.",
          }),
        ],
      },
    });
    expect(context.gamePackStorage.records.size).toBe(0);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.not.toHaveProperty("relationships");
  });

  it("restores both stores when a GenerationRun update writes and then throws", async () => {
    const context = await createHandoffTestContext();
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        async update(generationRunId, updater) {
          await context.generationRunRepository.update(
            generationRunId,
            updater
          );
          throw new Error("GenerationRun driver threw after durable write.");
        },
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [
          expect.objectContaining({
            code: "accepted_artifact_persistence_failed",
            message: "GenerationRun driver threw after durable write.",
          }),
        ],
      },
    });
    expect(context.gamePackStorage.records.size).toBe(0);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(context.generationRun);
  });

  it("returns the exact durable acceptance when a concurrent canonical edit blocks compensation", async () => {
    const context = await createHandoffTestContext();
    let concurrentCanonicalGamePack: GamePack | undefined;
    let updateCount = 0;
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        async update(generationRunId, updater) {
          updateCount += 1;
          const updated = await context.generationRunRepository.update(
            generationRunId,
            updater
          );
          if (updateCount !== 2) {
            return updated;
          }
          const canonical = await context.gamePackRepository.load(
            context.gamePack.id
          );
          if (!canonical) {
            throw new Error("Expected the finalized canonical Game Pack.");
          }
          concurrentCanonicalGamePack = parseGamePack({
            ...canonical,
            title: "Concurrent canonical edit",
          });
          await context.gamePackRepository.save(concurrentCanonicalGamePack);
          throw new Error(
            "GenerationRun driver threw after final lineage linkage."
          );
        },
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "accepted",
      gamePack: { title: "Concurrent canonical edit" },
      generationRun: {
        metadata: {
          generatedMechanicAcceptanceTransaction: { status: "finalized" },
        },
      },
    });
    expect(updateCount).toBe(2);
    await expect(
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toEqual(concurrentCanonicalGamePack);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toMatchObject({
      metadata: {
        generatedMechanicAcceptanceTransaction: { status: "finalized" },
      },
      relationships: {
        gamePackId: context.gamePack.id,
        acceptedGeneratedMechanicArtifactIds: [
          context.finalGameSpec.extension.versionId,
        ],
      },
    });
  });

  it("compensates a canonical CAS that writes before both the driver and confirmation load throw", async () => {
    const context = await createHandoffTestContext();
    let canonicalWriteThrew = false;
    const compareAndSwap = vi.fn(
      async (
        ...input: Parameters<
          typeof context.gamePackRepository.compareAndSwap
        >
      ) => {
        const committed = await context.gamePackRepository.compareAndSwap(
          ...input
        );
        const transaction = input[2]?.metadata?.
          generatedMechanicAcceptanceTransaction;
        if (
          transaction &&
          typeof transaction === "object" &&
          !Array.isArray(transaction) &&
          transaction.status === "finalized"
        ) {
          canonicalWriteThrew = true;
          throw new Error("Canonical CAS driver threw after durable write.");
        }
        return committed;
      }
    );
    const load = vi.fn(async (gamePackId: string) => {
      if (canonicalWriteThrew && gamePackId === context.gamePack.id) {
        canonicalWriteThrew = false;
        throw new Error("Canonical confirmation load also failed.");
      }
      return context.gamePackRepository.load(gamePackId);
    });

    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      gamePackRepository: { compareAndSwap, load },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: { stage: "persistence" },
    });
    expect(context.gamePackStorage.records.size).toBe(0);
    await expect(
      context.generationRunRepository.fetch(context.generationRun.id)
    ).resolves.toEqual(context.generationRun);
  });

  it("does not overwrite a concurrent Game Pack write during compensation", async () => {
    const context = await createHandoffTestContext();
    let concurrentGamePack: GamePack | undefined;
    const pendingGamePackId =
      `pending_${context.gamePack.id}_${context.finalGameSpec.extension.versionId}`;
    const result = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      generationRunRepository: {
        fetch: context.generationRunRepository.fetch.bind(
          context.generationRunRepository
        ),
        async update(generationRunId, updater) {
          await context.generationRunRepository.update(
            generationRunId,
            updater
          );
          const accepted = await context.gamePackRepository.load(
            pendingGamePackId
          );
          if (!accepted) {
            throw new Error("Expected the accepted Game Pack before compensation.");
          }
          concurrentGamePack = parseGamePack({
            ...accepted,
            title: "Concurrent editor write",
          });
          await context.gamePackRepository.save(concurrentGamePack);
          throw new Error("GenerationRun linkage failed after concurrent write.");
        },
      },
      runtime: createPassingRuntime([]),
    });

    expect(result).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "persistence",
        issues: [
          expect.objectContaining({
            code: "accepted_artifact_persistence_failed",
          }),
          expect.objectContaining({
            code: "accepted_artifact_rollback_failed",
          }),
        ],
      },
    });
    await expect(
      context.gamePackRepository.load(pendingGamePackId)
    ).resolves.toEqual(concurrentGamePack);
    await expect(
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toBeNull();
  });

  it("restores the exact checkpoint artifact and repeats load-before-install browser proof", async () => {
    const context = await createHandoffTestContext();
    const firstRuntime = createPassingRuntime([]);
    const accepted = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: firstRuntime,
    });
    expect(accepted.outcome).toBe("accepted");

    const restoreEvents: string[] = [];
    let restoredProject: PreparedGeneratedMechanicRuntimeProject | undefined;
    const restored = await restoreGeneratedMechanicProjectHandoff({
      gamePackId: context.gamePack.id,
      gamePackRepository: context.gamePackRepository,
      runtime: createPassingRuntime(restoreEvents, {
        onLoadProject(project) {
          restoredProject = project;
        },
      }),
      trustedPortContracts: [],
    });

    expect(restored).toMatchObject({
      outcome: "restored",
      artifact: {
        id: "extension_generated_counter_v1",
        extensionId: "extension_generated_counter",
        versionId: "extension_generated_counter_v1",
        sourceArtifact: { id: context.sourceArtifact.id },
      },
      activation: {
        sourceArtifactId: context.sourceArtifact.id,
        capabilityVersion: context.sourceArtifact.capabilityVersion,
      },
      firstPlayableAttempt: { status: "passed" },
    });
    expect(restoreEvents).toEqual([
      `load:${context.sourceArtifact.id}`,
      `install:${context.sourceArtifact.id}`,
      `browser:${context.sourceArtifact.id}`,
      `dispose:${context.sourceArtifact.id}`,
    ]);
    expect(restoredProject).toHaveProperty("artifact");
    expect(restoredProject).not.toHaveProperty("runtimeCandidate");
  });

  it("refuses to restore a crash-window Game Pack while acceptance is pending", async () => {
    const context = await createHandoffTestContext();
    const accepted = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([]),
    });
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") {
      return;
    }
    const pendingGamePack = parseGamePack({
      ...accepted.gamePack,
      metadata: {
        ...(accepted.gamePack.metadata ?? {}),
        generatedMechanicAcceptanceTransaction: {
          schemaVersion: "generated_mechanic_acceptance_transaction/v1",
          status: "pending",
          generationRunId: context.generationRun.id,
          artifactId: accepted.artifact.id,
          buildId: accepted.artifact.buildId,
          checkpointId: accepted.artifact.checkpointId,
        },
      },
    });
    await context.gamePackRepository.save(pendingGamePack);
    const events: string[] = [];

    const restored = await restoreGeneratedMechanicProjectHandoff({
      gamePackId: context.gamePack.id,
      gamePackRepository: context.gamePackRepository,
      runtime: createPassingRuntime(events),
      trustedPortContracts: [],
    });

    expect(restored).toMatchObject({
      outcome: "rejected",
      evidence: {
        stage: "preflight",
        issues: [
          expect.objectContaining({
            code: "acceptance_transaction_pending",
          }),
        ],
      },
    });
    expect(events).toEqual([]);
  });

  it("fails restore and editor recovery closed for a staging journal whose transaction marker is missing", async () => {
    const context = await createHandoffTestContext();
    const captured = await completeAndCaptureAcceptanceTransaction(context);
    const {
      generatedMechanicAcceptanceTransaction: ignoredTransaction,
      ...journalMetadata
    } = captured.pendingGamePack.metadata ?? {};
    void ignoredTransaction;
    const malformedJournal = parseGamePack({
      ...captured.pendingGamePack,
      metadata: journalMetadata,
    });
    await context.gamePackRepository.save(malformedJournal);

    expect(
      prepareRestoredGeneratedMechanicProject({
        gamePack: malformedJournal,
        trustedPortContracts: [],
      })
    ).toMatchObject({
      success: false,
      issues: [
        expect.objectContaining({ code: "invalid_acceptance_transaction" }),
      ],
    });

    const { result } = renderHook(() =>
      useEditorGamePackPersistence({
        generationRunRepository: context.generationRunRepository,
        repository: context.gamePackRepository,
      })
    );
    await waitFor(() => {
      expect(result.current.loadStatus).toBe("error");
    });

    expect(result.current.restoredGamePack).toBeNull();
    expect(result.current.storageError).toMatchObject({
      name: "EditorGamePackAcceptanceRecoveryError",
      issues: [
        expect.objectContaining({
          code: "pending_acceptance_reconciliation_failed",
        }),
      ],
    });
    await expect(
      context.gamePackRepository.load(malformedJournal.id)
    ).resolves.toEqual(malformedJournal);
  });

  it("fails restore and editor recovery closed when a staging journal claims to be finalized", async () => {
    const context = await createHandoffTestContext();
    const captured = await completeAndCaptureAcceptanceTransaction(context);
    const transaction = captured.pendingGamePack.metadata?.
      generatedMechanicAcceptanceTransaction;
    if (
      !transaction ||
      typeof transaction !== "object" ||
      Array.isArray(transaction)
    ) {
      throw new Error("Expected a captured pending acceptance transaction.");
    }
    const malformedJournal = parseGamePack({
      ...captured.pendingGamePack,
      metadata: {
        ...(captured.pendingGamePack.metadata ?? {}),
        generatedMechanicAcceptanceTransaction: {
          ...transaction,
          status: "finalized",
        },
      },
    });
    await context.gamePackRepository.save(malformedJournal);

    expect(
      prepareRestoredGeneratedMechanicProject({
        gamePack: malformedJournal,
        trustedPortContracts: [],
      })
    ).toMatchObject({
      success: false,
      issues: [
        expect.objectContaining({ code: "invalid_acceptance_transaction" }),
      ],
    });

    const { result } = renderHook(() =>
      useEditorGamePackPersistence({
        generationRunRepository: context.generationRunRepository,
        repository: context.gamePackRepository,
      })
    );
    await waitFor(() => {
      expect(result.current.loadStatus).toBe("error");
    });

    expect(result.current.restoredGamePack).toBeNull();
    expect(result.current.storageError).toMatchObject({
      name: "EditorGamePackAcceptanceRecoveryError",
      issues: [
        expect.objectContaining({
          code: "pending_acceptance_reconciliation_failed",
        }),
      ],
    });
    await expect(
      context.gamePackRepository.load(malformedJournal.id)
    ).resolves.toEqual(malformedJournal);
  });

  it("prepares the exact current-checkpoint artifact and dependency for restore", async () => {
    const context = await createHandoffTestContext();
    const accepted = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([]),
    });
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") {
      return;
    }

    const prepared = prepareRestoredGeneratedMechanicProject({
      gamePack: accepted.gamePack,
      trustedPortContracts: [],
    });

    expect(prepared).toEqual({
      success: true,
      data: {
        artifact: accepted.artifact,
        dependency: {
          contract: accepted.artifact.contract,
          finalGameSpec: context.finalGameSpec,
          referenceCatalog: accepted.artifact.referenceCatalog,
          runtimePolicy: accepted.artifact.runtimePolicy,
          sourceArtifact: accepted.artifact.sourceArtifact,
          trustedPortContracts: [],
        },
      },
    });
  });

  it("rejects a current-checkpoint artifact whose build and evidence lineage is not exact", async () => {
    const context = await createHandoffTestContext();
    const accepted = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([]),
    });
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") {
      return;
    }
    const brokenLineageGamePack = {
      ...accepted.gamePack,
      builds: accepted.gamePack.builds.map((build) =>
        build.id === accepted.artifact.buildId
          ? { ...build, generatedMechanicArtifactIds: [] }
          : build
      ),
      checkpoints: accepted.gamePack.checkpoints.map((checkpoint) =>
        checkpoint.id === accepted.gamePack.currentCheckpointId
          ? { ...checkpoint, validationEvidenceIds: [] }
          : checkpoint
      ),
      validationEvidence: accepted.gamePack.validationEvidence.map(
        (evidence) =>
          accepted.artifact.validationEvidenceIds.includes(evidence.id)
            ? { ...evidence, generatedMechanicArtifactIds: [] }
            : evidence
      ),
    };

    expect(
      prepareRestoredGeneratedMechanicProject({
        gamePack: brokenLineageGamePack,
        trustedPortContracts: [],
      })
    ).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: "accepted_artifact_lineage_mismatch",
        }),
      ],
    });
  });

  it("rejects a current Game Spec that diverges from the persisted accepted Final Game Spec snapshot", async () => {
    const context = await createHandoffTestContext();
    const accepted = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([]),
    });
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") {
      return;
    }
    const divergentGamePack = {
      ...accepted.gamePack,
      gameSpec: {
        ...accepted.gamePack.gameSpec,
        title: "Mutated after generated mechanic acceptance",
      },
    };

    expect(gamePackSchema.safeParse(divergentGamePack).success).toBe(false);
    expect(
      prepareRestoredGeneratedMechanicProject({
        gamePack: divergentGamePack,
        trustedPortContracts: [],
      })
    ).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: "persisted_final_game_spec_mismatch",
        }),
      ],
    });
  });

  it.each([
    {
      artifactIds: [],
      caseName: "zero",
      expectedIssue: {
        path: "gamePack.currentCheckpointId",
        code: "checkpoint_artifact_mismatch",
        message:
          "Generated mechanic restore requires exactly one accepted artifact on the current Version Checkpoint.",
      },
    },
    {
      artifactIds: [
        "extension_generated_counter_v1",
        "extension_foreign_v1",
      ],
      caseName: "multiple",
      expectedIssue: {
        path: "gamePack.currentCheckpointId",
        code: "checkpoint_artifact_mismatch",
        message:
          "Generated mechanic restore requires exactly one accepted artifact on the current Version Checkpoint.",
      },
    },
    {
      artifactIds: ["extension_foreign_v1"],
      caseName: "foreign",
      expectedIssue: {
        path: "gamePack.acceptedGeneratedMechanicArtifacts",
        code: "accepted_artifact_not_found",
        message:
          "Current Version Checkpoint must reference the exact accepted generated mechanic artifact.",
      },
    },
  ])(
    "rejects $caseName current-checkpoint artifacts during pure restore preparation",
    async ({ artifactIds, expectedIssue }) => {
      const context = await createHandoffTestContext();
      const accepted = await completeGeneratedMechanicProjectHandoff({
        ...context.input,
        runtime: createPassingRuntime([]),
      });
      expect(accepted.outcome).toBe("accepted");
      if (accepted.outcome !== "accepted") {
        return;
      }

      const prepared = prepareRestoredGeneratedMechanicProject({
        gamePack: {
          ...accepted.gamePack,
          checkpoints: accepted.gamePack.checkpoints.map((checkpoint) =>
            checkpoint.id === accepted.gamePack.currentCheckpointId
              ? { ...checkpoint, generatedMechanicArtifactIds: artifactIds }
              : checkpoint
          ),
        },
        trustedPortContracts: [],
      });

      expect(prepared).toEqual({
        success: false,
        issues: [expectedIssue],
      });
    }
  );

  it("carries the exact artifact onto an append-only restored checkpoint", async () => {
    const context = await createHandoffTestContext();
    const accepted = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([]),
    });
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") {
      return;
    }

    const restoredForward = restoreGamePackCheckpoint({
      gamePack: accepted.gamePack,
      restoredAt: "2026-08-11T12:05:00.000Z",
      sourceCheckpointId: accepted.artifact.checkpointId,
    });

    expect(
      restoredForward.checkpoints.find(
        ({ id }) => id === restoredForward.currentCheckpointId
      )?.generatedMechanicArtifactIds
    ).toEqual([accepted.artifact.id]);
  });

  it("rejects foreign or missing accepted-artifact lineage IDs", async () => {
    const context = await createHandoffTestContext();
    const accepted = await completeGeneratedMechanicProjectHandoff({
      ...context.input,
      runtime: createPassingRuntime([]),
    });
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") {
      return;
    }

    const foreignBuild = gamePackSchema.safeParse({
      ...accepted.gamePack,
      acceptedGeneratedMechanicArtifacts:
        accepted.gamePack.acceptedGeneratedMechanicArtifacts?.map((artifact) => ({
          ...artifact,
          buildId: "build_foreign",
        })),
    });
    const foreignEvidence = gamePackSchema.safeParse({
      ...accepted.gamePack,
      validationEvidence: accepted.gamePack.validationEvidence.map(
        (evidence, index) =>
          index === 0
            ? {
                ...evidence,
                generatedMechanicArtifactIds: ["extension_foreign"],
              }
            : evidence
      ),
    });
    const missingCheckpointLink = gamePackSchema.safeParse({
      ...accepted.gamePack,
      checkpoints: accepted.gamePack.checkpoints.map((checkpoint) => ({
        ...checkpoint,
        generatedMechanicArtifactIds: undefined,
      })),
    });
    const duplicateArtifact = gamePackSchema.safeParse({
      ...accepted.gamePack,
      acceptedGeneratedMechanicArtifacts: [
        ...(accepted.gamePack.acceptedGeneratedMechanicArtifacts ?? []),
        ...(accepted.gamePack.acceptedGeneratedMechanicArtifacts ?? []),
      ],
    });
    const duplicateBuildLink = gamePackSchema.safeParse({
      ...accepted.gamePack,
      builds: accepted.gamePack.builds.map((build) => ({
        ...build,
        generatedMechanicArtifactIds: [
          "extension_generated_counter_v1",
          "extension_generated_counter_v1",
        ],
      })),
    });
    const missingSourceGenerationRun = gamePackSchema.safeParse({
      ...accepted.gamePack,
      generationRuns: [],
    });
    const failedAcceptedBuild = gamePackSchema.safeParse({
      ...accepted.gamePack,
      builds: accepted.gamePack.builds.map((build) => ({
        ...build,
        status: "failed",
      })),
    });
    const failedAcceptedEvidence = gamePackSchema.safeParse({
      ...accepted.gamePack,
      validationEvidence: accepted.gamePack.validationEvidence.map(
        (evidence) =>
          evidence.checkId === "generated_mechanic_activation"
            ? { ...evidence, status: "failed" }
            : evidence
      ),
    });
    const divergentSavedMechanic = gamePackSchema.safeParse({
      ...accepted.gamePack,
      gameSpec: {
        ...accepted.gamePack.gameSpec,
        mechanics: accepted.gamePack.gameSpec.mechanics.map((mechanic) =>
          mechanic.id === "mechanic_generated_counter"
            ? { ...mechanic, config: { initial_count: 4 } }
            : mechanic
        ),
      },
    });
    const tamperedCapabilityGrant = gamePackSchema.safeParse({
      ...accepted.gamePack,
      acceptedGeneratedMechanicArtifacts:
        accepted.gamePack.acceptedGeneratedMechanicArtifacts?.map((artifact) => ({
          ...artifact,
          sourceArtifact: {
            ...artifact.sourceArtifact,
            grant: {
              ...artifact.sourceArtifact.grant,
              capabilities: artifact.sourceArtifact.grant.capabilities.map(
                (capability, index) =>
                  index === 0
                    ? { ...capability, runtimeOperation: "state_write" }
                    : capability
              ),
            },
          },
        })),
    });
    const tamperedRuntimePolicy = gamePackSchema.safeParse({
      ...accepted.gamePack,
      acceptedGeneratedMechanicArtifacts:
        accepted.gamePack.acceptedGeneratedMechanicArtifacts?.map(
          (artifact) => ({
            ...artifact,
            runtimePolicy: {
              ...artifact.runtimePolicy,
              seed: artifact.runtimePolicy.seed + 1,
            },
          })
        ),
    });
    const tamperedActivationRuntimePolicy = gamePackSchema.safeParse({
      ...accepted.gamePack,
      validationEvidence: accepted.gamePack.validationEvidence.map(
        (evidence) =>
          evidence.checkId === "generated_mechanic_activation"
            ? {
                ...evidence,
                evidence: {
                  ...evidence.evidence,
                  runtimePolicy: {
                    ...accepted.artifact.runtimePolicy,
                    seed: accepted.artifact.runtimePolicy.seed + 1,
                  },
                },
              }
            : evidence
      ),
    });
    const brokenRepairLineage = gamePackSchema.safeParse({
      ...accepted.gamePack,
      generationRuns: accepted.gamePack.generationRuns.map((run) => ({
        ...run,
        artifactScopedRepair: run.artifactScopedRepair
          ? {
              ...run.artifactScopedRepair,
              artifacts: run.artifactScopedRepair.artifacts.map((artifact) =>
                artifact.stage === "finalGameSpec" &&
                artifact.status === "accepted"
                  ? {
                      ...artifact,
                      dependsOnArtifactIds: [accepted.artifact.contract.id],
                    }
                  : artifact
              ),
            }
          : undefined,
      })),
    });
    const unrelatedBuildId = "build_unrelated_history";
    const unrelatedRunLineage = gamePackSchema.safeParse({
      ...accepted.gamePack,
      builds: [
        ...accepted.gamePack.builds,
        {
          ...accepted.gamePack.builds[0],
          id: unrelatedBuildId,
          checkpointId: undefined,
          validationEvidenceIds: [],
          generatedMechanicArtifactIds: undefined,
          status: "built",
        },
      ],
      generationRuns: accepted.gamePack.generationRuns.map((run) => ({
        ...run,
        relationships: run.relationships
          ? {
              ...run.relationships,
              buildIds: [...(run.relationships.buildIds ?? []), unrelatedBuildId],
            }
          : undefined,
      })),
    });

    expect(foreignBuild.success).toBe(false);
    expect(foreignEvidence.success).toBe(false);
    expect(missingCheckpointLink.success).toBe(false);
    expect(duplicateArtifact.success).toBe(false);
    expect(duplicateBuildLink.success).toBe(false);
    expect(missingSourceGenerationRun.success).toBe(false);
    expect(failedAcceptedBuild.success).toBe(false);
    expect(failedAcceptedEvidence.success).toBe(false);
    expect(divergentSavedMechanic.success).toBe(false);
    expect(tamperedCapabilityGrant.success).toBe(false);
    expect(tamperedRuntimePolicy.success).toBe(false);
    expect(tamperedActivationRuntimePolicy.success).toBe(false);
    expect(brokenRepairLineage.success).toBe(false);
    expect(unrelatedRunLineage.success).toBe(false);
  });

  it("keeps built-in-only Game Packs backward-compatible through save and reload", async () => {
    const repository = createGamePackRepository(new MemoryGamePackStorage());
    const builtInOnly = createInitialGamePack({
      createdAt: "2026-08-11T12:00:00.000Z",
      gameSpec: crystalSpecChaseGameSpecFixtureInput,
      id: "game_pack_built_in_only",
      runtimeKind: "phaser",
    });

    const saved = await repository.save(builtInOnly);
    const restored = await repository.load(builtInOnly.id);

    expect(restored).toEqual(saved);
    expect(restored).not.toHaveProperty("acceptedGeneratedMechanicArtifacts");
    expect(gamePackSchema.safeParse(restored).success).toBe(true);
  });
});

function createFinalGameSpecInput() {
  return {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_generated_counter",
    mechanics: [
      ...crystalSpecChaseGameSpecFixtureInput.mechanics,
      {
        id: "mechanic_generated_counter",
        type: "generated_counter",
        entityIds: ["entity_player"],
        sceneIds: ["scene_arena"],
        config: { initial_count: 3 },
      },
    ],
    mechanicConnections: {
      schemaVersion: "mechanic_port_connections/v1" as const,
      connections: [],
    },
  };
}

function createContract(): GeneratedMechanicContract {
  return {
    schemaVersion: "generated-mechanic-contract/v1",
    id: "contract_generated_counter",
    intentId: "intent_generated_counter",
    capabilityVersion: "mechanic_capability/v1",
    intentLineage: {
      actors: ["player"],
      targets: [],
      behaviors: ["increment_counter"],
      stateChanges: ["counter_changed"],
      temporalRules: [],
      spatialRules: [],
      constraints: [],
      connections: [{ direction: "input", port: "move" }],
      references: [{ kind: "entity", id: "entity_player" }],
    },
    behavior: {
      summary: "Increment private state for a bound actor.",
      triggers: ["install"],
      outcomes: ["state_changed"],
    },
    config: {
      kind: "object",
      fields: [
        {
          key: "initial_count",
          required: true,
          value: { kind: "integer", minimum: 0, maximum: 20 },
        },
      ],
    },
    bindings: [
      {
        id: "actor",
        referenceKind: "entity",
        cardinality: "one",
        objectIds: ["entity_player"],
      },
    ],
    ownedObjects: [],
    privateState: [
      { id: "counter", valueType: "integer", initialValue: 3 },
    ],
    lifecycle: {
      callbacks: ["install", "logical_action"],
      fixedStep: false,
      dispose: true,
    },
    ports: [],
    capabilities: ["state_read", "state_write", "object_motion_write"],
    resourceExpectations: {
      maximumOwnedObjects: 0,
      maximumOperationsPerTick: 8,
      maximumScheduledCallbacks: 0,
      maximumSubscriptions: 0,
      maximumSignalsPerTick: 0,
      maximumStateBytes: 64,
      maximumCallbackMilliseconds: 8,
      maximumConsecutiveFailures: 1,
    },
    scenarios: [
      {
        id: "scenario_generated_counter",
        seed: 1729,
        setup: [
          { kind: "binding_present", bindingId: "actor" },
          { kind: "state_equals", stateId: "counter", value: 3 },
        ],
        steps: [{ kind: "dispatch_action", actionId: "move" }],
        observations: [
          { kind: "state_equals", stateId: "counter", value: 4 },
        ],
      },
    ],
  };
}

function createSourceArtifact(): GeneratedMechanicSourceArtifact {
  const grant = createMechanicCapabilityGrant({
    contract: createContract(),
    constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
  });
  if (!grant.success) {
    throw new Error("Expected the generated-counter capability grant to pass.");
  }

  return {
    schemaVersion: "generated_mechanic_source_artifact/v1",
    id: "source_generated_counter_v1",
    contractId: "contract_generated_counter",
    intentId: "intent_generated_counter",
    capabilityVersion: "mechanic_capability/v1",
    grant: grant.data,
    usedCapabilities: ["state_read", "state_write", "object_motion_write"],
    callbacks: [
      {
        id: "install_generated_counter",
        kind: "install",
        sourceTypeScript: "return null;",
        normalizedJavaScript:
          "const __sparklineGeneratedMechanicCallback = async () => null;",
      },
      {
        id: "action_generated_counter",
        kind: "logical_action",
        sourceTypeScript: [
          'const current = await capabilities.state.read("counter");',
          'await capabilities.state.write("counter", current + 1);',
        ].join("\n"),
        normalizedJavaScript: [
          "const __sparklineGeneratedMechanicCallback = async () => {",
          'const current = await capabilities.state.read("counter");',
          'await capabilities.state.write("counter", current + 1);',
          'await capabilities.object.motion.write(bindings.actor, { velocity: { x: 4, y: 0 } });',
          "};",
        ].join("\n"),
      },
      {
        id: "dispose_generated_counter",
        kind: "dispose",
        sourceTypeScript: "return null;",
        normalizedJavaScript:
          "const __sparklineGeneratedMechanicCallback = async () => null;",
      },
    ],
    build: {
      language: "typescript",
      target: "es2020",
      parsed: true,
      typechecked: true,
      compiled: true,
      staticValidationTarget: "normalized_javascript",
      staticValidationVersion:
        "generated_mechanic_source_static_validation/v1",
    },
  };
}

async function createIssuedPassedEvaluation({
  contract,
  sourceArtifact,
}: {
  contract: GeneratedMechanicContract;
  sourceArtifact: GeneratedMechanicSourceArtifact;
}) {
  return evaluateGeneratedMechanicArtifact({
    fixtureId: "fixture_generated_counter",
    contract,
    artifact: sourceArtifact,
    config: { initial_count: 3 },
    externalObservations: [
      {
        id: "external_counter_observation",
        scenarioId: "scenario_generated_counter",
        observation: {
          kind: "referenced_entity_motion_changed",
          bindingIds: ["actor"],
          actionId: "move",
        },
      },
    ],
    createRuntime: async ({ artifact }) => {
      let count = 3;
      let velocity = { x: 0, y: 0 };
      return {
        sourceArtifactId: artifact.id,
        hasBinding: (bindingId) => bindingId === "actor",
        readDeclaredState: () => count,
        readBindingProperty: (_bindingId, property) =>
          property === "position" ? { x: 0, y: 0 } : velocity,
        countOwnedObjects: () => 0,
        readEmittedOutputs: () => [],
        install: async () => undefined,
        receiveInput: async () => undefined,
        dispatchAction: async () => {
          count += 1;
          velocity = { x: 4, y: 0 };
        },
        advanceTime: async () => undefined,
        dispose: async () => undefined,
      };
    },
  });
}

function createArtifactRepairReceipt({
  generationRunId,
  repairStatus,
}: {
  generationRunId: string;
  repairStatus: "not_needed" | "repaired";
}) {
  const contractArtifactId = "contract_generated_counter";
  const sourceArtifactId = "source_generated_counter_v1";
  const finalGameSpecArtifactId = "final_game_spec_generated_counter_v1";
  const contractAttempt = {
    id: "repair_contract_initial",
    stage: "contract" as const,
    attemptNumber: 1,
    kind: "initial" as const,
    status: "accepted" as const,
    durationMs: 1,
    inputArtifactIds: [],
    artifactId: contractArtifactId,
  };
  const acceptedSourceAttempt = {
    id:
      repairStatus === "repaired"
        ? "repair_source_repair"
        : "repair_source_initial",
    stage: "source" as const,
    attemptNumber: repairStatus === "repaired" ? 2 : 1,
    kind: repairStatus === "repaired" ? ("repair" as const) : ("initial" as const),
    status: "accepted" as const,
    durationMs: 1,
    inputArtifactIds: [contractArtifactId],
    artifactId: sourceArtifactId,
    ...(repairStatus === "repaired"
      ? {
          repair: {
            trigger: "stage_failure" as const,
            failureAttemptId: "repair_source_initial",
            issues: [
              {
                path: "callbacks.install",
                code: "type_failure",
                message: "The initial source did not compile.",
              },
            ],
            invalidatedArtifactIds: [],
          },
        }
      : {}),
  };
  const finalGameSpecAttempt = {
    id: "repair_final_spec_initial",
    stage: "finalGameSpec" as const,
    attemptNumber: 1,
    kind: "initial" as const,
    status: "accepted" as const,
    durationMs: 1,
    inputArtifactIds: [contractArtifactId, sourceArtifactId],
    artifactId: finalGameSpecArtifactId,
  };
  const rejectedSourceAttempt = {
    id: "repair_source_initial",
    stage: "source" as const,
    attemptNumber: 1,
    kind: "initial" as const,
    status: "rejected" as const,
    durationMs: 1,
    inputArtifactIds: [contractArtifactId],
    artifactId: "source_generated_counter_rejected_v1",
    issues: [
      {
        path: "callbacks.install",
        code: "type_failure",
        message: "The initial source did not compile.",
      },
    ],
    responsibleStage: "source" as const,
  };

  return {
    schemaVersion: "artifact_scoped_mechanic_repair/v1" as const,
    generationRunId,
    status: "succeeded" as const,
    repairStatus,
    durationMs: 4,
    maximumAttempts: { contract: 4, source: 4, finalGameSpec: 4 },
    attemptCounts: {
      contract: 1,
      source: repairStatus === "repaired" ? 2 : 1,
      finalGameSpec: 1,
    },
    attempts: [
      contractAttempt,
      ...(repairStatus === "repaired" ? [rejectedSourceAttempt] : []),
      acceptedSourceAttempt,
      finalGameSpecAttempt,
    ],
    artifacts: [
      {
        artifactId: contractArtifactId,
        stage: "contract" as const,
        attemptId: contractAttempt.id,
        status: "accepted" as const,
        dependsOnArtifactIds: [],
      },
      ...(repairStatus === "repaired"
        ? [
            {
              artifactId: rejectedSourceAttempt.artifactId,
              stage: "source" as const,
              attemptId: rejectedSourceAttempt.id,
              status: "rejected" as const,
              dependsOnArtifactIds: [contractArtifactId],
            },
          ]
        : []),
      {
        artifactId: sourceArtifactId,
        stage: "source" as const,
        attemptId: acceptedSourceAttempt.id,
        status: "accepted" as const,
        dependsOnArtifactIds: [contractArtifactId],
      },
      {
        artifactId: finalGameSpecArtifactId,
        stage: "finalGameSpec" as const,
        attemptId: finalGameSpecAttempt.id,
        status: "accepted" as const,
        dependsOnArtifactIds: [sourceArtifactId],
      },
    ],
  };
}

function createVersionedArtifactRepairReceipt({
  finalGameSpecArtifactId,
  generationRunId,
  sourceArtifactId,
}: {
  finalGameSpecArtifactId: string;
  generationRunId: string;
  sourceArtifactId: string;
}) {
  const receipt = createArtifactRepairReceipt({
    generationRunId,
    repairStatus: "not_needed",
  });
  const replaceArtifactId = (artifactId: string) => {
    if (artifactId === "source_generated_counter_v1") {
      return sourceArtifactId;
    }
    if (artifactId === "final_game_spec_generated_counter_v1") {
      return finalGameSpecArtifactId;
    }
    return artifactId;
  };

  return {
    ...receipt,
    attempts: receipt.attempts.map((attempt) => ({
      ...attempt,
      inputArtifactIds: attempt.inputArtifactIds.map(replaceArtifactId),
      ...(attempt.artifactId
        ? { artifactId: replaceArtifactId(attempt.artifactId) }
        : {}),
    })),
    artifacts: receipt.artifacts.map((artifact) => ({
      ...artifact,
      artifactId: replaceArtifactId(artifact.artifactId),
      dependsOnArtifactIds:
        artifact.dependsOnArtifactIds.map(replaceArtifactId),
    })),
  };
}

function createPassedFirstPlayableAttempt(
  gamePack: Parameters<typeof startFirstPlayableValidation>[0]["gamePack"]
): FirstPlayableValidationAttempt {
  let attempt = startFirstPlayableValidation({
    gamePack,
    runtimeCandidate: {
      runtimeKind: "phaser",
      runtimeScriptPath: "/runtime/phaser/top-down-template.js",
      templateId: "template_top_down",
    },
    startedAt: "2026-08-11T12:00:01.000Z",
  });
  attempt = recordFirstPlayableRuntimeStatus({
    attempt,
    observedAt: "2026-08-11T12:00:02.000Z",
    status: { state: "ready" },
  });
  for (const checkId of [
    "nonblank_render",
    "player_visible",
    "input_response",
  ] as const) {
    attempt = recordFirstPlayableRuntimeEvidence({
      attempt,
      observedAt: "2026-08-11T12:00:03.000Z",
      evidence: { checkId, status: "passed" },
    });
  }
  return attempt;
}

function createFailedFirstPlayableAttempt(
  gamePack: Parameters<typeof startFirstPlayableValidation>[0]["gamePack"]
): FirstPlayableValidationAttempt {
  const attempt = startFirstPlayableValidation({
    gamePack,
    runtimeCandidate: {
      runtimeKind: "phaser",
      runtimeScriptPath: "/runtime/phaser/top-down-template.js",
      templateId: "template_top_down",
    },
    startedAt: "2026-08-11T12:00:01.000Z",
  });
  return recordFirstPlayableRuntimeStatus({
    attempt,
    observedAt: "2026-08-11T12:00:02.000Z",
    status: { state: "error", message: "Generated mechanic boot failed." },
  });
}

async function createHandoffTestContext() {
  const contract = createContract();
  const sourceArtifact = createSourceArtifact();
  const gameSpec = createFinalGameSpecInput();
  const gamePack = createInitialGamePack({
    createdAt: "2026-08-11T12:00:00.000Z",
    gameSpec,
    id: "game_pack_generated_counter",
    runtimeKind: "phaser",
  });
  const gamePackStorage = new MemoryGamePackStorage();
  const gamePackRepository = createGamePackRepository(gamePackStorage);
  const generationRunStorage = new MemoryGenerationRunStorage();
  const generationRunRepository = createGenerationRunRepository(
    generationRunStorage
  );
  const generationRun = generationRunSchema.parse({
    id: "generation_run_generated_counter",
    operationType: "generate",
    status: "succeeded",
    repairStatus: "not-needed",
    createdAt: "2026-08-11T11:59:50.000Z",
    startedAt: "2026-08-11T11:59:51.000Z",
    completedAt: "2026-08-11T12:00:00.000Z",
    durationMs: 9000,
    request: { summary: "Generate a generic counter mechanic." },
    runtimeKind: "phaser",
    templateId: "template_top_down",
    mechanicIds: ["mechanic_generated_counter"],
    attempts: [
      {
        id: "generation_attempt_counter_initial",
        attemptNumber: 1,
        kind: "initial",
        status: "succeeded",
        provider: "test_provider",
        model: "test_model",
        taskRoute: "generated_mechanic_pipeline",
        requestSummary: "Generate a generic counter mechanic.",
        startedAt: "2026-08-11T11:59:51.000Z",
        completedAt: "2026-08-11T12:00:00.000Z",
        durationMs: 9000,
        validation: { stage: "artifact-build", status: "passed" },
        candidate: {
          kind: "validated_spec",
          gameSpecId: gameSpec.id,
          summary: "Compiled generated mechanic accepted.",
        },
      },
    ],
    artifactScopedRepair: createArtifactRepairReceipt({
      generationRunId: "generation_run_generated_counter",
      repairStatus: "not_needed",
    }),
  });
  await generationRunRepository.create(generationRun);
  const finalGameSpec = {
    schemaVersion: "generated_mechanic_final_game_spec/v1" as const,
    id: "final_game_spec_generated_counter_v1",
    gameSpec,
    extension: {
      id: "extension_generated_counter",
      versionId: "extension_generated_counter_v1",
      mechanicId: "mechanic_generated_counter",
      mechanicType: "generated_counter",
      contractId: contract.id,
      sourceArtifactId: sourceArtifact.id,
      capabilityVersion: contract.capabilityVersion,
      config: { initial_count: 3 },
      bindings: [
        {
          id: "actor",
          referenceKind: "entity",
          cardinality: "one" as const,
          objectIds: ["entity_player"],
        },
      ],
    },
  };
  const deterministicEvaluation = await createIssuedPassedEvaluation({
    contract,
    sourceArtifact,
  });
  const input = {
    acceptedAt: "2026-08-11T12:00:10.000Z",
    contract,
    deterministicEvaluation,
    finalGameSpec,
    gamePack,
    gamePackRepository,
    generationRunId: generationRun.id,
    generationRunRepository,
    referenceCatalog: {
      action: gameSpec.controls.map(({ action }) => action),
      asset: gameSpec.assets.map(({ id }) => id),
      entity: gameSpec.entities.map(({ id }) => id),
      objective: gameSpec.objectives.map(({ id }) => id),
      region: ["region_safe_start"],
      scene: ["scene_arena"],
    },
    runtime: createPassingRuntime([]),
    sourceArtifact,
    trustedPortContracts: [],
  } satisfies Parameters<typeof completeGeneratedMechanicProjectHandoff>[0];

  return {
    contract,
    deterministicEvaluation,
    finalGameSpec,
    gamePack,
    gamePackRepository,
    gamePackStorage,
    generationRun,
    generationRunRepository,
    generationRunStorage,
    input,
    sourceArtifact,
  };
}

async function createVersionTwoHandoffInput(
  context: Awaited<ReturnType<typeof createHandoffTestContext>>
) {
  const sourceArtifact: GeneratedMechanicSourceArtifact = {
    ...context.sourceArtifact,
    id: "source_generated_counter_v2",
  };
  const finalGameSpec = {
    ...context.finalGameSpec,
    id: "final_game_spec_generated_counter_v2",
    extension: {
      ...context.finalGameSpec.extension,
      versionId: "extension_generated_counter_v2",
      sourceArtifactId: sourceArtifact.id,
    },
  };
  const generationRun = generationRunSchema.parse({
    ...context.generationRun,
    id: "generation_run_generated_counter_v2",
    createdAt: "2026-08-11T12:00:11.000Z",
    startedAt: "2026-08-11T12:00:12.000Z",
    completedAt: "2026-08-11T12:00:20.000Z",
    artifactScopedRepair: createVersionedArtifactRepairReceipt({
      finalGameSpecArtifactId: finalGameSpec.id,
      generationRunId: "generation_run_generated_counter_v2",
      sourceArtifactId: sourceArtifact.id,
    }),
  });
  await context.generationRunRepository.create(generationRun);

  return {
    acceptedAt: "2026-08-11T12:00:30.000Z",
    deterministicEvaluation: await createIssuedPassedEvaluation({
      contract: context.contract,
      sourceArtifact,
    }),
    finalGameSpec,
    generationRunId: generationRun.id,
    sourceArtifact,
  };
}

async function completeAndCaptureAcceptanceTransaction(
  context: Awaited<ReturnType<typeof createHandoffTestContext>>,
  acceptanceLockReceipt?: Parameters<
    typeof completeGeneratedMechanicProjectHandoff
  >[0]["acceptanceLockReceipt"]
) {
  let pendingGamePack:
    | NonNullable<
        Awaited<ReturnType<typeof context.gamePackRepository.load>>
      >
    | undefined;
  let pendingGenerationRun:
    | NonNullable<
        Awaited<ReturnType<typeof context.generationRunRepository.fetch>>
      >
    | undefined;
  const compareAndSwap = vi.fn(
    async (
      ...input: Parameters<typeof context.gamePackRepository.compareAndSwap>
    ) => {
      const transaction = input[2]?.metadata?.
        generatedMechanicAcceptanceTransaction;
      if (
        input[2] &&
        transaction &&
        typeof transaction === "object" &&
        !Array.isArray(transaction) &&
        transaction.status === "pending"
      ) {
        pendingGamePack = input[2];
      }
      return context.gamePackRepository.compareAndSwap(...input);
    }
  );
  const update = vi.fn(
    async (
      ...input: Parameters<typeof context.generationRunRepository.update>
    ) => {
      const updated = await context.generationRunRepository.update(...input);
      const transaction = updated.metadata?.
        generatedMechanicAcceptanceTransaction;
      if (
        transaction &&
        typeof transaction === "object" &&
        !Array.isArray(transaction) &&
        transaction.status === "pending"
      ) {
        pendingGenerationRun = updated;
      }
      return updated;
    }
  );
  const accepted = await completeGeneratedMechanicProjectHandoff({
    ...context.input,
    ...(acceptanceLockReceipt ? { acceptanceLockReceipt } : {}),
    gamePackRepository: {
      compareAndSwap,
      load: context.gamePackRepository.load.bind(context.gamePackRepository),
    },
    generationRunRepository: {
      fetch: context.generationRunRepository.fetch.bind(
        context.generationRunRepository
      ),
      update,
    },
    runtime: createPassingRuntime([]),
  });
  if (
    accepted.outcome !== "accepted" ||
    !pendingGamePack ||
    !pendingGenerationRun
  ) {
    throw new Error("Expected to capture a complete acceptance transaction.");
  }
  return { accepted, pendingGamePack, pendingGenerationRun };
}

function createPassingRuntime(
  events: string[],
  options: Readonly<{
    browserError?: Error;
    cleanupError?: Error;
    firstPlayableAttempt?: FirstPlayableValidationAttempt;
    installError?: Error;
    loadError?: Error;
    onBrowserCheck?: () => void;
    onInstall?: () => void;
    onLoadProject?: (project: PreparedGeneratedMechanicRuntimeProject) => void;
  }> = {}
): Parameters<typeof completeGeneratedMechanicProjectHandoff>[0]["runtime"] {
  return createGeneratedMechanicProjectRuntime({
    async loadProjectDependency(project) {
      const { dependency } = project;
      options.onLoadProject?.(project);
      events.push(`load:${dependency.sourceArtifact.id}`);
      if (options.loadError) {
        throw options.loadError;
      }
      return { sourceArtifactId: dependency.sourceArtifact.id };
    },
    async installTrustedTemplate({ loadedResource }) {
      events.push(`install:${loadedResource.sourceArtifactId}`);
      options.onInstall?.();
      if (options.installError) {
        throw options.installError;
      }
      return loadedResource;
    },
    async runFirstPlayableBrowserChecks({ activeResource, gamePack }) {
      events.push(`browser:${activeResource.sourceArtifactId}`);
      options.onBrowserCheck?.();
      if (options.browserError) {
        throw options.browserError;
      }
      return (
        options.firstPlayableAttempt ?? createPassedFirstPlayableAttempt(gamePack)
      );
    },
    async disposeProjectDependency({ activeResource, loadedResource }) {
      events.push(
        `dispose:${
          activeResource?.sourceArtifactId ??
          loadedResource?.sourceArtifactId ??
          "none"
        }`
      );
      if (options.cleanupError) {
        throw options.cleanupError;
      }
    },
  });
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

class MemoryGenerationRunStorage implements GenerationRunStorageDriver {
  readonly records = new Map<string, StoredGenerationRunRecord>();

  async put(record: StoredGenerationRunRecord) {
    this.records.set(record.id, structuredClone(record));
  }

  async get(id: string) {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  async getAll() {
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  async delete(id: string) {
    this.records.delete(id);
  }

  async clear() {
    this.records.clear();
  }
}
