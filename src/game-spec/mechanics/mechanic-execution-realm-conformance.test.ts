import { describe, expect, it } from "vitest";

import {
  MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY,
  MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION,
  createMechanicExecutionRealmConformanceSession,
  mechanicCapabilityRegistry,
  runMechanicExecutionRealmConformanceSuite as runOpaqueConformanceSuite,
  type CreateMechanicExecutionRealmConformanceSessionInput,
  type MechanicExecutionRealmCandidateAdapter,
  type MechanicExecutionRealmConformanceProbe,
  type MechanicExecutionRealmProbeDiagnostic,
  type MechanicExecutionRealmProbeResult,
} from "..";

const noRetainedResources = {
  ownedObjects: 0,
  scheduledCallbacks: 0,
  subscriptions: 0,
  signals: 0,
  privateStateBytes: 0,
  pendingTasks: 0,
};

function createRepairDiagnostic(
  probe: MechanicExecutionRealmConformanceProbe,
  stage: MechanicExecutionRealmProbeDiagnostic["stage"] = "realm_execution"
): MechanicExecutionRealmProbeDiagnostic {
  return {
    stage,
    code: "candidate_probe_contained",
    message: `The candidate contained ${probe.id}.`,
    repair: {
      artifact: "realm_candidate",
      issuePath: `conformance.${probe.id}`,
      suggestedAction:
        "Inspect the candidate boundary and retry this exact probe.",
    },
  };
}

function createReferenceCandidate(
  unsafe: boolean
): MechanicExecutionRealmCandidateAdapter {
  return {
    id: unsafe ? "unsafe_reference_candidate" : "passing_reference_candidate",
    environment: "browser",
    start(probe) {
      const evidence: MechanicExecutionRealmProbeResult["evidence"] = {
        resourcesAfterCleanup: unsafe
          ? { ...noRetainedResources, ownedObjects: 1 }
          : noRetainedResources,
      };
      let outcome: MechanicExecutionRealmProbeResult["outcome"] = unsafe
        ? "completed"
        : "rejected";
      let diagnostic: MechanicExecutionRealmProbeDiagnostic | undefined;

      if (probe.kind === "capability_use") {
        outcome = "completed";
        evidence.capabilityCalls = probe.capabilityGrant.capabilities.map(
          (capability) => capability.id
        );
      } else if (probe.kind === "runaway_work" && !unsafe) {
        outcome = "terminated";
        diagnostic = createRepairDiagnostic(probe, "realm_termination");
      } else if (
        probe.kind === "resource_exhaustion" &&
        probe.resourceTarget &&
        !unsafe
      ) {
        outcome = "resource_limit";
        evidence.resourceUsage = {
          dimension: probe.resourceTarget.dimension,
          limit: probe.resourceTarget.limit,
          observed: probe.resourceTarget.limit + 1,
        };
        diagnostic = createRepairDiagnostic(probe);
      } else if (probe.kind === "deterministic_replay") {
        outcome = "completed";
        evidence.output = unsafe
          ? { replay: probe.id }
          : { random: 0.25, seed: probe.seed, simulationTime: 16 };
      } else if (probe.kind === "opaque_handle_use") {
        outcome = "completed";
        evidence.handleIsolation = unsafe
          ? {
              rawReferenceExposed: true,
              mutationVisible: true,
              serializedPropertyCount: 3,
              observationImmutable: false,
            }
          : {
              rawReferenceExposed: false,
              mutationVisible: false,
              serializedPropertyCount: 0,
              observationImmutable: true,
            };
      } else if (probe.kind === "cleanup_success") {
        outcome = "completed";
      } else if (probe.kind === "cleanup_failure" && !unsafe) {
        outcome = "failed";
        diagnostic = createRepairDiagnostic(probe, "cleanup");
      } else if (probe.kind === "recovery") {
        outcome = unsafe ? "failed" : "completed";
        evidence.output = unsafe
          ? { state: "failed" }
          : { state: "recovered" };
      } else if (!unsafe) {
        diagnostic = createRepairDiagnostic(probe);
      }

      const result: MechanicExecutionRealmProbeResult = {
        probeId: probe.id,
        outcome,
        durationMilliseconds: 1,
        evidence,
        diagnostic,
      };

      return {
        result: Promise.resolve(result),
        terminate: async () => ({
          ...createTerminationResult(probe),
          evidence: {
            resourcesAfterCleanup: noRetainedResources,
          },
          diagnostic: createRepairDiagnostic(probe, "realm_termination"),
        }),
      };
    },
  };
}

function createTerminationResult(
  probe: MechanicExecutionRealmConformanceProbe
) {
  return {
    probeId: probe.id,
    outcome: "terminated" as const,
    durationMilliseconds: 1,
    evidence: {},
    diagnostic: {
      stage: "realm_termination" as const,
      code: "execution_deadline_exceeded",
      message: `Terminated ${probe.id}.`,
    },
  };
}

function runMechanicExecutionRealmConformanceSuite(
  input: CreateMechanicExecutionRealmConformanceSessionInput
) {
  return runOpaqueConformanceSuite({
    session: createMechanicExecutionRealmConformanceSession(input),
  });
}

describe("Execution Realm Conformance Suite", () => {
  it("rejects an independently supplied candidate paired with a healthy host", async () => {
    const session = createMechanicExecutionRealmConformanceSession({
      candidate: createReferenceCandidate(false),
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    const report = await runOpaqueConformanceSuite({ session });

    expect(MECHANIC_EXECUTION_REALM_CONFORMANCE_VERSION).toBe(
      "mechanic_execution_realm_conformance/v3"
    );
    expect(report.gates).toContainEqual(
      expect.objectContaining({
        id: "browser_integration",
        status: "failed",
        failures: expect.arrayContaining([
          expect.objectContaining({
            code: "candidate_execution_not_browser_attested",
          }),
          expect.objectContaining({
            code: "runtime_heartbeat_not_browser_attested",
          }),
        ]),
      })
    );
  });

  it("atomically rejects concurrent reuse of a single-run session", async () => {
    const session = createMechanicExecutionRealmConformanceSession({
      candidate: createReferenceCandidate(false),
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    const firstRun = runOpaqueConformanceSuite({ session });

    await expect(runOpaqueConformanceSuite({ session })).rejects.toThrow(
      "already been consumed"
    );
    await expect(firstRun).resolves.toEqual(
      expect.objectContaining({ candidateId: "passing_reference_candidate" })
    );
  });

  it("rejects an explicitly disposed session before invoking its candidate", async () => {
    const candidate = createReferenceCandidate(false);
    const start = candidate.start.bind(candidate);
    let startCount = 0;
    candidate.start = (probe) => {
      startCount += 1;
      return start(probe);
    };
    const session = createMechanicExecutionRealmConformanceSession({
      candidate,
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    session.dispose();

    await expect(runOpaqueConformanceSuite({ session })).rejects.toThrow(
      "already been consumed"
    );
    expect(startCount).toBe(0);
  });

  it("exercises every registered primitive through an exact candidate grant", async () => {
    const receivedProbes: MechanicExecutionRealmConformanceProbe[] = [];
    const candidate: MechanicExecutionRealmCandidateAdapter = {
      id: "reference_candidate",
      environment: "browser",
      start(probe) {
        receivedProbes.push(probe);

        return {
          result: Promise.resolve({
            probeId: probe.id,
            outcome: "completed",
            durationMilliseconds: 1,
            evidence: {
              capabilityCalls: probe.capabilityGrant.capabilities.map(
                (capability) => capability.id
              ),
            },
          }),
          terminate: async () => createTerminationResult(probe),
        };
      },
    };

    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate,
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.gates)).toBe(true);
    expect(Object.isFrozen(report.gates[0])).toBe(true);
    expect(Object.isFrozen(report.probeResults)).toBe(true);
    expect(Object.isFrozen(report.probeResults[0]?.result.evidence)).toBe(true);

    const capabilityProbes = receivedProbes.filter(
      (probe) => probe.kind === "capability_use"
    );

    expect(capabilityProbes).toHaveLength(1);
    expect(capabilityProbes[0]).toMatchObject({
      id: "admitted_capability_calls",
      kind: "capability_use",
      capabilityGrant: {
        capabilityVersion: "mechanic_capability/v1",
      },
    });
    expect(
      capabilityProbes[0].capabilityGrant.capabilities.map(
        (capability) => capability.id
      )
    ).toEqual(
      mechanicCapabilityRegistry.capabilities.map((capability) => capability.id)
    );
    expect(report.gates).toContainEqual(
      expect.objectContaining({
        id: "usable_capability_execution",
        status: "passed",
        probeIds: ["admitted_capability_calls"],
      })
    );
    expect(report.verdict).toBe("rejected");
  });

  it("treats forbidden authority and representative escape access as hard failures", async () => {
    const receivedProbes: MechanicExecutionRealmConformanceProbe[] = [];
    const candidate: MechanicExecutionRealmCandidateAdapter = {
      id: "isolating_candidate",
      environment: "browser",
      start(probe) {
        receivedProbes.push(probe);

        return {
          result: Promise.resolve(
            probe.kind === "capability_use"
              ? {
                  probeId: probe.id,
                  outcome: "completed" as const,
                  durationMilliseconds: 1,
                  evidence: {
                    capabilityCalls: probe.capabilityGrant.capabilities.map(
                      (capability) => capability.id
                    ),
                  },
                }
              : {
                  probeId: probe.id,
                  outcome: "rejected" as const,
                  durationMilliseconds: 1,
                  evidence: {},
                  diagnostic: {
                    stage: "realm_execution" as const,
                    code: "forbidden_authority",
                    message: `Rejected ${probe.id}.`,
                  },
                }
          ),
          terminate: async () => createTerminationResult(probe),
        };
      },
    };

    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate,
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    expect(
      receivedProbes
        .filter((probe) => probe.kind === "forbidden_authority")
        .map((probe) => probe.id)
    ).toEqual([
      "raw_engine_access",
      "dom_access",
      "network_access",
      "storage_access",
      "module_loading",
      "dynamic_evaluation_eval",
      "dynamic_evaluation_function",
      "ambient_time_clock",
      "ambient_time_timer",
      "ambient_randomness_math",
      "ambient_randomness_crypto",
    ]);
    expect(
      receivedProbes
        .filter((probe) => probe.kind === "escape_attempt")
        .map((probe) => probe.id)
    ).toEqual(["constructor_escape", "prototype_escape"]);
    expect(report.gates).toContainEqual(
      expect.objectContaining({
        id: "forbidden_authority_isolation",
        status: "passed",
      })
    );
    expect(report.gates).toContainEqual(
      expect.objectContaining({
        id: "escape_resistance",
        status: "passed",
      })
    );
    expect(report.verdict).toBe("rejected");
  });

  it("terminates runaway work without losing host responsiveness", async () => {
    const terminatedProbeIds: string[] = [];
    const candidate: MechanicExecutionRealmCandidateAdapter = {
      id: "terminating_candidate",
      environment: "browser",
      start(probe) {
        if (probe.kind === "runaway_work") {
          return {
            result: new Promise(() => undefined),
            terminate: async () => {
              terminatedProbeIds.push(probe.id);

              return {
                probeId: probe.id,
                outcome: "terminated" as const,
                durationMilliseconds: 1,
                evidence: {},
                diagnostic: {
                  stage: "realm_termination" as const,
                  code: "execution_deadline_exceeded",
                  message: "Runaway conformance work was terminated.",
                },
              };
            },
          };
        }

        return {
          result: Promise.resolve(
            probe.kind === "capability_use"
              ? {
                  probeId: probe.id,
                  outcome: "completed" as const,
                  durationMilliseconds: 1,
                  evidence: {
                    capabilityCalls: probe.capabilityGrant.capabilities.map(
                      (capability) => capability.id
                    ),
                  },
                }
              : {
                  probeId: probe.id,
                  outcome: "rejected" as const,
                  durationMilliseconds: 1,
                  evidence: {},
                  diagnostic: {
                    stage: "realm_execution" as const,
                    code: "forbidden_authority",
                    message: `Rejected ${probe.id}.`,
                  },
                }
          ),
          terminate: async () => createTerminationResult(probe),
        };
      },
    };
    let responsivenessChecks = 0;

    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate,
      host: {
        async isResponsive() {
          responsivenessChecks += 1;
          return true;
        },
      },
    });

    expect(terminatedProbeIds).toEqual(["runaway_work"]);
    expect(responsivenessChecks).toBeGreaterThan(0);
    expect(report.gates).toContainEqual(
      expect.objectContaining({
        id: "runaway_termination",
        status: "passed",
        probeIds: ["runaway_work"],
      })
    );
    expect(report.verdict).toBe("rejected");
  });

  it("requires structured measurement when a candidate enforces a resource limit", async () => {
    const receivedResourceProbes: MechanicExecutionRealmConformanceProbe[] = [];
    const candidate: MechanicExecutionRealmCandidateAdapter = {
      id: "resource_aware_candidate",
      environment: "browser",
      start(probe) {
        if (probe.kind === "resource_exhaustion" && probe.resourceTarget) {
          receivedResourceProbes.push(probe);
          return {
            result: Promise.resolve({
              probeId: probe.id,
              outcome: "resource_limit" as const,
              durationMilliseconds: 1,
              evidence: {
                resourceUsage: {
                  dimension: probe.resourceTarget.dimension,
                  limit: probe.resourceTarget.limit,
                  observed: probe.resourceTarget.limit + 1,
                },
              },
              diagnostic: {
                stage: "realm_execution" as const,
                code: "resource_budget_exceeded",
                message: "The operation budget was exceeded.",
              },
            }),
            terminate: async () => createTerminationResult(probe),
          };
        }

        return {
          result: Promise.resolve(
            probe.kind === "capability_use"
              ? {
                  probeId: probe.id,
                  outcome: "completed" as const,
                  durationMilliseconds: 1,
                  evidence: {
                    capabilityCalls: probe.capabilityGrant.capabilities.map(
                      (capability) => capability.id
                    ),
                  },
                }
              : {
                  probeId: probe.id,
                  outcome:
                    probe.kind === "runaway_work"
                      ? ("terminated" as const)
                      : ("rejected" as const),
                  durationMilliseconds: 1,
                  evidence: {},
                  diagnostic: {
                    stage:
                      probe.kind === "runaway_work"
                        ? ("realm_termination" as const)
                        : ("realm_execution" as const),
                    code:
                      probe.kind === "runaway_work"
                        ? "execution_deadline_exceeded"
                        : "forbidden_authority",
                    message: `Contained ${probe.id}.`,
                  },
                }
          ),
          terminate: async () => createTerminationResult(probe),
        };
      },
    };

    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate,
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    expect(report.gates).toContainEqual(
      expect.objectContaining({
        id: "resource_enforcement",
        status: "passed",
        probeIds: [
          "resource_owned_objects",
          "resource_operations_per_tick",
          "resource_scheduled_callbacks",
          "resource_subscriptions",
          "resource_signals_per_tick",
          "resource_state_bytes",
          "resource_callback_milliseconds",
          "resource_consecutive_failures",
        ],
      })
    );
    expect(
      receivedResourceProbes.every(
        (probe) =>
          !probe.source.includes("requestedUsage") &&
          !probe.source.includes("conformance:")
      )
    ).toBe(true);
    expect(
      receivedResourceProbes.find(
        (probe) => probe.resourceTarget?.dimension === "owned_objects"
      )?.source
    ).toContain('realm.callCapability("object_create"');
    expect(
      receivedResourceProbes.find(
        (probe) => probe.resourceTarget?.dimension === "state_bytes"
      )?.source
    ).toContain('"x".repeat(1025)');
    const callbackProbe = receivedResourceProbes.find(
      (probe) => probe.resourceTarget?.dimension === "callback_milliseconds"
    );
    const repeatedFailureProbe = receivedResourceProbes.find(
      (probe) => probe.resourceTarget?.dimension === "consecutive_failures"
    );

    expect(callbackProbe).toMatchObject({
      source:
        'await realm.callCapability("time_schedule", 0, "conformance_slow_callback");',
      lifecycle: {
        callbacks: [
          expect.objectContaining({ source: expect.stringContaining("Math.imul") }),
        ],
        invocations: [
          { callbackId: "conformance_slow_callback", count: 1 },
        ],
      },
    });
    expect(repeatedFailureProbe).toMatchObject({
      source:
        'await realm.callCapability("time_schedule", 0, "conformance_failing_callback");',
      lifecycle: {
        callbacks: [
          expect.objectContaining({ source: expect.stringContaining("throw") }),
        ],
        invocations: [
          { callbackId: "conformance_failing_callback", count: 4 },
        ],
      },
    });
    expect(report.verdict).toBe("rejected");
  });

  it("requires identical observable output when the same seed is replayed", async () => {
    const candidate: MechanicExecutionRealmCandidateAdapter = {
      id: "deterministic_candidate",
      environment: "browser",
      start(probe) {
        let result;

        if (probe.kind === "capability_use") {
          result = {
            probeId: probe.id,
            outcome: "completed" as const,
            durationMilliseconds: 1,
            evidence: {
              capabilityCalls: probe.capabilityGrant.capabilities.map(
                (capability) => capability.id
              ),
            },
          };
        } else if (probe.kind === "deterministic_replay") {
          result = {
            probeId: probe.id,
            outcome: "completed" as const,
            durationMilliseconds: 1,
            evidence: {
              output: {
                random: 0.25,
                simulationTime: 16,
                seed: probe.seed,
              },
            },
          };
        } else if (probe.kind === "resource_exhaustion" && probe.resourceTarget) {
          result = {
            probeId: probe.id,
            outcome: "resource_limit" as const,
            durationMilliseconds: 1,
            evidence: {
              resourceUsage: {
                dimension: probe.resourceTarget.dimension,
                limit: probe.resourceTarget.limit,
                observed: probe.resourceTarget.limit + 1,
              },
            },
            diagnostic: {
              stage: "realm_execution" as const,
              code: "resource_budget_exceeded",
              message: "The operation budget was exceeded.",
            },
          };
        } else {
          result = {
            probeId: probe.id,
            outcome:
              probe.kind === "runaway_work"
                ? ("terminated" as const)
                : ("rejected" as const),
            durationMilliseconds: 1,
            evidence: {},
            diagnostic: {
              stage:
                probe.kind === "runaway_work"
                  ? ("realm_termination" as const)
                  : ("realm_execution" as const),
              code:
                probe.kind === "runaway_work"
                  ? "execution_deadline_exceeded"
                  : "forbidden_authority",
              message: `Contained ${probe.id}.`,
            },
          };
        }

        return {
          result: Promise.resolve(result),
          terminate: async () => createTerminationResult(probe),
        };
      },
    };

    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate,
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    expect(report.gates).toContainEqual(
      expect.objectContaining({
        id: "determinism",
        status: "passed",
        probeIds: ["deterministic_replay_a", "deterministic_replay_b"],
      })
    );
    expect(report.verdict).toBe("rejected");
  });

  it("measures opaque-handle observations and rejects handle escape attempts", async () => {
    const candidate: MechanicExecutionRealmCandidateAdapter = {
      id: "opaque_handle_candidate",
      environment: "browser",
      start(probe) {
        if (probe.kind === "opaque_handle_use") {
          return {
            result: Promise.resolve({
              probeId: probe.id,
              outcome: "completed" as const,
              durationMilliseconds: 1,
              evidence: {
                handleIsolation: {
                  rawReferenceExposed: false,
                  mutationVisible: false,
                  serializedPropertyCount: 0,
                  observationImmutable: true,
                },
              },
            }),
            terminate: async () => createTerminationResult(probe),
          };
        }

        if (probe.kind === "opaque_handle_escape") {
          return {
            result: Promise.resolve({
              probeId: probe.id,
              outcome: "rejected" as const,
              durationMilliseconds: 1,
              evidence: {},
              diagnostic: {
                stage: "realm_execution" as const,
                code: "opaque_handle_escape_rejected",
                message: "The handle escape attempt was rejected.",
              },
            }),
            terminate: async () => createTerminationResult(probe),
          };
        }

        return {
          result: Promise.resolve(
            probe.kind === "capability_use"
              ? {
                  probeId: probe.id,
                  outcome: "completed" as const,
                  durationMilliseconds: 1,
                  evidence: {
                    capabilityCalls: probe.capabilityGrant.capabilities.map(
                      (capability) => capability.id
                    ),
                  },
                }
              : {
                  probeId: probe.id,
                  outcome: "rejected" as const,
                  durationMilliseconds: 1,
                  evidence: {},
                  diagnostic: {
                    stage: "realm_execution" as const,
                    code: "probe_rejected",
                    message: `Rejected ${probe.id}.`,
                  },
                }
          ),
          terminate: async () => createTerminationResult(probe),
        };
      },
    };

    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate,
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    expect(report.gates).toContainEqual(
      expect.objectContaining({
        id: "opaque_handle_isolation",
        status: "passed",
        probeIds: [
          "opaque_handle_use",
          "opaque_handle_property_enumeration",
          "opaque_handle_serialization",
          "opaque_handle_raw_reference",
        ],
      })
    );
    expect(report.verdict).toBe("rejected");
  });

  it("requires complete cleanup after every probe and a successful run after failure", async () => {
    const cleanupEvidence = {
      ownedObjects: 0,
      scheduledCallbacks: 0,
      subscriptions: 0,
      signals: 0,
      privateStateBytes: 0,
      pendingTasks: 0,
    };
    const candidate: MechanicExecutionRealmCandidateAdapter = {
      id: "recovering_candidate",
      environment: "browser",
      start(probe) {
        const result: MechanicExecutionRealmProbeResult = {
          probeId: probe.id,
          outcome: "rejected" as const,
          durationMilliseconds: 1,
          evidence: {
            resourcesAfterCleanup: cleanupEvidence,
          },
          diagnostic: {
            stage: "realm_execution" as const,
            code: "probe_rejected",
            message: `Contained ${probe.id}.`,
          },
        };

        if (probe.kind === "cleanup_success") {
          result.outcome = "completed";
          result.diagnostic = undefined;
        } else if (probe.kind === "cleanup_failure") {
          result.outcome = "failed";
          result.diagnostic = {
            stage: "cleanup",
            code: "candidate_exception_contained",
            message: "The candidate exception was contained and cleaned up.",
          };
        } else if (probe.kind === "recovery") {
          result.outcome = "completed";
          result.evidence.output = { state: "recovered" };
          result.diagnostic = undefined;
        }

        return {
          result: Promise.resolve(result),
          terminate: async () => createTerminationResult(probe),
        };
      },
    };

    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate,
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    expect(report.gates).toContainEqual(
      expect.objectContaining({
        id: "cleanup_and_recovery",
        status: "passed",
        probeIds: expect.arrayContaining([
          "cleanup_after_success",
          "cleanup_after_failure",
          "recovery_after_failure",
        ]),
      })
    );
    expect(report.verdict).toBe("rejected");
  });

  it("requires a browser candidate and a responsive host after every probe", async () => {
    function createCandidate(
      environment: MechanicExecutionRealmCandidateAdapter["environment"]
    ): MechanicExecutionRealmCandidateAdapter {
      return {
        id: "browser_gate_candidate",
        environment,
        start(probe) {
          return {
            result: Promise.resolve({
              probeId: probe.id,
              outcome: "rejected" as const,
              durationMilliseconds: 1,
              evidence: {},
              diagnostic: {
                stage: "realm_execution" as const,
                code: "probe_rejected",
                message: `Rejected ${probe.id}.`,
              },
            }),
            terminate: async () => createTerminationResult(probe),
          };
        },
      };
    }

    const browserReport = await runMechanicExecutionRealmConformanceSuite({
      candidate: createCandidate("browser"),
      host: {
        async isResponsive() {
          return true;
        },
      },
    });
    const nonBrowserReport = await runMechanicExecutionRealmConformanceSuite({
      candidate: createCandidate("non_browser"),
      host: {
        async isResponsive() {
          return true;
        },
      },
    });
    let responsivenessChecks = 0;
    const unresponsiveReport =
      await runMechanicExecutionRealmConformanceSuite({
        candidate: createCandidate("browser"),
        host: {
          async isResponsive() {
            responsivenessChecks += 1;
            return responsivenessChecks !== 3;
          },
        },
      });

    expect(browserReport.gates).toContainEqual(
      expect.objectContaining({
        id: "browser_integration",
        status: "failed",
        failures: expect.arrayContaining([
          expect.objectContaining({
            code: "candidate_execution_not_browser_attested",
          }),
        ]),
      })
    );
    expect(nonBrowserReport.gates).toContainEqual(
      expect.objectContaining({
        id: "browser_integration",
        status: "failed",
      })
    );
    expect(unresponsiveReport.gates).toContainEqual(
      expect.objectContaining({
        id: "browser_integration",
        status: "failed",
      })
    );
  });

  it("requires repair-quality diagnostics for every contained negative probe", async () => {
    function createCandidate(
      includeRepairGuidance: boolean
    ): MechanicExecutionRealmCandidateAdapter {
      return {
        id: "diagnostic_candidate",
        environment: "browser",
        start(probe) {
          const negativeProbe = [
            "forbidden_authority",
            "escape_attempt",
            "runaway_work",
            "resource_exhaustion",
            "opaque_handle_escape",
            "cleanup_failure",
          ].includes(probe.kind);

          return {
            result: Promise.resolve({
              probeId: probe.id,
              outcome: negativeProbe ? ("rejected" as const) : ("completed" as const),
              durationMilliseconds: 1,
              evidence: {},
              diagnostic: negativeProbe
                ? {
                    stage: "realm_execution" as const,
                    code: "candidate_probe_contained",
                    message: `The candidate contained ${probe.id}.`,
                    repair: includeRepairGuidance
                      ? {
                          artifact: "realm_candidate" as const,
                          issuePath: `conformance.${probe.id}`,
                          suggestedAction:
                            "Inspect the candidate boundary and retry this exact probe.",
                        }
                      : undefined,
                  }
                : undefined,
            }),
            terminate: async () => createTerminationResult(probe),
          };
        },
      };
    }

    const highQualityReport =
      await runMechanicExecutionRealmConformanceSuite({
        candidate: createCandidate(true),
        host: {
          async isResponsive() {
            return true;
          },
        },
      });
    const lowQualityReport = await runMechanicExecutionRealmConformanceSuite({
      candidate: createCandidate(false),
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    expect(highQualityReport.gates).toContainEqual(
      expect.objectContaining({
        id: "diagnostic_quality",
        status: "passed",
      })
    );
    expect(lowQualityReport.gates).toContainEqual(
      expect.objectContaining({
        id: "diagnostic_quality",
        status: "failed",
      })
    );
  });

  it("passes every candidate-neutral gate but reserves admission for a real-browser run", async () => {
    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate: createReferenceCandidate(false),
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    expect(report.verdict).toBe("rejected");
    expect(
      report.gates
        .filter((gate) => gate.status === "failed")
        .map((gate) => gate.id)
    ).toEqual(["browser_integration"]);
    expect(report.probeResults).toHaveLength(32);
    expect(
      report.probeResults.every(
        (probeResult) =>
          probeResult.hostResponsive &&
          probeResult.result.durationMilliseconds >= 0
      )
    ).toBe(true);
  });

  it("rejects the deliberately unsafe reference candidate for the expected hard gates", async () => {
    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate: createReferenceCandidate(true),
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    expect(report.verdict).toBe("rejected");
    expect(
      report.gates
        .filter((gate) => gate.status === "failed")
        .map((gate) => gate.id)
    ).toEqual([
      "forbidden_authority_isolation",
      "escape_resistance",
      "runaway_termination",
      "resource_enforcement",
      "determinism",
      "opaque_handle_isolation",
      "cleanup_and_recovery",
      "browser_integration",
      "diagnostic_quality",
    ]);
  });

  it("contains candidate and host-probe exceptions as rejection evidence", async () => {
    let candidateStarted = 0;
    const candidate: MechanicExecutionRealmCandidateAdapter = {
      id: "throwing_candidate",
      environment: "browser",
      start(probe) {
        candidateStarted += 1;

        if (candidateStarted === 1) {
          throw new Error("Candidate start failed.");
        }

        return {
          result: Promise.resolve({
            probeId: probe.id,
            outcome: "rejected" as const,
            durationMilliseconds: 1,
            evidence: {},
            diagnostic: createRepairDiagnostic(probe),
          }),
          terminate: async () => createTerminationResult(probe),
        };
      },
    };
    let hostChecks = 0;

    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate,
      host: {
        async isResponsive() {
          hostChecks += 1;
          if (hostChecks === 1) {
            throw new Error("Host heartbeat failed.");
          }
          return true;
        },
      },
    });

    expect(report.verdict).toBe("rejected");
    expect(report.probeResults[0]).toMatchObject({
      probeId: "admitted_capability_calls",
      hostResponsive: false,
      result: {
        outcome: "failed",
        diagnostic: {
          stage: "realm_start",
          code: "candidate_adapter_failed",
        },
      },
    });
    expect(candidateStarted).toBe(32);
  });

  it("allows a briefly delayed healthy host heartbeat", async () => {
    let hostChecks = 0;
    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate: createReferenceCandidate(false),
      host: {
        async isResponsive() {
          hostChecks += 1;
          if (hostChecks === 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          return true;
        },
      },
    });

    expect(report.probeResults[0]).toMatchObject({
      probeId: "admitted_capability_calls",
      hostResponsive: true,
    });
  });

  it("uses a fixed policy and bounds a candidate that cannot terminate", async () => {
    const startedAt = Date.now();
    let hostChecks = 0;
    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate: {
        id: "non_terminating_candidate",
        environment: "browser",
        start(probe) {
          if (probe.kind === "runaway_work") {
            return {
              result: new Promise(() => undefined),
              terminate: () => new Promise(() => undefined),
            };
          }

          return {
            result: Promise.resolve({
              probeId: probe.id,
              outcome: "rejected" as const,
              durationMilliseconds: 1,
              evidence: {},
              diagnostic: createRepairDiagnostic(probe),
            }),
            terminate: async () => createTerminationResult(probe),
          };
        },
      },
      host: {
        async isResponsive() {
          hostChecks += 1;

          if (hostChecks === 1) {
            return new Promise<boolean>(() => undefined);
          }

          return true;
        },
      },
    });

    expect(MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY).toMatchObject({
      profileId: "phase_9_realm_conformance",
      maximumExecutionMilliseconds: 50,
      maximumTerminationMilliseconds: 50,
      maximumInitializationMilliseconds: 1_000,
      maximumHostHeartbeatMilliseconds: 250,
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
      },
    });
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(
      report.probeResults.find((probe) => probe.kind === "runaway_work")
    ).toMatchObject({
      result: {
        outcome: "failed",
        diagnostic: {
          stage: "realm_termination",
          code: "candidate_termination_timed_out",
        },
      },
    });
    expect(report.probeResults[0].hostResponsive).toBe(false);
  });

  it("terminates a rejected candidate run and retains cleanup evidence", async () => {
    let terminationCalls = 0;
    let started = 0;
    const report = await runMechanicExecutionRealmConformanceSuite({
      candidate: {
        id: "rejecting_candidate",
        environment: "browser",
        start(probe) {
          started += 1;

          if (started === 1) {
            return {
              result: Promise.reject(new Error("Execution failed.")),
              async terminate() {
                terminationCalls += 1;
                return {
                  ...createTerminationResult(probe),
                  evidence: { resourcesAfterCleanup: noRetainedResources },
                };
              },
            };
          }

          return {
            result: Promise.resolve({
              probeId: probe.id,
              outcome: "rejected" as const,
              durationMilliseconds: 1,
              evidence: {},
              diagnostic: createRepairDiagnostic(probe),
            }),
            terminate: async () => createTerminationResult(probe),
          };
        },
      },
      host: {
        async isResponsive() {
          return true;
        },
      },
    });

    expect(terminationCalls).toBe(1);
    expect(report.probeResults[0].result).toMatchObject({
      outcome: "failed",
      evidence: { resourcesAfterCleanup: noRetainedResources },
      diagnostic: {
        stage: "realm_execution",
        code: "candidate_adapter_failed",
      },
    });
  });
});
