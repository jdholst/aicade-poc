export {
  gameSpecSchema,
  parseGameSpec,
  stableIdSchema,
  type GameSpec,
  type GameSpecMechanicEntry,
  type GameSpecObjective,
  type GameSpecValidationGoal,
  type StableId,
} from "./game-spec-schema";

export {
  failedAttemptSchema,
  gamePackRuntimeKindSchema,
  gamePackSchema,
  generationRunSchema,
  parseGamePack,
  playableBuildSchema,
  validationEvidenceSchema,
  validationEvidenceStageSchema,
  validationEvidenceStatusSchema,
  versionCheckpointSchema,
  type FailedAttempt,
  type GamePack,
  type GamePackRuntimeKind,
  type GenerationRun,
  type PlayableBuild,
  type ValidationEvidence,
  type ValidationEvidenceStage,
  type ValidationEvidenceStatus,
  type VersionCheckpoint,
} from "./game-pack/game-pack-schema";

export {
  createInitialGamePack,
  type CreateInitialGamePackInput,
} from "./game-pack/game-pack-factory";

export {
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  type FirstPlayableRuntimeCandidate,
  type FirstPlayableRuntimeStatus,
  type FirstPlayableValidationAttempt,
  type FirstPlayableValidationStatus,
  type RecordFirstPlayableRuntimeEvidenceInput,
  type RecordFirstPlayableRuntimeStatusInput,
  type StartFirstPlayableValidationInput,
} from "./game-pack/first-playable-validation";

export {
  createMechanicRuntimeBridge,
  getMechanicDefinitionForScope,
  getMechanicDefinitionsForScope,
  getTopDownMechanicDefinition,
  getTopDownMechanicDefinitionsForSpec,
  TOP_DOWN_PHASER_MECHANIC_SCOPE,
  topDownMechanicRegistry,
  type MechanicCapabilityTag,
  type MechanicRegistryEntry,
  type MechanicRuntimeBridge,
  type MechanicRuntimeBridgeInput,
  type MechanicRuntimeScope,
  type MechanicValidationLayoutCoverageRequirement,
  type MechanicValidationRequirements,
} from "./mechanics/mechanic-registry";

export {
  GameSpecValidationError,
  getTopDownGameSpecValidationIssues,
  validateTopDownGameSpec,
  type GameSpecValidationIssue,
} from "./game-spec-validation";

export {
  parseTopDownGameSpec,
  parseTopDownSpec,
  topDownGameSpecSchema,
  topDownSpecSchema,
  type TopDownArena,
  type TopDownGameSpec,
  type TopDownObstacle,
  type TopDownPickupZone,
  type TopDownRegion,
  type TopDownScene,
  type TopDownSpawnZone,
  type TopDownSpec,
  type TopDownWall,
} from "./top-down-spec-schema";
