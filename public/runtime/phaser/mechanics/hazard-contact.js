(function () {
  const registry = globalThis.__AICADE_TOP_DOWN_MECHANICS__ || {};
  globalThis.__AICADE_TOP_DOWN_MECHANICS__ = registry;

  /**
   * @param {import("@/runtime/phaser").TopDownMechanicInstallerContext} context
   * @param {import("@/runtime/phaser").TopDownMechanicEntity["role"]} role
   */
  function findTargetEntityByRole(context, role) {
    const targetIds =
      context.mechanic && Array.isArray(context.mechanic.targetIds)
        ? context.mechanic.targetIds
        : [];

    for (let index = 0; index < targetIds.length; index += 1) {
      const entity = context.entities.findById(targetIds[index]);

      if (entity && entity.role === role) {
        return entity;
      }
    }

    return context.entities.findByRole(role);
  }

  /** @param {import("@/runtime/phaser").TopDownMechanicInstallerContext} context */
  function getPrimaryObjectiveId(context) {
    const objectiveIds =
      context.mechanic && Array.isArray(context.mechanic.objectiveIds)
        ? context.mechanic.objectiveIds
        : [];

    return objectiveIds[0] || "objective_primary";
  }

  /** @type {import("@/runtime/phaser").TopDownMechanicInstaller} */
  registry.install_hazard_contact = function installHazardContact(context) {
    const hazardEntity = findTargetEntityByRole(context, "hazard");
    const playerEntity = findTargetEntityByRole(context, "player");
    const hazardEntityId =
      hazardEntity && hazardEntity.id ? hazardEntity.id : "entity_hazard";
    const playerEntityId =
      playerEntity && playerEntity.id ? playerEntity.id : "entity_player";
    const objectiveId = getPrimaryObjectiveId(context);
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
