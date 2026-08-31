import { describe, expect, it } from "vitest";

import {
  collectCampaignCarryoverAttemptRefs,
  loadCampaignCarryoverAttempts,
  mergeCampaignProgressAttempts,
} from "./lib/campaign-progress.mjs";
import { scoreCampaign } from "./lib/contracts.mjs";
import { createDispatchBatch, resolveExecutionPolicy } from "./lib/parallel-execution.mjs";
import { createAttemptSchedule } from "./lib/runner-policy.mjs";

function approvedAttempt({
  campaignRunId,
  id,
  sequence,
  promptId = "baseline",
  revisionKey = "a".repeat(64),
}) {
  return {
    schemaVersion: "campaign-attempt/v1",
    campaignRunId,
    id,
    sequence,
    promptId,
    prompt: "Baseline",
    revisionKey,
    cohort: "repeatability",
    status: "success",
    terminalOutcome: "accepted",
    furthestStage: "external_mechanic_probe",
    classification: "success",
    pipelinePassed: true,
    externalProbePassed: true,
    providerCalls: { planning: 1, contract: 1, source: 1 },
    startedAt: "2026-08-31T04:00:00.000Z",
    completedAt: "2026-08-31T04:01:00.000Z",
    durationMs: 60_000,
    automatedOutcome: {
      status: "passed",
      terminalOutcome: "accepted",
      recordedAt: "2026-08-31T04:01:00.000Z",
    },
    recordedOutcome: "automated_success",
    adjudicatedOutcome: "manual_qa_approved",
    manualQa: {
      id: `manual-qa-${id}`,
      path: `${id}/manual-qa.json`,
      status: "approved",
    },
    providerModes: { planning: "actual", contract: "actual", source: "actual" },
    artifacts: [],
    temporaryFixIds: [],
  };
}

describe("campaign progress carryover", () => {
  it("carries only approved successes and preserves earlier carryover across fix cycles", async () => {
    const priorRef = {
      campaignRunId: "repeatability-c0",
      attemptId: "a01-baseline",
      sequence: 1,
      promptId: "baseline",
      revisionKey: "a".repeat(64),
    };
    const approved = approvedAttempt({
      campaignRunId: "repeatability-c1",
      id: "a02-baseline",
      sequence: 2,
      revisionKey: "b".repeat(64),
    });
    const failed = {
      ...approvedAttempt({
        campaignRunId: "repeatability-c1",
        id: "a03-baseline",
        sequence: 3,
        revisionKey: "b".repeat(64),
      }),
      status: "pipeline_failure",
      classification: "pipeline_failure",
      pipelinePassed: false,
      manualQa: undefined,
    };
    const store = {
      readRun: async () => ({ carryoverAttemptRefs: [priorRef] }),
      readAttempts: async () => [approved, failed],
    };

    await expect(
      collectCampaignCarryoverAttemptRefs(store, "repeatability-c1")
    ).resolves.toEqual([
      priorRef,
      {
        campaignRunId: "repeatability-c1",
        attemptId: "a02-baseline",
        sequence: 2,
        promptId: "baseline",
        revisionKey: "b".repeat(64),
      },
    ]);
  });

  it("loads exact approved attempts from the same loop cohort and step", async () => {
    const attempt = approvedAttempt({
      campaignRunId: "repeatability-c0",
      id: "a01-baseline",
      sequence: 1,
    });
    const run = {
      id: "repeatability-c1",
      loopId: "loop-1",
      loopStepId: "repeatability",
      cohort: "repeatability",
      carryoverAttemptRefs: [
        {
          campaignRunId: attempt.campaignRunId,
          attemptId: attempt.id,
          sequence: attempt.sequence,
          promptId: attempt.promptId,
          revisionKey: attempt.revisionKey,
        },
      ],
    };
    const store = {
      readRun: async () => ({
        loopId: "loop-1",
        loopStepId: "repeatability",
        cohort: "repeatability",
      }),
      readAttempt: async () => attempt,
    };

    await expect(loadCampaignCarryoverAttempts(store, run)).resolves.toEqual([
      attempt,
    ]);
  });

  it("rejects overlapping current and carryover attempt slots", () => {
    const carryover = approvedAttempt({
      campaignRunId: "repeatability-c0",
      id: "a01-baseline",
      sequence: 1,
    });
    const current = approvedAttempt({
      campaignRunId: "repeatability-c1",
      id: "a01-baseline",
      sequence: 1,
      revisionKey: "b".repeat(64),
    });

    expect(() =>
      mergeCampaignProgressAttempts([carryover], [current])
    ).toThrow(/duplicate attempt sequence 1/i);
  });

  it("scores approved checkpoints and dispatches the first failed slot", () => {
    const carryoverAttempts = [1, 2, 3].map((sequence) =>
      approvedAttempt({
        campaignRunId: "repeatability-c0",
        id: `a0${sequence}-baseline`,
        sequence,
      })
    );
    const manifest = {
      schemaVersion: "campaign-manifest/v1",
      id: "test-manifest",
      mechanic: {
        id: "projectile_shooting",
        name: "Projectile shooting",
        ticket: "Test ticket",
        ticketUrl: "https://example.com/test-ticket",
        requirementIds: ["requirement-1"],
      },
      model: "test-model",
      credential: { source: "keyword_env", envName: "TEST_KEYWORD" },
      prompts: [
        {
          id: "baseline",
          text: "Baseline",
          requirementIds: ["requirement-1"],
        },
        {
          id: "plain_paraphrase",
          text: "Paraphrase",
          requirementIds: ["requirement-1"],
        },
        {
          id: "constraints_first",
          text: "Constraints",
          requirementIds: ["requirement-1"],
        },
        {
          id: "outcomes_first",
          text: "Outcomes",
          requirementIds: ["requirement-1"],
        },
        {
          id: "compact",
          text: "Compact",
          requirementIds: ["requirement-1"],
        },
      ],
      cohorts: {
        discovery: { maxAttempts: 1, minimumSuccesses: 1 },
        isolation: { maxAttempts: 1, minimumSuccesses: 1 },
        repeatability: {
          maxAttempts: 10,
          minimumSuccesses: 8,
          failureLimit: 3,
        },
        variation: {
          runsPerPrompt: 2,
          minimumSuccesses: 8,
          requireEveryPromptSuccess: true,
          failureLimit: 3,
          maxReplacementAttempts: 1,
        },
      },
      providerModes: {
        planning: "actual",
        contract: "actual",
        source: "actual",
      },
      fixtures: {},
      probe: "./probe.mjs",
    };
    const schedule = createAttemptSchedule("repeatability", manifest.prompts);
    const policy = resolveExecutionPolicy({
      cohort: "repeatability",
      policy: {
        mode: "parallel",
        maxConcurrentAttempts: 3,
        maxPendingManualQa: 3,
        stageConcurrency: { planning: 3, contract: 3, source: 3 },
        scheduleOrder: "round_robin",
      },
    });

    expect(
      scoreCampaign("repeatability", manifest, carryoverAttempts)
    ).toMatchObject({ successes: 3, failures: 0, status: "running" });
    expect(
      createDispatchBatch({
        schedule,
        attempts: carryoverAttempts,
        slots: [],
        capacity: 1,
        leaseOwner: "test-owner",
        now: "2026-08-31T04:00:00.000Z",
      })
    ).toEqual([
      expect.objectContaining({
        attemptId: "a04-baseline",
        sequence: 4,
        promptId: "baseline",
      }),
    ]);
    expect(policy.maxConcurrentAttempts).toBe(3);
  });
});
