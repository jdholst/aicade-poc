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
  const DEFAULT_PLAYER_ENTITY_ID = "entity_player";
  let game = null;
  let activeScene = null;
  let installedMechanics = [];
  let entityHandles = {};
  let entityStartPositions = {};
  let objectiveScores = {};
  let scoreText = null;
  let isPaused = false;

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

  function findEntityById(entityId) {
    if (!entityId || !Array.isArray(gameSpec.entities)) {
      return null;
    }

    return (
      gameSpec.entities.find(function (entity) {
        return entity.id === entityId;
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

  function randomBetween(min, max) {
    return Phaser.Math.Between(min, max);
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

  function getSpawnPointForEntity(entityId, fallback) {
    return getZoneCenter(findZoneForEntity(entityId), fallback);
  }

  function findPickupPoint(options) {
    const pickupZone = findFirstPickupZone();
    const padding =
      options && typeof options.padding === "number"
        ? options.padding
        : PICKUP_SPAWN_PADDING;
    const fallback =
      options && options.fallback
        ? options.fallback
        : getZoneCenter(pickupZone, {
            x: viewport.width - 180,
            y: 150,
          });

    return getRandomPointInZone(pickupZone, fallback, padding);
  }

  function getOptionNumber(options, key, fallback) {
    return options && typeof options[key] === "number" ? options[key] : fallback;
  }

  function createEntityHandle(scene, entityId, options) {
    const settings = options || {};
    const fallbackPoint =
      settings.fallback ||
      {
        x: getOptionNumber(settings, "x", viewport.width / 2),
        y: getOptionNumber(settings, "y", viewport.height / 2),
      };
    const point = settings.point || getSpawnPointForEntity(entityId, fallbackPoint);
    const color = getOptionNumber(settings, "color", 0xffffff);
    let handle = null;

    if (settings.kind === "circle") {
      handle = scene.add.circle(
        point.x,
        point.y,
        getOptionNumber(settings, "radius", 18),
        color
      );
    } else if (settings.kind === "star") {
      handle = scene.add.star(
        point.x,
        point.y,
        getOptionNumber(settings, "points", 5),
        getOptionNumber(settings, "innerRadius", 10),
        getOptionNumber(settings, "outerRadius", 22),
        color
      );
    } else {
      handle = scene.add.rectangle(
        point.x,
        point.y,
        getOptionNumber(settings, "width", 34),
        getOptionNumber(settings, "height", 34),
        color
      );
    }

    scene.physics.add.existing(handle, Boolean(settings.staticBody));

    if (
      settings.allowGravity === false &&
      handle.body &&
      typeof handle.body.setAllowGravity === "function"
    ) {
      handle.body.setAllowGravity(false);
    }

    if (
      settings.collideWorldBounds &&
      handle.body &&
      typeof handle.body.setCollideWorldBounds === "function"
    ) {
      handle.body.setCollideWorldBounds(true);
    }

    entityHandles[entityId] = handle;
    entityStartPositions[entityId] = { x: point.x, y: point.y };

    return handle;
  }

  function getEntityHandle(entityId) {
    return entityHandles[entityId] || null;
  }

  function resetEntityHandle(entityId) {
    const handle = getEntityHandle(entityId);
    const start = entityStartPositions[entityId];

    if (!handle || !start || typeof handle.setPosition !== "function") {
      return;
    }

    handle.setPosition(start.x, start.y);
  }

  function getPrimaryObjectiveId() {
    return primaryObjective && primaryObjective.id
      ? primaryObjective.id
      : "objective_primary";
  }

  function setObjectiveScore(objectiveId, nextScore) {
    const resolvedObjectiveId = objectiveId || getPrimaryObjectiveId();
    objectiveScores[resolvedObjectiveId] = nextScore;

    if (scoreText && resolvedObjectiveId === getPrimaryObjectiveId()) {
      scoreText.setText(objectiveLabel + ": " + nextScore);
    }
  }

  function incrementObjectiveScore(objectiveId, amount) {
    const resolvedObjectiveId = objectiveId || getPrimaryObjectiveId();
    const nextScore =
      (objectiveScores[resolvedObjectiveId] || 0) +
      (typeof amount === "number" ? amount : 1);

    setObjectiveScore(resolvedObjectiveId, nextScore);
  }

  function resetObjectiveScore(objectiveId) {
    setObjectiveScore(objectiveId || getPrimaryObjectiveId(), 0);
  }

  function createPlayer(scene) {
    const playerEntity = findEntityByRole("player");
    const playerEntityId =
      playerEntity && playerEntity.id ? playerEntity.id : DEFAULT_PLAYER_ENTITY_ID;

    return createEntityHandle(scene, playerEntityId, {
      kind: "rectangle",
      fallback: { x: 160, y: 270 },
      width: 34,
      height: 34,
      color: 0x6ee7b7,
      collideWorldBounds: true,
    });
  }

  function createMechanicContext(scene, mechanic, contextExtras) {
    const staticBodies =
      contextExtras && Array.isArray(contextExtras.staticLayoutBodies)
        ? contextExtras.staticLayoutBodies
        : [];

    return {
      mechanic,
      entities: {
        createHandle(entityId, options) {
          return createEntityHandle(scene, entityId, options);
        },
        findById: findEntityById,
        findByRole: findEntityByRole,
        getHandle: getEntityHandle,
        resetHandle: resetEntityHandle,
      },
      layout: {
        findPickupPoint,
        findSpawnPointForEntity: getSpawnPointForEntity,
        isPathBlocked: isPathBlockedByLayout,
        isPointBlocked: isPointBlockedByLayout,
        staticBodies,
      },
      objective: {
        increment: incrementObjectiveScore,
        reset: resetObjectiveScore,
      },
      input: {
        createCursorKeys() {
          return scene.input.keyboard.createCursorKeys();
        },
      },
      math: {
        normalizeVector,
        randomBetween,
        scaleVector,
      },
      physics: {
        addCollider(first, second) {
          scene.physics.add.collider(first, second);
        },
        addOverlap(first, second, handler) {
          scene.physics.add.overlap(first, second, handler);
        },
      },
      runtime: {
        getViewport() {
          return viewport;
        },
        resetEntity: resetEntityHandle,
      },
    };
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
      const installed = installer(
        createMechanicContext(scene, mechanic, contextExtras)
      );

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

        entityHandles = {};
        entityStartPositions = {};
        objectiveScores = {};

        const staticLayoutBodies = createLayoutBodies(this);
        const player = createPlayer(this);
        installedMechanics = activeMechanics
          .map((mechanic) =>
            installActiveMechanic(this, mechanic.type, {
              staticLayoutBodies,
            })
          )
          .filter(Boolean);

        if (player) {
          staticLayoutBodies.forEach((body) => {
            this.physics.add.collider(player, body);
          });
        }

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
