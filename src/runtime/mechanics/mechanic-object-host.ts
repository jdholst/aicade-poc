import type { JsonValue, StableId } from "@/game-spec/game-spec-schema";
import type { MechanicCapabilityGrant } from "@/game-spec/mechanics/mechanic-capability-registry";

const INVALID_OBSERVATION_PROPERTIES_MESSAGE =
  "Mechanic object observations must contain only JSON-safe properties.";
const INVALID_INITIAL_VALUE_MESSAGE =
  "Mechanic-owned object initial values must contain only JSON-safe data.";

declare const mechanicObjectHandleBrand: unique symbol;

export type MechanicObjectHandle = Readonly<{
  [mechanicObjectHandleBrand]: "MechanicObjectHandle";
}>;

export type MechanicObjectBindingAuthority = Readonly<{
  objectIdForHandle(handle: MechanicObjectHandle): StableId | undefined;
}>;

const authenticMechanicObjectBindingAuthorities = new WeakSet<object>();

export function isMechanicObjectBindingAuthorityAuthentic(
  value: unknown
): value is MechanicObjectBindingAuthority {
  return (
    typeof value === "object" &&
    value !== null &&
    authenticMechanicObjectBindingAuthorities.has(value)
  );
}

export type MechanicObjectPoint = Readonly<{
  x: number;
  y: number;
}>;

export type MechanicObjectObservation = Readonly<{
  active: boolean;
  kind: StableId;
  position: MechanicObjectPoint;
  properties: Readonly<Record<string, JsonValue>>;
  velocity: MechanicObjectPoint;
}>;

export type MechanicMotionMutation = Readonly<{
  position?: MechanicObjectPoint;
  velocity?: MechanicObjectPoint;
}>;

export type MechanicSpatialQuery = Readonly<{
  center: MechanicObjectPoint;
  radius: number;
  active?: boolean;
  objectKinds?: readonly StableId[];
  ownership?: "any" | "bound" | "owned";
}>;

export type TrustedMechanicObjectObservation = {
  active: boolean;
  kind: StableId;
  position: { x: number; y: number };
  properties: Record<string, JsonValue>;
  velocity: { x: number; y: number };
};

export type MechanicObjectBindingSource = {
  id: StableId;
  cardinality: "one" | "many";
  getObjectIds: () => readonly StableId[];
};

export type MechanicOwnedObjectArchetype = {
  id: StableId;
  maximumInstances: number;
  objectKind: StableId;
};

export type TrustedMechanicObjectAdapter = {
  createOwnedObject?: (input: {
    objectId: StableId;
    objectKind: StableId;
    initial: JsonValue;
  }) => void;
  destroyOwnedObject?: (objectId: StableId) => void;
  hasObject: (objectId: StableId) => boolean;
  observeObject: (objectId: StableId) => TrustedMechanicObjectObservation;
  writeMotion?: (objectId: StableId, mutation: MechanicMotionMutation) => void;
};

export type CreateMechanicObjectHostInput = {
  mechanicId: StableId;
  grant: MechanicCapabilityGrant;
  bindings: readonly MechanicObjectBindingSource[];
  ownedObjectArchetypes: readonly MechanicOwnedObjectArchetype[];
  adapter: TrustedMechanicObjectAdapter;
};

export function createMechanicObjectHost({
  mechanicId,
  grant,
  bindings,
  ownedObjectArchetypes,
  adapter,
}: CreateMechanicObjectHostInput) {
  const bindingsById = new Map(bindings.map((binding) => [binding.id, binding]));
  const archetypesById = new Map(
    ownedObjectArchetypes.map((archetype) => [archetype.id, archetype])
  );
  const handlesByObjectId = new Map<StableId, MechanicObjectHandle>();
  const objectIdsByHandle = new WeakMap<object, StableId>();
  const ownedObjectsById = new Map<
    StableId,
    { archetypeId: StableId; handle: MechanicObjectHandle }
  >();
  const bindingAuthority: MechanicObjectBindingAuthority = Object.freeze({
    objectIdForHandle: (handle: MechanicObjectHandle) =>
      objectIdsByHandle.get(handle),
  });
  authenticMechanicObjectBindingAuthorities.add(bindingAuthority);
  const grantedCapabilities = new Set(
    grant.capabilities.map((capability) => capability.id)
  );
  let nextOwnedObjectSequence = 1;
  let lifecycleState: "active" | "disposing" | "disposed" = "active";

  function createHandle(objectId: StableId) {
    const existingHandle = handlesByObjectId.get(objectId);

    if (existingHandle) {
      return existingHandle;
    }

    const handle = Object.freeze(Object.create(null)) as MechanicObjectHandle;
    handlesByObjectId.set(objectId, handle);
    objectIdsByHandle.set(handle, objectId);
    return handle;
  }

  function getHandle(objectId: StableId) {
    if (!adapter.hasObject(objectId)) {
      throw new Error(`Mechanic object "${objectId}" is unavailable.`);
    }

    return createHandle(objectId);
  }

  function resolveOne(bindingId: StableId) {
    requireActiveHost();
    const binding = getBinding(bindingId, "one");
    const objectIds = binding.getObjectIds();

    if (objectIds.length !== 1) {
      throw new Error(
        `Singular binding "${bindingId}" resolved ${objectIds.length} objects.`
      );
    }

    return getHandle(objectIds[0]);
  }

  function resolveMany(bindingId: StableId) {
    requireActiveHost();
    const binding = getBinding(bindingId, "many");
    const objectIds = [...new Set(binding.getObjectIds())].sort();

    return Object.freeze(objectIds.map(getHandle));
  }

  function read(handle: MechanicObjectHandle): MechanicObjectObservation {
    requireActiveHost();
    requireCapability("object_read");
    const objectId = requireObjectId(handle);

    const observation = adapter.observeObject(objectId);

    return Object.freeze({
      active: observation.active,
      kind: observation.kind,
      position: freezePoint(observation.position),
      properties: freezeJsonObject(
        observation.properties,
        INVALID_OBSERVATION_PROPERTIES_MESSAGE
      ),
      velocity: freezePoint(observation.velocity),
    });
  }

  function writeMotion(
    handle: MechanicObjectHandle,
    mutation: MechanicMotionMutation
  ) {
    requireActiveHost();
    requireCapability("object_motion_write");
    const objectId = requireObjectId(handle);

    if (!adapter.writeMotion) {
      throw new Error('Mechanic object adapter does not support "writeMotion".');
    }

    adapter.writeMotion(objectId, {
      ...(mutation.position
        ? { position: freezePoint(mutation.position) }
        : {}),
      ...(mutation.velocity
        ? { velocity: freezePoint(mutation.velocity) }
        : {}),
    });
  }

  function create(archetypeId: StableId, initial: JsonValue) {
    requireActiveHost();
    requireCapability("object_create");
    const archetype = archetypesById.get(archetypeId);

    if (!archetype) {
      throw new Error(
        `Mechanic-owned archetype "${archetypeId}" is undeclared.`
      );
    }

    const instanceCount = getOwnedObjectCount(archetypeId);

    if (instanceCount >= archetype.maximumInstances) {
      throw new Error(
        `Mechanic-owned archetype "${archetypeId}" is limited to ${archetype.maximumInstances} instance${archetype.maximumInstances === 1 ? "" : "s"}.`
      );
    }

    if (!adapter.createOwnedObject) {
      throw new Error(
        'Mechanic object adapter does not support "createOwnedObject".'
      );
    }

    if (!adapter.destroyOwnedObject) {
      throw new Error(
        'Mechanic object adapter does not support "destroyOwnedObject".'
      );
    }

    const frozenInitial = freezeJsonValue(initial, INVALID_INITIAL_VALUE_MESSAGE);
    let objectId: StableId;

    do {
      objectId = `${mechanicId}_owned_${archetypeId}_${nextOwnedObjectSequence}`;
      nextOwnedObjectSequence += 1;
    } while (adapter.hasObject(objectId));

    const handle = createHandle(objectId);
    ownedObjectsById.set(objectId, { archetypeId, handle });

    try {
      adapter.createOwnedObject({
        objectId,
        objectKind: archetype.objectKind,
        initial: frozenInitial,
      });

      if (!adapter.hasObject(objectId)) {
        throw new Error(`Mechanic object "${objectId}" is unavailable.`);
      }

      return handle;
    } catch (creationError) {
      const rollbackErrors: unknown[] = [creationError];

      try {
        adapter.destroyOwnedObject(objectId);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }

      if (rollbackErrors.length > 1) {
        throw new AggregateError(
          rollbackErrors,
          `Mechanic object "${objectId}" creation failed and rollback did not complete.`
        );
      }

      forgetOwnedObject(objectId, handle);
      throw creationError;
    }
  }

  function querySpatial(query: MechanicSpatialQuery) {
    requireActiveHost();
    requireCapability("spatial_query");
    const boundObjectIds = new Set(
      [...bindingsById.values()].flatMap((binding) => binding.getObjectIds())
    );
    const ownedObjectIds = new Set(ownedObjectsById.keys());
    const ownership = query.ownership ?? "any";
    const candidateObjectIds =
      ownership === "bound"
        ? boundObjectIds
        : ownership === "owned"
          ? ownedObjectIds
          : new Set([...boundObjectIds, ...ownedObjectIds]);
    const objectKinds = query.objectKinds
      ? new Set(query.objectKinds)
      : undefined;
    const maximumDistanceSquared = query.radius * query.radius;
    const matches: Array<{
      distanceSquared: number;
      objectId: StableId;
    }> = [];

    for (const objectId of candidateObjectIds) {
      if (!adapter.hasObject(objectId)) {
        continue;
      }
      const observation = adapter.observeObject(objectId);
      if (
        query.active !== undefined &&
        observation.active !== query.active
      ) {
        continue;
      }
      if (objectKinds && !objectKinds.has(observation.kind)) {
        continue;
      }
      const position = freezePoint(observation.position);
      const xDistance = position.x - query.center.x;
      const yDistance = position.y - query.center.y;
      const distanceSquared = xDistance * xDistance + yDistance * yDistance;
      if (distanceSquared <= maximumDistanceSquared) {
        matches.push({ distanceSquared, objectId });
      }
    }

    matches.sort((left, right) => {
      const distanceDifference =
        left.distanceSquared - right.distanceSquared;
      if (distanceDifference !== 0) {
        return distanceDifference;
      }
      return left.objectId < right.objectId
        ? -1
        : left.objectId > right.objectId
          ? 1
          : 0;
    });
    return Object.freeze(matches.map(({ objectId }) => getHandle(objectId)));
  }

  function destroy(handle: MechanicObjectHandle) {
    requireActiveHost();
    requireCapability("object_destroy");
    const objectId = requireObjectId(handle);

    if (!ownedObjectsById.has(objectId)) {
      throw new Error(
        "Only mechanic-owned objects can be destroyed through this host."
      );
    }

    removeOwnedObject(objectId);
  }

  function dispose() {
    if (lifecycleState === "disposed") {
      return;
    }

    lifecycleState = "disposing";
    bindingsById.clear();

    for (const [objectId, handle] of [...handlesByObjectId]) {
      if (!ownedObjectsById.has(objectId)) {
        forgetHandle(objectId, handle);
      }
    }

    const cleanupErrors: unknown[] = [];

    for (const objectId of [...ownedObjectsById.keys()]) {
      try {
        removeOwnedObject(objectId);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        "Mechanic object host disposal failed to clean up every owned object."
      );
    }

    handlesByObjectId.clear();
    ownedObjectsById.clear();
    archetypesById.clear();
    lifecycleState = "disposed";
  }

  function getOwnedObjectCount(archetypeId?: StableId) {
    if (!archetypeId) {
      return ownedObjectsById.size;
    }

    return [...ownedObjectsById.values()].filter(
      (ownedObject) => ownedObject.archetypeId === archetypeId
    ).length;
  }

  function getBinding(bindingId: StableId, cardinality: "one" | "many") {
    const binding = bindingsById.get(bindingId);

    if (!binding) {
      throw new Error(`Mechanic object binding "${bindingId}" is undeclared.`);
    }

    if (binding.cardinality !== cardinality) {
      throw new Error(
        `Mechanic object binding "${bindingId}" is ${binding.cardinality}, not ${cardinality}.`
      );
    }

    return binding;
  }

  function requireCapability(capabilityId: StableId) {
    if (!grantedCapabilities.has(capabilityId)) {
      throw new Error(`Mechanic capability "${capabilityId}" was not granted.`);
    }
  }

  function requireActiveHost() {
    if (lifecycleState !== "active") {
      throw new Error("Mechanic object host has been disposed.");
    }
  }

  function requireObjectId(handle: MechanicObjectHandle) {
    const objectId = objectIdsByHandle.get(handle);

    if (!objectId) {
      throw new Error("Mechanic object handle is not owned by this host.");
    }

    return objectId;
  }

  function removeOwnedObject(objectId: StableId) {
    if (!adapter.destroyOwnedObject) {
      throw new Error(
        'Mechanic object adapter does not support "destroyOwnedObject".'
      );
    }

    const ownedObject = ownedObjectsById.get(objectId);

    if (!ownedObject) {
      return;
    }

    adapter.destroyOwnedObject(objectId);
    forgetOwnedObject(objectId, ownedObject.handle);
  }

  function forgetOwnedObject(
    objectId: StableId,
    handle: MechanicObjectHandle
  ) {
    ownedObjectsById.delete(objectId);
    forgetHandle(objectId, handle);
  }

  function forgetHandle(objectId: StableId, handle: MechanicObjectHandle) {
    objectIdsByHandle.delete(handle);
    handlesByObjectId.delete(objectId);
  }

  return {
    bindingAuthority,
    create,
    destroy,
    dispose,
    getOwnedObjectCount,
    querySpatial,
    read,
    resolveMany,
    resolveOne,
    writeMotion,
  };
}

function freezePoint(point: MechanicObjectPoint): MechanicObjectPoint {
  return Object.freeze({ x: point.x, y: point.y });
}

function freezeJsonObject(
  value: unknown,
  invalidMessage: string
): Readonly<Record<string, JsonValue>> {
  if (!isPlainObject(value)) {
    throw new Error(invalidMessage);
  }

  return freezeJsonValue(value, invalidMessage) as Readonly<
    Record<string, JsonValue>
  >;
}

function freezeJsonValue(
  value: unknown,
  invalidMessage: string,
  ancestors = new WeakSet<object>()
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(invalidMessage);
    }

    return value;
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new Error(invalidMessage);
    }

    ancestors.add(value);
    const result = Object.freeze(
      value.map((item) => freezeJsonValue(item, invalidMessage, ancestors))
    ) as JsonValue;
    ancestors.delete(value);
    return result;
  }

  if (!isPlainObject(value) || ancestors.has(value)) {
    throw new Error(invalidMessage);
  }

  ancestors.add(value);
  const result = Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (
          key === "__proto__" ||
          key === "constructor" ||
          key === "prototype"
        ) {
          throw new Error(invalidMessage);
        }

        return [key, freezeJsonValue(item, invalidMessage, ancestors)];
      })
    )
  );
  ancestors.delete(value);
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
