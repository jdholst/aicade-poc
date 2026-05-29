import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";
import type { TopDownGameSpec } from "@/game-spec";

import type { SpecGenerationProvider } from "./spec-generation-service";

export const DEBUG_SPEC_GENERATION_FAILURE_ENV =
  "AICADE_DEBUG_SPEC_GENERATION_FAILURE";

export const debugGenerationFailureModes = [
  "missing_primary_objective",
  "missing_entity_reference",
  "invalid_validation_goal_target",
  "player_spawn_outside_arena",
  "duplicate_primary_objectives",
  "unsupported_mechanic_target",
] as const;

export type DebugGenerationFailureMode =
  (typeof debugGenerationFailureModes)[number];

type DebugGenerationFailureMutator = (candidate: TopDownGameSpec) => void;

const debugGenerationFailureMutators = {
  missing_primary_objective: (candidate) => {
    candidate.objectives = candidate.objectives.map((objective) => ({
      ...objective,
      primary: false,
    }));
  },
  missing_entity_reference: (candidate) => {
    getMechanic(candidate, "mechanic_player_movement").entityIds = [
      "entity_missing",
    ];
  },
  invalid_validation_goal_target: (candidate) => {
    candidate.validationGoals[0].objectiveId = "objective_missing";
  },
  player_spawn_outside_arena: (candidate) => {
    const scene = candidate.template.config.scenes[0];
    scene.layout.spawnZones = scene.layout.spawnZones.map((spawnZone) =>
      spawnZone.id === "spawn_player"
        ? {
            ...spawnZone,
            x: scene.arena.width + 1,
          }
        : spawnZone
    );
  },
  duplicate_primary_objectives: (candidate) => {
    candidate.objectives.push({
      id: "objective_escape_arena",
      label: "Escape arena",
      description: "Reach the exit after collecting enough crystals.",
      primary: true,
    });
    candidate.template.config.scenes[0].objectiveIds = [
      ...(candidate.template.config.scenes[0].objectiveIds ?? []),
      "objective_escape_arena",
    ];
  },
  unsupported_mechanic_target: (candidate) => {
    getMechanic(candidate, "mechanic_player_movement").entityIds = [
      "entity_crystal",
    ];
  },
} satisfies Record<DebugGenerationFailureMode, DebugGenerationFailureMutator>;

export function createDebugSpecGenerationProvider({
  mode,
}: {
  mode: DebugGenerationFailureMode;
}): SpecGenerationProvider {
  return async ({ prompt }) => {
    const candidate = structuredClone(getFirstValidTopDownGameSpecFixture());

    candidate.originalPrompt = prompt;
    debugGenerationFailureMutators[mode](candidate);

    return candidate;
  };
}

export function parseDebugGenerationFailureMode(
  value: unknown
): DebugGenerationFailureMode | null {
  if (typeof value !== "string") {
    return null;
  }

  return debugGenerationFailureModes.includes(
    value as DebugGenerationFailureMode
  )
    ? (value as DebugGenerationFailureMode)
    : null;
}

function getMechanic(candidate: TopDownGameSpec, mechanicId: string) {
  const mechanic = candidate.mechanics.find(({ id }) => id === mechanicId);

  if (!mechanic) {
    throw new Error(`Debug fixture is missing mechanic "${mechanicId}".`);
  }

  return mechanic;
}
