(function () {
  const registry = globalThis.__AICADE_TOP_DOWN_MECHANICS__ || {};
  globalThis.__AICADE_TOP_DOWN_MECHANICS__ = registry;

  const PICKUP_SPAWN_PADDING = 24;

  /** @type {import("@/runtime/phaser").TopDownMechanicInstaller} */
  registry.install_pickup_collection = function installPickupCollection(context) {
    const playerEntityId = context.entities.getTargetIdByRole(
      "player",
      "entity_player"
    );
    const pickupEntityId = context.entities.getTargetIdByRole(
      "pickup",
      "entity_pickup"
    );
    const objectiveId = context.objective.getPrimaryId();
    const pickup = context.entities.createHandle(pickupEntityId, {
      kind: "star",
      point: context.layout.findPickupPoint({
        padding: PICKUP_SPAWN_PADDING,
      }),
      points: 5,
      innerRadius: 10,
      outerRadius: 22,
      color: 0xf6c46b,
      allowGravity: false,
    });
    const player = context.entities.getHandle(playerEntityId);

    if (player && pickup) {
      context.physics.addOverlap(player, pickup, function collectPickup() {
        context.objective.increment(objectiveId, 1);

        const viewport = context.runtime.getViewport();
        const nextPoint = context.layout.findPickupPoint({
          fallback: {
            x: context.math.randomBetween(96, viewport.width - 96),
            y: context.math.randomBetween(96, viewport.height - 96),
          },
          padding: PICKUP_SPAWN_PADDING,
        });

        pickup.setPosition(nextPoint.x, nextPoint.y);
      });
    }

    return {};
  };
})();
