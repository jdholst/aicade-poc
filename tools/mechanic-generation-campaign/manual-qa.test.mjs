import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createCampaignStore } from "./lib/campaign-store.mjs";
import { createCampaignLoopStore } from "./lib/loop-store.mjs";
import {
  createInitialLoopRun,
  finishSequenceCampaign,
  startLoopCampaign,
} from "./lib/loop-state.mjs";
import {
  approveCampaignAttempt,
  createManualQaCandidate,
  denyCampaignAttempt,
} from "./lib/manual-qa.mjs";

function pendingAttempt() {
  return {
    schemaVersion: "campaign-attempt/v1",
    id: "a01-baseline",
    campaignRunId: "campaign-1",
    sequence: 1,
    cohort: "discovery",
    promptId: "baseline",
    prompt: "Create a projectile mechanic.",
    status: "awaiting_manual_qa",
    terminalOutcome: "accepted and externally verified; awaiting manual QA",
    furthestStage: "external_mechanic_probe",
    classification: "awaiting_manual_qa",
    providerModes: { planning: "actual", contract: "actual", source: "actual" },
    providerCalls: { planning: 1, contract: 1, source: 1 },
    fixtureCalls: { planning: 0, contract: 0, source: 0 },
    startedAt: "2026-08-23T15:00:00.000Z",
    completedAt: "2026-08-23T15:01:00.000Z",
    durationMs: 60_000,
    revisionKey: "c".repeat(64),
    pipelinePassed: true,
    externalProbePassed: true,
    automatedOutcome: {
      status: "passed",
      terminalOutcome: "accepted and externally verified",
      recordedAt: "2026-08-23T15:01:00.000Z",
    },
    recordedOutcome: "automated_success",
    artifacts: [],
    temporaryFixIds: [],
  };
}

function pendingRun() {
  return {
    schemaVersion: "campaign-run/v1",
    id: "campaign-1",
    manifestId: "p09-t17-projectile",
    manifestPath: "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
    manifestHash: "a".repeat(64),
    cohort: "discovery",
    status: "running",
    createdAt: "2026-08-23T15:00:00.000Z",
    startedAt: "2026-08-23T15:00:00.000Z",
    model: "gpt-5.6-luna",
    providerModes: { planning: "actual", contract: "actual", source: "actual" },
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
  };
}

async function createPendingStore() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "campaign-manual-qa-"));
  const store = createCampaignStore(repoRoot);
  await store.initialize();
  const candidate = await createManualQaCandidate({
    store,
    run: pendingRun(),
    attempt: pendingAttempt(),
    generationRunRecord: {
      id: "generation-run-1",
      recordVersion: 1,
      status: "succeeded",
      updatedAt: "2026-08-23T15:01:00.000Z",
      generationRun: { id: "generation-run-1", status: "succeeded" },
    },
    gamePackRecord: {
      id: "game-pack-1",
      recordVersion: 1,
      gamePackSchemaVersion: "game-pack/v1",
      updatedAt: "2026-08-23T15:01:00.000Z",
      gamePack: { id: "game-pack-1", updatedAt: "2026-08-23T15:01:00.000Z" },
    },
    requestedAt: "2026-08-23T15:01:00.000Z",
  });
  return { store, ...candidate };
}

describe("manual gameplay QA", () => {
  it("stores exact replay records and pauses the campaign without provider calls", async () => {
    const { store, run, attempt, manualQa } = await createPendingStore();

    expect(run.status).toBe("waiting_for_manual_qa");
    expect(attempt.manualQa).toMatchObject({ status: "pending" });
    expect(manualQa.candidateArtifacts).toEqual([
      expect.objectContaining({ kind: "generation_run", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      expect.objectContaining({ kind: "game_pack", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]);
    expect(await store.readManualQa("campaign-1", "a01-baseline")).toEqual(manualQa);
  });

  it("approves idempotently and resumes the frozen campaign without provider calls", async () => {
    const { store } = await createPendingStore();
    const provider = vi.fn();

    const first = await approveCampaignAttempt({
      store,
      campaignRunId: "campaign-1",
      attemptId: "a01-baseline",
      note: "Projectile starts at the player and cleans up.",
      decidedAt: "2026-08-23T15:05:00.000Z",
    });
    const repeated = await approveCampaignAttempt({
      store,
      campaignRunId: "campaign-1",
      attemptId: "a01-baseline",
      note: "Projectile starts at the player and cleans up.",
      decidedAt: "2026-08-23T15:06:00.000Z",
    });

    expect(first.attempt).toMatchObject({
      status: "success",
      classification: "success",
      adjudicatedOutcome: "manual_qa_approved",
      manualQa: { status: "approved" },
    });
    expect(first.run.status).toBe("running");
    expect(repeated.manualQa.decidedAt).toBe("2026-08-23T15:05:00.000Z");
    expect(provider).not.toHaveBeenCalled();
  });

  it("requires a denial reason, records mechanic failure, and rejects conflicting verdicts", async () => {
    const { store } = await createPendingStore();

    await expect(
      denyCampaignAttempt({
        store,
        campaignRunId: "campaign-1",
        attemptId: "a01-baseline",
        reason: "",
      })
    ).rejects.toThrow(/reason/i);

    const denied = await denyCampaignAttempt({
      store,
      campaignRunId: "campaign-1",
      attemptId: "a01-baseline",
      reason: "Projectile spawns at the arena center.",
      decidedAt: "2026-08-23T15:05:00.000Z",
    });
    expect(denied.attempt).toMatchObject({
      status: "mechanic_incorrect",
      classification: "manual_qa_rejected",
      failure: "Projectile spawns at the arena center.",
      adjudicatedOutcome: "manual_qa_denied",
      manualQa: { status: "denied" },
    });
    expect(denied.run.status).toBe("completed_not_achieved");
    await expect(
      approveCampaignAttempt({
        store,
        campaignRunId: "campaign-1",
        attemptId: "a01-baseline",
      })
    ).rejects.toThrow(/conflicting/i);
  });

  it("rejects a verdict after candidate revision drift", async () => {
    const { store, run } = await createPendingStore();
    await store.writeRun({
      ...run,
      revision: { ...run.revision, revisionKey: "d".repeat(64) },
    });

    await expect(
      approveCampaignAttempt({
        store,
        campaignRunId: "campaign-1",
        attemptId: "a01-baseline",
      })
    ).rejects.toThrow(/stale|frozen candidate/i);
  });

  it("rejects a verdict when an exact replay artifact hash changes", async () => {
    const { store } = await createPendingStore();
    await writeFile(
      path.join(
        store.attemptDirectory("campaign-1", "a01-baseline"),
        "game-pack-storage.json"
      ),
      "{}\n",
      "utf8"
    );

    await expect(
      approveCampaignAttempt({
        store,
        campaignRunId: "campaign-1",
        attemptId: "a01-baseline",
      })
    ).rejects.toThrow(/hash mismatch/i);
  });

  it("updates a linked loop on approval and denial without changing its budgets", async () => {
    const approvedFixture = await createPendingStore();
    const approvedLoopStore = await attachLoop(
      approvedFixture.store,
      approvedFixture.run
    );
    const approvedBefore = await approvedLoopStore.readRun("loop-1");
    const approved = await approveCampaignAttempt({
      store: approvedFixture.store,
      loopStore: approvedLoopStore,
      campaignRunId: "campaign-1",
      attemptId: "a01-baseline",
      decidedAt: "2026-08-23T15:05:00.000Z",
    });

    expect(approved.loopRun.status).toBe("running");
    expect(approved.loopRun.activeCampaign?.campaignRunId).toBe("campaign-1");
    expect(approved.loopRun.usage).toEqual(approvedBefore.usage);

    const deniedFixture = await createPendingStore();
    const deniedLoopStore = await attachLoop(deniedFixture.store, deniedFixture.run);
    const deniedBefore = await deniedLoopStore.readRun("loop-1");
    const denied = await denyCampaignAttempt({
      store: deniedFixture.store,
      loopStore: deniedLoopStore,
      campaignRunId: "campaign-1",
      attemptId: "a01-baseline",
      reason: "Projectile origin is wrong.",
      decidedAt: "2026-08-23T15:05:00.000Z",
    });

    expect(denied.loopRun.status).toBe("waiting_for_fix");
    expect(denied.loopRun.usage).toEqual(deniedBefore.usage);
  });
});

async function attachLoop(store, campaignRun) {
  const repoRoot = path.resolve(store.artifactRoot, "../..");
  const loopStore = createCampaignLoopStore(repoRoot);
  await loopStore.initialize();
  const definition = {
    model: "gpt-5.6-luna",
    sequence: [
      {
        id: "discover",
        cohort: "discovery",
        providerModes: campaignRun.providerModes,
        maxCampaignRunsPerRevision: 1,
        retryableClassifications: [],
      },
    ],
    limits: {
      maxFixCycles: 1,
      maxCampaignRuns: 2,
      maxSubmissions: 2,
      maxAuxiliaryIsolationCampaigns: 0,
      actualProviderCalls: { planning: 2, contract: 2, source: 2 },
    },
  };
  let loop = createInitialLoopRun({
    definition,
    definitionPath: path.join(repoRoot, ".qa", "loop.json"),
    definitionHash: "d".repeat(64),
    authorizationHash: "e".repeat(64),
    campaign: {
      manifest: { id: campaignRun.manifestId },
      manifestPath: path.join(repoRoot, campaignRun.manifestPath),
      manifestHash: campaignRun.manifestHash,
    },
    runId: "loop-1",
    createdAt: campaignRun.createdAt,
    revision: {
      head: campaignRun.revision.head,
      revisionKey: campaignRun.revision.revisionKey,
    },
    controlRoot: repoRoot,
    worktreePath: path.join(repoRoot, ".qa", "worktree"),
    branch: "codex/campaign-loop-loop-1",
  });
  loop = startLoopCampaign(loop, {
    campaignRunId: campaignRun.id,
    role: "sequence",
    stepId: "discover",
  });
  loop = finishSequenceCampaign(loop, definition, {
    campaignRunId: campaignRun.id,
    status: "waiting_for_manual_qa",
    attempts: [],
    pendingManualQa: campaignRun.pendingManualQa,
  });
  await loopStore.writeRun(loop);

  const linkedCampaign = {
    ...campaignRun,
    loopId: loop.id,
    loopStepId: "discover",
    loopCycle: 0,
  };
  await store.writeRun(linkedCampaign);
  return loopStore;
}
