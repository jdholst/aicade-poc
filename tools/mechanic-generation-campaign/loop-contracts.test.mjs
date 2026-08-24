import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseCampaignLoopManifest,
  parseCampaignLoopRun,
} from "./lib/loop-contracts.mjs";
import { loadCampaignLoopDefinition } from "./lib/loop-definition-loader.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function validDefinition() {
  return {
    schemaVersion: "campaign-loop-manifest/v1",
    id: "p09-t17-proof-loop",
    manifest: {
      path: "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
      sha256: "a6265e16881d158a1620b49ef806e94b592a939194c090569c8b6392ccce93c2",
      probeSha256: "4dc1c0b63661c708a9c326a377f1f1d5be62a03ff1f5d0a1519dd579936002df",
    },
    model: "gpt-5.6-luna",
    sequence: [
      {
        id: "discover",
        cohort: "discovery",
        providerModes: {
          planning: "actual",
          contract: "actual",
          source: "actual",
        },
        maxCampaignRunsPerRevision: 2,
        retryableClassifications: [
          "provider_failure",
          "infrastructure_failure",
        ],
      },
    ],
    isolationProfiles: [
      {
        id: "planning-fixture",
        providerModes: {
          planning: "fixture",
          contract: "actual",
          source: "actual",
        },
        maxCampaignRuns: 1,
      },
    ],
    limits: {
      maxFixCycles: 2,
      maxCampaignRuns: 5,
      maxSubmissions: 5,
      maxAuxiliaryIsolationCampaigns: 1,
      actualProviderCalls: {
        planning: 5,
        contract: 10,
        source: 10,
      },
    },
  };
}

describe("campaign loop definitions", () => {
  it("loads the fixture-only browser smoke loop with zero actual-provider minimums", async () => {
    const loaded = await loadCampaignLoopDefinition({
      definitionPath: path.join(
        repoRoot,
        "tools/mechanic-generation-campaign/fixtures/ticket-17/isolation-loop.json"
      ),
      repoRoot,
    });

    expect(loaded.minimums).toEqual({
      campaignRuns: 1,
      submissions: 1,
      actualProviderCalls: { planning: 0, contract: 0, source: 0 },
    });
  });

  it("binds one loop to the exact referenced campaign manifest", async () => {
    const definition = validDefinition();
    const loaded = await loadCampaignLoopDefinition({
      definition,
      definitionPath: path.join(repoRoot, ".qa", "ticket-17-loop.json"),
      repoRoot,
    });

    expect(loaded.definition).toEqual(definition);
    expect(loaded.campaign.manifest.id).toBe("p09-t17-projectile");
    expect(loaded.definitionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(loaded.minimums).toEqual({
      campaignRuns: 1,
      submissions: 1,
      actualProviderCalls: { planning: 1, contract: 1, source: 1 },
    });
  });

  it("requires every loop ceiling explicitly", () => {
    const definition = validDefinition();
    delete definition.limits.maxFixCycles;

    expect(() => parseCampaignLoopManifest(definition)).toThrow(
      /maxFixCycles/
    );
  });
});

describe("campaign loop run contracts", () => {
  it("loads a v1 run as a v3 run without losing evidence", () => {
    const run = parseCampaignLoopRun(validV1Run());

    expect(run).toMatchObject({
      schemaVersion: "campaign-loop-run/v3",
      status: "exhausted",
      budgetExtensions: [],
      exhaustionResume: { status: "waiting_for_fix" },
      knowledgePolicy: { required: false },
      knowledgeReconciliationIds: [],
    });
    expect(run.campaignLinks).toHaveLength(1);
  });

  it("grandfathers v2 records and requires a knowledge baseline on v3 records", () => {
    const legacyFields = { ...parseCampaignLoopRun(validV1Run()) };
    delete legacyFields.knowledgePolicy;
    delete legacyFields.knowledgeReconciliationIds;
    const migrated = parseCampaignLoopRun({
      ...legacyFields,
      schemaVersion: "campaign-loop-run/v2",
    });

    expect(migrated).toMatchObject({
      schemaVersion: "campaign-loop-run/v3",
      knowledgePolicy: { required: false },
      knowledgeReconciliationIds: [],
    });
    expect(() =>
      parseCampaignLoopRun({
        ...migrated,
        knowledgePolicy: { required: true },
      })
    ).toThrow(/baselineManifestDigest/);
  });

  it("requires lifecycle evidence for concluded and discarded runs", () => {
    const run = parseCampaignLoopRun(validV1Run());

    expect(() =>
      parseCampaignLoopRun({
        ...run,
        status: "concluded",
      })
    ).toThrow(/lifecycle/i);

    expect(
      parseCampaignLoopRun({
        ...run,
        status: "discarded",
        exhaustionResume: undefined,
        lifecycle: {
          action: "discard",
          previousStatus: "exhausted",
          at: "2026-08-24T12:00:00.000Z",
          worktreeRemoved: true,
          branchRemoved: true,
          forced: false,
        },
      }).status
    ).toBe("discarded");
  });
});

function validV1Run() {
  return {
    schemaVersion: "campaign-loop-run/v1",
    id: "p09-t17-proof-loop-20260824t120000000z",
    definitionPath: ".qa/ticket-17-loop.json",
    definitionHash: "1".repeat(64),
    authorizationHash: "2".repeat(64),
    manifestId: "p09-t17-projectile",
    manifestPath:
      "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
    manifestHash: "3".repeat(64),
    model: "gpt-5.6-luna",
    status: "exhausted",
    createdAt: "2026-08-24T11:00:00.000Z",
    completedAt: "2026-08-24T11:30:00.000Z",
    baseRevision: { head: "a".repeat(40), revisionKey: "4".repeat(64) },
    currentRevision: {
      head: "b".repeat(40),
      revisionKey: "5".repeat(64),
      cycle: 1,
    },
    currentStepIndex: 0,
    usage: {
      fixCycles: 1,
      campaignRuns: 2,
      submissions: 2,
      auxiliaryIsolationCampaigns: 0,
      actualProviderCalls: { planning: 2, contract: 2, source: 2 },
    },
    limits: validDefinition().limits,
    worktree: {
      controlRoot: repoRoot,
      path: path.join(repoRoot, ".qa", "loop-worktree"),
      branch: "codex/campaign-loop-p09-t17-proof-loop",
    },
    steps: [
      {
        id: "discover",
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
        stepId: "discover",
        cycle: 1,
        revisionKey: "5".repeat(64),
        status: "completed_not_achieved",
      },
    ],
    fixCheckpointIds: ["fix-cycle-1"],
    exhaustionReason: "The current step failed and no fix cycles remain.",
  };
}
