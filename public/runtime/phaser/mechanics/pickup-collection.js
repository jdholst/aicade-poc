(function () {
  const registry = globalThis.__AICADE_TOP_DOWN_MECHANICS__ || {};
  globalThis.__AICADE_TOP_DOWN_MECHANICS__ = registry;

  registry.install_pickup_collection = function installPickupCollection(context) {
    const objective = context.createObjective();
    context.scene.physics.add.overlap(
      context.getPlayer(),
      objective,
      context.collectObjective
    );

    return {};
  };
})();
