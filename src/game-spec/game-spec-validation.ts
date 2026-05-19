import {
  parseTopDownGameSpec,
  type TopDownGameSpec,
} from "./top-down-spec-schema";
import type { GameSpecMechanicEntry, StableId } from "./game-spec-schema";
import {
  getTopDownMechanicDefinition,
  type MechanicValidationRequirements,
} from "./mechanics/mechanic-registry";

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

function toIdSet(items: Array<{ id: StableId }>): Set<StableId> {
  return new Set(items.map((item) => item.id));
}

function toIdMap<TItem extends { id: StableId }>(
  items: readonly TItem[]
): Map<StableId, TItem> {
  return new Map(items.map((item) => [item.id, item]));
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

function referencesAreKnown(
  referenceIds: StableId[] | undefined,
  knownIds: Set<StableId>
) {
  return (referenceIds ?? []).every((referenceId) => knownIds.has(referenceId));
}

function addReferences(
  references: Set<StableId>,
  referenceIds: StableId[] | undefined
) {
  for (const referenceId of referenceIds ?? []) {
    references.add(referenceId);
  }
}

type TopDownValidationContext = {
  assetIds: Set<StableId>;
  assetsById: Map<StableId, TopDownGameSpec["assets"][number]>;
  entityIds: Set<StableId>;
  entitiesById: Map<StableId, TopDownGameSpec["entities"][number]>;
  pickupZoneAssetIds: Set<StableId>;
};

function addMechanicContractIssues(
  issues: GameSpecValidationIssue[],
  mechanic: GameSpecMechanicEntry,
  requirements: MechanicValidationRequirements | undefined,
  context: TopDownValidationContext
) {
  if (!requirements) {
    return;
  }

  if (
    requirements.requiredTargetRoles &&
    referencesAreKnown(mechanic.targetIds, context.entityIds)
  ) {
    const targetEntities = (mechanic.targetIds ?? [])
      .map((targetId) => context.entitiesById.get(targetId))
      .filter((entity): entity is TopDownGameSpec["entities"][number] =>
        Boolean(entity)
      );

    for (const requiredRole of requirements.requiredTargetRoles) {
      if (!targetEntities.some((entity) => entity.role === requiredRole)) {
        issues.push({
          path: `mechanics.${mechanic.id}.targetIds`,
          message: `Expected target role "${requiredRole}".`,
        });
      }
    }
  }

  if (
    requirements.requiredAssetRoles &&
    referencesAreKnown(mechanic.assetIds, context.assetIds)
  ) {
    const mechanicAssets = (mechanic.assetIds ?? [])
      .map((assetId) => context.assetsById.get(assetId))
      .filter((asset): asset is TopDownGameSpec["assets"][number] =>
        Boolean(asset)
      );

    for (const requiredRole of requirements.requiredAssetRoles) {
      if (!mechanicAssets.some((asset) => asset.role === requiredRole)) {
        issues.push({
          path: `mechanics.${mechanic.id}.assetIds`,
          message: `Expected asset role "${requiredRole}".`,
        });
      }
    }
  }

  if (
    requirements.requiresObjective &&
    (mechanic.objectiveIds ?? []).length === 0
  ) {
    issues.push({
      path: `mechanics.${mechanic.id}.objectiveIds`,
      message: "Expected an objective reference.",
    });
  }

  if (!requirements.layoutCoverage) {
    return;
  }

  for (const coverageRequirement of requirements.layoutCoverage) {
    if (
      coverageRequirement.kind === "pickup_zone_for_referenced_asset" &&
      referencesAreKnown(mechanic.assetIds, context.assetIds)
    ) {
      const referencedAssets = (mechanic.assetIds ?? [])
        .map((assetId) => context.assetsById.get(assetId))
        .filter((asset): asset is TopDownGameSpec["assets"][number] =>
          Boolean(asset)
        )
        .filter((asset) => asset.role === coverageRequirement.assetRole);

      if (
        referencedAssets.length > 0 &&
        !referencedAssets.some((asset) =>
          context.pickupZoneAssetIds.has(asset.id)
        )
      ) {
        issues.push({
          path: `mechanics.${mechanic.id}.assetIds`,
          message:
            "Expected a referenced pickup asset to be placed in a pickup zone.",
        });
      }
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
  const entitiesById = toIdMap(spec.entities);
  const assetIds = toIdSet(spec.assets);
  const assetsById = toIdMap(spec.assets);
  const sceneIds = toIdSet(spec.template.config.scenes);
  const pickupZoneAssetIds = new Set<StableId>(
    spec.template.config.scenes.flatMap((scene) =>
      scene.layout.pickupZones.flatMap((pickupZone) => pickupZone.assetIds ?? [])
    )
  );
  const spawnZoneEntityIds = new Set<StableId>(
    spec.template.config.scenes.flatMap((scene) =>
      scene.layout.spawnZones.flatMap((spawnZone) => spawnZone.entityIds ?? [])
    )
  );
  const sceneObjectiveIds = new Set<StableId>(
    spec.template.config.scenes.flatMap((scene) => scene.objectiveIds ?? [])
  );
  const sceneValidationGoalIds = new Set<StableId>(
    spec.template.config.scenes.flatMap((scene) => scene.validationGoalIds ?? [])
  );
  const validationGoalObjectiveIds = new Set<StableId>(
    spec.validationGoals.flatMap((validationGoal) =>
      validationGoal.objectiveId ? [validationGoal.objectiveId] : []
    )
  );
  const activeMechanicEntityIds = new Set<StableId>();
  const activeMechanicAssetIds = new Set<StableId>();
  const activeMechanicObjectiveIds = new Set<StableId>();
  const regionIds = new Set<StableId>(
    spec.template.config.scenes.flatMap((scene) =>
      scene.layout.regions.map((region) => region.id)
    )
  );

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
    const mechanicDefinition = getTopDownMechanicDefinition(mechanic.type);

    if (!mechanicDefinition) {
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
      `mechanics.${mechanic.id}.sceneIds`,
      mechanic.sceneIds,
      sceneIds,
      "scene"
    );
    addUnknownReferenceIssues(
      issues,
      `mechanics.${mechanic.id}.regionIds`,
      mechanic.regionIds,
      regionIds,
      "region"
    );
    addUnknownReferenceIssues(
      issues,
      `mechanics.${mechanic.id}.assetIds`,
      mechanic.assetIds,
      assetIds,
      "asset"
    );
    addUnknownReferenceIssues(
      issues,
      `mechanics.${mechanic.id}.objectiveIds`,
      mechanic.objectiveIds,
      objectiveIds,
      "objective"
    );

    if (mechanicDefinition) {
      addReferences(activeMechanicEntityIds, mechanic.targetIds);
      addReferences(activeMechanicAssetIds, mechanic.assetIds);
      addReferences(activeMechanicObjectiveIds, mechanic.objectiveIds);
      addMechanicContractIssues(
        issues,
        mechanic,
        mechanicDefinition.validationRequirements,
        {
          assetIds,
          assetsById,
          entityIds,
          entitiesById,
          pickupZoneAssetIds,
        }
      );
    }
  }

  for (const entity of spec.entities) {
    if (
      entity.role !== "player" &&
      !spawnZoneEntityIds.has(entity.id) &&
      !activeMechanicEntityIds.has(entity.id)
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
      !pickupZoneAssetIds.has(asset.id) &&
      !activeMechanicAssetIds.has(asset.id)
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
      !sceneObjectiveIds.has(objective.id) &&
      !validationGoalObjectiveIds.has(objective.id) &&
      !activeMechanicObjectiveIds.has(objective.id)
    ) {
      issues.push({
        path: `objectives.${objective.id}`,
        message:
          "Objective is not referenced by any scene, validation goal, or active mechanic.",
      });
    }
  }

  for (const validationGoal of spec.validationGoals) {
    if (!sceneValidationGoalIds.has(validationGoal.id)) {
      issues.push({
        path: `validationGoals.${validationGoal.id}`,
        message: "Validation goal is not referenced by any scene.",
      });
    }
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
