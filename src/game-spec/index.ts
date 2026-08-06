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
  createGenerationRunRepository,
  createIndexedDbGenerationRunRepository,
  GenerationRunRepositoryError,
  type GenerationRunRepository,
  type GenerationRunRepositoryErrorCode,
  type GenerationRunRepositoryOperation,
  type GenerationRunStorageDriver,
  type IndexedDbGenerationRunRepositoryOptions,
  type StoredGenerationRunRecord,
} from "./generation-run/generation-run-repository";

export {
  createGenerationRunJsonExport,
  createGenerationRunJsonExportText,
  createGenerationRunRepositoryJsonExport,
  createGenerationRunRepositoryJsonExportText,
  GENERATION_RUN_JSON_EXPORT_SCHEMA_VERSION,
  type GenerationRunJsonExport,
  type GenerationRunJsonExportAttempt,
  type GenerationRunJsonExportCandidate,
  type GenerationRunJsonExportCost,
  type GenerationRunJsonExportFilters,
  type GenerationRunJsonExportOptions,
  type GenerationRunJsonExportProviderModel,
  type GenerationRunJsonExportRun,
  type GenerationRunJsonExportValidation,
} from "./generation-run/generation-run-json-export";

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
  finalizeGenerationRunFromFirstPlayable,
  writeFirstPlayableTerminalResult,
  type FirstPlayableTerminalValidationState,
  type WriteFirstPlayableTerminalResultInput,
  type WriteFirstPlayableTerminalResultOutput,
} from "./game-pack/first-playable-terminal-result";

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
  resolveMechanicIntent,
  type BuiltInMechanicConfigurationField,
  type BuiltInMechanicCompositionResolution,
  type BuiltInMechanicContract,
  type BuiltInMechanicContractCoverage,
  type BuiltInMechanicResolution,
  type GeneratedMechanicResolution,
  type MechanicCoverageEvidence,
  type MechanicCoverageRequirement,
  type MechanicCapabilityGapResolution,
  type MechanicClarificationFailureResolution,
  type MechanicIntent,
  type MechanicIntentAmbiguity,
  type MechanicIntentConfigurationValue,
  type MechanicIntentConnection,
  type MechanicIntentReference,
  type MechanicReferenceKind,
  type MechanicResolution,
  type MechanicRequirementCategory,
  type MechanicResolutionAssumption,
  type ResolveMechanicIntentInput,
} from "./mechanics/mechanic-resolver";

export {
  resolveTopDownMechanicIntent,
  topDownBuiltInMechanicContracts,
  type ResolveTopDownMechanicIntentInput,
} from "./mechanics/top-down-built-in-mechanic-contracts";

export {
  GENERATION_CONSTRAINT_SET_SCHEMA_VERSION,
  generationConstraintSetSchema,
  parseGenerationConstraintSet,
  PHASE_9_GENERATION_CONSTRAINT_SET,
  type GenerationConstraintParseResult,
  type GenerationConstraintSet,
  type GenerationConstraintValidationIssue,
} from "./mechanics/mechanic-generation-constraints";

export {
  coordinateMechanicGeneration,
  type AdmittedGeneratedMechanicRequest,
  type CoordinateMechanicGenerationInput,
  type MechanicGenerationConstraintConflictEvidence,
  type MechanicGenerationCoordination,
} from "./mechanics/mechanic-generation-coordinator";

export {
  GENERATED_MECHANIC_CONTRACT_SCHEMA_VERSION,
  behaviorScenarioSchema,
  generatedMechanicContractSchema,
  mechanicConfigDslValueSchema,
  validateGeneratedMechanicContract,
  type BehaviorScenario,
  type GeneratedMechanicContract,
  type GeneratedMechanicReferenceCatalog,
  type GeneratedMechanicResourceBudget,
  type GeneratedMechanicContractValidationIssue,
  type GeneratedMechanicContractValidationResult,
  type MechanicConfigDslField,
  type MechanicConfigDslValue,
  type ValidateGeneratedMechanicContractInput,
} from "./mechanics/generated-mechanic-contract";

export {
  createMechanicCapabilityGrant,
  getMechanicCapabilityVersion,
  MECHANIC_CAPABILITY_VERSION,
  mechanicCapabilityRegistry,
  validateMechanicCapabilityUsage,
  type MechanicCapabilityConformanceRequirement,
  type MechanicCapabilityDefinition,
  type MechanicCapabilityRegistryVersion,
  type MechanicCapabilityResourceCosts,
  type CreateMechanicCapabilityGrantInput,
  type MechanicCapabilityGrant,
  type MechanicCapabilityGrantEntry,
  type MechanicCapabilityGrantIssue,
  type MechanicCapabilityGrantResult,
  type MechanicCapabilityUsageIssue,
  type MechanicCapabilityUsageValidationResult,
  type ValidateMechanicCapabilityUsageInput,
} from "./mechanics/mechanic-capability-registry";

export {
  MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY,
  MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION,
  runMechanicExecutionRealmConformanceSuite,
  type MechanicExecutionRealmCandidateAdapter,
  type MechanicExecutionRealmCandidateRun,
  type MechanicExecutionRealmConformanceGate,
  type MechanicExecutionRealmConformanceGateId,
  type MechanicExecutionRealmConformanceProbe,
  type MechanicExecutionRealmConformanceReport,
  type MechanicExecutionRealmProbeDiagnostic,
  type MechanicExecutionRealmProbeResult,
  type MechanicExecutionRealmResourceBudget,
  type MechanicExecutionRealmResourceDimension,
  type RunMechanicExecutionRealmConformanceSuiteInput,
} from "./mechanics/mechanic-execution-realm-conformance";

export {
  MECHANIC_EXECUTION_REALM_BROWSER_SESSION_PROTOCOL_VERSION,
  createMechanicExecutionRealmBrowserConformanceSession,
  createMechanicExecutionRealmConformanceSession,
  type CreateMechanicExecutionRealmBrowserConformanceSessionInput,
  type CreateMechanicExecutionRealmConformanceSessionInput,
  type MechanicExecutionRealmBrowserCandidateEndpoint,
  type MechanicExecutionRealmBrowserCandidateExecutionAcknowledgement,
  type MechanicExecutionRealmBrowserCandidateInitialization,
  type MechanicExecutionRealmBrowserCandidateRequest,
  type MechanicExecutionRealmBrowserCandidateResponse,
  type MechanicExecutionRealmBrowserRuntimeHeartbeatChallenge,
  type MechanicExecutionRealmBrowserRuntimeHeartbeatResponse,
  type MechanicExecutionRealmBrowserRuntimeInitialization,
  type MechanicExecutionRealmConformanceHost,
  type MechanicExecutionRealmConformanceSession,
} from "./mechanics/mechanic-execution-realm-conformance-session";

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
