import type { MechanicExecutionRealmResourceBudget } from "./mechanic-execution-realm";

export const PHASE_9_MECHANIC_RESOURCE_BUDGET = Object.freeze({
  profileId: "phase_9_fixed_budget",
  maximumOwnedObjects: 4,
  maximumOperationsPerTick: 16,
  maximumScheduledCallbacks: 4,
  maximumSubscriptions: 4,
  maximumSignalsPerTick: 8,
  maximumStateBytes: 1024,
  maximumCallbackMilliseconds: 8,
  maximumConsecutiveFailures: 3,
} as const satisfies MechanicExecutionRealmResourceBudget);
