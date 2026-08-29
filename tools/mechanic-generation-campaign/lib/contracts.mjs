import { z } from "zod";

export const CAMPAIGN_MANIFEST_SCHEMA_VERSION = "campaign-manifest/v1";
export const CAMPAIGN_RUN_SCHEMA_VERSION = "campaign-run/v2";
const CAMPAIGN_RUN_SCHEMA_VERSION_V1 = "campaign-run/v1";
export const CAMPAIGN_ATTEMPT_SCHEMA_VERSION = "campaign-attempt/v1";
export const CAMPAIGN_MANUAL_QA_SCHEMA_VERSION = "campaign-manual-qa/v1";

export const CAMPAIGN_COHORTS = [
  "discovery",
  "isolation",
  "repeatability",
  "variation",
];

export const PIPELINE_STAGES = [
  "submission",
  "planning",
  "intent_validation",
  "routing",
  "runtime_foundation",
  "contract_generation",
  "contract_validation",
  "source_generation",
  "source_validation",
  "deterministic_evaluation",
  "deterministic_replay",
  "assembly",
  "handoff",
  "runtime_activation",
  "first_playable",
  "persistence",
  "editor_mount",
  "runtime_health",
  "cleanup",
  "external_mechanic_probe",
  "unknown",
];

const providerModeSchema = z.enum(["actual", "fixture"]);
const providerModesSchema = z
  .object({
    planning: providerModeSchema,
    contract: providerModeSchema,
    source: providerModeSchema,
  })
  .strict();

const promptSchema = z
  .object({
    id: z.enum([
      "baseline",
      "plain_paraphrase",
      "constraints_first",
      "outcomes_first",
      "compact",
    ]),
    text: z.string().trim().min(1),
    requirementIds: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

const fixtureReferenceSchema = z
  .object({
    path: z.string().trim().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const campaignKnowledgePolicySchema = z
  .object({
    required: z.boolean(),
    baselineManifestDigest: sha256Schema.optional(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.required && !policy.baselineManifestDigest) {
      context.addIssue({
        code: "custom",
        path: ["baselineManifestDigest"],
        message: "Required knowledge policy needs a baselineManifestDigest.",
      });
    }
    if (!policy.required && policy.baselineManifestDigest) {
      context.addIssue({
        code: "custom",
        path: ["baselineManifestDigest"],
        message: "A grandfathered knowledge policy cannot set a baselineManifestDigest.",
      });
    }
  });
const manualQaStatusSchema = z.enum(["pending", "approved", "denied"]);

export const manualQaReferenceSchema = z
  .object({
    id: z.string().min(1),
    path: z.string().trim().min(1),
    status: manualQaStatusSchema,
  })
  .strict();

export const pendingManualQaSchema = z
  .object({
    manualQaId: z.string().min(1),
    campaignRunId: z.string().min(1),
    attemptId: z.string().min(1),
    promptId: z.string().min(1),
    cohort: z.enum(CAMPAIGN_COHORTS),
    revisionKey: z.string().min(1),
    requestedAt: z.string().datetime(),
    evidencePath: z.string().trim().min(1),
  })
  .strict();

const candidateArtifactSchema = z
  .object({
    kind: z.enum(["generation_run", "game_pack"]),
    path: z.string().trim().min(1),
    sha256: sha256Schema,
  })
  .strict();

const reviewSessionSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum([
      "starting",
      "ready",
      "interrupted",
      "runtime_failure",
      "campaign_repair_required",
      "completed",
    ]),
    startedAt: z.string().datetime(),
    readyAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    runtimeReady: z.boolean(),
    providerCallsBlocked: z.number().int().nonnegative(),
    artifacts: z.array(z.string().trim().min(1)),
    failure: z.string().trim().min(1).optional(),
  })
  .strict();

export const campaignManualQaSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_MANUAL_QA_SCHEMA_VERSION),
    id: z.string().min(1),
    campaignRunId: z.string().min(1),
    attemptId: z.string().min(1),
    promptId: z.string().min(1),
    cohort: z.enum(CAMPAIGN_COHORTS),
    revisionKey: z.string().min(1),
    status: manualQaStatusSchema,
    requestedAt: z.string().datetime(),
    decidedAt: z.string().datetime().optional(),
    candidateArtifacts: z.array(candidateArtifactSchema).length(2),
    reviewSessions: z.array(reviewSessionSchema),
    approvalNote: z.string().trim().min(1).optional(),
    denialReason: z.string().trim().min(1).optional(),
    provenance: z.enum(["campaign_review", "legacy_assumed"]).default("campaign_review"),
  })
  .strict()
  .superRefine((record, context) => {
    const kinds = record.candidateArtifacts.map(({ kind }) => kind);
    for (const requiredKind of ["generation_run", "game_pack"]) {
      if (kinds.filter((kind) => kind === requiredKind).length !== 1) {
        context.addIssue({
          code: "custom",
          path: ["candidateArtifacts"],
          message: `Manual QA requires exactly one ${requiredKind} artifact.`,
        });
      }
    }
    if (record.status === "pending" && record.decidedAt) {
      context.addIssue({
        code: "custom",
        path: ["decidedAt"],
        message: "Pending manual QA cannot have a decision timestamp.",
      });
    }
    if (record.status !== "pending" && !record.decidedAt) {
      context.addIssue({
        code: "custom",
        path: ["decidedAt"],
        message: "A manual QA decision requires a decision timestamp.",
      });
    }
    if (record.status === "denied" && !record.denialReason) {
      context.addIssue({
        code: "custom",
        path: ["denialReason"],
        message: "A manual QA denial requires a denial reason.",
      });
    }
    if (record.status !== "denied" && record.denialReason) {
      context.addIssue({
        code: "custom",
        path: ["denialReason"],
        message: "Only denied manual QA may include a denial reason.",
      });
    }
    if (record.status !== "approved" && record.approvalNote) {
      context.addIssue({
        code: "custom",
        path: ["approvalNote"],
        message: "Only approved manual QA may include an approval note.",
      });
    }
  });

export const campaignManifestSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_MANIFEST_SCHEMA_VERSION),
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    mechanic: z
      .object({
        id: z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
        name: z.string().trim().min(1),
        ticket: z.string().trim().min(1),
        ticketUrl: z.string().url(),
        requirementIds: z.array(z.string().trim().min(1)).min(1),
      })
      .strict(),
    model: z.string().trim().min(1),
    credential: z
      .object({
        source: z.enum(["server_env", "keyword_env", "api_key_env"]),
        envName: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
      })
      .strict(),
    prompts: z.array(promptSchema).length(5),
    providerModes: providerModesSchema,
    fixtures: z
      .object({
        planning: fixtureReferenceSchema.optional(),
        contract: fixtureReferenceSchema.optional(),
        source: fixtureReferenceSchema.optional(),
      })
      .strict(),
    probe: z.string().trim().min(1),
    cohorts: z
      .object({
        discovery: z
          .object({
            maxAttempts: z.number().int().positive(),
            minimumSuccesses: z.number().int().positive(),
          })
          .strict(),
        isolation: z
          .object({
            maxAttempts: z.number().int().positive(),
            minimumSuccesses: z.number().int().positive(),
          })
          .strict(),
        repeatability: z
          .object({
            maxAttempts: z.literal(10),
            minimumSuccesses: z.literal(8),
            failureLimit: z.literal(3),
          })
          .strict(),
        variation: z
          .object({
            runsPerPrompt: z.literal(2),
            minimumSuccesses: z.literal(8),
            requireEveryPromptSuccess: z.literal(true),
            failureLimit: z.literal(3),
            maxReplacementAttempts: z.literal(1),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const expectedPromptIds = [
      "baseline",
      "plain_paraphrase",
      "constraints_first",
      "outcomes_first",
      "compact",
    ];
    const actualPromptIds = manifest.prompts.map((prompt) => prompt.id);
    if (new Set(actualPromptIds).size !== expectedPromptIds.length) {
      context.addIssue({
        code: "custom",
        path: ["prompts"],
        message: "Prompt IDs must be unique.",
      });
    }
    for (const promptId of expectedPromptIds) {
      if (!actualPromptIds.includes(promptId)) {
        context.addIssue({
          code: "custom",
          path: ["prompts"],
          message: `Missing frozen prompt "${promptId}".`,
        });
      }
    }

    for (const [promptIndex, prompt] of manifest.prompts.entries()) {
      for (const requirementId of manifest.mechanic.requirementIds) {
        if (!prompt.requirementIds.includes(requirementId)) {
          context.addIssue({
            code: "custom",
            path: ["prompts", promptIndex, "requirementIds"],
            message: `Prompt "${prompt.id}" is missing requirement "${requirementId}".`,
          });
        }
      }
    }

    for (const stage of ["planning", "contract", "source"]) {
      if (manifest.providerModes[stage] === "fixture" && !manifest.fixtures[stage]) {
        context.addIssue({
          code: "custom",
          path: ["fixtures", stage],
          message: `Fixture mode for ${stage} requires a fixture reference.`,
        });
      }
    }

    if (
      manifest.credential.source !== "server_env" &&
      !manifest.credential.envName
    ) {
      context.addIssue({
        code: "custom",
        path: ["credential", "envName"],
        message: "Client credential sources require an environment variable name.",
      });
    }
  });

export const campaignAttemptSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_ATTEMPT_SCHEMA_VERSION),
    id: z.string().min(1),
    campaignRunId: z.string().min(1),
    sequence: z.number().int().positive(),
    cohort: z.enum(CAMPAIGN_COHORTS),
    promptId: z.string().min(1),
    prompt: z.string(),
    submissionKind: z.enum(["scheduled", "replacement"]).optional(),
    replacementForPromptId: z.string().min(1).optional(),
    status: z.enum([
      "success",
      "awaiting_manual_qa",
      "pipeline_failure",
      "mechanic_incorrect",
      "infrastructure_failure",
      "cancelled",
    ]),
    terminalOutcome: z.string().min(1),
    furthestStage: z.enum(PIPELINE_STAGES),
    classification: z.string().min(1),
    failure: z.string().optional(),
    providerModes: providerModesSchema,
    providerCalls: z
      .object({
        planning: z.number().int().nonnegative(),
        contract: z.number().int().nonnegative(),
        source: z.number().int().nonnegative(),
      })
      .strict(),
    fixtureCalls: z
      .object({
        planning: z.number().int().nonnegative(),
        contract: z.number().int().nonnegative(),
        source: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    revisionKey: z.string().min(1),
    pipelinePassed: z.boolean(),
    externalProbePassed: z.boolean(),
    automatedOutcome: z
      .object({
        status: z.enum(["passed", "failed"]),
        terminalOutcome: z.string().min(1),
        recordedAt: z.string().datetime(),
      })
      .strict(),
    recordedOutcome: z.string().min(1),
    adjudicatedOutcome: z.string().min(1).optional(),
    manualQa: manualQaReferenceSchema.optional(),
    artifacts: z.array(z.string()),
    temporaryFixIds: z.array(z.string().regex(/^TF-\d+$/)),
    cost: z
      .object({
        quality: z.enum(["estimated", "reported", "unknown"]),
        usd: z.number().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((attempt, context) => {
    const isFullActual = Object.values(attempt.providerModes).every(
      (mode) => mode === "actual"
    );
    const isProofCohort = ["discovery", "repeatability", "variation"].includes(
      attempt.cohort
    );
    if (attempt.status === "awaiting_manual_qa") {
      if (attempt.manualQa?.status !== "pending") {
        context.addIssue({
          code: "custom",
          path: ["manualQa"],
          message: "An awaiting_manual_qa attempt requires pending manual QA evidence.",
        });
      }
      if (attempt.automatedOutcome.status !== "passed") {
        context.addIssue({
          code: "custom",
          path: ["automatedOutcome"],
          message: "Only an automated pass may await manual QA.",
        });
      }
    }
    if (
      attempt.status === "success" &&
      isFullActual &&
      isProofCohort &&
      attempt.manualQa?.status !== "approved"
    ) {
      context.addIssue({
        code: "custom",
        path: ["manualQa"],
        message: "A full-actual proof success requires approved manual QA evidence.",
      });
    }
    if (
      attempt.classification === "manual_qa_rejected" &&
      attempt.manualQa?.status !== "denied"
    ) {
      context.addIssue({
        code: "custom",
        path: ["manualQa"],
        message: "A manual QA rejection requires denied evidence.",
      });
    }
    if (
      attempt.submissionKind === "replacement" &&
      attempt.replacementForPromptId !== attempt.promptId
    ) {
      context.addIssue({
        code: "custom",
        path: ["replacementForPromptId"],
        message: "A replacement submission must identify its prompt variant.",
      });
    }
    if (
      attempt.submissionKind !== "replacement" &&
      attempt.replacementForPromptId
    ) {
      context.addIssue({
        code: "custom",
        path: ["replacementForPromptId"],
        message: "Only replacement submissions may identify a replacement prompt.",
      });
    }
  });

const campaignRunBaseSchema = z
  .object({
    id: z.string().min(1),
    manifestId: z.string().min(1),
    manifestPath: z.string().min(1),
    manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    cohort: z.enum(CAMPAIGN_COHORTS),
    status: z.enum([
      "pending",
      "running",
      "waiting_for_manual_qa",
      "interrupted",
      "achieved",
      "completed_not_achieved",
      "invalid",
    ]),
    createdAt: z.string().datetime(),
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    model: z.string().min(1),
    providerModes: providerModesSchema,
    attemptCeiling: z.number().int().positive(),
    attemptIds: z.array(z.string()),
    loopId: z.string().min(1).optional(),
    loopStepId: z.string().min(1).optional(),
    loopCycle: z.number().int().nonnegative().optional(),
    revision: z
      .object({
        head: z.string().min(1),
        revisionKey: z.string().regex(/^[a-f0-9]{64}$/),
        dirty: z.boolean(),
        statusEntries: z.array(z.string()),
      })
      .strict(),
    baseUrl: z.string().url(),
    authorization: z
      .object({
        actualProviders: z.boolean(),
        authorizedAt: z.string().datetime(),
      })
      .strict(),
    pendingManualQa: pendingManualQaSchema.optional(),
    result: z
      .object({
        successes: z.number().int().nonnegative(),
        diagnosticSuccesses: z.number().int().nonnegative(),
        submissions: z.number().int().nonnegative(),
        qualifiesForMechanicProof: z.boolean(),
        missingSuccessfulPromptIds: z.array(z.string()),
        failures: z.number().int().nonnegative().optional(),
        failureLimit: z.number().int().positive().optional(),
        remainingFailureTolerance: z.number().int().nonnegative().optional(),
        baseSubmissions: z.number().int().nonnegative().optional(),
        replacementSubmissions: z.number().int().nonnegative().optional(),
        terminalReason: z.string().min(1).optional(),
        replacementPromptId: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    invalidReason: z.string().optional(),
  })
  .strict();

const campaignRunV1Schema = campaignRunBaseSchema
  .extend({ schemaVersion: z.literal(CAMPAIGN_RUN_SCHEMA_VERSION_V1) })
  .strict()
  .superRefine(validateCampaignRunState);

export const campaignRunSchema = campaignRunBaseSchema
  .extend({
    schemaVersion: z.literal(CAMPAIGN_RUN_SCHEMA_VERSION),
    knowledgePolicy: campaignKnowledgePolicySchema,
  })
  .strict()
  .superRefine(validateCampaignRunState);

function validateCampaignRunState(run, context) {
    if (run.status === "waiting_for_manual_qa" && !run.pendingManualQa) {
      context.addIssue({
        code: "custom",
        path: ["pendingManualQa"],
        message: "A campaign waiting for manual QA requires a pending manual QA reference.",
      });
    }
    if (run.status !== "waiting_for_manual_qa" && run.pendingManualQa) {
      context.addIssue({
        code: "custom",
        path: ["pendingManualQa"],
        message: "Pending manual QA is allowed only while the campaign is waiting for manual QA.",
      });
    }
}

export function parseCampaignManifest(input) {
  return campaignManifestSchema.parse(input);
}

export function parseCampaignAttempt(input) {
  return campaignAttemptSchema.parse(input);
}

export function parseCampaignRun(input) {
  if (input?.schemaVersion === CAMPAIGN_RUN_SCHEMA_VERSION_V1) {
    const run = campaignRunV1Schema.parse(input);
    return campaignRunSchema.parse({
      ...run,
      schemaVersion: CAMPAIGN_RUN_SCHEMA_VERSION,
      knowledgePolicy: { required: false },
    });
  }
  return campaignRunSchema.parse(input);
}

export function parseCampaignManualQa(input) {
  return campaignManualQaSchema.parse(input);
}

export function isFullActualSuccess(attempt) {
  return (
    attempt.status === "success" &&
    attempt.pipelinePassed === true &&
    attempt.externalProbePassed === true &&
    attempt.manualQa?.status === "approved" &&
    Object.values(attempt.providerModes).every((mode) => mode === "actual")
  );
}

export function isDiagnosticSuccess(attempt) {
  return (
    ["success", "awaiting_manual_qa"].includes(attempt.status) &&
    attempt.pipelinePassed === true &&
    attempt.externalProbePassed === true
  );
}

export function requiresManualQa({
  cohort,
  providerModes,
  pipelinePassed,
  externalProbePassed,
}) {
  return (
    ["discovery", "repeatability", "variation"].includes(cohort) &&
    Object.values(providerModes).every((mode) => mode === "actual") &&
    pipelinePassed === true &&
    externalProbePassed === true
  );
}

const COUNTED_FAILURE_CLASSIFICATIONS = new Set([
  "provider_failure",
  "provider_output_rejected",
  "pipeline_failure",
  "runtime_pipeline_failure",
  "semantic_runtime_failure",
  "manual_qa_rejected",
]);

export function isCountedCohortFailure(attempt) {
  return COUNTED_FAILURE_CLASSIFICATIONS.has(attempt.classification);
}

export function scoreCampaign(cohort, manifestInput, attemptInputs) {
  const manifest = parseCampaignManifest(manifestInput);
  const attempts = attemptInputs.map((attempt) =>
    campaignAttemptSchema.passthrough().parse(attempt)
  );
  const successes = attempts.filter(isFullActualSuccess).length;
  const diagnosticSuccesses = attempts.filter(isDiagnosticSuccess).length;
  const automatedCandidates = attempts.filter(
    (attempt) => attempt.status === "awaiting_manual_qa"
  ).length;
  const submissions = attempts.length;
  const failures = attempts.filter(isCountedCohortFailure).length;
  const baseSubmissions = attempts.filter(
    (attempt) => attempt.submissionKind !== "replacement"
  ).length;
  const replacementSubmissions = attempts.filter(
    (attempt) => attempt.submissionKind === "replacement"
  ).length;
  const cohortPolicy = manifest.cohorts[cohort];
  const failureLimit = cohortPolicy.failureLimit;
  const result = {
    cohort,
    status: "running",
    successes,
    diagnosticSuccesses,
    automatedCandidates,
    submissions,
    failures,
    failureLimit,
    remainingFailureTolerance: failureLimit === undefined
      ? undefined
      : Math.max(0, failureLimit - failures),
    baseSubmissions,
    replacementSubmissions,
    terminalReason: undefined,
    replacementPromptId: undefined,
    qualifiesForMechanicProof: false,
    missingSuccessfulPromptIds: [],
  };

  if (failureLimit !== undefined && failures >= failureLimit) {
    result.status = "completed_not_achieved";
    result.terminalReason = "failure_limit_reached";
    return result;
  }

  if (automatedCandidates > 0) {
    result.status = "waiting_for_manual_qa";
    return result;
  }

  if (cohort === "discovery") {
    result.qualifiesForMechanicProof = successes >= 1;
    result.status = successes >= 1
      ? "achieved"
      : submissions >= manifest.cohorts.discovery.maxAttempts
        ? "completed_not_achieved"
        : "running";
    return result;
  }

  if (cohort === "isolation") {
    result.status =
      diagnosticSuccesses >= manifest.cohorts.isolation.minimumSuccesses
        ? "achieved"
        : submissions >= manifest.cohorts.isolation.maxAttempts
          ? "completed_not_achieved"
          : "running";
    return result;
  }

  if (cohort === "repeatability") {
    result.qualifiesForMechanicProof =
      successes >= manifest.cohorts.repeatability.minimumSuccesses;
    result.status =
      baseSubmissions < manifest.cohorts.repeatability.maxAttempts
        ? "running"
        : result.qualifiesForMechanicProof
          ? "achieved"
          : "completed_not_achieved";
    result.terminalReason = result.status === "achieved"
      ? "criteria_achieved"
      : result.status === "completed_not_achieved"
        ? "submission_ceiling_reached"
        : undefined;
    return result;
  }

  if (cohort === "variation") {
    const successfulPromptIds = new Set(
      attempts.filter(isFullActualSuccess).map((attempt) => attempt.promptId)
    );
    result.missingSuccessfulPromptIds = manifest.prompts
      .map((prompt) => prompt.id)
      .filter((promptId) => !successfulPromptIds.has(promptId));
    result.qualifiesForMechanicProof =
      successes >= manifest.cohorts.variation.minimumSuccesses &&
      result.missingSuccessfulPromptIds.length === 0;
    const expectedBaseSubmissions =
      manifest.prompts.length * manifest.cohorts.variation.runsPerPrompt;
    if (baseSubmissions < expectedBaseSubmissions) {
      return result;
    }
    if (result.qualifiesForMechanicProof) {
      result.status = "achieved";
      result.terminalReason = "criteria_achieved";
      return result;
    }
    if (
      result.missingSuccessfulPromptIds.length === 1 &&
      replacementSubmissions < manifest.cohorts.variation.maxReplacementAttempts
    ) {
      result.replacementPromptId = result.missingSuccessfulPromptIds[0];
      return result;
    }
    result.status = "completed_not_achieved";
    result.terminalReason = "replacement_limit_reached";
    return result;
  }

  throw new Error(`Unsupported campaign cohort "${cohort}".`);
}
