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
        trigger: z
          .enum(["stage_failure", "upstream_invalidation"])
          .optional(),
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
    const attemptsById = new Map<
      ArtifactScopedRepairAttemptId,
      ArtifactScopedRepairAttemptReceipt
    >();
    receipt.attempts.forEach((attempt, attemptIndex) => {
      if (attemptsById.has(attempt.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts", attemptIndex, "id"],
          message: "Repair attempt IDs must be unique within a GenerationRun.",
        });
      } else {
        attemptsById.set(attempt.id, attempt);
      }

      const isInitialAttempt = attempt.attemptNumber === 1;
      if (
        (isInitialAttempt && attempt.kind !== "initial") ||
        (!isInitialAttempt && attempt.kind !== "repair")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts", attemptIndex, "kind"],
          message:
            "Attempt one must be initial and every later stage attempt must be a repair.",
        });
      }
      if (attempt.kind === "repair" && !attempt.repair) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts", attemptIndex, "repair"],
          message: "Repair attempts require their exact repair trigger receipt.",
        });
      }
      if (attempt.kind === "initial" && attempt.repair) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts", attemptIndex, "repair"],
          message: "Initial attempts cannot carry repair trigger evidence.",
        });
      }
      if (
        attempt.status === "accepted" &&
        (!attempt.artifactId ||
          attempt.issues !== undefined ||
          attempt.responsibleStage !== undefined)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts", attemptIndex],
          message:
            "Accepted attempts require an artifact and cannot carry rejection evidence.",
        });
      }
      if (
        attempt.status === "rejected" &&
        (!attempt.issues ||
          attempt.issues.length === 0 ||
          !attempt.responsibleStage)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts", attemptIndex],
          message:
            "Rejected attempts require exact issues and the responsible stage.",
        });
      }
    });

    ARTIFACT_SCOPED_REPAIR_STAGES.forEach((stage) => {
      const stageAttempts = receipt.attempts
        .filter((attempt) => attempt.stage === stage)
        .sort((left, right) => left.attemptNumber - right.attemptNumber);
      if (receipt.maximumAttempts[stage] < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maximumAttempts", stage],
          message: "Every repair stage requires at least one allowed attempt.",
        });
      }
      if (
        receipt.attemptCounts[stage] !== stageAttempts.length ||
        stageAttempts.length > receipt.maximumAttempts[stage]
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attemptCounts", stage],
          message:
            "Stage attempt counts must equal retained attempts and stay within the recorded maximum.",
        });
      }
      stageAttempts.forEach((attempt, attemptIndex) => {
        if (attempt.attemptNumber !== attemptIndex + 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              "attempts",
              receipt.attempts.indexOf(attempt),
              "attemptNumber",
            ],
            message:
              "Attempt numbers must be unique and contiguous within each repair stage.",
          });
        }
      });
    });

    receipt.attempts.forEach((attempt, attemptIndex) => {
      const repair = attempt.repair;
      if (!repair) {
        return;
      }
      const failureAttempt = attemptsById.get(repair.failureAttemptId);
      if (!failureAttempt || failureAttempt.status !== "rejected") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts", attemptIndex, "repair", "failureAttemptId"],
          message:
            "Repair failureAttemptId must reference a retained rejected attempt.",
        });
        return;
      }
      const repairStageIndex = ARTIFACT_SCOPED_REPAIR_STAGES.indexOf(
        attempt.stage
      );
      const responsibleStageIndex = failureAttempt.responsibleStage
        ? ARTIFACT_SCOPED_REPAIR_STAGES.indexOf(
            failureAttempt.responsibleStage
          )
        : -1;
      if (
        (repair.trigger === "stage_failure" &&
          failureAttempt.responsibleStage !== attempt.stage) ||
        (repair.trigger === "upstream_invalidation" &&
          (responsibleStageIndex < 0 ||
            responsibleStageIndex >= repairStageIndex))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts", attemptIndex, "repair", "failureAttemptId"],
          message:
            "Repair triggers must reference a failure assigned to that stage or one of its upstream stages.",
        });
      }
      if (
        repair.trigger === "stage_failure" &&
        JSON.stringify(repair.issues) !==
          JSON.stringify(failureAttempt.issues)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts", attemptIndex, "repair", "issues"],
          message:
            "Stage-failure repair evidence must exactly retain the referenced failure issues.",
        });
      }
    });

    const artifactsById = new Map<
      ArtifactScopedRepairArtifactId,
      ArtifactScopedRepairArtifactReceipt
    >();
    receipt.artifacts.forEach((artifact, artifactIndex) => {
      if (artifactsById.has(artifact.artifactId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts", artifactIndex, "artifactId"],
          message: "Repair artifact IDs must be unique within a GenerationRun.",
        });
      } else {
        artifactsById.set(artifact.artifactId, artifact);
      }
      const attempt = attemptsById.get(artifact.attemptId);
      const expectedAttemptStatus =
        artifact.status === "invalidated" ? "accepted" : artifact.status;
      if (
        !attempt ||
        attempt.stage !== artifact.stage ||
        attempt.artifactId !== artifact.artifactId ||
        attempt.status !== expectedAttemptStatus
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts", artifactIndex, "attemptId"],
          message:
            "Artifact receipts must reference the exact attempt that produced that artifact and status.",
        });
      }
      if (
        artifact.dependsOnArtifactIds.some(
          (artifactId) =>
            !receipt.artifacts.some(
              (candidate) => candidate.artifactId === artifactId
            )
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts", artifactIndex, "dependsOnArtifactIds"],
          message:
            "Artifact dependencies must reference artifacts retained in the same receipt.",
        });
      }
      if (artifact.invalidatedByAttemptId) {
        const invalidatingAttempt = attemptsById.get(
          artifact.invalidatedByAttemptId
        );
        if (!invalidatingAttempt || invalidatingAttempt.status !== "rejected") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["artifacts", artifactIndex, "invalidatedByAttemptId"],
            message:
              "Artifact invalidation must reference a retained rejected attempt.",
          });
        }
      }
    });

    receipt.attempts.forEach((attempt, attemptIndex) => {
      if (
        attempt.artifactId &&
        !receipt.artifacts.some(
          (artifact) =>
            artifact.artifactId === attempt.artifactId &&
            artifact.attemptId === attempt.id
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attempts", attemptIndex, "artifactId"],
          message:
            "Every produced attempt artifact must have one matching artifact receipt.",
        });
      }
      attempt.repair?.invalidatedArtifactIds.forEach(
        (artifactId, invalidatedArtifactIndex) => {
          const artifact = artifactsById.get(artifactId);
          if (
            !artifact ||
            artifact.status !== "invalidated" ||
            artifact.invalidatedByAttemptId !==
              attempt.repair?.failureAttemptId
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [
                "attempts",
                attemptIndex,
                "repair",
                "invalidatedArtifactIds",
                invalidatedArtifactIndex,
              ],
              message:
                "Repair invalidation IDs must reference artifacts invalidated by the cited failure attempt.",
            });
          }
        }
      );
    });

    const hadRepair = receipt.attempts.some(
      (attempt) => attempt.kind === "repair"
    );
    if (
      receipt.status === "succeeded" &&
      receipt.repairStatus !== (hadRepair ? "repaired" : "not_needed")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repairStatus"],
        message:
          "Successful receipt repair status must match whether repair attempts occurred.",
      });
    }

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

    if (receipt.exhausted) {
      const failureAttempt = attemptsById.get(
        receipt.exhausted.failureAttemptId
      );
      const exhaustedStageIndex = ARTIFACT_SCOPED_REPAIR_STAGES.indexOf(
        receipt.exhausted.stage
      );
      const responsibleStageIndex = failureAttempt?.responsibleStage
        ? ARTIFACT_SCOPED_REPAIR_STAGES.indexOf(
            failureAttempt.responsibleStage
          )
        : -1;
      const exhaustionTrigger =
        receipt.exhausted.trigger ?? "stage_failure";
      const failureMatchesExhaustion =
        exhaustionTrigger === "stage_failure"
          ? failureAttempt?.responsibleStage === receipt.exhausted.stage
          : responsibleStageIndex >= 0 &&
            responsibleStageIndex < exhaustedStageIndex;
      if (
        !failureAttempt ||
        failureAttempt.status !== "rejected" ||
        !failureMatchesExhaustion ||
        receipt.exhausted.maximumAttempts !==
          receipt.maximumAttempts[receipt.exhausted.stage] ||
        receipt.attemptCounts[receipt.exhausted.stage] !==
          receipt.exhausted.maximumAttempts ||
        JSON.stringify(receipt.exhausted.issues) !==
          JSON.stringify(failureAttempt.issues)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["exhausted"],
          message:
            "Exhaustion evidence must exactly reference the rejected failure that consumed or invalidated the exhausted stage.",
        });
      }
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

export function hasExactAcceptedArtifactScopedRepairLineage({
  contractArtifactId,
  finalGameSpecArtifactId,
  generationRunId,
  receipt,
  sourceArtifactId,
}: Readonly<{
  contractArtifactId: string;
  finalGameSpecArtifactId: string;
  generationRunId: string;
  receipt: ArtifactScopedMechanicRepairReceipt | undefined;
  sourceArtifactId: string;
}>): boolean {
  const parsedReceipt = artifactScopedMechanicRepairReceiptSchema.safeParse(
    receipt
  );
  if (!parsedReceipt.success) {
    return false;
  }
  const validatedReceipt = parsedReceipt.data;
  if (
    validatedReceipt.generationRunId !== generationRunId ||
    validatedReceipt.status !== "succeeded"
  ) {
    return false;
  }

  const expectedStages = [
    {
      artifactId: contractArtifactId,
      dependsOnArtifactIds: [],
      inputArtifactIds: [],
      stage: "contract",
    },
    {
      artifactId: sourceArtifactId,
      dependsOnArtifactIds: [contractArtifactId],
      inputArtifactIds: [contractArtifactId],
      stage: "source",
    },
    {
      artifactId: finalGameSpecArtifactId,
      dependsOnArtifactIds: [sourceArtifactId],
      inputArtifactIds: [contractArtifactId, sourceArtifactId],
      stage: "finalGameSpec",
    },
  ] as const;

  return expectedStages.every((expected) => {
    const acceptedArtifacts = validatedReceipt.artifacts.filter(
      (artifact) =>
        artifact.stage === expected.stage && artifact.status === "accepted"
    );
    if (acceptedArtifacts.length !== 1) {
      return false;
    }
    const [artifact] = acceptedArtifacts;
    if (
      artifact.artifactId !== expected.artifactId ||
      !sameIds(artifact.dependsOnArtifactIds, expected.dependsOnArtifactIds)
    ) {
      return false;
    }

    const matchingAttempts = validatedReceipt.attempts.filter(
      (attempt) =>
        attempt.id === artifact.attemptId &&
        attempt.stage === expected.stage &&
        attempt.status === "accepted" &&
        attempt.artifactId === expected.artifactId &&
        sameIds(attempt.inputArtifactIds, expected.inputArtifactIds)
    );
    return matchingAttempts.length === 1;
  });
}

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

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
