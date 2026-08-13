import type { JsonValue, StableId } from "@/game-spec/game-spec-schema";
import type { GeneratedMechanicProjectDependency } from "@/game-spec/game-pack/generated-mechanic-project-handoff";
import {
  GENERATED_MECHANIC_EXECUTION_REALM_CANDIDATE_ID,
  GENERATED_MECHANIC_FIXED_STEP_INTERVAL_MILLISECONDS,
  GENERATED_MECHANIC_RESOURCE_BUDGET_PROFILE_ID,
  TOP_DOWN_PHASER_GENERATED_MECHANIC_HOST_PROFILE_ID,
  acceptedGeneratedMechanicArtifactSchema,
  createGeneratedMechanicRuntimePolicy,
  generatedMechanicFinalGameSpecSchema,
  type AcceptedGeneratedMechanicArtifact,
  type GeneratedMechanicRuntimePolicy,
} from "@/game-spec/mechanics/generated-mechanic-project-artifact";
import {
  createTopDownPhaserMechanicObjectHost,
  type TrustedTopDownPhaserMechanicObjectRegistration,
} from "@/runtime/phaser/top-down-mechanic-object-adapter";

import {
  createGeneratedMechanicLifecycleProgram,
} from "./generated-mechanic-lifecycle-program";
import { createMechanicObjectCapabilityHost } from "./mechanic-object-capability-host";
import {
  MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
  type MechanicExecutionRealmAdapter,
  type MechanicExecutionRealmBinding,
} from "./mechanic-execution-realm";
import { isMechanicExecutionRealmAdapterAuthentic } from "./mechanic-execution-realm-adapter-authenticity";
import {
  createMechanicLifecycleServices,
  type MechanicLifecycleServices,
} from "./mechanic-lifecycle";
import {
  createMechanicPrivateStateHost,
  type MechanicPrivateStateHost,
} from "./mechanic-private-state";
import {
  PHASE_9_MECHANIC_RESOURCE_BUDGET,
  createPhase9ContainedMechanicRuntime,
} from "./phase-9-contained-mechanic-runtime";
import type {
  ContainedMechanicRuntime,
  ContainedMechanicRuntimeState,
  ContainedMechanicRuntimeStep,
  MechanicRuntimeFailureEvidence,
} from "./contained-mechanic-runtime";

export const GENERATED_MECHANIC_RUNTIME_SESSION_VERSION =
  "generated_mechanic_runtime_session/v1" as const;

const SUPPORTED_SESSION_CAPABILITIES = new Set<StableId>([
  "object_read",
  "object_motion_write",
  "state_read",
  "state_write",
  "time_read",
  "random_next",
  "time_schedule",
  "event_subscribe",
]);

export type GeneratedMechanicRuntimeSessionIdentity = Readonly<{
  schemaVersion: typeof GENERATED_MECHANIC_RUNTIME_SESSION_VERSION;
  artifactId: StableId;
  extensionId: StableId;
  extensionVersionId: StableId;
  finalGameSpecArtifactId: StableId;
  gameSpecId: StableId;
  mechanicId: StableId;
  mechanicType: StableId;
  contractId: StableId;
  sourceArtifactId: StableId;
  capabilityVersion: string;
  buildId: StableId;
  runtimePolicy: Readonly<GeneratedMechanicRuntimePolicy>;
}>;

export type GeneratedMechanicRuntimeSession = Readonly<{
  identity: GeneratedMechanicRuntimeSessionIdentity;
  readonly state: ContainedMechanicRuntimeState;
  readonly failureEvidence: MechanicRuntimeFailureEvidence | undefined;
  install(): Promise<ContainedMechanicRuntimeStep>;
  dispatchLogicalAction(
    actionId: StableId,
    payload?: JsonValue
  ): Promise<ContainedMechanicRuntimeStep>;
  dispatchGameplayEvent(
    eventId: StableId,
    payload?: JsonValue
  ): Promise<ContainedMechanicRuntimeStep>;
  advanceSimulation(
    elapsedMilliseconds: number
  ): Promise<ContainedMechanicRuntimeStep>;
  dispose(): Promise<ContainedMechanicRuntimeStep>;
}>;

export type CreateGeneratedMechanicRuntimeSessionInput = Readonly<{
  artifact: AcceptedGeneratedMechanicArtifact;
  dependency: GeneratedMechanicProjectDependency;
  realmAdapter: MechanicExecutionRealmAdapter;
  objects: readonly TrustedTopDownPhaserMechanicObjectRegistration[];
}>;

export async function createGeneratedMechanicRuntimeSession({
  artifact: artifactInput,
  dependency,
  realmAdapter,
  objects,
}: CreateGeneratedMechanicRuntimeSessionInput): Promise<GeneratedMechanicRuntimeSession> {
  rejectUnsupportedRuntimeFeatures(artifactInput, dependency);

  const parsedArtifact = acceptedGeneratedMechanicArtifactSchema.safeParse(
    artifactInput
  );
  if (!parsedArtifact.success) {
    throw new TypeError(
      `Generated runtime session requires a valid accepted artifact: ${parsedArtifact.error.issues[0]?.message ?? "validation failed"}`
    );
  }
  const artifact = parsedArtifact.data;
  validateExactDependency(artifact, dependency);
  validateRuntimePolicy(artifact, dependency, realmAdapter);
  validateResourceExpectations(artifact);
  validateBoundObjects(artifact, dependency, objects);

  const program = createGeneratedMechanicLifecycleProgram({
    contract: artifact.contract,
    sourceArtifact: artifact.sourceArtifact,
    config: artifact.config,
    fixedStepIntervalMilliseconds:
      artifact.runtimePolicy.fixedStepIntervalMilliseconds ?? undefined,
  });

  let objectHost:
    | ReturnType<typeof createTopDownPhaserMechanicObjectHost>
    | undefined;
  let privateState: MechanicPrivateStateHost | undefined;
  let lifecycle: MechanicLifecycleServices | undefined;
  try {
    objectHost = createTopDownPhaserMechanicObjectHost({
      mechanicId: artifact.mechanicId,
      grant: artifact.sourceArtifact.grant,
      bindings: artifact.bindings.map((binding) => ({
        id: binding.id,
        cardinality: binding.cardinality,
        getObjectIds: () => Object.freeze([...binding.objectIds]),
      })),
      ownedObjectArchetypes: [],
      objects,
      ownedObjectFactories: Object.freeze({}),
    });
    const realmBindings: readonly MechanicExecutionRealmBinding[] = Object.freeze(
      artifact.bindings.map((binding) =>
        Object.freeze({
          id: binding.id,
          cardinality: binding.cardinality,
          handles:
            binding.cardinality === "one"
              ? Object.freeze([objectHost!.resolveOne(binding.id)])
              : objectHost!.resolveMany(binding.id),
        })
      )
    );
    const objectCapabilityHost = createMechanicObjectCapabilityHost(objectHost);
    privateState = createMechanicPrivateStateHost({
      grant: artifact.sourceArtifact.grant,
      declarations: artifact.contract.privateState,
      resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
    });
    const delegateCapabilityHost = privateState.createCapabilityHost(
      objectCapabilityHost
    );
    lifecycle = await createMechanicLifecycleServices({
      createRealm: ({
        capabilityHost,
        capabilityGrant,
        resourceBudget,
        seed,
      }) =>
        realmAdapter.create({
          mechanicId: artifact.mechanicId,
          capabilityGrant,
          bindings: realmBindings,
          capabilityHost,
          seed,
          resourceBudget,
        }),
      delegateCapabilityHost,
      capabilityGrant: artifact.sourceArtifact.grant,
      program,
      seed: artifact.runtimePolicy.seed,
      resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
    });
    const runtime = createPhase9ContainedMechanicRuntime({
      extensionId: artifact.extensionId,
      buildId: artifact.buildId,
      capabilityVersion: artifact.contract.capabilityVersion,
      seed: artifact.runtimePolicy.seed,
      lifecycle,
      ownedObjects: objectHost,
      privateState,
    });
    return createRetainedSession(artifact, runtime);
  } catch (error) {
    return await disposeFailedComposition(
      lifecycle,
      objectHost,
      privateState,
      error
    );
  }
}

function createRetainedSession(
  artifact: AcceptedGeneratedMechanicArtifact,
  runtime: ContainedMechanicRuntime
): GeneratedMechanicRuntimeSession {
  const admittedActionIds = new Set(artifact.referenceCatalog.action ?? []);
  const identity = Object.freeze({
    schemaVersion: GENERATED_MECHANIC_RUNTIME_SESSION_VERSION,
    artifactId: artifact.id,
    extensionId: artifact.extensionId,
    extensionVersionId: artifact.versionId,
    finalGameSpecArtifactId: artifact.finalGameSpecArtifactId,
    gameSpecId: artifact.gameSpecId,
    mechanicId: artifact.mechanicId,
    mechanicType: artifact.mechanicType,
    contractId: artifact.contract.id,
    sourceArtifactId: artifact.sourceArtifact.id,
    capabilityVersion: artifact.contract.capabilityVersion,
    buildId: artifact.buildId,
    runtimePolicy: freezeRuntimePolicy(artifact.runtimePolicy),
  });
  return Object.freeze({
    identity,
    get state() {
      return runtime.state;
    },
    get failureEvidence() {
      return runtime.failureEvidence;
    },
    install: () => runtime.install(),
    dispatchLogicalAction: (actionId: StableId, payload?: JsonValue) =>
      admittedActionIds.has(actionId)
        ? runtime.dispatchLogicalAction(actionId, payload)
        : Promise.resolve(
            Object.freeze({
              outcome: "completed" as const,
              results: Object.freeze([]),
            })
          ),
    dispatchGameplayEvent: (eventId: StableId, payload?: JsonValue) =>
      runtime.dispatchGameplayEvent(eventId, payload),
    advanceSimulation: (elapsedMilliseconds: number) =>
      runtime.advanceSimulation(elapsedMilliseconds),
    dispose: () => runtime.dispose(),
  });
}

function rejectUnsupportedRuntimeFeatures(
  artifact: AcceptedGeneratedMechanicArtifact,
  dependency: GeneratedMechanicProjectDependency
): void {
  if (
    artifact.contract.ports.length > 0 ||
    dependency.trustedPortContracts.length > 0
  ) {
    throw new Error(
      "Generated runtime sessions do not admit mechanic ports before a trusted signal host is installed."
    );
  }
  if (artifact.contract.ownedObjects.length > 0) {
    throw new Error(
      "Generated runtime sessions do not admit mechanic-owned objects."
    );
  }
  for (const capabilityId of artifact.contract.capabilities) {
    if (!SUPPORTED_SESSION_CAPABILITIES.has(capabilityId)) {
      throw new Error(
        `Generated runtime session capability "${capabilityId}" is unsupported by the retained host.`
      );
    }
  }
}

function validateExactDependency(
  artifact: AcceptedGeneratedMechanicArtifact,
  dependency: GeneratedMechanicProjectDependency
): void {
  const parsedFinalGameSpec = generatedMechanicFinalGameSpecSchema.safeParse(
    dependency.finalGameSpec
  );
  if (!parsedFinalGameSpec.success) {
    throw new TypeError(
      `Generated runtime session requires a valid Final Game Spec: ${parsedFinalGameSpec.error.issues[0]?.message ?? "validation failed"}`
    );
  }
  if (!jsonEqual(dependency.contract, artifact.contract)) {
    throw new Error(
      "Generated runtime session dependency contract does not exactly match the accepted artifact."
    );
  }
  if (!jsonEqual(dependency.sourceArtifact, artifact.sourceArtifact)) {
    throw new Error(
      "Generated runtime session dependency source does not exactly match the accepted artifact."
    );
  }
  if (!jsonEqual(dependency.referenceCatalog, artifact.referenceCatalog)) {
    throw new Error(
      "Generated runtime session dependency references do not exactly match the accepted artifact."
    );
  }
  if (!jsonEqual(dependency.runtimePolicy, artifact.runtimePolicy)) {
    throw new Error(
      "Generated runtime session dependency policy does not exactly match the accepted artifact."
    );
  }

  const finalGameSpec = parsedFinalGameSpec.data;
  const expectedExtension = {
    id: artifact.extensionId,
    versionId: artifact.versionId,
    mechanicId: artifact.mechanicId,
    mechanicType: artifact.mechanicType,
    contractId: artifact.contract.id,
    sourceArtifactId: artifact.sourceArtifact.id,
    capabilityVersion: artifact.contract.capabilityVersion,
    config: artifact.config,
    bindings: artifact.bindings,
  };
  if (
    finalGameSpec.id !== artifact.finalGameSpecArtifactId ||
    finalGameSpec.gameSpec.id !== artifact.gameSpecId ||
    !jsonEqual(finalGameSpec.extension, expectedExtension)
  ) {
    throw new Error(
      "Generated runtime session Final Game Spec identity does not exactly match the accepted artifact."
    );
  }
  const installedMechanics = finalGameSpec.gameSpec.mechanics.filter(
    (mechanic) => mechanic.id === artifact.mechanicId
  );
  if (
    installedMechanics.length !== 1 ||
    installedMechanics[0]?.type !== artifact.mechanicType ||
    !jsonEqual(installedMechanics[0]?.config, artifact.config)
  ) {
    throw new Error(
      "Generated runtime session requires the exact accepted mechanic in the Final Game Spec."
    );
  }
}

function validateRuntimePolicy(
  artifact: AcceptedGeneratedMechanicArtifact,
  dependency: GeneratedMechanicProjectDependency,
  realmAdapter: MechanicExecutionRealmAdapter
): void {
  const expectedPolicy = createGeneratedMechanicRuntimePolicy({
    contract: artifact.contract,
    versionId: artifact.versionId,
  });
  if (
    !jsonEqual(artifact.runtimePolicy, expectedPolicy) ||
    !jsonEqual(dependency.runtimePolicy, expectedPolicy)
  ) {
    throw new Error(
      "Generated runtime session requires the exact immutable runtime policy."
    );
  }
  if (
    artifact.runtimePolicy.hostProfileId !==
      TOP_DOWN_PHASER_GENERATED_MECHANIC_HOST_PROFILE_ID ||
    artifact.runtimePolicy.executionRealmCandidateId !==
      GENERATED_MECHANIC_EXECUTION_REALM_CANDIDATE_ID ||
    artifact.runtimePolicy.resourceBudgetProfileId !==
      GENERATED_MECHANIC_RESOURCE_BUDGET_PROFILE_ID ||
    PHASE_9_MECHANIC_RESOURCE_BUDGET.profileId !==
      GENERATED_MECHANIC_RESOURCE_BUDGET_PROFILE_ID ||
    (artifact.contract.lifecycle.fixedStep
      ? artifact.runtimePolicy.fixedStepIntervalMilliseconds !==
        GENERATED_MECHANIC_FIXED_STEP_INTERVAL_MILLISECONDS
      : artifact.runtimePolicy.fixedStepIntervalMilliseconds !== null)
  ) {
    throw new Error(
      "Generated runtime session policy does not match the fixed Phase 9 host constants."
    );
  }
  if (
    !isMechanicExecutionRealmAdapterAuthentic(realmAdapter) ||
    realmAdapter.adapterVersion !== MECHANIC_EXECUTION_REALM_ADAPTER_VERSION ||
    realmAdapter.id !== artifact.runtimePolicy.executionRealmCandidateId
  ) {
    throw new Error(
      "Generated runtime session realm adapter does not match the accepted execution candidate."
    );
  }
}

function validateResourceExpectations(
  artifact: AcceptedGeneratedMechanicArtifact
): void {
  const expectations = artifact.contract.resourceExpectations;
  const budget = PHASE_9_MECHANIC_RESOURCE_BUDGET;
  const limits: readonly [number, number, string][] = [
    [expectations.maximumOwnedObjects, budget.maximumOwnedObjects, "owned objects"],
    [
      expectations.maximumOperationsPerTick,
      budget.maximumOperationsPerTick,
      "operations per tick",
    ],
    [
      expectations.maximumScheduledCallbacks,
      budget.maximumScheduledCallbacks,
      "scheduled callbacks",
    ],
    [
      expectations.maximumSubscriptions,
      budget.maximumSubscriptions,
      "subscriptions",
    ],
    [
      expectations.maximumSignalsPerTick,
      budget.maximumSignalsPerTick,
      "signals per tick",
    ],
    [expectations.maximumStateBytes, budget.maximumStateBytes, "state bytes"],
    [
      expectations.maximumCallbackMilliseconds,
      budget.maximumCallbackMilliseconds,
      "callback milliseconds",
    ],
    [
      expectations.maximumConsecutiveFailures,
      budget.maximumConsecutiveFailures,
      "consecutive failures",
    ],
  ];
  const exceeded = limits.find(([expected, maximum]) => expected > maximum);
  if (exceeded) {
    throw new Error(
      `Generated runtime session contract exceeds the fixed ${exceeded[2]} budget.`
    );
  }
}

function validateBoundObjects(
  artifact: AcceptedGeneratedMechanicArtifact,
  dependency: GeneratedMechanicProjectDependency,
  objects: readonly TrustedTopDownPhaserMechanicObjectRegistration[]
): void {
  const registrations = new Set<StableId>();
  for (const registration of objects) {
    if (registrations.has(registration.id)) {
      throw new Error(
        `Generated runtime session object "${registration.id}" was registered more than once.`
      );
    }
    registrations.add(registration.id);
  }
  const expectedObjectIds = new Set(
    artifact.bindings.flatMap((binding) => binding.objectIds)
  );
  const gameEntityIds = new Set(
    dependency.finalGameSpec.gameSpec.entities.map((entity) => entity.id)
  );
  for (const binding of artifact.bindings) {
    if (binding.referenceKind !== "entity") {
      throw new Error(
        `Generated runtime session binding "${binding.id}" must target top-down entity objects.`
      );
    }
    if (binding.cardinality === "one" && binding.objectIds.length !== 1) {
      throw new Error(
        `Generated runtime session singular binding "${binding.id}" must resolve exactly one object.`
      );
    }
    if (new Set(binding.objectIds).size !== binding.objectIds.length) {
      throw new Error(
        `Generated runtime session binding "${binding.id}" contains duplicate object IDs.`
      );
    }
    if (binding.objectIds.some((objectId) => !gameEntityIds.has(objectId))) {
      throw new Error(
        `Generated runtime session binding "${binding.id}" references a foreign game entity.`
      );
    }
  }
  const missing = [...expectedObjectIds].filter(
    (objectId) => !registrations.has(objectId)
  );
  const foreign = [...registrations].filter(
    (objectId) => !expectedObjectIds.has(objectId)
  );
  if (missing.length > 0 || foreign.length > 0) {
    throw new Error(
      `Generated runtime session object registrations must exactly match accepted bindings (missing: ${missing.join(", ") || "none"}; foreign: ${foreign.join(", ") || "none"}).`
    );
  }
}

async function disposeFailedComposition(
  lifecycle: MechanicLifecycleServices | undefined,
  objectHost:
    | ReturnType<typeof createTopDownPhaserMechanicObjectHost>
    | undefined,
  privateState: MechanicPrivateStateHost | undefined,
  primaryError: unknown
): Promise<never> {
  const errors = [primaryError];
  try {
    await lifecycle?.dispose();
  } catch (error) {
    errors.push(error);
  }
  try {
    objectHost?.dispose();
  } catch (error) {
    errors.push(error);
  }
  try {
    privateState?.dispose();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 1) {
    throw new AggregateError(
      errors,
      "Generated runtime session composition failed and cleanup did not complete."
    );
  }
  throw primaryError;
}

function freezeRuntimePolicy(
  policy: GeneratedMechanicRuntimePolicy
): Readonly<GeneratedMechanicRuntimePolicy> {
  return Object.freeze({ ...policy });
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${stableJsonStringify(child)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
