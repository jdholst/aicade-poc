import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { startDashboardServer } from "./lib/dashboard-server.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("campaign loop evidence page", () => {
  it("provides a readable, live, expandable evidence page shell", async () => {
    const dashboardRoot = path.join(
      repoRoot,
      "tools",
      "mechanic-generation-campaign",
      "dashboard"
    );
    const [html, app, styles] = await Promise.all([
      readFile(path.join(dashboardRoot, "evidence.html"), "utf8"),
      readFile(path.join(dashboardRoot, "evidence.js"), "utf8"),
      readFile(path.join(dashboardRoot, "styles.css"), "utf8"),
    ]);

    expect(html).toContain("Campaign loop evidence");
    expect(html).toContain('class="evidence-back-link"');
    expect(html).toContain('aria-label="Back to main dashboard"');
    expect(html).toContain("Back to dashboard");
    expect(html.match(/href="\/"/g)).toHaveLength(1);
    expect(html).toContain('id="evidence-content"');
    expect(html).toContain('src="/evidence.js"');
    expect(app).toContain('fetch(`/api/evidence?loop=${encodeURIComponent(loopId)}`');
    expect(app).toContain("setInterval(refresh, 1000)");
    expect(app).toContain("captureExpandedIds");
    expect(app).toContain("window.scrollTo");
    expect(app).toContain("Evidence unavailable");
    expect(app).toContain("Attempts");
    expect(styles).toContain(".evidence-timeline");
    expect(styles).toContain(".evidence-back-link");
    expect(styles).toContain(".evidence-event");
    expect(styles).toContain(".evidence-attempt");
  });

  it("serves the page and selected-loop evidence without loading the dashboard snapshot", async () => {
    const loop = {
      id: "loop-1",
      manifestId: "p09-t17-projectile",
      model: "gpt-5.6-luna",
      status: "running",
      createdAt: "2026-08-29T12:00:00.000Z",
      baseRevision: { revisionKey: "revision-zero" },
      currentRevision: { cycle: 0, revisionKey: "revision-zero" },
      currentStepIndex: 0,
      steps: [{ id: "discovery", cohort: "discovery", status: "running" }],
      campaignLinks: [],
      campaignRepairs: [],
      budgetExtensions: [],
      usage: {
        fixCycles: 0,
        campaignRuns: 0,
        submissions: 0,
        auxiliaryIsolationCampaigns: 0,
        actualProviderCalls: { planning: 0, contract: 0, source: 0 },
      },
      limits: {
        maxFixCycles: 1,
        maxCampaignRuns: 4,
        maxSubmissions: 22,
        maxAuxiliaryIsolationCampaigns: 1,
        actualProviderCalls: { planning: 22, contract: 22, source: 22 },
      },
    };
    let listRunsCalls = 0;
    const store = {
      artifactRoot: path.join(repoRoot, ".qa", "mechanic-generation-campaign"),
      async listRuns() { listRunsCalls += 1; return []; },
      async readRun() { throw new Error("No campaign should be read."); },
      async readAttempts() { return []; },
    };
    const loopStore = {
      async readRun(id) {
        if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
          throw new Error(`Unsafe loop path segment "${id}".`);
        }
        if (id !== loop.id) {
          const error = new Error(`Unknown loop ${id}`);
          error.code = "ENOENT";
          throw error;
        }
        return loop;
      },
      async readFixes() { return []; },
    };

    let dashboard;
    try {
      dashboard = await startDashboardServer({ repoRoot, store, loopStore, port: 0 });
    } catch (error) {
      if (error?.code === "EPERM") return;
      throw error;
    }
    try {
      const pageResponse = await fetch(`${dashboard.url}/evidence?loop=loop-1`);
      expect(pageResponse.status).toBe(200);
      expect(await pageResponse.text()).toContain("Campaign loop evidence");

      const evidenceResponse = await fetch(`${dashboard.url}/api/evidence?loop=loop-1`);
      expect(evidenceResponse.status).toBe(200);
      expect(await evidenceResponse.json()).toMatchObject({
        schemaVersion: "campaign-loop-evidence/v1",
        loop: { id: "loop-1" },
      });
      expect(listRunsCalls).toBe(0);

      expect((await fetch(`${dashboard.url}/api/evidence`)).status).toBe(400);
      const unknownResponse = await fetch(`${dashboard.url}/api/evidence?loop=unknown`);
      expect(unknownResponse.status).toBe(404);
      expect(await unknownResponse.json()).toEqual({ error: 'Unknown loop "unknown".' });
      expect((await fetch(`${dashboard.url}/api/evidence?loop=..%2Fsecret`)).status).toBe(404);
    } finally {
      await dashboard.close();
    }
  });
});
