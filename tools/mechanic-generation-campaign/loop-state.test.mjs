import { describe, expect, it } from "vitest";

import {
  applyFixCheckpoint,
  createInitialLoopRun,
  finishSequenceCampaign,
  recordActualProviderCall,
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
      attempts: [{ status: "success", classification: "success" }],
    });

    expect(run.currentStepIndex).toBe(1);
    expect(run.steps.map(({ status }) => status)).toEqual(["achieved", "pending"]);
    expect(run.status).toBe("running");
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

  it("resets proof progress on a committed fix while preserving prior evidence", () => {
    let run = startLoopCampaign(initialRun(), {
      campaignRunId: "discovery-1",
      role: "sequence",
      stepId: "discover",
    });
    run = finishSequenceCampaign(run, definition, {
      campaignRunId: "discovery-1",
      status: "achieved",
      attempts: [{ status: "success", classification: "success" }],
    });
    run = { ...run, status: "waiting_for_fix" };

    const fixed = applyFixCheckpoint(run, {
      id: "fix-cycle-1",
      afterRevision: revisionB,
    });

    expect(fixed.currentRevision).toEqual({ ...revisionB, cycle: 1 });
    expect(fixed.currentStepIndex).toBe(0);
    expect(fixed.steps.map(({ status }) => status)).toEqual(["pending", "pending"]);
    expect(fixed.campaignLinks.map(({ campaignRunId }) => campaignRunId)).toEqual([
      "discovery-1",
    ]);
    expect(fixed.fixCheckpointIds).toEqual(["fix-cycle-1"]);
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
  });
});
