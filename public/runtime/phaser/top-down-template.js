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
  const runtimeInstallerKeys = {
    enemy_chase: "install_enemy_chase",
    pickup_collection: "install_pickup_collection",
    player_movement: "install_player_movement",
  };
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

  function getRandomPointInZone(zone, fallback) {
    if (!zone || !globalThis.Phaser) {
      return fallback;
    }

    return {
      x: Phaser.Math.Between(zone.x, zone.x + zone.width),
      y: Phaser.Math.Between(zone.y, zone.y + zone.height),
    };
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
    const objectiveStart = getZoneCenter(findFirstPickupZone(), {
      x: viewport.width - 180,
      y: 150,
    });
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
    });
    objective.setPosition(nextPoint.x, nextPoint.y);
  }

  function installPlayerMovement(context) {
    const cursors = context.scene.input.keyboard.createCursorKeys();
    const configuredSpeed =
      context.mechanic &&
      context.mechanic.config &&
      typeof context.mechanic.config.speed === "number"
        ? context.mechanic.config.speed
        : 220;

    return {
      update() {
        if (!player) {
          return;
        }

        const velocity = new Phaser.Math.Vector2(0, 0);

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
  }

  function installPickupCollection(context) {
    createObjective(context.scene);
    context.scene.physics.add.overlap(player, objective, collectObjective);

    return {};
  }

  function installEnemyChase(context) {
    createChaser(context.scene);

    context.staticLayoutBodies.forEach(function (body) {
      context.scene.physics.add.collider(chaser, body);
    });

    context.scene.physics.add.overlap(player, chaser, function () {
      score = 0;
      scoreText.setText(objectiveLabel + ": 0");
      player.setPosition(playerStart.x, playerStart.y);
      chaser.setPosition(chaserStart.x, chaserStart.y);
    });

    const configuredSpeed =
      context.mechanic &&
      context.mechanic.config &&
      typeof context.mechanic.config.speed === "number"
        ? context.mechanic.config.speed
        : 96;

    return {
      update() {
        if (!player || !chaser) {
          return;
        }

        context.scene.physics.moveToObject(chaser, player, configuredSpeed);
      },
    };
  }

  const runtimeMechanicInstallers = {
    install_enemy_chase: installEnemyChase,
    install_pickup_collection: installPickupCollection,
    install_player_movement: installPlayerMovement,
  };

  function installActiveMechanic(scene, type, contextExtras) {
    const mechanic = findActiveMechanic(type);

    if (!mechanic) {
      return null;
    }

    const installerKey = runtimeInstallerKeys[mechanic.type];
    const installer = runtimeMechanicInstallers[installerKey];

    if (!installer) {
      return null;
    }

    try {
      const installed = installer({
        mechanic,
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
