import {
  parseRuntimeEvent,
  type RuntimeAdapter,
} from "@/runtime/runtime-adapter";

import type { HandAuthoredPhaserTemplate } from "./top-down-template";

const PHASER_ARCADE_RUNTIME_PATH =
  "/runtime/phaser/phaser-arcade-physics.min.js";

function escapeJsonForScript(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function createPhaserRuntimeDocument(
  template: HandAuthoredPhaserTemplate
) {
  const templateJson = escapeJsonForScript(template);

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
        background: #10171e;
        color: white;
        font-family: Aptos, Segoe UI, sans-serif;
      }

      #game {
        width: 100%;
        height: 100%;
        outline: none;
      }

      #game canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="game" tabindex="0"></div>
    <script>
      globalThis.__AICADE_PHASER_TEMPLATE__ = ${templateJson};
    </script>
    <script>
      (function () {
        function notifyPhaserError(message) {
          parent.postMessage({
            type: "game-error",
            message: message || "Phaser runtime crashed before boot."
          }, "*");
        }

        window.addEventListener("error", function (event) {
          notifyPhaserError(event && event.message ? event.message : "Phaser runtime crashed.");
        });

        window.addEventListener("unhandledrejection", function (event) {
          const reason = event && event.reason;
          notifyPhaserError(reason && reason.message ? reason.message : String(reason || "Phaser runtime promise rejected."));
        });
      })();
    </script>
    <script src="${PHASER_ARCADE_RUNTIME_PATH}"></script>
    <script src="${template.runtimeScriptPath}"></script>
  </body>
</html>`;
}

export const phaserRuntimeAdapter: RuntimeAdapter<HandAuthoredPhaserTemplate> =
  {
    kind: "phaser",
    createMountDescriptor(template) {
      return {
        title: template.title,
        sandbox: "allow-scripts",
        srcDoc: createPhaserRuntimeDocument(template),
      };
    },
    parseEvent: parseRuntimeEvent,
  };
