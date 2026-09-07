import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const GENERAL_GENERATED_MECHANIC_PIPELINE_FILES = [
  "src/game-spec/mechanics/generated-mechanic-project-artifact.ts",
  "src/app/runtime/phaser-generated/runtime.ts",
  "src/runtime/mechanics/generated-mechanic-runtime-session.ts",
  "src/runtime/mechanics/mechanic-object-host.ts",
  "src/runtime/mechanics/mechanic-object-capability-host.ts",
  "src/runtime/phaser/top-down-mechanic-object-adapter.ts",
  "src/service/creator-generation/generated-mechanic-project-planning.ts",
  "src/service/creator-generation/generated-mechanic-browser-evaluation-fixture.ts",
  "src/service/mechanic-contract-generation/mechanic-contract-generation-prompt.ts",
  "src/service/mechanic-source-generation/mechanic-source-generation-prompt.ts",
  "src/service/mechanic-source-generation/mechanic-source-generation-service.ts",
  "src/service/mechanic-evaluation/mechanic-evaluation.ts",
  "src/service/mechanic-evaluation/mechanic-evaluation-runtime.ts",
  "public/runtime/phaser/top-down-template.js",
] as const;

const CASE_SPECIFIC_GUIDANCE =
  /\b(projectile|bullet|shoot|shooting|weapon|fire)\b/giu;

describe("generated mechanic guidance boundary", () => {
  it("keeps the shared owned-object expansion free of named evaluation-case guidance", () => {
    const leaks = GENERAL_GENERATED_MECHANIC_PIPELINE_FILES.flatMap(
      (filePath) => {
        const source = readFileSync(resolve(process.cwd(), filePath), "utf8");
        return [...source.matchAll(CASE_SPECIFIC_GUIDANCE)].map((match) => ({
          filePath,
          term: match[0].toLowerCase(),
        }));
      }
    );

    expect(leaks).toEqual([]);
  });
});
