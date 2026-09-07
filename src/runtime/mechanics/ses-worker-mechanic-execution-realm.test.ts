import { describe, expect, it, vi } from "vitest";

import { STABLE_ID_PATTERN } from "@/game-spec/game-spec-schema";
import { mechanicCapabilityRegistry } from "@/game-spec/mechanics/mechanic-capability-registry";
import { MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY } from "@/game-spec/mechanics/mechanic-execution-realm-conformance";
import type { MechanicObjectHandle } from "@/runtime/mechanics/mechanic-object-host";
import { MechanicExecutionRealmResourceLimitError } from "./mechanic-execution-realm";

import {
  createSesWorkerMechanicExecutionRealmAdapter,
  isSesWorkerMechanicExecutionRealmAdapter,
  type SesWorkerMechanicExecutionRealmController,
} from "./ses-worker-mechanic-execution-realm";

describe("SES Worker Mechanic Execution Realm adapter", () => {
  it("authenticates only adapters minted by the official factory", () => {
    const adapter = createSesWorkerMechanicExecutionRealmAdapter();

    expect(isSesWorkerMechanicExecutionRealmAdapter(adapter)).toBe(true);
    expect(
      isSesWorkerMechanicExecutionRealmAdapter({ ...adapter })
    ).toBe(false);
  });

  it("fixes the exact grant, maps opaque bindings through a private capability channel, and disposes the worker", async () => {
    const actorHandle = Object.freeze(Object.create(null)) as MechanicObjectHandle;
    const grant = {
      capabilityVersion: mechanicCapabilityRegistry.version,
      capabilities: [
        {
          ...requireCapability("object_read"),
          justification: {
            kind: "contract_declaration" as const,
            path: "mechanic.capabilities.0",
          },
        },
      ],
    };
    const controller = new FakeSesController();
    const invoke = vi.fn(async (input) => {
      expect(input.capabilityId).toBe("object_read");
      expect(input.arguments).toEqual([actorHandle]);
      return {
        kind: "json" as const,
        value: { active: true, kind: "actor" },
      };
    });
    const adapter = createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => controller,
    });

    const realm = await adapter.create({
      mechanicId: "mechanic_alpha",
      capabilityGrant: grant,
      bindings: [
        {
          id: "binding_actor",
          cardinality: "one",
          handles: [actorHandle],
        },
      ],
      capabilityHost: { invoke },
      seed: 1729,
      resourceBudget:
        MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
    });
    const run = realm.execute({
      id: "read_actor",
      source:
        'return await realm.callCapability("object_read", realm.binding("binding_actor"));',
    });

    await expect(run.result).resolves.toMatchObject({
      executionId: "read_actor",
      outcome: "completed",
      output: { active: true, kind: "actor" },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(controller.initialization?.capabilityGrant).toEqual(grant);
    expect(controller.initialization?.bindings).toEqual([
      {
        id: "binding_actor",
        cardinality: "one",
        tokens: [expect.any(String)],
      },
    ]);
    expect(
      containsReference(controller.initialization?.bindings, actorHandle)
    ).toBe(false);
    const bindingToken = (
      controller.initialization?.bindings as Array<{ tokens: string[] }>
    )[0].tokens[0];
    expect(bindingToken).toMatch(STABLE_ID_PATTERN);
    await expect(
      controller.requestCapability({
        executionId: "read_actor",
        capabilityId: "object_read",
        arguments: [{ kind: "opaque_handle", token: bindingToken }],
      })
    ).resolves.toMatchObject({ success: false });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(() =>
      realm.execute({ id: "read_actor", source: "return 1;" })
    ).toThrow("Execution IDs are atomically single-use within a realm.");

    realm.dispose();

    await vi.waitFor(() => expect(controller.terminated).toBe(true));
    expect(() => realm.execute({ id: "late", source: "return 1;" })).toThrow(
      "Mechanic Execution Realm has been disposed."
    );
  });

  it("terminates a runaway execution and accepts a fresh recovery run", async () => {
    const controller = new FakeSesController();
    const adapter = createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => controller,
    });
    const realm = await adapter.create({
      mechanicId: "mechanic_recovery",
      capabilityGrant: {
        capabilityVersion: mechanicCapabilityRegistry.version,
        capabilities: [],
      },
      bindings: [],
      capabilityHost: {
        invoke: vi.fn(() => {
          throw new Error("No capability is granted.");
        }),
      },
      seed: 41,
      resourceBudget:
        MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
    });
    const runaway = realm.execute({
      id: "runaway",
      source: "for (;;) {}",
    });

    await expect(runaway.terminate()).resolves.toMatchObject({
      executionId: "runaway",
      outcome: "terminated",
    });
    await expect(
      realm.execute({
        id: "recovery",
        source: 'return { state: "recovered" };',
      }).result
    ).resolves.toMatchObject({
      executionId: "recovery",
      outcome: "completed",
      output: { state: "recovered" },
    });

    realm.dispose();
  });

  it("snapshots an execution before dispatch and termination", async () => {
    const controller = new FakeSesController();
    const adapter = createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => controller,
    });
    const realm = await adapter.create(
      createEmptyRealmInput("mechanic_execution_snapshot")
    );
    const execution = {
      id: "original_execution",
      source: "for (;;) {}",
      lifecycle: {
        callbacks: [{ id: "original_callback", source: "return 1;" }],
        invocations: [{ callbackId: "original_callback", count: 1 }],
      },
    };
    const run = realm.execute(execution);

    execution.id = "mutated_execution";
    execution.source = "return 1;";
    execution.lifecycle.callbacks[0].id = "mutated_callback";
    execution.lifecycle.callbacks[0].source = "for (;;) {}";
    execution.lifecycle.invocations[0].callbackId = "mutated_callback";
    execution.lifecycle.invocations[0].count = 99;

    await expect(run.terminate()).resolves.toMatchObject({
      executionId: "original_execution",
      outcome: "terminated",
    });
    expect(controller.executionRequests).toEqual([
      expect.objectContaining({
        action: "execute",
        executionId: "original_execution",
        execution: {
          id: "original_execution",
          source: "for (;;) {}",
          lifecycle: {
            callbacks: [
              { id: "original_callback", source: "return 1;" },
            ],
            invocations: [
              { callbackId: "original_callback", count: 1 },
            ],
          },
        },
      }),
      expect.objectContaining({
        action: "terminate",
        executionId: "original_execution",
      }),
    ]);

    realm.dispose();
  });

  it("keeps JSON values structurally distinct from opaque-handle tokens", async () => {
    const actorHandle = Object.freeze(Object.create(null)) as MechanicObjectHandle;
    const controller = new FakeSesController();
    const invoke = vi.fn(async (input) => {
      expect(input.capabilityId).toBe("state_write");
      expect(input.arguments).toEqual([
        { kind: "opaque_handle", token: expect.any(String) },
      ]);
      expect(input.arguments[0]).not.toBe(actorHandle);
      return { kind: "json" as const, value: { written: true } };
    });
    const adapter = createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => controller,
    });
    const realm = await adapter.create({
      mechanicId: "mechanic_tagged_json",
      capabilityGrant: {
        capabilityVersion: mechanicCapabilityRegistry.version,
        capabilities: [
          {
            ...requireCapability("state_write"),
            justification: {
              kind: "contract_declaration" as const,
              path: "mechanic.capabilities.0",
            },
          },
        ],
      },
      bindings: [
        {
          id: "binding_actor",
          cardinality: "one",
          handles: [actorHandle],
        },
      ],
      capabilityHost: { invoke },
      seed: 7,
      resourceBudget:
        MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
    });

    await expect(
      realm.execute({ id: "tagged_json", source: "return tagged json;" })
        .result
    ).resolves.toMatchObject({
      executionId: "tagged_json",
      outcome: "completed",
      output: { written: true },
    });
    expect(invoke).toHaveBeenCalledTimes(1);

    realm.dispose();
  });

  it("tears down abandoned setup, send failures, and disposal failures", async () => {
    const setupController = new FakeSesController();
    setupController.throwOnReady = true;
    const setupAdapter = createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => setupController,
    });

    await expect(
      setupAdapter.create(createEmptyRealmInput("mechanic_setup_failure"))
    ).rejects.toThrow("ready send failed");
    expect(setupController.terminated).toBe(true);
    expect(setupController.listeners.size).toBe(0);

    const channelController = new FakeSesController();
    const channelAdapter = createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => channelController,
      createMessageChannel: () => {
        throw new Error("channel creation failed");
      },
    });
    await expect(
      channelAdapter.create(createEmptyRealmInput("mechanic_channel_failure"))
    ).rejects.toThrow("channel creation failed");
    expect(channelController.terminated).toBe(true);

    const executionController = new FakeSesController();
    const executionAdapter = createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => executionController,
    });
    const executionRealm = await executionAdapter.create(
      createEmptyRealmInput("mechanic_execution_failure")
    );
    executionController.throwOnExecute = true;

    await expect(
      executionRealm.execute({ id: "send_failure", source: "return 1;" })
        .result
    ).rejects.toThrow("execute send failed");
    await vi.waitFor(() =>
      expect(executionController.terminated).toBe(true)
    );
    expect(() =>
      executionRealm.execute({ id: "after_failure", source: "return 1;" })
    ).toThrow("Mechanic Execution Realm has been disposed.");

    const disposalController = new FakeSesController();
    const disposalAdapter = createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => disposalController,
    });
    const disposalRealm = await disposalAdapter.create(
      createEmptyRealmInput("mechanic_disposal_failure")
    );
    disposalController.throwOnDispose = true;

    expect(() => disposalRealm.dispose()).not.toThrow();
    expect(disposalController.terminated).toBe(true);
  });

  it("snapshots initialization before the controller handshake", async () => {
    const controller = new FakeSesController();
    controller.deferReady = true;
    const adapter = createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => controller,
    });
    const input = createEmptyRealmInput("mechanic_snapshot");
    const creation = adapter.create(input);

    input.capabilityGrant.capabilities.push({
      ...requireCapability("object_read"),
      justification: {
        kind: "contract_declaration",
        path: "mechanic.capabilities.0",
      },
    });
    input.resourceBudget.maximumOperationsPerTick = 99_999;
    controller.releaseReady();

    const realm = await creation;
    expect(controller.initialization?.capabilityGrant).toMatchObject({
      capabilities: [],
    });
    expect(
      (
        controller.initialization?.resourceBudget as {
          maximumOperationsPerTick: number;
        }
      ).maximumOperationsPerTick
    ).toBe(
      MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget
        .maximumOperationsPerTick
    );
    realm.dispose();
  });

  it("atomically consumes capability call IDs and rejects malformed host results", async () => {
    const actorHandle = Object.freeze(Object.create(null)) as MechanicObjectHandle;
    const controller = new FakeSesController();
    const invoke = vi.fn(() => ({
      kind: "unknown_result",
      value: actorHandle,
    }));
    const adapter = createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => controller,
    });
    const realm = await adapter.create({
      ...createEmptyRealmInput("mechanic_replay"),
      capabilityGrant: {
        capabilityVersion: mechanicCapabilityRegistry.version,
        capabilities: [
          {
            ...requireCapability("object_read"),
            justification: {
              kind: "contract_declaration",
              path: "mechanic.capabilities.0",
            },
          },
        ],
      },
      bindings: [
        {
          id: "binding_actor",
          cardinality: "one",
          handles: [actorHandle],
        },
      ],
      capabilityHost: { invoke },
    });
    const active = realm.execute({ id: "replay_execution", source: "for (;;) {}" });
    const token = (
      controller.initialization?.bindings as Array<{ tokens: string[] }>
    )[0].tokens[0];

    const first = controller.requestCapability({
      callId: "replayed_call",
      executionId: "replay_execution",
      capabilityId: "object_read",
      arguments: [{ kind: "opaque_handle", token }],
    });
    const replay = controller.requestCapability({
      callId: "replayed_call",
      executionId: "replay_execution",
      capabilityId: "object_read",
      arguments: [{ kind: "opaque_handle", token }],
    });
    await Promise.all([first, replay]);
    expect(invoke).toHaveBeenCalledTimes(1);
    await active.terminate();

    const malformed = realm.execute({
      id: "malformed_result",
      source: "return malformed result;",
    });
    await expect(malformed.result).resolves.toMatchObject({ outcome: "failed" });
    realm.dispose();
  });

  it("preserves host-owned cumulative resource measurements across the capability channel", async () => {
    const actorHandle = Object.freeze(Object.create(null)) as MechanicObjectHandle;
    const controller = new FakeSesController();
    const adapter = createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => controller,
    });
    const realm = await adapter.create({
      ...createEmptyRealmInput("mechanic_state_budget"),
      capabilityGrant: {
        capabilityVersion: mechanicCapabilityRegistry.version,
        capabilities: [
          {
            ...requireCapability("state_write"),
            justification: {
              kind: "contract_declaration",
              path: "mechanic.capabilities.0",
            },
          },
        ],
      },
      bindings: [
        {
          id: "binding_actor",
          cardinality: "one",
          handles: [actorHandle],
        },
      ],
      capabilityHost: {
        invoke: vi.fn(() => {
          throw new MechanicExecutionRealmResourceLimitError(
            "state_bytes",
            6,
            7
          );
        }),
      },
    });

    await expect(
      realm.execute({ id: "state_over_limit", source: "return tagged json;" })
        .result
    ).resolves.toMatchObject({ outcome: "failed" });
    expect(controller.capabilityResponses).toContainEqual(
      expect.objectContaining({
        success: false,
        error: {
          code: "resource_budget_exceeded",
          message: "Resource state_bytes exceeded 6 with 7.",
          resourceUsage: {
            dimension: "state_bytes",
            limit: 6,
            observed: 7,
          },
        },
      })
    );
    realm.dispose();
  });

  it("rejects a termination response whose outcome claims completion", async () => {
    vi.useFakeTimers();
    try {
      const controller = new FakeSesController();
      controller.terminateOutcome = "completed";
      const adapter = createSesWorkerMechanicExecutionRealmAdapter({
        createController: () => controller,
      });
      const realm = await adapter.create(
        createEmptyRealmInput("mechanic_termination_response")
      );
      const run = realm.execute({
        id: "invalid_termination_response",
        source: "for (;;) {}",
      });
      const result = run.terminate();
      const rejection = expect(result).rejects.toThrow(
        "SES Worker realm termination exceeded its deadline."
      );

      await vi.advanceTimersByTimeAsync(
        MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY
          .maximumTerminationMilliseconds
      );
      await rejection;
      expect(controller.terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects malformed runtime resource measurements at the controller boundary", async () => {
    vi.useFakeTimers();
    try {
      const controller = new FakeSesController();
      controller.executionResultOverride = {
        outcome: "resource_limit",
        resourceUsage: {
          dimension: "unbounded_memory",
          limit: 4,
          observed: 5,
        },
      };
      const adapter = createSesWorkerMechanicExecutionRealmAdapter({
        createController: () => controller,
      });
      const realm = await adapter.create(
        createEmptyRealmInput("mechanic_invalid_resource_evidence")
      );
      const run = realm.execute({
        id: "invalid_resource_evidence",
        source: "return null;",
      });

      await vi.advanceTimersByTimeAsync(
        MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumExecutionMilliseconds *
          (MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget
            .maximumOperationsPerTick +
            1)
      );

      await expect(run.result).resolves.toEqual({
        executionId: "invalid_resource_evidence",
        outcome: "terminated",
      });
      realm.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not apply the 50 ms conformance probe deadline to runtime execution round trips", async () => {
    vi.useFakeTimers();
    try {
      const controller = new FakeSesController();
      controller.executionResultOverride = { outcome: "completed" };
      controller.executionResponseDelayMilliseconds =
        MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumExecutionMilliseconds +
        1;
      const adapter = createSesWorkerMechanicExecutionRealmAdapter({
        createController: () => controller,
      });
      const realm = await adapter.create(
        createEmptyRealmInput("mechanic_runtime_transport_delay")
      );
      const run = realm.execute({
        id: "runtime_transport_delay",
        source: "return null;",
      });

      await vi.advanceTimersByTimeAsync(
        MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.maximumExecutionMilliseconds
      );

      expect(controller.executionRequests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(run.result).resolves.toMatchObject({
        executionId: "runtime_transport_delay",
        outcome: "completed",
      });
      realm.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not encode a host result that settles after termination", async () => {
    const createdHandle = Object.freeze(
      Object.create(null)
    ) as MechanicObjectHandle;
    let resolveHost:
      | ((result: {
          kind: "opaque_handle";
          value: MechanicObjectHandle;
        }) => void)
      | undefined;
    const controller = new FakeSesController();
    const adapter = createSesWorkerMechanicExecutionRealmAdapter({
      createController: () => controller,
    });
    const realm = await adapter.create({
      ...createEmptyRealmInput("mechanic_late_host_result"),
      capabilityGrant: {
        capabilityVersion: mechanicCapabilityRegistry.version,
        capabilities: [
          {
            ...requireCapability("object_create"),
            justification: {
              kind: "contract_declaration",
              path: "mechanic.capabilities.0",
            },
          },
        ],
      },
      capabilityHost: {
        invoke: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveHost = resolve;
            })
        ),
      },
    });
    const run = realm.execute({
      id: "late_host_result",
      source: "return delayed handle;",
    });
    await vi.waitFor(() => expect(resolveHost).toBeTypeOf("function"));

    await expect(run.terminate()).resolves.toMatchObject({
      outcome: "terminated",
    });
    resolveHost?.({ kind: "opaque_handle", value: createdHandle });
    await vi.waitFor(() =>
      expect(controller.capabilityResponses).toContainEqual(
        expect.objectContaining({ callId: "call_1", success: false })
      )
    );
    expect(
      controller.capabilityResponses.find(
        (response) => response.callId === "call_1"
      )
    ).not.toHaveProperty("value");

    realm.dispose();
  });
});

class FakeSesController implements SesWorkerMechanicExecutionRealmController {
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  readonly capabilityResponses: Record<string, unknown>[] = [];
  readonly executionRequests: Record<string, unknown>[] = [];
  initialization?: Record<string, unknown>;
  terminated = false;
  throwOnDispose = false;
  throwOnExecute = false;
  throwOnReady = false;
  deferReady = false;
  terminateOutcome: "completed" | "terminated" = "terminated";
  executionResultOverride?: Record<string, unknown>;
  executionResponseDelayMilliseconds = 0;
  private readyProbeReceived = false;
  private capabilityPort?: MessagePort;

  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void {
    if (type === "message") {
      this.listeners.add(listener);
    }
  }

  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void {
    if (type === "message") {
      this.listeners.delete(listener);
    }
  }

  postMessage(message: unknown): void {
    if (!isRecord(message)) {
      return;
    }
    if (message.kind === "sparkline_mechanic_realm_controller_ready_probe") {
      if (this.throwOnReady) {
        throw new Error("ready send failed");
      }
      if (this.deferReady) {
        this.readyProbeReceived = true;
        return;
      }
      this.emit({ kind: "sparkline_mechanic_realm_controller_ready" });
      return;
    }
    if (message.kind === "sparkline_mechanic_realm_initialize") {
      this.initialization = message;
      this.capabilityPort = message.capabilityPort as MessagePort;
      this.capabilityPort.start();
      this.emit({
        kind: "sparkline_mechanic_realm_initialized",
        protocolVersion: message.protocolVersion,
        realmId: message.realmId,
      });
      return;
    }
    if (message.kind === "sparkline_mechanic_realm_execute") {
      this.executionRequests.push(structuredClone(message));
      if (message.action === "execute" && this.throwOnExecute) {
        throw new Error("execute send failed");
      }
      const realmId = String(message.realmId);
      const executionId = String(message.executionId);
      if (message.action === "terminate") {
        this.emitExecutionResponse(realmId, executionId, "terminate", {
          executionId,
          outcome: this.terminateOutcome,
        });
        return;
      }
      if (this.executionResultOverride) {
        const respond = () =>
          this.emitExecutionResponse(realmId, executionId, "execute", {
            executionId,
            ...this.executionResultOverride,
          });
        if (this.executionResponseDelayMilliseconds > 0) {
          setTimeout(respond, this.executionResponseDelayMilliseconds);
        } else {
          respond();
        }
        return;
      }
      const execution = message.execution;
      if (
        isRecord(execution) &&
        execution.source === "for (;;) {}"
      ) {
        return;
      }
      if (
        isRecord(execution) &&
        execution.source === 'return { state: "recovered" };'
      ) {
        this.emitExecutionResponse(realmId, executionId, "execute", {
          executionId,
          outcome: "completed",
          output: { state: "recovered" },
        });
        return;
      }
      const delayedHandle =
        isRecord(execution) && execution.source === "return delayed handle;";
      const token = delayedHandle
        ? undefined
        : String(
            (this.initialization?.bindings as Array<{ tokens: string[] }>)[0]
              .tokens[0]
          );
      const onCapabilityResponse = (event: MessageEvent<unknown>) => {
        if (!isRecord(event.data) || event.data.callId !== "call_1") {
          return;
        }
        this.capabilityResponses.push(event.data);
        this.capabilityPort?.removeEventListener(
          "message",
          onCapabilityResponse
        );
        if (event.data.success !== true) {
          this.emitExecutionResponse(realmId, executionId, "execute", {
            executionId,
            outcome: "failed",
          });
          return;
        }
        this.emitExecutionResponse(realmId, executionId, "execute", {
          executionId,
          outcome: "completed",
          output:
            isRecord(event.data.value) && event.data.value.kind === "json"
              ? event.data.value.value
              : event.data.value,
        });
      };
      this.capabilityPort?.addEventListener("message", onCapabilityResponse);
      this.capabilityPort?.postMessage({
        kind: "sparkline_mechanic_realm_capability_request",
        protocolVersion: this.initialization?.protocolVersion,
        realmId,
        executionId,
        callId: "call_1",
        capabilityId:
          delayedHandle
            ? "object_create"
            : isRecord(execution) && execution.source === "return tagged json;"
              ? "state_write"
              : "object_read",
        arguments:
          delayedHandle
            ? []
            : isRecord(execution) && execution.source === "return tagged json;"
            ? [
                {
                  kind: "json",
                  value: { kind: "opaque_handle", token },
                },
              ]
            : [{ kind: "opaque_handle", token: String(token) }],
      });
      return;
    }
    if (message.kind === "sparkline_mechanic_realm_dispose") {
      if (this.throwOnDispose) {
        throw new Error("dispose send failed");
      }
      this.emit({
        kind: "sparkline_mechanic_realm_disposed",
        protocolVersion: message.protocolVersion,
        realmId: message.realmId,
      });
    }
  }

  terminate(): void {
    this.terminated = true;
    this.capabilityPort?.close();
  }

  requestCapability(input: {
    callId?: string;
    executionId: string;
    capabilityId: string;
    arguments: unknown[];
  }): Promise<Record<string, unknown>> {
    const port = this.capabilityPort;
    if (!port || !this.initialization) {
      throw new Error("Fake SES controller is not initialized.");
    }
    const callId = input.callId ?? `late_call_${crypto.randomUUID()}`;
    return new Promise((resolve) => {
      const onMessage = (event: MessageEvent<unknown>) => {
        if (!isRecord(event.data) || event.data.callId !== callId) {
          return;
        }
        port.removeEventListener("message", onMessage);
        resolve(event.data);
      };
      port.addEventListener("message", onMessage);
      port.postMessage({
        kind: "sparkline_mechanic_realm_capability_request",
        protocolVersion: this.initialization?.protocolVersion,
        realmId: this.initialization.realmId,
        executionId: input.executionId,
        callId,
        capabilityId: input.capabilityId,
        arguments: input.arguments,
      });
    });
  }

  releaseReady(): void {
    if (!this.readyProbeReceived) {
      throw new Error("Fake SES controller did not receive a ready probe.");
    }
    this.deferReady = false;
    this.emit({ kind: "sparkline_mechanic_realm_controller_ready" });
  }

  private emitExecutionResponse(
    realmId: string,
    executionId: string,
    action: "execute" | "terminate",
    result: Record<string, unknown>
  ): void {
    this.emit({
      kind: "sparkline_mechanic_realm_execution_response",
      protocolVersion: this.initialization?.protocolVersion,
      realmId,
      executionId,
      action,
      result,
    });
  }

  private emit(data: unknown): void {
    const event = {
      currentTarget: this,
      data,
      isTrusted: true,
    } as unknown as MessageEvent<unknown>;
    queueMicrotask(() => {
      for (const listener of this.listeners) {
        listener(event);
      }
    });
  }
}

function requireCapability(capabilityId: string) {
  const capability = mechanicCapabilityRegistry.capabilities.find(
    (candidate) => candidate.id === capabilityId
  );
  if (!capability) {
    throw new Error(`Missing capability "${capabilityId}".`);
  }
  return capability;
}

function createEmptyRealmInput(mechanicId: string) {
  return {
    mechanicId,
    capabilityGrant: {
      capabilityVersion: mechanicCapabilityRegistry.version,
      capabilities: [],
    },
    bindings: [],
    capabilityHost: {
      invoke: vi.fn(() => {
        throw new Error("No capability is granted.");
      }),
    },
    seed: 1,
    resourceBudget: {
      ...MECHANIC_EXECUTION_REALM_CONFORMANCE_POLICY.resourceBudget,
    },
  };
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function containsReference(value: unknown, reference: object): boolean {
  if (value === reference) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsReference(entry, reference));
  }
  if (isRecord(value)) {
    return Object.values(value).some((entry) =>
      containsReference(entry, reference)
    );
  }
  return false;
}
