import { describe, expect, it } from "vitest";

import {
  gamePackSchema,
  parseGamePack,
  type GamePack,
} from "@/game-spec";
import { getDefaultTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

const createdAt = "2026-05-21T00:00:00.000Z";
const updatedAt = "2026-05-21T00:01:00.000Z";

function createMinimalGamePack(): GamePack {
  const gameSpec = getDefaultTopDownGameSpecFixture();

  return {
    schemaVersion: "game-pack/v1",
    id: "game_pack_crystal_chase",
    title: "Crystal Spec Chase",
    createdAt,
    updatedAt,
    runtimeKind: "phaser",
    templateId: gameSpec.template.id,
    gameSpec,
    validationEvidence: [
      {
        id: "evidence_runtime_boot",
        stage: "runtime-boot",
        status: "passed",
        durationMs: 42,
        message: "Runtime booted without fatal errors.",
        evidence: {
          viewport: {
            width: 800,
            height: 600,
          },
        },
      },
    ],
    builds: [
      {
        id: "build_initial_playable",
        createdAt,
        runtimeKind: "phaser",
        templateId: gameSpec.template.id,
        gameSpecId: gameSpec.id,
        checkpointId: "checkpoint_initial_playable",
        validationEvidenceIds: ["evidence_runtime_boot"],
        status: "validated",
        artifactMetadata: {
          runtimeScriptPath: "/runtime/phaser/top-down-template.js",
        },
      },
    ],
    checkpoints: [
      {
        id: "checkpoint_initial_playable",
        createdAt,
        label: "Initial playable",
        summary: "First validated top-down playable state.",
        gameSpecId: gameSpec.id,
        buildId: "build_initial_playable",
        validationEvidenceIds: ["evidence_runtime_boot"],
      },
    ],
    failedAttempts: [],
    generationRuns: [],
  };
}

describe("Game Pack schema", () => {
  it("parses a minimal runtime-agnostic Phaser Game Pack with a top-down Game Spec snapshot", () => {
    const pack = createMinimalGamePack();

    expect(parseGamePack(pack)).toEqual(pack);
  });

  it("accepts a Canvas-compatible runtime kind without Canvas-specific root fields", () => {
    const pack = createMinimalGamePack();
    const gameSpec = {
      ...pack.gameSpec,
      id: "game_canvas_fixture",
      template: {
        id: "template_canvas2d",
        version: "1.0.0",
        config: {},
      },
    };

    expect(
      parseGamePack({
        ...pack,
        id: "game_pack_canvas_fixture",
        runtimeKind: "canvas2d",
        templateId: "template_canvas2d",
        gameSpec,
        validationEvidence: [],
        builds: [],
        checkpoints: [],
      })
    ).toMatchObject({
      runtimeKind: "canvas2d",
      templateId: "template_canvas2d",
      generationRuns: [],
    });
  });

  it("rejects unknown and runtime-specific root fields", () => {
    const pack = createMinimalGamePack();

    expect(
      gamePackSchema.safeParse({
        ...pack,
        strayField: "not part of the Game Pack root contract",
      }).success
    ).toBe(false);

    expect(
      gamePackSchema.safeParse({
        ...pack,
        phaserRuntimeScriptPath: "/runtime/phaser/top-down-template.js",
      }).success
    ).toBe(false);
  });

  it("rejects wrapper-shaped values for core root fields", () => {
    const pack = createMinimalGamePack();
    const wrappedRuntimeKind = {
      value: "phaser",
      type: "string",
      description: "Runtime kind",
    };

    expect(
      gamePackSchema.safeParse({
        ...pack,
        runtimeKind: wrappedRuntimeKind,
      }).success
    ).toBe(false);

    expect(
      gamePackSchema.safeParse({
        ...pack,
        templateId: {
          value: "template_top_down",
          type: "string",
          description: "Template ID",
        },
      }).success
    ).toBe(false);
  });

  it("accepts JSON-safe nested metadata and reserved empty generation runs", () => {
    const pack = createMinimalGamePack();

    const parsed = parseGamePack({
      ...pack,
      metadata: {
        notes: {
          value: "Nested metadata can describe tooling without wrapping roots.",
          type: "note",
          description: "Allowed under explicit metadata boundaries.",
        },
      },
      generationRuns: [],
    });

    expect(parsed.metadata).toEqual({
      notes: {
        value: "Nested metadata can describe tooling without wrapping roots.",
        type: "note",
        description: "Allowed under explicit metadata boundaries.",
      },
    });
    expect(parsed.generationRuns).toEqual([]);
  });
});
