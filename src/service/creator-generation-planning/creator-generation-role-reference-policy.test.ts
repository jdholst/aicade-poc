import { describe, expect, it } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { applyTopDownCreatorRoleReferencePolicy } from "./creator-generation-role-reference-policy";

describe("applyTopDownCreatorRoleReferencePolicy", () => {
  it("leaves ambiguous role matches unresolved so routing can fail closed", () => {
    const gameSpec = structuredClone(getFirstValidTopDownGameSpecFixture());
    gameSpec.entities.push({
      id: "entity_hazard_two",
      role: "hazard",
      name: "Second Hazard",
    });
    const intent = createGeneratedHostIntent();

    const result = applyTopDownCreatorRoleReferencePolicy(intent, gameSpec);

    expect(result).toBe(intent);
  });

  it("does not duplicate an entity reference that already represents the role", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const intent = {
      ...createGeneratedHostIntent(),
      references: [{ kind: "entity" as const, id: "entity_hazard" }],
    };

    const result = applyTopDownCreatorRoleReferencePolicy(intent, gameSpec);

    expect(result).toBe(intent);
  });

  it("does not alter an intent outside the generated-host profile", () => {
    const gameSpec = getFirstValidTopDownGameSpecFixture();
    const intent = {
      ...createGeneratedHostIntent(),
      triggers: ["logical_move_action"],
      requiredCapabilities: ["entity_motion"],
    };

    const result = applyTopDownCreatorRoleReferencePolicy(intent, gameSpec);

    expect(result).toBe(intent);
  });
});

function createGeneratedHostIntent() {
  return {
    id: "intent_seeded_hazard_spawner",
    summary: "Create seeded hazards on a recurring autonomous schedule.",
    triggers: ["install"],
    actors: ["hazard"],
    targets: [],
    behaviors: ["spawn_hazards"],
    ownedObjects: ["spawned_hazard"],
    stateChanges: [],
    temporalRules: ["spawn_on_schedule", "destroy_after_lifetime"],
    spatialRules: ["spawn_at_seeded_arena_position"],
    constraints: ["bounded_active_hazards"],
    configuration: [],
    connections: [],
    references: [],
    outcomes: ["hazards_are_visible"],
    requiredCapabilities: [
      "object_create",
      "object_destroy",
      "time_schedule",
      "random_next",
    ],
    ambiguities: [],
  };
}
