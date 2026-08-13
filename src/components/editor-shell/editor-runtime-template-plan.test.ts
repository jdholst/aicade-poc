import { describe, expect, it } from "vitest";

import { createValidatedGamePackFixture } from "@/game-spec/game-pack/testing/game-pack-fixtures";
import { createGeneratedMechanicProjectFixture } from "@/game-spec/game-pack/testing/generated-mechanic-project-fixtures";
import { topDownPhaserTemplate } from "@/runtime/phaser";

import {
  createEditorRuntimeTemplatePlan,
  createPhaserRuntimeHostViewModel,
} from "./editor-runtime-template-plan";

describe("createEditorRuntimeTemplatePlan", () => {
  it("resolves Canvas mode without Phaser validation state", () => {
    expect(
      createEditorRuntimeTemplatePlan({
        runtimeMode: "canvas2d",
      })
    ).toEqual({
      firstPlayableValidationSource: null,
      type: "canvas",
    });
  });

  it("resolves a valid Phaser template with a first-playable validation source", () => {
    const plan = createEditorRuntimeTemplatePlan({
      generationSource: "phaser-fixture",
      phaserTemplateState: {
        status: "valid",
        template: topDownPhaserTemplate,
      },
      runtimeMode: "phaser",
    });

    expect(plan).toMatchObject({
      firstPlayableValidationSource: {
        gameSpec: topDownPhaserTemplate.gameSpec,
        runtimeCandidate: {
          runtimeDependencyScriptPaths:
            topDownPhaserTemplate.runtimeDependencyScriptPaths,
          runtimeKind: "phaser",
          runtimeScriptPath: topDownPhaserTemplate.runtimeScriptPath,
          templateId: topDownPhaserTemplate.gameSpec.template.id,
        },
        source: "fixture",
        runtimeKind: "phaser",
      },
      persistencePolicy: "persist-after-first-playable",
      readyPolicy: "ready-on-runtime-ready",
      runFirstPlayableChecksOnReady: true,
      template: topDownPhaserTemplate,
      type: "phaser-valid",
    });
  });

  it("resolves invalid Phaser templates without a validation source", () => {
    const plan = createEditorRuntimeTemplatePlan({
      generationSource: "phaser-fixture",
      phaserTemplateState: {
        status: "invalid",
        issues: [
          {
            path: "objectives",
            message: "Expected exactly one primary objective.",
          },
        ],
        message: "objectives: Expected exactly one primary objective.",
      },
      runtimeMode: "phaser",
    });

    expect(plan).toEqual({
      blockedPresentation: "game-spec-validation",
      firstPlayableValidationSource: null,
      issues: [
        {
          path: "objectives",
          message: "Expected exactly one primary objective.",
        },
      ],
      message: "objectives: Expected exactly one primary objective.",
      type: "phaser-invalid",
    });
  });

  it("restores a valid Phaser runtime plan from a saved Game Pack", () => {
    const restoredGamePack = createValidatedGamePackFixture({
      gameSpec: topDownPhaserTemplate.gameSpec,
    });

    const plan = createEditorRuntimeTemplatePlan({
      generationSource: "phaser-ai",
      restoredGamePack,
      runtimeMode: "phaser",
    });

    expect(plan).toMatchObject({
      firstPlayableValidationSource: {
        gamePack: restoredGamePack,
        gameSpec: topDownPhaserTemplate.gameSpec,
        runtimeCandidate: {
          templateId: topDownPhaserTemplate.gameSpec.template.id,
        },
        source: "restored-game-pack",
      },
      persistencePolicy: "reuse-restored-game-pack",
      readyPolicy: "ready-on-runtime-ready",
      runFirstPlayableChecksOnReady: true,
      template: {
        gameSpec: topDownPhaserTemplate.gameSpec,
        title: topDownPhaserTemplate.title,
      },
      type: "phaser-valid",
    });
  });

  it("carries the exact restored generated project into the Phaser host view model", () => {
    const fixture = createGeneratedMechanicProjectFixture();
    const plan = createEditorRuntimeTemplatePlan({
      generationSource: "phaser-ai",
      restoredGamePack: fixture.gamePack,
      runtimeMode: "phaser",
    });

    expect(plan).toMatchObject({
      type: "phaser-valid",
      generatedMechanicProject: {
        artifact: fixture.artifact,
        dependency: fixture.dependency,
      },
    });
    if (plan.type !== "phaser-valid") {
      throw new Error("Expected the accepted project to produce a valid plan.");
    }

    expect(
      createPhaserRuntimeHostViewModel({
        gameResetNonce: 2,
        runtimeTemplate: plan,
      })
    ).toEqual({
      type: "phaser",
      key: `${plan.sourceKey}-2`,
      template: plan.template,
      generatedMechanicProject: {
        artifact: fixture.artifact,
        dependency: fixture.dependency,
      },
    });
  });

  it("resolves an active generated spec with pass-gated persistence metadata", () => {
    const plan = createEditorRuntimeTemplatePlan({
      activeGeneratedSpec: {
        metadata: {
          attemptCount: 1,
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
        runtimeKind: "phaser",
        source: "phaser-spec",
        spec: topDownPhaserTemplate.gameSpec,
      },
      generationSource: "phaser-ai",
      runtimeMode: "phaser",
    });

    expect(plan).toMatchObject({
      firstPlayableValidationSource: {
        generatedSpecMetadata: {
          attemptCount: 1,
          model: "gpt-5.4-mini",
          taskRoute: "spec_generation.primary",
        },
        gameSpec: topDownPhaserTemplate.gameSpec,
        runtimeCandidate: {
          templateId: topDownPhaserTemplate.gameSpec.template.id,
        },
        source: "generated-spec",
      },
      persistencePolicy: "persist-after-first-playable",
      readyPolicy: "ready-after-first-playable",
      runFirstPlayableChecksOnReady: true,
      template: {
        gameSpec: topDownPhaserTemplate.gameSpec,
        title: topDownPhaserTemplate.title,
      },
      type: "phaser-valid",
    });
    expect(plan.firstPlayableValidationSource).not.toHaveProperty("gamePack");
  });

  it("does not mount a fixture while Phaser AI generation is still idle", () => {
    expect(
      createEditorRuntimeTemplatePlan({
        generationSource: "phaser-ai",
        runtimeMode: "phaser",
      })
    ).toEqual({
      firstPlayableValidationSource: null,
      type: "phaser-pending-generation",
    });
  });
});
