import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  importLegacyAttemptReports,
  parseTemporaryFixLedger,
} from "./lib/legacy-importer.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("legacy campaign evidence import", () => {
  it("normalizes all 80 historical attempt sections with stable composite IDs", async () => {
    const attempts = await importLegacyAttemptReports(repoRoot);

    expect(attempts).toHaveLength(80);
    expect(new Set(attempts.map((attempt) => attempt.id)).size).toBe(80);
    expect(attempts.map((attempt) => attempt.id)).toContain(
      "legacy:p09-t17-r3:a04"
    );
    expect(attempts.every((attempt) => attempt.source.path.startsWith("docs/"))).toBe(true);
    expect(attempts.every((attempt) => attempt.source.heading.includes("Attempt"))).toBe(true);
    expect(attempts.every((attempt) => ["complete", "partial", "narrative_only"].includes(attempt.completeness))).toBe(true);
  });

  it("preserves the later actor-origin correction separately from the recorded success", async () => {
    const attempts = await importLegacyAttemptReports(repoRoot);
    const corrected = attempts.find(
      (attempt) => attempt.id === "legacy:p09-t17-r3:a04"
    );

    expect(corrected.recordedOutcome).toMatch(/accepted and visibly playable/i);
    expect(corrected.adjudicatedOutcome).toMatch(/center fallback|prove origin/i);
    expect(corrected.adjudicationSource).toMatchObject({
      path: "docs/phase-09-ticket-17-real-provider-attempts-round-3.md",
      heading: expect.stringMatching(/Post-success QA correction/i),
    });
  });

  it("marks historical recorded successes as manually approved with legacy provenance", async () => {
    const attempts = await importLegacyAttemptReports(repoRoot);
    const approved = attempts.filter(
      ({ manualQa }) => manualQa?.status === "approved"
    );

    expect(approved).toHaveLength(3);
    expect(
      approved.every(
        ({ manualQa }) => manualQa.provenance === "legacy_assumed"
      )
    ).toBe(true);
    expect(
      attempts
        .filter(({ manualQa }) => manualQa?.status !== "approved")
        .every(({ manualQa }) => manualQa?.status === "not_applicable")
    ).toBe(true);
  });

  it("normalizes all 32 temporary fixes without dropping replacement metadata", async () => {
    const fixes = await parseTemporaryFixLedger(repoRoot);

    expect(fixes).toHaveLength(32);
    expect(new Set(fixes.map((fix) => fix.id)).size).toBe(32);
    expect(fixes.find((fix) => fix.id === "TF-28")).toMatchObject({
      state: "retired",
      robustReplacement: expect.stringMatching(/mechanic-generation-campaign/i),
    });
    expect(fixes.every((fix) => fix.source.path.endsWith("temporary-fix-ledger.md"))).toBe(true);
  });
});
