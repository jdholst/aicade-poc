import { describe, expect, it } from "vitest";

import {
  PHASE_9_GENERATION_CONSTRAINT_SET,
  createMechanicCapabilityGrant,
  type GeneratedMechanicContract,
  type MechanicIntent,
  type TopDownGameSpec,
} from "@/game-spec";
import { crystalSpecChaseGameSpecFixtureInput } from "@/runtime/phaser/fixtures/crystal-spec-chase";
import type { GeneratedMechanicSourceArtifact } from "@/service/mechanic-source-generation";

import {
  assembleGeneratedMechanicFinalGameSpec,
  type GeneratedMechanicFinalGameSpecAssemblyPlan,
} from "./generated-mechanic-final-game-spec-assembler";

describe("assembleGeneratedMechanicFinalGameSpec", () => {
  it("appends exactly one generated mechanic while retaining exact immutable lineage", () => {
    const context = createAssemblerContext();
    const upstreamSnapshot = structuredClone(context.baseGameSpec);

    const result = assembleGeneratedMechanicFinalGameSpec(context);

    expect(result).toMatchObject({ success: true });
    if (!result.success) {
      return;
    }

    expect(result.data).toEqual({
      schemaVersion: "generated_mechanic_final_game_spec/v1",
      id: "final_game_spec_temperature_v1",
      gameSpec: {
        ...upstreamSnapshot,
        mechanics: [
          ...upstreamSnapshot.mechanics,
          {
            id: "mechanic_temperature_decay",
            type: "generated_temperature_decay",
            entityIds: ["entity_player"],
            objectiveIds: [],
            sceneIds: ["scene_arena"],
            regionIds: [],
            assetIds: [],
            config: { decay_per_action: 2 },
          },
        ],
        mechanicConnections: {
          schemaVersion: "mechanic_port_connections/v1",
          connections: [],
        },
      },
      extension: {
        id: "extension_temperature_decay",
        versionId: "extension_temperature_decay_v1",
        mechanicId: "mechanic_temperature_decay",
        mechanicType: "generated_temperature_decay",
        contractId: "contract_temperature_decay",
        sourceArtifactId: "source_temperature_decay_v1",
        capabilityVersion: "mechanic_capability/v1",
        config: { decay_per_action: 2 },
        bindings: [
          {
            id: "actor",
            referenceKind: "entity",
            cardinality: "one",
            objectIds: ["entity_player"],
          },
        ],
      },
    });
    expect(context.baseGameSpec).toEqual(upstreamSnapshot);
    expect(context.baseGameSpec.mechanics).toHaveLength(
      upstreamSnapshot.mechanics.length
    );
    expect(Object.isFrozen(result.data)).toBe(true);
    expect(Object.isFrozen(result.data.gameSpec.mechanics)).toBe(true);
    expect(Object.isFrozen(result.data.extension.config)).toBe(true);

    context.assemblyPlan.config.decay_per_action = 9;
    context.assemblyPlan.bindings[0]!.objectIds.push("entity_crystal");
    context.baseGameSpec.title = "Mutated upstream after assembly";

    expect(result.data.extension.config).toEqual({ decay_per_action: 2 });
    expect(result.data.extension.bindings[0]?.objectIds).toEqual([
      "entity_player",
    ]);
    expect(result.data.gameSpec.title).toBe(upstreamSnapshot.title);
  });

  it("rejects config that does not satisfy the exact accepted contract", () => {
    const context = createAssemblerContext();
    context.assemblyPlan.config.decay_per_action = 99;
    const upstreamSnapshot = structuredClone(context.baseGameSpec);

    const result = assembleGeneratedMechanicFinalGameSpec(context);

    expect(result).toEqual({
      success: false,
      evidence: {
        responsibleStage: "finalGameSpec",
        issues: [
          {
            path: "extension.config",
            code: "invalid_mechanic_config",
            message:
              "Final Game Spec config does not match the accepted Mechanic Config DSL contract.",
          },
        ],
      },
    });
    expect(context.baseGameSpec).toEqual(upstreamSnapshot);
  });

  it("rejects a binding substituted after contract acceptance", () => {
    const context = createAssemblerContext();
    context.assemblyPlan.bindings[0]!.objectIds = ["entity_crystal"];

    const result = assembleGeneratedMechanicFinalGameSpec(context);

    expect(result).toMatchObject({
      success: false,
      evidence: {
        responsibleStage: "finalGameSpec",
        issues: [
          expect.objectContaining({
            path: "extension.bindings.actor",
            code: "binding_contract_mismatch",
          }),
        ],
      },
    });
  });

  it("rejects active mechanic references outside the trusted catalog", () => {
    const context = createAssemblerContext();
    context.assemblyPlan.activeReferences.sceneIds[0] = "scene_foreign";

    const result = assembleGeneratedMechanicFinalGameSpec(context);

    expect(result).toEqual({
      success: false,
      evidence: {
        responsibleStage: "finalGameSpec",
        issues: [
          {
            path: "assemblyPlan.activeReferences.sceneIds.0",
            code: "unknown_mechanic_reference",
            message:
              'Generated mechanic reference "scene_foreign" requires trusted "scene" authority.',
          },
        ],
      },
    });
  });

  it("rejects a source artifact that does not belong to the exact contract and intent", () => {
    const context = createAssemblerContext();
    const mismatchedSourceArtifact = {
      ...context.sourceArtifact,
      contractId: "contract_foreign",
      intentId: "intent_foreign",
    } as GeneratedMechanicSourceArtifact;

    const result = assembleGeneratedMechanicFinalGameSpec({
      ...context,
      sourceArtifact: mismatchedSourceArtifact,
    });

    expect(result).toEqual({
      success: false,
      evidence: {
        responsibleStage: "source",
        issues: [
          {
            path: "sourceArtifact",
            code: "source_artifact_identity_mismatch",
            message:
              "Generated source artifact must retain the exact accepted contract and intent lineage.",
          },
        ],
      },
    });
  });

  it("rejects without erasing trusted built-in mechanic connections", () => {
    const context = createAssemblerContext();
    context.baseGameSpec.mechanicConnections = {
      schemaVersion: "mechanic_port_connections/v1",
      connections: [
        {
          id: "collector_score",
          output: {
            ownerKind: "mechanic",
            ownerId: "mechanic_pickup_collection",
            portId: "points_awarded",
          },
          input: {
            ownerKind: "game_system",
            ownerId: "score",
            portId: "increment",
          },
        },
      ],
    };
    const upstreamSnapshot = structuredClone(context.baseGameSpec);

    expect(assembleGeneratedMechanicFinalGameSpec(context)).toEqual({
      success: false,
      evidence: {
        responsibleStage: "finalGameSpec",
        issues: [
          {
            path: "baseGameSpec.mechanicConnections",
            code: "existing_mechanic_connections_unsupported",
            message:
              "Generated mechanic assembly cannot replace or authenticate the trusted base Game Spec's existing mechanic connections.",
          },
        ],
      },
    });
    expect(context.baseGameSpec).toEqual(upstreamSnapshot);
  });
});

function createAssemblerContext(): {
  baseGameSpec: TopDownGameSpec;
  intent: MechanicIntent;
  contract: GeneratedMechanicContract;
  sourceArtifact: GeneratedMechanicSourceArtifact;
  referenceCatalog: {
    action: string[];
    asset: string[];
    entity: string[];
    objective: string[];
    region: string[];
    scene: string[];
  };
  trustedPortContracts: [];
  assemblyPlan: MutableAssemblyPlan;
} {
  const baseGameSpec = structuredClone(
    crystalSpecChaseGameSpecFixtureInput
  ) as TopDownGameSpec;
  const intent = createIntent();
  const contract = createContract();
  const grant = createMechanicCapabilityGrant({
    contract,
    constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
  });
  if (!grant.success) {
    throw new Error("Expected the test contract capability grant to pass.");
  }
  const sourceArtifact: GeneratedMechanicSourceArtifact = {
    schemaVersion: "generated_mechanic_source_artifact/v1",
    id: "source_temperature_decay_v1",
    contractId: contract.id,
    intentId: intent.id,
    capabilityVersion: contract.capabilityVersion,
    grant: grant.data,
    usedCapabilities: [...contract.capabilities],
    callbacks: [
      {
        id: "install_temperature_decay",
        kind: "install",
        sourceTypeScript: "return null;",
        normalizedJavaScript:
          "const __sparklineGeneratedMechanicCallback = async () => null;",
      },
      {
        id: "action_temperature_decay",
        kind: "logical_action",
        sourceTypeScript:
          'await capabilities.state.write("temperature", config.decay_per_action);',
        normalizedJavaScript:
          'const __sparklineGeneratedMechanicCallback = async () => capabilities.state.write("temperature", config.decay_per_action);',
      },
      {
        id: "dispose_temperature_decay",
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

  return {
    baseGameSpec,
    intent,
    contract,
    sourceArtifact,
    referenceCatalog: {
      action: baseGameSpec.controls.map(({ action }) => action),
      asset: baseGameSpec.assets.map(({ id }) => id),
      entity: baseGameSpec.entities.map(({ id }) => id),
      objective: baseGameSpec.objectives.map(({ id }) => id),
      region: ["region_safe_start"],
      scene: ["scene_arena"],
    },
    trustedPortContracts: [],
    assemblyPlan: {
      finalGameSpecId: "final_game_spec_temperature_v1",
      extensionId: "extension_temperature_decay",
      extensionVersionId: "extension_temperature_decay_v1",
      mechanicId: "mechanic_temperature_decay",
      mechanicType: "generated_temperature_decay",
      config: { decay_per_action: 2 },
      bindings: [
        {
          id: "actor",
          referenceKind: "entity",
          cardinality: "one",
          objectIds: ["entity_player"],
        },
      ],
      activeReferences: {
        entityIds: ["entity_player"],
        objectiveIds: [],
        sceneIds: ["scene_arena"],
        regionIds: [],
        assetIds: [],
      },
      mechanicConnections: {
        schemaVersion: "mechanic_port_connections/v1",
        connections: [],
      },
    },
  };
}

function createIntent(): MechanicIntent {
  return {
    id: "intent_temperature_decay",
    summary: "Reduce a private temperature counter after each action.",
    triggers: ["logical_action"],
    actors: ["player"],
    targets: [],
    behaviors: ["temperature_decay"],
    ownedObjects: [],
    stateChanges: ["temperature_reduced"],
    temporalRules: [],
    spatialRules: [],
    constraints: [],
    configuration: [{ key: "decay_per_action", value: 2 }],
    connections: [],
    references: [{ kind: "entity", id: "entity_player" }],
    outcomes: ["temperature_reduced"],
    requiredCapabilities: ["state_write"],
    ambiguities: [],
  };
}

function createContract(): GeneratedMechanicContract {
  return {
    schemaVersion: "generated-mechanic-contract/v1",
    id: "contract_temperature_decay",
    intentId: "intent_temperature_decay",
    capabilityVersion: "mechanic_capability/v1",
    behavior: {
      summary: "Reduce a private temperature counter after each action.",
      triggers: ["logical_action"],
      outcomes: ["temperature_reduced"],
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
    privateState: [
      { id: "temperature", valueType: "integer", initialValue: 10 },
    ],
    lifecycle: {
      callbacks: ["install", "logical_action"],
      fixedStep: false,
      dispose: true,
    },
    ports: [],
    capabilities: ["state_write"],
    resourceExpectations: {
      maximumOwnedObjects: 0,
      maximumOperationsPerTick: 4,
      maximumScheduledCallbacks: 0,
      maximumSubscriptions: 0,
      maximumSignalsPerTick: 0,
      maximumStateBytes: 64,
      maximumCallbackMilliseconds: 8,
      maximumConsecutiveFailures: 1,
    },
    scenarios: [
      {
        id: "scenario_temperature_decay",
        seed: 1729,
        setup: [
          { kind: "binding_present", bindingId: "actor" },
          { kind: "state_equals", stateId: "temperature", value: 10 },
        ],
        steps: [{ kind: "dispatch_action", actionId: "move" }],
        observations: [
          { kind: "state_equals", stateId: "temperature", value: 8 },
        ],
      },
    ],
  };
}

type MutableAssemblyPlan = GeneratedMechanicFinalGameSpecAssemblyPlan & {
  config: { decay_per_action: number };
  bindings: [
    {
      id: "actor";
      referenceKind: "entity";
      cardinality: "one";
      objectIds: string[];
    },
  ];
  activeReferences: {
    entityIds: string[];
    objectiveIds: string[];
    sceneIds: string[];
    regionIds: string[];
    assetIds: string[];
  };
};
