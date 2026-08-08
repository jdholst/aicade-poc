import type { JsonValue, StableId } from "../game-spec-schema";
import {
  type MechanicExecutionRealmResourceBudget,
  type MechanicExecutionRealmResourceDimension,
} from "@/runtime/mechanics/mechanic-execution-realm";
import { PHASE_9_MECHANIC_RESOURCE_BUDGET } from "@/runtime/mechanics/phase-9-mechanic-resource-policy";
import {
  mechanicCapabilityRegistry,
  type MechanicCapabilityGrant,
} from "./mechanic-capability-registry";
import {
  consumeMechanicExecutionRealmConformanceSessionState,
  type MechanicExecutionRealmConformanceSession,
  type MechanicExecutionRealmConformanceSessionState,
} from "./mechanic-execution-realm-conformance-session";

export const MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION =
  "mechanic_execution_realm_conformance/v3";

export type {
  MechanicExecutionRealmResourceBudget,
  MechanicExecutionRealmResourceDimension,
} from "@/runtime/mechanics/mechanic-execution-realm";

export const MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY = {
  profileId: "phase_9_realm_conformance",
  maximumExecutionMilliseconds: 50,
  maximumTerminationMilliseconds: 50,
  maximumHostHeartbeatMilliseconds: 50,
  resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
} as const satisfies {
  profileId: StableId;
  maximumExecutionMilliseconds: number;
  maximumTerminationMilliseconds: number;
  maximumHostHeartbeatMilliseconds: number;
  resourceBudget: MechanicExecutionRealmResourceBudget;
};

export type MechanicExecutionRealmConformanceGateId =
  | "usable_capability_execution"
  | "forbidden_authority_isolation"
  | "escape_resistance"
  | "runaway_termination"
  | "resource_enforcement"
  | "determinism"
  | "opaque_handle_isolation"
  | "cleanup_and_recovery"
  | "browser_integration"
  | "diagnostic_quality";

export type MechanicExecutionRealmConformanceProbe = {
  id: StableId;
  kind:
    | "capability_use"
    | "forbidden_authority"
    | "escape_attempt"
    | "runaway_work"
    | "resource_exhaustion"
    | "deterministic_replay"
    | "opaque_handle_use"
    | "opaque_handle_escape"
    | "cleanup_success"
    | "cleanup_failure"
    | "recovery";
  source: string;
  lifecycle?: {
    callbacks: ReadonlyArray<{
      id: StableId;
      source: string;
    }>;
    invocations: ReadonlyArray<{
      callbackId: StableId;
      count: number;
    }>;
  };
  capabilityGrant: MechanicCapabilityGrant;
  seed: number;
  resourceBudget: MechanicExecutionRealmResourceBudget;
  resourceTarget?: {
    dimension: MechanicExecutionRealmResourceDimension;
    limit: number;
  };
};

export type MechanicExecutionRealmProbeDiagnostic = {
  stage: "realm_start" | "realm_execution" | "realm_termination" | "cleanup";
  code: StableId;
  message: string;
  repair?: {
    artifact: "realm_candidate";
    issuePath: string;
    suggestedAction: string;
  };
};

export type MechanicExecutionRealmProbeResult = {
  probeId: StableId;
  outcome:
    | "completed"
    | "rejected"
    | "terminated"
    | "resource_limit"
    | "failed";
  durationMilliseconds: number;
  evidence: {
    capabilityCalls?: readonly StableId[];
    output?: JsonValue;
    resourceUsage?: {
      dimension: MechanicExecutionRealmResourceDimension;
      limit: number;
      observed: number;
    };
    handleIsolation?: {
      rawReferenceExposed: boolean;
      mutationVisible: boolean;
      serializedPropertyCount: number;
      observationImmutable: boolean;
    };
    resourcesAfterCleanup?: {
      ownedObjects: number;
      scheduledCallbacks: number;
      subscriptions: number;
      signals: number;
      privateStateBytes: number;
      pendingTasks: number;
    };
  };
  diagnostic?: MechanicExecutionRealmProbeDiagnostic;
};

export type MechanicExecutionRealmCandidateRun = {
  result: Promise<MechanicExecutionRealmProbeResult>;
  terminate(): Promise<MechanicExecutionRealmProbeResult>;
  dispose?(): void;
};

export type MechanicExecutionRealmCandidateAdapter = {
  id: StableId;
  environment: "browser" | "non_browser";
  start(
    probe: MechanicExecutionRealmConformanceProbe
  ): MechanicExecutionRealmCandidateRun;
};

export type MechanicExecutionRealmConformanceGate = {
  id: MechanicExecutionRealmConformanceGateId;
  status: "passed" | "failed";
  probeIds: StableId[];
  failures: Array<{
    code: StableId;
    message: string;
  }>;
};

export type MechanicExecutionRealmConformanceReport = {
  suiteVersion: typeof MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION;
  capabilityVersion: string;
  candidateId: StableId;
  verdict: "passed" | "rejected";
  gates: MechanicExecutionRealmConformanceGate[];
  probeResults: Array<{
    probeId: StableId;
    kind: MechanicExecutionRealmConformanceProbe["kind"];
    hostResponsive: boolean;
    candidateExecutionBrowserEvidence: boolean;
    runtimeHeartbeatBrowserEvidence: boolean;
    realBrowserEvidence: boolean;
    result: MechanicExecutionRealmProbeResult;
  }>;
};

export type RunMechanicExecutionRealmConformanceSuiteInput = {
  session: MechanicExecutionRealmConformanceSession;
};

const REQUIRED_GATES: readonly MechanicExecutionRealmConformanceGateId[] = [
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
];

const RESOURCE_PROBE_DEFINITIONS: ReadonlyArray<{
  id: StableId;
  dimension: MechanicExecutionRealmResourceDimension;
  budgetField: Exclude<keyof MechanicExecutionRealmResourceBudget, "profileId">;
  capabilityId: StableId;
}> = [
  {
    id: "resource_owned_objects",
    dimension: "owned_objects",
    budgetField: "maximumOwnedObjects",
    capabilityId: "object_create",
  },
  {
    id: "resource_operations_per_tick",
    dimension: "operations_per_tick",
    budgetField: "maximumOperationsPerTick",
    capabilityId: "state_read",
  },
  {
    id: "resource_scheduled_callbacks",
    dimension: "scheduled_callbacks",
    budgetField: "maximumScheduledCallbacks",
    capabilityId: "time_schedule",
  },
  {
    id: "resource_subscriptions",
    dimension: "subscriptions",
    budgetField: "maximumSubscriptions",
    capabilityId: "event_subscribe",
  },
  {
    id: "resource_signals_per_tick",
    dimension: "signals_per_tick",
    budgetField: "maximumSignalsPerTick",
    capabilityId: "signal_emit",
  },
  {
    id: "resource_state_bytes",
    dimension: "state_bytes",
    budgetField: "maximumStateBytes",
    capabilityId: "state_write",
  },
  {
    id: "resource_callback_milliseconds",
    dimension: "callback_milliseconds",
    budgetField: "maximumCallbackMilliseconds",
    capabilityId: "time_schedule",
  },
  {
    id: "resource_consecutive_failures",
    dimension: "consecutive_failures",
    budgetField: "maximumConsecutiveFailures",
    capabilityId: "time_schedule",
  },
];
const DEADLINE_EXCEEDED = Symbol("deadline_exceeded");

export async function runMechanicExecutionRealmConformanceSuite(
  input: RunMechanicExecutionRealmConformanceSuiteInput
): Promise<MechanicExecutionRealmConformanceReport> {
  const session = input.session;
  const sessionState =
    consumeMechanicExecutionRealmConformanceSessionState(session);

  if (!sessionState) {
    throw new TypeError(
      "Execution Realm Conformance requires an opaque session created by the trusted session factory that has not already been consumed."
    );
  }

  try {
    return await runMechanicExecutionRealmConformanceSession(
      session,
      sessionState
    );
  } finally {
    sessionState.dispose();
  }
}

async function runMechanicExecutionRealmConformanceSession(
  session: MechanicExecutionRealmConformanceSession,
  sessionState: MechanicExecutionRealmConformanceSessionState
): Promise<MechanicExecutionRealmConformanceReport> {
  const candidate = sessionState.candidate;
  const probes = [
    createAdmittedCapabilityProbe(),
    ...createForbiddenAuthorityProbes(),
    createRunawayProbe(),
    ...createResourceExhaustionProbes(),
    ...createDeterministicReplayProbes(),
    ...createOpaqueHandleProbes(),
    ...createCleanupAndRecoveryProbes(),
  ];
  const results = new Map<StableId, MechanicExecutionRealmProbeResult>();
  const hostHeartbeats = new Map<
    StableId,
    {
      responsive: boolean;
      candidateExecutionBrowserAttested: boolean;
      runtimeHeartbeatBrowserAttested: boolean;
    }
  >();

  for (const probe of probes) {
    const result = await executeProbe(candidate, probe);
    results.set(probe.id, result);
    hostHeartbeats.set(
      probe.id,
      {
        ...(await sessionState.checkHostResponsiveness(
          probe.id,
          MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumHostHeartbeatMilliseconds
        )),
        candidateExecutionBrowserAttested:
          sessionState.consumeCandidateExecutionEvidence(probe, result),
      }
    );
  }

  const capabilityProbe = probes[0];
  const capabilityResult = results.get(capabilityProbe.id);

  const expectedCapabilityCalls = capabilityProbe.capabilityGrant.capabilities.map(
    (capability) => capability.id
  );
  const capabilityCalls = capabilityResult?.evidence.capabilityCalls ?? [];
  const capabilityGatePassed =
    capabilityResult?.outcome === "completed" &&
    capabilityCalls.length === expectedCapabilityCalls.length &&
    capabilityCalls.every(
      (capabilityId, index) => capabilityId === expectedCapabilityCalls[index]
    );
  const forbiddenAuthorityGate = evaluateRejectedProbes(
    "forbidden_authority_isolation",
    probes.filter((probe) => probe.kind === "forbidden_authority"),
    results
  );
  const escapeResistanceGate = evaluateRejectedProbes(
    "escape_resistance",
    probes.filter((probe) => probe.kind === "escape_attempt"),
    results
  );
  const runawayProbe = probes.find((probe) => probe.kind === "runaway_work");
  const runawayResult = runawayProbe
    ? results.get(runawayProbe.id)
    : undefined;
  const runawayGatePassed =
    runawayProbe !== undefined &&
    runawayResult?.probeId === runawayProbe.id &&
    runawayResult.outcome === "terminated" &&
    runawayResult.diagnostic?.stage === "realm_termination" &&
    hostHeartbeats.get(runawayProbe.id)?.responsive === true;
  const resourceProbes = probes.filter(
    (probe) => probe.kind === "resource_exhaustion"
  );
  const resourceGatePassed =
    resourceProbes.length === RESOURCE_PROBE_DEFINITIONS.length &&
    resourceProbes.every((probe) => {
      const result = results.get(probe.id);
      const usage = result?.evidence.resourceUsage;

      return (
        probe.resourceTarget !== undefined &&
        result?.probeId === probe.id &&
        result.outcome === "resource_limit" &&
        result.diagnostic?.stage === "realm_execution" &&
        usage?.dimension === probe.resourceTarget.dimension &&
        usage.limit === probe.resourceTarget.limit &&
        usage.observed > usage.limit
      );
    });
  const deterministicProbes = probes.filter(
    (probe) => probe.kind === "deterministic_replay"
  );
  const deterministicResults = deterministicProbes.map((probe) =>
    results.get(probe.id)
  );
  const deterministicGatePassed =
    deterministicProbes.length === 2 &&
    deterministicResults.every(
      (result, index) =>
        result?.probeId === deterministicProbes[index].id &&
        result.outcome === "completed" &&
        result.evidence.output !== undefined
    ) &&
    JSON.stringify(deterministicResults[0]?.evidence.output) ===
      JSON.stringify(deterministicResults[1]?.evidence.output);
  const opaqueHandleProbes = probes.filter(
    (probe) =>
      probe.kind === "opaque_handle_use" ||
      probe.kind === "opaque_handle_escape"
  );
  const opaqueHandleUseProbe = opaqueHandleProbes.find(
    (probe) => probe.kind === "opaque_handle_use"
  );
  const opaqueHandleEscapeProbes = opaqueHandleProbes.filter(
    (probe) => probe.kind === "opaque_handle_escape"
  );
  const opaqueHandleUseResult = opaqueHandleUseProbe
    ? results.get(opaqueHandleUseProbe.id)
    : undefined;
  const handleIsolation = opaqueHandleUseResult?.evidence.handleIsolation;
  const opaqueHandleGatePassed =
    opaqueHandleUseResult?.outcome === "completed" &&
    opaqueHandleEscapeProbes.length === 3 &&
    opaqueHandleEscapeProbes.every(
      (probe) => results.get(probe.id)?.outcome === "rejected"
    ) &&
    handleIsolation?.rawReferenceExposed === false &&
    handleIsolation.mutationVisible === false &&
    handleIsolation.serializedPropertyCount === 0 &&
    handleIsolation.observationImmutable === true;
  const cleanupProbes = probes.filter(
    (probe) =>
      probe.kind === "cleanup_success" ||
      probe.kind === "cleanup_failure" ||
      probe.kind === "recovery"
  );
  const cleanupSuccessProbe = cleanupProbes.find(
    (probe) => probe.kind === "cleanup_success"
  );
  const cleanupFailureProbe = cleanupProbes.find(
    (probe) => probe.kind === "cleanup_failure"
  );
  const recoveryProbe = cleanupProbes.find(
    (probe) => probe.kind === "recovery"
  );
  const cleanupSuccessResult = cleanupSuccessProbe
    ? results.get(cleanupSuccessProbe.id)
    : undefined;
  const cleanupFailureResult = cleanupFailureProbe
    ? results.get(cleanupFailureProbe.id)
    : undefined;
  const recoveryResult = recoveryProbe
    ? results.get(recoveryProbe.id)
    : undefined;
  const everyProbeCleanedUp = probes.every((probe) => {
    const retained = results.get(probe.id)?.evidence.resourcesAfterCleanup;

    return (
      retained !== undefined &&
      Object.values(retained).every((retainedCount) => retainedCount === 0)
    );
  });
  const everyProbeLeftHostResponsive = probes.every(
    (probe) => hostHeartbeats.get(probe.id)?.responsive === true
  );
  const everyProbeHasCandidateExecutionBrowserEvidence = probes.every(
    (probe) =>
      hostHeartbeats.get(probe.id)?.candidateExecutionBrowserAttested === true
  );
  const everyProbeHasRuntimeHeartbeatBrowserEvidence = probes.every(
    (probe) =>
      hostHeartbeats.get(probe.id)?.runtimeHeartbeatBrowserAttested === true
  );
  const unresponsiveProbeIds = probes
    .filter((probe) => hostHeartbeats.get(probe.id)?.responsive !== true)
    .map((probe) => probe.id);
  const browserIntegrationGatePassed =
    everyProbeHasCandidateExecutionBrowserEvidence &&
    everyProbeHasRuntimeHeartbeatBrowserEvidence &&
    everyProbeLeftHostResponsive;
  const cleanupAndRecoveryGatePassed =
    cleanupSuccessResult?.outcome === "completed" &&
    cleanupFailureResult?.outcome === "failed" &&
    cleanupFailureResult.diagnostic !== undefined &&
    recoveryResult?.outcome === "completed" &&
    JSON.stringify(recoveryResult.evidence.output) ===
      JSON.stringify({ state: "recovered" }) &&
    everyProbeCleanedUp &&
    everyProbeLeftHostResponsive;
  const diagnosticProbes = probes.filter((probe) =>
    [
      "forbidden_authority",
      "escape_attempt",
      "runaway_work",
      "resource_exhaustion",
      "opaque_handle_escape",
      "cleanup_failure",
    ].includes(probe.kind)
  );
  const poorDiagnosticProbeIds = diagnosticProbes
    .filter((probe) => {
      const result = results.get(probe.id);
      const diagnostic = result?.diagnostic;

      return (
        result?.probeId !== probe.id ||
        diagnostic === undefined ||
        diagnostic.code.length === 0 ||
        diagnostic.message.trim().length === 0 ||
        diagnostic.repair?.artifact !== "realm_candidate" ||
        diagnostic.repair.issuePath.trim().length === 0 ||
        diagnostic.repair.suggestedAction.trim().length === 0
      );
    })
    .map((probe) => probe.id);
  const diagnosticQualityGatePassed = poorDiagnosticProbeIds.length === 0;

  const gates = REQUIRED_GATES.map<MechanicExecutionRealmConformanceGate>(
    (id) => {
      if (id === "usable_capability_execution") {
        return {
          id,
          status: capabilityGatePassed ? "passed" : "failed",
          probeIds: [capabilityProbe.id],
          failures: capabilityGatePassed
            ? []
            : [
                {
                  code: "capability_execution_mismatch",
                  message:
                    "The candidate did not complete exactly one call for every granted primitive capability.",
                },
              ],
        };
      }

      if (id === "forbidden_authority_isolation") {
        return forbiddenAuthorityGate;
      }

      if (id === "escape_resistance") {
        return escapeResistanceGate;
      }

      if (id === "runaway_termination") {
        return {
          id,
          status: runawayGatePassed ? "passed" : "failed",
          probeIds: runawayProbe ? [runawayProbe.id] : [],
          failures: runawayGatePassed
            ? []
            : [
                {
                  code: "runaway_not_contained",
                  message:
                    "The candidate did not terminate runaway work with structured evidence while preserving host responsiveness.",
                },
              ],
        };
      }

      if (id === "resource_enforcement") {
        return {
          id,
          status: resourceGatePassed ? "passed" : "failed",
          probeIds: resourceProbes.map((probe) => probe.id),
          failures: resourceGatePassed
            ? []
            : [
                {
                  code: "resource_limit_not_enforced",
                  message:
                    "The candidate did not return measured structured evidence for every fixed Phase 9 resource-budget dimension.",
                },
              ],
        };
      }

      if (id === "determinism") {
        return {
          id,
          status: deterministicGatePassed ? "passed" : "failed",
          probeIds: deterministicProbes.map((probe) => probe.id),
          failures: deterministicGatePassed
            ? []
            : [
                {
                  code: "non_deterministic_replay",
                  message:
                    "The candidate did not produce identical observable output for identical source, seed, and capability inputs.",
                },
              ],
        };
      }

      if (id === "opaque_handle_isolation") {
        return {
          id,
          status: opaqueHandleGatePassed ? "passed" : "failed",
          probeIds: opaqueHandleProbes.map((probe) => probe.id),
          failures: opaqueHandleGatePassed
            ? []
            : [
                {
                  code: "opaque_handle_boundary_failed",
                  message:
                    "The candidate exposed handle internals, allowed handle mutation, returned mutable observations, or failed to reject a handle escape.",
                },
              ],
        };
      }

      if (id === "cleanup_and_recovery") {
        return {
          id,
          status: cleanupAndRecoveryGatePassed ? "passed" : "failed",
          probeIds: cleanupProbes.map((probe) => probe.id),
          failures: cleanupAndRecoveryGatePassed
            ? []
            : [
                {
                  code: "cleanup_or_recovery_failed",
                  message:
                    "The candidate retained realm resources, left the host unresponsive, or could not complete a fresh run after a contained failure.",
                },
              ],
        };
      }

      if (id === "browser_integration") {
        const failures: MechanicExecutionRealmConformanceGate["failures"] = [];

        if (!everyProbeHasCandidateExecutionBrowserEvidence) {
          failures.push({
            code: "candidate_execution_not_browser_attested",
            message:
              "Every probe must execute through the candidate endpoint captured by the trusted browser-conformance session.",
          });
        }

        if (!everyProbeHasRuntimeHeartbeatBrowserEvidence) {
          failures.push({
            code: "runtime_heartbeat_not_browser_attested",
            message:
              "The trusted browser-conformance session did not observe a fresh runtime-iframe heartbeat for every probe.",
          });
        }

        for (const probeId of unresponsiveProbeIds) {
          failures.push({
            code: "host_unresponsive",
            message: `The browser host responsiveness check failed after probe "${probeId}".`,
          });
        }

        return {
          id,
          status: browserIntegrationGatePassed ? "passed" : "failed",
          probeIds: probes.map((probe) => probe.id),
          failures,
        };
      }

      if (id === "diagnostic_quality") {
        return {
          id,
          status: diagnosticQualityGatePassed ? "passed" : "failed",
          probeIds: diagnosticProbes.map((probe) => probe.id),
          failures: poorDiagnosticProbeIds.map((probeId) => ({
            code: "insufficient_failure_diagnostic",
            message: `Probe "${probeId}" did not return a stage, stable code, message, issue path, and suggested realm-candidate action.`,
          })),
        };
      }

      return {
        id,
        status: "failed",
        probeIds: [],
        failures: [
          {
            code: "not_exercised",
            message: `The conformance suite did not exercise the "${id}" gate.`,
          },
        ],
      };
    }
  );

  return {
    suiteVersion: MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION,
    capabilityVersion: mechanicCapabilityRegistry.version,
    candidateId: session.candidateId,
    verdict: gates.every((gate) => gate.status === "passed")
      ? "passed"
      : "rejected",
    gates,
    probeResults: probes.map((probe) => {
      const result = results.get(probe.id);

      if (!result) {
        throw new Error(
          `Execution Realm Conformance probe "${probe.id}" did not produce a result.`
        );
      }

      return {
        probeId: probe.id,
        kind: probe.kind,
        hostResponsive: hostHeartbeats.get(probe.id)?.responsive === true,
        candidateExecutionBrowserEvidence:
          hostHeartbeats.get(probe.id)?.candidateExecutionBrowserAttested ===
          true,
        runtimeHeartbeatBrowserEvidence:
          hostHeartbeats.get(probe.id)?.runtimeHeartbeatBrowserAttested === true,
        realBrowserEvidence:
          hostHeartbeats.get(probe.id)?.candidateExecutionBrowserAttested ===
            true &&
          hostHeartbeats.get(probe.id)?.runtimeHeartbeatBrowserAttested === true,
        result,
      };
    }),
  };
}

async function executeProbe(
  candidate: MechanicExecutionRealmCandidateAdapter,
  probe: MechanicExecutionRealmConformanceProbe
): Promise<MechanicExecutionRealmProbeResult> {
  const startedAt = Date.now();
  let run: MechanicExecutionRealmCandidateRun;

  try {
    run = candidate.start(probe);
  } catch (error) {
    return createCandidateFailureResult(
      probe,
      "realm_start",
      error,
      startedAt
    );
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let result: MechanicExecutionRealmProbeResult | typeof DEADLINE_EXCEEDED;

  try {
    try {
      result = await Promise.race([
        run.result,
        new Promise<typeof DEADLINE_EXCEEDED>((resolve) => {
          timeoutId = setTimeout(
            () => resolve(DEADLINE_EXCEEDED),
            MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumExecutionMilliseconds
          );
        }),
      ]);
    } catch (error) {
      return terminateAfterExecutionFailure(
        run,
        createCandidateFailureResult(
          probe,
          "realm_execution",
          error,
          startedAt
        ),
        probe,
        startedAt
      );
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }

    if (result !== DEADLINE_EXCEEDED) {
      return result;
    }

    try {
      const terminationResult = await raceAgainstDeadline(
        run.terminate(),
        MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumTerminationMilliseconds
      );

      return terminationResult === DEADLINE_EXCEEDED
        ? createCandidateFailureResult(
            probe,
            "realm_termination",
            new Error("Candidate termination exceeded the fixed deadline."),
            startedAt,
            "candidate_termination_timed_out"
          )
        : terminationResult;
    } catch (error) {
      return createCandidateFailureResult(
        probe,
        "realm_termination",
        error,
        startedAt
      );
    }
  } finally {
    run.dispose?.();
  }
}

async function terminateAfterExecutionFailure(
  run: MechanicExecutionRealmCandidateRun,
  executionFailure: MechanicExecutionRealmProbeResult,
  probe: MechanicExecutionRealmConformanceProbe,
  startedAt: number
): Promise<MechanicExecutionRealmProbeResult> {
  try {
    const terminationResult = await raceAgainstDeadline(
      run.terminate(),
      MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumTerminationMilliseconds
    );

    if (terminationResult === DEADLINE_EXCEEDED) {
      return createCandidateFailureResult(
        probe,
        "realm_termination",
        new Error("Candidate termination exceeded the fixed deadline."),
        startedAt,
        "candidate_termination_timed_out"
      );
    }

    return {
      ...executionFailure,
      evidence: {
        ...executionFailure.evidence,
        resourcesAfterCleanup:
          terminationResult.evidence.resourcesAfterCleanup,
      },
    };
  } catch (error) {
    return createCandidateFailureResult(
      probe,
      "realm_termination",
      error,
      startedAt
    );
  }
}

async function raceAgainstDeadline<T>(
  result: Promise<T>,
  milliseconds: number
): Promise<T | typeof DEADLINE_EXCEEDED> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      result,
      new Promise<typeof DEADLINE_EXCEEDED>((resolve) => {
        timeoutId = setTimeout(() => resolve(DEADLINE_EXCEEDED), milliseconds);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function createCandidateFailureResult(
  probe: MechanicExecutionRealmConformanceProbe,
  stage: MechanicExecutionRealmProbeDiagnostic["stage"],
  error: unknown,
  startedAt: number,
  code: StableId = "candidate_adapter_failed"
): MechanicExecutionRealmProbeResult {
  return {
    probeId: probe.id,
    outcome: "failed",
    durationMilliseconds: Date.now() - startedAt,
    evidence: {},
    diagnostic: {
      stage,
      code,
      message:
        error instanceof Error ? error.message : "The candidate adapter failed.",
      repair: {
        artifact: "realm_candidate",
        issuePath: `conformance.${probe.id}`,
        suggestedAction:
          "Inspect the candidate adapter failure before evaluating it again.",
      },
    },
  };
}

function evaluateRejectedProbes(
  gateId: MechanicExecutionRealmConformanceGateId,
  probes: MechanicExecutionRealmConformanceProbe[],
  results: ReadonlyMap<StableId, MechanicExecutionRealmProbeResult>
): MechanicExecutionRealmConformanceGate {
  const failedProbeIds = probes
    .filter((probe) => results.get(probe.id)?.outcome !== "rejected")
    .map((probe) => probe.id);

  return {
    id: gateId,
    status: failedProbeIds.length === 0 ? "passed" : "failed",
    probeIds: probes.map((probe) => probe.id),
    failures: failedProbeIds.map((probeId) => ({
      code:
        gateId === "escape_resistance"
          ? "escape_attempt_not_rejected"
          : "forbidden_authority_not_rejected",
      message:
        gateId === "escape_resistance"
          ? `The candidate did not reject escape probe "${probeId}".`
          : `The candidate did not reject forbidden-authority probe "${probeId}".`,
    })),
  };
}

function createAdmittedCapabilityProbe(): MechanicExecutionRealmConformanceProbe {
  const capabilityGrant: MechanicCapabilityGrant = {
    capabilityVersion: mechanicCapabilityRegistry.version,
    capabilities: mechanicCapabilityRegistry.capabilities.map(
      (capability, index) => ({
        ...capability,
        justification: {
          kind: "contract_declaration",
          path: `conformance.capabilities.${index}`,
        },
      })
    ),
  };
  const capabilityIds = capabilityGrant.capabilities.map(
    (capability) => capability.id
  );

  return {
    id: "admitted_capability_calls",
    kind: "capability_use",
    source: `for (const capabilityId of ${JSON.stringify(capabilityIds)}) { await realm.callCapability(capabilityId); }`,
    capabilityGrant,
    seed: 41,
    resourceBudget: MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
  };
}

function createForbiddenAuthorityProbes(): MechanicExecutionRealmConformanceProbe[] {
  const capabilityGrant: MechanicCapabilityGrant = {
    capabilityVersion: mechanicCapabilityRegistry.version,
    capabilities: [],
  };

  const adversarialProbes: Array<
    Pick<MechanicExecutionRealmConformanceProbe, "id" | "kind" | "source">
  > = [
    {
      id: "raw_engine_access",
      kind: "forbidden_authority",
      source: "void Phaser;",
    },
    {
      id: "dom_access",
      kind: "forbidden_authority",
      source: "void document.body;",
    },
    {
      id: "network_access",
      kind: "forbidden_authority",
      source: 'await fetch("https://example.invalid");',
    },
    {
      id: "storage_access",
      kind: "forbidden_authority",
      source: "void localStorage.length;",
    },
    {
      id: "module_loading",
      kind: "forbidden_authority",
      source: 'await import("realm-conformance-forbidden-module");',
    },
    {
      id: "dynamic_evaluation_eval",
      kind: "forbidden_authority",
      source: 'eval("1 + 1");',
    },
    {
      id: "dynamic_evaluation_function",
      kind: "forbidden_authority",
      source: 'new Function("return 2")();',
    },
    {
      id: "ambient_time_clock",
      kind: "forbidden_authority",
      source: "Date.now();",
    },
    {
      id: "ambient_time_timer",
      kind: "forbidden_authority",
      source: "setTimeout(() => undefined, 0);",
    },
    {
      id: "ambient_randomness_math",
      kind: "forbidden_authority",
      source: "Math.random();",
    },
    {
      id: "ambient_randomness_crypto",
      kind: "forbidden_authority",
      source: "crypto.getRandomValues(new Uint8Array(1));",
    },
    {
      id: "constructor_escape",
      kind: "escape_attempt",
      source: '({}).constructor.constructor("return globalThis")();',
    },
    {
      id: "prototype_escape",
      kind: "escape_attempt",
      source: "Object.getPrototypeOf(realm.callCapability);",
    },
  ];

  return adversarialProbes.map((probe) => ({
    ...probe,
    capabilityGrant,
    seed: 41,
    resourceBudget: MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
  }));
}

function createRunawayProbe(): MechanicExecutionRealmConformanceProbe {
  return {
    id: "runaway_work",
    kind: "runaway_work",
    source: "for (;;) {}",
    capabilityGrant: {
      capabilityVersion: mechanicCapabilityRegistry.version,
      capabilities: [],
    },
    seed: 41,
    resourceBudget: MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
  };
}

function createResourceExhaustionProbes(): MechanicExecutionRealmConformanceProbe[] {
  const resourceBudget =
    MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget;

  return RESOURCE_PROBE_DEFINITIONS.map((definition) => {
    const capability = requireCapability(definition.capabilityId);
    const limit = resourceBudget[definition.budgetField];
    const program = createResourceExhaustionProgram(
      definition.dimension,
      limit
    );

    return {
      id: definition.id,
      kind: "resource_exhaustion",
      ...program,
      capabilityGrant: {
        capabilityVersion: mechanicCapabilityRegistry.version,
        capabilities: [
          {
            ...capability,
            justification: {
              kind: "contract_declaration",
              path: "conformance.capabilities.0",
            },
          },
        ],
      },
      seed: 41,
      resourceBudget,
      resourceTarget: {
        dimension: definition.dimension,
        limit,
      },
    };
  });
}

function createResourceExhaustionProgram(
  dimension: MechanicExecutionRealmResourceDimension,
  limit: number
): Pick<MechanicExecutionRealmConformanceProbe, "source" | "lifecycle"> {
  const repeatedCall = (capabilityId: StableId, argumentsSource: string) =>
    `for (let index = 0; index <= ${limit}; index += 1) { await realm.callCapability("${capabilityId}", ${argumentsSource}); }`;

  if (dimension === "owned_objects") {
    return {
      source: repeatedCall(
        "object_create",
        '"conformance_archetype", { index }'
      ),
    };
  }

  if (dimension === "operations_per_tick") {
    return { source: repeatedCall("state_read", '"conformance_state"') };
  }

  if (dimension === "scheduled_callbacks") {
    return {
      source: repeatedCall("time_schedule", 'index, `callback_${index}`'),
    };
  }

  if (dimension === "subscriptions") {
    return {
      source: repeatedCall(
        "event_subscribe",
        '"conformance_event", `callback_${index}`'
      ),
    };
  }

  if (dimension === "signals_per_tick") {
    return {
      source: repeatedCall("signal_emit", '"conformance_output", index'),
    };
  }

  if (dimension === "state_bytes") {
    return {
      source: `await realm.callCapability("state_write", "conformance_state", "x".repeat(${limit + 1}));`,
    };
  }

  if (dimension === "callback_milliseconds") {
    const callbackId = "conformance_slow_callback";

    return {
      source: `await realm.callCapability("time_schedule", 0, "${callbackId}");`,
      lifecycle: {
        callbacks: [
          {
            id: callbackId,
            source: `for (let work = 0; work < ${(limit + 1) * 10_000_000}; work += 1) { Math.imul(work, work); }`,
          },
        ],
        invocations: [{ callbackId, count: 1 }],
      },
    };
  }

  const callbackId = "conformance_failing_callback";

  return {
    source: `await realm.callCapability("time_schedule", 0, "${callbackId}");`,
    lifecycle: {
      callbacks: [
        {
          id: callbackId,
          source: 'throw new Error("conformance controlled callback failure");',
        },
      ],
      invocations: [{ callbackId, count: limit + 1 }],
    },
  };
}

function createDeterministicReplayProbes(): MechanicExecutionRealmConformanceProbe[] {
  const requiredCapabilityIds = ["time_read", "random_next"];
  const capabilities = requiredCapabilityIds.map((capabilityId, index) => ({
    ...requireCapability(capabilityId),
    justification: {
      kind: "contract_declaration" as const,
      path: `conformance.capabilities.${index}`,
    },
  }));
  const source =
    'return { simulationTime: await realm.callCapability("time_read"), random: await realm.callCapability("random_next") };';
  const seed = 1729;

  return ["deterministic_replay_a", "deterministic_replay_b"].map(
    (id): MechanicExecutionRealmConformanceProbe => ({
      id,
      kind: "deterministic_replay",
      source,
      capabilityGrant: {
        capabilityVersion: mechanicCapabilityRegistry.version,
        capabilities,
      },
      seed,
      resourceBudget:
        MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
    })
  );
}

function createOpaqueHandleProbes(): MechanicExecutionRealmConformanceProbe[] {
  const capability = requireCapability("object_read");

  const capabilityGrant: MechanicCapabilityGrant = {
    capabilityVersion: mechanicCapabilityRegistry.version,
    capabilities: [
      {
        ...capability,
        justification: {
          kind: "contract_declaration",
          path: "conformance.capabilities.0",
        },
      },
    ],
  };

  const handleProbes: Array<
    Pick<MechanicExecutionRealmConformanceProbe, "id" | "kind" | "source">
  > = [
    {
      id: "opaque_handle_use",
      kind: "opaque_handle_use",
      source:
        'const handle = realm.fixtureHandle("binding_actor"); const observation = await realm.callCapability("object_read", handle); return { handle, observation };',
    },
    {
      id: "opaque_handle_property_enumeration",
      kind: "opaque_handle_escape",
      source:
        'const handle = realm.fixtureHandle("binding_actor"); Object.getOwnPropertyNames(handle);',
    },
    {
      id: "opaque_handle_serialization",
      kind: "opaque_handle_escape",
      source:
        'const handle = realm.fixtureHandle("binding_actor"); JSON.stringify(handle);',
    },
    {
      id: "opaque_handle_raw_reference",
      kind: "opaque_handle_escape",
      source:
        'const handle = realm.fixtureHandle("binding_actor"); handle.engineObject;',
    },
  ];

  return handleProbes.map((probe) => ({
    ...probe,
    capabilityGrant,
    seed: 41,
    resourceBudget: MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
  }));
}

function createCleanupAndRecoveryProbes(): MechanicExecutionRealmConformanceProbe[] {
  const requiredCapabilityIds = [
    "object_create",
    "time_schedule",
    "event_subscribe",
  ];
  const capabilities = requiredCapabilityIds.map((capabilityId, index) => ({
    ...requireCapability(capabilityId),
    justification: {
      kind: "contract_declaration" as const,
      path: `conformance.capabilities.${index}`,
    },
  }));
  const capabilityGrant: MechanicCapabilityGrant = {
    capabilityVersion: mechanicCapabilityRegistry.version,
    capabilities,
  };
  const allocateResources =
    'await realm.callCapability("object_create"); await realm.callCapability("time_schedule"); await realm.callCapability("event_subscribe");';

  const cleanupProbes: Array<
    Omit<MechanicExecutionRealmConformanceProbe, "seed" | "resourceBudget">
  > = [
    {
      id: "cleanup_after_success",
      kind: "cleanup_success",
      source: `${allocateResources} return { state: "completed" };`,
      capabilityGrant,
    },
    {
      id: "cleanup_after_failure",
      kind: "cleanup_failure",
      source: `${allocateResources} throw new Error("conformance failure");`,
      capabilityGrant,
    },
    {
      id: "recovery_after_failure",
      kind: "recovery",
      source: 'return { state: "recovered" };',
      capabilityGrant: {
        capabilityVersion: mechanicCapabilityRegistry.version,
        capabilities: [],
      },
    },
  ];

  return cleanupProbes.map((probe) => ({
    ...probe,
    seed: 41,
    resourceBudget: MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
  }));
}

function requireCapability(capabilityId: StableId) {
  const capability = mechanicCapabilityRegistry.capabilities.find(
    (definition) => definition.id === capabilityId
  );

  if (!capability) {
    throw new Error(
      `Mechanic Capability Version is missing required conformance primitive "${capabilityId}".`
    );
  }

  return capability;
}
