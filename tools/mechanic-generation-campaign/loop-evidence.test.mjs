import { describe, expect, it } from "vitest";

import { buildCampaignLoopEvidence } from "./lib/loop-evidence.mjs";

describe("campaign loop evidence", () => {
  it("groups selected-loop evidence by revision cycle in chronological order", async () => {
    const campaigns = new Map([
      ["campaign-discovery", campaignRun({
        id: "campaign-discovery",
        cohort: "discovery",
        revisionKey: "revision-zero",
        createdAt: "2026-08-29T12:00:00.000Z",
        completedAt: "2026-08-29T12:01:00.000Z",
        result: { submissions: 1, successes: 1, failures: 0 },
      })],
      ["campaign-repeatability", campaignRun({
        id: "campaign-repeatability",
        cohort: "repeatability",
        revisionKey: "revision-one",
        createdAt: "2026-08-29T12:10:00.000Z",
        completedAt: "2026-08-29T12:11:00.000Z",
        result: { submissions: 1, successes: 0, failures: 1 },
      })],
    ]);
    const attempts = new Map([
      ["campaign-discovery", [campaignAttempt({
        campaignRunId: "campaign-discovery",
        id: "a01-baseline",
        promptId: "baseline",
        status: "success",
        classification: "success",
        providerCalls: { planning: 1, contract: 1, source: 1 },
        manualQa: { id: "manual-qa-a01", path: "a01-baseline/manual-qa.json", status: "approved" },
      })]],
      ["campaign-repeatability", [campaignAttempt({
        campaignRunId: "campaign-repeatability",
        id: "a01-baseline",
        promptId: "baseline",
        status: "mechanic_incorrect",
        classification: "manual_qa_rejected",
        failure: "Projectile started at the arena center.",
        providerCalls: { planning: 1, contract: 1, source: 1 },
        manualQa: { id: "manual-qa-a02", path: "a01-baseline/manual-qa.json", status: "denied" },
      })]],
    ]);
    const manualQa = new Map([
      ["campaign-discovery/a01-baseline", {
        status: "approved",
        requestedAt: "2026-08-29T12:00:40.000Z",
        decidedAt: "2026-08-29T12:00:50.000Z",
        approvalNote: "Projectile behavior is correct.",
        reviewSessions: [{ id: "review-1", status: "ready", runtimeReady: true, artifacts: ["review-1-ready.png"] }],
      }],
      ["campaign-repeatability/a01-baseline", {
        status: "denied",
        requestedAt: "2026-08-29T12:10:40.000Z",
        decidedAt: "2026-08-29T12:10:50.000Z",
        denialReason: "Projectile started at the arena center.",
        reviewSessions: [],
      }],
    ]);
    const loop = loopRun();
    const store = {
      async readRun(id) {
        if (!campaigns.has(id)) {
          const error = new Error(`Missing campaign ${id}`);
          error.code = "ENOENT";
          throw error;
        }
        return campaigns.get(id);
      },
      async readAttempts(id) { return attempts.get(id) ?? []; },
      async readManualQa(campaignId, attemptId) {
        return manualQa.get(`${campaignId}/${attemptId}`) ?? null;
      },
    };
    const loopStore = {
      async readRun(id) {
        if (id !== loop.id) throw new Error(`Unknown loop ${id}`);
        return loop;
      },
      async readFixes() {
        return [{
          id: "fix-1",
          loopId: loop.id,
          triggerCampaignRunId: "campaign-discovery",
          triggerClassification: "pipeline_failure",
          diagnosis: "The generated source omitted the actor binding.",
          kind: "durable",
          temporaryFixIds: [],
          changedFiles: ["tools/mechanic-generation-campaign/lib/example.mjs"],
          verification: ["npm test"],
          beforeRevision: { revisionKey: "revision-zero" },
          afterRevision: { revisionKey: "revision-one" },
          commit: "abcdef1",
          createdAt: "2026-08-29T12:03:00.000Z",
        }];
      },
    };

    const evidence = await buildCampaignLoopEvidence({
      loopId: loop.id,
      store,
      loopStore,
      now: () => "2026-08-29T13:00:00.000Z",
    });

    expect(evidence.schemaVersion).toBe("campaign-loop-evidence/v1");
    expect(evidence.generatedAt).toBe("2026-08-29T13:00:00.000Z");
    expect(evidence.loop).toMatchObject({
      id: loop.id,
      manifestId: "p09-t17-projectile",
      status: "concluded",
      artifactUrl: `/artifacts/loops/${loop.id}/loop-run.json`,
    });
    expect(evidence.cycles.map(({ cycle, revisionKey }) => ({ cycle, revisionKey }))).toEqual([
      { cycle: 0, revisionKey: "revision-zero" },
      { cycle: 1, revisionKey: "revision-one" },
    ]);
    expect(evidence.cycles[0].events.map(({ type }) => type)).toEqual([
      "campaign",
      "campaign_repair",
      "fix",
    ]);
    expect(evidence.cycles[1].events.map(({ type }) => type)).toEqual([
      "campaign",
      "evidence_unavailable",
      "budget_extension",
      "lifecycle",
    ]);

    const discovery = evidence.cycles[0].events[0];
    expect(discovery).toMatchObject({
      campaignRunId: "campaign-discovery",
      cohort: "discovery",
      status: "achieved",
      submissions: 1,
      successes: 1,
      failures: 0,
      manualQa: { approved: 1, denied: 0, pending: 0 },
      providerCalls: { planning: 1, contract: 1, source: 1, total: 3 },
    });
    expect(discovery.attempts[0]).toMatchObject({
      id: "a01-baseline",
      promptId: "baseline",
      manualQa: {
        status: "approved",
        approvalNote: "Projectile behavior is correct.",
      },
    });
    expect(discovery.attempts[0].artifactLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "attempt.json" }),
      expect.objectContaining({ label: "manual-qa.json" }),
      expect.objectContaining({ label: "terminal.png" }),
      expect.objectContaining({ label: "review-1-ready.png" }),
    ]));
    expect(evidence.cycles[0].events[2]).toMatchObject({
      id: "fix:fix-1",
      revisionTransition: { from: "revision-zero", to: "revision-one" },
      changedFiles: ["tools/mechanic-generation-campaign/lib/example.mjs"],
      rawArtifactUrl: `/artifacts/loops/${loop.id}/fixes/fix-1.json`,
    });
    expect(evidence.cycles[1].events[1]).toMatchObject({
      campaignRunId: "campaign-missing",
      status: "evidence_unavailable",
      reason: "Campaign evidence is unavailable for campaign-missing.",
    });
    expect(evidence.totals.manualQa).toEqual({
      pending: 0,
      approved: 1,
      denied: 1,
    });
    expect(JSON.stringify(evidence)).not.toContain("/private/tmp/loop-worktree");
  });
});

function loopRun() {
  return {
    id: "p09-t17-projectile-loop-20260829t120000000z",
    manifestId: "p09-t17-projectile",
    model: "gpt-5.6-luna",
    status: "concluded",
    createdAt: "2026-08-29T11:59:00.000Z",
    startedAt: "2026-08-29T12:00:00.000Z",
    completedAt: "2026-08-29T12:12:00.000Z",
    baseRevision: { revisionKey: "revision-zero" },
    currentRevision: { cycle: 1, revisionKey: "revision-one" },
    currentStepIndex: 1,
    worktree: { path: "/private/tmp/loop-worktree", branch: "codex/campaign-loop-example" },
    steps: [
      { id: "discovery", cohort: "discovery", status: "achieved" },
      { id: "repeatability", cohort: "repeatability", status: "running" },
    ],
    campaignLinks: [
      { campaignRunId: "campaign-discovery", role: "sequence", stepId: "discovery", cycle: 0, revisionKey: "revision-zero", status: "achieved" },
      { campaignRunId: "campaign-repeatability", role: "sequence", stepId: "repeatability", cycle: 1, revisionKey: "revision-one", status: "completed_not_achieved" },
      { campaignRunId: "campaign-missing", role: "isolation", profileId: "planning-fixture", cycle: 1, revisionKey: "revision-one", status: "failed" },
    ],
    campaignRepairs: [{
      id: "repair-1",
      campaignRunId: "campaign-discovery",
      reason: "The restored game did not mount.",
      detectedAt: "2026-08-29T12:02:00.000Z",
      completedAt: "2026-08-29T12:02:30.000Z",
      resumeStatus: "waiting_for_manual_qa",
      status: "completed",
      creditedUsage: {
        campaignRuns: 1,
        submissions: 1,
        auxiliaryIsolationCampaigns: 0,
        actualProviderCalls: { planning: 1, contract: 1, source: 1 },
      },
    }],
    budgetExtensions: [{
      authorizationHash: "extension-hash",
      createdAt: "2026-08-29T12:11:30.000Z",
      previousStatus: "exhausted",
      additions: { maxCampaignRuns: 1, maxSubmissions: 1, actualProviderCalls: { planning: 1, contract: 1, source: 1 } },
      resultingLimits: { maxCampaignRuns: 8, maxSubmissions: 22, actualProviderCalls: { planning: 22, contract: 22, source: 22 } },
      resumeStatus: "running",
    }],
    lifecycle: {
      action: "conclude",
      previousStatus: "running",
      at: "2026-08-29T12:12:00.000Z",
      worktreeRemoved: true,
      branchRemoved: true,
    },
    usage: {
      fixCycles: 1,
      campaignRuns: 3,
      submissions: 2,
      auxiliaryIsolationCampaigns: 1,
      actualProviderCalls: { planning: 2, contract: 2, source: 2 },
      grossActualProviderCalls: { planning: 3, contract: 3, source: 3 },
    },
    limits: {
      maxFixCycles: 2,
      maxCampaignRuns: 8,
      maxSubmissions: 22,
      maxAuxiliaryIsolationCampaigns: 2,
      actualProviderCalls: { planning: 22, contract: 22, source: 22 },
    },
    result: { sequenceAchieved: false, mechanicProven: false },
  };
}

function campaignRun({ id, cohort, revisionKey, createdAt, completedAt, result }) {
  return {
    id,
    manifestId: "p09-t17-projectile",
    cohort,
    status: result.successes > 0 ? "achieved" : "completed_not_achieved",
    createdAt,
    startedAt: createdAt,
    completedAt,
    model: "gpt-5.6-luna",
    providerModes: { planning: "actual", contract: "actual", source: "actual" },
    revision: { revisionKey },
    result,
  };
}

function campaignAttempt(overrides) {
  return {
    sequence: 1,
    cohort: "discovery",
    providerModes: { planning: "actual", contract: "actual", source: "actual" },
    furthestStage: "external_mechanic_probe",
    startedAt: "2026-08-29T12:00:00.000Z",
    completedAt: "2026-08-29T12:01:00.000Z",
    durationMs: 60_000,
    artifacts: ["terminal.png"],
    ...overrides,
  };
}
