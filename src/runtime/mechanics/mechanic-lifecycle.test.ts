import { describe, expect, it, vi } from "vitest";

import { mechanicCapabilityRegistry } from "@/game-spec/mechanics/mechanic-capability-registry";
import type {
  MechanicExecutionRealm,
  MechanicExecutionRealmCapabilityHost,
  MechanicExecutionRealmExecutionInput,
  MechanicExecutionRealmExecutionResult,
  MechanicExecutionRealmRun,
} from "./mechanic-execution-realm";
import { MechanicExecutionRealmResourceLimitError } from "./mechanic-execution-realm";
import {
  createMechanicLifecycleServices,
  type MechanicLifecycleProgram,
} from "./mechanic-lifecycle";

describe("Mechanic lifecycle services", () => {
  it("drives install, actions, events, scheduled work, fixed steps, and disposal in host order", async () => {
    const realm = new RecordingRealm();
    const lifecycle = await createLifecycle(
      realm,
      41,
      createProgram({
        fixedStep: { callbackId: "fixed_step", intervalMilliseconds: 10 },
      })
    );
    const host = lifecycle.capabilityHost;

    const installResult = await lifecycle.install();
    await host.invoke({
      capabilityId: "time_schedule",
      arguments: [5, "scheduled"],
    });
    await lifecycle.dispatchLogicalAction("jump", { amount: 2 });
    await host.invoke({
      capabilityId: "event_subscribe",
      arguments: ["enemy_hit", "gameplay_event"],
    });
    await lifecycle.dispatchGameplayEvent("enemy_hit", { damage: 3 });
    await lifecycle.advanceSimulation(25);
    await lifecycle.dispose();

    expect(installResult.callback).toEqual({ id: "install", kind: "install" });

    expect(realm.executionIds()).toEqual([
      "mechanic_install",
      "mechanic_action_1",
      "mechanic_event_2",
      "mechanic_scheduled_3",
      "mechanic_fixed_step_4",
      "mechanic_fixed_step_5",
      "mechanic_dispose",
    ]);
    expect(realm.callbackIds()).toEqual([
      "install",
      "logical_action",
      "gameplay_event",
      "scheduled",
      "fixed_step",
      "fixed_step",
      "dispose",
    ]);
    expect(lifecycle.simulationTimeMilliseconds).toBe(25);
  });

  it("replays actions, events, scheduling, clock, and seeded randomness identically", async () => {
    const run = async () => {
      const realm = new RecordingRealm();
      const lifecycle = await createLifecycle(realm, 1729, createProgram());
      const host = lifecycle.capabilityHost;

      const firstTime = await host.invoke({
        capabilityId: "time_read",
        arguments: [],
      });
      const firstRandom = await host.invoke({
        capabilityId: "random_next",
        arguments: [],
      });
      await lifecycle.install();
      await host.invoke({
        capabilityId: "event_subscribe",
        arguments: ["enemy_hit", "gameplay_event"],
      });
      await host.invoke({
        capabilityId: "time_schedule",
        arguments: [8, "scheduled"],
      });
      await lifecycle.dispatchLogicalAction("jump", { amount: 2 });
      await lifecycle.dispatchGameplayEvent("enemy_hit", { damage: 3 });
      await lifecycle.advanceSimulation(16);
      const secondTime = await host.invoke({
        capabilityId: "time_read",
        arguments: [],
      });
      const secondRandom = await host.invoke({
        capabilityId: "random_next",
        arguments: [],
      });

      return {
        firstTime,
        firstRandom,
        secondTime,
        secondRandom,
        callbacks: realm.callbackIds(),
        executions: realm.executionIds(),
      };
    };

    await expect(run()).resolves.toEqual(await run());
  });

  it("cancels registrations after callback failure and disposes the realm", async () => {
    const realm = new RecordingRealm({ failCallbackId: "logical_action" });
    const lifecycle = await createLifecycle(realm, 7, createProgram());
    const host = lifecycle.capabilityHost;

    await lifecycle.install();
    await host.invoke({
      capabilityId: "time_schedule",
      arguments: [0, "scheduled"],
    });
    await host.invoke({
      capabilityId: "event_subscribe",
      arguments: ["enemy_hit", "gameplay_event"],
    });
    await lifecycle.dispatchLogicalAction("jump");

    expect(lifecycle.state).toBe("failed");
    await expect(lifecycle.advanceSimulation(10)).resolves.toEqual([]);
    await expect(lifecycle.dispatchGameplayEvent("enemy_hit")).resolves.toEqual(
      []
    );
    expect(realm.disposed).toBe(true);
  });

  it("terminates an active callback before disposal completes", async () => {
    const realm = new RecordingRealm({ pendingCallbackId: "logical_action" });
    const lifecycle = await createLifecycle(realm, 7, createProgram());

    await lifecycle.install();
    const action = lifecycle.dispatchLogicalAction("jump");
    await realm.pendingStarted;

    await lifecycle.dispose();

    await expect(action).resolves.toEqual([
      {
        executionId: "mechanic_action_1",
        outcome: "terminated",
        callback: { id: "logical_action", kind: "logical_action" },
      },
    ]);
    expect(realm.terminateCalls).toBe(1);
    expect(realm.disposed).toBe(true);
  });

  it("returns a controlled dispose callback failure after cleanup completes", async () => {
    const realm = new RecordingRealm({ failCallbackId: "dispose" });
    const lifecycle = await createLifecycle(realm, 7, createProgram());

    await lifecycle.install();
    const result = await lifecycle.dispose();

    expect(result).toMatchObject({
      executionId: "mechanic_dispose",
      outcome: "failed",
      diagnostic: {
        code: "recording_failure",
      },
    });
    expect(lifecycle.state).toBe("disposed");
    expect(lifecycle.pendingScheduledCallbackCount).toBe(0);
    expect(lifecycle.activeSubscriptionCount).toBe(0);
    expect(realm.disposed).toBe(true);
  });

  it("rejects lifecycle capability registrations that are not declared", async () => {
    const lifecycle = await createLifecycle(
      new RecordingRealm(),
      7,
      createProgram()
    );
    const host = lifecycle.capabilityHost;

    await expect(
      host.invoke({
        capabilityId: "time_schedule",
        arguments: [0, "missing_callback"],
      })
    ).rejects.toThrow('Lifecycle callback "missing_callback" is not declared.');
  });

  it.each([
    {
      capabilityId: "time_schedule",
      arguments: [0, "scheduled"],
      dimension: "scheduled_callbacks",
    },
    {
      capabilityId: "event_subscribe",
      arguments: ["enemy_hit", "gameplay_event"],
      dimension: "subscriptions",
    },
  ] as const)(
    "reports cumulative $dimension violations with exact measurements",
    async ({ capabilityId, arguments: capabilityArguments, dimension }) => {
      const lifecycle = await createLifecycle(
        new RecordingRealm(),
        7,
        createProgram()
      );
      await lifecycle.install();

      for (let index = 0; index < 4; index += 1) {
        await lifecycle.capabilityHost.invoke({
          capabilityId,
          arguments: capabilityArguments,
        });
      }

      await expect(
        lifecycle.capabilityHost.invoke({
          capabilityId,
          arguments: capabilityArguments,
        })
      ).rejects.toMatchObject({
        name: "MechanicExecutionRealmResourceLimitError",
        dimension,
        limit: 4,
        observed: 5,
      });
    }
  );

  it.each([
    {
      dimension: "operations_per_tick" as const,
      capabilityId: "time_read",
      maximumOperationsPerTick: 3,
      maximumSignalsPerTick: 4,
      invocationsPerCallback: 2,
    },
    {
      dimension: "signals_per_tick" as const,
      capabilityId: "signal_emit",
      maximumOperationsPerTick: 16,
      maximumSignalsPerTick: 1,
      invocationsPerCallback: 1,
    },
  ])(
    "aggregates $dimension across callbacks in one host-controlled step",
    async ({
      dimension,
      capabilityId,
      maximumOperationsPerTick,
      maximumSignalsPerTick,
      invocationsPerCallback,
    }) => {
      let capabilityHost: MechanicExecutionRealmCapabilityHost | undefined;
      const delegate = {
        invoke: vi.fn(async () => ({ kind: "json" as const, value: null })),
      };
      const realm: MechanicExecutionRealm = {
        execute: (input) => ({
          result: Promise.resolve().then(async () => {
            const callbackId = input.lifecycle?.invocations[0]?.callbackId;
            if (callbackId === "gameplay_event") {
              try {
                for (let index = 0; index < invocationsPerCallback; index += 1) {
                  await capabilityHost?.invoke({
                    capabilityId,
                    arguments:
                      capabilityId === "signal_emit" ? ["out", null] : [],
                  });
                }
              } catch (error) {
                if (error instanceof MechanicExecutionRealmResourceLimitError) {
                  return {
                    executionId: input.id,
                    outcome: "resource_limit" as const,
                    resourceUsage: {
                      dimension: error.dimension,
                      limit: error.limit,
                      observed: error.observed,
                    },
                  };
                }
                throw error;
              }
            }
            return { executionId: input.id, outcome: "completed" as const };
          }),
          terminate: async () => ({
            executionId: input.id,
            outcome: "terminated" as const,
          }),
        }),
        dispose: vi.fn(),
      };
      const lifecycle = await createMechanicLifecycleServices({
        capabilityGrant: createCapabilityGrant([
          "event_subscribe",
          capabilityId,
        ]),
        createRealm: async (input) => {
          capabilityHost = input.capabilityHost;
          return realm;
        },
        delegateCapabilityHost: delegate,
        program: createProgram(),
        resourceBudget: {
          ...createResourceBudget(),
          maximumOperationsPerTick,
          maximumSignalsPerTick,
        },
        seed: 7,
      });
      await lifecycle.install();
      for (let index = 0; index < 2; index += 1) {
        await lifecycle.capabilityHost.invoke({
          capabilityId: "event_subscribe",
          arguments: ["enemy_hit", "gameplay_event"],
        });
      }

      const results = await lifecycle.dispatchGameplayEvent("enemy_hit");

      expect(results).toHaveLength(2);
      expect(results[1]).toMatchObject({
        outcome: "resource_limit",
        resourceUsage: {
          dimension,
          limit:
            dimension === "operations_per_tick"
              ? maximumOperationsPerTick
              : maximumSignalsPerTick,
          observed: dimension === "operations_per_tick" ? 4 : 2,
        },
        callback: { id: "gameplay_event", kind: "gameplay_event" },
      });
      expect(lifecycle.state).toBe("failed");
      if (capabilityId === "signal_emit") {
        expect(delegate.invoke).toHaveBeenCalledOnce();
      }
    }
  );

  it("does not report a realm disposal failure as successful cleanup", async () => {
    const realm = new RecordingRealm({
      failCallbackId: "logical_action",
      disposeFailure: new Error("realm worker stayed alive"),
    });
    const lifecycle = await createLifecycle(realm, 7, createProgram());

    await lifecycle.install();
    await lifecycle.dispatchLogicalAction("jump");

    await expect(lifecycle.dispose()).rejects.toThrow(
      "realm worker stayed alive"
    );
    expect(lifecycle.state).toBe("failed");
    expect(realm.disposeCalls).toBe(2);
  });
});

async function createLifecycle(
  realm: RecordingRealm,
  seed: number,
  program: MechanicLifecycleProgram
) {
  const delegate = {
    invoke: vi.fn(async () => ({ kind: "json" as const, value: null })),
  };
  let createdHost: unknown;
  const lifecycle = await createMechanicLifecycleServices({
    capabilityGrant: createCapabilityGrant(),
    createRealm: async ({ capabilityHost }) => {
      createdHost = capabilityHost;
      return realm;
    },
    delegateCapabilityHost: delegate,
    program,
    resourceBudget: createResourceBudget(),
    seed,
  });
  expect(createdHost).toBe(lifecycle.capabilityHost);
  return lifecycle;
}

function createCapabilityGrant(
  capabilityIds = [
    "time_read",
    "random_next",
    "time_schedule",
    "event_subscribe",
  ]
) {
  return {
    capabilityVersion: mechanicCapabilityRegistry.version,
    capabilities: capabilityIds.map(
      (capabilityId, index) => ({
        ...mechanicCapabilityRegistry.capabilities.find(
          (capability) => capability.id === capabilityId
        )!,
        justification: {
          kind: "contract_declaration" as const,
          path: `capabilities.${index}`,
        },
      })
    ),
  };
}

function createResourceBudget() {
  return {
    profileId: "phase_9_fixed_budget" as const,
    maximumOwnedObjects: 4,
    maximumOperationsPerTick: 16,
    maximumScheduledCallbacks: 4,
    maximumSubscriptions: 4,
    maximumSignalsPerTick: 4,
    maximumStateBytes: 128,
    maximumCallbackMilliseconds: 8,
    maximumConsecutiveFailures: 2,
  };
}

function createProgram(
  overrides: Partial<MechanicLifecycleProgram> = {}
): MechanicLifecycleProgram {
  return {
    source: "return null;",
    callbacks: [
      { id: "install", kind: "install", source: "return null;" },
      {
        id: "logical_action",
        kind: "logical_action",
        source: "return lifecycleInput;",
      },
      {
        id: "gameplay_event",
        kind: "gameplay_event",
        source: "return lifecycleInput;",
      },
      { id: "scheduled", kind: "scheduled", source: "return null;" },
      { id: "fixed_step", kind: "fixed_step", source: "return null;" },
      { id: "dispose", kind: "dispose", source: "return null;" },
    ],
    ...overrides,
  };
}

class RecordingRealm implements MechanicExecutionRealm {
  readonly executions: MechanicExecutionRealmExecutionInput[] = [];
  disposed = false;
  terminateCalls = 0;
  disposeCalls = 0;
  readonly pendingStarted: Promise<void>;
  private resolvePendingStarted!: () => void;
  private resolvePendingResult: ((result: MechanicExecutionRealmExecutionResult) => void) | undefined;

  constructor(
    private readonly options: {
      failCallbackId?: string;
      pendingCallbackId?: string;
      disposeFailure?: Error;
    } = {}
  ) {
    this.pendingStarted = new Promise((resolve) => {
      this.resolvePendingStarted = resolve;
    });
  }

  execute(input: MechanicExecutionRealmExecutionInput): MechanicExecutionRealmRun {
    this.executions.push(structuredClone(input));
    const callbackId = input.lifecycle?.invocations[0]?.callbackId;
    if (callbackId === this.options.pendingCallbackId) {
      this.resolvePendingStarted();
      const result = new Promise<MechanicExecutionRealmExecutionResult>(
        (resolve) => {
          this.resolvePendingResult = resolve;
        }
      );
      return {
        result,
        terminate: async () => {
          this.terminateCalls += 1;
          const terminated = {
            executionId: input.id,
            outcome: "terminated" as const,
          };
          this.resolvePendingResult?.(terminated);
          return terminated;
        },
      };
    }
    const result: MechanicExecutionRealmExecutionResult =
      callbackId === this.options.failCallbackId
        ? {
            executionId: input.id,
            outcome: "failed",
            diagnostic: {
              stage: "realm_execution",
              code: "recording_failure",
              message: "recording realm failure",
            },
          }
        : { executionId: input.id, outcome: "completed" };

    return {
      result: Promise.resolve(result),
      terminate: async () => ({
        executionId: input.id,
        outcome: "terminated",
      }),
    };
  }

  dispose(): void {
    this.disposeCalls += 1;
    if (this.options.disposeFailure) {
      throw this.options.disposeFailure;
    }
    this.disposed = true;
  }

  executionIds(): string[] {
    return this.executions.map((execution) => execution.id);
  }

  callbackIds(): string[] {
    return this.executions.map(
      (execution) => execution.lifecycle?.invocations[0]?.callbackId ?? "missing"
    );
  }
}
