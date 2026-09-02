(function () {
  // Bound catch-up to eight 16 ms host steps so one delayed SES response
  // cannot consume the full fixed per-tick execution budget.
  const GENERATED_MECHANIC_MAX_PENDING_ELAPSED_MILLISECONDS = 128;

  function createRuntimeConfig(rawTemplate) {
    const template = rawTemplate || {};
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
    const objectiveLabel =
      primaryObjective && primaryObjective.label
        ? primaryObjective.label
        : "Collect crystals";
    const activeMechanics = Array.isArray(gameSpec.mechanics)
      ? gameSpec.mechanics
      : [];

    return {
      activeMechanics,
      arena,
      controls: Array.isArray(template.controls) ? template.controls : [],
      defaultPlayerEntityId: "entity_player",
      gameSpec,
      layout,
      objectiveLabel,
      pickupSpawnPadding: 24,
      primaryObjective,
      runtimeInstallerKeys: template.mechanicInstallerKeys || {},
      sceneKey: "top-down-chase",
      template,
      viewport,
    };
  }

  function createRuntimeState() {
    return {
      activeScene: null,
      game: null,
      generatedMechanicPendingElapsedMilliseconds: 0,
      generatedMechanicUpdatePending: false,
      isPaused: false,
      playerHandle: null,
      renderedObjectCount: 0,
      validationInputState: {
        down: false,
        left: false,
        right: false,
        up: false,
      },
    };
  }

  function notify(type, payload) {
    const message = Object.assign({ type }, payload || {});
    const trustedNotify = globalThis.__AICADE_RUNTIME_NOTIFY__;

    if (typeof trustedNotify === "function") {
      trustedNotify(message);
      return;
    }

    parent.postMessage(message, "*");
  }

  function getErrorMessage(error) {
    return error && error.message ? error.message : String(error);
  }

  function createRuntimeReporter() {
    function reportMechanicFailure(mechanic, phase, error) {
      const message =
        "Mechanic " +
        mechanic.id +
        " " +
        phase +
        " failed: " +
        getErrorMessage(error);

      notify("game-error", {
        issue: {
          type: "mechanic-disabled",
          severity: "warning",
          recoverable: true,
          mechanicId: mechanic.id,
          mechanicType: mechanic.type,
          phase,
          message,
        },
        message,
      });
    }

    function reportFatalRuntimeFailure(message) {
      notify("game-error", {
        issue: {
          type: "runtime-error",
          severity: "error",
          recoverable: false,
          message,
        },
        message,
      });
    }

    return {
      reportFatalRuntimeFailure,
      reportMechanicFailure,
    };
  }

  function createEntityLookupModule(gameSpec, layout) {
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

    return {
      findEntityById,
      findEntityByRole,
      findZoneForEntity,
    };
  }

  function createMathModule() {
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

    return {
      normalizeVector,
      randomBetween,
      scaleVector,
    };
  }

  function createLayoutModule(config, entityLookup, mathModule) {
    const layout = config.layout;
    const viewport = config.viewport;

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
          x: mathModule.randomBetween(bounds.minX, bounds.maxX),
          y: mathModule.randomBetween(bounds.minY, bounds.maxY),
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
      return getZoneCenter(entityLookup.findZoneForEntity(entityId), fallback);
    }

    function findPickupPoint(options) {
      const pickupZone = findFirstPickupZone();
      const padding =
        options && typeof options.padding === "number"
          ? options.padding
          : config.pickupSpawnPadding;
      const fallback =
        options && options.fallback
          ? options.fallback
          : getZoneCenter(pickupZone, {
              x: viewport.width - 180,
              y: 150,
            });

      return getRandomPointInZone(pickupZone, fallback, padding);
    }

    return {
      createLayoutBodies,
      findPickupPoint,
      findSpawnPointForEntity: getSpawnPointForEntity,
      getZoneCenter,
      isPathBlocked: isPathBlockedByLayout,
      isPointBlocked: isPointBlockedByLayout,
    };
  }

  function getOptionNumber(options, key, fallback) {
    return options && typeof options[key] === "number" ? options[key] : fallback;
  }

  function createEntityModule(config, entityLookup, layoutModule) {
    let entityHandles = {};
    let entityStartPositions = {};

    function resetEntityState() {
      entityHandles = {};
      entityStartPositions = {};
    }

    function createEntityHandle(scene, entityId, options) {
      const settings = options || {};
      const fallbackPoint =
        settings.fallback ||
        {
          x: getOptionNumber(settings, "x", config.viewport.width / 2),
          y: getOptionNumber(settings, "y", config.viewport.height / 2),
        };
      const point =
        settings.point ||
        layoutModule.findSpawnPointForEntity(entityId, fallbackPoint);
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

    function createPlayer(scene) {
      const playerEntity = entityLookup.findEntityByRole("player");
      const playerEntityId =
        playerEntity && playerEntity.id
          ? playerEntity.id
          : config.defaultPlayerEntityId;

      return createEntityHandle(scene, playerEntityId, {
        kind: "rectangle",
        fallback: { x: 160, y: 270 },
        width: 34,
        height: 34,
        color: 0x6ee7b7,
        collideWorldBounds: true,
      });
    }

    return {
      createEntityHandle,
      createPlayer,
      findById: entityLookup.findEntityById,
      findByRole: entityLookup.findEntityByRole,
      getEntityHandle,
      resetEntityHandle,
      resetEntityState,
    };
  }

  function buildObjectiveModule(config) {
    let objectiveScores = {};
    let scoreText = null;

    function bindScoreText(nextScoreText) {
      scoreText = nextScoreText;
    }

    function resetObjectiveState() {
      objectiveScores = {};
    }

    function getPrimaryObjectiveId() {
      return config.primaryObjective && config.primaryObjective.id
        ? config.primaryObjective.id
        : "objective_primary";
    }

    function setObjectiveScore(objectiveId, nextScore) {
      const resolvedObjectiveId = objectiveId || getPrimaryObjectiveId();
      objectiveScores[resolvedObjectiveId] = nextScore;

      if (scoreText && resolvedObjectiveId === getPrimaryObjectiveId()) {
        scoreText.setText(config.objectiveLabel + ": " + nextScore);
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

    return {
      bindScoreText,
      incrementObjectiveScore,
      resetObjectiveScore,
      resetObjectiveState,
    };
  }

  function createMechanicLifecycleModule(dependencies) {
    const config = dependencies.config;
    const entityModule = dependencies.entityModule;
    const layoutModule = dependencies.layoutModule;
    const mathModule = dependencies.mathModule;
    const objectiveModule = dependencies.objectiveModule;
    const reporter = dependencies.reporter;
    const runtimeState = dependencies.runtimeState;
    let installedMechanics = [];
    let generatedMechanicSession = null;
    let generatedMechanicDisposed = false;
    let generatedOwnedObjectObservers = [];

    function getGeneratedMechanicHost() {
      const host = globalThis.__AICADE_GENERATED_MECHANIC_HOST__;

      return host &&
        typeof host === "object" &&
        typeof host.mechanicId === "string" &&
        typeof host.install === "function"
        ? host
        : null;
    }

    function createRuntimeCursorKeys(scene) {
      const cursors = scene.input.keyboard.createCursorKeys();

      function createKey(key) {
        const cursor = cursors[key] || {};

        return {
          get isDown() {
            return Boolean(
              cursor.isDown || runtimeState.validationInputState[key]
            );
          },
        };
      }

      return {
        down: createKey("down"),
        left: createKey("left"),
        right: createKey("right"),
        up: createKey("up"),
      };
    }

    function createMechanicContext(scene, mechanic, contextExtras) {
      const staticBodies =
        contextExtras && Array.isArray(contextExtras.staticLayoutBodies)
          ? contextExtras.staticLayoutBodies
          : [];

      function findTargetByRole(role) {
        const entityIds =
          mechanic && Array.isArray(mechanic.entityIds)
            ? mechanic.entityIds
            : [];

        for (let index = 0; index < entityIds.length; index += 1) {
          const entity = entityModule.findById(entityIds[index]);

          if (entity && entity.role === role) {
            return entity;
          }
        }

        return entityModule.findByRole(role);
      }

      function getTargetIdByRole(role, fallbackEntityId) {
        const targetEntity = findTargetByRole(role);

        return targetEntity && targetEntity.id
          ? targetEntity.id
          : fallbackEntityId;
      }

      function getPrimaryObjectiveId(fallbackObjectiveId) {
        const objectiveIds =
          mechanic && Array.isArray(mechanic.objectiveIds)
            ? mechanic.objectiveIds
            : [];

        return objectiveIds[0] || fallbackObjectiveId || "objective_primary";
      }

      return {
        mechanic,
        entities: {
          createHandle(entityId, options) {
            return entityModule.createEntityHandle(scene, entityId, options);
          },
          findById: entityModule.findById,
          findByRole: entityModule.findByRole,
          findTargetByRole,
          getTargetIdByRole,
          getHandle: entityModule.getEntityHandle,
          resetHandle: entityModule.resetEntityHandle,
        },
        layout: {
          findPickupPoint: layoutModule.findPickupPoint,
          findSpawnPointForEntity: layoutModule.findSpawnPointForEntity,
          isPathBlocked: layoutModule.isPathBlocked,
          isPointBlocked: layoutModule.isPointBlocked,
          staticBodies,
        },
        objective: {
          getPrimaryId: getPrimaryObjectiveId,
          increment: objectiveModule.incrementObjectiveScore,
          reset: objectiveModule.resetObjectiveScore,
        },
        input: {
          createCursorKeys() {
            return createRuntimeCursorKeys(scene);
          },
        },
        math: {
          normalizeVector: mathModule.normalizeVector,
          randomBetween: mathModule.randomBetween,
          scaleVector: mathModule.scaleVector,
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
            return config.viewport;
          },
          observeGeneratedOwnedObjects(filter, observer) {
            if (
              !filter ||
              typeof filter !== "object" ||
              typeof filter.assetRole !== "string" ||
              typeof filter.entityRole !== "string" ||
              typeof observer !== "function"
            ) {
              throw new TypeError(
                "Generated owned-object observation requires exact roles and an observer."
              );
            }
            const registration = {
              assetRole: filter.assetRole,
              entityRole: filter.entityRole,
              mechanic,
              observer,
            };
            generatedOwnedObjectObservers.push(registration);
            return function stopObservingGeneratedOwnedObjects() {
              generatedOwnedObjectObservers =
                generatedOwnedObjectObservers.filter(function (candidate) {
                  return candidate !== registration;
                });
            };
          },
          resetEntity: entityModule.resetEntityHandle,
        },
      };
    }

    function installActiveMechanic(scene, mechanic, contextExtras) {
      if (!mechanic || !mechanic.type) {
        return null;
      }

      const generatedHost = getGeneratedMechanicHost();
      if (generatedHost && generatedHost.mechanicId === mechanic.id) {
        return {
          mechanic,
          status: "externally-hosted",
        };
      }

      const installerKey = config.runtimeInstallerKeys[mechanic.type];
      const runtimeMechanicInstallers =
        globalThis.__AICADE_TOP_DOWN_MECHANICS__ || {};
      const installer = runtimeMechanicInstallers[installerKey];

      if (!installerKey) {
        reporter.reportMechanicFailure(
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
        reporter.reportMechanicFailure(
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
        reporter.reportMechanicFailure(mechanic, "install", error);

        return {
          mechanic,
          status: "disabled",
        };
      }
    }

    function installActiveMechanics(scene, contextExtras) {
      installedMechanics = config.activeMechanics
        .map(function (mechanic) {
          return installActiveMechanic(scene, mechanic, contextExtras);
        })
        .filter(Boolean);

      return installedMechanics;
    }

    function createGeneratedOwnedObject(scene, mechanic, input) {
      if (
        !input ||
        typeof input !== "object" ||
        typeof input.objectId !== "string" ||
        typeof input.objectKind !== "string"
      ) {
        throw new TypeError(
          "Generated owned-object creation requires exact object identity."
        );
      }
      const initial =
        input.initial &&
        typeof input.initial === "object" &&
        !Array.isArray(input.initial)
          ? input.initial
          : {};
      const position =
        initial.position &&
        typeof initial.position === "object" &&
        !Array.isArray(initial.position)
          ? initial.position
          : {};
      const velocity =
        initial.velocity &&
        typeof initial.velocity === "object" &&
        !Array.isArray(initial.velocity)
          ? initial.velocity
          : {};
      const properties =
        initial.properties &&
        typeof initial.properties === "object" &&
        !Array.isArray(initial.properties)
          ? initial.properties
          : {};
      const x = boundedNumber(
        position.x,
        config.viewport.width / 2,
        -1000000,
        1000000
      );
      const y = boundedNumber(
        position.y,
        config.viewport.height / 2,
        -1000000,
        1000000
      );
      const color = Math.round(
        boundedNumber(initial.color, 0xffffff, 0, 0xffffff)
      );
      const object =
        initial.shape === "rectangle"
          ? scene.add.rectangle(
              x,
              y,
              boundedNumber(initial.width, 12, 1, 256),
              boundedNumber(initial.height, 12, 1, 256),
              color
            )
          : scene.add.circle(
              x,
              y,
              boundedNumber(initial.radius, 6, 1, 128),
              color
            );
      scene.physics.add.existing(object, false);
      if (
        object.body &&
        typeof object.body.setAllowGravity === "function"
      ) {
        object.body.setAllowGravity(false);
      }
      if (object.body && typeof object.body.setVelocity === "function") {
        object.body.setVelocity(
          boundedNumber(velocity.x, 0, -2000, 2000),
          boundedNumber(velocity.y, 0, -2000, 2000)
        );
      }
      if (typeof object.destroy !== "function") {
        throw new Error(
          'Generated owned object "' + input.objectId + '" cannot be destroyed.'
        );
      }
      try {
        notifyGeneratedOwnedObjectObservers(
          mechanic,
          input.objectKind,
          properties,
          object
        );
      } catch (error) {
        object.destroy();
        throw error;
      }
      return {
        object,
        observeProperties() {
          return Object.assign({}, properties);
        },
      };
    }

    function notifyGeneratedOwnedObjectObservers(
      generatedMechanic,
      objectKind,
      properties,
      object
    ) {
      const generatedAssetIds =
        generatedMechanic && Array.isArray(generatedMechanic.assetIds)
          ? generatedMechanic.assetIds
          : [];
      const propertyAssetId =
        properties && typeof properties.asset === "string"
          ? properties.asset
          : null;
      const generatedEntityIds =
        generatedMechanic && Array.isArray(generatedMechanic.entityIds)
          ? generatedMechanic.entityIds
          : [];
      const assets = Array.isArray(config.gameSpec.assets)
        ? config.gameSpec.assets
        : [];

      generatedOwnedObjectObservers.slice().forEach(function (registration) {
        const observerEntityIds =
          registration.mechanic &&
          Array.isArray(registration.mechanic.entityIds)
            ? registration.mechanic.entityIds
            : [];
        const sharedEntityIds = generatedEntityIds.filter(function (entityId) {
          if (!observerEntityIds.includes(entityId)) {
            return false;
          }
          const entity = entityModule.findById(entityId);
          return entity && entity.role === registration.entityRole;
        });
        if (sharedEntityIds.length === 0) {
          return;
        }
        const observerAssetIds =
          registration.mechanic &&
          Array.isArray(registration.mechanic.assetIds)
            ? registration.mechanic.assetIds
            : [];
        const assetId = generatedAssetIds.includes(objectKind)
          ? objectKind
          : propertyAssetId && generatedAssetIds.includes(propertyAssetId)
            ? propertyAssetId
            : sharedEntityIds.includes(objectKind)
              ? generatedAssetIds.find(function (generatedAssetId) {
                  if (!observerAssetIds.includes(generatedAssetId)) {
                    return false;
                  }
                  const sharedAsset = assets.find(function (candidate) {
                    return candidate && candidate.id === generatedAssetId;
                  });
                  return (
                    sharedAsset && sharedAsset.role === registration.assetRole
                  );
                })
              : null;
        const asset = assetId
          ? assets.find(function (candidate) {
              return candidate && candidate.id === assetId;
            })
          : null;
        if (!asset || asset.role !== registration.assetRole) {
          return;
        }
        registration.observer(object);
      });
    }

    function boundedNumber(value, fallback, minimum, maximum) {
      return typeof value === "number" && Number.isFinite(value)
        ? Math.min(maximum, Math.max(minimum, value))
        : fallback;
    }

    function installGeneratedMechanic(scene) {
      const generatedHost = getGeneratedMechanicHost();
      if (!generatedHost) {
        return null;
      }
      const mechanic = config.activeMechanics.find(function (candidate) {
        return candidate && candidate.id === generatedHost.mechanicId;
      });
      if (!mechanic) {
        return Promise.reject(
          new Error(
            'Generated mechanic host target "' +
              generatedHost.mechanicId +
              '" is not present in the active Game Spec.'
          )
        );
      }

      return Promise.resolve(
        generatedHost.install({
          gameSpec: config.gameSpec,
          mechanic,
          template: config.template,
          createOwnedObject(input) {
            return createGeneratedOwnedObject(scene, mechanic, input);
          },
          getEntityDefinition: entityModule.findById,
          getEntityHandle: entityModule.getEntityHandle,
        })
      ).then(function (session) {
        if (
          !session ||
          typeof session !== "object" ||
          !session.identity ||
          typeof session.advanceSimulation !== "function" ||
          typeof session.dispatchLogicalAction !== "function" ||
          typeof session.dispose !== "function"
        ) {
          throw new Error(
            "Generated mechanic host returned an invalid retained session."
          );
        }
        if (generatedMechanicDisposed) {
          return Promise.resolve(session.dispose()).then(function () {
            throw new Error(
              "Generated mechanic installation completed after frame disposal."
            );
          });
        }
        generatedMechanicSession = session;
        generatedMechanicDisposed = false;
        return session;
      });
    }

    function drainGeneratedMechanicUpdates() {
      if (
        !generatedMechanicSession ||
        runtimeState.generatedMechanicUpdatePending ||
        runtimeState.generatedMechanicPendingElapsedMilliseconds <= 0
      ) {
        return;
      }
      const pendingElapsed =
        runtimeState.generatedMechanicPendingElapsedMilliseconds;
      const elapsed = Math.floor(pendingElapsed);
      if (elapsed <= 0) {
        return;
      }
      const activeSession = generatedMechanicSession;
      runtimeState.generatedMechanicPendingElapsedMilliseconds =
        pendingElapsed - elapsed;
      runtimeState.generatedMechanicUpdatePending = true;

      Promise.resolve(activeSession.advanceSimulation(elapsed)).then(
        function () {
          runtimeState.generatedMechanicUpdatePending = false;
          if (
            generatedMechanicSession === activeSession &&
            !generatedMechanicDisposed
          ) {
            drainGeneratedMechanicUpdates();
          }
        },
        function (error) {
          failGeneratedMechanicSession(activeSession, "update", error);
        }
      );
    }

    function failGeneratedMechanicSession(activeSession, phase, error) {
      runtimeState.generatedMechanicUpdatePending = false;
      runtimeState.generatedMechanicPendingElapsedMilliseconds = 0;
      const failedSession =
        generatedMechanicSession === activeSession ? activeSession : null;
      generatedMechanicSession = null;
      generatedMechanicDisposed = true;
      if (failedSession) {
        try {
          Promise.resolve(failedSession.dispose()).catch(
            function (disposeError) {
              reporter.reportFatalRuntimeFailure(
                "Generated mechanic disposal failed: " +
                  getErrorMessage(disposeError)
              );
            }
          );
        } catch (disposeError) {
          reporter.reportFatalRuntimeFailure(
            "Generated mechanic disposal failed: " +
              getErrorMessage(disposeError)
          );
        }
      }
      reporter.reportFatalRuntimeFailure(
        "Generated mechanic " + phase + " failed: " + getErrorMessage(error)
      );
    }

    function dispatchGeneratedLogicalAction(actionId) {
      if (!generatedMechanicSession || generatedMechanicDisposed) {
        return Promise.resolve(false);
      }
      return Promise.resolve(
        generatedMechanicSession.dispatchLogicalAction(actionId)
      ).then(
        function () {
          return true;
        }
      );
    }

    function reportGeneratedLogicalActionFailure(error) {
      if (!generatedMechanicSession || generatedMechanicDisposed) {
        return;
      }
      failGeneratedMechanicSession(
        generatedMechanicSession,
        "logical action",
        error
      );
    }

    function updateGeneratedMechanic(elapsedMilliseconds) {
      if (!generatedMechanicSession) {
        return;
      }
      const elapsed =
        typeof elapsedMilliseconds === "number" &&
        Number.isFinite(elapsedMilliseconds) &&
        elapsedMilliseconds >= 0
          ? elapsedMilliseconds
          : 16;
      if (elapsed === 0) {
        return;
      }
      runtimeState.generatedMechanicPendingElapsedMilliseconds = Math.min(
        GENERATED_MECHANIC_MAX_PENDING_ELAPSED_MILLISECONDS,
        runtimeState.generatedMechanicPendingElapsedMilliseconds + elapsed
      );
      drainGeneratedMechanicUpdates();
    }

    function disposeGeneratedMechanic() {
      if (generatedMechanicDisposed) {
        return;
      }
      generatedMechanicDisposed = true;
      runtimeState.generatedMechanicPendingElapsedMilliseconds = 0;
      if (!generatedMechanicSession) {
        const generatedHost = getGeneratedMechanicHost();
        if (generatedHost && typeof generatedHost.dispose === "function") {
          try {
            Promise.resolve(generatedHost.dispose()).catch(function (error) {
              reporter.reportFatalRuntimeFailure(
                "Generated mechanic host disposal failed: " +
                  getErrorMessage(error)
              );
            });
          } catch (error) {
            reporter.reportFatalRuntimeFailure(
              "Generated mechanic host disposal failed: " +
                getErrorMessage(error)
            );
          }
        }
        return;
      }
      const session = generatedMechanicSession;
      generatedMechanicSession = null;
      Promise.resolve(session.dispose()).catch(function (error) {
        reporter.reportFatalRuntimeFailure(
          "Generated mechanic disposal failed: " + getErrorMessage(error)
        );
      });
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
          reporter.reportMechanicFailure(installed.mechanic, "update", error);
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
          reporter.reportMechanicFailure(installed.mechanic, "dispose", error);
        }
      });
    }

    return {
      disposeGeneratedMechanic,
      disposeInstalledMechanics,
      dispatchGeneratedLogicalAction,
      installGeneratedMechanic,
      installActiveMechanics,
      reportGeneratedLogicalActionFailure,
      updateGeneratedMechanic,
      updateInstalledMechanics,
    };
  }

  function createHostProtocolModule(config, runtimeState, mechanicsModule) {
    function emitValidationEvidence(checkId, status, message, evidence, issues) {
      notify("game-validation-evidence", {
        data: {
          checkId,
          status,
          message,
          evidence,
          issues,
        },
      });
    }

    function isFiniteNumber(value) {
      return typeof value === "number" && Number.isFinite(value);
    }

    function readVelocity(handle) {
      const velocity =
        handle &&
        handle.body &&
        handle.body.velocity &&
        isFiniteNumber(handle.body.velocity.x) &&
        isFiniteNumber(handle.body.velocity.y)
          ? handle.body.velocity
          : null;

      return velocity
        ? {
            x: velocity.x,
            y: velocity.y,
          }
        : {
            x: 0,
            y: 0,
          };
    }

    function clearValidationInput(player) {
      runtimeState.validationInputState = {
        down: false,
        left: false,
        right: false,
        up: false,
      };

      if (
        player &&
        player.body &&
        typeof player.body.setVelocity === "function"
      ) {
        try {
          player.body.setVelocity(0, 0);
        } catch {
          // The response receipt below captures failed velocity updates.
        }
      }
    }

    function runInputResponseCheck() {
      const player = runtimeState.playerHandle;

      if (
        !player ||
        !player.body ||
        typeof player.body.setVelocity !== "function"
      ) {
        return {
          status: "failed",
          message: "Runtime could not verify player input response.",
          evidence: {
            hasPlayer: Boolean(player),
          },
          issues: [
            {
              code: "input_probe_missing_player_body",
              path: "runtime.player.body",
              message:
                "Expected the runtime player to have a velocity-capable body.",
            },
          ],
        };
      }

      runtimeState.validationInputState = {
        down: false,
        left: false,
        right: true,
        up: false,
      };

      mechanicsModule.updateInstalledMechanics();

      const velocity = readVelocity(player);
      const responded = velocity.x !== 0 || velocity.y !== 0;

      clearValidationInput(player);

      if (responded) {
        return {
          status: "passed",
          message: "Runtime responded to a synthetic movement input.",
          evidence: {
            inputAction: "move_right",
            playerVelocity: velocity,
          },
        };
      }

      return {
        status: "failed",
        message: "Runtime did not respond to a synthetic movement input.",
        evidence: {
          inputAction: "move_right",
          playerVelocity: velocity,
        },
        issues: [
          {
            code: "input_probe_no_velocity",
            path: "runtime.input",
            message:
              "Expected player velocity to change during the movement probe.",
          },
        ],
      };
    }

    function runFirstPlayableChecks(generatedActionId) {
      const renderedObjectCount = runtimeState.renderedObjectCount;
      const player = runtimeState.playerHandle;
      const playerHasFinitePosition =
        player && isFiniteNumber(player.x) && isFiniteNumber(player.y);
      const playerInsideViewport =
        playerHasFinitePosition &&
        player.x >= 0 &&
        player.x <= config.viewport.width &&
        player.y >= 0 &&
        player.y <= config.viewport.height;
      const playerVisible =
        Boolean(player && player.body) && Boolean(playerInsideViewport);
      const inputResponse = runInputResponseCheck();

      emitValidationEvidence(
        "nonblank_render",
        renderedObjectCount > 0 ? "passed" : "failed",
        renderedObjectCount > 0
          ? "Runtime reported nonblank render output."
          : "Runtime did not report nonblank render output.",
        {
          renderedObjectCount,
          viewport: config.viewport,
        },
        renderedObjectCount > 0
          ? undefined
          : [
              {
                code: "blank_runtime_render",
                path: "runtime.render",
                message: "Expected at least one visible render object.",
              },
            ]
      );

      emitValidationEvidence(
        "player_visible",
        playerVisible ? "passed" : "failed",
        playerVisible
          ? "Runtime reported a visible player."
          : "Runtime did not report a visible player.",
        {
          hasBody: Boolean(player && player.body),
          playerPosition: playerHasFinitePosition
            ? {
                x: player.x,
                y: player.y,
              }
            : null,
          viewport: config.viewport,
        },
        playerVisible
          ? undefined
          : [
              {
                code: "player_not_visible",
                path: "runtime.player",
                message:
                  "Expected the player to exist inside the runtime viewport.",
              },
            ]
      );

      if (typeof generatedActionId !== "string" || !generatedActionId) {
        emitValidationEvidence(
          "input_response",
          inputResponse.status,
          inputResponse.message,
          inputResponse.evidence,
          inputResponse.issues
        );
        return;
      }

      void mechanicsModule
        .dispatchGeneratedLogicalAction(generatedActionId)
        .then(
          function (dispatched) {
            emitValidationEvidence(
              "input_response",
              dispatched ? inputResponse.status : "failed",
              dispatched
                ? inputResponse.message
                : "Runtime could not dispatch the generated mechanic action.",
              Object.assign({}, inputResponse.evidence, {
                generatedActionId,
                generatedActionDispatched: dispatched,
              }),
              dispatched
                ? inputResponse.issues
                : [
                    {
                      code: "generated_action_probe_unavailable",
                      path: "runtime.generatedMechanic.action",
                      message:
                        "Expected the generated mechanic session to accept the routed action.",
                    },
                  ]
            );
          },
          function (error) {
            emitValidationEvidence(
              "input_response",
              "failed",
              "Generated mechanic action failed during first-playable validation.",
              Object.assign({}, inputResponse.evidence, {
                generatedActionId,
                generatedActionDispatched: false,
              }),
              [
                {
                  code: "generated_action_probe_failed",
                  path: "runtime.generatedMechanic.action",
                  message: getErrorMessage(error),
                },
              ]
            );
            mechanicsModule.reportGeneratedLogicalActionFailure(error);
          }
        );
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

      const game = runtimeState.game;
      const activeScene = runtimeState.activeScene;

      config.viewport.width = Math.max(1, Math.round(nextViewport.width));
      config.viewport.height = Math.max(1, Math.round(nextViewport.height));
      config.viewport.scaling = "stretch_to_fill";

      if (game && game.scale) {
        game.scale.resize(config.viewport.width, config.viewport.height);
      }

      if (activeScene && activeScene.physics) {
        activeScene.physics.world.setBounds(
          32,
          32,
          config.viewport.width - 64,
          config.viewport.height - 64
        );
        activeScene.cameras.main.setSize(
          config.viewport.width,
          config.viewport.height
        );
      }
    }

    function setPaused(nextIsPaused) {
      const game = runtimeState.game;

      if (!game || runtimeState.isPaused === nextIsPaused) {
        return;
      }

      runtimeState.isPaused = nextIsPaused;

      if (runtimeState.isPaused) {
        game.scene.pause(config.sceneKey);
        return;
      }

      game.scene.resume(config.sceneKey);
    }

    function focusGameContainer() {
      const container = document.getElementById("game");
      if (container) {
        container.focus();
      }
    }

    function registerHostCommandListeners() {
      window.addEventListener("message", function (event) {
        const authorizeCommand =
          globalThis.__AICADE_RUNTIME_AUTHORIZE_COMMAND__;
        const command =
          typeof authorizeCommand === "function"
            ? authorizeCommand(event)
            : event.data;

        if (!command || typeof command !== "object") {
          return;
        }

        if (command.type === "game-reload") {
          location.reload();
        }

        if (command.type === "game-focus") {
          focusGameContainer();
        }

        if (command.type === "game-pause") {
          setPaused(Boolean(command.paused));
        }

        if (command.type === "game-resize") {
          applyHostViewport(command.viewport);
        }

        if (command.type === "game-run-first-playable-checks") {
          runFirstPlayableChecks(command.actionId);
        }
      });

      window.addEventListener("keydown", function (event) {
        if (
          !event ||
          event.isTrusted !== true ||
          event.repeat === true ||
          runtimeState.isPaused ||
          typeof event.key !== "string"
        ) {
          return;
        }
        const dispatchedActionIds = new Set();
        config.controls.forEach(function (control) {
          if (
            !control ||
            typeof control.action !== "string" ||
            !Array.isArray(control.keys) ||
            (!control.keys.includes(event.key) &&
              (typeof event.code !== "string" ||
                !control.keys.includes(event.code))) ||
            dispatchedActionIds.has(control.action)
          ) {
            return;
          }
          dispatchedActionIds.add(control.action);
          void mechanicsModule
            .dispatchGeneratedLogicalAction(control.action)
            .catch(function (error) {
              mechanicsModule.reportGeneratedLogicalActionFailure(error);
            });
        });
      });
    }

    function registerTeardownListener() {
      window.addEventListener("beforeunload", function () {
        mechanicsModule.disposeGeneratedMechanic();
        mechanicsModule.disposeInstalledMechanics();

        if (runtimeState.game) {
          runtimeState.game.destroy(true);
        }
      });
    }

    return {
      registerHostCommandListeners,
      registerTeardownListener,
    };
  }

  function createTopDownScene(config, runtimeState, modules) {
    return {
      key: config.sceneKey,
      preload() {},
      create() {
        runtimeState.activeScene = {
          cameras: this.cameras,
          physics: this.physics,
        };
        this.cameras.main.setBackgroundColor("#10171e");
        this.physics.world.setBounds(
          0,
          0,
          config.viewport.width,
          config.viewport.height
        );

        this.add
          .rectangle(
            config.viewport.width / 2,
            config.viewport.height / 2,
            Math.max(1, config.arena.width || config.viewport.width),
            Math.max(1, config.arena.height || config.viewport.height),
            0x18242f
          )
          .setStrokeStyle(2, 0x6ee7b7, 0.5);

        this.add.text(
          40,
          24,
          config.gameSpec.title || config.template.title || "Top-Down Chase",
          {
            color: "#f8f4ee",
            fontFamily: "Arial, sans-serif",
            fontSize: "18px",
          }
        );
        modules.objectiveModule.bindScoreText(
          this.add.text(40, 50, config.objectiveLabel + ": 0", {
            color: "#f6c46b",
            fontFamily: "Arial, sans-serif",
            fontSize: "16px",
          })
        );

        modules.entityModule.resetEntityState();
        modules.objectiveModule.resetObjectiveState();

        const staticLayoutBodies = modules.layoutModule.createLayoutBodies(this);
        const player = modules.entityModule.createPlayer(this);
        runtimeState.playerHandle = player;
        runtimeState.renderedObjectCount =
          3 + staticLayoutBodies.length + (player ? 1 : 0);
        modules.mechanicsModule.installActiveMechanics(this, {
          staticLayoutBodies,
        });

        if (player) {
          staticLayoutBodies.forEach((body) => {
            this.physics.add.collider(player, body);
          });
        }

        const notifyReady = function (generatedSession) {
          notify("game-ready", {
            manifest: {
              title:
                config.gameSpec.title ||
                config.template.title ||
                "Top-Down Chase",
              runtime: "phaser",
              ...(generatedSession
                ? { generatedMechanic: generatedSession.identity }
                : {}),
            },
            viewport: config.viewport,
          });
        };
        const generatedInstall =
          modules.mechanicsModule.installGeneratedMechanic(this);
        if (generatedInstall) {
          generatedInstall.then(notifyReady, function (error) {
            modules.reporter.reportFatalRuntimeFailure(
              "Generated mechanic activation failed: " +
                getErrorMessage(error)
            );
          });
        } else {
          notifyReady(null);
        }
      },
      update(_time, delta) {
        modules.mechanicsModule.updateInstalledMechanics();
        modules.mechanicsModule.updateGeneratedMechanic(delta);
      },
    };
  }

  function bootTopDownRuntime() {
    const config = createRuntimeConfig(globalThis.__AICADE_PHASER_TEMPLATE__);
    const runtimeState = createRuntimeState();
    const reporter = createRuntimeReporter();
    const entityLookup = createEntityLookupModule(config.gameSpec, config.layout);
    const mathModule = createMathModule();
    const layoutModule = createLayoutModule(config, entityLookup, mathModule);
    const entityModule = createEntityModule(config, entityLookup, layoutModule);
    const objectiveModule = buildObjectiveModule(config);
    const mechanicsModule = createMechanicLifecycleModule({
      config,
      entityModule,
      layoutModule,
      mathModule,
      objectiveModule,
      reporter,
      runtimeState,
    });
    const hostProtocolModule = createHostProtocolModule(
      config,
      runtimeState,
      mechanicsModule
    );

    if (!globalThis.Phaser) {
      throw new Error("Phaser runtime dependency is unavailable.");
    }

    runtimeState.game = new Phaser.Game({
      type: Phaser.AUTO,
      width: config.viewport.width,
      height: config.viewport.height,
      parent: "game",
      backgroundColor: "#10171e",
      physics: {
        default: "arcade",
        arcade: {
          debug: false,
        },
      },
      scene: createTopDownScene(config, runtimeState, {
        entityModule,
        layoutModule,
        mechanicsModule,
        objectiveModule,
        reporter,
      }),
    });

    hostProtocolModule.registerHostCommandListeners();
    hostProtocolModule.registerTeardownListener();
  }

  try {
    bootTopDownRuntime();
  } catch (error) {
    notify("game-error", {
      message: getErrorMessage(error),
    });
  }
})();
