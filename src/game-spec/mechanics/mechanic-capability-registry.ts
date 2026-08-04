import type { StableId } from "../game-spec-schema";

export const MECHANIC_CAPABILITY_VERSION = "mechanic_capability/v1";

export type MechanicCapabilityConformanceRequirement =
  | "exact_grant"
  | "realm_only"
  | "deterministic"
  | "observable"
  | "resource_accounted";

export type MechanicCapabilityResourceCosts = {
  operationsPerTick: number;
  ownedObjects?: number;
  scheduledCallbacks?: number;
  subscriptions?: number;
  signalsPerTick?: number;
};

export type MechanicCapabilityDefinition = {
  id: StableId;
  description: string;
  authoring: {
    member: string;
    signature: string;
  };
  runtimeOperation: StableId;
  evaluation: {
    actions: readonly StableId[];
    observations: readonly StableId[];
    scenarioInputs?: readonly StableId[];
  };
  resourceCosts: MechanicCapabilityResourceCosts;
  requiresOpaqueHandle: boolean;
};

export type MechanicCapabilityRegistryVersion = {
  version: string;
  conformanceRequirements: readonly MechanicCapabilityConformanceRequirement[];
  capabilities: readonly MechanicCapabilityDefinition[];
};

export type MechanicCapabilityGrantEntry = MechanicCapabilityDefinition & {
  justification: {
    kind: "contract_declaration";
    path: string;
  };
};

export type MechanicCapabilityGrant = {
  capabilityVersion: string;
  capabilities: MechanicCapabilityGrantEntry[];
};

export type CreateMechanicCapabilityGrantInput = {
  contract: {
    capabilityVersion: string;
    capabilities: readonly StableId[];
  };
  constraintSet: {
    id: StableId;
    capabilityVersion: string;
    admittedCapabilities: readonly StableId[];
  };
};

export type MechanicCapabilityGrantIssue = {
  path: string;
  code:
    | "forbidden_capability"
    | "unknown_capability"
    | "version_mismatch";
  message: string;
};

export type MechanicCapabilityGrantResult =
  | {
      success: true;
      data: MechanicCapabilityGrant;
    }
  | {
      success: false;
      evidence: {
        stage: "capability_admission";
        code: "invalid_mechanic_capability_grant";
        issues: MechanicCapabilityGrantIssue[];
      };
    };

export type ValidateMechanicCapabilityUsageInput = {
  grant: MechanicCapabilityGrant;
  usedCapabilities: readonly StableId[];
};

export type MechanicCapabilityUsageIssue = {
  path: string;
  code: "undeclared_capability_use" | "unused_capability";
  message: string;
};

export type MechanicCapabilityUsageValidationResult =
  | {
      success: true;
      data: {
        grant: MechanicCapabilityGrant;
        usedCapabilities: readonly StableId[];
      };
    }
  | {
      success: false;
      evidence: {
        stage: "capability_usage_validation";
        code: "invalid_mechanic_capability_usage";
        issues: MechanicCapabilityUsageIssue[];
      };
    };

export const mechanicCapabilityRegistry = {
  version: MECHANIC_CAPABILITY_VERSION,
  conformanceRequirements: [
    "exact_grant",
    "realm_only",
    "deterministic",
    "observable",
    "resource_accounted",
  ],
  capabilities: [
    {
      id: "object_read",
      description: "Read an immutable observation through an opaque object handle.",
      authoring: {
        member: "objects.read",
        signature:
          "(handle: MechanicObjectHandle) => Readonly<MechanicObjectObservation>",
      },
      runtimeOperation: "object_read",
      evaluation: { actions: [], observations: ["binding_property"] },
      resourceCosts: { operationsPerTick: 1 },
      requiresOpaqueHandle: true,
    },
    {
      id: "object_create",
      description: "Create a declared mechanic-owned object from an admitted archetype.",
      authoring: {
        member: "objects.create",
        signature:
          "(archetypeId: MechanicOwnedObjectArchetypeId, initial: JsonValue) => MechanicObjectHandle",
      },
      runtimeOperation: "object_create",
      evaluation: { actions: [], observations: ["owned_object_count"] },
      resourceCosts: { operationsPerTick: 1, ownedObjects: 1 },
      requiresOpaqueHandle: false,
    },
    {
      id: "object_motion_write",
      description: "Apply a bounded position or velocity mutation through an opaque handle.",
      authoring: {
        member: "objects.writeMotion",
        signature:
          "(handle: MechanicObjectHandle, motion: MechanicMotionMutation) => void",
      },
      runtimeOperation: "object_motion_write",
      evaluation: { actions: [], observations: ["binding_property"] },
      resourceCosts: { operationsPerTick: 1 },
      requiresOpaqueHandle: true,
    },
    {
      id: "object_destroy",
      description: "Destroy a mechanic-owned object through its opaque handle.",
      authoring: {
        member: "objects.destroy",
        signature: "(handle: MechanicObjectHandle) => void",
      },
      runtimeOperation: "object_destroy",
      evaluation: { actions: [], observations: ["owned_object_count"] },
      resourceCosts: { operationsPerTick: 1 },
      requiresOpaqueHandle: true,
    },
    {
      id: "spatial_query",
      description: "Query bounded spatial relationships among admitted object handles.",
      authoring: {
        member: "objects.querySpatial",
        signature:
          "(query: MechanicSpatialQuery) => readonly MechanicObjectHandle[]",
      },
      runtimeOperation: "spatial_query",
      evaluation: { actions: [], observations: ["binding_property"] },
      resourceCosts: { operationsPerTick: 1 },
      requiresOpaqueHandle: false,
    },
    {
      id: "state_read",
      description: "Read a declared mechanic-private state value.",
      authoring: {
        member: "state.read",
        signature: "(stateId: MechanicStateId) => JsonValue",
      },
      runtimeOperation: "state_read",
      evaluation: { actions: [], observations: ["state_equals"] },
      resourceCosts: { operationsPerTick: 1 },
      requiresOpaqueHandle: false,
    },
    {
      id: "state_write",
      description: "Write a declared mechanic-private state value.",
      authoring: {
        member: "state.write",
        signature: "(stateId: MechanicStateId, value: JsonValue) => void",
      },
      runtimeOperation: "state_write",
      evaluation: { actions: [], observations: ["state_equals"] },
      resourceCosts: { operationsPerTick: 1 },
      requiresOpaqueHandle: false,
    },
    {
      id: "time_read",
      description: "Read Sparkline-owned deterministic simulation time.",
      authoring: {
        member: "time.now",
        signature: "() => MechanicSimulationMilliseconds",
      },
      runtimeOperation: "time_read",
      evaluation: { actions: ["advance_time"], observations: [] },
      resourceCosts: { operationsPerTick: 1 },
      requiresOpaqueHandle: false,
    },
    {
      id: "time_schedule",
      description: "Schedule a bounded callback against deterministic simulation time.",
      authoring: {
        member: "time.schedule",
        signature:
          "(delayMilliseconds: number, callbackId: MechanicCallbackId) => MechanicScheduleId",
      },
      runtimeOperation: "time_schedule",
      evaluation: { actions: ["advance_time"], observations: [] },
      resourceCosts: { operationsPerTick: 1, scheduledCallbacks: 1 },
      requiresOpaqueHandle: false,
    },
    {
      id: "random_next",
      description: "Read the next value from Sparkline-owned seeded randomness.",
      authoring: {
        member: "random.next",
        signature: "() => number",
      },
      runtimeOperation: "random_next",
      evaluation: {
        actions: [],
        observations: [],
        scenarioInputs: ["seed"],
      },
      resourceCosts: { operationsPerTick: 1 },
      requiresOpaqueHandle: false,
    },
    {
      id: "event_subscribe",
      description: "Subscribe to an admitted typed gameplay event.",
      authoring: {
        member: "events.subscribe",
        signature:
          "(eventId: MechanicEventId, callbackId: MechanicCallbackId) => MechanicSubscriptionId",
      },
      runtimeOperation: "event_subscribe",
      evaluation: { actions: ["receive_input"], observations: [] },
      resourceCosts: { operationsPerTick: 1, subscriptions: 1 },
      requiresOpaqueHandle: false,
    },
    {
      id: "signal_emit",
      description: "Emit a validated value through a declared output port.",
      authoring: {
        member: "signals.emit",
        signature: "(portId: MechanicPortId, value: JsonValue) => void",
      },
      runtimeOperation: "signal_emit",
      evaluation: { actions: [], observations: ["output_emitted"] },
      resourceCosts: { operationsPerTick: 1, signalsPerTick: 1 },
      requiresOpaqueHandle: false,
    },
  ],
} as const satisfies MechanicCapabilityRegistryVersion;

export function getMechanicCapabilityVersion(version: string) {
  return version === mechanicCapabilityRegistry.version
    ? mechanicCapabilityRegistry
    : undefined;
}

export function createMechanicCapabilityGrant({
  contract,
  constraintSet,
}: CreateMechanicCapabilityGrantInput): MechanicCapabilityGrantResult {
  const version = getMechanicCapabilityVersion(contract.capabilityVersion);
  const admittedCapabilities = new Set(constraintSet.admittedCapabilities);
  const definitionsById = new Map<StableId, MechanicCapabilityDefinition>(
    version?.capabilities.map((definition) => [definition.id, definition]) ?? []
  );
  const issues: MechanicCapabilityGrantIssue[] = [];
  const capabilities: MechanicCapabilityGrantEntry[] = [];

  if (contract.capabilityVersion !== constraintSet.capabilityVersion) {
    issues.push({
      path: "capabilityVersion",
      code: "version_mismatch",
      message: `Contract capability version "${contract.capabilityVersion}" does not match active version "${constraintSet.capabilityVersion}".`,
    });
  }

  contract.capabilities.forEach((capabilityId, contractIndex) => {
    const definition = definitionsById.get(capabilityId);

    if (!definition) {
      issues.push({
        path: `capabilities.${contractIndex}`,
        code: "unknown_capability",
        message: `Capability "${capabilityId}" is not present in Mechanic Capability Version "${contract.capabilityVersion}".`,
      });
      return;
    }

    if (!admittedCapabilities.has(capabilityId)) {
      issues.push({
        path: `capabilities.${contractIndex}`,
        code: "forbidden_capability",
        message: `Capability "${capabilityId}" is not admitted by Generation Constraint Set "${constraintSet.id}".`,
      });
      return;
    }

    capabilities.push({
      ...definition,
      justification: {
        kind: "contract_declaration",
        path: `capabilities.${contractIndex}`,
      },
    });
  });

  if (issues.length > 0) {
    return {
      success: false,
      evidence: {
        stage: "capability_admission",
        code: "invalid_mechanic_capability_grant",
        issues,
      },
    };
  }

  return {
    success: true,
    data: {
      capabilityVersion: contract.capabilityVersion,
      capabilities,
    },
  };
}

export function validateMechanicCapabilityUsage({
  grant,
  usedCapabilities,
}: ValidateMechanicCapabilityUsageInput): MechanicCapabilityUsageValidationResult {
  const grantedCapabilityIds = new Set(
    grant.capabilities.map((capability) => capability.id)
  );
  const usedCapabilityIds = new Set(usedCapabilities);
  const issues: MechanicCapabilityUsageIssue[] = [];

  usedCapabilities.forEach((capabilityId, index) => {
    if (!grantedCapabilityIds.has(capabilityId)) {
      issues.push({
        path: `usedCapabilities.${index}`,
        code: "undeclared_capability_use",
        message: `Capability "${capabilityId}" is used by source but is absent from the exact grant.`,
      });
    }
  });

  grant.capabilities.forEach((capability, index) => {
    if (!usedCapabilityIds.has(capability.id)) {
      issues.push({
        path: `grant.capabilities.${index}`,
        code: "unused_capability",
        message: `Granted capability "${capability.id}" has no verified source use and would provide unjustified authority.`,
      });
    }
  });

  if (issues.length > 0) {
    return {
      success: false,
      evidence: {
        stage: "capability_usage_validation",
        code: "invalid_mechanic_capability_usage",
        issues,
      },
    };
  }

  return {
    success: true,
    data: {
      grant,
      usedCapabilities,
    },
  };
}
