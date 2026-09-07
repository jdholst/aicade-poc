import {
  MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
  jsonValueSchema,
  type FinalGameSpecMechanicConnectionPlan,
  type JsonValue,
  type StableId,
} from "@/game-spec/game-spec-schema";
import {
  configDslValueMatches,
  mechanicConfigDslValueSchema,
  validateGeneratedMechanicContract,
  type GeneratedMechanicContract,
  type GeneratedMechanicReferenceCatalog,
} from "@/game-spec/mechanics/generated-mechanic-contract";
import {
  MECHANIC_CAPABILITY_VERSION,
  createMechanicCapabilityGrant,
  getMechanicCapabilityVersion,
  mechanicCapabilityRegistry,
  validateMechanicCapabilityUsage,
  type MechanicCapabilityGrant,
} from "@/game-spec/mechanics/mechanic-capability-registry";
import {
  consumeMechanicExecutionRealmConformanceReport,
  MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION,
  type MechanicExecutionRealmConformanceGateId,
  type MechanicExecutionRealmConformanceReport,
} from "@/game-spec/mechanics/mechanic-execution-realm-conformance";
import {
  parseGenerationConstraintSet,
  PHASE_9_GENERATION_CONSTRAINT_SET,
} from "@/game-spec/mechanics/mechanic-generation-constraints";
import { coordinateMechanicGeneration } from "@/game-spec/mechanics/mechanic-generation-coordinator";
import {
  resolveMechanicIntent,
  type MechanicIntent,
} from "@/game-spec/mechanics/mechanic-resolver";
import {
  MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
  type MechanicExecutionRealmAdapter,
  type MechanicExecutionRealmCapabilityHost,
  type MechanicExecutionRealmExecutionResult,
} from "@/runtime/mechanics/mechanic-execution-realm";
import { isMechanicExecutionRealmAdapterAuthentic } from "@/runtime/mechanics/mechanic-execution-realm-adapter-authenticity";
import {
  createGeneratedMechanicLifecycleProgram,
  type GeneratedMechanicLifecycleSourceArtifact,
} from "@/runtime/mechanics/generated-mechanic-lifecycle-program";
import {
  createMechanicLifecycleServices,
  type MechanicLifecycleProgram,
} from "@/runtime/mechanics/mechanic-lifecycle";
import {
  createMechanicObjectHost,
  type MechanicObjectHandle,
  type TrustedMechanicObjectObservation,
} from "@/runtime/mechanics/mechanic-object-host";
import {
  createMechanicPortRuntime,
  createTrustedGameSystemPortOwner,
  validateFinalGameSpecMechanicConnections,
  type MechanicPortContract,
  type MechanicPortDeliveryRecord,
  type MechanicPortRuntime,
  type MechanicPortStepResult,
} from "@/runtime/mechanics/mechanic-port-runtime";
import { createMechanicPrivateStateHost } from "@/runtime/mechanics/mechanic-private-state";
import {
  createPhase9ContainedMechanicRuntime,
  PHASE_9_MECHANIC_RESOURCE_BUDGET,
} from "@/runtime/mechanics/phase-9-contained-mechanic-runtime";
import type {
  ContainedMechanicRuntimeStep,
  MechanicRuntimeFailureEvidence,
} from "@/runtime/mechanics/contained-mechanic-runtime";

export const RUNTIME_AND_CONTRACT_FOUNDATION_GATE_VERSION =
  "runtime_contract_foundation_gate/v1";
export const RUNTIME_AND_CONTRACT_FOUNDATION_GATE_INTERNAL_TEST_CONTROL = Symbol(
  "runtime_contract_foundation_gate_internal_test_control"
);

const FOUNDATION_FIXTURE_ID = "runtime_contract_foundation_fixture";
const FOUNDATION_EXTENSION_ID = "foundation_fixture_extension";
const FOUNDATION_INTENT_ID = "foundation_fixture_intent";
const FOUNDATION_BUILD_ID = "foundation_fixture_build";
const FOUNDATION_SEED = 1729;
const FOUNDATION_REALM_CONFORMANCE_PROBE_COUNT = 32;
const FOUNDATION_SUBJECT_ID = "foundation_subject_object";
const FOUNDATION_USED_CAPABILITIES = Object.freeze([
  "object_read",
  "object_create",
  "state_read",
  "state_write",
  "time_read",
  "time_schedule",
  "random_next",
  "signal_emit",
] as const satisfies readonly StableId[]);

const REQUIRED_REALM_CONFORMANCE_GATES = Object.freeze([
  "usable_capability_execution",
  "forbidden_authority_isolation",
  "escape_resistance",
  "runaway_termination",
  "resource_enforcement",
  "determinism",
  "opaque_handle_isolation",
  "cleanup_and_recovery",
  "browser_integration",
  "diagnostic_quality",
] as const satisfies readonly MechanicExecutionRealmConformanceGateId[]);

const FOUNDATION_INTENT = Object.freeze({
  id: FOUNDATION_INTENT_ID,
  summary:
    "Exercise the admitted runtime and contract foundation through generic state, object, time, and signal operations.",
  triggers: ["foundation_action"],
  actors: ["foundation_subject"],
  targets: [],
  behaviors: ["record_admitted_observation"],
  ownedObjects: ["foundation_owned"],
  stateChanges: ["foundation_count_changes"],
  temporalRules: ["foundation_scheduled_step"],
  spatialRules: [],
  constraints: ["bounded_runtime"],
  configuration: [{ key: "enabled", value: true }],
  connections: [{ direction: "output", port: "foundation_output" }],
  references: [{ kind: "entity", id: FOUNDATION_SUBJECT_ID }],
  outcomes: ["foundation_record_emitted"],
  requiredCapabilities: FOUNDATION_USED_CAPABILITIES,
  ambiguities: [],
} as const satisfies MechanicIntent);

const FOUNDATION_REFERENCE_CATALOG = Object.freeze({
  entity: Object.freeze([FOUNDATION_SUBJECT_ID]),
  action: Object.freeze(["foundation_action"]),
} as const satisfies GeneratedMechanicReferenceCatalog);

const FOUNDATION_CONTRACT_CANDIDATE = Object.freeze({
  schemaVersion: "generated-mechanic-contract/v1",
  id: FOUNDATION_EXTENSION_ID,
  intentId: FOUNDATION_INTENT_ID,
  capabilityVersion: MECHANIC_CAPABILITY_VERSION,
  behavior: {
    summary:
      "Record one admitted observation through bounded generic runtime services.",
    triggers: ["foundation_action"],
    outcomes: ["foundation_record_emitted"],
  },
  config: {
    kind: "object",
    fields: [
      {
        key: "enabled",
        required: true,
        value: { kind: "boolean", default: true },
      },
      {
        key: "maximum_records",
        required: true,
        value: { kind: "integer", minimum: 1, maximum: 4, default: 1 },
      },
    ],
  },
  bindings: [
    {
      id: "foundation_subject",
      referenceKind: "entity",
      cardinality: "one",
      objectIds: [FOUNDATION_SUBJECT_ID],
    },
  ],
  ownedObjects: [
    {
      id: "foundation_owned",
      objectKind: "foundation_record",
      maximumInstances: 1,
    },
  ],
  privateState: [
    {
      id: "foundation_count",
      valueType: "integer",
      initialValue: 0,
    },
    {
      id: "foundation_buffer",
      valueType: "string",
      initialValue: "",
    },
  ],
  lifecycle: {
    callbacks: ["install", "logical_action", "scheduled"],
    fixedStep: false,
    dispose: true,
  },
  ports: [
    {
      id: "foundation_output",
      direction: "output",
      payload: { kind: "integer", minimum: 0, maximum: 4 },
    },
  ],
  capabilities: [...FOUNDATION_USED_CAPABILITIES],
  resourceExpectations: {
    maximumOwnedObjects: 1,
    maximumOperationsPerTick: 16,
    maximumScheduledCallbacks: 1,
    maximumSubscriptions: 0,
    maximumSignalsPerTick: 1,
    maximumStateBytes: 1024,
    maximumCallbackMilliseconds: 8,
    maximumConsecutiveFailures: 1,
  },
  scenarios: [
    {
      id: "foundation_scenario",
      seed: FOUNDATION_SEED,
      setup: [
        { kind: "binding_present", bindingId: "foundation_subject" },
        {
          kind: "state_equals",
          stateId: "foundation_count",
          value: 0,
        },
      ],
      steps: [
        { kind: "dispatch_action", actionId: "foundation_action" },
        { kind: "advance_time", milliseconds: 8 },
      ],
      observations: [
        {
          kind: "state_equals",
          stateId: "foundation_count",
          value: 1,
        },
        {
          kind: "binding_property",
          bindingId: "foundation_subject",
          property: "active",
          operator: "equals",
          value: true,
        },
        {
          kind: "owned_object_count",
          archetypeId: "foundation_owned",
          operator: "at_most",
          value: 1,
        },
        {
          kind: "output_emitted",
          portId: "foundation_output",
          value: 1,
        },
      ],
    },
  ],
} as const satisfies GeneratedMechanicContract);

const FOUNDATION_MECHANIC_PORT_CONTRACT = Object.freeze({
  ownerKind: "mechanic",
  ownerId: FOUNDATION_EXTENSION_ID,
  ports: FOUNDATION_CONTRACT_CANDIDATE.ports,
} as const satisfies MechanicPortContract);

const FOUNDATION_SYSTEM_PORT_CONTRACT = Object.freeze({
  ownerKind: "game_system",
  ownerId: "foundation_observer",
  ports: [
    {
      id: "foundation_input",
      direction: "input",
      payload: { kind: "integer", minimum: 0, maximum: 4 },
    },
  ],
} as const satisfies MechanicPortContract & { ownerKind: "game_system" });

const FOUNDATION_CONNECTION_PLAN: FinalGameSpecMechanicConnectionPlan = {
  schemaVersion: MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
  connections: [
    {
      id: "foundation_connection",
      output: {
        ownerKind: "mechanic",
        ownerId: FOUNDATION_EXTENSION_ID,
        portId: "foundation_output",
      },
      input: {
        ownerKind: "game_system",
        ownerId: "foundation_observer",
        portId: "foundation_input",
      },
    },
  ],
};

const FOUNDATION_INSTALL_SOURCE = `
const __sparklineGeneratedMechanicCallback = async () => {
  const foundationSubject = bindings.foundation_subject;
  const foundationObservation = await capabilities.objects.read(foundationSubject);
  await capabilities.objects.create("foundation_owned", { active: true });
  await capabilities.state.write("foundation_count", 0);
  const foundationTime = await capabilities.time.now();
  const foundationRandom = await capabilities.random.next();
  await capabilities.time.schedule(8, "foundation_scheduled");
  return { observation: foundationObservation, time: foundationTime, random: foundationRandom };
};
`.trim();
const FOUNDATION_ACTION_SOURCE =
  "const __sparklineGeneratedMechanicCallback = async () => input;";
const FOUNDATION_CONTAINMENT_SOURCE = `
const __sparklineGeneratedMechanicCallback = async () => {
  await capabilities.state.write("foundation_buffer", "x".repeat(1024));
  return null;
};
`.trim();
const FOUNDATION_SCHEDULED_SOURCE = `
const __sparklineGeneratedMechanicCallback = async () => {
  const foundationCount = await capabilities.state.read("foundation_count");
  const foundationNextCount = foundationCount + 1;
  await capabilities.state.write("foundation_count", foundationNextCount);
  await capabilities.signals.emit("foundation_output", foundationNextCount);
  return foundationNextCount;
};
`.trim();
const FOUNDATION_DISPOSE_SOURCE =
  "const __sparklineGeneratedMechanicCallback = async () => null;";

export type RuntimeAndContractFoundationBoundary =
  | "intent_resolution"
  | "constraint_admission"
  | "contract_validation"
  | "config_dsl"
  | "capability_registry"
  | "capability_grant"
  | "realm_conformance"
  | "binding_admission"
  | "lifecycle"
  | "ports"
  | "deterministic_services"
  | "resource_budget"
  | "containment"
  | "cleanup";

export type RuntimeAndContractFoundationCheck = Readonly<{
  boundary: RuntimeAndContractFoundationBoundary;
  status: "passed" | "failed";
  code: string;
  message: string;
  details?: JsonValue;
}>;

export type RuntimeAndContractFoundationTrace = Readonly<{
  install: readonly RuntimeAndContractFoundationExecutionRecord[];
  action: readonly RuntimeAndContractFoundationExecutionRecord[];
  scheduled: readonly RuntimeAndContractFoundationExecutionRecord[];
  deliveries: readonly RuntimeAndContractFoundationDeliveryRecord[];
  trustedState: JsonValue;
}>;

export type RuntimeAndContractFoundationExecutionRecord = Readonly<{
  executionId: StableId;
  outcome: MechanicExecutionRealmExecutionResult["outcome"];
  output?: JsonValue;
  callback?: MechanicExecutionRealmExecutionResult["callback"];
  resourceUsage?: MechanicExecutionRealmExecutionResult["resourceUsage"];
  diagnostic?: MechanicExecutionRealmExecutionResult["diagnostic"];
}>;

export type RuntimeAndContractFoundationDeliveryRecord = Readonly<{
  sequence: number;
  connectionId: StableId;
  payload: JsonValue;
}>;

export type RuntimeAndContractFoundationCleanupRecord = Readonly<{
  lifecycleDisposed: boolean;
  registrationsRemoved: boolean;
  ownedObjectsRemoved: boolean;
  privateStateRemoved: boolean;
}>;

export type RuntimeAndContractFoundationGateEvidence = Readonly<{
  fixtureId: typeof FOUNDATION_FIXTURE_ID;
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
  usedCapabilities: readonly StableId[];
  realmConformance: Readonly<{
    suiteVersion: typeof MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION;
    candidateId: StableId;
    verdict: "passed";
    gateIds: readonly MechanicExecutionRealmConformanceGateId[];
  }>;
  deterministicTrace: Readonly<{
    first: RuntimeAndContractFoundationTrace;
    replay: RuntimeAndContractFoundationTrace;
  }>;
  containment: MechanicRuntimeFailureEvidence;
  cleanup: Readonly<{
    nominal: RuntimeAndContractFoundationCleanupRecord;
    replay: RuntimeAndContractFoundationCleanupRecord;
    containedFailure: RuntimeAndContractFoundationCleanupRecord;
  }>;
}>;

export type RuntimeAndContractFoundationGateResult =
  | Readonly<{
      schemaVersion: typeof RUNTIME_AND_CONTRACT_FOUNDATION_GATE_VERSION;
      status: "passed";
      sourceGenerationAvailable: true;
      checks: readonly RuntimeAndContractFoundationCheck[];
      evidence: RuntimeAndContractFoundationGateEvidence;
      terminalResult: Readonly<{
        code: "runtime_contract_foundation_gate_passed";
      }>;
    }>
  | Readonly<{
      schemaVersion: typeof RUNTIME_AND_CONTRACT_FOUNDATION_GATE_VERSION;
      status: "failed";
      sourceGenerationAvailable: false;
      checks: readonly RuntimeAndContractFoundationCheck[];
      terminalResult: Readonly<{
        code: "runtime_contract_foundation_gate_failed";
        failedBoundary: RuntimeAndContractFoundationBoundary;
      }>;
    }>;

export type RunRuntimeAndContractFoundationGateInput = {
  realmAdapter: MechanicExecutionRealmAdapter;
  realmConformanceReport: MechanicExecutionRealmConformanceReport | undefined;
};

type FoundationCycleResult = Readonly<{
  trace: RuntimeAndContractFoundationTrace;
  cleanup: RuntimeAndContractFoundationCleanupRecord;
  bindingObservation: JsonValue;
  containment?: MechanicRuntimeFailureEvidence;
}>;

const passedGateResults = new WeakSet<RuntimeAndContractFoundationGateResult>();
const deliberateFailureBoundaries = new WeakMap<
  RuntimeAndContractFoundationCheck[],
  RuntimeAndContractFoundationBoundary
>();

class FoundationBoundaryError extends Error {
  constructor(
    readonly boundary: RuntimeAndContractFoundationBoundary,
    readonly code: string,
    message: string,
    readonly details?: JsonValue
  ) {
    super(message);
    this.name = "FoundationBoundaryError";
  }
}

export function isMechanicSourceGenerationAvailable(
  gateResult: RuntimeAndContractFoundationGateResult | undefined
): boolean {
  return (
    gateResult !== undefined &&
    passedGateResults.has(gateResult) &&
    gateResult.schemaVersion ===
      RUNTIME_AND_CONTRACT_FOUNDATION_GATE_VERSION &&
    gateResult.status === "passed" &&
    gateResult.sourceGenerationAvailable === true
  );
}

export async function runRuntimeAndContractFoundationGate(
  input: RunRuntimeAndContractFoundationGateInput
): Promise<RuntimeAndContractFoundationGateResult> {
  const { realmAdapter, realmConformanceReport } = input;
  const checks: RuntimeAndContractFoundationCheck[] = [];
  const internalTestControl = (
    input as RunRuntimeAndContractFoundationGateInput & {
      [RUNTIME_AND_CONTRACT_FOUNDATION_GATE_INTERNAL_TEST_CONTROL]?: Readonly<{
        failBoundary: RuntimeAndContractFoundationBoundary;
      }>;
    }
  )[RUNTIME_AND_CONTRACT_FOUNDATION_GATE_INTERNAL_TEST_CONTROL];
  if (internalTestControl) {
    deliberateFailureBoundaries.set(checks, internalTestControl.failBoundary);
  }

  try {
    const resolution = runBoundary(
      checks,
      "intent_resolution",
      "intent_resolution_passed",
      "The generic Mechanic Intent resolved to generated work.",
      () => {
        const result = resolveMechanicIntent({
          intent: FOUNDATION_INTENT,
          builtInContracts: [],
          availableCapabilities: mechanicCapabilityRegistry.capabilities.map(
            (capability) => capability.id
          ),
          clarificationStrategy: "infer_or_fail",
        });
        if (result.kind !== "generated_mechanic") {
          failBoundary(
            "intent_resolution",
            "foundation_intent_not_generated",
            `Foundation intent resolved as "${result.kind}".`,
            snapshotData(result)
          );
        }
        return result;
      }
    );

    const admittedRequest = runBoundary(
      checks,
      "constraint_admission",
      "constraint_admission_passed",
      "The Phase 9 constraint set admitted exactly one generated mechanic.",
      () => {
        const parsedConstraints = parseGenerationConstraintSet(
          PHASE_9_GENERATION_CONSTRAINT_SET
        );
        if (!parsedConstraints.success) {
          failBoundary(
            "constraint_admission",
            parsedConstraints.evidence.code,
            "The Phase 9 Generation Constraint Set is invalid.",
            snapshotData(parsedConstraints.evidence)
          );
        }
        const coordination = coordinateMechanicGeneration({
          generationRunId: "foundation_fixture_run",
          resolutions: [resolution],
        });
        if (coordination.kind !== "generation_admitted") {
          failBoundary(
            "constraint_admission",
            coordination.kind === "constraint_conflict"
              ? coordination.evidence.code
              : "foundation_generation_not_admitted",
            "The foundation fixture was not admitted for generation.",
            snapshotData(coordination)
          );
        }
        return coordination.requests[0];
      }
    );

    const contract = runBoundary(
      checks,
      "contract_validation",
      "contract_validation_passed",
      "The complete generic contract and its declarative scenarios are valid.",
      () => {
        const validation = validateGeneratedMechanicContract({
          input: FOUNDATION_CONTRACT_CANDIDATE,
          constraintSet: admittedRequest.constraintSet,
          referenceCatalog: FOUNDATION_REFERENCE_CATALOG,
          resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
        });
        if (!validation.success) {
          failBoundary(
            "contract_validation",
            validation.evidence.code,
            "The foundation contract failed validation.",
            snapshotData(validation.evidence)
          );
        }
        return validation.data;
      }
    );

    runBoundary(
      checks,
      "config_dsl",
      "config_dsl_passed",
      "The restricted Config DSL and port payload declarations are valid.",
      () => {
        const declarations = [contract.config, ...contract.ports.map((port) => port.payload)];
        if (
          !declarations.every(
            (declaration) =>
              mechanicConfigDslValueSchema.safeParse(declaration).success
          ) ||
          !configDslValueMatches(contract.config, {
            enabled: true,
            maximum_records: 1,
          }, FOUNDATION_REFERENCE_CATALOG)
        ) {
          failBoundary(
            "config_dsl",
            "invalid_foundation_config_dsl",
            "The foundation Config DSL did not admit its generic configuration."
          );
        }
      }
    );

    runBoundary(
      checks,
      "capability_registry",
      "capability_registry_passed",
      "The pinned capability version supplies every required primitive.",
      () => {
        const version = getMechanicCapabilityVersion(contract.capabilityVersion);
        const registryIds = new Set<string>(
          version?.capabilities.map((capability) => capability.id) ?? []
        );
        if (
          !version ||
          version.version !== admittedRequest.constraintSet.capabilityVersion ||
          !contract.capabilities.every((capabilityId) =>
            registryIds.has(capabilityId)
          )
        ) {
          failBoundary(
            "capability_registry",
            "foundation_capability_registry_mismatch",
            "The foundation contract, constraint set, and registry version drifted."
          );
        }
      }
    );

    const grant = runBoundary(
      checks,
      "capability_grant",
      "capability_grant_passed",
      "The exact least-authority grant matches verified fixture usage.",
      () => {
        const grantResult = createMechanicCapabilityGrant({
          contract,
          constraintSet: admittedRequest.constraintSet,
        });
        if (!grantResult.success) {
          failBoundary(
            "capability_grant",
            grantResult.evidence.code,
            "The foundation capability grant was rejected.",
            snapshotData(grantResult.evidence)
          );
        }
        const usage = validateMechanicCapabilityUsage({
          grant: grantResult.data,
          usedCapabilities: FOUNDATION_USED_CAPABILITIES,
        });
        if (!usage.success) {
          failBoundary(
            "capability_grant",
            usage.evidence.code,
            "The foundation capability usage is not exact.",
            snapshotData(usage.evidence)
          );
        }
        return grantResult.data;
      }
    );

    const realmEvidence = runBoundary(
      checks,
      "realm_conformance",
      "realm_conformance_passed",
      "The selected replaceable realm passed every v3 hard gate.",
      () => validateRealmConformance(realmAdapter, realmConformanceReport)
    );

    const nominal = await runFoundationCycle({
      realmAdapter,
      contract,
      grant,
      mechanicId: FOUNDATION_EXTENSION_ID,
      containmentProbe: false,
    });

    runBoundary(
      checks,
      "binding_admission",
      "binding_admission_passed",
      "The admitted binding crossed the realm only as an opaque handle.",
      () => {
        if (
          !isRecord(nominal.bindingObservation) ||
          nominal.bindingObservation.kind !== "foundation_subject" ||
          nominal.bindingObservation.active !== true
        ) {
          failBoundary(
            "binding_admission",
            "foundation_binding_observation_invalid",
            "The foundation binding did not produce the admitted observation."
          );
        }
      }
    );

    runBoundary(
      checks,
      "lifecycle",
      "lifecycle_passed",
      "Install, logical action, scheduled callback, and disposal completed in host order.",
      () => {
        if (
          nominal.trace.install.length !== 1 ||
          nominal.trace.action.length !== 1 ||
          nominal.trace.scheduled.length !== 1
        ) {
          failBoundary(
            "lifecycle",
            "foundation_lifecycle_trace_incomplete",
            "The foundation lifecycle trace is incomplete.",
            snapshotData(nominal.trace)
          );
        }
      }
    );

    runBoundary(
      checks,
      "ports",
      "ports_passed",
      "One immutable signal was delivered after its callback to a trusted state owner.",
      () => {
        if (
          nominal.trace.deliveries.length !== 1 ||
          nominal.trace.deliveries[0].connectionId !==
            "foundation_connection" ||
          !isRecord(nominal.trace.trustedState) ||
          nominal.trace.trustedState.lastValue !== 1
        ) {
          failBoundary(
            "ports",
            "foundation_port_delivery_invalid",
            "The foundation port delivery did not reach its trusted state owner.",
            snapshotData(nominal.trace)
          );
        }
      }
    );

    const containedFailureCycle = await runFoundationCycle({
      realmAdapter,
      contract,
      grant,
      mechanicId: FOUNDATION_EXTENSION_ID,
      containmentProbe: true,
    });
    const replay = await runFoundationCycle({
      realmAdapter,
      contract,
      grant,
      mechanicId: FOUNDATION_EXTENSION_ID,
      containmentProbe: false,
    });

    runBoundary(
      checks,
      "deterministic_services",
      "deterministic_services_passed",
      "Identical seed, time, actions, and fixtures produced identical traces after recovery.",
      () => {
        if (!jsonEqual(nominal.trace, replay.trace)) {
          failBoundary(
            "deterministic_services",
            "foundation_deterministic_replay_mismatch",
            "The foundation deterministic replay diverged.",
            snapshotData({ first: nominal.trace, replay: replay.trace })
          );
        }
      }
    );

    runBoundary(
      checks,
      "resource_budget",
      "resource_budget_passed",
      "The immutable Phase 9 budget was admitted and its state limit was enforced exactly.",
      () => {
        const containment = containedFailureCycle.containment;
        if (
          admittedRequest.constraintSet.resourceBudgetProfile !==
            PHASE_9_MECHANIC_RESOURCE_BUDGET.profileId ||
          containment?.failure.kind !== "resource_budget" ||
          containment.failure.dimension !== "state_bytes" ||
          containment.failure.limit !==
            PHASE_9_MECHANIC_RESOURCE_BUDGET.maximumStateBytes ||
          containment.failure.observed !==
            PHASE_9_MECHANIC_RESOURCE_BUDGET.maximumStateBytes + 1
        ) {
          failBoundary(
            "resource_budget",
            "foundation_resource_budget_not_enforced",
            "The foundation state-budget probe was not enforced exactly.",
            containment ? snapshotData(containment) : undefined
          );
        }
      }
    );

    const containment = runBoundary(
      checks,
      "containment",
      "containment_passed",
      "The deliberate budget violation invalidated only its runtime with repair-quality evidence.",
      () => {
        const evidence = containedFailureCycle.containment;
        if (
          !evidence ||
          evidence.playableResult !== "invalidated" ||
          evidence.cleanup.issues.length !== 0
        ) {
          failBoundary(
            "containment",
            "foundation_containment_incomplete",
            "The foundation failure was not fully contained.",
            evidence ? snapshotData(evidence) : undefined
          );
        }
        return evidence;
      }
    );

    runBoundary(
      checks,
      "cleanup",
      "cleanup_passed",
      "Nominal, replay, and contained-failure runs removed every registration and owned resource.",
      () => {
        const cleanupRecords = [
          nominal.cleanup,
          replay.cleanup,
          containedFailureCycle.cleanup,
        ];
        if (
          !cleanupRecords.every(
            (cleanup) =>
              cleanup.lifecycleDisposed &&
              cleanup.registrationsRemoved &&
              cleanup.ownedObjectsRemoved &&
              cleanup.privateStateRemoved
          )
        ) {
          failBoundary(
            "cleanup",
            "foundation_cleanup_incomplete",
            "The foundation fixture left runtime resources behind.",
            snapshotData(cleanupRecords)
          );
        }
      }
    );

    const evidence = snapshotData({
      fixtureId: FOUNDATION_FIXTURE_ID,
      contract,
      grant,
      usedCapabilities: FOUNDATION_USED_CAPABILITIES,
      realmConformance: realmEvidence,
      deterministicTrace: {
        first: nominal.trace,
        replay: replay.trace,
      },
      containment,
      cleanup: {
        nominal: nominal.cleanup,
        replay: replay.cleanup,
        containedFailure: containedFailureCycle.cleanup,
      },
    }) as RuntimeAndContractFoundationGateEvidence;

    const passedResult = Object.freeze({
      schemaVersion: RUNTIME_AND_CONTRACT_FOUNDATION_GATE_VERSION,
      status: "passed",
      sourceGenerationAvailable: true,
      checks: Object.freeze(checks.map((check) => Object.freeze({ ...check }))),
      evidence,
      terminalResult: Object.freeze({
        code: "runtime_contract_foundation_gate_passed",
      }),
    }) satisfies RuntimeAndContractFoundationGateResult;
    passedGateResults.add(passedResult);
    return passedResult;
  } catch (error) {
    const failure = normalizeBoundaryFailure(error);
    checks.push(failure);
    return createFailedGateResult(checks, failure.boundary);
  }
}

function validateRealmConformance(
  realmAdapter: MechanicExecutionRealmAdapter,
  report: MechanicExecutionRealmConformanceReport | undefined
): RuntimeAndContractFoundationGateEvidence["realmConformance"] {
  if (!report) {
    failBoundary(
      "realm_conformance",
      "realm_conformance_evidence_missing",
      "Mechanic Execution Realm conformance evidence is required."
    );
  }
  const trustedReport =
    consumeMechanicExecutionRealmConformanceReport(report);
  if (!trustedReport) {
    failBoundary(
      "realm_conformance",
      "realm_conformance_evidence_untrusted",
      "Mechanic Execution Realm conformance evidence must come directly from the trusted single-run suite."
    );
  }
  if (!isMechanicExecutionRealmAdapterAuthentic(realmAdapter)) {
    failBoundary(
      "realm_conformance",
      "realm_conformance_adapter_untrusted",
      "The Mechanic Execution Realm adapter was not minted by an admitted implementation factory."
    );
  }
  const reportedGateStatuses = new Map(
    trustedReport.gates.map((gate) => [gate.id, gate.status])
  );
  const passed =
    trustedReport.suiteVersion === MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION &&
    trustedReport.capabilityVersion === MECHANIC_CAPABILITY_VERSION &&
    trustedReport.candidateId === realmAdapter.id &&
    realmAdapter.adapterVersion === MECHANIC_EXECUTION_REALM_ADAPTER_VERSION &&
    trustedReport.verdict === "passed" &&
    trustedReport.gates.length === REQUIRED_REALM_CONFORMANCE_GATES.length &&
    trustedReport.probeResults.length ===
      FOUNDATION_REALM_CONFORMANCE_PROBE_COUNT &&
    trustedReport.probeResults.every(
      (probe) =>
        probe.hostResponsive &&
        probe.candidateExecutionBrowserEvidence &&
        probe.runtimeHeartbeatBrowserEvidence &&
        probe.realBrowserEvidence
    ) &&
    REQUIRED_REALM_CONFORMANCE_GATES.every(
      (gateId) => reportedGateStatuses.get(gateId) === "passed"
    );
  if (!passed) {
    failBoundary(
      "realm_conformance",
      "realm_conformance_rejected",
      "Mechanic Execution Realm conformance did not pass every hard gate.",
      createRealmConformanceFailureReport(trustedReport)
    );
  }
  return Object.freeze({
    suiteVersion: trustedReport.suiteVersion,
    candidateId: trustedReport.candidateId,
    verdict: "passed",
    gateIds: Object.freeze([...REQUIRED_REALM_CONFORMANCE_GATES]),
  });
}

function createRealmConformanceFailureReport(
  report: MechanicExecutionRealmConformanceReport
): unknown {
  const probeResultsById = new Map(
    report.probeResults.map((probeResult) => [
      probeResult.probeId,
      probeResult,
    ])
  );

  return {
    schemaVersion: "mechanic_execution_realm_failure_report/v1",
    suiteVersion: report.suiteVersion,
    capabilityVersion: report.capabilityVersion,
    candidateId: report.candidateId,
    verdict: report.verdict,
    failedGates: report.gates
      .filter(({ status }) => status === "failed")
      .map((gate) => ({
        id: gate.id,
        probeIds: gate.probeIds,
        failures: gate.failures,
        probeResults: gate.probeIds.flatMap((probeId) => {
          const probeResult = probeResultsById.get(probeId);
          return probeResult ? [probeResult] : [];
        }),
      })),
  };
}

async function runFoundationCycle({
  realmAdapter,
  contract,
  grant,
  mechanicId,
  containmentProbe,
}: {
  realmAdapter: MechanicExecutionRealmAdapter;
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
  mechanicId: StableId;
  containmentProbe: boolean;
}): Promise<FoundationCycleResult> {
  const objects = new Map<StableId, TrustedMechanicObjectObservation>([
    [
      FOUNDATION_SUBJECT_ID,
      {
        active: true,
        kind: "foundation_subject",
        position: { x: 2, y: 3 },
        properties: { admitted: true },
        velocity: { x: 0, y: 0 },
      },
    ],
  ]);
  const objectHost = createMechanicObjectHost({
    mechanicId,
    grant,
    bindings: [
      {
        id: "foundation_subject",
        cardinality: "one",
        getObjectIds: () => [FOUNDATION_SUBJECT_ID],
      },
    ],
    ownedObjectArchetypes: contractOwnedObjectArchetypes(
      FOUNDATION_CONTRACT_CANDIDATE
    ),
    adapter: {
      hasObject: (objectId) => objects.has(objectId),
      observeObject: (objectId) => {
        const object = objects.get(objectId);
        if (!object) {
          throw new Error(`Foundation object "${objectId}" is unavailable.`);
        }
        return snapshotData(object);
      },
      createOwnedObject: ({ objectId, objectKind, initial }) => {
        objects.set(objectId, {
          active: true,
          kind: objectKind,
          position: { x: 0, y: 0 },
          properties: { initial },
          velocity: { x: 0, y: 0 },
        });
      },
      destroyOwnedObject: (objectId) => {
        objects.delete(objectId);
      },
    },
  });

  const privateState = createMechanicPrivateStateHost({
    grant,
    declarations: FOUNDATION_CONTRACT_CANDIDATE.privateState,
    resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
  });
  let lifecycle:
    | Awaited<ReturnType<typeof createMechanicLifecycleServices>>
    | undefined;
  let runtime:
    | ReturnType<typeof createPhase9ContainedMechanicRuntime>
    | undefined;
  let bindingObservation: JsonValue | undefined;
  let primaryFailure: FoundationBoundaryError | undefined;

  try {
    const subjectHandle = objectHost.resolveOne("foundation_subject");
    const observer = createTrustedGameSystemPortOwner<{
      receivedCount: number;
      lastValue: number | null;
    }>({
      contract: FOUNDATION_SYSTEM_PORT_CONTRACT,
      initialState: { receivedCount: 0, lastValue: null },
      transition: ({ portId, payload, state }) => {
        if (
          portId !== "foundation_input" ||
          typeof payload !== "number" ||
          !Number.isInteger(payload)
        ) {
          throw new TypeError("Foundation observer received an invalid signal.");
        }
        return {
          state: {
            receivedCount: state.receivedCount + 1,
            lastValue: payload,
          },
        };
      },
    });
    const planValidation = validateFinalGameSpecMechanicConnections({
      contracts: [FOUNDATION_MECHANIC_PORT_CONTRACT, observer.contract],
      connectionPlan: FOUNDATION_CONNECTION_PLAN,
    });
    if (!planValidation.success) {
      failBoundary(
        "ports",
        "foundation_connection_plan_invalid",
        "The foundation connection plan is invalid.",
        snapshotData(planValidation.issues)
      );
    }
    const portRuntime = createMechanicPortRuntime({
      contracts: [FOUNDATION_MECHANIC_PORT_CONTRACT],
      connectionPlan: planValidation.data,
      maximumSignalDeliveriesPerStep:
        PHASE_9_MECHANIC_RESOURCE_BUDGET.maximumSignalsPerTick,
      referenceCatalog: FOUNDATION_REFERENCE_CATALOG,
      mechanicReceivers: [],
      gameSystemOwners: [observer],
    });
    const objectCapabilityHost = createObjectCapabilityHost(
      objectHost,
      (observation) => {
        bindingObservation = observation;
      }
    );
    const portCapabilityHost = portRuntime.createMechanicCapabilityHost(
      FOUNDATION_EXTENSION_ID,
      objectCapabilityHost
    );
    const privateStateCapabilityHost =
      privateState.createCapabilityHost(portCapabilityHost);

    lifecycle = await createMechanicLifecycleServices({
      createRealm: ({
        capabilityHost,
        capabilityGrant,
        resourceBudget,
        seed,
      }) =>
        realmAdapter.create({
          mechanicId,
          capabilityGrant,
          bindings: [
            {
              id: "foundation_subject",
              cardinality: "one",
              handles: [subjectHandle],
            },
          ],
          capabilityHost,
          seed,
          resourceBudget,
        }),
      delegateCapabilityHost: privateStateCapabilityHost,
      capabilityGrant: grant,
      program: createFoundationProgram({
        containmentProbe,
        contract,
        grant,
      }),
      seed: FOUNDATION_SEED,
      resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
    });
    runtime = createPhase9ContainedMechanicRuntime({
      extensionId: mechanicId,
      buildId: FOUNDATION_BUILD_ID,
      capabilityVersion: grant.capabilityVersion,
      seed: FOUNDATION_SEED,
      lifecycle,
      ownedObjects: objectHost,
      privateState,
    });

    const installStep = await runFoundationPortStep(
      portRuntime,
      "install",
      () => runtime!.install()
    );
    requirePortStepCompleted(installStep, "install");
    const install = requireRuntimeStepCompleted(
      installStep.callbackResult,
      "install"
    );
    const actionStep = await runFoundationPortStep(
      portRuntime,
      "logical action",
      () =>
        runtime!.dispatchLogicalAction("foundation_action", {
          admitted: true,
        })
    );
    requirePortStepCompleted(actionStep, "logical action");

    if (containmentProbe) {
      if (actionStep.callbackResult.outcome !== "contained_failure") {
        failBoundary(
          "containment",
          "foundation_containment_probe_completed",
          "The deliberate containment probe completed unexpectedly."
        );
      }
      const containment = actionStep.callbackResult.evidence;
      await runtime.dispose();
      return Object.freeze({
        trace: emptyFoundationTrace(observer.readState()),
        cleanup: cleanupFromFailureEvidence(containment),
        bindingObservation: bindingObservation ?? null,
        containment,
      });
    }

    const action = requireRuntimeStepCompleted(
      actionStep.callbackResult,
      "logical action"
    );
    const scheduledStep = await runFoundationPortStep(
      portRuntime,
      "scheduled callback",
      () => runtime!.advanceSimulation(8)
    );
    requirePortStepCompleted(scheduledStep, "scheduled callback");
    const scheduled = requireRuntimeStepCompleted(
      scheduledStep.callbackResult,
      "scheduled callback"
    );
    const trace = snapshotData({
      install: install.results.map(snapshotExecutionResult),
      action: action.results.map(snapshotExecutionResult),
      scheduled: scheduled.results.map(snapshotExecutionResult),
      deliveries: scheduledStep.deliveries.map(snapshotDelivery),
      trustedState: observer.readState(),
    }) as RuntimeAndContractFoundationTrace;

    const disposeStep = await runFoundationCleanupStep(
      portRuntime,
      () => runtime!.dispose()
    );
    requireFoundationCleanupStepCompleted(disposeStep);
    const cleanup = createCleanupRecord(lifecycle, objectHost, privateState);

    return Object.freeze({
      trace,
      cleanup,
      bindingObservation: bindingObservation ?? null,
    });
  } catch (error) {
    if (error instanceof FoundationBoundaryError) {
      primaryFailure = error;
      throw error;
    }
    primaryFailure = new FoundationBoundaryError(
      "lifecycle",
      "foundation_runtime_cycle_failed",
      errorMessage(error, "The foundation runtime cycle failed.")
    );
    throw primaryFailure;
  } finally {
    const cleanupFailures: JsonValue[] = [];
    try {
      const cleanupResult = await runtime?.dispose();
      if (
        cleanupResult?.outcome === "contained_failure" &&
        !isCompleteCleanupEvidence(cleanupResult.evidence)
      ) {
        cleanupFailures.push(
          snapshotJsonValue({
            source: "contained_runtime",
            cleanup: cleanupResult.evidence.cleanup,
          })
        );
      }
    } catch (error) {
      cleanupFailures.push({
        source: "contained_runtime",
        message: errorMessage(error, "Contained runtime cleanup failed."),
      });
    }
    try {
      await lifecycle?.dispose();
    } catch (error) {
      cleanupFailures.push({
        source: "lifecycle",
        message: errorMessage(error, "Lifecycle cleanup failed."),
      });
    }
    try {
      objectHost.dispose();
    } catch (error) {
      cleanupFailures.push({
        source: "owned_objects",
        message: errorMessage(error, "Owned-object cleanup failed."),
      });
    }
    try {
      privateState.dispose();
    } catch (error) {
      cleanupFailures.push({
        source: "private_state",
        message: errorMessage(error, "Private-state cleanup failed."),
      });
    }
    if (cleanupFailures.length > 0) {
      if (primaryFailure?.boundary === "cleanup") {
        throw new FoundationBoundaryError(
          "cleanup",
          primaryFailure.code,
          primaryFailure.message,
          snapshotJsonValue({
            primary: primaryFailure.details ?? null,
            fallbackFailures: cleanupFailures,
          })
        );
      }
      failBoundary(
        "cleanup",
        "foundation_fallback_cleanup_failed",
        "Foundation fallback cleanup failed.",
        cleanupFailures
      );
    }
  }
  throw new Error("Foundation runtime cycle terminated without a result.");
}

function createFoundationProgram({
  containmentProbe,
  contract,
  grant,
}: {
  containmentProbe: boolean;
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
}): MechanicLifecycleProgram {
  const sourceArtifact = {
    id: containmentProbe
      ? "foundation_fixture_containment_source"
      : "foundation_fixture_source",
    contractId: contract.id,
    intentId: contract.intentId,
    capabilityVersion: contract.capabilityVersion,
    grant,
    callbacks: [
      {
        id: "foundation_install",
        kind: "install",
        normalizedJavaScript: FOUNDATION_INSTALL_SOURCE,
      },
      {
        id: "foundation_action",
        kind: "logical_action",
        normalizedJavaScript: containmentProbe
          ? FOUNDATION_CONTAINMENT_SOURCE
          : FOUNDATION_ACTION_SOURCE,
      },
      {
        id: "foundation_scheduled",
        kind: "scheduled",
        normalizedJavaScript: FOUNDATION_SCHEDULED_SOURCE,
      },
      {
        id: "foundation_dispose",
        kind: "dispose",
        normalizedJavaScript: FOUNDATION_DISPOSE_SOURCE,
      },
    ],
  } satisfies GeneratedMechanicLifecycleSourceArtifact;
  return createGeneratedMechanicLifecycleProgram({
    contract,
    sourceArtifact,
    config: { enabled: true, maximum_records: 1 },
  });
}

function createObjectCapabilityHost(
  objectHost: ReturnType<typeof createMechanicObjectHost>,
  recordObservation: (observation: JsonValue) => void
): MechanicExecutionRealmCapabilityHost {
  return {
    invoke: ({ capabilityId, arguments: capabilityArguments }) => {
      if (capabilityId === "object_read") {
        const handle = requireHandle(capabilityArguments[0]);
        const observation = objectObservationToJson(objectHost.read(handle));
        recordObservation(observation);
        return {
          kind: "json",
          value: observation,
        };
      }
      if (capabilityId === "object_create") {
        const archetypeId = requireStableId(capabilityArguments[0]);
        const initial = requireJsonValue(capabilityArguments[1]);
        return {
          kind: "opaque_handle",
          value: objectHost.create(archetypeId, initial),
        };
      }
      throw new Error(
        `Foundation capability "${capabilityId}" has no trusted host.`
      );
    },
  };
}

function requirePortStepCompleted(
  step: { outcome: "completed" | "failed"; failure?: unknown },
  label: string
): void {
  if (step.outcome === "failed") {
    failBoundary(
      "ports",
      "foundation_signal_delivery_failed",
      `Foundation ${label} signal delivery failed.`,
      snapshotData(step.failure ?? null)
    );
  }
}

async function runFoundationPortStep<Result>(
  portRuntime: MechanicPortRuntime,
  label: string,
  callback: () => Result | Promise<Result>
): Promise<MechanicPortStepResult<Result>> {
  try {
    return await portRuntime.runStep(callback);
  } catch (error) {
    failBoundary(
      "ports",
      "foundation_signal_delivery_failed",
      `Foundation ${label} signal delivery failed.`,
      { message: errorMessage(error, "Foundation signal delivery failed.") }
    );
  }
}

async function runFoundationCleanupStep(
  portRuntime: MechanicPortRuntime,
  callback: () => Promise<ContainedMechanicRuntimeStep>
): Promise<MechanicPortStepResult<ContainedMechanicRuntimeStep>> {
  try {
    return await portRuntime.runStep(callback);
  } catch (error) {
    failBoundary(
      "cleanup",
      "foundation_disposal_failed",
      "Foundation disposal failed.",
      { message: errorMessage(error, "Foundation disposal failed.") }
    );
  }
}

function requireFoundationCleanupStepCompleted(
  step: MechanicPortStepResult<ContainedMechanicRuntimeStep>
): void {
  if (
    step.outcome !== "completed" ||
    step.callbackResult.outcome !== "completed" ||
    step.callbackResult.results.some((result) => result.outcome !== "completed")
  ) {
    failBoundary(
      "cleanup",
      "foundation_disposal_failed",
      "Foundation disposal failed.",
      snapshotData(step)
    );
  }
}

function requireRuntimeStepCompleted<
  Step extends {
    outcome: "completed" | "contained_failure";
    results: readonly MechanicExecutionRealmExecutionResult[];
  },
>(step: Step, label: string): Extract<Step, { outcome: "completed" }> {
  if (step.outcome !== "completed") {
    failBoundary(
      "lifecycle",
      "foundation_lifecycle_callback_failed",
      `Foundation ${label} did not complete.`,
      snapshotData(step)
    );
  }
  if (step.results.some((result) => result.outcome !== "completed")) {
    failBoundary(
      "lifecycle",
      "foundation_lifecycle_result_failed",
      `Foundation ${label} returned a failed realm result.`,
      snapshotData(step.results)
    );
  }
  return step as Extract<Step, { outcome: "completed" }>;
}

function snapshotExecutionResult(
  result: MechanicExecutionRealmExecutionResult
): RuntimeAndContractFoundationExecutionRecord {
  return snapshotData({
    executionId: result.executionId,
    outcome: result.outcome,
    ...(result.output !== undefined ? { output: result.output } : {}),
    ...(result.callback ? { callback: result.callback } : {}),
    ...(result.resourceUsage ? { resourceUsage: result.resourceUsage } : {}),
    ...(result.diagnostic ? { diagnostic: result.diagnostic } : {}),
  });
}

function snapshotDelivery(
  delivery: MechanicPortDeliveryRecord
): RuntimeAndContractFoundationDeliveryRecord {
  return snapshotData({
    sequence: delivery.sequence,
    connectionId: delivery.connectionId,
    payload: delivery.payload,
  });
}

function createCleanupRecord(
  lifecycle: Awaited<ReturnType<typeof createMechanicLifecycleServices>>,
  objectHost: ReturnType<typeof createMechanicObjectHost>,
  privateState: ReturnType<typeof createMechanicPrivateStateHost>
): RuntimeAndContractFoundationCleanupRecord {
  return Object.freeze({
    lifecycleDisposed: lifecycle.state === "disposed",
    registrationsRemoved:
      lifecycle.pendingScheduledCallbackCount === 0 &&
      lifecycle.activeSubscriptionCount === 0,
    ownedObjectsRemoved: objectHost.getOwnedObjectCount() === 0,
    privateStateRemoved: privateState.usedBytes === 0,
  });
}

function cleanupFromFailureEvidence(
  evidence: MechanicRuntimeFailureEvidence
): RuntimeAndContractFoundationCleanupRecord {
  return Object.freeze({
    lifecycleDisposed: evidence.cleanup.lifecycleDisposed,
    registrationsRemoved: evidence.cleanup.registrationsRemoved,
    ownedObjectsRemoved: evidence.cleanup.ownedObjectsRemoved,
    privateStateRemoved: evidence.cleanup.privateStateRemoved,
  });
}

function isCompleteCleanupEvidence(
  evidence: MechanicRuntimeFailureEvidence
): boolean {
  return (
    evidence.cleanup.lifecycleDisposed &&
    evidence.cleanup.registrationsRemoved &&
    evidence.cleanup.ownedObjectsRemoved &&
    evidence.cleanup.privateStateRemoved &&
    evidence.cleanup.issues.length === 0
  );
}

function emptyFoundationTrace(
  trustedState: JsonValue
): RuntimeAndContractFoundationTrace {
  return Object.freeze({
    install: Object.freeze([]),
    action: Object.freeze([]),
    scheduled: Object.freeze([]),
    deliveries: Object.freeze([]),
    trustedState: snapshotData(trustedState),
  });
}

function contractOwnedObjectArchetypes(contract: GeneratedMechanicContract) {
  return contract.ownedObjects.map(({ id, objectKind, maximumInstances }) => ({
    id,
    objectKind,
    maximumInstances,
  }));
}

function objectObservationToJson(
  observation: ReturnType<
    ReturnType<typeof createMechanicObjectHost>["read"]
  >
): JsonValue {
  return snapshotData({
    active: observation.active,
    kind: observation.kind,
    position: {
      x: observation.position.x,
      y: observation.position.y,
    },
    properties: observation.properties,
    velocity: {
      x: observation.velocity.x,
      y: observation.velocity.y,
    },
  });
}

function requireHandle(value: unknown): MechanicObjectHandle {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("Foundation object capability requires an opaque handle.");
  }
  return value as MechanicObjectHandle;
}

function requireStableId(value: unknown): StableId {
  if (typeof value !== "string") {
    throw new TypeError("Foundation capability ID must be a string.");
  }
  return value;
}

function requireJsonValue(value: unknown): JsonValue {
  const parsed = jsonValueSchema.safeParse(value);
  if (!parsed.success) {
    throw new TypeError("Foundation capability input must be JSON-safe.");
  }
  return parsed.data;
}

function runBoundary<Result>(
  checks: RuntimeAndContractFoundationCheck[],
  boundary: RuntimeAndContractFoundationBoundary,
  code: string,
  message: string,
  operation: () => Result
): Result {
  try {
    if (deliberateFailureBoundaries.get(checks) === boundary) {
      failBoundary(
        boundary,
        `foundation_${boundary}_deliberate_failure`,
        `The foundation gate deliberately failed boundary "${boundary}".`,
        { deliberate: true }
      );
    }
    const result = operation();
    checks.push(Object.freeze({ boundary, status: "passed", code, message }));
    return result;
  } catch (error) {
    if (error instanceof FoundationBoundaryError) {
      throw error;
    }
    failBoundary(
      boundary,
      `${boundary}_failed`,
      errorMessage(error, `Foundation boundary "${boundary}" failed.`)
    );
  }
}

function failBoundary(
  boundary: RuntimeAndContractFoundationBoundary,
  code: string,
  message: string,
  details?: unknown
): never {
  throw new FoundationBoundaryError(
    boundary,
    code,
    message,
    details === undefined ? undefined : snapshotJsonValue(details)
  );
}

function normalizeBoundaryFailure(
  error: unknown
): RuntimeAndContractFoundationCheck {
  if (error instanceof FoundationBoundaryError) {
    return Object.freeze({
      boundary: error.boundary,
      status: "failed",
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
  }
  return Object.freeze({
    boundary: "cleanup",
    status: "failed",
    code: "foundation_gate_unexpected_failure",
    message: errorMessage(error, "The foundation gate failed unexpectedly."),
  });
}

function createFailedGateResult(
  checks: readonly RuntimeAndContractFoundationCheck[],
  failedBoundary: RuntimeAndContractFoundationBoundary
): RuntimeAndContractFoundationGateResult {
  return Object.freeze({
    schemaVersion: RUNTIME_AND_CONTRACT_FOUNDATION_GATE_VERSION,
    status: "failed",
    sourceGenerationAvailable: false,
    checks: Object.freeze(checks.map((check) => Object.freeze({ ...check }))),
    terminalResult: Object.freeze({
      code: "runtime_contract_foundation_gate_failed",
      failedBoundary,
    }),
  });
}

function snapshotData<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(JSON.stringify(value)) as Value);
}

function snapshotJsonValue(value: unknown): JsonValue {
  return snapshotData(jsonValueSchema.parse(JSON.parse(JSON.stringify(value))));
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
