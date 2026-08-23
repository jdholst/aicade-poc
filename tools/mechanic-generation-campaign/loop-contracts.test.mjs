import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseCampaignLoopManifest,
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
