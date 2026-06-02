import { describe, expect, it } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import {
  generateTopDownGameSpec,
  SpecGenerationProviderError,
  type SpecGenerationFailureStage,
} from "./spec-generation-service";

describe("Spec Generation service contract", () => {
  it("returns a validated top-down Game Spec with provider-neutral metadata", async () => {
    const fixture = getFirstValidTopDownGameSpecFixture();

    const result = await generateTopDownGameSpec({
      prompt: "Make a tiny top-down collection game.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => fixture,
    });

    expect(result).toEqual({
      ok: true,
      spec: fixture,
      metadata: {
        taskRoute: "spec_generation.primary",
        model: "gpt-5.4-mini",
        attemptCount: 1,
      },
    });
  });

  it("repairs one invalid candidate with exact validation issues", async () => {
    const invalidCandidate = getMutableFixture();
    invalidCandidate.mechanics[0].entityIds = ["entity_missing"];
    const repairedCandidate = getMutableFixture();
    const providerCalls: unknown[] = [];

    const result = await generateTopDownGameSpec({
      prompt: "Make a tiny top-down collection game.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async (input) => {
        providerCalls.push(input);

        return providerCalls.length === 1 ? invalidCandidate : repairedCandidate;
      },
    });

    expect(result).toEqual({
      ok: true,
      spec: repairedCandidate,
      metadata: {
        taskRoute: "spec_generation.primary",
        model: "gpt-5.4-mini",
        attemptCount: 2,
        repairStatus: "repaired",
        repairAttempts: [
          {
            attempt: 1,
            outcome: "failed_validation",
            stage: "semantic_validation",
            issues: [
              {
                path: "mechanics.mechanic_player_movement.entityIds",
                message: 'Unknown entity ID "entity_missing".',
              },
            ],
          },
        ],
      },
    });
    expect(providerCalls).toEqual([
      {
        prompt: "Make a tiny top-down collection game.",
        model: "gpt-5.4-mini",
        providerCredential: "sk-test",
        taskRoute: "spec_generation.primary",
      },
      {
        prompt: "Make a tiny top-down collection game.",
        model: "gpt-5.4-mini",
        providerCredential: "sk-test",
        taskRoute: "spec_generation.primary",
        repairContext: {
          failedAttempt: 1,
          invalidCandidate,
          stage: "semantic_validation",
          validationIssues: [
            {
              path: "mechanics.mechanic_player_movement.entityIds",
              message: 'Unknown entity ID "entity_missing".',
            },
          ],
        },
      },
    ]);
  });

  it("returns structured validation failure when the repair candidate is still invalid", async () => {
    const invalidCandidate = getMutableFixture();
    invalidCandidate.mechanics[0].entityIds = ["entity_missing"];
    const invalidRepairCandidate = getMutableFixture();
    invalidRepairCandidate.objectives.push({
      id: "objective_escape",
      label: "Escape",
      description: "Reach the exit.",
      primary: true,
    });

    const result = await generateTopDownGameSpec({
      prompt: "Make a tiny top-down collection game.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async (input) =>
        input.repairContext ? invalidRepairCandidate : invalidCandidate,
      includeDebugCandidate: true,
    });

    expect(result).toMatchObject({
      ok: false,
      stage: "semantic_validation",
      userMessage:
        "I designed a game plan, but it did not pass validation. Please try a simpler prompt.",
      taskRoute: "spec_generation.primary",
      attemptCount: 2,
      debugCandidate: invalidRepairCandidate,
      repairAttempts: [
        {
          attempt: 1,
          outcome: "failed_validation",
          stage: "semantic_validation",
          issues: [
            {
              path: "mechanics.mechanic_player_movement.entityIds",
              message: 'Unknown entity ID "entity_missing".',
            },
          ],
        },
        {
          attempt: 2,
          outcome: "repair_failed",
          stage: "semantic_validation",
          issues: expect.arrayContaining([
            expect.objectContaining({
              path: "objectives",
              message: "Expected exactly one primary objective.",
            }),
          ]),
        },
      ],
    });
    expect(result.validationIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "objectives",
          message: "Expected exactly one primary objective.",
        }),
      ])
    );
  });

  it("caps invalid-spec repair at one provider retry", async () => {
    const invalidCandidate = getMutableFixture();
    invalidCandidate.mechanics[0].entityIds = ["entity_missing"];
    const providerCalls: unknown[] = [];

    const result = await generateTopDownGameSpec({
      prompt: "Make a tiny top-down collection game.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async (input) => {
        providerCalls.push(input);

        return invalidCandidate;
      },
      includeDebugCandidate: true,
    });

    expect(providerCalls).toHaveLength(2);
    expect(providerCalls[0]).not.toHaveProperty("repairContext");
    expect(providerCalls[1]).toMatchObject({
      repairContext: {
        failedAttempt: 1,
      },
    });
    expect(result).toMatchObject({
      ok: false,
      attemptCount: 2,
      debugCandidate: invalidCandidate,
      repairAttempts: [
        expect.objectContaining({
          attempt: 1,
          outcome: "failed_validation",
        }),
        expect.objectContaining({
          attempt: 2,
          outcome: "repair_failed",
        }),
      ],
    });
  });

  it.each([
    {
      name: "wrong template id",
      stage: "schema_validation",
      mutate: (spec: ReturnType<typeof getMutableFixture>) => {
        spec.template.id = "template_canvas";
      },
      expectedPath: "template.id",
    },
    {
      name: "invalid stable ID",
      stage: "schema_validation",
      mutate: (spec: ReturnType<typeof getMutableFixture>) => {
        spec.id = "invalid stable id";
      },
      expectedPath: "id",
    },
    {
      name: "unsupported mechanic type",
      stage: "mechanic_validation",
      mutate: (spec: ReturnType<typeof getMutableFixture>) => {
        spec.mechanics[0].type = "teleport_player";
      },
      expectedPath: `mechanics.${getMutableFixture().mechanics[0].id}.type`,
    },
    {
      name: "missing entity reference",
      stage: "semantic_validation",
      mutate: (spec: ReturnType<typeof getMutableFixture>) => {
        spec.mechanics[0].entityIds = ["entity_missing"];
      },
      expectedPath: `mechanics.${getMutableFixture().mechanics[0].id}.entityIds`,
    },
    {
      name: "missing pickup-zone coverage",
      stage: "mechanic_validation",
      mutate: (spec: ReturnType<typeof getMutableFixture>) => {
        spec.template.config.scenes[0].layout.pickupZones = [];
      },
      expectedPath: `mechanics.${
        getMutableFixture().mechanics.find(
          (mechanic) => mechanic.type === "pickup_collection"
        )?.id
      }.assetIds`,
    },
    {
      name: "duplicate primary objectives",
      stage: "semantic_validation",
      mutate: (spec: ReturnType<typeof getMutableFixture>) => {
        spec.objectives.push({
          id: "objective_escape",
          label: "Escape",
          description: "Reach the exit.",
          primary: true,
        });
      },
      expectedPath: "objectives",
    },
  ] satisfies {
    name: string;
    stage: SpecGenerationFailureStage;
    mutate: (spec: ReturnType<typeof getMutableFixture>) => void;
    expectedPath: string;
  }[])(
    "rejects invalid AI output for $name with structured issues",
    async ({ stage, mutate, expectedPath }) => {
      const candidate = getMutableFixture();
      mutate(candidate);

      const result = await generateTopDownGameSpec({
        prompt: "Make a tiny top-down collection game.",
        model: "gpt-5.4-mini",
        providerCredential: "sk-test",
        provider: async () => candidate,
        includeDebugCandidate: true,
        repairEnabled: false,
      });

      expect(result).toMatchObject({
        ok: false,
        stage,
        userMessage: expect.any(String),
        taskRoute: "spec_generation.primary",
        attemptCount: 1,
        debugCandidate: candidate,
      });
      expect(result.validationIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expectedPath,
            message: expect.any(String),
          }),
        ])
      );
    }
  );

  it.each([
    {
      name: "source-code shaped output",
      candidate: {
        ...getMutableFixture(),
        moduleSourceTs: "const phaserSource = 'not allowed';",
      },
    },
    {
      name: "Game Pack shaped output",
      candidate: {
        project: {
          name: "Wrong Artifact",
          summary: "This is a Game Pack, not a TopDownGameSpec.",
        },
        manifest: {
          runtime: "canvas2d",
        },
        moduleSourceTs: "globalThis.createGameModule = function () {};",
      },
    },
  ])("rejects $name from provider output", async ({ candidate }) => {
    const result = await generateTopDownGameSpec({
      prompt: "Make a tiny top-down collection game.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => candidate,
      includeDebugCandidate: true,
      repairEnabled: false,
    });

    expect(result).toMatchObject({
      ok: false,
      stage: "schema_validation",
      taskRoute: "spec_generation.primary",
      attemptCount: 1,
      debugCandidate: candidate,
    });
    expect(result.validationIssues.length).toBeGreaterThan(0);
  });

  it("returns a model generation failure when the provider request fails", async () => {
    const result = await generateTopDownGameSpec({
      prompt: "Make a tiny top-down collection game.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => {
        throw new Error("Provider unavailable.");
      },
    });

    expect(result).toEqual({
      ok: false,
      userMessage:
        "I couldn't design a game plan from that prompt. Please try again.",
      stage: "model_generation",
      validationIssues: [],
      taskRoute: "spec_generation.primary",
      attemptCount: 1,
    });
  });

  it("adds provider debug details to model-generation failures when enabled", async () => {
    const result = await generateTopDownGameSpec({
      prompt: "Make a tiny top-down collection game.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      provider: async () => {
        throw new SpecGenerationProviderError("OpenAI rejected the request.", {
          code: "invalid_json_schema",
          message: "OpenAI rejected the request.",
          provider: "openai",
          requestId: "req_debug_123",
          status: 400,
          type: "invalid_request_error",
        });
      },
      includeDebugCandidate: true,
    });

    expect(result).toMatchObject({
      ok: false,
      stage: "model_generation",
      debugProviderError: {
        code: "invalid_json_schema",
        message: "OpenAI rejected the request.",
        provider: "openai",
        requestId: "req_debug_123",
        status: 400,
        type: "invalid_request_error",
      },
    });
  });
});

function getMutableFixture() {
  return structuredClone(getFirstValidTopDownGameSpecFixture());
}
