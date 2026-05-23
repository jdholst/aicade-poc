import { describe, expect, it } from "vitest";

import { parseGamePack } from "@/game-spec";
import { topDownPhaserTemplate } from "@/runtime/phaser";

import { createEditorRuntimeTemplatePlan } from "./editor-runtime-template-plan";

const createdAt = "2026-05-23T14:00:00.000Z";

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

  it("restores a valid Phaser runtime plan from a saved Game Pack", () => {
    const restoredGamePack = parseGamePack({
      schemaVersion: "game-pack/v1",
      id: "game_pack_crystal_chase",
      title: "Crystal Spec Chase",
      createdAt,
      updatedAt: createdAt,
      runtimeKind: "phaser",
      templateId: topDownPhaserTemplate.gameSpec.template.id,
      gameSpec: topDownPhaserTemplate.gameSpec,
      validationEvidence: [
        {
          id: "evidence_runtime_boot",
          checkId: "runtime_boot",
          stage: "runtime-boot",
          status: "passed",
          durationMs: 42,
        },
      ],
      builds: [
        {
          id: "build_initial_playable",
          createdAt,
          runtimeKind: "phaser",
          templateId: topDownPhaserTemplate.gameSpec.template.id,
          gameSpecId: topDownPhaserTemplate.gameSpec.id,
          checkpointId: "checkpoint_initial_playable",
          validationEvidenceIds: ["evidence_runtime_boot"],
          status: "validated",
        },
      ],
      checkpoints: [
        {
          id: "checkpoint_initial_playable",
          createdAt,
          label: "Initial playable",
          summary: "First validated top-down playable state.",
          gameSpecId: topDownPhaserTemplate.gameSpec.id,
          buildId: "build_initial_playable",
          validationEvidenceIds: ["evidence_runtime_boot"],
        },
      ],
      failedAttempts: [],
      generationRuns: [],
    });

    const plan = createEditorRuntimeTemplatePlan({
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
      },
      template: {
        gameSpec: topDownPhaserTemplate.gameSpec,
        title: topDownPhaserTemplate.title,
      },
      type: "phaser-valid",
    });
  });
});
