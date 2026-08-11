import type { GeneratedMechanicContract } from "../../src/game-spec";
import type { JsonValue } from "../../src/game-spec/game-spec-schema";
import { mechanicCapabilityRegistry } from "../../src/game-spec/mechanics/mechanic-capability-registry";
import type {
  MechanicExecutionRealmCapabilityHost,
  MechanicExecutionRealmResourceBudget,
} from "../../src/runtime/mechanics/mechanic-execution-realm";
import { createSesWorkerMechanicExecutionRealmAdapter } from "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm";
import { SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION } from "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm-protocol";
import {
  createGeneratedMechanicLifecycleEvaluationRuntimeFactory,
  evaluateGeneratedMechanicArtifact,
  type GeneratedMechanicEvaluationResult,
} from "../../src/service/mechanic-evaluation";
import type { GeneratedMechanicSourceArtifact } from "../../src/service/mechanic-source-generation";

type BrowserQaResult = Readonly<{
  status: "passed";
  realRealmExecutions: 4;
  passingReplayMatched: true;
  failingReplayMatched: true;
  nondeterministicReplayRejected: true;
  selfGradingRejected: true;
  lifecycleInputImmutable: true;
  cases: Readonly<{
    passing: GeneratedMechanicEvaluationResult;
    failing: GeneratedMechanicEvaluationResult;
    nondeterministic: GeneratedMechanicEvaluationResult;
    selfGrading: GeneratedMechanicEvaluationResult;
  }>;
}>;

declare global {
  interface Window {
    __mechanicEvaluationBrowserQa?: Readonly<{
      error?: string;
      result?: BrowserQaResult;
    }>;
  }
}

async function runBrowserQa(): Promise<void> {
  console.info("[ticket14] starting browser evaluation");
  const readyControllers = await createReadyControllerPool(8);
  let entropyReadCount = 0;
  const createRuntime = createGeneratedMechanicLifecycleEvaluationRuntimeFactory({
    realmAdapter: createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => {
        const controller = readyControllers.shift();
        if (!controller) {
          throw new Error("The Ticket 14 ready-controller pool was exhausted.");
        }
        return controller;
      },
    }),
    resourceBudget: RESOURCE_BUDGET,
    createFixture: async (input) => {
      const state = new Map<string, JsonValue>([
        ["counter", 0],
        ["input_immutable", false],
      ]);
      const outputs = new Map<string, JsonValue[]>();
      const capabilityHost: MechanicExecutionRealmCapabilityHost = {
        invoke: ({ capabilityId, arguments: capabilityArguments }) => {
          switch (capabilityId) {
            case "state_read": {
              const stateId = String(capabilityArguments[0]);
              if (
                stateId === "entropy" &&
                input.artifact.id.includes("nondeterministic")
              ) {
                entropyReadCount += 1;
                return { kind: "json", value: entropyReadCount };
              }
              const value = state.get(stateId);
              if (value === undefined) {
                throw new Error(`Unknown fixture state "${stateId}".`);
              }
              return { kind: "json", value };
            }
            case "state_write": {
              state.set(String(capabilityArguments[0]), capabilityArguments[1] as JsonValue);
              return { kind: "json", value: null };
            }
            case "signal_emit": {
              const portId = String(capabilityArguments[0]);
              const values = outputs.get(portId) ?? [];
              values.push(capabilityArguments[1] as JsonValue);
              outputs.set(portId, values);
              return { kind: "json", value: null };
            }
            default:
              throw new Error(`Unexpected delegated capability "${capabilityId}".`);
          }
        },
      };
      return {
        bindings: [],
        capabilityHost,
        fixedStepIntervalMilliseconds: 10,
        observations: {
          hasBinding: () => false,
          readDeclaredState: (stateId) => {
            const value = state.get(stateId);
            if (value === undefined) {
              throw new Error(`Unknown observed state "${stateId}".`);
            }
            return value;
          },
          readBindingProperty: () => null,
          countOwnedObjects: () => 0,
          readEmittedOutputs: (portId) => outputs.get(portId) ?? [],
        },
        dispose: async () => undefined,
      };
    },
  });

  const passing = await evaluateCaseWithDeadline("passing", createRuntime);
  requireCondition(
    passing.outcome === "passed",
    `Passing compiled artifact failed: ${JSON.stringify(passing)}`
  );
  requireCondition(passing.evidence.replay?.matched === true, "Passing replay drifted.");
  requireCondition(
    passing.evidence.scenarios[0]?.declaredObservations.some(
      (observation) =>
        observation.assertion.kind === "state_equals" &&
        observation.assertion.stateId === "input_immutable" &&
        observation.passed
    ) === true,
    "Lifecycle input was mutable inside compiled code."
  );

  const failing = await evaluateCaseWithDeadline("failing", createRuntime);
  requireCondition(failing.outcome === "failed", "Failing compiled artifact passed.");
  requireCondition(failing.evidence.replay?.matched === true, "Failing replay drifted.");

  const nondeterministic = await evaluateCaseWithDeadline(
    "nondeterministic",
    createRuntime
  );
  requireCondition(
    nondeterministic.outcome === "failed" &&
      nondeterministic.evidence.replay?.matched === false,
    "Nondeterministic compiled artifact was not rejected."
  );

  const selfGrading = await evaluateCaseWithDeadline("self_grading", createRuntime);
  requireCondition(
    selfGrading.outcome === "failed" &&
      selfGrading.evidence.scenarios[0]?.declaredObservations.some(
        (observation) => observation.kind === "output_emitted" && observation.passed
      ) === true &&
      selfGrading.evidence.scenarios[0]?.externalObservations.some(
        (observation) => !observation.passed
      ) === true,
    "Generated self-grading overrode evaluator-authored truth."
  );
  requireCondition(
    readyControllers.length === 0,
    "The Ticket 14 evaluator did not consume exactly one real SES controller per replay."
  );

  window.__mechanicEvaluationBrowserQa = {
    result: {
      status: "passed",
      realRealmExecutions: 4,
      passingReplayMatched: true,
      failingReplayMatched: true,
      nondeterministicReplayRejected: true,
      selfGradingRejected: true,
      lifecycleInputImmutable: true,
      cases: { passing, failing, nondeterministic, selfGrading },
    },
  };
}

async function createReadyControllerPool(count: number): Promise<Worker[]> {
  const controllers = [
    new Worker(
      new URL(
        "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm-controller.worker.ts",
        import.meta.url
      ),
      { name: "sparkline-mechanic-evaluation-realm", type: "module" }
    ),
  ];
  try {
    await waitForControllerReady(controllers[0]!);
    console.info(`[ticket14] controller 1/${count} ready`);
    controllers.push(
      ...Array.from({ length: count - 1 }, () =>
        new Worker(
          new URL(
            "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm-controller.worker.ts",
            import.meta.url
          ),
          { name: "sparkline-mechanic-evaluation-realm", type: "module" }
        )
      )
    );
    await Promise.all(
      controllers.slice(1).map(async (controller, index) => {
        await waitForControllerReady(controller);
        console.info(`[ticket14] controller ${index + 2}/${count} ready`);
      })
    );
    return controllers;
  } catch (error) {
    controllers.forEach((controller) => controller.terminate());
    throw error;
  }
}

function waitForControllerReady(controller: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Ticket 14 SES controller pool warmup timed out."));
    }, 120_000);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      controller.removeEventListener("message", onMessage);
      controller.removeEventListener("error", onError);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        event.isTrusted &&
        typeof event.data === "object" &&
        event.data !== null &&
        "kind" in event.data &&
        (event.data.kind === "ses_controller_ready" ||
          event.data.kind === "sparkline_mechanic_realm_controller_ready")
      ) {
        cleanup();
        resolve();
      }
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message));
    };
    controller.addEventListener("message", onMessage);
    controller.addEventListener("error", onError);
    controller.postMessage({
      kind: "sparkline_mechanic_realm_controller_ready_probe",
      protocolVersion: SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION,
    });
  });
}

async function evaluateCaseWithDeadline(
  caseId: "passing" | "failing" | "nondeterministic" | "self_grading",
  createRuntime: ReturnType<typeof createGeneratedMechanicLifecycleEvaluationRuntimeFactory>
): Promise<GeneratedMechanicEvaluationResult> {
  console.info(`[ticket14] starting ${caseId}`);
  const result = await Promise.race([
    evaluateCase(caseId, createRuntime),
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Timed out while evaluating ${caseId}.`)),
        45_000
      );
    }),
  ]);
  console.info(`[ticket14] finished ${caseId}`);
  return result;
}

async function evaluateCase(
  caseId: "passing" | "failing" | "nondeterministic" | "self_grading",
  createRuntime: ReturnType<typeof createGeneratedMechanicLifecycleEvaluationRuntimeFactory>
): Promise<GeneratedMechanicEvaluationResult> {
  const contract = createContract(caseId);
  return evaluateGeneratedMechanicArtifact({
    fixtureId: `browser_fixture_${caseId}`,
    contract,
    artifact: createArtifact(contract, caseId),
    config: {},
    externalObservations:
      caseId === "self_grading"
        ? [
            {
              id: "independent_owned_object",
              scenarioId: contract.scenarios[0]!.id,
              observation: {
                kind: "owned_object_count",
                archetypeId: "independent_marker",
                operator: "at_least",
                value: 1,
              },
            },
          ]
        : [],
    createRuntime,
  });
}

function createContract(
  caseId: "passing" | "failing" | "nondeterministic" | "self_grading"
): GeneratedMechanicContract {
  const id = `browser_${caseId}_contract`;
  const expectedCounter =
    caseId === "failing" ? 999 : caseId === "nondeterministic" ? 11 : 13;
  return {
    schemaVersion: "generated-mechanic-contract/v1",
    id,
    intentId: `${id}_intent`,
    capabilityVersion: mechanicCapabilityRegistry.version,
    behavior: {
      summary: `Exercise the ${caseId} compiled evaluation case.`,
      triggers: ["input_received", "action_dispatched", "time_advanced"],
      outcomes: ["state_observed"],
    },
    config: { kind: "object", fields: [] },
    bindings: [],
    ownedObjects: [],
    privateState: [
      { id: "counter", valueType: "integer", initialValue: 0 },
      { id: "input_immutable", valueType: "boolean", initialValue: false },
    ],
    lifecycle: {
      callbacks: ["install", "logical_action", "gameplay_event"],
      fixedStep: true,
      dispose: true,
    },
    ports: [
      {
        id: "counter_input",
        direction: "input",
        payload: {
          kind: "object",
          fields: [
            {
              key: "delta",
              required: true,
              value: { kind: "integer", minimum: 0, maximum: 10 },
            },
          ],
        },
      },
      {
        id: "grade_claim",
        direction: "output",
        payload: {
          kind: "object",
          fields: [
            {
              key: "passed",
              required: true,
              value: { kind: "boolean" },
            },
          ],
        },
      },
    ],
    capabilities: ["state_read", "state_write", "event_subscribe", "signal_emit"],
    resourceExpectations: {
      maximumOwnedObjects: 0,
      maximumOperationsPerTick: 12,
      maximumScheduledCallbacks: 0,
      maximumSubscriptions: 1,
      maximumSignalsPerTick: 1,
      maximumStateBytes: 256,
      maximumCallbackMilliseconds: 20,
      maximumConsecutiveFailures: 2,
    },
    scenarios: [
      {
        id: `${id}_scenario`,
        seed: 1729,
        setup: [{ kind: "state_equals", stateId: "counter", value: 0 }],
        steps: [
          { kind: "dispatch_action", actionId: "activate" },
          { kind: "receive_input", portId: "counter_input", value: { delta: 2 } },
          { kind: "advance_time", milliseconds: 10 },
        ],
        observations: [
          { kind: "state_equals", stateId: "counter", value: expectedCounter },
          { kind: "state_equals", stateId: "input_immutable", value: true },
          ...(caseId === "self_grading"
            ? [
                {
                  kind: "output_emitted" as const,
                  portId: "grade_claim",
                  value: { passed: true },
                },
              ]
            : []),
        ],
      },
    ],
  };
}

function createArtifact(
  contract: GeneratedMechanicContract,
  caseId: "passing" | "failing" | "nondeterministic" | "self_grading"
): GeneratedMechanicSourceArtifact {
  const prefix = `browser_${caseId}`;
  const eventCallbackId = `${prefix}_event`;
  const actionBody =
    caseId === "nondeterministic"
      ? [
          `await capabilities.events.subscribe("counter_input", "${eventCallbackId}");`,
          'await capabilities.state.write("counter", await capabilities.state.read("entropy"));',
        ].join("\n")
      : [
          `await capabilities.events.subscribe("counter_input", "${eventCallbackId}");`,
          'const current = await capabilities.state.read("counter");',
          'await capabilities.state.write("counter", current + 1);',
          ...(caseId === "self_grading"
            ? ['await capabilities.signals.emit("grade_claim", { passed: true });']
            : []),
        ].join("\n");
  return {
    schemaVersion: "generated_mechanic_source_artifact/v1",
    id: `${prefix}_source`,
    contractId: contract.id,
    intentId: contract.intentId,
    capabilityVersion: contract.capabilityVersion,
    grant: {
      capabilityVersion: contract.capabilityVersion,
      capabilities: contract.capabilities.map((capabilityId, index) => {
        const capability = mechanicCapabilityRegistry.capabilities.find(
          (candidate) => candidate.id === capabilityId
        );
        if (!capability) {
          throw new Error(`Missing capability "${capabilityId}".`);
        }
        return {
          ...capability,
          justification: {
            kind: "contract_declaration" as const,
            path: `mechanic.capabilities.${index}`,
          },
        };
      }),
    },
    usedCapabilities: [...contract.capabilities],
    callbacks: [
      callback(
        `${prefix}_install`,
        "install",
        "return null;"
      ),
      callback(`${prefix}_action`, "logical_action", actionBody),
      callback(
        eventCallbackId,
        "gameplay_event",
        [
          'try { lifecycleInput.payload.delta = 99; } catch {}',
          'await capabilities.state.write("input_immutable", lifecycleInput.payload.delta === 2);',
          'const current = await capabilities.state.read("counter");',
          'await capabilities.state.write("counter", current + lifecycleInput.payload.delta);',
        ].join("\n")
      ),
      callback(
        `${prefix}_fixed`,
        "fixed_step",
        [
          'const current = await capabilities.state.read("counter");',
          'await capabilities.state.write("counter", current + lifecycleInput.simulationTimeMilliseconds);',
        ].join("\n")
      ),
      callback(`${prefix}_dispose`, "dispose", "return null;"),
    ],
    build: {
      language: "typescript",
      target: "es2020",
      parsed: true,
      typechecked: true,
      compiled: true,
      staticValidationTarget: "normalized_javascript",
      staticValidationVersion: "generated_mechanic_source_static_validation/v1",
    },
  };
}

function callback(
  id: string,
  kind: GeneratedMechanicSourceArtifact["callbacks"][number]["kind"],
  body: string
): GeneratedMechanicSourceArtifact["callbacks"][number] {
  return {
    id,
    kind,
    sourceTypeScript: body,
    normalizedJavaScript: `const __sparklineGeneratedMechanicCallback = async () => {\n${body}\n};`,
  };
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const RESOURCE_BUDGET: MechanicExecutionRealmResourceBudget = {
  profileId: "phase_9_fixed_budget",
  maximumOwnedObjects: 4,
  maximumOperationsPerTick: 16,
  maximumScheduledCallbacks: 4,
  maximumSubscriptions: 4,
  maximumSignalsPerTick: 4,
  maximumStateBytes: 1024,
  maximumCallbackMilliseconds: 50,
  maximumConsecutiveFailures: 2,
};

void runBrowserQa().catch((error) => {
  window.__mechanicEvaluationBrowserQa = {
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  };
});
