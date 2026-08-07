import type { JsonValue, StableId } from "@/game-spec/game-spec-schema";
import type { MechanicCapabilityGrant } from "@/game-spec/mechanics/mechanic-capability-registry";
import type { MechanicObjectHandle } from "@/runtime/mechanics/mechanic-object-host";

export const MECHANIC_EXECUTION_REALM_ADAPTER_VERSION =
  "mechanic_execution_realm_adapter/v1";

export type MechanicExecutionRealmResourceDimension =
  | "owned_objects"
  | "operations_per_tick"
  | "scheduled_callbacks"
  | "subscriptions"
  | "signals_per_tick"
  | "state_bytes"
  | "callback_milliseconds"
  | "consecutive_failures";

export type MechanicExecutionRealmResourceBudget = {
  profileId: "phase_9_fixed_budget";
  maximumOwnedObjects: number;
  maximumOperationsPerTick: number;
  maximumScheduledCallbacks: number;
  maximumSubscriptions: number;
  maximumSignalsPerTick: number;
  maximumStateBytes: number;
  maximumCallbackMilliseconds: number;
  maximumConsecutiveFailures: number;
};

export type MechanicExecutionRealmResourceUsage = Readonly<{
  dimension: MechanicExecutionRealmResourceDimension;
  limit: number;
  observed: number;
}>;

const MECHANIC_EXECUTION_REALM_RESOURCE_DIMENSIONS = new Set<string>([
  "owned_objects",
  "operations_per_tick",
  "scheduled_callbacks",
  "subscriptions",
  "signals_per_tick",
  "state_bytes",
  "callback_milliseconds",
  "consecutive_failures",
]);

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

export function assertPhase9MechanicResourceBudget(
  budget: MechanicExecutionRealmResourceBudget
): void {
  for (const key of Object.keys(
    PHASE_9_MECHANIC_RESOURCE_BUDGET
  ) as Array<keyof MechanicExecutionRealmResourceBudget>) {
    if (budget[key] !== PHASE_9_MECHANIC_RESOURCE_BUDGET[key]) {
      throw new Error(
        `Contained mechanics require the fixed Phase 9 resource budget. "${key}" was altered.`
      );
    }
  }
}

export class MechanicExecutionRealmResourceLimitError extends Error {
  override readonly name = "MechanicExecutionRealmResourceLimitError";

  constructor(
    readonly dimension: MechanicExecutionRealmResourceDimension,
    readonly limit: number,
    readonly observed: number
  ) {
    super(`Resource ${dimension} exceeded ${limit} with ${observed}.`);
  }
}

export function isMechanicExecutionRealmResourceUsage(
  value: unknown
): value is MechanicExecutionRealmResourceUsage {
  return (
    typeof value === "object" &&
    value !== null &&
    "dimension" in value &&
    MECHANIC_EXECUTION_REALM_RESOURCE_DIMENSIONS.has(String(value.dimension)) &&
    "limit" in value &&
    typeof value.limit === "number" &&
    Number.isFinite(value.limit) &&
    value.limit >= 0 &&
    "observed" in value &&
    typeof value.observed === "number" &&
    Number.isFinite(value.observed) &&
    value.observed > value.limit
  );
}

export type MechanicExecutionRealmDiagnostic = {
  stage: "realm_start" | "realm_execution" | "realm_termination" | "cleanup";
  code: StableId;
  message: string;
  repair?: {
    artifact: "realm_candidate";
    issuePath: string;
    suggestedAction: string;
  };
};

export type MechanicExecutionRealmBinding = {
  id: StableId;
  cardinality: "one" | "many";
  handles: readonly MechanicObjectHandle[];
};

export type MechanicExecutionRealmCapabilityArgument =
  | JsonValue
  | MechanicObjectHandle;

export type MechanicExecutionRealmCapabilityResult =
  | { kind: "json"; value: JsonValue }
  | { kind: "opaque_handle"; value: MechanicObjectHandle }
  | { kind: "opaque_handles"; value: readonly MechanicObjectHandle[] };

export type MechanicExecutionRealmCapabilityHost = {
  invoke(input: {
    capabilityId: StableId;
    arguments: readonly MechanicExecutionRealmCapabilityArgument[];
  }):
    | MechanicExecutionRealmCapabilityResult
    | Promise<MechanicExecutionRealmCapabilityResult>;
};

export type CreateMechanicExecutionRealmInput = {
  mechanicId: StableId;
  capabilityGrant: MechanicCapabilityGrant;
  bindings: readonly MechanicExecutionRealmBinding[];
  capabilityHost: MechanicExecutionRealmCapabilityHost;
  seed: number;
  resourceBudget: MechanicExecutionRealmResourceBudget;
};

export type MechanicExecutionRealmExecutionInput = {
  id: StableId;
  source: string;
  lifecycle?: {
    callbacks: ReadonlyArray<{ id: StableId; source: string }>;
    invocations: ReadonlyArray<{ callbackId: StableId; count: number }>;
  };
};

export type MechanicExecutionRealmCallbackReference = Readonly<{
  id: StableId;
  kind:
    | "install"
    | "logical_action"
    | "gameplay_event"
    | "scheduled"
    | "fixed_step"
    | "dispose";
}>;

export type MechanicExecutionRealmExecutionResult = {
  executionId: StableId;
  outcome: "completed" | "terminated" | "resource_limit" | "failed";
  durationMilliseconds?: number;
  output?: JsonValue;
  callback?: MechanicExecutionRealmCallbackReference;
  resourceUsage?: MechanicExecutionRealmResourceUsage;
  diagnostic?: MechanicExecutionRealmDiagnostic;
};

export type MechanicExecutionRealmRun = {
  result: Promise<MechanicExecutionRealmExecutionResult>;
  terminate(): Promise<MechanicExecutionRealmExecutionResult>;
};

export type MechanicExecutionRealm = {
  execute(input: MechanicExecutionRealmExecutionInput): MechanicExecutionRealmRun;
  dispose(): void;
};

export type MechanicExecutionRealmAdapter = {
  readonly adapterVersion: typeof MECHANIC_EXECUTION_REALM_ADAPTER_VERSION;
  readonly id: StableId;
  create(
    input: CreateMechanicExecutionRealmInput
  ): Promise<MechanicExecutionRealm>;
};
