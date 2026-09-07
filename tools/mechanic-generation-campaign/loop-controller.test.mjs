import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { createCampaignStore } from "./lib/campaign-store.mjs";
import {
  CAMPAIGN_KNOWLEDGE_PATH,
  applyKnowledgeReconciliation,
  createCampaignKnowledgeStore,
  createEmptyCampaignKnowledge,
  createKnowledgeContextDigest,
  knowledgeEntriesDigest,
} from "./lib/knowledge.mjs";
import { validateFixKnowledgeCheckpoint } from "./lib/knowledge-checkpoint.mjs";
import {
  createProviderCallBudget,
  extendCampaignLoop,
  isPreProviderConfigurationFailureCapture,
  pauseCampaignLoopForRepair,
  preservePendingManualQaFromCampaign,
  recoverCampaignLoop,
  resumeCampaignLoop,
  runCampaignLoopIsolation,
  startCampaignLoop,
  validateCampaignLoop,
} from "./lib/loop-controller.mjs";
import { createCampaignLoopStore } from "./lib/loop-store.mjs";
import { inspectRevision } from "./lib/revision.mjs";
import { createAttemptSchedule } from "./lib/runner-policy.mjs";
import {
  createInitialLoopRun,
  exhaustLoop,
  invalidateLoop,
  resumeLoopAfterManualQaApproval,
} from "./lib/loop-state.mjs";

const execFileAsync = promisify(execFile);
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("campaign loop controller", () => {
  it("preserves a concurrent candidate when another attempt needs campaign repair", () => {
    const candidate = {
      manualQaId: "manual-qa-a05-baseline",
      campaignRunId: "campaign-1",
      attemptId: "a05-baseline",
    };
    const run = {
      activeCampaign: { campaignRunId: "campaign-1" },
      pendingManualQaQueue: [],
    };

    expect(
      preservePendingManualQaFromCampaign(run, {
        id: "campaign-1",
        pendingManualQaQueue: [candidate],
      })
    ).toMatchObject({
      pendingManualQa: candidate,
      pendingManualQaQueue: [candidate],
    });
  });

  it("requires explicit zero-attempt configuration evidence for exact-zero reconciliation", () => {
    const capture = {
      callId: "attempt-1:planning:1",
      stage: "planning",
      source: "actual",
      responseStatus: 400,
      response: {
        ok: false,
        stage: "configuration",
        attemptCount: 0,
      },
    };

    expect(isPreProviderConfigurationFailureCapture(capture)).toBe(true);
    expect(
      isPreProviderConfigurationFailureCapture({
        ...capture,
        response: { ...capture.response, attemptCount: 1 },
      })
    ).toBe(false);
    expect(
      isPreProviderConfigurationFailureCapture({
        ...capture,
        response: { ...capture.response, providerUsage: {} },
      })
    ).toBe(false);
  });

  it("authorizes parallel provider calls from settled spend only", async () => {
    const pricingPath = path.join(
      import.meta.dirname,
      "pricing/openai-2026-08-29.json"
    );
    const snapshot = JSON.parse(await readFile(pricingPath, "utf8"));
    const definition = {
      id: "provider-budget-wait",
      model: "gpt-5.6-luna",
      sequence: [
        {
          id: "repeat",
          cohort: "repeatability",
          providerModes: {
            planning: "actual",
            contract: "actual",
            source: "actual",
          },
          maxCampaignRunsPerRevision: 1,
          retryableClassifications: ["infrastructure_failure"],
        },
      ],
      limits: {
        maxFixCycles: 1,
        maxCampaignRuns: 1,
        maxSubmissions: 3,
        maxAuxiliaryIsolationCampaigns: 0,
        actualProviderCalls: { planning: 3, contract: 3, source: 3 },
        maxActualProviderCostNanoUsd: 500_000_000,
      },
    };
    const run = {
      ...createInitialLoopRun({
        definition,
        definitionPath: "/repo/loop.json",
        definitionHash: "1".repeat(64),
        authorizationHash: "2".repeat(64),
        campaign: {
          manifest: { id: "provider-budget-wait" },
          manifestPath: "/repo/manifest.json",
          manifestHash: "3".repeat(64),
          pricing: {
            pricingPath,
            pricingHash: "4".repeat(64),
            snapshot,
          },
        },
        runId: "provider-budget-wait-20260830t200000000z",
        createdAt: "2026-08-30T20:00:00.000Z",
        revision: { head: "5".repeat(40), revisionKey: "6".repeat(64) },
        controlRoot: "/repo",
        worktreePath: "/repo/worktree",
        branch: "codex/campaign-loop-provider-budget-wait",
        knowledgeManifestDigest: "7".repeat(64),
      }),
      status: "running",
    };
    const state = { run };
    const loopStore = {
      async updateRun(_loopId, update) {
        return update(state.run);
      },
    };
    const budget = createProviderCallBudget(state, loopStore, { snapshot });

    await expect(
      budget.authorizeBatch({ attemptIds: ["attempt-1", "attempt-2"] })
    ).resolves.toBe(true);

    await expect(
      budget.begin({
        attemptId: "attempt-1",
        callId: "attempt-1:planning:1",
        stage: "planning",
        model: definition.model,
        serviceTier: "default",
        requestedAt: "2026-08-30T20:00:01.000Z",
      })
    ).resolves.toBe(true);

    const sibling = budget.begin({
        attemptId: "attempt-2",
        callId: "attempt-2:planning:1",
        stage: "planning",
        model: definition.model,
        serviceTier: "default",
        requestedAt: "2026-08-30T20:00:02.000Z",
      });
    await expect(
      Promise.race([
        sibling,
        new Promise((resolve) => setTimeout(() => resolve("blocked"), 10)),
      ])
    ).resolves.toBe(true);
    expect(state.run.status).toBe("running");
    expect(state.run.exhaustionReason).toBeUndefined();
    expect(
      state.run.providerCost.pendingReservations.map(
        ({ totalNanoUsd }) => totalNanoUsd
      )
    ).toEqual([0, 0]);

    await budget.settle({
      callId: "attempt-1:planning:1",
      stage: "planning",
      completedAt: "2026-08-30T20:00:03.000Z",
      cost: { quality: "exact", totalNanoUsd: 510_000_000 },
    });
    expect(state.run.status).toBe("exhausted");
    await expect(
      budget.begin({
        attemptId: "attempt-2",
        callId: "attempt-2:contract:1",
        stage: "contract",
        requestedAt: "2026-08-30T20:00:04.000Z",
      })
    ).resolves.toBe(false);
    await expect(
      budget.authorizeBatch({ attemptIds: ["attempt-3"] })
    ).resolves.toBe(false);
    expect(state.run.status).toBe("exhausted");
  });

  it("recovers an exact frozen-definition lookup failure at a derivable fix checkpoint", async () => {
    const fixture = await createRepositoryFixture({ singleStepFix: true });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    const started = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn: async (input) => {
        await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
        return {
          run: { id: input.runId, status: "completed_not_achieved" },
          attempts: [
            { status: "pipeline_failure", classification: "pipeline_failure" },
          ],
        };
      },
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn: async ({ path: worktreePath, branch }) => ({
        path: worktreePath,
        branch,
        head: fixture.head,
        revisionKey: validation.revision.revisionKey,
        dirty: false,
        statusEntries: [],
      }),
      now: () => new Date("2026-08-23T15:00:00.000Z"),
    });
    await loopStore.writeRun(
      invalidateLoop(
        started.run,
        "Frozen loop definition or criteria can no longer be loaded: ENOENT"
      )
    );

    const recovered = await recoverCampaignLoop({
      repoRoot: fixture.repoRoot,
      loopId: started.run.id,
      loopStore,
      environment: process.env,
    });

    expect(recovered.run.status).toBe("waiting_for_fix");
    await expect(
      resumeCampaignLoop({
        repoRoot: fixture.repoRoot,
        loopId: started.run.id,
        loopStore,
        campaignStore,
        inspectWorktreeFn: async ({ path: worktreePath, branch }) => ({
          path: worktreePath,
          branch,
          head: fixture.head,
          revisionKey: validation.revision.revisionKey,
          dirty: false,
          statusEntries: [],
        }),
      })
    ).rejects.toThrow(/requires --fix-report/i);
  });

  it("recovers an exact frozen-definition lookup failure at a running sequence checkpoint", async () => {
    const fixture = await createRepositoryFixture();
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    let campaignCall = 0;
    const started = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn: async (input) => {
        campaignCall += 1;
        await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
        if (campaignCall < 3) {
          return {
            run: { id: input.runId, status: "achieved" },
            attempts: [
              {
                id: "a1",
                status: "success",
                classification: "success",
                manualQa: { status: "approved" },
              },
            ],
          };
        }
        return {
          run: {
            id: input.runId,
            status: "waiting_for_manual_qa",
            pendingManualQa: {
              manualQaId: "manual-qa-a1",
              campaignRunId: input.runId,
              attemptId: "a1",
              promptId: "baseline",
              cohort: "variation",
              revisionKey: validation.revision.revisionKey,
              requestedAt: "2026-08-23T15:01:00.000Z",
              evidencePath: "a1/manual-qa.json",
            },
          },
          attempts: [
            {
              id: "a1",
              status: "awaiting_manual_qa",
              classification: "awaiting_manual_qa",
            },
          ],
        };
      },
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn: async ({ path: worktreePath, branch }) => ({
        path: worktreePath,
        branch,
        head: fixture.head,
        revisionKey: validation.revision.revisionKey,
        dirty: false,
        statusEntries: [],
      }),
      now: () => new Date("2026-08-23T15:00:00.000Z"),
    });
    const campaignRunId = started.run.pendingManualQa.campaignRunId;
    const approved = resumeLoopAfterManualQaApproval(started.run, {
      campaignRunId,
    });
    await loopStore.writeRun(
      invalidateLoop(
        approved,
        "Frozen loop definition or criteria can no longer be loaded: temporary manifest drift"
      )
    );

    const recovered = await recoverCampaignLoop({
      repoRoot: fixture.repoRoot,
      loopId: started.run.id,
      loopStore,
      environment: process.env,
    });

    expect(recovered.run).toMatchObject({
      status: "running",
      currentStepIndex: 2,
      activeCampaign: {
        campaignRunId,
        role: "sequence",
        stepId: "variation",
      },
    });
    expect(recovered.run.steps.map(({ status }) => status)).toEqual([
      "achieved",
      "achieved",
      "running",
    ]);
    expect(recovered.run.completedAt).toBeUndefined();
    expect(recovered.run.invalidReason).toBeUndefined();
  });

  it("previews an additive extension without mutation, then applies its exact hash once", async () => {
    const fixture = await createRepositoryFixture({ singleStepFix: true });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    let providerExecutions = 0;
    const started = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn: async (input) => {
        providerExecutions += 1;
        await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
        return {
          run: { id: input.runId, status: "completed_not_achieved" },
          attempts: [
            { status: "pipeline_failure", classification: "pipeline_failure" },
          ],
        };
      },
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn: async ({ path: worktreePath, branch }) => ({
        path: worktreePath,
        branch,
        head: fixture.head,
        revisionKey: validation.revision.revisionKey,
        dirty: false,
        statusEntries: [],
      }),
      now: () => new Date("2026-08-23T15:00:00.000Z"),
    });
    const exhausted = exhaustLoop(
      started.run,
      "The current step failed and no fix cycles remain.",
      "2026-08-23T15:05:00.000Z",
      { status: "waiting_for_fix" }
    );
    await loopStore.writeRun(exhausted);
    const additions = {
      maxFixCycles: 1,
      maxCampaignRuns: 2,
      maxSubmissions: 2,
      maxAuxiliaryIsolationCampaigns: 0,
      actualProviderCalls: { planning: 2, contract: 2, source: 2 },
    };

    const previewed = await extendCampaignLoop({
      repoRoot: fixture.repoRoot,
      loopId: exhausted.id,
      additions,
      loopStore,
      campaignStore,
    });

    expect(previewed.preview.authorizationHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await loopStore.readRun(exhausted.id)).limits).toEqual(
      exhausted.limits
    );
    expect(providerExecutions).toBe(1);

    await expect(
      extendCampaignLoop({
        repoRoot: fixture.repoRoot,
        loopId: exhausted.id,
        additions,
        authorization: "0".repeat(64),
        loopStore,
        campaignStore,
      })
    ).rejects.toThrow(/authorization does not match/i);
    expect((await loopStore.readRun(exhausted.id)).limits).toEqual(
      exhausted.limits
    );

    const applied = await extendCampaignLoop({
      repoRoot: fixture.repoRoot,
      loopId: exhausted.id,
      additions,
      authorization: previewed.preview.authorizationHash,
      loopStore,
      campaignStore,
      now: () => new Date("2026-08-23T15:10:00.000Z"),
    });

    expect(applied.run.status).toBe("waiting_for_fix");
    expect(applied.run.budgetExtensions).toHaveLength(1);
    expect(applied.run.limits).toEqual(previewed.preview.resultingLimits);
    expect(providerExecutions).toBe(1);
    await expect(
      extendCampaignLoop({
        repoRoot: fixture.repoRoot,
        loopId: exhausted.id,
        additions,
        authorization: previewed.preview.authorizationHash,
        loopStore,
        campaignStore,
      })
    ).rejects.toThrow(/cannot be extended/i);
  });

  it("extends provider capacity and resumes the recorded active campaign", async () => {
    const fixture = await createRepositoryFixture({ singleStepFix: true });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    const campaignCalls = [];
    const runCampaignFn = async (input) => {
      campaignCalls.push({ runId: input.runId, resume: input.resume });
      await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
      if (campaignCalls.length === 1) {
        expect(await input.providerCallBudget.consume("planning")).toBe(true);
        expect(await input.providerCallBudget.consume("planning")).toBe(true);
        expect(await input.providerCallBudget.consume("planning")).toBe(false);
        return {
          run: { id: input.runId, status: "completed_not_achieved" },
          attempts: [],
        };
      }
      for (const stage of ["planning", "contract", "source"]) {
        expect(await input.providerCallBudget.consume(stage)).toBe(true);
      }
      return {
        run: { id: input.runId, status: "achieved" },
        attempts: [
          {
            id: "a1",
            status: "success",
            classification: "success",
            manualQa: { status: "approved" },
          },
        ],
      };
    };
    const inspectWorktreeFn = async ({ path: worktreePath, branch }) => ({
      path: worktreePath,
      branch,
      head: fixture.head,
      revisionKey: validation.revision.revisionKey,
      dirty: false,
      statusEntries: [],
    });
    const started = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn,
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn,
    });
    expect(started.run).toMatchObject({
      status: "exhausted",
      exhaustionResume: {
        status: "running",
        activeCampaign: {
          campaignRunId: campaignCalls[0].runId,
          role: "sequence",
        },
      },
    });

    const additions = {
      maxFixCycles: 0,
      maxCampaignRuns: 0,
      maxSubmissions: 0,
      maxAuxiliaryIsolationCampaigns: 0,
      actualProviderCalls: { planning: 1, contract: 0, source: 0 },
    };
    const previewed = await extendCampaignLoop({
      repoRoot: fixture.repoRoot,
      loopId: started.run.id,
      additions,
      loopStore,
      campaignStore,
    });
    const resumed = await extendCampaignLoop({
      repoRoot: fixture.repoRoot,
      loopId: started.run.id,
      additions,
      authorization: previewed.preview.authorizationHash,
      loopStore,
      campaignStore,
      runCampaignFn,
      inspectWorktreeFn,
    });

    expect(resumed.run.status).toBe("achieved");
    expect(campaignCalls).toHaveLength(2);
    expect(campaignCalls[1]).toEqual({
      runId: campaignCalls[0].runId,
      resume: campaignCalls[0].runId,
    });
  });

  it("pauses on an automated candidate and resumes the same campaign only after approval", async () => {
    const fixture = await createRepositoryFixture({ singleStepFix: true });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    let call = 0;
    const runCampaignFn = async (input) => {
      call += 1;
      if (call === 1) {
        await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
        return {
          run: {
            id: input.runId,
            status: "waiting_for_manual_qa",
            pendingManualQa: {
              manualQaId: "manual-qa-a1",
              campaignRunId: input.runId,
              attemptId: "a1",
              promptId: "baseline",
              cohort: "discovery",
              revisionKey: validation.revision.revisionKey,
              requestedAt: "2026-08-23T15:01:00.000Z",
              evidencePath: "a1/manual-qa.json",
            },
          },
          attempts: [
            {
              id: "a1",
              status: "awaiting_manual_qa",
              classification: "awaiting_manual_qa",
            },
          ],
        };
      }
      return {
        run: { id: input.runId, status: "achieved" },
        attempts: [{ id: "a1", status: "success", classification: "success", manualQa: { status: "approved" } }],
      };
    };
    const inspectWorktreeFn = async ({ path: worktreePath, branch }) => ({
      path: worktreePath,
      branch,
      head: fixture.head,
      revisionKey: validation.revision.revisionKey,
      dirty: false,
      statusEntries: [],
    });
    const started = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn,
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn,
      now: () => new Date("2026-08-23T15:00:00.000Z"),
    });

    expect(started.run.status).toBe("waiting_for_manual_qa");
    expect(started.run.activeCampaign?.campaignRunId).toBe(
      started.run.pendingManualQa.campaignRunId
    );
    await expect(
      resumeCampaignLoop({
        repoRoot: fixture.repoRoot,
        loopId: started.run.id,
        loopStore,
        campaignStore,
        runCampaignFn,
        inspectWorktreeFn,
      })
    ).rejects.toThrow(/approve or deny/i);

    await loopStore.writeRun(
      resumeLoopAfterManualQaApproval(started.run, {
        campaignRunId: started.run.pendingManualQa.campaignRunId,
      })
    );
    const resumed = await resumeCampaignLoop({
      repoRoot: fixture.repoRoot,
      loopId: started.run.id,
      loopStore,
      campaignStore,
      runCampaignFn,
      inspectWorktreeFn,
    });

    expect(resumed.run.status).toBe("achieved");
    expect(resumed.run.usage.submissions).toBe(1);
    expect(resumed.run.usage.campaignRuns).toBe(1);
  });

  it("resumes an out-of-band campaign repair at the preserved manual-QA checkpoint without provider work", async () => {
    const fixture = await createRepositoryFixture({ singleStepFix: true });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    const inspectWorktreeFn = async ({ path: worktreePath, branch }) => ({
      path: worktreePath,
      branch,
      head: fixture.head,
      revisionKey: validation.revision.revisionKey,
      dirty: false,
      statusEntries: [],
    });
    const started = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn: async (input) => {
        await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
        return {
          run: {
            id: input.runId,
            status: "waiting_for_manual_qa",
            pendingManualQa: {
              manualQaId: "manual-qa-a1",
              campaignRunId: input.runId,
              attemptId: "a1",
              promptId: "baseline",
              cohort: "discovery",
              revisionKey: validation.revision.revisionKey,
              requestedAt: "2026-08-23T15:01:00.000Z",
              evidencePath: "a1/manual-qa.json",
            },
          },
          attempts: [
            {
              id: "a1",
              status: "awaiting_manual_qa",
              classification: "awaiting_manual_qa",
            },
          ],
        };
      },
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn,
      now: () => new Date("2026-08-23T15:00:00.000Z"),
    });
    const { run: paused } = await pauseCampaignLoopForRepair({
      repoRoot: fixture.repoRoot,
      loopId: started.run.id,
      loopStore,
      reason: "The manual-review detector failed.",
      now: () => new Date("2026-08-23T15:02:00.000Z"),
    });
    const usageBefore = structuredClone(paused.usage);
    await rm(fixture.definitionPath);

    const resumed = await resumeCampaignLoop({
      repoRoot: fixture.repoRoot,
      loopId: paused.id,
      loopStore,
      campaignStore,
      runCampaignFn: async () => {
        throw new Error("Provider campaign must not run while manual QA is pending.");
      },
      inspectWorktreeFn,
    });

    expect(resumed.run.status).toBe("waiting_for_manual_qa");
    expect(resumed.run.pendingManualQa?.attemptId).toBe("a1");
    expect(resumed.run.usage).toEqual(usageBefore);
    expect(resumed.run.campaignRepairs[0].status).toBe("completed");
  });

  it("hydrates a durable campaign QA queue before assigning repair credit", async () => {
    const pendingManualQa = {
      manualQaId: "manual-qa-a05-baseline",
      campaignRunId: "campaign-1",
      attemptId: "a05-baseline",
      promptId: "baseline",
      cohort: "repeatability",
      revisionKey: "a".repeat(64),
      requestedAt: "2026-08-30T22:00:00.000Z",
      evidencePath: "a05-baseline/manual-qa.json",
    };
    const run = {
      id: "loop-1",
      status: "running",
      currentRevision: { revisionKey: "a".repeat(64) },
      activeCampaign: {
        campaignRunId: "campaign-1",
        role: "sequence",
        stepId: "repeatability",
        budgetCheckpoint: {
          campaignRuns: 0,
          submissions: 0,
          auxiliaryIsolationCampaigns: 0,
          actualProviderCalls: { planning: 0, contract: 0, source: 0 },
        },
      },
      pendingManualQa: undefined,
      pendingManualQaQueue: [],
      usage: {
        fixCycles: 0,
        campaignRuns: 1,
        submissions: 5,
        auxiliaryIsolationCampaigns: 0,
        actualProviderCalls: { planning: 5, contract: 5, source: 9 },
        grossActualProviderCalls: { planning: 5, contract: 5, source: 9 },
      },
      campaignLinks: [
        {
          campaignRunId: "campaign-1",
          role: "sequence",
          stepId: "repeatability",
          status: "running",
        },
      ],
      campaignRepairs: [],
    };
    let writtenRun;
    let campaignRun = {
      id: "campaign-1",
      loopId: "loop-1",
      status: "waiting_for_manual_qa",
      revision: { revisionKey: "a".repeat(64) },
      pendingManualQa,
      pendingManualQaQueue: [pendingManualQa],
    };

    const paused = await pauseCampaignLoopForRepair({
      repoRoot: "/repo",
      loopId: "loop-1",
      reason: "Browser teardown stalled after durable campaign evidence.",
      loopStore: {
        async initialize() {},
        async readRun() {
          return run;
        },
        async writeRun(value) {
          writtenRun = value;
        },
      },
      campaignStore: {
        async initialize() {},
        async readRun() {
          return campaignRun;
        },
        async updateRun(_campaignRunId, update) {
          campaignRun = await update(campaignRun);
          return campaignRun;
        },
      },
      now: () => new Date("2026-08-30T22:01:00.000Z"),
    });

    expect(paused.run).toBe(writtenRun);
    expect(paused.run.status).toBe("waiting_for_campaign_repair");
    expect(paused.run.pendingManualQa).toEqual(pendingManualQa);
    expect(paused.run.usage).toEqual(run.usage);
    expect(paused.run.campaignRepairs[0]).toMatchObject({
      resumeStatus: "waiting_for_manual_qa",
      creditedUsage: {
        campaignRuns: 0,
        submissions: 0,
        actualProviderCalls: { planning: 0, contract: 0, source: 0 },
      },
    });
  });

  it("reconciles a completed active campaign to its persisted manual-QA gate without provider work", async () => {
    const fixture = await createRepositoryFixture({ singleStepFix: true });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    const inspectWorktreeFn = async ({ path: worktreePath, branch }) => ({
      path: worktreePath,
      branch,
      head: fixture.head,
      revisionKey: validation.revision.revisionKey,
      dirty: false,
      statusEntries: [],
    });
    let activeRun;
    const started = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn: async (input) => {
        activeRun = await loopStore.readRun(input.loopContext.loopId);
        return {
          run: {
            id: input.runId,
            status: "waiting_for_manual_qa",
            pendingManualQa: {
              manualQaId: "manual-qa-a1",
              campaignRunId: input.runId,
              attemptId: "a1",
              promptId: "baseline",
              cohort: "discovery",
              revisionKey: validation.revision.revisionKey,
              requestedAt: "2026-08-30T21:00:00.000Z",
              evidencePath: "a1/manual-qa.json",
            },
          },
          attempts: [{ id: "a1", status: "awaiting_manual_qa" }],
        };
      },
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn,
      now: () => new Date("2026-08-30T20:59:00.000Z"),
    });
    expect(started.run.status).toBe("waiting_for_manual_qa");
    await loopStore.writeRun(activeRun);
    const candidate = started.run.pendingManualQa;
    const resumed = await resumeCampaignLoop({
      repoRoot: fixture.repoRoot,
      loopId: activeRun.id,
      loopStore,
      campaignStore: {
        async initialize() {},
        async readRun(campaignRunId) {
          return {
            id: campaignRunId,
            loopId: activeRun.id,
            loopStepId: activeRun.activeCampaign.stepId,
            status: "waiting_for_manual_qa",
            revision: {
              revisionKey: activeRun.currentRevision.revisionKey,
            },
            pendingManualQa: candidate,
            pendingManualQaQueue: [candidate],
          };
        },
        async readAttempts() {
          return [{ id: "a1", status: "awaiting_manual_qa" }];
        },
      },
      runCampaignFn: async () => {
        throw new Error("Provider campaign must not replay after durable completion.");
      },
      inspectWorktreeFn,
    });

    expect(resumed.run.status).toBe("waiting_for_manual_qa");
    expect(resumed.run.pendingManualQaQueue).toEqual([candidate]);
    expect(resumed.run.usage).toEqual(activeRun.usage);
  });

  it("classifies a thrown campaign-runner defect as out-of-band repair instead of a Sparkline fix", async () => {
    const fixture = await createRepositoryFixture({ singleStepFix: true });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });

    await expect(
      startCampaignLoop({
        repoRoot: fixture.repoRoot,
        definitionPath: fixture.definitionPath,
        authorization: validation.definitionHash,
        loopStore,
        campaignStore,
        runCampaignFn: async (input) => {
          await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
          expect(await input.providerCallBudget.consume("planning")).toBe(true);
          throw new Error("campaign browser adapter crashed");
        },
        prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
          path: controlRoot,
          branch: `codex/campaign-loop-${loopId}`,
        }),
        inspectWorktreeFn: async ({ path: worktreePath, branch }) => ({
          path: worktreePath,
          branch,
          head: fixture.head,
          revisionKey: validation.revision.revisionKey,
          dirty: false,
          statusEntries: [],
        }),
        now: () => new Date("2026-08-23T15:00:00.000Z"),
      })
    ).rejects.toThrow(/browser adapter crashed/i);

    const [paused] = await loopStore.listRuns();
    expect(paused.status).toBe("waiting_for_campaign_repair");
    expect(paused.activeCampaign?.role).toBe("sequence");
    expect(paused.currentRevision.cycle).toBe(0);
    expect(paused.usage).toMatchObject({
      fixCycles: 0,
      campaignRuns: 0,
      submissions: 0,
      actualProviderCalls: { planning: 0, contract: 0, source: 0 },
      grossActualProviderCalls: { planning: 1, contract: 0, source: 0 },
    });
    expect(paused.campaignRepairs[0]).toMatchObject({
      id: "campaign-repair-1",
      reason: "campaign browser adapter crashed",
      resumeStatus: "running",
      status: "pending",
      creditedUsage: {
        campaignRuns: 1,
        submissions: 1,
        auxiliaryIsolationCampaigns: 0,
        actualProviderCalls: { planning: 1, contract: 0, source: 0 },
      },
    });

    const originalCampaignRunId = paused.activeCampaign.campaignRunId;
    let replacementInput;
    const resumed = await resumeCampaignLoop({
      repoRoot: fixture.repoRoot,
      loopId: paused.id,
      loopStore,
      campaignStore,
      runCampaignFn: async (input) => {
        replacementInput = input;
        await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
        return {
          run: { id: input.runId, status: "completed_not_achieved" },
          attempts: [
            { status: "pipeline_failure", classification: "pipeline_failure" },
          ],
        };
      },
      inspectWorktreeFn: async ({ path: worktreePath, branch }) => ({
        path: worktreePath,
        branch,
        head: fixture.head,
        revisionKey: validation.revision.revisionKey,
        dirty: false,
        statusEntries: [],
      }),
    });

    expect(replacementInput.runId).not.toBe(originalCampaignRunId);
    expect(replacementInput.resume).toBeUndefined();
    expect(resumed.run.status).toBe("waiting_for_fix");
    expect(resumed.run.usage.campaignRuns).toBe(1);
    expect(resumed.run.campaignLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campaignRunId: originalCampaignRunId,
          status: "campaign_repair_replaced",
        }),
      ])
    );
  });

  it("recovers a completed failed campaign for an out-of-band campaign repair", async () => {
    const fixture = await createRepositoryFixture({ singleStepFix: true });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    const started = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn: async (input) => {
        await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
        for (const stage of ["planning", "contract", "source"]) {
          expect(await input.providerCallBudget.consume(stage)).toBe(true);
        }
        return {
          run: { id: input.runId, status: "completed_not_achieved" },
          attempts: [
            {
              id: "a1",
              promptId: "baseline",
              status: "pipeline_failure",
              classification: "pipeline_failure",
              providerCalls: { planning: 1, contract: 1, source: 1 },
            },
          ],
        };
      },
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn: async ({ path: worktreePath, branch }) => ({
        path: worktreePath,
        branch,
        head: fixture.head,
        revisionKey: validation.revision.revisionKey,
        dirty: false,
        statusEntries: [],
      }),
    });
    expect(started.run.status).toBe("waiting_for_fix");
    const campaignRunId = started.run.campaignLinks[0].campaignRunId;

    const { run: paused } = await pauseCampaignLoopForRepair({
      repoRoot: fixture.repoRoot,
      loopId: started.run.id,
      campaignRunId,
      reason: "Parallel browser scheduling invalidated the campaign.",
      loopStore,
      campaignStore: {
        async initialize() {},
        async readRun() {
          return {
            id: campaignRunId,
            loopId: started.run.id,
            cohort: "discovery",
            status: "completed_not_achieved",
            revision: {
              head: fixture.head,
              revisionKey: validation.revision.revisionKey,
            },
          };
        },
        async readAttempts() {
          return [
            {
              id: "a1",
              promptId: "baseline",
              revisionKey: validation.revision.revisionKey,
              providerCalls: { planning: 1, contract: 1, source: 1 },
            },
          ];
        },
      },
      now: () => new Date("2026-08-23T15:04:00.000Z"),
    });

    expect(paused.status).toBe("waiting_for_campaign_repair");
    expect(paused.activeCampaign).toMatchObject({
      campaignRunId,
      role: "sequence",
      stepId: "discovery",
    });
    expect(paused.usage).toMatchObject({
      campaignRuns: 0,
      submissions: 0,
      actualProviderCalls: { planning: 0, contract: 0, source: 0 },
      grossActualProviderCalls: { planning: 1, contract: 1, source: 1 },
    });
    expect(paused.campaignRepairs[0]).toMatchObject({
      campaignRunId,
      resumeStatus: "running",
      status: "pending",
      creditedUsage: {
        campaignRuns: 1,
        submissions: 1,
        auxiliaryIsolationCampaigns: 0,
        actualProviderCalls: { planning: 1, contract: 1, source: 1 },
      },
    });
  });

  it("recovers a legacy repaired infrastructure campaign misclassified as waiting_for_fix", async () => {
    const fixture = await createRepositoryFixture({ singleStepFix: true });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    const inspectWorktreeFn = async ({ path: worktreePath, branch }) => ({
      path: worktreePath,
      branch,
      head: fixture.head,
      revisionKey: validation.revision.revisionKey,
      dirty: false,
      statusEntries: [],
    });

    await expect(
      startCampaignLoop({
        repoRoot: fixture.repoRoot,
        definitionPath: fixture.definitionPath,
        authorization: validation.definitionHash,
        loopStore,
        campaignStore,
        runCampaignFn: async (input) => {
          await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
          throw new Error("campaign browser adapter crashed");
        },
        prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
          path: controlRoot,
          branch: `codex/campaign-loop-${loopId}`,
        }),
        inspectWorktreeFn,
        now: () => new Date("2026-08-23T15:00:00.000Z"),
      })
    ).rejects.toThrow(/browser adapter crashed/i);

    const [paused] = await loopStore.listRuns();
    const originalCampaignRunId = paused.activeCampaign.campaignRunId;
    await loopStore.writeRun({
      ...paused,
      status: "waiting_for_fix",
      activeCampaign: undefined,
      usage: {
        ...paused.usage,
        campaignRuns: paused.usage.campaignRuns + 1,
      },
      campaignLinks: paused.campaignLinks.map((link) => ({
        ...link,
        status: "completed_not_achieved",
      })),
      campaignRepairs: paused.campaignRepairs.map((repair) => ({
        ...repair,
        status: "completed",
        completedAt: "2026-08-23T15:03:00.000Z",
      })),
    });

    let replacementInput;
    const resumed = await resumeCampaignLoop({
      repoRoot: fixture.repoRoot,
      loopId: paused.id,
      loopStore,
      campaignStore: {
        ...campaignStore,
        async readAttempts(campaignRunId) {
          return campaignRunId === originalCampaignRunId
            ? [{ status: "failure", classification: "infrastructure_failure" }]
            : campaignStore.readAttempts(campaignRunId);
        },
      },
      runCampaignFn: async (input) => {
        replacementInput = input;
        await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
        return {
          run: { id: input.runId, status: "completed_not_achieved" },
          attempts: [
            { status: "pipeline_failure", classification: "pipeline_failure" },
          ],
        };
      },
      inspectWorktreeFn,
    });

    expect(replacementInput.runId).not.toBe(originalCampaignRunId);
    expect(replacementInput.resume).toBeUndefined();
    expect(resumed.run.status).toBe("waiting_for_fix");
    expect(resumed.run.usage.campaignRuns).toBe(1);
    expect(resumed.run.campaignLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campaignRunId: originalCampaignRunId,
          status: "campaign_repair_replaced",
        }),
      ])
    );
  });

  it("recovers a terminal loop around the exact still-pending candidate without extending budgets", async () => {
    const fixture = await createRepositoryFixture({ singleStepFix: true });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    const started = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn: async (input) => ({
        run: {
          id: input.runId,
          status: "waiting_for_manual_qa",
          pendingManualQa: {
            manualQaId: "manual-qa-a1",
            campaignRunId: input.runId,
            attemptId: "a1",
            promptId: "baseline",
            cohort: "discovery",
            revisionKey: validation.revision.revisionKey,
            requestedAt: "2026-08-23T15:01:00.000Z",
            evidencePath: "a1/manual-qa.json",
          },
        },
        attempts: [
          {
            id: "a1",
            status: "awaiting_manual_qa",
            classification: "awaiting_manual_qa",
          },
        ],
      }),
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn: async ({ path: worktreePath, branch }) => ({
        path: worktreePath,
        branch,
        head: fixture.head,
        revisionKey: validation.revision.revisionKey,
        dirty: false,
        statusEntries: [],
      }),
      now: () => new Date("2026-08-23T15:00:00.000Z"),
    });
    const campaignRunId = started.run.pendingManualQa.campaignRunId;
    const usageBefore = structuredClone(started.run.usage);
    const stale = exhaustLoop(
      {
        ...started.run,
        status: "waiting_for_fix",
        activeCampaign: undefined,
        pendingManualQa: undefined,
        campaignLinks: started.run.campaignLinks.map((link) => ({
          ...link,
          status: "completed_not_achieved",
        })),
      },
      "Manual gameplay QA failed and no fix cycles remain.",
      "2026-08-23T15:03:00.000Z",
      { status: "waiting_for_fix" }
    );
    stale.invalidReason = "The frozen loop definition could not be reloaded.";
    await loopStore.writeRun(stale);
    const recoveryCampaignStore = {
      async readRun() {
        return {
          id: campaignRunId,
          loopId: started.run.id,
          loopStepId: "discovery",
          cohort: "discovery",
          revision: {
            head: fixture.head,
            revisionKey: validation.revision.revisionKey,
          },
        };
      },
      async readAttempts() {
        return [
          {
            id: "a1",
            promptId: "baseline",
            revisionKey: validation.revision.revisionKey,
            manualQa: {
              id: "manual-qa-a1",
              path: "a1/manual-qa.json",
              status: "pending",
            },
          },
        ];
      },
      async readManualQa() {
        return {
          id: "manual-qa-a1",
          status: "pending",
          requestedAt: "2026-08-23T15:01:00.000Z",
        };
      },
    };

    const { run: recovered } = await pauseCampaignLoopForRepair({
      repoRoot: fixture.repoRoot,
      loopId: started.run.id,
      campaignRunId,
      reason: "The review iframe detector misclassified the frozen candidate.",
      loopStore,
      campaignStore: recoveryCampaignStore,
      now: () => new Date("2026-08-23T15:04:00.000Z"),
    });

    expect(recovered.status).toBe("waiting_for_campaign_repair");
    expect(recovered.activeCampaign?.campaignRunId).toBe(campaignRunId);
    expect(recovered.pendingManualQa?.attemptId).toBe("a1");
    expect(recovered.usage).toEqual(usageBefore);
    expect(recovered.exhaustionReason).toBeUndefined();
    expect(recovered.exhaustionResume).toBeUndefined();
    expect(recovered.campaignRepairs[0]).toMatchObject({
      campaignRunId,
      resumeStatus: "waiting_for_manual_qa",
      status: "pending",
      priorTerminal: {
        status: "exhausted",
        reason: "Manual gameplay QA failed and no fix cycles remain.",
        exhaustionReason: "Manual gameplay QA failed and no fix cycles remain.",
        invalidReason: "The frozen loop definition could not be reloaded.",
      },
    });
  });

  it("proves one mechanic through discovery, repeatability, and variation on one revision", async () => {
    const fixture = await createRepositoryFixture();
    let campaignNumber = 0;
    const runCampaignFn = async (input) => {
      campaignNumber += 1;
      const prompts = JSON.parse(await readFile(input.manifestPath, "utf8")).prompts;
      const schedule = createAttemptSchedule(input.cohort, prompts);
      const attempts = [];
      for (const scheduled of schedule) {
        await input.onSubmission({
          campaignRunId: input.runId,
          attemptId: `a${scheduled.sequence}`,
        });
        for (const stage of ["planning", "contract", "source"]) {
          if (input.providerModes[stage] === "actual") {
            expect(await input.providerCallBudget.consume(stage)).toBe(true);
          }
        }
        attempts.push({
          id: `a${scheduled.sequence}`,
          status: "success",
          classification: "success",
          manualQa: { status: "approved" },
        });
      }
      return {
        run: { id: input.runId, status: "achieved" },
        attempts,
      };
    };
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });

    const result = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn,
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn: async ({ path: worktreePath, branch }) => ({
        path: worktreePath,
        branch,
        head: fixture.head,
        revisionKey: validation.revision.revisionKey,
        dirty: false,
        statusEntries: [],
      }),
      now: () => new Date("2026-08-23T15:00:00.000Z"),
    });

    expect(campaignNumber).toBe(3);
    expect(result.run).toMatchObject({
      status: "achieved",
      currentStepIndex: 3,
      usage: {
        campaignRuns: 3,
        submissions: 21,
        actualProviderCalls: { planning: 21, contract: 21, source: 21 },
      },
      result: {
        sequenceAchieved: true,
        mechanicProven: true,
      },
    });
    expect((await loopStore.readRun(result.run.id)).status).toBe("achieved");
  });

  it("accepts a verified fix commit and restarts proof without dropping prior campaigns", async () => {
    const fixture = await createRepositoryFixture({ singleStepFix: true });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    let campaignNumber = 0;
    const runCampaignFn = async (input) => {
      campaignNumber += 1;
      await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
      for (const stage of ["planning", "contract", "source"]) {
        expect(await input.providerCallBudget.consume(stage)).toBe(true);
      }
      const succeeded = campaignNumber === 2;
      return {
        run: {
          id: input.runId,
          status: succeeded ? "achieved" : "completed_not_achieved",
        },
        attempts: [
          {
            id: "a1",
            status: succeeded ? "success" : "pipeline_failure",
            classification: succeeded ? "success" : "pipeline_failure",
            ...(succeeded ? { manualQa: { status: "approved" } } : {}),
          },
        ],
      };
    };
    const inspectWorktreeFn = async ({ path: worktreePath, branch }) => ({
      ...(await inspectRevision(worktreePath)),
      path: worktreePath,
      branch,
    });
    const started = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn,
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn,
      now: () => new Date("2026-08-23T15:00:00.000Z"),
    });
    expect(started.run.status).toBe("waiting_for_fix");

    const knowledgeStore = createCampaignKnowledgeStore(fixture.repoRoot);
    const beforeKnowledge = await knowledgeStore.read();
    const knowledgeContext = {
      applicableFindingIds: [],
      evidence: [{ id: "failure-campaign/a1" }],
    };
    knowledgeContext.contextDigest = createKnowledgeContextDigest(knowledgeContext);
    await knowledgeStore.write(
      applyKnowledgeReconciliation(
        beforeKnowledge,
        {
          schemaVersion: "campaign-knowledge-reconciliation/v1",
          id: "KR-fix-cycle-1",
          source: {
            kind: "fix_cycle",
            loopId: started.run.id,
            fixId: "fix-cycle-1",
            triggerCampaignRunId: started.run.campaignLinks[0].campaignRunId,
          },
          consultedManifestDigest: knowledgeEntriesDigest(beforeKnowledge),
          contextDigest: knowledgeContext.contextDigest,
          consultedFindingIds: [],
          evidenceReview: [
            {
              evidenceId: "failure-campaign/a1",
              disposition: "not_reusable",
              findingIds: [],
              rationale: "The synthetic controller failure has no reusable diagnosis.",
            },
          ],
          operations: [],
          noChangeReason: "The synthetic controller failure adds no reusable guidance.",
          createdAt: "2026-08-23T15:55:00.000Z",
        },
        knowledgeContext
      )
    );

    await writeFile(
      path.join(fixture.repoRoot, "src", "pipeline.txt"),
      "verified pipeline fix\n",
      "utf8"
    );
    await git(fixture.repoRoot, [
      "add",
      "src/pipeline.txt",
      CAMPAIGN_KNOWLEDGE_PATH,
    ]);
    await git(fixture.repoRoot, ["commit", "-m", "Fix pipeline"]);
    const afterRevision = await inspectRevision(fixture.repoRoot);
    const fixReportPath = path.join(fixture.repoRoot, ".qa", "fix-cycle-1.json");
    await writeFile(
      fixReportPath,
      `${JSON.stringify({
        schemaVersion: "campaign-loop-fix/v1",
        id: "fix-cycle-1",
        loopId: started.run.id,
        triggerCampaignRunId: started.run.campaignLinks[0].campaignRunId,
        triggerClassification: "pipeline_failure",
        diagnosis: "The pipeline rejected a mechanic-general valid result.",
        kind: "durable",
        temporaryFixIds: [],
        changedFiles: ["src/pipeline.txt", CAMPAIGN_KNOWLEDGE_PATH],
        verification: [
          {
            command: "npm test",
            status: "passed",
            summary: "Focused and full tests passed.",
          },
        ],
        beforeRevision: {
          head: started.run.currentRevision.head,
          revisionKey: started.run.currentRevision.revisionKey,
        },
        afterRevision: {
          head: afterRevision.head,
          revisionKey: afterRevision.revisionKey,
        },
        commit: afterRevision.head,
        createdAt: "2026-08-23T16:00:00.000Z",
      }, null, 2)}\n`,
      "utf8"
    );

    const resumed = await resumeCampaignLoop({
      repoRoot: fixture.repoRoot,
      loopId: started.run.id,
      fixReportPath,
      loopStore,
      campaignStore,
      runCampaignFn,
      inspectWorktreeFn,
      validateKnowledgeCheckpointFn: (input) =>
        validateFixKnowledgeCheckpoint({
          ...input,
          buildContextFn: async () => knowledgeContext,
        }),
    });

    expect(resumed.run.status).toBe("achieved");
    expect(resumed.run.result.mechanicProven).toBe(false);
    expect(resumed.run.currentRevision.cycle).toBe(1);
    expect(resumed.run.usage).toMatchObject({
      fixCycles: 1,
      campaignRuns: 2,
      submissions: 2,
    });
    expect(resumed.run.campaignLinks).toHaveLength(2);
    expect(await loopStore.readFixes(started.run.id)).toHaveLength(1);
    expect(resumed.run.knowledgeReconciliationIds).toEqual([
      "KR-fix-cycle-1",
    ]);
  });

  it("runs a bounded fixture-backed isolation without advancing proof", async () => {
    const fixture = await createRepositoryFixture({
      singleStepFix: true,
      withIsolation: true,
    });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    let campaignNumber = 0;
    const runCampaignFn = async (input) => {
      campaignNumber += 1;
      await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
      for (const stage of ["planning", "contract", "source"]) {
        if (input.providerModes[stage] === "actual") {
          expect(await input.providerCallBudget.consume(stage)).toBe(true);
        }
      }
      const isolation = input.cohort === "isolation";
      return {
        run: {
          id: input.runId,
          status: isolation ? "achieved" : "completed_not_achieved",
        },
        attempts: [
          {
            id: "a1",
            status: isolation ? "success" : "pipeline_failure",
            classification: isolation ? "success" : "pipeline_failure",
          },
        ],
      };
    };
    const inspectWorktreeFn = async ({ path: worktreePath, branch }) => ({
      ...(await inspectRevision(worktreePath)),
      path: worktreePath,
      branch,
    });
    const started = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn,
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn,
    });

    const isolated = await runCampaignLoopIsolation({
      repoRoot: fixture.repoRoot,
      loopId: started.run.id,
      profileId: "planning-fixture",
      loopStore,
      campaignStore,
      runCampaignFn,
      inspectWorktreeFn,
    });

    expect(campaignNumber).toBe(2);
    expect(isolated.run.status).toBe("waiting_for_fix");
    expect(isolated.run.currentStepIndex).toBe(0);
    expect(isolated.run.steps[0].status).toBe("running");
    expect(isolated.run.usage.auxiliaryIsolationCampaigns).toBe(1);
    expect(isolated.run.campaignLinks.at(-1)).toMatchObject({
      role: "isolation",
      profileId: "planning-fixture",
      status: "achieved",
    });
    await expect(
      runCampaignLoopIsolation({
        repoRoot: fixture.repoRoot,
        loopId: started.run.id,
        profileId: "planning-fixture",
        loopStore,
        campaignStore,
        runCampaignFn,
        inspectWorktreeFn,
      })
    ).rejects.toThrow(/isolation.*ceiling/i);
  });

  it("credits an isolation campaign back when the campaign runner throws", async () => {
    const fixture = await createRepositoryFixture({
      singleStepFix: true,
      withIsolation: true,
    });
    const loopStore = createCampaignLoopStore(fixture.repoRoot);
    const campaignStore = createCampaignStore(fixture.repoRoot);
    const validation = await validateCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
    });
    const inspectWorktreeFn = async ({ path: worktreePath, branch }) => ({
      path: worktreePath,
      branch,
      head: fixture.head,
      revisionKey: validation.revision.revisionKey,
      dirty: false,
      statusEntries: [],
    });
    const started = await startCampaignLoop({
      repoRoot: fixture.repoRoot,
      definitionPath: fixture.definitionPath,
      authorization: validation.definitionHash,
      loopStore,
      campaignStore,
      runCampaignFn: async (input) => {
        await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
        for (const stage of ["planning", "contract", "source"]) {
          expect(await input.providerCallBudget.consume(stage)).toBe(true);
        }
        return {
          run: { id: input.runId, status: "completed_not_achieved" },
          attempts: [{ status: "pipeline_failure", classification: "pipeline_failure" }],
        };
      },
      prepareWorktreeFn: async ({ controlRoot, loopId }) => ({
        path: controlRoot,
        branch: `codex/campaign-loop-${loopId}`,
      }),
      inspectWorktreeFn,
    });

    await expect(
      runCampaignLoopIsolation({
        repoRoot: fixture.repoRoot,
        loopId: started.run.id,
        profileId: "planning-fixture",
        loopStore,
        campaignStore,
        runCampaignFn: async (input) => {
          await input.onSubmission({ campaignRunId: input.runId, attemptId: "a1" });
          expect(await input.providerCallBudget.consume("contract")).toBe(true);
          throw new Error("isolation browser adapter crashed");
        },
        inspectWorktreeFn,
      })
    ).rejects.toThrow(/isolation browser adapter crashed/i);

    const paused = await loopStore.readRun(started.run.id);
    expect(paused.status).toBe("waiting_for_campaign_repair");
    expect(paused.usage).toMatchObject({
      campaignRuns: 1,
      submissions: 1,
      auxiliaryIsolationCampaigns: 0,
      actualProviderCalls: { planning: 1, contract: 1, source: 1 },
      grossActualProviderCalls: { planning: 1, contract: 2, source: 1 },
    });
    expect(paused.campaignRepairs[0].creditedUsage).toMatchObject({
      campaignRuns: 1,
      submissions: 1,
      auxiliaryIsolationCampaigns: 1,
      actualProviderCalls: { planning: 0, contract: 1, source: 0 },
    });
  });
});

async function createRepositoryFixture({
  singleStepFix = false,
  withIsolation = false,
} = {}) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "campaign-loop-controller-"));
  temporaryDirectories.push(repoRoot);
  await git(repoRoot, ["init", "-b", "master"]);
  await git(repoRoot, ["config", "user.email", "campaign@example.test"]);
  await git(repoRoot, ["config", "user.name", "Campaign Test"]);
  await writeFile(path.join(repoRoot, ".gitignore"), ".qa\nnode_modules\n", "utf8");
  await mkdir(path.join(repoRoot, "src"), { recursive: true });
  await writeFile(path.join(repoRoot, "src", "pipeline.txt"), "original\n", "utf8");
  const knowledgePath = path.join(repoRoot, CAMPAIGN_KNOWLEDGE_PATH);
  await mkdir(path.dirname(knowledgePath), { recursive: true });
  await writeFile(
    knowledgePath,
    `${JSON.stringify(createEmptyCampaignKnowledge("2026-08-23T14:00:00.000Z"), null, 2)}\n`,
    "utf8"
  );
  const harnessRoot = path.join(repoRoot, "tools", "harness");
  const manifestDirectory = path.join(harnessRoot, "manifests");
  await mkdir(manifestDirectory, { recursive: true });
  const probePath = path.join(harnessRoot, "probe.mjs");
  await writeFile(probePath, "export async function runProbe() { return { passed: true }; }\n", "utf8");
  const planningFixtureContents = `${JSON.stringify({
    ok: true,
    spec: {},
    routing: {},
  })}\n`;
  if (withIsolation) {
    const fixtureDirectory = path.join(harnessRoot, "fixtures");
    await mkdir(fixtureDirectory, { recursive: true });
    await writeFile(
      path.join(fixtureDirectory, "planning.json"),
      planningFixtureContents,
      "utf8"
    );
  }
  const requirementIds = ["observable_behavior"];
  const promptIds = [
    "baseline",
    "plain_paraphrase",
    "constraints_first",
    "outcomes_first",
    "compact",
  ];
  const manifest = {
    schemaVersion: "campaign-manifest/v1",
    id: "test-projectile",
    mechanic: {
      id: "test_projectile",
      name: "Test projectile",
      ticket: "Ticket 17",
      ticketUrl: "https://www.notion.so/example",
      requirementIds,
    },
    model: "gpt-5.6-luna",
    credential: { source: "server_env" },
    prompts: promptIds.map((id) => ({ id, text: id, requirementIds })),
    providerModes: { planning: "actual", contract: "actual", source: "actual" },
    fixtures: withIsolation
      ? {
          planning: {
            path: "../fixtures/planning.json",
            sha256: sha256(planningFixtureContents),
          },
        }
      : {},
    probe: "../probe.mjs",
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
  const manifestPath = path.join(manifestDirectory, "test-projectile.json");
  const manifestContents = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, manifestContents, "utf8");
  await git(repoRoot, ["add", ".gitignore", "src", "tools"]);
  await git(repoRoot, ["commit", "-m", "fixture"]);
  const { stdout } = await git(repoRoot, ["rev-parse", "HEAD"]);
  const head = stdout.trim();
  const definitionPath = path.join(repoRoot, ".qa", "ticket-17-loop.json");
  await mkdir(path.dirname(definitionPath), { recursive: true });
  const definition = {
    schemaVersion: "campaign-loop-manifest/v1",
    id: "ticket-17-loop",
    manifest: {
      path: path.relative(repoRoot, manifestPath),
      sha256: sha256(manifestContents),
      probeSha256: sha256(await readFile(probePath)),
    },
    model: manifest.model,
    sequence: (singleStepFix
      ? ["discovery"]
      : ["discovery", "repeatability", "variation"]
    ).map((cohort) => ({
      id: cohort,
      cohort,
      providerModes: manifest.providerModes,
      maxCampaignRunsPerRevision: 1,
      retryableClassifications: [],
    })),
    isolationProfiles: withIsolation
      ? [
          {
            id: "planning-fixture",
            providerModes: {
              planning: "fixture",
              contract: "actual",
              source: "actual",
            },
            maxCampaignRuns: 1,
          },
        ]
      : [],
    limits: {
      maxFixCycles: singleStepFix ? 1 : 0,
      maxCampaignRuns: singleStepFix ? 2 : 3,
      maxSubmissions: singleStepFix ? 2 : 22,
      maxAuxiliaryIsolationCampaigns: withIsolation ? 1 : 0,
      actualProviderCalls: singleStepFix
        ? {
            planning: withIsolation ? 1 : 2,
            contract: 2,
            source: 2,
          }
        : { planning: 22, contract: 22, source: 22 },
    },
  };
  await writeFile(definitionPath, `${JSON.stringify(definition, null, 2)}\n`, "utf8");
  return { repoRoot, definitionPath, head };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(cwd, args) {
  return execFileAsync("git", args, { cwd, encoding: "utf8" });
}
