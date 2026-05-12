import {
  parseTopDownGameSpec,
  type TopDownGameSpec,
} from "./top-down-spec-schema";
import type { StableId } from "./game-spec-schema";

export type GameSpecValidationIssue = {
  path: string;
  message: string;
};

export class GameSpecValidationError extends Error {
  constructor(public readonly issues: GameSpecValidationIssue[]) {
    super(
      `Game Spec validation failed: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join(" ")}`
    );
    this.name = "GameSpecValidationError";
  }
}

const supportedTopDownMechanicTypes = new Set([
  "enemy_chase",
  "pickup_collection",
  "player_movement",
]);

function toIdSet(items: Array<{ id: StableId }>): Set<StableId> {
  return new Set(items.map((item) => item.id));
}

function addUnknownReferenceIssues(
  issues: GameSpecValidationIssue[],
  path: string,
  referenceIds: StableId[] | undefined,
  knownIds: Set<StableId>,
  label: string
) {
  for (const referenceId of referenceIds ?? []) {
    if (!knownIds.has(referenceId)) {
      issues.push({
        path,
        message: `Unknown ${label} ID "${referenceId}".`,
      });
    }
  }
}

export function getTopDownGameSpecValidationIssues(
  spec: TopDownGameSpec
): GameSpecValidationIssue[] {
  const issues: GameSpecValidationIssue[] = [];
  const objectiveIds = toIdSet(spec.objectives);
  const validationGoalIds = toIdSet(spec.validationGoals);
  const entityIds = toIdSet(spec.entities);
  const assetIds = toIdSet(spec.assets);

  const primaryObjectives = spec.objectives.filter(
    (objective) => objective.primary
  );

  if (primaryObjectives.length !== 1) {
    issues.push({
      path: "objectives",
      message: "Expected exactly one primary objective.",
    });
  }

  for (const validationGoal of spec.validationGoals) {
    addUnknownReferenceIssues(
      issues,
      `validationGoals.${validationGoal.id}.objectiveId`,
      validationGoal.objectiveId ? [validationGoal.objectiveId] : undefined,
      objectiveIds,
      "objective"
    );
  }

  for (const mechanic of spec.mechanics) {
    if (!supportedTopDownMechanicTypes.has(mechanic.type)) {
      issues.push({
        path: `mechanics.${mechanic.id}.type`,
        message: `Unsupported mechanic type "${mechanic.type}".`,
      });
    }

    addUnknownReferenceIssues(
      issues,
      `mechanics.${mechanic.id}.targetIds`,
      mechanic.targetIds,
      entityIds,
      "entity"
    );
    addUnknownReferenceIssues(
      issues,
      `mechanics.${mechanic.id}.objectiveIds`,
      mechanic.objectiveIds,
      objectiveIds,
      "objective"
    );
  }

  for (const scene of spec.template.config.scenes) {
    addUnknownReferenceIssues(
      issues,
      `scenes.${scene.id}.objectiveIds`,
      scene.objectiveIds,
      objectiveIds,
      "objective"
    );
    addUnknownReferenceIssues(
      issues,
      `scenes.${scene.id}.validationGoalIds`,
      scene.validationGoalIds,
      validationGoalIds,
      "validation goal"
    );

    for (const spawnZone of scene.layout.spawnZones) {
      addUnknownReferenceIssues(
        issues,
        `scenes.${scene.id}.layout.spawnZones.${spawnZone.id}.entityIds`,
        spawnZone.entityIds,
        entityIds,
        "entity"
      );
    }

    for (const pickupZone of scene.layout.pickupZones) {
      addUnknownReferenceIssues(
        issues,
        `scenes.${scene.id}.layout.pickupZones.${pickupZone.id}.assetIds`,
        pickupZone.assetIds,
        assetIds,
        "asset"
      );
    }
  }

  return issues;
}

export function validateTopDownGameSpec(input: unknown): TopDownGameSpec {
  const spec = parseTopDownGameSpec(input);
  const issues = getTopDownGameSpecValidationIssues(spec);

  if (issues.length > 0) {
    throw new GameSpecValidationError(issues);
  }

  return spec;
}
