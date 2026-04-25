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
${generatedSource}
    </script>
    <script>
      (function () {
        const canvas = document.getElementById("game");
        const ctx = canvas.getContext("2d");
        const controls = Array.isArray(globalThis.__AICADE_MANIFEST__.controls)
          ? globalThis.__AICADE_MANIFEST__.controls
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
        let lastFrame = performance.now();
        let isRunning = false;

        function notify(type, payload) {
          parent.postMessage(Object.assign({ type }, payload || {}), "*");
        }

        function normalizeDelta(now) {
          const delta = Math.min(48, now - lastFrame) / 1000;
          lastFrame = now;
          return delta;
        }

        function resize() {
          const rect = canvas.getBoundingClientRect();
          const dpr = globalThis.devicePixelRatio || 1;
          canvas.width = Math.max(1, Math.round(rect.width));
          canvas.height = Math.max(1, Math.round(rect.height));
          ctx.setTransform(1, 0, 0, 1, 0, 0);

          if (game && typeof game.resize === "function") {
            game.resize(rect.width, rect.height, dpr);
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
            game.render(ctx);
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
            if (!ctx) {
              throw new Error("Canvas 2D context is unavailable.");
            }

            if (typeof globalThis.createGameModule !== "function") {
              throw new Error("Generated module did not register createGameModule.");
            }

            game = globalThis.createGameModule({
              canvas,
              ctx,
              spec: JSON.parse(JSON.stringify(globalThis.__AICADE_SPEC__))
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
            notify("game-ready", { manifest: globalThis.__AICADE_MANIFEST__ });
            animationFrame = requestAnimationFrame(tick);
          } catch (error) {
            notify("game-error", {
              message: error && error.message ? error.message : String(error)
            });
          }
        }

        canvas.addEventListener("pointerdown", function () {
          canvas.focus();
        });
        window.addEventListener("resize", resize, { passive: true });
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
    onStatusChange?.({
      state: "loading",
      message: "Booting generated canvas module...",
    });

    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (event.data?.type === "game-ready") {
        onStatusChange?.({
          state: "ready",
          message: "Generated module is running in the sandbox.",
        });
      }

      if (event.data?.type === "game-error") {
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
    return () => window.removeEventListener("message", handleMessage);
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
