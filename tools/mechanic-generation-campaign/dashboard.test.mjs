import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildDashboardSnapshot,
  dashboardContentType,
  resolveArtifactPath,
} from "./lib/dashboard-server.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("campaign dashboard data", () => {
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
    const [dashboard, documentationIndex, commands] = await Promise.all([
      readFile(path.join(dashboardRoot, "index.html"), "utf8"),
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
      "dashboard",
      "report",
      "publish",
      "import-legacy",
    ]) {
      expect(commands).toContain(`npm run campaign -- ${command}`);
    }
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
          },
        ];
      },
    };

    const snapshot = await buildDashboardSnapshot(repoRoot, fakeStore);

    expect(snapshot.campaigns).toHaveLength(1);
    expect(snapshot.legacyAttempts).toHaveLength(80);
    expect(snapshot.temporaryFixes).toHaveLength(32);
    expect(snapshot.stageSurvival.external_mechanic_probe).toBe(1);
    expect(snapshot.mechanics[0]).toMatchObject({
      manifestId: "p09-t17-projectile",
      discovery: "achieved",
      proven: false,
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
