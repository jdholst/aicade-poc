import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";
import {
  GENERATED_GAME_FACTORY_NAME,
  GENERATED_GAME_REQUIRED_METHODS,
} from "@/service/starter-project/generated-game-contract";

export type GeneratedGameSandboxCommand =
  | { type: "game-focus" }
  | { type: "game-reload" }
  | { type: "game-pause"; paused: boolean };

export type GeneratedGameSandboxEvent =
  | { type: "game-ready" }
  | { type: "game-error"; message: string };

export function parseGeneratedGameSandboxEvent(
  data: unknown
): GeneratedGameSandboxEvent | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const event = data as { type?: unknown; message?: unknown };
  if (event.type === "game-ready") {
    return { type: "game-ready" };
  }

  if (event.type === "game-error") {
    return {
      type: "game-error",
      message:
        typeof event.message === "string"
          ? event.message
          : "Generated module crashed.",
    };
  }

  return null;
}

export function postGeneratedGameSandboxCommand(
  target: Window | null | undefined,
  command: GeneratedGameSandboxCommand
) {
  target?.postMessage(command, "*");
}

export function focusGeneratedGameSandbox(
  iframe: HTMLIFrameElement | null | undefined
) {
  iframe?.focus();
  iframe?.contentWindow?.focus();
  postGeneratedGameSandboxCommand(iframe?.contentWindow, {
    type: "game-focus",
  });
}

export function scheduleGeneratedGameSandboxFocus(
  iframe: HTMLIFrameElement | null | undefined
) {
  const focusId = window.setTimeout(() => {
    focusGeneratedGameSandbox(iframe);
  }, 0);
  const followUpFocusId = window.setTimeout(() => {
    focusGeneratedGameSandbox(iframe);
  }, 120);

  return () => {
    window.clearTimeout(focusId);
    window.clearTimeout(followUpFocusId);
  };
}

function escapeScriptContent(source: string) {
  return source
    .replace(/<\/script/gi, "<\\/script")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function createGeneratedGameSandboxDocument(pack: GeneratedGamePack) {
  const editableSpecJson = JSON.stringify(pack.editableSpec);
  const manifestJson = JSON.stringify(pack.manifest);
  const generatedSource = escapeScriptContent(pack.moduleSourceJs);
  const requiredMethodsJson = JSON.stringify(GENERATED_GAME_REQUIRED_METHODS);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #0b1118;
        color: white;
        font-family: Aptos, Segoe UI, sans-serif;
      }

      canvas {
        display: block;
        width: 100%;
        height: 100%;
        outline: none;
      }
    </style>
  </head>
  <body>
    <canvas id="game" tabindex="0"></canvas>
    <script>
      globalThis.__AICADE_SPEC__ = ${editableSpecJson};
      globalThis.__AICADE_MANIFEST__ = ${manifestJson};
    </script>
    <script>
      (function () {
        function notifyGeneratedError(message) {
          parent.postMessage({
            type: "game-error",
            message: message || "Generated module crashed before boot."
          }, "*");
        }

        window.addEventListener("error", function (event) {
          notifyGeneratedError(event && event.message ? event.message : "Generated module crashed.");
        });

        window.addEventListener("unhandledrejection", function (event) {
          const reason = event && event.reason;
          notifyGeneratedError(reason && reason.message ? reason.message : String(reason || "Generated module promise rejected."));
        });
      })();
    </script>
    <script>
${generatedSource}
    </script>
    <script>
      (function () {
        const canvas = document.getElementById("game");
        const displayCtx = canvas.getContext("2d");
        const renderCanvas = document.createElement("canvas");
        const renderCtx = renderCanvas.getContext("2d");
        const manifest = globalThis.__AICADE_MANIFEST__ || {};
        const rawViewport = manifest.viewport || {};
        const viewport = {
          width:
            typeof rawViewport.width === "number"
              ? Math.max(1, Math.round(rawViewport.width))
              : 960,
          height:
            typeof rawViewport.height === "number"
              ? Math.max(1, Math.round(rawViewport.height))
              : 540,
          scaling: "stretch_to_fill"
        };
        const controls = Array.isArray(manifest.controls)
          ? manifest.controls
          : [];
        const input = {
          actions: {},
          rawKeys: {}
        };

        for (const control of controls) {
          if (control && typeof control.action === "string") {
            input.actions[control.action] = {
              down: false,
              pressed: false
            };
          }
        }
        let game = null;
        let animationFrame = 0;
        let displayWidth = 1;
        let displayHeight = 1;
        let lastFrame = performance.now();
        let isRunning = false;
        let isPaused = false;
        let hasStarted = false;
        let resizeObserver = null;

        function notify(type, payload) {
          parent.postMessage(Object.assign({ type }, payload || {}), "*");
        }

        function prepareRenderSurface() {
          renderCanvas.width = viewport.width;
          renderCanvas.height = viewport.height;

          if (renderCtx) {
            renderCtx.setTransform(1, 0, 0, 1, 0, 0);
          }
        }

        function normalizeDelta(now) {
          const delta = Math.min(48, now - lastFrame) / 1000;
          lastFrame = now;
          return delta;
        }

        function resize() {
          const rect = canvas.getBoundingClientRect();
          const nextDisplayWidth = Math.max(1, Math.round(rect.width));
          const nextDisplayHeight = Math.max(1, Math.round(rect.height));

          if (
            nextDisplayWidth === displayWidth &&
            nextDisplayHeight === displayHeight &&
            canvas.width === displayWidth &&
            canvas.height === displayHeight &&
            renderCanvas.width === viewport.width &&
            renderCanvas.height === viewport.height
          ) {
            return;
          }

          displayWidth = nextDisplayWidth;
          displayHeight = nextDisplayHeight;
          canvas.width = displayWidth;
          canvas.height = displayHeight;
          prepareRenderSurface();

          if (displayCtx) {
            displayCtx.setTransform(1, 0, 0, 1, 0, 0);
          }

          if (hasStarted && game && typeof game.resize === "function") {
            game.resize(viewport.width, viewport.height, 1);
          }
        }

        function tick(now) {
          if (!isRunning || isPaused) {
            return;
          }

          try {
            const dt = normalizeDelta(now);
            game.update(dt, input);
            for (const actionName in input.actions) {
              input.actions[actionName].pressed = false;
            }
            game.render(renderCtx);

            displayCtx.clearRect(0, 0, displayWidth, displayHeight);
            displayCtx.drawImage(
              renderCanvas,
              0,
              0,
              viewport.width,
              viewport.height,
              0,
              0,
              displayWidth,
              displayHeight
            );

            animationFrame = requestAnimationFrame(tick);
          } catch (error) {
            isRunning = false;
            notify("game-error", {
              message: error && error.message ? error.message : String(error)
            });
          }
        }

        function setPaused(nextIsPaused) {
          if (!isRunning || isPaused === nextIsPaused) {
            return;
          }

          isPaused = nextIsPaused;

          if (isPaused) {
            cancelAnimationFrame(animationFrame);
            return;
          }

          lastFrame = performance.now();
          animationFrame = requestAnimationFrame(tick);
        }

        function setKey(code, isDown, repeat) {
          input.rawKeys[code] = isDown;

          let handled = false;

          for (const control of controls) {
            if (
              !control ||
              !Array.isArray(control.keys) ||
              !control.keys.includes(code)
            ) {
              continue;
            }

            const actionState = input.actions[control.action];
            if (!actionState) {
              continue;
            }

            handled = true;

            if (control.kind === "toggle") {
              if (isDown && !repeat) {
                actionState.down = !actionState.down;
                actionState.pressed = true;
              }
              continue;
            }

            actionState.down = isDown;

            if (isDown && !repeat) {
              actionState.pressed = true;
            }
          }

          return handled;
        }

        function boot() {
          try {
            if (!displayCtx || !renderCtx) {
              throw new Error("Canvas 2D context is unavailable.");
            }

            if (typeof globalThis.${GENERATED_GAME_FACTORY_NAME} !== "function") {
              throw new Error("Generated module did not register ${GENERATED_GAME_FACTORY_NAME}.");
            }

            prepareRenderSurface();

            game = globalThis.${GENERATED_GAME_FACTORY_NAME}({
              canvas: renderCanvas,
              ctx: renderCtx,
              spec: JSON.parse(JSON.stringify(globalThis.__AICADE_SPEC__)),
              viewport: JSON.parse(JSON.stringify(viewport))
            });

            const requiredMethods = ${requiredMethodsJson};

            for (const method of requiredMethods) {
              if (!game || typeof game[method] !== "function") {
                throw new Error("Generated module is missing " + method + "().");
              }
            }

            resize();
            game.start();
            hasStarted = true;
            game.resize(viewport.width, viewport.height, 1);
            isRunning = true;
            notify("game-ready", {
              manifest: globalThis.__AICADE_MANIFEST__,
              viewport
            });
            resize();
            animationFrame = requestAnimationFrame(tick);
            requestAnimationFrame(resize);
            requestAnimationFrame(function () {
              resize();
            });
          } catch (error) {
            notify("game-error", {
              message: error && error.message ? error.message : String(error)
            });
          }
        }

        canvas.addEventListener("pointerdown", function () {
          canvas.focus();
        });
        if (typeof ResizeObserver === "function") {
          resizeObserver = new ResizeObserver(function () {
            resize();
          });
          resizeObserver.observe(canvas);
          resizeObserver.observe(document.body);
        }
        window.addEventListener("resize", resize, { passive: true });
        window.addEventListener("load", resize, { passive: true });
        window.addEventListener("keydown", function (event) {
          if (setKey(event.code, true, event.repeat)) {
            event.preventDefault();
          }
        });
        window.addEventListener("keyup", function (event) {
          if (setKey(event.code, false, false)) {
            event.preventDefault();
          }
        });
        window.addEventListener("message", function (event) {
          if (event.data && event.data.type === "game-reload") {
            location.reload();
          }

          if (event.data && event.data.type === "game-pause") {
            setPaused(Boolean(event.data.paused));
          }

          if (event.data && event.data.type === "game-focus") {
            canvas.focus();
          }
        });
        window.addEventListener("beforeunload", function () {
          isRunning = false;
          isPaused = false;
          hasStarted = false;
          cancelAnimationFrame(animationFrame);
          if (resizeObserver) {
            resizeObserver.disconnect();
          }
          if (game && typeof game.destroy === "function") {
            game.destroy();
          }
        });

        boot();
      })();
    </script>
  </body>
</html>`;
}

