import { z } from "zod";

import type { RuntimeKind } from "@/runtime/runtime-adapter";

import {
  gameSpecSchema,
  jsonValueSchema,
  stableIdSchema,
} from "../game-spec-schema";

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
    checkId: stableIdSchema,
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
  .strict()
  .superRefine((pack, ctx) => {
    const validationEvidenceIds = new Set(
      pack.validationEvidence.map((evidence) => evidence.id)
    );
    const buildIds = new Set(pack.builds.map((build) => build.id));
    const checkpointIds = new Set(
      pack.checkpoints.map((checkpoint) => checkpoint.id)
    );

    addDuplicateIdIssues(
      pack.validationEvidence,
      "validationEvidence",
      ctx
    );
    addDuplicateIdIssues(pack.builds, "builds", ctx);
    addDuplicateIdIssues(pack.checkpoints, "checkpoints", ctx);
    addDuplicateIdIssues(pack.failedAttempts, "failedAttempts", ctx);
    addDuplicateIdIssues(pack.generationRuns, "generationRuns", ctx);

    pack.builds.forEach((build, buildIndex) => {
      if (build.gameSpecId !== pack.gameSpec.id) {
        addRelationshipIssue(ctx, {
          path: ["builds", buildIndex, "gameSpecId"],
          message: "Build gameSpecId must match the saved Game Spec ID.",
        });
      }

      if (build.checkpointId && !checkpointIds.has(build.checkpointId)) {
        addRelationshipIssue(ctx, {
          path: ["builds", buildIndex, "checkpointId"],
          message: "Build checkpointId must reference an existing checkpoint.",
        });
      }

      addMissingReferenceIssues({
        ctx,
        ids: build.validationEvidenceIds,
        pathPrefix: ["builds", buildIndex, "validationEvidenceIds"],
        knownIds: validationEvidenceIds,
        message:
          "Build validationEvidenceIds must reference existing validation evidence.",
      });
    });

    pack.checkpoints.forEach((checkpoint, checkpointIndex) => {
      if (checkpoint.gameSpecId !== pack.gameSpec.id) {
        addRelationshipIssue(ctx, {
          path: ["checkpoints", checkpointIndex, "gameSpecId"],
          message:
            "Checkpoint gameSpecId must match the saved Game Spec ID.",
        });
      }

      if (checkpoint.buildId && !buildIds.has(checkpoint.buildId)) {
        addRelationshipIssue(ctx, {
          path: ["checkpoints", checkpointIndex, "buildId"],
          message: "Checkpoint buildId must reference an existing build.",
        });
      }

      addMissingReferenceIssues({
        ctx,
        ids: checkpoint.validationEvidenceIds,
        pathPrefix: ["checkpoints", checkpointIndex, "validationEvidenceIds"],
        knownIds: validationEvidenceIds,
        message:
          "Checkpoint validationEvidenceIds must reference existing validation evidence.",
      });
    });

    pack.failedAttempts.forEach((failedAttempt, failedAttemptIndex) => {
      if (
        failedAttempt.gameSpecId &&
        failedAttempt.gameSpecId !== pack.gameSpec.id
      ) {
        addRelationshipIssue(ctx, {
          path: ["failedAttempts", failedAttemptIndex, "gameSpecId"],
          message:
            "Failed attempt gameSpecId must match the saved Game Spec ID.",
        });
      }

      if (failedAttempt.buildId && !buildIds.has(failedAttempt.buildId)) {
        addRelationshipIssue(ctx, {
          path: ["failedAttempts", failedAttemptIndex, "buildId"],
          message: "Failed attempt buildId must reference an existing build.",
        });
      }

      addMissingReferenceIssues({
        ctx,
        ids: failedAttempt.validationEvidenceIds,
        pathPrefix: [
          "failedAttempts",
          failedAttemptIndex,
          "validationEvidenceIds",
        ],
        knownIds: validationEvidenceIds,
        message:
          "Failed attempt validationEvidenceIds must reference existing validation evidence.",
      });
    });
  });

type IdRecord = {
  id: string;
};

type RelationshipPath = (string | number)[];

function addDuplicateIdIssues<TRecord extends IdRecord>(
  records: readonly TRecord[],
  collectionPath: string,
  ctx: z.RefinementCtx
) {
  const seenIds = new Set<string>();

  records.forEach((record, index) => {
    if (seenIds.has(record.id)) {
      addRelationshipIssue(ctx, {
        path: [collectionPath, index, "id"],
        message: `Duplicate ${collectionPath} ID "${record.id}".`,
      });
    }

    seenIds.add(record.id);
  });
}

function addMissingReferenceIssues({
  ctx,
  ids,
  pathPrefix,
  knownIds,
  message,
}: {
  ctx: z.RefinementCtx;
  ids: readonly string[];
  pathPrefix: RelationshipPath;
  knownIds: ReadonlySet<string>;
  message: string;
}) {
  ids.forEach((id, index) => {
    if (!knownIds.has(id)) {
      addRelationshipIssue(ctx, {
        path: [...pathPrefix, index],
        message,
      });
    }
  });
}

function addRelationshipIssue(
  ctx: z.RefinementCtx,
  issue: { path: RelationshipPath; message: string }
) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: issue.path,
    message: issue.message,
  });
}

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
