import { describe, expect, it } from "vitest";

import { createValidatedGamePackFixture } from "@/game-spec/game-pack/testing/game-pack-fixtures";
import { createGeneratedMechanicProjectFixture } from "@/game-spec/game-pack/testing/generated-mechanic-project-fixtures";
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

  it("resolves a generated spec draft with pass-gated persistence metadata", () => {
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
      persistencePolicy: "persist-after-first-playable",
      readyPolicy: "ready-after-first-playable",
      runFirstPlayableChecksOnReady: true,
      source: "generated-spec",
      sourceKey: expect.stringMatching(
        /^game_crystal_spec_chase-phaser-template-spec-[a-z0-9]+-spec_generation\.primary-gpt-5\.4-mini-2$/
      ),
      template: {
        gameSpec: generatedSpec,
        title: "Generated Crystal Draft",
      },
      type: "phaser",
      validationSource: {
        generatedSpecMetadata: {
          attemptCount: 2,
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
        gameSpec: generatedSpec,
        source: "generated-spec",
      },
    });
    expect(source).not.toHaveProperty("validationSource.gamePack");
  });

  it("uses generated spec content in the draft key", () => {
    const sharedMetadata = {
      attemptCount: 1,
      model: "gpt-5.4-mini" as const,
      taskRoute: "spec_generation.primary",
    };
    const firstSource = createPlayableDraftSource({
      generatedSpecDraft: {
        metadata: sharedMetadata,
        runtimeKind: "phaser",
        spec: {
          ...topDownPhaserTemplate.gameSpec,
          title: "Generated Crystal Draft",
        },
      },
      generationSource: "phaser-ai",
      runtimeMode: "phaser",
    });
    const regeneratedSource = createPlayableDraftSource({
      generatedSpecDraft: {
        metadata: sharedMetadata,
        runtimeKind: "phaser",
        spec: {
          ...topDownPhaserTemplate.gameSpec,
          title: "Regenerated Crystal Draft",
        },
      },
      generationSource: "phaser-ai",
      runtimeMode: "phaser",
    });

    expect(firstSource).toMatchObject({
      source: "generated-spec",
      sourceKey: expect.stringMatching(
        /^game_crystal_spec_chase-phaser-template-spec-[a-z0-9]+-spec_generation\.primary-gpt-5\.4-mini-1$/
      ),
      type: "phaser",
    });
    expect(regeneratedSource).toMatchObject({
      source: "generated-spec",
      sourceKey: expect.stringMatching(
        /^game_crystal_spec_chase-phaser-template-spec-[a-z0-9]+-spec_generation\.primary-gpt-5\.4-mini-1$/
      ),
      type: "phaser",
    });
    expect(firstSource).toHaveProperty("sourceKey");
    expect(regeneratedSource).toHaveProperty("sourceKey");
    if (firstSource.type !== "phaser" || regeneratedSource.type !== "phaser") {
      throw new Error("Expected generated specs to resolve to Phaser drafts.");
    }
    expect(firstSource.sourceKey).not.toBe(regeneratedSource.sourceKey);
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

  it("restores the exact accepted generated mechanic as an out-of-band project dependency", () => {
    const fixture = createGeneratedMechanicProjectFixture();

    const source = createPlayableDraftSource({
      generationSource: "phaser-ai",
      restoredGamePack: fixture.gamePack,
      runtimeMode: "phaser",
    });

    expect(source).toMatchObject({
      type: "phaser",
      source: "restored-game-pack",
      generatedMechanicProject: {
        artifact: fixture.artifact,
        dependency: fixture.dependency,
      },
      sourceKey: expect.stringContaining(fixture.artifact.id),
      template: {
        gameSpec: fixture.dependency.finalGameSpec.gameSpec,
      },
    });
  });

  it("mounts the freshly accepted Game Pack ahead of stale restored state without persisting it twice", () => {
    const fixture = createGeneratedMechanicProjectFixture();
    const staleRestoredGamePack = createValidatedGamePackFixture({
      gameSpec: topDownPhaserTemplate.gameSpec,
    });

    const source = createPlayableDraftSource({
      activeGamePack: fixture.gamePack,
      generationSource: "phaser-ai",
      restoredGamePack: staleRestoredGamePack,
      runtimeMode: "phaser",
    });

    expect(source).toMatchObject({
      type: "phaser",
      source: "accepted-game-pack",
      persistencePolicy: "do-not-persist",
      generatedMechanicProject: {
        artifact: fixture.artifact,
        dependency: fixture.dependency,
      },
      validationSource: {
        gamePack: fixture.gamePack,
        source: "accepted-game-pack",
      },
    });
  });

  it("blocks an unaccepted active Game Pack without falling through to a stale restored generated project", () => {
    const fixture = createGeneratedMechanicProjectFixture();
    const {
      acceptedGeneratedMechanicArtifacts: _acceptedArtifacts,
      ...unacceptedActiveGamePack
    } = fixture.gamePack;
    void _acceptedArtifacts;

    const source = createPlayableDraftSource({
      activeGamePack: unacceptedActiveGamePack,
      generationSource: "phaser-ai",
      restoredGamePack: fixture.gamePack,
      runtimeMode: "phaser",
    });

    expect(source).toMatchObject({
      type: "blocked",
    });
    expect(source).not.toHaveProperty("source");
    expect(source).not.toHaveProperty("generatedMechanicProject");
    expect(source).not.toHaveProperty("validationSource");
    expect(source).not.toHaveProperty("persistencePolicy");
  });

  it("does not let an accepted sidecar admit another unknown mechanic type", () => {
    const fixture = createGeneratedMechanicProjectFixture();
    const restoredGamePack = {
      ...fixture.gamePack,
      gameSpec: {
        ...fixture.gamePack.gameSpec,
        mechanics: [
          ...fixture.gamePack.gameSpec.mechanics,
          {
            id: "mechanic_unaccepted_unknown",
            type: "unaccepted_unknown",
            config: {},
          },
        ],
      },
    };

    expect(
      createPlayableDraftSource({
        generationSource: "phaser-ai",
        restoredGamePack,
        runtimeMode: "phaser",
      })
    ).toMatchObject({
      type: "blocked",
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
