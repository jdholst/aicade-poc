import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createCampaignStore } from "./lib/campaign-store.mjs";
import { createCampaignLoopStore } from "./lib/loop-store.mjs";
import { pauseCampaignLoopForRepair } from "./lib/loop-controller.mjs";
import {
  createInitialLoopRun,
  exhaustLoop,
  finishSequenceCampaign,
  pauseLoopForCampaignRepair,
  startLoopCampaign,
} from "./lib/loop-state.mjs";
import {
  approveCampaignAttempt,
  createManualQaCandidate,
  denyCampaignAttempt,
} from "./lib/manual-qa.mjs";
import { resolveExecutionPolicy } from "./lib/parallel-execution.mjs";

function pendingAttempt({ sequence = 1, cohort = "discovery" } = {}) {
  return {
    schemaVersion: "campaign-attempt/v1",
    id: `a${String(sequence).padStart(2, "0")}-baseline`,
    campaignRunId: "campaign-1",
    sequence,
    cohort,
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

function pendingRun({ cohort = "discovery", attemptIds = [] } = {}) {
  return {
    schemaVersion: "campaign-run/v1",
    id: "campaign-1",
    manifestId: "p09-t17-projectile",
    manifestPath: "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
    manifestHash: "a".repeat(64),
    cohort,
    status: "running",
    createdAt: "2026-08-23T15:00:00.000Z",
    startedAt: "2026-08-23T15:00:00.000Z",
    model: "gpt-5.6-luna",
    providerModes: { planning: "actual", contract: "actual", source: "actual" },
    attemptCeiling: cohort === "variation" ? 11 : cohort === "repeatability" ? 10 : 1,
    attemptIds,
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

function recordedFailure(sequence, cohort = "repeatability") {
  const attempt = pendingAttempt({ sequence, cohort });
  return {
    ...attempt,
    status: "pipeline_failure",
    terminalOutcome: "pipeline failure",
    classification: "pipeline_failure",
    failure: "pipeline failure",
    pipelinePassed: false,
    externalProbePassed: false,
    automatedOutcome: {
      status: "failed",
      terminalOutcome: "pipeline failure",
      recordedAt: attempt.completedAt,
    },
    recordedOutcome: "pipeline_failure",
  };
}

function storageRecord(kind, sequence) {
  const id = `${kind}-${sequence}`;
  return kind === "generation-run"
    ? {
        id,
        recordVersion: 1,
        status: "succeeded",
        updatedAt: "2026-08-23T15:01:00.000Z",
        generationRun: { id, status: "succeeded" },
      }
    : {
        id,
        recordVersion: 1,
        gamePackSchemaVersion: "game-pack/v1",
        updatedAt: "2026-08-23T15:01:00.000Z",
        gamePack: { id, updatedAt: "2026-08-23T15:01:00.000Z" },
      };
}

async function createPendingStore({ cohort = "discovery", priorFailures = 0 } = {}) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "campaign-manual-qa-"));
  const store = createCampaignStore(repoRoot);
  await store.initialize();
  const failures = Array.from({ length: priorFailures }, (_, index) =>
    recordedFailure(index + 1, cohort)
  );
  for (const failure of failures) {
    await store.writeAttempt(failure);
  }
  const sequence = priorFailures + 1;
  const candidate = await createManualQaCandidate({
    store,
    run: pendingRun({ cohort, attemptIds: failures.map(({ id }) => id) }),
    attempt: pendingAttempt({ sequence, cohort }),
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

  it("queues parallel candidates and removes only the decided review", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "campaign-manual-qa-queue-"));
    const store = createCampaignStore(repoRoot);
    await store.initialize();
    const executionPolicy = resolveExecutionPolicy({
      cohort: "repeatability",
      policy: {
        mode: "parallel",
        maxConcurrentAttempts: 3,
        maxPendingManualQa: 3,
      },
    });
    const initialRun = {
      ...pendingRun({ cohort: "repeatability" }),
      schemaVersion: "campaign-run/v2",
      knowledgePolicy: { required: false },
      executionPolicy,
    };

    const first = await createManualQaCandidate({
      store,
      run: initialRun,
      attempt: pendingAttempt({ sequence: 1, cohort: "repeatability" }),
      generationRunRecord: storageRecord("generation-run", 1),
      gamePackRecord: storageRecord("game-pack", 1),
      requestedAt: "2026-08-23T15:01:00.000Z",
    });
    const second = await createManualQaCandidate({
      store,
      run: first.run,
      attempt: pendingAttempt({ sequence: 2, cohort: "repeatability" }),
      generationRunRecord: storageRecord("generation-run", 2),
      gamePackRecord: storageRecord("game-pack", 2),
      requestedAt: "2026-08-23T15:02:00.000Z",
    });

    expect(second.run.status).toBe("running");
    expect(second.run.pendingManualQaQueue.map(({ attemptId }) => attemptId)).toEqual([
      "a01-baseline",
      "a02-baseline",
    ]);
    const loopStore = await attachLoop(store, second.run);

    const approved = await approveCampaignAttempt({
      store,
      loopStore,
      campaignRunId: "campaign-1",
      attemptId: "a01-baseline",
      decidedAt: "2026-08-23T15:05:00.000Z",
    });
    expect(approved.run.status).toBe("waiting_for_manual_qa");
    expect(approved.run.pendingManualQaQueue.map(({ attemptId }) => attemptId)).toEqual([
      "a02-baseline",
    ]);
    expect(approved.run.pendingManualQa.attemptId).toBe("a02-baseline");
    expect(approved.loopRun.status).toBe("waiting_for_manual_qa");
    expect(approved.loopRun.pendingManualQaQueue).toEqual([
      expect.objectContaining({ attemptId: "a02-baseline" }),
    ]);
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

  it("serializes conflicting verdicts so campaign evidence cannot split", async () => {
    const { store } = await createPendingStore();

    const decisions = await Promise.allSettled([
      approveCampaignAttempt({
        store,
        campaignRunId: "campaign-1",
        attemptId: "a01-baseline",
        decidedAt: "2026-08-23T15:05:00.000Z",
      }),
      denyCampaignAttempt({
        store,
        campaignRunId: "campaign-1",
        attemptId: "a01-baseline",
        reason: "Concurrent denial must not overwrite approval.",
        decidedAt: "2026-08-23T15:05:01.000Z",
      }),
    ]);

    expect(decisions.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(decisions.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const [manualQa, attempt, run] = await Promise.all([
      store.readManualQa("campaign-1", "a01-baseline"),
      store.readAttempt("campaign-1", "a01-baseline"),
      store.readRun("campaign-1"),
    ]);
    if (manualQa.status === "approved") {
      expect(attempt).toMatchObject({ status: "success", manualQa: { status: "approved" } });
      expect(run.status).toBe("running");
    } else {
      expect(attempt).toMatchObject({
        status: "mechanic_incorrect",
        manualQa: { status: "denied" },
      });
      expect(run.status).toBe("completed_not_achieved");
    }
  });

  it("keeps the first two repeatability denials in the active campaign and stops on the third", async () => {
    for (const priorFailures of [0, 1]) {
      const fixture = await createPendingStore({
        cohort: "repeatability",
        priorFailures,
      });
      const attemptId = `a${String(priorFailures + 1).padStart(2, "0")}-baseline`;
      const denied = await denyCampaignAttempt({
        store: fixture.store,
        campaignRunId: "campaign-1",
        attemptId,
        reason: `Manual gameplay failure ${priorFailures + 1}.`,
        decidedAt: "2026-08-23T15:05:00.000Z",
      });

      expect(denied.run).toMatchObject({
        status: "running",
        result: {
          failures: priorFailures + 1,
          failureLimit: 3,
          remainingFailureTolerance: 2 - priorFailures,
        },
      });
      expect(denied.run.result).not.toHaveProperty("terminalReason");
      if (priorFailures === 0) {
        const repeated = await denyCampaignAttempt({
          store: fixture.store,
          campaignRunId: "campaign-1",
          attemptId,
          reason: "A later conflicting description must not replace evidence.",
          decidedAt: "2026-08-23T15:06:00.000Z",
        });
        expect(repeated.manualQa.denialReason).toBe("Manual gameplay failure 1.");
        expect(repeated.manualQa.decidedAt).toBe("2026-08-23T15:05:00.000Z");
      }
    }

    const thirdFixture = await createPendingStore({
      cohort: "repeatability",
      priorFailures: 2,
    });
    const third = await denyCampaignAttempt({
      store: thirdFixture.store,
      campaignRunId: "campaign-1",
      attemptId: "a03-baseline",
      reason: "Manual gameplay failure 3.",
      decidedAt: "2026-08-23T15:05:00.000Z",
    });

    expect(third.run).toMatchObject({
      status: "completed_not_achieved",
      result: {
        failures: 3,
        failureLimit: 3,
        remainingFailureTolerance: 0,
        terminalReason: "failure_limit_reached",
      },
    });
  });

  it("keeps a linked repeatability campaign active until its third denial", async () => {
    const continuingFixture = await createPendingStore({ cohort: "repeatability" });
    const continuingLoopStore = await attachLoop(
      continuingFixture.store,
      continuingFixture.run
    );
    const continuingBefore = await continuingLoopStore.readRun("loop-1");
    const continuing = await denyCampaignAttempt({
      store: continuingFixture.store,
      loopStore: continuingLoopStore,
      campaignRunId: "campaign-1",
      attemptId: "a01-baseline",
      reason: "Projectile impact is wrong.",
      decidedAt: "2026-08-23T15:05:00.000Z",
    });

    expect(continuing.loopRun.status).toBe("running");
    expect(continuing.loopRun.activeCampaign?.campaignRunId).toBe("campaign-1");
    expect(continuing.loopRun.campaignLinks[0].status).toBe("running");
    expect(continuing.loopRun.usage).toEqual(continuingBefore.usage);

    const terminalFixture = await createPendingStore({
      cohort: "repeatability",
      priorFailures: 2,
    });
    const terminalLoopStore = await attachLoop(terminalFixture.store, terminalFixture.run);
    const terminal = await denyCampaignAttempt({
      store: terminalFixture.store,
      loopStore: terminalLoopStore,
      campaignRunId: "campaign-1",
      attemptId: "a03-baseline",
      reason: "Projectile impact is wrong for the third time.",
      decidedAt: "2026-08-23T15:05:00.000Z",
    });

    expect(terminal.loopRun.status).toBe("waiting_for_fix");
    expect(terminal.loopRun.activeCampaign).toBeUndefined();
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

  it("accepts an explicit verdict for the preserved candidate while campaign repair is pending", async () => {
    const fixture = await createPendingStore();
    const loopStore = await attachLoop(fixture.store, fixture.run);
    const before = await loopStore.readRun("loop-1");
    await loopStore.writeRun(
      pauseLoopForCampaignRepair(before, {
        id: "campaign-repair-1",
        reason: "The review detector failed.",
        detectedAt: "2026-08-23T15:02:00.000Z",
      })
    );

    const approved = await approveCampaignAttempt({
      store: fixture.store,
      loopStore,
      campaignRunId: "campaign-1",
      attemptId: "a01-baseline",
      note: "The frozen candidate works in manual review.",
      decidedAt: "2026-08-23T15:05:00.000Z",
    });

    expect(approved.attempt.adjudicatedOutcome).toBe("manual_qa_approved");
    expect(approved.loopRun.status).toBe("running");
    expect(approved.loopRun.activeCampaign?.campaignRunId).toBe("campaign-1");
    expect(approved.loopRun.campaignRepairs[0]).toMatchObject({
      status: "completed",
      completedAt: "2026-08-23T15:05:00.000Z",
    });
    expect(approved.loopRun.usage).toEqual(before.usage);
  });

  it("recovers a persisted candidate omitted from a pending campaign repair", async () => {
    const fixture = await createPendingStore();
    const loopStore = await attachLoop(fixture.store, fixture.run);
    const before = await loopStore.readRun("loop-1");
    const interrupted = {
      ...before,
      status: "running",
      pendingManualQa: undefined,
      pendingManualQaQueue: [],
    };
    await loopStore.writeRun(
      pauseLoopForCampaignRepair(interrupted, {
        id: "campaign-repair-1",
        reason: "A parallel attempt timed out after this candidate persisted.",
        detectedAt: "2026-08-23T15:02:00.000Z",
      })
    );

    const approved = await approveCampaignAttempt({
      store: fixture.store,
      loopStore,
      campaignRunId: "campaign-1",
      attemptId: "a01-baseline",
      note: "The retained candidate works.",
      decidedAt: "2026-08-23T15:05:00.000Z",
    });

    expect(approved.manualQa).toMatchObject({
      status: "approved",
      approvalNote: "The retained candidate works.",
    });
    expect(approved.loopRun.status).toBe("running");
    expect(approved.loopRun.campaignRepairs[0]).toMatchObject({
      status: "completed",
      completedAt: "2026-08-23T15:05:00.000Z",
    });
    expect(approved.loopRun.usage).toEqual(before.usage);
  });

  it("adjudicates a legacy review false negative after terminal campaign repair recovery", async () => {
    const fixture = await createPendingStore();
    const loopStore = await attachLoop(fixture.store, fixture.run);
    const pendingLoop = await loopStore.readRun("loop-1");
    const attempt = await fixture.store.readAttempt(
      "campaign-1",
      "a01-baseline"
    );
    const run = await fixture.store.readRun("campaign-1");
    await fixture.store.writeAttempt({
      ...attempt,
      status: "pipeline_failure",
      terminalOutcome: "manual review replay failed runtime validation",
      classification: "runtime_pipeline_failure",
      failure: "The review iframe detector rejected a mounted candidate.",
      adjudicatedOutcome: "review_runtime_failure",
    });
    await fixture.store.writeRun({
      ...run,
      status: "completed_not_achieved",
      completedAt: "2026-08-23T15:03:00.000Z",
      pendingManualQa: undefined,
      result: {
        successes: 0,
        diagnosticSuccesses: 0,
        submissions: 1,
        qualifiesForMechanicProof: false,
        missingSuccessfulPromptIds: [],
      },
    });
    await loopStore.writeRun(
      exhaustLoop(
        {
          ...pendingLoop,
          status: "waiting_for_fix",
          activeCampaign: undefined,
          pendingManualQa: undefined,
          campaignLinks: pendingLoop.campaignLinks.map((link) => ({
            ...link,
            status: "completed_not_achieved",
          })),
        },
        "Manual gameplay QA failed and no fix cycles remain.",
        "2026-08-23T15:03:00.000Z",
        { status: "waiting_for_fix" }
      )
    );

    await pauseCampaignLoopForRepair({
      repoRoot: path.resolve(fixture.store.artifactRoot, "../.."),
      loopId: "loop-1",
      campaignRunId: "campaign-1",
      reason: "The review iframe detector misclassified the frozen candidate.",
      loopStore,
      campaignStore: fixture.store,
      now: () => new Date("2026-08-23T15:04:00.000Z"),
    });
    const approved = await approveCampaignAttempt({
      store: fixture.store,
      loopStore,
      campaignRunId: "campaign-1",
      attemptId: "a01-baseline",
      note: "The exact frozen candidate passed manual gameplay review.",
      decidedAt: "2026-08-23T15:05:00.000Z",
    });

    expect(approved.attempt).toMatchObject({
      status: "success",
      recordedOutcome: "automated_success",
      adjudicatedOutcome: "manual_qa_approved",
      manualQa: { status: "approved" },
    });
    expect(approved.loopRun.status).toBe("running");
    expect(approved.loopRun.usage).toEqual(pendingLoop.usage);
    expect(approved.loopRun.campaignRepairs[0].status).toBe("completed");
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
        id: campaignRun.cohort,
        cohort: campaignRun.cohort,
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
    knowledgeManifestDigest: "f".repeat(64),
  });
  loop = startLoopCampaign(loop, {
    campaignRunId: campaignRun.id,
    role: "sequence",
    stepId: campaignRun.cohort,
  });
  loop = finishSequenceCampaign(loop, definition, {
    campaignRunId: campaignRun.id,
    status: "waiting_for_manual_qa",
    attempts: [],
    pendingManualQa: campaignRun.pendingManualQa,
    pendingManualQaQueue: campaignRun.pendingManualQaQueue,
  });
  await loopStore.writeRun(loop);

  const linkedCampaign = {
    ...campaignRun,
    loopId: loop.id,
    loopStepId: campaignRun.cohort,
    loopCycle: 0,
  };
  await store.writeRun(linkedCampaign);
  return loopStore;
}
