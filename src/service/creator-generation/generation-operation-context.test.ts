import { describe, expect, it } from "vitest";

import {
  createGenerationOperationContext,
  projectGenerationOperationContextForServer,
} from "./generation-operation-context";

describe("Generation Operation Context", () => {
  it("retains one immutable creator-operation identity and exposes only a JSON projection", () => {
    const abortController = new AbortController();
    const context = createGenerationOperationContext({
      acceptedLineage: [],
      cancellationEpoch: 0,
      generationRunId: "generation_run_context",
      requestSummary: "Make the player leave a glowing trail.",
      routeKind: "generated_mechanic",
      runtimeKind: "phaser",
      signal: abortController.signal,
      trustMode: "browser_authenticated",
    });

    expect(context).toMatchObject({
      generationRunId: "generation_run_context",
      routeKind: "generated_mechanic",
      runtimeKind: "phaser",
      trustMode: "browser_authenticated",
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(projectGenerationOperationContextForServer(context)).toEqual({
      cancellationEpoch: 0,
      generationRunId: "generation_run_context",
      requestSummary: "Make the player leave a glowing trail.",
      routeKind: "generated_mechanic",
      runtimeKind: "phaser",
      trustMode: "browser_authenticated",
    });
    expect(JSON.stringify(projectGenerationOperationContextForServer(context))).not.toContain(
      "AbortSignal"
    );
  });

  it("snapshots accepted lineage instead of retaining caller-owned arrays", () => {
    const lineage = ["artifact_contract"];
    const context = createGenerationOperationContext({
      acceptedLineage: lineage,
      cancellationEpoch: 1,
      generationRunId: "generation_run_lineage",
      requestSummary: "Generate a mechanic.",
      routeKind: "generated_mechanic",
      runtimeKind: "phaser",
      signal: new AbortController().signal,
      trustMode: "browser_authenticated",
    });

    lineage.push("artifact_mutated");

    expect(context.acceptedLineage).toEqual(["artifact_contract"]);
    expect(Object.isFrozen(context.acceptedLineage)).toBe(true);
  });
});
