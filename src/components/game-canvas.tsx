"use client";

import { useEffect, useRef } from "react";

import type {
  StarterBehavior,
  StarterEntity,
  StarterProjectSpec,
} from "@/service/starter-project/starter-project-schema";
import { STEP_MS, MOVE_SPEED, JUMP_SPEED } from "@/constants";

type RuntimeEntity = StarterEntity & {
  vx: number;
  vy: number;
};

type InputState = {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
};

type RuntimeState = {
  entities: RuntimeEntity[];
  cameraX: number;
  grounded: boolean;
  spawnX: number;
  spawnY: number;
};

function includesBehavior(entity: RuntimeEntity, behavior: StarterBehavior) {
  return entity.behaviors.includes(behavior);
}

function findPlayer(state: RuntimeState, spec: StarterProjectSpec) {
  return (
    state.entities.find((entity) => entity.id === spec.camera.targetId) ??
    state.entities.find((entity) => entity.kind === "player")
  );
}

function createRuntimeState(spec: StarterProjectSpec): RuntimeState {
  const entities = spec.entities.map((entity) => ({
    ...entity,
    vx: 0,
    vy: 0,
  }));

  const player =
    entities.find((entity) => entity.kind === "player") ?? entities[0];

  return {
    entities,
    cameraX: 0,
    grounded: false,
    spawnX: player.x,
    spawnY: player.y,
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function renderScene(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  spec: StarterProjectSpec,
  state: RuntimeState
) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, spec.world.background.skyTop);
  gradient.addColorStop(1, spec.world.background.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = spec.world.background.accent;
  ctx.beginPath();
  ctx.arc(width * 0.82, height * 0.18, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(-state.cameraX, 0);

  for (const entity of state.entities) {
    if (entity.kind === "ground") {
      ctx.fillStyle = entity.color;
      drawRoundedRect(ctx, entity.x, entity.y, entity.width, entity.height, 18);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(entity.x, entity.y, entity.width, 10);
      continue;
    }

    ctx.fillStyle = entity.color;
    drawRoundedRect(ctx, entity.x, entity.y, entity.width, entity.height, 18);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillRect(entity.x + 10, entity.y + 12, entity.width - 20, 6);
  }

  ctx.restore();

  ctx.fillStyle = "rgba(15, 17, 20, 0.68)";
  ctx.fillRect(16, 16, 230, 86);

  ctx.fillStyle = "rgba(255,255,255,0.76)";
  ctx.font = "600 12px var(--font-mono), monospace";
  ctx.fillText("Starter Runtime", 28, 38);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 18px var(--font-sans), sans-serif";
  ctx.fillText("Move: A / D or arrows", 28, 64);
  ctx.fillText("Jump: Space / W / Up", 28, 88);
}

function updateRuntime(
  state: RuntimeState,
  spec: StarterProjectSpec,
  input: InputState,
  viewportWidth: number,
  dt: number
) {
  const player = findPlayer(state, spec);
  if (!player) {
    return;
  }

  const solids = state.entities.filter((entity) =>
    includesBehavior(entity, "solid")
  );
  const previousBottom = player.y + player.height;

  if (includesBehavior(player, "player_move")) {
    const horizontal =
      (input.right ? 1 : 0) + (input.left ? -1 : 0);

    player.vx = horizontal * MOVE_SPEED;
  }

  if (input.jumpPressed && state.grounded && includesBehavior(player, "player_jump")) {
    player.vy = -JUMP_SPEED;
    state.grounded = false;
  }
  input.jumpPressed = false;

  if (includesBehavior(player, "gravity")) {
    player.vy += spec.world.gravity * dt;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  player.x = Math.max(0, Math.min(spec.world.width - player.width, player.x));

  let grounded = false;
  for (const solid of solids) {
    const overlapsHorizontally =
      player.x + player.width > solid.x && player.x < solid.x + solid.width;
    const overlapsVertically =
      player.y + player.height > solid.y && player.y < solid.y + solid.height;
    const wasAbove = previousBottom <= solid.y + 2;

    if (overlapsHorizontally && overlapsVertically && wasAbove && player.vy >= 0) {
      player.y = solid.y - player.height;
      player.vy = 0;
      grounded = true;
    }
  }

  if (player.y > spec.world.height + 160) {
    player.x = state.spawnX;
    player.y = state.spawnY;
    player.vx = 0;
    player.vy = 0;
  }

  state.grounded = grounded;

  const followEnabled =
    spec.camera.mode === "follow_player" &&
    includesBehavior(player, "camera_follow");

  if (followEnabled) {
    const desiredCamera =
      player.x + player.width / 2 - viewportWidth / 2;
    const maxCamera = Math.max(0, spec.world.width - viewportWidth);
    const clampedTarget = Math.max(0, Math.min(maxCamera, desiredCamera));
    const easing = Math.min(1, spec.camera.smoothing * dt);

    state.cameraX += (clampedTarget - state.cameraX) * easing;
    state.cameraX = Math.max(0, Math.min(maxCamera, state.cameraX));
  }
}

type GameCanvasProps = {
  spec: StarterProjectSpec;
};

export function GameCanvas({ spec }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const runtime = createRuntimeState(spec);
    const input: InputState = {
      left: false,
      right: false,
      jumpPressed: false,
    };

    let animationFrame = 0;
    let lastFrame = performance.now();
    let accumulator = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "KeyA", "KeyD", "KeyW"].includes(event.code)) {
        event.preventDefault();
      }

      if (event.code === "ArrowLeft" || event.code === "KeyA") {
        input.left = true;
      }
      if (event.code === "ArrowRight" || event.code === "KeyD") {
        input.right = true;
      }
      if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space") {
        if (!event.repeat) {
          input.jumpPressed = true;
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "ArrowLeft" || event.code === "KeyA") {
        input.left = false;
      }
      if (event.code === "ArrowRight" || event.code === "KeyD") {
        input.right = false;
      }
    };

    const tick = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const delta = Math.min(48, now - lastFrame);
      lastFrame = now;
      accumulator += delta;

      while (accumulator >= STEP_MS) {
        updateRuntime(runtime, spec, input, rect.width, STEP_MS / 1000);
        accumulator -= STEP_MS;
      }

      renderScene(ctx, canvas, spec, runtime);
      animationFrame = window.requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [spec]);

  return (
    <div className="relative flex h-full min-h-[360px] w-full flex-col overflow-hidden border border-[var(--line-strong)] bg-[#0d1721]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0b1118] px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/60">
        <span>Live canvas</span>
        <span>AI spec interpreted locally</span>
      </div>
      <canvas ref={canvasRef} className="h-full min-h-[360px] w-full flex-1" />
    </div>
  );
}
