(function () {
  const registry = globalThis.__AICADE_TOP_DOWN_MECHANICS__ || {};
  globalThis.__AICADE_TOP_DOWN_MECHANICS__ = registry;

  /** @type {import("@/runtime/phaser").TopDownMechanicInstaller} */
  registry.install_hazard_contact = function installHazardContact(context) {
    const hazardEntityId = context.entities.getTargetIdByRole(
      "hazard",
      "entity_hazard"
    );
    const playerEntityId = context.entities.getTargetIdByRole(
      "player",
      "entity_player"
    );
    const objectiveId = context.objective.getPrimaryId();
    const hazard = context.entities.createHandle(hazardEntityId, {
      kind: "circle",
      fallback: { x: 500, y: 120 },
      radius: 16,
      color: 0xd83b5f,
      allowGravity: false,
    });
    const player = context.entities.getHandle(playerEntityId);

    context.layout.staticBodies.forEach(function (body) {
      context.physics.addCollider(hazard, body);
    });

    if (player && hazard) {
      context.physics.addOverlap(player, hazard, function resetAfterHazardContact() {
        context.objective.reset(objectiveId);
        context.runtime.resetEntity(playerEntityId);
      });
    }

    return {};
  };
})();
