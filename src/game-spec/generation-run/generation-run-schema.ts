import { z } from "zod";

import type { RuntimeKind } from "@/runtime/runtime-adapter";

import { jsonValueSchema, stableIdSchema } from "../game-spec-schema";
import {
  artifactScopedMechanicRepairReceiptSchema,
  getArtifactScopedRepairGenerationRunOutcome,
} from "./artifact-scoped-mechanic-repair-receipt";

const runtimeKindValues = [
  "canvas2d",
  "phaser",
] as const satisfies readonly RuntimeKind[];

const isoDateTimeSchema = z.string().datetime({ offset: true });
const metadataSchema = z.record(z.string(), jsonValueSchema);

const generationRunRuntimeKindSchema = z.enum(runtimeKindValues);

const generationRunValidationIssueSchema = z
  .object({
    code: stableIdSchema.optional(),
    path: z.string().min(1).max(240).optional(),
    message: z.string().min(1).max(500),
  })
  .strict();

const generatedMechanicRejectedOutcomeSchema = z
  .object({
    status: z.literal("rejected"),
    stage: z.enum([
      "foundation",
      "preflight",
      "deterministic_evaluation",
      "runtime_activation",
      "first_playable",
      "persistence",
      "continuation",
    ]),
    issues: z
      .array(
        z
          .object({
            path: z.string().min(1),
            code: stableIdSchema,
            message: z.string().min(1),
          })
          .strict()
      )
      .min(1),
    runtimeEvidence: jsonValueSchema.optional(),
  })
  .strict();

const downstreamGeneratedMechanicFailureByStage = {
  foundation: {
    stage: "artifact-build",
    failureClass: "build-failure",
  },
  preflight: {
    stage: "artifact-build",
    failureClass: "build-failure",
  },
  deterministic_evaluation: {
    stage: "artifact-build",
    failureClass: "build-failure",
  },
  runtime_activation: {
    stage: "runtime-boot",
    failureClass: "build-failure",
  },
  first_playable: {
    stage: "browser-check",
    failureClass: "first-playable-failure",
  },
  persistence: {
    stage: "artifact-build",
    failureClass: "build-failure",
  },
  continuation: {
    stage: "artifact-build",
    failureClass: "build-failure",
  },
} as const;

export const generationRunOperationTypeSchema = z.enum([
  "generate",
  "edit",
  "repair",
]);

export const generationRunStatusSchema = z.enum([
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timed-out",
]);

export const generationRunRepairStatusSchema = z.enum([
  "not-needed",
  "repaired",
  "repair-exhausted",
]);

export const generationRunFailureStageSchema = z.enum([
  "model-generation",
  "schema-validation",
  "semantic-validation",
  "mechanic-validation",
  "artifact-build",
  "runtime-boot",
  "browser-check",
  "repair",
  "timeout",
  "cancellation",
]);

export const generationRunFailureClassSchema = z.enum([
  "provider-request-failure",
  "invalid-model-output",
  "unsupported-prompt-intent",
  "repair-exhausted",
  "build-failure",
  "first-playable-failure",
  "timeout",
  "cancellation",
]);

export const generationRunCostEstimateSchema = z
  .object({
    amountUsd: z.number().finite().nonnegative(),
    currency: z.literal("USD"),
    source: z.enum(["provider_usage", "pricing_table", "manual"]),
    quality: z.enum(["exact", "estimated", "unknown"]),
  })
  .strict();

export const generationRunUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
  })
  .strict();

export const generationRunCandidateSummarySchema = z
  .object({
    kind: z.enum([
      "validated_spec",
      "invalid_candidate",
      "provider_error",
      "no_candidate",
    ]),
    gameSpecId: stableIdSchema.optional(),
    summary: z.string().min(1).max(500),
    issueCount: z.number().int().nonnegative().optional(),
    referencedMechanicIds: z.array(stableIdSchema).optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const generationRunAttemptValidationSchema = z
  .object({
    stage: generationRunFailureStageSchema,
    status: z.enum(["passed", "failed", "skipped"]),
    issues: z.array(generationRunValidationIssueSchema).optional(),
  })
  .strict();

export const generationRunAttemptReceiptSchema = z
  .object({
    id: stableIdSchema,
    attemptNumber: z.number().int().positive(),
    kind: z.enum(["initial", "repair"]),
    status: generationRunStatusSchema,
    provider: z.string().min(1).max(80),
    model: z.string().min(1).max(120),
    taskRoute: z.string().min(1).max(120),
    requestSummary: z.string().min(1).max(500),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.optional(),
    durationMs: z.number().finite().nonnegative().optional(),
    usage: generationRunUsageSchema.optional(),
    cost: generationRunCostEstimateSchema.optional(),
    validation: generationRunAttemptValidationSchema.optional(),
    repair: z
      .object({
        sourceAttemptId: stableIdSchema,
        reason: z.string().min(1).max(500),
        validationIssueCount: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
    candidate: generationRunCandidateSummarySchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const generationRunRequestSchema = z
  .object({
    summary: z.string().min(1).max(500),
    promptText: z.string().min(1).max(5000).optional(),
    targetGameSpecId: stableIdSchema.optional(),
  })
  .strict();

export const generationRunRelationshipsSchema = z
  .object({
    gamePackId: stableIdSchema.optional(),
    gameSpecId: stableIdSchema.optional(),
    acceptedGeneratedMechanicArtifactIds: z.array(stableIdSchema).optional(),
    buildIds: z.array(stableIdSchema).optional(),
    checkpointIds: z.array(stableIdSchema).optional(),
    validationEvidenceIds: z.array(stableIdSchema).optional(),
    failedAttemptIds: z.array(stableIdSchema).optional(),
  })
  .strict();

export const generationRunSchema = z
  .object({
    id: stableIdSchema,
    operationType: generationRunOperationTypeSchema,
    status: generationRunStatusSchema,
    repairStatus: generationRunRepairStatusSchema.optional(),
    createdAt: isoDateTimeSchema,
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.optional(),
    durationMs: z.number().finite().nonnegative().optional(),
    request: generationRunRequestSchema,
    runtimeKind: generationRunRuntimeKindSchema.optional(),
    templateId: stableIdSchema.optional(),
    mechanicIds: z.array(stableIdSchema).optional(),
    attempts: z.array(generationRunAttemptReceiptSchema),
    stage: generationRunFailureStageSchema.optional(),
    failureClass: generationRunFailureClassSchema.optional(),
    cost: generationRunCostEstimateSchema.optional(),
    relationships: generationRunRelationshipsSchema.optional(),
    artifactScopedRepair: artifactScopedMechanicRepairReceiptSchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict()
  .superRefine((run, ctx) => {
    const terminalFailureStatuses = new Set([
      "failed",
      "cancelled",
      "timed-out",
    ]);
    const attemptIds = new Set(run.attempts.map((attempt) => attempt.id));

    if (terminalFailureStatuses.has(run.status)) {
      if (!run.failureClass) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["failureClass"],
          message:
            "Non-success terminal GenerationRun outcomes require a failureClass.",
        });
      }

      if (!run.stage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stage"],
          message:
            "Non-success terminal GenerationRun outcomes require a failure stage.",
        });
      }
    }

    if (
      (run.status === "succeeded" || run.status === "running") &&
      run.failureClass
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failureClass"],
        message:
          "Successful and running GenerationRun receipts must leave failureClass absent.",
      });
    }

    if (run.repairStatus === "repaired") {
      if (
        run.status !== "succeeded" &&
        !isExactDownstreamGeneratedMechanicOutcome(run)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["repairStatus"],
          message:
            "Repaired GenerationRun receipts must either succeed or retain an exact downstream generated-mechanic failure or interruption.",
        });
      }

      const hasArtifactScopedFailedAttempt =
        run.artifactScopedRepair?.attempts.some(
          (attempt) => attempt.status === "rejected"
        ) ?? false;
      const hasArtifactScopedSuccessfulRepair =
        run.artifactScopedRepair?.attempts.some(
          (attempt) =>
            attempt.kind === "repair" && attempt.status === "accepted"
        ) ?? false;

      if (
        !run.attempts.some((attempt) => attempt.status === "failed") &&
        !hasArtifactScopedFailedAttempt
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts"],
          message:
            "Repaired GenerationRun receipts must include the failed attempt evidence.",
        });
      }

      if (
        !run.attempts.some(
          (attempt) =>
            attempt.kind === "repair" && attempt.status === "succeeded"
        ) &&
        !hasArtifactScopedSuccessfulRepair
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts"],
          message:
            "Repaired GenerationRun receipts must include a successful repair attempt.",
        });
      }
    }

    if (run.repairStatus === "repair-exhausted" && run.status !== "failed") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repairStatus"],
        message:
          "Repair-exhausted GenerationRun receipts must end with failed status.",
      });
    }

    if (run.artifactScopedRepair) {
      if (run.artifactScopedRepair.generationRunId !== run.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifactScopedRepair", "generationRunId"],
          message:
            "Artifact-scoped repair evidence must belong to the same GenerationRun.",
        });
      }

      const expectedOutcome = getArtifactScopedRepairGenerationRunOutcome(
        run.artifactScopedRepair
      );
      if (run.repairStatus !== expectedOutcome.repairStatus) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["repairStatus"],
          message:
            "GenerationRun repairStatus must match its artifact-scoped repair receipt.",
        });
      }

      const preservesSuccessfulRepairBeforeDownstreamFailure =
        expectedOutcome.status === "succeeded" &&
        isExactDownstreamGeneratedMechanicOutcome(run);
      if (
        run.status !== expectedOutcome.status &&
        !preservesSuccessfulRepairBeforeDownstreamFailure
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["status"],
          message:
            "GenerationRun status must match its artifact-scoped repair receipt.",
        });
      }

      if (
        expectedOutcome.status === "failed" &&
        (run.stage !== expectedOutcome.stage ||
          run.failureClass !== expectedOutcome.failureClass)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stage"],
          message:
            "Repair-exhausted GenerationRuns require the repair stage and repair-exhausted failure class.",
        });
      }
    }

    const seenAttemptIds = new Set<string>();

    run.attempts.forEach((attempt, attemptIndex) => {
      if (seenAttemptIds.has(attempt.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts", attemptIndex, "id"],
          message:
            "GenerationRun attempt receipt IDs must be unique within the run.",
        });
      }
      seenAttemptIds.add(attempt.id);

      if (
        attempt.repair?.sourceAttemptId &&
        !attemptIds.has(attempt.repair.sourceAttemptId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts", attemptIndex, "repair", "sourceAttemptId"],
          message:
            "Repair attempt sourceAttemptId must reference another attempt in the same GenerationRun.",
        });
      }
    });
  });

function isExactDownstreamGeneratedMechanicOutcome(
  run: Readonly<{
    status: z.infer<typeof generationRunStatusSchema>;
    stage?: z.infer<typeof generationRunFailureStageSchema>;
    failureClass?: z.infer<typeof generationRunFailureClassSchema>;
    metadata?: z.infer<typeof metadataSchema>;
  }>
): boolean {
  const outcome = generatedMechanicRejectedOutcomeSchema.safeParse(
    run.metadata?.generatedMechanicOutcome
  );
  if (!outcome.success) {
    return false;
  }
  if (run.status === "cancelled" || run.status === "timed-out") {
    const expectedInterruption =
      run.status === "timed-out"
        ? { stage: "timeout", failureClass: "timeout" }
        : { stage: "cancellation", failureClass: "cancellation" };
    return (
      outcome.data.issues.some(({ code }) => code === "generation_cancelled") &&
      run.stage === expectedInterruption.stage &&
      run.failureClass === expectedInterruption.failureClass
    );
  }
  if (run.status !== "failed") {
    return false;
  }
  const expected = downstreamGeneratedMechanicFailureByStage[outcome.data.stage];
  return (
    run.stage === expected.stage && run.failureClass === expected.failureClass
  );
}

export type GenerationRunOperationType = z.infer<
  typeof generationRunOperationTypeSchema
>;
export type GenerationRunStatus = z.infer<typeof generationRunStatusSchema>;
export type GenerationRunRepairStatus = z.infer<
  typeof generationRunRepairStatusSchema
>;
export type GenerationRunFailureStage = z.infer<
  typeof generationRunFailureStageSchema
>;
export type GenerationRunFailureClass = z.infer<
  typeof generationRunFailureClassSchema
>;
export type GenerationRunCostEstimate = z.infer<
  typeof generationRunCostEstimateSchema
>;
export type GenerationRunUsage = z.infer<typeof generationRunUsageSchema>;
export type GenerationRunCandidateSummary = z.infer<
  typeof generationRunCandidateSummarySchema
>;
export type GenerationRunAttemptValidation = z.infer<
  typeof generationRunAttemptValidationSchema
>;
export type GenerationRunAttemptReceipt = z.infer<
  typeof generationRunAttemptReceiptSchema
>;
export type GenerationRunRequest = z.infer<typeof generationRunRequestSchema>;
export type GenerationRunRelationships = z.infer<
  typeof generationRunRelationshipsSchema
>;
export type GenerationRun = z.infer<typeof generationRunSchema>;
