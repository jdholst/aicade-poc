import type { StableId } from "../game-spec-schema";
import type { TopDownGameSpec } from "../top-down-spec-schema";

import { toIdMap, toIdSet } from "./stable-id-references";

export type TopDownValidationContext = {
  activeMechanicAssetIds: Set<StableId>;
  activeMechanicEntityIds: Set<StableId>;
  activeMechanicObjectiveIds: Set<StableId>;
  assetIds: Set<StableId>;
  assetsById: Map<StableId, TopDownGameSpec["assets"][number]>;
  entityIds: Set<StableId>;
  entitiesById: Map<StableId, TopDownGameSpec["entities"][number]>;
  objectiveIds: Set<StableId>;
  pickupZoneAssetIds: Set<StableId>;
  regionIds: Set<StableId>;
  sceneIds: Set<StableId>;
  sceneObjectiveIds: Set<StableId>;
  sceneValidationGoalIds: Set<StableId>;
  spawnZoneEntityIds: Set<StableId>;
  validationGoalIds: Set<StableId>;
  validationGoalObjectiveIds: Set<StableId>;
};

export function createTopDownValidationContext(
  spec: TopDownGameSpec
): TopDownValidationContext {
  return {
    activeMechanicAssetIds: new Set<StableId>(),
    activeMechanicEntityIds: new Set<StableId>(),
    activeMechanicObjectiveIds: new Set<StableId>(),
    assetIds: toIdSet(spec.assets),
    assetsById: toIdMap(spec.assets),
    entityIds: toIdSet(spec.entities),
    entitiesById: toIdMap(spec.entities),
    objectiveIds: toIdSet(spec.objectives),
    pickupZoneAssetIds: new Set<StableId>(
      spec.template.config.scenes.flatMap((scene) =>
        scene.layout.pickupZones.flatMap(
          (pickupZone) => pickupZone.assetIds ?? []
        )
      )
    ),
    regionIds: new Set<StableId>(
      spec.template.config.scenes.flatMap((scene) =>
        scene.layout.regions.map((region) => region.id)
      )
    ),
    sceneIds: toIdSet(spec.template.config.scenes),
    sceneObjectiveIds: new Set<StableId>(
      spec.template.config.scenes.flatMap((scene) => scene.objectiveIds ?? [])
    ),
    sceneValidationGoalIds: new Set<StableId>(
      spec.template.config.scenes.flatMap(
        (scene) => scene.validationGoalIds ?? []
      )
    ),
    spawnZoneEntityIds: new Set<StableId>(
      spec.template.config.scenes.flatMap((scene) =>
        scene.layout.spawnZones.flatMap(
          (spawnZone) => spawnZone.entityIds ?? []
        )
      )
    ),
    validationGoalIds: toIdSet(spec.validationGoals),
    validationGoalObjectiveIds: new Set<StableId>(
      spec.validationGoals.flatMap((validationGoal) =>
        validationGoal.objectiveId ? [validationGoal.objectiveId] : []
      )
    ),
  };
}
