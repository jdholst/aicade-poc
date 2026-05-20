import type { GameSpecMechanicEntry } from "../game-spec-schema";
import { addMechanicContractIssues } from "../mechanics/mechanic-contract-validation";
import { getTopDownMechanicDefinition } from "../mechanics/mechanic-registry";
import type { TopDownGameSpec } from "../top-down-spec-schema";

import {
  addReferences,
  addUnknownReferenceIssues,
} from "./stable-id-references";
import {
  createTopDownValidationContext,
  type TopDownValidationContext,
} from "./top-down-validation-context";
import type { GameSpecValidationIssue } from "./validation-issue";

export function getTopDownGameSpecValidationIssues(
  spec: TopDownGameSpec
): GameSpecValidationIssue[] {
  const issues: GameSpecValidationIssue[] = [];
  const context = createTopDownValidationContext(spec);

  addPrimaryObjectiveIssues(issues, spec);
  addValidationGoalReferenceIssues(issues, spec, context);
  addMechanicIssues(issues, spec, context);
  addUnusedModuleIssues(issues, spec, context);
  addSceneReferenceIssues(issues, spec, context);

  return issues;
}

function addPrimaryObjectiveIssues(
  issues: GameSpecValidationIssue[],
  spec: TopDownGameSpec
) {
  const primaryObjectives = spec.objectives.filter(
    (objective) => objective.primary
  );

  if (primaryObjectives.length !== 1) {
    issues.push({
      path: "objectives",
      message: "Expected exactly one primary objective.",
    });
  }
}

function addValidationGoalReferenceIssues(
  issues: GameSpecValidationIssue[],
  spec: TopDownGameSpec,
  context: TopDownValidationContext
) {
  for (const validationGoal of spec.validationGoals) {
    addUnknownReferenceIssues(
      issues,
      `validationGoals.${validationGoal.id}.objectiveId`,
      validationGoal.objectiveId ? [validationGoal.objectiveId] : undefined,
      context.objectiveIds,
      "objective"
    );
  }
}

function addMechanicIssues(
  issues: GameSpecValidationIssue[],
  spec: TopDownGameSpec,
  context: TopDownValidationContext
) {
  for (const mechanic of spec.mechanics) {
    addMechanicReferenceIssues(issues, mechanic, context);
    addActiveMechanicIssues(issues, mechanic, context);
  }
}

function addMechanicReferenceIssues(
  issues: GameSpecValidationIssue[],
  mechanic: GameSpecMechanicEntry,
  context: TopDownValidationContext
) {
  addUnknownReferenceIssues(
    issues,
    `mechanics.${mechanic.id}.targetIds`,
    mechanic.targetIds,
    context.entityIds,
    "entity"
  );
  addUnknownReferenceIssues(
    issues,
    `mechanics.${mechanic.id}.sceneIds`,
    mechanic.sceneIds,
    context.sceneIds,
    "scene"
  );
  addUnknownReferenceIssues(
    issues,
    `mechanics.${mechanic.id}.regionIds`,
    mechanic.regionIds,
    context.regionIds,
    "region"
  );
  addUnknownReferenceIssues(
    issues,
    `mechanics.${mechanic.id}.assetIds`,
    mechanic.assetIds,
    context.assetIds,
    "asset"
  );
  addUnknownReferenceIssues(
    issues,
    `mechanics.${mechanic.id}.objectiveIds`,
    mechanic.objectiveIds,
    context.objectiveIds,
    "objective"
  );
}

function addActiveMechanicIssues(
  issues: GameSpecValidationIssue[],
  mechanic: GameSpecMechanicEntry,
  context: TopDownValidationContext
) {
  const mechanicDefinition = getTopDownMechanicDefinition(mechanic.type);

  if (!mechanicDefinition) {
    issues.push({
      path: `mechanics.${mechanic.id}.type`,
      message: `Unsupported mechanic type "${mechanic.type}".`,
    });
    return;
  }

  addReferences(context.activeMechanicEntityIds, mechanic.targetIds);
  addReferences(context.activeMechanicAssetIds, mechanic.assetIds);
  addReferences(context.activeMechanicObjectiveIds, mechanic.objectiveIds);
  addMechanicContractIssues(
    issues,
    mechanic,
    mechanicDefinition.validationRequirements,
    context
  );
}

function addUnusedModuleIssues(
  issues: GameSpecValidationIssue[],
  spec: TopDownGameSpec,
  context: TopDownValidationContext
) {
  for (const entity of spec.entities) {
    if (
      entity.role !== "player" &&
      !context.spawnZoneEntityIds.has(entity.id) &&
      !context.activeMechanicEntityIds.has(entity.id)
    ) {
      issues.push({
        path: `entities.${entity.id}`,
        message: "Entity is not referenced by any spawn zone or active mechanic.",
      });
    }
  }

  for (const asset of spec.assets) {
    if (
      asset.role === "pickup" &&
      !context.pickupZoneAssetIds.has(asset.id) &&
      !context.activeMechanicAssetIds.has(asset.id)
    ) {
      issues.push({
        path: `assets.${asset.id}`,
        message:
          "Pickup asset is not referenced by any pickup zone or active mechanic.",
      });
    }
  }

  for (const objective of spec.objectives) {
    if (
      !context.sceneObjectiveIds.has(objective.id) &&
      !context.validationGoalObjectiveIds.has(objective.id) &&
      !context.activeMechanicObjectiveIds.has(objective.id)
    ) {
      issues.push({
        path: `objectives.${objective.id}`,
        message:
          "Objective is not referenced by any scene, validation goal, or active mechanic.",
      });
    }
  }

  for (const validationGoal of spec.validationGoals) {
    if (!context.sceneValidationGoalIds.has(validationGoal.id)) {
      issues.push({
        path: `validationGoals.${validationGoal.id}`,
        message: "Validation goal is not referenced by any scene.",
      });
    }
  }
}

function addSceneReferenceIssues(
  issues: GameSpecValidationIssue[],
  spec: TopDownGameSpec,
  context: TopDownValidationContext
) {
  for (const scene of spec.template.config.scenes) {
    addUnknownReferenceIssues(
      issues,
      `scenes.${scene.id}.objectiveIds`,
      scene.objectiveIds,
      context.objectiveIds,
      "objective"
    );
    addUnknownReferenceIssues(
      issues,
      `scenes.${scene.id}.validationGoalIds`,
      scene.validationGoalIds,
      context.validationGoalIds,
      "validation goal"
    );

    for (const spawnZone of scene.layout.spawnZones) {
      addUnknownReferenceIssues(
        issues,
        `scenes.${scene.id}.layout.spawnZones.${spawnZone.id}.entityIds`,
        spawnZone.entityIds,
        context.entityIds,
        "entity"
      );
    }

    for (const pickupZone of scene.layout.pickupZones) {
      addUnknownReferenceIssues(
        issues,
        `scenes.${scene.id}.layout.pickupZones.${pickupZone.id}.assetIds`,
        pickupZone.assetIds,
        context.assetIds,
        "asset"
      );
    }
  }
}
