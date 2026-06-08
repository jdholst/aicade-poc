import { getDefaultTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import type { StableId } from "../../game-spec-schema";
import {
  generationRunSchema,
  type GenerationRun,
} from "../../generation-run/generation-run-schema";
import {
  parseGamePack,
  type GamePack,
  type ValidationEvidence,
} from "../game-pack-schema";
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
    generationRuns: [],
    ...overrides,
  });
}

export function createSuccessfulGenerationRunFixture(
  gamePack: GamePack,
  overrides: Partial<GenerationRun> = {}
): GenerationRun {
  return generationRunSchema.parse({
    id: "generation_run_initial_prompt",
    operationType: "generate",
    status: "succeeded",
    repairStatus: "not-needed",
    createdAt: GAME_PACK_FIXTURE_CREATED_AT,
    startedAt: GAME_PACK_FIXTURE_CREATED_AT,
    completedAt: GAME_PACK_FIXTURE_UPDATED_AT,
    durationMs: 5000,
    request: {
      summary: "Generate a top-down collector from the creator prompt.",
      promptText: "Make a top-down collector about crystals.",
    },
    runtimeKind: gamePack.runtimeKind,
    templateId: gamePack.templateId,
    mechanicIds: ["collect_items"],
    attempts: [
      {
        id: "generation_attempt_initial",
        attemptNumber: 1,
        kind: "initial",
        status: "succeeded",
        provider: "test_provider",
        model: "test_model",
        taskRoute: "phaser_spec_generation",
        requestSummary: "Create a validated top-down Game Spec.",
        startedAt: GAME_PACK_FIXTURE_CREATED_AT,
        completedAt: GAME_PACK_FIXTURE_UPDATED_AT,
        durationMs: 5000,
        usage: {
          inputTokens: 1200,
          outputTokens: 800,
        },
        cost: {
          amountUsd: 0.0042,
          currency: "USD",
          source: "provider_usage",
          quality: "estimated",
        },
        validation: {
          stage: "mechanic-validation",
          status: "passed",
          issues: [],
        },
        candidate: {
          kind: "validated_spec",
          gameSpecId: gamePack.gameSpec.id,
          summary: "Validated Game Spec accepted by server checks.",
        },
      },
    ],
    relationships: {
      gamePackId: gamePack.id,
      gameSpecId: gamePack.gameSpec.id,
      buildIds: gamePack.builds.map((build) => build.id),
      checkpointIds: gamePack.checkpoints.map((checkpoint) => checkpoint.id),
      validationEvidenceIds: gamePack.validationEvidence.map(
        (evidence) => evidence.id
      ),
    },
    ...overrides,
  });
}

export function createFailedGenerationRunFixture(
  gamePack: GamePack,
  overrides: Partial<GenerationRun> = {}
): GenerationRun {
  const initialAttempt =
    createSuccessfulGenerationRunFixture(gamePack).attempts[0];

  return generationRunSchema.parse({
    id: "generation_run_failed_schema_validation",
    operationType: "generate",
    status: "failed",
    repairStatus: "not-needed",
    stage: "schema-validation",
    failureClass: "invalid-model-output",
    createdAt: GAME_PACK_FIXTURE_CREATED_AT,
    startedAt: GAME_PACK_FIXTURE_CREATED_AT,
    completedAt: GAME_PACK_FIXTURE_UPDATED_AT,
    durationMs: 5000,
    request: {
      summary: "Generate a top-down collector from the creator prompt.",
      promptText: "Make a top-down collector about crystals.",
    },
    runtimeKind: gamePack.runtimeKind,
    templateId: gamePack.templateId,
    mechanicIds: ["collect_items"],
    attempts: [
      {
        ...initialAttempt,
        id: "generation_attempt_initial_invalid",
        status: "failed",
        validation: {
          stage: "schema-validation",
          status: "failed",
          issues: [
            {
              path: "objectives",
              message: "Expected exactly one primary objective.",
            },
          ],
        },
        candidate: {
          kind: "invalid_candidate",
          summary: "Candidate had invalid objective cardinality.",
          issueCount: 1,
          referencedMechanicIds: ["collect_items"],
        },
      },
    ],
    relationships: {
      gamePackId: gamePack.id,
      gameSpecId: gamePack.gameSpec.id,
      validationEvidenceIds: gamePack.validationEvidence.map(
        (evidence) => evidence.id
      ),
      failedAttemptIds: gamePack.failedAttempts.map((attempt) => attempt.id),
    },
    ...overrides,
  });
}

export function createRepairedGenerationRunFixture(
  gamePack: GamePack,
  overrides: Partial<GenerationRun> = {}
): GenerationRun {
  const failedAttempt = createFailedGenerationRunFixture(gamePack).attempts[0];
  const successfulAttempt =
    createSuccessfulGenerationRunFixture(gamePack).attempts[0];

  return generationRunSchema.parse({
    id: "generation_run_repaired_success",
    operationType: "generate",
    status: "succeeded",
    repairStatus: "repaired",
    createdAt: GAME_PACK_FIXTURE_CREATED_AT,
    startedAt: GAME_PACK_FIXTURE_CREATED_AT,
    completedAt: GAME_PACK_FIXTURE_LATER_UPDATED_AT,
    durationMs: 10000,
    request: {
      summary: "Generate and repair a top-down collector from the prompt.",
      promptText: "Make a top-down collector about crystals.",
    },
    runtimeKind: gamePack.runtimeKind,
    templateId: gamePack.templateId,
    mechanicIds: ["collect_items"],
    attempts: [
      failedAttempt,
      {
        ...successfulAttempt,
        id: "generation_attempt_repair",
        attemptNumber: 2,
        kind: "repair",
        requestSummary: "Repair the invalid objective cardinality.",
        repair: {
          sourceAttemptId: failedAttempt.id,
          reason: "Schema validation failed on objective cardinality.",
          validationIssueCount: 1,
        },
      },
    ],
    relationships: {
      gamePackId: gamePack.id,
      gameSpecId: gamePack.gameSpec.id,
      buildIds: gamePack.builds.map((build) => build.id),
      checkpointIds: gamePack.checkpoints.map((checkpoint) => checkpoint.id),
      validationEvidenceIds: gamePack.validationEvidence.map(
        (evidence) => evidence.id
      ),
      failedAttemptIds: gamePack.failedAttempts.map((attempt) => attempt.id),
    },
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
