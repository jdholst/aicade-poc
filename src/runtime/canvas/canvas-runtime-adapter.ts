import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";
import { createCanvasRuntimeDocument } from "@/runtime/canvas";

import {
  parseRuntimeEvent,
  type RuntimeAdapter,
} from "@/runtime/runtime-adapter";

export const canvasRuntimeAdapter: RuntimeAdapter<GeneratedGamePack> = {
  kind: "canvas2d",
  createMountDescriptor(pack) {
    return {
      title: pack.manifest.title,
      sandbox: "allow-scripts",
      srcDoc: createCanvasRuntimeDocument(pack),
    };
  },
  parseEvent: parseRuntimeEvent,
};
