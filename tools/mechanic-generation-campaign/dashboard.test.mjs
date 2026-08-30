import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildDashboardSnapshot,
  dashboardContentType,
  resolveArtifactPath,
} from "./lib/dashboard-server.mjs";
import {
  applyKnowledgeReconciliation,
  createEmptyCampaignKnowledge,
  createKnowledgeContextDigest,
  knowledgeEntriesDigest,
} from "./lib/knowledge.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("campaign dashboard data", () => {
  it("places known cost after stage survival and classifications", async () => {
    const dashboard = await readFile(
      path.join(
        repoRoot,
        "tools",
        "mechanic-generation-campaign",
        "dashboard",
        "index.html"
      ),
      "utf8"
    );
    const stageSurvival = dashboard.indexOf('id="stages"');
    const classifications = dashboard.indexOf('id="failures"');
    const knownCost = dashboard.indexOf('id="dashboard-cost-history"');
    const campaignRuns = dashboard.indexOf('id="dashboard-campaigns"');

    expect(stageSurvival).toBeGreaterThan(-1);
    expect(classifications).toBeGreaterThan(stageSurvival);
    expect(knownCost).toBeGreaterThan(classifications);
    expect(campaignRuns).toBeGreaterThan(knownCost);
  });

  it("links to agent-readable documentation covering every campaign command", async () => {
    const dashboardRoot = path.join(
      repoRoot,
      "tools",
      "mechanic-generation-campaign",
      "dashboard"
    );
    const documentationRoot = path.join(
      repoRoot,
      "tools",
      "mechanic-generation-campaign",
      "docs"
    );
    const [dashboard, dashboardApp, dashboardStyles, documentationIndex, commands] = await Promise.all([
      readFile(path.join(dashboardRoot, "index.html"), "utf8"),
      readFile(path.join(dashboardRoot, "app.js"), "utf8"),
      readFile(path.join(dashboardRoot, "styles.css"), "utf8"),
      readFile(path.join(documentationRoot, "README.md"), "utf8"),
      readFile(path.join(documentationRoot, "commands.md"), "utf8"),
    ]);

    expect(dashboard).toContain('href="/documentation.html"');
    expect(documentationIndex).toContain("AI agent entry point");
    expect(dashboardContentType("getting-started.md")).toBe(
      "text/markdown; charset=utf-8"
    );
    for (const command of [
      "validate",
      "run",
      "review",
      "approve",
      "deny",
      "dashboard",
      "report",
      "publish",
      "import-legacy",
    ]) {
      expect(commands).toContain(`npm run campaign -- ${command}`);
    }
    for (const command of [
      "validate",
      "run",
      "resume",
      "extend",
      "isolate",
      "repair-campaign",
      "block",
      "conclude",
      "discard",
      "report",
      "publish",
    ]) {
      expect(commands).toContain(`npm run campaign -- loop ${command}`);
    }
    expect(dashboard).toContain('id="loops"');
    expect(dashboard).toContain('id="dashboard-loops"');
    expect(dashboard).toContain('id="dashboard-cost-history"');
    expect(dashboard).toContain('id="cost-group-by"');
    expect(dashboard).toContain('<option value="day">Day</option>');
    expect(dashboard).toContain('<option value="week">Week</option>');
    expect(dashboard).toContain('<option value="month">Month</option>');
    expect(dashboard).toContain('data-cost-chart-scroll');
    expect(dashboard).toContain('data-cost-table-body');
    expect(dashboard).toContain('<div class="visually-hidden">\n          <table>');
    expect(dashboard).not.toContain('<table class="visually-hidden">');
    expect(dashboard).toContain('id="dashboard-campaigns"');
    expect(dashboard).toContain('id="dashboard-attempts"');
    expect(dashboard).toContain('id="dashboard-fixes"');
    expect(dashboard).toContain('id="manual-qa"');
    expect(dashboard).toContain('id="knowledge"');
    expect(dashboard).toContain('id="knowledge-status-filter"');
    expect(dashboard).toContain('id="knowledge-confidence-filter"');
    expect(dashboard).toContain('id="knowledge-applicability-filter"');
    expect(dashboard).toContain('id="knowledge-stage-filter"');
    expect(dashboard).toContain('id="knowledge-classification-filter"');
    expect(dashboard).toContain('id="knowledge-manifest-filter"');
    expect(dashboardApp).toContain("Awaiting explicit verdict");
    expect(dashboardApp).toContain("denialReason");
    expect(dashboardApp).toContain("loop.lifecycle");
    expect(dashboardApp).toContain("grossActualProviderCalls");
    expect(dashboardApp).toContain('class="evidence-view-link"');
    expect(dashboardApp).toContain('href="/evidence?loop=${encodeURIComponent(loop.id)}"');
    expect(dashboardApp).not.toContain("loop.campaignLinks.map");
    expect(dashboardApp).not.toContain("repair.creditedUsage");
    expect(dashboardApp).toContain("summaryStatLink");
    expect(dashboardApp).toContain("createKnownCostSeries");
    expect(dashboardApp).toContain("installCostHistoryChart");
    expect(dashboardApp).toContain("renderCostHistory");
    expect(dashboardApp).toContain('cost-stat-link" href="#dashboard-cost-history"');
    expect(dashboardApp).toContain('"#dashboard-loops"');
    expect(dashboardApp).toContain('"#dashboard-campaigns"');
    expect(dashboardApp).toContain('"#dashboard-attempts"');
    expect(dashboardApp).toContain('"#dashboard-fixes"');
    expect(dashboardStyles).toContain("scroll-behavior: smooth");
    expect(dashboardStyles).toContain(".stat-link");
    expect(dashboardStyles).toContain(".cost-history-chart-scroll");
    expect(dashboardStyles).toContain(".cost-history-tooltip");
    expect(dashboardStyles).toContain(".cost-history-chart[hidden]");
    expect(dashboardStyles).toContain(".visually-hidden");
    expect(dashboardStyles).not.toContain(".cost-stat { position: relative; grid-column: span 2; }");
    expect(dashboardStyles).not.toContain(".cost-stat { grid-column: span 1; }");
    expect(dashboardStyles).toContain(
      ".cost-stat .stat-heading { position: relative; z-index: 2; flex-wrap: wrap; }"
    );
    expect(dashboardStyles).toContain(
      ".cost-stat.is-cost-timeframe-active .cost-stat-link { pointer-events: none; }"
    );
    expect(dashboardStyles).not.toContain(
      ".cost-stat:focus-within .cost-stat-link"
    );
    expect(dashboardStyles).toContain(
      ".cost-stat:focus-within, .cost-stat:focus-within:hover, .cost-stat.is-cost-timeframe-active, .cost-stat.is-cost-timeframe-active:hover { border-color: var(--line); box-shadow: 0 18px 50px rgba(0,0,0,.16); transform: none; }"
    );
    expect(dashboardApp).toContain("installCostCardNavigationGuard");
    expect(dashboardApp).toContain("costCardNavigationGuard.isActive()");
    expect(dashboardApp).toContain("deferredRefreshRender = true");
    expect(dashboardApp).not.toContain("unknown call(s) excluded");
    expect(dashboardApp).not.toContain("<small>Exact ${exact} · estimate ${estimate}");
    expect(dashboardApp).toContain("initializeCollapsiblePanels");
    expect(dashboardApp).toContain("panel.append(toggle)");
    expect(dashboardApp).toContain("section-toggle");
    expect(dashboardApp).toContain("aria-expanded");
    expect(commands).toContain("groups all priced history by UTC day, ISO week, or calendar month");
    expect(dashboardStyles).toContain(".section-toggle");
    expect(dashboardStyles).toContain(".panel { position: relative;");
    expect(dashboardStyles).toContain("position: absolute");
    expect(dashboardStyles).toContain(".panel.is-collapsed .panel-content");
    for (const sectionId of [
      "loops",
      "knowledge",
      "mechanics",
      "manual-qa",
      "campaigns",
      "attempts",
      "fixes",
      "legacy",
    ]) {
      expect(dashboardApp).toContain(`paginated("${sectionId}"`);
    }
    for (const sectionId of ["stages", "failures", "variation"]) {
      expect(dashboardApp).not.toContain(`paginated("${sectionId}"`);
    }
    expect(dashboardApp).toContain("data-page-direction");
    expect(dashboardApp).toContain("Showing ${result.start}–${result.end} of ${result.total}");
    expect(dashboardStyles).toContain(".pagination {");
    expect(dashboardStyles).toContain(".pagination-actions");
    expect(dashboardApp).toContain("failure_limit_reached");
    expect(dashboardApp).toContain("remainingFailureTolerance");
    expect(dashboardApp).toContain("replacementSubmissions");
    expect(dashboardApp).toContain("submissionKind");
    expect(dashboardStyles).toContain(".concluded");
    expect(dashboardStyles).toContain(".discarded");
  });

  it("separates canonical findings from loop-local pending knowledge", async () => {
    const canonical = createEmptyCampaignKnowledge("2026-08-24T12:00:00.000Z");
    const context = { applicableFindingIds: [], evidence: [] };
    context.contextDigest = createKnowledgeContextDigest(context);
    const pending = applyKnowledgeReconciliation(
      canonical,
      {
        schemaVersion: "campaign-knowledge-reconciliation/v1",
        id: "KR-loop-pending",
        source: {
          kind: "fix_cycle",
          loopId: "loop-1",
          fixId: "fix-cycle-1",
          triggerCampaignRunId: "campaign-1",
        },
        consultedManifestDigest: knowledgeEntriesDigest(canonical),
        contextDigest: context.contextDigest,
        consultedFindingIds: [],
        evidenceReview: [],
        operations: [],
        noChangeReason: "The loop evidence adds no reusable guidance.",
        createdAt: "2026-08-24T12:05:00.000Z",
      },
      context
    );
    const fakeStore = {
      dataRoot: "",
      async listRuns() { return []; },
      async readAttempts() { return []; },
    };
    const fakeLoopStore = {
      dataRoot: "",
      async listRuns() {
        return [{
          id: "loop-1",
          status: "waiting_for_fix",
          manifestId: "manifest-1",
          currentStepIndex: 0,
          currentRevision: { cycle: 0, revisionKey: "a".repeat(64) },
          worktree: { path: "/tmp/loop-1", branch: "codex/campaign-loop-loop-1" },
          steps: [{ cohort: "discovery", status: "running" }],
          campaignLinks: [],
          usage: {
            fixCycles: 0,
            campaignRuns: 1,
            submissions: 1,
            auxiliaryIsolationCampaigns: 0,
            actualProviderCalls: { planning: 1, contract: 1, source: 1 },
          },
          limits: {
            maxFixCycles: 1,
            maxCampaignRuns: 2,
            maxSubmissions: 2,
            maxAuxiliaryIsolationCampaigns: 0,
            actualProviderCalls: { planning: 2, contract: 2, source: 2 },
          },
          knowledgePolicy: {
            required: true,
            baselineManifestDigest: knowledgeEntriesDigest(canonical),
          },
        }];
      },
      async readFixes() { return []; },
    };

    const snapshot = await buildDashboardSnapshot(
      repoRoot,
      fakeStore,
      fakeLoopStore,
      { async read() { return canonical; } },
      async () => pending
    );

    expect(snapshot.knowledge.canonical).toEqual(canonical);
    expect(snapshot.knowledge.pending).toEqual([
      expect.objectContaining({
        loopId: "loop-1",
        status: "pending",
        reconciliationIds: ["KR-loop-pending"],
      }),
    ]);
  });

  it("combines live campaigns with all legacy attempts and temporary fixes", async () => {
    const fakeStore = {
      artifactRoot: path.join(repoRoot, ".qa", "mechanic-generation-campaign"),
      async listRuns() {
        return [
          {
            id: "campaign-1",
            manifestId: "p09-t17-projectile",
            cohort: "discovery",
            status: "achieved",
            createdAt: "2026-08-22T12:00:00.000Z",
            providerModes: { planning: "actual", contract: "actual", source: "actual" },
            revision: { revisionKey: "revision-1" },
            model: "gpt-5.6-luna",
            result: { successes: 1, submissions: 1, qualifiesForMechanicProof: true },
          },
        ];
      },
      async readAttempts() {
        return [
          {
            id: "a01-baseline",
            sequence: 1,
            promptId: "baseline",
            status: "success",
            furthestStage: "external_mechanic_probe",
            classification: "success",
            providerCalls: { planning: 1, contract: 1, source: 1 },
            fixtureCalls: { planning: 0, contract: 0, source: 0 },
            durationMs: 1000,
            manualQa: {
              id: "manual-qa-a01-baseline",
              path: "a01-baseline/manual-qa.json",
              status: "approved",
            },
          },
        ];
      },
      async readManualQa() {
        return {
          schemaVersion: "campaign-manual-qa/v1",
          id: "manual-qa-a01-baseline",
          campaignRunId: "campaign-1",
          attemptId: "a01-baseline",
          promptId: "baseline",
          cohort: "discovery",
          revisionKey: "revision-1",
          status: "approved",
          requestedAt: "2026-08-22T12:01:00.000Z",
          decidedAt: "2026-08-22T12:05:00.000Z",
          candidateArtifacts: [],
          reviewSessions: [],
          provenance: "campaign_review",
        };
      },
    };

    const snapshot = await buildDashboardSnapshot(repoRoot, fakeStore);

    expect(snapshot.campaigns).toHaveLength(1);
    expect(snapshot.legacyAttempts).toHaveLength(80);
    expect(snapshot.temporaryFixes).toHaveLength(33);
    expect(snapshot.stageSurvival.external_mechanic_probe).toBe(1);
    expect(snapshot.manualQa).toMatchObject({
      automatedCandidates: 0,
      pending: 0,
      approved: 1,
      denied: 0,
    });
    expect(snapshot.mechanics[0]).toMatchObject({
      manifestId: "p09-t17-projectile",
      discovery: "achieved",
      proven: false,
    });
  });

  it("exposes pending candidates, approvals, denials, reasons, and review evidence", async () => {
    const fakeStore = {
      artifactRoot: path.join(repoRoot, ".qa", "mechanic-generation-campaign"),
      async listRuns() {
        return [
          {
            id: "campaign-pending",
            manifestId: "p09-t17-projectile",
            cohort: "repeatability",
            status: "waiting_for_manual_qa",
            createdAt: "2026-08-23T12:00:00.000Z",
            providerModes: { planning: "actual", contract: "actual", source: "actual" },
            revision: { revisionKey: "revision-1" },
            model: "gpt-5.6-luna",
          },
        ];
      },
      async readAttempts() {
        return [
          {
            id: "a01-baseline",
            sequence: 1,
            promptId: "baseline",
            status: "awaiting_manual_qa",
            furthestStage: "external_mechanic_probe",
            classification: "awaiting_manual_qa",
            providerCalls: { planning: 1, contract: 1, source: 1 },
            manualQa: {
              id: "manual-qa-a01-baseline",
              path: "a01-baseline/manual-qa.json",
              status: "pending",
            },
          },
        ];
      },
      async readManualQa() {
        return {
          schemaVersion: "campaign-manual-qa/v1",
          id: "manual-qa-a01-baseline",
          campaignRunId: "campaign-pending",
          attemptId: "a01-baseline",
          promptId: "baseline",
          cohort: "repeatability",
          revisionKey: "revision-1",
          status: "pending",
          requestedAt: "2026-08-23T12:01:00.000Z",
          candidateArtifacts: [],
          reviewSessions: [
            {
              id: "review-1",
              status: "ready",
              runtimeReady: true,
              providerCallsBlocked: 0,
              artifacts: ["review-1-ready.png"],
            },
          ],
          provenance: "campaign_review",
        };
      },
    };

    const snapshot = await buildDashboardSnapshot(repoRoot, fakeStore);

    expect(snapshot.manualQa).toMatchObject({
      automatedCandidates: 1,
      pending: 1,
      approved: 0,
      denied: 0,
    });
    expect(snapshot.pendingManualReviews[0]).toMatchObject({
      campaignRunId: "campaign-pending",
      attemptId: "a01-baseline",
      reviewSessions: [expect.objectContaining({ status: "ready" })],
    });
  });

  it("shows one card per mechanic using its newest proof-eligible configuration", async () => {
    const actualProviderModes = {
      planning: "actual",
      contract: "actual",
      source: "actual",
    };
    const fakeStore = {
      artifactRoot: path.join(repoRoot, ".qa", "mechanic-generation-campaign"),
      async listRuns() {
        return [
          {
            id: "older-discovery",
            manifestId: "p09-t17-projectile",
            cohort: "discovery",
            status: "achieved",
            createdAt: "2026-08-20T12:00:00.000Z",
            providerModes: actualProviderModes,
            revision: { revisionKey: "older-revision" },
            model: "gpt-5.6-luna",
          },
          {
            id: "older-repeatability",
            manifestId: "p09-t17-projectile",
            cohort: "repeatability",
            status: "achieved",
            createdAt: "2026-08-20T13:00:00.000Z",
            providerModes: actualProviderModes,
            revision: { revisionKey: "older-revision" },
            model: "gpt-5.6-luna",
          },
          {
            id: "newer-discovery",
            manifestId: "p09-t17-projectile",
            cohort: "discovery",
            status: "completed_not_achieved",
            createdAt: "2026-08-21T12:00:00.000Z",
            providerModes: actualProviderModes,
            revision: { revisionKey: "newer-revision" },
            model: "gpt-5.6-luna",
          },
          {
            id: "newest-isolation",
            manifestId: "p09-t17-projectile",
            cohort: "isolation",
            status: "achieved",
            createdAt: "2026-08-22T12:00:00.000Z",
            providerModes: {
              planning: "fixture",
              contract: "fixture",
              source: "fixture",
            },
            revision: { revisionKey: "isolation-revision" },
            model: "gpt-5.6-luna",
          },
        ];
      },
      async readAttempts() {
        return [];
      },
    };

    const snapshot = await buildDashboardSnapshot(repoRoot, fakeStore);

    expect(snapshot.mechanics).toEqual([
      expect.objectContaining({
        manifestId: "p09-t17-projectile",
        revisionKey: "newer-revision",
        providerModes: actualProviderModes,
        discovery: "completed_not_achieved",
        repeatability: "missing",
        variation: "missing",
        proven: false,
      }),
    ]);
  });

  it("shows loop progress, budgets, linked campaigns, and proposed fix checkpoints", async () => {
    const fakeStore = {
      artifactRoot: path.join(repoRoot, ".qa", "mechanic-generation-campaign"),
      dataRoot: path.join(repoRoot, "tools", "mechanic-generation-campaign", "data"),
      async listRuns() {
        return [];
      },
      async readAttempts() {
        return [];
      },
    };
    const fakeLoopStore = {
      async listRuns() {
        return [
          {
            id: "ticket-17-loop-1",
            manifestId: "p09-t17-projectile",
            model: "gpt-5.6-luna",
            status: "waiting_for_fix",
            createdAt: "2026-08-23T12:00:00.000Z",
            currentRevision: { cycle: 1, revisionKey: "revision-2" },
            currentStepIndex: 0,
            usage: {
              fixCycles: 1,
              campaignRuns: 2,
              submissions: 2,
              auxiliaryIsolationCampaigns: 1,
              actualProviderCalls: { planning: 1, contract: 2, source: 2 },
            },
            limits: {
              maxFixCycles: 3,
              maxCampaignRuns: 8,
              maxSubmissions: 30,
              maxAuxiliaryIsolationCampaigns: 2,
              actualProviderCalls: { planning: 30, contract: 60, source: 60 },
            },
            worktree: {
              branch: "codex/campaign-loop-ticket-17-loop-1",
              path: "/tmp/worktree",
            },
            steps: [
              {
                id: "discovery",
                cohort: "discovery",
                status: "running",
                campaignRunIds: ["campaign-1"],
                sameRevisionRuns: 1,
              },
            ],
            campaignLinks: [
              {
                campaignRunId: "campaign-1",
                role: "sequence",
                stepId: "discovery",
                cycle: 0,
                status: "completed_not_achieved",
              },
            ],
            fixCheckpointIds: ["fix-cycle-1"],
          },
        ];
      },
      async readFixes() {
        return [
          {
            id: "fix-cycle-1",
            kind: "temporary",
            temporaryFixIds: ["TF-33"],
            diagnosis: "Temporary compatibility policy.",
            changedFiles: ["src/example.ts", "docs/phase-09-ticket-16-5-temporary-fix-ledger.md"],
            createdAt: "2026-08-23T13:00:00.000Z",
          },
        ];
      },
    };

    const snapshot = await buildDashboardSnapshot(
      repoRoot,
      fakeStore,
      fakeLoopStore
    );

    expect(snapshot.loops).toEqual([
      expect.objectContaining({
        id: "ticket-17-loop-1",
        remaining: expect.objectContaining({
          fixCycles: 2,
          campaignRuns: 6,
          submissions: 28,
          actualProviderCalls: { planning: 29, contract: 58, source: 58 },
        }),
        fixes: [
          expect.objectContaining({
            id: "fix-cycle-1",
            kind: "temporary",
            temporaryFixIds: ["TF-33"],
          }),
        ],
      }),
    ]);
  });

  it("serves artifacts only from the campaign artifact root", () => {
    const root = path.join(repoRoot, ".qa", "mechanic-generation-campaign");

    expect(resolveArtifactPath(root, "campaign-1/a01/attempt.json")).toBe(
      path.join(root, "campaign-1", "a01", "attempt.json")
    );
    expect(() => resolveArtifactPath(root, "../../.env.local")).toThrow(
      /escapes/i
    );
    expect(() => resolveArtifactPath(root, "%2e%2e/%2e%2e/.env.local")).toThrow(
      /escapes/i
    );
    expect(() =>
      resolveArtifactPath(root, "%252e%252e/%252e%252e/.env.local")
    ).toThrow(/escapes/i);
  });
});
