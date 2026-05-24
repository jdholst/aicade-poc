import { describe, expect, it } from "vitest";

import {
  gamePackSchema,
  parseGamePack,
} from "@/game-spec";
import { createValidatedGamePackFixture } from "./testing/game-pack-fixtures";

const createMinimalGamePack = createValidatedGamePackFixture;

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

  it("requires the current checkpoint pointer to reference an existing checkpoint", () => {
    const pack = createMinimalGamePack();

    expect(
      gamePackSchema.safeParse({
        ...pack,
        currentCheckpointId: "checkpoint_initial_playable",
      }).success
    ).toBe(true);

    expect(
      gamePackSchema.safeParse({
        ...pack,
        currentCheckpointId: "checkpoint_missing",
      }).success
    ).toBe(false);
  });

  it("requires restored checkpoint source IDs to reference existing checkpoints", () => {
    const pack = createMinimalGamePack();

    expect(
      gamePackSchema.safeParse({
        ...pack,
        checkpoints: [
          ...pack.checkpoints,
          {
            ...pack.checkpoints[0],
            id: "checkpoint_restored_initial_playable_1",
            restoredFromCheckpointId: "checkpoint_initial_playable",
          },
        ],
      }).success
    ).toBe(true);

    expect(
      gamePackSchema.safeParse({
        ...pack,
        checkpoints: [
          {
            ...pack.checkpoints[0],
            restoredFromCheckpointId: "checkpoint_missing",
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
