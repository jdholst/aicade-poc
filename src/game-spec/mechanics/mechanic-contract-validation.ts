import type { GameSpec, GameSpecMechanicEntry, StableId } from "../game-spec-schema";
import type { GameSpecValidationIssue } from "../validation/validation-issue";
import { referencesAreKnown } from "../validation/stable-id-references";

import type { MechanicValidationRequirements } from "./mechanic-registry";

export type MechanicContractValidationContext = {
  assetIds: Set<StableId>;
  assetsById: Map<StableId, GameSpec["assets"][number]>;
  entityIds: Set<StableId>;
  entitiesById: Map<StableId, GameSpec["entities"][number]>;
  pickupZoneAssetIds: Set<StableId>;
};

export function addMechanicContractIssues(
  issues: GameSpecValidationIssue[],
  mechanic: GameSpecMechanicEntry,
  requirements: MechanicValidationRequirements | undefined,
  context: MechanicContractValidationContext
) {
  if (!requirements) {
    return;
  }

  addRequiredTargetRoleIssues(issues, mechanic, requirements, context);
  addRequiredAssetRoleIssues(issues, mechanic, requirements, context);
  addRequiredObjectiveIssues(issues, mechanic, requirements);
  addLayoutCoverageIssues(issues, mechanic, requirements, context);
}

function addRequiredTargetRoleIssues(
  issues: GameSpecValidationIssue[],
  mechanic: GameSpecMechanicEntry,
  requirements: MechanicValidationRequirements,
  context: MechanicContractValidationContext
) {
  if (
    !requirements.requiredTargetRoles ||
    !referencesAreKnown(mechanic.targetIds, context.entityIds)
  ) {
    return;
  }

  const targetEntities = (mechanic.targetIds ?? [])
    .map((targetId) => context.entitiesById.get(targetId))
    .filter((entity): entity is GameSpec["entities"][number] =>
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

function addRequiredAssetRoleIssues(
  issues: GameSpecValidationIssue[],
  mechanic: GameSpecMechanicEntry,
  requirements: MechanicValidationRequirements,
  context: MechanicContractValidationContext
) {
  if (
    !requirements.requiredAssetRoles ||
    !referencesAreKnown(mechanic.assetIds, context.assetIds)
  ) {
    return;
  }

  const mechanicAssets = (mechanic.assetIds ?? [])
    .map((assetId) => context.assetsById.get(assetId))
    .filter((asset): asset is GameSpec["assets"][number] => Boolean(asset));

  for (const requiredRole of requirements.requiredAssetRoles) {
    if (!mechanicAssets.some((asset) => asset.role === requiredRole)) {
      issues.push({
        path: `mechanics.${mechanic.id}.assetIds`,
        message: `Expected asset role "${requiredRole}".`,
      });
    }
  }
}

function addRequiredObjectiveIssues(
  issues: GameSpecValidationIssue[],
  mechanic: GameSpecMechanicEntry,
  requirements: MechanicValidationRequirements
) {
  if (
    requirements.requiresObjective &&
    (mechanic.objectiveIds ?? []).length === 0
  ) {
    issues.push({
      path: `mechanics.${mechanic.id}.objectiveIds`,
      message: "Expected an objective reference.",
    });
  }
}

function addLayoutCoverageIssues(
  issues: GameSpecValidationIssue[],
  mechanic: GameSpecMechanicEntry,
  requirements: MechanicValidationRequirements,
  context: MechanicContractValidationContext
) {
  for (const coverageRequirement of requirements.layoutCoverage ?? []) {
    if (
      coverageRequirement.kind === "pickup_zone_for_referenced_asset" &&
      referencesAreKnown(mechanic.assetIds, context.assetIds)
    ) {
      const referencedAssets = (mechanic.assetIds ?? [])
        .map((assetId) => context.assetsById.get(assetId))
        .filter((asset): asset is GameSpec["assets"][number] =>
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
