import {
  createContainedMechanicRuntime,
  type ContainedMechanicRuntime,
  type CreateContainedMechanicRuntimeInput,
} from "./contained-mechanic-runtime";
import { PHASE_9_MECHANIC_RESOURCE_BUDGET } from "./phase-9-mechanic-resource-policy";

export { PHASE_9_MECHANIC_RESOURCE_BUDGET } from "./phase-9-mechanic-resource-policy";

export type CreatePhase9ContainedMechanicRuntimeInput = Omit<
  CreateContainedMechanicRuntimeInput,
  "resourceBudget"
>;

export function createPhase9ContainedMechanicRuntime(
  input: CreatePhase9ContainedMechanicRuntimeInput
): ContainedMechanicRuntime {
  return createContainedMechanicRuntime({
    ...input,
    resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
  });
}
