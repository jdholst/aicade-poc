import { describe, expect, it } from "vitest";

import {
  GENERATED_MECHANIC_FIXED_STEP_INTERVAL_MILLISECONDS,
  PHASE_9_GENERATION_CONSTRAINT_SET,
  createMechanicCapabilityGrant,
  type GeneratedMechanicContract,
  type MechanicCapabilityGrant,
  type MechanicIntent,
} from "@/game-spec";
import type {
  MechanicExecutionRealmAdapter,
  MechanicExecutionRealmExecutionInput,
} from "@/runtime/mechanics/mechanic-execution-realm";
import { PHASE_9_MECHANIC_RESOURCE_BUDGET } from "@/runtime/mechanics/phase-9-mechanic-resource-policy";
import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";
import type { GeneratedMechanicSourceArtifact } from "@/service/mechanic-source-generation";

import {
  createGeneratedMechanicBrowserExecutionFixture,
  createGeneratedMechanicBrowserEvaluationRuntimeFactory,
  createGeneratedMechanicExternalObservations,
} from "./generated-mechanic-browser-evaluation-fixture";

describe("generated mechanic browser evaluation fixture", () => {
  it("projects exact entity bindings through opaque handles and observable virtual motion", async () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const contract = createContract(gameSpec.entities[0].id);
    const grantResult = createMechanicCapabilityGrant({
      contract,
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    });
    if (!grantResult.success) {
      throw new Error("Expected the test grant to be admitted.");
    }
    const fixture = createGeneratedMechanicBrowserExecutionFixture({
      contract,
      gameSpec,
      grant: grantResult.data,
      resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
      seed: 7,
    });
    const handle = fixture.bindings[0]?.handles[0];
    if (!handle) {
      throw new Error("Expected one exact entity binding handle.");
    }

    await fixture.capabilityHost.invoke({
      capabilityId: "object_motion_write",
      arguments: [handle, { velocity: { x: 48, y: -2 } }],
    });
    await fixture.capabilityHost.invoke({
      capabilityId: "state_write",
      arguments: ["dash_count", 1],
    });

    await expect(
      fixture.observations.readBindingProperty("actor", "velocity")
    ).resolves.toEqual({ x: 48, y: -2 });
    await expect(
      fixture.observations.readBindingProperty("actor", "active")
    ).resolves.toBe(true);
    await expect(
      fixture.observations.readDeclaredState("dash_count")
    ).resolves.toBe(1);
    expect(fixture.bindingAuthority.objectIdForHandle(handle)).toBe(
      gameSpec.entities[0].id
    );

    await fixture.dispose();
    await fixture.dispose();
  });

  it("evaluates declared owned objects through create, query, motion, and destroy", async () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const contract: GeneratedMechanicContract = {
      ...createContract(gameSpec.entities[0].id),
      ownedObjects: [
        { id: "transient_effect", objectKind: "effect", maximumInstances: 2 },
      ],
      capabilities: [
        ...createContract(gameSpec.entities[0].id).capabilities,
        "object_create",
        "spatial_query",
        "object_destroy",
      ],
      resourceExpectations: {
        ...createContract(gameSpec.entities[0].id).resourceExpectations,
        maximumOwnedObjects: 2,
      },
    };
    const grantResult = createMechanicCapabilityGrant({
      contract,
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    });
    if (!grantResult.success) {
      throw new Error("Expected the owned-object grant to be admitted.");
    }
    const fixture = createGeneratedMechanicBrowserExecutionFixture({
      contract,
      gameSpec,
      grant: grantResult.data,
      resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
      seed: 7,
    });

    const created = await fixture.capabilityHost.invoke({
      capabilityId: "object_create",
      arguments: [
        "transient_effect",
        {
          active: false,
          position: { x: 24, y: 32 },
          velocity: { x: 8, y: 0 },
          properties: { strength: 2 },
        },
      ],
    });
    if (created.kind !== "opaque_handle") {
      throw new Error("Expected one owned-object handle.");
    }

    expect(
      fixture.capabilityHost.invoke({
        capabilityId: "object_read",
        arguments: [created.value],
      })
    ).toEqual({
      kind: "json",
      value: {
        active: true,
        kind: "effect",
        position: { x: 24, y: 32 },
        properties: { strength: 2 },
        velocity: { x: 8, y: 0 },
      },
    });
    expect(
      fixture.capabilityHost.invoke({
        capabilityId: "spatial_query",
        arguments: [
          {
            center: { x: 24, y: 32 },
            radius: 0,
            objectKinds: ["effect"],
            ownership: "owned",
          },
        ],
      })
    ).toEqual({ kind: "opaque_handles", value: [created.value] });
    await fixture.advanceSimulation(1000);
    expect(
      fixture.capabilityHost.invoke({
        capabilityId: "object_read",
        arguments: [created.value],
      })
    ).toMatchObject({
      kind: "json",
      value: { position: { x: 32, y: 32 } },
    });
    await expect(
      fixture.observations.countOwnedObjects("transient_effect")
    ).resolves.toBe(1);

    await fixture.capabilityHost.invoke({
      capabilityId: "object_motion_write",
      arguments: [created.value, { position: { x: 40, y: 32 } }],
    });
    await fixture.capabilityHost.invoke({
      capabilityId: "object_destroy",
      arguments: [created.value],
    });

    await expect(
      fixture.observations.readOwnedObjectActivity("transient_effect")
    ).resolves.toEqual({
      active: 0,
      created: 1,
      destroyed: 1,
      simulatedDistanceTraveled: 8,
      targetInteractions: 0,
    });
    const bounded = fixture.capabilityHost.invoke({
      capabilityId: "object_create",
      arguments: [
        "transient_effect",
        {
          active: false,
          position: { x: 2_000_000, y: -2_000_000 },
          velocity: { x: 3_000, y: -3_000 },
        },
      ],
    });
    if (bounded.kind !== "opaque_handle") {
      throw new Error("Expected one bounded owned-object handle.");
    }
    expect(
      fixture.capabilityHost.invoke({
        capabilityId: "object_read",
        arguments: [bounded.value],
      })
    ).toMatchObject({
      kind: "json",
      value: {
        active: true,
        position: { x: 1_000_000, y: -1_000_000 },
        velocity: { x: 2_000, y: -2_000 },
      },
    });
    fixture.capabilityHost.invoke({
      capabilityId: "object_destroy",
      arguments: [bounded.value],
    });
    await expect(
      fixture.observations.countOwnedObjects("transient_effect")
    ).resolves.toBe(0);
    await fixture.dispose();
  });

  it("attributes a routed-target motion effect only after a spatial match with a traveling owned object", async () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const actorEntity = gameSpec.entities[0];
    const targetEntity = gameSpec.entities[1];
    if (!actorEntity || !targetEntity) {
      throw new Error("Expected actor and target entities.");
    }
    const targetIndex = gameSpec.entities.indexOf(targetEntity);
    const baseContract = createContract(actorEntity.id);
    const contract: GeneratedMechanicContract = {
      ...baseContract,
      intentLineage: {
        ...baseContract.intentLineage!,
        targets: [targetEntity.role],
        references: [
          { kind: "entity", id: actorEntity.id },
          { kind: "entity", id: targetEntity.id },
        ],
      },
      bindings: [
        ...baseContract.bindings,
        {
          id: "target",
          referenceKind: "entity",
          cardinality: "one",
          objectIds: [targetEntity.id],
        },
      ],
      ownedObjects: [
        { id: "transient_effect", objectKind: "effect", maximumInstances: 1 },
      ],
      capabilities: [
        ...baseContract.capabilities,
        "object_create",
        "spatial_query",
        "object_destroy",
      ],
      resourceExpectations: {
        ...baseContract.resourceExpectations,
        maximumOwnedObjects: 1,
      },
    };
    const grantResult = createMechanicCapabilityGrant({
      contract,
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    });
    if (!grantResult.success) {
      throw new Error("Expected the interaction grant to be admitted.");
    }
    const fixture = createGeneratedMechanicBrowserExecutionFixture({
      contract,
      gameSpec,
      grant: grantResult.data,
      resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
      seed: 7,
    });
    const targetHandle = fixture.bindings.find(({ id }) => id === "target")
      ?.handles[0];
    if (!targetHandle) {
      throw new Error("Expected one exact target handle.");
    }
    const targetPosition = {
      x: 80 + targetIndex * 32,
      y: 80 + targetIndex * 24,
    };
    const created = fixture.capabilityHost.invoke({
      capabilityId: "object_create",
      arguments: [
        "transient_effect",
        { position: targetPosition, velocity: { x: 10, y: 0 } },
      ],
    });
    if (created.kind !== "opaque_handle") {
      throw new Error("Expected one transient owned-object handle.");
    }

    expect(
      fixture.capabilityHost.invoke({
        capabilityId: "spatial_query",
        arguments: [
          {
            center: targetPosition,
            radius: 0,
            objectKinds: [targetEntity.role],
            ownership: "bound",
          },
        ],
      })
    ).toEqual({ kind: "opaque_handles", value: [targetHandle] });
    fixture.capabilityHost.invoke({
      capabilityId: "object_motion_write",
      arguments: [targetHandle, { velocity: { x: 12, y: 0 } }],
    });
    await fixture.advanceSimulation(100);
    fixture.capabilityHost.invoke({
      capabilityId: "object_destroy",
      arguments: [created.value],
    });

    await expect(
      fixture.observations.readOwnedObjectActivity("transient_effect")
    ).resolves.toMatchObject({
      active: 0,
      created: 1,
      destroyed: 1,
      simulatedDistanceTraveled: 1,
      targetInteractions: 1,
    });
    await fixture.dispose();
  });

  it("authors one independent causal motion observation per scenario", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const contract = createContract(gameSpec.entities[0].id);

    expect(
      createGeneratedMechanicExternalObservations(
        createIntent(gameSpec.entities[0].id),
        contract,
        gameSpec
      )
    ).toEqual([
      {
        id: "external_scenario_dash_referenced_entity_motion_changed",
        scenarioId: "scenario_dash",
        observation: {
          kind: "referenced_entity_motion_changed",
          bindingIds: ["actor"],
          actionId: "move",
        },
      },
    ]);
  });

  it("does not impose transient lifecycle evidence on every owned-object intent", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const entityId = gameSpec.entities[0].id;
    const intent: MechanicIntent = {
      ...createIntent(entityId),
      ownedObjects: ["persistent_companion"],
      requiredCapabilities: ["object_motion_write", "object_create"],
    };
    const contract: GeneratedMechanicContract = {
      ...createContract(entityId),
      ownedObjects: [
        {
          id: "persistent_companion",
          objectKind: "companion",
          maximumInstances: 1,
        },
      ],
      capabilities: ["object_motion_write", "object_create"],
      resourceExpectations: {
        ...createContract(entityId).resourceExpectations,
        maximumOwnedObjects: 1,
      },
    };

    expect(
      createGeneratedMechanicExternalObservations(intent, contract, gameSpec)
    ).toEqual([
      {
        id: "external_scenario_dash_referenced_entity_motion_changed",
        scenarioId: "scenario_dash",
        observation: {
          kind: "referenced_entity_motion_changed",
          bindingIds: ["actor"],
          actionId: "move",
        },
      },
    ]);
  });

  it("authors owned-object lifecycle proof for transient create-move-destroy behavior without spatial queries", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const entityId = gameSpec.entities[0].id;
    const baseIntent = createIntent(entityId);
    const intent: MechanicIntent = {
      ...baseIntent,
      ownedObjects: ["projectile"],
      requiredCapabilities: [
        "object_motion_write",
        "object_create",
        "object_destroy",
      ],
    };
    const baseContract = createContract(entityId);
    const contract: GeneratedMechanicContract = {
      ...baseContract,
      ownedObjects: [
        { id: "projectile", objectKind: "projectile", maximumInstances: 2 },
      ],
      capabilities: [
        "object_motion_write",
        "object_create",
        "object_destroy",
      ],
      resourceExpectations: {
        ...baseContract.resourceExpectations,
        maximumOwnedObjects: 2,
      },
    };

    expect(
      createGeneratedMechanicExternalObservations(intent, contract, gameSpec)
    ).toEqual([
      {
        id: "external_scenario_dash_owned_object_lifecycle_after_action",
        scenarioId: "scenario_dash",
        observation: {
          kind: "owned_object_lifecycle_after_action",
          archetypeIds: ["projectile"],
          actionId: "move",
        },
      },
    ]);
  });

  it("rejects private-state mutation as independent gameplay evidence", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const contract: GeneratedMechanicContract = {
      ...createContract(gameSpec.entities[0].id),
      capabilities: ["state_read", "state_write"],
    };

    expect(
      () =>
        createGeneratedMechanicExternalObservations(
          createIntent(gameSpec.entities[0].id),
          contract,
          gameSpec
        )
    ).toThrow(/object_motion_write/);
  });

  it("observes only bindings that resolve exact routed-intent entities", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const referencedEntityId = gameSpec.entities[0].id;
    const decoyEntityId = gameSpec.entities[1]?.id;
    if (!decoyEntityId) {
      throw new Error("Expected a second entity for the hostile fixture.");
    }
    const contract: GeneratedMechanicContract = {
      ...createContract(referencedEntityId),
      bindings: [
        ...createContract(referencedEntityId).bindings,
        {
          id: "decoy",
          referenceKind: "entity",
          cardinality: "one",
          objectIds: [decoyEntityId],
        },
      ],
    };

    expect(
      createGeneratedMechanicExternalObservations(
        createIntent(referencedEntityId),
        contract,
        gameSpec
      )
    ).toEqual([
      {
        id: "external_scenario_dash_referenced_entity_motion_changed",
        scenarioId: "scenario_dash",
        observation: {
          kind: "referenced_entity_motion_changed",
          bindingIds: ["actor"],
          actionId: "move",
        },
      },
    ]);
  });

  it("binds causal proof to actor-role references rather than a routed target", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const actorEntity = gameSpec.entities.find(({ role }) => role === "player");
    const targetEntity = gameSpec.entities.find(({ role }) => role !== "player");
    if (!actorEntity || !targetEntity) {
      throw new Error("Expected distinct actor and target entities.");
    }
    const baseIntent = createIntent(actorEntity.id);
    const intent: MechanicIntent = {
      ...baseIntent,
      targets: [targetEntity.role],
      references: [
        { kind: "entity", id: actorEntity.id },
        { kind: "entity", id: targetEntity.id },
      ],
    };
    const baseContract = createContract(actorEntity.id);
    const contract: GeneratedMechanicContract = {
      ...baseContract,
      intentLineage: {
        ...baseContract.intentLineage!,
        targets: [targetEntity.role],
        references: intent.references,
      },
      bindings: [
        ...baseContract.bindings,
        {
          id: "target",
          referenceKind: "entity",
          cardinality: "one",
          objectIds: [targetEntity.id],
        },
      ],
    };

    expect(
      createGeneratedMechanicExternalObservations(intent, contract, gameSpec)
    ).toEqual([
      {
        id: "external_scenario_dash_referenced_entity_motion_changed",
        scenarioId: "scenario_dash",
        observation: {
          kind: "referenced_entity_motion_changed",
          bindingIds: ["actor"],
          actionId: "move",
        },
      },
    ]);
  });

  it("authors target interaction and owned-object lifecycle proof for transient-object contracts", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const actorEntity = gameSpec.entities.find(({ role }) => role === "player");
    const targetEntity = gameSpec.entities.find(({ role }) => role !== "player");
    if (!actorEntity || !targetEntity) {
      throw new Error("Expected distinct actor and target entities.");
    }
    const baseIntent = createIntent(actorEntity.id);
    const intent: MechanicIntent = {
      ...baseIntent,
      targets: [targetEntity.role],
      ownedObjects: ["transient_effect"],
      references: [
        { kind: "entity", id: actorEntity.id },
        { kind: "entity", id: targetEntity.id },
      ],
      requiredCapabilities: [
        ...baseIntent.requiredCapabilities,
        "object_create",
        "spatial_query",
        "object_destroy",
      ],
    };
    const baseContract = createContract(actorEntity.id);
    const contract: GeneratedMechanicContract = {
      ...baseContract,
      intentLineage: {
        ...baseContract.intentLineage!,
        targets: intent.targets,
        references: intent.references,
      },
      bindings: [
        ...baseContract.bindings,
        {
          id: "target",
          referenceKind: "entity",
          cardinality: "one",
          objectIds: [targetEntity.id],
        },
      ],
      ownedObjects: [
        { id: "transient_effect", objectKind: "effect", maximumInstances: 2 },
      ],
      capabilities: [
        ...baseContract.capabilities,
        "object_create",
        "spatial_query",
        "object_destroy",
      ],
      resourceExpectations: {
        ...baseContract.resourceExpectations,
        maximumOwnedObjects: 2,
      },
    };

    expect(
      createGeneratedMechanicExternalObservations(intent, contract, gameSpec)
    ).toEqual([
      {
        id: "external_scenario_dash_owned_object_lifecycle_after_action",
        scenarioId: "scenario_dash",
        observation: {
          kind: "owned_object_lifecycle_after_action",
          archetypeIds: ["transient_effect"],
          actionId: "move",
          requireTargetInteraction: true,
        },
      },
    ]);
  });

  it("rejects a legacy contract without trusted intent lineage at the production observation seam", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const contract = createContract(gameSpec.entities[0].id);
    const { intentLineage: _lineage, ...legacyContract } = contract;
    void _lineage;

    expect(() =>
      createGeneratedMechanicExternalObservations(
        createIntent(gameSpec.entities[0].id),
        legacyContract,
        gameSpec
      )
    ).toThrow(/trusted intent lineage/);
  });

  it("rejects ambiguous duplicate bindings for one routed intent entity", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const entityId = gameSpec.entities[0].id;
    const contract: GeneratedMechanicContract = {
      ...createContract(entityId),
      bindings: [
        ...createContract(entityId).bindings,
        {
          id: "substituted_actor",
          referenceKind: "entity",
          cardinality: "one",
          objectIds: [entityId],
        },
      ],
    };

    expect(() =>
      createGeneratedMechanicExternalObservations(
        createIntent(entityId),
        contract,
        gameSpec
      )
    ).toThrow(/exactly one .*binding/);
  });

  it("uses the canonical host interval for fixed-step browser evaluation", async () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const contract: GeneratedMechanicContract = {
      ...createContract(gameSpec.entities[0].id),
      lifecycle: {
        callbacks: ["install", "logical_action"],
        fixedStep: true,
        dispose: true,
      },
    };
    const harness = await createEvaluationRuntimeHarness(contract);

    await harness.runtime.install();
    await harness.runtime.advanceTime(
      GENERATED_MECHANIC_FIXED_STEP_INTERVAL_MILLISECONDS - 1
    );
    expect(harness.callbackIds).toEqual(["callback_install"]);

    await harness.runtime.advanceTime(1);
    expect(harness.callbackIds).toEqual([
      "callback_install",
      "callback_fixed_step",
    ]);
    await harness.runtime.dispose();
  });

  it("advances owned-object motion through the production evaluation runtime factory", async () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const baseContract = createContract(gameSpec.entities[0].id);
    const contract: GeneratedMechanicContract = {
      ...baseContract,
      ownedObjects: [
        { id: "transient_effect", objectKind: "effect", maximumInstances: 1 },
      ],
      capabilities: [...baseContract.capabilities, "object_create"],
      lifecycle: {
        ...baseContract.lifecycle,
        fixedStep: true,
      },
      resourceExpectations: {
        ...baseContract.resourceExpectations,
        maximumOwnedObjects: 1,
      },
    };
    const grantResult = createMechanicCapabilityGrant({
      contract,
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    });
    if (!grantResult.success) {
      throw new Error("Expected the production travel grant to be admitted.");
    }
    const createRuntime =
      createGeneratedMechanicBrowserEvaluationRuntimeFactory({
        gameSpec,
        realmAdapter: createOwnedObjectTravelRealmAdapter(),
        resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
      });
    const runtime = await createRuntime({
      fixtureId: "production_travel_fixture",
      scenarioId: contract.scenarios[0]!.id,
      seed: 7,
      contract,
      artifact: createSourceArtifact(contract, grantResult.data),
      config: {},
    });

    await runtime.install();
    await runtime.dispatchAction("move");
    await runtime.advanceTime(100);

    await expect(
      runtime.readOwnedObjectActivity?.("transient_effect")
    ).resolves.toMatchObject({
      active: 1,
      created: 1,
      simulatedDistanceTraveled: 1,
    });
    await runtime.dispose();
  });

  it("does not schedule fixed-step callbacks for non-fixed browser evaluation", async () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const harness = await createEvaluationRuntimeHarness(
      createContract(gameSpec.entities[0].id)
    );

    await harness.runtime.install();
    await harness.runtime.advanceTime(
      GENERATED_MECHANIC_FIXED_STEP_INTERVAL_MILLISECONDS * 2
    );
    expect(harness.callbackIds).toEqual(["callback_install"]);

    await harness.runtime.dispose();
    expect(harness.callbackIds).toEqual([
      "callback_install",
      "callback_dispose",
    ]);
  });
});

async function createEvaluationRuntimeHarness(
  contract: GeneratedMechanicContract
) {
  const gameSpec = getFirstValidTopDownGameSpecFixture();
  const grantResult = createMechanicCapabilityGrant({
    contract,
    constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
  });
  if (!grantResult.success) {
    throw new Error("Expected the evaluation contract grant to be admitted.");
  }
  const callbackIds: string[] = [];
  const realmAdapter = createRecordingRealmAdapter(callbackIds);
  const createRuntime = createGeneratedMechanicBrowserEvaluationRuntimeFactory({
    gameSpec,
    realmAdapter,
    resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
  });
  const artifact = createSourceArtifact(contract, grantResult.data);
  const runtime = await createRuntime({
    fixtureId: "browser_evaluation_fixture",
    scenarioId: contract.scenarios[0]!.id,
    seed: 7,
    contract,
    artifact,
    config: {},
  });

  return { callbackIds, runtime };
}

function createSourceArtifact(
  contract: GeneratedMechanicContract,
  grant: MechanicCapabilityGrant
): GeneratedMechanicSourceArtifact {
  const callbacks: GeneratedMechanicSourceArtifact["callbacks"] = [
    sourceCallback("callback_install", "install"),
    sourceCallback("callback_logical_action", "logical_action"),
    ...(contract.lifecycle.fixedStep
      ? [sourceCallback("callback_fixed_step", "fixed_step")]
      : []),
    sourceCallback("callback_dispose", "dispose"),
  ];

  return {
    schemaVersion: "generated_mechanic_source_artifact/v1",
    id: "browser_evaluation_source",
    contractId: contract.id,
    intentId: contract.intentId,
    capabilityVersion: contract.capabilityVersion,
    grant,
    usedCapabilities: [],
    callbacks,
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

function sourceCallback(
  id: string,
  kind: GeneratedMechanicSourceArtifact["callbacks"][number]["kind"]
): GeneratedMechanicSourceArtifact["callbacks"][number] {
  return {
    id,
    kind,
    sourceTypeScript: "return null;",
    normalizedJavaScript:
      "const __sparklineGeneratedMechanicCallback = async () => null;",
  };
}

function createRecordingRealmAdapter(
  callbackIds: string[]
): MechanicExecutionRealmAdapter {
  return {
    adapterVersion: "mechanic_execution_realm_adapter/v1",
    id: "recording_browser_evaluation_realm",
    async create() {
      return {
        execute(input: MechanicExecutionRealmExecutionInput) {
          const callbackId = input.lifecycle?.invocations[0]?.callbackId;
          if (callbackId) {
            callbackIds.push(callbackId);
          }
          const result = Promise.resolve({
            executionId: input.id,
            outcome: "completed" as const,
          });
          return { result, terminate: () => result };
        },
        dispose() {},
      };
    },
  };
}

function createOwnedObjectTravelRealmAdapter(): MechanicExecutionRealmAdapter {
  return {
    adapterVersion: "mechanic_execution_realm_adapter/v1",
    id: "owned_object_travel_evaluation_realm",
    async create(input) {
      return {
        execute(execution) {
          const callbackId = execution.lifecycle?.invocations[0]?.callbackId;
          const result = Promise.resolve().then(async () => {
            if (callbackId === "callback_logical_action") {
              await input.capabilityHost.invoke({
                capabilityId: "object_create",
                arguments: [
                  "transient_effect",
                  { position: { x: 24, y: 32 }, velocity: { x: 10, y: 0 } },
                ],
              });
            }
            return {
              executionId: execution.id,
              outcome: "completed" as const,
            };
          });
          return { result, terminate: () => result };
        },
        dispose() {},
      };
    },
  };
}

function createIntent(entityId: string): MechanicIntent {
  return {
    id: "intent_dash",
    summary: "Dash the routed player when the creator action is dispatched.",
    triggers: ["logical_action"],
    actors: ["player"],
    targets: [],
    behaviors: ["dash"],
    ownedObjects: [],
    stateChanges: ["entity_velocity_changed"],
    temporalRules: [],
    spatialRules: [],
    constraints: [],
    configuration: [],
    connections: [{ direction: "input", port: "move" }],
    references: [{ kind: "entity", id: entityId }],
    outcomes: ["entity_velocity_changed"],
    requiredCapabilities: ["object_motion_write"],
    ambiguities: [],
  };
}

function createContract(entityId: string): GeneratedMechanicContract {
  return {
    schemaVersion: "generated-mechanic-contract/v1",
    id: "contract_dash",
    intentId: "intent_dash",
    capabilityVersion: "mechanic_capability/v1",
    intentLineage: {
      actors: ["player"],
      targets: [],
      behaviors: ["dash"],
      stateChanges: ["entity_velocity_changed"],
      temporalRules: [],
      spatialRules: [],
      constraints: [],
      connections: [{ direction: "input", port: "move" }],
      references: [{ kind: "entity", id: entityId }],
    },
    behavior: {
      summary: "Move one bound entity through a deterministic dash.",
      triggers: ["logical_action"],
      outcomes: ["entity_velocity_changed"],
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
    privateState: [
      { id: "dash_count", valueType: "integer", initialValue: 0 },
    ],
    lifecycle: {
      callbacks: ["install", "logical_action"],
      fixedStep: false,
      dispose: true,
    },
    ports: [],
    capabilities: ["object_read", "object_motion_write", "state_read", "state_write"],
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
        id: "scenario_dash",
        seed: 7,
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
