import { describe, expect, it } from "vitest";

import { createValidatedGamePackFixture } from "@/game-spec/game-pack/testing/game-pack-fixtures";
import { topDownPhaserTemplate } from "@/runtime/phaser";

import { createPlayableDraftSource } from "./playable-draft-source";

describe("createPlayableDraftSource", () => {
  it("resolves a fixture draft with explicit ready and persistence policies", () => {
    const source = createPlayableDraftSource({
      generationSource: "phaser-fixture",
      phaserTemplateState: {
        status: "valid",
        template: topDownPhaserTemplate,
      },
      runtimeMode: "phaser",
    });

    expect(source).toMatchObject({
      persistencePolicy: "persist-after-first-playable",
      readyPolicy: "ready-on-runtime-ready",
      runFirstPlayableChecksOnReady: true,
      source: "fixture",
      sourceKey: topDownPhaserTemplate.id,
      template: topDownPhaserTemplate,
      type: "phaser",
      validationSource: {
        gameSpec: topDownPhaserTemplate.gameSpec,
        runtimeCandidate: {
          runtimeDependencyScriptPaths:
            topDownPhaserTemplate.runtimeDependencyScriptPaths,
          runtimeKind: "phaser",
          runtimeScriptPath: topDownPhaserTemplate.runtimeScriptPath,
          templateId: topDownPhaserTemplate.gameSpec.template.id,
        },
        runtimeKind: "phaser",
        source: "fixture",
      },
    });
  });

  it("resolves a generated spec draft without durable Game Pack state", () => {
    const generatedSpec = {
      ...topDownPhaserTemplate.gameSpec,
      title: "Generated Crystal Draft",
    };
    const source = createPlayableDraftSource({
      generatedSpecDraft: {
        metadata: {
          attemptCount: 2,
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
        runtimeKind: "phaser",
        spec: generatedSpec,
      },
      generationSource: "phaser-ai",
      runtimeMode: "phaser",
    });

    expect(source).toMatchObject({
      persistencePolicy: "do-not-persist",
      readyPolicy: "ready-after-first-playable",
      runFirstPlayableChecksOnReady: true,
      source: "generated-spec",
      sourceKey: [
        `${generatedSpec.id}-phaser-template`,
        "spec_generation.primary",
        "gpt-5.4-mini",
        2,
      ].join("-"),
      template: {
        gameSpec: generatedSpec,
        title: "Generated Crystal Draft",
      },
      type: "phaser",
      validationSource: {
        gameSpec: generatedSpec,
        source: "generated-spec",
      },
    });
    expect(source).not.toHaveProperty("validationSource.gamePack");
  });

  it("resolves a restored Game Pack draft with its existing lineage", () => {
    const restoredGamePack = createValidatedGamePackFixture({
      gameSpec: topDownPhaserTemplate.gameSpec,
    });
    const source = createPlayableDraftSource({
      generationSource: "phaser-ai",
      restoredGamePack,
      runtimeMode: "phaser",
    });

    expect(source).toMatchObject({
      persistencePolicy: "reuse-restored-game-pack",
      readyPolicy: "ready-on-runtime-ready",
      runFirstPlayableChecksOnReady: true,
      source: "restored-game-pack",
      template: {
        gameSpec: topDownPhaserTemplate.gameSpec,
        title: topDownPhaserTemplate.title,
      },
      type: "phaser",
      validationSource: {
        gamePack: restoredGamePack,
        gameSpec: topDownPhaserTemplate.gameSpec,
        source: "restored-game-pack",
      },
    });
  });

  it("blocks invalid generated specs without falling back to the fixture", () => {
    const invalidGeneratedSpec = {
      ...topDownPhaserTemplate.gameSpec,
      objectives: topDownPhaserTemplate.gameSpec.objectives.map(
        (objective) => ({
          ...objective,
          primary: false,
        })
      ),
      title: "Generated Invalid Draft",
    };

    expect(
      createPlayableDraftSource({
        generatedSpecDraft: {
          metadata: {
            attemptCount: 1,
            model: "gpt-5.4-mini",
            taskRoute: "spec_generation.primary",
          },
          runtimeKind: "phaser",
          spec: invalidGeneratedSpec,
        },
        generationSource: "phaser-ai",
        runtimeMode: "phaser",
      })
    ).toEqual({
      type: "blocked",
      issues: [
        {
          path: "objectives",
          message: "Expected exactly one primary objective.",
        },
      ],
      message: "Expected exactly one primary objective.",
    });
  });

  it("blocks invalid restored Game Packs", () => {
    const invalidRestoredSpec = {
      ...topDownPhaserTemplate.gameSpec,
      objectives: topDownPhaserTemplate.gameSpec.objectives.map(
        (objective) => ({
          ...objective,
          primary: false,
        })
      ),
    };
    const restoredGamePack = createValidatedGamePackFixture({
      gameSpec: invalidRestoredSpec,
    });

    expect(
      createPlayableDraftSource({
        generationSource: "phaser-ai",
        restoredGamePack,
        runtimeMode: "phaser",
      })
    ).toEqual({
      type: "blocked",
      issues: [
        {
          path: "objectives",
          message: "Expected exactly one primary objective.",
        },
      ],
      message: "Expected exactly one primary objective.",
    });
  });

  it("keeps Phaser AI idle in a pending generation state", () => {
    expect(
      createPlayableDraftSource({
        generationSource: "phaser-ai",
        runtimeMode: "phaser",
      })
    ).toEqual({
      type: "pending-generation",
    });
  });

  it("resolves Canvas runtime mode without Phaser source policy", () => {
    expect(
      createPlayableDraftSource({
        runtimeMode: "canvas2d",
      })
    ).toEqual({
      type: "canvas",
    });
  });
});
