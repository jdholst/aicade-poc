import {
  createGeneratedGameSandboxDocument,
} from "@/components/generated-game-sandbox";
import type { GeneratedGamePack } from "@/service/starter-project/starter-project-schema";

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
      srcDoc: createGeneratedGameSandboxDocument(pack),
    };
  },
  parseEvent: parseRuntimeEvent,
};
