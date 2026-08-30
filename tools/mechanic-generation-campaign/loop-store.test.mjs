import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createCampaignLoopStore } from "./lib/loop-store.mjs";
import { createInitialLoopRun } from "./lib/loop-state.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function createFixture() {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "campaign-loop-store-"));
  temporaryDirectories.push(repoRoot);
  const store = createCampaignLoopStore(repoRoot);
  await store.initialize();
  const definition = {
    id: "ticket-17-loop",
    model: "gpt-5.6-luna",
    sequence: [
      {
        id: "discover",
        cohort: "discovery",
        providerModes: { planning: "actual", contract: "actual", source: "actual" },
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
  const revision = { head: "a".repeat(40), revisionKey: "b".repeat(64) };
  const run = createInitialLoopRun({
    definition,
    definitionPath: path.join(repoRoot, ".qa", "loop.json"),
    definitionHash: "c".repeat(64),
    authorizationHash: "d".repeat(64),
    campaign: {
      manifest: { id: "p09-t17-projectile" },
      manifestPath: path.join(repoRoot, "tools", "manifest.json"),
      manifestHash: "e".repeat(64),
    },
    runId: "ticket-17-loop-run",
    createdAt: "2026-08-23T15:00:00.000Z",
    revision,
    controlRoot: repoRoot,
    worktreePath: path.join(repoRoot, ".qa", "worktrees", "ticket-17-loop"),
    branch: "codex/campaign-loop-ticket-17-loop",
    knowledgeManifestDigest: "f".repeat(64),
  });
  return { repoRoot, store, run, revision };
}

describe("campaign loop store", () => {
  it("keeps execution worktrees outside the control checkout package tree", async () => {
    const { repoRoot, store } = await createFixture();
    const worktreeRoot = store.worktreeRoot();

    expect(worktreeRoot).toBe(
      path.join(
        path.dirname(repoRoot),
        ".qa",
        path.basename(repoRoot),
        "mechanic-generation-campaign-worktrees"
      )
    );
    expect(path.relative(repoRoot, worktreeRoot).startsWith("..")).toBe(true);
  });

  it("persists loop state and verified fix checkpoints atomically", async () => {
    const { store, run, revision } = await createFixture();
    await store.writeRun(run);
    await store.writeFix({
      schemaVersion: "campaign-loop-fix/v1",
      id: "fix-cycle-1",
      loopId: run.id,
      triggerCampaignRunId: "campaign-1",
      triggerClassification: "pipeline_failure",
      diagnosis: "A trusted evaluator rejected valid evidence.",
      kind: "durable",
      temporaryFixIds: [],
      changedFiles: ["src/example.ts"],
      verification: [
        { command: "npm test", status: "passed", summary: "Focused suite passed." },
      ],
      beforeRevision: revision,
      afterRevision: { head: "f".repeat(40), revisionKey: "1".repeat(64) },
      commit: "f".repeat(40),
      createdAt: "2026-08-23T16:00:00.000Z",
    });

    expect(await store.readRun(run.id)).toEqual(run);
    expect(await store.readFixes(run.id)).toHaveLength(1);
    expect((await store.listRuns()).map(({ id }) => id)).toEqual([run.id]);
  });

  it("supports concurrent atomic writes to one loop state file", async () => {
    const { store, run } = await createFixture();

    await Promise.all(
      Array.from({ length: 8 }, () => store.writeRun(run))
    );

    expect(await store.readRun(run.id)).toEqual(run);
  });

  it("upserts one sanitized lifecycle summary without control or worktree paths", async () => {
    const { store, run } = await createFixture();
    await store.writeRun({
      ...run,
      status: "blocked",
      completedAt: "2026-08-23T17:00:00.000Z",
      blockedReason: "No safe fix was found.",
    });

    const summary = await store.publish(run.id);
    await store.writeRun({
      ...run,
      status: "concluded",
      completedAt: "2026-08-23T17:00:00.000Z",
      lifecycle: {
        action: "conclude",
        previousStatus: "blocked",
        at: "2026-08-23T17:05:00.000Z",
        worktreeRemoved: true,
        branchRemoved: true,
        targetBranch: "main",
        headBefore: run.currentRevision.head,
        headAfter: run.currentRevision.head,
        mergedFixes: false,
      },
    });
    const updated = await store.publish(run.id);
    const history = await readFile(
      path.join(store.dataRoot, "campaign-loop-history.jsonl"),
      "utf8"
    );
    const records = history.trim().split("\n").map((line) => JSON.parse(line));

    expect(summary.schemaVersion).toBe("campaign-loop-history/v2");
    expect(updated.status).toBe("concluded");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: run.id,
      status: "concluded",
      lifecycle: { action: "conclude" },
    });
    expect(history).not.toContain(run.worktree.controlRoot);
    expect(history).not.toContain(run.worktree.path);
    await expect(store.publish(run.id)).resolves.toEqual(updated);
  });
});
