import { describe, expect, it, vi } from "vitest";

import {
  MECHANIC_CAPABILITY_VERSION,
  mechanicCapabilityRegistry,
  type MechanicCapabilityGrant,
} from "@/game-spec/mechanics/mechanic-capability-registry";
import { createMechanicObjectHost } from "./mechanic-object-host";

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

describe("mechanic object host", () => {
  it("resolves a stable object binding without exposing the engine object", () => {
    const engineObject = {
      active: true,
      kind: "player",
      position: {
        x: 12,
        y: 24,
        rawEngine: { scene: "must-not-cross-the-boundary" },
      },
      velocity: {
        x: 0,
        y: 0,
        rawEngine: { body: "must-not-cross-the-boundary" },
      },
      properties: { team: "player" },
      rawEngine: { scene: "must-not-cross-the-boundary" },
    };
    const host = createMechanicObjectHost({
      mechanicId: "mechanic_alpha",
      grant: createGrant("object_read"),
      bindings: [
        {
          id: "player_binding",
          cardinality: "one",
          getObjectIds: () => ["player_entity"],
        },
      ],
      ownedObjectArchetypes: [],
      adapter: {
        hasObject: (objectId) => objectId === "player_entity",
        observeObject: () => engineObject,
      },
    });

    const firstHandle = host.resolveOne("player_binding");
    const secondHandle = host.resolveOne("player_binding");

    expect(firstHandle).toBe(secondHandle);
    expect(Object.keys(firstHandle)).toEqual([]);
    expect(Object.getPrototypeOf(firstHandle)).toBeNull();
    expect(host.read(firstHandle)).toEqual({
      active: true,
      kind: "player",
      position: { x: 12, y: 24 },
      velocity: { x: 0, y: 0 },
      properties: { team: "player" },
    });
    expect(host.read(firstHandle)).not.toHaveProperty("rawEngine");
    expect(Object.isFrozen(host.read(firstHandle))).toBe(true);
    expect(Object.isFrozen(host.read(firstHandle).position)).toBe(true);
    expect(Object.isFrozen(host.read(firstHandle).properties)).toBe(true);
  });

  it("resolves live collection bindings with deterministic membership", () => {
    const knownObjectIds = new Set([
      "enemy_alpha",
      "enemy_beta",
      "enemy_gamma",
    ]);
    let collectionObjectIds = ["enemy_beta", "enemy_alpha", "enemy_beta"];
    const host = createMechanicObjectHost({
      mechanicId: "mechanic_alpha",
      grant: createGrant(),
      bindings: [
        {
          id: "enemy_alpha_binding",
          cardinality: "one",
          getObjectIds: () => ["enemy_alpha"],
        },
        {
          id: "enemy_beta_binding",
          cardinality: "one",
          getObjectIds: () => ["enemy_beta"],
        },
        {
          id: "enemy_gamma_binding",
          cardinality: "one",
          getObjectIds: () => ["enemy_gamma"],
        },
        {
          id: "enemy_collection",
          cardinality: "many",
          getObjectIds: () => collectionObjectIds,
        },
      ],
      ownedObjectArchetypes: [],
      adapter: {
        hasObject: (objectId) => knownObjectIds.has(objectId),
        observeObject: () => ({
          active: true,
          kind: "enemy",
          position: { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          properties: {},
        }),
      },
    });
    const alpha = host.resolveOne("enemy_alpha_binding");
    const beta = host.resolveOne("enemy_beta_binding");
    const gamma = host.resolveOne("enemy_gamma_binding");

    expect(host.resolveMany("enemy_collection")).toEqual([alpha, beta]);

    collectionObjectIds = ["enemy_gamma", "enemy_alpha"];

    const updatedCollection = host.resolveMany("enemy_collection");
    expect(updatedCollection).toEqual([alpha, gamma]);
    expect(Object.isFrozen(updatedCollection)).toBe(true);
  });

  it("requires an admitted capability before applying a motion mutation", () => {
    const writeMotion = vi.fn();
    const createHost = (grant: MechanicCapabilityGrant) =>
      createMechanicObjectHost({
        mechanicId: "mechanic_alpha",
        grant,
        bindings: [
          {
            id: "player_binding",
            cardinality: "one",
            getObjectIds: () => ["player_entity"],
          },
        ],
        ownedObjectArchetypes: [],
        adapter: {
          hasObject: (objectId) => objectId === "player_entity",
          observeObject: () => ({
            active: true,
            kind: "player",
            position: { x: 12, y: 24 },
            velocity: { x: 0, y: 0 },
            properties: {},
          }),
          writeMotion,
        },
      });
    const deniedHost = createHost(createGrant());
    const deniedHandle = deniedHost.resolveOne("player_binding");

    expect(() =>
      deniedHost.writeMotion(deniedHandle, {
        velocity: { x: 80, y: -20 },
      })
    ).toThrow('Mechanic capability "object_motion_write" was not granted.');
    expect(writeMotion).not.toHaveBeenCalled();

    const admittedHost = createHost(createGrant("object_motion_write"));
    const admittedHandle = admittedHost.resolveOne("player_binding");
    admittedHost.writeMotion(admittedHandle, {
      position: { x: 50, y: 60 },
      velocity: { x: 80, y: -20 },
    });

    expect(writeMotion).toHaveBeenCalledWith("player_entity", {
      position: { x: 50, y: 60 },
      velocity: { x: 80, y: -20 },
    });
  });

  it("creates and accounts for objects from a declared archetype", () => {
    const objectKinds = new Map<string, string>();
    const createOwnedObject = vi.fn(
      ({ objectId, objectKind }: { objectId: string; objectKind: string }) => {
        objectKinds.set(objectId, objectKind);
      }
    );
    const host = createMechanicObjectHost({
      mechanicId: "mechanic_alpha",
      grant: createGrant("object_create"),
      bindings: [
        {
          id: "projectile_collection",
          cardinality: "many",
          getObjectIds: () =>
            [...objectKinds]
              .filter(([, kind]) => kind === "projectile")
              .map(([objectId]) => objectId),
        },
      ],
      ownedObjectArchetypes: [
        {
          id: "projectile_archetype",
          objectKind: "projectile",
          maximumInstances: 1,
        },
      ],
      adapter: {
        hasObject: (objectId) => objectKinds.has(objectId),
        observeObject: () => ({
          active: true,
          kind: "projectile",
          position: { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          properties: {},
        }),
        createOwnedObject,
        destroyOwnedObject: (objectId) => {
          objectKinds.delete(objectId);
        },
      },
    });

    const handle = host.create("projectile_archetype", {
      position: { x: 20, y: 30 },
    });

    expect(createOwnedObject).toHaveBeenCalledWith({
      objectId: "mechanic_alpha_owned_projectile_archetype_1",
      objectKind: "projectile",
      initial: { position: { x: 20, y: 30 } },
    });
    expect(host.getOwnedObjectCount()).toBe(1);
    expect(host.getOwnedObjectCount("projectile_archetype")).toBe(1);
    expect(host.resolveMany("projectile_collection")).toEqual([handle]);
    expect(() => host.create("projectile_archetype", {})).toThrow(
      'Mechanic-owned archetype "projectile_archetype" is limited to 1 instance.'
    );
    expect(createOwnedObject).toHaveBeenCalledTimes(1);
  });

  it("destroys owned objects and invalidates every handle when disposed", () => {
    const objectKinds = new Map<string, string>([["player_entity", "player"]]);
    const destroyOwnedObject = vi.fn((objectId: string) => {
      objectKinds.delete(objectId);
    });
    const host = createMechanicObjectHost({
      mechanicId: "mechanic_alpha",
      grant: createGrant("object_create", "object_destroy", "object_read"),
      bindings: [
        {
          id: "player_binding",
          cardinality: "one",
          getObjectIds: () => ["player_entity"],
        },
        {
          id: "projectile_collection",
          cardinality: "many",
          getObjectIds: () =>
            [...objectKinds]
              .filter(([, kind]) => kind === "projectile")
              .map(([objectId]) => objectId),
        },
      ],
      ownedObjectArchetypes: [
        {
          id: "projectile_archetype",
          objectKind: "projectile",
          maximumInstances: 2,
        },
      ],
      adapter: {
        hasObject: (objectId) => objectKinds.has(objectId),
        observeObject: (objectId) => ({
          active: true,
          kind: objectKinds.get(objectId) ?? "unknown",
          position: { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          properties: {},
        }),
        createOwnedObject: ({ objectId, objectKind }) => {
          objectKinds.set(objectId, objectKind);
        },
        destroyOwnedObject,
      },
    });
    const playerHandle = host.resolveOne("player_binding");
    const firstOwnedHandle = host.create("projectile_archetype", {});
    const secondOwnedHandle = host.create("projectile_archetype", {});

    host.destroy(firstOwnedHandle);

    expect(host.getOwnedObjectCount()).toBe(1);
    expect(host.resolveMany("projectile_collection")).toEqual([
      secondOwnedHandle,
    ]);
    expect(destroyOwnedObject).toHaveBeenCalledWith(
      "mechanic_alpha_owned_projectile_archetype_1"
    );

    host.dispose();
    host.dispose();

    expect(destroyOwnedObject).toHaveBeenCalledWith(
      "mechanic_alpha_owned_projectile_archetype_2"
    );
    expect(destroyOwnedObject).toHaveBeenCalledTimes(2);
    expect(objectKinds).toEqual(new Map([["player_entity", "player"]]));
    expect(() => host.read(playerHandle)).toThrow(
      "Mechanic object host has been disposed."
    );
    expect(() => host.resolveOne("player_binding")).toThrow(
      "Mechanic object host has been disposed."
    );
  });

  it("rejects an engine instance hidden inside observation properties", () => {
    class FakeEngineSprite {
      scene = { key: "game" };
    }

    const host = createMechanicObjectHost({
      mechanicId: "mechanic_alpha",
      grant: createGrant("object_read"),
      bindings: [
        {
          id: "player_binding",
          cardinality: "one",
          getObjectIds: () => ["player_entity"],
        },
      ],
      ownedObjectArchetypes: [],
      adapter: {
        hasObject: (objectId) => objectId === "player_entity",
        observeObject: () => ({
          active: true,
          kind: "player",
          position: { x: 12, y: 24 },
          velocity: { x: 0, y: 0 },
          properties: {
            engine: new FakeEngineSprite(),
          } as never,
        }),
      },
    });

    expect(() => host.read(host.resolveOne("player_binding"))).toThrow(
      "Mechanic object observations must contain only JSON-safe properties."
    );
  });

  it("rolls back an adapter object when post-create verification fails", () => {
    const adapterObjectIds = new Set<string>();
    const destroyOwnedObject = vi.fn((objectId: string) => {
      adapterObjectIds.delete(objectId);
    });
    const host = createMechanicObjectHost({
      mechanicId: "mechanic_alpha",
      grant: createGrant("object_create"),
      bindings: [],
      ownedObjectArchetypes: [
        {
          id: "projectile_archetype",
          objectKind: "projectile",
          maximumInstances: 1,
        },
      ],
      adapter: {
        createOwnedObject: ({ objectId }) => {
          adapterObjectIds.add(objectId);
        },
        destroyOwnedObject,
        hasObject: () => false,
        observeObject: () => {
          throw new Error("unreachable");
        },
      },
    });

    expect(() => host.create("projectile_archetype", {})).toThrow(
      'Mechanic object "mechanic_alpha_owned_projectile_archetype_1" is unavailable.'
    );
    expect(destroyOwnedObject).toHaveBeenCalledWith(
      "mechanic_alpha_owned_projectile_archetype_1"
    );
    expect(adapterObjectIds.size).toBe(0);
    expect(host.getOwnedObjectCount()).toBe(0);
  });

  it("retains a failed creation rollback so disposal can retry it", () => {
    const adapterObjectIds = new Set<string>();
    let cleanupAttempts = 0;
    const destroyOwnedObject = vi.fn((objectId: string) => {
      cleanupAttempts += 1;

      if (cleanupAttempts === 1) {
        throw new Error("temporary rollback failure");
      }

      adapterObjectIds.delete(objectId);
    });
    const host = createMechanicObjectHost({
      mechanicId: "mechanic_alpha",
      grant: createGrant("object_create"),
      bindings: [],
      ownedObjectArchetypes: [
        {
          id: "projectile_archetype",
          objectKind: "projectile",
          maximumInstances: 1,
        },
      ],
      adapter: {
        createOwnedObject: ({ objectId }) => {
          adapterObjectIds.add(objectId);
        },
        destroyOwnedObject,
        hasObject: () => false,
        observeObject: () => {
          throw new Error("unreachable");
        },
      },
    });

    expect(() => host.create("projectile_archetype", {})).toThrow(
      'Mechanic object "mechanic_alpha_owned_projectile_archetype_1" creation failed and rollback did not complete.'
    );
    expect(host.getOwnedObjectCount()).toBe(1);
    expect(adapterObjectIds.size).toBe(1);

    host.dispose();

    expect(destroyOwnedObject).toHaveBeenCalledTimes(2);
    expect(host.getOwnedObjectCount()).toBe(0);
    expect(adapterObjectIds.size).toBe(0);
  });

  it("retains failed cleanup ownership so disposal can be retried", () => {
    const adapterObjectIds = new Set<string>();
    let firstObjectCleanupAttempts = 0;
    const destroyOwnedObject = vi.fn((objectId: string) => {
      if (
        objectId === "mechanic_alpha_owned_projectile_archetype_1" &&
        firstObjectCleanupAttempts === 0
      ) {
        firstObjectCleanupAttempts += 1;
        throw new Error("temporary engine cleanup failure");
      }

      adapterObjectIds.delete(objectId);
    });
    const host = createMechanicObjectHost({
      mechanicId: "mechanic_alpha",
      grant: createGrant("object_create"),
      bindings: [],
      ownedObjectArchetypes: [
        {
          id: "projectile_archetype",
          objectKind: "projectile",
          maximumInstances: 2,
        },
      ],
      adapter: {
        createOwnedObject: ({ objectId }) => {
          adapterObjectIds.add(objectId);
        },
        destroyOwnedObject,
        hasObject: (objectId) => adapterObjectIds.has(objectId),
        observeObject: () => ({
          active: true,
          kind: "projectile",
          position: { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          properties: {},
        }),
      },
    });
    host.create("projectile_archetype", {});
    host.create("projectile_archetype", {});

    expect(() => host.dispose()).toThrow(
      "Mechanic object host disposal failed to clean up every owned object."
    );
    expect(host.getOwnedObjectCount()).toBe(1);
    expect(adapterObjectIds).toEqual(
      new Set(["mechanic_alpha_owned_projectile_archetype_1"])
    );

    host.dispose();
    host.dispose();

    expect(host.getOwnedObjectCount()).toBe(0);
    expect(adapterObjectIds.size).toBe(0);
    expect(destroyOwnedObject).toHaveBeenCalledTimes(3);
  });
});
