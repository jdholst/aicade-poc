import { z } from "zod";

import {
  CAMPAIGN_COHORTS,
  campaignKnowledgePolicySchema,
  pendingManualQaSchema,
} from "./contracts.mjs";

export const CAMPAIGN_LOOP_MANIFEST_SCHEMA_VERSION =
  "campaign-loop-manifest/v1";
export const CAMPAIGN_LOOP_RUN_SCHEMA_VERSION = "campaign-loop-run/v4";
const CAMPAIGN_LOOP_RUN_SCHEMA_VERSION_V1 = "campaign-loop-run/v1";
const CAMPAIGN_LOOP_RUN_SCHEMA_VERSION_V2 = "campaign-loop-run/v2";
const CAMPAIGN_LOOP_RUN_SCHEMA_VERSION_V3 = "campaign-loop-run/v3";
export const CAMPAIGN_LOOP_FIX_SCHEMA_VERSION = "campaign-loop-fix/v1";
export const CAMPAIGN_LOOP_BUDGET_EXTENSION_SCHEMA_VERSION =
  "campaign-loop-budget-extension/v1";
export const CAMPAIGN_LOOP_HISTORY_SCHEMA_VERSION =
  "campaign-loop-history/v2";

export const CAMPAIGN_LOOP_STATUSES = [
  "pending",
  "running",
  "waiting_for_manual_qa",
  "waiting_for_campaign_repair",
  "waiting_for_fix",
  "interrupted",
  "blocked",
  "exhausted",
  "invalid",
  "achieved",
  "concluded",
  "discarded",
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

const loopLimitsSchema = z
  .object({
    maxFixCycles: z.number().int().nonnegative(),
    maxCampaignRuns: z.number().int().positive(),
    maxSubmissions: z.number().int().positive(),
    maxAuxiliaryIsolationCampaigns: z.number().int().nonnegative(),
    actualProviderCalls: stageCountsSchema,
  })
  .strict();

export const loopBudgetAdditionsSchema = z
  .object({
    maxFixCycles: z.number().int().nonnegative(),
    maxCampaignRuns: z.number().int().nonnegative(),
    maxSubmissions: z.number().int().nonnegative(),
    maxAuxiliaryIsolationCampaigns: z.number().int().nonnegative(),
    actualProviderCalls: stageCountsSchema,
  })
  .strict()
  .superRefine((additions, context) => {
    const total =
      additions.maxFixCycles +
      additions.maxCampaignRuns +
      additions.maxSubmissions +
      additions.maxAuxiliaryIsolationCampaigns +
      Object.values(additions.actualProviderCalls).reduce(
        (sum, count) => sum + count,
        0
      );
    if (total === 0) {
      context.addIssue({
        code: "custom",
        message: "A budget extension requires at least one positive addition.",
      });
    }
  });

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
    limits: loopLimitsSchema,
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
    budgetCheckpoint: z
      .object({
        campaignRuns: z.number().int().nonnegative(),
        submissions: z.number().int().nonnegative(),
        auxiliaryIsolationCampaigns: z.number().int().nonnegative(),
        actualProviderCalls: stageCountsSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

const campaignRepairSchema = z
  .object({
    id: stableIdSchema,
    campaignRunId: z.string().min(1),
    reason: z.string().trim().min(1),
    detectedAt: z.string().datetime(),
    resumeStatus: z.enum(["running", "waiting_for_manual_qa"]),
    status: z.enum(["pending", "completed"]),
    completedAt: z.string().datetime().optional(),
    creditedUsage: z
      .object({
        campaignRuns: z.number().int().nonnegative(),
        submissions: z.number().int().nonnegative(),
        auxiliaryIsolationCampaigns: z.number().int().nonnegative(),
        actualProviderCalls: stageCountsSchema,
      })
      .strict(),
    priorTerminal: z
      .object({
        status: z.enum(["blocked", "exhausted", "invalid"]),
        reason: z.string().trim().min(1),
        blockedReason: z.string().trim().min(1).optional(),
        exhaustionReason: z.string().trim().min(1).optional(),
        invalidReason: z.string().trim().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((repair, context) => {
    if (repair.status === "pending" && repair.completedAt) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "A pending campaign repair cannot be completed.",
      });
    }
    if (repair.status === "completed" && !repair.completedAt) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "A completed campaign repair requires its completion time.",
      });
    }
  });

const usageSchema = z
  .object({
    fixCycles: z.number().int().nonnegative(),
    campaignRuns: z.number().int().nonnegative(),
    submissions: z.number().int().nonnegative(),
    auxiliaryIsolationCampaigns: z.number().int().nonnegative(),
    actualProviderCalls: stageCountsSchema,
    grossActualProviderCalls: stageCountsSchema.optional(),
  })
  .strict();

const exhaustionResumeSchema = z
  .object({
    status: z.enum(["running", "waiting_for_fix"]),
    activeCampaign: activeCampaignSchema.optional(),
  })
  .strict()
  .superRefine((resume, context) => {
    if (resume.status === "waiting_for_fix" && resume.activeCampaign) {
      context.addIssue({
        code: "custom",
        path: ["activeCampaign"],
        message: "A fix checkpoint cannot retain an active campaign.",
      });
    }
  });

const budgetExtensionSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_LOOP_BUDGET_EXTENSION_SCHEMA_VERSION),
    authorizationHash: sha256Schema,
    createdAt: z.string().datetime(),
    previousStatus: z.literal("exhausted"),
    previousLimits: loopLimitsSchema,
    usageAtAuthorization: usageSchema,
    additions: loopBudgetAdditionsSchema,
    resultingLimits: loopLimitsSchema,
    resumeStatus: z.enum(["running", "waiting_for_fix"]),
  })
  .strict();

const terminalStatusSchema = z.enum([
  "achieved",
  "blocked",
  "exhausted",
  "invalid",
]);
const discardableStatusSchema = z.enum(
  CAMPAIGN_LOOP_STATUSES.filter(
    (status) => !["running", "concluded", "discarded"].includes(status)
  )
);
const lifecycleSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("conclude"),
      previousStatus: terminalStatusSchema,
      at: z.string().datetime(),
      worktreeRemoved: z.literal(true),
      branchRemoved: z.literal(true),
      targetBranch: z.string().min(1),
      headBefore: gitCommitSchema,
      headAfter: gitCommitSchema,
      mergedFixes: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("discard"),
      previousStatus: discardableStatusSchema,
      at: z.string().datetime(),
      worktreeRemoved: z.literal(true),
      branchRemoved: z.literal(true),
      forced: z.boolean(),
    })
    .strict(),
]);

const campaignLoopRunBaseSchema = z
  .object({
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
    usage: usageSchema,
    limits: loopLimitsSchema,
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
  .strict();

const campaignLoopRunV1Schema = campaignLoopRunBaseSchema
  .extend({
    schemaVersion: z.literal(CAMPAIGN_LOOP_RUN_SCHEMA_VERSION_V1),
  })
  .strict()
  .superRefine(validateManualQaState);

const campaignLoopRunV2Schema = campaignLoopRunBaseSchema
  .extend({
    schemaVersion: z.literal(CAMPAIGN_LOOP_RUN_SCHEMA_VERSION_V2),
    budgetExtensions: z.array(budgetExtensionSchema),
    exhaustionResume: exhaustionResumeSchema.optional(),
    lifecycle: lifecycleSchema.optional(),
  })
  .strict()
  .superRefine(validateCurrentLoopState);

const campaignLoopRunV3Schema = campaignLoopRunBaseSchema
  .extend({
    schemaVersion: z.literal(CAMPAIGN_LOOP_RUN_SCHEMA_VERSION_V3),
    budgetExtensions: z.array(budgetExtensionSchema),
    exhaustionResume: exhaustionResumeSchema.optional(),
    lifecycle: lifecycleSchema.optional(),
    knowledgePolicy: campaignKnowledgePolicySchema,
    knowledgeReconciliationIds: z.array(z.string().regex(/^KR-/)),
  })
  .strict()
  .superRefine(validateCurrentLoopState);

export const campaignLoopRunSchema = campaignLoopRunBaseSchema
  .extend({
    schemaVersion: z.literal(CAMPAIGN_LOOP_RUN_SCHEMA_VERSION),
    budgetExtensions: z.array(budgetExtensionSchema),
    exhaustionResume: exhaustionResumeSchema.optional(),
    lifecycle: lifecycleSchema.optional(),
    knowledgePolicy: campaignKnowledgePolicySchema,
    knowledgeReconciliationIds: z.array(z.string().regex(/^KR-/)),
    campaignRepairs: z.array(campaignRepairSchema),
  })
  .strict()
  .superRefine(validateCurrentLoopState);

function validateCurrentLoopState(run, context) {
    validateManualQaState(run, context);
    if (
      run.schemaVersion === CAMPAIGN_LOOP_RUN_SCHEMA_VERSION &&
      !run.usage.grossActualProviderCalls
    ) {
      context.addIssue({
        code: "custom",
        path: ["usage", "grossActualProviderCalls"],
        message: "A v4 loop run requires gross actual-provider usage.",
      });
    }
    if (run.status === "exhausted" && !run.exhaustionResume) {
      context.addIssue({
        code: "custom",
        path: ["exhaustionResume"],
        message: "An exhausted loop requires an extension resume checkpoint.",
      });
    }
    if (run.status !== "exhausted" && run.exhaustionResume) {
      context.addIssue({
        code: "custom",
        path: ["exhaustionResume"],
        message: "An extension resume checkpoint is allowed only while exhausted.",
      });
    }
    if (run.status === "concluded" && run.lifecycle?.action !== "conclude") {
      context.addIssue({
        code: "custom",
        path: ["lifecycle"],
        message: "A concluded loop requires conclude lifecycle evidence.",
      });
    } else if (
      run.status === "discarded" &&
      run.lifecycle?.action !== "discard"
    ) {
      context.addIssue({
        code: "custom",
        path: ["lifecycle"],
        message: "A discarded loop requires discard lifecycle evidence.",
      });
    } else if (
      !["concluded", "discarded"].includes(run.status) &&
      run.lifecycle
    ) {
      context.addIssue({
        code: "custom",
        path: ["lifecycle"],
        message: "Lifecycle evidence is allowed only after conclusion or discard.",
      });
    }
}

function validateManualQaState(run, context) {
  const pendingRepair = run.campaignRepairs?.filter(
    ({ status }) => status === "pending"
  ) ?? [];
  if (run.status === "waiting_for_campaign_repair") {
    if (pendingRepair.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["campaignRepairs"],
        message: "A loop waiting for campaign repair requires exactly one pending repair.",
      });
    }
    if (!run.activeCampaign) {
      context.addIssue({
        code: "custom",
        path: ["activeCampaign"],
        message: "A loop waiting for campaign repair must preserve its active campaign.",
      });
    }
  } else if (pendingRepair.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["campaignRepairs"],
      message: "A pending campaign repair is allowed only while waiting for campaign repair.",
    });
  }
  const repairResumesManualQa =
    run.status === "waiting_for_campaign_repair" &&
    pendingRepair[0]?.resumeStatus === "waiting_for_manual_qa";
  if (run.status === "waiting_for_manual_qa" || repairResumesManualQa) {
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
}

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
  if (input?.schemaVersion === CAMPAIGN_LOOP_RUN_SCHEMA_VERSION_V1) {
    const run = campaignLoopRunV1Schema.parse(input);
    return migrateLegacyLoopRun({
      ...run,
      schemaVersion: CAMPAIGN_LOOP_RUN_SCHEMA_VERSION_V2,
      budgetExtensions: [],
      ...(run.status === "exhausted"
        ? { exhaustionResume: inferLegacyExhaustionResume(run) }
        : {}),
    });
  }
  if (input?.schemaVersion === CAMPAIGN_LOOP_RUN_SCHEMA_VERSION_V2) {
    return migrateLegacyLoopRun(campaignLoopRunV2Schema.parse(input));
  }
  if (input?.schemaVersion === CAMPAIGN_LOOP_RUN_SCHEMA_VERSION_V3) {
    const run = campaignLoopRunV3Schema.parse(input);
    return campaignLoopRunSchema.parse({
      ...run,
      schemaVersion: CAMPAIGN_LOOP_RUN_SCHEMA_VERSION,
      usage: withGrossProviderUsage(run.usage),
      campaignRepairs: [],
    });
  }
  return campaignLoopRunSchema.parse(input);
}

function migrateLegacyLoopRun(run) {
  return campaignLoopRunSchema.parse({
    ...run,
    schemaVersion: CAMPAIGN_LOOP_RUN_SCHEMA_VERSION,
    usage: withGrossProviderUsage(run.usage),
    knowledgePolicy: { required: false },
    knowledgeReconciliationIds: [],
    campaignRepairs: [],
  });
}

function withGrossProviderUsage(usage) {
  return {
    ...usage,
    grossActualProviderCalls:
      usage.grossActualProviderCalls ?? { ...usage.actualProviderCalls },
  };
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

function inferLegacyExhaustionResume(run) {
  if (
    /fix[- ]cycle|no fix cycles|manual gameplay qa failed/i.test(
      run.exhaustionReason ?? ""
    )
  ) {
    return { status: "waiting_for_fix" };
  }
  const link = [...run.campaignLinks]
    .reverse()
    .find(({ status }) =>
      ["running", "provider_call_budget_exhausted"].includes(status)
    );
  const activeCampaign =
    run.activeCampaign ??
    (link
      ? {
          campaignRunId: link.campaignRunId,
          role: link.role,
          ...(link.stepId ? { stepId: link.stepId } : {}),
          ...(link.profileId ? { profileId: link.profileId } : {}),
        }
      : undefined);
  return {
    status: "running",
    ...(activeCampaign ? { activeCampaign } : {}),
  };
}
