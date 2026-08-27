import { describe, expect, it, vi } from "vitest";

import { mechanicCapabilityRegistry } from "@/game-spec/mechanics/mechanic-capability-registry";
import { MechanicExecutionRealmResourceLimitError } from "./mechanic-execution-realm";
import { createMechanicPrivateStateHost } from "./mechanic-private-state";

describe("Mechanic private state host", () => {
  it("owns declared runtime state and enforces its cumulative byte budget transactionally", async () => {
    const delegate = {
      invoke: vi.fn(async () => ({ kind: "json" as const, value: null })),
    };
    const state = createMechanicPrivateStateHost({
      grant: createStateGrant(),
      declarations: [
        { id: "counter", valueType: "integer", initialValue: 0 },
        { id: "label", valueType: "string", initialValue: "ok" },
      ],
      resourceBudget: {
        ...createResourceBudget(),
        maximumStateBytes: 6,
      },
    });
    const host = state.createCapabilityHost(delegate);

    expect(
      await host.invoke({ capabilityId: "state_read", arguments: ["counter"] })
    ).toEqual({ kind: "json", value: 0 });
    expect(
      await host.invoke({
        capabilityId: "state_write",
        arguments: ["counter", 12],
      })
    ).toEqual({ kind: "json", value: null });
    expect(state.usedBytes).toBe(4);

    const overLimit = Promise.resolve().then(() =>
      host.invoke({
        capabilityId: "state_write",
        arguments: ["label", "12345"],
      })
    );

    await expect(overLimit).rejects.toMatchObject({
      name: "MechanicExecutionRealmResourceLimitError",
      dimension: "state_bytes",
      limit: 6,
      observed: 7,
    });
    expect(
      await host.invoke({ capabilityId: "state_read", arguments: ["label"] })
    ).toEqual({ kind: "json", value: "ok" });
    expect(state.readDeclaredState("counter")).toBe(12);
    expect(state.usedBytes).toBe(4);
    expect(delegate.invoke).not.toHaveBeenCalled();

    state.dispose();

    expect(state.usedBytes).toBe(0);
    expect(() => state.readDeclaredState("counter")).toThrow(
      "Mechanic private state host has been disposed."
    );
    await expect(
      Promise.resolve().then(() =>
        host.invoke({ capabilityId: "state_read", arguments: ["counter"] })
      )
    ).rejects.toThrow("Mechanic private state host has been disposed.");
  });

  it("exports a typed resource error that preserves exact budget measurements", () => {
    const error = new MechanicExecutionRealmResourceLimitError(
      "state_bytes",
      6,
      7
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Resource state_bytes exceeded 6 with 7.");
  });

  it("rejects a private stable ID value that violates the shared ID contract", () => {
    const state = createMechanicPrivateStateHost({
      grant: createStateGrant(),
      declarations: [
        { id: "target_id", valueType: "stable_id", initialValue: "valid_target" },
      ],
      resourceBudget: {
        ...createResourceBudget(),
        maximumStateBytes: 64,
      },
    });
    const host = state.createCapabilityHost({
      invoke: vi.fn(async () => ({ kind: "json" as const, value: null })),
    });

    expect(() =>
      host.invoke({
        capabilityId: "state_write",
        arguments: ["target_id", "Not A Stable ID"],
      })
    ).toThrow(
      'Mechanic private state "target_id" requires a stable_id value.'
    );
  });
});

function createStateGrant() {
  return {
    capabilityVersion: mechanicCapabilityRegistry.version,
    capabilities: ["state_read", "state_write"].map((capabilityId, index) => ({
      ...mechanicCapabilityRegistry.capabilities.find(
        (capability) => capability.id === capabilityId
      )!,
      justification: {
        kind: "contract_declaration" as const,
        path: `capabilities.${index}`,
      },
    })),
  };
}

function createResourceBudget() {
  return {
    profileId: "phase_9_fixed_budget" as const,
    maximumOwnedObjects: 4,
    maximumOperationsPerTick: 16,
    maximumScheduledCallbacks: 4,
    maximumSubscriptions: 4,
    maximumSignalsPerTick: 8,
    maximumStateBytes: 1024,
    maximumCallbackMilliseconds: 8,
    maximumConsecutiveFailures: 3,
  };
}
