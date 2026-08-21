import { describe, expect, it } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import {
  creatorGenerationPlanJsonSchema,
  parseCreatorGenerationPlanEnvelope,
  parseCreatorGenerationPlanEnvelopeParts,
} from "./creator-generation-planning-schema";

describe("creator-generation planning transport", () => {
  it("rejects unresolved planner ambiguities and retains explicit reversible assumptions", () => {
    expect(() =>
      parseCreatorGenerationPlanEnvelope({
        gameSpec: getFirstValidTopDownGameSpecFixture(),
        mechanicIntent: createTransportIntent({
          ambiguities: [
            {
              id: "ambiguity_dash_direction",
              description: "The dash direction was not specified.",
              inferredValue: null,
              rationale: null,
              reversible: null,
            },
          ],
        }),
      })
    ).toThrow();

    const envelope = parseCreatorGenerationPlanEnvelope({
      gameSpec: getFirstValidTopDownGameSpecFixture(),
      mechanicIntent: createTransportIntent({
        ambiguities: [
          {
            id: "ambiguity_dash_direction",
            description: "The dash direction was not specified.",
            inferredValue: "current_movement_direction",
            rationale:
              "Following the actor's current movement preserves player intent.",
            reversible: true,
          },
        ],
      }),
    });

    expect(envelope.mechanicIntent.ambiguities).toEqual([
      {
        id: "ambiguity_dash_direction",
        description: "The dash direction was not specified.",
        inferredValue: "current_movement_direction",
        rationale:
          "Following the actor's current movement preserves player intent.",
        reversible: true,
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

  it("retains a bounded base Game Spec when only the Mechanic Intent transport is invalid", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();

    expect(
      parseCreatorGenerationPlanEnvelopeParts({
        gameSpec,
        mechanicIntent: {
          ...createTransportIntent(),
          generatedSource: "return null",
        },
      })
    ).toEqual({
      gameSpec,
      mechanicIntent: {
        status: "invalid",
        summary: "Move the player with logical directional input.",
        issues: [
          {
            path: "mechanicIntent",
            code: "invalid_intent_transport",
            message: "Mechanic Intent did not match the planning transport schema.",
          },
        ],
      },
    });
  });

  it("bounds malformed intent evidence to the client transport limit", () => {
    const result = parseCreatorGenerationPlanEnvelopeParts({
      gameSpec: getFirstValidTopDownGameSpecFixture(),
      mechanicIntent: createTransportIntent({
        references: Array.from({ length: 128 }, () => ({})),
      }),
    });

    expect(result.mechanicIntent.status).toBe("invalid");
    if (result.mechanicIntent.status !== "invalid") {
      throw new Error("Expected invalid intent transport evidence.");
    }
    expect(result.mechanicIntent.issues).toHaveLength(128);
    expect(result.mechanicIntent.issues.at(-1)).toEqual({
      path: "mechanicIntent",
      code: "invalid_intent_transport",
      message:
        "Additional Mechanic Intent transport issues were omitted from this bounded report.",
    });
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
    expect(
      creatorGenerationPlanJsonSchema.properties.gameSpec.properties.controls
        .items.properties.keys.items.enum
    ).toEqual([
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
    ]);
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
