import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyKnowledgeReconciliation,
  createEmptyCampaignKnowledge,
  knowledgeEntriesDigest,
  parseCampaignKnowledge,
  selectCampaignKnowledge,
} from "./lib/knowledge.mjs";
import { buildCampaignKnowledgeContext } from "./lib/knowledge-cli.mjs";

const now = "2026-08-24T18:00:00.000Z";
const actualFailure = {
  kind: "campaign_attempt",
  id: "campaign-1/a01-baseline",
  campaignRunId: "campaign-1",
  attemptId: "a01-baseline",
  quality: "actual_submission",
  outcome: "provider_output_rejected",
  summary: "The first interaction check occurred after the progress observation.",
  observedAt: now,
};

function addProposal(knowledge, overrides = {}) {
  const evidence = overrides.evidence ?? [actualFailure];
  const contextDigest = "1".repeat(64);
  return {
    context: {
      contextDigest,
      applicableFindingIds: [],
      evidence,
    },
    proposal: {
      schemaVersion: "campaign-knowledge-reconciliation/v1",
      id: "KR-backfill-20260824",
      source: { kind: "backfill" },
      consultedManifestDigest: knowledgeEntriesDigest(knowledge),
      contextDigest,
      consultedFindingIds: [],
      evidenceReview: evidence.map(({ id }) => ({
        evidenceId: id,
        disposition: "incorporated",
        findingIds: ["KF-0001"],
        rationale: "The failure produced reusable scheduling guidance.",
      })),
      operations: [
        {
          type: "add",
          entry: {
            id: "KF-0001",
            revision: 1,
            status: "active",
            confidence: "supported",
            title: "Check interactions before progress observations",
            guidance:
              "Schedule the first target interaction check before the first lifecycle progress observation.",
            scope: {
              applicability: "manifest",
              mechanicIds: [],
              manifestIds: ["p09-t17-projectile"],
              stages: ["source_generation"],
              classifications: ["provider_output_rejected"],
            },
            evidence,
            amendments: [],
            createdAt: now,
            updatedAt: now,
          },
        },
      ],
      createdAt: now,
      ...overrides.proposal,
    },
  };
}

describe("campaign knowledge", () => {
  it("validates the curated backfill and accounts for every published fix diagnosis", async () => {
    const knowledge = parseCampaignKnowledge(
      JSON.parse(
        await readFile(
          path.join(import.meta.dirname, "data", "generation-knowledge.json"),
          "utf8"
        )
      )
    );
    const history = (await readFile(
      path.join(import.meta.dirname, "data", "campaign-loop-history.jsonl"),
      "utf8"
    ))
      .trim()
      .split("\n")
      .map(JSON.parse);
    const publishedFixIds = history.flatMap((run) =>
      run.fixes.map((fix) => `${run.id}/${fix.id}`)
    );
    const reviewedIds = knowledge.reconciliations.flatMap(({ evidenceReview }) =>
      evidenceReview.map(({ evidenceId }) => evidenceId)
    );

    expect(new Set(reviewedIds).size).toBe(reviewedIds.length);
    expect(reviewedIds).toEqual(expect.arrayContaining(publishedFixIds));
    expect(knowledge.entries.length).toBeGreaterThan(0);
    expect(
      new Set(knowledge.reconciliations.map(({ id }) => id)).size
    ).toBe(knowledge.reconciliations.length);
  });

  it("adds a supported finding and records one append-only reconciliation", () => {
    const knowledge = createEmptyCampaignKnowledge(now);
    const { proposal, context } = addProposal(knowledge);

    const updated = applyKnowledgeReconciliation(knowledge, proposal, context);

    expect(parseCampaignKnowledge(updated)).toEqual(updated);
    expect(updated.revision).toBe(1);
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0]).toMatchObject({ id: "KF-0001", revision: 1 });
    expect(updated.reconciliations).toEqual([
      expect.objectContaining({
        id: "KR-backfill-20260824",
        priorManifestDigest: knowledgeEntriesDigest(knowledge),
        resultingManifestDigest: knowledgeEntriesDigest(updated),
      }),
    ]);
  });

  it("amends a stable finding while preserving its previous guidance", () => {
    const empty = createEmptyCampaignKnowledge(now);
    const first = addProposal(empty);
    const knowledge = applyKnowledgeReconciliation(empty, first.proposal, first.context);
    const laterEvidence = {
      ...actualFailure,
      id: "campaign-2/a01-baseline",
      campaignRunId: "campaign-2",
      summary: "Immediate point checks missed a swept travel segment.",
      observedAt: "2026-08-24T19:00:00.000Z",
    };
    const context = {
      contextDigest: "2".repeat(64),
      applicableFindingIds: ["KF-0001"],
      evidence: [laterEvidence],
    };
    const proposal = {
      schemaVersion: "campaign-knowledge-reconciliation/v1",
      id: "KR-fix-20260824",
      source: {
        kind: "fix_cycle",
        loopId: "loop-1",
        fixId: "fix-cycle-2",
        triggerCampaignRunId: "campaign-2",
      },
      consultedManifestDigest: knowledgeEntriesDigest(knowledge),
      contextDigest: context.contextDigest,
      consultedFindingIds: ["KF-0001"],
      evidenceReview: [
        {
          evidenceId: laterEvidence.id,
          disposition: "incorporated",
          findingIds: ["KF-0001"],
          rationale: "The new evidence refines the prior point-check guidance.",
        },
      ],
      operations: [
        {
          type: "amend",
          findingId: "KF-0001",
          expectedRevision: 1,
          reason: "Swept movement requires segment checks, not only an early point check.",
          changes: {
            guidance:
              "Check the first and every swept travel segment before progress observation or expiry cleanup.",
          },
          evidence: [laterEvidence],
        },
      ],
      createdAt: "2026-08-24T19:00:00.000Z",
    };

    const updated = applyKnowledgeReconciliation(knowledge, proposal, context);

    expect(updated.entries[0]).toMatchObject({
      id: "KF-0001",
      revision: 2,
      guidance:
        "Check the first and every swept travel segment before progress observation or expiry cleanup.",
      amendments: [
        expect.objectContaining({
          revision: 1,
          previous: expect.objectContaining({
            guidance:
              "Schedule the first target interaction check before the first lifecycle progress observation.",
          }),
        }),
      ],
    });
  });

  it("rejects stale context, omitted findings, and incomplete evidence review", () => {
    const knowledge = createEmptyCampaignKnowledge(now);
    const added = addProposal(knowledge);
    const populated = applyKnowledgeReconciliation(
      knowledge,
      added.proposal,
      added.context
    );
    const context = {
      contextDigest: "3".repeat(64),
      applicableFindingIds: ["KF-0001"],
      evidence: [actualFailure],
    };
    const base = {
      ...addProposal(populated, {
        proposal: {
          id: "KR-no-change-20260824",
          contextDigest: context.contextDigest,
          operations: [],
          noChangeReason: "The active finding already covers this evidence.",
        },
      }).proposal,
      evidenceReview: [],
    };

    expect(() =>
      applyKnowledgeReconciliation(
        populated,
        { ...base, consultedManifestDigest: "0".repeat(64) },
        context
      )
    ).toThrow(/stale/i);
    expect(() => applyKnowledgeReconciliation(populated, base, context)).toThrow(
      /consult/i
    );
    expect(() =>
      applyKnowledgeReconciliation(
        populated,
        { ...base, consultedFindingIds: ["KF-0001"] },
        context
      )
    ).toThrow(/evidence/i);
  });

  it("enforces confidence evidence floors", () => {
    const knowledge = createEmptyCampaignKnowledge(now);
    const fixtureEvidence = {
      ...actualFailure,
      id: "campaign-isolation/a01-baseline",
      campaignRunId: "campaign-isolation",
      quality: "fixture_diagnostic",
    };
    const { proposal, context } = addProposal(knowledge, {
      evidence: [fixtureEvidence],
    });

    expect(() => applyKnowledgeReconciliation(knowledge, proposal, context)).toThrow(
      /supported.*evidence/i
    );
    expect(() =>
      applyKnowledgeReconciliation(
        knowledge,
        {
          ...proposal,
          operations: [
            {
              ...proposal.operations[0],
              entry: { ...proposal.operations[0].entry, confidence: "confirmed" },
            },
          ],
        },
        context
      )
    ).toThrow(/confirmed knowledge/i);
  });

  it("confirms, retires, and records explicit no-change reconciliations", () => {
    const empty = createEmptyCampaignKnowledge(now);
    const added = addProposal(empty);
    const supported = applyKnowledgeReconciliation(
      empty,
      added.proposal,
      added.context
    );
    const confirmingEvidence = {
      ...actualFailure,
      id: "campaign-2/a01-baseline",
      campaignRunId: "campaign-2",
      observedAt: "2026-08-24T19:00:00.000Z",
    };
    const confirmContext = {
      contextDigest: "4".repeat(64),
      applicableFindingIds: ["KF-0001"],
      evidence: [confirmingEvidence],
    };
    const confirmed = applyKnowledgeReconciliation(
      supported,
      {
        schemaVersion: "campaign-knowledge-reconciliation/v1",
        id: "KR-confirm-20260824",
        source: { kind: "campaign_outcome", campaignRunId: "campaign-2" },
        consultedManifestDigest: knowledgeEntriesDigest(supported),
        contextDigest: confirmContext.contextDigest,
        consultedFindingIds: ["KF-0001"],
        evidenceReview: [{
          evidenceId: confirmingEvidence.id,
          disposition: "confirming",
          findingIds: ["KF-0001"],
          rationale: "An independent actual campaign reproduced the finding.",
        }],
        operations: [{
          type: "confirm",
          findingId: "KF-0001",
          expectedRevision: 1,
          confidence: "confirmed",
          reason: "Independent actual-run support satisfies confirmation.",
          evidence: [confirmingEvidence],
        }],
        createdAt: "2026-08-24T19:00:00.000Z",
      },
      confirmContext
    );
    const retirementEvidence = {
      ...actualFailure,
      id: "campaign-3/a01-baseline",
      campaignRunId: "campaign-3",
      summary: "The accepted pipeline no longer contains this lifecycle surface.",
      observedAt: "2026-08-24T20:00:00.000Z",
    };
    const retireContext = {
      contextDigest: "5".repeat(64),
      applicableFindingIds: ["KF-0001"],
      evidence: [retirementEvidence],
    };
    const retired = applyKnowledgeReconciliation(
      confirmed,
      {
        schemaVersion: "campaign-knowledge-reconciliation/v1",
        id: "KR-retire-20260824",
        source: { kind: "campaign_outcome", campaignRunId: "campaign-3" },
        consultedManifestDigest: knowledgeEntriesDigest(confirmed),
        contextDigest: retireContext.contextDigest,
        consultedFindingIds: ["KF-0001"],
        evidenceReview: [{
          evidenceId: retirementEvidence.id,
          disposition: "incorporated",
          findingIds: ["KF-0001"],
          rationale: "The evidence retires obsolete guidance.",
        }],
        operations: [{
          type: "retire",
          findingId: "KF-0001",
          expectedRevision: 2,
          reason: "The lifecycle surface was removed.",
          evidence: [retirementEvidence],
        }],
        createdAt: "2026-08-24T20:00:00.000Z",
      },
      retireContext
    );
    const noChangeContext = {
      contextDigest: "6".repeat(64),
      applicableFindingIds: [],
      evidence: [],
    };
    const unchanged = applyKnowledgeReconciliation(
      retired,
      {
        schemaVersion: "campaign-knowledge-reconciliation/v1",
        id: "KR-no-change-final",
        source: { kind: "campaign_outcome", campaignRunId: "campaign-4" },
        consultedManifestDigest: knowledgeEntriesDigest(retired),
        contextDigest: noChangeContext.contextDigest,
        consultedFindingIds: [],
        evidenceReview: [],
        operations: [],
        noChangeReason: "No qualifying reusable evidence was produced.",
        createdAt: "2026-08-24T21:00:00.000Z",
      },
      noChangeContext
    );

    expect(unchanged.entries[0]).toMatchObject({
      status: "retired",
      confidence: "confirmed",
      revision: 3,
      amendments: [
        expect.objectContaining({ revision: 1 }),
        expect.objectContaining({ revision: 2 }),
      ],
    });
    expect(unchanged.reconciliations.at(-1)).toMatchObject({
      id: "KR-no-change-final",
      operations: [],
    });
  });

  it("selects exact and related active findings deterministically", () => {
    const empty = createEmptyCampaignKnowledge(now);
    const first = addProposal(empty);
    const knowledge = applyKnowledgeReconciliation(empty, first.proposal, first.context);

    expect(
      selectCampaignKnowledge(knowledge, {
        manifestId: "p09-t17-projectile",
        mechanicId: "projectile_shooting",
        stage: "source_generation",
        classification: "provider_output_rejected",
      })
    ).toMatchObject({
      applicable: [expect.objectContaining({ id: "KF-0001" })],
      related: [],
    });
    expect(
      selectCampaignKnowledge(knowledge, {
        manifestId: "p09-t18-seeded-hazard-spawner",
        mechanicId: "seeded_hazard_spawning",
        stage: "source_generation",
        classification: "provider_output_rejected",
      })
    ).toMatchObject({
      applicable: [],
      related: [expect.objectContaining({ id: "KF-0001" })],
    });
  });

  it("keeps missing linked campaign artifacts visible as unreconciled evidence", async () => {
    const missing = Object.assign(new Error("missing campaign run"), {
      code: "ENOENT",
    });
    const context = await buildCampaignKnowledgeContext({
      repoRoot: path.resolve(import.meta.dirname, "../.."),
      knowledge: createEmptyCampaignKnowledge(now),
      loopId: "loop-with-missing-evidence",
      campaignStore: {
        async initialize() {},
        async readRun() { throw missing; },
        async readAttempts() { return []; },
      },
      loopStore: {
        async initialize() {},
        async readRun() {
          return {
            id: "loop-with-missing-evidence",
            manifestPath:
              "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
            createdAt: now,
            campaignLinks: [{ campaignRunId: "missing-campaign" }],
          };
        },
        async readFixes() { return []; },
      },
      targetRoot: path.resolve(import.meta.dirname, "../.."),
    });

    expect(context.evidence).toEqual([
      expect.objectContaining({
        id: "missing-campaign/missing-campaign-evidence",
        outcome: "infrastructure_failure",
      }),
    ]);
  });
});
