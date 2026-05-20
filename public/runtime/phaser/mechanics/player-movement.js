(function () {
  const registry = globalThis.__AICADE_TOP_DOWN_MECHANICS__ || {};
  globalThis.__AICADE_TOP_DOWN_MECHANICS__ = registry;

  /** @type {import("@/runtime/phaser").TopDownMechanicInstaller} */
  registry.install_player_movement = function installPlayerMovement(context) {
    const cursors = context.input.createCursorKeys();
    const playerEntityId = context.entities.getTargetIdByRole(
      "player",
      "entity_player"
    );
    const configuredSpeed =
      context.mechanic &&
      context.mechanic.config &&
      typeof context.mechanic.config.speed === "number"
        ? context.mechanic.config.speed
        : 220;

    return {
      update() {
        const player = context.entities.getHandle(playerEntityId);

        if (!player) {
          return;
        }

        const direction = { x: 0, y: 0 };

        if (cursors.left.isDown) {
          direction.x -= 1;
        }
        if (cursors.right.isDown) {
          direction.x += 1;
        }
        if (cursors.up.isDown) {
          direction.y -= 1;
        }
        if (cursors.down.isDown) {
          direction.y += 1;
        }

        const velocity = context.math.scaleVector(
          context.math.normalizeVector(direction),
          configuredSpeed
        );

        player.body.setVelocity(velocity.x, velocity.y);
      },
    };
  };
})();
