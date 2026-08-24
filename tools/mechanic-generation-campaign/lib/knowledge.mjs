import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import { PIPELINE_STAGES } from "./contracts.mjs";

const execFileAsync = promisify(execFile);

export const CAMPAIGN_KNOWLEDGE_SCHEMA_VERSION = "campaign-knowledge/v1";
export const CAMPAIGN_KNOWLEDGE_RECONCILIATION_SCHEMA_VERSION =
  "campaign-knowledge-reconciliation/v1";
export const CAMPAIGN_KNOWLEDGE_PATH = path.join(
  "tools",
  "mechanic-generation-campaign",
  "data",
  "generation-knowledge.json"
);

const FAILURE_CLASSIFICATIONS = [
  "provider_failure",
  "provider_output_rejected",
  "pipeline_failure",
  "runtime_pipeline_failure",
  "semantic_runtime_failure",
  "infrastructure_failure",
  "awaiting_manual_qa",
  "manual_qa_rejected",
  "success",
  "unknown",
];
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const findingIdSchema = z.string().regex(/^KF-\d{4}$/);
const reconciliationIdSchema = z.string().regex(/^KR-[A-Za-z0-9][A-Za-z0-9-]*$/);

const evidenceSchema = z
  .object({
    kind: z.enum([
      "campaign_attempt",
      "manual_qa",
      "loop_fix",
      "loop_outcome",
      "legacy",
    ]),
    id: z.string().trim().min(1),
    campaignRunId: z.string().trim().min(1).optional(),
    attemptId: z.string().trim().min(1).optional(),
    loopId: z.string().trim().min(1).optional(),
    fixId: z.string().trim().min(1).optional(),
    stage: z.enum([...PIPELINE_STAGES, "unknown"]).optional(),
    quality: z.enum([
      "fixture_diagnostic",
      "actual_submission",
      "verified_fix",
      "manual_qa_approved",
    ]),
    outcome: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    observedAt: z.string().datetime(),
  })
  .strict();

const scopeSchema = z
  .object({
    applicability: z.enum(["pipeline_general", "mechanic", "manifest"]),
    mechanicIds: z.array(z.string().trim().min(1)),
    manifestIds: z.array(z.string().trim().min(1)),
    stages: z.array(z.enum(PIPELINE_STAGES)),
    classifications: z.array(z.enum(FAILURE_CLASSIFICATIONS)),
  })
  .strict()
  .superRefine((scope, context) => {
    if (
      scope.applicability === "pipeline_general" &&
      (scope.mechanicIds.length > 0 || scope.manifestIds.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Pipeline-general findings cannot name mechanics or manifests.",
      });
    }
    if (
      scope.applicability === "mechanic" &&
      (scope.mechanicIds.length === 0 || scope.manifestIds.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Mechanic findings require mechanic IDs and cannot name manifests.",
      });
    }
    if (
      scope.applicability === "manifest" &&
      (scope.manifestIds.length === 0 || scope.mechanicIds.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Manifest findings require manifest IDs and cannot name mechanics.",
      });
    }
  });

const mutableFindingFieldsSchema = z
  .object({
    status: z.enum(["active", "retired"]),
    confidence: z.enum(["hypothesis", "supported", "confirmed"]),
    title: z.string().trim().min(1),
    guidance: z.string().trim().min(1),
    scope: scopeSchema,
  })
  .strict();

const amendmentSchema = z
  .object({
    revision: z.number().int().positive(),
    changedAt: z.string().datetime(),
    reason: z.string().trim().min(1),
    previous: mutableFindingFieldsSchema,
    evidenceAdded: z.array(evidenceSchema).min(1),
  })
  .strict();

const findingSchema = mutableFindingFieldsSchema
  .extend({
    id: findingIdSchema,
    revision: z.number().int().positive(),
    evidence: z.array(evidenceSchema).min(1),
    amendments: z.array(amendmentSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const sourceSchema = z
  .object({
    kind: z.enum(["backfill", "fix_cycle", "campaign_outcome", "loop_outcome"]),
    loopId: z.string().trim().min(1).optional(),
    fixId: z.string().trim().min(1).optional(),
    triggerCampaignRunId: z.string().trim().min(1).optional(),
    campaignRunId: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((source, context) => {
    if (
      source.kind === "fix_cycle" &&
      (!source.loopId || !source.fixId || !source.triggerCampaignRunId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Fix-cycle reconciliation requires loop, fix, and trigger campaign IDs.",
      });
    }
    if (source.kind === "campaign_outcome" && !source.campaignRunId) {
      context.addIssue({
        code: "custom",
        message: "Campaign-outcome reconciliation requires a campaign run ID.",
      });
    }
    if (source.kind === "loop_outcome" && !source.loopId) {
      context.addIssue({
        code: "custom",
        message: "Loop-outcome reconciliation requires a loop ID.",
      });
    }
  });

const evidenceReviewSchema = z
  .object({
    evidenceId: z.string().trim().min(1),
    disposition: z.enum(["incorporated", "confirming", "not_reusable"]),
    findingIds: z.array(findingIdSchema),
    rationale: z.string().trim().min(1),
  })
  .strict()
  .superRefine((review, context) => {
    if (review.disposition !== "not_reusable" && review.findingIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["findingIds"],
        message: "Reusable evidence must identify at least one finding.",
      });
    }
  });

const addOperationSchema = z
  .object({ type: z.literal("add"), entry: findingSchema })
  .strict();
const amendOperationSchema = z
  .object({
    type: z.literal("amend"),
    findingId: findingIdSchema,
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(1),
    changes: mutableFindingFieldsSchema.partial().refine(
      (changes) => Object.keys(changes).length > 0,
      "An amendment requires at least one changed field."
    ),
    evidence: z.array(evidenceSchema).min(1),
  })
  .strict();
const confirmOperationSchema = z
  .object({
    type: z.literal("confirm"),
    findingId: findingIdSchema,
    expectedRevision: z.number().int().positive(),
    confidence: z.enum(["supported", "confirmed"]),
    reason: z.string().trim().min(1),
    evidence: z.array(evidenceSchema).min(1),
  })
  .strict();
const retireOperationSchema = z
  .object({
    type: z.literal("retire"),
    findingId: findingIdSchema,
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(1),
    evidence: z.array(evidenceSchema).min(1),
  })
  .strict();
const operationSchema = z.discriminatedUnion("type", [
  addOperationSchema,
  amendOperationSchema,
  confirmOperationSchema,
  retireOperationSchema,
]);

const reconciliationBaseSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_KNOWLEDGE_RECONCILIATION_SCHEMA_VERSION),
    id: reconciliationIdSchema,
    source: sourceSchema,
    consultedManifestDigest: sha256Schema,
    contextDigest: sha256Schema,
    consultedFindingIds: z.array(findingIdSchema),
    evidenceReview: z.array(evidenceReviewSchema),
    operations: z.array(operationSchema),
    noChangeReason: z.string().trim().min(1).optional(),
    createdAt: z.string().datetime(),
  })
  .strict()
  .superRefine(validateOperationChoice);

const storedReconciliationSchema = reconciliationBaseSchema
  .extend({
    priorManifestDigest: sha256Schema,
    resultingManifestDigest: sha256Schema,
  })
  .strict();

export const campaignKnowledgeSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_KNOWLEDGE_SCHEMA_VERSION),
    revision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
    entries: z.array(findingSchema),
    reconciliations: z.array(storedReconciliationSchema),
  })
  .strict()
  .superRefine((knowledge, context) => {
    addDuplicateIssues(knowledge.entries.map(({ id }) => id), ["entries"], context);
    addDuplicateIssues(
      knowledge.reconciliations.map(({ id }) => id),
      ["reconciliations"],
      context
    );
    for (const [index, entry] of knowledge.entries.entries()) {
      validateConfidence(entry, ["entries", index], context);
    }
  });

export function createEmptyCampaignKnowledge(updatedAt = new Date().toISOString()) {
  return campaignKnowledgeSchema.parse({
    schemaVersion: CAMPAIGN_KNOWLEDGE_SCHEMA_VERSION,
    revision: 0,
    updatedAt,
    entries: [],
    reconciliations: [],
  });
}

export function parseCampaignKnowledge(input) {
  return campaignKnowledgeSchema.parse(input);
}

export function parseKnowledgeReconciliation(input) {
  return reconciliationBaseSchema.parse(input);
}

export function knowledgeEntriesDigest(knowledgeInput) {
  const knowledge = parseCampaignKnowledge(knowledgeInput);
  return createHash("sha256")
    .update(
      canonicalJson({
        schemaVersion: knowledge.schemaVersion,
        revision: knowledge.revision,
        entries: knowledge.entries,
      })
    )
    .digest("hex");
}

export function createKnowledgeContextDigest(context) {
  return createHash("sha256")
    .update(
      canonicalJson({
        applicableFindingIds: [...context.applicableFindingIds].sort(),
        evidence: [...context.evidence].sort((left, right) =>
          left.id.localeCompare(right.id)
        ),
      })
    )
    .digest("hex");
}

export function selectCampaignKnowledge(knowledgeInput, criteria) {
  const knowledge = parseCampaignKnowledge(knowledgeInput);
  const active = knowledge.entries
    .filter(({ status }) => status === "active")
    .sort((left, right) => left.id.localeCompare(right.id));
  const stageMatches = active.filter(
    ({ scope }) =>
      dimensionMatches(scope.stages, criteria.stage) &&
      dimensionMatches(scope.classifications, criteria.classification)
  );
  return {
    applicable: stageMatches.filter(({ scope }) => scopeMatches(scope, criteria)),
    related: stageMatches.filter(({ scope }) => !scopeMatches(scope, criteria)),
  };
}

export function applyKnowledgeReconciliation(
  knowledgeInput,
  proposalInput,
  context
) {
  const knowledge = parseCampaignKnowledge(knowledgeInput);
  const proposal = parseKnowledgeReconciliation(proposalInput);
  const priorManifestDigest = knowledgeEntriesDigest(knowledge);
  if (proposal.consultedManifestDigest !== priorManifestDigest) {
    throw new Error("Knowledge reconciliation is stale against the current manifest.");
  }
  if (proposal.contextDigest !== context.contextDigest) {
    throw new Error("Knowledge reconciliation context is stale.");
  }
  const missingFindings = context.applicableFindingIds.filter(
    (id) => !proposal.consultedFindingIds.includes(id)
  );
  if (missingFindings.length > 0) {
    throw new Error(
      `Knowledge reconciliation did not consult ${missingFindings.join(", ")}.`
    );
  }
  assertEvidenceReviewed(context.evidence, proposal.evidenceReview);
  if (knowledge.reconciliations.some(({ id }) => id === proposal.id)) {
    throw new Error(`Knowledge reconciliation ${proposal.id} already exists.`);
  }

  let entries = structuredClone(knowledge.entries);
  for (const operation of proposal.operations) {
    entries = applyOperation(entries, operation, proposal.createdAt);
  }
  const candidate = {
    ...knowledge,
    revision: knowledge.revision + 1,
    updatedAt: proposal.createdAt,
    entries,
    reconciliations: knowledge.reconciliations,
  };
  const resultingManifestDigest = knowledgeEntriesDigest(candidate);
  return parseCampaignKnowledge({
    ...candidate,
    reconciliations: [
      ...knowledge.reconciliations,
      {
        ...proposal,
        priorManifestDigest,
        resultingManifestDigest,
      },
    ],
  });
}

export function createCampaignKnowledgeStore(repoRoot) {
  const filePath = path.join(repoRoot, CAMPAIGN_KNOWLEDGE_PATH);
  return {
    filePath,
    async read() {
      return parseCampaignKnowledge(JSON.parse(await readFile(filePath, "utf8")));
    },
    async write(knowledgeInput) {
      const knowledge = parseCampaignKnowledge(knowledgeInput);
      await mkdir(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
      await writeFile(temporaryPath, `${JSON.stringify(knowledge, null, 2)}\n`, "utf8");
      await rename(temporaryPath, filePath);
      return knowledge;
    },
    async reconcile(proposal, context) {
      const current = await this.read();
      const updated = applyKnowledgeReconciliation(current, proposal, context);
      await this.write(updated);
      return updated;
    },
  };
}

export async function readCampaignKnowledgeAtRevision(repoRoot, revision) {
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error("Knowledge revision must be a full Git commit SHA.");
  }
  const { stdout } = await execFileAsync(
    "git",
    ["show", `${revision}:${CAMPAIGN_KNOWLEDGE_PATH}`],
    { cwd: repoRoot, encoding: "utf8" }
  );
  return parseCampaignKnowledge(JSON.parse(stdout));
}

function validateOperationChoice(reconciliation, context) {
  if (reconciliation.operations.length === 0 && !reconciliation.noChangeReason) {
    context.addIssue({
      code: "custom",
      path: ["noChangeReason"],
      message: "A reconciliation requires operations or a no-change reason.",
    });
  }
  if (reconciliation.operations.length > 0 && reconciliation.noChangeReason) {
    context.addIssue({
      code: "custom",
      path: ["noChangeReason"],
      message: "A reconciliation cannot combine operations with a no-change reason.",
    });
  }
}

function applyOperation(entries, operation, changedAt) {
  if (operation.type === "add") {
    if (entries.some(({ id }) => id === operation.entry.id)) {
      throw new Error(`Knowledge finding ${operation.entry.id} already exists.`);
    }
    if (operation.entry.revision !== 1 || operation.entry.amendments.length > 0) {
      throw new Error("A new knowledge finding must start at revision 1 without amendments.");
    }
    return [...entries, operation.entry].sort((left, right) =>
      left.id.localeCompare(right.id)
    );
  }
  const index = entries.findIndex(({ id }) => id === operation.findingId);
  if (index < 0) throw new Error(`Knowledge finding ${operation.findingId} does not exist.`);
  const current = entries[index];
  if (current.revision !== operation.expectedRevision) {
    throw new Error(
      `Knowledge finding ${current.id} revision is ${current.revision}, not ${operation.expectedRevision}.`
    );
  }
  const previous = mutableFindingFields(current);
  let next;
  if (operation.type === "amend") {
    next = {
      ...current,
      ...operation.changes,
      evidence: mergeEvidence(current.evidence, operation.evidence),
    };
  } else if (operation.type === "confirm") {
    next = {
      ...current,
      confidence: operation.confidence,
      evidence: mergeEvidence(current.evidence, operation.evidence),
    };
  } else {
    next = {
      ...current,
      status: "retired",
      evidence: mergeEvidence(current.evidence, operation.evidence),
    };
  }
  next = {
    ...next,
    revision: current.revision + 1,
    updatedAt: changedAt,
    amendments: [
      ...current.amendments,
      {
        revision: current.revision,
        changedAt,
        reason: operation.reason,
        previous,
        evidenceAdded: operation.evidence,
      },
    ],
  };
  return entries.map((entry, entryIndex) => (entryIndex === index ? next : entry));
}

function validateConfidence(entry, pathPrefix, context) {
  const qualities = new Set(entry.evidence.map(({ quality }) => quality));
  const actualCampaigns = new Set(
    entry.evidence
      .filter(({ quality }) => quality === "actual_submission")
      .map(({ campaignRunId }) => campaignRunId)
      .filter(Boolean)
  );
  const supports = [
    "actual_submission",
    "verified_fix",
    "manual_qa_approved",
  ].some((quality) => qualities.has(quality));
  if (["supported", "confirmed"].includes(entry.confidence) && !supports) {
    context.addIssue({
      code: "custom",
      path: [...pathPrefix, "confidence"],
      message: "Supported knowledge requires actual-submission or verified-fix evidence.",
    });
  }
  if (
    entry.confidence === "confirmed" &&
    !qualities.has("manual_qa_approved") &&
    actualCampaigns.size < 2
  ) {
    context.addIssue({
      code: "custom",
      path: [...pathPrefix, "confidence"],
      message:
        "Confirmed knowledge requires approved manual QA or two independent actual campaigns.",
    });
  }
}

function assertEvidenceReviewed(evidence, reviews) {
  const expected = evidence.map(({ id }) => id).sort();
  const actual = reviews.map(({ evidenceId }) => evidenceId).sort();
  if (
    expected.length !== actual.length ||
    expected.some((id, index) => id !== actual[index])
  ) {
    throw new Error("Knowledge reconciliation must review every context evidence item exactly once.");
  }
}

function scopeMatches(scope, criteria) {
  if (scope.applicability === "pipeline_general") return true;
  if (scope.applicability === "mechanic") {
    return scope.mechanicIds.includes(criteria.mechanicId);
  }
  return scope.manifestIds.includes(criteria.manifestId);
}

function dimensionMatches(values, selected) {
  return values.length === 0 || values.includes(selected);
}

function mutableFindingFields(entry) {
  return {
    status: entry.status,
    confidence: entry.confidence,
    title: entry.title,
    guidance: entry.guidance,
    scope: entry.scope,
  };
}

function mergeEvidence(existing, additions) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of additions) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function addDuplicateIssues(values, pathPrefix, context) {
  for (const value of new Set(values)) {
    if (values.filter((candidate) => candidate === value).length > 1) {
      context.addIssue({
        code: "custom",
        path: pathPrefix,
        message: `Duplicate ID ${value}.`,
      });
    }
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
