import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createCampaignStore } from "./lib/campaign-store.mjs";

describe("campaign run persistence", () => {
  it("serializes concurrent state updates without losing revisions", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "campaign-store-lock-"));
    const store = createCampaignStore(repoRoot);
    await store.initialize();
    await store.writeRun(baseRun());

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        store.updateRun("campaign-1", (run) => ({
          ...run,
          attemptIds: [...run.attemptIds, `attempt-${index + 1}`],
        }))
      )
    );

    const run = await store.readRun("campaign-1");
    expect(run.stateRevision).toBe(12);
    expect(new Set(run.attemptIds)).toEqual(
      new Set(Array.from({ length: 12 }, (_, index) => `attempt-${index + 1}`))
    );
  });

  it("allows only one campaign executor for a run", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "campaign-execution-lock-"));
    const store = createCampaignStore(repoRoot);
    await store.initialize();
    const release = await store.acquireRunExecutionLock("campaign-1");

    await expect(store.acquireRunExecutionLock("campaign-1")).rejects.toThrow(
      /timed out waiting for state lock/i
    );
    await release();
    const releaseAgain = await store.acquireRunExecutionLock("campaign-1");
    await releaseAgain();
  });
});

function baseRun() {
  return {
    schemaVersion: "campaign-run/v1",
    id: "campaign-1",
    manifestId: "p09-t17-projectile",
    manifestPath:
      "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
    manifestHash: "a".repeat(64),
    cohort: "repeatability",
    status: "running",
    createdAt: "2026-08-30T12:00:00.000Z",
    startedAt: "2026-08-30T12:00:00.000Z",
    model: "gpt-5.6-luna",
    providerModes: { planning: "actual", contract: "actual", source: "actual" },
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
      authorizedAt: "2026-08-30T12:00:00.000Z",
    },
  };
}
