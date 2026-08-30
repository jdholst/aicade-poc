import { describe, expect, it } from "vitest";

import {
  applyLoopBudgetExtension,
  applyFixCheckpoint,
  beginActualProviderCall,
  createLoopBudgetExtensionPreview,
  createInitialLoopRun,
  exhaustLoop,
  finishSequenceCampaign,
  pauseLoopForCampaignRepair,
  rejectLoopManualQa,
  recordActualProviderCall,
  recordLoopSubmission,
  remainingLoopBudgets,
  settleActualProviderCallCost,
  reconcileLegacyProviderCostEstimates,
  resumeLoopAfterCampaignRepair,
  resumeLoopAfterManualQaApproval,
  startLoopCampaign,
} from "./lib/loop-state.mjs";

const revisionA = {
  head: "a".repeat(40),
  revisionKey: "1".repeat(64),
};
const revisionB = {
  head: "b".repeat(40),
  revisionKey: "2".repeat(64),
};

const definition = {
  id: "ticket-17-loop",
  model: "gpt-5.6-luna",
  sequence: [
    {
      id: "discover",
      cohort: "discovery",
      providerModes: { planning: "actual", contract: "actual", source: "actual" },
      maxCampaignRunsPerRevision: 2,
      retryableClassifications: ["provider_failure", "infrastructure_failure"],
    },
    {
      id: "repeat",
      cohort: "repeatability",
      providerModes: { planning: "actual", contract: "actual", source: "actual" },
      maxCampaignRunsPerRevision: 1,
      retryableClassifications: ["infrastructure_failure"],
    },
  ],
  limits: {
    maxFixCycles: 2,
    maxCampaignRuns: 8,
    maxSubmissions: 30,
    maxAuxiliaryIsolationCampaigns: 1,
    actualProviderCalls: { planning: 30, contract: 60, source: 60 },
  },
};

function initialRun() {
  return createInitialLoopRun({
    definition,
    definitionPath: "/repo/.qa/ticket-17-loop.json",
    definitionHash: "3".repeat(64),
    authorizationHash: "4".repeat(64),
    campaign: {
      manifest: { id: "p09-t17-projectile" },
      manifestPath: "/repo/tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
      manifestHash: "5".repeat(64),
    },
    runId: "ticket-17-loop-20260823t150000000z",
    createdAt: "2026-08-23T15:00:00.000Z",
    revision: revisionA,
    controlRoot: "/repo",
    worktreePath: "/repo/.qa/mechanic-generation-campaign-worktrees/ticket-17-loop",
    branch: "codex/campaign-loop-ticket-17-loop",
    knowledgeManifestDigest: "6".repeat(64),
  });
}

describe("campaign loop state", () => {
  it("advances only after the current campaign itself is achieved", () => {
    let run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    run = finishSequenceCampaign(run, definition, {
      campaignRunId: "discovery-1",
      status: "achieved",
      attempts: [{ status: "success", classification: "success", manualQa: { status: "approved" } }],
    });

    expect(run.currentStepIndex).toBe(1);
    expect(run.steps.map(({ status }) => status)).toEqual(["achieved", "pending"]);
    expect(run.status).toBe("running");
  });

  it("allows one cost-limit overshoot, settles it once, and blocks the next call", () => {
    let run = {
      ...initialRun(),
      pricing: {
        path: "tools/mechanic-generation-campaign/pricing/openai-2026-08-29.json",
        sha256: "7".repeat(64),
        snapshotId: "openai-2026-08-29",
      },
      limits: { ...initialRun().limits, maxActualProviderCostNanoUsd: 1_000_000 },
      providerCost: {
        grossExactNanoUsd: 0,
        grossEstimatedNanoUsd: 0,
        attributedExactNanoUsd: 0,
        attributedEstimatedNanoUsd: 0,
        pendingReservations: [],
        settledCalls: [],
      },
    };
    const begun = beginActualProviderCall(run, {
      callId: "attempt-1:planning:1",
      stage: "planning",
      requestedAt: "2026-08-29T12:00:00.000Z",
      reservationNanoUsd: 500_000,
    });
    expect(begun.allowed).toBe(true);
    run = settleActualProviderCallCost(begun.run, {
      callId: "attempt-1:planning:1",
      stage: "planning",
      completedAt: "2026-08-29T12:00:01.000Z",
      quality: "exact",
      totalNanoUsd: 1_200_000,
    });
    const repeated = settleActualProviderCallCost(run, {
      callId: "attempt-1:planning:1",
      stage: "planning",
      completedAt: "2026-08-29T12:00:01.000Z",
      quality: "exact",
      totalNanoUsd: 1_200_000,
    });
    expect(repeated.providerCost.grossExactNanoUsd).toBe(1_200_000);

    const blocked = beginActualProviderCall(repeated, {
      callId: "attempt-1:contract:1",
      stage: "contract",
      requestedAt: "2026-08-29T12:00:02.000Z",
      reservationNanoUsd: 500_000,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.run.status).toBe("exhausted");
    expect(blocked.run.exhaustionReason).toMatch(/cost/i);
  });

  it("keeps a missing-usage reservation as unresolved exposure instead of reported spend", () => {
    let run = {
      ...initialRun(),
      pricing: {
        path: "tools/mechanic-generation-campaign/pricing/openai-2026-08-29.json",
        sha256: "7".repeat(64),
        snapshotId: "openai-2026-08-29",
      },
      limits: { ...initialRun().limits, maxActualProviderCostNanoUsd: 1_000_000 },
      providerCost: {
        grossExactNanoUsd: 0,
        grossEstimatedNanoUsd: 0,
        attributedExactNanoUsd: 0,
        attributedEstimatedNanoUsd: 0,
        pendingReservations: [],
        settledCalls: [],
      },
    };
    run = beginActualProviderCall(run, {
      callId: "attempt-1:source:1",
      stage: "source",
      requestedAt: "2026-08-29T12:00:00.000Z",
      reservationNanoUsd: 1_200_000,
    }).run;
    run = settleActualProviderCallCost(run, {
      callId: "attempt-1:source:1",
      stage: "source",
      completedAt: "2026-08-29T12:00:01.000Z",
      quality: "unknown",
    });

    expect(run.providerCost).toMatchObject({
      grossExactNanoUsd: 0,
      grossEstimatedNanoUsd: 0,
      settledCalls: [
        {
          quality: "unknown",
          totalNanoUsd: 0,
          reservationNanoUsd: 1_200_000,
        },
      ],
    });
    expect(run.status).toBe("exhausted");
    expect(run.exhaustionReason).toMatch(/unresolved/i);
    expect(remainingLoopBudgets(run).actualProviderCostNanoUsd).toBe(
      1_000_000
    );
  });

  it("reclassifies legacy maximum-context estimates as unresolved exposure", () => {
    const run = {
      ...initialRun(),
      pricing: {
        path: "tools/mechanic-generation-campaign/pricing/openai-2026-08-29.json",
        sha256: "7".repeat(64),
        snapshotId: "openai-2026-08-29",
      },
      providerCost: {
        grossExactNanoUsd: 21_415_800,
        grossEstimatedNanoUsd: 755_400_000,
        attributedExactNanoUsd: 15_192_550,
        attributedEstimatedNanoUsd: 755_400_000,
        pendingReservations: [],
        settledCalls: [
          {
            callId: "attempt-1:source:1",
            stage: "source",
            completedAt: "2026-08-30T17:25:48.006Z",
            quality: "conservative_estimate",
            totalNanoUsd: 755_400_000,
            attributed: true,
          },
        ],
      },
    };

    const reconciled = reconcileLegacyProviderCostEstimates(run, {
      id: "provider-cost-reconciliation-1",
      reason: "Maximum-context reservations are not provider-call usage.",
      reconciledAt: "2026-08-30T18:00:00.000Z",
    });

    expect(reconciled.providerCost).toMatchObject({
      grossExactNanoUsd: 21_415_800,
      grossEstimatedNanoUsd: 0,
      attributedExactNanoUsd: 15_192_550,
      attributedEstimatedNanoUsd: 0,
      settledCalls: [
        {
          quality: "unknown",
          totalNanoUsd: 0,
          reservationNanoUsd: 755_400_000,
        },
      ],
    });
    expect(reconciled.providerCostReconciliations).toEqual([
      expect.objectContaining({
        id: "provider-cost-reconciliation-1",
        convertedCalls: 1,
        removedGrossEstimatedNanoUsd: 755_400_000,
      }),
    ]);
  });

  it("refuses to advance a proof step from automated-only success evidence", () => {
    const run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });

    expect(() =>
      finishSequenceCampaign(run, definition, {
        campaignRunId: "discovery-1",
        status: "achieved",
        attempts: [{ status: "success", classification: "success" }],
      })
    ).toThrow(/manual qa/i);
  });

  it("pauses the active campaign and preserves it while manual QA is pending", () => {
    let run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    const pendingManualQa = {
      manualQaId: "manual-qa-attempt-1",
      campaignRunId: "discovery-1",
      attemptId: "attempt-1",
      promptId: "baseline",
      cohort: "discovery",
      revisionKey: revisionA.revisionKey,
      requestedAt: "2026-08-23T15:01:00.000Z",
      evidencePath: "attempt-1/manual-qa.json",
    };

    run = finishSequenceCampaign(run, definition, {
      campaignRunId: "discovery-1",
      status: "waiting_for_manual_qa",
      attempts: [{ status: "awaiting_manual_qa", classification: "awaiting_manual_qa" }],
      pendingManualQa,
    });

    expect(run.status).toBe("waiting_for_manual_qa");
    expect(run.activeCampaign?.campaignRunId).toBe("discovery-1");
    expect(run.pendingManualQa).toEqual(pendingManualQa);
    expect(run.campaignLinks[0].status).toBe("waiting_for_manual_qa");
  });

  it("sends a human denial directly to the fix cycle", () => {
    let run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    run = finishSequenceCampaign(run, definition, {
      campaignRunId: "discovery-1",
      status: "completed_not_achieved",
      attempts: [
        {
          status: "mechanic_incorrect",
          classification: "manual_qa_rejected",
          failure: "Projectile spawned at arena center.",
        },
      ],
    });

    expect(run.status).toBe("waiting_for_fix");
    expect(run.activeCampaign).toBeUndefined();
    expect(run.pendingManualQa).toBeUndefined();
  });

  it("resumes the same active campaign after approval without spending budget", () => {
    let run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    run = finishSequenceCampaign(run, definition, {
      campaignRunId: "discovery-1",
      status: "waiting_for_manual_qa",
      attempts: [],
      pendingManualQa: {
        manualQaId: "manual-qa-attempt-1",
        campaignRunId: "discovery-1",
        attemptId: "attempt-1",
        promptId: "baseline",
        cohort: "discovery",
        revisionKey: revisionA.revisionKey,
        requestedAt: "2026-08-23T15:01:00.000Z",
        evidencePath: "attempt-1/manual-qa.json",
      },
    });
    const usageBefore = structuredClone(run.usage);

    const resumed = resumeLoopAfterManualQaApproval(run, {
      campaignRunId: "discovery-1",
    });

    expect(resumed.status).toBe("running");
    expect(resumed.activeCampaign?.campaignRunId).toBe("discovery-1");
    expect(resumed.pendingManualQa).toBeUndefined();
    expect(resumed.usage).toEqual(usageBefore);
  });

  it("removes only the decided candidate from a parallel manual-QA queue", () => {
    let run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    run = finishSequenceCampaign(run, definition, {
      campaignRunId: "discovery-1",
      status: "achieved",
      attempts: [
        {
          status: "success",
          classification: "success",
          manualQa: { status: "approved" },
        },
      ],
    });
    run = startLoopCampaign(run, {
      campaignRunId: "repeatability-1",
      role: "sequence",
      stepId: "repeat",
    });
    const queue = ["attempt-1", "attempt-2"].map((attemptId) => ({
      manualQaId: `manual-qa-${attemptId}`,
      campaignRunId: "repeatability-1",
      attemptId,
      promptId: "baseline",
      cohort: "repeatability",
      revisionKey: revisionA.revisionKey,
      requestedAt: "2026-08-23T15:01:00.000Z",
      evidencePath: `${attemptId}/manual-qa.json`,
    }));
    run = finishSequenceCampaign(run, definition, {
      campaignRunId: "repeatability-1",
      status: "waiting_for_manual_qa",
      attempts: [],
      pendingManualQaQueue: queue,
    });

    const resumed = resumeLoopAfterManualQaApproval(run, {
      campaignRunId: "repeatability-1",
      attemptId: "attempt-1",
    });

    expect(resumed.status).toBe("running");
    expect(resumed.pendingManualQa?.attemptId).toBe("attempt-2");
    expect(resumed.pendingManualQaQueue.map(({ attemptId }) => attemptId)).toEqual([
      "attempt-2",
    ]);
    expect(resumed.campaignLinks.at(-1).status).toBe("running");
  });

  it("pauses a frozen manual-QA candidate for an out-of-band campaign repair without spending budget", () => {
    let run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    const pendingManualQa = {
      manualQaId: "manual-qa-attempt-1",
      campaignRunId: "discovery-1",
      attemptId: "attempt-1",
      promptId: "baseline",
      cohort: "discovery",
      revisionKey: revisionA.revisionKey,
      requestedAt: "2026-08-23T15:01:00.000Z",
      evidencePath: "attempt-1/manual-qa.json",
    };
    run = finishSequenceCampaign(run, definition, {
      campaignRunId: "discovery-1",
      status: "waiting_for_manual_qa",
      attempts: [],
      pendingManualQa,
    });
    const usageBefore = structuredClone(run.usage);
    const revisionBefore = structuredClone(run.currentRevision);

    const paused = pauseLoopForCampaignRepair(run, {
      id: "campaign-repair-1",
      reason: "The manual-review iframe detector rejected a mounted candidate.",
      detectedAt: "2026-08-23T15:02:00.000Z",
    });

    expect(paused.status).toBe("waiting_for_campaign_repair");
    expect(paused.activeCampaign).toEqual(run.activeCampaign);
    expect(paused.pendingManualQa).toEqual(pendingManualQa);
    expect(paused.currentRevision).toEqual(revisionBefore);
    expect(paused.usage).toEqual(usageBefore);
    expect(paused.campaignRepairs).toEqual([
      {
        id: "campaign-repair-1",
        campaignRunId: "discovery-1",
        reason: "The manual-review iframe detector rejected a mounted candidate.",
        detectedAt: "2026-08-23T15:02:00.000Z",
        resumeStatus: "waiting_for_manual_qa",
        status: "pending",
        creditedUsage: {
          campaignRuns: 0,
          submissions: 0,
          auxiliaryIsolationCampaigns: 0,
          actualProviderCalls: { planning: 0, contract: 0, source: 0 },
        },
      },
    ]);
  });

  it("resumes the exact manual-QA checkpoint after an out-of-band campaign repair", () => {
    let run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    run = finishSequenceCampaign(run, definition, {
      campaignRunId: "discovery-1",
      status: "waiting_for_manual_qa",
      attempts: [],
      pendingManualQa: {
        manualQaId: "manual-qa-attempt-1",
        campaignRunId: "discovery-1",
        attemptId: "attempt-1",
        promptId: "baseline",
        cohort: "discovery",
        revisionKey: revisionA.revisionKey,
        requestedAt: "2026-08-23T15:01:00.000Z",
        evidencePath: "attempt-1/manual-qa.json",
      },
    });
    run = pauseLoopForCampaignRepair(run, {
      id: "campaign-repair-1",
      reason: "The review detector failed.",
      detectedAt: "2026-08-23T15:02:00.000Z",
    });
    const usageBefore = structuredClone(run.usage);
    const revisionBefore = structuredClone(run.currentRevision);

    const resumed = resumeLoopAfterCampaignRepair(run, {
      completedAt: "2026-08-23T15:03:00.000Z",
    });

    expect(resumed.status).toBe("waiting_for_manual_qa");
    expect(resumed.activeCampaign?.campaignRunId).toBe("discovery-1");
    expect(resumed.pendingManualQa?.attemptId).toBe("attempt-1");
    expect(resumed.currentRevision).toEqual(revisionBefore);
    expect(resumed.usage).toEqual(usageBefore);
    expect(resumed.campaignLinks[0].status).toBe("waiting_for_manual_qa");
    expect(resumed.campaignRepairs[0]).toMatchObject({
      id: "campaign-repair-1",
      status: "completed",
      completedAt: "2026-08-23T15:03:00.000Z",
    });
  });

  it("replaces a running campaign after campaign repair without charging the discarded run", () => {
    let run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    run = recordLoopSubmission(run).run;
    run = recordActualProviderCall(run, "planning").run;
    run = pauseLoopForCampaignRepair(run, {
      id: "campaign-repair-1",
      reason: "The campaign browser detector failed.",
      detectedAt: "2026-08-23T15:02:00.000Z",
    });

    const resumed = resumeLoopAfterCampaignRepair(run, {
      completedAt: "2026-08-23T15:03:00.000Z",
    });

    expect(resumed.status).toBe("running");
    expect(resumed.activeCampaign).toBeUndefined();
    expect(resumed.usage).toMatchObject({
      campaignRuns: 0,
      submissions: 0,
      actualProviderCalls: { planning: 0, contract: 0, source: 0 },
      grossActualProviderCalls: { planning: 1, contract: 0, source: 0 },
    });
    expect(resumed.steps[0]).toMatchObject({
      status: "running",
      campaignRunIds: ["discovery-1"],
      sameRevisionRuns: 0,
    });
    expect(resumed.campaignLinks[0].status).toBe("campaign_repair_replaced");
    expect(resumed.campaignRepairs[0]).toMatchObject({
      id: "campaign-repair-1",
      status: "completed",
      completedAt: "2026-08-23T15:03:00.000Z",
    });
  });

  it("moves a denied candidate directly to waiting_for_fix without a same-revision retry", () => {
    let run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    run = {
      ...run,
      status: "waiting_for_manual_qa",
      pendingManualQa: {
        manualQaId: "manual-qa-attempt-1",
        campaignRunId: "discovery-1",
        attemptId: "attempt-1",
        promptId: "baseline",
        cohort: "discovery",
        revisionKey: revisionA.revisionKey,
        requestedAt: "2026-08-23T15:01:00.000Z",
        evidencePath: "attempt-1/manual-qa.json",
      },
    };

    const denied = rejectLoopManualQa(run, {
      campaignRunId: "discovery-1",
      completedAt: "2026-08-23T15:05:00.000Z",
    });

    expect(denied.status).toBe("waiting_for_fix");
    expect(denied.activeCampaign).toBeUndefined();
    expect(denied.pendingManualQa).toBeUndefined();
    expect(denied.campaignLinks[0].status).toBe("completed_not_achieved");
  });

  it("retries only classifications explicitly allowed by the current step", () => {
    let run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    run = finishSequenceCampaign(run, definition, {
      campaignRunId: "discovery-1",
      status: "completed_not_achieved",
      attempts: [{ status: "pipeline_failure", classification: "provider_failure" }],
    });
    expect(run.status).toBe("running");

    run = startLoopCampaign(run, {
      campaignRunId: "discovery-2",
      role: "sequence",
      stepId: "discover",
    });
    run = finishSequenceCampaign(run, definition, {
      campaignRunId: "discovery-2",
      status: "completed_not_achieved",
      attempts: [{ status: "pipeline_failure", classification: "pipeline_failure" }],
    });

    expect(run.status).toBe("waiting_for_fix");
    expect(run.currentStepIndex).toBe(0);
    expect(run.steps[0].status).toBe("running");
  });

  it("bypasses same-revision retries when repeatability reaches three qualifying failures", () => {
    const thresholdDefinition = structuredClone(definition);
    thresholdDefinition.sequence[1].maxCampaignRunsPerRevision = 2;
    thresholdDefinition.sequence[1].retryableClassifications = [
      "provider_failure",
      "pipeline_failure",
      "semantic_runtime_failure",
    ];
    let run = initialRun();
    run = {
      ...run,
      currentStepIndex: 1,
      steps: run.steps.map((step, index) =>
        index === 0
          ? { ...step, status: "achieved", revisionKey: revisionA.revisionKey }
          : step
      ),
    };
    run = startLoopCampaign(run, {
      campaignRunId: "repeatability-1",
      role: "sequence",
      stepId: "repeat",
    });

    run = finishSequenceCampaign(run, thresholdDefinition, {
      campaignRunId: "repeatability-1",
      status: "completed_not_achieved",
      attempts: [
        { status: "pipeline_failure", classification: "provider_failure" },
        { status: "pipeline_failure", classification: "pipeline_failure" },
        { status: "mechanic_incorrect", classification: "semantic_runtime_failure" },
      ],
    });

    expect(run.status).toBe("waiting_for_fix");
    expect(run.activeCampaign).toBeUndefined();
    expect(run.currentStepIndex).toBe(1);
    expect(run.steps[1].sameRevisionRuns).toBe(1);
  });

  it("resets proof progress on a committed fix while preserving prior evidence", () => {
    let run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    run = finishSequenceCampaign(run, definition, {
      campaignRunId: "discovery-1",
      status: "achieved",
      attempts: [{ status: "success", classification: "success", manualQa: { status: "approved" } }],
    });
    run = { ...run, status: "waiting_for_fix" };

    const fixed = applyFixCheckpoint(
      run,
      {
        id: "fix-cycle-1",
        afterRevision: revisionB,
      },
      { knowledgeReconciliationId: "KR-fix-cycle-1" }
    );

    expect(fixed.currentRevision).toEqual({ ...revisionB, cycle: 1 });
    expect(fixed.currentStepIndex).toBe(0);
    expect(fixed.steps.map(({ status }) => status)).toEqual(["pending", "pending"]);
    expect(fixed.campaignLinks.map(({ campaignRunId }) => campaignRunId)).toEqual([
      "discovery-1",
    ]);
    expect(fixed.fixCheckpointIds).toEqual(["fix-cycle-1"]);
    expect(fixed.knowledgeReconciliationIds).toEqual(["KR-fix-cycle-1"]);
    expect(fixed.usage.fixCycles).toBe(1);
  });

  it("stops before forwarding an actual provider call beyond its stage ceiling", () => {
    const run = {
      ...initialRun(),
      limits: {
        ...initialRun().limits,
        actualProviderCalls: { planning: 1, contract: 2, source: 2 },
      },
    };
    const first = recordActualProviderCall(run, "planning");
    const blocked = recordActualProviderCall(first.run, "planning");

    expect(first.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
    expect(blocked.run.status).toBe("exhausted");
    expect(blocked.run.usage.actualProviderCalls.planning).toBe(1);
    expect(blocked.run.exhaustionResume).toMatchObject({
      status: "running",
    });
  });

  it("hashes additive budgets and restores the recorded fix checkpoint", () => {
    const exhausted = exhaustLoop(
      { ...initialRun(), status: "waiting_for_fix" },
      "Fix-cycle ceiling reached.",
      "2026-08-24T12:00:00.000Z",
      { status: "waiting_for_fix" }
    );
    const additions = {
      maxFixCycles: 2,
      maxCampaignRuns: 3,
      maxSubmissions: 4,
      maxAuxiliaryIsolationCampaigns: 1,
      actualProviderCalls: { planning: 5, contract: 6, source: 7 },
    };

    const preview = createLoopBudgetExtensionPreview(exhausted, additions);
    const extended = applyLoopBudgetExtension(exhausted, {
      additions,
      authorization: preview.authorizationHash,
      createdAt: "2026-08-24T12:05:00.000Z",
    });

    expect(preview.authorizationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.resultingLimits).toEqual({
      maxFixCycles: 4,
      maxCampaignRuns: 11,
      maxSubmissions: 34,
      maxAuxiliaryIsolationCampaigns: 2,
      actualProviderCalls: { planning: 35, contract: 66, source: 67 },
    });
    expect(extended).toMatchObject({
      schemaVersion: "campaign-loop-run/v4",
      status: "waiting_for_fix",
      limits: preview.resultingLimits,
      budgetExtensions: [
        {
          authorizationHash: preview.authorizationHash,
          previousStatus: "exhausted",
          additions,
          resultingLimits: preview.resultingLimits,
        },
      ],
    });
    expect(extended.completedAt).toBeUndefined();
    expect(extended.exhaustionReason).toBeUndefined();
    expect(extended.exhaustionResume).toBeUndefined();
  });

  it("preserves an active campaign across provider-budget exhaustion", () => {
    const running = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    const exhausted = exhaustLoop(
      running,
      "planning provider-call ceiling reached.",
      "2026-08-24T12:00:00.000Z"
    );
    const additions = {
      maxFixCycles: 0,
      maxCampaignRuns: 0,
      maxSubmissions: 0,
      maxAuxiliaryIsolationCampaigns: 0,
      actualProviderCalls: { planning: 1, contract: 0, source: 0 },
    };
    const preview = createLoopBudgetExtensionPreview(exhausted, additions);
    const extended = applyLoopBudgetExtension(exhausted, {
      additions,
      authorization: preview.authorizationHash,
      createdAt: "2026-08-24T12:05:00.000Z",
    });

    expect(exhausted.activeCampaign).toBeUndefined();
    expect(exhausted.exhaustionResume.activeCampaign).toEqual(
      running.activeCampaign
    );
    expect(extended.status).toBe("running");
    expect(extended.activeCampaign).toEqual(running.activeCampaign);
  });
});
