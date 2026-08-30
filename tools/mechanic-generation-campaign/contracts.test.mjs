import { describe, expect, it } from "vitest";
import path from "node:path";

import {
  parseCampaignManifest,
  parseCampaignAttempt,
  parseCampaignManualQa,
  parseCampaignRun,
  requiresManualQa,
  scoreCampaign,
} from "./lib/contracts.mjs";
import { redactSensitive } from "./lib/redaction.mjs";
import { loadCampaignManifest } from "./lib/manifest-loader.mjs";
import { resolveExecutionPolicy } from "./lib/parallel-execution.mjs";

const manifest = {
  schemaVersion: "campaign-manifest/v1",
  id: "p09-t17-projectile",
  mechanic: {
    id: "projectile_shooting",
    name: "Projectile shooting",
    ticket: "Phase 09 Ticket 17",
    ticketUrl: "https://www.notion.so/example",
    requirementIds: ["actor_origin", "visible_travel", "cleanup"],
  },
  model: "gpt-5.6-luna",
  credential: { source: "keyword_env", envName: "AICADE_CAMPAIGN_KEYWORD" },
  prompts: [
    { id: "baseline", text: "Baseline", requirementIds: ["actor_origin", "visible_travel", "cleanup"] },
    { id: "plain_paraphrase", text: "Paraphrase", requirementIds: ["actor_origin", "visible_travel", "cleanup"] },
    { id: "constraints_first", text: "Constraints", requirementIds: ["actor_origin", "visible_travel", "cleanup"] },
    { id: "outcomes_first", text: "Outcomes", requirementIds: ["actor_origin", "visible_travel", "cleanup"] },
    { id: "compact", text: "Compact", requirementIds: ["actor_origin", "visible_travel", "cleanup"] },
  ],
  providerModes: { planning: "actual", contract: "actual", source: "actual" },
  fixtures: {},
  probe: "./probes/projectile.mjs",
  cohorts: {
    discovery: { maxAttempts: 1, minimumSuccesses: 1 },
    isolation: { maxAttempts: 1, minimumSuccesses: 1 },
    repeatability: { maxAttempts: 10, minimumSuccesses: 8, failureLimit: 3 },
    variation: {
      runsPerPrompt: 2,
      minimumSuccesses: 8,
      requireEveryPromptSuccess: true,
      failureLimit: 3,
      maxReplacementAttempts: 1,
    },
  },
};

function successAttempt(index, promptId = "baseline") {
  return parseCampaignAttempt({
    schemaVersion: "campaign-attempt/v1",
    id: `attempt-${index}`,
    campaignRunId: "campaign-1",
    sequence: index,
    cohort: "repeatability",
    promptId,
    prompt: "Prompt text",
    status: "success",
    terminalOutcome: "accepted",
    furthestStage: "external_mechanic_probe",
    classification: "success",
    providerModes: { planning: "actual", contract: "actual", source: "actual" },
    providerCalls: { planning: 1, contract: 1, source: 1 },
    startedAt: "2026-08-22T12:00:00.000Z",
    completedAt: "2026-08-22T12:01:00.000Z",
    durationMs: 60_000,
    revisionKey: "revision-1",
    pipelinePassed: true,
    externalProbePassed: true,
    automatedOutcome: {
      status: "passed",
      terminalOutcome: "accepted and externally verified",
      recordedAt: "2026-08-22T12:01:00.000Z",
    },
    recordedOutcome: "automated_success",
    adjudicatedOutcome: "manual_qa_approved",
    manualQa: {
      id: `manual-qa-attempt-${index}`,
      path: `attempt-${index}/manual-qa.json`,
      status: "approved",
    },
    artifacts: [],
    temporaryFixIds: [],
  });
}

function failureAttempt(index, promptId = "baseline", classification = "pipeline_failure") {
  return {
    ...successAttempt(index, promptId),
    status: "pipeline_failure",
    terminalOutcome: classification,
    classification,
    failure: classification,
    pipelinePassed: false,
    externalProbePassed: false,
    automatedOutcome: {
      status: "failed",
      terminalOutcome: classification,
      recordedAt: "2026-08-22T12:01:00.000Z",
    },
    recordedOutcome: classification,
    adjudicatedOutcome: undefined,
    manualQa: classification === "manual_qa_rejected"
      ? {
          id: `manual-qa-attempt-${index}`,
          path: `attempt-${index}/manual-qa.json`,
          status: "denied",
        }
      : undefined,
  };
}

describe("campaign contracts", () => {
  it("loads all three seeded manifests and verifies referenced fixture hashes", async () => {
    const manifests = await Promise.all(
      [
        "p09-t17-projectile.json",
        "p09-t18-seeded-hazard-spawner.json",
        "p09-t19-temporary-proximity-modifier.json",
      ].map((fileName) =>
        loadCampaignManifest(path.join(import.meta.dirname, "manifests", fileName))
      )
    );

    expect(manifests.map(({ manifest: loaded }) => loaded.id)).toEqual([
      "p09-t17-projectile",
      "p09-t18-seeded-hazard-spawner",
      "p09-t19-temporary-proximity-modifier",
    ]);
    expect(manifests[0].fixturePaths).toHaveProperty("planning");
    expect(manifests[1].fixturePaths).toEqual({});
  });

  it("accepts five frozen prompts that cover every mechanic requirement", () => {
    const parsed = parseCampaignManifest(manifest);

    expect(parsed.prompts.map((prompt) => prompt.id)).toEqual([
      "baseline",
      "plain_paraphrase",
      "constraints_first",
      "outcomes_first",
      "compact",
    ]);
  });

  it("rejects a variation prompt that drops a mechanic requirement", () => {
    const invalid = structuredClone(manifest);
    invalid.prompts[4].requirementIds = ["visible_travel", "cleanup"];

    expect(() => parseCampaignManifest(invalid)).toThrow(/actor_origin/);
  });

  it("scores repeatability at eight successes out of ten", () => {
    const attempts = Array.from({ length: 10 }, (_, index) =>
      index < 8
        ? successAttempt(index + 1)
        : failureAttempt(index + 1)
    );

    expect(scoreCampaign("repeatability", manifest, attempts)).toMatchObject({
      status: "achieved",
      successes: 8,
      failures: 2,
      failureLimit: 3,
      remainingFailureTolerance: 1,
      baseSubmissions: 10,
      replacementSubmissions: 0,
      submissions: 10,
      qualifiesForMechanicProof: true,
    });
  });

  it.each([0, 1, 2])(
    "achieves repeatability after ten submissions with %i qualifying failures",
    (failureCount) => {
      const attempts = Array.from({ length: 10 }, (_, index) =>
        index < failureCount
          ? failureAttempt(index + 1)
          : successAttempt(index + 1)
      );

      expect(scoreCampaign("repeatability", manifest, attempts)).toMatchObject({
        status: "achieved",
        successes: 10 - failureCount,
        failures: failureCount,
        submissions: 10,
        terminalReason: "criteria_achieved",
      });
    }
  );

  it("keeps the first two repeatability failures in the active campaign and stops on the third", () => {
    expect(
      scoreCampaign("repeatability", manifest, [
        failureAttempt(1, "baseline", "provider_failure"),
        failureAttempt(2, "baseline", "manual_qa_rejected"),
      ])
    ).toMatchObject({
      status: "running",
      failures: 2,
      remainingFailureTolerance: 1,
      terminalReason: undefined,
    });

    expect(
      scoreCampaign("repeatability", manifest, [
        failureAttempt(1, "baseline", "provider_failure"),
        failureAttempt(2, "baseline", "manual_qa_rejected"),
        failureAttempt(3, "baseline", "semantic_runtime_failure"),
      ])
    ).toMatchObject({
      status: "completed_not_achieved",
      failures: 3,
      remainingFailureTolerance: 0,
      terminalReason: "failure_limit_reached",
    });
  });

  it("continues parallel generation while reviewed-risk capacity remains", () => {
    const candidate = {
      ...successAttempt(1),
      status: "awaiting_manual_qa",
      classification: "awaiting_manual_qa",
      manualQa: {
        id: "manual-qa-attempt-1",
        path: "attempt-1/manual-qa.json",
        status: "pending",
      },
    };

    expect(scoreCampaign("repeatability", manifest, [candidate])).toMatchObject({
      status: "running",
      automatedCandidates: 1,
      submissions: 1,
    });
    expect(
      scoreCampaign(
        "repeatability",
        manifest,
        Array.from({ length: 10 }, (_, index) => ({
          ...candidate,
          id: `attempt-${index + 1}`,
          sequence: index + 1,
          manualQa: {
            ...candidate.manualQa,
            id: `manual-qa-attempt-${index + 1}`,
            path: `attempt-${index + 1}/manual-qa.json`,
          },
        }))
      )
    ).toMatchObject({
      status: "waiting_for_manual_qa",
      automatedCandidates: 10,
      submissions: 10,
    });
  });

  it("does not count infrastructure and bounded-control outcomes toward the cohort failure limit", () => {
    const attempts = [
      failureAttempt(1, "baseline", "infrastructure_failure"),
      failureAttempt(2, "baseline", "provider_call_budget_exhausted"),
      { ...failureAttempt(3), status: "cancelled", classification: "cancelled" },
    ];

    expect(scoreCampaign("repeatability", manifest, attempts)).toMatchObject({
      status: "running",
      failures: 0,
      remainingFailureTolerance: 3,
    });
  });

  it("requires at least one variation success for every prompt", () => {
    const promptIds = manifest.prompts.map((prompt) => prompt.id);
    const attempts = promptIds.flatMap((promptId, promptIndex) =>
      Array.from({ length: 2 }, (_, runIndex) =>
        promptId === "compact"
          ? failureAttempt(promptIndex * 2 + runIndex + 1, promptId)
          : successAttempt(promptIndex * 2 + runIndex + 1, promptId)
      )
    );

    expect(scoreCampaign("variation", manifest, attempts)).toMatchObject({
      status: "running",
      successes: 8,
      failures: 2,
      submissions: 10,
      missingSuccessfulPromptIds: ["compact"],
      replacementPromptId: "compact",
      replacementSubmissions: 0,
    });
  });

  it("achieves variation when two failures affect different prompt variants", () => {
    const attempts = manifest.prompts.flatMap((prompt, promptIndex) =>
      [1, 2].map((runIndex) => {
        const sequence = promptIndex * 2 + runIndex;
        return runIndex === 1 && promptIndex < 2
          ? failureAttempt(sequence, prompt.id)
          : successAttempt(sequence, prompt.id);
      })
    );

    expect(scoreCampaign("variation", manifest, attempts)).toMatchObject({
      status: "achieved",
      successes: 8,
      failures: 2,
      missingSuccessfulPromptIds: [],
      replacementSubmissions: 0,
      terminalReason: "criteria_achieved",
    });
  });

  it("passes variation after one targeted replacement and fails when that replacement is the third failure", () => {
    const promptIds = manifest.prompts.map((prompt) => prompt.id);
    const baseAttempts = promptIds.flatMap((promptId, promptIndex) =>
      Array.from({ length: 2 }, (_, runIndex) =>
        promptId === "compact"
          ? failureAttempt(promptIndex * 2 + runIndex + 1, promptId)
          : successAttempt(promptIndex * 2 + runIndex + 1, promptId)
      )
    );
    const replacementSuccess = {
      ...successAttempt(11, "compact"),
      cohort: "variation",
      submissionKind: "replacement",
      replacementForPromptId: "compact",
    };
    const replacementFailure = {
      ...failureAttempt(11, "compact", "manual_qa_rejected"),
      cohort: "variation",
      submissionKind: "replacement",
      replacementForPromptId: "compact",
    };

    expect(
      scoreCampaign("variation", manifest, [...baseAttempts, replacementSuccess])
    ).toMatchObject({
      status: "achieved",
      successes: 9,
      failures: 2,
      submissions: 11,
      replacementSubmissions: 1,
      missingSuccessfulPromptIds: [],
      qualifiesForMechanicProof: true,
    });
    expect(
      scoreCampaign("variation", manifest, [...baseAttempts, replacementFailure])
    ).toMatchObject({
      status: "completed_not_achieved",
      failures: 3,
      submissions: 11,
      replacementSubmissions: 1,
      terminalReason: "failure_limit_reached",
    });
  });

  it("does not let fixture-backed attempts qualify for mechanic proof", () => {
    const attempt = {
      ...successAttempt(1),
      providerModes: { planning: "fixture", contract: "actual", source: "actual" },
    };

    expect(scoreCampaign("discovery", manifest, [attempt])).toMatchObject({
      status: "completed_not_achieved",
      successes: 0,
      diagnosticSuccesses: 1,
      qualifiesForMechanicProof: false,
    });
  });

  it("treats an automated full-actual pass as pending until a human approves it", () => {
    const attempt = {
      ...successAttempt(1),
      status: "awaiting_manual_qa",
      classification: "awaiting_manual_qa",
      recordedOutcome: "automated_success",
      adjudicatedOutcome: undefined,
      manualQa: {
        id: "manual-qa-attempt-1",
        path: "attempt-1/manual-qa.json",
        status: "pending",
      },
    };

    expect(scoreCampaign("discovery", manifest, [attempt])).toMatchObject({
      status: "waiting_for_manual_qa",
      successes: 0,
      automatedCandidates: 1,
      submissions: 1,
      qualifiesForMechanicProof: false,
    });
  });

  it("requires review only for full-actual proof-cohort automated passes", () => {
    expect(
      requiresManualQa({
        cohort: "discovery",
        providerModes: manifest.providerModes,
        pipelinePassed: true,
        externalProbePassed: true,
      })
    ).toBe(true);
    expect(
      requiresManualQa({
        cohort: "isolation",
        providerModes: manifest.providerModes,
        pipelinePassed: true,
        externalProbePassed: true,
      })
    ).toBe(false);
    expect(
      requiresManualQa({
        cohort: "variation",
        providerModes: { ...manifest.providerModes, planning: "fixture" },
        pipelinePassed: true,
        externalProbePassed: true,
      })
    ).toBe(false);
  });

  it("validates pending, approved, and denied manual-QA evidence conditionally", () => {
    const base = {
      schemaVersion: "campaign-manual-qa/v1",
      id: "manual-qa-attempt-1",
      campaignRunId: "campaign-1",
      attemptId: "attempt-1",
      promptId: "baseline",
      cohort: "discovery",
      revisionKey: "revision-1",
      status: "pending",
      requestedAt: "2026-08-22T12:01:00.000Z",
      candidateArtifacts: [
        {
          kind: "generation_run",
          path: "generation-run-storage.json",
          sha256: "a".repeat(64),
        },
        {
          kind: "game_pack",
          path: "game-pack-storage.json",
          sha256: "b".repeat(64),
        },
      ],
      reviewSessions: [],
    };

    expect(parseCampaignManualQa(base).status).toBe("pending");
    expect(
      parseCampaignManualQa({
        ...base,
        status: "approved",
        decidedAt: "2026-08-22T12:05:00.000Z",
        approvalNote: "Projectile origin and cleanup are correct.",
      }).status
    ).toBe("approved");
    expect(() =>
      parseCampaignManualQa({
        ...base,
        status: "denied",
        decidedAt: "2026-08-22T12:05:00.000Z",
      })
    ).toThrow(/denial reason/i);
  });

  it("links a campaign run to an optional loop revision cycle", () => {
    const run = parseCampaignRun({
      schemaVersion: "campaign-run/v1",
      id: "campaign-1",
      manifestId: manifest.id,
      manifestPath: "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
      manifestHash: "a".repeat(64),
      cohort: "discovery",
      status: "pending",
      createdAt: "2026-08-23T15:00:00.000Z",
      model: manifest.model,
      providerModes: manifest.providerModes,
      attemptCeiling: 1,
      attemptIds: [],
      revision: {
        head: "b".repeat(40),
        revisionKey: "c".repeat(64),
        dirty: false,
        statusEntries: [],
      },
      baseUrl: "http://127.0.0.1:3117",
      authorization: {
        actualProviders: true,
        authorizedAt: "2026-08-23T15:00:00.000Z",
      },
      loopId: "ticket-17-loop-1",
      loopStepId: "discover",
      loopCycle: 0,
    });

    expect(run).toMatchObject({
      schemaVersion: "campaign-run/v2",
      loopId: "ticket-17-loop-1",
      loopStepId: "discover",
      loopCycle: 0,
      knowledgePolicy: { required: false },
    });
  });

  it("requires a knowledge baseline on new campaign runs while grandfathering v1 records", () => {
    const legacy = parseCampaignRun({
      schemaVersion: "campaign-run/v1",
      id: "campaign-legacy",
      manifestId: manifest.id,
      manifestPath: "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
      manifestHash: "a".repeat(64),
      cohort: "discovery",
      status: "pending",
      createdAt: "2026-08-23T15:00:00.000Z",
      model: manifest.model,
      providerModes: manifest.providerModes,
      attemptCeiling: 1,
      attemptIds: [],
      revision: {
        head: "b".repeat(40),
        revisionKey: "c".repeat(64),
        dirty: false,
        statusEntries: [],
      },
      baseUrl: "http://127.0.0.1:3117",
      authorization: {
        actualProviders: false,
        authorizedAt: "2026-08-23T15:00:00.000Z",
      },
    });

    expect(legacy.knowledgePolicy).toEqual({ required: false });
    expect(() =>
      parseCampaignRun({
        ...legacy,
        schemaVersion: "campaign-run/v2",
        knowledgePolicy: { required: true },
      })
    ).toThrow(/baselineManifestDigest/);
    expect(
      parseCampaignRun({
        ...legacy,
        schemaVersion: "campaign-run/v2",
        knowledgePolicy: {
          required: true,
          baselineManifestDigest: "d".repeat(64),
        },
      }).knowledgePolicy
    ).toEqual({
      required: true,
      baselineManifestDigest: "d".repeat(64),
    });
  });

  it("requires a pending-review reference when a campaign is waiting for manual QA", () => {
    const run = {
      schemaVersion: "campaign-run/v1",
      id: "campaign-1",
      manifestId: manifest.id,
      manifestPath: "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
      manifestHash: "a".repeat(64),
      cohort: "discovery",
      status: "waiting_for_manual_qa",
      createdAt: "2026-08-23T15:00:00.000Z",
      startedAt: "2026-08-23T15:00:01.000Z",
      model: manifest.model,
      providerModes: manifest.providerModes,
      attemptCeiling: 1,
      attemptIds: ["attempt-1"],
      revision: {
        head: "b".repeat(40),
        revisionKey: "c".repeat(64),
        dirty: false,
        statusEntries: [],
      },
      baseUrl: "http://127.0.0.1:3117",
      authorization: {
        actualProviders: true,
        authorizedAt: "2026-08-23T15:00:00.000Z",
      },
    };

    expect(() => parseCampaignRun(run)).toThrow(/pending manual qa/i);
    const parsed = parseCampaignRun({
        ...run,
        pendingManualQa: {
          manualQaId: "manual-qa-attempt-1",
          campaignRunId: "campaign-1",
          attemptId: "attempt-1",
          promptId: "baseline",
          cohort: "discovery",
          revisionKey: "c".repeat(64),
          requestedAt: "2026-08-23T15:01:00.000Z",
          evidencePath: "attempt-1/manual-qa.json",
        },
      });
    expect(parsed).toMatchObject({
      status: "waiting_for_manual_qa",
      stateRevision: 0,
      executionPolicy: {
        mode: "sequential",
        maxConcurrentAttempts: 1,
      },
      pendingManualQaQueue: [parsed.pendingManualQa],
      attemptSlots: [],
    });
  });

  it("accepts multiple queued reviews while a parallel proof campaign remains active", () => {
    const legacy = parseCampaignRun({
      schemaVersion: "campaign-run/v1",
      id: "campaign-parallel",
      manifestId: manifest.id,
      manifestPath: "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
      manifestHash: "a".repeat(64),
      cohort: "repeatability",
      status: "running",
      createdAt: "2026-08-23T15:00:00.000Z",
      model: manifest.model,
      providerModes: manifest.providerModes,
      attemptCeiling: 10,
      attemptIds: [],
      revision: {
        head: "b".repeat(40),
        revisionKey: "c".repeat(64),
        dirty: false,
        statusEntries: [],
      },
      baseUrl: "http://127.0.0.1:3117",
      authorization: {
        actualProviders: true,
        authorizedAt: "2026-08-23T15:00:00.000Z",
      },
    });
    const pending = [1, 2].map((sequence) => ({
      manualQaId: `manual-qa-attempt-${sequence}`,
      campaignRunId: legacy.id,
      attemptId: `attempt-${sequence}`,
      promptId: "baseline",
      cohort: "repeatability",
      revisionKey: legacy.revision.revisionKey,
      requestedAt: `2026-08-23T15:0${sequence}:00.000Z`,
      evidencePath: `attempt-${sequence}/manual-qa.json`,
    }));
    const parsed = parseCampaignRun({
      ...legacy,
      schemaVersion: "campaign-run/v2",
      knowledgePolicy: { required: false },
      executionPolicy: resolveExecutionPolicy({
        cohort: "repeatability",
        policy: {
          mode: "parallel",
          maxConcurrentAttempts: 3,
          maxPendingManualQa: 3,
          stageConcurrency: { planning: 3, contract: 3, source: 3 },
          scheduleOrder: "round_robin",
        },
      }),
      pendingManualQaQueue: pending,
      stateRevision: 4,
      attemptSlots: [],
    });

    expect(parsed.status).toBe("running");
    expect(parsed.pendingManualQaQueue).toEqual(pending);
    expect(parsed.pendingManualQa).toEqual(pending[0]);
  });

  it("preserves a pending review when provider-budget completion races with the candidate", () => {
    const base = parseCampaignRun({
      schemaVersion: "campaign-run/v1",
      id: "campaign-budget-race",
      manifestId: manifest.id,
      manifestPath: "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
      manifestHash: "a".repeat(64),
      cohort: "repeatability",
      status: "running",
      createdAt: "2026-08-30T20:00:00.000Z",
      model: manifest.model,
      providerModes: manifest.providerModes,
      attemptCeiling: 10,
      attemptIds: ["attempt-3"],
      revision: {
        head: "b".repeat(40),
        revisionKey: "c".repeat(64),
        dirty: false,
        statusEntries: [],
      },
      baseUrl: "http://127.0.0.1:3117",
      authorization: {
        actualProviders: true,
        authorizedAt: "2026-08-30T20:00:00.000Z",
      },
    });
    const pending = {
      manualQaId: "manual-qa-attempt-3",
      campaignRunId: base.id,
      attemptId: "attempt-3",
      promptId: "baseline",
      cohort: "repeatability",
      revisionKey: base.revision.revisionKey,
      requestedAt: "2026-08-30T20:01:00.000Z",
      evidencePath: "attempt-3/manual-qa.json",
    };

    const parsed = parseCampaignRun({
      ...base,
      schemaVersion: "campaign-run/v2",
      knowledgePolicy: { required: false },
      status: "completed_not_achieved",
      completedAt: "2026-08-30T20:01:01.000Z",
      pendingManualQa: pending,
      pendingManualQaQueue: [pending],
    });

    expect(parsed.status).toBe("waiting_for_manual_qa");
    expect(parsed.completedAt).toBeUndefined();
    expect(parsed.pendingManualQaQueue).toEqual([pending]);
  });

  it("rejects duplicate durable slots and execution-policy overcommit", () => {
    const base = parseCampaignRun({
      schemaVersion: "campaign-run/v1",
      id: "campaign-slot-validation",
      manifestId: manifest.id,
      manifestPath: "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
      manifestHash: "a".repeat(64),
      cohort: "repeatability",
      status: "running",
      createdAt: "2026-08-23T15:00:00.000Z",
      model: manifest.model,
      providerModes: manifest.providerModes,
      attemptCeiling: 10,
      attemptIds: [],
      revision: {
        head: "b".repeat(40),
        revisionKey: "c".repeat(64),
        dirty: false,
        statusEntries: [],
      },
      baseUrl: "http://127.0.0.1:3117",
      authorization: {
        actualProviders: true,
        authorizedAt: "2026-08-23T15:00:00.000Z",
      },
    });
    const policy = resolveExecutionPolicy({
      cohort: "repeatability",
      policy: {
        mode: "parallel",
        maxConcurrentAttempts: 2,
        maxPendingManualQa: 2,
      },
    });
    const slot = (sequence) => ({
      attemptId: `attempt-${sequence}`,
      sequence,
      promptId: "baseline",
      submissionKind: "scheduled",
      status: "running",
      leaseId: `lease-${sequence}`,
      leaseOwner: "worker-pool",
      leasedAt: "2026-08-23T15:01:00.000Z",
      updatedAt: "2026-08-23T15:01:00.000Z",
    });

    expect(() =>
      parseCampaignRun({
        ...base,
        executionPolicy: policy,
        attemptSlots: [slot(1), slot(1)],
      })
    ).toThrow(/slot ids|sequence numbers/i);
    expect(() =>
      parseCampaignRun({
        ...base,
        executionPolicy: policy,
        attemptSlots: [slot(1), slot(2), slot(3)],
      })
    ).toThrow(/active attempt slots/i);
  });
});

describe("campaign redaction", () => {
  it("removes API keys, request keywords, and credential-bearing query values recursively", () => {
    const redacted = redactSensitive({
      openAiApiKey: "sk-secret",
      openAiKeyword: "request keyword",
      nested: {
        providerConfig: {
          openAiApiKey: "sk-nested",
          openAiKeyword: "request keyword",
          openAiModel: "gpt-5.6-luna",
        },
        url: "http://localhost:3005/editor?idea=hello&openAiKeyword=request+keyword&openAiApiKey=sk-secret",
      },
    });

    expect(redacted).toEqual({
      openAiApiKey: "[REDACTED]",
      openAiKeyword: "[REDACTED]",
      nested: {
        providerConfig: {
          openAiApiKey: "[REDACTED]",
          openAiKeyword: "[REDACTED]",
          openAiModel: "gpt-5.6-luna",
        },
        url: "http://localhost:3005/editor?idea=hello&openAiKeyword=%5BREDACTED%5D&openAiApiKey=%5BREDACTED%5D",
      },
    });
  });
});
