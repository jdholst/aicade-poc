export {
  GAME_SPEC_SCHEMA_VERSION,
  STABLE_ID_PATTERN,
  STABLE_ID_PATTERN_SOURCE,
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
  parseGamePack,
  playableBuildSchema,
  validationEvidenceSchema,
  validationEvidenceStageSchema,
  validationEvidenceStatusSchema,
  versionCheckpointSchema,
  type FailedAttempt,
  type GamePack,
  type GamePackRuntimeKind,
  type PlayableBuild,
  type ValidationEvidence,
  type ValidationEvidenceStage,
  type ValidationEvidenceStatus,
  type VersionCheckpoint,
} from "./game-pack/game-pack-schema";

export {
  generationRunAttemptReceiptSchema,
  generationRunAttemptValidationSchema,
  generationRunCandidateSummarySchema,
  generationRunCostEstimateSchema,
  generationRunFailureClassSchema,
  generationRunFailureStageSchema,
  generationRunOperationTypeSchema,
  generationRunRelationshipsSchema,
  generationRunRepairStatusSchema,
  generationRunRequestSchema,
  generationRunSchema,
  generationRunStatusSchema,
  generationRunUsageSchema,
  type GenerationRun,
  type GenerationRunAttemptReceipt,
  type GenerationRunAttemptValidation,
  type GenerationRunCandidateSummary,
  type GenerationRunCostEstimate,
  type GenerationRunFailureClass,
  type GenerationRunFailureStage,
  type GenerationRunOperationType,
  type GenerationRunRelationships,
  type GenerationRunRepairStatus,
  type GenerationRunRequest,
  type GenerationRunStatus,
  type GenerationRunUsage,
} from "./generation-run/generation-run-schema";

export {
  createInitialGamePack,
  type CreateInitialGamePackInput,
} from "./game-pack/game-pack-factory";

export {
  createGamePackPersistenceKey,
  getCurrentCheckpoint,
  hasCreatorFacingCheckpoint,
  restoreGamePackCheckpoint,
  type RestoreGamePackCheckpointInput,
} from "./game-pack/game-pack-lineage";

export {
  createGamePackRepository,
  createIndexedDbGamePackRepository,
  GamePackRepositoryError,
  type GamePackRepository,
  type GamePackRepositoryErrorCode,
  type GamePackRepositoryOperation,
  type GamePackStorageDriver,
  type IndexedDbGamePackRepositoryOptions,
  type StoredGamePackRecord,
} from "./game-pack/game-pack-repository";

export {
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  writeFirstPlayableValidationResult,
  type FirstPlayableRuntimeCandidate,
  type FirstPlayableRuntimeStatus,
  type FirstPlayableValidationAttempt,
  type FirstPlayableValidationStatus,
  type RecordFirstPlayableRuntimeEvidenceInput,
  type RecordFirstPlayableRuntimeStatusInput,
  type StartFirstPlayableValidationInput,
  type WriteFirstPlayableValidationResultInput,
} from "./game-pack/first-playable-validation";

export {
  createMechanicRuntimeBridge,
  getMechanicDefinitionForScope,
  getMechanicDefinitionsForScope,
  getTopDownMechanicDefinition,
  getTopDownMechanicDefinitionsForSpec,
  TOP_DOWN_PHASER_MECHANIC_SCOPE,
  topDownMechanicRegistry,
  topDownSpecGenerationMechanicTypes,
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
  TOP_DOWN_TEMPLATE_ID,
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
