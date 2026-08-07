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

export type MechanicExecutionRealmExecutionResult = {
  executionId: StableId;
  outcome: "completed" | "terminated" | "resource_limit" | "failed";
  durationMilliseconds?: number;
  output?: JsonValue;
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
