import {
  GENERATED_MECHANIC_FIXED_STEP_INTERVAL_MILLISECONDS,
  TOP_DOWN_GENERATED_MECHANIC_EVALUATION_PROPERTY_IDS,
  type GeneratedMechanicContract,
  type MechanicCapabilityGrant,
  type MechanicIntent,
  type TopDownGameSpec,
} from "@/game-spec";
import type { JsonValue, StableId } from "@/game-spec/game-spec-schema";
import type { MechanicExecutionRealmAdapter } from "@/runtime/mechanics/mechanic-execution-realm";
import type {
  MechanicExecutionRealmBinding,
  MechanicExecutionRealmCapabilityHost,
  MechanicExecutionRealmResourceBudget,
} from "@/runtime/mechanics/mechanic-execution-realm";
import { createMechanicObjectCapabilityHost } from "@/runtime/mechanics/mechanic-object-capability-host";
import type { MechanicObjectBindingAuthority } from "@/runtime/mechanics/mechanic-object-host";
import { createMechanicPrivateStateHost } from "@/runtime/mechanics/mechanic-private-state";
import {
  createTopDownPhaserMechanicObjectHost,
  type TrustedTopDownPhaserMechanicObject,
} from "@/runtime/phaser/top-down-mechanic-object-adapter";
import type {
  ExternalAcceptanceObservation,
  GeneratedMechanicEvaluationRuntimeFactory,
} from "@/service/mechanic-evaluation";
import { createGeneratedMechanicLifecycleEvaluationRuntimeFactory } from "@/service/mechanic-evaluation";

type FixtureObservations = Readonly<{
  hasBinding(bindingId: StableId): Promise<boolean>;
  readDeclaredState(stateId: StableId): Promise<JsonValue>;
  readBindingProperty(
    bindingId: StableId,
    property: StableId
  ): Promise<JsonValue>;
  countOwnedObjects(archetypeId: StableId): Promise<number>;
  readEmittedOutputs(portId: StableId): Promise<readonly JsonValue[]>;
}>;

export type GeneratedMechanicBrowserExecutionFixture = Readonly<{
  bindings: readonly MechanicExecutionRealmBinding[];
  bindingAuthority: MechanicObjectBindingAuthority;
  capabilityHost: MechanicExecutionRealmCapabilityHost;
  observations: FixtureObservations;
  dispose(): Promise<void>;
}>;

export type CreateGeneratedMechanicBrowserExecutionFixtureInput = Readonly<{
  contract: GeneratedMechanicContract;
  gameSpec: TopDownGameSpec;
  grant: MechanicCapabilityGrant;
  resourceBudget: MechanicExecutionRealmResourceBudget;
  seed: number;
}>;

type VirtualEntityState = {
  active: boolean;
  kind: StableId;
  name: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
};

/** Creates a fresh deterministic top-down object/state world for one attempt. */
export function createGeneratedMechanicBrowserExecutionFixture({
  contract,
  gameSpec,
  grant,
  resourceBudget,
  seed,
}: CreateGeneratedMechanicBrowserExecutionFixtureInput): GeneratedMechanicBrowserExecutionFixture {
  const virtualEntities = new Map<StableId, VirtualEntityState>();
  const objects = gameSpec.entities.map((entity, index) => {
    const state = createInitialVirtualEntityState(entity, index);
    virtualEntities.set(entity.id, state);
    const object: TrustedTopDownPhaserMechanicObject = {
      get active() {
        return state.active;
      },
      get x() {
        return state.position.x;
      },
      get y() {
        return state.position.y;
      },
      setPosition(x, y) {
        state.position = { x, y };
      },
      body: {
        get velocity() {
          return state.velocity;
        },
        setVelocity(x, y) {
          state.velocity = { x, y };
        },
      },
    };
    return {
      id: entity.id,
      kind: entity.role,
      object,
      observeProperties: () => ({ name: entity.name, role: entity.role }),
    };
  });
  const bindingsById = new Map(
    contract.bindings.map((binding) => [binding.id, binding])
  );
  const objectHost = createTopDownPhaserMechanicObjectHost({
    mechanicId: contract.id,
    grant,
    bindings: contract.bindings.map((binding) => ({
      id: binding.id,
      cardinality: binding.cardinality,
      getObjectIds: () => binding.objectIds,
    })),
    ownedObjectArchetypes: [],
    objects,
    ownedObjectFactories: {},
  });
  const bindings: readonly MechanicExecutionRealmBinding[] = Object.freeze(
    contract.bindings.map((binding) => ({
      id: binding.id,
      cardinality: binding.cardinality,
      handles:
        binding.cardinality === "one"
          ? Object.freeze([objectHost.resolveOne(binding.id)])
          : objectHost.resolveMany(binding.id),
    }))
  );
  const privateState = createMechanicPrivateStateHost({
    grant,
    declarations: contract.privateState,
    resourceBudget,
  });
  const objectCapabilityHost = createMechanicObjectCapabilityHost(objectHost);
  const stateAndObjectHost = privateState.createCapabilityHost(
    objectCapabilityHost
  );
  const capabilityHost = createDeterministicAttemptCapabilityHost({
    contract,
    delegate: stateAndObjectHost,
    seed,
  });
  let disposed = false;

  return Object.freeze({
    bindings,
    bindingAuthority: objectHost.bindingAuthority,
    capabilityHost,
    observations: Object.freeze({
      hasBinding: async (bindingId: StableId) => {
        const binding = bindingsById.get(bindingId);
        return (
          binding !== undefined &&
          binding.objectIds.every((objectId) => virtualEntities.has(objectId))
        );
      },
      readDeclaredState: async (stateId: StableId) =>
        requireJsonResult(
          await capabilityHost.invoke({
            capabilityId: "state_read",
            arguments: [stateId],
          })
        ),
      readBindingProperty: async (
        bindingId: StableId,
        property: StableId
      ) => {
        const binding = bindingsById.get(bindingId);
        const objectId = binding?.objectIds[0];
        const state = objectId ? virtualEntities.get(objectId) : undefined;
        if (!binding || !state) {
          throw new Error(
            `Generated mechanic evaluation binding "${bindingId}" is unavailable.`
          );
        }
        return readVirtualEntityProperty(state, property);
      },
      countOwnedObjects: async () => objectHost.getOwnedObjectCount(),
      readEmittedOutputs: async () => Object.freeze([]),
    } satisfies FixtureObservations),
    async dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      let objectError: unknown;
      try {
        objectHost.dispose();
      } catch (error) {
        objectError = error;
      }
      privateState.dispose();
      virtualEntities.clear();
      if (objectError !== undefined) {
        throw objectError;
      }
    },
  });
}

export function createGeneratedMechanicBrowserEvaluationRuntimeFactory({
  gameSpec,
  realmAdapter,
  resourceBudget,
}: Readonly<{
  gameSpec: TopDownGameSpec;
  realmAdapter: MechanicExecutionRealmAdapter;
  resourceBudget: MechanicExecutionRealmResourceBudget;
}>): GeneratedMechanicEvaluationRuntimeFactory {
  return createGeneratedMechanicLifecycleEvaluationRuntimeFactory({
    realmAdapter,
    resourceBudget,
    createFixture: async ({ contract, artifact, seed }) => {
      const fixture = createGeneratedMechanicBrowserExecutionFixture({
        contract,
        gameSpec,
        grant: artifact.grant,
        resourceBudget,
        seed,
      });
      return {
        bindings: fixture.bindings,
        capabilityHost: fixture.capabilityHost,
        observations: fixture.observations,
        ...(contract.lifecycle.fixedStep
          ? {
              fixedStepIntervalMilliseconds:
                GENERATED_MECHANIC_FIXED_STEP_INTERVAL_MILLISECONDS,
            }
          : {}),
        dispose: fixture.dispose,
      };
    },
  });
}

export function createGeneratedMechanicExternalObservations(
  intent: MechanicIntent,
  contract: GeneratedMechanicContract,
  gameSpec: TopDownGameSpec
): readonly ExternalAcceptanceObservation[] {
  if (
    contract.intentId !== intent.id ||
    !hasExactTrustedIntentLineage(contract, intent)
  ) {
    throw new TypeError(
      "Top-down generated mechanic evaluation requires the exact trusted intent lineage stamped by contract generation."
    );
  }
  if (!contract.capabilities.includes("object_motion_write")) {
    throw new TypeError(
      "Top-down generated mechanic evaluation requires object_motion_write for independently visible evidence."
    );
  }
  const activeEntitiesById = new Map(
    gameSpec.entities.map((entity) => [entity.id, entity] as const)
  );
  const actorRoles = new Set(intent.actors);
  const referencedActorEntityIds = intent.references.flatMap((reference) => {
    if (reference.kind !== "entity") {
      return [];
    }
    const entity = activeEntitiesById.get(reference.id);
    return entity && actorRoles.has(entity.role) ? [entity.id] : [];
  });
  const representedActorRoles = new Set(
    referencedActorEntityIds.map(
      (entityId) => activeEntitiesById.get(entityId)!.role
    )
  );
  const bindingsByReferencedActor = referencedActorEntityIds.map((entityId) =>
    contract.bindings.filter(
      (binding) =>
        binding.referenceKind === "entity" &&
        binding.cardinality === "one" &&
        binding.objectIds.length === 1 &&
        binding.objectIds[0] === entityId
    )
  );
  if (
    actorRoles.size === 0 ||
    representedActorRoles.size !== actorRoles.size ||
    referencedActorEntityIds.length === 0 ||
    new Set(referencedActorEntityIds).size !== referencedActorEntityIds.length ||
    bindingsByReferencedActor.some((bindings) => bindings.length !== 1)
  ) {
    throw new TypeError(
      "Top-down generated mechanic evaluation requires exactly one single-entity binding for every trusted actor-role entity reference."
    );
  }
  const referencedBindingIds = bindingsByReferencedActor.map(
    ([binding]) => binding!.id
  );
  const routedInputActionIds = intent.connections.flatMap((connection) =>
    connection.direction === "input" ? [connection.port] : []
  );
  const activeActionIds = new Set(gameSpec.controls.map(({ action }) => action));
  const actionId = routedInputActionIds[0];
  if (
    routedInputActionIds.length !== 1 ||
    actionId === undefined ||
    !activeActionIds.has(actionId)
  ) {
    throw new TypeError(
      "Top-down generated mechanic evaluation requires exactly one trusted routed input action backed by an active Game Spec control."
    );
  }
  return Object.freeze(
    contract.scenarios.map((scenario) => {
      const scenarioActions = scenario.steps.flatMap((step) =>
        step.kind === "dispatch_action" ? [step.actionId] : []
      );
      if (scenarioActions.length !== 1 || scenarioActions[0] !== actionId) {
        throw new TypeError(
          `Top-down generated mechanic scenario "${scenario.id}" must dispatch trusted routed action "${actionId}" exactly once.`
        );
      }
      return Object.freeze({
        id: `external_${scenario.id}_referenced_entity_motion_changed`,
        scenarioId: scenario.id,
        observation: Object.freeze({
          kind: "referenced_entity_motion_changed" as const,
          bindingIds: Object.freeze(referencedBindingIds),
          actionId,
        }),
      });
    })
  );
}

function hasExactTrustedIntentLineage(
  contract: GeneratedMechanicContract,
  intent: MechanicIntent
): boolean {
  return (
    contract.intentLineage !== undefined &&
    JSON.stringify(contract.intentLineage) ===
      JSON.stringify({
        actors: intent.actors,
        targets: intent.targets,
        behaviors: intent.behaviors,
        stateChanges: intent.stateChanges,
        temporalRules: intent.temporalRules,
        spatialRules: intent.spatialRules,
        constraints: intent.constraints,
        connections: intent.connections,
        references: intent.references,
      })
  );
}

function createInitialVirtualEntityState(
  entity: TopDownGameSpec["entities"][number],
  index: number
): VirtualEntityState {
  return {
    active: true,
    kind: entity.role,
    name: entity.name,
    position: { x: 80 + index * 32, y: 80 + index * 24 },
    velocity: { x: 0, y: 0 },
  };
}

function createDeterministicAttemptCapabilityHost({
  contract,
  delegate,
  seed,
}: Readonly<{
  contract: GeneratedMechanicContract;
  delegate: MechanicExecutionRealmCapabilityHost;
  seed: number;
}>): MechanicExecutionRealmCapabilityHost {
  const granted = new Set(contract.capabilities);
  let simulationTimeMilliseconds = 0;
  let randomState = seed >>> 0;
  let scheduleSequence = 0;

  return Object.freeze({
    invoke(input) {
      if (!granted.has(input.capabilityId)) {
        throw new Error(
          `Mechanic capability "${input.capabilityId}" was not granted.`
        );
      }
      if (input.capabilityId === "time_read") {
        return { kind: "json", value: simulationTimeMilliseconds };
      }
      if (input.capabilityId === "random_next") {
        randomState ^= randomState << 13;
        randomState ^= randomState >>> 17;
        randomState ^= randomState << 5;
        return {
          kind: "json",
          value: (randomState >>> 0) / 0x1_0000_0000,
        };
      }
      if (input.capabilityId === "time_schedule") {
        const delay = input.arguments[0];
        const callbackId = input.arguments[1];
        if (
          typeof delay !== "number" ||
          !Number.isFinite(delay) ||
          delay < 0 ||
          typeof callbackId !== "string"
        ) {
          throw new TypeError(
            "Deterministic mechanic scheduling requires a nonnegative delay and callback ID."
          );
        }
        simulationTimeMilliseconds += 0;
        scheduleSequence += 1;
        return {
          kind: "json",
          value: `${contract.id}_schedule_${scheduleSequence}`,
        };
      }
      return delegate.invoke(input);
    },
  });
}

function readVirtualEntityProperty(
  state: VirtualEntityState,
  property: StableId
): JsonValue {
  if (
    !TOP_DOWN_GENERATED_MECHANIC_EVALUATION_PROPERTY_IDS.some(
      (propertyId) => propertyId === property
    )
  ) {
    throw new Error(
      `Generated mechanic evaluation property "${property}" is not exposed by the top-down host.`
    );
  }
  switch (property) {
    case "active":
      return state.active;
    case "kind":
    case "role":
      return state.kind;
    case "name":
      return state.name;
    case "position":
      return { ...state.position };
    case "velocity":
      return { ...state.velocity };
    case "position_x":
      return state.position.x;
    case "position_y":
      return state.position.y;
    case "velocity_x":
      return state.velocity.x;
    case "velocity_y":
      return state.velocity.y;
    default:
      throw new Error(
        `Generated mechanic evaluation property "${property}" is declared but not implemented by the top-down host.`
      );
  }
}

function requireJsonResult(
  result: Awaited<ReturnType<MechanicExecutionRealmCapabilityHost["invoke"]>>
): JsonValue {
  if (result.kind !== "json") {
    throw new TypeError("Generated mechanic state observation must be JSON.");
  }
  return result.value;
}
