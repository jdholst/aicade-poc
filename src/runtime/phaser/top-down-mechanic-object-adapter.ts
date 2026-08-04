import type { JsonValue, StableId } from "@/game-spec/game-spec-schema";
import {
  createMechanicObjectHost,
  type CreateMechanicObjectHostInput,
  type TrustedMechanicObjectAdapter,
} from "@/runtime/mechanics/mechanic-object-host";
import type {
  TopDownMechanicBody,
  TopDownMechanicEntityHandle,
  TopDownMechanicPoint,
} from "./top-down-mechanic-runtime";

export type TrustedTopDownPhaserMechanicBody = TopDownMechanicBody & {
  velocity?: TopDownMechanicPoint;
};

/**
 * Raw Phaser-shaped object. This type is trusted-adapter-only and must never be
 * exposed through the mechanic object host.
 */
export type TrustedTopDownPhaserMechanicObject = Omit<
  TopDownMechanicEntityHandle,
  "body"
> & {
  active?: boolean;
  body?: TrustedTopDownPhaserMechanicBody;
  destroy?: () => void;
};

export type TrustedTopDownPhaserOwnedMechanicObject =
  TrustedTopDownPhaserMechanicObject & {
    destroy: () => void;
  };

export type TrustedTopDownPhaserMechanicObjectRegistration = {
  id: StableId;
  kind: StableId;
  object: TrustedTopDownPhaserMechanicObject;
  observeProperties?: () => Record<string, JsonValue>;
};

export type TrustedTopDownPhaserOwnedObjectFactory = (input: {
  objectId: StableId;
  initial: JsonValue;
}) => {
  object: TrustedTopDownPhaserOwnedMechanicObject;
  observeProperties?: () => Record<string, JsonValue>;
};

export type CreateTrustedTopDownPhaserMechanicObjectAdapterInput = {
  objects: readonly TrustedTopDownPhaserMechanicObjectRegistration[];
  ownedObjectFactories: Readonly<
    Record<string, TrustedTopDownPhaserOwnedObjectFactory | undefined>
  >;
};

export type CreateTopDownPhaserMechanicObjectHostInput = Omit<
  CreateMechanicObjectHostInput,
  "adapter"
> &
  CreateTrustedTopDownPhaserMechanicObjectAdapterInput;

type RegisteredObject = Omit<
  TrustedTopDownPhaserMechanicObjectRegistration,
  "id"
> & {
  owned: boolean;
};

/**
 * Owns every raw Phaser reference on the trusted side of the mechanic host.
 * Observations and mutations are projected into the narrow host contract.
 */
export function createTrustedTopDownPhaserMechanicObjectAdapter({
  objects,
  ownedObjectFactories,
}: CreateTrustedTopDownPhaserMechanicObjectAdapterInput): TrustedMechanicObjectAdapter {
  const objectsById = new Map<StableId, RegisteredObject>();
  const ownedObjectFactoriesByKind = new Map(
    Object.entries(ownedObjectFactories)
  );

  for (const registration of objects) {
    if (objectsById.has(registration.id)) {
      throw new Error(
        `Top-down Phaser mechanic object "${registration.id}" was registered more than once.`
      );
    }

    objectsById.set(registration.id, {
      kind: registration.kind,
      object: registration.object,
      observeProperties: registration.observeProperties,
      owned: false,
    });
  }

  return {
    hasObject: (objectId) => objectsById.has(objectId),
    observeObject: (objectId) => {
      const registration = requireRegisteredObject(objectsById, objectId);
      const velocity = registration.object.body?.velocity;

      return {
        active: registration.object.active ?? true,
        kind: registration.kind,
        position: {
          x: registration.object.x,
          y: registration.object.y,
        },
        properties: registration.observeProperties?.() ?? {},
        velocity: {
          x: velocity?.x ?? 0,
          y: velocity?.y ?? 0,
        },
      };
    },
    writeMotion: (objectId, mutation) => {
      const { object } = requireRegisteredObject(objectsById, objectId);

      if (mutation.position) {
        if (!object.setPosition) {
          throw new Error(
            `Top-down Phaser mechanic object "${objectId}" cannot change position.`
          );
        }

        object.setPosition(mutation.position.x, mutation.position.y);
      }

      if (mutation.velocity) {
        if (!object.body?.setVelocity) {
          throw new Error(
            `Top-down Phaser mechanic object "${objectId}" cannot change velocity.`
          );
        }

        object.body.setVelocity(mutation.velocity.x, mutation.velocity.y);
      }
    },
    createOwnedObject: ({ objectId, objectKind, initial }) => {
      if (objectsById.has(objectId)) {
        throw new Error(
          `Top-down Phaser mechanic object "${objectId}" already exists.`
        );
      }

      const factory = ownedObjectFactoriesByKind.get(objectKind);

      if (!factory) {
        throw new Error(
          `Top-down Phaser mechanic object kind "${objectKind}" has no owned-object factory.`
        );
      }

      const ownedObject = factory({ objectId, initial });

      if (typeof ownedObject.object.destroy !== "function") {
        throw new Error(
          `Top-down Phaser mechanic object "${objectId}" must provide a destroy function.`
        );
      }

      objectsById.set(objectId, {
        kind: objectKind,
        object: ownedObject.object,
        observeProperties: ownedObject.observeProperties,
        owned: true,
      });
    },
    destroyOwnedObject: (objectId) => {
      const registration = objectsById.get(objectId);

      if (!registration) {
        return;
      }

      if (!registration.owned) {
        throw new Error(
          `Top-down Phaser mechanic object "${objectId}" is not mechanic-owned.`
        );
      }

      if (!registration.object.destroy) {
        throw new Error(
          `Top-down Phaser mechanic object "${objectId}" cannot be destroyed.`
        );
      }

      registration.object.destroy();
      objectsById.delete(objectId);
    },
  };
}

/** Creates the general mechanic object host over concrete top-down Phaser objects. */
export function createTopDownPhaserMechanicObjectHost({
  objects,
  ownedObjectFactories,
  ...hostInput
}: CreateTopDownPhaserMechanicObjectHostInput) {
  return createMechanicObjectHost({
    ...hostInput,
    adapter: createTrustedTopDownPhaserMechanicObjectAdapter({
      objects,
      ownedObjectFactories,
    }),
  });
}

function requireRegisteredObject(
  objectsById: ReadonlyMap<StableId, RegisteredObject>,
  objectId: StableId
) {
  const registration = objectsById.get(objectId);

  if (!registration) {
    throw new Error(`Top-down Phaser mechanic object "${objectId}" is unavailable.`);
  }

  return registration;
}
