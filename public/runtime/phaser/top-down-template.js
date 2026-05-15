(function () {
  const template = globalThis.__AICADE_PHASER_TEMPLATE__ || {};
  const gameSpec = template.gameSpec || {};
  const topDownScene =
    gameSpec.template &&
    gameSpec.template.config &&
    Array.isArray(gameSpec.template.config.scenes)
      ? gameSpec.template.config.scenes[0]
      : null;
  const layout = topDownScene && topDownScene.layout ? topDownScene.layout : {};
  const arena =
    topDownScene && topDownScene.arena
      ? topDownScene.arena
      : { width: 960, height: 540 };
  const primaryObjective =
    Array.isArray(gameSpec.objectives) &&
    gameSpec.objectives.find(function (objective) {
      return objective.primary;
    });
  const rawViewport = template.viewport || {};
  const viewport = {
    width:
      typeof rawViewport.width === "number"
        ? Math.max(1, Math.round(rawViewport.width))
        : Math.max(1, Math.round(arena.width || 960)),
    height:
      typeof rawViewport.height === "number"
        ? Math.max(1, Math.round(rawViewport.height))
        : Math.max(1, Math.round(arena.height || 540)),
    scaling: "stretch_to_fill",
  };
  const SCENE_KEY = "top-down-chase";
  const objectiveLabel =
    primaryObjective && primaryObjective.label
      ? primaryObjective.label
      : "Collect crystals";
  const activeMechanics = Array.isArray(gameSpec.mechanics)
    ? gameSpec.mechanics
    : [];
  const runtimeInstallerKeys = template.mechanicInstallerKeys || {};
  const PICKUP_SPAWN_PADDING = 24;
  const PATH_CHECK_PADDING = 18;
  let game = null;
  let activeScene = null;
  let installedMechanics = [];
  let player = null;
  let objective = null;
  let chaser = null;
  let scoreText = null;
  let score = 0;
  let isPaused = false;
  let playerStart = { x: 160, y: 270 };
  let chaserStart = { x: 780, y: 405 };

  function notify(type, payload) {
    parent.postMessage(Object.assign({ type }, payload || {}), "*");
  }

  function getErrorMessage(error) {
    return error && error.message ? error.message : String(error);
  }

  function reportMechanicFailure(mechanic, phase, error) {
    notify("game-error", {
      message:
        "Mechanic " +
        mechanic.id +
        " " +
        phase +
        " failed: " +
        getErrorMessage(error),
    });
  }

  function findEntityByRole(role) {
    if (!Array.isArray(gameSpec.entities)) {
      return null;
    }

    return (
      gameSpec.entities.find(function (entity) {
        return entity.role === role;
      }) || null
    );
  }

  function findZoneForEntity(entityId) {
    if (!entityId || !Array.isArray(layout.spawnZones)) {
      return null;
    }

    return (
      layout.spawnZones.find(function (zone) {
        return (
          Array.isArray(zone.entityIds) && zone.entityIds.indexOf(entityId) >= 0
        );
      }) || null
    );
  }

  function getZoneCenter(zone, fallback) {
    if (!zone) {
      return fallback;
    }

    return {
      x: zone.x + zone.width / 2,
      y: zone.y + zone.height / 2,
    };
  }

  function isPointInsideRect(point, rect, padding) {
    return (
      point.x >= rect.x - padding &&
      point.x <= rect.x + rect.width + padding &&
      point.y >= rect.y - padding &&
      point.y <= rect.y + rect.height + padding
    );
  }

  function isPointInsideCircle(point, circle, padding) {
    const radius = circle.radius + padding;
    const dx = point.x - circle.x;
    const dy = point.y - circle.y;

    return dx * dx + dy * dy <= radius * radius;
  }

  function isPointBlockedByLayout(point, padding) {
    const walls = Array.isArray(layout.walls) ? layout.walls : [];
    const obstacles = Array.isArray(layout.obstacles) ? layout.obstacles : [];

    return walls.concat(obstacles).some(function (shape) {
      if (shape.shape === "circle") {
        return isPointInsideCircle(point, shape, padding);
      }

      return isPointInsideRect(point, shape, padding);
    });
  }

  function isPathBlockedByLayout(start, end, padding) {
    for (let step = 1; step <= 12; step += 1) {
      const t = step / 12;
      const point = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };

      if (isPointBlockedByLayout(point, padding)) {
        return true;
      }
    }

    return false;
  }

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

  function scaleVector(vector, scale) {
    return {
      x: vector.x * scale,
      y: vector.y * scale,
    };
  }

  function dotVectors(first, second) {
    return first.x * second.x + first.y * second.y;
  }

  function getDistanceSquared(first, second) {
    const dx = first.x - second.x;
    const dy = first.y - second.y;

    return dx * dx + dy * dy;
  }

  function getChaseCandidateScore(from, to, direction, direct) {
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

    if (isPointBlockedByLayout(probePoint, PATH_CHECK_PADDING)) {
      return -Infinity;
    }

    if (isPathBlockedByLayout(from, probePoint, PATH_CHECK_PADDING)) {
      return -Infinity;
    }

    return (
      dotVectors(direction, direct) * 1000 -
      getDistanceSquared(probePoint, to) * 0.001
    );
  }

  function getChaseVelocity(from, to, speed) {
    const direct = normalizeVector({
      x: to.x - from.x,
      y: to.y - from.y,
    });

    if (!isPathBlockedByLayout(from, to, PATH_CHECK_PADDING)) {
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
      const score = getChaseCandidateScore(from, to, candidates[index], direct);

      if (score > bestScore) {
        bestCandidate = candidates[index];
        bestScore = score;
      }
    }

    return scaleVector(bestCandidate, speed);
  }

  function getZoneSampleBounds(zone, padding) {
    const minX = zone.x + padding;
    const maxX = zone.x + zone.width - padding;
    const minY = zone.y + padding;
    const maxY = zone.y + zone.height - padding;

    if (minX > maxX || minY > maxY) {
      const center = getZoneCenter(zone, { x: zone.x, y: zone.y });

      return {
        maxX: center.x,
        maxY: center.y,
        minX: center.x,
        minY: center.y,
      };
    }

    return { maxX, maxY, minX, minY };
  }

  function findFirstOpenPointInZone(zone, fallback, padding) {
    const bounds = getZoneSampleBounds(zone, padding);

    for (let yIndex = 0; yIndex <= 4; yIndex += 1) {
      for (let xIndex = 0; xIndex <= 4; xIndex += 1) {
        const point = {
          x: bounds.minX + ((bounds.maxX - bounds.minX) * xIndex) / 4,
          y: bounds.minY + ((bounds.maxY - bounds.minY) * yIndex) / 4,
        };

        if (!isPointBlockedByLayout(point, padding)) {
          return point;
        }
      }
    }

    return fallback;
  }

  function getRandomPointInZone(zone, fallback, padding) {
    if (!zone || !globalThis.Phaser) {
      return fallback;
    }

    const bounds = getZoneSampleBounds(zone, padding);

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const point = {
        x: Phaser.Math.Between(bounds.minX, bounds.maxX),
        y: Phaser.Math.Between(bounds.minY, bounds.maxY),
      };

      if (!isPointBlockedByLayout(point, padding)) {
        return point;
      }
    }

    return findFirstOpenPointInZone(zone, fallback, padding);
  }

  function findFirstPickupZone() {
    return Array.isArray(layout.pickupZones) && layout.pickupZones.length > 0
      ? layout.pickupZones[0]
      : null;
  }

  function findActiveMechanic(type) {
    return (
      activeMechanics.find(function (mechanic) {
        return mechanic.type === type;
      }) || null
    );
  }

  function createWall(scene, wall) {
    const wallBody = scene.add.rectangle(
      wall.x + wall.width / 2,
      wall.y + wall.height / 2,
      wall.width,
      wall.height,
      0x263746
    );
    scene.physics.add.existing(wallBody, true);
    return wallBody;
  }

  function createObstacle(scene, obstacle) {
    const obstacleBody =
      obstacle.shape === "circle"
        ? scene.add.circle(obstacle.x, obstacle.y, obstacle.radius, 0x375064)
        : scene.add.rectangle(
            obstacle.x + obstacle.width / 2,
            obstacle.y + obstacle.height / 2,
            obstacle.width,
            obstacle.height,
            0x375064
          );
    scene.physics.add.existing(obstacleBody, true);
    return obstacleBody;
  }

  function createLayoutBodies(scene) {
    const staticBodies = [];

    if (Array.isArray(layout.walls)) {
      layout.walls.forEach(function (wall) {
        staticBodies.push(createWall(scene, wall));
      });
    }

    if (Array.isArray(layout.obstacles)) {
      layout.obstacles.forEach(function (obstacle) {
        staticBodies.push(createObstacle(scene, obstacle));
      });
    }

    return staticBodies;
  }

  function createPlayer(scene) {
    const playerEntity = findEntityByRole("player");
    playerStart = getZoneCenter(
      findZoneForEntity(playerEntity && playerEntity.id),
      playerStart
    );
    player = scene.add.rectangle(playerStart.x, playerStart.y, 34, 34, 0x6ee7b7);
    scene.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);
    return player;
  }

  function createObjective(scene) {
    const pickupZone = findFirstPickupZone();
    const objectiveStart = getRandomPointInZone(
      pickupZone,
      getZoneCenter(pickupZone, {
        x: viewport.width - 180,
        y: 150,
      }),
      PICKUP_SPAWN_PADDING
    );
    objective = scene.add.star(objectiveStart.x, objectiveStart.y, 5, 10, 22, 0xf6c46b);
    scene.physics.add.existing(objective);
    objective.body.setAllowGravity(false);
    return objective;
  }

  function createChaser(scene) {
    const enemyEntity = findEntityByRole("enemy");
    chaserStart = getZoneCenter(
      findZoneForEntity(enemyEntity && enemyEntity.id),
      chaserStart
    );
    chaser = scene.add.circle(chaserStart.x, chaserStart.y, 18, 0xa9482a);
    scene.physics.add.existing(chaser);
    chaser.body.setCollideWorldBounds(true);
    return chaser;
  }

  function collectObjective() {
    score += 1;
    scoreText.setText(objectiveLabel + ": " + score);
    const nextPoint = getRandomPointInZone(findFirstPickupZone(), {
      x: Phaser.Math.Between(96, viewport.width - 96),
      y: Phaser.Math.Between(96, viewport.height - 96),
    }, PICKUP_SPAWN_PADDING);
    objective.setPosition(nextPoint.x, nextPoint.y);
  }

  function resetAfterChaserCatch() {
    score = 0;
    scoreText.setText(objectiveLabel + ": 0");
    player.setPosition(playerStart.x, playerStart.y);
    chaser.setPosition(chaserStart.x, chaserStart.y);
  }

  function installActiveMechanic(scene, type, contextExtras) {
    const mechanic = findActiveMechanic(type);

    if (!mechanic) {
      return null;
    }

    const installerKey = runtimeInstallerKeys[mechanic.type];
    const runtimeMechanicInstallers =
      globalThis.__AICADE_TOP_DOWN_MECHANICS__ || {};
    const installer = runtimeMechanicInstallers[installerKey];

    if (!installerKey) {
      reportMechanicFailure(
        mechanic,
        "install",
        new Error("Missing runtime installer key.")
      );

      return {
        mechanic,
        status: "disabled",
      };
    }

    if (!installer) {
      reportMechanicFailure(
        mechanic,
        "install",
        new Error('Missing runtime installer "' + installerKey + '".')
      );

      return {
        mechanic,
        status: "disabled",
      };
    }

    try {
      const installed = installer({
        Phaser: globalThis.Phaser,
        collectObjective,
        createChaser() {
          return createChaser(scene);
        },
        createObjective() {
          return createObjective(scene);
        },
        getChaser() {
          return chaser;
        },
        getChaseVelocity,
        getObjective() {
          return objective;
        },
        getPlayer() {
          return player;
        },
        mechanic,
        resetAfterChaserCatch,
        scene,
        staticLayoutBodies:
          contextExtras && Array.isArray(contextExtras.staticLayoutBodies)
            ? contextExtras.staticLayoutBodies
            : [],
      });

      return {
        dispose: installed && installed.dispose,
        mechanic,
        status: "active",
        update: installed && installed.update,
      };
    } catch (error) {
      reportMechanicFailure(mechanic, "install", error);

      return {
        mechanic,
        status: "disabled",
      };
    }
  }

  function updateInstalledMechanics() {
    installedMechanics.forEach(function (installed) {
      if (
        !installed ||
        installed.status !== "active" ||
        typeof installed.update !== "function"
      ) {
        return;
      }

      try {
        installed.update();
      } catch (error) {
        installed.status = "disabled";
        reportMechanicFailure(installed.mechanic, "update", error);
      }
    });
  }

  function disposeInstalledMechanics() {
    installedMechanics.forEach(function (installed) {
      if (
        !installed ||
        installed.status !== "active" ||
        typeof installed.dispose !== "function"
      ) {
        return;
      }

      try {
        installed.dispose();
      } catch (error) {
        installed.status = "disabled";
        reportMechanicFailure(installed.mechanic, "dispose", error);
      }
    });
  }

  function applyHostViewport(nextViewport) {
    if (
      !nextViewport ||
      typeof nextViewport.width !== "number" ||
      typeof nextViewport.height !== "number" ||
      nextViewport.scaling !== "stretch_to_fill"
    ) {
      return;
    }

    viewport.width = Math.max(1, Math.round(nextViewport.width));
    viewport.height = Math.max(1, Math.round(nextViewport.height));
    viewport.scaling = "stretch_to_fill";

    if (game && game.scale) {
      game.scale.resize(viewport.width, viewport.height);
    }

    if (activeScene && activeScene.physics) {
      activeScene.physics.world.setBounds(
        32,
        32,
        viewport.width - 64,
        viewport.height - 64
      );
      activeScene.cameras.main.setSize(viewport.width, viewport.height);
    }
  }

  function setPaused(nextIsPaused) {
    if (!game || isPaused === nextIsPaused) {
      return;
    }

    isPaused = nextIsPaused;

    if (isPaused) {
      game.scene.pause(SCENE_KEY);
      return;
    }

    game.scene.resume(SCENE_KEY);
  }

  function focusGameContainer() {
    const container = document.getElementById("game");
    if (container) {
      container.focus();
    }
  }

  function createScene() {
    return {
      key: SCENE_KEY,
      preload() {},
      create() {
        activeScene = {
          cameras: this.cameras,
          physics: this.physics,
        };
        this.cameras.main.setBackgroundColor("#10171e");
        this.physics.world.setBounds(
          0,
          0,
          viewport.width,
          viewport.height
        );

        this.add
          .rectangle(
            viewport.width / 2,
            viewport.height / 2,
            Math.max(1, arena.width || viewport.width),
            Math.max(1, arena.height || viewport.height),
            0x18242f
          )
          .setStrokeStyle(2, 0x6ee7b7, 0.5);

        this.add.text(40, 24, gameSpec.title || template.title || "Top-Down Chase", {
          color: "#f8f4ee",
          fontFamily: "Arial, sans-serif",
          fontSize: "18px",
        });
        scoreText = this.add.text(40, 50, objectiveLabel + ": 0", {
          color: "#f6c46b",
          fontFamily: "Arial, sans-serif",
          fontSize: "16px",
        });

        const staticLayoutBodies = createLayoutBodies(this);
        createPlayer(this);
        installedMechanics = [
          installActiveMechanic(this, "player_movement", {
            staticLayoutBodies,
          }),
          installActiveMechanic(this, "pickup_collection", {
            staticLayoutBodies,
          }),
          installActiveMechanic(this, "enemy_chase", {
            staticLayoutBodies,
          }),
        ].filter(Boolean);

        staticLayoutBodies.forEach((body) => {
          this.physics.add.collider(player, body);
        });

        notify("game-ready", {
          manifest: {
            title: gameSpec.title || template.title || "Top-Down Chase",
            runtime: "phaser",
          },
          viewport,
        });
      },
      update() {
        updateInstalledMechanics();
      },
    };
  }

  try {
    if (!globalThis.Phaser) {
      throw new Error("Phaser runtime dependency is unavailable.");
    }

    game = new Phaser.Game({
      type: Phaser.AUTO,
      width: viewport.width,
      height: viewport.height,
      parent: "game",
      backgroundColor: "#10171e",
      physics: {
        default: "arcade",
        arcade: {
          debug: false,
        },
      },
      scene: createScene(),
    });

    window.addEventListener("message", function (event) {
      if (event.data && event.data.type === "game-reload") {
        location.reload();
      }

      if (event.data && event.data.type === "game-focus") {
        focusGameContainer();
      }

      if (event.data && event.data.type === "game-pause") {
        setPaused(Boolean(event.data.paused));
      }

      if (event.data && event.data.type === "game-resize") {
        applyHostViewport(event.data.viewport);
      }
    });

    window.addEventListener("beforeunload", function () {
      disposeInstalledMechanics();

      if (game) {
        game.destroy(true);
      }
    });
  } catch (error) {
    notify("game-error", {
      message: getErrorMessage(error),
    });
  }
})();
