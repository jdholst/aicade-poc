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
  extendCampaignLoop,
  resumeCampaignLoop,
  runCampaignLoopIsolation,
  startCampaignLoop,
  validateCampaignLoop,
} from "./lib/loop-controller.mjs";
import { createCampaignLoopStore } from "./lib/loop-store.mjs";
import { inspectRevision } from "./lib/revision.mjs";
import { createAttemptSchedule } from "./lib/runner-policy.mjs";
import {
  exhaustLoop,
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
      repeatability: { maxAttempts: 10, minimumSuccesses: 8 },
      variation: { runsPerPrompt: 2, minimumSuccesses: 8, requireEveryPromptSuccess: true },
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
      maxSubmissions: singleStepFix ? 2 : 21,
      maxAuxiliaryIsolationCampaigns: withIsolation ? 1 : 0,
      actualProviderCalls: singleStepFix
        ? {
            planning: withIsolation ? 1 : 2,
            contract: 2,
            source: 2,
          }
        : { planning: 21, contract: 21, source: 21 },
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
