import { describe, expect, it } from "vitest";

import type { TopDownGameSpec } from "@/game-spec";
import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import type { CreatorGenerationRoutingFailure } from "./degraded-generation-fallback-policy";
import { evaluateDegradedGenerationFallback } from "./degraded-generation-fallback-policy";

const capabilityGap = {
  kind: "capability_gap",
  generationRunId: "generation_run_degraded_policy",
  intentId: "intent_optional_dash",
  evidence: {
    stage: "routing",
    code: "capability_gap",
    missingCapabilities: ["object_motion_write"],
    issues: [
      {
        path: "intent.requiredCapabilities",
        code: "missing_capability",
        message: "The selected host cannot prove the optional behavior.",
      },
    ],
  },
} as const satisfies CreatorGenerationRoutingFailure;

describe("evaluateDegradedGenerationFallback", () => {
  it("deterministically admits a pre-generation capability gap for an independent built-in collection game", () => {
    const baseGameSpec = getFirstValidTopDownGameSpecFixture();
    const input = {
      baseGameSpec,
      generatedWorkState: "not_started" as const,
      routingFailure: capabilityGap,
    };

    const first = evaluateDegradedGenerationFallback(input);
    const second = evaluateDegradedGenerationFallback(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      kind: "eligible",
      warning: {
        intentId: "intent_optional_dash",
        generatedWorkState: "not_started",
        fallbackValidation: {
          gameSpecId: baseGameSpec.id,
          status: "passed",
        },
      },
    });
  });

  it.each(["started", "persisted", "ambiguous"] as const)(
    "keeps %s generated work fatal",
    (generatedWorkState) => {
      expect(
        evaluateDegradedGenerationFallback({
          baseGameSpec: getFirstValidTopDownGameSpecFixture(),
          generatedWorkState,
          routingFailure: capabilityGap,
        })
      ).toMatchObject({
        kind: "fatal",
        issues: [{ code: "generated_work_already_started" }],
      });
    }
  );

  it.each([
    {
      kind: "clarification_failure" as const,
      evidence: {
        stage: "routing" as const,
        code: "clarification_required" as const,
        issues: [
          {
            path: "intent.ambiguities.0",
            code: "unresolved_ambiguity",
            message: "The intent cannot be safely inferred.",
          },
        ],
      },
    },
    {
      kind: "constraint_conflict" as const,
      evidence: {
        stage: "routing" as const,
        code: "generated_mechanic_limit_exceeded" as const,
        issues: [
          {
            path: "intent",
            code: "generated_mechanic_limit_exceeded",
            message: "The request exceeds the current generated mechanic limit.",
          },
        ],
      },
    },
  ])("keeps $kind fatal until requirement ownership is trusted", (failure) => {
    expect(
      evaluateDegradedGenerationFallback({
        baseGameSpec: getFirstValidTopDownGameSpecFixture(),
        generatedWorkState: "not_started",
        routingFailure: {
          ...failure,
          generationRunId: "generation_run_fatal_policy",
          intentId: "intent_fatal_policy",
        },
      })
    ).toMatchObject({
      kind: "fatal",
      issues: [{ code: "routing_failure_not_eligible" }],
    });
  });

  it("rejects a base spec with extension lineage", () => {
    const baseGameSpec = {
      ...getFirstValidTopDownGameSpecFixture(),
      extensions: {
        generatedMechanic: {
          artifactId: "artifact_untrusted",
        },
      },
    } satisfies TopDownGameSpec;

    expect(
      evaluateDegradedGenerationFallback({
        baseGameSpec,
        generatedWorkState: "not_started",
        routingFailure: capabilityGap,
      })
    ).toMatchObject({
      kind: "fatal",
      issues: [{ code: "generated_extension_dependency_present" }],
    });
  });

  it("removes unresolved mechanic connection lineage from the independently playable base spec", () => {
    const baseGameSpec = {
      ...getFirstValidTopDownGameSpecFixture(),
      mechanicConnections: {
        schemaVersion: "mechanic_port_connections/v1",
        connections: [
          {
            id: "connection_unresolved",
            output: {
              ownerKind: "mechanic",
              ownerId: "mechanic_generated_missing",
              portId: "dash_started",
            },
            input: {
              ownerKind: "game_system",
              ownerId: "trusted_runtime",
              portId: "effect_applied",
            },
          },
        ],
      },
    } satisfies TopDownGameSpec;

    const result = evaluateDegradedGenerationFallback({
      baseGameSpec,
      generatedWorkState: "not_started",
      routingFailure: capabilityGap,
    });

    expect(result).toMatchObject({
      kind: "eligible",
      baseGameSpec: {
        id: baseGameSpec.id,
        mechanicConnections: {
          schemaVersion: "mechanic_port_connections/v1",
          connections: [],
        },
      },
    });
    expect(baseGameSpec.mechanicConnections.connections).toHaveLength(1);
  });

  it("admits isolated intent-transport failure without inventing an intent identity", () => {
    const result = evaluateDegradedGenerationFallback({
      baseGameSpec: getFirstValidTopDownGameSpecFixture(),
      generatedWorkState: "not_started",
      routingFailure: {
        kind: "intent_validation_failure",
        generationRunId: "generation_run_invalid_intent_policy",
        evidence: {
          stage: "routing",
          code: "invalid_intent_transport",
          issues: [
            {
              path: "mechanicIntent",
              code: "invalid_intent_transport",
              message:
                "Mechanic Intent did not match the planning transport schema.",
            },
          ],
        },
      },
    });

    expect(result).toMatchObject({
      kind: "eligible",
      warning: {
        code: "generated_mechanic_omitted",
      },
    });
    if (result.kind === "eligible") {
      expect(result.warning).not.toHaveProperty("intentId");
    }
  });

  it("rejects a base spec whose primary objective has no trusted progress mechanic", () => {
    const fixture = getFirstValidTopDownGameSpecFixture();
    const baseGameSpec = {
      ...fixture,
      mechanics: fixture.mechanics.filter(
        (mechanic) => mechanic.type !== "pickup_collection"
      ),
    } as TopDownGameSpec;

    expect(
      evaluateDegradedGenerationFallback({
        baseGameSpec,
        generatedWorkState: "not_started",
        routingFailure: capabilityGap,
      })
    ).toMatchObject({
      kind: "fatal",
      issues: [{ code: "base_game_spec_invalid" }],
    });
  });
});
