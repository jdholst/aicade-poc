import { z } from "zod";

import type { RuntimeKind } from "@/runtime/runtime-adapter";

import {
  gameSpecSchema,
  jsonValueSchema,
  stableIdSchema,
} from "../game-spec-schema";
import { generationRunSchema } from "../generation-run/generation-run-schema";
import { hasExactAcceptedArtifactScopedRepairLineage } from "../generation-run/artifact-scoped-mechanic-repair-receipt";
import {
  acceptedGeneratedMechanicArtifactSchema,
  type AcceptedGeneratedMechanicArtifact,
} from "../mechanics/generated-mechanic-project-artifact";

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
    generatedMechanicArtifactIds: z.array(stableIdSchema).optional(),
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
    generatedMechanicArtifactIds: z.array(stableIdSchema).optional(),
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
    generatedMechanicArtifactIds: z.array(stableIdSchema).optional(),
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

export const gamePackSchema = z
  .object({
    schemaVersion: z.literal("game-pack/v1"),
    id: stableIdSchema,
    title: z.string().min(1).max(100),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    runtimeKind: gamePackRuntimeKindSchema,
    templateId: stableIdSchema,
    currentCheckpointId: stableIdSchema.optional(),
    gameSpec: gameSpecSchema,
    builds: z.array(playableBuildSchema),
    checkpoints: z.array(versionCheckpointSchema),
    validationEvidence: z.array(validationEvidenceSchema),
    failedAttempts: z.array(failedAttemptSchema),
    generationRuns: z.array(generationRunSchema),
    acceptedGeneratedMechanicArtifacts: z
      .array(acceptedGeneratedMechanicArtifactSchema)
      .optional(),
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
    const failedAttemptIds = new Set(
      pack.failedAttempts.map((failedAttempt) => failedAttempt.id)
    );
    const acceptedGeneratedMechanicArtifacts =
      pack.acceptedGeneratedMechanicArtifacts ?? [];
    const acceptedGeneratedMechanicArtifactIds = new Set(
      acceptedGeneratedMechanicArtifacts.map((artifact) => artifact.id)
    );
    const generationRunsById = new Map(
      pack.generationRuns.map((generationRun) => [generationRun.id, generationRun])
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
    addDuplicateIdIssues(
      acceptedGeneratedMechanicArtifacts,
      "acceptedGeneratedMechanicArtifacts",
      ctx
    );

    if (
      pack.currentCheckpointId &&
      !checkpointIds.has(pack.currentCheckpointId)
    ) {
      addRelationshipIssue(ctx, {
        path: ["currentCheckpointId"],
        message: "currentCheckpointId must reference an existing checkpoint.",
      });
    }

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

      addMissingReferenceIssues({
        ctx,
        ids: build.generatedMechanicArtifactIds ?? [],
        pathPrefix: ["builds", buildIndex, "generatedMechanicArtifactIds"],
        knownIds: acceptedGeneratedMechanicArtifactIds,
        message:
          "Build generatedMechanicArtifactIds must reference accepted generated mechanic artifacts.",
      });
      addDuplicateReferenceIdIssues({
        ctx,
        ids: build.generatedMechanicArtifactIds ?? [],
        pathPrefix: ["builds", buildIndex, "generatedMechanicArtifactIds"],
        message:
          "Build generatedMechanicArtifactIds must identify each accepted artifact once.",
      });
      build.generatedMechanicArtifactIds?.forEach((artifactId) => {
        const artifact = acceptedGeneratedMechanicArtifacts.find(
          ({ id }) => id === artifactId
        );
        if (artifact && artifact.buildId !== build.id) {
          addRelationshipIssue(ctx, {
            path: ["builds", buildIndex, "generatedMechanicArtifactIds"],
            message:
              "Build generatedMechanicArtifactIds must link only artifacts whose buildId points back to this build.",
          });
        }
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

      if (checkpoint.restoredFromCheckpointId === checkpoint.id) {
        addRelationshipIssue(ctx, {
          path: ["checkpoints", checkpointIndex, "restoredFromCheckpointId"],
          message: "Checkpoint cannot be restored from itself.",
        });
      }

      if (
        checkpoint.restoredFromCheckpointId &&
        !checkpointIds.has(checkpoint.restoredFromCheckpointId)
      ) {
        addRelationshipIssue(ctx, {
          path: ["checkpoints", checkpointIndex, "restoredFromCheckpointId"],
          message:
            "Checkpoint restoredFromCheckpointId must reference an existing checkpoint.",
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

      addMissingReferenceIssues({
        ctx,
        ids: checkpoint.generatedMechanicArtifactIds ?? [],
        pathPrefix: [
          "checkpoints",
          checkpointIndex,
          "generatedMechanicArtifactIds",
        ],
        knownIds: acceptedGeneratedMechanicArtifactIds,
        message:
          "Checkpoint generatedMechanicArtifactIds must reference accepted generated mechanic artifacts.",
      });
      addDuplicateReferenceIdIssues({
        ctx,
        ids: checkpoint.generatedMechanicArtifactIds ?? [],
        pathPrefix: [
          "checkpoints",
          checkpointIndex,
          "generatedMechanicArtifactIds",
        ],
        message:
          "Checkpoint generatedMechanicArtifactIds must identify each accepted artifact once.",
      });
      checkpoint.generatedMechanicArtifactIds?.forEach((artifactId) => {
        const artifact = acceptedGeneratedMechanicArtifacts.find(
          ({ id }) => id === artifactId
        );
        const restoredSource = checkpoint.restoredFromCheckpointId
          ? pack.checkpoints.find(
              ({ id }) => id === checkpoint.restoredFromCheckpointId
            )
          : undefined;
        if (
          artifact &&
          artifact.checkpointId !== checkpoint.id &&
          !restoredSource?.generatedMechanicArtifactIds?.includes(artifact.id)
        ) {
          addRelationshipIssue(ctx, {
            path: [
              "checkpoints",
              checkpointIndex,
              "generatedMechanicArtifactIds",
            ],
            message:
              "Checkpoint generatedMechanicArtifactIds must link an artifact accepted on this checkpoint or inherited from the restored source checkpoint.",
          });
        }
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

    pack.validationEvidence.forEach((evidence, evidenceIndex) => {
      addMissingReferenceIssues({
        ctx,
        ids: evidence.generatedMechanicArtifactIds ?? [],
        pathPrefix: [
          "validationEvidence",
          evidenceIndex,
          "generatedMechanicArtifactIds",
        ],
        knownIds: acceptedGeneratedMechanicArtifactIds,
        message:
          "Validation evidence generatedMechanicArtifactIds must reference accepted generated mechanic artifacts.",
      });
      addDuplicateReferenceIdIssues({
        ctx,
        ids: evidence.generatedMechanicArtifactIds ?? [],
        pathPrefix: [
          "validationEvidence",
          evidenceIndex,
          "generatedMechanicArtifactIds",
        ],
        message:
          "Validation evidence generatedMechanicArtifactIds must identify each accepted artifact once.",
      });
      evidence.generatedMechanicArtifactIds?.forEach((artifactId) => {
        const artifact = acceptedGeneratedMechanicArtifacts.find(
          ({ id }) => id === artifactId
        );
        if (artifact && !artifact.validationEvidenceIds.includes(evidence.id)) {
          addRelationshipIssue(ctx, {
            path: [
              "validationEvidence",
              evidenceIndex,
              "generatedMechanicArtifactIds",
            ],
            message:
              "Validation evidence may link only accepted artifacts that point back to this evidence ID.",
          });
        }
      });
    });

    acceptedGeneratedMechanicArtifacts.forEach((artifact, artifactIndex) => {
      if (!jsonValuesEqual(artifact.finalGameSpec.gameSpec, pack.gameSpec)) {
        addRelationshipIssue(ctx, {
          path: [
            "acceptedGeneratedMechanicArtifacts",
            artifactIndex,
            "finalGameSpec",
            "gameSpec",
          ],
          message:
            "Accepted generated mechanic artifact must retain the exact saved Final Game Spec snapshot.",
        });
      }
      if (artifact.gameSpecId !== pack.gameSpec.id) {
        addRelationshipIssue(ctx, {
          path: [
            "acceptedGeneratedMechanicArtifacts",
            artifactIndex,
            "gameSpecId",
          ],
          message:
            "Accepted generated mechanic artifact gameSpecId must match the saved Game Spec ID.",
        });
      }
      const mechanic = pack.gameSpec.mechanics.find(
        ({ id }) => id === artifact.mechanicId
      );
      if (
        !mechanic ||
        mechanic.type !== artifact.mechanicType ||
        !jsonValuesEqual(mechanic.config, artifact.config)
      ) {
        addRelationshipIssue(ctx, {
          path: [
            "acceptedGeneratedMechanicArtifacts",
            artifactIndex,
            "mechanicId",
          ],
          message:
            "Accepted generated mechanic artifact must match the exact mechanic type and config in the saved Game Spec.",
        });
      }

      const sourceGenerationRun = generationRunsById.get(
        artifact.sourceGenerationRunId
      );
      if (!sourceGenerationRun) {
        addRelationshipIssue(ctx, {
          path: [
            "acceptedGeneratedMechanicArtifacts",
            artifactIndex,
            "sourceGenerationRunId",
          ],
          message:
            "Accepted generated mechanic artifact sourceGenerationRunId must reference a retained GenerationRun.",
        });
      } else {
        if (
          sourceGenerationRun.status !== "succeeded" ||
          !sourceGenerationRun.mechanicIds?.includes(artifact.mechanicId) ||
          !hasExactAcceptedArtifactScopedRepairLineage({
            contractArtifactId: artifact.contract.id,
            finalGameSpecArtifactId: artifact.finalGameSpecArtifactId,
            generationRunId: sourceGenerationRun.id,
            receipt: sourceGenerationRun.artifactScopedRepair,
            sourceArtifactId: artifact.sourceArtifact.id,
          })
        ) {
          addRelationshipIssue(ctx, {
            path: [
              "acceptedGeneratedMechanicArtifacts",
              artifactIndex,
              "sourceGenerationRunId",
            ],
            message:
              "Accepted generated mechanic artifact must come from the succeeded GenerationRun receipt for its exact mechanic and contract → source → Final Game Spec lineage.",
          });
        }
        if (
          !sourceGenerationRun.relationships?.acceptedGeneratedMechanicArtifactIds?.includes(
            artifact.id
          )
        ) {
          addRelationshipIssue(ctx, {
            path: [
              "generationRuns",
              pack.generationRuns.indexOf(sourceGenerationRun),
              "relationships",
              "acceptedGeneratedMechanicArtifactIds",
            ],
            message:
              "Accepted generated mechanic artifact must be linked from its source GenerationRun.",
          });
        }
      }

      const build = pack.builds.find(({ id }) => id === artifact.buildId);
      const checkpoint = pack.checkpoints.find(
        ({ id }) => id === artifact.checkpointId
      );
      if (!build) {
        addRelationshipIssue(ctx, {
          path: [
            "acceptedGeneratedMechanicArtifacts",
            artifactIndex,
            "buildId",
          ],
          message:
            "Accepted generated mechanic artifact buildId must reference an existing build.",
        });
      } else if (!build.generatedMechanicArtifactIds?.includes(artifact.id)) {
        addRelationshipIssue(ctx, {
          path: ["builds", pack.builds.indexOf(build), "generatedMechanicArtifactIds"],
          message:
            "Accepted generated mechanic artifact must be linked from its Playable Build.",
        });
      } else if (build.status !== "validated") {
        addRelationshipIssue(ctx, {
          path: ["builds", pack.builds.indexOf(build), "status"],
          message:
            "Accepted generated mechanic artifact must reference a validated Playable Build.",
        });
      }
      if (!checkpoint) {
        addRelationshipIssue(ctx, {
          path: [
            "acceptedGeneratedMechanicArtifacts",
            artifactIndex,
            "checkpointId",
          ],
          message:
            "Accepted generated mechanic artifact checkpointId must reference an existing checkpoint.",
        });
      } else if (
        !checkpoint.generatedMechanicArtifactIds?.includes(artifact.id)
      ) {
        addRelationshipIssue(ctx, {
          path: [
            "checkpoints",
            pack.checkpoints.indexOf(checkpoint),
            "generatedMechanicArtifactIds",
          ],
          message:
            "Accepted generated mechanic artifact must be linked from its Version Checkpoint.",
        });
      }
      if (build && checkpoint && checkpoint.buildId !== build.id) {
        addRelationshipIssue(ctx, {
          path: [
            "acceptedGeneratedMechanicArtifacts",
            artifactIndex,
            "checkpointId",
          ],
          message:
            "Accepted generated mechanic artifact checkpoint must reference its exact Playable Build.",
        });
      }

      const artifactEvidence = artifact.validationEvidenceIds.flatMap(
        (evidenceId) => {
          const evidence = pack.validationEvidence.find(
            ({ id }) => id === evidenceId
          );
          return evidence ? [evidence] : [];
        }
      );
      if (artifactEvidence.some(({ status }) => status !== "passed")) {
        addRelationshipIssue(ctx, {
          path: [
            "acceptedGeneratedMechanicArtifacts",
            artifactIndex,
            "validationEvidenceIds",
          ],
          message:
            "Accepted generated mechanic artifact may reference only passed validation evidence.",
        });
      }
      const activationEvidence = artifactEvidence.find(
        ({ checkId }) => checkId === "generated_mechanic_activation"
      );
      if (
        !activationEvidence ||
        activationEvidence.evidence?.artifactId !== artifact.id ||
        activationEvidence.evidence?.extensionId !== artifact.extensionId ||
        activationEvidence.evidence?.extensionVersionId !== artifact.versionId ||
        activationEvidence.evidence?.finalGameSpecArtifactId !==
          artifact.finalGameSpecArtifactId ||
        activationEvidence.evidence?.mechanicId !== artifact.mechanicId ||
        activationEvidence.evidence?.sourceArtifactId !==
          artifact.sourceArtifact.id ||
        activationEvidence.evidence?.capabilityVersion !==
          artifact.contract.capabilityVersion ||
        !jsonValuesEqual(
          activationEvidence.evidence?.runtimePolicy,
          artifact.runtimePolicy
        )
      ) {
        addRelationshipIssue(ctx, {
          path: [
            "acceptedGeneratedMechanicArtifacts",
            artifactIndex,
            "validationEvidenceIds",
          ],
          message:
            "Accepted generated mechanic artifact requires exact passed runtime activation evidence.",
        });
      }
      if (
        build &&
        artifact.validationEvidenceIds.some(
          (evidenceId) => !build.validationEvidenceIds.includes(evidenceId)
        )
      ) {
        addRelationshipIssue(ctx, {
          path: ["builds", pack.builds.indexOf(build), "validationEvidenceIds"],
          message:
            "Accepted generated mechanic artifact evidence must belong to its exact Playable Build.",
        });
      }
      if (
        checkpoint &&
        artifact.validationEvidenceIds.some(
          (evidenceId) => !checkpoint.validationEvidenceIds.includes(evidenceId)
        )
      ) {
        addRelationshipIssue(ctx, {
          path: [
            "checkpoints",
            pack.checkpoints.indexOf(checkpoint),
            "validationEvidenceIds",
          ],
          message:
            "Accepted generated mechanic artifact evidence must belong to its exact Version Checkpoint.",
        });
      }

      addMissingReferenceIssues({
        ctx,
        ids: artifact.validationEvidenceIds,
        pathPrefix: [
          "acceptedGeneratedMechanicArtifacts",
          artifactIndex,
          "validationEvidenceIds",
        ],
        knownIds: validationEvidenceIds,
        message:
          "Accepted generated mechanic artifact validationEvidenceIds must reference existing validation evidence.",
      });
      addDuplicateReferenceIdIssues({
        ctx,
        ids: artifact.validationEvidenceIds,
        pathPrefix: [
          "acceptedGeneratedMechanicArtifacts",
          artifactIndex,
          "validationEvidenceIds",
        ],
        message:
          "Accepted generated mechanic artifact validationEvidenceIds must identify each evidence record once.",
      });
      artifact.validationEvidenceIds.forEach((evidenceId) => {
        const evidence = pack.validationEvidence.find(
          ({ id }) => id === evidenceId
        );
        if (
          evidence &&
          !evidence.generatedMechanicArtifactIds?.includes(artifact.id)
        ) {
          addRelationshipIssue(ctx, {
            path: [
              "validationEvidence",
              pack.validationEvidence.indexOf(evidence),
              "generatedMechanicArtifactIds",
            ],
            message:
              "Accepted generated mechanic artifact evidence must link the exact artifact ID.",
          });
        }
      });
    });

    pack.generationRuns.forEach((generationRun, generationRunIndex) => {
      const relationships = generationRun.relationships;

      if (!relationships) {
        return;
      }

      const acceptedArtifactIds =
        relationships.acceptedGeneratedMechanicArtifactIds ?? [];
      if (acceptedArtifactIds.length > 0) {
        if (relationships.gamePackId !== pack.id) {
          addRelationshipIssue(ctx, {
            path: [
              "generationRuns",
              generationRunIndex,
              "relationships",
              "gamePackId",
            ],
            message:
              "A GenerationRun with accepted generated mechanic artifacts must identify this exact Game Pack.",
          });
        }
        if (relationships.gameSpecId !== pack.gameSpec.id) {
          addRelationshipIssue(ctx, {
            path: [
              "generationRuns",
              generationRunIndex,
              "relationships",
              "gameSpecId",
            ],
            message:
              "A GenerationRun with accepted generated mechanic artifacts must identify this exact Game Spec.",
          });
        }

        const linkedArtifacts = acceptedArtifactIds.flatMap((artifactId) => {
          const artifact = acceptedGeneratedMechanicArtifacts.find(
            ({ id }) => id === artifactId
          );
          return artifact ? [artifact] : [];
        });
        const expectedBuildIds = linkedArtifacts.map(({ buildId }) => buildId);
        const expectedCheckpointIds = linkedArtifacts.map(
          ({ checkpointId }) => checkpointId
        );
        const expectedEvidenceIds = linkedArtifacts.flatMap(
          ({ validationEvidenceIds: ids }) => ids
        );
        if (!sameReferenceIds(relationships.buildIds ?? [], expectedBuildIds)) {
          addRelationshipIssue(ctx, {
            path: [
              "generationRuns",
              generationRunIndex,
              "relationships",
              "buildIds",
            ],
            message:
              "A GenerationRun with accepted generated mechanic artifacts may link only their exact Playable Builds.",
          });
        }
        if (
          !sameReferenceIds(
            relationships.checkpointIds ?? [],
            expectedCheckpointIds
          )
        ) {
          addRelationshipIssue(ctx, {
            path: [
              "generationRuns",
              generationRunIndex,
              "relationships",
              "checkpointIds",
            ],
            message:
              "A GenerationRun with accepted generated mechanic artifacts may link only their exact Version Checkpoints.",
          });
        }
        if (
          !sameReferenceIds(
            relationships.validationEvidenceIds ?? [],
            expectedEvidenceIds
          )
        ) {
          addRelationshipIssue(ctx, {
            path: [
              "generationRuns",
              generationRunIndex,
              "relationships",
              "validationEvidenceIds",
            ],
            message:
              "A GenerationRun with accepted generated mechanic artifacts may link only their exact validation evidence.",
          });
        }
        if ((relationships.failedAttemptIds?.length ?? 0) > 0) {
          addRelationshipIssue(ctx, {
            path: [
              "generationRuns",
              generationRunIndex,
              "relationships",
              "failedAttemptIds",
            ],
            message:
              "Accepted generated mechanic lineage must not claim unrelated failed attempts.",
          });
        }
      }

      if (relationships.gamePackId && relationships.gamePackId !== pack.id) {
        addRelationshipIssue(ctx, {
          path: [
            "generationRuns",
            generationRunIndex,
            "relationships",
            "gamePackId",
          ],
          message: "GenerationRun gamePackId must reference this Game Pack.",
        });
      }

      if (
        relationships.gameSpecId &&
        relationships.gameSpecId !== pack.gameSpec.id
      ) {
        addRelationshipIssue(ctx, {
          path: [
            "generationRuns",
            generationRunIndex,
            "relationships",
            "gameSpecId",
          ],
          message:
            "GenerationRun gameSpecId must match the saved Game Spec ID.",
        });
      }

      addMissingReferenceIssues({
        ctx,
        ids: relationships.buildIds ?? [],
        pathPrefix: [
          "generationRuns",
          generationRunIndex,
          "relationships",
          "buildIds",
        ],
        knownIds: buildIds,
        message: "GenerationRun buildIds must reference existing builds.",
      });

      addMissingReferenceIssues({
        ctx,
        ids: acceptedArtifactIds,
        pathPrefix: [
          "generationRuns",
          generationRunIndex,
          "relationships",
          "acceptedGeneratedMechanicArtifactIds",
        ],
        knownIds: acceptedGeneratedMechanicArtifactIds,
        message:
          "GenerationRun acceptedGeneratedMechanicArtifactIds must reference accepted generated mechanic artifacts.",
      });
      addDuplicateReferenceIdIssues({
        ctx,
        ids: acceptedArtifactIds,
        pathPrefix: [
          "generationRuns",
          generationRunIndex,
          "relationships",
          "acceptedGeneratedMechanicArtifactIds",
        ],
        message:
          "GenerationRun acceptedGeneratedMechanicArtifactIds must identify each accepted artifact once.",
      });
      acceptedArtifactIds.forEach((artifactId) => {
        const artifact = acceptedGeneratedMechanicArtifacts.find(
          ({ id }) => id === artifactId
        );
        if (artifact && artifact.sourceGenerationRunId !== generationRun.id) {
          addRelationshipIssue(ctx, {
            path: [
              "generationRuns",
              generationRunIndex,
              "relationships",
              "acceptedGeneratedMechanicArtifactIds",
            ],
            message:
              "GenerationRun may link only accepted artifacts whose sourceGenerationRunId points back to this run.",
          });
        }
      });

      addMissingReferenceIssues({
        ctx,
        ids: relationships.checkpointIds ?? [],
        pathPrefix: [
          "generationRuns",
          generationRunIndex,
          "relationships",
          "checkpointIds",
        ],
        knownIds: checkpointIds,
        message:
          "GenerationRun checkpointIds must reference existing checkpoints.",
      });

      addMissingReferenceIssues({
        ctx,
        ids: relationships.validationEvidenceIds ?? [],
        pathPrefix: [
          "generationRuns",
          generationRunIndex,
          "relationships",
          "validationEvidenceIds",
        ],
        knownIds: validationEvidenceIds,
        message:
          "GenerationRun validationEvidenceIds must reference existing validation evidence.",
      });

      addMissingReferenceIssues({
        ctx,
        ids: relationships.failedAttemptIds ?? [],
        pathPrefix: [
          "generationRuns",
          generationRunIndex,
          "relationships",
          "failedAttemptIds",
        ],
        knownIds: failedAttemptIds,
        message:
          "GenerationRun failedAttemptIds must reference existing failed attempts.",
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

function addDuplicateReferenceIdIssues({
  ctx,
  ids,
  pathPrefix,
  message,
}: {
  ctx: z.RefinementCtx;
  ids: readonly string[];
  pathPrefix: RelationshipPath;
  message: string;
}) {
  const seenIds = new Set<string>();
  ids.forEach((id, index) => {
    if (seenIds.has(id)) {
      addRelationshipIssue(ctx, {
        path: [...pathPrefix, index],
        message,
      });
    }
    seenIds.add(id);
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

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function sameReferenceIds(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${stableJsonStringify(child)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
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
export type { AcceptedGeneratedMechanicArtifact };
export type GamePack = z.infer<typeof gamePackSchema>;
