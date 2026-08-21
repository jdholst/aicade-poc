import { describe, expect, it } from "vitest";

import {
  topDownGameSpecSchema,
  type GeneratedMechanicContract,
  type MechanicIntent,
} from "@/game-spec";

import {
  createGeneratedMechanicAssemblyPlan,
  createGeneratedMechanicCandidateGamePack,
  createGeneratedMechanicReferenceCatalog,
  materializeGeneratedMechanicConfig,
  validateGeneratedMechanicTopDownHostAdmission,
} from "./generated-mechanic-project-planning";

describe("generated mechanic project planning", () => {
  it("derives a frozen exact reference catalog with no prototype authority", () => {
    const baseGameSpec = createBaseGameSpec();

    const catalog = createGeneratedMechanicReferenceCatalog(baseGameSpec);

    expect(catalog).toEqual({
      action: baseGameSpec.controls.map(({ action }) => action),
      asset: baseGameSpec.assets.map(({ id }) => id),
      entity: baseGameSpec.entities.map(({ id }) => id),
      objective: baseGameSpec.objectives.map(({ id }) => id),
      region: baseGameSpec.template.config.scenes.flatMap(({ layout }) =>
        layout.regions.map(({ id }) => id)
      ),
      scene: baseGameSpec.template.config.scenes.map(({ id }) => id),
    });
    expect(Object.getPrototypeOf(catalog)).toBeNull();
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.entity)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(catalog, "constructor")).toBe(
      false
    );
  });

  it("rejects unsupported top-down contracts before source work", () => {
    const baseGameSpec = createBaseGameSpec();
    const catalog = createGeneratedMechanicReferenceCatalog(baseGameSpec);
    const contract = createContract();
    const intent = createIntent();

    expect(
      validateGeneratedMechanicTopDownHostAdmission({
        contract,
        catalog,
        intent,
      })
    ).toEqual({ success: true, data: contract });
    const stateOnlyContract = {
      ...contract,
      capabilities: ["state_write"],
      privateState: [
        { id: "action_count", valueType: "integer" as const, initialValue: 0 },
      ],
    };
    expect(
      validateGeneratedMechanicTopDownHostAdmission({
        contract: stateOnlyContract,
        catalog,
        intent,
      })
    ).toMatchObject({
      success: false,
      evidence: {
        issues: [
          expect.objectContaining({
            code: "missing_independent_effect_capability",
          }),
        ],
      },
    });

    const unsupported = validateGeneratedMechanicTopDownHostAdmission({
      contract: {
        ...contract,
        bindings: [],
        ports: [
          {
            id: "score_out",
            direction: "output",
            payload: { kind: "integer", minimum: 0, maximum: 10 },
          },
        ],
        ownedObjects: [
          { id: "marker", objectKind: "marker", maximumInstances: 1 },
        ],
        lifecycle: {
          ...contract.lifecycle,
          callbacks: ["install", "gameplay_event"],
        },
        capabilities: ["state_write", "object_create", "signal_emit"],
      },
      catalog,
      intent,
    });

    expect(unsupported).toMatchObject({
      success: false,
      evidence: { responsibleStage: "contract" },
    });
    if (unsupported.success) {
      return;
    }
    expect(unsupported.evidence.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "missing_observable_entity_binding",
        "missing_independent_effect_capability",
        "unsupported_runtime_ports",
        "unsupported_runtime_gameplay_events",
        "unsupported_runtime_capability",
      ])
    );
  });

  it("admits declared owned objects and their generic object capabilities", () => {
    const catalog = createGeneratedMechanicReferenceCatalog(createBaseGameSpec());
    const intent: MechanicIntent = {
      ...createIntent(),
      ownedObjects: ["generic_marker"],
      requiredCapabilities: [
        "object_motion_write",
        "object_create",
        "spatial_query",
        "object_destroy",
      ],
    };
    const contract: GeneratedMechanicContract = {
      ...createContract(),
      ownedObjects: [
        { id: "generic_marker", objectKind: "effect", maximumInstances: 2 },
      ],
      capabilities: [
        "object_motion_write",
        "object_create",
        "spatial_query",
        "object_destroy",
      ],
      resourceExpectations: {
        ...createContract().resourceExpectations,
        maximumOwnedObjects: 2,
      },
      scenarios: createContract().scenarios.map((scenario) => ({
        ...scenario,
        observations: [
          ...scenario.observations,
          {
            kind: "owned_object_count" as const,
            archetypeId: "generic_marker",
            operator: "equals" as const,
            value: 0,
          },
        ],
      })),
    };

    expect(
      validateGeneratedMechanicTopDownHostAdmission({
        contract,
        catalog,
        intent,
      })
    ).toEqual({ success: true, data: contract });
  });

  it("requires logical actions to be backed by exact active controls", () => {
    const contract = createContract();
    const catalog = createGeneratedMechanicReferenceCatalog(createBaseGameSpec());
    const intent = createIntent();

    expect(
      validateGeneratedMechanicTopDownHostAdmission({
        contract,
        catalog: { ...catalog, action: ["foreign_action"] },
        intent,
      })
    ).toMatchObject({
      success: false,
      evidence: {
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "unsupported_runtime_binding" }),
        ]),
      },
    });
  });

  it.each([
    { caseName: "missing", connections: [] },
    {
      caseName: "foreign",
      connections: [{ direction: "input" as const, port: "dash" }],
    },
    {
      caseName: "duplicate",
      connections: [
        { direction: "input" as const, port: "move" },
        { direction: "input" as const, port: "move" },
      ],
    },
    {
      caseName: "supporting output",
      connections: [
        { direction: "input" as const, port: "move" },
        { direction: "output" as const, port: "mechanic_signal" },
      ],
    },
  ])(
    "rejects a $caseName routed action connection",
    ({ connections }) => {
      const contract = createContract();
      const catalog = createGeneratedMechanicReferenceCatalog(
        createBaseGameSpec()
      );

      expect(
        validateGeneratedMechanicTopDownHostAdmission({
          contract,
          catalog,
          intent: { ...createIntent(), connections },
        })
      ).toMatchObject({
        success: false,
        evidence: {
          issues: expect.arrayContaining([
            expect.objectContaining({
              code: "missing_exact_routed_action_connection",
            }),
          ]),
        },
      });
    }
  );

  it.each([
    {
      caseName: "different active action",
      steps: [{ kind: "dispatch_action" as const, actionId: "dash" }],
    },
    {
      caseName: "duplicate routed action",
      steps: [
        { kind: "dispatch_action" as const, actionId: "move" },
        { kind: "dispatch_action" as const, actionId: "move" },
      ],
    },
  ])(
    "rejects scenario dispatch of a $caseName",
    ({ steps }) => {
      const contract = createContract();
      const catalog = {
        ...createGeneratedMechanicReferenceCatalog(createBaseGameSpec()),
        action: ["move", "dash"],
      };

      expect(
        validateGeneratedMechanicTopDownHostAdmission({
          contract: {
            ...contract,
            scenarios: contract.scenarios.map((scenario) => ({
              ...scenario,
              steps,
            })),
          },
          catalog,
          intent: createIntent(),
        })
      ).toMatchObject({
        success: false,
        evidence: {
          issues: expect.arrayContaining([
            expect.objectContaining({
              code: "routed_action_scenario_mismatch",
            }),
          ]),
        },
      });
    }
  );

  it("rejects supporting entity bindings outside the exact routed intent set", () => {
    const baseGameSpec = topDownGameSpecSchema.parse({
      ...createBaseGameSpec(),
      entities: [
        ...createBaseGameSpec().entities,
        { id: "entity_support", role: "hazard", name: "Support" },
      ],
    });
    const catalog = createGeneratedMechanicReferenceCatalog(baseGameSpec);
    const intent = createIntent();
    const contract = createContract();

    const result = validateGeneratedMechanicTopDownHostAdmission({
      contract: {
        ...contract,
        bindings: [
          ...contract.bindings,
          {
            id: "supporting_actor",
            referenceKind: "entity",
            cardinality: "one",
            objectIds: ["entity_support"],
          },
        ],
      },
      catalog,
      intent,
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        responsibleStage: "contract",
        issues: [
          expect.objectContaining({
            code: "non_exact_routed_entity_binding_set",
          }),
        ],
      },
    });
  });

  it("rejects descriptive intent retention without an executable routed trigger", () => {
    const contract = createContract();
    const catalog = createGeneratedMechanicReferenceCatalog(createBaseGameSpec());
    const intent = createIntent();

    const result = validateGeneratedMechanicTopDownHostAdmission({
      contract: {
        ...contract,
        behavior: {
          ...contract.behavior,
          triggers: intent.triggers,
          outcomes: intent.outcomes,
        },
        lifecycle: {
          ...contract.lifecycle,
          callbacks: ["install"],
        },
        scenarios: contract.scenarios.map((scenario) => ({
          ...scenario,
          steps: [],
        })),
      },
      catalog,
      intent,
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "unsupported_runtime_trigger" }),
        ]),
      },
    });
  });

  it("materializes deterministic JSON from defaults, bounds, and exact catalog IDs", () => {
    const catalog = createGeneratedMechanicReferenceCatalog(createBaseGameSpec());
    const config = materializeGeneratedMechanicConfig({
      config: {
        kind: "object",
        fields: [
          {
            key: "enabled",
            required: true,
            value: { kind: "boolean", default: true },
          },
          {
            key: "strength",
            required: true,
            value: { kind: "number", minimum: 0.5, maximum: 4 },
          },
          {
            key: "retries",
            required: true,
            value: { kind: "integer", minimum: 2, maximum: 8 },
          },
          {
            key: "label",
            required: true,
            value: { kind: "string", minimumLength: 3, maximumLength: 12 },
          },
          {
            key: "mode",
            required: true,
            value: { kind: "enum", values: ["slow", "fast"] },
          },
          {
            key: "actor",
            required: true,
            value: { kind: "stable_id", referenceKind: "entity" },
          },
          {
            key: "samples",
            required: true,
            value: {
              kind: "collection",
              minimumItems: 2,
              maximumItems: 3,
              item: { kind: "integer", minimum: 1, maximum: 9 },
            },
          },
          {
            key: "optional_note",
            required: false,
            value: { kind: "string", minimumLength: 0, maximumLength: 8 },
          },
        ],
      },
      catalog,
    });

    expect(config).toEqual({
      success: true,
      data: {
        enabled: true,
        strength: 0.5,
        retries: 2,
        label: "___",
        mode: "slow",
        actor: catalog.entity?.[0],
        samples: [1, 1],
      },
    });
    if (config.success) {
      expect(Object.isFrozen(config.data)).toBe(true);
    }
  });

  it("creates a generic exact assembly plan from run identity, intent references, and contract bindings", () => {
    const baseGameSpec = createBaseGameSpec();
    const catalog = createGeneratedMechanicReferenceCatalog(baseGameSpec);
    const intent = createIntent();
    const contract = createContract();

    const result = createGeneratedMechanicAssemblyPlan({
      attemptNumber: 2,
      catalog,
      contract,
      generationRunId: "generation_run_generic_v1",
      intent,
    });

    expect(result).toEqual({
      success: true,
      data: {
        finalGameSpecId:
          "final_game_spec_generation_run_generic_v1_attempt_2",
        extensionId: "extension_generation_run_generic_v1",
        extensionVersionId:
          "extension_generation_run_generic_v1_attempt_2",
        mechanicId: "mechanic_generation_run_generic_v1",
        mechanicType: "generated_mechanic",
        config: { decay_per_action: 1 },
        bindings: contract.bindings,
        activeReferences: {
          entityIds: ["entity_player"],
          objectiveIds: ["objective_collect_crystals"],
          sceneIds: ["scene_arena"],
          regionIds: ["region_safe_start"],
          assetIds: ["asset_player"],
        },
        mechanicConnections: {
          schemaVersion: "mechanic_port_connections/v1",
          connections: [],
        },
      },
    });
  });

  it("creates an unaccepted candidate Game Pack with exact running GenerationRun metadata", () => {
    const baseGameSpec = createBaseGameSpec();
    const finalGameSpec = {
      ...baseGameSpec,
      id: "game_generated_candidate",
    };

    const result = createGeneratedMechanicCandidateGamePack({
      createdAt: "2026-08-13T14:00:00.000Z",
      finalGameSpec,
      gamePackId: "game_pack_generated_candidate",
      generationRunId: "generation_run_generic_v1",
      mechanicId: "mechanic_generation_run_generic_v1",
      requestSummary: "Generate one generic custom mechanic.",
    });

    expect(result).toMatchObject({
      id: "game_pack_generated_candidate",
      gameSpec: { id: "game_generated_candidate" },
      builds: [],
      checkpoints: [],
      generationRuns: [
        {
          id: "generation_run_generic_v1",
          status: "running",
          createdAt: "2026-08-13T14:00:00.000Z",
          startedAt: "2026-08-13T14:00:00.000Z",
          request: {
            summary: "Generate one generic custom mechanic.",
            targetGameSpecId: "game_generated_candidate",
          },
          runtimeKind: "phaser",
          templateId: "template_top_down",
          mechanicIds: ["mechanic_generation_run_generic_v1"],
          attempts: [],
        },
      ],
    });
    expect(result).not.toHaveProperty("acceptedGeneratedMechanicArtifacts");
    expect(Object.isFrozen(result)).toBe(true);
  });
});

function createBaseGameSpec() {
  return topDownGameSpecSchema.parse({
    schemaVersion: "game-spec/v1",
    id: "game_base",
    title: "Generated mechanic planning base",
    currentIntentSummary: "Provide one clean built-in top-down base.",
    template: {
      id: "template_top_down",
      version: "1.0.0",
      config: {
        scenes: [
          {
            id: "scene_arena",
            name: "Arena",
            objectiveIds: ["objective_collect_crystals"],
            arena: { id: "arena_main", width: 640, height: 360 },
            layout: {
              walls: [],
              obstacles: [],
              spawnZones: [
                {
                  id: "spawn_player",
                  x: 24,
                  y: 24,
                  width: 64,
                  height: 64,
                  entityIds: ["entity_player"],
                },
              ],
              pickupZones: [],
              regions: [
                {
                  id: "region_safe_start",
                  label: "Safe start",
                  x: 16,
                  y: 16,
                  width: 96,
                  height: 96,
                },
              ],
            },
          },
        ],
      },
    },
    controls: [
      {
        id: "control_move",
        action: "move",
        label: "Move",
        kind: "axis",
        keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"],
      },
    ],
    entities: [{ id: "entity_player", role: "player", name: "Player" }],
    assets: [
      {
        id: "asset_player",
        role: "player",
        name: "Player",
        source: "template",
      },
    ],
    objectives: [
      {
        id: "objective_collect_crystals",
        label: "Collect crystals",
        description: "Collect the crystals.",
        primary: true,
      },
    ],
    validationGoals: [],
    mechanics: [],
  });
}

function createIntent(): MechanicIntent {
  return {
    id: "intent_generic",
    summary: "Modify a bound player deterministically after an action.",
    triggers: ["logical_action"],
    actors: ["player"],
    targets: [],
    behaviors: ["generic_mutation"],
    ownedObjects: [],
    stateChanges: ["actor_changed"],
    temporalRules: [],
    spatialRules: [],
    constraints: [],
    configuration: [{ key: "decay_per_action", value: 1 }],
    connections: [{ direction: "input", port: "move" }],
    references: [
      { kind: "entity", id: "entity_player" },
      { kind: "objective", id: "objective_collect_crystals" },
      { kind: "scene", id: "scene_arena" },
      { kind: "region", id: "region_safe_start" },
      { kind: "asset", id: "asset_player" },
    ],
    outcomes: ["actor_changed"],
    requiredCapabilities: ["object_motion_write"],
    ambiguities: [],
  };
}

function createContract(): GeneratedMechanicContract {
  return {
    schemaVersion: "generated-mechanic-contract/v1",
    id: "contract_generic",
    intentId: "intent_generic",
    capabilityVersion: "mechanic_capability/v1",
    behavior: {
      summary: "Modify a bound player after each logical action.",
      triggers: ["logical_action"],
      outcomes: ["actor_changed"],
    },
    config: {
      kind: "object",
      fields: [
        {
          key: "decay_per_action",
          required: true,
          value: { kind: "integer", minimum: 1, maximum: 10 },
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
      maximumCallbackMilliseconds: 8,
      maximumConsecutiveFailures: 1,
    },
    scenarios: [
      {
        id: "scenario_generic",
        seed: 1,
        setup: [{ kind: "binding_present", bindingId: "actor" }],
        steps: [{ kind: "dispatch_action", actionId: "move" }],
        observations: [
          {
            kind: "binding_property",
            bindingId: "actor",
            property: "active",
            operator: "equals",
            value: true,
          },
        ],
      },
    ],
  };
}
