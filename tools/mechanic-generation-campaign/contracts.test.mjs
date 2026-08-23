import { describe, expect, it } from "vitest";
import path from "node:path";

import {
  parseCampaignManifest,
  parseCampaignAttempt,
  parseCampaignRun,
  scoreCampaign,
} from "./lib/contracts.mjs";
import { redactSensitive } from "./lib/redaction.mjs";
import { loadCampaignManifest } from "./lib/manifest-loader.mjs";

const manifest = {
  schemaVersion: "campaign-manifest/v1",
  id: "p09-t17-projectile",
  mechanic: {
    id: "projectile_shooting",
    name: "Projectile shooting",
    ticket: "Phase 09 Ticket 17",
    ticketUrl: "https://www.notion.so/example",
    requirementIds: ["actor_origin", "visible_travel", "cleanup"],
  },
  model: "gpt-5.6-luna",
  credential: { source: "keyword_env", envName: "AICADE_CAMPAIGN_KEYWORD" },
  prompts: [
    { id: "baseline", text: "Baseline", requirementIds: ["actor_origin", "visible_travel", "cleanup"] },
    { id: "plain_paraphrase", text: "Paraphrase", requirementIds: ["actor_origin", "visible_travel", "cleanup"] },
    { id: "constraints_first", text: "Constraints", requirementIds: ["actor_origin", "visible_travel", "cleanup"] },
    { id: "outcomes_first", text: "Outcomes", requirementIds: ["actor_origin", "visible_travel", "cleanup"] },
    { id: "compact", text: "Compact", requirementIds: ["actor_origin", "visible_travel", "cleanup"] },
  ],
  providerModes: { planning: "actual", contract: "actual", source: "actual" },
  fixtures: {},
  probe: "./probes/projectile.mjs",
  cohorts: {
    discovery: { maxAttempts: 1, minimumSuccesses: 1 },
    isolation: { maxAttempts: 1, minimumSuccesses: 1 },
    repeatability: { maxAttempts: 10, minimumSuccesses: 8 },
    variation: { runsPerPrompt: 2, minimumSuccesses: 8, requireEveryPromptSuccess: true },
  },
};

function successAttempt(index, promptId = "baseline") {
  return parseCampaignAttempt({
    schemaVersion: "campaign-attempt/v1",
    id: `attempt-${index}`,
    campaignRunId: "campaign-1",
    sequence: index,
    promptId,
    prompt: "Prompt text",
    status: "success",
    terminalOutcome: "accepted",
    furthestStage: "external_mechanic_probe",
    classification: "success",
    providerModes: { planning: "actual", contract: "actual", source: "actual" },
    providerCalls: { planning: 1, contract: 1, source: 1 },
    startedAt: "2026-08-22T12:00:00.000Z",
    completedAt: "2026-08-22T12:01:00.000Z",
    durationMs: 60_000,
    revisionKey: "revision-1",
    pipelinePassed: true,
    externalProbePassed: true,
    recordedOutcome: "success",
    artifacts: [],
    temporaryFixIds: [],
  });
}

describe("campaign contracts", () => {
  it("loads all three seeded manifests and verifies referenced fixture hashes", async () => {
    const manifests = await Promise.all(
      [
        "p09-t17-projectile.json",
        "p09-t18-seeded-hazard-spawner.json",
        "p09-t19-temporary-proximity-modifier.json",
      ].map((fileName) =>
        loadCampaignManifest(path.join(import.meta.dirname, "manifests", fileName))
      )
    );

    expect(manifests.map(({ manifest: loaded }) => loaded.id)).toEqual([
      "p09-t17-projectile",
      "p09-t18-seeded-hazard-spawner",
      "p09-t19-temporary-proximity-modifier",
    ]);
    expect(manifests[0].fixturePaths).toHaveProperty("planning");
    expect(manifests[1].fixturePaths).toEqual({});
  });

  it("accepts five frozen prompts that cover every mechanic requirement", () => {
    const parsed = parseCampaignManifest(manifest);

    expect(parsed.prompts.map((prompt) => prompt.id)).toEqual([
      "baseline",
      "plain_paraphrase",
      "constraints_first",
      "outcomes_first",
      "compact",
    ]);
  });

  it("rejects a variation prompt that drops a mechanic requirement", () => {
    const invalid = structuredClone(manifest);
    invalid.prompts[4].requirementIds = ["visible_travel", "cleanup"];

    expect(() => parseCampaignManifest(invalid)).toThrow(/actor_origin/);
  });

  it("scores repeatability at eight successes out of ten", () => {
    const attempts = Array.from({ length: 10 }, (_, index) =>
      index < 8
        ? successAttempt(index + 1)
        : { ...successAttempt(index + 1), status: "pipeline_failure", pipelinePassed: false }
    );

    expect(scoreCampaign("repeatability", manifest, attempts)).toMatchObject({
      status: "achieved",
      successes: 8,
      submissions: 10,
      qualifiesForMechanicProof: true,
    });
  });

  it("requires at least one variation success for every prompt", () => {
    const promptIds = manifest.prompts.map((prompt) => prompt.id);
    const attempts = promptIds.flatMap((promptId, promptIndex) =>
      Array.from({ length: 2 }, (_, runIndex) =>
        promptId === "compact"
          ? { ...successAttempt(promptIndex * 2 + runIndex + 1, promptId), status: "pipeline_failure", pipelinePassed: false }
          : successAttempt(promptIndex * 2 + runIndex + 1, promptId)
      )
    );

    expect(scoreCampaign("variation", manifest, attempts)).toMatchObject({
      status: "completed_not_achieved",
      successes: 8,
      submissions: 10,
      missingSuccessfulPromptIds: ["compact"],
    });
  });

  it("does not let fixture-backed attempts qualify for mechanic proof", () => {
    const attempt = {
      ...successAttempt(1),
      providerModes: { planning: "fixture", contract: "actual", source: "actual" },
    };

    expect(scoreCampaign("discovery", manifest, [attempt])).toMatchObject({
      status: "completed_not_achieved",
      successes: 0,
      diagnosticSuccesses: 1,
      qualifiesForMechanicProof: false,
    });
  });

  it("links a campaign run to an optional loop revision cycle", () => {
    const run = parseCampaignRun({
      schemaVersion: "campaign-run/v1",
      id: "campaign-1",
      manifestId: manifest.id,
      manifestPath: "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
      manifestHash: "a".repeat(64),
      cohort: "discovery",
      status: "pending",
      createdAt: "2026-08-23T15:00:00.000Z",
      model: manifest.model,
      providerModes: manifest.providerModes,
      attemptCeiling: 1,
      attemptIds: [],
      revision: {
        head: "b".repeat(40),
        revisionKey: "c".repeat(64),
        dirty: false,
        statusEntries: [],
      },
      baseUrl: "http://127.0.0.1:3117",
      loopId: "ticket-17-loop-1",
      loopStepId: "discover",
      loopCycle: 0,
    });

    expect(run).toMatchObject({
      loopId: "ticket-17-loop-1",
      loopStepId: "discover",
      loopCycle: 0,
    });
  });
});

describe("campaign redaction", () => {
  it("removes API keys, request keywords, and credential-bearing query values recursively", () => {
    const redacted = redactSensitive({
      openAiApiKey: "sk-secret",
      openAiKeyword: "request keyword",
      nested: {
        providerConfig: {
          openAiApiKey: "sk-nested",
          openAiKeyword: "request keyword",
          openAiModel: "gpt-5.6-luna",
        },
        url: "http://localhost:3005/editor?idea=hello&openAiKeyword=request+keyword&openAiApiKey=sk-secret",
      },
    });

    expect(redacted).toEqual({
      openAiApiKey: "[REDACTED]",
      openAiKeyword: "[REDACTED]",
      nested: {
        providerConfig: {
          openAiApiKey: "[REDACTED]",
          openAiKeyword: "[REDACTED]",
          openAiModel: "gpt-5.6-luna",
        },
        url: "http://localhost:3005/editor?idea=hello&openAiKeyword=%5BREDACTED%5D&openAiApiKey=%5BREDACTED%5D",
      },
    });
  });
});
