import { z } from "zod";

export const CAMPAIGN_MANIFEST_SCHEMA_VERSION = "campaign-manifest/v1";
export const CAMPAIGN_RUN_SCHEMA_VERSION = "campaign-run/v1";
export const CAMPAIGN_ATTEMPT_SCHEMA_VERSION = "campaign-attempt/v1";

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
          })
          .strict(),
        variation: z
          .object({
            runsPerPrompt: z.literal(2),
            minimumSuccesses: z.literal(8),
            requireEveryPromptSuccess: z.literal(true),
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
    promptId: z.string().min(1),
    prompt: z.string(),
    status: z.enum([
      "success",
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
    recordedOutcome: z.string().min(1),
    adjudicatedOutcome: z.string().min(1).optional(),
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
  .strict();

export const campaignRunSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_RUN_SCHEMA_VERSION),
    id: z.string().min(1),
    manifestId: z.string().min(1),
    manifestPath: z.string().min(1),
    manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    cohort: z.enum(CAMPAIGN_COHORTS),
    status: z.enum([
      "pending",
      "running",
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
    revision: z
      .object({
        head: z.string().min(1),
        revisionKey: z.string().regex(/^[a-f0-9]{64}$/),
        dirty: z.boolean(),
        statusEntries: z.array(z.string()),
      })
      .strict(),
    baseUrl: z.string().url(),
    result: z
      .object({
        successes: z.number().int().nonnegative(),
        diagnosticSuccesses: z.number().int().nonnegative(),
        submissions: z.number().int().nonnegative(),
        qualifiesForMechanicProof: z.boolean(),
        missingSuccessfulPromptIds: z.array(z.string()),
      })
      .strict()
      .optional(),
    invalidReason: z.string().optional(),
  })
  .strict();

export function parseCampaignManifest(input) {
  return campaignManifestSchema.parse(input);
}

export function parseCampaignAttempt(input) {
  return campaignAttemptSchema.parse(input);
}

export function parseCampaignRun(input) {
  return campaignRunSchema.parse(input);
}

export function isFullActualSuccess(attempt) {
  return (
    attempt.status === "success" &&
    attempt.pipelinePassed === true &&
    attempt.externalProbePassed === true &&
    Object.values(attempt.providerModes).every((mode) => mode === "actual")
  );
}

export function isDiagnosticSuccess(attempt) {
  return (
    attempt.status === "success" &&
    attempt.pipelinePassed === true &&
    attempt.externalProbePassed === true
  );
}

export function scoreCampaign(cohort, manifestInput, attemptInputs) {
  const manifest = parseCampaignManifest(manifestInput);
  const attempts = attemptInputs.map((attempt) =>
    campaignAttemptSchema.passthrough().parse(attempt)
  );
  const successes = attempts.filter(isFullActualSuccess).length;
  const diagnosticSuccesses = attempts.filter(isDiagnosticSuccess).length;
  const submissions = attempts.length;
  const result = {
    cohort,
    status: "running",
    successes,
    diagnosticSuccesses,
    submissions,
    qualifiesForMechanicProof: false,
    missingSuccessfulPromptIds: [],
  };

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
      submissions < manifest.cohorts.repeatability.maxAttempts
        ? "running"
        : result.qualifiesForMechanicProof
          ? "achieved"
          : "completed_not_achieved";
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
    const expectedSubmissions =
      manifest.prompts.length * manifest.cohorts.variation.runsPerPrompt;
    result.status =
      submissions < expectedSubmissions
        ? "running"
        : result.qualifiesForMechanicProof
          ? "achieved"
          : "completed_not_achieved";
    return result;
  }

  throw new Error(`Unsupported campaign cohort "${cohort}".`);
}
