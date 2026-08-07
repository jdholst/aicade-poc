import type { JsonValue, StableId } from "@/game-spec/game-spec-schema";
import type { MechanicCapabilityGrant } from "@/game-spec/mechanics/mechanic-capability-registry";
import type {
  MechanicExecutionRealmExecutionInput,
  MechanicExecutionRealmExecutionResult,
  MechanicExecutionRealmResourceBudget,
} from "@/runtime/mechanics/mechanic-execution-realm";

export const SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION =
  "ses_worker_mechanic_execution_realm/v1";

export type SesWorkerRealmBindingDescriptor = {
  id: StableId;
  cardinality: "one" | "many";
  tokens: readonly StableId[];
};

export type SesWorkerRealmInitialize = {
  kind: "sparkline_mechanic_realm_initialize";
  protocolVersion: typeof SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION;
  realmId: StableId;
  mechanicId: StableId;
  capabilityGrant: MechanicCapabilityGrant;
  bindings: readonly SesWorkerRealmBindingDescriptor[];
  seed: number;
  resourceBudget: MechanicExecutionRealmResourceBudget;
  capabilityPort: MessagePort;
};

export type SesWorkerRealmExecute = {
  kind: "sparkline_mechanic_realm_execute";
  protocolVersion: typeof SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION;
  realmId: StableId;
  executionId: StableId;
  action: "execute" | "terminate";
  execution: MechanicExecutionRealmExecutionInput;
};

export type SesWorkerRealmExecutionResponse = {
  kind: "sparkline_mechanic_realm_execution_response";
  protocolVersion: typeof SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION;
  realmId: StableId;
  executionId: StableId;
  action: "execute" | "terminate";
  result: MechanicExecutionRealmExecutionResult;
};

export type SesWorkerRealmEncodedValue =
  | { kind: "json"; value: JsonValue }
  | { kind: "opaque_handle"; token: StableId }
  | { kind: "opaque_handles"; tokens: readonly StableId[] };

export type SesWorkerRealmCapabilityRequest = {
  kind: "sparkline_mechanic_realm_capability_request";
  protocolVersion: typeof SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION;
  realmId: StableId;
  executionId: StableId;
  callId: StableId;
  capabilityId: StableId;
  arguments: readonly SesWorkerRealmEncodedValue[];
};

export type SesWorkerRealmCapabilityResponse = {
  kind: "sparkline_mechanic_realm_capability_response";
  protocolVersion: typeof SES_WORKER_MECHANIC_EXECUTION_REALM_PROTOCOL_VERSION;
  realmId: StableId;
  executionId: StableId;
  callId: StableId;
  success: boolean;
  value?: SesWorkerRealmEncodedValue;
  error?: {
    code: StableId;
    message: string;
  };
};
