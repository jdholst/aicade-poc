(function () {
  const registry = globalThis.__AICADE_TOP_DOWN_MECHANICS__ || {};
  globalThis.__AICADE_TOP_DOWN_MECHANICS__ = registry;

  const PATH_CHECK_PADDING = 18;

  /**
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} vector
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} [fallback]
   */
  function normalizeVector(vector, fallback) {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);

    if (length <= 0) {
      return fallback || { x: 0, y: 0 };
    }

    return {
      x: vector.x / length,
      y: vector.y / length,
    };
  }

  /**
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} vector
   * @param {number} scale
   */
  function scaleVector(vector, scale) {
    return {
      x: vector.x * scale,
      y: vector.y * scale,
    };
  }

  /**
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} first
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} second
   */
  function dotVectors(first, second) {
    return first.x * second.x + first.y * second.y;
  }

  /**
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} first
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} second
   */
  function getDistanceSquared(first, second) {
    const dx = first.x - second.x;
    const dy = first.y - second.y;

    return dx * dx + dy * dy;
  }

  /**
   * @param {import("@/runtime/phaser").TopDownMechanicInstallerContext} context
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} from
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} to
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} direction
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} direct
   */
  function getChaseCandidateScore(context, from, to, direction, direct) {
    if (Math.abs(direct.y) < 0.2 && Math.abs(direction.y) < 0.2) {
      return -Infinity;
    }

    if (Math.abs(direct.x) < 0.2 && Math.abs(direction.x) < 0.2) {
      return -Infinity;
    }

    const probePoint = {
      x: from.x + direction.x * 48,
      y: from.y + direction.y * 48,
    };

    if (context.layout.isPointBlocked(probePoint, PATH_CHECK_PADDING)) {
      return -Infinity;
    }

    if (context.layout.isPathBlocked(from, probePoint, PATH_CHECK_PADDING)) {
      return -Infinity;
    }

    return (
      dotVectors(direction, direct) * 1000 -
      getDistanceSquared(probePoint, to) * 0.001
    );
  }

  /**
   * @param {import("@/runtime/phaser").TopDownMechanicInstallerContext} context
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} from
   * @param {import("@/runtime/phaser").TopDownMechanicPoint} to
   * @param {number} speed
   */
  function getChaseVelocity(context, from, to, speed) {
    const direct = normalizeVector({
      x: to.x - from.x,
      y: to.y - from.y,
    });

    if (!context.layout.isPathBlocked(from, to, PATH_CHECK_PADDING)) {
      return scaleVector(direct, speed);
    }

    const targetDirection = {
      x: Math.sign(to.x - from.x),
      y: Math.sign(to.y - from.y),
    };
    const candidates = [
      normalizeVector({ x: targetDirection.x, y: 0 }, direct),
      normalizeVector({ x: 0, y: targetDirection.y }, direct),
      normalizeVector(
        { x: direct.x - direct.y * 0.85, y: direct.y + direct.x * 0.85 },
        direct
      ),
      normalizeVector(
        { x: direct.x + direct.y * 0.85, y: direct.y - direct.x * 0.85 },
        direct
      ),
      normalizeVector({ x: -direct.y, y: direct.x }, direct),
      normalizeVector({ x: direct.y, y: -direct.x }, direct),
      direct,
    ];
    let bestCandidate = candidates[0];
    let bestScore = -Infinity;

    for (let index = 0; index < candidates.length; index += 1) {
      const score = getChaseCandidateScore(
        context,
        from,
        to,
        candidates[index],
        direct
      );

      if (score > bestScore) {
        bestCandidate = candidates[index];
        bestScore = score;
      }
    }

    return scaleVector(bestCandidate, speed);
  }

  /** @type {import("@/runtime/phaser").TopDownMechanicInstaller} */
  registry.install_enemy_chase = function installEnemyChase(context) {
    const enemyEntityId = context.entities.getTargetIdByRole(
      "enemy",
      "entity_enemy"
    );
    const playerEntityId = context.entities.getTargetIdByRole(
      "player",
      "entity_player"
    );
    const objectiveId = context.objective.getPrimaryId();
    const enemy = context.entities.createHandle(enemyEntityId, {
      kind: "circle",
      fallback: { x: 780, y: 405 },
      radius: 18,
      color: 0xa9482a,
      collideWorldBounds: true,
    });

    context.layout.staticBodies.forEach(function (body) {
      context.physics.addCollider(enemy, body);
    });

    const player = context.entities.getHandle(playerEntityId);

    if (player && enemy) {
      context.physics.addOverlap(player, enemy, function resetAfterCatch() {
        context.objective.reset(objectiveId);
        context.runtime.resetEntity(playerEntityId);
        context.runtime.resetEntity(enemyEntityId);
      });
    }

    const configuredSpeed =
      context.mechanic &&
      context.mechanic.config &&
      typeof context.mechanic.config.speed === "number"
        ? context.mechanic.config.speed
        : 96;

    return {
      update() {
        const player = context.entities.getHandle(playerEntityId);
        const activeEnemy = context.entities.getHandle(enemyEntityId);

        if (!player || !activeEnemy) {
          return;
        }

        const velocity = getChaseVelocity(
          context,
          { x: activeEnemy.x, y: activeEnemy.y },
          { x: player.x, y: player.y },
          configuredSpeed
        );

        activeEnemy.body.setVelocity(velocity.x, velocity.y);
      },
    };
  };
})();
