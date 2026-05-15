(function () {
  const registry = globalThis.__AICADE_TOP_DOWN_MECHANICS__ || {};
  globalThis.__AICADE_TOP_DOWN_MECHANICS__ = registry;

  registry.install_player_movement = function installPlayerMovement(context) {
    const cursors = context.scene.input.keyboard.createCursorKeys();
    const configuredSpeed =
      context.mechanic &&
      context.mechanic.config &&
      typeof context.mechanic.config.speed === "number"
        ? context.mechanic.config.speed
        : 220;

    return {
      update() {
        const player = context.getPlayer();

        if (!player) {
          return;
        }

        const PhaserRuntime = context.Phaser || globalThis.Phaser;
        const velocity = new PhaserRuntime.Math.Vector2(0, 0);

        if (cursors.left.isDown) {
          velocity.x -= 1;
        }
        if (cursors.right.isDown) {
          velocity.x += 1;
        }
        if (cursors.up.isDown) {
          velocity.y -= 1;
        }
        if (cursors.down.isDown) {
          velocity.y += 1;
        }

        velocity.normalize().scale(configuredSpeed);
        player.body.setVelocity(velocity.x, velocity.y);
      },
    };
  };
})();
