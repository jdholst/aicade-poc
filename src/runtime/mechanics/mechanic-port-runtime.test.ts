import { describe, expect, it } from "vitest";

import {
  MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
  createMechanicPortRuntime,
  createTrustedGameSystemPortOwner,
  type MechanicPortConnection,
  type MechanicPortDeclaration,
  validateFinalGameSpecMechanicConnections,
} from "./mechanic-port-runtime";

describe("validateFinalGameSpecMechanicConnections", () => {
  it("accepts only connections whose output payload is compatible with the input payload", () => {
    const contracts = [
      {
        ownerKind: "mechanic" as const,
        ownerId: "hazard_spawner",
        ports: [
          {
            id: "hazard_spawned",
            direction: "output" as const,
            payload: { kind: "integer" as const, minimum: 0, maximum: 8 },
          },
        ],
      },
      {
        ownerKind: "game_system" as const,
        ownerId: "score",
        ports: [
          {
            id: "increment",
            direction: "input" as const,
            payload: { kind: "integer" as const, minimum: 0, maximum: 100 },
          },
        ],
      },
    ];

    const compatible = validateFinalGameSpecMechanicConnections({
      contracts,
      connectionPlan: {
        schemaVersion: MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
        connections: [
          {
            id: "hazard_score",
            output: {
              ownerKind: "mechanic",
              ownerId: "hazard_spawner",
              portId: "hazard_spawned",
            },
            input: {
              ownerKind: "game_system",
              ownerId: "score",
              portId: "increment",
            },
          },
        ],
      },
    });
    const incompatible = validateFinalGameSpecMechanicConnections({
      contracts: [
        contracts[0],
        {
          ...contracts[1],
          ports: [
            {
              id: "increment",
              direction: "input" as const,
              payload: { kind: "boolean" as const },
            },
          ],
        },
      ],
      connectionPlan: {
        schemaVersion: MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
        connections: [
          {
            id: "hazard_score",
            output: {
              ownerKind: "mechanic",
              ownerId: "hazard_spawner",
              portId: "hazard_spawned",
            },
            input: {
              ownerKind: "game_system",
              ownerId: "score",
              portId: "increment",
            },
          },
        ],
      },
    });

    expect(compatible).toEqual({
      success: true,
      data: {
        schemaVersion: MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
        connections: [
          {
            id: "hazard_score",
            output: {
              ownerKind: "mechanic",
              ownerId: "hazard_spawner",
              portId: "hazard_spawned",
            },
            input: {
              ownerKind: "game_system",
              ownerId: "score",
              portId: "increment",
            },
          },
        ],
      },
    });
    expect(incompatible).toEqual({
      success: false,
      issues: [
        {
          path: "connections.0",
          code: "incompatible_payload",
          message:
            'Output port "hazard_spawner.hazard_spawned" is not schema-compatible with input port "score.increment".',
        },
      ],
    });
  });

  it("supports structural payload compatibility for nested restricted DSL values", () => {
    const result = validateFinalGameSpecMechanicConnections({
      contracts: [
        {
          ownerKind: "mechanic",
          ownerId: "spawner",
          ports: [
            {
              id: "spawned",
              direction: "output",
              payload: {
                kind: "object",
                fields: [
                  {
                    key: "count",
                    required: true,
                    value: { kind: "integer", minimum: 1, maximum: 4 },
                  },
                  {
                    key: "tags",
                    required: true,
                    value: {
                      kind: "collection",
                      minimumItems: 1,
                      maximumItems: 2,
                      item: { kind: "enum", values: ["hazard", "boss"] },
                    },
                  },
                ],
              },
            },
          ],
        },
        {
          ownerKind: "game_system",
          ownerId: "objectives",
          ports: [
            {
              id: "record_spawn",
              direction: "input",
              payload: {
                kind: "object",
                fields: [
                  {
                    key: "count",
                    required: true,
                    value: { kind: "number", minimum: 0, maximum: 10 },
                  },
                  {
                    key: "tags",
                    required: true,
                    value: {
                      kind: "collection",
                      minimumItems: 0,
                      maximumItems: 4,
                      item: {
                        kind: "enum",
                        values: ["hazard", "boss", "pickup"],
                      },
                    },
                  },
                  {
                    key: "note",
                    required: false,
                    value: {
                      kind: "string",
                      minimumLength: 0,
                      maximumLength: 80,
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
      connectionPlan: {
        schemaVersion: MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
        connections: [
          {
            id: "spawn_objective",
            output: {
              ownerKind: "mechanic",
              ownerId: "spawner",
              portId: "spawned",
            },
            input: {
              ownerKind: "game_system",
              ownerId: "objectives",
              portId: "record_spawn",
            },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects connection data from an unsupported Final Game Spec port version", () => {
    const result = validateFinalGameSpecMechanicConnections({
      contracts: [],
      connectionPlan: {
        schemaVersion: "mechanic_port_connections/v0" as never,
        connections: [],
      },
    });

    expect(result).toEqual({
      success: false,
      issues: [
        {
          path: "schemaVersion",
          code: "invalid_plan",
          message:
            'Mechanic connection schema version must be "mechanic_port_connections/v1".',
        },
      ],
    });
  });
});

describe("createMechanicPortRuntime", () => {
  it("delivers immutable signals after the current callback in stable recorded order", async () => {
    let callbackActive = false;
    const received: Array<{
      value: unknown;
      callbackActive: boolean;
      frozen: boolean;
    }> = [];
    const runtime = createMechanicPortRuntime({
      contracts: [
        {
          ownerKind: "mechanic",
          ownerId: "source",
          ports: [
            {
              id: "changed",
              direction: "output",
              payload: {
                kind: "object",
                fields: [
                  {
                    key: "value",
                    required: true,
                    value: { kind: "integer", minimum: 0, maximum: 10 },
                  },
                ],
              },
            },
          ],
        },
        {
          ownerKind: "mechanic",
          ownerId: "target",
          ports: [
            {
              id: "observe_change",
              direction: "input",
              payload: {
                kind: "object",
                fields: [
                  {
                    key: "value",
                    required: true,
                    value: { kind: "integer", minimum: 0, maximum: 10 },
                  },
                ],
              },
            },
          ],
        },
      ],
      connectionPlan: {
        schemaVersion: MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
        connections: [
          {
            id: "source_target",
            output: {
              ownerKind: "mechanic",
              ownerId: "source",
              portId: "changed",
            },
            input: {
              ownerKind: "mechanic",
              ownerId: "target",
              portId: "observe_change",
            },
          },
        ],
      },
      maximumSignalDeliveriesPerStep: 4,
      referenceCatalog: {},
      mechanicReceivers: [
        {
          mechanicId: "target",
          receive: ({ payload }) => {
            received.push({
              value: payload,
              callbackActive,
              frozen: Object.isFrozen(payload),
            });
          },
        },
      ],
      gameSystemOwners: [],
    });
    const capabilityHost = runtime.createMechanicCapabilityHost("source", {
      invoke: () => {
        throw new Error("Unexpected delegated capability.");
      },
    });

    const result = await runtime.runStep(async () => {
      callbackActive = true;
      await capabilityHost.invoke({
        capabilityId: "signal_emit",
        arguments: ["changed", { value: 1 }],
      });
      await capabilityHost.invoke({
        capabilityId: "signal_emit",
        arguments: ["changed", { value: 2 }],
      });
      const receivedDuringCallback = received.length;
      callbackActive = false;
      return receivedDuringCallback;
    });

    expect({ received, result }).toEqual({
      received: [
        { value: { value: 1 }, callbackActive: false, frozen: true },
        { value: { value: 2 }, callbackActive: false, frozen: true },
      ],
      result: {
        outcome: "completed",
        callbackResult: 0,
        deliveries: [
          {
            sequence: 1,
            connectionId: "source_target",
            output: {
              ownerKind: "mechanic",
              ownerId: "source",
              portId: "changed",
            },
            input: {
              ownerKind: "mechanic",
              ownerId: "target",
              portId: "observe_change",
            },
            payload: { value: 1 },
          },
          {
            sequence: 2,
            connectionId: "source_target",
            output: {
              ownerKind: "mechanic",
              ownerId: "source",
              portId: "changed",
            },
            input: {
              ownerKind: "mechanic",
              ownerId: "target",
              portId: "observe_change",
            },
            payload: { value: 2 },
          },
        ],
      },
    });
  });

  it("changes trusted state only through admitted Game System input ports", async () => {
    const scoreOwner = createTrustedGameSystemPortOwner({
      contract: {
        ownerKind: "game_system",
        ownerId: "score",
        ports: [
          {
            id: "increment",
            direction: "input",
            payload: { kind: "integer", minimum: 0, maximum: 10 },
          },
          {
            id: "changed",
            direction: "output",
            payload: { kind: "integer", minimum: 0, maximum: 100 },
          },
        ],
      },
      initialState: { value: 0 },
      transition: ({ portId, payload, state }) => {
        if (portId !== "increment" || typeof payload !== "number") {
          throw new Error("Unexpected score command.");
        }
        const value = state.value + payload;
        return {
          state: { value },
          outputs: [{ portId: "changed", payload: value }],
        };
      },
    });
    const observed: Array<{ payload: unknown; scoreAtDelivery: unknown }> = [];
    const runtime = createMechanicPortRuntime({
      contracts: [
        {
          ownerKind: "mechanic",
          ownerId: "collector",
          ports: [
            {
              id: "points_awarded",
              direction: "output",
              payload: { kind: "integer", minimum: 0, maximum: 10 },
            },
          ],
        },
        {
          ownerKind: "mechanic",
          ownerId: "hud",
          ports: [
            {
              id: "score_changed",
              direction: "input",
              payload: { kind: "integer", minimum: 0, maximum: 100 },
            },
          ],
        },
      ],
      connectionPlan: {
        schemaVersion: MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
        connections: [
          {
            id: "collector_score",
            output: {
              ownerKind: "mechanic",
              ownerId: "collector",
              portId: "points_awarded",
            },
            input: {
              ownerKind: "game_system",
              ownerId: "score",
              portId: "increment",
            },
          },
          {
            id: "score_hud",
            output: {
              ownerKind: "game_system",
              ownerId: "score",
              portId: "changed",
            },
            input: {
              ownerKind: "mechanic",
              ownerId: "hud",
              portId: "score_changed",
            },
          },
        ],
      },
      maximumSignalDeliveriesPerStep: 4,
      referenceCatalog: {},
      mechanicReceivers: [
        {
          mechanicId: "hud",
          receive: ({ payload }) => {
            observed.push({
              payload,
              scoreAtDelivery: scoreOwner.readState(),
            });
          },
        },
      ],
      gameSystemOwners: [scoreOwner],
    });
    const capabilityHost = runtime.createMechanicCapabilityHost("collector", {
      invoke: () => {
        throw new Error("Unexpected delegated capability.");
      },
    });

    const result = await runtime.runStep(() =>
      capabilityHost.invoke({
        capabilityId: "signal_emit",
        arguments: ["points_awarded", 3],
      })
    );

    expect({
      state: scoreOwner.readState(),
      observed,
      publicKeys: Object.keys(scoreOwner),
      deliveryOrder: result.deliveries.map(({ connectionId }) => connectionId),
    }).toEqual({
      state: { value: 3 },
      observed: [{ payload: 3, scoreAtDelivery: { value: 3 } }],
      publicKeys: ["systemId", "contract", "readState"],
      deliveryOrder: ["collector_score", "score_hud"],
    });
  });

  it("binds delivery to immutable snapshots of admitted contracts and connections", async () => {
    const sourcePort: MechanicPortDeclaration = {
      id: "sent",
      direction: "output",
      payload: { kind: "boolean" },
    };
    const connection: MechanicPortConnection = {
      id: "source_target",
      output: {
        ownerKind: "mechanic",
        ownerId: "source",
        portId: "sent",
      },
      input: {
        ownerKind: "mechanic",
        ownerId: "target",
        portId: "received",
      },
    };
    const received: unknown[] = [];
    const runtime = createMechanicPortRuntime({
      contracts: [
        {
          ownerKind: "mechanic",
          ownerId: "source",
          ports: [sourcePort],
        },
        {
          ownerKind: "mechanic",
          ownerId: "target",
          ports: [
            {
              id: "received",
              direction: "input",
              payload: { kind: "boolean" },
            },
          ],
        },
      ],
      connectionPlan: {
        schemaVersion: MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
        connections: [connection],
      },
      maximumSignalDeliveriesPerStep: 1,
      referenceCatalog: {},
      mechanicReceivers: [
        {
          mechanicId: "target",
          receive: ({ payload }) => {
            received.push(payload);
          },
        },
      ],
      gameSystemOwners: [],
    });
    const capabilityHost = runtime.createMechanicCapabilityHost("source", {
      invoke: () => {
        throw new Error("Unexpected delegated capability.");
      },
    });

    sourcePort.id = "tampered_output";
    connection.input.ownerId = "tampered_target";
    await runtime.runStep(() =>
      capabilityHost.invoke({
        capabilityId: "signal_emit",
        arguments: ["sent", true],
      })
    );

    expect(received).toEqual([true]);
  });

  it("bounds fan-out before additional deliveries enter the queue", async () => {
    const receivedBy: string[] = [];
    const runtime = createMechanicPortRuntime({
      contracts: [
        {
          ownerKind: "mechanic",
          ownerId: "source",
          ports: [
            {
              id: "sent",
              direction: "output",
              payload: { kind: "boolean" },
            },
          ],
        },
        ...["first", "second"].map((ownerId) => ({
          ownerKind: "mechanic" as const,
          ownerId,
          ports: [
            {
              id: "received",
              direction: "input" as const,
              payload: { kind: "boolean" as const },
            },
          ],
        })),
      ],
      connectionPlan: {
        schemaVersion: MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
        connections: ["first", "second"].map((ownerId) => ({
          id: `source_${ownerId}`,
          output: {
            ownerKind: "mechanic" as const,
            ownerId: "source",
            portId: "sent",
          },
          input: {
            ownerKind: "mechanic" as const,
            ownerId,
            portId: "received",
          },
        })),
      },
      maximumSignalDeliveriesPerStep: 1,
      referenceCatalog: {},
      mechanicReceivers: ["first", "second"].map((mechanicId) => ({
        mechanicId,
        receive: () => {
          receivedBy.push(mechanicId);
        },
      })),
      gameSystemOwners: [],
    });
    const capabilityHost = runtime.createMechanicCapabilityHost("source", {
      invoke: () => {
        throw new Error("Unexpected delegated capability.");
      },
    });

    const result = await runtime.runStep(() =>
      capabilityHost.invoke({
        capabilityId: "signal_emit",
        arguments: ["sent", true],
      })
    );

    expect({ receivedBy, result }).toMatchObject({
      receivedBy: ["first"],
      result: {
        outcome: "failed",
        deliveries: [{ sequence: 1, connectionId: "source_first" }],
        failure: {
          code: "signal_queue_limit_exceeded",
          maximumSignalDeliveriesPerStep: 1,
          nextConnectionId: "source_second",
        },
      },
    });
  });

  it("terminates cyclic delivery as a structured bounded failure", async () => {
    type CapabilityHost = ReturnType<
      ReturnType<typeof createMechanicPortRuntime>["createMechanicCapabilityHost"]
    >;
    const hosts: {
      first: CapabilityHost | undefined;
      second: CapabilityHost | undefined;
    } = { first: undefined, second: undefined };
    const runtime = createMechanicPortRuntime({
      contracts: [
        {
          ownerKind: "mechanic",
          ownerId: "first",
          ports: [
            {
              id: "ping",
              direction: "output",
              payload: { kind: "boolean" },
            },
            {
              id: "pong",
              direction: "input",
              payload: { kind: "boolean" },
            },
          ],
        },
        {
          ownerKind: "mechanic",
          ownerId: "second",
          ports: [
            {
              id: "ping",
              direction: "input",
              payload: { kind: "boolean" },
            },
            {
              id: "pong",
              direction: "output",
              payload: { kind: "boolean" },
            },
          ],
        },
      ],
      connectionPlan: {
        schemaVersion: MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
        connections: [
          {
            id: "first_to_second",
            output: {
              ownerKind: "mechanic",
              ownerId: "first",
              portId: "ping",
            },
            input: {
              ownerKind: "mechanic",
              ownerId: "second",
              portId: "ping",
            },
          },
          {
            id: "second_to_first",
            output: {
              ownerKind: "mechanic",
              ownerId: "second",
              portId: "pong",
            },
            input: {
              ownerKind: "mechanic",
              ownerId: "first",
              portId: "pong",
            },
          },
        ],
      },
      maximumSignalDeliveriesPerStep: 3,
      referenceCatalog: {},
      mechanicReceivers: [
        {
          mechanicId: "first",
          receive: () => {
            if (!hosts.first) {
              throw new Error("First mechanic host is unavailable.");
            }
            return hosts.first.invoke({
              capabilityId: "signal_emit",
              arguments: ["ping", true],
            });
          },
        },
        {
          mechanicId: "second",
          receive: () => {
            if (!hosts.second) {
              throw new Error("Second mechanic host is unavailable.");
            }
            return hosts.second.invoke({
              capabilityId: "signal_emit",
              arguments: ["pong", true],
            });
          },
        },
      ],
      gameSystemOwners: [],
    });
    const delegate = {
      invoke: () => {
        throw new Error("Unexpected delegated capability.");
      },
    };
    const firstHost = runtime.createMechanicCapabilityHost("first", delegate);
    hosts.first = firstHost;
    hosts.second = runtime.createMechanicCapabilityHost("second", delegate);

    const result = await runtime.runStep(() =>
      firstHost.invoke({
        capabilityId: "signal_emit",
        arguments: ["ping", true],
      })
    );

    expect(result).toMatchObject({
      outcome: "failed",
      deliveries: [
        { sequence: 1, connectionId: "first_to_second" },
        { sequence: 2, connectionId: "second_to_first" },
        { sequence: 3, connectionId: "first_to_second" },
      ],
      failure: {
        stage: "signal_delivery",
        code: "signal_queue_limit_exceeded",
        maximumSignalDeliveriesPerStep: 3,
        nextConnectionId: "second_to_first",
      },
    });
  });
});
