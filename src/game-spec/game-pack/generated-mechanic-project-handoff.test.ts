import { describe, expect, it, vi } from "vitest";

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
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  restoreGamePackCheckpoint,
  type FirstPlayableValidationAttempt,
  type GamePackStorageDriver,
  type GenerationRunStorageDriver,
  type StoredGamePackRecord,
  type StoredGenerationRunRecord,
} from "@/game-spec";
import { crystalSpecChaseGameSpecFixtureInput } from "@/runtime/phaser/fixtures/crystal-spec-chase";
import { createGeneratedMechanicProjectRuntime } from "@/runtime/mechanics/generated-mechanic-project-runtime";
import { evaluateGeneratedMechanicArtifact } from "@/service/mechanic-evaluation/mechanic-evaluation";
import type { GeneratedMechanicSourceArtifact } from "@/service/mechanic-source-generation";

import {
  completeGeneratedMechanicProjectHandoff,
  restoreGeneratedMechanicProjectHandoff,
  validateGeneratedMechanicFinalGameSpec,
} from "./generated-mechanic-project-handoff";

describe("generated mechanic project handoff", () => {
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

    expect(result.outcome).toBe("accepted");
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
      name: "mechanic-owned objects",
      code: "unsupported_runtime_owned_objects",
      mutate: (contract: GeneratedMechanicContract) => ({
        ...contract,
        ownedObjects: [
          { id: "runtime_marker", objectKind: "effect", maximumInstances: 1 },
        ],
      }),
    },
    {
      name: "object creation",
      code: "unsupported_runtime_capability",
      mutate: (contract: GeneratedMechanicContract) => ({
        ...contract,
        capabilities: [...contract.capabilities, "object_create" as const],
      }),
    },
    {
      name: "spatial queries",
      code: "unsupported_runtime_capability",
      mutate: (contract: GeneratedMechanicContract) => ({
        ...contract,
        capabilities: [...contract.capabilities, "spatial_query" as const],
      }),
    },
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

  it("does not overwrite a concurrent Game Pack write during compensation", async () => {
    const context = await createHandoffTestContext();
    let concurrentGamePack: GamePack | undefined;
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
            context.gamePack.id
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
      context.gamePackRepository.load(context.gamePack.id)
    ).resolves.toEqual(concurrentGamePack);
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
    const restored = await restoreGeneratedMechanicProjectHandoff({
      gamePackId: context.gamePack.id,
      gamePackRepository: context.gamePackRepository,
      runtime: createPassingRuntime(restoreEvents),
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
    capabilities: ["state_read", "state_write"],
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
    usedCapabilities: ["state_read", "state_write"],
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
          kind: "binding_property",
          bindingId: "actor",
          property: "counter",
          operator: "equals",
          value: 4,
        },
      },
    ],
    createRuntime: async ({ artifact }) => {
      let count = 3;
      return {
        sourceArtifactId: artifact.id,
        hasBinding: (bindingId) => bindingId === "actor",
        readDeclaredState: () => count,
        readBindingProperty: () => count,
        countOwnedObjects: () => 0,
        readEmittedOutputs: () => [],
        install: async () => undefined,
        receiveInput: async () => undefined,
        dispatchAction: async () => {
          count += 1;
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

function createPassingRuntime(
  events: string[],
  options: Readonly<{
    cleanupError?: Error;
    firstPlayableAttempt?: FirstPlayableValidationAttempt;
    installError?: Error;
  }> = {}
): Parameters<typeof completeGeneratedMechanicProjectHandoff>[0]["runtime"] {
  return createGeneratedMechanicProjectRuntime({
    async loadProjectDependency(dependency) {
      events.push(`load:${dependency.sourceArtifact.id}`);
      return { sourceArtifactId: dependency.sourceArtifact.id };
    },
    async installTrustedTemplate({ loadedResource }) {
      events.push(`install:${loadedResource.sourceArtifactId}`);
      if (options.installError) {
        throw options.installError;
      }
      return loadedResource;
    },
    async runFirstPlayableBrowserChecks({ activeResource, gamePack }) {
      events.push(`browser:${activeResource.sourceArtifactId}`);
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
