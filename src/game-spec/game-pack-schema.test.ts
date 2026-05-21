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
        checkId: "runtime_boot",
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
    failedAttempts: [
      {
        id: "failed_attempt_preflight",
        createdAt,
        stage: "spec-validation",
        summary: "A pre-runtime consistency pass failed before mounting.",
        gameSpecId: gameSpec.id,
        validationEvidenceIds: ["evidence_runtime_boot"],
        metadata: {
          assetKeys: ["asset_player"],
        },
      },
    ],
    generationRuns: [
      {
        id: "generation_run_reserved",
        createdAt,
        status: "reserved",
      },
    ],
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
        failedAttempts: [],
        generationRuns: [],
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

  it("requires both receipt IDs and stable check IDs for validation evidence", () => {
    const pack = createMinimalGamePack();
    const [{ checkId, ...evidenceWithoutCheckId }] = pack.validationEvidence;

    expect(
      gamePackSchema.safeParse({
        ...pack,
        validationEvidence: [evidenceWithoutCheckId],
      }).success
    ).toBe(false);

    expect(checkId).toBe("runtime_boot");
    expect(
      gamePackSchema.safeParse({
        ...pack,
        validationEvidence: [
          ...pack.validationEvidence,
          {
            ...pack.validationEvidence[0],
            checkId: "player_visible",
          },
        ],
      }).success
    ).toBe(false);
  });

  it("rejects build validation evidence references that do not exist", () => {
    const pack = createMinimalGamePack();

    expect(
      gamePackSchema.safeParse({
        ...pack,
        builds: [
          {
            ...pack.builds[0],
            validationEvidenceIds: ["evidence_missing"],
          },
        ],
      }).success
    ).toBe(false);
  });

  it("rejects build checkpoint references that do not exist", () => {
    const pack = createMinimalGamePack();

    expect(
      gamePackSchema.safeParse({
        ...pack,
        builds: [
          {
            ...pack.builds[0],
            checkpointId: "checkpoint_missing",
          },
        ],
      }).success
    ).toBe(false);
  });

  it("rejects checkpoint build and validation evidence references that do not exist", () => {
    const pack = createMinimalGamePack();

    expect(
      gamePackSchema.safeParse({
        ...pack,
        checkpoints: [
          {
            ...pack.checkpoints[0],
            buildId: "build_missing",
          },
        ],
      }).success
    ).toBe(false);

    expect(
      gamePackSchema.safeParse({
        ...pack,
        checkpoints: [
          {
            ...pack.checkpoints[0],
            validationEvidenceIds: ["evidence_missing"],
          },
        ],
      }).success
    ).toBe(false);
  });

  it("allows failed attempts to preserve evidence without creating a build", () => {
    const pack = createMinimalGamePack();
    const { buildId, ...failedAttemptWithoutBuild } = pack.failedAttempts[0];

    expect(
      parseGamePack({
        ...pack,
        builds: [],
        checkpoints: [],
        failedAttempts: [
          {
            ...failedAttemptWithoutBuild,
            validationEvidenceIds: ["evidence_runtime_boot"],
          },
        ],
      }).failedAttempts
    ).toEqual([
      {
        ...failedAttemptWithoutBuild,
        validationEvidenceIds: ["evidence_runtime_boot"],
      },
    ]);

    expect(buildId).toBeUndefined();
  });

  it("rejects failed attempt validation evidence references that do not exist", () => {
    const pack = createMinimalGamePack();

    expect(
      gamePackSchema.safeParse({
        ...pack,
        failedAttempts: [
          {
            ...pack.failedAttempts[0],
            validationEvidenceIds: ["evidence_missing"],
          },
        ],
      }).success
    ).toBe(false);
  });

  it("rejects related records whose gameSpecId does not match the saved Game Spec", () => {
    const pack = createMinimalGamePack();

    expect(
      gamePackSchema.safeParse({
        ...pack,
        builds: [
          {
            ...pack.builds[0],
            gameSpecId: "game_spec_missing",
          },
        ],
      }).success
    ).toBe(false);

    expect(
      gamePackSchema.safeParse({
        ...pack,
        checkpoints: [
          {
            ...pack.checkpoints[0],
            gameSpecId: "game_spec_missing",
          },
        ],
      }).success
    ).toBe(false);

    expect(
      gamePackSchema.safeParse({
        ...pack,
        failedAttempts: [
          {
            ...pack.failedAttempts[0],
            gameSpecId: "game_spec_missing",
          },
        ],
      }).success
    ).toBe(false);
  });
});
