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
import {
  createMechanicObjectCapabilityHost,
  type MechanicObjectCapabilityHost,
  type MechanicObjectHost,
} from "@/runtime/mechanics/mechanic-object-capability-host";
import type {
  MechanicObjectBindingAuthority,
  MechanicObjectHandle,
} from "@/runtime/mechanics/mechanic-object-host";
import { createMechanicPrivateStateHost } from "@/runtime/mechanics/mechanic-private-state";
import {
  createTopDownPhaserMechanicObjectHost,
  type TrustedTopDownPhaserMechanicObject,
  type TrustedTopDownPhaserOwnedObjectFactory,
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
  readOwnedObjectActivity(archetypeId: StableId): Promise<OwnedObjectActivity>;
  readEmittedOutputs(portId: StableId): Promise<readonly JsonValue[]>;
}>;

type OwnedObjectActivity = Readonly<{
  active: number;
  created: number;
  destroyed: number;
  simulatedDistanceTraveled: number;
  targetInteractions: number;
}>;

export type GeneratedMechanicBrowserExecutionFixture = Readonly<{
  bindings: readonly MechanicExecutionRealmBinding[];
  bindingAuthority: MechanicObjectBindingAuthority;
  capabilityHost: MechanicExecutionRealmCapabilityHost;
  observations: FixtureObservations;
  advanceSimulation(milliseconds: number): Promise<void>;
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
    ownedObjectArchetypes: contract.ownedObjects,
    objects,
    ownedObjectFactories: createVirtualOwnedObjectFactories(
      contract,
      virtualEntities,
      defaultOwnedObjectPosition(gameSpec)
    ),
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
  const objectActivity = createOwnedObjectActivityTracker({
    contract,
    gameSpec,
    objectHost,
    virtualEntities,
  });
  const stateAndObjectHost = privateState.createCapabilityHost(
    objectActivity.wrap(objectCapabilityHost)
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
      countOwnedObjects: async (archetypeId: StableId) =>
        objectHost.getOwnedObjectCount(archetypeId),
      readOwnedObjectActivity: async (archetypeId: StableId) =>
        objectActivity.read(archetypeId),
      readEmittedOutputs: async () => Object.freeze([]),
    } satisfies FixtureObservations),
    async advanceSimulation(milliseconds) {
      objectActivity.advance(milliseconds);
    },
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

function createOwnedObjectActivityTracker({
  contract,
  gameSpec,
  objectHost,
  virtualEntities,
}: Readonly<{
  contract: GeneratedMechanicContract;
  gameSpec: TopDownGameSpec;
  objectHost: MechanicObjectHost;
  virtualEntities: Map<StableId, VirtualEntityState>;
}>) {
  const activityByArchetype = new Map<
    StableId,
    {
      active: number;
      created: number;
      destroyed: number;
      simulatedDistanceTraveled: number;
      targetInteractions: number;
    }
  >(
    contract.ownedObjects.map(({ id }) => [
      id,
      {
        active: 0,
        created: 0,
        destroyed: 0,
        simulatedDistanceTraveled: 0,
        targetInteractions: 0,
      },
    ])
  );
  const archetypeByHandle = new WeakMap<object, StableId>();
  const archetypeByObjectId = new Map<StableId, StableId>();
  const pendingArchetypesByTargetId = new Map<StableId, Set<StableId>>();
  const targetObjectIds = exactTargetObjectIds(contract, gameSpec);

  return Object.freeze({
    wrap(delegate: MechanicObjectCapabilityHost): MechanicExecutionRealmCapabilityHost {
      return Object.freeze({
        invoke(input) {
          const archetypeId =
            input.capabilityId === "object_create" &&
            typeof input.arguments[0] === "string"
              ? input.arguments[0]
              : undefined;
          const ownedHandle =
            typeof input.arguments[0] === "object" &&
            input.arguments[0] !== null
              ? input.arguments[0]
              : undefined;
          const ownedArchetypeId = ownedHandle
            ? archetypeByHandle.get(ownedHandle)
            : undefined;
          const objectId = ownedHandle
            ? objectHost.bindingAuthority.objectIdForHandle(
                ownedHandle as MechanicObjectHandle
              )
            : undefined;
          const beforeMotion = objectId
            ? snapshotVirtualMotion(virtualEntities.get(objectId))
            : undefined;
          const result = delegate.invoke(input);
          if (
            input.capabilityId === "object_create" &&
            archetypeId &&
            result.kind === "opaque_handle"
          ) {
            const activity = activityByArchetype.get(archetypeId);
            if (activity) {
              activity.created += 1;
              activity.active += 1;
              archetypeByHandle.set(result.value, archetypeId);
              const createdObjectId =
                objectHost.bindingAuthority.objectIdForHandle(result.value);
              if (createdObjectId) {
                archetypeByObjectId.set(createdObjectId, archetypeId);
              }
            }
          } else if (input.capabilityId === "object_motion_write" && objectId) {
            const afterMotion = snapshotVirtualMotion(
              virtualEntities.get(objectId)
            );
            if (
              targetObjectIds.has(objectId) &&
              beforeMotion &&
              afterMotion &&
              !sameVirtualMotion(beforeMotion, afterMotion)
            ) {
              for (const pendingArchetypeId of
                pendingArchetypesByTargetId.get(objectId) ?? []) {
                activityByArchetype.get(pendingArchetypeId)!.targetInteractions +=
                  1;
              }
              pendingArchetypesByTargetId.delete(objectId);
            }
          } else if (
            input.capabilityId === "object_destroy" &&
            ownedArchetypeId
          ) {
            const activity = activityByArchetype.get(ownedArchetypeId)!;
            activity.destroyed += 1;
            activity.active -= 1;
            if (objectId) {
              archetypeByObjectId.delete(objectId);
            }
          } else if (
            input.capabilityId === "spatial_query" &&
            result.kind === "opaque_handles"
          ) {
            recordSpatialTargetMatches({
              input: input.arguments[0],
              resultHandles: result.value,
              objectHost,
              virtualEntities,
              archetypeByObjectId,
              targetObjectIds,
              pendingArchetypesByTargetId,
            });
          }
          return result;
        },
      });
    },
    advance(milliseconds: number) {
      const elapsedSeconds = milliseconds / 1000;
      for (const [objectId, state] of virtualEntities) {
        if (!state.active) {
          continue;
        }
        const xDistance = state.velocity.x * elapsedSeconds;
        const yDistance = state.velocity.y * elapsedSeconds;
        if (xDistance === 0 && yDistance === 0) {
          continue;
        }
        state.position = {
          x: state.position.x + xDistance,
          y: state.position.y + yDistance,
        };
        const archetypeId = archetypeByObjectId.get(objectId);
        if (archetypeId) {
          activityByArchetype.get(
            archetypeId
          )!.simulatedDistanceTraveled += Math.hypot(xDistance, yDistance);
        }
      }
    },
    read(archetypeId: StableId): OwnedObjectActivity {
      const activity = activityByArchetype.get(archetypeId);
      if (!activity) {
        throw new Error(
          `Generated mechanic evaluation archetype "${archetypeId}" is undeclared.`
        );
      }
      return Object.freeze({ ...activity });
    },
  });
}

function exactTargetObjectIds(
  contract: GeneratedMechanicContract,
  gameSpec: TopDownGameSpec
): ReadonlySet<StableId> {
  const targetRoles = new Set(contract.intentLineage?.targets ?? []);
  const entitiesById = new Map(
    gameSpec.entities.map((entity) => [entity.id, entity] as const)
  );
  return new Set(
    (contract.intentLineage?.references ?? []).flatMap((reference) => {
      if (reference.kind !== "entity") {
        return [];
      }
      const entity = entitiesById.get(reference.id);
      return entity && targetRoles.has(entity.role) ? [entity.id] : [];
    })
  );
}

function recordSpatialTargetMatches({
  input,
  resultHandles,
  objectHost,
  virtualEntities,
  archetypeByObjectId,
  targetObjectIds,
  pendingArchetypesByTargetId,
}: Readonly<{
  input: unknown;
  resultHandles: readonly MechanicObjectHandle[];
  objectHost: MechanicObjectHost;
  virtualEntities: ReadonlyMap<StableId, VirtualEntityState>;
  archetypeByObjectId: ReadonlyMap<StableId, StableId>;
  targetObjectIds: ReadonlySet<StableId>;
  pendingArchetypesByTargetId: Map<StableId, Set<StableId>>;
}>): void {
  const query = jsonObject(input as JsonValue);
  const center = jsonPoint(query?.center);
  const radius = query?.radius;
  if (!center || typeof radius !== "number") {
    return;
  }
  const matchedTargetIds = resultHandles.flatMap((handle) => {
    const objectId = objectHost.bindingAuthority.objectIdForHandle(handle);
    return objectId && targetObjectIds.has(objectId) ? [objectId] : [];
  });
  if (matchedTargetIds.length === 0) {
    return;
  }
  for (const [ownedObjectId, archetypeId] of archetypeByObjectId) {
    const state = virtualEntities.get(ownedObjectId);
    if (
      !state?.active ||
      pointDistance(state.position, center) > radius
    ) {
      continue;
    }
    for (const targetObjectId of matchedTargetIds) {
      const pending = pendingArchetypesByTargetId.get(targetObjectId) ?? new Set();
      pending.add(archetypeId);
      pendingArchetypesByTargetId.set(targetObjectId, pending);
    }
  }
}

function snapshotVirtualMotion(state: VirtualEntityState | undefined) {
  return state
    ? {
        position: { ...state.position },
        velocity: { ...state.velocity },
      }
    : undefined;
}

function sameVirtualMotion(
  left: NonNullable<ReturnType<typeof snapshotVirtualMotion>>,
  right: NonNullable<ReturnType<typeof snapshotVirtualMotion>>
): boolean {
  return (
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.velocity.x === right.velocity.x &&
    left.velocity.y === right.velocity.y
  );
}

function pointDistance(
  left: Readonly<{ x: number; y: number }>,
  right: Readonly<{ x: number; y: number }>
): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function createVirtualOwnedObjectFactories(
  contract: GeneratedMechanicContract,
  virtualEntities: Map<StableId, VirtualEntityState>,
  defaultPosition: Readonly<{ x: number; y: number }>
): Readonly<Record<string, TrustedTopDownPhaserOwnedObjectFactory>> {
  const factories = Object.create(null) as Record<
    string,
    TrustedTopDownPhaserOwnedObjectFactory
  >;
  for (const { objectKind } of contract.ownedObjects) {
    if (Object.prototype.hasOwnProperty.call(factories, objectKind)) {
      continue;
    }
    factories[objectKind] = ({ objectId, initial }) => {
      const initialRecord = jsonObject(initial);
      const state: VirtualEntityState = {
        active: true,
        kind: objectKind,
        name: objectId,
        position: boundedJsonPoint(
          initialRecord?.position,
          defaultPosition,
          1_000_000
        ),
        velocity: boundedJsonPoint(initialRecord?.velocity, { x: 0, y: 0 }, 2_000),
      };
      const properties = jsonObject(initialRecord?.properties) ?? {};
      virtualEntities.set(objectId, state);
      let destroyed = false;
      return {
        object: {
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
          destroy() {
            if (destroyed) {
              return;
            }
            destroyed = true;
            state.active = false;
            virtualEntities.delete(objectId);
          },
        },
        observeProperties: () => ({ ...properties }),
      };
    };
  }
  return Object.freeze(factories);
}

function defaultOwnedObjectPosition(
  gameSpec: TopDownGameSpec
): Readonly<{ x: number; y: number }> {
  const arena = gameSpec.template.config.scenes[0]?.arena;
  return arena
    ? { x: arena.width / 2, y: arena.height / 2 }
    : { x: 0, y: 0 };
}

function jsonObject(
  value: JsonValue | undefined
): Readonly<Record<string, JsonValue>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : undefined;
}

function jsonPoint(
  value: JsonValue | undefined
): { x: number; y: number } | undefined {
  const record = jsonObject(value);
  return record &&
    typeof record.x === "number" &&
    Number.isFinite(record.x) &&
    typeof record.y === "number" &&
    Number.isFinite(record.y)
    ? { x: record.x, y: record.y }
    : undefined;
}

function boundedJsonPoint(
  value: JsonValue | undefined,
  fallback: Readonly<{ x: number; y: number }>,
  absoluteLimit: number
): { x: number; y: number } {
  const point = jsonPoint(value);
  return point
    ? {
        x: Math.min(absoluteLimit, Math.max(-absoluteLimit, point.x)),
        y: Math.min(absoluteLimit, Math.max(-absoluteLimit, point.y)),
      }
    : { ...fallback };
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
        advanceSimulation: fixture.advanceSimulation,
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
  const requiresTransientLifecycle =
    requiresTransientOwnedObjectLifecycle(intent, contract);
  const evidenceRoles = new Set(
    requiresTransientLifecycle && intent.targets.length > 0
      ? intent.targets
      : intent.actors
  );
  const referencedEvidenceEntityIds = intent.references.flatMap((reference) => {
    if (reference.kind !== "entity") {
      return [];
    }
    const entity = activeEntitiesById.get(reference.id);
    return entity && evidenceRoles.has(entity.role) ? [entity.id] : [];
  });
  const representedEvidenceRoles = new Set(
    referencedEvidenceEntityIds.map(
      (entityId) => activeEntitiesById.get(entityId)!.role
    )
  );
  const bindingsByReferencedEntity = referencedEvidenceEntityIds.map((entityId) =>
    contract.bindings.filter(
      (binding) =>
        binding.referenceKind === "entity" &&
        binding.cardinality === "one" &&
        binding.objectIds.length === 1 &&
        binding.objectIds[0] === entityId
    )
  );
  if (
    evidenceRoles.size === 0 ||
    representedEvidenceRoles.size !== evidenceRoles.size ||
    referencedEvidenceEntityIds.length === 0 ||
    new Set(referencedEvidenceEntityIds).size !==
      referencedEvidenceEntityIds.length ||
    bindingsByReferencedEntity.some((bindings) => bindings.length !== 1)
  ) {
    throw new TypeError(
      "Top-down generated mechanic evaluation requires exactly one single-entity binding for every trusted actor-role entity reference."
    );
  }
  const referencedBindingIds = bindingsByReferencedEntity.map(
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
    contract.scenarios.map((scenario): ExternalAcceptanceObservation => {
      const scenarioActions = scenario.steps.flatMap((step) =>
        step.kind === "dispatch_action" ? [step.actionId] : []
      );
      if (scenarioActions.length !== 1 || scenarioActions[0] !== actionId) {
        throw new TypeError(
          `Top-down generated mechanic scenario "${scenario.id}" must dispatch trusted routed action "${actionId}" exactly once.`
        );
      }
      return requiresTransientLifecycle
        ? Object.freeze({
            id: `external_${scenario.id}_owned_object_lifecycle_after_action`,
            scenarioId: scenario.id,
            observation: Object.freeze({
              kind: "owned_object_lifecycle_after_action" as const,
              archetypeIds: Object.freeze(
                contract.ownedObjects.map(({ id }) => id)
              ),
              actionId,
              ...(intent.targets.length > 0
                ? { requireTargetInteraction: true as const }
                : {}),
            }),
          })
        : Object.freeze({
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

function requiresTransientOwnedObjectLifecycle(
  intent: MechanicIntent,
  contract: GeneratedMechanicContract
): boolean {
  const requiredCapabilities = new Set(intent.requiredCapabilities);
  const declaredCapabilities = new Set(contract.capabilities);
  return (
    intent.ownedObjects.length > 0 &&
    contract.ownedObjects.length > 0 &&
    [
      "object_create",
      "object_motion_write",
      "object_destroy",
    ].every(
      (capabilityId) =>
        requiredCapabilities.has(capabilityId) &&
        declaredCapabilities.has(capabilityId)
    )
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
