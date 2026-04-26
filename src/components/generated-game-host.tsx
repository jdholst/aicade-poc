"use client";

import { useEffect, useMemo, useRef } from "react";

import { GeneratedGamePack } from "@/lib/starter-project";

export type GeneratedGameStatus =
  | { state: "loading"; message: string }
  | { state: "ready"; message: string }
  | { state: "error"; message: string };

type GeneratedGameHostProps = {
  pack: GeneratedGamePack;
  onStatusChange?: (status: GeneratedGameStatus) => void;
};

const SANDBOX_BOOT_TIMEOUT_MS = 12_000;

function escapeScriptContent(source: string) {
  return source
    .replace(/<\/script/gi, "<\\/script")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function createIframeDocument(pack: GeneratedGamePack) {
  const editableSpecJson = JSON.stringify(pack.editableSpec);
  const manifestJson = JSON.stringify(pack.manifest);
  const generatedSource = escapeScriptContent(pack.moduleSourceJs);

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

          if (game && typeof game.resize === "function") {
            game.resize(viewport.width, viewport.height, 1);
          }
        }

        function tick(now) {
          if (!isRunning) {
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

            if (typeof globalThis.createGameModule !== "function") {
              throw new Error("Generated module did not register createGameModule.");
            }

            prepareRenderSurface();

            game = globalThis.createGameModule({
              canvas: renderCanvas,
              ctx: renderCtx,
              spec: JSON.parse(JSON.stringify(globalThis.__AICADE_SPEC__)),
              viewport: JSON.parse(JSON.stringify(viewport))
            });

            const requiredMethods = [
              "start",
              "update",
              "render",
              "resize",
              "destroy",
              "getEditableSpec",
              "applyPatch"
            ];

            for (const method of requiredMethods) {
              if (!game || typeof game[method] !== "function") {
                throw new Error("Generated module is missing " + method + "().");
              }
            }

            resize();
            game.start();
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
        });
        window.addEventListener("beforeunload", function () {
          isRunning = false;
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

export function GeneratedGameHost({
  pack,
  onStatusChange,
}: GeneratedGameHostProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const srcDoc = useMemo(() => createIframeDocument(pack), [pack]);

  useEffect(() => {
    let hasSettled = false;

    onStatusChange?.({
      state: "loading",
      message: "Booting generated canvas module...",
    });

    const timeoutId = window.setTimeout(() => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      onStatusChange?.({
        state: "error",
        message:
          "The generated sandbox did not finish booting. Regenerate the game to request a fresh module.",
      });
    }, SANDBOX_BOOT_TIMEOUT_MS);

    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (event.data?.type === "game-ready") {
        hasSettled = true;
        window.clearTimeout(timeoutId);
        onStatusChange?.({
          state: "ready",
          message: "Generated module is running in the sandbox.",
        });
      }

      if (event.data?.type === "game-error") {
        hasSettled = true;
        window.clearTimeout(timeoutId);
        onStatusChange?.({
          state: "error",
          message:
            typeof event.data.message === "string"
              ? event.data.message
              : "Generated module crashed.",
        });
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      hasSettled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
    };
  }, [onStatusChange, pack]);

  return (
    <div className="relative flex h-full min-h-[360px] w-full flex-col overflow-hidden border border-[var(--line-strong)] bg-[#0d1721]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0b1118] px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/60">
        <span>Generated canvas</span>
        <span>Sandboxed iframe</span>
      </div>
      <iframe
        ref={iframeRef}
        title={pack.manifest.title}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        className="h-full min-h-[360px] w-full flex-1 border-0"
      />
    </div>
  );
}
