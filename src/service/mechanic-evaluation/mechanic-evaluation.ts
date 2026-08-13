import type {
  BehaviorScenario,
  GeneratedMechanicContract,
} from "@/game-spec";
import type { JsonValue, StableId } from "@/game-spec/game-spec-schema";
import {
  GENERATED_MECHANIC_SOURCE_ARTIFACT_VERSION,
  type GeneratedMechanicSourceArtifact,
} from "@/service/mechanic-source-generation/mechanic-source-generation-service";

export const GENERATED_MECHANIC_EVALUATION_VERSION =
  "generated_mechanic_evaluation/v1";

type MaybePromise<Value> = Value | Promise<Value>;

type DeclaredObservation = BehaviorScenario["observations"][number];

export type ExternalAcceptanceObservationAssertion = Exclude<
  DeclaredObservation,
  { kind: "state_equals" }
>;

export type ExternalAcceptanceObservation = Readonly<{
  id: StableId;
  scenarioId: StableId;
  observation: ExternalAcceptanceObservationAssertion;
}>;

export type GeneratedMechanicEvaluationRuntime = Readonly<{
  sourceArtifactId: StableId;
  hasBinding(bindingId: StableId): MaybePromise<boolean>;
  readDeclaredState(stateId: StableId): MaybePromise<JsonValue>;
  readBindingProperty(
    bindingId: StableId,
    property: StableId
  ): MaybePromise<JsonValue>;
  countOwnedObjects(archetypeId: StableId): MaybePromise<number>;
  readEmittedOutputs(portId: StableId): MaybePromise<readonly JsonValue[]>;
  install(): Promise<void>;
  receiveInput(portId: StableId, value: JsonValue): Promise<void>;
  dispatchAction(actionId: StableId): Promise<void>;
  advanceTime(milliseconds: number): Promise<void>;
  dispose(): Promise<void>;
}>;

export type CreateGeneratedMechanicEvaluationRuntimeInput = Readonly<{
  fixtureId: StableId;
  scenarioId: StableId;
  seed: number;
  contract: GeneratedMechanicContract;
  artifact: GeneratedMechanicSourceArtifact;
  config: JsonValue;
}>;

export type GeneratedMechanicEvaluationRuntimeFactory = (
  input: CreateGeneratedMechanicEvaluationRuntimeInput
) => Promise<GeneratedMechanicEvaluationRuntime>;

type SetupEvidence = Readonly<{
  kind: BehaviorScenario["setup"][number]["kind"];
  passed: boolean;
  actual: JsonValue;
  assertion: BehaviorScenario["setup"][number];
}>;

type StepEvidence = Readonly<{
  kind: BehaviorScenario["steps"][number]["kind"];
  status: "completed";
  input: BehaviorScenario["steps"][number];
}>;

type ObservationEvidence = Readonly<{
  source: "model_declared";
  kind: DeclaredObservation["kind"];
  passed: boolean;
  actual: JsonValue;
  assertion: DeclaredObservation;
}>;

type ExternalObservationEvidence = Omit<ObservationEvidence, "source"> &
  Readonly<{ id: StableId; source: "evaluator_authored" }>;

export type GeneratedMechanicScenarioEvaluationEvidence = Readonly<{
  scenarioId: StableId;
  seed: number;
  outcome: "passed" | "failed";
  setup: readonly SetupEvidence[];
  steps: readonly StepEvidence[];
  declaredObservations: readonly ObservationEvidence[];
  externalObservations: readonly ExternalObservationEvidence[];
  issues: readonly Readonly<{
    path: string;
    code:
      | "runtime_artifact_mismatch"
      | "runtime_execution_failed"
      | "runtime_cleanup_failed";
    message: string;
  }>[];
}>;

export type GeneratedMechanicEvaluationResult = Readonly<{
  outcome: "passed" | "failed";
  evidence: Readonly<{
    schemaVersion: typeof GENERATED_MECHANIC_EVALUATION_VERSION;
    fixtureId: StableId;
    contractId: StableId;
    sourceArtifactId: StableId;
    scenarios: readonly GeneratedMechanicScenarioEvaluationEvidence[];
    issues: readonly Readonly<{
      path: string;
      code: "unknown_external_scenario";
      message: string;
    }>[];
    replay?: Readonly<{
      matched: boolean;
      issue?: Readonly<{
        code: "nondeterministic_replay";
        message: string;
      }>;
      replayScenarios: readonly GeneratedMechanicScenarioEvaluationEvidence[];
    }>;
  }>;
}>;

const issuedEvaluationReceipts = new WeakMap<
  GeneratedMechanicEvaluationResult,
  Readonly<{
    contract: GeneratedMechanicContract;
    sourceArtifact: GeneratedMechanicSourceArtifact;
  }>
>();

export function isGeneratedMechanicEvaluationResultAuthentic({
  contract,
  evaluation,
  sourceArtifact,
}: Readonly<{
  contract: GeneratedMechanicContract;
  evaluation: GeneratedMechanicEvaluationResult;
  sourceArtifact: GeneratedMechanicSourceArtifact;
}>): boolean {
  const receipt = issuedEvaluationReceipts.get(evaluation);
  return (
    receipt !== undefined &&
    jsonEqual(receipt.contract, contract) &&
    jsonEqual(receipt.sourceArtifact, sourceArtifact)
  );
}

export type EvaluateGeneratedMechanicArtifactInput = Readonly<{
  fixtureId: StableId;
  contract: GeneratedMechanicContract;
  artifact: GeneratedMechanicSourceArtifact;
  config: JsonValue;
  externalObservations: readonly ExternalAcceptanceObservation[];
  createRuntime: GeneratedMechanicEvaluationRuntimeFactory;
}>;

export async function evaluateGeneratedMechanicArtifact({
  fixtureId,
  contract,
  artifact,
  config,
  externalObservations,
  createRuntime,
}: EvaluateGeneratedMechanicArtifactInput): Promise<GeneratedMechanicEvaluationResult> {
  requireCompiledArtifactCorrelation(contract, artifact);
  const admittedContract = snapshotJson(contract);
  const admittedArtifact = snapshotJson(artifact);
  const admittedConfig = snapshotJson(config);
  const admittedExternalObservations = snapshotJson(externalObservations);
  const admissionIssues = externalObservationAdmissionIssues(
    admittedContract,
    admittedExternalObservations
  );
  if (admissionIssues.length > 0) {
    return issueGeneratedMechanicEvaluationResult({
      contract: admittedContract,
      sourceArtifact: admittedArtifact,
      result: {
        outcome: "failed",
        evidence: {
          schemaVersion: GENERATED_MECHANIC_EVALUATION_VERSION,
          fixtureId,
          contractId: admittedContract.id,
          sourceArtifactId: admittedArtifact.id,
          scenarios: [],
          issues: admissionIssues,
        },
      },
    });
  }

  const firstScenarios = await runScenarios({
    fixtureId,
    contract: admittedContract,
    artifact: admittedArtifact,
    config: admittedConfig,
    externalObservations: admittedExternalObservations,
    createRuntime,
  });
  const replayScenarios = await runScenarios({
    fixtureId,
    contract: admittedContract,
    artifact: admittedArtifact,
    config: admittedConfig,
    externalObservations: admittedExternalObservations,
    createRuntime,
  });
  const replayMatched = jsonEqual(firstScenarios, replayScenarios);

  return issueGeneratedMechanicEvaluationResult({
    contract: admittedContract,
    sourceArtifact: admittedArtifact,
    result: {
      outcome:
        replayMatched &&
        firstScenarios.every((scenario) => scenario.outcome === "passed")
          ? "passed"
          : "failed",
      evidence: {
        schemaVersion: GENERATED_MECHANIC_EVALUATION_VERSION,
        fixtureId,
        contractId: admittedContract.id,
        sourceArtifactId: admittedArtifact.id,
        scenarios: firstScenarios,
        issues: [],
        replay: {
          matched: replayMatched,
          replayScenarios,
          ...(!replayMatched
            ? {
                issue: {
                  code: "nondeterministic_replay" as const,
                  message:
                    "Identical mechanic evaluation inputs produced different observable evidence.",
                },
              }
            : {}),
        },
      },
    },
  });
}

function issueGeneratedMechanicEvaluationResult({
  contract,
  result,
  sourceArtifact,
}: Readonly<{
  contract: GeneratedMechanicContract;
  result: GeneratedMechanicEvaluationResult;
  sourceArtifact: GeneratedMechanicSourceArtifact;
}>): GeneratedMechanicEvaluationResult {
  const receipt = snapshotJson(result);
  issuedEvaluationReceipts.set(receipt, {
    contract: snapshotJson(contract),
    sourceArtifact: snapshotJson(sourceArtifact),
  });
  return receipt;
}

function externalObservationAdmissionIssues(
  contract: GeneratedMechanicContract,
  externalObservations: readonly ExternalAcceptanceObservation[]
): readonly Readonly<{
  path: string;
  code: "unknown_external_scenario";
  message: string;
}>[] {
  const scenarioIds = new Set(contract.scenarios.map((scenario) => scenario.id));
  return externalObservations.flatMap((external, index) =>
    scenarioIds.has(external.scenarioId)
      ? []
      : [
          Object.freeze({
            path: `externalObservations.${index}.scenarioId`,
            code: "unknown_external_scenario" as const,
            message: `External observation "${external.id}" targets unknown scenario "${external.scenarioId}".`,
          }),
        ]
  );
}

async function runScenarios(input: {
  fixtureId: StableId;
  contract: GeneratedMechanicContract;
  artifact: GeneratedMechanicSourceArtifact;
  config: JsonValue;
  externalObservations: readonly ExternalAcceptanceObservation[];
  createRuntime: GeneratedMechanicEvaluationRuntimeFactory;
}): Promise<readonly GeneratedMechanicScenarioEvaluationEvidence[]> {
  const evidence: GeneratedMechanicScenarioEvaluationEvidence[] = [];
  for (const scenario of input.contract.scenarios) {
    evidence.push(await runScenario(input, scenario));
  }
  return snapshotJson(evidence);
}

async function runScenario(
  input: {
    fixtureId: StableId;
    contract: GeneratedMechanicContract;
    artifact: GeneratedMechanicSourceArtifact;
    config: JsonValue;
    externalObservations: readonly ExternalAcceptanceObservation[];
    createRuntime: GeneratedMechanicEvaluationRuntimeFactory;
  },
  scenario: BehaviorScenario
): Promise<GeneratedMechanicScenarioEvaluationEvidence> {
  const setup: SetupEvidence[] = [];
  const steps: StepEvidence[] = [];
  const declaredObservations: ObservationEvidence[] = [];
  const externalObservationEvidence: ExternalObservationEvidence[] = [];
  const issues: GeneratedMechanicScenarioEvaluationEvidence["issues"][number][] = [];
  let runtime: GeneratedMechanicEvaluationRuntime | undefined;

  try {
    runtime = await input.createRuntime(
      snapshotJson({
        fixtureId: input.fixtureId,
        scenarioId: scenario.id,
        seed: scenario.seed,
        contract: input.contract,
        artifact: input.artifact,
        config: input.config,
      })
    );
    if (runtime.sourceArtifactId !== input.artifact.id) {
      issues.push({
        path: "runtime.sourceArtifactId",
        code: "runtime_artifact_mismatch",
        message: `Evaluation runtime artifact "${runtime.sourceArtifactId}" does not match compiled artifact "${input.artifact.id}".`,
      });
    } else {
      for (const setupEntry of scenario.setup) {
        setup.push(await observeSetup(runtime, setupEntry));
      }
      if (setup.every((entry) => entry.passed)) {
        await runtime.install();
        for (const step of scenario.steps) {
          await executeStep(runtime, step);
          steps.push({
            kind: step.kind,
            status: "completed",
            input: snapshotJson(step),
          });
        }
        for (const observation of scenario.observations) {
          declaredObservations.push(
            await observeDeclared(runtime, observation)
          );
        }
        for (const external of input.externalObservations) {
          if (external.scenarioId !== scenario.id) {
            continue;
          }
          externalObservationEvidence.push({
            id: external.id,
            ...(await observeDeclared(runtime, external.observation)),
            source: "evaluator_authored",
          });
        }
      }
    }
  } catch (error) {
    issues.push({
      path: `scenarios.${scenario.id}`,
      code: "runtime_execution_failed",
      message: errorMessage(error, "Mechanic evaluation runtime failed."),
    });
  } finally {
    try {
      await runtime?.dispose();
    } catch (error) {
      issues.push({
        path: `scenarios.${scenario.id}.dispose`,
        code: "runtime_cleanup_failed",
        message: errorMessage(error, "Mechanic evaluation cleanup failed."),
      });
    }
  }

  const passed =
    issues.length === 0 &&
    setup.every((entry) => entry.passed) &&
    declaredObservations.every((entry) => entry.passed) &&
    externalObservationEvidence.every((entry) => entry.passed);
  return snapshotJson({
    scenarioId: scenario.id,
    seed: scenario.seed,
    outcome: passed ? "passed" : "failed",
    setup,
    steps,
    declaredObservations,
    externalObservations: externalObservationEvidence,
    issues,
  });
}

async function observeSetup(
  runtime: GeneratedMechanicEvaluationRuntime,
  setup: BehaviorScenario["setup"][number]
): Promise<SetupEvidence> {
  if (setup.kind === "binding_present") {
    const actual = await runtime.hasBinding(setup.bindingId);
    return snapshotJson({
      kind: setup.kind,
      passed: actual,
      actual,
      assertion: setup,
    });
  }
  const actual = await runtime.readDeclaredState(setup.stateId);
  return snapshotJson({
    kind: setup.kind,
    passed: jsonEqual(actual, setup.value),
    actual,
    assertion: setup,
  });
}

async function executeStep(
  runtime: GeneratedMechanicEvaluationRuntime,
  step: BehaviorScenario["steps"][number]
): Promise<void> {
  switch (step.kind) {
    case "receive_input":
      await runtime.receiveInput(step.portId, snapshotJson(step.value));
      return;
    case "dispatch_action":
      await runtime.dispatchAction(step.actionId);
      return;
    case "advance_time":
      await runtime.advanceTime(step.milliseconds);
  }
}

async function observeDeclared(
  runtime: GeneratedMechanicEvaluationRuntime,
  observation: DeclaredObservation
): Promise<ObservationEvidence> {
  switch (observation.kind) {
    case "state_equals": {
      const actual = await runtime.readDeclaredState(observation.stateId);
      return observationEvidence(observation.kind, actual, observation);
    }
    case "binding_property": {
      const actual = await runtime.readBindingProperty(
        observation.bindingId,
        observation.property
      );
      return observationEvidence(observation.kind, actual, observation);
    }
    case "owned_object_count": {
      const actual = await runtime.countOwnedObjects(observation.archetypeId);
      return observationEvidence(observation.kind, actual, observation);
    }
    case "output_emitted": {
      const actual = snapshotJson(
        [...(await runtime.readEmittedOutputs(observation.portId))]
      );
      return snapshotJson({
        source: "model_declared" as const,
        kind: observation.kind,
        passed: actual.some((value) => jsonEqual(value, observation.value)),
        actual,
        assertion: observation,
      });
    }
  }
}

function observationEvidence(
  kind: ObservationEvidence["kind"],
  actual: JsonValue,
  observation:
    | Extract<DeclaredObservation, { kind: "state_equals" }>
    | Extract<DeclaredObservation, { kind: "binding_property" }>
    | Extract<DeclaredObservation, { kind: "owned_object_count" }>
): ObservationEvidence {
  return snapshotJson({
    source: "model_declared" as const,
    kind,
    passed: compareObservation(actual, observation),
    actual,
    assertion: observation,
  });
}

function compareObservation(
  actual: JsonValue,
  observation:
    | Extract<DeclaredObservation, { kind: "state_equals" }>
    | Extract<DeclaredObservation, { kind: "binding_property" }>
    | Extract<DeclaredObservation, { kind: "owned_object_count" }>
): boolean {
  if (observation.kind === "state_equals") {
    return jsonEqual(actual, observation.value);
  }
  switch (observation.operator) {
    case "equals":
      return jsonEqual(actual, observation.value);
    case "not_equals":
      return !jsonEqual(actual, observation.value);
    case "less_than":
      return numericComparison(actual, observation.value, (left, right) => left < right);
    case "at_most":
      return numericComparison(actual, observation.value, (left, right) => left <= right);
    case "greater_than":
      return numericComparison(actual, observation.value, (left, right) => left > right);
    case "at_least":
      return numericComparison(actual, observation.value, (left, right) => left >= right);
  }
}

function numericComparison(
  actual: JsonValue,
  expected: JsonValue,
  compare: (actual: number, expected: number) => boolean
): boolean {
  return (
    typeof actual === "number" &&
    typeof expected === "number" &&
    Number.isFinite(actual) &&
    Number.isFinite(expected) &&
    compare(actual, expected)
  );
}

function requireCompiledArtifactCorrelation(
  contract: GeneratedMechanicContract,
  artifact: GeneratedMechanicSourceArtifact
): void {
  if (
    artifact.schemaVersion !== GENERATED_MECHANIC_SOURCE_ARTIFACT_VERSION ||
    !artifact.build.parsed ||
    !artifact.build.typechecked ||
    !artifact.build.compiled ||
    artifact.contractId !== contract.id ||
    artifact.intentId !== contract.intentId ||
    artifact.capabilityVersion !== contract.capabilityVersion
  ) {
    throw new TypeError(
      "Mechanic evaluation requires the correlated parsed, typechecked, compiled source artifact for the accepted contract."
    );
  }
}

function snapshotJson<Value>(value: Value): Value {
  return deepFreeze(structuredClone(value));
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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
