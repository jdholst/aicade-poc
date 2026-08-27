import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";

import { chromium } from "@playwright/test";
import { afterEach, describe, expect, it } from "vitest";

import { readCampaignBrowserStorage } from "./lib/browser-storage.mjs";
import {
  installReviewProviderBlocking,
  pauseReviewForCampaignRepair,
  restoreCandidateStorage,
  waitForRestoredCandidateRuntime,
} from "./lib/review-runner.mjs";
import {
  createInitialLoopRun,
  finishSequenceCampaign,
  startLoopCampaign,
} from "./lib/loop-state.mjs";
import {
  createSuccessfulGenerationRunFixture,
  createValidatedGamePackFixture,
} from "../../src/game-spec/game-pack/testing/game-pack-fixtures";

const cleanups = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("manual QA candidate replay", () => {
  it("pauses a linked loop for campaign repair without changing the frozen verdict candidate", async () => {
    const definition = {
      sequence: [{ id: "discovery", cohort: "discovery" }],
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
      definitionPath: "/repo/.qa/loop.json",
      definitionHash: "1".repeat(64),
      authorizationHash: "2".repeat(64),
      campaign: {
        manifest: { id: "projectile" },
        manifestPath: "/repo/tools/mechanic-generation-campaign/manifests/projectile.json",
        manifestHash: "3".repeat(64),
      },
      runId: "projectile-loop-20260827t000000000z",
      createdAt: "2026-08-27T00:00:00.000Z",
      revision: { head: "a".repeat(40), revisionKey: "4".repeat(64) },
      controlRoot: "/repo",
      worktreePath: "/repo/.qa/worktree",
      branch: "codex/campaign-loop-projectile-loop",
      knowledgeManifestDigest: "5".repeat(64),
    });
    loop = startLoopCampaign(loop, {
      campaignRunId: "campaign-1",
      role: "sequence",
      stepId: "discovery",
    });
    const pendingManualQa = {
      manualQaId: "manual-qa-a1",
      campaignRunId: "campaign-1",
      attemptId: "a1",
      promptId: "baseline",
      cohort: "discovery",
      revisionKey: "4".repeat(64),
      requestedAt: "2026-08-27T00:01:00.000Z",
      evidencePath: "a1/manual-qa.json",
    };
    loop = finishSequenceCampaign(loop, definition, {
      campaignRunId: "campaign-1",
      status: "waiting_for_manual_qa",
      attempts: [],
      pendingManualQa,
    });
    const campaignRun = {
      id: "campaign-1",
      loopId: loop.id,
      status: "waiting_for_manual_qa",
      pendingManualQa,
    };
    const loopStore = {
      async readRun() {
        return loop;
      },
      async writeRun(next) {
        loop = next;
      },
    };

    await pauseReviewForCampaignRepair({
      loopStore,
      run: campaignRun,
      reason: "The iframe detector rejected a mounted candidate.",
      detectedAt: "2026-08-27T00:02:00.000Z",
    });

    expect(campaignRun).toMatchObject({
      status: "waiting_for_manual_qa",
      pendingManualQa,
    });
    expect(loop.status).toBe("waiting_for_campaign_repair");
    expect(loop.pendingManualQa).toEqual(pendingManualQa);
    expect(loop.campaignRepairs[0]).toMatchObject({
      campaignRunId: "campaign-1",
      resumeStatus: "waiting_for_manual_qa",
      status: "pending",
    });
  });

  it("restores exact IndexedDB records and blocks every generation-provider request", async () => {
    let upstreamRequests = 0;
    const server = createServer((request, response) => {
      if (request.url?.startsWith("/api/")) upstreamRequests += 1;
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><title>review</title>");
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    cleanups.push(() => new Promise((resolve) => server.close(resolve)));
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    cleanups.push(() => browser.close());
    const page = await browser.newPage();
    const blocked = { count: 0 };
    await installReviewProviderBlocking(page, blocked);
    await page.goto(origin);

    const generationRunRecord = {
      id: "generation-run-1",
      recordVersion: 1,
      status: "succeeded",
      updatedAt: "2026-08-23T15:01:00.000Z",
      generationRun: { id: "generation-run-1", status: "succeeded" },
    };
    const gamePackRecord = {
      id: "game-pack-1",
      recordVersion: 1,
      gamePackSchemaVersion: "game-pack/v1",
      updatedAt: "2026-08-23T15:01:00.000Z",
      gamePack: { id: "game-pack-1", updatedAt: "2026-08-23T15:01:00.000Z" },
    };
    await restoreCandidateStorage(page, { generationRunRecord, gamePackRecord });

    expect(await readCampaignBrowserStorage(page)).toEqual({
      generationRuns: [generationRunRecord],
      gamePacks: [gamePackRecord],
    });
    await page.evaluate(async () => {
      await fetch("/api/creator-generation-planning", { method: "POST" });
      await fetch("/api/generated-mechanic-provider", { method: "POST" });
      await fetch("/api/spec-generation", { method: "POST" });
      await fetch("/api/starter-project", { method: "POST" });
    });
    expect(blocked.count).toBe(4);
    expect(upstreamRequests).toBe(0);
  }, 20_000);

  it.skipIf(process.env.RUN_CAMPAIGN_REVIEW_E2E !== "1")(
    "mounts a fixture GamePack in the production editor with zero upstream calls",
    async () => {
      const port = 3137;
      const child = spawn(
        "npm",
        ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)],
        { cwd: path.resolve(import.meta.dirname, "../.."), stdio: "ignore" }
      );
      cleanups.push(async () => {
        if (child.exitCode !== null) return;
        child.kill("SIGTERM");
        await new Promise((resolve) => child.once("exit", resolve));
      });
      const origin = `http://127.0.0.1:${port}`;
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        try {
          if ((await fetch(`${origin}/editor`)).ok) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const gamePack = createValidatedGamePackFixture();
      const generationRun = createSuccessfulGenerationRunFixture(gamePack);
      const generationRunRecord = {
        id: generationRun.id,
        recordVersion: 1,
        status: generationRun.status,
        updatedAt: generationRun.completedAt,
        generationRun,
      };
      const gamePackRecord = {
        id: gamePack.id,
        recordVersion: 1,
        gamePackSchemaVersion: gamePack.schemaVersion,
        updatedAt: gamePack.updatedAt,
        gamePack,
      };
      const browser = await chromium.launch({ channel: "chrome", headless: true });
      cleanups.push(() => browser.close());
      const page = await browser.newPage();
      const blocked = { count: 0 };
      await installReviewProviderBlocking(page, blocked);
      await page.goto(`${origin}/editor`, { waitUntil: "domcontentloaded" });
      await restoreCandidateStorage(page, { generationRunRecord, gamePackRecord });
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForRestoredCandidateRuntime(page);

      expect((await readCampaignBrowserStorage(page)).gamePacks).toEqual([
        gamePackRecord,
      ]);
      expect(blocked.count).toBe(0);
    },
    90_000
  );
});
