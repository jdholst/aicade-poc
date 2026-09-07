import { describe, expect, it, vi } from "vitest";

import type { JsonValue, StableId } from "@/game-spec/game-spec-schema";
import {
  MECHANIC_CAPABILITY_VERSION,
  mechanicCapabilityRegistry,
  type MechanicCapabilityGrant,
} from "@/game-spec/mechanics/mechanic-capability-registry";
import type {
  MechanicExecutionRealmCapabilityArgument,
  MechanicExecutionRealmCapabilityHost,
  MechanicExecutionRealmCapabilityResult,
} from "./mechanic-execution-realm";
import {
  createMechanicObjectHost,
  type TrustedMechanicObjectObservation,
} from "./mechanic-object-host";
import { createMechanicObjectCapabilityHost } from "./mechanic-object-capability-host";

describe("createMechanicObjectCapabilityHost", () => {
  it("returns a JSON-safe observation for a handle issued by the wrapped host", () => {
    const fixture = createFixture();
    const handle = fixture.objectHost.resolveOne("actor_binding");

    expect(fixture.capabilityHost.hostVersion).toBe(
      "mechanic_object_capability_host/v1"
    );
    const result = invoke(fixture.capabilityHost, "object_read", [handle]);

    expect(result).toEqual({
      kind: "json",
      value: {
        active: true,
        kind: "actor",
        position: { x: 1, y: 2 },
        properties: { team: "blue" },
        velocity: { x: 3, y: 4 },
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(
      Object.isFrozen((result as { kind: "json"; value: object }).value)
    ).toBe(true);
  });

  it("validates and dispatches bounded motion mutations", () => {
    const fixture = createFixture();
    const handle = fixture.objectHost.resolveOne("actor_binding");

    expect(
      invoke(fixture.capabilityHost, "object_motion_write", [
        handle,
        { position: { x: 8, y: 9 }, velocity: { x: -1, y: 0 } },
      ])
    ).toEqual({ kind: "json", value: null });
    expect(fixture.writeMotion).toHaveBeenCalledWith("actor_entity", {
      position: { x: 8, y: 9 },
      velocity: { x: -1, y: 0 },
    });
  });

  it("returns an opaque handle for create and accepts only that host's owned handle for destroy", () => {
    const fixture = createFixture();

    const created = invoke(fixture.capabilityHost, "object_create", [
      "generic_marker",
      { strength: 2 },
    ]);

    expect(created.kind).toBe("opaque_handle");
    if (created.kind !== "opaque_handle") {
      throw new Error("Expected an opaque handle result.");
    }
    expect(
      fixture.objectHost.bindingAuthority.objectIdForHandle(created.value)
    ).toBe("generic_mechanic_owned_generic_marker_1");
    expect(fixture.createOwnedObject).toHaveBeenCalledWith({
      objectId: "generic_mechanic_owned_generic_marker_1",
      objectKind: "marker",
      initial: { strength: 2 },
    });

    expect(
      invoke(fixture.capabilityHost, "object_destroy", [created.value])
    ).toEqual({ kind: "json", value: null });
    expect(fixture.destroyOwnedObject).toHaveBeenCalledWith(
      "generic_mechanic_owned_generic_marker_1"
    );
  });

  it("returns deterministic opaque handles for bounded spatial queries over exposed objects", () => {
    const fixture = createFixture();
    const actorHandle = fixture.objectHost.resolveOne("actor_binding");
    const created = invoke(fixture.capabilityHost, "object_create", [
      "generic_marker",
      { strength: 2 },
    ]);
    if (created.kind !== "opaque_handle") {
      throw new Error("Expected an opaque handle result.");
    }

    expect(
      invoke(fixture.capabilityHost, "spatial_query", [
        {
          center: { x: 0, y: 0 },
          radius: 3,
          active: true,
          ownership: "any",
        },
      ])
    ).toEqual({
      kind: "opaque_handles",
      value: [created.value, actorHandle],
    });
    expect(
      invoke(fixture.capabilityHost, "spatial_query", [
        {
          center: { x: 0, y: 0 },
          radius: 0,
          objectKinds: ["marker"],
          ownership: "owned",
        },
      ])
    ).toEqual({ kind: "opaque_handles", value: [created.value] });

    invoke(fixture.capabilityHost, "object_destroy", [created.value]);

    expect(
      invoke(fixture.capabilityHost, "spatial_query", [
        {
          center: { x: 0, y: 0 },
          radius: 3,
          ownership: "owned",
        },
      ])
    ).toEqual({ kind: "opaque_handles", value: [] });
  });

  it.each([
    ["object_read", []],
    ["object_read", [{}, {}]],
    ["object_motion_write", [{}]],
    ["object_motion_write", [{}, {}, {}]],
    ["object_create", ["generic_marker"]],
    ["object_create", ["generic_marker", {}, null]],
    ["object_destroy", []],
    ["object_destroy", [{}, {}]],
    ["spatial_query", []],
    ["spatial_query", [{}, {}]],
  ] as const)("rejects the wrong argument count for %s", (capabilityId, args) => {
    const fixture = createFixture();

    expect(() => invoke(fixture.capabilityHost, capabilityId, args)).toThrow(
      `Mechanic object capability "${capabilityId}" received ${args.length} argument`
    );
  });

  it("rejects structural and foreign handles before invoking the object host", () => {
    const fixture = createFixture();
    const foreignFixture = createFixture();
    const foreignHandle =
      foreignFixture.objectHost.resolveOne("actor_binding");

    expect(() =>
      invoke(fixture.capabilityHost, "object_read", [{}])
    ).toThrow(
      'Mechanic object capability "object_read" requires a handle issued by this object host.'
    );
    expect(() =>
      invoke(fixture.capabilityHost, "object_motion_write", [
        foreignHandle,
        { position: { x: 0, y: 0 } },
      ])
    ).toThrow(
      'Mechanic object capability "object_motion_write" requires a handle issued by this object host.'
    );
  });

  it.each([
    null,
    [],
    {},
    { position: { x: 1 } },
    { velocity: { x: 0, y: Number.NaN } },
    { position: undefined, velocity: { x: 0, y: 0 } },
    { position: { x: 0, y: 0 }, extra: true },
  ])("rejects an invalid motion mutation %#", (motion) => {
    const fixture = createFixture();
    const handle = fixture.objectHost.resolveOne("actor_binding");

    expect(() =>
      invoke(fixture.capabilityHost, "object_motion_write", [handle, motion])
    ).toThrow(
      'Mechanic object capability "object_motion_write" requires a strict position or velocity mutation.'
    );
    expect(fixture.writeMotion).not.toHaveBeenCalled();
  });

  it("rejects invalid archetype IDs and non-JSON create input", () => {
    const fixture = createFixture();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() =>
      invoke(fixture.capabilityHost, "object_create", ["Not Stable", {}])
    ).toThrow(
      'Mechanic object capability "object_create" requires a stable archetype ID.'
    );
    expect(() =>
      invoke(fixture.capabilityHost, "object_create", [
        "generic_marker",
        { invalid: Number.NaN },
      ])
    ).toThrow(
      'Mechanic object capability "object_create" requires JSON-safe initial data.'
    );
    expect(() =>
      invoke(fixture.capabilityHost, "object_create", [
        "generic_marker",
        cyclic,
      ])
    ).toThrow(
      'Mechanic object capability "object_create" requires JSON-safe initial data.'
    );
    expect(fixture.createOwnedObject).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    {},
    { center: { x: 0 }, radius: 1 },
    { center: { x: 0, y: 0 }, radius: -1 },
    { center: { x: 0, y: 0 }, radius: Number.NaN },
    { center: { x: 0, y: 0 }, radius: 1, ownership: "foreign" },
    { center: { x: 0, y: 0 }, radius: 1, objectKinds: ["Not Stable"] },
    { center: { x: 0, y: 0 }, radius: 1, extra: true },
  ])("rejects an invalid spatial query %#", (query) => {
    const fixture = createFixture();

    expect(() =>
      invoke(fixture.capabilityHost, "spatial_query", [query])
    ).toThrow(
      'Mechanic object capability "spatial_query" requires a strict bounded spatial query.'
    );
  });

  it.each(["state_read"])(
    "fails closed for unsupported capability %s",
    (capabilityId) => {
      const fixture = createFixture();

      expect(() => invoke(fixture.capabilityHost, capabilityId, [])).toThrow(
        `Mechanic object capability "${capabilityId}" is unsupported by this host.`
      );
    }
  );

  it("rejects a structurally forged object host", () => {
    expect(() =>
      createMechanicObjectCapabilityHost({
        bindingAuthority: { objectIdForHandle: () => "forged_object" },
      } as never)
    ).toThrow(
      "Mechanic object capability host requires an authentic object host."
    );
  });
});

function createFixture() {
  const objects = new Map<StableId, TrustedMechanicObjectObservation>([
    [
      "actor_entity",
      {
        active: true,
        kind: "actor",
        position: { x: 1, y: 2 },
        properties: { team: "blue" },
        velocity: { x: 3, y: 4 },
      },
    ],
  ]);
  const createOwnedObject = vi.fn(
    ({
      objectId,
      objectKind,
      initial,
    }: {
      objectId: StableId;
      objectKind: StableId;
      initial: JsonValue;
    }) => {
      objects.set(objectId, {
        active: true,
        kind: objectKind,
        position: { x: 0, y: 0 },
        properties: { initial },
        velocity: { x: 0, y: 0 },
      });
    }
  );
  const destroyOwnedObject = vi.fn((objectId: StableId) => {
    objects.delete(objectId);
  });
  const writeMotion = vi.fn(
    (
      objectId: StableId,
      mutation: {
        position?: Readonly<{ x: number; y: number }>;
        velocity?: Readonly<{ x: number; y: number }>;
      }
    ) => {
      const current = objects.get(objectId);
      if (!current) {
        throw new Error(`Unknown test object ${objectId}.`);
      }
      objects.set(objectId, {
        ...current,
        ...(mutation.position ? { position: mutation.position } : {}),
        ...(mutation.velocity ? { velocity: mutation.velocity } : {}),
      });
    }
  );
  const objectHost = createMechanicObjectHost({
    mechanicId: "generic_mechanic",
    grant: createGrant(
      "object_read",
      "object_motion_write",
      "object_create",
      "object_destroy",
      "spatial_query"
    ),
    bindings: [
      {
        id: "actor_binding",
        cardinality: "one",
        getObjectIds: () => ["actor_entity"],
      },
    ],
    ownedObjectArchetypes: [
      {
        id: "generic_marker",
        maximumInstances: 2,
        objectKind: "marker",
      },
    ],
    adapter: {
      createOwnedObject,
      destroyOwnedObject,
      hasObject: (objectId) => objects.has(objectId),
      observeObject: (objectId) => {
        const observation = objects.get(objectId);
        if (!observation) {
          throw new Error(`Unknown test object ${objectId}.`);
        }
        return observation;
      },
      writeMotion,
    },
  });

  return {
    objectHost,
    capabilityHost: createMechanicObjectCapabilityHost(objectHost),
    createOwnedObject,
    destroyOwnedObject,
    writeMotion,
  };
}

function createGrant(
  ...capabilityIds: MechanicCapabilityGrant["capabilities"][number]["id"][]
): MechanicCapabilityGrant {
  return {
    capabilityVersion: MECHANIC_CAPABILITY_VERSION,
    capabilities: mechanicCapabilityRegistry.capabilities
      .filter(({ id }) => capabilityIds.includes(id))
      .map((capability) => ({
        ...capability,
        justification: {
          kind: "contract_declaration" as const,
          path: "capabilities",
        },
      })),
  };
}

function invoke(
  host: MechanicExecutionRealmCapabilityHost,
  capabilityId: string,
  args: readonly unknown[]
): MechanicExecutionRealmCapabilityResult {
  return host.invoke({
    capabilityId: capabilityId as StableId,
    arguments: args as readonly MechanicExecutionRealmCapabilityArgument[],
  }) as MechanicExecutionRealmCapabilityResult;
}
