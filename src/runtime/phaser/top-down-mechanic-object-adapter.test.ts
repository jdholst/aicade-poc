import { describe, expect, it, vi } from "vitest";

import {
  MECHANIC_CAPABILITY_VERSION,
  mechanicCapabilityRegistry,
  type MechanicCapabilityGrant,
} from "@/game-spec/mechanics/mechanic-capability-registry";
import { createTopDownPhaserMechanicObjectHost } from "./top-down-mechanic-object-adapter";

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

describe("top-down Phaser mechanic object adapter", () => {
  it("hosts real engine-shaped objects without exposing their references", () => {
    const setPosition = vi.fn();
    const setVelocity = vi.fn();
    const playerObject = {
      active: true,
      body: {
        setVelocity,
        velocity: { x: 2, y: -3 },
        world: { name: "must-not-cross-the-boundary" },
      },
      scene: { key: "must-not-cross-the-boundary" },
      setPosition,
      x: 12,
      y: 24,
    };
    const projectileObjectIds = new Set<string>();
    const destroyProjectile = vi.fn((objectId: string) => {
      projectileObjectIds.delete(objectId);
    });
    const createProjectile = vi.fn(
      ({ objectId }: { objectId: string }) => {
        projectileObjectIds.add(objectId);

        return {
          object: {
            active: true,
            body: {
              setVelocity: vi.fn(),
              velocity: { x: 0, y: 0 },
            },
            destroy: () => destroyProjectile(objectId),
            setPosition: vi.fn(),
            x: 40,
            y: 50,
          },
          observeProperties: () => ({ damage: 1 }),
        };
      }
    );
    const host = createTopDownPhaserMechanicObjectHost({
      mechanicId: "mechanic_alpha",
      grant: createGrant(
        "object_create",
        "object_motion_write",
        "object_read"
      ),
      bindings: [
        {
          id: "player_binding",
          cardinality: "one",
          getObjectIds: () => ["player_entity"],
        },
        {
          id: "projectile_collection",
          cardinality: "many",
          getObjectIds: () => [...projectileObjectIds],
        },
      ],
      ownedObjectArchetypes: [
        {
          id: "projectile_archetype",
          objectKind: "projectile",
          maximumInstances: 2,
        },
      ],
      objects: [
        {
          id: "player_entity",
          kind: "player",
          object: playerObject,
          observeProperties: () => ({ team: "player" }),
        },
      ],
      ownedObjectFactories: {
        projectile: createProjectile,
      },
    });

    const playerHandle = host.resolveOne("player_binding");

    expect(host.read(playerHandle)).toEqual({
      active: true,
      kind: "player",
      position: { x: 12, y: 24 },
      properties: { team: "player" },
      velocity: { x: 2, y: -3 },
    });
    expect(JSON.stringify(host.read(playerHandle))).not.toContain("scene");
    expect(JSON.stringify(host.read(playerHandle))).not.toContain("world");

    host.writeMotion(playerHandle, {
      position: { x: 20, y: 30 },
      velocity: { x: 80, y: -20 },
    });

    expect(setPosition).toHaveBeenCalledWith(20, 30);
    expect(setVelocity).toHaveBeenCalledWith(80, -20);

    const projectileHandle = host.create("projectile_archetype", {
      position: { x: 40, y: 50 },
    });

    expect(createProjectile).toHaveBeenCalledWith({
      objectId: "mechanic_alpha_owned_projectile_archetype_1",
      initial: { position: { x: 40, y: 50 } },
    });
    expect(host.resolveMany("projectile_collection")).toEqual([
      projectileHandle,
    ]);
    expect(host.read(projectileHandle)).toMatchObject({
      kind: "projectile",
      properties: { damage: 1 },
    });

    host.dispose();

    expect(destroyProjectile).toHaveBeenCalledWith(
      "mechanic_alpha_owned_projectile_archetype_1"
    );
    expect(projectileObjectIds.size).toBe(0);
  });

  it("skips an occupied stable ID without misclassifying or destroying it", () => {
    const destroyStableObject = vi.fn();
    const destroyOwnedObject = vi.fn();
    const createOwnedObject = vi.fn(() => ({
      object: {
        active: true,
        destroy: destroyOwnedObject,
        x: 0,
        y: 0,
      },
    }));
    const host = createTopDownPhaserMechanicObjectHost({
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
      objects: [
        {
          id: "mechanic_alpha_owned_projectile_archetype_1",
          kind: "stable_fixture",
          object: {
            active: true,
            destroy: destroyStableObject,
            x: 10,
            y: 10,
          },
        },
      ],
      ownedObjectFactories: {
        projectile: createOwnedObject,
      },
    });

    host.create("projectile_archetype", {});

    expect(createOwnedObject).toHaveBeenCalledWith({
      objectId: "mechanic_alpha_owned_projectile_archetype_2",
      initial: {},
    });
    expect(host.getOwnedObjectCount()).toBe(1);

    host.dispose();

    expect(destroyOwnedObject).toHaveBeenCalledTimes(1);
    expect(destroyStableObject).not.toHaveBeenCalled();
  });

  it("rejects owned objects that cannot be cleaned up", () => {
    const host = createTopDownPhaserMechanicObjectHost({
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
      objects: [],
      ownedObjectFactories: {
        projectile: () =>
          ({
            object: { active: true, x: 0, y: 0 },
          }) as never,
      },
    });

    expect(() => host.create("projectile_archetype", {})).toThrow(
      'Top-down Phaser mechanic object "mechanic_alpha_owned_projectile_archetype_1" must provide a destroy function.'
    );
    expect(host.getOwnedObjectCount()).toBe(0);
  });

  it("does not admit an inherited owned-object factory", () => {
    const inheritedFactory = vi.fn();
    const ownedObjectFactories = Object.create({
      projectile: inheritedFactory,
    }) as Record<string, typeof inheritedFactory>;
    const host = createTopDownPhaserMechanicObjectHost({
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
      objects: [],
      ownedObjectFactories,
    });

    expect(() => host.create("projectile_archetype", {})).toThrow(
      'Top-down Phaser mechanic object kind "projectile" has no owned-object factory.'
    );
    expect(inheritedFactory).not.toHaveBeenCalled();
    expect(host.getOwnedObjectCount()).toBe(0);
  });
});
