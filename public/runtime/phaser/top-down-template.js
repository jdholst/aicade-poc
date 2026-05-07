(function () {
  const viewport = { width: 960, height: 540, scaling: "stretch_to_fill" };
  let game = null;
  let player = null;
  let objective = null;
  let chaser = null;
  let cursors = null;
  let scoreText = null;
  let score = 0;

  function notify(type, payload) {
    parent.postMessage(Object.assign({ type }, payload || {}), "*");
  }

  function createPlayer(scene) {
    player = scene.add.rectangle(160, 270, 34, 34, 0x6ee7b7);
    scene.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);
    return player;
  }

  function createObjective(scene) {
    objective = scene.add.star(780, 150, 5, 10, 22, 0xf6c46b);
    scene.physics.add.existing(objective);
    objective.body.setAllowGravity(false);
    return objective;
  }

  function createChaser(scene) {
    chaser = scene.add.circle(780, 405, 18, 0xa9482a);
    scene.physics.add.existing(chaser);
    chaser.body.setCollideWorldBounds(true);
    return chaser;
  }

  function collectObjective() {
    score += 1;
    scoreText.setText("Crystals: " + score);
    objective.setPosition(
      Phaser.Math.Between(96, viewport.width - 96),
      Phaser.Math.Between(96, viewport.height - 96)
    );
  }

  function createScene() {
    return {
      preload() {},
      create() {
        this.cameras.main.setBackgroundColor("#10171e");
        this.physics.world.setBounds(
          32,
          32,
          viewport.width - 64,
          viewport.height - 64
        );

        this.add
          .rectangle(
            viewport.width / 2,
            viewport.height / 2,
            viewport.width - 64,
            viewport.height - 64,
            0x18242f
          )
          .setStrokeStyle(2, 0x6ee7b7, 0.5);

        this.add.text(40, 24, "Top-Down Chase", {
          color: "#f8f4ee",
          fontFamily: "Arial, sans-serif",
          fontSize: "18px",
        });
        scoreText = this.add.text(40, 50, "Crystals: 0", {
          color: "#f6c46b",
          fontFamily: "Arial, sans-serif",
          fontSize: "16px",
        });

        createPlayer(this);
        createObjective(this);
        createChaser(this);
        cursors = this.input.keyboard.createCursorKeys();

        this.physics.add.overlap(player, objective, collectObjective);
        this.physics.add.overlap(player, chaser, () => {
          score = 0;
          scoreText.setText("Crystals: 0");
          player.setPosition(160, 270);
          chaser.setPosition(780, 405);
        });

        notify("game-ready", {
          manifest: {
            title: "Top-Down Chase",
            runtime: "phaser",
          },
          viewport,
        });
      },
      update() {
        if (!player || !chaser || !cursors) {
          return;
        }

        const speed = 220;
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

        velocity.normalize().scale(speed);
        player.body.setVelocity(velocity.x, velocity.y);

        this.physics.moveToObject(chaser, player, 96);
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

    window.addEventListener("beforeunload", function () {
      if (game) {
        game.destroy(true);
      }
    });
  } catch (error) {
    notify("game-error", {
      message: error && error.message ? error.message : String(error),
    });
  }
})();
