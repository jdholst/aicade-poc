import { z } from "zod";

import { CAMPAIGN_COHORTS, pendingManualQaSchema } from "./contracts.mjs";

export const CAMPAIGN_LOOP_MANIFEST_SCHEMA_VERSION =
  "campaign-loop-manifest/v1";
export const CAMPAIGN_LOOP_RUN_SCHEMA_VERSION = "campaign-loop-run/v1";
export const CAMPAIGN_LOOP_FIX_SCHEMA_VERSION = "campaign-loop-fix/v1";
export const CAMPAIGN_LOOP_HISTORY_SCHEMA_VERSION =
  "campaign-loop-history/v1";

export const CAMPAIGN_LOOP_STATUSES = [
  "pending",
  "running",
  "waiting_for_manual_qa",
  "waiting_for_fix",
  "interrupted",
  "blocked",
  "exhausted",
  "invalid",
  "achieved",
];

export const CAMPAIGN_LOOP_RETRYABLE_CLASSIFICATIONS = [
  "provider_failure",
  "provider_output_rejected",
  "pipeline_failure",
  "runtime_pipeline_failure",
  "semantic_runtime_failure",
  "infrastructure_failure",
];

const stableIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const gitCommitSchema = z.string().regex(/^[a-f0-9]{40}$/);
const providerModeSchema = z.enum(["actual", "fixture"]);
export const loopProviderModesSchema = z
  .object({
    planning: providerModeSchema,
    contract: providerModeSchema,
    source: providerModeSchema,
  })
  .strict();
const stageCountsSchema = z
  .object({
    planning: z.number().int().nonnegative(),
    contract: z.number().int().nonnegative(),
    source: z.number().int().nonnegative(),
  })
  .strict();
const revisionSchema = z
  .object({
    head: gitCommitSchema,
    revisionKey: sha256Schema,
  })
  .strict();

const loopStepSchema = z
  .object({
    id: stableIdSchema,
    cohort: z.enum(CAMPAIGN_COHORTS),
    providerModes: loopProviderModesSchema,
    maxCampaignRunsPerRevision: z.number().int().positive(),
    retryableClassifications: z
      .array(z.enum(CAMPAIGN_LOOP_RETRYABLE_CLASSIFICATIONS)),
  })
  .strict();

const isolationProfileSchema = z
  .object({
    id: stableIdSchema,
    providerModes: loopProviderModesSchema,
    maxCampaignRuns: z.number().int().positive(),
  })
  .strict()
  .superRefine((profile, context) => {
    if (Object.values(profile.providerModes).every((mode) => mode === "actual")) {
      context.addIssue({
        code: "custom",
        path: ["providerModes"],
        message: "Auxiliary isolation profiles require at least one fixture stage.",
      });
    }
  });

export const campaignLoopManifestSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_LOOP_MANIFEST_SCHEMA_VERSION),
    id: stableIdSchema,
    manifest: z
      .object({
        path: z.string().trim().min(1),
        sha256: sha256Schema,
        probeSha256: sha256Schema,
      })
      .strict(),
    model: z.string().trim().min(1),
    sequence: z.array(loopStepSchema).min(1),
    isolationProfiles: z.array(isolationProfileSchema),
    limits: z
      .object({
        maxFixCycles: z.number().int().nonnegative(),
        maxCampaignRuns: z.number().int().positive(),
        maxSubmissions: z.number().int().positive(),
        maxAuxiliaryIsolationCampaigns: z.number().int().nonnegative(),
        actualProviderCalls: stageCountsSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((definition, context) => {
    addUniqueIssues(definition.sequence, "sequence", context);
    addUniqueIssues(definition.isolationProfiles, "isolationProfiles", context);
    const cohorts = definition.sequence.map(({ cohort }) => cohort);
    if (new Set(cohorts).size !== cohorts.length) {
      context.addIssue({
        code: "custom",
        path: ["sequence"],
        message: "A campaign loop can include each cohort at most once.",
      });
    }
    if (
      definition.limits.maxAuxiliaryIsolationCampaigns >
      definition.limits.maxCampaignRuns
    ) {
      context.addIssue({
        code: "custom",
        path: ["limits", "maxAuxiliaryIsolationCampaigns"],
        message: "Auxiliary isolation campaigns cannot exceed the global campaign ceiling.",
      });
    }
  });

const loopStepStateSchema = z
  .object({
    id: stableIdSchema,
    cohort: z.enum(CAMPAIGN_COHORTS),
    status: z.enum(["pending", "running", "achieved"]),
    campaignRunIds: z.array(z.string().min(1)),
    sameRevisionRuns: z.number().int().nonnegative(),
    revisionKey: sha256Schema.optional(),
  })
  .strict();

const campaignLinkSchema = z
  .object({
    campaignRunId: z.string().min(1),
    role: z.enum(["sequence", "isolation"]),
    stepId: stableIdSchema.optional(),
    profileId: stableIdSchema.optional(),
    cycle: z.number().int().nonnegative(),
    revisionKey: sha256Schema,
    status: z.string().min(1),
  })
  .strict()
  .superRefine((link, context) => {
    if (link.role === "sequence" && !link.stepId) {
      context.addIssue({ code: "custom", path: ["stepId"], message: "Sequence links require a step ID." });
    }
    if (link.role === "isolation" && !link.profileId) {
      context.addIssue({ code: "custom", path: ["profileId"], message: "Isolation links require a profile ID." });
    }
  });

const activeCampaignSchema = z
  .object({
    campaignRunId: z.string().min(1),
    role: z.enum(["sequence", "isolation"]),
    stepId: stableIdSchema.optional(),
    profileId: stableIdSchema.optional(),
  })
  .strict();

export const campaignLoopRunSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_LOOP_RUN_SCHEMA_VERSION),
    id: z.string().min(1),
    definitionPath: z.string().min(1),
    definitionHash: sha256Schema,
    authorizationHash: sha256Schema,
    manifestId: z.string().min(1),
    manifestPath: z.string().min(1),
    manifestHash: sha256Schema,
    model: z.string().min(1),
    status: z.enum(CAMPAIGN_LOOP_STATUSES),
    createdAt: z.string().datetime(),
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    baseRevision: revisionSchema,
    currentRevision: revisionSchema.extend({ cycle: z.number().int().nonnegative() }).strict(),
    currentStepIndex: z.number().int().nonnegative(),
    usage: z
      .object({
        fixCycles: z.number().int().nonnegative(),
        campaignRuns: z.number().int().nonnegative(),
        submissions: z.number().int().nonnegative(),
        auxiliaryIsolationCampaigns: z.number().int().nonnegative(),
        actualProviderCalls: stageCountsSchema,
      })
      .strict(),
    limits: campaignLoopManifestSchema.shape.limits,
    worktree: z
      .object({
        controlRoot: z.string().min(1),
        path: z.string().min(1),
        branch: z.string().regex(/^codex\/campaign-loop-[a-z0-9-]+$/),
      })
      .strict(),
    steps: z.array(loopStepStateSchema).min(1),
    campaignLinks: z.array(campaignLinkSchema),
    fixCheckpointIds: z.array(z.string().min(1)),
    activeCampaign: activeCampaignSchema.optional(),
    pendingManualQa: pendingManualQaSchema.optional(),
    invalidReason: z.string().min(1).optional(),
    blockedReason: z.string().min(1).optional(),
    exhaustionReason: z.string().min(1).optional(),
    result: z
      .object({
        sequenceAchieved: z.boolean(),
        mechanicProven: z.boolean(),
        achievedStepIds: z.array(stableIdSchema),
        finalRevisionKey: sha256Schema,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((run, context) => {
    if (run.status === "waiting_for_manual_qa") {
      if (!run.pendingManualQa) {
        context.addIssue({
          code: "custom",
          path: ["pendingManualQa"],
          message: "A loop waiting for manual QA requires a pending manual QA reference.",
        });
      }
      if (!run.activeCampaign || run.activeCampaign.role !== "sequence") {
        context.addIssue({
          code: "custom",
          path: ["activeCampaign"],
          message: "A loop waiting for manual QA must preserve its active sequence campaign.",
        });
      }
    } else if (run.pendingManualQa) {
      context.addIssue({
        code: "custom",
        path: ["pendingManualQa"],
        message: "Pending manual QA is allowed only while the loop is waiting for manual QA.",
      });
    }
  });

export const campaignLoopFixSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_LOOP_FIX_SCHEMA_VERSION),
    id: stableIdSchema,
    loopId: z.string().min(1),
    triggerCampaignRunId: z.string().min(1),
    triggerClassification: z.string().min(1),
    diagnosis: z.string().trim().min(1),
    kind: z.enum(["durable", "temporary"]),
    temporaryFixIds: z.array(z.string().regex(/^TF-\d+$/)),
    changedFiles: z.array(z.string().trim().min(1)).min(1),
    verification: z
      .array(
        z
          .object({
            command: z.string().trim().min(1),
            status: z.literal("passed"),
            summary: z.string().trim().min(1),
          })
          .strict()
      )
      .min(1),
    beforeRevision: revisionSchema,
    afterRevision: revisionSchema,
    commit: gitCommitSchema,
    createdAt: z.string().datetime(),
  })
  .strict()
  .superRefine((fix, context) => {
    if (fix.kind === "temporary" && fix.temporaryFixIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["temporaryFixIds"],
        message: "Temporary fixes require at least one temporary-fix ledger ID.",
      });
    }
    if (fix.kind === "durable" && fix.temporaryFixIds.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["temporaryFixIds"],
        message: "Durable fixes cannot claim temporary-fix ledger IDs.",
      });
    }
    for (const [index, file] of fix.changedFiles.entries()) {
      if (file.startsWith("/") || file.split(/[\\/]/).includes("..")) {
        context.addIssue({
          code: "custom",
          path: ["changedFiles", index],
          message: "Changed files must be repository-relative paths.",
        });
      }
    }
  });

export function parseCampaignLoopManifest(input) {
  return campaignLoopManifestSchema.parse(input);
}

export function parseCampaignLoopRun(input) {
  return campaignLoopRunSchema.parse(input);
}

export function parseCampaignLoopFix(input) {
  return campaignLoopFixSchema.parse(input);
}

function addUniqueIssues(values, path, context) {
  const ids = values.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      path: [path],
      message: `${path} IDs must be unique.`,
    });
  }
}
