import { z } from "zod";

import { stableIdSchema } from "../game-spec-schema";

export const ARTIFACT_SCOPED_MECHANIC_REPAIR_VERSION =
  "artifact_scoped_mechanic_repair/v1" as const;

export const ARTIFACT_SCOPED_REPAIR_STAGES = [
  "contract",
  "source",
  "finalGameSpec",
] as const;

export const artifactScopedRepairStageSchema = z.enum(
  ARTIFACT_SCOPED_REPAIR_STAGES
);

export const artifactScopedRepairArtifactIdSchema = z
  .string()
  .min(1)
  .max(240)
  .brand<"ArtifactScopedRepairArtifactId">();
export const artifactScopedRepairAttemptIdSchema = z
  .string()
  .min(1)
  .max(240)
  .brand<"ArtifactScopedRepairAttemptId">();

const artifactScopedRepairIssueSchema = z
  .object({
    path: z.string().min(1).max(240),
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(500),
  })
  .strict();

const artifactScopedRepairAttemptCountsSchema = z
  .object({
    contract: z.number().int().nonnegative(),
    source: z.number().int().nonnegative(),
    finalGameSpec: z.number().int().nonnegative(),
  })
  .strict();

const artifactScopedRepairTriggerSchema = z
  .object({
    trigger: z.enum(["stage_failure", "upstream_invalidation"]),
    failureAttemptId: artifactScopedRepairAttemptIdSchema,
    issues: z.array(artifactScopedRepairIssueSchema),
    invalidatedArtifactIds: z.array(artifactScopedRepairArtifactIdSchema),
  })
  .strict()
  .superRefine((repair, ctx) => {
    if (repair.trigger === "stage_failure" && repair.issues.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["issues"],
        message: "Stage-failure repair receipts require exact issue evidence.",
      });
    }

    if (
      repair.trigger === "upstream_invalidation" &&
      repair.issues.length > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["issues"],
        message:
          "Upstream-invalidation receipts must not misroute upstream issues to a downstream stage.",
      });
    }
  });

export const artifactScopedRepairAttemptReceiptSchema = z
  .object({
    id: artifactScopedRepairAttemptIdSchema,
    stage: artifactScopedRepairStageSchema,
    attemptNumber: z.number().int().positive(),
    kind: z.enum(["initial", "repair"]),
    status: z.enum(["accepted", "rejected"]),
    durationMs: z.number().finite().nonnegative(),
    inputArtifactIds: z.array(artifactScopedRepairArtifactIdSchema),
    artifactId: artifactScopedRepairArtifactIdSchema.optional(),
    issues: z.array(artifactScopedRepairIssueSchema).optional(),
    responsibleStage: artifactScopedRepairStageSchema.optional(),
    repair: artifactScopedRepairTriggerSchema.optional(),
  })
  .strict();

export const artifactScopedRepairArtifactReceiptSchema = z
  .object({
    artifactId: artifactScopedRepairArtifactIdSchema,
    stage: artifactScopedRepairStageSchema,
    attemptId: artifactScopedRepairAttemptIdSchema,
    status: z.enum(["accepted", "rejected", "invalidated"]),
    dependsOnArtifactIds: z.array(artifactScopedRepairArtifactIdSchema),
    invalidatedByAttemptId: artifactScopedRepairAttemptIdSchema.optional(),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    if (
      artifact.status === "invalidated" &&
      !artifact.invalidatedByAttemptId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["invalidatedByAttemptId"],
        message: "Invalidated artifacts require the invalidating attempt ID.",
      });
    }

    if (
      artifact.status !== "invalidated" &&
      artifact.invalidatedByAttemptId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["invalidatedByAttemptId"],
        message:
          "Only invalidated artifacts may carry an invalidating attempt ID.",
      });
    }
  });

export const artifactScopedMechanicRepairReceiptSchema = z
  .object({
    schemaVersion: z.literal(ARTIFACT_SCOPED_MECHANIC_REPAIR_VERSION),
    generationRunId: stableIdSchema,
    status: z.enum(["succeeded", "repair_exhausted"]),
    repairStatus: z.enum(["not_needed", "repaired", "repair_exhausted"]),
    durationMs: z.number().finite().nonnegative(),
    maximumAttempts: artifactScopedRepairAttemptCountsSchema,
    attemptCounts: artifactScopedRepairAttemptCountsSchema,
    attempts: z.array(artifactScopedRepairAttemptReceiptSchema),
    artifacts: z.array(artifactScopedRepairArtifactReceiptSchema),
    exhausted: z
      .object({
        stage: artifactScopedRepairStageSchema,
        maximumAttempts: z.number().int().positive(),
        failureAttemptId: artifactScopedRepairAttemptIdSchema,
        issues: z.array(artifactScopedRepairIssueSchema).min(1),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    if (
      receipt.status === "repair_exhausted" &&
      receipt.repairStatus !== "repair_exhausted"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repairStatus"],
        message:
          "Repair-exhausted receipts require repair_exhausted repair status.",
      });
    }

    if (receipt.status === "repair_exhausted" && !receipt.exhausted) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exhausted"],
        message: "Repair-exhausted receipts require exhaustion evidence.",
      });
    }

    if (receipt.status === "succeeded" && receipt.exhausted) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exhausted"],
        message: "Successful repair receipts cannot carry exhaustion evidence.",
      });
    }
  });

export type ArtifactScopedRepairStage = z.infer<
  typeof artifactScopedRepairStageSchema
>;
export type ArtifactScopedRepairArtifactId = z.infer<
  typeof artifactScopedRepairArtifactIdSchema
>;
export type ArtifactScopedRepairAttemptId = z.infer<
  typeof artifactScopedRepairAttemptIdSchema
>;
export type ArtifactScopedRepairIssue = z.infer<
  typeof artifactScopedRepairIssueSchema
>;
export type ArtifactScopedRepairAttemptReceipt = z.infer<
  typeof artifactScopedRepairAttemptReceiptSchema
>;
export type ArtifactScopedRepairArtifactReceipt = z.infer<
  typeof artifactScopedRepairArtifactReceiptSchema
>;
export type ArtifactScopedMechanicRepairReceipt = z.infer<
  typeof artifactScopedMechanicRepairReceiptSchema
>;

export type ArtifactScopedRepairGenerationRunOutcome =
  | Readonly<{
      status: "succeeded";
      repairStatus: "not-needed" | "repaired";
    }>
  | Readonly<{
      status: "failed";
      repairStatus: "repair-exhausted";
      stage: "repair";
      failureClass: "repair-exhausted";
    }>;

export function getArtifactScopedRepairGenerationRunOutcome(
  receipt: Pick<
    ArtifactScopedMechanicRepairReceipt,
    "repairStatus" | "status"
  >
): ArtifactScopedRepairGenerationRunOutcome {
  if (receipt.status === "repair_exhausted") {
    return {
      status: "failed",
      repairStatus: "repair-exhausted",
      stage: "repair",
      failureClass: "repair-exhausted",
    };
  }

  return {
    status: "succeeded",
    repairStatus:
      receipt.repairStatus === "not_needed" ? "not-needed" : "repaired",
  };
}
