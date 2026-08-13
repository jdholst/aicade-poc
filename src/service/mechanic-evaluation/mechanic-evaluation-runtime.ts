import {
  createGeneratedMechanicLifecycleProgram,
} from "@/runtime/mechanics/generated-mechanic-lifecycle-program";
import {
  createMechanicLifecycleServices,
} from "@/runtime/mechanics/mechanic-lifecycle";
import type {
  MechanicExecutionRealmAdapter,
  MechanicExecutionRealmBinding,
  MechanicExecutionRealmCapabilityHost,
  MechanicExecutionRealmExecutionResult,
  MechanicExecutionRealmResourceBudget,
} from "@/runtime/mechanics/mechanic-execution-realm";
import type {
  CreateGeneratedMechanicEvaluationRuntimeInput,
  GeneratedMechanicEvaluationRuntime,
  GeneratedMechanicEvaluationRuntimeFactory,
} from "./mechanic-evaluation";

type EvaluationObservations = Pick<
  GeneratedMechanicEvaluationRuntime,
  | "hasBinding"
  | "readDeclaredState"
  | "readBindingProperty"
  | "countOwnedObjects"
  | "readEmittedOutputs"
>;

export type GeneratedMechanicEvaluationFixture = Readonly<{
  bindings: readonly MechanicExecutionRealmBinding[];
  capabilityHost: MechanicExecutionRealmCapabilityHost;
  observations: EvaluationObservations;
  fixedStepIntervalMilliseconds?: number;
  dispose(): Promise<void>;
}>;

export type CreateGeneratedMechanicEvaluationFixture = (
  input: CreateGeneratedMechanicEvaluationRuntimeInput
) => Promise<GeneratedMechanicEvaluationFixture>;

export type CreateGeneratedMechanicLifecycleEvaluationRuntimeFactoryInput =
  Readonly<{
    realmAdapter: MechanicExecutionRealmAdapter;
    resourceBudget: MechanicExecutionRealmResourceBudget;
    createFixture: CreateGeneratedMechanicEvaluationFixture;
  }>;

export function createGeneratedMechanicLifecycleEvaluationRuntimeFactory({
  realmAdapter,
  resourceBudget,
  createFixture,
}: CreateGeneratedMechanicLifecycleEvaluationRuntimeFactoryInput): GeneratedMechanicEvaluationRuntimeFactory {
  const admittedResourceBudget = snapshotJson(resourceBudget);

  return async (input) => {
    const fixture = await createFixture(snapshotJson(input));
    let lifecycle:
      | Awaited<ReturnType<typeof createMechanicLifecycleServices>>
      | undefined;
    try {
      const program = createGeneratedMechanicLifecycleProgram({
        contract: input.contract,
        sourceArtifact: input.artifact,
        config: input.config,
        fixedStepIntervalMilliseconds: fixture.fixedStepIntervalMilliseconds,
      });
      lifecycle = await createMechanicLifecycleServices({
        createRealm: ({
          capabilityHost,
          capabilityGrant,
          resourceBudget: lifecycleResourceBudget,
          seed,
        }) =>
          realmAdapter.create({
            mechanicId: input.contract.id,
            capabilityGrant,
            bindings: fixture.bindings,
            capabilityHost,
            seed,
            resourceBudget: lifecycleResourceBudget,
          }),
        delegateCapabilityHost: fixture.capabilityHost,
        capabilityGrant: input.artifact.grant,
        program,
        seed: input.seed,
        resourceBudget: admittedResourceBudget,
      });
    } catch (error) {
      await fixture.dispose();
      throw error;
    }

    let disposed = false;
    const installedLifecycle = lifecycle;
    return Object.freeze({
      sourceArtifactId: input.artifact.id,
      ...fixture.observations,
      install: async () => {
        requireCompleted(await installedLifecycle.install(), "install");
      },
      receiveInput: async (portId, value) => {
        requireAllCompleted(
          await installedLifecycle.dispatchGameplayEvent(
            portId,
            snapshotJson(value)
          ),
          "gameplay event"
        );
      },
      dispatchAction: async (actionId) => {
        requireAllCompleted(
          await installedLifecycle.dispatchLogicalAction(actionId),
          "logical action"
        );
      },
      advanceTime: async (milliseconds) => {
        requireAllCompleted(
          await installedLifecycle.advanceSimulation(milliseconds),
          "simulation advancement"
        );
      },
      dispose: async () => {
        if (disposed) {
          return;
        }
        disposed = true;
        let lifecycleError: unknown;
        try {
          const result = await installedLifecycle.dispose();
          if (result) {
            requireCompleted(result, "dispose");
          }
        } catch (error) {
          lifecycleError = error;
        }
        try {
          await fixture.dispose();
        } catch (error) {
          if (lifecycleError === undefined) {
            throw error;
          }
        }
        if (lifecycleError !== undefined) {
          throw lifecycleError;
        }
      },
    });
  };
}

function requireAllCompleted(
  results: readonly MechanicExecutionRealmExecutionResult[],
  label: string
): void {
  for (const result of results) {
    requireCompleted(result, label);
  }
}

function requireCompleted(
  result: MechanicExecutionRealmExecutionResult,
  label: string
): void {
  if (result.outcome !== "completed") {
    throw new Error(
      result.diagnostic?.message ??
        `Mechanic evaluation ${label} failed with outcome "${result.outcome}".`
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
