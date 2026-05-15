(function () {
  const registry = globalThis.__AICADE_TOP_DOWN_MECHANICS__ || {};
  globalThis.__AICADE_TOP_DOWN_MECHANICS__ = registry;

  registry.install_enemy_chase = function installEnemyChase(context) {
    const chaser = context.createChaser();

    context.staticLayoutBodies.forEach(function (body) {
      context.scene.physics.add.collider(chaser, body);
    });

    context.scene.physics.add.overlap(
      context.getPlayer(),
      chaser,
      context.resetAfterChaserCatch
    );

    const configuredSpeed =
      context.mechanic &&
      context.mechanic.config &&
      typeof context.mechanic.config.speed === "number"
        ? context.mechanic.config.speed
        : 96;

    return {
      update() {
        const player = context.getPlayer();
        const activeChaser = context.getChaser();

        if (!player || !activeChaser) {
          return;
        }

        const velocity = context.getChaseVelocity(
          { x: activeChaser.x, y: activeChaser.y },
          { x: player.x, y: player.y },
          configuredSpeed
        );

        activeChaser.body.setVelocity(velocity.x, velocity.y);
      },
    };
  };
})();
