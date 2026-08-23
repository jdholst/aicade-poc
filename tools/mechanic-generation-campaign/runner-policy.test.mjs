import { describe, expect, it } from "vitest";

import { createRevisionKey } from "./lib/revision.mjs";
import {
  classifyFurthestStage,
  createAttemptSchedule,
  createLoopbackBaseUrl,
  resolveProviderCredentialInput,
  resolveProviderModes,
} from "./lib/runner-policy.mjs";

const prompts = [
  { id: "baseline", text: "Baseline" },
  { id: "plain_paraphrase", text: "Paraphrase" },
  { id: "constraints_first", text: "Constraints" },
  { id: "outcomes_first", text: "Outcomes" },
  { id: "compact", text: "Compact" },
];

describe("campaign runner policy", () => {
  it("uses the editor's canonical localhost origin for a dedicated loopback server", () => {
    expect(createLoopbackBaseUrl(3117)).toBe("http://localhost:3117");
  });

  it("schedules ten exact prompts for repeatability and two of every prompt for variation", () => {
    expect(createAttemptSchedule("repeatability", prompts)).toEqual(
      Array.from({ length: 10 }, (_, index) => ({
        sequence: index + 1,
        promptId: "baseline",
        prompt: "Baseline",
      }))
    );
    expect(createAttemptSchedule("variation", prompts)).toEqual(
      prompts.flatMap((prompt, promptIndex) => [1, 2].map((run) => ({
        sequence: promptIndex * 2 + run,
        promptId: prompt.id,
        prompt: prompt.text,
      })))
    );
  });

  it("requires actual planning for variation", () => {
    expect(() =>
      resolveProviderModes(
        "variation",
        { planning: "fixture", contract: "actual", source: "actual" },
        { planning: { path: "fixture.json", sha256: "a".repeat(64) } }
      )
    ).toThrow(/actual planning/i);
  });

  it("uses a non-secret placeholder only when every provider stage is fixture-backed", () => {
    const manifest = {
      credential: { source: "keyword_env", envName: "AICADE_CAMPAIGN_KEYWORD" },
    };

    expect(
      resolveProviderCredentialInput(
        manifest,
        { planning: "fixture", contract: "fixture", source: "fixture" },
        {}
      )
    ).toEqual({ kind: "keyword", value: "Fixture Only" });

    expect(
      resolveProviderCredentialInput(
        manifest,
        { planning: "fixture", contract: "actual", source: "actual" },
        { AICADE_CAMPAIGN_KEYWORD: "authorized keyword" }
      )
    ).toEqual({ kind: "keyword", value: "authorized keyword" });
  });

  it("classifies the deepest stage conservatively from captured evidence", () => {
    expect(
      classifyFurthestStage({
        providerCalls: { planning: 0, contract: 0, source: 0 },
        fixtureCalls: { planning: 1, contract: 1, source: 4 },
      })
    ).toBe("source_generation");

    expect(
      classifyFurthestStage({
        providerCalls: { planning: 1, contract: 2, source: 1 },
        generationRun: { stage: "artifact_evaluation", status: "failed" },
        gamePack: null,
        runtimeMounted: false,
        runtimeHealthy: false,
        cleanupPassed: false,
        externalProbePassed: false,
      })
    ).toBe("deterministic_evaluation");

    expect(
      classifyFurthestStage({
        providerCalls: { planning: 1, contract: 1, source: 1 },
        generationRun: { status: "succeeded" },
        gamePack: { id: "pack-1" },
        runtimeMounted: true,
        runtimeHealthy: true,
        cleanupPassed: true,
        externalProbePassed: true,
      })
    ).toBe("external_mechanic_probe");
  });

  it("creates a stable revision identity from commit, diff, and untracked content hashes", () => {
    const input = {
      head: "abc123",
      diff: "diff --git a/a b/a",
      untracked: [
        { path: "z.json", sha256: "2".repeat(64) },
        { path: "a.json", sha256: "1".repeat(64) },
      ],
    };

    expect(createRevisionKey(input)).toBe(
      createRevisionKey({ ...input, untracked: [...input.untracked].reverse() })
    );
    expect(createRevisionKey(input)).not.toBe(
      createRevisionKey({ ...input, diff: "different" })
    );
  });
});
