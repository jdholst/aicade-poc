import { getDefaultTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import type { StableId } from "../../game-spec-schema";
import { parseGamePack, type GamePack, type ValidationEvidence } from "../game-pack-schema";
import { restoreGamePackCheckpoint } from "../game-pack-lineage";

export const GAME_PACK_FIXTURE_CREATED_AT = "2026-05-23T12:00:00.000Z";
export const GAME_PACK_FIXTURE_UPDATED_AT = "2026-05-23T12:05:00.000Z";
export const GAME_PACK_FIXTURE_LATER_UPDATED_AT =
  "2026-05-23T12:10:00.000Z";
export const GAME_PACK_FIXTURE_RESTORED_AT = "2026-05-23T12:15:00.000Z";

export function createEmptyGamePackFixture(
  overrides: Partial<GamePack> = {}
): GamePack {
  const gameSpec = overrides.gameSpec ?? getDefaultTopDownGameSpecFixture();

  return parseGamePack({
    schemaVersion: "game-pack/v1",
    id: "game_pack_crystal_chase",
    title: "Crystal Spec Chase",
    createdAt: GAME_PACK_FIXTURE_CREATED_AT,
    updatedAt: GAME_PACK_FIXTURE_UPDATED_AT,
    runtimeKind: "phaser",
    templateId: gameSpec.template.id,
    gameSpec,
    validationEvidence: [],
    builds: [],
    checkpoints: [],
    failedAttempts: [],
    generationRuns: [],
    ...overrides,
  });
}

export function createValidatedGamePackFixture(
  overrides: Partial<GamePack> = {}
): GamePack {
  const gameSpec = overrides.gameSpec ?? getDefaultTopDownGameSpecFixture();
  const validationEvidence =
    overrides.validationEvidence ?? [createRuntimeBootEvidenceFixture()];

  return parseGamePack({
    schemaVersion: "game-pack/v1",
    id: "game_pack_crystal_chase",
    title: "Crystal Spec Chase",
    createdAt: GAME_PACK_FIXTURE_CREATED_AT,
    updatedAt: GAME_PACK_FIXTURE_UPDATED_AT,
    runtimeKind: "phaser",
    templateId: gameSpec.template.id,
    gameSpec,
    validationEvidence,
    builds: [
      {
        id: "build_initial_playable",
        createdAt: GAME_PACK_FIXTURE_CREATED_AT,
        runtimeKind: "phaser",
        templateId: gameSpec.template.id,
        gameSpecId: gameSpec.id,
        checkpointId: "checkpoint_initial_playable",
        validationEvidenceIds: validationEvidence.map((item) => item.id),
        status: "validated",
        artifactMetadata: {
          runtimeScriptPath: "/runtime/phaser/top-down-template.js",
        },
      },
    ],
    checkpoints: [
      {
        id: "checkpoint_initial_playable",
        createdAt: GAME_PACK_FIXTURE_CREATED_AT,
        label: "Initial playable",
        summary: "First validated top-down playable state.",
        gameSpecId: gameSpec.id,
        buildId: "build_initial_playable",
        validationEvidenceIds: validationEvidence.map((item) => item.id),
      },
    ],
    failedAttempts: [
      {
        id: "failed_attempt_preflight",
        createdAt: GAME_PACK_FIXTURE_CREATED_AT,
        stage: "spec-validation",
        summary: "A failed draft stayed out of creator-facing checkpoints.",
        gameSpecId: gameSpec.id,
        validationEvidenceIds: validationEvidence.map((item) => item.id),
      },
    ],
    generationRuns: [
      {
        id: "generation_run_reserved",
        createdAt: GAME_PACK_FIXTURE_CREATED_AT,
        status: "reserved",
      },
    ],
    ...overrides,
  });
}

export function createFailedPreRuntimeGamePackFixture(
  overrides: Partial<GamePack> = {}
): GamePack {
  const gameSpec = overrides.gameSpec ?? getDefaultTopDownGameSpecFixture();
  const validationEvidence =
    overrides.validationEvidence ?? [createFailedSpecValidationEvidenceFixture()];

  return parseGamePack({
    ...createEmptyGamePackFixture({
      id: "game_pack_failed_pre_runtime",
      gameSpec,
      title: "Failed Pre-runtime Draft",
    }),
    validationEvidence,
    failedAttempts: [
      {
        id: "failed_attempt_first_playable_pre_runtime",
        createdAt: GAME_PACK_FIXTURE_UPDATED_AT,
        stage: "spec-validation",
        summary: "Expected exactly one primary objective.",
        gameSpecId: gameSpec.id,
        validationEvidenceIds: validationEvidence.map((item) => item.id),
      },
    ],
    ...overrides,
  });
}

export function createFailedRuntimeGamePackFixture(
  overrides: Partial<GamePack> = {}
): GamePack {
  const gameSpec = overrides.gameSpec ?? getDefaultTopDownGameSpecFixture();
  const validationEvidence =
    overrides.validationEvidence ?? [createFailedRuntimeBootEvidenceFixture()];

  return parseGamePack({
    ...createEmptyGamePackFixture({
      id: "game_pack_failed_runtime",
      gameSpec,
      title: "Failed Runtime Draft",
    }),
    validationEvidence,
    builds: [
      {
        id: "build_failed_first_playable",
        createdAt: GAME_PACK_FIXTURE_UPDATED_AT,
        runtimeKind: "phaser",
        templateId: gameSpec.template.id,
        gameSpecId: gameSpec.id,
        validationEvidenceIds: validationEvidence.map((item) => item.id),
        status: "failed",
      },
    ],
    failedAttempts: [
      {
        id: "failed_attempt_first_playable_runtime",
        createdAt: GAME_PACK_FIXTURE_UPDATED_AT,
        stage: "runtime-boot",
        summary: "Runtime failed before first-playable validation completed.",
        gameSpecId: gameSpec.id,
        buildId: "build_failed_first_playable",
        validationEvidenceIds: validationEvidence.map((item) => item.id),
      },
    ],
    ...overrides,
  });
}

export function createGamePackWithSecondCheckpointFixture(
  overrides: Partial<GamePack> = {}
): GamePack {
  const baseGamePack = createValidatedGamePackFixture();
  const gameSpec = overrides.gameSpec ?? baseGamePack.gameSpec;
  const secondEvidence = createRuntimeBootEvidenceFixture({
    id: "evidence_second_validation",
    checkId: "second_validation",
    durationMs: 18,
  });

  return parseGamePack({
    ...baseGamePack,
    updatedAt: GAME_PACK_FIXTURE_LATER_UPDATED_AT,
    currentCheckpointId: "checkpoint_second_playable",
    gameSpec,
    templateId: gameSpec.template.id,
    validationEvidence: [...baseGamePack.validationEvidence, secondEvidence],
    builds: [
      ...baseGamePack.builds,
      {
        id: "build_second_playable",
        createdAt: GAME_PACK_FIXTURE_LATER_UPDATED_AT,
        runtimeKind: "phaser",
        templateId: gameSpec.template.id,
        gameSpecId: gameSpec.id,
        checkpointId: "checkpoint_second_playable",
        validationEvidenceIds: [secondEvidence.id],
        status: "validated",
      },
    ],
    checkpoints: [
      ...baseGamePack.checkpoints,
      {
        id: "checkpoint_second_playable",
        createdAt: GAME_PACK_FIXTURE_LATER_UPDATED_AT,
        label: "Second playable",
        summary: "Later validated top-down playable state.",
        gameSpecId: gameSpec.id,
        buildId: "build_second_playable",
        validationEvidenceIds: [secondEvidence.id],
      },
    ],
    ...overrides,
  });
}

export function createRestoredForwardGamePackFixture(
  overrides: Partial<GamePack> = {}
): GamePack {
  return parseGamePack({
    ...restoreGamePackCheckpoint({
      gamePack: createGamePackWithSecondCheckpointFixture(),
      restoredAt: GAME_PACK_FIXTURE_RESTORED_AT,
      sourceCheckpointId: "checkpoint_initial_playable",
    }),
    ...overrides,
  });
}

export function createRuntimeBootEvidenceFixture(
  overrides: Partial<ValidationEvidence> & { id?: StableId } = {}
): ValidationEvidence {
  return {
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
    ...overrides,
  };
}

function createFailedSpecValidationEvidenceFixture(): ValidationEvidence {
  return {
    id: "evidence_basic_objective_presence",
    checkId: "basic_objective_presence",
    stage: "spec-validation",
    status: "failed",
    durationMs: 0,
    message:
      "Game Spec must include exactly one primary objective before runtime boot can be treated as playable.",
    evidence: {
      primaryObjectiveCount: 0,
    },
    issues: [
      {
        code: "missing_primary_objective",
        path: "gameSpec.objectives",
        message: "Expected exactly one primary objective.",
      },
    ],
  };
}

function createFailedRuntimeBootEvidenceFixture(): ValidationEvidence {
  return {
    id: "evidence_runtime_boot",
    checkId: "runtime_boot",
    stage: "runtime-boot",
    status: "failed",
    durationMs: 24,
    message: "Runtime failed before first-playable validation completed.",
    evidence: {
      runtimeStatus: "error",
      message: "Generated module crashed.",
    },
    issues: [
      {
        code: "fatal_runtime_error",
        path: "runtime",
        message: "Generated module crashed.",
      },
    ],
  };
}
