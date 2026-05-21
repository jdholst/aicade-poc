import { z } from "zod";

import type { RuntimeKind } from "@/runtime/runtime-adapter";

import {
  gameSpecSchema,
  jsonValueSchema,
  stableIdSchema,
} from "./game-spec-schema";

const runtimeKindValues = ["canvas2d", "phaser"] as const satisfies readonly RuntimeKind[];

const isoDateTimeSchema = z.string().datetime({ offset: true });
const metadataSchema = z.record(z.string(), jsonValueSchema);

export const gamePackRuntimeKindSchema = z.enum(runtimeKindValues);

export const validationEvidenceStageSchema = z.enum([
  "schema",
  "spec-validation",
  "artifact-build",
  "runtime-boot",
  "browser-check",
  "persistence-check",
]);

export const validationEvidenceStatusSchema = z.enum([
  "passed",
  "failed",
  "warning",
]);

const validationIssueSchema = z
  .object({
    code: stableIdSchema.optional(),
    path: z.string().min(1).max(240).optional(),
    message: z.string().min(1).max(500),
  })
  .strict();

export const validationEvidenceSchema = z
  .object({
    id: stableIdSchema,
    stage: validationEvidenceStageSchema,
    status: validationEvidenceStatusSchema,
    durationMs: z.number().finite().nonnegative(),
    message: z.string().min(1).max(500).optional(),
    issues: z.array(validationIssueSchema).optional(),
    evidence: metadataSchema.optional(),
  })
  .strict();

export const playableBuildSchema = z
  .object({
    id: stableIdSchema,
    createdAt: isoDateTimeSchema,
    runtimeKind: gamePackRuntimeKindSchema,
    templateId: stableIdSchema,
    gameSpecId: stableIdSchema,
    checkpointId: stableIdSchema.optional(),
    validationEvidenceIds: z.array(stableIdSchema),
    status: z.enum(["built", "validated", "failed"]),
    artifactMetadata: metadataSchema.optional(),
  })
  .strict();

export const versionCheckpointSchema = z
  .object({
    id: stableIdSchema,
    createdAt: isoDateTimeSchema,
    label: z.string().min(1).max(100),
    summary: z.string().min(1).max(500),
    gameSpecId: stableIdSchema,
    buildId: stableIdSchema.optional(),
    validationEvidenceIds: z.array(stableIdSchema),
    restoredFromCheckpointId: stableIdSchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const failedAttemptSchema = z
  .object({
    id: stableIdSchema,
    createdAt: isoDateTimeSchema,
    stage: validationEvidenceStageSchema,
    summary: z.string().min(1).max(500),
    gameSpecId: stableIdSchema.optional(),
    buildId: stableIdSchema.optional(),
    validationEvidenceIds: z.array(stableIdSchema),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const generationRunSchema = z
  .object({
    id: stableIdSchema,
    createdAt: isoDateTimeSchema,
    status: z.literal("reserved"),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const gamePackSchema = z
  .object({
    schemaVersion: z.literal("game-pack/v1"),
    id: stableIdSchema,
    title: z.string().min(1).max(100),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    runtimeKind: gamePackRuntimeKindSchema,
    templateId: stableIdSchema,
    gameSpec: gameSpecSchema,
    builds: z.array(playableBuildSchema),
    checkpoints: z.array(versionCheckpointSchema),
    validationEvidence: z.array(validationEvidenceSchema),
    failedAttempts: z.array(failedAttemptSchema),
    generationRuns: z.array(generationRunSchema),
    metadata: metadataSchema.optional(),
  })
  .strict();

export function parseGamePack(input: unknown): GamePack {
  return gamePackSchema.parse(input);
}

export type GamePackRuntimeKind = z.infer<typeof gamePackRuntimeKindSchema>;
export type ValidationEvidenceStage = z.infer<
  typeof validationEvidenceStageSchema
>;
export type ValidationEvidenceStatus = z.infer<
  typeof validationEvidenceStatusSchema
>;
export type ValidationEvidence = z.infer<typeof validationEvidenceSchema>;
export type PlayableBuild = z.infer<typeof playableBuildSchema>;
export type VersionCheckpoint = z.infer<typeof versionCheckpointSchema>;
export type FailedAttempt = z.infer<typeof failedAttemptSchema>;
export type GenerationRun = z.infer<typeof generationRunSchema>;
export type GamePack = z.infer<typeof gamePackSchema>;
