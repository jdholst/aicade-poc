import type { RuntimeIssue } from "@/runtime/runtime-adapter";

import type { JsonValue, StableId } from "../game-spec-schema";
import type {
  GamePack,
  GamePackRuntimeKind,
  ValidationEvidence,
} from "./game-pack-schema";

export type FirstPlayableValidationStatus = "running" | "passed" | "failed";

export type FirstPlayableValidationAttempt = {
  evidence: ValidationEvidence[];
  failureMessage?: string;
  gamePackId: GamePack["id"];
  shouldBlockPlayable: boolean;
  startedAt: string;
  status: FirstPlayableValidationStatus;
};

export type StartFirstPlayableValidationInput = {
  gamePack: GamePack;
  runtimeCandidate: FirstPlayableRuntimeCandidate;
  startedAt: string;
};

export type FirstPlayableRuntimeCandidate = {
  runtimeDependencyScriptPaths?: string[];
  runtimeKind: GamePackRuntimeKind;
  runtimeScriptPath?: string;
  templateId: StableId;
};

export type RecordFirstPlayableRuntimeStatusInput = {
  attempt: FirstPlayableValidationAttempt;
  observedAt: string;
  status: FirstPlayableRuntimeStatus;
};

export type FirstPlayableRuntimeStatus =
  | { state: "loading" }
  | { state: "ready" }
  | { state: "warning"; issue: Extract<RuntimeIssue, { recoverable: true }> }
  | { state: "error"; message: string };

const BASIC_OBJECTIVE_EVIDENCE_ID = "evidence_basic_objective_presence";
const BASIC_OBJECTIVE_CHECK_ID = "basic_objective_presence";
const PLAYER_ENTITY_EVIDENCE_ID = "evidence_player_entity_presence";
const PLAYER_ENTITY_CHECK_ID = "player_entity_presence";
const REFERENCE_CONSISTENCY_EVIDENCE_ID =
  "evidence_first_playable_reference_consistency";
const REFERENCE_CONSISTENCY_CHECK_ID =
  "first_playable_reference_consistency";
const RUNTIME_TEMPLATE_ENTRYPOINT_EVIDENCE_ID =
  "evidence_runtime_template_entrypoint";
const RUNTIME_TEMPLATE_ENTRYPOINT_CHECK_ID = "runtime_template_entrypoint";
const RENDER_PLACEHOLDER_ASSET_EVIDENCE_ID =
  "evidence_render_placeholder_asset_refs";
const RENDER_PLACEHOLDER_ASSET_CHECK_ID = "render_placeholder_asset_refs";
const RUNTIME_BOOT_EVIDENCE_ID = "evidence_runtime_boot";
const RUNTIME_BOOT_CHECK_ID = "runtime_boot";

export function startFirstPlayableValidation({
  gamePack,
  runtimeCandidate,
  startedAt,
}: StartFirstPlayableValidationInput): FirstPlayableValidationAttempt {
  const evidence = [
    createBasicObjectivePresenceEvidence(gamePack),
    createPlayerEntityPresenceEvidence(gamePack),
    createReferenceConsistencyEvidence(gamePack),
    createRuntimeTemplateEntrypointEvidence(gamePack, runtimeCandidate),
    createRenderPlaceholderAssetRefsEvidence(gamePack),
  ];
  const failed = evidence.some((item) => item.status === "failed");

  return {
    gamePackId: gamePack.id,
    startedAt,
    status: failed ? "failed" : "running",
    shouldBlockPlayable: failed,
    failureMessage: failed
      ? getFirstFailureMessage(evidence)
      : undefined,
    evidence,
  };
}

export function recordFirstPlayableRuntimeStatus({
  attempt,
  observedAt,
  status,
}: RecordFirstPlayableRuntimeStatusInput): FirstPlayableValidationAttempt {
  if (attempt.status === "failed" || status.state === "loading") {
    return attempt;
  }

  if (status.state === "warning") {
    return attempt;
  }

  if (status.state === "ready") {
    return updateAttemptWithRuntimeEvidence(
      attempt,
      createRuntimeBootEvidence({
        attempt,
        observedAt,
        status: "passed",
        message: "Runtime reported ready without a fatal boot error.",
        evidence: {
          runtimeStatus: "ready",
        },
      })
    );
  }

  return updateAttemptWithRuntimeEvidence(
    attempt,
    createRuntimeBootEvidence({
      attempt,
      observedAt,
      status: "failed",
      message: "Runtime failed before first-playable validation completed.",
      evidence: {
        runtimeStatus: "error",
        message: status.message,
      },
      issues: [
        {
          code: "fatal_runtime_error",
          path: "runtime",
          message: status.message,
        },
      ],
    })
  );
}

function createBasicObjectivePresenceEvidence(
  gamePack: GamePack
): ValidationEvidence {
  const primaryObjectiveCount = gamePack.gameSpec.objectives.filter(
    (objective) => objective.primary
  ).length;

  if (primaryObjectiveCount === 1) {
    return {
      id: BASIC_OBJECTIVE_EVIDENCE_ID,
      checkId: BASIC_OBJECTIVE_CHECK_ID,
      stage: "spec-validation",
      status: "passed",
      durationMs: 0,
      message: "A primary objective is present in the Game Spec.",
      evidence: {
        primaryObjectiveCount,
      },
    };
  }

  return {
    id: BASIC_OBJECTIVE_EVIDENCE_ID,
    checkId: BASIC_OBJECTIVE_CHECK_ID,
    stage: "spec-validation",
    status: "failed",
    durationMs: 0,
    message:
      "Game Spec must include exactly one primary objective before runtime boot can be treated as playable.",
    evidence: {
      primaryObjectiveCount,
    },
    issues: [
      {
        code:
          primaryObjectiveCount === 0
            ? "missing_primary_objective"
            : "multiple_primary_objectives",
        path: "gameSpec.objectives",
        message: "Expected exactly one primary objective.",
      },
    ],
  };
}

function createPlayerEntityPresenceEvidence(
  gamePack: GamePack
): ValidationEvidence {
  const playerEntityCount = gamePack.gameSpec.entities.filter(
    (entity) => entity.role === "player"
  ).length;

  if (playerEntityCount > 0) {
    return {
      id: PLAYER_ENTITY_EVIDENCE_ID,
      checkId: PLAYER_ENTITY_CHECK_ID,
      stage: "spec-validation",
      status: "passed",
      durationMs: 0,
      message: "A player entity is present in the Game Spec.",
      evidence: {
        playerEntityCount,
      },
    };
  }

  return {
    id: PLAYER_ENTITY_EVIDENCE_ID,
    checkId: PLAYER_ENTITY_CHECK_ID,
    stage: "spec-validation",
    status: "failed",
    durationMs: 0,
    message: "Game Spec must include a player entity before runtime boot.",
    evidence: {
      playerEntityCount,
    },
    issues: [
      {
        code: "missing_player_entity",
        path: "gameSpec.entities",
        message: "Expected at least one entity with role \"player\".",
      },
    ],
  };
}

function createReferenceConsistencyEvidence(
  gamePack: GamePack
): ValidationEvidence {
  const issues: NonNullable<ValidationEvidence["issues"]> = [];
  const spec = gamePack.gameSpec;
  const entityIds = toIdSet(spec.entities);
  const assetIds = toIdSet(spec.assets);
  const objectiveIds = toIdSet(spec.objectives);
  const validationGoalIds = toIdSet(spec.validationGoals);
  const scenes = getTopDownScenes(gamePack);
  const sceneIds = toIdSet(scenes);

  for (const validationGoal of spec.validationGoals) {
    addUnknownReferenceIssues({
      issues,
      code: "unknown_objective_reference",
      path: `gameSpec.validationGoals.${validationGoal.id}.objectiveId`,
      referenceIds: validationGoal.objectiveId
        ? [validationGoal.objectiveId]
        : undefined,
      knownIds: objectiveIds,
      label: "objective",
    });
  }

  for (const mechanic of spec.mechanics) {
    addUnknownReferenceIssues({
      issues,
      code: "unknown_entity_reference",
      path: `gameSpec.mechanics.${mechanic.id}.targetIds`,
      referenceIds: mechanic.targetIds,
      knownIds: entityIds,
      label: "entity",
    });
    addUnknownReferenceIssues({
      issues,
      code: "unknown_objective_reference",
      path: `gameSpec.mechanics.${mechanic.id}.objectiveIds`,
      referenceIds: mechanic.objectiveIds,
      knownIds: objectiveIds,
      label: "objective",
    });
    addUnknownReferenceIssues({
      issues,
      code: "unknown_scene_reference",
      path: `gameSpec.mechanics.${mechanic.id}.sceneIds`,
      referenceIds: mechanic.sceneIds,
      knownIds: sceneIds,
      label: "scene",
    });
    addUnknownReferenceIssues({
      issues,
      code: "unknown_asset_reference",
      path: `gameSpec.mechanics.${mechanic.id}.assetIds`,
      referenceIds: mechanic.assetIds,
      knownIds: assetIds,
      label: "asset",
    });
  }

  for (const scene of scenes) {
    addUnknownReferenceIssues({
      issues,
      code: "unknown_objective_reference",
      path: `gameSpec.template.config.scenes.${scene.id}.objectiveIds`,
      referenceIds: scene.objectiveIds,
      knownIds: objectiveIds,
      label: "objective",
    });
    addUnknownReferenceIssues({
      issues,
      code: "unknown_validation_goal_reference",
      path: `gameSpec.template.config.scenes.${scene.id}.validationGoalIds`,
      referenceIds: scene.validationGoalIds,
      knownIds: validationGoalIds,
      label: "validation goal",
    });

    for (const spawnZone of scene.layout.spawnZones) {
      addUnknownReferenceIssues({
        issues,
        code: "unknown_entity_reference",
        path: `gameSpec.template.config.scenes.${scene.id}.layout.spawnZones.${spawnZone.id}.entityIds`,
        referenceIds: spawnZone.entityIds,
        knownIds: entityIds,
        label: "entity",
      });
    }

    for (const pickupZone of scene.layout.pickupZones) {
      addUnknownReferenceIssues({
        issues,
        code: "unknown_asset_reference",
        path: `gameSpec.template.config.scenes.${scene.id}.layout.pickupZones.${pickupZone.id}.assetIds`,
        referenceIds: pickupZone.assetIds,
        knownIds: assetIds,
        label: "asset",
      });
    }
  }

  if (issues.length === 0) {
    return {
      id: REFERENCE_CONSISTENCY_EVIDENCE_ID,
      checkId: REFERENCE_CONSISTENCY_CHECK_ID,
      stage: "spec-validation",
      status: "passed",
      durationMs: 0,
      message: "First-playable Game Spec references resolve before boot.",
      evidence: {
        checkedMechanicCount: spec.mechanics.length,
        checkedSceneCount: scenes.length,
      },
    };
  }

  return {
    id: REFERENCE_CONSISTENCY_EVIDENCE_ID,
    checkId: REFERENCE_CONSISTENCY_CHECK_ID,
    stage: "spec-validation",
    status: "failed",
    durationMs: 0,
    message: "First-playable Game Spec references must resolve before boot.",
    evidence: {
      checkedMechanicCount: spec.mechanics.length,
      checkedSceneCount: scenes.length,
      issueCount: issues.length,
    },
    issues,
  };
}

function createRuntimeTemplateEntrypointEvidence(
  gamePack: GamePack,
  runtimeCandidate: FirstPlayableRuntimeCandidate
): ValidationEvidence {
  const issues: NonNullable<ValidationEvidence["issues"]> = [];

  if (runtimeCandidate.runtimeKind !== gamePack.runtimeKind) {
    issues.push({
      code: "runtime_kind_mismatch",
      path: "runtimeCandidate.runtimeKind",
      message: `Expected runtime kind "${gamePack.runtimeKind}".`,
    });
  }

  if (gamePack.templateId !== gamePack.gameSpec.template.id) {
    issues.push({
      code: "game_pack_template_mismatch",
      path: "gamePack.templateId",
      message: "Expected Game Pack templateId to match Game Spec template.id.",
    });
  }

  if (runtimeCandidate.templateId !== gamePack.templateId) {
    issues.push({
      code: "runtime_template_mismatch",
      path: "runtimeCandidate.templateId",
      message: `Expected runtime template "${gamePack.templateId}".`,
    });
  }

  if (
    gamePack.runtimeKind === "phaser" &&
    gamePack.templateId !== "template_top_down"
  ) {
    issues.push({
      code: "unsupported_first_playable_template",
      path: "gamePack.templateId",
      message: "Expected Phaser first-playable validation to use template_top_down.",
    });
  }

  if (
    gamePack.runtimeKind === "phaser" &&
    !runtimeCandidate.runtimeScriptPath?.trim()
  ) {
    issues.push({
      code: "missing_runtime_script_path",
      path: "runtimeCandidate.runtimeScriptPath",
      message: "Expected a Phaser runtime script path before boot.",
    });
  }

  if (issues.length === 0) {
    return {
      id: RUNTIME_TEMPLATE_ENTRYPOINT_EVIDENCE_ID,
      checkId: RUNTIME_TEMPLATE_ENTRYPOINT_CHECK_ID,
      stage: "artifact-build",
      status: "passed",
      durationMs: 0,
      message: "Runtime template entrypoint metadata is ready for boot.",
      evidence: {
        runtimeDependencyScriptCount:
          runtimeCandidate.runtimeDependencyScriptPaths?.length ?? 0,
        runtimeKind: runtimeCandidate.runtimeKind,
        runtimeScriptPath: runtimeCandidate.runtimeScriptPath ?? null,
        templateId: runtimeCandidate.templateId,
      },
    };
  }

  return {
    id: RUNTIME_TEMPLATE_ENTRYPOINT_EVIDENCE_ID,
    checkId: RUNTIME_TEMPLATE_ENTRYPOINT_CHECK_ID,
    stage: "artifact-build",
    status: "failed",
    durationMs: 0,
    message: "Runtime template entrypoint metadata must be ready before boot.",
    evidence: {
      runtimeKind: runtimeCandidate.runtimeKind,
      runtimeScriptPath: runtimeCandidate.runtimeScriptPath ?? null,
      templateId: runtimeCandidate.templateId,
    },
    issues,
  };
}

function createRenderPlaceholderAssetRefsEvidence(
  gamePack: GamePack
): ValidationEvidence {
  const issues: NonNullable<ValidationEvidence["issues"]> = [];
  const spec = gamePack.gameSpec;
  const assetsById = new Map(spec.assets.map((asset) => [asset.id, asset]));
  const playerAssetCount = spec.assets.filter(
    (asset) => asset.role === "player"
  ).length;
  const scenes = getTopDownScenes(gamePack);

  if (playerAssetCount === 0) {
    issues.push({
      code: "missing_player_placeholder_asset",
      path: "gameSpec.assets",
      message: "Expected at least one tracked player asset.",
    });
  }

  for (const mechanic of spec.mechanics) {
    if (mechanic.type !== "pickup_collection") {
      continue;
    }

    if (!referencesIncludeAssetRole(mechanic.assetIds, assetsById, "pickup")) {
      issues.push({
        code: "missing_pickup_placeholder_asset_reference",
        path: `gameSpec.mechanics.${mechanic.id}.assetIds`,
        message: "Expected pickup collection mechanic to reference a pickup asset.",
      });
    }
  }

  for (const scene of scenes) {
    for (const pickupZone of scene.layout.pickupZones) {
      if (!referencesIncludeAssetRole(pickupZone.assetIds, assetsById, "pickup")) {
        issues.push({
          code: "missing_pickup_placeholder_asset_reference",
          path: `gameSpec.template.config.scenes.${scene.id}.layout.pickupZones.${pickupZone.id}.assetIds`,
          message: "Expected pickup zone to reference a pickup asset.",
        });
      }
    }
  }

  if (issues.length === 0) {
    return {
      id: RENDER_PLACEHOLDER_ASSET_EVIDENCE_ID,
      checkId: RENDER_PLACEHOLDER_ASSET_CHECK_ID,
      stage: "spec-validation",
      status: "passed",
      durationMs: 0,
      message: "Render-critical placeholder asset references are present.",
      evidence: {
        playerAssetCount,
        pickupZoneCount: scenes.reduce(
          (count, scene) => count + scene.layout.pickupZones.length,
          0
        ),
      },
    };
  }

  return {
    id: RENDER_PLACEHOLDER_ASSET_EVIDENCE_ID,
    checkId: RENDER_PLACEHOLDER_ASSET_CHECK_ID,
    stage: "spec-validation",
    status: "failed",
    durationMs: 0,
    message: "Render-critical placeholder asset references are required before boot.",
    evidence: {
      issueCount: issues.length,
      playerAssetCount,
    },
    issues,
  };
}

function createRuntimeBootEvidence({
  attempt,
  observedAt,
  status,
  message,
  evidence,
  issues,
}: {
  attempt: FirstPlayableValidationAttempt;
  observedAt: string;
  status: Extract<ValidationEvidence["status"], "passed" | "failed">;
  message: string;
  evidence: Record<string, JsonValue>;
  issues?: ValidationEvidence["issues"];
}): ValidationEvidence {
  return {
    id: RUNTIME_BOOT_EVIDENCE_ID,
    checkId: RUNTIME_BOOT_CHECK_ID,
    stage: "runtime-boot",
    status,
    durationMs: getDurationMs(attempt.startedAt, observedAt),
    message,
    evidence,
    issues,
  };
}

type IdRecord = {
  id: StableId;
};

type TopDownSceneCandidate = {
  id: StableId;
  layout: {
    pickupZones: Array<{
      assetIds?: StableId[];
      id: StableId;
    }>;
    spawnZones: Array<{
      entityIds?: StableId[];
      id: StableId;
    }>;
  };
  objectiveIds?: StableId[];
  validationGoalIds?: StableId[];
};

function toIdSet(items: readonly IdRecord[]) {
  return new Set(items.map((item) => item.id));
}

function addUnknownReferenceIssues({
  code,
  issues,
  knownIds,
  label,
  path,
  referenceIds,
}: {
  code: string;
  issues: NonNullable<ValidationEvidence["issues"]>;
  knownIds: Set<StableId>;
  label: string;
  path: string;
  referenceIds: StableId[] | undefined;
}) {
  for (const referenceId of referenceIds ?? []) {
    if (!knownIds.has(referenceId)) {
      issues.push({
        code,
        path,
        message: `Unknown ${label} ID "${referenceId}".`,
      });
    }
  }
}

function getTopDownScenes(gamePack: GamePack): TopDownSceneCandidate[] {
  const scenes = gamePack.gameSpec.template.config.scenes;

  if (!Array.isArray(scenes)) {
    return [];
  }

  return scenes.filter(isTopDownSceneCandidate);
}

function isTopDownSceneCandidate(
  scene: JsonValue
): scene is TopDownSceneCandidate {
  if (!isRecord(scene) || typeof scene.id !== "string") {
    return false;
  }

  const layout = scene.layout;

  return (
    isRecord(layout) &&
    Array.isArray(layout.spawnZones) &&
    Array.isArray(layout.pickupZones)
  );
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function referencesIncludeAssetRole(
  assetIds: StableId[] | undefined,
  assetsById: Map<StableId, GamePack["gameSpec"]["assets"][number]>,
  role: string
) {
  return (assetIds ?? []).some(
    (assetId) => assetsById.get(assetId)?.role === role
  );
}

function updateAttemptWithRuntimeEvidence(
  attempt: FirstPlayableValidationAttempt,
  runtimeEvidence: ValidationEvidence
): FirstPlayableValidationAttempt {
  const evidence = replaceEvidence(attempt.evidence, runtimeEvidence);
  const failed = evidence.some((item) => item.status === "failed");
  const hasRuntimeBootPass = evidence.some(
    (item) =>
      item.checkId === RUNTIME_BOOT_CHECK_ID && item.status === "passed"
  );

  return {
    ...attempt,
    evidence,
    status: failed ? "failed" : hasRuntimeBootPass ? "passed" : "running",
    shouldBlockPlayable: failed,
    failureMessage: failed
      ? getFirstFailureMessage(evidence)
      : attempt.failureMessage,
  };
}

function replaceEvidence(
  evidence: ValidationEvidence[],
  nextEvidence: ValidationEvidence
) {
  const existingIndex = evidence.findIndex(
    (item) => item.id === nextEvidence.id
  );

  if (existingIndex === -1) {
    return [...evidence, nextEvidence];
  }

  return evidence.map((item, index) =>
    index === existingIndex ? nextEvidence : item
  );
}

function getFirstFailureMessage(evidence: ValidationEvidence[]) {
  const failedEvidence = evidence.find((item) => item.status === "failed");

  return failedEvidence?.issues?.[0]?.message ?? failedEvidence?.message;
}

function getDurationMs(startedAt: string, observedAt: string) {
  const durationMs = Date.parse(observedAt) - Date.parse(startedAt);

  return Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
}
