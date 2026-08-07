import {
  STABLE_ID_PATTERN,
  type JsonValue,
  type StableId,
} from "@/game-spec/game-spec-schema";
import type { MechanicCapabilityGrant } from "@/game-spec/mechanics/mechanic-capability-registry";
import {
  MechanicExecutionRealmResourceLimitError,
  type MechanicExecutionRealmCapabilityHost,
  type MechanicExecutionRealmCapabilityResult,
  type MechanicExecutionRealmResourceBudget,
} from "./mechanic-execution-realm";

export type MechanicPrivateStateDeclaration = {
  id: StableId;
  valueType: "boolean" | "number" | "integer" | "string" | "stable_id";
  initialValue: JsonValue;
};

export type CreateMechanicPrivateStateHostInput = {
  grant: MechanicCapabilityGrant;
  declarations: readonly MechanicPrivateStateDeclaration[];
  resourceBudget: MechanicExecutionRealmResourceBudget;
};

export type MechanicPrivateStateHost = {
  readonly usedBytes: number;
  readonly resourceBudget: Readonly<MechanicExecutionRealmResourceBudget>;
  createCapabilityHost(
    delegate: MechanicExecutionRealmCapabilityHost
  ): MechanicExecutionRealmCapabilityHost;
  dispose(): void;
};

type PrivateStateEntry = {
  declaration: MechanicPrivateStateDeclaration;
  value: JsonValue;
  bytes: number;
};

export function createMechanicPrivateStateHost({
  grant,
  declarations,
  resourceBudget,
}: CreateMechanicPrivateStateHostInput): MechanicPrivateStateHost {
  const admittedResourceBudget = Object.freeze({ ...resourceBudget });
  const maximumStateBytes = admittedResourceBudget.maximumStateBytes;
  if (!Number.isInteger(maximumStateBytes) || maximumStateBytes < 0) {
    throw new TypeError("Maximum mechanic private-state bytes must be nonnegative.");
  }
  const grantedCapabilities = new Set(
    grant.capabilities.map((capability) => capability.id)
  );
  const entries = new Map<StableId, PrivateStateEntry>();
  let active = true;
  let usedBytes = 0;

  for (const declaration of declarations) {
    if (entries.has(declaration.id)) {
      throw new Error(
        `Mechanic private state "${declaration.id}" was declared twice.`
      );
    }
    const value = validateStateValue(declaration, declaration.initialValue);
    const bytes = measureJsonBytes(value);
    usedBytes += bytes;
    if (usedBytes > maximumStateBytes) {
      throw new MechanicExecutionRealmResourceLimitError(
        "state_bytes",
        maximumStateBytes,
        usedBytes
      );
    }
    entries.set(declaration.id, {
      declaration: Object.freeze({ ...declaration, initialValue: value }),
      value,
      bytes,
    });
  }

  const requireActive = () => {
    if (!active) {
      throw new Error("Mechanic private state host has been disposed.");
    }
  };

  const requireGranted = (capabilityId: "state_read" | "state_write") => {
    if (!grantedCapabilities.has(capabilityId)) {
      throw new Error(`Mechanic capability "${capabilityId}" was not granted.`);
    }
  };

  const requireEntry = (stateId: unknown): PrivateStateEntry => {
    if (typeof stateId !== "string") {
      throw new TypeError("Mechanic private state ID must be a string.");
    }
    const entry = entries.get(stateId);
    if (!entry) {
      throw new Error(`Mechanic private state "${stateId}" is undeclared.`);
    }
    return entry;
  };

  const createCapabilityHost = (
    delegate: MechanicExecutionRealmCapabilityHost
  ): MechanicExecutionRealmCapabilityHost => ({
    invoke: ({ capabilityId, arguments: capabilityArguments }) => {
      requireActive();
      if (capabilityId === "state_read") {
        requireGranted(capabilityId);
        return jsonResult(requireEntry(capabilityArguments[0]).value);
      }
      if (capabilityId === "state_write") {
        requireGranted(capabilityId);
        const entry = requireEntry(capabilityArguments[0]);
        const value = validateStateValue(
          entry.declaration,
          capabilityArguments[1]
        );
        const bytes = measureJsonBytes(value);
        const nextUsedBytes = usedBytes - entry.bytes + bytes;
        if (nextUsedBytes > maximumStateBytes) {
          throw new MechanicExecutionRealmResourceLimitError(
            "state_bytes",
            maximumStateBytes,
            nextUsedBytes
          );
        }
        entry.value = value;
        entry.bytes = bytes;
        usedBytes = nextUsedBytes;
        return jsonResult(null);
      }
      return delegate.invoke({
        capabilityId,
        arguments: capabilityArguments,
      });
    },
  });

  return Object.freeze({
    resourceBudget: admittedResourceBudget,
    get usedBytes() {
      return usedBytes;
    },
    createCapabilityHost,
    dispose: () => {
      if (!active) {
        return;
      }
      active = false;
      entries.clear();
      grantedCapabilities.clear();
      usedBytes = 0;
    },
  });
}

function validateStateValue(
  declaration: MechanicPrivateStateDeclaration,
  value: unknown
): JsonValue {
  const valid =
    declaration.valueType === "boolean"
      ? typeof value === "boolean"
      : declaration.valueType === "number"
        ? typeof value === "number" && Number.isFinite(value)
        : declaration.valueType === "integer"
          ? typeof value === "number" && Number.isInteger(value)
          : declaration.valueType === "stable_id"
            ? typeof value === "string" && STABLE_ID_PATTERN.test(value)
            : typeof value === "string";
  if (!valid) {
    throw new TypeError(
      `Mechanic private state "${declaration.id}" requires a ${declaration.valueType} value.`
    );
  }
  return value as JsonValue;
}

function measureJsonBytes(value: JsonValue): number {
  if (typeof value === "string") {
    return new TextEncoder().encode(value).byteLength;
  }
  const serialized = JSON.stringify(value);
  return serialized === undefined
    ? 0
    : new TextEncoder().encode(serialized).byteLength;
}

function jsonResult(value: JsonValue): MechanicExecutionRealmCapabilityResult {
  return { kind: "json", value };
}
