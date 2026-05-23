import type {
  RuntimeIssue,
  RuntimeValidationEvidence as RuntimeValidationEvidenceReport,
  RuntimeValidationEvidenceCheckId,
} from "@/runtime/runtime-adapter";

import {
  jsonValueSchema,
  type JsonValue,
  type StableId,
} from "../game-spec-schema";
import type {
  FailedAttempt,
  GamePack,
  GamePackRuntimeKind,
  PlayableBuild,
  ValidationEvidence,
  ValidationEvidenceStage,
  VersionCheckpoint,
} from "./game-pack-schema";
import { parseGamePack } from "./game-pack-schema";

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

export type RecordFirstPlayableRuntimeEvidenceInput = {
  attempt: FirstPlayableValidationAttempt;
  evidence: RuntimeValidationEvidenceReport;
  observedAt: string;
};

export type WriteFirstPlayableValidationResultInput = {
  attempt: FirstPlayableValidationAttempt;
  completedAt: string;
  gamePack: GamePack;
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
const NONBLANK_RENDER_EVIDENCE_ID = "evidence_nonblank_render";
const PLAYER_VISIBLE_EVIDENCE_ID = "evidence_player_visible";
const INPUT_RESPONSE_EVIDENCE_ID = "evidence_input_response";

const runtimeBrowserEvidenceConfig = {
  nonblank_render: {
    evidenceId: NONBLANK_RENDER_EVIDENCE_ID,
    passedMessage: "Runtime reported nonblank render output.",
    failedMessage: "Runtime did not report nonblank render output.",
    defaultIssue: {
      code: "blank_runtime_render",
      path: "runtime.render",
      message: "Expected the runtime to report at least one visible render object.",
    },
  },
  player_visible: {
    evidenceId: PLAYER_VISIBLE_EVIDENCE_ID,
    passedMessage: "Runtime reported a visible player.",
    failedMessage: "Runtime did not report a visible player.",
    defaultIssue: {
      code: "player_not_visible",
      path: "runtime.player",
      message: "Expected the runtime to report a visible player.",
    },
  },
  input_response: {
    evidenceId: INPUT_RESPONSE_EVIDENCE_ID,
    passedMessage: "Runtime reported player input response.",
    failedMessage: "Runtime did not report player input response.",
    defaultIssue: {
      code: "input_not_responsive",
      path: "runtime.input",
      message: "Expected the runtime to report a response to movement input.",
    },
  },
} satisfies Record<
  RuntimeValidationEvidenceCheckId,
  {
    defaultIssue: NonNullable<ValidationEvidence["issues"]>[number];
    evidenceId: StableId;
    failedMessage: string;
    passedMessage: string;
  }
>;

const REQUIRED_RUNTIME_EVIDENCE_CHECK_IDS = [
  "nonblank_render",
  "player_visible",
  "input_response",
] as const satisfies readonly RuntimeValidationEvidenceCheckId[];

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

export function recordFirstPlayableRuntimeEvidence({
  attempt,
  evidence,
  observedAt,
}: RecordFirstPlayableRuntimeEvidenceInput): FirstPlayableValidationAttempt {
  if (attempt.status === "failed") {
    return attempt;
  }

  return updateAttemptWithRuntimeEvidence(
    attempt,
    createRuntimeBrowserEvidence({
      attempt,
      observedAt,
      report: evidence,
    })
  );
}

export function writeFirstPlayableValidationResult({
  attempt,
  completedAt,
  gamePack,
}: WriteFirstPlayableValidationResultInput): GamePack {
  if (attempt.gamePackId !== gamePack.id) {
    throw new Error("Validation attempt must belong to the target Game Pack.");
  }

  if (attempt.status === "running") {
    throw new Error("Cannot write a running first-playable validation attempt.");
  }

  const validationEvidence = upsertRecordsById(
    gamePack.validationEvidence,
    attempt.evidence
  );

  if (attempt.status === "passed") {
    const checkpointId = getInitialCheckpointId(gamePack);
    const build = createPlayableBuild({
      attempt,
      completedAt,
      gamePack,
      checkpointId,
      status: "validated",
    });
    const checkpoints =
      gamePack.checkpoints.length === 0
        ? [
            createInitialVersionCheckpoint({
              attempt,
              build,
              completedAt,
              gamePack,
            }),
          ]
        : gamePack.checkpoints;

    return parseGamePack({
      ...gamePack,
      updatedAt: completedAt,
      validationEvidence,
      builds: upsertRecordsById(gamePack.builds, [build]),
      checkpoints,
    });
  }

  const hasRuntimeArtifact = hasMountedRuntimeArtifact(attempt.evidence);
  const failedBuild = hasRuntimeArtifact
    ? createPlayableBuild({
        attempt,
        completedAt,
        gamePack,
        status: "failed",
      })
    : null;
  const failedAttempt = createFailedAttempt({
    attempt,
    buildId: failedBuild?.id,
    completedAt,
    gamePack,
  });

  return parseGamePack({
    ...gamePack,
    updatedAt: completedAt,
    validationEvidence,
    builds: failedBuild
      ? upsertRecordsById(gamePack.builds, [failedBuild])
      : gamePack.builds,
    failedAttempts: upsertRecordsById(gamePack.failedAttempts, [
      failedAttempt,
    ]),
  });
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

function createRuntimeBrowserEvidence({
  attempt,
  observedAt,
  report,
}: {
  attempt: FirstPlayableValidationAttempt;
  observedAt: string;
  report: RuntimeValidationEvidenceReport;
}): ValidationEvidence {
  const config = runtimeBrowserEvidenceConfig[report.checkId];
  const status = report.status;
  const failed = status === "failed";

  return {
    id: config.evidenceId,
    checkId: report.checkId,
    stage: "browser-check",
    status,
    durationMs: getDurationMs(attempt.startedAt, observedAt),
    message:
      report.message ??
      (failed ? config.failedMessage : config.passedMessage),
    evidence: createRuntimeEvidenceDetails(report.evidence),
    issues: failed
      ? createRuntimeValidationIssues(report.issues, config.defaultIssue)
      : report.issues,
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
  const hasRequiredRuntimeEvidencePass =
    REQUIRED_RUNTIME_EVIDENCE_CHECK_IDS.every((checkId) =>
      evidence.some((item) => item.checkId === checkId && item.status === "passed")
    );

  return {
    ...attempt,
    evidence,
    status:
      failed
        ? "failed"
        : hasRuntimeBootPass && hasRequiredRuntimeEvidencePass
          ? "passed"
          : "running",
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

function createRuntimeEvidenceDetails(
  evidence: Record<string, unknown> | undefined
): Record<string, JsonValue> {
  return {
    source: "runtime-self-report",
    ...(evidence ? toJsonRecord(evidence) : {}),
  };
}

function createRuntimeValidationIssues(
  issues: RuntimeValidationEvidenceReport["issues"],
  defaultIssue: NonNullable<ValidationEvidence["issues"]>[number]
): NonNullable<ValidationEvidence["issues"]> {
  if (!issues?.length) {
    return [defaultIssue];
  }

  return issues.map((issue) => ({
    ...(issue.code ? { code: issue.code } : {}),
    ...(issue.path ? { path: issue.path } : {}),
    message: issue.message,
  }));
}

function toJsonRecord(record: Record<string, unknown>): Record<string, JsonValue> {
  const jsonRecord: Record<string, JsonValue> = {};

  for (const [key, value] of Object.entries(record)) {
    const parsedValue = jsonValueSchema.safeParse(value);

    if (parsedValue.success) {
      jsonRecord[key] = parsedValue.data;
    }
  }

  return jsonRecord;
}

function createPlayableBuild({
  attempt,
  checkpointId,
  completedAt,
  gamePack,
  status,
}: {
  attempt: FirstPlayableValidationAttempt;
  checkpointId?: StableId;
  completedAt: string;
  gamePack: GamePack;
  status: PlayableBuild["status"];
}): PlayableBuild {
  return {
    id:
      status === "failed"
        ? "build_failed_first_playable"
        : "build_initial_playable",
    createdAt: completedAt,
    runtimeKind: gamePack.runtimeKind,
    templateId: gamePack.templateId,
    gameSpecId: gamePack.gameSpec.id,
    ...(checkpointId ? { checkpointId } : {}),
    validationEvidenceIds: getValidationEvidenceIds(attempt),
    status,
    artifactMetadata: {
      validationAttemptStartedAt: attempt.startedAt,
      validationCompletedAt: completedAt,
      validationEvidenceByStage: groupValidationEvidenceReceipts(
        attempt.evidence
      ),
    },
  };
}

function createInitialVersionCheckpoint({
  attempt,
  build,
  completedAt,
  gamePack,
}: {
  attempt: FirstPlayableValidationAttempt;
  build: PlayableBuild;
  completedAt: string;
  gamePack: GamePack;
}): VersionCheckpoint {
  return {
    id: getInitialCheckpointId(gamePack),
    createdAt: completedAt,
    label: "Initial playable",
    summary: "First validated playable build for this Game Pack.",
    gameSpecId: gamePack.gameSpec.id,
    buildId: build.id,
    validationEvidenceIds: getValidationEvidenceIds(attempt),
    metadata: {
      validationAttemptStartedAt: attempt.startedAt,
      validationCompletedAt: completedAt,
    },
  };
}

function createFailedAttempt({
  attempt,
  buildId,
  completedAt,
  gamePack,
}: {
  attempt: FirstPlayableValidationAttempt;
  buildId?: StableId;
  completedAt: string;
  gamePack: GamePack;
}): FailedAttempt {
  const failedStage = getFirstFailedStage(attempt.evidence);

  return {
    id: buildId
      ? "failed_attempt_first_playable_runtime"
      : "failed_attempt_first_playable_pre_runtime",
    createdAt: completedAt,
    stage: failedStage,
    summary:
      attempt.failureMessage ??
      "First-playable validation failed before the draft was accepted.",
    gameSpecId: gamePack.gameSpec.id,
    ...(buildId ? { buildId } : {}),
    validationEvidenceIds: getValidationEvidenceIds(attempt),
    metadata: {
      validationAttemptStartedAt: attempt.startedAt,
      validationCompletedAt: completedAt,
      validationEvidenceByStage: groupValidationEvidenceReceipts(
        attempt.evidence
      ),
    },
  };
}

function getInitialCheckpointId(gamePack: GamePack): StableId {
  return gamePack.checkpoints[0]?.id ?? "checkpoint_initial_playable";
}

function getValidationEvidenceIds(
  attempt: FirstPlayableValidationAttempt
): StableId[] {
  return attempt.evidence.map((evidence) => evidence.id);
}

function getFirstFailedStage(
  evidence: ValidationEvidence[]
): ValidationEvidenceStage {
  return evidence.find((item) => item.status === "failed")?.stage ?? "schema";
}

function hasMountedRuntimeArtifact(evidence: ValidationEvidence[]) {
  return evidence.some(
    (item) => item.stage === "runtime-boot" || item.stage === "browser-check"
  );
}

function groupValidationEvidenceReceipts(
  evidence: ValidationEvidence[]
): Record<string, JsonValue> {
  const grouped: Record<
    string,
    Array<{
      checkId: StableId;
      id: StableId;
      status: ValidationEvidence["status"];
    }>
  > = {};

  for (const item of evidence) {
    grouped[item.stage] = grouped[item.stage] ?? [];
    grouped[item.stage].push({
      id: item.id,
      checkId: item.checkId,
      status: item.status,
    });
  }

  return grouped;
}

function upsertRecordsById<TRecord extends { id: StableId }>(
  existingRecords: TRecord[],
  nextRecords: TRecord[]
): TRecord[] {
  const nextRecordsById = new Map(
    nextRecords.map((record) => [record.id, record])
  );
  const updatedRecords = existingRecords.map((record) =>
    nextRecordsById.get(record.id) ?? record
  );
  const existingIds = new Set(existingRecords.map((record) => record.id));
  const newRecords = nextRecords.filter((record) => !existingIds.has(record.id));

  return [...updatedRecords, ...newRecords];
}
