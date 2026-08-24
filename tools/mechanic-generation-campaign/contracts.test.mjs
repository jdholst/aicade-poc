import { describe, expect, it } from "vitest";
import path from "node:path";

import {
  parseCampaignManifest,
  parseCampaignAttempt,
  parseCampaignManualQa,
  parseCampaignRun,
  requiresManualQa,
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
    cohort: "repeatability",
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
    automatedOutcome: {
      status: "passed",
      terminalOutcome: "accepted and externally verified",
      recordedAt: "2026-08-22T12:01:00.000Z",
    },
    recordedOutcome: "automated_success",
    adjudicatedOutcome: "manual_qa_approved",
    manualQa: {
      id: `manual-qa-attempt-${index}`,
      path: `attempt-${index}/manual-qa.json`,
      status: "approved",
    },
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

  it("treats an automated full-actual pass as pending until a human approves it", () => {
    const attempt = {
      ...successAttempt(1),
      status: "awaiting_manual_qa",
      classification: "awaiting_manual_qa",
      recordedOutcome: "automated_success",
      adjudicatedOutcome: undefined,
      manualQa: {
        id: "manual-qa-attempt-1",
        path: "attempt-1/manual-qa.json",
        status: "pending",
      },
    };

    expect(scoreCampaign("discovery", manifest, [attempt])).toMatchObject({
      status: "waiting_for_manual_qa",
      successes: 0,
      automatedCandidates: 1,
      submissions: 1,
      qualifiesForMechanicProof: false,
    });
  });

  it("requires review only for full-actual proof-cohort automated passes", () => {
    expect(
      requiresManualQa({
        cohort: "discovery",
        providerModes: manifest.providerModes,
        pipelinePassed: true,
        externalProbePassed: true,
      })
    ).toBe(true);
    expect(
      requiresManualQa({
        cohort: "isolation",
        providerModes: manifest.providerModes,
        pipelinePassed: true,
        externalProbePassed: true,
      })
    ).toBe(false);
    expect(
      requiresManualQa({
        cohort: "variation",
        providerModes: { ...manifest.providerModes, planning: "fixture" },
        pipelinePassed: true,
        externalProbePassed: true,
      })
    ).toBe(false);
  });

  it("validates pending, approved, and denied manual-QA evidence conditionally", () => {
    const base = {
      schemaVersion: "campaign-manual-qa/v1",
      id: "manual-qa-attempt-1",
      campaignRunId: "campaign-1",
      attemptId: "attempt-1",
      promptId: "baseline",
      cohort: "discovery",
      revisionKey: "revision-1",
      status: "pending",
      requestedAt: "2026-08-22T12:01:00.000Z",
      candidateArtifacts: [
        {
          kind: "generation_run",
          path: "generation-run-storage.json",
          sha256: "a".repeat(64),
        },
        {
          kind: "game_pack",
          path: "game-pack-storage.json",
          sha256: "b".repeat(64),
        },
      ],
      reviewSessions: [],
    };

    expect(parseCampaignManualQa(base).status).toBe("pending");
    expect(
      parseCampaignManualQa({
        ...base,
        status: "approved",
        decidedAt: "2026-08-22T12:05:00.000Z",
        approvalNote: "Projectile origin and cleanup are correct.",
      }).status
    ).toBe("approved");
    expect(() =>
      parseCampaignManualQa({
        ...base,
        status: "denied",
        decidedAt: "2026-08-22T12:05:00.000Z",
      })
    ).toThrow(/denial reason/i);
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
      authorization: {
        actualProviders: true,
        authorizedAt: "2026-08-23T15:00:00.000Z",
      },
      loopId: "ticket-17-loop-1",
      loopStepId: "discover",
      loopCycle: 0,
    });

    expect(run).toMatchObject({
      schemaVersion: "campaign-run/v2",
      loopId: "ticket-17-loop-1",
      loopStepId: "discover",
      loopCycle: 0,
      knowledgePolicy: { required: false },
    });
  });

  it("requires a knowledge baseline on new campaign runs while grandfathering v1 records", () => {
    const legacy = parseCampaignRun({
      schemaVersion: "campaign-run/v1",
      id: "campaign-legacy",
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
      authorization: {
        actualProviders: false,
        authorizedAt: "2026-08-23T15:00:00.000Z",
      },
    });

    expect(legacy.knowledgePolicy).toEqual({ required: false });
    expect(() =>
      parseCampaignRun({
        ...legacy,
        schemaVersion: "campaign-run/v2",
        knowledgePolicy: { required: true },
      })
    ).toThrow(/baselineManifestDigest/);
    expect(
      parseCampaignRun({
        ...legacy,
        schemaVersion: "campaign-run/v2",
        knowledgePolicy: {
          required: true,
          baselineManifestDigest: "d".repeat(64),
        },
      }).knowledgePolicy
    ).toEqual({
      required: true,
      baselineManifestDigest: "d".repeat(64),
    });
  });

  it("requires a pending-review reference when a campaign is waiting for manual QA", () => {
    const run = {
      schemaVersion: "campaign-run/v1",
      id: "campaign-1",
      manifestId: manifest.id,
      manifestPath: "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
      manifestHash: "a".repeat(64),
      cohort: "discovery",
      status: "waiting_for_manual_qa",
      createdAt: "2026-08-23T15:00:00.000Z",
      startedAt: "2026-08-23T15:00:01.000Z",
      model: manifest.model,
      providerModes: manifest.providerModes,
      attemptCeiling: 1,
      attemptIds: ["attempt-1"],
      revision: {
        head: "b".repeat(40),
        revisionKey: "c".repeat(64),
        dirty: false,
        statusEntries: [],
      },
      baseUrl: "http://127.0.0.1:3117",
      authorization: {
        actualProviders: true,
        authorizedAt: "2026-08-23T15:00:00.000Z",
      },
    };

    expect(() => parseCampaignRun(run)).toThrow(/pending manual qa/i);
    expect(
      parseCampaignRun({
        ...run,
        pendingManualQa: {
          manualQaId: "manual-qa-attempt-1",
          campaignRunId: "campaign-1",
          attemptId: "attempt-1",
          promptId: "baseline",
          cohort: "discovery",
          revisionKey: "c".repeat(64),
          requestedAt: "2026-08-23T15:01:00.000Z",
          evidencePath: "attempt-1/manual-qa.json",
        },
      }).status
    ).toBe("waiting_for_manual_qa");
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
