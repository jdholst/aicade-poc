import { z } from "zod";

import {
  jsonValueSchema,
  stableIdSchema,
  type JsonValue,
  type StableId,
} from "@/game-spec/game-spec-schema";

import type {
  MechanicExecutionRealmCapabilityArgument,
  MechanicExecutionRealmCapabilityResult,
} from "./mechanic-execution-realm";
import {
  createMechanicObjectHost,
  isMechanicObjectBindingAuthorityAuthentic,
  type MechanicMotionMutation,
  type MechanicObjectHandle,
  type MechanicSpatialQuery,
} from "./mechanic-object-host";

const mechanicSpatialQuerySchema = z
  .object({
    center: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
      })
      .strict(),
    radius: z.number().finite().nonnegative().max(1_000_000),
    active: z.boolean().optional(),
    objectKinds: z.array(stableIdSchema).min(1).max(32).optional(),
    ownership: z.enum(["any", "bound", "owned"]).optional(),
  })
  .strict();

export const MECHANIC_OBJECT_CAPABILITY_HOST_VERSION =
  "mechanic_object_capability_host/v1" as const;

export type MechanicObjectHost = ReturnType<typeof createMechanicObjectHost>;
export type MechanicObjectCapabilityHost = Readonly<{
  hostVersion: typeof MECHANIC_OBJECT_CAPABILITY_HOST_VERSION;
  invoke(input: {
    capabilityId: StableId;
    arguments: readonly MechanicExecutionRealmCapabilityArgument[];
  }): MechanicExecutionRealmCapabilityResult;
}>;

/**
 * Adapts the trusted object host to the execution realm's capability protocol.
 * The adapter only decodes arguments and shapes results; capability grants,
 * object ownership, quotas, and engine mutations remain owned by objectHost.
 */
export function createMechanicObjectCapabilityHost(
  objectHost: MechanicObjectHost
): MechanicObjectCapabilityHost {
  if (
    !isMechanicObjectBindingAuthorityAuthentic(objectHost.bindingAuthority)
  ) {
    throw new TypeError(
      "Mechanic object capability host requires an authentic object host."
    );
  }

  return Object.freeze({
    hostVersion: MECHANIC_OBJECT_CAPABILITY_HOST_VERSION,
    invoke: ({ capabilityId, arguments: capabilityArguments }) => {
      switch (capabilityId) {
        case "object_read": {
          requireArgumentCount(capabilityId, capabilityArguments, 1);
          const handle = requireHostHandle(
            objectHost,
            capabilityId,
            capabilityArguments[0]
          );
          const observation = objectHost.read(handle);
          return jsonResult({
            active: observation.active,
            kind: observation.kind,
            position: {
              x: observation.position.x,
              y: observation.position.y,
            },
            properties: observation.properties,
            velocity: {
              x: observation.velocity.x,
              y: observation.velocity.y,
            },
          });
        }
        case "object_motion_write": {
          requireArgumentCount(capabilityId, capabilityArguments, 2);
          const handle = requireHostHandle(
            objectHost,
            capabilityId,
            capabilityArguments[0]
          );
          const mutation = requireMotionMutation(
            capabilityId,
            capabilityArguments[1]
          );
          objectHost.writeMotion(handle, mutation);
          return jsonResult(null);
        }
        case "object_create": {
          requireArgumentCount(capabilityId, capabilityArguments, 2);
          const archetypeId = requireStableId(
            capabilityId,
            capabilityArguments[0]
          );
          const initial = requireJsonValue(
            capabilityId,
            capabilityArguments[1]
          );
          return Object.freeze({
            kind: "opaque_handle" as const,
            value: objectHost.create(archetypeId, initial),
          });
        }
        case "object_destroy": {
          requireArgumentCount(capabilityId, capabilityArguments, 1);
          const handle = requireHostHandle(
            objectHost,
            capabilityId,
            capabilityArguments[0]
          );
          objectHost.destroy(handle);
          return jsonResult(null);
        }
        case "spatial_query": {
          requireArgumentCount(capabilityId, capabilityArguments, 1);
          const query = requireSpatialQuery(
            capabilityId,
            capabilityArguments[0]
          );
          return Object.freeze({
            kind: "opaque_handles" as const,
            value: objectHost.querySpatial(query),
          });
        }
        default:
          throw new Error(
            `Mechanic object capability "${capabilityId}" is unsupported by this host.`
          );
      }
    },
  });
}

function requireSpatialQuery(
  capabilityId: StableId,
  value: unknown
): MechanicSpatialQuery {
  const parsed = mechanicSpatialQuerySchema.safeParse(value);
  if (!parsed.success) {
    throw new TypeError(
      `Mechanic object capability "${capabilityId}" requires a strict bounded spatial query.`
    );
  }
  return Object.freeze({
    ...parsed.data,
    center: Object.freeze(parsed.data.center),
    ...(parsed.data.objectKinds
      ? { objectKinds: Object.freeze([...parsed.data.objectKinds]) }
      : {}),
  });
}

function requireArgumentCount(
  capabilityId: StableId,
  capabilityArguments: readonly MechanicExecutionRealmCapabilityArgument[],
  expected: number
): void {
  if (capabilityArguments.length !== expected) {
    throw new TypeError(
      `Mechanic object capability "${capabilityId}" received ${capabilityArguments.length} argument${capabilityArguments.length === 1 ? "" : "s"}; expected ${expected}.`
    );
  }
}

function requireHostHandle(
  objectHost: MechanicObjectHost,
  capabilityId: StableId,
  value: unknown
): MechanicObjectHandle {
  if (
    typeof value !== "object" ||
    value === null ||
    objectHost.bindingAuthority.objectIdForHandle(
      value as MechanicObjectHandle
    ) === undefined
  ) {
    throw new TypeError(
      `Mechanic object capability "${capabilityId}" requires a handle issued by this object host.`
    );
  }
  return value as MechanicObjectHandle;
}

function requireStableId(capabilityId: StableId, value: unknown): StableId {
  const parsed = stableIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new TypeError(
      `Mechanic object capability "${capabilityId}" requires a stable archetype ID.`
    );
  }
  return parsed.data;
}

function requireJsonValue(capabilityId: StableId, value: unknown): JsonValue {
  let parsed: ReturnType<typeof jsonValueSchema.safeParse>;
  try {
    parsed = jsonValueSchema.safeParse(value);
  } catch {
    return invalidJsonValue(capabilityId);
  }
  if (!parsed.success) {
    return invalidJsonValue(capabilityId);
  }
  return parsed.data;
}

function invalidJsonValue(capabilityId: StableId): never {
  throw new TypeError(
    `Mechanic object capability "${capabilityId}" requires JSON-safe initial data.`
  );
}

function requireMotionMutation(
  capabilityId: StableId,
  value: unknown
): MechanicMotionMutation {
  if (!isPlainObject(value)) {
    return invalidMotionMutation(capabilityId);
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length === 0 ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        (key !== "position" && key !== "velocity")
    )
  ) {
    return invalidMotionMutation(capabilityId);
  }

  const hasPosition = Object.hasOwn(value, "position");
  const hasVelocity = Object.hasOwn(value, "velocity");
  const position =
    hasPosition ? requirePoint(capabilityId, value.position) : undefined;
  const velocity =
    hasVelocity ? requirePoint(capabilityId, value.velocity) : undefined;
  if (position === undefined && velocity === undefined) {
    return invalidMotionMutation(capabilityId);
  }

  return Object.freeze({
    ...(position ? { position } : {}),
    ...(velocity ? { velocity } : {}),
  });
}

function requirePoint(
  capabilityId: StableId,
  value: unknown
): Readonly<{ x: number; y: number }> {
  if (
    !isPlainObject(value) ||
    Reflect.ownKeys(value).length !== 2 ||
    !Object.hasOwn(value, "x") ||
    !Object.hasOwn(value, "y") ||
    typeof value.x !== "number" ||
    !Number.isFinite(value.x) ||
    typeof value.y !== "number" ||
    !Number.isFinite(value.y)
  ) {
    return invalidMotionMutation(capabilityId);
  }
  return Object.freeze({ x: value.x, y: value.y });
}

function invalidMotionMutation(capabilityId: StableId): never {
  throw new TypeError(
    `Mechanic object capability "${capabilityId}" requires a strict position or velocity mutation.`
  );
}

function jsonResult(value: JsonValue): MechanicExecutionRealmCapabilityResult {
  return Object.freeze({ kind: "json", value: freezeJson(value) });
}

function freezeJson<Value extends JsonValue>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      freezeJson(child);
    }
    Object.freeze(value);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
