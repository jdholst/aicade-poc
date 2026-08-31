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

export type ExternalAcceptanceObservationAssertion =
  | Exclude<DeclaredObservation, { kind: "state_equals" }>
  | Readonly<{
      kind: "referenced_entity_motion_changed";
      bindingIds: readonly StableId[];
      actionId: StableId;
    }>
  | Readonly<{
      kind: "owned_object_lifecycle_after_action";
      archetypeIds: readonly StableId[];
      actionId: StableId;
      requireActorOrigin?: true;
      requireTargetInteraction?: true;
    }>
  | Readonly<{
      kind: "owned_object_creation_after_action";
      archetypeIds: readonly StableId[];
      actionId: StableId;
      requireActorOrigin?: true;
    }>
  | Readonly<{
      kind: "owned_object_lifecycle_progress_after_action";
      archetypeIds: readonly StableId[];
      actionId: StableId;
      requireActorOrigin?: true;
      requireTargetInteraction?: true;
    }>
  | Readonly<{
      kind: "owned_object_lifecycle_unchanged_after_action";
      archetypeIds: readonly StableId[];
      actionId: StableId;
    }>
  | Readonly<{
      kind: "owned_object_lifecycle_after_install";
      archetypeIds: readonly StableId[];
      requireActorOrigin?: true;
      requireTargetInteraction?: true;
    }>
  | Readonly<{
      kind: "owned_object_creation_after_install";
      archetypeIds: readonly StableId[];
      requireActorOrigin?: true;
    }>
  | Readonly<{
      kind: "owned_object_lifecycle_progress_after_install";
      archetypeIds: readonly StableId[];
      requireActorOrigin?: true;
      requireTargetInteraction?: true;
    }>
  | Readonly<{
      kind: "owned_object_lifecycle_unchanged_after_install";
      archetypeIds: readonly StableId[];
    }>;

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
  readOwnedObjectActivity?(
    archetypeId: StableId
  ): MaybePromise<
      Readonly<{
        active: number;
        actorOriginCreations: number;
        created: number;
      destroyed: number;
      simulatedDistanceTraveled: number;
      targetInteractions: number;
    }>
  >;
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

type ExternalObservationEvidence = Readonly<{
  id: StableId;
  source: "evaluator_authored";
  kind: ExternalAcceptanceObservationAssertion["kind"];
  passed: boolean;
  actual: JsonValue;
  assertion: ExternalAcceptanceObservationAssertion;
}>;

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
      code: "external_plan_mismatch" | "unknown_external_scenario";
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
    config: JsonValue;
    externalObservations: readonly ExternalAcceptanceObservation[];
    sourceArtifact: GeneratedMechanicSourceArtifact;
  }>
>();

export function isGeneratedMechanicEvaluationResultAuthentic({
  contract,
  config,
  evaluation,
  sourceArtifact,
}: Readonly<{
  contract: GeneratedMechanicContract;
  config: JsonValue;
  evaluation: GeneratedMechanicEvaluationResult;
  sourceArtifact: GeneratedMechanicSourceArtifact;
}>): boolean {
  const receipt = issuedEvaluationReceipts.get(evaluation);
  return (
    receipt !== undefined &&
    jsonEqual(receipt.contract, contract) &&
    jsonEqual(receipt.config, config) &&
    hasExactExternalObservationCoverage(
      receipt.contract,
      receipt.externalObservations,
      evaluation
    ) &&
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
      config: admittedConfig,
      externalObservations: admittedExternalObservations,
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
    config: admittedConfig,
    externalObservations: admittedExternalObservations,
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
  config,
  externalObservations,
  result,
  sourceArtifact,
}: Readonly<{
  contract: GeneratedMechanicContract;
  config: JsonValue;
  externalObservations: readonly ExternalAcceptanceObservation[];
  result: GeneratedMechanicEvaluationResult;
  sourceArtifact: GeneratedMechanicSourceArtifact;
}>): GeneratedMechanicEvaluationResult {
  const receipt = snapshotJson(result);
  issuedEvaluationReceipts.set(receipt, {
    contract: snapshotJson(contract),
    config: snapshotJson(config),
    externalObservations: snapshotJson(externalObservations),
    sourceArtifact: snapshotJson(sourceArtifact),
  });
  return receipt;
}

function hasExactExternalObservationCoverage(
  contract: GeneratedMechanicContract,
  externalObservations: readonly ExternalAcceptanceObservation[],
  evaluation: GeneratedMechanicEvaluationResult
): boolean {
  if (externalObservations.length !== contract.scenarios.length) {
    return false;
  }
  return contract.scenarios.every((scenario, index) => {
    const expected = externalObservations[index];
    const evidence = evaluation.evidence.scenarios[index];
    const replayEvidence = evaluation.evidence.replay?.replayScenarios[index];
    return (
      expected !== undefined &&
      expected.scenarioId === scenario.id &&
      evidence?.scenarioId === scenario.id &&
      evidence.externalObservations.length === 1 &&
      replayEvidence?.scenarioId === scenario.id &&
      replayEvidence.externalObservations.length === 1 &&
      jsonEqual(evidence.externalObservations[0]?.assertion, expected.observation) &&
      jsonEqual(
        replayEvidence.externalObservations[0]?.assertion,
        expected.observation
      )
    );
  });
}

function externalObservationAdmissionIssues(
  contract: GeneratedMechanicContract,
  externalObservations: readonly ExternalAcceptanceObservation[]
): readonly Readonly<{
  path: string;
  code: "external_plan_mismatch" | "unknown_external_scenario";
  message: string;
}>[] {
  const scenariosById = new Map(
    contract.scenarios.map((scenario) => [scenario.id, scenario] as const)
  );
  const contractBindingIds = new Set(
    contract.bindings.map((binding) => binding.id)
  );
  const issues: Array<
    Readonly<{
      path: string;
      code: "external_plan_mismatch" | "unknown_external_scenario";
      message: string;
    }>
  > = [];
  externalObservations.forEach((external, index) => {
    const scenario = scenariosById.get(external.scenarioId);
    if (!scenario) {
      issues.push(
        Object.freeze({
          path: `externalObservations.${index}.scenarioId`,
          code: "unknown_external_scenario" as const,
          message: `External observation "${external.id}" targets unknown scenario "${external.scenarioId}".`,
        })
      );
      return;
    }
    if (!isCausalExternalObservation(external.observation)) {
      return;
    }
    const scenarioActionIds = scenario.steps.flatMap((step) =>
      step.kind === "dispatch_action" ? [step.actionId] : []
    );
    if (isActionCausalExternalObservation(external.observation) && (
      scenarioActionIds.length !== 1 ||
      scenarioActionIds[0] !== external.observation.actionId
    )) {
      issues.push(
        Object.freeze({
          path: `externalObservations.${index}.observation.actionId`,
          code: "external_plan_mismatch" as const,
          message: `External observation "${external.id}" must name the scenario's one exact dispatched action.`,
        })
      );
    }
    if (isInstallCausalExternalObservation(external.observation) && scenarioActionIds.length !== 0) {
      issues.push(
        Object.freeze({
          path: `externalObservations.${index}.observation.kind`,
          code: "external_plan_mismatch" as const,
          message: `Install-origin external observation "${external.id}" requires a scenario with no dispatched action.`,
        })
      );
    }
    if (external.observation.kind === "referenced_entity_motion_changed") {
      if (
        external.observation.bindingIds.length === 0 ||
        new Set(external.observation.bindingIds).size !==
          external.observation.bindingIds.length ||
        external.observation.bindingIds.some(
          (bindingId) => !contractBindingIds.has(bindingId)
        )
      ) {
        issues.push(
          Object.freeze({
            path: `externalObservations.${index}.observation.bindingIds`,
            code: "external_plan_mismatch" as const,
            message: `External observation "${external.id}" must name a nonempty, unique set of exact contract bindings.`,
          })
        );
      }
      return;
    }
    if (!isOwnedObjectLifecycleObservation(external.observation)) {
      return;
    }
    const contractArchetypeIds = new Set(
      contract.ownedObjects.map(({ id }) => id)
    );
    if (
      external.observation.archetypeIds.length === 0 ||
      new Set(external.observation.archetypeIds).size !==
        external.observation.archetypeIds.length ||
      external.observation.archetypeIds.some(
        (archetypeId) => !contractArchetypeIds.has(archetypeId)
      )
    ) {
      issues.push(
        Object.freeze({
          path: `externalObservations.${index}.observation.archetypeIds`,
          code: "external_plan_mismatch" as const,
          message: `External observation "${external.id}" must name a nonempty, unique set of exact contract owned-object archetypes.`,
        })
      );
    }
  });
  return Object.freeze(issues);
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
  const causalExternalObservationEvidence = new Map<
    StableId,
    Omit<ExternalObservationEvidence, "id" | "source">
  >();
  const causalExternalObservationBaselines = new Map<StableId, JsonValue>();
  const issues: GeneratedMechanicScenarioEvaluationEvidence["issues"][number][] = [];
  const requiresOwnedObjectTravel = input.contract.capabilities.includes(
    "object_motion_write"
  );
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
      const activeRuntime = runtime;
      for (const setupEntry of scenario.setup) {
        setup.push(await observeSetup(activeRuntime, setupEntry));
      }
      if (setup.every((entry) => entry.passed)) {
        const installObservations = input.externalObservations.filter(
          (external) =>
            external.scenarioId === scenario.id &&
            isInstallCausalExternalObservation(external.observation)
        );
        const installBaselines = await Promise.all(
          installObservations.map((external) =>
            captureExternalBaseline(activeRuntime, external.observation)
          )
        );
        for (const [index, external] of installObservations.entries()) {
          causalExternalObservationBaselines.set(
            external.id,
            installBaselines[index]!
          );
        }
        await activeRuntime.install();
        for (const step of scenario.steps) {
          const causalObservations =
            step.kind === "dispatch_action"
              ? input.externalObservations.filter(
                  (external) =>
                    external.scenarioId === scenario.id &&
                    isActionCausalExternalObservation(external.observation) &&
                    external.observation.actionId === step.actionId
                )
              : [];
          const causalBaselines = await Promise.all(
            causalObservations.map((external) =>
              captureExternalBaseline(activeRuntime, external.observation)
            )
          );
          for (const [index, external] of causalObservations.entries()) {
            causalExternalObservationBaselines.set(
              external.id,
              causalBaselines[index]!
            );
          }
          await executeStep(activeRuntime, step);
          for (const [index, external] of causalObservations.entries()) {
            if (observesExternalAfterScenario(external.observation)) {
              continue;
            }
            causalExternalObservationEvidence.set(
              external.id,
              await observeExternal(
                activeRuntime,
                external.observation,
                causalBaselines[index],
                requiresOwnedObjectTravel
              )
            );
          }
          steps.push({
            kind: step.kind,
            status: "completed",
            input: snapshotJson(step),
          });
        }
        for (const external of input.externalObservations) {
          if (
            external.scenarioId !== scenario.id ||
            !observesExternalAfterScenario(external.observation)
          ) {
            continue;
          }
          const baseline = causalExternalObservationBaselines.get(external.id);
          if (!causalExternalObservationBaselines.has(external.id)) {
            throw new Error(
              `External observation "${external.id}" did not capture its causal action baseline.`
            );
          }
          causalExternalObservationEvidence.set(
            external.id,
            await observeExternal(
              activeRuntime,
              external.observation,
              baseline,
              requiresOwnedObjectTravel
            )
          );
        }
        for (const observation of scenario.observations) {
          declaredObservations.push(
            await observeDeclared(activeRuntime, observation)
          );
        }
        for (const external of input.externalObservations) {
          if (external.scenarioId !== scenario.id) {
            continue;
          }
          const observed =
            isCausalExternalObservation(external.observation)
              ? causalExternalObservationEvidence.get(external.id)
              : await observeExternal(
                  activeRuntime,
                  external.observation,
                  undefined,
                  requiresOwnedObjectTravel
                );
          if (!observed) {
            throw new Error(
              `External observation "${external.id}" was not captured from its causal action.`
            );
          }
          externalObservationEvidence.push({
            id: external.id,
            ...observed,
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

function observesExternalAfterScenario(
  observation: ExternalAcceptanceObservationAssertion
): boolean {
  return (
    observation.kind === "owned_object_lifecycle_after_action" ||
    observation.kind === "owned_object_lifecycle_progress_after_action" ||
    isInstallCausalExternalObservation(observation)
  );
}

async function observeExternal(
  runtime: GeneratedMechanicEvaluationRuntime,
  observation: ExternalAcceptanceObservationAssertion,
  baseline: JsonValue | undefined,
  requiresOwnedObjectTravel: boolean
): Promise<Omit<ExternalObservationEvidence, "id" | "source">> {
  if (isOwnedObjectLifecycleObservation(observation)) {
    if (!runtime.readOwnedObjectActivity) {
      throw new Error(
        "Evaluation runtime does not expose owned-object activity observations."
      );
    }
    const before = Array.isArray(baseline) ? baseline : [];
    const after = await Promise.all(
      observation.archetypeIds.map(async (archetypeId) => ({
        archetypeId,
        ...(await runtime.readOwnedObjectActivity!(archetypeId)),
      }))
    );
    const passed =
      before.length === after.length &&
      after.every((entry, index) => {
        const beforeEntry = before[index];
        if (
          typeof beforeEntry !== "object" ||
          beforeEntry === null ||
          Array.isArray(beforeEntry) ||
          beforeEntry.archetypeId !== entry.archetypeId
        ) {
          return false;
        }
        const created = entry.created - Number(beforeEntry.created);
        const actorOriginCreations =
          entry.actorOriginCreations - Number(beforeEntry.actorOriginCreations);
        const destroyed = entry.destroyed - Number(beforeEntry.destroyed);
        const simulatedDistanceTraveled =
          entry.simulatedDistanceTraveled -
          Number(beforeEntry.simulatedDistanceTraveled);
        const targetInteractions =
          entry.targetInteractions - Number(beforeEntry.targetInteractions);
        const active = entry.active - Number(beforeEntry.active);
        return isUnchangedOwnedObjectLifecycleObservation(observation)
          ? created === 0 &&
              actorOriginCreations === 0 &&
              destroyed === 0 &&
              simulatedDistanceTraveled === 0 &&
              targetInteractions === 0 &&
              entry.active === Number(beforeEntry.active)
          : isCreationOwnedObjectLifecycleObservation(observation)
            ? created > 0 &&
              active === created &&
              destroyed === 0 &&
              (!("requireActorOrigin" in observation) ||
                observation.requireActorOrigin !== true ||
                actorOriginCreations === created)
          : isProgressOwnedObjectLifecycleObservation(observation)
            ? created > 0 &&
              active > 0 &&
              active === created - destroyed &&
              (!("requireActorOrigin" in observation) ||
                observation.requireActorOrigin !== true ||
                actorOriginCreations === created) &&
              (!requiresOwnedObjectTravel || simulatedDistanceTraveled > 0) &&
              (!("requireTargetInteraction" in observation) ||
                observation.requireTargetInteraction !== true ||
                targetInteractions > 0)
          : created > 0 &&
              (!("requireActorOrigin" in observation) ||
                observation.requireActorOrigin !== true ||
                actorOriginCreations === created) &&
              (!requiresOwnedObjectTravel || simulatedDistanceTraveled > 0) &&
              (!("requireTargetInteraction" in observation) ||
                observation.requireTargetInteraction !== true ||
                targetInteractions > 0) &&
              destroyed >= created &&
              entry.active === Number(beforeEntry.active);
      });
    return snapshotJson({
      kind: observation.kind,
      passed,
      actual: { before, after },
      assertion: observation,
    });
  }
  if (observation.kind !== "referenced_entity_motion_changed") {
    return observeExternalDeclared(runtime, observation);
  }

  const before = Array.isArray(baseline) ? baseline : [];
  const after = await Promise.all(
    observation.bindingIds.map(async (bindingId) => ({
      bindingId,
      position: await runtime.readBindingProperty(bindingId, "position"),
      velocity: await runtime.readBindingProperty(bindingId, "velocity"),
    }))
  );
  return snapshotJson({
    kind: observation.kind,
    passed:
      before.length === after.length &&
      observation.bindingIds.every((bindingId, index) => {
        const beforeEntry = before[index];
        const afterEntry = after[index];
        return (
          beforeEntry !== undefined &&
          afterEntry !== undefined &&
          typeof beforeEntry === "object" &&
          beforeEntry !== null &&
          !Array.isArray(beforeEntry) &&
          beforeEntry.bindingId === bindingId &&
          afterEntry.bindingId === bindingId &&
          !jsonEqual(beforeEntry, afterEntry)
        );
      }),
    actual: { before, after },
    assertion: observation,
  });
}

async function observeExternalDeclared(
  runtime: GeneratedMechanicEvaluationRuntime,
  observation: Exclude<
    ExternalAcceptanceObservationAssertion,
    | { kind: "referenced_entity_motion_changed" }
    | { kind: "owned_object_lifecycle_after_action" }
    | { kind: "owned_object_creation_after_action" }
    | { kind: "owned_object_lifecycle_progress_after_action" }
    | { kind: "owned_object_lifecycle_unchanged_after_action" }
    | { kind: "owned_object_lifecycle_after_install" }
    | { kind: "owned_object_creation_after_install" }
    | { kind: "owned_object_lifecycle_progress_after_install" }
    | { kind: "owned_object_lifecycle_unchanged_after_install" }
  >
): Promise<Omit<ExternalObservationEvidence, "id" | "source">> {
  const evidence = await observeDeclared(runtime, observation);
  return snapshotJson({
    kind: observation.kind,
    passed: evidence.passed,
    actual: evidence.actual,
    assertion: observation,
  });
}

async function captureExternalBaseline(
  runtime: GeneratedMechanicEvaluationRuntime,
  observation: ExternalAcceptanceObservationAssertion
): Promise<JsonValue> {
  if (isOwnedObjectLifecycleObservation(observation)) {
    if (!runtime.readOwnedObjectActivity) {
      throw new Error(
        "Evaluation runtime does not expose owned-object activity observations."
      );
    }
    return snapshotJson(
      await Promise.all(
        observation.archetypeIds.map(async (archetypeId) => ({
          archetypeId,
          ...(await runtime.readOwnedObjectActivity!(archetypeId)),
        }))
      )
    );
  }
  if (observation.kind !== "referenced_entity_motion_changed") {
    return null;
  }
  return snapshotJson(
    await Promise.all(
      observation.bindingIds.map(async (bindingId) => ({
        bindingId,
        position: await runtime.readBindingProperty(bindingId, "position"),
        velocity: await runtime.readBindingProperty(bindingId, "velocity"),
      }))
    )
  );
}

function isOwnedObjectLifecycleObservation(
  observation: ExternalAcceptanceObservationAssertion
): observation is Extract<ExternalAcceptanceObservationAssertion, { archetypeIds: readonly StableId[] }> {
  return "archetypeIds" in observation;
}

function isActionCausalExternalObservation(
  observation: ExternalAcceptanceObservationAssertion
): observation is Extract<ExternalAcceptanceObservationAssertion, { actionId: StableId }> {
  return observation.kind === "referenced_entity_motion_changed" ||
    observation.kind.endsWith("_after_action");
}

function isInstallCausalExternalObservation(
  observation: ExternalAcceptanceObservationAssertion
): observation is Extract<ExternalAcceptanceObservationAssertion, { kind: `${string}_after_install` }> {
  return observation.kind.endsWith("_after_install");
}

function isCausalExternalObservation(
  observation: ExternalAcceptanceObservationAssertion
): boolean {
  return isActionCausalExternalObservation(observation) ||
    isInstallCausalExternalObservation(observation);
}

function isUnchangedOwnedObjectLifecycleObservation(
  observation: Extract<ExternalAcceptanceObservationAssertion, { archetypeIds: readonly StableId[] }>
): boolean {
  return observation.kind.includes("lifecycle_unchanged");
}

function isCreationOwnedObjectLifecycleObservation(
  observation: Extract<ExternalAcceptanceObservationAssertion, { archetypeIds: readonly StableId[] }>
): boolean {
  return observation.kind.includes("object_creation");
}

function isProgressOwnedObjectLifecycleObservation(
  observation: Extract<ExternalAcceptanceObservationAssertion, { archetypeIds: readonly StableId[] }>
): boolean {
  return observation.kind.includes("lifecycle_progress");
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
