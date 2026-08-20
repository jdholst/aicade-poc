import { describe, expect, it } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import {
  creatorGenerationPlanJsonSchema,
  parseCreatorGenerationPlanEnvelope,
} from "./creator-generation-planning-schema";

describe("creator-generation planning transport", () => {
  it("normalizes explicit null ambiguity fields into an unresolved Mechanic Intent", () => {
    const envelope = parseCreatorGenerationPlanEnvelope({
      gameSpec: getFirstValidTopDownGameSpecFixture(),
      mechanicIntent: createTransportIntent({
        ambiguities: [
          {
            id: "ambiguity_actor",
            description: "The requested actor is unclear.",
            inferredValue: null,
            rationale: null,
            reversible: null,
          },
        ],
      }),
    });

    expect(envelope.mechanicIntent.ambiguities).toEqual([
      {
        id: "ambiguity_actor",
        description: "The requested actor is unclear.",
      },
    ]);
  });

  it("rejects unknown envelope and Mechanic Intent fields", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();

    expect(() =>
      parseCreatorGenerationPlanEnvelope({
        gameSpec,
        mechanicIntent: createTransportIntent(),
        route: "generated_mechanic",
      })
    ).toThrow();
    expect(() =>
      parseCreatorGenerationPlanEnvelope({
        gameSpec,
        mechanicIntent: {
          ...createTransportIntent(),
          generatedSource: "return null",
        },
      })
    ).toThrow();
  });

  it("publishes a strict combined Structured Outputs schema", () => {
    expect(creatorGenerationPlanJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["gameSpec", "mechanicIntent"],
      properties: {
        gameSpec: {
          type: "object",
        },
        mechanicIntent: {
          type: "object",
          additionalProperties: false,
          required: expect.arrayContaining([
            "id",
            "summary",
            "requiredCapabilities",
            "ambiguities",
          ]),
        },
      },
    });

    const serialized = JSON.stringify(creatorGenerationPlanJsonSchema);
    expect(serialized).toContain("template_top_down");
    expect(serialized).not.toContain('"additionalProperties":true');
    expect(serialized).not.toContain('"oneOf"');
  });
});

function createTransportIntent(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "intent_player_movement",
    summary: "Move the player with logical directional input.",
    triggers: ["logical_move_action"],
    actors: ["player"],
    targets: [],
    behaviors: ["move_actor"],
    ownedObjects: [],
    stateChanges: [],
    temporalRules: [],
    spatialRules: ["remain_inside_arena"],
    constraints: [],
    configuration: [{ key: "speed", value: 180 }],
    connections: [{ direction: "input", port: "move_action" }],
    references: [{ kind: "entity", id: "entity_player" }],
    outcomes: ["actor_position_changes"],
    requiredCapabilities: ["logical_input", "entity_motion"],
    ambiguities: [],
    ...overrides,
  };
}
