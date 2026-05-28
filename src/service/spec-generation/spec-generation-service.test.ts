import { describe, expect, it } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import {
  generateTopDownGameSpec,
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
});

function getMutableFixture() {
  return structuredClone(getFirstValidTopDownGameSpecFixture());
}
