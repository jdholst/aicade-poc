(function () {
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
    parent.postMessage(Object.assign({ type }, payload || {}), "*");
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

    return {
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
        const targetIds =
          mechanic && Array.isArray(mechanic.targetIds)
            ? mechanic.targetIds
            : [];

        for (let index = 0; index < targetIds.length; index += 1) {
          const entity = entityModule.findById(targetIds[index]);

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
          resetEntity: entityModule.resetEntityHandle,
        },
      };
    }

    function installActiveMechanic(scene, mechanic, contextExtras) {
      if (!mechanic || !mechanic.type) {
        return null;
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
      disposeInstalledMechanics,
      installActiveMechanics,
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

    function runFirstPlayableChecks() {
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

      emitValidationEvidence(
        "input_response",
        inputResponse.status,
        inputResponse.message,
        inputResponse.evidence,
        inputResponse.issues
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

        if (
          event.data &&
          event.data.type === "game-run-first-playable-checks"
        ) {
          runFirstPlayableChecks();
        }
      });
    }

    function registerTeardownListener() {
      window.addEventListener("beforeunload", function () {
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

        notify("game-ready", {
          manifest: {
            title:
              config.gameSpec.title || config.template.title || "Top-Down Chase",
            runtime: "phaser",
          },
          viewport: config.viewport,
        });
      },
      update() {
        modules.mechanicsModule.updateInstalledMechanics();
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
