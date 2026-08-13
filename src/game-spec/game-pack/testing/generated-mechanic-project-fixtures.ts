import {
  ARTIFACT_SCOPED_MECHANIC_REPAIR_VERSION,
  artifactScopedMechanicRepairReceiptSchema,
} from "@/game-spec/generation-run/artifact-scoped-mechanic-repair-receipt";
import { generationRunSchema } from "@/game-spec/generation-run/generation-run-schema";
import {
  GENERATED_MECHANIC_ACTIVATION_CHECK_ID,
  prepareRestoredGeneratedMechanicProject,
  type GeneratedMechanicProjectDependency,
} from "@/game-spec/game-pack/generated-mechanic-project-handoff";
import {
  parseGamePack,
  type GamePack,
} from "@/game-spec/game-pack/game-pack-schema";
import {
  ACCEPTED_GENERATED_MECHANIC_ARTIFACT_VERSION,
  PERSISTED_GENERATED_MECHANIC_SOURCE_ARTIFACT_VERSION,
  acceptedGeneratedMechanicArtifactSchema,
  createGeneratedMechanicRuntimePolicy,
  persistedGeneratedMechanicSourceArtifactSchema,
  type AcceptedGeneratedMechanicArtifact,
} from "@/game-spec/mechanics/generated-mechanic-project-artifact";
import {
  MECHANIC_CAPABILITY_VERSION,
  createMechanicCapabilityGrant,
} from "@/game-spec/mechanics/mechanic-capability-registry";
import {
  GENERATED_MECHANIC_CONTRACT_SCHEMA_VERSION,
  generatedMechanicContractSchema,
} from "@/game-spec/mechanics/generated-mechanic-contract";
import { PHASE_9_GENERATION_CONSTRAINT_SET } from "@/game-spec/mechanics/mechanic-generation-constraints";
import { parseTopDownGameSpec } from "@/game-spec/top-down-spec-schema";
import { crystalSpecChaseGameSpecFixtureInput } from "@/runtime/phaser/fixtures/crystal-spec-chase";

const CREATED_AT = "2026-08-11T12:00:00.000Z";
const ACCEPTED_AT = "2026-08-11T12:00:10.000Z";
const GAME_PACK_ID = "game_pack_generated_player_drift";
const GAME_SPEC_ID = "game_generated_player_drift";
const GENERATION_RUN_ID = "generation_run_generated_player_drift";
const CONTRACT_ID = "contract_generated_player_drift";
const INTENT_ID = "intent_generated_player_drift";
const SOURCE_ARTIFACT_ID = "source_generated_player_drift_v1";
const FINAL_GAME_SPEC_ARTIFACT_ID =
  "final_game_spec_generated_player_drift_v1";
const EXTENSION_ID = "extension_generated_player_drift";
const EXTENSION_VERSION_ID = "extension_generated_player_drift_v1";
const MECHANIC_ID = "mechanic_generated_player_drift";
const MECHANIC_TYPE = "generated_player_drift_counter";
const BUILD_ID = "build_generated_player_drift_v1";
const CHECKPOINT_ID = "checkpoint_generated_player_drift_v1";
const ACTIVATION_EVIDENCE_ID =
  "evidence_generated_player_drift_activation";
const CONFIG = Object.freeze({
  drift_velocity_x: 24,
  initial_count: 0,
});
const BINDINGS = Object.freeze([
  Object.freeze({
    id: "actor",
    referenceKind: "entity",
    cardinality: "one" as const,
    objectIds: Object.freeze(["entity_player"]),
  }),
]);

export type GeneratedMechanicProjectFixture = Readonly<{
  artifact: AcceptedGeneratedMechanicArtifact;
  dependency: GeneratedMechanicProjectDependency;
  gamePack: GamePack;
}>;

/**
 * Builds a durable accepted generated-mechanic project without repositories,
 * providers, runtime installation, or clock access.
 */
export function createGeneratedMechanicProjectFixture(): GeneratedMechanicProjectFixture {
  const gameSpec = parseTopDownGameSpec({
    ...crystalSpecChaseGameSpecFixtureInput,
    id: GAME_SPEC_ID,
    title: "Generated Player Drift",
    currentIntentSummary:
      "Drift the player at a fixed velocity while counting deterministic simulation steps.",
    mechanics: [
      ...crystalSpecChaseGameSpecFixtureInput.mechanics,
      {
        id: MECHANIC_ID,
        type: MECHANIC_TYPE,
        entityIds: ["entity_player"],
        sceneIds: ["scene_arena"],
        config: CONFIG,
      },
    ],
    mechanicConnections: {
      schemaVersion: "mechanic_port_connections/v1",
      connections: [],
    },
  });
  const contract = generatedMechanicContractSchema.parse({
    schemaVersion: GENERATED_MECHANIC_CONTRACT_SCHEMA_VERSION,
    id: CONTRACT_ID,
    intentId: INTENT_ID,
    capabilityVersion: MECHANIC_CAPABILITY_VERSION,
    behavior: {
      summary:
        "Apply a deterministic horizontal drift to the bound player and count fixed simulation steps.",
      triggers: ["fixed_step"],
      outcomes: ["player_velocity_changed", "step_count_incremented"],
    },
    config: {
      kind: "object",
      fields: [
        {
          key: "drift_velocity_x",
          required: true,
          value: { kind: "number", minimum: -200, maximum: 200 },
        },
        {
          key: "initial_count",
          required: true,
          value: { kind: "integer", minimum: 0, maximum: 1000 },
        },
      ],
    },
    bindings: BINDINGS,
    ownedObjects: [],
    privateState: [
      {
        id: "drift_step_count",
        valueType: "integer",
        initialValue: CONFIG.initial_count,
      },
    ],
    lifecycle: {
      callbacks: ["install"],
      fixedStep: true,
      dispose: true,
    },
    ports: [],
    capabilities: ["state_read", "state_write", "object_motion_write"],
    resourceExpectations: {
      maximumOwnedObjects: 0,
      maximumOperationsPerTick: 8,
      maximumScheduledCallbacks: 0,
      maximumSubscriptions: 0,
      maximumSignalsPerTick: 0,
      maximumStateBytes: 64,
      maximumCallbackMilliseconds: 8,
      maximumConsecutiveFailures: 1,
    },
    scenarios: [
      {
        id: "scenario_generated_player_drift",
        seed: 1729,
        setup: [
          { kind: "binding_present", bindingId: "actor" },
          {
            kind: "state_equals",
            stateId: "drift_step_count",
            value: CONFIG.initial_count,
          },
        ],
        steps: [{ kind: "advance_time", milliseconds: 16 }],
        observations: [
          {
            kind: "state_equals",
            stateId: "drift_step_count",
            value: 1,
          },
          {
            kind: "binding_property",
            bindingId: "actor",
            property: "velocity",
            operator: "equals",
            value: { x: CONFIG.drift_velocity_x, y: 0 },
          },
        ],
      },
    ],
  });
  const grant = createMechanicCapabilityGrant({
    contract,
    constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
  });
  if (!grant.success) {
    throw new Error(
      "Generated player-drift fixture capability grant must be admitted."
    );
  }
  const sourceArtifact = persistedGeneratedMechanicSourceArtifactSchema.parse({
    schemaVersion: PERSISTED_GENERATED_MECHANIC_SOURCE_ARTIFACT_VERSION,
    id: SOURCE_ARTIFACT_ID,
    contractId: CONTRACT_ID,
    intentId: INTENT_ID,
    capabilityVersion: MECHANIC_CAPABILITY_VERSION,
    grant: grant.data,
    usedCapabilities: ["state_read", "state_write", "object_motion_write"],
    callbacks: [
      {
        id: "install_generated_player_drift",
        kind: "install",
        sourceTypeScript:
          'await capabilities.state.write("drift_step_count", config.initial_count); return { installed: true };',
        normalizedJavaScript:
          'const __sparklineGeneratedMechanicCallback = async () => { await capabilities.state.write("drift_step_count", config.initial_count); return { installed: true }; };',
      },
      {
        id: "fixed_step_generated_player_drift",
        kind: "fixed_step",
        sourceTypeScript: [
          'const currentCount = await capabilities.state.read("drift_step_count");',
          "const nextCount = typeof currentCount === \"number\" ? currentCount + 1 : config.initial_count + 1;",
          'await capabilities.state.write("drift_step_count", nextCount);',
          "await capabilities.objects.writeMotion(bindings.actor, { velocity: { x: config.drift_velocity_x, y: 0 } });",
          "return { nextCount };",
        ].join(" "),
        normalizedJavaScript: [
          "const __sparklineGeneratedMechanicCallback = async () => {",
          'const currentCount = await capabilities.state.read("drift_step_count");',
          "const nextCount = typeof currentCount === \"number\" ? currentCount + 1 : config.initial_count + 1;",
          'await capabilities.state.write("drift_step_count", nextCount);',
          "await capabilities.objects.writeMotion(bindings.actor, { velocity: { x: config.drift_velocity_x, y: 0 } });",
          "return { nextCount };",
          "};",
        ].join(" "),
      },
      {
        id: "dispose_generated_player_drift",
        kind: "dispose",
        sourceTypeScript: "return null;",
        normalizedJavaScript:
          "const __sparklineGeneratedMechanicCallback = async () => null;",
      },
    ],
    build: {
      language: "typescript",
      target: "es2020",
      parsed: true,
      typechecked: true,
      compiled: true,
      staticValidationTarget: "normalized_javascript",
      staticValidationVersion:
        "generated_mechanic_source_static_validation/v1",
    },
  });
  const runtimePolicy = createGeneratedMechanicRuntimePolicy({
    contract,
    versionId: EXTENSION_VERSION_ID,
  });
  const referenceCatalog = {
    asset: gameSpec.assets.map(({ id }) => id),
    entity: gameSpec.entities.map(({ id }) => id),
    objective: gameSpec.objectives.map(({ id }) => id),
    region: gameSpec.template.config.scenes.flatMap(({ layout }) =>
      layout.regions.map(({ id }) => id)
    ),
    scene: gameSpec.template.config.scenes.map(({ id }) => id),
  };
  const finalGameSpec = {
    schemaVersion: "generated_mechanic_final_game_spec/v1" as const,
    id: FINAL_GAME_SPEC_ARTIFACT_ID,
    gameSpec,
    extension: {
      id: EXTENSION_ID,
      versionId: EXTENSION_VERSION_ID,
      mechanicId: MECHANIC_ID,
      mechanicType: MECHANIC_TYPE,
      contractId: CONTRACT_ID,
      sourceArtifactId: SOURCE_ARTIFACT_ID,
      capabilityVersion: MECHANIC_CAPABILITY_VERSION,
      config: CONFIG,
      bindings: BINDINGS,
    },
  };
  const repairReceipt = artifactScopedMechanicRepairReceiptSchema.parse({
    schemaVersion: ARTIFACT_SCOPED_MECHANIC_REPAIR_VERSION,
    generationRunId: GENERATION_RUN_ID,
    status: "succeeded",
    repairStatus: "not_needed",
    durationMs: 3,
    maximumAttempts: { contract: 3, source: 3, finalGameSpec: 3 },
    attemptCounts: { contract: 1, source: 1, finalGameSpec: 1 },
    attempts: [
      {
        id: "attempt_contract_generated_player_drift",
        stage: "contract",
        attemptNumber: 1,
        kind: "initial",
        status: "accepted",
        durationMs: 1,
        inputArtifactIds: [],
        artifactId: CONTRACT_ID,
      },
      {
        id: "attempt_source_generated_player_drift",
        stage: "source",
        attemptNumber: 1,
        kind: "initial",
        status: "accepted",
        durationMs: 1,
        inputArtifactIds: [CONTRACT_ID],
        artifactId: SOURCE_ARTIFACT_ID,
      },
      {
        id: "attempt_final_spec_generated_player_drift",
        stage: "finalGameSpec",
        attemptNumber: 1,
        kind: "initial",
        status: "accepted",
        durationMs: 1,
        inputArtifactIds: [CONTRACT_ID, SOURCE_ARTIFACT_ID],
        artifactId: FINAL_GAME_SPEC_ARTIFACT_ID,
      },
    ],
    artifacts: [
      {
        artifactId: CONTRACT_ID,
        stage: "contract",
        attemptId: "attempt_contract_generated_player_drift",
        status: "accepted",
        dependsOnArtifactIds: [],
      },
      {
        artifactId: SOURCE_ARTIFACT_ID,
        stage: "source",
        attemptId: "attempt_source_generated_player_drift",
        status: "accepted",
        dependsOnArtifactIds: [CONTRACT_ID],
      },
      {
        artifactId: FINAL_GAME_SPEC_ARTIFACT_ID,
        stage: "finalGameSpec",
        attemptId: "attempt_final_spec_generated_player_drift",
        status: "accepted",
        dependsOnArtifactIds: [SOURCE_ARTIFACT_ID],
      },
    ],
  });
  const generationRun = generationRunSchema.parse({
    id: GENERATION_RUN_ID,
    operationType: "generate",
    status: "succeeded",
    repairStatus: "not-needed",
    createdAt: "2026-08-11T11:59:50.000Z",
    startedAt: "2026-08-11T11:59:51.000Z",
    completedAt: CREATED_AT,
    durationMs: 9000,
    request: {
      summary: "Generate a generic player drift and counter mechanic.",
    },
    runtimeKind: "phaser",
    templateId: gameSpec.template.id,
    mechanicIds: [MECHANIC_ID],
    attempts: [
      {
        id: "generation_attempt_generated_player_drift",
        attemptNumber: 1,
        kind: "initial",
        status: "succeeded",
        provider: "fixture_provider",
        model: "fixture_model",
        taskRoute: "generated_mechanic_pipeline",
        requestSummary:
          "Generate a deterministic horizontal player drift with a private step counter.",
        startedAt: "2026-08-11T11:59:51.000Z",
        completedAt: CREATED_AT,
        durationMs: 9000,
        validation: { stage: "artifact-build", status: "passed" },
        candidate: {
          kind: "validated_spec",
          gameSpecId: gameSpec.id,
          summary: "Compiled player-drift mechanic accepted.",
        },
      },
    ],
    artifactScopedRepair: repairReceipt,
    relationships: {
      gamePackId: GAME_PACK_ID,
      gameSpecId: gameSpec.id,
      acceptedGeneratedMechanicArtifactIds: [EXTENSION_VERSION_ID],
      buildIds: [BUILD_ID],
      checkpointIds: [CHECKPOINT_ID],
      validationEvidenceIds: [ACTIVATION_EVIDENCE_ID],
    },
  });
  const artifact = acceptedGeneratedMechanicArtifactSchema.parse({
    schemaVersion: ACCEPTED_GENERATED_MECHANIC_ARTIFACT_VERSION,
    id: EXTENSION_VERSION_ID,
    extensionId: EXTENSION_ID,
    versionId: EXTENSION_VERSION_ID,
    sourceGenerationRunId: GENERATION_RUN_ID,
    acceptedAt: ACCEPTED_AT,
    finalGameSpecArtifactId: FINAL_GAME_SPEC_ARTIFACT_ID,
    finalGameSpec,
    gameSpecId: gameSpec.id,
    mechanicId: MECHANIC_ID,
    mechanicType: MECHANIC_TYPE,
    contract,
    sourceArtifact,
    runtimePolicy,
    config: CONFIG,
    bindings: BINDINGS,
    referenceCatalog,
    buildId: BUILD_ID,
    checkpointId: CHECKPOINT_ID,
    validationEvidenceIds: [ACTIVATION_EVIDENCE_ID],
  });
  const gamePack = parseGamePack({
    schemaVersion: "game-pack/v1",
    id: GAME_PACK_ID,
    title: "Generated Player Drift",
    createdAt: CREATED_AT,
    updatedAt: ACCEPTED_AT,
    runtimeKind: "phaser",
    templateId: gameSpec.template.id,
    currentCheckpointId: CHECKPOINT_ID,
    gameSpec,
    builds: [
      {
        id: BUILD_ID,
        createdAt: ACCEPTED_AT,
        runtimeKind: "phaser",
        templateId: gameSpec.template.id,
        gameSpecId: gameSpec.id,
        checkpointId: CHECKPOINT_ID,
        validationEvidenceIds: [ACTIVATION_EVIDENCE_ID],
        generatedMechanicArtifactIds: [artifact.id],
        status: "validated",
        artifactMetadata: {
          runtimeScriptPath: "/runtime/phaser/top-down-template.js",
        },
      },
    ],
    checkpoints: [
      {
        id: CHECKPOINT_ID,
        createdAt: ACCEPTED_AT,
        label: "Generated player drift",
        summary:
          "Accepted deterministic player-drift mechanic and private step counter.",
        gameSpecId: gameSpec.id,
        buildId: BUILD_ID,
        validationEvidenceIds: [ACTIVATION_EVIDENCE_ID],
        generatedMechanicArtifactIds: [artifact.id],
      },
    ],
    validationEvidence: [
      {
        id: ACTIVATION_EVIDENCE_ID,
        checkId: GENERATED_MECHANIC_ACTIVATION_CHECK_ID,
        stage: "runtime-boot",
        status: "passed",
        durationMs: 1,
        message:
          "Trusted template activated the exact generated player-drift dependency.",
        evidence: {
          acceptedAt: ACCEPTED_AT,
          artifactId: artifact.id,
          extensionId: artifact.extensionId,
          extensionVersionId: artifact.versionId,
          finalGameSpecArtifactId: artifact.finalGameSpecArtifactId,
          mechanicId: artifact.mechanicId,
          sourceArtifactId: artifact.sourceArtifact.id,
          capabilityVersion: artifact.contract.capabilityVersion,
          runtimePolicy,
        },
        generatedMechanicArtifactIds: [artifact.id],
      },
    ],
    failedAttempts: [],
    generationRuns: [generationRun],
    acceptedGeneratedMechanicArtifacts: [artifact],
  });
  const prepared = prepareRestoredGeneratedMechanicProject({
    gamePack,
    trustedPortContracts: [],
  });
  if (!prepared.success) {
    throw new Error(
      `Generated player-drift fixture did not prepare: ${prepared.issues
        .map(({ code }) => code)
        .join(", ")}`
    );
  }

  return Object.freeze({
    gamePack,
    artifact: prepared.data.artifact,
    dependency: prepared.data.dependency,
  });
}
