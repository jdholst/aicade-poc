import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createInitialGamePack,
  gamePackSchema,
  type CreateInitialGamePackInput,
} from "@/game-spec";
import { getDefaultTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

const createdAt = "2026-05-21T12:00:00.000Z";
const updatedAt = "2026-05-21T12:05:00.000Z";

function createInput(
  input: Partial<CreateInitialGamePackInput> = {}
): CreateInitialGamePackInput {
  return {
    gameSpec: getDefaultTopDownGameSpecFixture(),
    runtimeKind: "phaser",
    createdAt,
    ...input,
  };
}

describe("Game Pack factory", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an initial Phaser Game Pack from the current top-down Game Spec fixture", () => {
    const gameSpec = getDefaultTopDownGameSpecFixture();
    const pack = createInitialGamePack({
      gameSpec,
      runtimeKind: "phaser",
      createdAt,
    });

    expect(pack).toMatchObject({
      schemaVersion: "game-pack/v1",
      id: "game_pack_crystal_spec_chase",
      title: gameSpec.title,
      createdAt,
      updatedAt: createdAt,
      runtimeKind: "phaser",
      templateId: gameSpec.template.id,
      gameSpec,
    });
  });

  it("returns output that parses through the Game Pack schema", () => {
    const pack = createInitialGamePack(createInput());

    expect(gamePackSchema.parse(pack)).toEqual(pack);
  });

  it("starts without builds, checkpoints, validation evidence, failed attempts, or generation runs", () => {
    const pack = createInitialGamePack(createInput());

    expect(pack.builds).toEqual([]);
    expect(pack.checkpoints).toEqual([]);
    expect(pack.validationEvidence).toEqual([]);
    expect(pack.failedAttempts).toEqual([]);
    expect(pack.generationRuns).toEqual([]);
  });

  it("uses the current time when timestamps are not injected", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(createdAt));

    const pack = createInitialGamePack({
      gameSpec: getDefaultTopDownGameSpecFixture(),
      runtimeKind: "phaser",
    });

    expect(pack.createdAt).toBe(createdAt);
    expect(pack.updatedAt).toBe(createdAt);
  });

  it("allows explicit identifiers, template IDs, titles, timestamps, and metadata", () => {
    const pack = createInitialGamePack(
      createInput({
        id: "game_pack_custom",
        title: "Custom Pack",
        templateId: "template_custom",
        updatedAt,
        metadata: {
          source: "factory_test",
          template: {
            id: "template_custom",
          },
        },
      })
    );

    expect(pack).toMatchObject({
      id: "game_pack_custom",
      title: "Custom Pack",
      templateId: "template_custom",
      createdAt,
      updatedAt,
      metadata: {
        source: "factory_test",
        template: {
          id: "template_custom",
        },
      },
    });
  });

  it("fails through schema parsing when overrides are invalid", () => {
    expect(() =>
      createInitialGamePack(
        createInput({
          id: "GamePackCustom",
        })
      )
    ).toThrow("Use lowercase stable IDs with underscore-separated segments.");

    expect(() =>
      createInitialGamePack(
        createInput({
          metadata: {
            generatedAt: new Date(createdAt) as unknown as string,
          },
        })
      )
    ).toThrow("Game Spec JSON fields must contain only JSON-compatible values.");
  });
});
