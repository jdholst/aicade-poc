import { describe, expect, it } from "vitest";

import { topDownPhaserTemplate } from "@/runtime/phaser";

import { createEditorRuntimeTemplatePlan } from "./editor-runtime-template-plan";

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
        runtimeKind: "phaser",
      },
      template: topDownPhaserTemplate,
      type: "phaser-valid",
    });
  });

  it("resolves invalid Phaser templates without a validation source", () => {
    const plan = createEditorRuntimeTemplatePlan({
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
});
